/**
 * Dictator Actions
 *
 * All actions available to the dictator player: tactics, militia movement, and MERC actions.
 */

import { Action, type ActionDefinition } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer } from '../game.js';
import { MercCard, DictatorCard, Sector, Equipment, TacticsCard } from '../elements.js';
import { SectorConstants } from '../constants.js';
import { executeCombat } from '../combat.js';
import { executeTacticsEffect } from '../tactics-effects.js';
import {
  autoEquipDictatorUnits,
  hasMortar,
  getMortarTargets,
  selectMortarTarget,
  selectMilitiaPlacementSector,
  distanceToNearestRebel,
  mercNeedsHealing,
  getAIHealingPriority,
} from '../ai-helpers.js';
import {
  getNextAIAction,
  getAIMoveDestination,
  getAIEquipmentSelection,
} from '../ai-executor.js';
import { ACTION_COSTS, capitalize } from './helpers.js';
import { isHealingItem, getHealAmount } from '../equipment-effects.js';

// =============================================================================
// Dictator Unit Type and Helpers
// =============================================================================

// MERC-07j: Type for units that can perform dictator actions (hired MERCs or dictator card)
type DictatorUnit = MercCard | DictatorCard;

function getDictatorUnitName(unit: DictatorUnit): string {
  if (unit instanceof DictatorCard) {
    return unit.dictatorName;
  }
  return unit.mercName;
}

function canDictatorUnitMove(unit: DictatorUnit): boolean {
  return unit.actionsRemaining >= ACTION_COSTS.MOVE && !!unit.sectorId;
}

function canDictatorUnitExplore(unit: DictatorUnit, game: MERCGame): boolean {
  if (unit.actionsRemaining < ACTION_COSTS.EXPLORE || !unit.sectorId) return false;
  const sector = game.getSector(unit.sectorId);
  return sector !== undefined && !sector.explored;
}

function canDictatorUnitTrain(unit: DictatorUnit, game: MERCGame): boolean {
  if (unit.training <= 0 || unit.actionsRemaining < ACTION_COSTS.TRAIN || !unit.sectorId) return false;
  const sector = game.getSector(unit.sectorId);
  return sector !== undefined && sector.dictatorMilitia < SectorConstants.MAX_MILITIA_PER_SIDE;
}

function canDictatorUnitReEquip(unit: DictatorUnit, game: MERCGame): boolean {
  if (unit.actionsRemaining < ACTION_COSTS.RE_EQUIP || !unit.sectorId) return false;
  const sector = game.getSector(unit.sectorId);
  return sector !== undefined && sector.stash.length > 0;
}

function canDictatorUnitFireMortar(unit: DictatorUnit, game: MERCGame): boolean {
  if (unit.actionsRemaining < 1 || !unit.sectorId) return false;
  if (!hasMortar(unit)) return false;

  const sector = game.getSector(unit.sectorId);
  if (!sector) return false;

  const targets = getMortarTargets(game, sector);
  return targets.length > 0;
}

// MERC-1ph: Helper to check if there's a beneficial militia move for AI
function hasBeneficialMilitiaMove(game: MERCGame): boolean {
  const sectorsWithMilitia = game.gameMap.getAllSectors()
    .filter(s => s.dictatorMilitia > 0);

  for (const from of sectorsWithMilitia) {
    const fromDist = distanceToNearestRebel(game, from);
    const adjacent = game.getAdjacentSectors(from);

    for (const to of adjacent) {
      // Check if moving would get closer to rebels
      const toDist = distanceToNearestRebel(game, to);
      if (toDist < fromDist && to.dictatorMilitia < 10) {
        return true; // Found a beneficial move
      }
    }
  }
  return false;
}

// MERC-7fy: Helper to check if a MERC has a healing item equipped
// Uses equipment registry instead of string matching
function hasHealingItemEquipped(merc: MercCard): boolean {
  const accessory = merc.accessorySlot;
  return accessory ? isHealingItem(accessory.equipmentId) : false;
}

// MERC-7fy: Helper to get healing amount from item
// Uses equipment registry instead of string matching
function getHealingAmountForItem(equipmentId: string): number {
  return getHealAmount(equipmentId);
}

// =============================================================================
// Tactics Actions
// =============================================================================

/**
 * Play a tactics card
 * MERC-5j2: AI plays from top of deck (no hand), auto-selects
 */
