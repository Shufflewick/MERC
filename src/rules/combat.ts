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
import { Sector, Militia, CombatantModel, Equipment } from './elements.js';
import { isEpinephrine } from './equipment-effects.js';
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
  isAttackDog as checkIsAttackDog,
  discardAfterAttack as checkDiscardAfterAttack,
  isHealingItem,
  getHealingEffect,
} from './equipment-effects.js';
import { capitalize } from './actions/helpers.js';

// Re-export types from combat-types.ts for backwards compatibility
export type { Combatant, CombatResult, CombatRound, CombatOutcome } from './combat-types.js';
import type { Combatant, CombatResult, CombatRound, CombatOutcome } from './combat-types.js';

// Re-export retreat functions from combat-retreat.ts for backwards compatibility
export { getValidRetreatSectors, canRetreat, executeRetreat } from './combat-retreat.js';
import { getValidRetreatSectors, canRetreat as canRetreatFromModule, executeRetreat } from './combat-retreat.js';

// =============================================================================
// Combat Animation Events - Uses BoardSmith v2.4 Animation Event System
// =============================================================================

/**
 * Clear activeCombat state.
 * Animation events are handled by BoardSmith's game.emitAnimationEvent() system.
 */
export function clearActiveCombat(game: MERCGame): void {
  game.activeCombat = null;
}

// =============================================================================
// Combat Helpers
// =============================================================================

/**
 * Roll a single d6 using game's seeded random
 */
function rollDie(game: MERCGame): number {
  return Math.floor(game.random() * CombatConstants.DICE_SIDES) + 1;
}

/**
 * Roll multiple dice using game's seeded random
 */
function rollDice(count: number, game: MERCGame): number[] {
  return Array.from({ length: count }, () => rollDie(game));
}

/**
 * Count hits from dice rolls (4+ is a hit)
 */
function countHits(rolls: number[]): number {
  return rolls.filter(r => r >= CombatConstants.HIT_THRESHOLD).length;
}

/**
 * Get combatantId from a combatant (undefined if militia/other)
 */
