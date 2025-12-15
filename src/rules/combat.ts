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
  hasOneUseWeapon: boolean; // MERC-f0y: Weapon is one-use
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
 * MERC-dac: Check if a combatant is Badger
 */
function isBadger(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'badger';
  }
  return false;
}

/**
 * MERC-nvr: Check if a combatant is Kastern
 */
function isKastern(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'kastern';
  }
  return false;
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
 * MERC-cpb: Lucid hits on 3+ instead of 4+
 */
function countHitsForCombatant(rolls: number[], combatant: Combatant): number {
  const threshold = isLucid(combatant) ? 3 : CombatConstants.HIT_THRESHOLD;
  return rolls.filter(r => r >= threshold).length;
}

/**
 * MERC-5l3: Check if Basic should use reroll
 * Basic may reroll all dice once per combat
 * AI decision: reroll if hits are below expected value (50% hit rate)
 */
function shouldBasicReroll(combatant: Combatant, rolls: number[], hits: number): boolean {
  if (!isBasic(combatant) || combatant.hasUsedReroll) {
    return false;
  }
  // Expected hits at 50% hit rate
  const expectedHits = rolls.length * 0.5;
  // Reroll if significantly below expected (fewer than expected - 1)
  return hits < expectedHits - 0.5;
}

/**
 * MERC-9gl: Check if a combatant is Max
 */
function isMax(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === 'max';
  }
  return false;
}

/**
 * MERC-9gl: Apply Max's debuff to enemy attackers
 * Per rules: "-1 to enemy MERCs attacking his squad"
 * Only affects MERCs, not militia
 */