export function createPlayTacticsAction(game: MERCGame): ActionDefinition {
  return Action.create('playTactics')
    .prompt('Play a tactics card')
    .condition((ctx) => {
      // Only the dictator player can play tactics cards
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      // MERC-5j2: AI plays from deck, human plays from hand
      if (game.dictatorPlayer?.isAI) {
        return (game.dictatorPlayer?.tacticsDeck?.count(TacticsCard) ?? 0) > 0;
      }
      return (game.dictatorPlayer?.tacticsHand?.count(TacticsCard) ?? 0) > 0;
    })
    .chooseElement<TacticsCard>('card', {
      prompt: 'Select a tactics card to play',
      elementClass: TacticsCard,
      filter: (element) => {
        const card = element as unknown as TacticsCard;
        // MERC-5j2: AI auto-selects top card from deck
        if (game.dictatorPlayer?.isAI) {
          const topCard = game.dictatorPlayer?.tacticsDeck?.first(TacticsCard);
          return topCard ? card.id === topCard.id : false;
        }
        // Use ID comparison instead of object reference (instances may differ)
        const handCards = game.dictatorPlayer?.tacticsHand?.all(TacticsCard) ?? [];
        return handCards.some(c => c.id === card.id);
      },
      // MERC-pj8: Explicit AI auto-select for top deck card
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        return game.dictatorPlayer?.tacticsDeck?.first(TacticsCard) ?? undefined;
      },
    })
    .execute((args) => {
      const card = args.card as TacticsCard;
      game.message(`Dictator plays: ${card.tacticsName}`);

      // Move card to discard
      card.putInto(game.dictatorPlayer.tacticsDiscard);

      // Execute the card's effect
      const result = executeTacticsEffect(game, card);

      return {
        success: result.success,
        message: `Played ${card.tacticsName}: ${result.message}`,
        data: result.data,
      };
    });
}

/**
 * Reinforce instead of playing a tactics card
 * Discard a tactics card to gain militia
 * MERC-5j2: AI uses top card from deck
 */
export function createReinforceAction(game: MERCGame): ActionDefinition {
  return Action.create('reinforce')
    .prompt('Reinforce militia')
    .condition((ctx) => {
      // Only the dictator player can reinforce
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      // MERC-5j2: AI plays from deck, human plays from hand
      if (game.dictatorPlayer?.isAI) {
        return (game.dictatorPlayer?.tacticsDeck?.count(TacticsCard) ?? 0) > 0;
      }
      return (game.dictatorPlayer?.tacticsHand?.count(TacticsCard) ?? 0) > 0;
    })
    .chooseElement<TacticsCard>('card', {
      prompt: 'Discard a tactics card to reinforce',
      elementClass: TacticsCard,
      filter: (element) => {
        const card = element as unknown as TacticsCard;
        // MERC-5j2: AI auto-selects top card from deck
        if (game.dictatorPlayer?.isAI) {
          const topCard = game.dictatorPlayer?.tacticsDeck?.first(TacticsCard);
          return topCard ? card.id === topCard.id : false;
        }
        // Use ID comparison instead of object reference (instances may differ)
        const handCards = game.dictatorPlayer?.tacticsHand?.all(TacticsCard) ?? [];
        return handCards.some(c => c.id === card.id);
      },
      // MERC-pj8: Explicit AI auto-select for top deck card
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        return game.dictatorPlayer?.tacticsDeck?.first(TacticsCard) ?? undefined;
      },
    })
    .chooseElement<Sector>('sector', {
      prompt: 'Place reinforcement militia where?',
      elementClass: Sector,
      filter: (element) => {
        const sector = element as unknown as Sector;
        // Per rules: "Sector must be Dictator-controlled"
        // Dictator controls if militia >= total rebel militia (ties go to dictator)
        const isControlled = sector.dictatorMilitia >= sector.getTotalRebelMilitia() &&
          sector.dictatorMilitia > 0;
        // Also allow base sector even if no militia yet
        const isBase = game.dictatorPlayer.baseSectorId === sector.sectorId;
        return isControlled || isBase;
      },
      boardRef: (element) => ({ id: (element as unknown as Sector).id }),
      // MERC-0m0: AI auto-select per rule 4.4.3 - closest to rebel-controlled sector
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        // Get all dictator-controlled sectors
        const controlled = game.gameMap.getAllSectors().filter(s => {
          const isControlled = s.dictatorMilitia >= s.getTotalRebelMilitia() &&
            s.dictatorMilitia > 0;
          const isBase = game.dictatorPlayer.baseSectorId === s.sectorId;
          return isControlled || isBase;
        });
        if (controlled.length === 0) return undefined;
        // Use rule 4.4.3: closest to rebel-controlled sector
        return selectMilitiaPlacementSector(game, controlled, 'dictator') ?? undefined;
      },
    })
    .execute((args) => {
      const card = args.card as TacticsCard;
      const sector = args.sector as Sector;

      // Calculate reinforcement amount
      const reinforcements = game.getReinforcementAmount();

      // Discard the card
      card.putInto(game.dictatorPlayer.tacticsDiscard);

      // Place militia
      const placed = sector.addDictatorMilitia(reinforcements);

      game.message(`Dictator discards ${card.tacticsName} to reinforce`);
      game.message(`Placed ${placed} militia at ${sector.sectorName}`);

      // Check if any rebel has units at this sector and trigger combat
      for (const rebel of game.rebelPlayers) {
        const hasSquad = rebel.primarySquad.sectorId === sector.sectorId ||
          rebel.secondarySquad.sectorId === sector.sectorId;
        const hasMilitia = sector.getRebelMilitia(`${rebel.position}`) > 0;

        if (hasSquad || hasMilitia) {
          game.message(`Rebels detected at ${sector.sectorName} - combat begins!`);
          const outcome = executeCombat(game, sector, rebel);
          return {
            success: true,
            message: `Reinforced with ${placed} militia and engaged in combat`,
            data: {
              combatTriggered: true,
              rebelVictory: outcome.rebelVictory,
              dictatorVictory: outcome.dictatorVictory,
            },
          };
        }
      }

      return { success: true, message: `Reinforced with ${placed} militia` };
    });
}

