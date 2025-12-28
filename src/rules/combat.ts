/**
 * MERC Combat System
 *
 * Based on: data/rules/01-game-elements-and-components.md
 *
 * Combat follows these steps:
 * 1. Determine combatants (MERCs + militia on each side)
 * 2. Sort by initiative (highest first, Dictator wins ties)
 * 3. Each unit attacks in initiative order
 * 4. Roll dice equal to Combat stat, 4+ is a hit
 * 5. Assign hits to targets (up to Targets attribute)
 * 6. Apply damage (armor absorbs first, then health)
 * 7. Remove dead units
 * 8. Check for retreat opportunities
 */

import type { MERCGame, RebelPlayer, DictatorPlayer } from './game.js';
import { MercCard, Sector, DictatorCard, Militia } from './elements.js';
import { CombatConstants, TieBreakers } from './constants.js';
import {
  sortTargetsByAIPriority,
  detonateLandMines,
  shouldUseEpinephrine,
  hasEpinephrineShot,
} from './ai-helpers.js';
import {
  getMercAbility,
  getHitThreshold,
  canRerollOnce,
  canSacrificeDieToHeal,
  alwaysGoesFirst,
  alwaysBeforesMilitia,
  rollsForInitiative,
  isTargetedLast,
  ignoresInitiativePenalties,
  prioritizesMercs,
  eachHitNewMilitiaTarget,
  canRetargetSixes,
  canPreemptiveStrike,
  firesSecondShot,
  canConvertMilitia,
  isImmuneToAttackDogs as checkImmuneToAttackDogs,
  willNotHarmDogs as checkWillNotHarmDogs,
  requiresAccessory,
  getEnemyCombatDebuff,
  getEnemyInitiativeDebuff,
  FEMALE_MERCS,
} from './merc-abilities.js';
import {
  isHandgun as checkIsHandgun,
  isUzi as checkIsUzi,
  isExplosive as checkIsExplosive,
  isSword as checkIsSword,
  isSmaw as checkIsSmaw,
  isAttackDog as checkIsAttackDog,
  discardAfterAttack as checkDiscardAfterAttack,
} from './equipment-effects.js';

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
  sourceElement: MercCard | DictatorCard | null;
  ownerId?: string; // For rebel militia
  armorPiercing: boolean; // MERC-38e: Weapon ignores armor
  hasAttackDog: boolean; // MERC-l09: Has Attack Dog equipped
  attackDogAssignedTo?: string; // MERC-l09: ID of MERC this dog is assigned to
  isImmuneToAttackDogs: boolean; // MERC-l09: Shadkaam ability
  willNotHarmDogs: boolean; // MERC-l09: Tao ability
  hasUsedReroll?: boolean; // MERC-5l3: Basic's once-per-combat reroll
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

// =============================================================================
// Combat Helpers
// =============================================================================

/**
 * Roll a single d6
 */
function rollDie(): number {
  return Math.floor(Math.random() * CombatConstants.DICE_SIDES) + 1;
}

/**
 * Roll multiple dice
 */
function rollDice(count: number): number[] {
  return Array.from({ length: count }, () => rollDie());
}

/**
 * Count hits from dice rolls (4+ is a hit)
 */
function countHits(rolls: number[]): number {
  return rolls.filter(r => r >= CombatConstants.HIT_THRESHOLD).length;
}

/**
 * Get mercId from a combatant (undefined if not a MERC)
 */
function getCombatantMercId(combatant: Combatant): string | undefined {
  return combatant.sourceElement instanceof MercCard
    ? combatant.sourceElement.mercId
    : undefined;
}

/**
 * Get effective combat dice for an attacker, accounting for healing dice used.
 * When a MERC uses Medical Kit/First Aid Kit, they discard dice from their attack.
 */
function getEffectiveCombatDice(attacker: Combatant, game: MERCGame): number {
  const baseDice = attacker.combat;
  const diceUsedForHealing = game.activeCombat?.healingDiceUsed?.get(attacker.id) ?? 0;
  return Math.max(0, baseDice - diceUsedForHealing);
}

/**
 * Check if combatant has a specific mercId
 */
function isMerc(combatant: Combatant, mercId: string): boolean {
  return getCombatantMercId(combatant) === mercId;
}

/**
 * MERC-dac: Check if a combatant is Badger
 * @deprecated Use alwaysBeforesMilitia(getCombatantMercId(c)) from registry
 */
function isBadger(combatant: Combatant): boolean {
  return isMerc(combatant, 'badger');
}

/**
 * MERC-nvr: Check if a combatant is Kastern
 * @deprecated Use alwaysGoesFirst(getCombatantMercId(c)) from registry
 */
function isKastern(combatant: Combatant): boolean {
  return isMerc(combatant, 'kastern');
}

/**
 * MERC-cpb: Check if a combatant is Lucid
 */
function isLucid(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'lucid';
  }
  return false;
}

/**
 * MERC-5l3: Check if a combatant is Basic
 */
function isBasic(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'basic';
  }
  return false;
}

/**
 * Count hits from dice rolls
 * Uses registry to get hit threshold (e.g., Lucid hits on 3+)
 */
function countHitsForCombatant(rolls: number[], combatant: Combatant): number {
  const mercId = combatant.sourceElement instanceof MercCard
    ? combatant.sourceElement.mercId
    : undefined;
  const threshold = mercId ? getHitThreshold(mercId) : CombatConstants.HIT_THRESHOLD;
  return rolls.filter(r => r >= threshold).length;
}

/**
 * MERC-5l3: Check if combatant should use reroll
 * Uses registry to check if MERC can reroll (Basic)
 * AI decision: reroll if hits are below expected value (50% hit rate)
 */
function shouldUseReroll(combatant: Combatant, rolls: number[], hits: number): boolean {
  if (combatant.hasUsedReroll) return false;

  const mercId = combatant.sourceElement instanceof MercCard
    ? combatant.sourceElement.mercId
    : undefined;
  if (!mercId || !canRerollOnce(mercId)) return false;

  // Expected hits at 50% hit rate
  const expectedHits = rolls.length * 0.5;
  // Reroll if significantly below expected (fewer than expected - 1)
  return hits < expectedHits - 0.5;
}

/**
 * Apply enemy debuffs from registry (e.g., Max's -1 to all skills to enemy MERCs)
 * Uses registry to check for enemyDebuff abilities
 */
function applyEnemyDebuffs(enemies: Combatant[], allies: Combatant[]): void {
  // Check each ally for debuff abilities
  for (const ally of allies) {
    if (ally.health <= 0) continue;
    if (!(ally.sourceElement instanceof MercCard)) continue;

    const combatDebuff = getEnemyCombatDebuff(ally.sourceElement.mercId);
    const initiativeDebuff = getEnemyInitiativeDebuff(ally.sourceElement.mercId);
    if (combatDebuff === 0 && initiativeDebuff === 0) continue;

    // Apply debuffs to enemy MERCs (not militia, dictator, or dogs)
    for (const enemy of enemies) {
      if (!enemy.isMilitia && !enemy.isDictator && !enemy.isAttackDog) {
        if (combatDebuff !== 0) {
          enemy.combat = Math.max(0, enemy.combat + combatDebuff); // debuff is negative
        }
        if (initiativeDebuff !== 0) {
          enemy.initiative = Math.max(0, enemy.initiative + initiativeDebuff); // debuff is negative
        }
      }
    }
  }
}

/**
 * MERC-7te: Check if a combatant is Surgeon
 */
function isSurgeon(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'surgeon';
  }
  return false;
}

/**
 * MERC-7te: Surgeon can sacrifice a combat die to heal 1 damage to squad mate
 * Returns true if Surgeon used ability (combat reduced by 1)
 */
function applySurgeonHeal(
  game: MERCGame,
  surgeon: Combatant,
  allies: Combatant[]
): boolean {
  if (!isSurgeon(surgeon) || surgeon.combat <= 1) {
    return false;
  }

  // Find damaged squad mates (not Surgeon themselves)
  const damagedAllies = allies.filter(c =>
    c !== surgeon &&
    c.health > 0 &&
    c.health < c.maxHealth &&
    !c.isMilitia &&
    !c.isAttackDog
  );

  if (damagedAllies.length === 0) {
    return false;
  }

  // AI decision: heal the most damaged ally
  const mostDamaged = damagedAllies.sort((a, b) =>
    (b.maxHealth - b.health) - (a.maxHealth - a.health)
  )[0];

  // Sacrifice one die
  surgeon.combat--;

  // Heal the ally
  mostDamaged.health = Math.min(mostDamaged.health + 1, mostDamaged.maxHealth);

  // Also heal the source element
  if (mostDamaged.sourceElement instanceof MercCard) {
    mostDamaged.sourceElement.heal(1);
  }

  game.message(`${surgeon.name} sacrifices a die to heal ${mostDamaged.name} for 1`);
  return true;
}

/**
 * MERC-clsx: Check if a combatant is Adelheid
 */
function isAdelheid(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'adelheid';
  }
  return false;
}

/**
 * MERC-b9p4: Check if a combatant is Golem
 */
function isGolem(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'golem';
  }
  return false;
}

/**
 * MERC-16f: Check if a combatant is Bouba
 */
function isBouba(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'bouba';
  }
  return false;
}

/**
 * MERC-16f: Check if combatant has a handgun equipped
 * Uses equipment registry instead of string matching
 */
function hasHandgun(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    const weapon = combatant.sourceElement.weaponSlot;
    return weapon ? checkIsHandgun(weapon.equipmentId) : false;
  }
  return false;
}

/**
 * MERC-16f: Apply Bouba's handgun combat bonus
 */
function applyBoubaBonus(combatants: Combatant[]): void {
  for (const combatant of combatants) {
    if (isBouba(combatant) && hasHandgun(combatant) && combatant.health > 0) {
      combatant.combat += 1;
    }
  }
}

/**
 * MERC-2se: Check if a combatant is Buzzkill
 */
function isBuzzkill(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'buzzkill';
  }
  return false;
}

/**
 * MERC-ml7: Check if a combatant is Khenn
 */
function isKhenn(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'khenn';
  }
  return false;
}

/**
 * MERC-s3x: Check if a combatant is Mayhem
 */
function isMayhem(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'mayhem';
  }
  return false;
}

/**
 * MERC-s3x: Check if combatant has an Uzi equipped
 * Uses equipment registry instead of string matching
 */
function hasUzi(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    const weapon = combatant.sourceElement.weaponSlot;
    return weapon ? checkIsUzi(weapon.equipmentId) : false;
  }
  return false;
}

/**
 * MERC-82k: Check if a combatant is Meatbop
 */
function isMeatbop(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'meatbop';
  }
  return false;
}

/**
 * MERC-82k: Check if Meatbop has an accessory equipped
 */
function hasAccessory(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    const merc = combatant.sourceElement;
    // Check accessory slot or bandolier slots
    return merc.accessorySlot !== undefined || merc.bandolierSlots.length > 0;
  }
  return false;
}

/**
 * MERC-c1f: Check if a combatant is Ra
 */
function isRa(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'ra';
  }
  return false;
}

/**
 * MERC-3zd: Check if a combatant is Rozeske
 */
function isRozeske(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'rozeske';
  }
  return false;
}

/**
 * MERC-3zd: Check if combatant has armor equipped
 */
function hasArmor(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.armorSlot !== undefined;
  }
  return false;
}

/**
 * MERC-qh3: Check if a combatant is Runde
 */
function isRunde(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'runde';
  }
  return false;
}

/**
 * MERC-5yq: Check if a combatant is Sarge
 */
function isSarge(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'sarge';
  }
  return false;
}

/**
 * MERC-581: Check if a combatant is Stumpy
 */
function isStumpy(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'stumpy';
  }
  return false;
}