function getCombatantId(combatant: Combatant): string | undefined {
  return combatant.sourceElement?.isMerc
    ? combatant.sourceElement.combatantId
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
 * Check if combatant has a specific combatantId
 */
function isMerc(combatant: Combatant, combatantId: string): boolean {
  return getCombatantId(combatant) === combatantId;
}

/**
 * MERC-cpb: Check if a combatant is Lucid
 */
function isLucid(combatant: Combatant): boolean {
  if (combatant.sourceElement?.isMerc) {
    return combatant.sourceElement.combatantId === 'lucid';
  }
  return false;
}

/**
 * MERC-5l3: Check if a combatant is Basic
 */
function isBasic(combatant: Combatant): boolean {
  if (combatant.sourceElement?.isMerc) {
    return combatant.sourceElement.combatantId === 'basic';
  }
  return false;
}

/**
 * Count hits from dice rolls
 * Uses registry to get hit threshold (e.g., Lucid hits on 3+)
 * MERC-7zax: Dictator militia hit on 3+ when Better Weapons is active
 */
function countHitsForCombatant(rolls: number[], combatant: Combatant, game?: MERCGame): number {
  const combatantId = combatant.sourceElement?.isMerc
    ? combatant.sourceElement.combatantId
    : undefined;

  // MERC-7zax: Better Weapons gives dictator militia 3+ hit threshold
  if (combatant.isMilitia && combatant.isDictatorSide && game?.betterWeaponsActive) {
    return rolls.filter(r => r >= 3).length;
  }

  const threshold = combatantId ? getHitThreshold(combatantId) : CombatConstants.HIT_THRESHOLD;
  return rolls.filter(r => r >= threshold).length;
}

/**
 * MERC-5l3: Check if combatant should use reroll
 * Uses registry to check if MERC can reroll (Basic)
 * AI decision: reroll if hits are below expected value (50% hit rate)
 */
function shouldUseReroll(combatant: Combatant, rolls: number[], hits: number): boolean {
  if (combatant.hasUsedReroll) return false;

  const combatantId = combatant.sourceElement?.isMerc
    ? combatant.sourceElement.combatantId
    : undefined;
  if (!combatantId || !canRerollOnce(combatantId)) return false;

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
    if (!ally.sourceElement?.isMerc) continue;

    const combatDebuff = getEnemyCombatDebuff(ally.sourceElement.combatantId);
    const initiativeDebuff = getEnemyInitiativeDebuff(ally.sourceElement.combatantId);
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
  if (combatant.sourceElement?.isMerc) {
    return combatant.sourceElement.combatantId === 'surgeon';
  }
  return false;
}

/**
 * MERC-7te: Surgeon can sacrifice a combat die to heal 1 damage to squad mate
 * Returns true if Surgeon used ability (combat reduced by 1)
 *
 * NOTE: This function only auto-heals for AI-controlled Surgeon.
 * Human-controlled Surgeon uses the combatSurgeonHeal action to choose targets.
 */
function applySurgeonHeal(
  game: MERCGame,
  surgeon: Combatant,
  allies: Combatant[]
): boolean {
  if (!isSurgeon(surgeon) || surgeon.combat <= 1) {
    return false;
  }

  // Only auto-heal for AI-controlled Surgeon
  // Human players use the combatSurgeonHeal action to choose targets
  const isAIControlled = surgeon.isDictatorSide && game.dictatorPlayer?.isAI;
  if (!isAIControlled) {
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
  if (mostDamaged.sourceElement?.isMerc) {
    mostDamaged.sourceElement.heal(1);
  }

  game.message(`${surgeon.name} sacrifices a die to heal ${mostDamaged.name} for 1`);
  return true;
}

/**
 * MERC-clsx: Check if a combatant is Adelheid
 */
function isAdelheid(combatant: Combatant): boolean {
  if (combatant.sourceElement?.isMerc) {
    return combatant.sourceElement.combatantId === 'adelheid';
  }
  return false;
}

/**
 * MERC-b9p4: Check if a combatant is Golem
 */
function isGolem(combatant: Combatant): boolean {
  if (combatant.sourceElement?.isMerc) {
    return combatant.sourceElement.combatantId === 'golem';
  }
  return false;
}

/**
 * MERC-2se: Check if a combatant is Buzzkill
 */
function isBuzzkill(combatant: Combatant): boolean {
  if (combatant.sourceElement?.isMerc) {
    return combatant.sourceElement.combatantId === 'buzzkill';
  }
  return false;
}

/**
 * MERC-ml7: Check if a combatant is Khenn
 */
function isKhenn(combatant: Combatant): boolean {
  if (combatant.sourceElement?.isMerc) {
    return combatant.sourceElement.combatantId === 'khenn';
  }
  return false;
}

/**
 * MERC-82k: Check if a combatant is Meatbop
 */
function isMeatbop(combatant: Combatant): boolean {
  if (combatant.sourceElement?.isMerc) {
    return combatant.sourceElement.combatantId === 'meatbop';
  }
  return false;
}

/**
 * MERC-82k: Check if Meatbop has an accessory equipped
 */
function hasAccessory(combatant: Combatant): boolean {
  if (combatant.sourceElement?.isMerc) {
    const merc = combatant.sourceElement;
    // Check accessory slot or bandolier slots
    return merc.accessorySlot !== undefined || merc.bandolierSlots.length > 0;
  }
  return false;
}

/**
 * MERC-qh3: Check if a combatant is Runde
 */
function isRunde(combatant: Combatant): boolean {
  if (combatant.sourceElement?.isMerc) {
    return combatant.sourceElement.combatantId === 'runde';
  }
  return false;
}

/**
 * MERC-djs0: Check if a combatant is Walter
 */
function isWalter(combatant: Combatant): boolean {
  if (combatant.sourceElement?.isMerc) {
    return combatant.sourceElement.combatantId === 'walter';
  }
  return false;
}

/**
 * MERC-9mpr: Check if a combatant is Wolverine
 */
function isWolverine(combatant: Combatant): boolean {
  if (combatant.sourceElement?.isMerc) {
    return combatant.sourceElement.combatantId === 'wolverine';
  }
  return false;
}

/**
 * MERC-ml7: Apply Khenn's random initiative
 * Khenn rolls a D6 at the beginning of combat for his initiative
 */
function applyKhennInitiative(combatants: Combatant[], game: MERCGame): void {
  for (const combatant of combatants) {
    if (isKhenn(combatant) && combatant.health > 0) {
      const roll = Math.floor(game.random() * 6) + 1;
      combatant.initiative = roll;
      game.message(`Khenn rolls ${roll} for initiative`);
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
  const walterMerc = walterCombatant.sourceElement as CombatantModel;
  let walterOwnerId: string | undefined;
  for (const rebel of game.rebelPlayers) {
    if (rebel.team.some(m => m.id === walterMerc.id)) {
      walterOwnerId = `${rebel.seat}`;
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
    const target = sortTargetsByAIPriority(aliveEnemies, game.random)[0];

    game.message(`${golem.name} strikes before combat begins!`);
    game.message(`${golem.name} targets: ${target.name}`);

    // Roll dice for pre-combat attack
    const rolls = rollDice(golem.combat, game);
    const hits = countHitsForCombatant(rolls, golem, game);
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
    const aCombatantId = getCombatantId(a);
    const bCombatantId = getCombatantId(b);

    // Check for "always goes first" ability (Kastern)
    const aFirst = aCombatantId ? alwaysGoesFirst(aCombatantId) : false;
    const bFirst = bCombatantId ? alwaysGoesFirst(bCombatantId) : false;
    if (aFirst && !bFirst) return -1;
    if (bFirst && !aFirst) return 1;

    // Check for "always before militia" ability (Badger)
    const aBeforeMilitia = aCombatantId ? alwaysBeforesMilitia(aCombatantId) : false;
    const bBeforeMilitia = bCombatantId ? alwaysBeforesMilitia(bCombatantId) : false;
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
function hasAttackDogEquipped(merc: CombatantModel): boolean {
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
function isImmuneToAttackDogs(merc: CombatantModel): boolean {
  const ability = merc.ability?.toLowerCase() ?? '';
  return ability.includes('immune to attack dogs');
}

/**
 * MERC-l09: Check if a MERC will not harm dogs (Tao)
 */
function willNotHarmDogs(merc: CombatantModel): boolean {
  const ability = merc.ability?.toLowerCase() ?? '';
  return ability.includes('will not harm dogs');
}

/**
 * Build combatant from a MERC card
 * MERC-38e: Includes armorPiercing from weapon
 * MERC-l09: Includes Attack Dog support
 */
function mercToCombatant(merc: CombatantModel, isDictatorSide: boolean, playerColor?: string): Combatant {
  return {
    id: String(merc.id),
    name: merc.combatantName,
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
    image: merc.image, // Portrait from JSON data
    combatantId: merc.combatantId, // MERC ID for identification
    playerColor, // Player color for UI
  };
}

/**
 * Build combatant from the Dictator card
 */
function dictatorToCombatant(dictator: CombatantModel, playerColor?: string): Combatant {
  return {
    id: String(dictator.id),
    name: dictator.combatantName,
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
    image: dictator.image, // Portrait from JSON data
    combatantId: dictator.combatantId, // Dictator ID for identification
    playerColor, // Player color for UI
  };
}

/**
 * Build combatants for militia
 * MERC-ohos: Veteran Militia gives dictator militia +1 initiative
 */
function militiaToCombatants(
  count: number,
  isDictatorSide: boolean,
  ownerId?: string,
  game?: MERCGame,
  playerColor?: string
): Combatant[] {
  const combatants: Combatant[] = [];

  // MERC-ohos: Veteran Militia gives dictator militia +1 initiative
  const baseInitiative = CombatConstants.MILITIA_INITIATIVE;
  const initiative = isDictatorSide && game?.veteranMilitiaActive
    ? baseInitiative + 1
    : baseInitiative;

  for (let i = 0; i < count; i++) {
    combatants.push({
      id: `militia-${isDictatorSide ? 'dictator' : ownerId}-${i}`,
      name: isDictatorSide ? 'Dictator Militia' : 'Rebel Militia',
      initiative,
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
      playerColor,
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
    image: '/equipment/attack dog.png',
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

  if (combatant.sourceElement?.isMerc) {
    const merc = combatant.sourceElement;
    // Refresh stats that can change with equipment
    combatant.initiative = merc.initiative;
    combatant.combat = merc.combat;
    combatant.targets = merc.targets;
    combatant.armor = merc.equipmentArmor;
    combatant.armorPiercing = merc.weaponSlot?.negatesArmor ?? false;
  } else if (combatant.sourceElement?.isDictator) {
    const dictator = combatant.sourceElement as CombatantModel;
    combatant.initiative = dictator.initiative;
    combatant.combat = dictator.combat;
    // Dictator targets and armor could be updated here if they get equipment
  }
}

/**
 * MERC-cm0: Check if a combatant is Haarg
 */
function isHaarg(combatant: Combatant): boolean {
  if (combatant.sourceElement?.isMerc) {
    return combatant.sourceElement.combatantId === 'haarg';
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
    const baseInitiative = haarg.sourceElement?.isMerc
      ? haarg.sourceElement.initiative : haarg.initiative;
    const baseCombat = haarg.sourceElement?.isMerc
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
 * MERC-zd5: Check if a combatant is Vandal
 */
function isVandal(combatant: Combatant): boolean {
  if (combatant.sourceElement?.isMerc) {
    return combatant.sourceElement.combatantId === 'vandal';
  }
  return false;
}

/**
 * Apply base defense bonuses from tactics cards (Generalisimo and Lockdown)
 * Only applies to dictator-side combatants at the base sector.
 *
 * Generalisimo: +1 combat to all dictator units at base
 * Lockdown: +1 armor to all dictator units at base
 */
function applyBaseDefenseBonuses(
  dictatorCombatants: Combatant[],
  sector: Sector,
  game: MERCGame
): void {
  // Only apply if combat is at the dictator's base
  const baseSectorId = game.dictatorPlayer?.baseSectorId;
  if (!baseSectorId || sector.sectorId !== baseSectorId) {
    return;
  }

  // Check which bonuses are active
  const hasGeneralisimo = game.generalisimoActive;
  const hasLockdown = game.lockdownActive;

  if (!hasGeneralisimo && !hasLockdown) {
    return;
  }

  // Apply bonuses to all dictator-side combatants
  for (const combatant of dictatorCombatants) {
    if (hasGeneralisimo) {
      combatant.combat += 1;
    }
    if (hasLockdown) {
      combatant.armor += 1;
    }
  }

  // Log the bonuses
  if (hasGeneralisimo) {
    game.message('Generalisimo: Dictator inspires troops (+1 combat to all defenders)');
  }
  if (hasLockdown) {
    game.message('Lockdown: Base defenses (+1 armor to all defenders)');
  }
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

  // Get dictator player color for dictator-side combatants
  const dictatorColor = game.dictatorPlayer.playerColor;

  // Add ALL rebel MERCs in the sector (coordinated attacks)
  for (const rebel of game.rebelPlayers) {
    const rebelColor = rebel.playerColor;
    const rebelMercs = game.getMercsInSector(sector, rebel);
    for (const merc of rebelMercs) {
      if (!merc.isDead) {
        rebels.push(mercToCombatant(merc, false, rebelColor));
      }
    }

    // Add this rebel's militia
    const rebelMilitia = sector.getRebelMilitia(`${rebel.seat}`);
    rebels.push(...militiaToCombatants(rebelMilitia, false, `${rebel.seat}`, game, rebelColor));
  }

  // Add dictator's militia
  // MERC-ohos: Veteran Militia applies +1 initiative if active
  dictator.push(...militiaToCombatants(sector.dictatorMilitia, true, undefined, game, dictatorColor));

  // Add dictator's MERCs if present at this sector
  const dictatorMercs = game.getDictatorMercsInSector(sector);
  for (const merc of dictatorMercs) {
    dictator.push(mercToCombatant(merc, true, dictatorColor));
  }

  // Add dictator card if in this sector (base revealed and dictator actually present)
  if (game.dictatorPlayer.baseRevealed) {
    const dictatorCard = game.dictatorPlayer.dictator;
    // Dictator must be alive AND actually in this sector
    if (dictatorCard && !dictatorCard.isDead && dictatorCard.sectorId === sector.sectorId) {
      dictator.push(dictatorToCombatant(dictatorCard, dictatorColor));
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
  if (combatant.sourceElement?.isMerc) {
    return combatant.sourceElement.combatantId === 'rizen';
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

  // Filter out "targeted last" MERCs (Runde) if other targets exist
  const nonTargetedLast = aliveEnemies.filter(t => {
    const combatantId = getCombatantId(t);
    return !combatantId || !isTargetedLast(combatantId);
  });

  // Only include "targeted last" MERCs if no other targets available
  const validTargets = nonTargetedLast.length > 0 ? nonTargetedLast : aliveEnemies;

  // Check dictator protection rule
  const canHitDictator = canTargetDictator(validTargets);
  return canHitDictator
    ? validTargets
    : validTargets.filter(e => !e.isDictator);
}

/**
 * MERC-t5k: Select targets using player selections if available
 */
function selectTargetsWithPlayerChoice(
  attacker: Combatant,
  enemies: Combatant[],
  maxTargets: number,
  game: MERCGame,
  selectedTargetIds?: string[]
): Combatant[] {
  // If player has selected targets, use those (for both rebels and human dictator)
  // The check for human control is done upstream when deciding to pause for selection
  if (selectedTargetIds && selectedTargetIds.length > 0) {
    const selectedTargets = enemies.filter(e => selectedTargetIds.includes(e.id) && e.health > 0);
    // Ensure we don't exceed maxTargets
    return selectedTargets.slice(0, maxTargets);
  }

  // Fall back to automatic selection
  return selectTargets(attacker, enemies, maxTargets, game);
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
  maxTargets: number,
  game: MERCGame
): Combatant[] {
  const aliveEnemies = enemies.filter(e => e.health > 0);

  // Filter out "targeted last" MERCs (Runde) if other targets exist
  // This must be applied before any special targeting logic
  const nonTargetedLast = aliveEnemies.filter(t => {
    const combatantId = getCombatantId(t);
    return !combatantId || !isTargetedLast(combatantId);
  });
  const validEnemies = nonTargetedLast.length > 0 ? nonTargetedLast : aliveEnemies;

  // MERC-dz0: Rizen can target ALL militia with his attack
  // Per rules: "each hit counts as a new target when attacking militia"
  if (isRizen(attacker)) {
    const militia = validEnemies.filter(e => e.isMilitia);
    const nonMilitia = validEnemies.filter(e => !e.isMilitia);
    // Rizen targets all militia plus normal targets for non-militia
    const rizenTargets = [...militia, ...nonMilitia.slice(0, maxTargets)];
    return rizenTargets;
  }

  // MERC-2se: Buzzkill always attacks enemy MERCs instead of militia when possible
  if (isBuzzkill(attacker)) {
    const mercs = validEnemies.filter(e => !e.isMilitia && !e.isAttackDog);
    const militia = validEnemies.filter(e => e.isMilitia || e.isAttackDog);
    // Prioritize MERCs, then militia
    const buzzkillTargets = [...mercs, ...militia].slice(0, maxTargets);
    return buzzkillTargets;
  }

  // If attacker is rebel and dictator is present, check protection rule
  if (!attacker.isDictatorSide) {
    const canHitDictator = canTargetDictator(validEnemies);
    const validTargets = canHitDictator
      ? validEnemies
      : validEnemies.filter(e => !e.isDictator);

    // MERC-fix: AI rebels also use priority targeting (lowest health+armor first)
    const prioritized = sortTargetsByAIPriority(validTargets, game.random);
    return prioritized.slice(0, maxTargets);
  }

  // MERC-0q8: Dictator AI uses priority targeting
  const prioritized = sortTargetsByAIPriority(validEnemies, game.random);
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
    if (target.armor <= 0 && target.sourceElement?.isMerc) {
      const merc = target.sourceElement;
      if (merc.armorSlot) {
        merc.armorSlot.isDamaged = true;
        game.message(`${merc.combatantName}'s ${merc.armorSlot.equipmentName} is destroyed!`);
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
  const sortedTargets = sortTargetsByAIPriority(validTargets, game.random);
  const target = sortedTargets[0];

  // Create the dog combatant
  const dog = createAttackDogCombatant(attacker.id, attacker.isDictatorSide, dogIndex);
  // Store target info for UI display
  dog.attackDogAssignedTo = target.id;
  dog.attackDogTargetName = target.name.charAt(0).toUpperCase() + target.name.slice(1);

  // Track the assignment
  dogState.assignments.set(target.id, dog);
  dogState.dogs.push(dog);

  // Emit animation event for UI
  game.emitAnimationEvent('combat-attack-dog', {
    attackerName: attacker.name.charAt(0).toUpperCase() + attacker.name.slice(1),
    attackerId: attacker.id,
    attackerImage: attacker.image,
    targetName: target.name.charAt(0).toUpperCase() + target.name.slice(1),
    targetId: target.id,
    targetImage: target.image,
    dogId: dog.id,
    dogImage: dog.image,
  });

  game.message(`${attacker.name} releases Attack Dog on ${target.name}!`);
  game.message(`${target.name} must attack the dog before doing anything else.`);

  // Mark attacker as having used their dog
  attacker.hasAttackDog = false;

  return dog;
}

/**
 * MERC-l09: Assign Attack Dog to a specific target (for human player selection)
 * Similar to assignAttackDog but uses player-selected target instead of AI priority
 */
function assignAttackDogToTarget(
  attacker: Combatant,
  enemies: Combatant[],
  dogState: AttackDogState,
  game: MERCGame,
  dogIndex: number,
  targetId: string
): Combatant | null {
  if (!attacker.hasAttackDog) return null;

  // Find the target from enemies
  const target = enemies.find(e =>
    e.id === targetId &&
    e.health > 0 &&
    !e.isMilitia &&
    !e.isAttackDog &&
    !e.isImmuneToAttackDogs &&
    !dogState.assignments.has(e.id)
  );

  if (!target) return null;

  // Create the dog combatant
  const dog = createAttackDogCombatant(attacker.id, attacker.isDictatorSide, dogIndex);
  // Store target info for UI display
  dog.attackDogAssignedTo = target.id;
  dog.attackDogTargetName = target.name.charAt(0).toUpperCase() + target.name.slice(1);

  // Track the assignment
  dogState.assignments.set(target.id, dog);
  dogState.dogs.push(dog);

  // Emit animation event for UI
  game.emitAnimationEvent('combat-attack-dog', {
    attackerName: attacker.name.charAt(0).toUpperCase() + attacker.name.slice(1),
    attackerId: attacker.id,
    attackerImage: attacker.image,
    targetName: target.name.charAt(0).toUpperCase() + target.name.slice(1),
    targetId: target.id,
    targetImage: target.image,
    dogId: dog.id,
    dogImage: dog.image,
  });

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
  game: MERCGame,
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
  return selectTargetsWithPlayerChoice(attacker, enemies, maxTargets, game, selectedTargetIds);
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
  // MERC-l09: Pause for Attack Dog assignment (human players choose target)
  pausedForAttackDogSelection?: {
    attackerId: string;
    attackerName: string;
    attackerIndex: number;
    validTargets: Combatant[]; // Enemy MERCs the dog can be assigned to
    dogId?: string; // MERC-l09: ID of the created dog awaiting target
  };
  // MERC-dice: Pause for hit allocation
  pausedForHitAllocation?: boolean;
  currentAttackerIndex?: number;
  // Pause for Epinephrine choice
  pausedForEpinephrine?: boolean;
  // Pause for before-attack healing decision (Medical Kit, First Aid Kit, Surgeon)
  pausedForBeforeAttackHealing?: {
    attackerId: string;
    attackerName: string;
    attackerIndex: number;
  };
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
    playerSelectedDogTargets?: Map<string, string>; // attackerId -> target combatant ID for dog
    interactive?: boolean; // Whether to pause for player target selection
    attackingPlayerIsRebel?: boolean; // True if rebel initiated combat, false if dictator
  }
): CombatRoundResult {
  const {
    startIndex = 0,
    partialResults = [],
    partialCasualties = [],
    playerSelectedTargets,
    playerSelectedDogTargets,
    interactive = true,
    attackingPlayerIsRebel = true, // Default to rebel (most common case)
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
  // Haarg compares to ALL combatants per rules, not just squad (unlike card display)
  applyHaargBonus([...rebels, ...dictatorSide]);

  // Apply enemy debuffs from registry (e.g., Max's -1 combat to enemy MERCs)
  applyEnemyDebuffs(rebels, dictatorSide);
  applyEnemyDebuffs(dictatorSide, rebels);

  // MERC-djs0: Apply Walter's militia initiative bonus (militia not tracked by CombatantModel)
  applyWalterBonus(game, [...rebels, ...dictatorSide]);

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

    // MERC-t5k: Check if this unit needs player target selection
    // Use property-based type checking for bundler compatibility
    const hasMercSource = attacker.sourceElement?.isMerc ?? false;
    const hasDictatorSource = attacker.sourceElement?.isDictator ?? false;
    const isRebelMerc = !attacker.isDictatorSide && !attacker.isMilitia && hasMercSource;
    const isDictatorMercOrDictator = attacker.isDictatorSide && !attacker.isMilitia && (hasMercSource || hasDictatorSource);
    const isDictatorMilitia = attacker.isDictatorSide && attacker.isMilitia;

    // MERC-fix: For rebel mercs, find the owning player and check if they're AI
    let isRebelHumanControlled = false;
    if (isRebelMerc && hasMercSource) {
      const attackerMerc = attacker.sourceElement as CombatantModel;
      const ownerPlayer = game.rebelPlayers.find(p =>
        p.team.some(m => m.id === attackerMerc.id)
      );
      isRebelHumanControlled = !!(ownerPlayer && !ownerPlayer.isAI);
    }
    // Dictator-controlled includes MERCs, dictator card, AND militia when human player
    const isDictatorHumanControlled = (isDictatorMercOrDictator || isDictatorMilitia) && !game.dictatorPlayer?.isAI;

    // Only pause for target selection if:
    // 1. Unit is human controlled AND
    // 2. Unit belongs to the attacking side (defending units auto-target to avoid cross-turn issues)
    const isOnAttackingSide = attackingPlayerIsRebel ? !attacker.isDictatorSide : attacker.isDictatorSide;
    const isHumanControlled = isRebelHumanControlled || isDictatorHumanControlled;
    const hasSelectedTargets = playerSelectedTargets?.has(attacker.id);

    // BEFORE-ATTACK HEALING: Check if we need to pause for healing before this attacker acts
    // Only for human-controlled MERCs on the attacking side
    if (interactive && isHumanControlled && isOnAttackingSide && !attacker.isMilitia && hasMercSource) {
      // Check if we've already handled this attacker's healing phase
      const hasProcessedHealing = game.activeCombat?.beforeAttackHealingProcessed?.has(attacker.id);

      if (!hasProcessedHealing) {
        // Get all allied combatants on this side
        const alliedCombatants = attacker.isDictatorSide ? dictatorSide : rebels;

        // Find all healers among allies (MERCs with healing items and dice available)
        const availableHealers: Array<{
          healerId: string;
          healerName: string;
          healingItemId: string;
          itemName: string;
          usesRemaining: number;
          dicePerHeal: number;
          healPerUse: number;
          combatant: Combatant;
        }> = [];

        for (const ally of alliedCombatants) {
          if (ally.health <= 0) continue;
          if (!ally.sourceElement) continue;
          const sourceElem = ally.sourceElement as CombatantModel;
          if (!sourceElem.isMerc) continue;

          // Check dice available for this healer
          const diceUsed = game.activeCombat?.healingDiceUsed?.get(ally.id) ?? 0;
          const availableDice = ally.combat - diceUsed;

          // Check accessory slot for healing items
          if (sourceElem.accessorySlot && isHealingItem(sourceElem.accessorySlot.equipmentId)) {
            const effect = getHealingEffect(sourceElem.accessorySlot.equipmentId);
            if (effect && availableDice >= effect.dicePerHeal) {
              const uses = sourceElem.accessorySlot.usesRemaining ?? effect.totalUses;
              if (uses > 0) {
                availableHealers.push({
                  healerId: ally.id,
                  healerName: capitalize(sourceElem.combatantName),
                  healingItemId: sourceElem.accessorySlot.equipmentId,
                  itemName: sourceElem.accessorySlot.equipmentName,
                  usesRemaining: uses,
                  dicePerHeal: effect.dicePerHeal,
                  healPerUse: effect.healPerUse,
                  combatant: ally,
                });
              }
            }
          }

          // Check bandolier slots for healing items
          for (const bSlot of sourceElem.bandolierSlots) {
            if (isHealingItem(bSlot.equipmentId)) {
              const effect = getHealingEffect(bSlot.equipmentId);
              if (effect && availableDice >= effect.dicePerHeal) {
                const uses = bSlot.usesRemaining ?? effect.totalUses;
                if (uses > 0) {
                  availableHealers.push({
                    healerId: ally.id,
                    healerName: capitalize(sourceElem.combatantName),
                    healingItemId: bSlot.equipmentId,
                    itemName: bSlot.equipmentName,
                    usesRemaining: uses,
                    dicePerHeal: effect.dicePerHeal,
                    healPerUse: effect.healPerUse,
                    combatant: ally,
                  });
                }
              }
            }
          }
        }

        // Find damaged allies
        const damagedAllies: Array<{
          id: string;
          name: string;
          currentHealth: number;
          maxHealth: number;
          damage: number;
        }> = [];

        for (const ally of alliedCombatants) {
          if (ally.health <= 0) continue;
          if (ally.health >= ally.maxHealth) continue;
          if (!ally.sourceElement) continue;
          const sourceElem = ally.sourceElement as CombatantModel;
          if (!sourceElem.isMerc) continue;

          damagedAllies.push({
            id: ally.id,
            name: capitalize(sourceElem.combatantName),
            currentHealth: ally.health,
            maxHealth: ally.maxHealth,
            damage: ally.maxHealth - ally.health,
          });
        }

        // If we have both healers and damaged allies, pause for healing decision
        if (availableHealers.length > 0 && damagedAllies.length > 0) {
          // Set the pending state - strip combatant from healers for serialization
          game.activeCombat!.pendingBeforeAttackHealing = {
            attackerId: attacker.id,
            attackerName: capitalize(attacker.name),
            availableHealers: availableHealers.map(h => ({
              healerId: h.healerId,
              healerName: h.healerName,
              healingItemId: h.healingItemId,
              itemName: h.itemName,
              usesRemaining: h.usesRemaining,
              dicePerHeal: h.dicePerHeal,
              healPerUse: h.healPerUse,
            })),
            damagedAllies,
          };

          return {
            round: { roundNumber, results, casualties },
            complete: false,
            pausedForBeforeAttackHealing: {
              attackerId: attacker.id,
              attackerName: capitalize(attacker.name),
              attackerIndex: i,
            },
          };
        }
      }
    }

    // MERC-l09: Before attacking, assign Attack Dog if available (MUST come before target selection)
    if (attacker.hasAttackDog) {
      // Check if player already selected a target for the dog
      const playerDogTargetId = playerSelectedDogTargets?.get(attacker.id);

      if (playerDogTargetId) {
        // MERC-l09: Player already chose - find existing pending dog and assign target
        const existingDog = activeDogState.dogs.find(d => d.ownerId === attacker.id && d.attackDogPendingTarget);

        if (existingDog) {
          // Find the target
          const target = enemies.find(e =>
            e.id === playerDogTargetId &&
            e.health > 0 &&
            !e.isMilitia &&
            !e.isAttackDog &&
            !e.isImmuneToAttackDogs
          );

          if (target) {
            // Assign target to existing dog
            existingDog.attackDogAssignedTo = target.id;
            existingDog.attackDogTargetName = target.name.charAt(0).toUpperCase() + target.name.slice(1);
            existingDog.attackDogPendingTarget = false;
            activeDogState.assignments.set(target.id, existingDog);

            // MERC-l09: Also update the dog in combatant arrays (may be different object after deserialization)
            const combatantArrays = existingDog.isDictatorSide ? dictatorSide : rebels;
            const dogInCombatants = combatantArrays.find(c => c.id === existingDog.id);
            if (dogInCombatants) {
              dogInCombatants.attackDogAssignedTo = target.id;
              dogInCombatants.attackDogTargetName = existingDog.attackDogTargetName;
              dogInCombatants.attackDogPendingTarget = false;
            }

            // Emit animation event for UI
            game.emitAnimationEvent('combat-attack-dog', {
              attackerName: attacker.name.charAt(0).toUpperCase() + attacker.name.slice(1),
              attackerId: attacker.id,
              attackerImage: attacker.image,
              targetName: target.name.charAt(0).toUpperCase() + target.name.slice(1),
              targetId: target.id,
              targetImage: target.image,
              dogId: existingDog.id,
              dogImage: existingDog.image,
            });

            game.message(`${attacker.name} releases Attack Dog on ${target.name}!`);
            game.message(`${target.name} must attack the dog before doing anything else.`);

            // Mark attacker as having used their dog
            attacker.hasAttackDog = false;
          }
        } else {
          // Fallback: create new dog (handles edge cases or data loss)
          const dog = assignAttackDogToTarget(attacker, enemies, activeDogState, game, dogIndex++, playerDogTargetId);
          if (dog) {
            if (dog.isDictatorSide) {
              dictatorSide.push(dog);
            } else {
              rebels.push(dog);
            }
          }
        }
      } else if (interactive && isHumanControlled) {
        // Human player needs to choose - pause for dog assignment
        const validDogTargets = enemies.filter(e =>
          e.health > 0 &&
          !e.isMilitia &&
          !e.isAttackDog &&
          !e.isImmuneToAttackDogs &&
          !activeDogState.assignments.has(e.id)
        );

        if (validDogTargets.length > 0) {
          // MERC-l09: Create the dog NOW so it shows in UI during target selection
          const dog = createAttackDogCombatant(attacker.id, attacker.isDictatorSide, dogIndex++);
          dog.attackDogPendingTarget = true; // Flag: awaiting target selection
          activeDogState.dogs.push(dog);

          // Add to combatant arrays for UI display
          if (dog.isDictatorSide) {
            dictatorSide.push(dog);
          } else {
            rebels.push(dog);
          }

          // Pause for player to choose dog target
          return {
            round: { roundNumber, results, casualties },
            complete: false,
            pausedForAttackDogSelection: {
              attackerId: attacker.id,
              attackerName: attacker.name.charAt(0).toUpperCase() + attacker.name.slice(1),
              attackerIndex: i,
              validTargets: validDogTargets,
              dogId: dog.id,
            },
          };
        }
      } else {
        // AI player - auto-assign
        const dog = assignAttackDog(attacker, enemies, activeDogState, game, dogIndex++);
        // Add dog to attacker's side so it appears in combat panel
        if (dog) {
          if (dog.isDictatorSide) {
            dictatorSide.push(dog);
          } else {
            rebels.push(dog);
          }
        }
      }
    }

    // Target selection - comes AFTER attack dog assignment
    // Only pause for target selection if unit is on attacking side (defending units auto-target)
    if (interactive && isHumanControlled && isOnAttackingSide && !hasSelectedTargets) {
      // Check if dog forces targets (no player choice needed)
      const assignedDog = activeDogState.assignments.get(attacker.id);
      const dogForcesTarget = assignedDog && assignedDog.health > 0;

      if (!dogForcesTarget) {
        // Need player input - pause and return
        const validTargets = getValidTargetsForPlayer(attacker, enemies);
        // Only pause for target selection if there's actually a choice to make
        // If attacker can target >= all valid enemies, auto-select all (no user input needed)
        const needsPlayerChoice = validTargets.length > 0 && attacker.targets < validTargets.length;
        if (needsPlayerChoice) {
          return {
            round: { roundNumber, results, casualties },
            complete: false,
            pausedForTargetSelection: {
              attackerId: attacker.id,
              attackerName: attacker.name.charAt(0).toUpperCase() + attacker.name.slice(1),
              attackerIndex: i,
              validTargets,
              maxTargets: attacker.targets,
            },
          };
        }
      }
    }

    // MERC-l09: Select targets considering dog assignments
    // MERC-t5k: Use player selections if available
    const attackerSelectedTargets = playerSelectedTargets?.get(attacker.id);
    const targets = selectTargetsWithDogs(attacker, enemies, attacker.targets, activeDogState, game, attackerSelectedTargets);

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
    // MERC-7zax: Dictator militia hit on 3+ when Better Weapons is active
    // Medical Kit healing: dice are reduced by healing dice used
    const effectiveDice = getEffectiveCombatDice(attacker, game);
    let rolls = rollDice(effectiveDice, game);
    let hits = countHitsForCombatant(rolls, attacker, game);
    game.message(`${attacker.name} rolls [${rolls.join(', ')}] - ${hits} hit(s)`);

    // Emit roll event for UI animation (BoardSmith v2.4 Animation Event System)
    // Include target info so UI can highlight targets even on miss
    const attackerCombatantId = getCombatantId(attacker);
    const hitThreshold = attackerCombatantId ? getHitThreshold(attackerCombatantId) : CombatConstants.HIT_THRESHOLD;
    game.emitAnimationEvent('combat-roll', {
      attackerName: attacker.name.charAt(0).toUpperCase() + attacker.name.slice(1),
      attackerId: attacker.id,
      attackerImage: attacker.image,
      targetNames: targets.map(t => t.name.charAt(0).toUpperCase() + t.name.slice(1)),
      targetIds: targets.map(t => t.id),
      diceRolls: rolls,
      hits,
      hitThreshold,
    });

    // MERC-5l3: Basic may reroll all dice once per combat (uses registry)
    if (shouldUseReroll(attacker, rolls, hits)) {
      game.message(`${attacker.name} uses reroll ability!`);
      attacker.hasUsedReroll = true;
      rolls = rollDice(effectiveDice, game);
      hits = countHitsForCombatant(rolls, attacker, game);
      game.message(`${attacker.name} rerolls [${rolls.join(', ')}] - ${hits} hit(s)`);

      // Emit reroll event for UI animation (same targets as original roll)
      game.emitAnimationEvent('combat-roll', {
        attackerName: attacker.name.charAt(0).toUpperCase() + attacker.name.slice(1),
        attackerId: attacker.id,
        attackerImage: attacker.image,
        targetNames: targets.map(t => t.name.charAt(0).toUpperCase() + t.name.slice(1)),
        targetIds: targets.map(t => t.id),
        diceRolls: rolls,
        hits,
        hitThreshold,
      });
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
    // Pause for allocation if: player-controlled rebel MERC, multiple DECLARED targets, meaningful choice
    const hasHitAllocation = game.activeCombat?.selectedTargets?.has(`allocation:${attacker.id}`);
    if (interactive && isRebelMerc && !hasHitAllocation) {
      // Valid targets for hit allocation are the DECLARED targets (not all enemies)
      // This respects the attacker's target limit (e.g., targets: 1 means only 1 declared target)
      const validTargets = targets.filter(t => t.health > 0);

      // Smart skip logic:
      // 1. Only 1 valid target - no choice needed (all hits go to that target)
      // 2. All targets are militia - no meaningful choice (militia all have 1 HP)
      // 3. Overkill - hits >= total declared target HP, so all declared targets will die anyway
      const allMilitia = validTargets.every(t => t.isMilitia);
      const totalTargetHP = validTargets.reduce((sum, t) => sum + t.health, 0);
      const isOverkill = hits >= totalTargetHP;
      const needsAllocation = validTargets.length > 1 && !allMilitia && !isOverkill;

      // Also check if Basic's reroll is available (not yet used)
      const combatantId = getCombatantId(attacker);
      const canUseReroll = combatantId && canRerollOnce(combatantId) && !attacker.hasUsedReroll;

      // Pause for allocation if meaningful choice exists OR if reroll is available
      if (needsAllocation || canUseReroll) {
        // Get hit threshold for this combatant
        const hitThreshold = combatantId ? getHitThreshold(combatantId) : CombatConstants.HIT_THRESHOLD;

        // Set pending hit allocation state
        game.activeCombat!.pendingHitAllocation = {
          attackerId: attacker.id,
          attackerName: attacker.name.charAt(0).toUpperCase() + attacker.name.slice(1),
          attackerCombatantId: combatantId ?? '',
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

      // Capture health BEFORE damage is applied (for UI animation sync)
      const healthBefore = target.health;

      // MERC-38e: Pass armorPiercing flag to applyDamage
      const damage = applyDamage(target, remainingHits, game, attacker.armorPiercing);
      damageDealt.set(target.id, damage);

      // Emit damage event for UI animation with health state
      if (damage > 0) {
        game.emitAnimationEvent('combat-damage', {
          attackerName: attacker.name.charAt(0).toUpperCase() + attacker.name.slice(1),
          attackerId: attacker.id,
          targetName: target.name.charAt(0).toUpperCase() + target.name.slice(1),
          targetId: target.id,
          targetImage: target.image,
          damage,
          healthBefore,
          healthAfter: target.health,
        });
      }

      // Sync damage to source merc immediately (so UI shows correct state during combat)
      if (target.sourceElement?.isMerc) {
        const merc = target.sourceElement;
        merc.damage = merc.maxHealth - target.health;
      }

      if (target.health <= 0) {
        // MERC-clsx: Adelheid converts militia instead of killing
        if (isAdelheid(attacker) && target.isMilitia && !attacker.isDictatorSide) {
          // Convert militia to rebel's side
          const attackerMerc = attacker.sourceElement as CombatantModel;
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
            combatSector.addRebelMilitia(`${ownerPlayer.seat}`, 1);
            game.message(`${attacker.name} converts ${target.name} to her side!`);
            // Don't add to casualties - militia is converted, not killed
          } else {
            casualties.push(target);
            game.message(`${attacker.name} kills ${target.name}!`);
            // Emit death event
            game.emitAnimationEvent('combat-death', {
              targetName: target.name.charAt(0).toUpperCase() + target.name.slice(1),
              targetId: target.id,
              targetImage: target.image,
            });
          }
        } else {
          casualties.push(target);
          game.message(`${attacker.name} kills ${target.name}!`);
          // Emit death event
          game.emitAnimationEvent('combat-death', {
            targetName: target.name.charAt(0).toUpperCase() + target.name.slice(1),
            targetId: target.id,
            targetImage: target.image,
          });

          // MERC-4ib: Handle MERC death immediately (so UI shows correct state during combat)
          if (target.sourceElement?.isMerc) {
            const merc = target.sourceElement;
            // Check for epinephrine save BEFORE marking as dead
            let savedByEpinephrine = false;

            if (target.isDictatorSide) {
              // Dictator side - check for epinephrine in squad
              const squadMercs = game.dictatorPlayer?.hiredMercs.filter(m => !m.isDead) || [];
              const mercWithEpi = shouldUseEpinephrine(merc, squadMercs);
              if (mercWithEpi) {
                // For human dictator, pause and let them choose
                if (!game.dictatorPlayer?.isAI && game.activeCombat) {
                  // Build list of savers
                  const savers: Array<{ combatantId: number; combatantName: string }> = [];
                  for (const m of squadMercs) {
                    if (m.id !== merc.id && !m.isDead) {
                      const hasEpi = (m.accessorySlot && isEpinephrine(m.accessorySlot.equipmentId)) ||
                                     m.bandolierSlots.some(e => isEpinephrine(e.equipmentId));
                      if (hasEpi) {
                        savers.push({ combatantId: m.id, combatantName: m.combatantName });
                      }
                    }
                  }
                  if (savers.length > 0) {
                    game.activeCombat.pendingEpinephrine = {
                      dyingCombatantId: merc.id,
                      dyingCombatantName: merc.combatantName,
                      dyingCombatantSide: 'dictator',
                      availableSavers: savers,
                    };
                    // Don't discard equipment yet - will be done after player choice
                    return {
                      round: { roundNumber, results, casualties },
                      complete: false,
                      pausedForEpinephrine: true,
                    };
                  }
                }
                // AI dictator auto-uses epinephrine per rules 4.9
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
                  game.message(`${mercWithEpi.combatantName} uses Epinephrine Shot to save ${merc.combatantName}!`);
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
                    // For human rebel player, pause for choice
                    if (!rebel.isAI && game.activeCombat) {
                      // Build list of all squadmates who have epinephrine
                      const savers: Array<{ combatantId: number; combatantName: string }> = [];
                      for (const m of squadMercs) {
                        const hasEpi = (m.accessorySlot && isEpinephrine(m.accessorySlot.equipmentId)) ||
                                       m.bandolierSlots.some(e => isEpinephrine(e.equipmentId));
                        if (hasEpi) {
                          savers.push({ combatantId: m.id, combatantName: m.combatantName });
                        }
                      }
                      if (savers.length > 0) {
                        game.activeCombat.pendingEpinephrine = {
                          dyingCombatantId: merc.id,
                          dyingCombatantName: merc.combatantName,
                          dyingCombatantSide: 'rebel',
                          availableSavers: savers,
                        };
                        // Don't discard equipment yet - will be done after player choice
                        return {
                          round: { roundNumber, results, casualties },
                          complete: false,
                          pausedForEpinephrine: true,
                        };
                      }
                    }
                    // AI rebel auto-uses epinephrine per rules 4.9
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
                      game.message(`${mercWithEpi.combatantName} uses Epinephrine Shot to save ${merc.combatantName}!`);
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
    if (attacker.sourceElement?.isMerc) {
      const merc = attacker.sourceElement;
      const accessoryDiscard = game.getEquipmentDiscard('Accessory');

      // Check accessory slot
      if (merc.accessorySlot && checkDiscardAfterAttack(merc.accessorySlot.equipmentId)) {
        game.message(`${merc.combatantName}'s ${merc.accessorySlot.equipmentName} is used up!`);
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
        game.message(`${merc.combatantName}'s ${equipment.equipmentName} is used up!`);
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
    const targets = selectTargetsWithDogs(vandal, enemies, vandal.targets, activeDogState, game);
    if (targets.length === 0) continue;

    const targetNames = targets.map(t => t.name).join(', ');
    game.message(`${vandal.name} targets: ${targetNames}`);

    // Roll dice for second shot
    // MERC-cpb: Lucid hits on 3+ instead of 4+
    // Note: Healing dice reduction also applies to second shot
    const vandalEffectiveDice = getEffectiveCombatDice(vandal, game);
    const rolls = rollDice(vandalEffectiveDice, game);
    const hits = countHitsForCombatant(rolls, vandal, game);
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
    if (combatant.sourceElement?.isMerc) {
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
              game.message(`${mercWithEpi.combatantName} uses Epinephrine Shot to save ${merc.combatantName}!`);
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
                  game.message(`${mercWithEpi.combatantName} uses Epinephrine Shot to save ${merc.combatantName}!`);
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
          // sectorId becomes undefined via computed getter when in discard
          merc.putInto(game.mercDiscard);
          game.message(`${merc.combatantName} has been killed in combat!`);
        }
      }
    } else if (combatant.sourceElement?.isDictator) {
      const dictator = combatant.sourceElement as CombatantModel;
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
    const playerId = `${rebel.seat}`;
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
  options: { maxRounds?: number; interactive?: boolean; attackingPlayerIsRebel?: boolean } = {}
): CombatOutcome {
  const { maxRounds = 10, interactive = true, attackingPlayerIsRebel: optionAttackingPlayerIsRebel = true } = options;

  // Check if resuming from paused combat
  const isResuming = game.activeCombat !== null && game.activeCombat.sectorId === sector.sectorId;

  let rebels: Combatant[];
  let dictator: Combatant[];
  let rounds: CombatRound[];
  let allRebelCasualties: Combatant[];
  let allDictatorCasualties: Combatant[];
  let startRound: number;
  // Track who initiated combat (for target selection - only attacking side chooses)
  let attackingPlayerIsRebel: boolean;

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
                                 (game.activeCombat.selectedTargets?.size ?? 0) > 0 ||
                                 (game.activeCombat.selectedDogTargets?.size ?? 0) > 0;
    startRound = hasPartialRoundData ? game.activeCombat.round : game.activeCombat.round + 1;

    // MERC-l09: Restore dog state
    dogState = {
      assignments: new Map(game.activeCombat.dogAssignments || []),
      dogs: (game.activeCombat.dogs || []) as Combatant[],
    };

    // MERC-l09: Add any existing dogs back to combatant arrays
    // Dogs may have been created in a previous round but need to be in the arrays for display
    for (const dog of dogState.dogs) {
      if (dog.isDictatorSide) {
        if (!dictator.some(c => c.id === dog.id)) {
          dictator.push(dog);
        }
      } else {
        if (!rebels.some(c => c.id === dog.id)) {
          rebels.push(dog);
        }
      }
    }

    // Restore who initiated combat (default to rebel if not saved, for backwards compat)
    attackingPlayerIsRebel = game.activeCombat.attackingPlayerIsRebel ?? true;

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
    // Use the value from options (defaults to true = rebel initiated)
    attackingPlayerIsRebel = optionAttackingPlayerIsRebel;

    // Apply base defense bonuses (Generalisimo, Lockdown)
    applyBaseDefenseBonuses(dictator, sector, game);

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
    detonateLandMines(game, sector, { name: attackingPlayer.name ?? 'Unknown' });
  }

  let retreatSector: Sector | undefined;
  let didRetreat = false;
  let combatPending = false;
  let retreatAvailable = false;

  // MERC-t5k: Track player-selected targets and mid-round state
  let playerSelectedTargets: Map<string, string[]> = new Map();
  // MERC-l09: Track player-selected Attack Dog targets
  let playerSelectedDogTargets: Map<string, string> = new Map();
  let currentAttackerIndex = 0;
  let roundResults: CombatResult[] = [];
  let roundCasualties: Combatant[] = [];

  if (isResuming && game.activeCombat) {
    if (game.activeCombat.selectedTargets) {
      playerSelectedTargets = new Map(game.activeCombat.selectedTargets);
    }
    if (game.activeCombat.selectedDogTargets) {
      playerSelectedDogTargets = new Map(game.activeCombat.selectedDogTargets);
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
      // Emit round-start event for UI animation
      game.emitAnimationEvent('combat-round-start', {
        round,
      });
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
      playerSelectedDogTargets,
      interactive,
      attackingPlayerIsRebel,
    });

    // MERC-t5k: Check if round paused for target selection
    if (!roundResult.complete && roundResult.pausedForTargetSelection) {
      const pause = roundResult.pausedForTargetSelection;

      // Save state for resuming
      game.activeCombat = {
        sectorId: sector.sectorId,
        attackingPlayerId: `${attackingPlayer.seat}`,
        attackingPlayerIsRebel,
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
          validTargets: pause.validTargets.map((t) => ({
            id: t.id,
            name: t.name,
            isMerc: !t.isMilitia && !t.isDictator,
            isMilitia: t.isMilitia,
            health: t.health,
            maxHealth: t.maxHealth,
          })) as unknown as Combatant[],
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
        attackingPlayerId: `${attackingPlayer.seat}`,
        attackingPlayerIsRebel,
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

    // Check if round paused for before-attack healing decision
    if (!roundResult.complete && roundResult.pausedForBeforeAttackHealing) {
      const pause = roundResult.pausedForBeforeAttackHealing;

      // Save state for resuming (pendingBeforeAttackHealing already set)
      game.activeCombat = {
        ...game.activeCombat!,
        sectorId: sector.sectorId,
        attackingPlayerId: `${attackingPlayer.seat}`,
        attackingPlayerIsRebel,
        round,
        rebelCombatants: rebels,
        dictatorCombatants: dictator,
        rebelCasualties: allRebelCasualties,
        dictatorCasualties: allDictatorCasualties,
        dogAssignments: Array.from(dogState.assignments.entries()),
        dogs: dogState.dogs,
        selectedTargets: playerSelectedTargets,
        selectedDogTargets: playerSelectedDogTargets,
        currentAttackerIndex: pause.attackerIndex,
        roundResults: roundResult.round.results,
        roundCasualties: roundResult.round.casualties,
      };

      // Sync militia casualties so UI reflects kills during combat
      syncMilitiaCasualties(game, sector, rebels, dictator);

      game.message(`${pause.attackerName}'s turn. Use healing items before attacking?`);

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

    // MERC-l09: Check if round paused for Attack Dog selection
    if (!roundResult.complete && roundResult.pausedForAttackDogSelection) {
      const pause = roundResult.pausedForAttackDogSelection;

      // Save state for resuming
      game.activeCombat = {
        sectorId: sector.sectorId,
        attackingPlayerId: `${attackingPlayer.seat}`,
        attackingPlayerIsRebel,
        round,
        rebelCombatants: rebels,
        dictatorCombatants: dictator,
        rebelCasualties: allRebelCasualties,
        dictatorCasualties: allDictatorCasualties,
        dogAssignments: Array.from(dogState.assignments.entries()),
        dogs: dogState.dogs,
        selectedTargets: playerSelectedTargets,
        selectedDogTargets: playerSelectedDogTargets,
        currentAttackerIndex: pause.attackerIndex,
        roundResults: roundResult.round.results,
        roundCasualties: roundResult.round.casualties,
        pendingAttackDogSelection: {
          attackerId: pause.attackerId,
          attackerName: pause.attackerName,
          validTargets: pause.validTargets.map((t) => ({
            id: t.id,
            name: t.name,
            isMerc: !t.isMilitia && !t.isDictator,
            isMilitia: t.isMilitia,
            health: t.health,
            maxHealth: t.maxHealth,
          })) as unknown as Combatant[],
        },
      };

      // Sync militia casualties so UI reflects kills during combat
      syncMilitiaCasualties(game, sector, rebels, dictator);

      game.message(`${pause.attackerName} has Attack Dog. Choose a target.`);

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
    playerSelectedDogTargets.clear();

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
    // Check if either side can retreat (for human players)
    const attackerCanRetreat = canRetreatFromModule(game, sector, attackingPlayer);
    const dictatorPlayer = game.dictatorPlayer;
    const dictatorCanRetreat = dictatorPlayer && !dictatorPlayer.isAI
      ? canRetreatFromModule(game, sector, dictatorPlayer)
      : false;  // AI dictators don't need pause for decision

    retreatAvailable = attackerCanRetreat || dictatorCanRetreat;
    if (interactive && retreatAvailable) {
      // MERC-t5k: Sync militia casualties to sector before pausing
      syncMilitiaCasualties(game, sector, rebels, dictator);

      // Save combat state and pause for player decision
      game.activeCombat = {
        sectorId: sector.sectorId,
        attackingPlayerId: `${attackingPlayer.seat}`,
        attackingPlayerIsRebel,
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

  // Emit combat-end event for UI animation (BoardSmith v2.4 Animation Event System)
  game.emitAnimationEvent('combat-end', {
    rebelVictory: outcome.rebelVictory,
    dictatorVictory: outcome.dictatorVictory,
  });

  // Set combatComplete flag - animation events are handled by BoardSmith's event system
  game.activeCombat = {
    sectorId: sector.sectorId,
    attackingPlayerId: `${attackingPlayer.seat}`,
    attackingPlayerIsRebel,
    round: rounds.length > 0 ? rounds.length : 1,
    rebelCombatants: rebels,
    dictatorCombatants: dictator,
    rebelCasualties: allRebelCasualties,
    dictatorCasualties: allDictatorCasualties,
    dogAssignments: Array.from(dogState.assignments.entries()),
    dogs: dogState.dogs,
    combatComplete: true,
  };

  return outcome;
}

/**
 * MERC-n1f: Execute retreat for active combat
 * @param retreatingPlayer - The player who is retreating (from ctx.player)
 */
export function executeCombatRetreat(
  game: MERCGame,
  retreatSector: Sector,
  retreatingPlayer: RebelPlayer | DictatorPlayer
): CombatOutcome {
  if (!game.activeCombat) {
    throw new Error('No active combat to retreat from');
  }

  const combatSector = game.getSector(game.activeCombat.sectorId);
  if (!combatSector) {
    throw new Error('Combat sector not found');
  }

  // Execute the retreat for the player who clicked retreat
  executeRetreat(game, combatSector, retreatSector, retreatingPlayer);

  // For combat results, we need the attacking rebel player
  // (the one who initiated combat - used for casualty cleanup)
  const attackingPlayer = game.rebelPlayers.find(
    p => `${p.seat}` === game.activeCombat!.attackingPlayerId
  );

  // Apply combat results (casualties, etc.)
  const rebels = game.activeCombat.rebelCombatants as Combatant[];
  const dictator = game.activeCombat.dictatorCombatants as Combatant[];
  // Use attacking player if found, otherwise skip applying results
  if (attackingPlayer) {
    applyCombatResults(game, combatSector, rebels, dictator, attackingPlayer);
  }

  // Clear combat state and animation events buffer
  const rebelCasualties = game.activeCombat.rebelCasualties as Combatant[];
  const dictatorCasualties = game.activeCombat.dictatorCasualties as Combatant[];
  clearActiveCombat(game);

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