// =============================================================================
// Militia Movement Actions
// =============================================================================

/**
 * Move dictator militia between adjacent sectors
 */
export function createMoveMilitiaAction(game: MERCGame): ActionDefinition {
  return Action.create('moveMilitia')
    .prompt('Move militia')
    .condition((ctx) => {
      // Only the dictator player can move militia
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      // Must have militia somewhere
      if (!game.gameMap.getAllSectors().some(s => s.dictatorMilitia > 0)) return false;

      // MERC-1ph: For AI, only show if there's a beneficial move
      if (game.dictatorPlayer?.isAI) {
        return hasBeneficialMilitiaMove(game);
      }

      return true;
    })
    .chooseElement<Sector>('fromSector', {
      prompt: 'Move militia from which sector?',
      elementClass: Sector,
      filter: (element) => {
        const sector = element as unknown as Sector;
        return sector.dictatorMilitia > 0;
      },
      boardRef: (element) => ({ id: (element as unknown as Sector).id }),
      // MERC-p3c: AI selects sector furthest from rebels to move militia from
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const sectorsWithMilitia = game.gameMap.getAllSectors()
          .filter(s => s.dictatorMilitia > 0);
        if (sectorsWithMilitia.length === 0) return undefined;
        // Sort by distance to nearest rebel (furthest first)
        const sorted = [...sectorsWithMilitia].sort((a, b) => {
          const distA = distanceToNearestRebel(game, a);
          const distB = distanceToNearestRebel(game, b);
          return distB - distA; // Furthest first
        });
        return sorted[0];
      },
    })
    .chooseElement<Sector>('toSector', {
      prompt: 'Move militia to which adjacent sector?',
      elementClass: Sector,
      filter: (element, ctx) => {
        const sector = element as unknown as Sector;
        const fromSector = ctx.args?.fromSector as Sector | undefined;
        // During availability check, fromSector may not be selected yet
        if (!fromSector) return true;
        const adjacent = game.getAdjacentSectors(fromSector);
        return adjacent.some(s => s.sectorId === sector.sectorId) &&
          sector.dictatorMilitia < SectorConstants.MAX_MILITIA_PER_SIDE;
      },
      boardRef: (element) => ({ id: (element as unknown as Sector).id }),
      // MERC-p3c: AI selects adjacent sector closest to rebels (per rule 4.4.3)
      aiSelect: (ctx) => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const fromSector = ctx.args.fromSector as Sector;
        if (!fromSector) return undefined;
        const adjacent = game.getAdjacentSectors(fromSector)
          .filter(s => s.dictatorMilitia < SectorConstants.MAX_MILITIA_PER_SIDE);
        if (adjacent.length === 0) return undefined;
        // Sort by distance to nearest rebel (closest first)
        const sorted = [...adjacent].sort((a, b) => {
          const distA = distanceToNearestRebel(game, a);
          const distB = distanceToNearestRebel(game, b);
          return distA - distB; // Closest first
        });
        return sorted[0];
      },
    })
    .chooseFrom<string>('count', {
      prompt: 'How many militia to move?',
      choices: (ctx) => {
        const fromSector = ctx.args.fromSector as Sector;
        if (!fromSector) return ['1'];
        return Array.from({ length: fromSector.dictatorMilitia }, (_, i) => String(i + 1));
      },
      // MERC-p3c: AI moves maximum possible militia
      aiSelect: (ctx) => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const fromSector = ctx.args.fromSector as Sector;
        if (!fromSector) return undefined;
        return String(fromSector.dictatorMilitia); // Move all
      },
    })
    .execute((args) => {
      const fromSector = args.fromSector as Sector;
      const toSector = args.toSector as Sector;
      const count = parseInt(args.count as string, 10);

      const removed = fromSector.removeDictatorMilitia(count);
      const added = toSector.addDictatorMilitia(removed);

      game.message(`Dictator moved ${added} militia from ${fromSector.sectorName} to ${toSector.sectorName}`);

      // Per rules: "Combat triggers when: An enemy moves into your sector"
      // Check if any rebel has units at destination and trigger combat
      for (const rebel of game.rebelPlayers) {
        const hasSquad = rebel.primarySquad.sectorId === toSector.sectorId ||
          rebel.secondarySquad.sectorId === toSector.sectorId;
        const hasMilitia = toSector.getRebelMilitia(`${rebel.position}`) > 0;

        if (hasSquad || hasMilitia) {
          game.message(`Rebels detected at ${toSector.sectorName} - combat begins!`);
          const outcome = executeCombat(game, toSector, rebel);
          return {
            success: true,
            message: `Moved ${added} militia and engaged in combat`,
            data: {
              combatTriggered: true,
              rebelVictory: outcome.rebelVictory,
              dictatorVictory: outcome.dictatorVictory,
            },
          };
        }
      }

      return { success: true, message: `Moved ${added} militia` };
    });
}