/**
 * MERC-581: Check if combatant has grenade or mortar equipped
 * Uses equipment registry instead of string matching
 * Note: Grenades/mortars are accessories, not weapons
 */
function hasExplosive(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    const merc = combatant.sourceElement;
    // Check accessory slot
    if (merc.accessorySlot && checkIsExplosive(merc.accessorySlot.equipmentId)) {
      return true;
    }
    // Check bandolier slots
    return merc.bandolierSlots.some(e => checkIsExplosive(e.equipmentId));
  }
  return false;
}

/**
 * MERC-kmv: Check if a combatant is Tack
 */
function isTack(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'tack';
  }
  return false;
}

/**
 * MERC-dxi: Check if a combatant is Tavisto
 */
function isTavisto(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'tavisto';
  }
  return false;
}

/**
 * MERC-qbci: Check if a combatant is Valkyrie
 */
function isValkyrie(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'valkyrie';
  }
  return false;
}

/**
 * MERC-x0jg: Check if a combatant is Vandradi
 */
function isVandradi(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'vandradi';
  }
  return false;
}

/**
 * MERC-x0jg: Check if combatant has multi-target weapon
 */
function hasMultiTargetWeapon(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    const weapon = combatant.sourceElement.weaponSlot;
    return weapon?.targets !== undefined && weapon.targets > 0;
  }
  return false;
}

/**
 * MERC-btst: Check if a combatant is Vulture
 */
function isVulture(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'vulture';
  }
  return false;
}

/**
 * MERC-djs0: Check if a combatant is Walter
 */
function isWalter(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'walter';
  }
  return false;
}

/**
 * MERC-9mpr: Check if a combatant is Wolverine
 */
function isWolverine(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'wolverine';
  }
  return false;
}

/**
 * MERC-ddq4: Check if a combatant is Dutch
 */
function isDutch(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'dutch';
  }
  return false;
}

/**
 * MERC-ddq4: Check if Dutch is using a sword (or unarmed)
 * Uses equipment registry instead of string matching
 */
function isDutchUsingFists(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    const weapon = combatant.sourceElement.weaponSlot;
    // No weapon or sword equipped
    if (!weapon) return true;
    return checkIsSword(weapon.equipmentId);
  }
  return false;
}

/**
 * MERC-adnu: Check if a combatant is Moe
 */
function isMoe(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'moe';
  }
  return false;
}

/**
 * MERC-adnu: Check if combatant has SMAW equipped
 * Uses equipment registry instead of string matching
 */
function hasSmaw(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    const weapon = combatant.sourceElement.weaponSlot;
    return weapon ? checkIsSmaw(weapon.equipmentId) : false;
  }
  return false;
}

/**
 * MERC-s3x: Apply Mayhem's Uzi combat bonus (+2)
 */
function applyMayhemBonus(combatants: Combatant[]): void {
  for (const combatant of combatants) {
    if (isMayhem(combatant) && hasUzi(combatant) && combatant.health > 0) {
      combatant.combat += 2;
    }
  }
}

/**
 * MERC-3zd: Apply Rozeske's armor combat bonus (+1)
 */
function applyRozeskeBonus(combatants: Combatant[]): void {
  for (const combatant of combatants) {
    if (isRozeske(combatant) && hasArmor(combatant) && combatant.health > 0) {
      combatant.combat += 1;
    }
  }
}

/**
 * MERC-c1f: Apply Ra's target bonus (+1 with any weapon)
 */
function applyRaBonus(combatants: Combatant[]): void {
  for (const combatant of combatants) {
    if (isRa(combatant) && combatant.health > 0) {
      // Ra gets +1 target with any weapon
      if (combatant.sourceElement instanceof MercCard && combatant.sourceElement.weaponSlot) {
        combatant.targets += 1;
      }
    }
  }
}

/**
 * MERC-ml7: Apply Khenn's random initiative
 * Khenn rolls a D6 at the beginning of combat for his initiative
 */
function applyKhennInitiative(combatants: Combatant[], game: MERCGame): void {
  for (const combatant of combatants) {
    if (isKhenn(combatant) && combatant.health > 0) {
      const roll = Math.floor(Math.random() * 6) + 1;
      combatant.initiative = roll;
      game.message(`Khenn rolls ${roll} for initiative`);
    }
  }
}

/**
 * MERC-581: Apply Stumpy's explosive combat bonus (+1)
 */
function applyStumpyBonus(combatants: Combatant[]): void {
  for (const combatant of combatants) {
    if (isStumpy(combatant) && hasExplosive(combatant) && combatant.health > 0) {
      combatant.combat += 1;
    }
  }
}

/**
 * MERC-x0jg: Apply Vandradi's multi-target weapon bonus (+1 combat)
 */
function applyVandradiBonus(combatants: Combatant[]): void {
  for (const combatant of combatants) {
    if (isVandradi(combatant) && hasMultiTargetWeapon(combatant) && combatant.health > 0) {
      combatant.combat += 1;
    }
  }
}

/**
 * MERC-5yq: Apply Sarge's highest initiative bonus
 * Sarge gets +1 to all skills when he has the highest initiative in his squad
 */
function applySargeBonus(game: MERCGame, combatants: Combatant[]): void {
  const sargeCombatants = combatants.filter(c => isSarge(c) && c.health > 0);
  if (sargeCombatants.length === 0) return;

  for (const sarge of sargeCombatants) {
    const sargeMerc = sarge.sourceElement as MercCard;

    // Find squad mates
    for (const rebel of game.rebelPlayers) {
      const primaryMercs = rebel.primarySquad.getLivingMercs();
      const secondaryMercs = rebel.secondarySquad.getLivingMercs();

      let squadMates: MercCard[] | null = null;
      if (primaryMercs.some(m => m.id === sargeMerc.id)) {
        squadMates = primaryMercs;
      } else if (secondaryMercs.some(m => m.id === sargeMerc.id)) {
        squadMates = secondaryMercs;
      }

      if (squadMates) {
        // Check if Sarge has highest initiative in squad
        const maxInitiative = Math.max(...squadMates.map(m => m.initiative));
        if (sargeMerc.initiative >= maxInitiative) {
          sarge.initiative += 1;
          sarge.combat += 1;
          // Training bonus applied separately for train action
        }
        break;
      }
    }
  }
}

/**
 * MERC-kmv: Apply Tack's initiative bonus to squad
 * When Tack has highest initiative, all squad mates get +2 initiative
 */
function applyTackBonus(game: MERCGame, combatants: Combatant[]): void {
  const tackCombatants = combatants.filter(c => isTack(c) && c.health > 0);
  if (tackCombatants.length === 0) return;

  for (const tack of tackCombatants) {
    const tackMerc = tack.sourceElement as MercCard;

    for (const rebel of game.rebelPlayers) {
      const primaryMercs = rebel.primarySquad.getLivingMercs();
      const secondaryMercs = rebel.secondarySquad.getLivingMercs();

      let squadMates: MercCard[] | null = null;
      if (primaryMercs.some(m => m.id === tackMerc.id)) {
        squadMates = primaryMercs;
      } else if (secondaryMercs.some(m => m.id === tackMerc.id)) {
        squadMates = secondaryMercs;
      }

      if (squadMates) {
        // Check if Tack has highest initiative
        const maxInitiative = Math.max(...squadMates.map(m => m.initiative));
        if (tackMerc.initiative >= maxInitiative) {
          // Apply +2 initiative to all squad mates (including Tack)
          for (const combatant of combatants) {
            if (combatant.sourceElement instanceof MercCard &&
                squadMates.some(m => m.id === combatant.sourceElement.id) &&
                combatant.health > 0) {
              combatant.initiative += 2;
            }
          }
        }
        break;
      }
    }
  }
}

/**
 * MERC-qbci: Apply Valkyrie's initiative bonus to squad mates
 * All squad mates get +1 initiative
 */
function applyValkyrieBonus(game: MERCGame, combatants: Combatant[]): void {
  const valkyrieCombatants = combatants.filter(c => isValkyrie(c) && c.health > 0);
  if (valkyrieCombatants.length === 0) return;

  for (const valkyrie of valkyrieCombatants) {
    const valkyrieMerc = valkyrie.sourceElement as MercCard;

    for (const rebel of game.rebelPlayers) {
      const primaryMercs = rebel.primarySquad.getLivingMercs();
      const secondaryMercs = rebel.secondarySquad.getLivingMercs();

      let squadMates: MercCard[] | null = null;
      if (primaryMercs.some(m => m.id === valkyrieMerc.id)) {
        squadMates = primaryMercs;
      } else if (secondaryMercs.some(m => m.id === valkyrieMerc.id)) {
        squadMates = secondaryMercs;
      }

      if (squadMates) {
        // Apply +1 initiative to all squad mates (except Valkyrie herself)
        for (const combatant of combatants) {
          if (combatant.sourceElement instanceof MercCard &&
              squadMates.some(m => m.id === combatant.sourceElement.id) &&
              combatant.sourceElement.id !== valkyrieMerc.id &&
              combatant.health > 0) {
            combatant.initiative += 1;
          }
        }
        break;
      }
    }
  }
}

/**
 * MERC-dxi: Apply Tavisto's bonus when woman is in squad
 * Tavisto gets +1 to all skills when a woman is in his squad
 */
function applyTavistoBonus(game: MERCGame, combatants: Combatant[]): void {
  const tavistoCombatants = combatants.filter(c => isTavisto(c) && c.health > 0);
  if (tavistoCombatants.length === 0) return;

  for (const tavisto of tavistoCombatants) {
    const tavistoMerc = tavisto.sourceElement as MercCard;

    for (const rebel of game.rebelPlayers) {
      const primaryMercs = rebel.primarySquad.getLivingMercs();
      const secondaryMercs = rebel.secondarySquad.getLivingMercs();

      let squadMates: MercCard[] | null = null;
      if (primaryMercs.some(m => m.id === tavistoMerc.id)) {
        squadMates = primaryMercs;
      } else if (secondaryMercs.some(m => m.id === tavistoMerc.id)) {
        squadMates = secondaryMercs;
      }

      if (squadMates) {
        // Check if any woman in squad
        const hasWoman = squadMates.some(m => {
          return FEMALE_MERCS.includes(m.mercId) && m !== tavistoMerc;
        });

        if (hasWoman) {
          tavisto.initiative += 1;
          tavisto.combat += 1;
          // Training bonus applied separately for train action
        }
        break;
      }
    }
  }
}

/**
 * MERC-btst: Apply Vulture's initiative penalty ignore
 * Vulture ignores initiative penalties from equipment
 */
function applyVultureBonus(combatants: Combatant[]): void {
  for (const combatant of combatants) {
    if (isVulture(combatant) && combatant.health > 0) {
      const merc = combatant.sourceElement as MercCard;
      // Calculate total negative initiative from equipment (use slotData as fallback)
      let penalty = 0;

      const weaponInit = merc.weaponSlot?.initiative ?? merc.weaponSlotData?.initiative ?? 0;
      if (weaponInit < 0) penalty += weaponInit;

      const armorInit = merc.armorSlot?.initiative ?? merc.armorSlotData?.initiative ?? 0;
      if (armorInit < 0) penalty += armorInit;

      const accessoryInit = merc.accessorySlot?.initiative ?? merc.accessorySlotData?.initiative ?? 0;
      if (accessoryInit < 0) penalty += accessoryInit;

      // Include bandolier slots
      for (let i = 0; i < merc.bandolierSlotsData.length; i++) {
        const bandolierInit = merc.bandolierSlots[i]?.initiative ?? merc.bandolierSlotsData[i]?.initiative ?? 0;
        if (bandolierInit < 0) penalty += bandolierInit;
      }

      // Add back the penalty (negate it)
      combatant.initiative -= penalty;
    }
  }
}

