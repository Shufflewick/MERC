/**
 * Dictator Actions
 *
 * All actions available to the dictator player: tactics, militia movement, and MERC actions.
 */

import { Action, type ActionDefinition } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer } from '../game.js';
import { MercCard, DictatorCard, Sector, Equipment, TacticsCard } from '../elements.js';
import { executeCombat } from '../combat.js';
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
import { ACTION_COSTS, capitalize } from './helpers.js';
import { isHealingItem, getHealAmount, hasRangedAttack, getHealingEffect } from '../equipment-effects.js';

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

// Note: move, explore, train, reEquip, dropEquipment actions now unified with rebel actions

function canDictatorUnitFireMortar(unit: DictatorUnit, game: MERCGame): boolean {
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
      display: (card) => card.tacticsName,
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
      display: (card) => card.tacticsName,
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