/**
 * Skip militia movement
 */
export function createSkipMilitiaMoveAction(game: MERCGame): ActionDefinition {
  return Action.create('skipMilitiaMove')
    .prompt('Skip militia movement')
    .condition((ctx) => {
      // Only the dictator player can skip militia movement
      if (ctx.player) {
        return game.isDictatorPlayer(ctx.player as any);
      }
      // Fallback when ctx.player is undefined: check if current player is NOT a rebel
      // This handles edge cases where player context might be lost
      const currentIsRebel = game.rebelPlayers.some(r => r.position === (ctx as any).currentPlayerPosition);
      return !currentIsRebel && !!game.dictatorPlayer;
    })
    .execute(() => {
      game.message('Dictator skips militia movement');
      return { success: true, message: 'Militia held' };
    });
}

// =============================================================================
// Dictator MERC Actions
// =============================================================================

/**
 * Dictator MERC move action
 * MERC-07j: Now includes dictator card when in play
 */
export function createDictatorMoveAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorMove')
    .prompt('Move Dictator unit')
    .condition((ctx) => {
      // Only the dictator player can move dictator MERCs
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      // Check if any dictator MERC has actions and a valid location
      const mercs = game.dictatorPlayer?.hiredMercs || [];
      const dictator = game.dictatorPlayer?.dictator;

      const mercCanMove = mercs.some(m => canDictatorUnitMove(m));
      // MERC-07j: Check if dictator card can move
      const dictatorCanMove = dictator?.inPlay && canDictatorUnitMove(dictator);

      return mercCanMove || dictatorCanMove;
    })
    .chooseElement<DictatorUnit>('merc', {
      prompt: 'Select unit to move',
      display: (unit) => capitalize(getDictatorUnitName(unit)),
      filter: (element) => {
        // MERC-07j: Check if element is a valid dictator unit (use ID comparison)
        if (element instanceof MercCard) {
          const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
          return dictatorMercs.some(m => m.id === element.id) && canDictatorUnitMove(element);
        }
        if (element instanceof DictatorCard) {
          if (!element.inPlay) return false;
          if (element.id !== game.dictatorPlayer?.dictator?.id) return false;
          return canDictatorUnitMove(element);
        }
        return false;
      },
      // MERC-5aa: AI auto-selection
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const nextAction = getNextAIAction(game);
        if (nextAction?.actionName === 'dictatorMove' && nextAction.unit) {
          return nextAction.unit;
        }
        return undefined;
      },
    })
    .chooseElement<Sector>('destination', {
      prompt: 'Select destination sector',
      elementClass: Sector,
      filter: (element, ctx) => {
        const sector = element as unknown as Sector;
        const unit = ctx.args?.merc as DictatorUnit | undefined;
        // During availability check, unit may not be selected yet
        if (!unit?.sectorId) return true;
        const currentSector = game.getSector(unit.sectorId);
        if (!currentSector) return false;
        const adjacent = game.getAdjacentSectors(currentSector);
        return adjacent.some(s => s.sectorId === sector.sectorId);
      },
      // MERC-5aa: AI auto-selection
      aiSelect: (ctx) => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const unit = ctx.args.merc as DictatorUnit;
        if (!unit) return undefined;
        const nextAction = getNextAIAction(game);
        if (nextAction?.destination) {
          return nextAction.destination;
        }
        return getAIMoveDestination(game, unit) ?? undefined;
      },
    })
    .execute((args) => {
      const unit = args.merc as DictatorUnit;
      const destination = args.destination as Sector;

      unit.useAction(ACTION_COSTS.MOVE);
      // Update unit's location
      unit.sectorId = destination.sectorId;

      // Note: Dictator MERCs use individual sectorId (not squad.sectorId)
      // because they can be in different locations

      game.message(`${getDictatorUnitName(unit)} moved to ${destination.sectorName}`);

      // MERC-pcf: Per rules "Combat triggers when: An enemy moves into your sector"
      // Check if any rebel has units at destination and trigger combat
      for (const rebel of game.rebelPlayers) {
        const hasSquad = rebel.primarySquad.sectorId === destination.sectorId ||
          rebel.secondarySquad.sectorId === destination.sectorId;
        const hasMilitia = destination.getRebelMilitia(`${rebel.position}`) > 0;

        if (hasSquad || hasMilitia) {
          game.message(`Rebels detected at ${destination.sectorName} - combat begins!`);
          const outcome = executeCombat(game, destination, rebel);
          return {
            success: true,
            message: `Moved to ${destination.sectorName} and engaged in combat`,
            data: {
              combatTriggered: true,
              rebelVictory: outcome.rebelVictory,
              dictatorVictory: outcome.dictatorVictory,
            },
          };
        }
      }

      return { success: true, message: `Moved to ${destination.sectorName}` };
    });
}