/**
 * MERC-djs0: Apply Walter's militia initiative bonus
 * Walter's militia get +2 initiative
 */
function applyWalterBonus(game: MERCGame, combatants: Combatant[]): void {
  // Find Walter in combatants
  const walterCombatant = combatants.find(c => isWalter(c) && c.health > 0);
  if (!walterCombatant) return;

  // Find which player owns Walter
  const walterMerc = walterCombatant.sourceElement as MercCard;
  let walterOwnerId: string | undefined;
  for (const rebel of game.rebelPlayers) {
    if (rebel.team.some(m => m.id === walterMerc.id)) {
      walterOwnerId = `${rebel.position}`;
      break;
    }
  }

  if (!walterOwnerId) return;

  // Apply +2 initiative to militia owned by Walter's player
  for (const combatant of combatants) {
    if (combatant.isMilitia && combatant.ownerId === walterOwnerId) {
      combatant.initiative += 2;
    }
  }
}

/**
 * MERC-ddq4: Apply Dutch's unarmed bonus
 * Dutch gets +1 combat and +1 initiative when using fists (or sword)
 */
function applyDutchBonus(combatants: Combatant[]): void {
  for (const combatant of combatants) {
    if (isDutch(combatant) && isDutchUsingFists(combatant) && combatant.health > 0) {
      combatant.combat += 1;
      combatant.initiative += 1;
    }
  }
}

/**
 * MERC-adnu: Apply Moe's SMAW target bonus
 * Moe gets +1 target when using SMAW
 */
function applyMoeBonus(combatants: Combatant[]): void {
  for (const combatant of combatants) {
    if (isMoe(combatant) && hasSmaw(combatant) && combatant.health > 0) {
      combatant.targets += 1;
    }
  }
}

/**
 * MERC-b9p4: Execute Golem's pre-combat attack
 * Golem may attack any 1 target before the first round of combat
 */
function executeGolemPreCombat(
  game: MERCGame,
  rebels: Combatant[],
  dictatorSide: Combatant[]
): void {
  const allCombatants = [...rebels, ...dictatorSide];
  const golems = allCombatants.filter(c => isGolem(c) && c.health > 0);

  for (const golem of golems) {
    const enemies = golem.isDictatorSide ? rebels : dictatorSide;
    const aliveEnemies = enemies.filter(e => e.health > 0 && !e.isAttackDog);

    if (aliveEnemies.length === 0) continue;

    // Select target (use AI targeting)
    const target = sortTargetsByAIPriority(aliveEnemies)[0];

    game.message(`${golem.name} strikes before combat begins!`);
    game.message(`${golem.name} targets: ${target.name}`);

    // Roll dice for pre-combat attack
    const rolls = rollDice(golem.combat);
    const hits = countHitsForCombatant(rolls, golem);
    game.message(`${golem.name} rolls [${rolls.join(', ')}] - ${hits} hit(s)`);

    if (hits > 0) {
      const damage = applyDamage(target, hits, game, golem.armorPiercing);
      if (target.health <= 0) {
        game.message(`${golem.name} kills ${target.name} before combat starts!`);
      } else {
        game.message(`${golem.name} hits ${target.name} for ${damage} damage`);
      }
    }
  }
}

/**
 * Sort combatants by initiative (highest first)
 * Dictator wins ties
 * Uses registry for special initiative abilities (Kastern, Badger)
 */
function sortByInitiative(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => {
    const aMercId = getCombatantMercId(a);
    const bMercId = getCombatantMercId(b);

    // Check for "always goes first" ability (Kastern)
    const aFirst = aMercId ? alwaysGoesFirst(aMercId) : false;
    const bFirst = bMercId ? alwaysGoesFirst(bMercId) : false;
    if (aFirst && !bFirst) return -1;
    if (bFirst && !aFirst) return 1;

    // Check for "always before militia" ability (Badger)
    const aBeforeMilitia = aMercId ? alwaysBeforesMilitia(aMercId) : false;
    const bBeforeMilitia = bMercId ? alwaysBeforesMilitia(bMercId) : false;
    if (aBeforeMilitia && b.isMilitia) return -1;
    if (bBeforeMilitia && a.isMilitia) return 1;

    if (b.initiative !== a.initiative) {
      return b.initiative - a.initiative;
    }
    // Tie: Dictator side wins
    if (a.isDictatorSide !== b.isDictatorSide) {
      return a.isDictatorSide ? -1 : 1;
    }
    return 0;
  });
}

// =============================================================================
// Combatant Building
// =============================================================================

/**
 * MERC-l09: Attack Dog constants
 */
const ATTACK_DOG_HEALTH = 3;
const ATTACK_DOG_ID = 'attack-dog';

/**
 * MERC-l09: Check if a MERC has an Attack Dog equipped
 */
function hasAttackDogEquipped(merc: MercCard): boolean {
  // Check accessory slot
  if (merc.accessorySlot?.equipmentId === ATTACK_DOG_ID) {
    return true;
  }
  // Check bandolier slots
  return merc.bandolierSlots.some(e => e.equipmentId === ATTACK_DOG_ID);
}

/**
 * MERC-l09: Check if a MERC is immune to attack dogs (Shadkaam)
 */
function isImmuneToAttackDogs(merc: MercCard): boolean {
  const ability = merc.ability?.toLowerCase() ?? '';
  return ability.includes('immune to attack dogs');
}

/**
 * MERC-l09: Check if a MERC will not harm dogs (Tao)
 */
function willNotHarmDogs(merc: MercCard): boolean {
  const ability = merc.ability?.toLowerCase() ?? '';
  return ability.includes('will not harm dogs');
}

/**
 * Build combatant from a MERC card
 * MERC-38e: Includes armorPiercing from weapon
 * MERC-l09: Includes Attack Dog support
 */
function mercToCombatant(merc: MercCard, isDictatorSide: boolean): Combatant {
  return {
    id: String(merc.id),
    name: merc.mercName,
    initiative: merc.initiative,
    combat: merc.combat,
    health: merc.health,
    maxHealth: merc.maxHealth,
    armor: merc.equipmentArmor,
    targets: merc.targets,
    isDictatorSide,
    isMilitia: false,
    isDictator: false,
    isAttackDog: false,
    sourceElement: merc,
    armorPiercing: merc.weaponSlot?.negatesArmor ?? false, // MERC-38e
    hasAttackDog: hasAttackDogEquipped(merc), // MERC-l09
    isImmuneToAttackDogs: isImmuneToAttackDogs(merc), // MERC-l09
    willNotHarmDogs: willNotHarmDogs(merc), // MERC-l09
  };
}

/**
 * Build combatant from the Dictator card
 */
function dictatorToCombatant(dictator: DictatorCard): Combatant {
  return {
    id: String(dictator.id),
    name: dictator.dictatorName,
    initiative: dictator.initiative,
    combat: dictator.combat,
    health: dictator.health,
    maxHealth: dictator.maxHealth,
    armor: 0, // Dictator armor from equipment if any
    targets: 1,
    isDictatorSide: true,
    isMilitia: false,
    isDictator: true,
    isAttackDog: false,
    sourceElement: dictator,
    armorPiercing: false,
    hasAttackDog: false,
    isImmuneToAttackDogs: false,
    willNotHarmDogs: false,
  };
}

/**
 * Build combatants for militia
 */
function militiaToCombatants(
  count: number,
  isDictatorSide: boolean,
  ownerId?: string
): Combatant[] {
  const combatants: Combatant[] = [];
  for (let i = 0; i < count; i++) {
    combatants.push({
      id: `militia-${isDictatorSide ? 'dictator' : ownerId}-${i}`,
      name: isDictatorSide ? 'Dictator Militia' : 'Rebel Militia',
      initiative: CombatConstants.MILITIA_INITIATIVE,
      combat: CombatConstants.MILITIA_COMBAT,
      health: CombatConstants.MILITIA_HEALTH,
      maxHealth: CombatConstants.MILITIA_HEALTH,
      armor: CombatConstants.MILITIA_ARMOR,
      targets: CombatConstants.MILITIA_TARGETS,
      isDictatorSide,
      isMilitia: true,
      isDictator: false,
      isAttackDog: false,
      sourceElement: null,
      ownerId,
      armorPiercing: false,
      hasAttackDog: false,
      isImmuneToAttackDogs: false,
      willNotHarmDogs: false,
    });
  }
  return combatants;
}

/**
 * MERC-l09: Build an Attack Dog combatant
 * Dogs don't attack, but can be targeted
 */
function createAttackDogCombatant(ownerId: string, isDictatorSide: boolean, index: number): Combatant {
  return {
    id: `attack-dog-${ownerId}-${index}`,
    name: 'Attack Dog',
    initiative: 0, // Dogs don't act on their own
    combat: 0, // Dogs don't attack
    health: ATTACK_DOG_HEALTH,
    maxHealth: ATTACK_DOG_HEALTH,
    armor: 0,
    targets: 0,
    isDictatorSide,
    isMilitia: false,
    isDictator: false,
    isAttackDog: true,
    sourceElement: null,
    ownerId,
    armorPiercing: false,
    hasAttackDog: false,
    isImmuneToAttackDogs: false,
    willNotHarmDogs: false,
  };
}

/**
 * MERC-54m: Refresh combatant stats from source element
 * Called between rounds to update stats after equipment changes (lost armor, consumed weapons)
 */
function refreshCombatantStats(combatant: Combatant): void {
  if (combatant.isMilitia) {
    // Militia stats don't change
    return;
  }

  if (combatant.sourceElement instanceof MercCard) {
    const merc = combatant.sourceElement;
    // Refresh stats that can change with equipment
    combatant.initiative = merc.initiative;
    combatant.combat = merc.combat;
    combatant.targets = merc.targets;
    combatant.armor = merc.equipmentArmor;
    combatant.armorPiercing = merc.weaponSlot?.negatesArmor ?? false;
  } else if (combatant.sourceElement instanceof DictatorCard) {
    const dictator = combatant.sourceElement;
    combatant.initiative = dictator.initiative;
    combatant.combat = dictator.combat;
    // Dictator targets and armor could be updated here if they get equipment
  }
}

/**
 * MERC-cm0: Check if a combatant is Haarg
 */
function isHaarg(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'haarg';
  }
  return false;
}

/**
 * MERC-cm0: Apply Haarg's comparative bonus ability
 * Per rules 13-clarifications-and-edge-cases.md:
 * - Compare to all other units in combat
 * - If anyone has higher Initiative → Haarg gets +1 Initiative
 * - If anyone has higher Combat → Haarg gets +1 Combat
 * - Can get bonuses to multiple stats simultaneously
 * - Recalculates each combat round
 */
function applyHaargBonus(allCombatants: Combatant[]): void {
  const haargCombatants = allCombatants.filter(c => isHaarg(c) && c.health > 0);
  if (haargCombatants.length === 0) return;

  const otherCombatants = allCombatants.filter(c => !isHaarg(c) && c.health > 0);
  if (otherCombatants.length === 0) return;

  // Find max stats among other combatants
  const maxInitiative = Math.max(...otherCombatants.map(c => c.initiative));
  const maxCombat = Math.max(...otherCombatants.map(c => c.combat));

  for (const haarg of haargCombatants) {
    // Get Haarg's base stats (before any bonus)
    const baseInitiative = haarg.sourceElement instanceof MercCard
      ? haarg.sourceElement.initiative : haarg.initiative;
    const baseCombat = haarg.sourceElement instanceof MercCard
      ? haarg.sourceElement.combat : haarg.combat;

    // Apply +1 if anyone has higher
    if (maxInitiative > baseInitiative) {
      haarg.initiative = baseInitiative + 1;
    }
    if (maxCombat > baseCombat) {
      haarg.combat = baseCombat + 1;
    }
  }
}

