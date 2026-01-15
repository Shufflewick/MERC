/**
 * Dictator Actions
 *
 * All actions available to the dictator player: tactics, militia movement, and MERC actions.
 */

import { Action, type ActionDefinition } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer } from '../game.js';
import { MercCard, DictatorCard, Sector, Equipment, TacticsCard, CombatantModel } from '../elements.js';
import { executeCombat, hasEnemies } from '../combat.js';
import { executeTacticsEffect } from '../tactics-effects.js';
import {
  hasMortar,
  getMortarTargets,
  selectMortarTarget,
  selectMilitiaPlacementSector,
  mercNeedsHealing,
  getAIHealingPriority,
} from '../ai-helpers.js';
import { getNextAIAction } from '../ai-executor.js';
import { ACTION_COSTS, capitalize, asTacticsCard, asSector, asMercCard, getGlobalCachedValue, setGlobalCachedValue, clearGlobalCachedValue, isMercCard, equipNewHire } from './helpers.js';
import { isHealingItem, getHealAmount, hasRangedAttack, getHealingEffect } from '../equipment-effects.js';

// =============================================================================
// Dictator Unit Type and Helpers
// =============================================================================

// MERC-07j: Type for units that can perform dictator actions (hired MERCs or dictator card)
// Using CombatantModel as it represents both MercCard and DictatorCard

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
function hasHealingItemEquipped(merc: MercCard): boolean {
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
      display: (card) => card.tacticsName,
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
      // MERC-pj8: Explicit AI auto-select for top deck card
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        return game.dictatorPlayer?.tacticsDeck?.first(TacticsCard) ?? undefined;
      },
    })
    // Human players choose base location when playing a base-reveal card
    .chooseFrom<string>('baseLocation', {
      prompt: 'Choose the location for your base',
      dependsOn: 'card', // This step depends on the card selection
      skipIf: (ctx) => {
        // Skip if AI, base already revealed, or card doesn't reveal base
        if (game.dictatorPlayer?.isAI) return true;
        if (game.dictatorPlayer?.baseRevealed) return true;
        const card = ctx.args?.card as TacticsCard | undefined;
        // Skip if no card selected or card doesn't reveal base
        if (!card || !card.revealsBase) return true;
        return false;
      },
      choices: (ctx) => {
        // If base is already revealed, return placeholder (selection will be skipped)
        // This ensures the action is available even when this selection isn't needed
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
      dependsOn: 'baseLocation', // This step depends on baseLocation (which depends on card)
      skipIf: (ctx) => {
        // Skip if AI, base already revealed, or card doesn't reveal base
        if (game.dictatorPlayer?.isAI) return true;
        if (game.dictatorPlayer?.baseRevealed) return true;
        const card = ctx.args?.card as TacticsCard | undefined;
        if (!card || !card.revealsBase) return true;
        return false;
      },
      choices: (ctx) => {
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
      card.putInto(game.dictatorPlayer.tacticsDiscard);

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
          game.dictatorPlayer.dictator.equip(equipment);
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
      display: (card) => card.tacticsName,
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
        const sector = asSector(element);
        // Per rules: "Sector must be Dictator-controlled"
        // Dictator controls if militia >= total rebel militia (ties go to dictator)
        const isControlled = sector.dictatorMilitia >= sector.getTotalRebelMilitia() &&
          sector.dictatorMilitia > 0;
        // Also allow base sector even if no militia yet
        const isBase = game.dictatorPlayer.baseSectorId === sector.sectorId;
        return isControlled || isBase;
      },
      boardRef: (element) => ({ id: asSector(element).id }),
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
      const card = asTacticsCard(args.card);
      const sector = asSector(args.sector);

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
          // Dictator initiated combat, so only dictator side gets target selection
          const outcome = executeCombat(game, sector, rebel, { attackingPlayerIsRebel: false });
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
      defer: true, // Draw MERCs when action starts
      choices: () => {
        // Draw 3 MERCs if not already drawn
        if (!getGlobalCachedValue<number[]>(game, DRAWN_MERCS_KEY)) {
          const drawnMercs: MercCard[] = [];
          for (let i = 0; i < 3; i++) {
            const merc = game.drawMerc();
            if (merc) drawnMercs.push(merc);
          }
          // Store merc IDs
          setGlobalCachedValue(game, DRAWN_MERCS_KEY, drawnMercs.map(m => m.id));
        }

        const mercIds = getGlobalCachedValue<number[]>(game, DRAWN_MERCS_KEY) ?? [];
        const mercs = mercIds
          .map(id => game.getElementById(id))
          .filter((el): el is MercCard => isMercCard(el))
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
        // Get dictator-controlled sectors
        const sectors = game.gameMap.getAllSectors()
          .filter(s => s.dictatorMilitia > 0 || game.getDictatorMercsInSector(s).length > 0);

        if (sectors.length === 0) {
          // Fallback to any industry
          const industries = game.gameMap.getAllSectors()
            .filter(s => s.sectorType === 'Industry');
          return industries.map(s => s.sectorName);
        }

        return sectors.map(s => `${s.sectorName} (${s.dictatorMilitia} militia)`);
      },
    })
    .execute((args, ctx) => {
      const mercIds = getGlobalCachedValue<number[]>(game, DRAWN_MERCS_KEY) ?? [];
      const selectedMercName = args.selectedMerc as string;

      if (!selectedMercName || selectedMercName === 'No MERCs available') {
        clearGlobalCachedValue(game, DRAWN_MERCS_KEY);
        return { success: false, message: 'No MERC selected' };
      }

      // Find the MERC by name
      const mercs = mercIds
        .map(id => game.getElementById(id))
        .filter((el): el is MercCard => isMercCard(el));
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
      if (primaryMercs.length === 0 || primarySquad.sectorId === targetSector.sectorId) {
        // Primary squad is empty or already at target - use primary
        targetSquad = primarySquad;
        game.message(`Placing ${selectedMerc.combatantName} in primary squad at ${targetSector.sectorName}`);
      } else if (secondaryMercs.length === 0 || secondarySquad.sectorId === targetSector.sectorId) {
        // Secondary squad is empty or already at target - use secondary
        targetSquad = secondarySquad;
        game.message(`Placing ${selectedMerc.combatantName} in secondary squad at ${targetSector.sectorName}`);
      } else {
        // Both squads occupied elsewhere - default to primary (this is an edge case)
        targetSquad = primarySquad;
        game.message(`Both squads occupied - adding to primary squad`);
      }

      // Put MERC into chosen squad - merc inherits sectorId from squad
      selectedMerc.putInto(targetSquad);
      targetSquad.sectorId = targetSector.sectorId;
      game.message(`Castro deployed ${selectedMerc.combatantName} to ${targetSector.sectorName}`);

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
      prompt: (ctx) => {
        // Count rebel-controlled sectors
        let rebelSectorCount = 0;
        for (const rebel of game.rebelPlayers) {
          rebelSectorCount += game.getControlledSectors(rebel).length;
        }
        return `Place ${rebelSectorCount} militia (rebels control ${rebelSectorCount} sectors)`;
      },
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
        const hasMilitia = targetSector.getRebelMilitia(`${rebel.position}`) > 0;

        if (hasSquad || hasMilitia) {
          game.message(`Rebels detected at ${targetSector.sectorName} - combat begins!`);
          // Dictator initiated combat, so only dictator side gets target selection
          const outcome = executeCombat(game, targetSector, rebel, { attackingPlayerIsRebel: false });
          return {
            success: true,
            message: `Placed ${placed} militia and engaged in combat`,
            data: {
              combatTriggered: true,
              rebelVictory: outcome.rebelVictory,
              dictatorVictory: outcome.dictatorVictory,
            },
          };
        }
      }

      return { success: true, message: `Placed ${placed} militia` };
    });
}