/**
 * Dictator MERC explore action
 * MERC-07j: Now includes dictator card when in play
 */
export function createDictatorExploreAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorExplore')
    .prompt('Explore with Dictator unit')
    .condition((ctx) => {
      // Only the dictator player can use dictator MERC actions
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      const mercs = game.dictatorPlayer?.hiredMercs || [];
      const dictator = game.dictatorPlayer?.dictator;

      // Check if any MERC has actions and is at an unexplored sector
      const mercCanExplore = mercs.some(m => canDictatorUnitExplore(m, game));

      // MERC-07j: Check if dictator card can explore
      const dictatorCanExplore = dictator?.inPlay && canDictatorUnitExplore(dictator, game);

      return mercCanExplore || dictatorCanExplore;
    })
    .chooseElement<DictatorUnit>('merc', {
      prompt: 'Select unit to explore',
      display: (unit) => capitalize(getDictatorUnitName(unit)),
      filter: (element) => {
        // MERC-07j: Check if element is a valid dictator unit
        if (element instanceof MercCard) {
          const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
          if (!dictatorMercs.some(m => m.id === element.id)) return false;
          return canDictatorUnitExplore(element, game);
        }
        if (element instanceof DictatorCard) {
          if (!element.inPlay) return false;
          if (element.id !== game.dictatorPlayer?.dictator?.id) return false;
          return canDictatorUnitExplore(element, game);
        }
        return false;
      },
      // MERC-5aa: AI auto-selection
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const nextAction = getNextAIAction(game);
        if (nextAction?.actionName === 'dictatorExplore' && nextAction.unit) {
          return nextAction.unit;
        }
        return undefined;
      },
    })
    .execute((args) => {
      const unit = args.merc as DictatorUnit;
      const sector = game.getSector(unit.sectorId!);

      if (!sector || sector.explored) {
        return { success: false, message: 'Cannot explore' };
      }

      unit.useAction(ACTION_COSTS.EXPLORE);
      sector.explore();

      // Draw equipment based on loot icons
      const drawnEquipment: Equipment[] = [];
      for (let i = 0; i < sector.weaponLoot; i++) {
        const weapon = game.drawEquipment('Weapon');
        if (weapon) {
          sector.addToStash(weapon);
          drawnEquipment.push(weapon);
        }
      }
      for (let i = 0; i < sector.armorLoot; i++) {
        const armor = game.drawEquipment('Armor');
        if (armor) {
          sector.addToStash(armor);
          drawnEquipment.push(armor);
        }
      }
      for (let i = 0; i < sector.accessoryLoot; i++) {
        const accessory = game.drawEquipment('Accessory');
        if (accessory) {
          sector.addToStash(accessory);
          drawnEquipment.push(accessory);
        }
      }

      game.message(`${getDictatorUnitName(unit)} explored ${sector.sectorName}, found ${drawnEquipment.length} equipment`);

      // MERC-0dp: Auto-equip dictator units according to AI rules
      if (drawnEquipment.length > 0) {
        const equipped = autoEquipDictatorUnits(game, sector);
        if (equipped > 0) {
          game.message(`Dictator auto-equipped ${equipped} item(s)`);
        }
      }

      return { success: true, message: `Explored ${sector.sectorName}` };
    });
}

/**
 * Dictator MERC train militia action
 * MERC-3hf: Added militia cap check to match rebel train action
 * MERC-07j: Now includes dictator card when in play
 */