/**
 * MERC-r2k: Check if a combatant is Snake
 */
function isSnake(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'snake';
  }
  return false;
}

/**
 * MERC-zd5: Check if a combatant is Vandal
 */
function isVandal(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'vandal';
  }
  return false;
}

/**
 * MERC-r2k: Apply Snake's solo bonus ability
 * Per rules 13-clarifications-and-edge-cases.md:
 * - Only gets ability if he is the SOLE member of his squad
 * - Other squads can exist, but Snake must be alone in his
 * - +1 to all skills when working alone
 */
function applySnakeBonus(game: MERCGame, allCombatants: Combatant[]): void {
  const snakeCombatants = allCombatants.filter(c => isSnake(c) && c.health > 0);
  if (snakeCombatants.length === 0) return;

  for (const snake of snakeCombatants) {
    const snakeMerc = snake.sourceElement as MercCard;

    // Find which player owns Snake and which squad he's in
    for (const rebel of game.rebelPlayers) {
      // Check primary squad
      const primaryMercs = rebel.primarySquad.getMercs();
      if (primaryMercs.some(m => m.id === snakeMerc.id)) {
        // Snake is in primary squad - check if alone
        if (rebel.primarySquad.getLivingMercs().length === 1) {
          // Snake is alone in his squad - apply +1 to all stats
          snake.initiative += 1;
          snake.combat += 1;
          // Note: Training bonus applied separately for train action
        }
        break;
      }

      // Check secondary squad
      const secondaryMercs = rebel.secondarySquad.getMercs();
      if (secondaryMercs.some(m => m.id === snakeMerc.id)) {
        // Snake is in secondary squad - check if alone
        if (rebel.secondarySquad.getLivingMercs().length === 1) {
          // Snake is alone in his squad - apply +1 to all stats
          snake.initiative += 1;
          snake.combat += 1;
        }
        break;
      }
    }
  }
}

// =============================================================================
// Retreat Mechanics
// =============================================================================

/**
 * Get valid retreat sectors for a player.
 * Per rules (07-combat-system.md): Adjacent sector that is unoccupied or friendly.
 */
export function getValidRetreatSectors(
  game: MERCGame,
  currentSector: Sector,
  player: RebelPlayer
): Sector[] {
  const adjacentSectors = game.getAdjacentSectors(currentSector);

  return adjacentSectors.filter(sector => {
    // MERC-4bp: Check for ALL dictator forces (militia, MERCs, and dictator card)
    const hasDictatorForces = sector.dictatorMilitia > 0 ||
      game.getDictatorMercsInSector(sector).length > 0 ||
      (game.dictatorPlayer.baseRevealed &&
       game.dictatorPlayer.baseSectorId === sector.sectorId);

    if (!hasDictatorForces) {
      return true;
    }

    // MERC-kpv: Friendly = controlled by this player OR any allied rebel
    // Per rules: retreat valid to sector "controlled by you or ally"
    const dictatorUnits = game.getDictatorUnitsInSector(sector);

    // Check if current player controls
    const playerUnits = game.getRebelUnitsInSector(sector, player);
    if (playerUnits > dictatorUnits) {
      return true;
    }

    // Check if any allied rebel controls (total rebel units > dictator)
    const totalRebelUnits = game.getTotalRebelUnitsInSector(sector);
    return totalRebelUnits > dictatorUnits;
  });
}

/**
 * Check if retreat is possible for a player.
 * Per rules: Only MERCs can retreat, militia cannot retreat.
 */
export function canRetreat(
  game: MERCGame,
  sector: Sector,
  player: RebelPlayer
): boolean {
  // Must have living MERCs in this sector to retreat (militia cannot retreat, dead MERCs cannot retreat)
  const hasLivingMercsInSector =
    (player.primarySquad.sectorId === sector.sectorId && player.primarySquad.livingMercCount > 0) ||
    (player.secondarySquad.sectorId === sector.sectorId && player.secondarySquad.livingMercCount > 0);

  if (!hasLivingMercsInSector) return false;

  return getValidRetreatSectors(game, sector, player).length > 0;
}

/**
 * Execute retreat for a player's squad.
 * Per rules: Entire squad must retreat together. Militia cannot retreat.
 */
export function executeRetreat(
  game: MERCGame,
  fromSector: Sector,
  toSector: Sector,
  player: RebelPlayer
): void {
  // Move primary squad if it's in the combat sector
  if (player.primarySquad.sectorId === fromSector.sectorId) {
    player.primarySquad.sectorId = toSector.sectorId;
    game.message(`${player.name}'s primary squad retreats to ${toSector.sectorName}`);
  }

  // Move secondary squad if it's in the combat sector
  if (player.secondarySquad.sectorId === fromSector.sectorId) {
    player.secondarySquad.sectorId = toSector.sectorId;
    game.message(`${player.name}'s secondary squad retreats to ${toSector.sectorName}`);
  }

  // Note: Militia do NOT retreat (per rules: "Militia cannot retreat")
}

// =============================================================================
// Combat Execution
// =============================================================================

/**
 * Get all combatants for a sector
 * Per rules (06-merc-actions.md lines 195-218): Coordinated attacks allow
 * multiple squads from same or different rebels to attack together.
 * All rebel forces in the sector participate in combat.
 */
export function getCombatants(
  game: MERCGame,
  sector: Sector,
  attackingPlayer: RebelPlayer
): { rebels: Combatant[]; dictator: Combatant[] } {
  const rebels: Combatant[] = [];
  const dictator: Combatant[] = [];

  // Add ALL rebel MERCs in the sector (coordinated attacks)
  for (const rebel of game.rebelPlayers) {
    const rebelMercs = game.getMercsInSector(sector, rebel);
    for (const merc of rebelMercs) {
      if (!merc.isDead) {
        rebels.push(mercToCombatant(merc, false));
      }
    }

    // Add this rebel's militia
    const rebelMilitia = sector.getRebelMilitia(`${rebel.position}`);
    rebels.push(...militiaToCombatants(rebelMilitia, false, `${rebel.position}`));
  }

  // Add dictator's militia
  dictator.push(...militiaToCombatants(sector.dictatorMilitia, true));

  // Add dictator's MERCs if present at this sector
  const dictatorMercs = game.getDictatorMercsInSector(sector);
  for (const merc of dictatorMercs) {
    dictator.push(mercToCombatant(merc, true));
  }

  // Add dictator card if in this sector (base revealed and dictator actually present)
  if (game.dictatorPlayer.baseRevealed) {
    const dictatorCard = game.dictatorPlayer.dictator;
    // Dictator must be alive AND actually in this sector
    if (dictatorCard && !dictatorCard.isDead && dictatorCard.sectorId === sector.sectorId) {
      dictator.push(dictatorToCombatant(dictatorCard));
    }
  }

  return { rebels, dictator };
}

/**
 * Check if dictator can be targeted (only if no other dictator units remain)
 */
function canTargetDictator(dictatorSide: Combatant[]): boolean {
  const nonDictatorUnits = dictatorSide.filter(c => !c.isDictator && c.health > 0);
  return nonDictatorUnits.length === 0;
}

/**
 * MERC-dz0: Check if a combatant is Rizen
 */
function isRizen(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'rizen';
  }
  return false;
}

/**
 * MERC-t5k: Get valid targets that a rebel attacker can select
 * This is used to present choices to the player for target selection
 */
export function getValidTargetsForPlayer(
  attacker: Combatant,
  enemies: Combatant[]
): Combatant[] {
  const aliveEnemies = enemies.filter(e => e.health > 0 && !e.isAttackDog);

  // Sort targets so "targeted last" MERCs (Runde) are at the end
  const sortedForTargeting = [...aliveEnemies].sort((a, b) => {
    const aMercId = getCombatantMercId(a);
    const bMercId = getCombatantMercId(b);
    const aLast = aMercId ? isTargetedLast(aMercId) : false;
    const bLast = bMercId ? isTargetedLast(bMercId) : false;
    if (aLast && !bLast) return 1;
    if (bLast && !aLast) return -1;
    return 0;
  });

  // Check dictator protection rule
  const canHitDictator = canTargetDictator(sortedForTargeting);
  return canHitDictator
    ? sortedForTargeting
    : sortedForTargeting.filter(e => !e.isDictator);
}

/**
 * MERC-t5k: Select targets using player selections if available
 */
function selectTargetsWithPlayerChoice(
  attacker: Combatant,
  enemies: Combatant[],
  maxTargets: number,
  selectedTargetIds?: string[]
): Combatant[] {
  // If player has selected targets, use those
  if (selectedTargetIds && selectedTargetIds.length > 0 && !attacker.isDictatorSide) {
    const selectedTargets = enemies.filter(e => selectedTargetIds.includes(e.id) && e.health > 0);
    // Ensure we don't exceed maxTargets
    return selectedTargets.slice(0, maxTargets);
  }

  // Fall back to automatic selection
  return selectTargets(attacker, enemies, maxTargets);
}

/**
 * Select targets for an attacker
 * MERC-0q8: AI (dictator side) uses priority targeting per rules 4.6:
 * 1. Lowest health + armor
 * 2. If tied, highest targets
 * 3. If tied, highest initiative
 * 4. If still tied, random
 */
function selectTargets(
  attacker: Combatant,
  enemies: Combatant[],
  maxTargets: number
): Combatant[] {
  const aliveEnemies = enemies.filter(e => e.health > 0);

  // MERC-dz0: Rizen can target ALL militia with his attack
  // Per rules: "each hit counts as a new target when attacking militia"
  if (isRizen(attacker)) {
    const militia = aliveEnemies.filter(e => e.isMilitia);
    const nonMilitia = aliveEnemies.filter(e => !e.isMilitia);
    // Rizen targets all militia plus normal targets for non-militia
    const rizenTargets = [...militia, ...nonMilitia.slice(0, maxTargets)];
    return rizenTargets;
  }

  // MERC-2se: Buzzkill always attacks enemy MERCs instead of militia when possible
  if (isBuzzkill(attacker)) {
    const mercs = aliveEnemies.filter(e => !e.isMilitia && !e.isAttackDog);
    const militia = aliveEnemies.filter(e => e.isMilitia || e.isAttackDog);
    // Prioritize MERCs, then militia
    const buzzkillTargets = [...mercs, ...militia].slice(0, maxTargets);
    return buzzkillTargets;
  }

  // Sort targets so "targeted last" MERCs (Runde) are at the end
  const sortedForTargeting = [...aliveEnemies].sort((a, b) => {
    const aMercId = getCombatantMercId(a);
    const bMercId = getCombatantMercId(b);
    const aLast = aMercId ? isTargetedLast(aMercId) : false;
    const bLast = bMercId ? isTargetedLast(bMercId) : false;
    if (aLast && !bLast) return 1;  // Targeted-last goes to end
    if (bLast && !aLast) return -1; // Others go first
    return 0;
  });

  // If attacker is rebel and dictator is present, check protection rule
  if (!attacker.isDictatorSide) {
    const canHitDictator = canTargetDictator(sortedForTargeting);
    const validTargets = canHitDictator
      ? sortedForTargeting
      : sortedForTargeting.filter(e => !e.isDictator);

    return validTargets.slice(0, maxTargets);
  }

  // MERC-0q8: Dictator AI uses priority targeting
  // "Targeted last" MERCs already sorted to end
  const prioritized = sortTargetsByAIPriority(sortedForTargeting);
  return prioritized.slice(0, maxTargets);
}

/**
 * Apply damage to a combatant
 * Per rules (07-combat-system.md): Damage hits armor before health.
 * When armor reaches 0, the armor equipment is destroyed.
 * MERC-38e: Armor Piercing weapons ignore armor entirely.
 * Returns actual damage dealt to health
 */
