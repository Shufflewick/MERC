/**
 * Dictator Actions
 *
 * All actions available to the dictator player: tactics, militia movement, and MERC actions.
 */

import { Action, type ActionDefinition, type ActionContext } from 'boardsmith';
import type { MERCGame, RebelPlayer } from '../game.js';
import { Sector, Equipment, TacticsCard, CombatantModel } from '../elements.js';
import { queuePendingCombat, hasEnemies } from '../combat.js';
import { executeTacticsEffect } from '../tactics-effects.js';
import {
  hasMortar,
  getMortarTargets,
  selectMortarTarget,
  selectMilitiaPlacementSector,
  selectNewMercLocation,
  mercNeedsHealing,
  getAIHealingPriority,
} from '../ai-helpers.js';
import { getNextAIAction } from '../ai-executor.js';
import { ACTION_COSTS, capitalize, asTacticsCard, asSector, asCombatantModel, getGlobalCachedValue, setGlobalCachedValue, clearGlobalCachedValue, isCombatantModel, isMerc, equipNewHire } from './helpers.js';
import { buildMapCombatantEntry, emitMapCombatantEntries } from '../animation-events.js';
import { isHealingItem, getHealAmount, hasRangedAttack, getHealingEffect } from '../equipment-effects.js';

// =============================================================================
// Dictator Unit Type and Helpers
// =============================================================================

// MERC-07j: Type for units that can perform dictator actions (hired MERCs or dictator card)
// Using CombatantModel as it represents both merc and dictator combatants

// Note: getCombatantModelName was removed - use getUnitName from helpers.ts instead
// Note: move, explore, train, reEquip, dropEquipment actions now unified with rebel actions

function canCombatantModelFireMortar(unit: CombatantModel, game: MERCGame): boolean {
  if (unit.actionsRemaining < 1 || !unit.sectorId) return false;
  if (!hasMortar(unit)) return false;

  const sector = game.getSector(unit.sectorId);
  if (!sector) return false;

  const targets = getMortarTargets(game, sector);
  return targets.length > 0;
}