export function createDictatorTrainAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorTrain')
    .prompt('Train militia with Dictator unit')
    .condition((ctx) => {
      // Only the dictator player can use dictator MERC actions
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      const mercs = game.dictatorPlayer?.hiredMercs || [];
      const dictator = game.dictatorPlayer?.dictator;

      // MERC-3hf: Check if any MERC can train (has training, actions, and sector not at max militia)
      const mercCanTrain = mercs.some(m => canDictatorUnitTrain(m, game));

      // MERC-07j: Check if dictator card can train
      const dictatorCanTrain = dictator?.inPlay && canDictatorUnitTrain(dictator, game);

      return mercCanTrain || dictatorCanTrain;
    })
    .chooseElement<DictatorUnit>('merc', {
      prompt: 'Select unit to train',
      display: (unit) => capitalize(getDictatorUnitName(unit)),
      filter: (element) => {
        // MERC-07j: Check if element is a valid dictator unit
        if (element instanceof MercCard) {
          const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
          if (!dictatorMercs.some(m => m.id === element.id)) return false;
          return canDictatorUnitTrain(element, game);
        }
        if (element instanceof DictatorCard) {
          if (!element.inPlay) return false;
          if (element.id !== game.dictatorPlayer?.dictator?.id) return false;
          return canDictatorUnitTrain(element, game);
        }
        return false;
      },
      // MERC-5aa: AI auto-selection
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const nextAction = getNextAIAction(game);
        if (nextAction?.actionName === 'dictatorTrain' && nextAction.unit) {
          return nextAction.unit;
        }
        return undefined;
      },
    })
    .execute((args) => {
      const unit = args.merc as DictatorUnit;
      const sector = game.getSector(unit.sectorId!);

      if (!sector) {
        return { success: false, message: 'No sector found' };
      }

      unit.useAction(ACTION_COSTS.TRAIN);
      const trained = sector.addDictatorMilitia(unit.training);
      game.message(`${getDictatorUnitName(unit)} trained ${trained} militia at ${sector.sectorName}`);

      // Check if any rebel has units at this sector and trigger combat
      for (const rebel of game.rebelPlayers) {
        const hasSquad = rebel.primarySquad.sectorId === sector.sectorId ||
          rebel.secondarySquad.sectorId === sector.sectorId;
        const hasMilitia = sector.getRebelMilitia(`${rebel.position}`) > 0;

        if (hasSquad || hasMilitia) {
          game.message(`Rebels detected at ${sector.sectorName} - combat begins!`);
          const outcome = executeCombat(game, sector, rebel);
          return {
            success: true,
            message: `Trained ${trained} militia and engaged in combat`,
            data: {
              combatTriggered: true,
              rebelVictory: outcome.rebelVictory,
              dictatorVictory: outcome.dictatorVictory,
            },
          };
        }
      }

      return { success: true, message: `Trained ${trained} militia` };
    });
}

/**
 * Dictator MERC re-equip action
 * MERC-07j: Now includes dictator card when in play
 */
export function createDictatorReEquipAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorReEquip')
    .prompt('Re-equip Dictator unit')
    .condition((ctx) => {
      // Only the dictator player can use dictator MERC actions
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      const mercs = game.dictatorPlayer?.hiredMercs || [];
      const dictator = game.dictatorPlayer?.dictator;

      // Check if any MERC has actions and is at a sector with equipment
      const mercCanReEquip = mercs.some(m => canDictatorUnitReEquip(m, game));

      // MERC-07j: Check if dictator card can re-equip
      const dictatorCanReEquip = dictator?.inPlay && canDictatorUnitReEquip(dictator, game);

      return mercCanReEquip || dictatorCanReEquip;
    })
    .chooseElement<DictatorUnit>('merc', {
      prompt: 'Select unit to re-equip',
      display: (unit) => capitalize(getDictatorUnitName(unit)),
      filter: (element) => {
        // MERC-07j: Check if element is a valid dictator unit
        if (element instanceof MercCard) {
          const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
          if (!dictatorMercs.some(m => m.id === element.id)) return false;
          return canDictatorUnitReEquip(element, game);
        }
        if (element instanceof DictatorCard) {
          if (!element.inPlay) return false;
          if (element.id !== game.dictatorPlayer?.dictator?.id) return false;
          return canDictatorUnitReEquip(element, game);
        }
        return false;
      },
      // MERC-5aa: AI auto-selection
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const nextAction = getNextAIAction(game);
        if (nextAction?.actionName === 'dictatorReEquip' && nextAction.unit) {
          return nextAction.unit;
        }
        return undefined;
      },
    })
    .chooseElement<Equipment>('equipment', {
      prompt: 'Select equipment from stash',
      elementClass: Equipment,
      filter: (element, ctx) => {
        const equipment = element as unknown as Equipment;
        const unit = ctx.args?.merc as DictatorUnit | undefined;
        // During availability check, unit may not be selected yet
        if (!unit?.sectorId) return true;
        const sector = game.getSector(unit.sectorId);
        return sector?.stash.some(e => e.id === equipment.id) ?? false;
      },
      // MERC-5aa: AI auto-selection
      aiSelect: (ctx) => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const unit = ctx.args.merc as DictatorUnit;
        if (!unit) return undefined;
        return getAIEquipmentSelection(game, unit) ?? undefined;
      },
    })
    .execute((args) => {
      const unit = args.merc as DictatorUnit;
      const equipment = args.equipment as Equipment;
      const sector = game.getSector(unit.sectorId!);

      if (!sector) {
        return { success: false, message: 'No sector found' };
      }

      unit.useAction(ACTION_COSTS.RE_EQUIP);

      // Unequip current item of same type if any
      const currentEquipment = unit.getEquipmentOfType(equipment.equipmentType);
      if (currentEquipment) {
        // Fix: unequip takes EquipmentType, not Equipment
        unit.unequip(equipment.equipmentType);
        sector.addToStash(currentEquipment);
      }

      // Equip new item
      const stashIdx = sector.stash.indexOf(equipment);
      if (stashIdx >= 0) {
        sector.takeFromStash(stashIdx);
      }
      unit.equip(equipment);

      game.message(`${getDictatorUnitName(unit)} equipped ${equipment.equipmentName}`);
      return { success: true, message: `Equipped ${equipment.equipmentName}` };
    });
}