function applyDamage(target: Combatant, damage: number, game: MERCGame, armorPiercing: boolean = false): number {
  let remainingDamage = damage;

  // MERC-38e: Armor Piercing weapons skip armor entirely
  if (!armorPiercing && target.armor > 0 && remainingDamage > 0) {
    const armorAbsorbed = Math.min(target.armor, remainingDamage);
    target.armor -= armorAbsorbed;
    remainingDamage -= armorAbsorbed;

    // If armor is destroyed, mark the equipment as damaged/destroyed
    if (target.armor <= 0 && target.sourceElement instanceof MercCard) {
      const merc = target.sourceElement;
      if (merc.armorSlot) {
        merc.armorSlot.isDamaged = true;
        game.message(`${merc.mercName}'s ${merc.armorSlot.equipmentName} is destroyed!`);
        // Discard the armor
        const armor = merc.unequip('Armor');
        if (armor) {
          const discard = game.getEquipmentDiscard('Armor');
          if (discard) armor.putInto(discard);
        }
      }
    }
  } else if (armorPiercing && target.armor > 0) {
    game.message(`Armor piercing attack ignores ${target.name}'s armor!`);
  }

  // Apply remaining damage to health
  const healthDamage = Math.min(remainingDamage, target.health);
  target.health -= healthDamage;

  return healthDamage;
}

/**
 * MERC-l09: Track Attack Dog assignments during combat
 * Maps target combatant ID -> dog combatant
 */
interface AttackDogState {
  assignments: Map<string, Combatant>; // targetId -> dog
  dogs: Combatant[]; // All active dogs
}

/**
 * MERC-l09: Assign Attack Dog to an enemy MERC
 * Returns the dog combatant if assigned, null otherwise
 */
function assignAttackDog(
  attacker: Combatant,
  enemies: Combatant[],
  dogState: AttackDogState,
  game: MERCGame,
  dogIndex: number
): Combatant | null {
  if (!attacker.hasAttackDog) return null;

  // Find valid targets (enemy MERCs that aren't immune and don't already have a dog)
  const validTargets = enemies.filter(e =>
    e.health > 0 &&
    !e.isMilitia &&
    !e.isAttackDog &&
    !e.isImmuneToAttackDogs &&
    !dogState.assignments.has(e.id)
  );

  if (validTargets.length === 0) return null;

  // MERC-tbq: Per rules 4.11, use "Choosing Targets in Combat" (4.6) for Attack Dog assignment
  // Priority: lowest health+armor, most targets, highest initiative, random
  const sortedTargets = sortTargetsByAIPriority(validTargets);
  const target = sortedTargets[0];

  // Create the dog combatant
  const dog = createAttackDogCombatant(attacker.id, attacker.isDictatorSide, dogIndex);

  // Track the assignment
  dogState.assignments.set(target.id, dog);
  dogState.dogs.push(dog);

  game.message(`${attacker.name} releases Attack Dog on ${target.name}!`);
  game.message(`${target.name} must attack the dog before doing anything else.`);

  // Mark attacker as having used their dog
  attacker.hasAttackDog = false;

  return dog;
}

/**
 * MERC-l09: Select targets considering Attack Dog assignment
 * MERC-t5k: Also supports player-selected targets
 * If combatant has a dog assigned to them, they MUST target the dog
 */
function selectTargetsWithDogs(
  attacker: Combatant,
  enemies: Combatant[],
  maxTargets: number,
  dogState: AttackDogState,
  selectedTargetIds?: string[]
): Combatant[] {
  // Check if this attacker has a dog assigned to them
  const assignedDog = dogState.assignments.get(attacker.id);
  if (assignedDog && assignedDog.health > 0) {
    // MERC-l09: Tao ability - will not harm dogs, can't attack at all if dog assigned
    if (attacker.willNotHarmDogs) {
      return []; // Tao cannot attack while dog is assigned
    }
    // Must target the dog
    return [assignedDog];
  }

  // MERC-t5k: Use player selections if available for rebel MERCs
  return selectTargetsWithPlayerChoice(attacker, enemies, maxTargets, selectedTargetIds);
}

/**
 * MERC-t5k: Result from executing a combat round (may be partial)
 */
interface CombatRoundResult {
  round: CombatRound;
  complete: boolean; // True if round finished, false if paused for player input
  pausedForTargetSelection?: {
    attackerId: string;
    attackerName: string;
    attackerIndex: number;
    validTargets: Combatant[];
    maxTargets: number;
  };
  // MERC-dice: Pause for hit allocation
  pausedForHitAllocation?: boolean;
  currentAttackerIndex?: number;
}

/**
 * Execute a single combat round
 * MERC-l09: Includes Attack Dog mechanics
 * MERC-t5k: Supports turn-by-turn player target selections
 */