// MERC-7fy: Helper to check if a MERC has a healing item equipped
// Uses equipment registry instead of string matching
function hasHealingItemEquipped(merc: CombatantModel): boolean {
  // Check accessory slot
  if (merc.accessorySlot && isHealingItem(merc.accessorySlot.equipmentId)) {
    return true;
  }
  // Check bandolier slots
  return merc.bandolierSlots.some(e => isHealingItem(e.equipmentId));
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
// Cards that reveal the dictator's base now use the revealsBase property on TacticsCard

export function createPlayTacticsAction(game: MERCGame): ActionDefinition {
  return Action.create('playTactics')
    .prompt('Play a tactics card')
    .condition({
      'is dictator player': (ctx) => game.isDictatorPlayer(ctx.player),
      'has tactics cards available': () => {
        if (game.dictatorPlayer?.isAI) {
          return (game.dictatorPlayer?.tacticsDeck?.count(TacticsCard) ?? 0) > 0;
        }
        return (game.dictatorPlayer?.tacticsHand?.count(TacticsCard) ?? 0) > 0;
      },
    })
    .chooseElement<TacticsCard>('card', {
      prompt: 'Select a tactics card to play',
      elementClass: TacticsCard,
      display: (card: TacticsCard) => card.tacticsName,
      filter: (element) => {
        const card = asTacticsCard(element);
        // MERC-5j2: AI auto-selects top card from deck
        if (game.dictatorPlayer?.isAI) {
          const topCard = game.dictatorPlayer?.tacticsDeck?.first(TacticsCard);
          return topCard ? card.id === topCard.id : false;
        }
        // Use ID comparison instead of object reference (instances may differ)
        const handCards = game.dictatorPlayer?.tacticsHand?.all(TacticsCard) ?? [];
        return handCards.some(c => c.id === card.id);
      },
    })
    // Human players choose base location when playing a base-reveal card
    .chooseFrom<string>('baseLocation', {
      prompt: 'Choose the location for your base',
      dependsOn: 'card',
      choices: (ctx: ActionContext) => {
        // If base is already revealed, return placeholder (selection will be skipped)
        if (game.dictatorPlayer?.baseRevealed) {
          return ['(skipped)'];
        }
        // Check if we should show choices at all
        const card = ctx.args?.card as TacticsCard | undefined;
        if (!card || !card.revealsBase) {
          // Return placeholder to keep action available (selection will be skipped)
          return ['(skipped)'];
        }
        // Get industries controlled by dictator
        const industries = game.gameMap.getAllSectors()
          .filter(s => s.sectorType === 'Industry' && s.dictatorMilitia > 0);
        if (industries.length === 0) {
          // Fallback to any industry
          return game.gameMap.getAllSectors()
            .filter(s => s.sectorType === 'Industry')
            .map(s => s.sectorName);
        }
        return industries.map(s => s.sectorName);
      },
    })
    // Human dictator chooses starting equipment when base is revealed
    .chooseFrom<string>('dictatorEquipment', {
      prompt: 'Choose starting equipment for the Dictator',
      dependsOn: 'baseLocation',
      choices: (ctx: ActionContext) => {
        // If base is already revealed, return placeholder (selection will be skipped)
        if (game.dictatorPlayer?.baseRevealed) return ['(skipped)'];
        // Check if we should show choices at all
        const card = ctx.args?.card as TacticsCard | undefined;
        if (!card || !card.revealsBase) return ['(skipped)'];
        return ['Weapon', 'Armor', 'Accessory'];
      },
    })
    .execute((args) => {
      const card = asTacticsCard(args.card);
      game.message(`Dictator plays: ${card.tacticsName}`);

      // Move card to discard
      card.putInto(game.dictatorPlayer.tacticsDiscard!);

      // For human players playing base-reveal cards, set base location first
      if (!game.dictatorPlayer?.isAI &&
          card.revealsBase &&
          !game.dictatorPlayer?.baseRevealed &&
          args.baseLocation) {
        const baseName = args.baseLocation as string;
        const baseSector = game.gameMap.getAllSectors().find(s => s.sectorName === baseName);
        if (baseSector) {
          game.dictatorPlayer.baseSectorId = baseSector.sectorId;
          if (game.dictatorPlayer.dictator) {
            game.dictatorPlayer.dictator.baseSectorId = baseSector.sectorId;
          }
          game.message(`Dictator established base at ${baseSector.sectorName}`);
        }
      }

      // Execute the card's effect (this may reveal base and put dictator in play)
      const result = executeTacticsEffect(game, card);

      // For human players playing base-reveal cards, equip the dictator
      if (!game.dictatorPlayer?.isAI &&
          card.revealsBase &&
          game.dictatorPlayer?.dictator?.inPlay &&
          args.dictatorEquipment) {
        const equipType = args.dictatorEquipment as 'Weapon' | 'Armor' | 'Accessory';
        const equipment = game.drawEquipment(equipType);
        if (equipment && game.dictatorPlayer.dictator) {
          const { displacedBandolierItems } = game.dictatorPlayer.dictator.equip(equipment);
          for (const item of displacedBandolierItems) {
            const discard = game.getEquipmentDiscard(item.equipmentType);
            if (discard) item.putInto(discard);
          }
          game.message(`${game.dictatorPlayer.dictator.combatantName} equipped ${equipment.equipmentName}`);
        }
      }

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
    .condition({
      'is dictator player': (ctx) => game.isDictatorPlayer(ctx.player),
      'has tactics cards to discard': () => {
        if (game.dictatorPlayer?.isAI) {
          return (game.dictatorPlayer?.tacticsDeck?.count(TacticsCard) ?? 0) > 0;
        }
        return (game.dictatorPlayer?.tacticsHand?.count(TacticsCard) ?? 0) > 0;
      },
    })
    .chooseElement<TacticsCard>('card', {
      prompt: 'Discard a tactics card to reinforce',
      elementClass: TacticsCard,
      display: (card: TacticsCard) => card.tacticsName,
      filter: (element) => {
        const card = asTacticsCard(element);
        // MERC-5j2: AI auto-selects top card from deck
        if (game.dictatorPlayer?.isAI) {
          const topCard = game.dictatorPlayer?.tacticsDeck?.first(TacticsCard);
          return topCard ? card.id === topCard.id : false;
        }
        // Use ID comparison instead of object reference (instances may differ)
        const handCards = game.dictatorPlayer?.tacticsHand?.all(TacticsCard) ?? [];
        return handCards.some(c => c.id === card.id);
      },
    })
    .chooseElement<Sector>('sector', {
      prompt: 'Place reinforcement militia where?',
      elementClass: Sector,
      filter: (element) => {
        const sector = asSector(element);
        // Per rules: "Sector must be Dictator-controlled"
        // Dictator controls if militia >= total rebel militia (ties go to dictator)
        const isControlled = sector.dictatorMilitia >= sector.getTotalRebelMilitia() &&
          sector.dictatorMilitia > 0;
        // Also allow base sector even if no militia yet
        const isBase = game.dictatorPlayer.baseSectorId === sector.sectorId;
        return isControlled || isBase;
      },
      boardRef: (element: Sector) => ({ id: asSector(element).id }),
    })
    .execute((args) => {
      const card = asTacticsCard(args.card);
      const sector = asSector(args.sector);

      // Calculate reinforcement amount
      const reinforcements = game.getReinforcementAmount();

      // Discard the card
      card.putInto(game.dictatorPlayer.tacticsDiscard!);

      // Place militia
      const placed = sector.addDictatorMilitia(reinforcements);

      game.message(`Dictator discards ${card.tacticsName} to reinforce`);
      game.message(`Placed ${placed} militia at ${sector.sectorName}`);

      // Check if any rebel has units at this sector and trigger combat
      for (const rebel of game.rebelPlayers) {
        const hasSquad = rebel.primarySquad.sectorId === sector.sectorId ||
          rebel.secondarySquad.sectorId === sector.sectorId;
        const hasMilitia = sector.getRebelMilitia(`${rebel.seat}`) > 0;

        if (hasSquad || hasMilitia) {
          game.message(`Rebels detected at ${sector.sectorName} - combat begins!`);
          // Dictator initiated combat, queue it so UI can mount CombatPanel
          queuePendingCombat(game, sector, rebel, false);
          return {
            success: true,
            message: `Reinforced with ${placed} militia and engaged in combat`,
            data: {
              combatTriggered: true,
              combatQueued: true,
            },
          };
        }
      }

      return { success: true, message: `Reinforced with ${placed} militia` };
    });
}

// =============================================================================
// Dictator MERC Actions
// Note: All basic MERC actions (move, explore, train, reEquip, dropEquipment,
// heal, mortar, endTurn) are now unified with rebel actions in rebel-movement.ts,
// rebel-economy.ts, and rebel-equipment.ts. They work for both player types.
// =============================================================================

// All dictator-specific MERC actions have been removed - they now use the
// unified actions: move, explore, train, reEquip, dropEquipment, mortar, endTurn
// The only dictator-specific actions remaining are:
// - playTactics: Play tactics cards (dictator only)
// - reinforce: Place militia via tactics (dictator only)
// - castroBonusHire: Castro's per-turn ability to hire a MERC (human players)
// - kimBonusMilitia: Kim's per-turn ability to place militia (human players)

// =============================================================================
// Castro's Per-Turn Hire Action (Human Players)
// =============================================================================

/**
 * Castro's ability: "Once per turn, draw 3 random MERCs and hire 1."
 * Human players choose which MERC to hire and where to place them.
 */
export function createCastroBonusHireAction(game: MERCGame): ActionDefinition {
  // Settings keys to persist state across choices
  const DRAWN_MERCS_KEY = '_castro_drawn_mercs';

  return Action.create('castroBonusHire')
    .prompt("Castro's Ability: Hire a MERC")
    .condition({
      'is dictator player': (ctx) => game.isDictatorPlayer(ctx.player),
      'is Castro': () => game.dictatorPlayer?.dictator?.combatantId === 'castro',
      'is human player': () => !game.dictatorPlayer?.isAI,
    })
    .chooseFrom<string>('selectedMerc', {
      prompt: 'Choose a MERC to hire',
      choices: () => {
        // Draw 3 MERCs if not already drawn
        if (!getGlobalCachedValue<number[]>(game, DRAWN_MERCS_KEY)) {
          const drawnMercs: CombatantModel[] = [];
          for (let i = 0; i < 3; i++) {
            const merc = game.drawMerc();
            if (merc) drawnMercs.push(merc);
          }
          // Store merc IDs
          setGlobalCachedValue(game, DRAWN_MERCS_KEY, drawnMercs.map(m => m.id));
        }

        const combatantElementIds = getGlobalCachedValue<number[]>(game, DRAWN_MERCS_KEY) ?? [];
        const mercs = combatantElementIds
          .map(id => game.getElementById(id))
          .filter((el): el is CombatantModel => isCombatantModel(el) && el.isMerc)
          .sort((a, b) => b.baseCombat - a.baseCombat);

        if (mercs.length === 0) {
          return ['No MERCs available'];
        }

        // Return just capitalized names (UI finds MERC data via findMercByName)
        return mercs.map(m => capitalize(m.combatantName));
      },
    })
    .chooseFrom<string>('equipmentType', {
      prompt: 'Choose starting equipment type',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
    })
    .chooseFrom<string>('targetSector', {
      prompt: 'Choose where to deploy the new MERC',
      choices: () => {
        const primarySquad = game.dictatorPlayer.primarySquad;
        const secondarySquad = game.dictatorPlayer.secondarySquad;
        // A squad "has a sector" only if it has living mercs there
        // Dead squads retain stale sectorIds that shouldn't restrict choices
        const primaryHasSector = !!primarySquad.sectorId && primarySquad.getLivingMercs().length > 0;
        const secondaryHasSector = !!secondarySquad.sectorId && secondarySquad.getLivingMercs().length > 0;

        // If both squads are already deployed, only allow their current sectors
        if (primaryHasSector && secondaryHasSector) {
          const validSectorIds = new Set<string>();
          if (primarySquad.sectorId) validSectorIds.add(primarySquad.sectorId);
          if (secondarySquad.sectorId) validSectorIds.add(secondarySquad.sectorId);

          return game.gameMap.getAllSectors()
            .filter(s => validSectorIds.has(s.sectorId))
            .map(s => s.sectorName);
        }

        // Otherwise, show all dictator-controlled sectors (existing behavior)
        const sectors = game.gameMap.getAllSectors()
          .filter(s => s.dictatorMilitia > 0 || game.getDictatorMercsInSector(s).length > 0);

        if (sectors.length === 0) {
          // Fallback to any industry
          const industries = game.gameMap.getAllSectors()
            .filter(s => s.sectorType === 'Industry');
          return industries.map(s => s.sectorName);
        }

        return sectors.map(s => s.sectorName);
      },
    })
    .execute((args, ctx) => {
      const combatantElementIds = getGlobalCachedValue<number[]>(game, DRAWN_MERCS_KEY) ?? [];
      const selectedMercName = args.selectedMerc as string;

      if (!selectedMercName || selectedMercName === 'No MERCs available') {
        clearGlobalCachedValue(game, DRAWN_MERCS_KEY);
        return { success: false, message: 'No MERC selected' };
      }

      // Find the MERC by name
      const mercs = combatantElementIds
        .map(id => game.getElementById(id))
        .filter((el): el is CombatantModel => isCombatantModel(el) && el.isMerc);
      const selectedMerc = mercs.find(m => capitalize(m.combatantName) === selectedMercName);

      if (!selectedMerc) {
        clearGlobalCachedValue(game, DRAWN_MERCS_KEY);
        return { success: false, message: 'MERC not found' };
      }

      // Set MERC location from selected sector
      const targetSectorChoice = args.targetSector as string;

      // Extract sector name (remove militia count suffix if present)
      const sectorName = targetSectorChoice.replace(/\s*\(\d+\s*militia\)$/, '').trim();

      // Try multiple matching strategies
      const allSectors = game.gameMap.getAllSectors();
      let targetSector = allSectors.find(s => s.sectorName === sectorName);

      // Fallback: match by startsWith (in case of formatting differences)
      if (!targetSector) {
        targetSector = allSectors.find(s => targetSectorChoice.startsWith(s.sectorName));
      }

      if (!targetSector) {
        // Debug: log what we tried to match
        game.message(`WARNING: Could not find sector "${sectorName}" from choice "${targetSectorChoice}"`);
        // Fallback to first dictator-controlled sector
        targetSector = allSectors.find(s => s.dictatorMilitia > 0);
        if (targetSector) {
          game.message(`Falling back to ${targetSector.sectorName}`);
        }
      }

      if (!targetSector) {
        clearGlobalCachedValue(game, DRAWN_MERCS_KEY);
        return { success: false, message: 'No valid sector found' };
      }

      // Determine which squad to use based on target sector
      const primarySquad = game.dictatorPlayer.primarySquad;
      const secondarySquad = game.dictatorPlayer.secondarySquad;

      // Check if primary squad is already at this sector or has no MERCs
      const primaryMercs = primarySquad.getLivingMercs();
      const secondaryMercs = secondarySquad.getLivingMercs();

      let targetSquad: typeof primarySquad;
      if ((primaryMercs.length === 0 || primarySquad.sectorId === targetSector.sectorId) && !primarySquad.isFull) {
        targetSquad = primarySquad;
        game.message(`Placing ${selectedMerc.combatantName} in primary squad at ${targetSector.sectorName}`);
      } else if ((secondaryMercs.length === 0 || secondarySquad.sectorId === targetSector.sectorId) && !secondarySquad.isFull) {
        targetSquad = secondarySquad;
        game.message(`Placing ${selectedMerc.combatantName} in secondary squad at ${targetSector.sectorName}`);
      } else if (!primarySquad.isFull) {
        targetSquad = primarySquad;
        game.message(`Both squads occupied - adding to primary squad`);
      } else if (!secondarySquad.isFull) {
        targetSquad = secondarySquad;
        game.message(`Primary full - adding to secondary squad`);
      } else {
        // Both squads full — discard all
        for (const merc of mercs) {
          merc.putInto(game.mercDiscard);
        }
        clearGlobalCachedValue(game, DRAWN_MERCS_KEY);
        game.message('Castro: All squads full, cannot hire');
        return { success: false, message: 'All squads full' };
      }

      // Put MERC into chosen squad and set its location to the selected sector
      // Always update sectorId: empty squads retain stale sectorIds from dead mercs
      selectedMerc.putInto(targetSquad);
      targetSquad.sectorId = targetSector.sectorId;
      game.message(`Castro deployed ${selectedMerc.combatantName} to ${targetSector.sectorName}`);

      emitMapCombatantEntries(game, [
        buildMapCombatantEntry(selectedMerc, targetSector.sectorId),
      ]);

      // Update squad-based ability bonuses (Tack, Sarge, Valkyrie, etc.)
      game.updateAllSargeBonuses();

      // Give equipment of chosen type - uses shared helper for Apeiron/Vrbansk ability handling
      const equipType = args.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
      equipNewHire(game, selectedMerc, equipType);

      // Discard the other MERCs
      for (const merc of mercs) {
        if (merc !== selectedMerc) {
          merc.putInto(game.mercDiscard);
        }
      }

      // Clean up
      clearGlobalCachedValue(game, DRAWN_MERCS_KEY);

      game.message(`Castro hired ${selectedMerc.combatantName}`);
      return { success: true, message: `Hired ${selectedMerc.combatantName}` };
    });
}

// =============================================================================
// Kim's Per-Turn Militia Action (Human Players)
// =============================================================================

/**
 * Kim's ability: "Once per turn, count rebel controlled sectors and place that many militia."
 * Human players choose where to place the militia.
 */
export function createKimBonusMilitiaAction(game: MERCGame): ActionDefinition {
  return Action.create('kimBonusMilitia')
    .prompt("Kim's Ability: Place bonus militia")
    .condition({
      'is dictator player': (ctx) => game.isDictatorPlayer(ctx.player),
      'is Kim': () => game.dictatorPlayer?.dictator?.combatantId === 'kim',
      'is human player': () => !game.dictatorPlayer?.isAI,
    })
    .chooseFrom<string>('targetSector', {
      prompt: 'Choose sector to place militia (based on rebel-controlled sectors)',
      choices: () => {
        // Get sectors where dictator can place militia
        const sectors = game.gameMap.getAllSectors()
          .filter(s => s.dictatorMilitia > 0 || s.sectorType === 'Industry');

        // Return sector names as strings (UI displays these directly)
        return sectors.map(s => s.sectorName);
      },
    })
    .execute((args, ctx) => {
      // Count rebel-controlled sectors
      let rebelSectorCount = 0;
      for (const rebel of game.rebelPlayers) {
        rebelSectorCount += game.getControlledSectors(rebel).length;
      }

      if (rebelSectorCount === 0) {
        game.message('Kim: Rebels control no sectors - no bonus militia');
        return { success: true, message: 'No militia to place' };
      }

      // Find sector by name (since choices are sector names)
      const targetSectorName = args.targetSector as string;
      const targetSector = game.gameMap.getAllSectors().find(s => s.sectorName === targetSectorName);
      if (!targetSector) {
        return { success: false, message: 'Invalid sector' };
      }

      const placed = targetSector.addDictatorMilitia(rebelSectorCount, true);
      game.message(`Kim placed ${placed} militia at ${targetSector.sectorName} (rebels control ${rebelSectorCount} sectors)`);

      // Check if any rebel has units at this sector and trigger combat
      for (const rebel of game.rebelPlayers) {
        const hasSquad = rebel.primarySquad.sectorId === targetSector.sectorId ||
          rebel.secondarySquad.sectorId === targetSector.sectorId;
        const hasMilitia = targetSector.getRebelMilitia(`${rebel.seat}`) > 0;

        if (hasSquad || hasMilitia) {
          game.message(`Rebels detected at ${targetSector.sectorName} - combat begins!`);
          // Dictator initiated combat, queue it so UI can mount CombatPanel
          queuePendingCombat(game, targetSector, rebel, false);
          return {
            success: true,
            message: `Placed ${placed} militia and engaged in combat`,
            data: {
              combatTriggered: true,
              combatQueued: true,
            },
          };
        }
      }

      return { success: true, message: `Placed ${placed} militia` };
    });
}

// =============================================================================
// Generalissimo MERC Hire Action (Human Players)
// =============================================================================

/**
 * Generalissimo: Draw 6 MERCs (already drawn), dictator picks 1 to hire.
 * Human players choose which MERC, starting equipment, and deployment sector.
 * Follows the castroBonusHire pattern closely.
 */
export function createGeneralissimoPickAction(game: MERCGame): ActionDefinition {
  return Action.create('generalissimoPick')
    .prompt('Generalissimo: Choose a MERC to hire')
    .condition({
      'is dictator player': (ctx) => game.isDictatorPlayer(ctx.player),
      'has pending hire': () => game.pendingGeneralissimoHire != null,
      'is human player': () => !game.dictatorPlayer?.isAI,
    })
    .chooseFrom<string>('selectedMerc', {
      prompt: 'Choose a MERC to hire (6 drawn)',
      choices: () => {
        const ids = game.pendingGeneralissimoHire?.drawnMercIds ?? [];
        const mercs = ids
          .map(id => game.getElementById(id))
          .filter((el): el is CombatantModel => isCombatantModel(el) && el.isMerc)
          .sort((a, b) => b.baseCombat - a.baseCombat);

        if (mercs.length === 0) return ['No MERCs available'];
        return mercs.map(m => capitalize(m.combatantName));
      },
    })
    .chooseFrom<string>('equipmentType', {
      prompt: 'Choose starting equipment type',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
    })
    .chooseFrom<string>('targetSector', {
      prompt: 'Choose where to deploy the new MERC',
      choices: () => {
        const primarySquad = game.dictatorPlayer.primarySquad;
        const secondarySquad = game.dictatorPlayer.secondarySquad;
        // A squad "has a sector" only if it has living mercs there
        const primaryHasSector = !!primarySquad.sectorId && primarySquad.getLivingMercs().length > 0;
        const secondaryHasSector = !!secondarySquad.sectorId && secondarySquad.getLivingMercs().length > 0;

        // If both squads are already deployed, only allow their current sectors
        if (primaryHasSector && secondaryHasSector) {
          const validSectorIds = new Set<string>();
          if (primarySquad.sectorId) validSectorIds.add(primarySquad.sectorId);
          if (secondarySquad.sectorId) validSectorIds.add(secondarySquad.sectorId);

          return game.gameMap.getAllSectors()
            .filter(s => validSectorIds.has(s.sectorId))
            .map(s => s.sectorName);
        }

        // Otherwise, show all dictator-controlled sectors
        const sectors = game.gameMap.getAllSectors()
          .filter(s => s.dictatorMilitia > 0 || game.getDictatorMercsInSector(s).length > 0);

        if (sectors.length === 0) {
          // Fallback to any industry
          const industries = game.gameMap.getAllSectors()
            .filter(s => s.sectorType === 'Industry');
          return industries.map(s => s.sectorName);
        }

        return sectors.map(s => s.sectorName);
      },
    })
    .execute((args, ctx) => {
      const mercIds = game.pendingGeneralissimoHire?.drawnMercIds ?? [];
      const selectedMercName = args.selectedMerc as string;

      if (!selectedMercName || selectedMercName === 'No MERCs available') {
        // Discard all drawn MERCs and clear state
        for (const id of mercIds) {
          const merc = game.getElementById(id);
          if (merc && isCombatantModel(merc)) {
            merc.putInto(game.mercDiscard);
          }
        }
        game.pendingGeneralissimoHire = null;
        return { success: false, message: 'No MERC selected' };
      }

      // Find the MERC by name
      const mercs = mercIds
        .map(id => game.getElementById(id))
        .filter((el): el is CombatantModel => isCombatantModel(el) && el.isMerc);
      const selectedMerc = mercs.find(m => capitalize(m.combatantName) === selectedMercName);

      if (!selectedMerc) {
        game.pendingGeneralissimoHire = null;
        return { success: false, message: 'MERC not found' };
      }

      // Find target sector
      const targetSectorChoice = args.targetSector as string;
      const sectorName = targetSectorChoice.replace(/\s*\(\d+\s*militia\)$/, '').trim();
      const allSectors = game.gameMap.getAllSectors();
      let targetSector = allSectors.find(s => s.sectorName === sectorName);

      if (!targetSector) {
        targetSector = allSectors.find(s => targetSectorChoice.startsWith(s.sectorName));
      }

      if (!targetSector) {
        game.message(`WARNING: Could not find sector "${sectorName}" from choice "${targetSectorChoice}"`);
        targetSector = allSectors.find(s => s.dictatorMilitia > 0);
        if (targetSector) {
          game.message(`Falling back to ${targetSector.sectorName}`);
        }
      }

      if (!targetSector) {
        game.pendingGeneralissimoHire = null;
        return { success: false, message: 'No valid sector found' };
      }

      // Determine which squad to use based on target sector
      const primarySquad = game.dictatorPlayer.primarySquad;
      const secondarySquad = game.dictatorPlayer.secondarySquad;
      const primaryMercs = primarySquad.getLivingMercs();
      const secondaryMercs = secondarySquad.getLivingMercs();

      let targetSquad: typeof primarySquad;
      if ((primaryMercs.length === 0 || primarySquad.sectorId === targetSector.sectorId) && !primarySquad.isFull) {
        targetSquad = primarySquad;
        game.message(`Placing ${selectedMerc.combatantName} in primary squad at ${targetSector.sectorName}`);
      } else if ((secondaryMercs.length === 0 || secondarySquad.sectorId === targetSector.sectorId) && !secondarySquad.isFull) {
        targetSquad = secondarySquad;
        game.message(`Placing ${selectedMerc.combatantName} in secondary squad at ${targetSector.sectorName}`);
      } else if (!primarySquad.isFull) {
        targetSquad = primarySquad;
        game.message(`Both squads occupied - adding to primary squad`);
      } else if (!secondarySquad.isFull) {
        targetSquad = secondarySquad;
        game.message(`Primary full - adding to secondary squad`);
      } else {
        // Both squads full — discard all
        for (const merc of mercs) {
          merc.putInto(game.mercDiscard);
        }
        game.pendingGeneralissimoHire = null;
        game.message('Generalissimo: All squads full, cannot hire');
        return { success: false, message: 'All squads full' };
      }

      // Put MERC into chosen squad and set its location to the selected sector
      // Always update sectorId: empty squads retain stale sectorIds from dead mercs
      selectedMerc.putInto(targetSquad);
      targetSquad.sectorId = targetSector.sectorId;
      game.message(`Generalissimo deployed ${selectedMerc.combatantName} to ${targetSector.sectorName}`);

      emitMapCombatantEntries(game, [
        buildMapCombatantEntry(selectedMerc, targetSector.sectorId),
      ]);

      // Update squad-based ability bonuses
      game.updateAllSargeBonuses();

      // Give equipment of chosen type
      const equipType = args.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
      equipNewHire(game, selectedMerc, equipType);

      // Discard the other MERCs
      for (const merc of mercs) {
        if (merc !== selectedMerc) {
          merc.putInto(game.mercDiscard);
        }
      }

      // Clear pending state
      game.pendingGeneralissimoHire = null;

      game.animate('tactic-generalissimo', {
        cardName: 'Generalissimo',
        description: `Hiring ${selectedMerc.combatantName} as a new MERC`,
        mercHired: selectedMerc.combatantName,
      }, () => {});

      game.message(`Generalissimo hired ${selectedMerc.combatantName}`);
      return { success: true, message: `Hired ${selectedMerc.combatantName}` };
    });
}

// =============================================================================
// Lockdown Militia Placement Action (Human Players)
// =============================================================================

/**
 * Lockdown: Place militia on base or adjacent sectors.
 * Per CSV: "Reveal base. Get 5 extra militia per rebel player. Place them on base or adjacent sectors."
 * Human dictator picks sector and amount per iteration until all militia are placed.
 */
export function createLockdownPlaceMilitiaAction(game: MERCGame): ActionDefinition {
  return Action.create('lockdownPlaceMilitia')
    .prompt('Lockdown: Place militia on base or adjacent sectors')
    .condition({
      'is dictator player': (ctx) => game.isDictatorPlayer(ctx.player),
      'has pending militia': () => game.pendingLockdownMilitia != null && game.pendingLockdownMilitia.remaining > 0,
      'is human player': () => !game.dictatorPlayer?.isAI,
    })
    .chooseFrom<string>('targetSector', {
      prompt: 'Choose sector for militia placement',
      choices: () => {
        const pending = game.pendingLockdownMilitia;
        if (!pending) return [];
        return pending.validSectorIds
          .map(id => game.gameMap.getAllSectors().find(s => s.sectorId === id))
          .filter((s): s is Sector => s != null && s.dictatorMilitia < 10) // Respect 10 cap
          .map(s => s.sectorName);
      },
    })
    .chooseFrom<string>('amount', {
      prompt: 'How many militia to place here?',
      choices: () => {
        const remaining = game.pendingLockdownMilitia?.remaining ?? 0;
        const max = Math.min(remaining, 10);
        return Array.from({ length: max }, (_, i) => `${i + 1}`);
      },
    })
    .execute((args, ctx) => {
      const pending = game.pendingLockdownMilitia;
      if (!pending) return { success: false, message: 'No pending lockdown militia' };

      const sectorName = args.targetSector as string;
      const sector = game.gameMap.getAllSectors().find(s => s.sectorName === sectorName);
      if (!sector) return { success: false, message: `Invalid sector: "${sectorName}"` };

      const requestedAmount = parseInt(args.amount as string, 10);
      if (isNaN(requestedAmount) || requestedAmount <= 0) return { success: false, message: 'Invalid amount' };

      // Enforce actual sector cap: can only place up to (10 - current militia)
      const sectorRoom = 10 - sector.dictatorMilitia;
      const amount = Math.min(requestedAmount, sectorRoom, pending.remaining);
      if (amount <= 0) return { success: false, message: `${sector.sectorName} is already at capacity (10 militia)` };

      // Place militia
      const placed = sector.addDictatorMilitia(amount);
      pending.remaining -= placed;
      game.message(`Lockdown: ${placed} militia placed at ${sector.sectorName} (${pending.remaining} remaining)`);

      // Check for combat
      for (const rebel of game.rebelPlayers) {
        const hasSquad = rebel.primarySquad.sectorId === sector.sectorId ||
          rebel.secondarySquad.sectorId === sector.sectorId;
        const hasMilitia = sector.getRebelMilitia(`${rebel.seat}`) > 0;

        if (hasSquad || hasMilitia) {
          game.message(`Rebels detected at ${sector.sectorName} - combat begins!`);
          queuePendingCombat(game, sector, rebel, false);
          break; // Only trigger combat once per sector
        }
      }

      // Clear pending if all placed
      if (pending.remaining <= 0) {
        game.pendingLockdownMilitia = null;
      }

      return { success: true, message: `Placed ${placed} militia` };
    });
}

// =============================================================================
// Mao's Per-Turn Militia Placement Action (Human Players)
// =============================================================================

/**
 * Mao's ability: "Once per turn, count rebel-controlled sectors and place that many militia
 * on any wilderness sectors."
 * Human players choose which wilderness sector and how many per iteration.
 */
export function createMaoBonusMilitiaAction(game: MERCGame): ActionDefinition {
  return Action.create('maoBonusMilitia')
    .prompt("Mao's Ability: Place militia in wilderness sectors")
    .condition({
      'is dictator player': (ctx) => game.isDictatorPlayer(ctx.player),
      'is Mao': () => game.dictatorPlayer?.dictator?.combatantId === 'mao',
      'is human player': () => !game.dictatorPlayer?.isAI,
      'has pending militia': () => game.pendingMaoMilitia != null && game.pendingMaoMilitia.remaining > 0,
    })
    .chooseFrom<string>('targetSector', {
      prompt: 'Choose wilderness sector for militia placement',
      choices: () => {
        return game.gameMap.getAllSectors()
          .filter(s => s.isWilderness && s.dictatorMilitia < Sector.MAX_MILITIA_PER_SIDE)
          .map(s => s.sectorName);
      },
    })
    .chooseFrom<string>('amount', {
      prompt: 'How many militia to place here?',
      choices: () => {
        const remaining = game.pendingMaoMilitia?.remaining ?? 0;
        const max = Math.min(remaining, 10);
        return Array.from({ length: max }, (_, i) => `${i + 1}`);
      },
    })
    .execute((args, ctx) => {
      const pending = game.pendingMaoMilitia;
      if (!pending) return { success: false, message: 'No pending Mao militia' };

      const sectorName = args.targetSector as string;
      const sector = game.gameMap.getAllSectors().find(s => s.sectorName === sectorName);
      if (!sector) return { success: false, message: `Invalid sector: "${sectorName}"` };

      const requestedAmount = parseInt(args.amount as string, 10);
      if (isNaN(requestedAmount) || requestedAmount <= 0) return { success: false, message: 'Invalid amount' };

      // Enforce actual sector cap: can only place up to (10 - current militia)
      const sectorRoom = Sector.MAX_MILITIA_PER_SIDE - sector.dictatorMilitia;
      const amount = Math.min(requestedAmount, sectorRoom, pending.remaining);
      if (amount <= 0) return { success: false, message: `${sector.sectorName} is already at capacity (${Sector.MAX_MILITIA_PER_SIDE} militia)` };

      // Place militia
      const placed = sector.addDictatorMilitia(amount);
      pending.remaining -= placed;
      game.message(`Mao: ${placed} militia placed at ${sector.sectorName} (${pending.remaining} remaining)`);

      // Check for combat
      for (const rebel of game.rebelPlayers) {
        const hasSquad = rebel.primarySquad.sectorId === sector.sectorId ||
          rebel.secondarySquad.sectorId === sector.sectorId;
        const hasMilitia = sector.getRebelMilitia(`${rebel.seat}`) > 0;

        if (hasSquad || hasMilitia) {
          game.message(`Rebels detected at ${sector.sectorName} - combat begins!`);
          queuePendingCombat(game, sector, rebel, false);
          break; // Only trigger combat once per sector
        }
      }

      // Clear pending if all placed
      if (pending.remaining <= 0) {
        game.pendingMaoMilitia = null;
      }

      return { success: true, message: `Placed ${placed} militia` };
    });
}

// =============================================================================
// Gaddafi's Per-Turn Hire Action (Human Players)
// =============================================================================

/**
 * Gaddafi's ability: "Once per turn, hire 1 random MERC."
 * Human players see the drawn MERC, choose equipment type and deployment sector.
 */
export function createGadafiBonusHireAction(game: MERCGame): ActionDefinition {
  const DRAWN_MERC_KEY = '_gadafi_drawn_merc';

  return Action.create('gadafiBonusHire')
    .prompt("Gaddafi's Ability: Hire a MERC")
    .condition({
      'is dictator player': (ctx) => game.isDictatorPlayer(ctx.player),
      'is Gaddafi': () => game.dictatorPlayer?.dictator?.combatantId === 'gadafi',
      'is human player': () => !game.dictatorPlayer?.isAI,
    })
    .chooseFrom<string>('selectedMerc', {
      prompt: 'MERC drawn for hire',
      choices: () => {
        // Draw 1 MERC if not already drawn
        if (!getGlobalCachedValue<number>(game, DRAWN_MERC_KEY)) {
          const merc = game.drawMerc();
          if (merc) {
            setGlobalCachedValue(game, DRAWN_MERC_KEY, merc.id);
          }
        }

        const mercId = getGlobalCachedValue<number>(game, DRAWN_MERC_KEY);
        if (!mercId) {
          return ['No MERCs available'];
        }

        const merc = game.getElementById(mercId);
        if (!merc || !isCombatantModel(merc) || !merc.isMerc) {
          return ['No MERCs available'];
        }

        return [capitalize(merc.combatantName)];
      },
    })
    .chooseFrom<string>('equipmentType', {
      prompt: 'Choose starting equipment type',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
    })
    .chooseFrom<string>('targetSector', {
      prompt: 'Choose where to deploy the new MERC',
      choices: () => {
        const primarySquad = game.dictatorPlayer.primarySquad;
        const secondarySquad = game.dictatorPlayer.secondarySquad;
        const primaryHasSector = !!primarySquad.sectorId && primarySquad.getLivingMercs().length > 0;
        const secondaryHasSector = !!secondarySquad.sectorId && secondarySquad.getLivingMercs().length > 0;

        // If both squads are already deployed, only allow their current sectors
        if (primaryHasSector && secondaryHasSector) {
          const validSectorIds = new Set<string>();
          if (primarySquad.sectorId) validSectorIds.add(primarySquad.sectorId);
          if (secondarySquad.sectorId) validSectorIds.add(secondarySquad.sectorId);

          return game.gameMap.getAllSectors()
            .filter(s => validSectorIds.has(s.sectorId))
            .map(s => s.sectorName);
        }

        // Otherwise, show all dictator-controlled sectors
        const sectors = game.gameMap.getAllSectors()
          .filter(s => s.dictatorMilitia > 0 || game.getDictatorMercsInSector(s).length > 0);

        if (sectors.length === 0) {
          const industries = game.gameMap.getAllSectors()
            .filter(s => s.sectorType === 'Industry');
          return industries.map(s => s.sectorName);
        }

        return sectors.map(s => s.sectorName);
      },
    })
    .execute((args) => {
      const mercId = getGlobalCachedValue<number>(game, DRAWN_MERC_KEY);
      const selectedMercName = args.selectedMerc as string;

      if (!mercId || !selectedMercName || selectedMercName === 'No MERCs available') {
        clearGlobalCachedValue(game, DRAWN_MERC_KEY);
        return { success: false, message: 'No MERC available' };
      }

      const merc = game.getElementById(mercId);
      if (!merc || !isCombatantModel(merc) || !merc.isMerc) {
        clearGlobalCachedValue(game, DRAWN_MERC_KEY);
        return { success: false, message: 'MERC not found' };
      }

      // Find target sector
      const targetSectorChoice = args.targetSector as string;
      const sectorName = targetSectorChoice.replace(/\s*\(\d+\s*militia\)$/, '').trim();
      const allSectors = game.gameMap.getAllSectors();
      let targetSector = allSectors.find(s => s.sectorName === sectorName);

      if (!targetSector) {
        targetSector = allSectors.find(s => targetSectorChoice.startsWith(s.sectorName));
      }

      if (!targetSector) {
        game.message(`WARNING: Could not find sector "${sectorName}" from choice "${targetSectorChoice}"`);
        targetSector = allSectors.find(s => s.dictatorMilitia > 0);
        if (targetSector) {
          game.message(`Falling back to ${targetSector.sectorName}`);
        }
      }

      if (!targetSector) {
        clearGlobalCachedValue(game, DRAWN_MERC_KEY);
        return { success: false, message: 'No valid sector found' };
      }

      // Determine which squad to use based on target sector
      const primarySquad = game.dictatorPlayer.primarySquad;
      const secondarySquad = game.dictatorPlayer.secondarySquad;
      const primaryMercs = primarySquad.getLivingMercs();
      const secondaryMercs = secondarySquad.getLivingMercs();

      let targetSquad: typeof primarySquad;
      if ((primaryMercs.length === 0 || primarySquad.sectorId === targetSector.sectorId) && !primarySquad.isFull) {
        targetSquad = primarySquad;
        game.message(`Placing ${merc.combatantName} in primary squad at ${targetSector.sectorName}`);
      } else if ((secondaryMercs.length === 0 || secondarySquad.sectorId === targetSector.sectorId) && !secondarySquad.isFull) {
        targetSquad = secondarySquad;
        game.message(`Placing ${merc.combatantName} in secondary squad at ${targetSector.sectorName}`);
      } else if (!primarySquad.isFull) {
        targetSquad = primarySquad;
        game.message(`Both squads occupied - adding to primary squad`);
      } else if (!secondarySquad.isFull) {
        targetSquad = secondarySquad;
        game.message(`Primary full - adding to secondary squad`);
      } else {
        merc.putInto(game.mercDiscard);
        clearGlobalCachedValue(game, DRAWN_MERC_KEY);
        game.message('Gaddafi: All squads full, cannot hire');
        return { success: false, message: 'All squads full' };
      }

      merc.putInto(targetSquad);
      targetSquad.sectorId = targetSector.sectorId;
      game.message(`Gaddafi deployed ${merc.combatantName} to ${targetSector.sectorName}`);

      emitMapCombatantEntries(game, [
        buildMapCombatantEntry(merc, targetSector.sectorId),
      ]);

      game.updateAllSargeBonuses();

      const equipType = args.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
      equipNewHire(game, merc, equipType);

      clearGlobalCachedValue(game, DRAWN_MERC_KEY);

      game.message(`Gaddafi hired ${merc.combatantName}`);
      return { success: true, message: `Hired ${merc.combatantName}` };
    });
}

// =============================================================================
// Stalin's Per-Turn Hire Action (Human Players)
// =============================================================================

/**
 * Stalin's ability: "Once per turn, hire 1 random MERC to primary squad;
 * if base revealed, also hire 1 to secondary squad."
 *
 * Human players choose equipment and sector for the primary hire.
 * The secondary hire (when base is revealed) is auto-placed in execute.
 */
export function createStalinBonusHireAction(game: MERCGame): ActionDefinition {
  const DRAWN_MERC_KEY = '_stalin_drawn_merc_primary';

  return Action.create('stalinBonusHire')
    .prompt("Stalin's Ability: Hire MERCs")
    .condition({
      'is dictator player': (ctx) => game.isDictatorPlayer(ctx.player),
      'is Stalin': () => game.dictatorPlayer?.dictator?.combatantId === 'stalin',
      'is human player': () => !game.dictatorPlayer?.isAI,
    })
    .chooseFrom<string>('selectedMerc', {
      prompt: 'MERC drawn for primary squad',
      choices: () => {
        // Draw 1 MERC if not already drawn
        if (!getGlobalCachedValue<number>(game, DRAWN_MERC_KEY)) {
          const merc = game.drawMerc();
          if (merc) {
            setGlobalCachedValue(game, DRAWN_MERC_KEY, merc.id);
          }
        }

        const mercId = getGlobalCachedValue<number>(game, DRAWN_MERC_KEY);
        if (!mercId) {
          return ['No MERCs available'];
        }

        const merc = game.getElementById(mercId);
        if (!merc || !isCombatantModel(merc) || !merc.isMerc) {
          return ['No MERCs available'];
        }

        return [capitalize(merc.combatantName)];
      },
    })
    .chooseFrom<string>('equipmentType', {
      prompt: 'Choose starting equipment type',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
    })
    .chooseFrom<string>('targetSector', {
      prompt: 'Choose where to deploy the new MERC',
      choices: () => {
        const primarySquad = game.dictatorPlayer.primarySquad;
        const secondarySquad = game.dictatorPlayer.secondarySquad;
        const primaryHasSector = !!primarySquad.sectorId && primarySquad.getLivingMercs().length > 0;
        const secondaryHasSector = !!secondarySquad.sectorId && secondarySquad.getLivingMercs().length > 0;

        if (primaryHasSector && secondaryHasSector) {
          const validSectorIds = new Set<string>();
          if (primarySquad.sectorId) validSectorIds.add(primarySquad.sectorId);
          if (secondarySquad.sectorId) validSectorIds.add(secondarySquad.sectorId);

          return game.gameMap.getAllSectors()
            .filter(s => validSectorIds.has(s.sectorId))
            .map(s => s.sectorName);
        }

        const sectors = game.gameMap.getAllSectors()
          .filter(s => s.dictatorMilitia > 0 || game.getDictatorMercsInSector(s).length > 0);

        if (sectors.length === 0) {
          const industries = game.gameMap.getAllSectors()
            .filter(s => s.sectorType === 'Industry');
          return industries.map(s => s.sectorName);
        }

        return sectors.map(s => s.sectorName);
      },
    })
    .execute((args) => {
      const mercId = getGlobalCachedValue<number>(game, DRAWN_MERC_KEY);
      const selectedMercName = args.selectedMerc as string;

      if (!mercId || !selectedMercName || selectedMercName === 'No MERCs available') {
        clearGlobalCachedValue(game, DRAWN_MERC_KEY);
        return { success: false, message: 'No MERC available' };
      }

      const merc = game.getElementById(mercId);
      if (!merc || !isCombatantModel(merc) || !merc.isMerc) {
        clearGlobalCachedValue(game, DRAWN_MERC_KEY);
        return { success: false, message: 'MERC not found' };
      }

      // Find target sector
      const targetSectorChoice = args.targetSector as string;
      const sectorName = targetSectorChoice.replace(/\s*\(\d+\s*militia\)$/, '').trim();
      const allSectors = game.gameMap.getAllSectors();
      let targetSector = allSectors.find(s => s.sectorName === sectorName);

      if (!targetSector) {
        targetSector = allSectors.find(s => targetSectorChoice.startsWith(s.sectorName));
      }

      if (!targetSector) {
        game.message(`WARNING: Could not find sector "${sectorName}" from choice "${targetSectorChoice}"`);
        targetSector = allSectors.find(s => s.dictatorMilitia > 0);
        if (targetSector) {
          game.message(`Falling back to ${targetSector.sectorName}`);
        }
      }

      if (!targetSector) {
        clearGlobalCachedValue(game, DRAWN_MERC_KEY);
        return { success: false, message: 'No valid sector found' };
      }

      // Determine which squad for primary hire
      const primarySquad = game.dictatorPlayer.primarySquad;
      const secondarySquad = game.dictatorPlayer.secondarySquad;
      const primaryMercs = primarySquad.getLivingMercs();
      const secondaryMercs = secondarySquad.getLivingMercs();

      let targetSquad: typeof primarySquad;
      if ((primaryMercs.length === 0 || primarySquad.sectorId === targetSector.sectorId) && !primarySquad.isFull) {
        targetSquad = primarySquad;
        game.message(`Placing ${merc.combatantName} in primary squad at ${targetSector.sectorName}`);
      } else if ((secondaryMercs.length === 0 || secondarySquad.sectorId === targetSector.sectorId) && !secondarySquad.isFull) {
        targetSquad = secondarySquad;
        game.message(`Placing ${merc.combatantName} in secondary squad at ${targetSector.sectorName}`);
      } else if (!primarySquad.isFull) {
        targetSquad = primarySquad;
        game.message(`Both squads occupied - adding to primary squad`);
      } else if (!secondarySquad.isFull) {
        targetSquad = secondarySquad;
        game.message(`Primary full - adding to secondary squad`);
      } else {
        merc.putInto(game.mercDiscard);
        clearGlobalCachedValue(game, DRAWN_MERC_KEY);
        game.message('Stalin: All squads full, cannot hire');
        return { success: false, message: 'All squads full' };
      }

      merc.putInto(targetSquad);
      targetSquad.sectorId = targetSector.sectorId;
      game.message(`Stalin deployed ${merc.combatantName} to ${targetSector.sectorName}`);

      emitMapCombatantEntries(game, [
        buildMapCombatantEntry(merc, targetSector.sectorId),
      ]);

      game.updateAllSargeBonuses();

      const equipType = args.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
      equipNewHire(game, merc, equipType);

      clearGlobalCachedValue(game, DRAWN_MERC_KEY);

      game.message(`Stalin hired ${merc.combatantName} to primary squad`);

      // Second hire: auto-placed when base is revealed
      if (game.dictatorPlayer.baseRevealed && !secondarySquad.isFull) {
        const merc2 = game.drawMerc();
        if (merc2) {
          merc2.putInto(secondarySquad);
          const autoSector = selectNewMercLocation(game);
          if (autoSector) secondarySquad.sectorId = autoSector.sectorId;

          let autoEquipType: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
          if (merc2.weaponSlot) autoEquipType = merc2.armorSlot ? 'Accessory' : 'Armor';
          equipNewHire(game, merc2, autoEquipType);

          emitMapCombatantEntries(game, [
            buildMapCombatantEntry(merc2, secondarySquad.sectorId ?? ''),
          ]);

          game.updateAllSargeBonuses();
          game.message(`Stalin hired ${merc2.combatantName} to secondary squad`);
        }
      } else if (game.dictatorPlayer.baseRevealed && secondarySquad.isFull) {
        game.message('Stalin: Secondary squad full, skipping second hire');
      }

      return { success: true, message: 'Stalin hire complete' };
    });
}

// =============================================================================
// Hussein's Per-Turn Bonus Tactics Action (Human Players)
// =============================================================================

/**
 * Hussein's ability: "Draw and play a second tactics card at the end of each turn."
 * Human players choose which card to play (from hand), with full base reveal support.
 * This is intentionally a near-copy of playTactics with a distinct action name
 * for clear UX prompting ("Hussein's Ability").
 */
export function createHusseinBonusTacticsAction(game: MERCGame): ActionDefinition {
  return Action.create('husseinBonusTactics')
    .prompt("Hussein's Ability: Play a second tactics card")
    .condition({
      'is dictator player': (ctx) => game.isDictatorPlayer(ctx.player),
      'is Hussein': () => game.dictatorPlayer?.dictator?.combatantId === 'hussein',
      'is human player': () => !game.dictatorPlayer?.isAI,
      'has tactics cards in hand': () => (game.dictatorPlayer?.tacticsHand?.count(TacticsCard) ?? 0) > 0,
    })
    .chooseElement<TacticsCard>('card', {
      prompt: 'Select a tactics card to play',
      elementClass: TacticsCard,
      display: (card: TacticsCard) => card.tacticsName,
      filter: (element) => {
        const card = asTacticsCard(element);
        const handCards = game.dictatorPlayer?.tacticsHand?.all(TacticsCard) ?? [];
        return handCards.some(c => c.id === card.id);
      },
    })
    .chooseFrom<string>('baseLocation', {
      prompt: 'Choose the location for your base',
      dependsOn: 'card',
      choices: (ctx: ActionContext) => {
        if (game.dictatorPlayer?.baseRevealed) {
          return ['(skipped)'];
        }
        const card = ctx.args?.card as TacticsCard | undefined;
        if (!card || !card.revealsBase) {
          return ['(skipped)'];
        }
        const industries = game.gameMap.getAllSectors()
          .filter(s => s.sectorType === 'Industry' && s.dictatorMilitia > 0);
        if (industries.length === 0) {
          return game.gameMap.getAllSectors()
            .filter(s => s.sectorType === 'Industry')
            .map(s => s.sectorName);
        }
        return industries.map(s => s.sectorName);
      },
    })
    .chooseFrom<string>('dictatorEquipment', {
      prompt: 'Choose starting equipment for the Dictator',
      dependsOn: 'baseLocation',
      choices: (ctx: ActionContext) => {
        if (game.dictatorPlayer?.baseRevealed) return ['(skipped)'];
        const card = ctx.args?.card as TacticsCard | undefined;
        if (!card || !card.revealsBase) return ['(skipped)'];
        return ['Weapon', 'Armor', 'Accessory'];
      },
    })
    .execute((args) => {
      const card = asTacticsCard(args.card);
      game.message(`Hussein plays bonus tactics: ${card.tacticsName}`);

      // Move card to discard
      card.putInto(game.dictatorPlayer.tacticsDiscard!);

      // For human players playing base-reveal cards, set base location first
      if (!game.dictatorPlayer?.isAI &&
          card.revealsBase &&
          !game.dictatorPlayer?.baseRevealed &&
          args.baseLocation) {
        const baseName = args.baseLocation as string;
        const baseSector = game.gameMap.getAllSectors().find(s => s.sectorName === baseName);
        if (baseSector) {
          game.dictatorPlayer.baseSectorId = baseSector.sectorId;
          if (game.dictatorPlayer.dictator) {
            game.dictatorPlayer.dictator.baseSectorId = baseSector.sectorId;
          }
          game.message(`Dictator established base at ${baseSector.sectorName}`);
        }
      }

      // Execute the card's effect
      const result = executeTacticsEffect(game, card);

      // For human players playing base-reveal cards, equip the dictator
      if (!game.dictatorPlayer?.isAI &&
          card.revealsBase &&
          game.dictatorPlayer?.dictator?.inPlay &&
          args.dictatorEquipment) {
        const equipType = args.dictatorEquipment as 'Weapon' | 'Armor' | 'Accessory';
        const equipment = game.drawEquipment(equipType);
        if (equipment && game.dictatorPlayer.dictator) {
          const { displacedBandolierItems } = game.dictatorPlayer.dictator.equip(equipment);
          for (const item of displacedBandolierItems) {
            const discard = game.getEquipmentDiscard(item.equipmentType);
            if (discard) item.putInto(discard);
          }
          game.message(`${game.dictatorPlayer.dictator.combatantName} equipped ${equipment.equipmentName}`);
        }
      }

      return {
        success: result.success,
        message: `Hussein bonus tactics: ${card.tacticsName}: ${result.message}`,
        data: result.data,
      };
    });
}

/**
 * Hussein's bonus reinforce: Discard a tactics card from hand to reinforce instead of playing.
 * Identical to reinforce but with Hussein/human checks and distinct action name.
 */
export function createHusseinBonusReinforceAction(game: MERCGame): ActionDefinition {
  return Action.create('husseinBonusReinforce')
    .prompt("Hussein's Ability: Reinforce instead of playing tactics")
    .condition({
      'is dictator player': (ctx) => game.isDictatorPlayer(ctx.player),
      'is Hussein': () => game.dictatorPlayer?.dictator?.combatantId === 'hussein',
      'is human player': () => !game.dictatorPlayer?.isAI,
      'has tactics cards in hand': () => (game.dictatorPlayer?.tacticsHand?.count(TacticsCard) ?? 0) > 0,
    })
    .chooseElement<TacticsCard>('card', {
      prompt: 'Discard a tactics card to reinforce',
      elementClass: TacticsCard,
      display: (card: TacticsCard) => card.tacticsName,
      filter: (element) => {
        const card = asTacticsCard(element);
        const handCards = game.dictatorPlayer?.tacticsHand?.all(TacticsCard) ?? [];
        return handCards.some(c => c.id === card.id);
      },
    })
    .chooseElement<Sector>('sector', {
      prompt: 'Place reinforcement militia where?',
      elementClass: Sector,
      filter: (element) => {
        const sector = asSector(element);
        const isControlled = sector.dictatorMilitia >= sector.getTotalRebelMilitia() &&
          sector.dictatorMilitia > 0;
        const isBase = game.dictatorPlayer.baseSectorId === sector.sectorId;
        return isControlled || isBase;
      },
      boardRef: (element: Sector) => ({ id: asSector(element).id }),
    })
    .execute((args) => {
      const card = asTacticsCard(args.card);
      const sector = asSector(args.sector);

      // Calculate reinforcement amount
      const reinforcements = game.getReinforcementAmount();

      // Discard the card
      card.putInto(game.dictatorPlayer.tacticsDiscard!);

      // Place militia
      const placed = sector.addDictatorMilitia(reinforcements);

      game.message(`Hussein discards ${card.tacticsName} to reinforce`);
      game.message(`Placed ${placed} militia at ${sector.sectorName}`);

      // Check if any rebel has units at this sector and trigger combat
      for (const rebel of game.rebelPlayers) {
        const hasSquad = rebel.primarySquad.sectorId === sector.sectorId ||
          rebel.secondarySquad.sectorId === sector.sectorId;
        const hasMilitia = sector.getRebelMilitia(`${rebel.seat}`) > 0;

        if (hasSquad || hasMilitia) {
          game.message(`Rebels detected at ${sector.sectorName} - combat begins!`);
          queuePendingCombat(game, sector, rebel, false);
          return {
            success: true,
            message: `Reinforced with ${placed} militia and engaged in combat`,
            data: {
              combatTriggered: true,
              combatQueued: true,
            },
          };
        }
      }

      return { success: true, message: `Reinforced with ${placed} militia` };
    });
}
