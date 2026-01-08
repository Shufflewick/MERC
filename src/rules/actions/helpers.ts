/**
 * Action Helper Functions
 *
 * Shared utilities used across all action modules.
 */

import type { MERCGame, RebelPlayer, DictatorPlayer, MERCPlayer } from '../game.js';
import { MercCard, Sector, Equipment, TacticsCard, Squad, DictatorCard } from '../elements.js';

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
// Settings Cache Helpers
// =============================================================================

/**
 * Get a cached value from game.settings using prefix:playerId key pattern.
 * Returns undefined if not found.
 */
export function getCachedValue<T>(game: MERCGame, prefix: string, playerId: string): T | undefined {
  const key = `${prefix}:${playerId}`;
  return game.settings[key] as T | undefined;
}

/**
 * Set a cached value in game.settings using prefix:playerId key pattern.
 */
export function setCachedValue<T>(game: MERCGame, prefix: string, playerId: string, value: T): void {
  const key = `${prefix}:${playerId}`;
  game.settings[key] = value;
}

/**
 * Clear a cached value from game.settings using prefix:playerId key pattern.
 */
export function clearCachedValue(game: MERCGame, prefix: string, playerId: string): void {
  const key = `${prefix}:${playerId}`;
  delete game.settings[key];
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
// Unit Type Helpers
// =============================================================================

/**
 * Check if a unit is a DictatorCard (type guard).
 */
export function isDictatorCard(unit: unknown): unit is DictatorCard {
  return unit instanceof DictatorCard;
}

/**
 * Get the display name from a MercCard or DictatorCard.
 * Works with any unit type that has mercName or dictatorName.
 */
export function getUnitName(unit: MercCard | DictatorCard): string {
  if (unit instanceof DictatorCard) {
    return unit.dictatorName;
  }
  return unit.mercName;
}

// =============================================================================
// Type Assertion Helpers
// =============================================================================

/**
 * Check if a player is a RebelPlayer (type guard).
 * Uses constructor name check to avoid circular dependency issues.
 */
export function isRebelPlayer(player: unknown): player is RebelPlayer {
  if (!player) return false;
  // Check constructor name to avoid circular dependency with game.js
  return (player as { constructor?: { name?: string } }).constructor?.name === 'RebelPlayer';
}

/**
 * Assert that a player is a RebelPlayer.
 * Throws if not a rebel (e.g., if it's a DictatorPlayer).
 */
export function asRebelPlayer(player: unknown): RebelPlayer {
  if (isRebelPlayer(player)) {
    return player;
  }
  const playerType = (player as { constructor?: { name?: string } })?.constructor?.name || 'unknown';
  throw new Error(`Expected RebelPlayer but got ${playerType}`);
}

/**
 * Assert that a player is a RebelPlayer, returning null if undefined or not a rebel.
 */
export function asRebelPlayerOrNull(player: unknown): RebelPlayer | null {
  if (!player) return null;
  if (isRebelPlayer(player)) {
    return player;
  }
  return null;
}

/**
 * Assert that an element is a MercCard.
 * Throws if not a MercCard.
 */
export function asMercCard(element: unknown): MercCard {
  if (element instanceof MercCard) {
    return element;
  }
  const elementType = element?.constructor?.name || typeof element;
  throw new Error(`Expected MercCard but got ${elementType}`);
}

/**
 * Assert that an element is a Sector.
 * Throws if not a Sector.
 */
export function asSector(element: unknown): Sector {
  if (element instanceof Sector) {
    return element;
  }
  const elementType = element?.constructor?.name || typeof element;
  throw new Error(`Expected Sector but got ${elementType}`);
}

/**
 * Assert that an element is a Squad.
 * Throws if not a Squad.
 */
export function asSquad(element: unknown): Squad {
  if (element instanceof Squad) {
    return element;
  }
  const elementType = element?.constructor?.name || typeof element;
  throw new Error(`Expected Squad but got ${elementType}`);
}

/**
 * Assert that an element is a TacticsCard.
 * Throws if not a TacticsCard.
 */
export function asTacticsCard(element: unknown): TacticsCard {
  if (element instanceof TacticsCard) {
    return element;
  }
  const elementType = element?.constructor?.name || typeof element;
  throw new Error(`Expected TacticsCard but got ${elementType}`);
}

/**
 * Assert that an element is Equipment.
 * Throws if not Equipment.
 */
export function asEquipment(element: unknown): Equipment {
  if (element instanceof Equipment) {
    return element;
  }
  const elementType = element?.constructor?.name || typeof element;
  throw new Error(`Expected Equipment but got ${elementType}`);
}

/**
 * Get a typed argument from an args record.
 * Returns undefined if the key is missing.
 * Note: This does NOT validate the type at runtime - caller is responsible
 * for ensuring the value is the expected type.
 */
export function getTypedArg<T>(args: Record<string, unknown>, key: string): T | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  return value as T;
}

// =============================================================================
// Type exports for convenience
// =============================================================================

export type { MERCGame, RebelPlayer, DictatorPlayer, MERCPlayer } from '../game.js';
export type { MercCard, Sector, Equipment, Squad, DictatorCard, TacticsCard } from '../elements.js';