function executeCombatRound(
  roundNumber: number,
  rebels: Combatant[],
  dictatorSide: Combatant[],
  game: MERCGame,
  dogState?: AttackDogState,
  options?: {
    startIndex?: number; // Resume from this attacker index
    partialResults?: CombatResult[]; // Results from attackers already processed
    partialCasualties?: Combatant[]; // Casualties from attackers already processed
    playerSelectedTargets?: Map<string, string[]>;
    interactive?: boolean; // Whether to pause for player target selection
  }
): CombatRoundResult {
  const {
    startIndex = 0,
    partialResults = [],
    partialCasualties = [],
    playerSelectedTargets,
    interactive = true,
  } = options || {};
  // MERC-l09: Initialize dog state if not provided
  const activeDogState: AttackDogState = dogState || {
    assignments: new Map(),
    dogs: [],
  };

  // MERC-54m: Refresh all combatant stats at start of round
  // This updates initiative/combat/targets after equipment changes in previous rounds
  for (const combatant of [...rebels, ...dictatorSide]) {
    if (combatant.health > 0) {
      refreshCombatantStats(combatant);
    }
  }

  // MERC-cm0: Apply Haarg's comparative bonus (must be after refresh, before sorting)
  applyHaargBonus([...rebels, ...dictatorSide]);

  // MERC-r2k: Apply Snake's solo bonus (needs game for squad context)
  applySnakeBonus(game, [...rebels, ...dictatorSide]);

  // Apply enemy debuffs from registry (e.g., Max's -1 combat to enemy MERCs)
  applyEnemyDebuffs(rebels, dictatorSide);
  applyEnemyDebuffs(dictatorSide, rebels);

  // MERC-16f: Apply Bouba's handgun combat bonus
  applyBoubaBonus([...rebels, ...dictatorSide]);

  // MERC-s3x: Apply Mayhem's Uzi combat bonus
  applyMayhemBonus([...rebels, ...dictatorSide]);

  // MERC-3zd: Apply Rozeske's armor combat bonus
  applyRozeskeBonus([...rebels, ...dictatorSide]);

  // MERC-c1f: Apply Ra's target bonus
  applyRaBonus([...rebels, ...dictatorSide]);

  // MERC-581: Apply Stumpy's explosive combat bonus
  applyStumpyBonus([...rebels, ...dictatorSide]);

  // MERC-x0jg: Apply Vandradi's multi-target weapon bonus
  applyVandradiBonus([...rebels, ...dictatorSide]);

  // MERC-5yq: Apply Sarge's highest initiative bonus
  applySargeBonus(game, [...rebels, ...dictatorSide]);

  // MERC-kmv: Apply Tack's squad initiative bonus
  applyTackBonus(game, [...rebels, ...dictatorSide]);

  // MERC-qbci: Apply Valkyrie's squad initiative bonus
  applyValkyrieBonus(game, [...rebels, ...dictatorSide]);

  // MERC-dxi: Apply Tavisto's woman-in-squad bonus
  applyTavistoBonus(game, [...rebels, ...dictatorSide]);

  // MERC-btst: Apply Vulture's initiative penalty ignore
  applyVultureBonus([...rebels, ...dictatorSide]);

  // MERC-djs0: Apply Walter's militia initiative bonus
  applyWalterBonus(game, [...rebels, ...dictatorSide]);

  // MERC-ddq4: Apply Dutch's unarmed bonus
  applyDutchBonus([...rebels, ...dictatorSide]);

  // MERC-adnu: Apply Moe's SMAW target bonus
  applyMoeBonus([...rebels, ...dictatorSide]);

  // MERC-ml7: Apply Khenn's random initiative (must be before sorting)
  applyKhennInitiative([...rebels, ...dictatorSide], game);

  // MERC-b9p4: Execute Golem's pre-combat attack (before first round)
  executeGolemPreCombat(game, rebels, dictatorSide);

  const allCombatants = sortByInitiative([...rebels, ...dictatorSide]);

  // MERC-t5k: Start with partial results if resuming mid-round
  const results: CombatResult[] = [...partialResults];
  const casualties: Combatant[] = [...partialCasualties];
  let dogIndex = startIndex; // Approximate dog index based on where we're resuming

  // MERC-t5k: Loop through combatants starting from specified index
  for (let i = startIndex; i < allCombatants.length; i++) {
    const attacker = allCombatants[i];

    // Skip dead combatants and attack dogs (dogs don't attack)
    if (attacker.health <= 0 || attacker.isAttackDog) continue;

    // MERC-82k: Meatbop will not fight without an accessory equipped
    if (isMeatbop(attacker) && !hasAccessory(attacker)) {
      game.message(`${attacker.name} refuses to fight without an accessory!`);
      results.push({
        attacker,
        rolls: [],
        hits: 0,
        targets: [],
        damageDealt: new Map(),
      });
      continue;
    }

    // Determine enemies
    const enemies = attacker.isDictatorSide ? rebels : dictatorSide;
    const aliveEnemies = enemies.filter(e => e.health > 0 && !e.isAttackDog);

    if (aliveEnemies.length === 0) continue;

    // MERC-t5k: Check if this rebel MERC needs player target selection
    // Note: instanceof check can fail in bundled code, so also check for mercId property
    const hasMercSource = attacker.sourceElement instanceof MercCard ||
                          (attacker.sourceElement && 'mercId' in attacker.sourceElement);
    const isRebelMerc = !attacker.isDictatorSide && !attacker.isMilitia && hasMercSource;
    const hasSelectedTargets = playerSelectedTargets?.has(attacker.id);

    if (interactive && isRebelMerc && !hasSelectedTargets) {
      // Check if dog forces targets (no player choice needed)
      const assignedDog = activeDogState.assignments.get(attacker.id);
      const dogForcesTarget = assignedDog && assignedDog.health > 0;

      if (!dogForcesTarget) {
        // Need player input - pause and return
        const validTargets = getValidTargetsForPlayer(attacker, enemies);
        if (validTargets.length > 0) {
          return {
            round: { roundNumber, results, casualties },
            complete: false,
            pausedForTargetSelection: {
              attackerId: attacker.id,
              attackerName: attacker.name,
              attackerIndex: i,
              validTargets,
              maxTargets: attacker.targets,
            },
          };
        }
      }
    }

    // MERC-l09: Before attacking, assign Attack Dog if available
    if (attacker.hasAttackDog) {
      assignAttackDog(attacker, enemies, activeDogState, game, dogIndex++);
    }

    // MERC-l09: Select targets considering dog assignments
    // MERC-t5k: Use player selections if available
    const attackerSelectedTargets = playerSelectedTargets?.get(attacker.id);
    const targets = selectTargetsWithDogs(attacker, enemies, attacker.targets, activeDogState, attackerSelectedTargets);

    // MERC-l09: Handle Tao ability - can't attack when dog assigned
    if (targets.length === 0) {
      if (attacker.willNotHarmDogs) {
        game.message(`${attacker.name} refuses to harm the Attack Dog and cannot act.`);
      }
      results.push({
        attacker,
        rolls: [],
        hits: 0,
        targets: [],
        damageDealt: new Map(),
      });
      continue;
    }

    const targetNames = targets.map(t => t.name).join(', ');
    game.message(`${attacker.name} declares targets: ${targetNames}`);

    // MERC-7te: Surgeon can sacrifice a die to heal before attacking
    const attackerAllies = attacker.isDictatorSide ? dictatorSide : rebels;
    applySurgeonHeal(game, attacker, attackerAllies);

    // Roll dice
    // MERC-cpb: Lucid hits on 3+ instead of 4+
    // Medical Kit healing: dice are reduced by healing dice used
    const effectiveDice = getEffectiveCombatDice(attacker, game);
    let rolls = rollDice(effectiveDice);
    let hits = countHitsForCombatant(rolls, attacker);
    game.message(`${attacker.name} rolls [${rolls.join(', ')}] - ${hits} hit(s)`);

    // MERC-5l3: Basic may reroll all dice once per combat (uses registry)
    if (shouldUseReroll(attacker, rolls, hits)) {
      game.message(`${attacker.name} uses reroll ability!`);
      attacker.hasUsedReroll = true;
      rolls = rollDice(effectiveDice);
      hits = countHitsForCombatant(rolls, attacker);
      game.message(`${attacker.name} rerolls [${rolls.join(', ')}] - ${hits} hit(s)`);
    }

    // MERC-9mpr: Wolverine's 6s can hit additional targets
    // Count 6s rolled for bonus targets
    let wolverineBonus6s = 0;
    if (isWolverine(attacker)) {
      wolverineBonus6s = rolls.filter(r => r === 6).length;
      if (wolverineBonus6s > 0) {
        game.message(`Wolverine's ${wolverineBonus6s} six(es) can hit additional targets!`);
      }
    }

    if (hits === 0) {
      results.push({
        attacker,
        rolls,
        hits: 0,
        targets: [],
        damageDealt: new Map(),
      });
      continue;
    }

    // MERC-dice: Check if player needs to allocate hits
    // Pause for allocation if: player-controlled rebel MERC, multiple valid targets, meaningful choice
    const hasHitAllocation = game.activeCombat?.selectedTargets?.has(`allocation:${attacker.id}`);
    if (interactive && isRebelMerc && !hasHitAllocation) {
      // Get valid targets (alive enemies, no attack dogs)
      const validTargets = enemies.filter(e => e.health > 0 && !e.isAttackDog);

      // Smart skip logic:
      // 1. Only 1 valid target - no choice needed
      // 2. All targets are militia - no meaningful choice (militia all have 1 HP)
      // 3. Overkill - hits >= total enemy HP, so all targets will die anyway
      const allMilitia = validTargets.every(t => t.isMilitia);
      const totalEnemyHP = validTargets.reduce((sum, t) => sum + t.health, 0);
      const isOverkill = hits >= totalEnemyHP;
      const needsAllocation = validTargets.length > 1 && !allMilitia && !isOverkill;

      // Also check if Basic's reroll is available (not yet used)
      const mercId = getCombatantMercId(attacker);
      const canUseReroll = mercId && canRerollOnce(mercId) && !attacker.hasUsedReroll;

      // Pause for allocation if meaningful choice exists OR if reroll is available
      if (needsAllocation || canUseReroll) {
        // Get hit threshold for this combatant
        const hitThreshold = mercId ? getHitThreshold(mercId) : CombatConstants.HIT_THRESHOLD;

        // Set pending hit allocation state
        game.activeCombat!.pendingHitAllocation = {
          attackerId: attacker.id,
          attackerName: attacker.name,
          attackerMercId: mercId ?? '',
          diceRolls: rolls,
          hits,
          hitThreshold,
          validTargets: validTargets.map(t => ({
            id: t.id,
            name: t.name,
            isMerc: !t.isMilitia && !t.isDictator,
            currentHealth: t.health,
            maxHealth: t.maxHealth,
          })),
          wolverineSixes: wolverineBonus6s,
          canReroll: !!canUseReroll,
          hasRerolled: !!attacker.hasUsedReroll,
          rollCount: 1, // Initial roll
        };

        // Return pause for hit allocation
        return {
          round: { roundNumber, results, casualties },
          complete: false,
          pausedForHitAllocation: true,
          currentAttackerIndex: i,
        };
      }
    }

    const damageDealt = new Map<string, number>();

    // MERC-dice: Check if player allocated hits manually
    const playerHitAllocation = game.activeCombat?.selectedTargets?.get(`allocation:${attacker.id}`);
    let expandedTargets: Combatant[];

    if (playerHitAllocation && playerHitAllocation.length > 0) {
      // Use player's allocation - convert targetIds to Combatant objects
      // The allocation is an array of targetIds (can have duplicates for multiple hits)
      expandedTargets = [];
      for (const targetId of playerHitAllocation) {
        const target = enemies.find(e => e.id === targetId);
        if (target) expandedTargets.push(target);
      }
      // Clear the allocation so it's not reused
      game.activeCombat?.selectedTargets?.delete(`allocation:${attacker.id}`);
    } else {
      // MERC-9mpr: Add additional targets for Wolverine's 6s (AI allocation)
      expandedTargets = [...targets];
      if (wolverineBonus6s > 0) {
        const availableExtra = enemies.filter(e =>
          e.health > 0 && !targets.includes(e) && !e.isAttackDog
        );
        const extraTargets = availableExtra.slice(0, wolverineBonus6s);
        if (extraTargets.length > 0) {
          expandedTargets.push(...extraTargets);
          game.message(`Wolverine adds targets: ${extraTargets.map(t => t.name).join(', ')}`);
        }
      }
    }

    // Distribute hits among targets
    let remainingHits = hits;
    for (const target of expandedTargets) {
      if (remainingHits <= 0) break;

      // MERC-38e: Pass armorPiercing flag to applyDamage
      const damage = applyDamage(target, remainingHits, game, attacker.armorPiercing);
      damageDealt.set(target.id, damage);

      // Sync damage to source MercCard immediately (so UI shows correct state during combat)
      if (target.sourceElement instanceof MercCard) {
        const merc = target.sourceElement;
        merc.damage = merc.maxHealth - target.health;
      }

      if (target.health <= 0) {
        // MERC-clsx: Adelheid converts militia instead of killing
        if (isAdelheid(attacker) && target.isMilitia && !attacker.isDictatorSide) {
          // Convert militia to rebel's side
          const attackerMerc = attacker.sourceElement as MercCard;
          const ownerPlayer = game.rebelPlayers.find(p =>
            p.team.some(m => m.id === attackerMerc.id)
          );
          // Get sector from active combat state
          const combatSector = game.activeCombat?.sectorId
            ? game.getSector(game.activeCombat.sectorId)
            : null;
          if (ownerPlayer && combatSector) {
            // Remove dictator militia
            combatSector.dictatorMilitia--;
            // Add to rebel militia
            combatSector.addRebelMilitia(`${ownerPlayer.position}`, 1);
            game.message(`${attacker.name} converts ${target.name} to her side!`);
            // Don't add to casualties - militia is converted, not killed
          } else {
            casualties.push(target);
            game.message(`${attacker.name} kills ${target.name}!`);
          }
        } else {
          casualties.push(target);
          game.message(`${attacker.name} kills ${target.name}!`);

          // MERC-4ib: Handle MERC death immediately (so UI shows correct state during combat)
          if (target.sourceElement instanceof MercCard) {
            const merc = target.sourceElement;
            // Check for epinephrine save BEFORE marking as dead
            let savedByEpinephrine = false;

            if (target.isDictatorSide && game.dictatorPlayer?.isAI) {
              // AI dictator auto-uses epinephrine per rules 4.9
              const squadMercs = game.dictatorPlayer.hiredMercs.filter(m => !m.isDead);
              const mercWithEpi = shouldUseEpinephrine(merc, squadMercs);
              if (mercWithEpi) {
                // Find the epinephrine (check accessory slot first, then bandolier)
                let epiShot: Equipment | undefined;
                if (mercWithEpi.accessorySlot && isEpinephrine(mercWithEpi.accessorySlot.equipmentId)) {
                  epiShot = mercWithEpi.unequip('Accessory');
                } else {
                  const epiIndex = mercWithEpi.bandolierSlots.findIndex(e => isEpinephrine(e.equipmentId));
                  if (epiIndex >= 0) {
                    epiShot = mercWithEpi.unequipBandolierSlot(epiIndex);
                  }
                }
                if (epiShot) {
                  const discard = game.getEquipmentDiscard('Accessory');
                  if (discard) epiShot.putInto(discard);
                  target.health = 1;
                  merc.damage = merc.maxHealth - 1;
                  savedByEpinephrine = true;
                  game.message(`${mercWithEpi.mercName} uses Epinephrine Shot to save ${merc.mercName}!`);
                  // Remove from casualties since they survived
                  casualties.pop();
                }
              }
            } else if (!target.isDictatorSide) {
              // Rebel side - check for epinephrine in the same squad
              // Note: Use getMercs() not team, because the merc is now "dead" (health=0)
              // and team filters out dead mercs
              for (const rebel of game.rebelPlayers) {
                const primaryMercs = rebel.primarySquad.getMercs();
                const secondaryMercs = rebel.secondarySquad.getMercs();
                const allMercs = [...primaryMercs, ...secondaryMercs];

                if (allMercs.some(m => m.id === merc.id)) {
                  // Get living squadmates who might have epinephrine
                  const squadMercs = allMercs.filter(m => !m.isDead && m.id !== merc.id);
                  const mercWithEpi = hasEpinephrineShot(squadMercs);
                  if (mercWithEpi) {
                    // Find the epinephrine (check accessory slot first, then bandolier)
                    let epiShot: Equipment | undefined;
                    if (mercWithEpi.accessorySlot && isEpinephrine(mercWithEpi.accessorySlot.equipmentId)) {
                      epiShot = mercWithEpi.unequip('Accessory');
                    } else {
                      const epiIndex = mercWithEpi.bandolierSlots.findIndex(e => isEpinephrine(e.equipmentId));
                      if (epiIndex >= 0) {
                        epiShot = mercWithEpi.unequipBandolierSlot(epiIndex);
                      }
                    }
                    if (epiShot) {
                      const discard = game.getEquipmentDiscard('Accessory');
                      if (discard) epiShot.putInto(discard);
                      target.health = 1;
                      merc.damage = merc.maxHealth - 1;
                      savedByEpinephrine = true;
                      game.message(`${mercWithEpi.mercName} uses Epinephrine Shot to save ${merc.mercName}!`);
                      // Remove from casualties since they survived
                      casualties.pop();
                    }
                  }
                  break;
                }
              }
            }

            // If not saved, discard equipment (isDead is computed from health)
            if (!savedByEpinephrine) {
              // Discard all equipment
              for (const slotName of ['Weapon', 'Armor', 'Accessory'] as const) {
                const equip = merc.unequip(slotName);
                if (equip) {
                  const discardPile = game.getEquipmentDiscard(slotName);
                  if (discardPile) equip.putInto(discardPile);
                }
              }
            }
          }

          // MERC-l09: If a dog dies, remove the assignment
          if (target.isAttackDog) {
            // Find and remove the assignment for this dog
            for (const [targetId, dog] of activeDogState.assignments.entries()) {
              if (dog.id === target.id) {
                activeDogState.assignments.delete(targetId);
                break;
              }
            }
          }
        }
      } else {
        game.message(`${attacker.name} hits ${target.name} for ${damage} damage`);
      }

      // Militia and dogs die in one hit, MERCs can take multiple
      if (target.isMilitia || target.isAttackDog) {
        remainingHits--;
      } else {
        remainingHits -= damage;
      }
    }

    // Discard accessories with discardAfterAttack (grenades, mortars)
    if (attacker.sourceElement instanceof MercCard) {
      const merc = attacker.sourceElement;
      const accessoryDiscard = game.getEquipmentDiscard('Accessory');

      // Check accessory slot
      if (merc.accessorySlot && checkDiscardAfterAttack(merc.accessorySlot.equipmentId)) {
        game.message(`${merc.mercName}'s ${merc.accessorySlot.equipmentName} is used up!`);
        const accessory = merc.unequip('Accessory');
        if (accessory && accessoryDiscard) {
          accessory.putInto(accessoryDiscard);
        }
      }

      // Check bandolier slots
      const bandolierToDiscard = merc.bandolierSlots.filter(e =>
        checkDiscardAfterAttack(e.equipmentId)
      );
      for (const equipment of bandolierToDiscard) {
        game.message(`${merc.mercName}'s ${equipment.equipmentName} is used up!`);
        // Extract bandolier index from equippedSlot (format: 'bandolier:0', 'bandolier:1', etc.)
        const slotMatch = equipment.equippedSlot?.match(/^bandolier:(\d+)$/);
        if (slotMatch) {
          const index = parseInt(slotMatch[1], 10);
          merc.unequipBandolierSlot(index);
          if (accessoryDiscard) {
            equipment.putInto(accessoryDiscard);
          }
        }
      }
    }

    results.push({
      attacker,
      rolls,
      hits,
      targets,
      damageDealt,
    });
  }

  // MERC-zd5: Vandal fires a second shot at the end of each round
  const vandals = allCombatants.filter(c => isVandal(c) && c.health > 0);
  for (const vandal of vandals) {
    const enemies = vandal.isDictatorSide ? rebels : dictatorSide;
    const aliveEnemies = enemies.filter(e => e.health > 0 && !e.isAttackDog);

    if (aliveEnemies.length === 0) continue;

    game.message(`${vandal.name} fires second shot!`);

    // Select targets for second shot (can target same or different enemies)
    const targets = selectTargetsWithDogs(vandal, enemies, vandal.targets, activeDogState);
    if (targets.length === 0) continue;

    const targetNames = targets.map(t => t.name).join(', ');
    game.message(`${vandal.name} targets: ${targetNames}`);

    // Roll dice for second shot
    // MERC-cpb: Lucid hits on 3+ instead of 4+
    // Note: Healing dice reduction also applies to second shot
    const vandalEffectiveDice = getEffectiveCombatDice(vandal, game);
    const rolls = rollDice(vandalEffectiveDice);
    const hits = countHitsForCombatant(rolls, vandal);
    game.message(`${vandal.name} rolls [${rolls.join(', ')}] - ${hits} hit(s)`);

    if (hits > 0) {
      const damageDealt = new Map<string, number>();
      let remainingHits = hits;

      for (const target of targets) {
        if (remainingHits <= 0) break;

        const damage = applyDamage(target, remainingHits, game, vandal.armorPiercing);
        damageDealt.set(target.id, damage);

        if (target.health <= 0) {
          casualties.push(target);
          game.message(`${vandal.name} kills ${target.name}!`);
        } else {
          game.message(`${vandal.name} hits ${target.name} for ${damage} damage`);
        }

        if (target.isMilitia || target.isAttackDog) {
          remainingHits--;
        } else {
          remainingHits -= damage;
        }
      }

      results.push({
        attacker: vandal,
        rolls,
        hits,
        targets,
        damageDealt,
      });
    }
  }

  // MERC-t5k: Round completed successfully
  return {
    round: { roundNumber, results, casualties },
    complete: true,
  };
}