function applyMaxDebuff(enemies: Combatant[], allies: Combatant[]): void {
  // Check if Max is in the allies (defenders)
  const maxInSquad = allies.some(c => isMax(c) && c.health > 0);
  if (!maxInSquad) return;

  // Apply -1 combat to enemy MERCs (not militia)
  for (const enemy of enemies) {
    if (!enemy.isMilitia && !enemy.isDictator && !enemy.isAttackDog) {
      enemy.combat = Math.max(0, enemy.combat - 1);
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
 */
function hasHandgun(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    const weapon = combatant.sourceElement.weaponSlot;
    return weapon?.equipmentName.toLowerCase().includes('handgun') ?? false;
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
 */
function hasUzi(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    const weapon = combatant.sourceElement.weaponSlot;
    return weapon?.equipmentName.toLowerCase().includes('uzi') ?? false;
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
    return combatant.sourceElement.accessorySlot !== undefined;
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
 */
function hasExplosive(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    const weapon = combatant.sourceElement.weaponSlot;
    if (!weapon) return false;
    const name = weapon.equipmentName.toLowerCase();
    return name.includes('grenade') || name.includes('mortar');
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
 */
function isDutchUsingFists(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    const weapon = combatant.sourceElement.weaponSlot;
    // No weapon or sword equipped
    if (!weapon) return true;
    const name = weapon.equipmentName.toLowerCase();
    return name.includes('sword');
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
 */
function hasSmaw(combatant: Combatant): boolean {
  if (combatant.sourceElement instanceof MercCard) {
    const weapon = combatant.sourceElement.weaponSlot;
    return weapon?.equipmentName.toLowerCase().includes('smaw') ?? false;
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
      const primaryMercs = rebel.primarySquad.getMercs().filter(m => !m.isDead);
      const secondaryMercs = rebel.secondarySquad.getMercs().filter(m => !m.isDead);

      let squadMates: MercCard[] | null = null;
      if (primaryMercs.includes(sargeMerc)) {
        squadMates = primaryMercs;
      } else if (secondaryMercs.includes(sargeMerc)) {
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
      const primaryMercs = rebel.primarySquad.getMercs().filter(m => !m.isDead);
      const secondaryMercs = rebel.secondarySquad.getMercs().filter(m => !m.isDead);

      let squadMates: MercCard[] | null = null;
      if (primaryMercs.includes(tackMerc)) {
        squadMates = primaryMercs;
      } else if (secondaryMercs.includes(tackMerc)) {
        squadMates = secondaryMercs;
      }

      if (squadMates) {
        // Check if Tack has highest initiative
        const maxInitiative = Math.max(...squadMates.map(m => m.initiative));
        if (tackMerc.initiative >= maxInitiative) {
          // Apply +2 initiative to all squad mates (including Tack)
          for (const combatant of combatants) {
            if (combatant.sourceElement instanceof MercCard &&
                squadMates.includes(combatant.sourceElement) &&
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
      const primaryMercs = rebel.primarySquad.getMercs().filter(m => !m.isDead);
      const secondaryMercs = rebel.secondarySquad.getMercs().filter(m => !m.isDead);

      let squadMates: MercCard[] | null = null;
      if (primaryMercs.includes(valkyrieMerc)) {
        squadMates = primaryMercs;
      } else if (secondaryMercs.includes(valkyrieMerc)) {
        squadMates = secondaryMercs;
      }

      if (squadMates) {
        // Apply +1 initiative to all squad mates (except Valkyrie herself)
        for (const combatant of combatants) {
          if (combatant.sourceElement instanceof MercCard &&
              squadMates.includes(combatant.sourceElement) &&
              combatant.sourceElement !== valkyrieMerc &&
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
      const primaryMercs = rebel.primarySquad.getMercs().filter(m => !m.isDead);
      const secondaryMercs = rebel.secondarySquad.getMercs().filter(m => !m.isDead);

      let squadMates: MercCard[] | null = null;
      if (primaryMercs.includes(tavistoMerc)) {
        squadMates = primaryMercs;
      } else if (secondaryMercs.includes(tavistoMerc)) {
        squadMates = secondaryMercs;
      }

      if (squadMates) {
        // Check if any woman in squad (check mercs.json sex field)
        // We'll need to get MERC data from JSON which includes sex field
        const hasWoman = squadMates.some(m => {
          // Use the mercId to check against known female MERCs
          // Female MERCs have "sex": "F" in mercs.json
          const femaleMercs = ['ewok', 'faustina', 'natasha', 'sonia', 'tack', 'teresa', 'valkyrie', 'adelheid'];
          return femaleMercs.includes(m.mercId) && m !== tavistoMerc;
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
      // Calculate total negative initiative from equipment
      let penalty = 0;
      if (merc.weaponSlot?.initiative && merc.weaponSlot.initiative < 0) {
        penalty += merc.weaponSlot.initiative;
      }
      if (merc.armorSlot?.initiative && merc.armorSlot.initiative < 0) {
        penalty += merc.armorSlot.initiative;
      }
      if (merc.accessorySlot?.initiative && merc.accessorySlot.initiative < 0) {
        penalty += merc.accessorySlot.initiative;
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
    if (rebel.team.includes(walterMerc)) {
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
 * MERC-nvr: Kastern always goes first in combat
 * MERC-dac: Badger always has initiative over militia
 */
function sortByInitiative(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => {
    // MERC-nvr: Kastern ALWAYS goes first in combat (highest priority)
    const aIsKastern = isKastern(a);
    const bIsKastern = isKastern(b);
    if (aIsKastern && !bIsKastern) return -1; // Kastern before everyone
    if (bIsKastern && !aIsKastern) return 1;  // Everyone after Kastern

    // MERC-dac: Badger always goes before militia
    const aIsBadger = isBadger(a);
    const bIsBadger = isBadger(b);
    if (aIsBadger && b.isMilitia) return -1; // Badger before militia
    if (bIsBadger && a.isMilitia) return 1;  // Militia after Badger

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
  return merc.accessorySlot?.equipmentId === ATTACK_DOG_ID;
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
 * MERC-f0y: Includes hasOneUseWeapon flag
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
    hasOneUseWeapon: merc.weaponSlot?.isOneUse ?? false, // MERC-f0y
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
    hasOneUseWeapon: false,
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
      hasOneUseWeapon: false,
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
    hasOneUseWeapon: false,
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
    combatant.hasOneUseWeapon = merc.weaponSlot?.isOneUse ?? false;
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
      if (primaryMercs.includes(snakeMerc)) {
        // Snake is in primary squad - check if alone
        if (primaryMercs.filter(m => !m.isDead).length === 1) {
          // Snake is alone in his squad - apply +1 to all stats
          snake.initiative += 1;
          snake.combat += 1;
          // Note: Training bonus applied separately for train action
        }
        break;
      }

      // Check secondary squad
      const secondaryMercs = rebel.secondarySquad.getMercs();
      if (secondaryMercs.includes(snakeMerc)) {
        // Snake is in secondary squad - check if alone
        if (secondaryMercs.filter(m => !m.isDead).length === 1) {
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
 */
export function canRetreat(
  game: MERCGame,
  sector: Sector,
  player: RebelPlayer
): boolean {
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

  // Add dictator card if base is revealed and at this sector
  if (game.dictatorPlayer.baseRevealed && game.dictatorPlayer.baseSectorId === sector.sectorId) {
    const dictatorCard = game.dictatorPlayer.dictator;
    if (dictatorCard && !dictatorCard.isDead) {
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

  // MERC-qh3: Runde is always the last MERC targeted
  // Sort targets so Runde is at the end (only targeted if no other MERCs available)
  const sortedForRunde = [...aliveEnemies].sort((a, b) => {
    const aIsRunde = isRunde(a);
    const bIsRunde = isRunde(b);
    if (aIsRunde && !bIsRunde) return 1;  // Runde goes to end
    if (bIsRunde && !aIsRunde) return -1; // Non-Runde goes first
    return 0;
  });

  // If attacker is rebel and dictator is present, check protection rule
  if (!attacker.isDictatorSide) {
    const canHitDictator = canTargetDictator(sortedForRunde);
    const validTargets = canHitDictator
      ? sortedForRunde
      : sortedForRunde.filter(e => !e.isDictator);

    return validTargets.slice(0, maxTargets);
  }

  // MERC-0q8: Dictator AI uses priority targeting
  // Still apply Runde protection by sorting first
  const prioritized = sortTargetsByAIPriority(sortedForRunde);
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
 * If combatant has a dog assigned to them, they MUST target the dog
 */
function selectTargetsWithDogs(
  attacker: Combatant,
  enemies: Combatant[],
  maxTargets: number,
  dogState: AttackDogState
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

  // Normal target selection
  return selectTargets(attacker, enemies, maxTargets);
}

/**
 * Execute a single combat round
 * MERC-l09: Includes Attack Dog mechanics
 */
function executeCombatRound(
  roundNumber: number,
  rebels: Combatant[],
  dictatorSide: Combatant[],
  game: MERCGame,
  dogState?: AttackDogState
): CombatRound {
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

  // MERC-9gl: Apply Max's debuff to enemy attackers
  // Rebels attacking dictator side: if Max is in dictator side, debuff rebel MERCs
  applyMaxDebuff(rebels, dictatorSide);
  // Dictator attacking rebels: if Max is in rebel side, debuff dictator MERCs
  applyMaxDebuff(dictatorSide, rebels);

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
  const results: CombatResult[] = [];
  const casualties: Combatant[] = [];
  let dogIndex = 0;

  for (const attacker of allCombatants) {
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

    // MERC-l09: Before attacking, assign Attack Dog if available
    if (attacker.hasAttackDog) {
      assignAttackDog(attacker, enemies, activeDogState, game, dogIndex++);
    }

    // MERC-l09: Select targets considering dog assignments
    const targets = selectTargetsWithDogs(attacker, enemies, attacker.targets, activeDogState);

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
    let rolls = rollDice(attacker.combat);
    let hits = countHitsForCombatant(rolls, attacker);
    game.message(`${attacker.name} rolls [${rolls.join(', ')}] - ${hits} hit(s)`);

    // MERC-5l3: Basic may reroll all dice once per combat
    if (shouldBasicReroll(attacker, rolls, hits)) {
      game.message(`${attacker.name} uses reroll ability!`);
      attacker.hasUsedReroll = true;
      rolls = rollDice(attacker.combat);
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

    const damageDealt = new Map<string, number>();

    // MERC-9mpr: Add additional targets for Wolverine's 6s
    let expandedTargets = [...targets];
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

    // Distribute hits among targets
    let remainingHits = hits;
    for (const target of expandedTargets) {
      if (remainingHits <= 0) break;

      // MERC-38e: Pass armorPiercing flag to applyDamage
      const damage = applyDamage(target, remainingHits, game, attacker.armorPiercing);
      damageDealt.set(target.id, damage);

      if (target.health <= 0) {
        // MERC-clsx: Adelheid converts militia instead of killing
        if (isAdelheid(attacker) && target.isMilitia && !attacker.isDictatorSide) {
          // Convert militia to rebel's side
          const attackerMerc = attacker.sourceElement as MercCard;
          const ownerPlayer = game.rebelPlayers.find(p =>
            p.team.includes(attackerMerc)
          );
          if (ownerPlayer && sector) {
            // Remove dictator militia
            sector.dictatorMilitia--;
            // Add to rebel militia
            sector.addRebelMilitia(`${ownerPlayer.position}`, 1);
            game.message(`${attacker.name} converts ${target.name} to her side!`);
            // Don't add to casualties - militia is converted, not killed
          } else {
            casualties.push(target);
            game.message(`${attacker.name} kills ${target.name}!`);
          }
        } else {
          casualties.push(target);
          game.message(`${attacker.name} kills ${target.name}!`);

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

    // MERC-f0y: Consume one-use weapon after attack
    if (attacker.hasOneUseWeapon && attacker.sourceElement instanceof MercCard) {
      const merc = attacker.sourceElement;
      if (merc.weaponSlot?.isOneUse) {
        game.message(`${merc.mercName}'s ${merc.weaponSlot.equipmentName} is used up!`);
        const weapon = merc.unequip('Weapon');
        if (weapon) {
          const discard = game.getEquipmentDiscard('Weapon');
          if (discard) weapon.putInto(discard);
        }
        // Mark combatant as no longer having one-use weapon for subsequent rounds
        attacker.hasOneUseWeapon = false;
        attacker.armorPiercing = false; // One-use weapons lose their effects
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
    const rolls = rollDice(vandal.combat);
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

  return { roundNumber, results, casualties };
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
  for (const combatant of [...rebels, ...dictatorSide]) {
    if (combatant.sourceElement instanceof MercCard) {
      const merc = combatant.sourceElement;
      const damageTaken = combatant.maxHealth - combatant.health;
      merc.damage = damageTaken;

      // MERC-4ib: Handle MERC death - discard card and equipment
      if (combatant.health <= 0) {
        // MERC-594: Check if epinephrine can save this MERC
        let savedByEpinephrine = false;

        if (combatant.isDictatorSide && game.dictatorPlayer?.isAI) {
          // AI dictator auto-uses epinephrine per rules 4.9
          const squadMercs = game.dictatorPlayer.hiredMercs.filter(m => !m.isDead);
          const mercWithEpi = shouldUseEpinephrine(merc, squadMercs);
          if (mercWithEpi) {
            // Use the epinephrine shot
            const epiShot = mercWithEpi.accessorySlot;
            if (epiShot) {
              mercWithEpi.unequip('Accessory');
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
          for (const rebel of game.rebelPlayers) {
            if (rebel.team.includes(merc)) {
              const squadMercs = rebel.team.filter(m => !m.isDead);
              const mercWithEpi = hasEpinephrineShot(squadMercs);
              if (mercWithEpi && mercWithEpi !== merc) {
                // Use the epinephrine shot
                const epiShot = mercWithEpi.accessorySlot;
                if (epiShot) {
                  mercWithEpi.unequip('Accessory');
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
          merc.isDead = true;

          // Discard all equipment
          const equipmentTypes: Array<'Weapon' | 'Armor' | 'Accessory'> = ['Weapon', 'Armor', 'Accessory'];
          for (const eqType of equipmentTypes) {
            const equipment = merc.unequip(eqType);
            if (equipment) {
              const discard = game.getEquipmentDiscard(eqType);
              if (discard) equipment.putInto(discard);
            }
          }

          // Remove from owner's team and put in discard
          if (combatant.isDictatorSide) {
            // Remove from dictator's hired MERCs
            const idx = game.dictatorPlayer.hiredMercs.indexOf(merc);
            if (idx >= 0) {
              game.dictatorPlayer.hiredMercs.splice(idx, 1);
            }
          } else {
            // Remove from rebel's team
            for (const rebel of game.rebelPlayers) {
              const idx = rebel.team.indexOf(merc);
              if (idx >= 0) {
                rebel.team.splice(idx, 1);
                break;
              }
            }
          }

          // Put MERC card in discard pile
          merc.putInto(game.mercDiscard);
          game.message(`${merc.mercName} has been killed in combat!`);
        }
      }
    } else if (combatant.sourceElement instanceof DictatorCard) {
      const dictator = combatant.sourceElement;
      const damageTaken = combatant.maxHealth - combatant.health;
      dictator.damage = damageTaken;

      // Handle dictator death
      if (combatant.health <= 0) {
        dictator.isDead = true;
        game.message(`THE DICTATOR HAS BEEN KILLED! REBELS WIN!`);
      }
    }
  }

  // Update dictator militia count
  const survivingDictatorMilitia = dictatorSide.filter(c => c.isMilitia && c.health > 0).length;
  sector.dictatorMilitia = survivingDictatorMilitia;

  // Update militia for ALL rebel players who had militia in combat (coordinated attacks)
  for (const rebel of game.rebelPlayers) {
    const playerId = `${rebel.position}`;
    const survivingMilitia = rebels.filter(
      c => c.isMilitia && c.health > 0 && c.ownerId === playerId
    ).length;
    sector.rebelMilitia.set(playerId, survivingMilitia);
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
    startRound = game.activeCombat.round + 1;

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

    // MERC-b65: AI detonates land mines before combat begins
    detonateLandMines(game, sector, attackingPlayer);
  }

  let retreatSector: Sector | undefined;
  let didRetreat = false;
  let combatPending = false;
  let retreatAvailable = false;

  for (let round = startRound; round <= maxRounds; round++) {
    game.message(`--- Round ${round} ---`);

    // MERC-l09: Pass dog state to combat round
    const roundResult = executeCombatRound(round, rebels, dictator, game, dogState);
    rounds.push(roundResult);

    // Track casualties
    for (const casualty of roundResult.casualties) {
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
      // Save combat state and pause for player decision
      game.activeCombat = {
        sectorId: sector.sectorId,
        attackingPlayerId: `${attackingPlayer.position}`,
        round,
        rebelCombatants: rebels,
        dictatorCombatants: dictator,
        rebelCasualties: allRebelCasualties,
        dictatorCasualties: allDictatorCasualties,
        // MERC-l09: Save dog state
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
