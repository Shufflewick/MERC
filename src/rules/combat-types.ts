/**
 * MERC Combat System - Type Definitions
 *
 * Extracted from combat.ts for better code organization.
 * Contains interfaces used throughout the combat system.
 */

import { Sector, CombatantModel } from './elements.js';

// =============================================================================
// Combat Types
// =============================================================================

export interface Combatant {
  id: string;
  name: string;
  initiative: number;
  combat: number;
  health: number;
  maxHealth: number;
  armor: number;
  targets: number;
  isDictatorSide: boolean;
  isMilitia: boolean;
  isDictator: boolean;
  isAttackDog: boolean; // MERC-l09: Attack Dogs
  sourceElement: CombatantModel | null;
  ownerId?: string; // For rebel militia
  armorPiercing: boolean; // MERC-38e: Weapon ignores armor
  hasAttackDog: boolean; // MERC-l09: Has Attack Dog equipped
  attackDogAssignedTo?: string; // MERC-l09: ID of MERC this dog is assigned to
  isImmuneToAttackDogs: boolean; // MERC-l09: Shadkaam ability
  willNotHarmDogs: boolean; // MERC-l09: Tao ability
  hasUsedReroll?: boolean; // MERC-5l3: Basic's once-per-combat reroll
  image?: string; // Portrait image path from JSON data
  combatantId?: string; // Combatant ID for identification
  playerColor?: string; // Player color for UI display
}

export interface CombatResult {
  attacker: Combatant;
  rolls: number[];
  hits: number;
  targets: Combatant[];
  damageDealt: Map<string, number>;
}

export interface CombatRound {
  roundNumber: number;
  results: CombatResult[];
  casualties: Combatant[];
}

export interface CombatOutcome {
  rounds: CombatRound[];
  rebelVictory: boolean;
  dictatorVictory: boolean;
  rebelCasualties: Combatant[];
  dictatorCasualties: Combatant[];
  retreated: boolean;
  retreatSector?: Sector;
  // MERC-n1f: Interactive combat support
  combatPending: boolean; // True if combat paused for retreat decision
  canRetreat: boolean; // True if retreat is available
}