/**
 * Apply combat results to actual game state
 * Handles coordinated attacks - updates all participating rebels' militia
 * MERC-4ib: Handles MERC death by discarding card and equipment
 */
function applyCombatResults(
  game: MERCGame,
  sector: Sector,
  rebels: Combatant[],
  dictatorSide: Combatant[],
  attackingPlayer: RebelPlayer
): void {
  // Update MERC damage and handle deaths
  // Note: Deaths are now handled immediately during combat rounds, so this mainly
  // syncs final damage for surviving MERCs and handles any edge cases
  for (const combatant of [...rebels, ...dictatorSide]) {
    if (combatant.sourceElement instanceof MercCard) {
      const merc = combatant.sourceElement;

      // Skip if already marked dead (handled during combat round)
      if (merc.isDead) continue;

      const damageTaken = combatant.maxHealth - combatant.health;
      merc.damage = damageTaken;

      // MERC-4ib: Handle MERC death - discard card and equipment
      // (This is a fallback - deaths should already be handled during combat)
      if (combatant.health <= 0) {
        // MERC-594: Check if epinephrine can save this MERC
        let savedByEpinephrine = false;

        if (combatant.isDictatorSide && game.dictatorPlayer?.isAI) {
          // AI dictator auto-uses epinephrine per rules 4.9
          const squadMercs = game.dictatorPlayer.hiredMercs.filter(m => !m.isDead);
          const mercWithEpi = shouldUseEpinephrine(merc, squadMercs);
          if (mercWithEpi) {
            // Find the epinephrine (check accessory slot first, then bandolier)
            let epiShot: Equipment | undefined;
            if (mercWithEpi.accessorySlot && isEpinephrine(mercWithEpi.accessorySlot.equipmentId)) {
              epiShot = mercWithEpi.unequip('Accessory');
            } else {
              const epiIndex = mercWithEpi.bandolierSlots.findIndex(e => isEpinephrine(e.equipmentId));
              if (epiIndex >= 0) {
                epiShot = mercWithEpi.unequipBandolierSlot(epiIndex);
              }
            }
            if (epiShot) {
              const discard = game.getEquipmentDiscard('Accessory');
              if (discard) epiShot.putInto(discard);

              // Restore MERC to 1 health
              combatant.health = 1;
              merc.damage = merc.maxHealth - 1;
              savedByEpinephrine = true;
              game.message(`${mercWithEpi.mercName} uses Epinephrine Shot to save ${merc.mercName}!`);
            }
          }
        } else if (!combatant.isDictatorSide) {
          // Rebel side - check for epinephrine in the same squad
          // Note: Use getMercs() not team, because the merc may be "dead" (health=0)
          // and team filters out dead mercs
          for (const rebel of game.rebelPlayers) {
            const primaryMercs = rebel.primarySquad.getMercs();
            const secondaryMercs = rebel.secondarySquad.getMercs();
            const allMercs = [...primaryMercs, ...secondaryMercs];

            if (allMercs.some(m => m.id === merc.id)) {
              // Get living squadmates who might have epinephrine
              const squadMercs = allMercs.filter(m => !m.isDead && m.id !== merc.id);
              const mercWithEpi = hasEpinephrineShot(squadMercs);
              if (mercWithEpi) {
                // Find the epinephrine (check accessory slot first, then bandolier)
                let epiShot: Equipment | undefined;
                if (mercWithEpi.accessorySlot && isEpinephrine(mercWithEpi.accessorySlot.equipmentId)) {
                  epiShot = mercWithEpi.unequip('Accessory');
                } else {
                  const epiIndex = mercWithEpi.bandolierSlots.findIndex(e => isEpinephrine(e.equipmentId));
                  if (epiIndex >= 0) {
                    epiShot = mercWithEpi.unequipBandolierSlot(epiIndex);
                  }
                }
                if (epiShot) {
                  const discard = game.getEquipmentDiscard('Accessory');
                  if (discard) epiShot.putInto(discard);

                  // Restore MERC to 1 health
                  combatant.health = 1;
                  merc.damage = merc.maxHealth - 1;
                  savedByEpinephrine = true;
                  game.message(`${mercWithEpi.mercName} uses Epinephrine Shot to save ${merc.mercName}!`);
                }
              }
              break;
            }
          }
        }

        if (!savedByEpinephrine) {
          // isDead is computed from health, no need to set it

          // Discard all equipment
          const equipmentTypes: Array<'Weapon' | 'Armor' | 'Accessory'> = ['Weapon', 'Armor', 'Accessory'];
          for (const eqType of equipmentTypes) {
            const equipment = merc.unequip(eqType);
            if (equipment) {
              const discard = game.getEquipmentDiscard(eqType);
              if (discard) equipment.putInto(discard);
            }
          }

          // MERC-rwdv: putInto automatically removes from current container
          // Clear sectorId so dead MERC doesn't show on map
          merc.sectorId = undefined;
          // Put MERC card in discard pile
          merc.putInto(game.mercDiscard);
          game.message(`${merc.mercName} has been killed in combat!`);
        }
      }
    } else if (combatant.sourceElement instanceof DictatorCard) {
      const dictator = combatant.sourceElement;
      const damageTaken = combatant.maxHealth - combatant.health;
      dictator.damage = damageTaken;

      // Handle dictator death (isDead is computed from health)
      if (combatant.health <= 0) {
        game.message(`THE DICTATOR HAS BEEN KILLED! REBELS WIN!`);
      }
    }
  }

  // Update militia counts
  syncMilitiaCasualties(game, sector, rebels, dictatorSide);
}

/**
 * MERC-t5k: Sync militia casualties to sector counts
 * Called both during combat pause and at combat end to keep UI in sync
 */
function syncMilitiaCasualties(
  game: MERCGame,
  sector: Sector,
  rebels: Combatant[],
  dictatorSide: Combatant[]
): void {
  // Update dictator militia count
  const survivingDictatorMilitia = dictatorSide.filter(c => c.isMilitia && c.health > 0).length;
  sector.dictatorMilitia = survivingDictatorMilitia;

  // Update militia for ALL rebel players who had militia in combat (coordinated attacks)
  for (const rebel of game.rebelPlayers) {
    const playerId = `${rebel.position}`;
    const survivingMilitia = rebels.filter(
      c => c.isMilitia && c.health > 0 && c.ownerId === playerId
    ).length;
    sector.rebelMilitia[playerId] = survivingMilitia;
  }
}

/**
 * Execute full combat in a sector
 * MERC-n1f: Supports interactive mode where combat pauses after each round for retreat decision
 */
