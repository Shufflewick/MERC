/**
 * Action Helper Functions
 *
 * Shared utilities used across all action modules.
 */

import type { MERCGame, RebelPlayer } from '../game.js';
import { MercCard } from '../elements.js';

// =============================================================================
// Action Cost Constants
// =============================================================================

export const ACTION_COSTS = {
  MOVE: 1,
  EXPLORE: 1,
  TRAIN: 1,
  HOSPITAL: 1,
  ARMS_DEALER: 1,
  HIRE_MERC: 2, // Per rules: "Hire MERCs (2 actions)"
  RE_EQUIP: 1, // Per rules: "Re-Equip (1 action)"
  SPLIT_SQUAD: 0, // Free action
  MERGE_SQUADS: 0, // Free action
} as const;

// =============================================================================
// String Helpers
// =============================================================================

/**
 * Capitalize first letter of a string
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// =============================================================================
// MERC Compatibility
// =============================================================================

/**
 * MERC hiring incompatibilities
 * MERC-s37: Borris won't work with Squirrel
 * MERC-related: Natasha won't work with Moose, Moose won't work with Borris, Squirrel won't work with Natasha
 */
export const MERC_INCOMPATIBILITIES: Record<string, string[]> = {
  borris: ['squirrel'],
  squirrel: ['borris', 'natasha'],
  natasha: ['moose'],
  moose: ['borris'],
};

/**
 * Check if a MERC can be hired given the current team composition.
 * Checks both directions: the new MERC's incompatibilities AND
 * whether any team member has an incompatibility with the new MERC.
 */
export function canHireMercWithTeam(mercId: string, team: MercCard[]): boolean {
  // Check if new MERC is incompatible with anyone on team
  const newMercIncompat = MERC_INCOMPATIBILITIES[mercId] || [];
  if (team.some(m => newMercIncompat.includes(m.mercId))) {
    return false;
  }

  // Check if anyone on team is incompatible with the new MERC
  for (const member of team) {
    const memberIncompat = MERC_INCOMPATIBILITIES[member.mercId] || [];
    if (memberIncompat.includes(mercId)) {
      return false;
    }
  }

  return true;
}

// =============================================================================
// Action Point Helpers
// =============================================================================

/**
 * Check if player has a MERC with enough actions remaining
 */
export function hasActionsRemaining(player: RebelPlayer, cost: number): boolean {
  return player.team.some(merc => merc.actionsRemaining >= cost);
}

/**
 * Get MERCs that have enough actions remaining
 */
export function getMercsWithActions(player: RebelPlayer, cost: number): MercCard[] {
  return player.team.filter(merc => merc.actionsRemaining >= cost);
}

/**
 * Check if a MERC is in a player's team (uses ID comparison to avoid object reference issues)
 */
export function isInPlayerTeam(merc: MercCard, player: RebelPlayer): boolean {
  return player.team.some(m => m.id === merc.id);
}

/**
 * Use an action from a MERC
 */
export function useAction(merc: MercCard, cost: number): boolean {
  return merc.useAction(cost);
}

/**
 * MERC-bd4: Check if a MERC can perform a training action
 * Faustina can use her trainingActionsRemaining in addition to regular actions
 */
export function canTrainWith(merc: MercCard, cost: number): boolean {
  // Regular actions work for anyone
  if (merc.actionsRemaining >= cost) return true;
  // Faustina can also use her training-only action
  if (merc.mercId === 'faustina' && merc.trainingActionsRemaining >= cost) return true;
  return false;
}

/**
 * MERC-bd4: Use a training action from a MERC
 * Faustina uses her trainingActionsRemaining first before regular actions
 */
export function useTrainingAction(merc: MercCard, cost: number): boolean {
  // Faustina uses her training-only action first
  if (merc.mercId === 'faustina' && merc.trainingActionsRemaining >= cost) {
    merc.trainingActionsRemaining -= cost;
    return true;
  }
  // Otherwise use regular actions
  return merc.useAction(cost);
}

// =============================================================================
// Dictator Combatant Helpers
// =============================================================================

/**
 * Get all dictator combatants that can take actions (MERCs + dictator card if in play)
 * Returns items with a common interface: id, actionsRemaining, isDead, sectorId
 */
export function getDictatorCombatantsWithActions(game: MERCGame, cost: number): Array<MercCard | { id: number; mercId: string; mercName: string; actionsRemaining: number; isDead: boolean; sectorId: string; isDictatorCard: true }> {
  const combatants: Array<MercCard | { id: number; mercId: string; mercName: string; actionsRemaining: number; isDead: boolean; sectorId: string; isDictatorCard: true }> = [];

  // Add hired MERCs with enough actions
  const hiredMercs = game.dictatorPlayer?.hiredMercs || [];
  combatants.push(...hiredMercs.filter(m => !m.isDead && m.actionsRemaining >= cost));

  // Add dictator card if in play with enough actions
  const dictatorCard = game.dictatorPlayer?.dictator;
  if (dictatorCard?.inPlay && !dictatorCard.isDead && dictatorCard.actionsRemaining >= cost) {
    combatants.push({
      id: dictatorCard.id,
      mercId: `dictator-${dictatorCard.dictatorId}`,
      mercName: dictatorCard.dictatorName,
      actionsRemaining: dictatorCard.actionsRemaining,
      isDead: dictatorCard.isDead,
      sectorId: dictatorCard.sectorId,
      isDictatorCard: true,
    });
  }

  return combatants;
}

/**
 * Check if dictator player has any combatant with enough actions
 */
export function dictatorHasActionsRemaining(game: MERCGame, cost: number): boolean {
  return getDictatorCombatantsWithActions(game, cost).length > 0;
}

// =============================================================================
// Type exports for convenience
// =============================================================================

export type { MERCGame, RebelPlayer } from '../game.js';
export type { MercCard, Sector, Equipment, Squad, DictatorCard, TacticsCard } from '../elements.js';