/**
 * Dictator MERC heal action
 * MERC-7fy: Per rules 4.8, AI heals injured MERCs using healing items
 */
export function createDictatorHealAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorHeal')
    .prompt('Heal injured MERC')
    .condition((ctx) => {
      // Only the dictator player can use dictator MERC actions
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      const mercs = game.dictatorPlayer?.hiredMercs || [];

      // Check if any MERC has a healing item
      const hasHealer = mercs.some(m => !m.isDead && hasHealingItemEquipped(m));
      if (!hasHealer) return false;

      // Check if any MERC needs healing
      const hasDamaged = mercs.some(m => mercNeedsHealing(m));
      return hasDamaged;
    })
    .chooseElement<MercCard>('healer', {
      prompt: 'Select MERC with healing item',
      display: (merc) => `${merc.mercName} (${merc.accessorySlot?.equipmentName})`,
      filter: (element) => {
        if (!(element instanceof MercCard)) return false;
        const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
        if (!dictatorMercs.some(m => m.id === element.id)) return false;
        return !element.isDead && hasHealingItemEquipped(element);
      },
      // MERC-7fy: AI auto-selection based on healing priority
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const mercs = game.dictatorPlayer.hiredMercs.filter(m => !m.isDead);
        const damagedMercs = mercs.filter(m => mercNeedsHealing(m));
        const healingAction = getAIHealingPriority(game, damagedMercs, mercs);
        if (healingAction?.type === 'item' && healingAction.merc) {
          return healingAction.merc;
        }
        // Fallback to first healer
        return mercs.find(m => hasHealingItemEquipped(m));
      },
    })
    .chooseElement<MercCard>('target', {
      prompt: 'Select MERC to heal',
      display: (merc) => `${merc.mercName} (${merc.health}/${merc.maxHealth} HP)`,
      filter: (element) => {
        if (!(element instanceof MercCard)) return false;
        const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
        if (!dictatorMercs.some(m => m.id === element.id)) return false;
        return mercNeedsHealing(element);
      },
      // MERC-7fy: AI auto-selection - heal lowest health MERC
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const mercs = game.dictatorPlayer.hiredMercs.filter(m => !m.isDead);
        const damagedMercs = mercs.filter(m => mercNeedsHealing(m));
        const healingAction = getAIHealingPriority(game, damagedMercs, mercs);
        if (healingAction?.target) {
          return healingAction.target;
        }
        // Fallback to lowest health
        return damagedMercs.sort((a, b) => a.health - b.health)[0];
      },
    })
    .execute((args) => {
      const healer = args.healer as MercCard;
      const target = args.target as MercCard;
      const healingItem = healer.accessorySlot;

      if (!healingItem) {
        return { success: false, message: 'No healing item equipped' };
      }

      const healAmount = getHealingAmountForItem(healingItem.equipmentId);
      const actualHealed = Math.min(healAmount, target.damage);

      // Heal the target
      target.heal(actualHealed);

      // Discard the healing item (one-use)
      healer.unequip('Accessory');
      const discard = game.getEquipmentDiscard('Accessory');
      if (discard) {
        healingItem.putInto(discard);
      }

      game.message(`${healer.mercName} uses ${healingItem.equipmentName} to heal ${target.mercName} for ${actualHealed} HP`);
      return { success: true, message: `Healed ${target.mercName} for ${actualHealed} HP` };
    });
}

/**
 * End dictator MERC actions
 */
export function createDictatorEndMercActionsAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorEndMercActions')
    .prompt('End MERC actions')
    .condition((ctx) => {
      // Only the dictator player can end dictator MERC actions
      return game.isDictatorPlayer(ctx.player as any);
    })
    .execute(() => {
      // Clear all remaining actions from dictator MERCs
      const mercs = game.dictatorPlayer?.hiredMercs || [];
      for (const merc of mercs) {
        merc.actionsRemaining = 0;
      }
      if (game.dictatorPlayer?.dictator?.inPlay) {
        game.dictatorPlayer.dictator.actionsRemaining = 0;
      }
      game.message('Dictator ends MERC actions');
      return { success: true, message: 'MERC actions ended' };
    });
}

// =============================================================================
// MERC-9m9: Dictator Mortar Attack Action
// =============================================================================

/**
 * Dictator mortar attack action.
 * MERC-9m9: Per rules 4.12, AI always attacks with mortars when possible.
 * Mortars attack adjacent sectors without entering them.
 */
export function createDictatorMortarAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorMortar')
    .prompt('Fire mortar at adjacent sector')
    .condition((ctx) => {
      if (!game.isDictatorPlayer(ctx.player as any)) return false;

      const mercs = game.dictatorPlayer?.hiredMercs || [];
      const dictator = game.dictatorPlayer?.dictator;

      const mercCanFire = mercs.some(m => canDictatorUnitFireMortar(m, game));
      const dictatorCanFire = dictator?.inPlay && canDictatorUnitFireMortar(dictator, game);

      return mercCanFire || dictatorCanFire;
    })
    .chooseElement<DictatorUnit>('merc', {
      prompt: 'Select unit to fire mortar',
      display: (unit) => capitalize(getDictatorUnitName(unit)),
      filter: (element) => {
        if (element instanceof MercCard) {
          const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
          return dictatorMercs.some(m => m.id === element.id) && canDictatorUnitFireMortar(element, game);
        }
        if (element instanceof DictatorCard) {
          if (!element.inPlay) return false;
          if (element.id !== game.dictatorPlayer?.dictator?.id) return false;
          return canDictatorUnitFireMortar(element, game);
        }
        return false;
      },
      // MERC-9m9: AI auto-selection - pick first unit with mortar
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const mercs = game.dictatorPlayer.hiredMercs.filter(m => canDictatorUnitFireMortar(m, game));
        if (mercs.length > 0) return mercs[0];
        const dictator = game.dictatorPlayer.dictator;
        if (dictator?.inPlay && canDictatorUnitFireMortar(dictator, game)) {
          return dictator;
        }
        return undefined;
      },
    })
    .chooseElement<Sector>('target', {
      prompt: 'Select target sector',
      elementClass: Sector,
      filter: (element, ctx) => {
        const sector = element as unknown as Sector;
        const unit = ctx.args?.merc as DictatorUnit | undefined;
        // During availability check, unit may not be selected yet
        if (!unit?.sectorId) return true;

        const fromSector = game.getSector(unit.sectorId);
        if (!fromSector) return false;

        const validTargets = getMortarTargets(game, fromSector);
        return validTargets.some(t => t.sectorId === sector.sectorId);
      },
      // MERC-9m9: AI auto-selection - pick sector with most targets
      aiSelect: (ctx) => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const unit = ctx.args.merc as DictatorUnit;
        if (!unit?.sectorId) return undefined;

        const fromSector = game.getSector(unit.sectorId);
        if (!fromSector) return undefined;

        return selectMortarTarget(game, fromSector) ?? undefined;
      },
    })
    .execute((args) => {
      const unit = args.merc as DictatorUnit;
      const targetSector = args.target as Sector;

      // Use action
      unit.useAction(1);

      // Get mortar damage (typically 1 damage per target)
      const mortarDamage = 1;

      game.message(`${getDictatorUnitName(unit)} fires mortar at ${targetSector.sectorName}!`);

      let totalDamage = 0;

      // Damage all rebel MERCs in the sector
      for (const rebel of game.rebelPlayers) {
        const mercsInSector = game.getMercsInSector(targetSector, rebel);
        for (const merc of mercsInSector) {
          merc.takeDamage(mortarDamage);
          totalDamage++;
          game.message(`Mortar deals ${mortarDamage} damage to ${merc.mercName}`);
        }
      }

      // Damage rebel militia in the sector
      for (const rebel of game.rebelPlayers) {
        const militia = targetSector.getRebelMilitia(`${rebel.position}`);
        if (militia > 0) {
          targetSector.removeRebelMilitia(`${rebel.position}`, mortarDamage);
          totalDamage++;
          game.message(`Mortar kills ${mortarDamage} of ${rebel.name}'s militia`);
        }
      }

      return {
        success: true,
        message: `Mortar attack dealt ${totalDamage} damage`,
        data: { totalDamage },
      };
    });
}