export function executeCombat(
  game: MERCGame,
  sector: Sector,
  attackingPlayer: RebelPlayer,
  options: { maxRounds?: number; interactive?: boolean } = {}
): CombatOutcome {
  const { maxRounds = 10, interactive = true } = options;

  // Check if resuming from paused combat
  const isResuming = game.activeCombat !== null && game.activeCombat.sectorId === sector.sectorId;

  let rebels: Combatant[];
  let dictator: Combatant[];
  let rounds: CombatRound[];
  let allRebelCasualties: Combatant[];
  let allDictatorCasualties: Combatant[];
  let startRound: number;

  // MERC-l09: Track Attack Dog state across rounds
  let dogState: AttackDogState;

  if (isResuming && game.activeCombat) {
    // Resume from saved state
    rebels = game.activeCombat.rebelCombatants as Combatant[];
    dictator = game.activeCombat.dictatorCombatants as Combatant[];
    rounds = [];
    allRebelCasualties = game.activeCombat.rebelCasualties as Combatant[];
    allDictatorCasualties = game.activeCombat.dictatorCasualties as Combatant[];
    // MERC-t5k: If resuming mid-round (has partial round data or pending targets), stay on same round
    // Otherwise (between rounds after retreat decision), start next round
    const hasPartialRoundData = (game.activeCombat.roundResults?.length ?? 0) > 0 ||
                                 (game.activeCombat.roundCasualties?.length ?? 0) > 0 ||
                                 (game.activeCombat.currentAttackerIndex ?? 0) > 0 ||
                                 game.activeCombat.selectedTargets?.size > 0;
    startRound = hasPartialRoundData ? game.activeCombat.round : game.activeCombat.round + 1;

    // MERC-l09: Restore dog state
    dogState = {
      assignments: new Map(game.activeCombat.dogAssignments || []),
      dogs: (game.activeCombat.dogs || []) as Combatant[],
    };

    game.message(`--- Combat continues at ${sector.sectorName} ---`);
  } else {
    // Start new combat
    game.message(`=== Combat at ${sector.sectorName} ===`);
    const combatants = getCombatants(game, sector, attackingPlayer);
    rebels = combatants.rebels;
    dictator = combatants.dictator;
    rounds = [];
    allRebelCasualties = [];
    allDictatorCasualties = [];
    startRound = 1;

    // MERC-l09: Initialize dog state
    dogState = {
      assignments: new Map(),
      dogs: [],
    };

    game.message(`Rebels: ${rebels.length} units`);
    game.message(`Dictator: ${dictator.length} units`);

    // Log initiative order for transparency
    const allUnits = sortByInitiative([...rebels, ...dictator]);
    const initiativeOrder = allUnits
      .filter(u => !u.isAttackDog)
      .map(u => `${u.name} (${u.initiative})`)
      .join(' > ');
    game.message(`Initiative order: ${initiativeOrder}`);

    // MERC-b65: AI detonates land mines before combat begins
    detonateLandMines(game, sector, attackingPlayer);
  }

  let retreatSector: Sector | undefined;
  let didRetreat = false;
  let combatPending = false;
  let retreatAvailable = false;

  // MERC-t5k: Track player-selected targets and mid-round state
  let playerSelectedTargets: Map<string, string[]> = new Map();
  let currentAttackerIndex = 0;
  let roundResults: CombatResult[] = [];
  let roundCasualties: Combatant[] = [];

  if (isResuming && game.activeCombat) {
    if (game.activeCombat.selectedTargets) {
      playerSelectedTargets = new Map(game.activeCombat.selectedTargets);
    }
    if (game.activeCombat.currentAttackerIndex !== undefined) {
      currentAttackerIndex = game.activeCombat.currentAttackerIndex;
    }
    if (game.activeCombat.roundResults) {
      roundResults = game.activeCombat.roundResults as CombatResult[];
    }
    if (game.activeCombat.roundCasualties) {
      roundCasualties = game.activeCombat.roundCasualties as Combatant[];
    }
  }

  for (let round = startRound; round <= maxRounds; round++) {
    // MERC-t5k: Only show round message if starting fresh (not resuming mid-round)
    if (currentAttackerIndex === 0) {
      game.message(`--- Round ${round} ---`);
      // Reset healing dice used for the new round
      if (game.activeCombat?.healingDiceUsed) {
        game.activeCombat.healingDiceUsed.clear();
      }
    }

    // MERC-l09: Pass dog state to combat round
    // MERC-t5k: Execute round with turn-by-turn target selection
    const roundResult = executeCombatRound(round, rebels, dictator, game, dogState, {
      startIndex: currentAttackerIndex,
      partialResults: roundResults,
      partialCasualties: roundCasualties,
      playerSelectedTargets,
      interactive,
    });

    // MERC-t5k: Check if round paused for target selection
    if (!roundResult.complete && roundResult.pausedForTargetSelection) {
      const pause = roundResult.pausedForTargetSelection;

      // Save state for resuming
      game.activeCombat = {
        sectorId: sector.sectorId,
        attackingPlayerId: `${attackingPlayer.position}`,
        round,
        rebelCombatants: rebels,
        dictatorCombatants: dictator,
        rebelCasualties: allRebelCasualties,
        dictatorCasualties: allDictatorCasualties,
        dogAssignments: Array.from(dogState.assignments.entries()),
        dogs: dogState.dogs,
        selectedTargets: playerSelectedTargets,
        currentAttackerIndex: pause.attackerIndex,
        roundResults: roundResult.round.results,
        roundCasualties: roundResult.round.casualties,
        pendingTargetSelection: {
          attackerId: pause.attackerId,
          attackerName: pause.attackerName,
          validTargets: pause.validTargets,
          maxTargets: pause.maxTargets,
        },
      };

      // MERC-t5k: Sync militia casualties so UI reflects kills during combat
      syncMilitiaCasualties(game, sector, rebels, dictator);

      game.message(`${pause.attackerName} is ready to attack. Select targets.`);

      return {
        rounds,
        rebelVictory: false,
        dictatorVictory: false,
        rebelCasualties: allRebelCasualties,
        dictatorCasualties: allDictatorCasualties,
        retreated: false,
        combatPending: true,
        canRetreat: false,
      };
    }

    // MERC-dice: Check if round paused for hit allocation
    if (!roundResult.complete && roundResult.pausedForHitAllocation) {
      // The pendingHitAllocation is already set in game.activeCombat by executeCombatRound
      // Just save the rest of the combat state for resuming

      // Save state for resuming (pendingHitAllocation already set)
      game.activeCombat = {
        ...game.activeCombat!,
        sectorId: sector.sectorId,
        attackingPlayerId: `${attackingPlayer.position}`,
        round,
        rebelCombatants: rebels,
        dictatorCombatants: dictator,
        rebelCasualties: allRebelCasualties,
        dictatorCasualties: allDictatorCasualties,
        dogAssignments: Array.from(dogState.assignments.entries()),
        dogs: dogState.dogs,
        selectedTargets: playerSelectedTargets,
        currentAttackerIndex: roundResult.currentAttackerIndex,
        roundResults: roundResult.round.results,
        roundCasualties: roundResult.round.casualties,
      };

      // MERC-dice: Sync militia casualties so UI reflects kills during combat
      syncMilitiaCasualties(game, sector, rebels, dictator);

      const attacker = game.activeCombat.pendingHitAllocation?.attackerName ?? 'MERC';
      game.message(`${attacker} rolled! Allocate hits to targets.`);

      return {
        rounds,
        rebelVictory: false,
        dictatorVictory: false,
        rebelCasualties: allRebelCasualties,
        dictatorCasualties: allDictatorCasualties,
        retreated: false,
        combatPending: true,
        canRetreat: false,
      };
    }

    // Round completed - add to results
    rounds.push(roundResult.round);

    // Clear mid-round state for next round
    currentAttackerIndex = 0;
    roundResults = [];
    roundCasualties = [];
    playerSelectedTargets.clear();

    // Track casualties
    for (const casualty of roundResult.round.casualties) {
      if (casualty.isDictatorSide) {
        allDictatorCasualties.push(casualty);
      } else {
        allRebelCasualties.push(casualty);
      }
    }

    // Check for combat end
    const aliveRebels = rebels.filter(c => c.health > 0);
    const aliveDictator = dictator.filter(c => c.health > 0);

    if (aliveRebels.length === 0 || aliveDictator.length === 0) {
      break;
    }

    // MERC-n1f: Check if retreat is possible and pause for player decision
    retreatAvailable = canRetreat(game, sector, attackingPlayer);
    if (interactive && retreatAvailable) {
      // MERC-t5k: Sync militia casualties to sector before pausing
      syncMilitiaCasualties(game, sector, rebels, dictator);

      // Save combat state and pause for player decision
      game.activeCombat = {
        sectorId: sector.sectorId,
        attackingPlayerId: `${attackingPlayer.position}`,
        round,
        rebelCombatants: rebels,
        dictatorCombatants: dictator,
        rebelCasualties: allRebelCasualties,
        dictatorCasualties: allDictatorCasualties,
        dogAssignments: Array.from(dogState.assignments.entries()),
        dogs: dogState.dogs,
      };
      combatPending = true;
      game.message(`Round ${round} complete. You may retreat or continue fighting.`);
      break;
    }
  }

  // If combat is pending, don't apply final results yet
  if (combatPending) {
    return {
      rounds,
      rebelVictory: false,
      dictatorVictory: false,
      rebelCasualties: allRebelCasualties,
      dictatorCasualties: allDictatorCasualties,
      retreated: false,
      combatPending: true,
      canRetreat: retreatAvailable,
    };
  }

  // Clear any saved combat state
  game.activeCombat = null;

  // Apply results to game state
  applyCombatResults(game, sector, rebels, dictator, attackingPlayer);

  const aliveRebels = rebels.filter(c => c.health > 0);
  const aliveDictator = dictator.filter(c => c.health > 0);

  const outcome: CombatOutcome = {
    rounds,
    rebelVictory: aliveDictator.length === 0 && !didRetreat,
    dictatorVictory: aliveRebels.length === 0,
    rebelCasualties: allRebelCasualties,
    dictatorCasualties: allDictatorCasualties,
    retreated: didRetreat,
    retreatSector: retreatSector,
    combatPending: false,
    canRetreat: false,
  };

  if (outcome.rebelVictory) {
    game.message(`Rebels are victorious at ${sector.sectorName}!`);
  } else if (outcome.dictatorVictory) {
    game.message(`Dictator forces hold ${sector.sectorName}!`);
  } else if (outcome.retreated) {
    game.message(`Rebels have retreated to ${retreatSector?.sectorName}!`);
  }

  game.message(`=== Combat Complete ===`);

  return outcome;
}

/**
 * MERC-n1f: Execute retreat for active combat
 */
export function executeCombatRetreat(
  game: MERCGame,
  retreatSector: Sector
): CombatOutcome {
  if (!game.activeCombat) {
    throw new Error('No active combat to retreat from');
  }

  const combatSector = game.getSector(game.activeCombat.sectorId);
  if (!combatSector) {
    throw new Error('Combat sector not found');
  }

  const attackingPlayer = game.rebelPlayers.find(
    p => `${p.position}` === game.activeCombat!.attackingPlayerId
  );
  if (!attackingPlayer) {
    throw new Error('Attacking player not found');
  }

  // Execute the retreat
  executeRetreat(game, combatSector, retreatSector, attackingPlayer);

  // Apply combat results (casualties, etc.)
  const rebels = game.activeCombat.rebelCombatants as Combatant[];
  const dictator = game.activeCombat.dictatorCombatants as Combatant[];
  applyCombatResults(game, combatSector, rebels, dictator, attackingPlayer);

  // Clear combat state
  const rebelCasualties = game.activeCombat.rebelCasualties as Combatant[];
  const dictatorCasualties = game.activeCombat.dictatorCasualties as Combatant[];
  game.activeCombat = null;

  game.message(`=== Combat Complete (Retreated) ===`);

  return {
    rounds: [],
    rebelVictory: false,
    dictatorVictory: false,
    rebelCasualties,
    dictatorCasualties,
    retreated: true,
    retreatSector,
    combatPending: false,
    canRetreat: false,
  };
}

/**
 * Check if a sector has enemies to fight
 * MERC-7un: Also checks for dictator hired MERCs, not just militia and dictator card
 */
export function hasEnemies(game: MERCGame, sector: Sector, player: RebelPlayer): boolean {
  // Check for dictator militia
  if (sector.dictatorMilitia > 0) return true;

  // MERC-7un: Check for dictator hired MERCs
  const dictatorMercs = game.getDictatorMercsInSector(sector);
  if (dictatorMercs.length > 0) return true;

  // Check for dictator card at revealed base
  if (game.dictatorPlayer.baseRevealed &&
      game.dictatorPlayer.baseSectorId === sector.sectorId &&
      !game.dictatorPlayer.dictator?.isDead) {
    return true;
  }

  return false;
}

/**
 * Calculate expected combat advantage (for AI)
 */
export function calculateCombatOdds(
  game: MERCGame,
  sector: Sector,
  player: RebelPlayer
): { rebelStrength: number; dictatorStrength: number; advantage: number } {
  const { rebels, dictator } = getCombatants(game, sector, player);

  const rebelStrength = rebels.reduce((sum, c) => sum + c.combat * c.health, 0);
  const dictatorStrength = dictator.reduce((sum, c) => sum + c.combat * c.health, 0);

  return {
    rebelStrength,
    dictatorStrength,
    advantage: rebelStrength - dictatorStrength,
  };
}
