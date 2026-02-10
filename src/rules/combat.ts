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
 * Animation events are handled by BoardSmith's game.animate() theatre view system.
 */
export function clearActiveCombat(game: MERCGame): void {
  game.activeCombat = null;
}

// =============================================================================
// Combat Panel Snapshot Helpers
// =============================================================================

/**
 * Serialize a Combatant to a plain data object for combat-panel animation events.
 * Provides all fields CombatPanel needs without element ref resolution.
 */
function serializeCombatant(c: Combatant): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    image: c.image,
    health: c.health,
    maxHealth: c.maxHealth,
    armor: c.armor,
    maxArmor: c.maxArmor,
    isMerc: !c.isMilitia && !c.isDictator && !c.isAttackDog,
    isMilitia: c.isMilitia,
    isAttackDog: c.isAttackDog,
    isDictator: c.isDictator,
    isDictatorSide: c.isDictatorSide,
    playerColor: c.playerColor,
    combatantId: c.combatantId,
    initiative: c.initiative,
    // Attack dog specific
    attackDogAssignedTo: c.attackDogAssignedTo,
    attackDogTargetName: c.attackDogTargetName,
    attackDogPendingTarget: c.attackDogPendingTarget,
  };
}

/**
 * Build a complete combat-panel snapshot from game.activeCombat.
 * Contains full combatant data for both sides, casualties, and decision context.
 * Emitted at every decision cycle point so CombatPanel can render entirely from events.
 */
function buildCombatPanelSnapshot(game: MERCGame): Record<string, unknown> {
  const ac = game.activeCombat!;

  // Build initiative order from all living combatants, sorted
  const allLiving = sortByInitiative([
    ...(ac.rebelCombatants as Combatant[]),
    ...(ac.dictatorCombatants as Combatant[]),
  ]);
  const allCasualties = [
    ...((ac.rebelCasualties ?? []) as Combatant[]),
    ...((ac.dictatorCasualties ?? []) as Combatant[]),
  ];
  const deadIds = new Set(allCasualties.map(c => c.id));

  // Group militia into single initiative slots per batch
  const initiativeOrder: Array<Record<string, unknown>> = [];
  const seenMilitiaBatches = new Set<string>();

  for (const c of allLiving.filter(c2 => !c2.isAttackDog)) {
    if (c.isMilitia) {
      const batchKey = getMilitiaBatchKey(c.isDictatorSide, c.initiative, c.ownerId);
      if (seenMilitiaBatches.has(batchKey)) continue;
      seenMilitiaBatches.add(batchKey);

      // Gather all living militia in this batch
      const batchMilitia = allLiving.filter(
        m => m.isMilitia &&
          m.isDictatorSide === c.isDictatorSide &&
          m.initiative === c.initiative &&
          m.ownerId === c.ownerId &&
          !deadIds.has(m.id) &&
          m.health > 0
      );
      const allBatchMilitia = allLiving.filter(
        m => m.isMilitia &&
          m.isDictatorSide === c.isDictatorSide &&
          m.initiative === c.initiative &&
          m.ownerId === c.ownerId
      );

      initiativeOrder.push({
        id: c.id,
        name: c.name,
        image: c.image,
        combatantId: c.combatantId,
        isDictatorSide: c.isDictatorSide,
        playerColor: c.playerColor,
        initiative: c.initiative,
        isMilitia: true,
        isDead: batchMilitia.length === 0,
        militiaGroupCount: batchMilitia.length,
        militiaGroupIds: allBatchMilitia.map(m => m.id),
      });
    } else {
      initiativeOrder.push({
        id: c.id,
        name: c.name,
        image: c.image,
        combatantId: c.combatantId,
        isDictatorSide: c.isDictatorSide,
        playerColor: c.playerColor,
        initiative: c.initiative,
        isMilitia: false,
        isDead: deadIds.has(c.id) || c.health <= 0,
      });
    }
  }

  // Derive current attacker from whichever pending decision context is active
  const currentAttackerId =
    (ac.pendingTargetSelection as any)?.attackerId ??
    (ac.pendingHitAllocation as any)?.attackerId ??
    (ac.pendingWolverineSixes as any)?.attackerId ??
    (ac.pendingAttackDogSelection as any)?.attackerId ??
    (ac.pendingBeforeAttackHealing as any)?.attackerId ??
    (ac.pendingEpinephrine as any)?.attackerId ??
    null;

  return {
    sectorId: ac.sectorId,
    sectorName: game.getSector(ac.sectorId)?.sectorName,
    round: ac.round,
    rebelCombatants: (ac.rebelCombatants as Combatant[]).map(c => serializeCombatant(c)),
    dictatorCombatants: (ac.dictatorCombatants as Combatant[]).map(c => serializeCombatant(c)),
    rebelCasualties: ((ac.rebelCasualties ?? []) as Combatant[]).map(c => serializeCombatant(c)),
    dictatorCasualties: ((ac.dictatorCasualties ?? []) as Combatant[]).map(c => serializeCombatant(c)),
    dogAssignments: ac.dogAssignments,
    combatComplete: ac.combatComplete ?? false,
    initiativeOrder,
    currentAttackerId,
    // Decision context -- at most one active at a time
    // Include the full decision data so CombatPanel needs no extra lookups
    pendingTargetSelection: ac.pendingTargetSelection ?? null,
    pendingHitAllocation: ac.pendingHitAllocation ?? null,
    pendingWolverineSixes: ac.pendingWolverineSixes ?? null,
    pendingAttackDogSelection: ac.pendingAttackDogSelection ?? null,
    pendingBeforeAttackHealing: ac.pendingBeforeAttackHealing ?? null,
    pendingEpinephrine: ac.pendingEpinephrine ?? null,
  };
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
export function rollDice(count: number, game: MERCGame): number[] {
  return Array.from({ length: count }, () => rollDie(game));
}

/**
 * Count hits from dice rolls (4+ is a hit)
 */
export function countHits(rolls: number[]): number {
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
    // Group militia together (MERCs before militia at same initiative/side)
    if (a.isMilitia !== b.isMilitia) {
      return a.isMilitia ? 1 : -1;
    }
    return 0;
  });
}

// =============================================================================
// Militia Batch (Simultaneous Dice Rolling)
// =============================================================================

/**
 * Find all contiguous militia in sorted initiative order that share
 * (isDictatorSide, initiative, ownerId). Returns the batch and the
 * index of the last militia in the batch so the main loop can skip them.
 */
function getMilitiaBatch(
  allCombatants: Combatant[],
  startIndex: number
): { militia: Combatant[]; endIndex: number } | null {
  const first = allCombatants[startIndex];
  if (!first || !first.isMilitia || first.health <= 0) return null;

  const militia: Combatant[] = [first];
  let endIndex = startIndex;

  for (let j = startIndex + 1; j < allCombatants.length; j++) {
    const c = allCombatants[j];
    if (
      c.isMilitia &&
      c.isDictatorSide === first.isDictatorSide &&
      c.initiative === first.initiative &&
      c.ownerId === first.ownerId
    ) {
      if (c.health > 0) militia.push(c);
      endIndex = j;
    } else {
      break;
    }
  }

  return militia.length > 0 ? { militia, endIndex } : null;
}

/**
 * Generate a batch key for a militia group.
 */
function getMilitiaBatchKey(isDictatorSide: boolean, initiative: number, ownerId?: string): string {
  if (isDictatorSide) return `dictator-${initiative}`;
  return `rebel-${ownerId ?? 'unknown'}-${initiative}`;
}

/**
 * Distribute hits evenly across targets (round-robin).
 * Each target gets floor(total/N), remainder goes to first targets.
 */
function distributeHitsEvenly(totalHits: number, targets: Combatant[]): Map<string, number> {
  const result = new Map<string, number>();
  const base = Math.floor(totalHits / targets.length);
  let remainder = totalHits % targets.length;
  for (const t of targets) {
    const count = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    result.set(t.id, count);
  }
  return result;
}

/**
 * Distribute hits using AI priority — concentrate on highest-priority target first,
 * then overflow to next priority target.
 */
function distributeHitsAI(totalHits: number, targets: Combatant[], randomFn: () => number): Map<string, number> {
  const result = new Map<string, number>();
  const sorted = sortTargetsByAIPriority(targets, randomFn);
  let remaining = totalHits;
  for (const t of sorted) {
    if (remaining <= 0) break;
    const hitsForTarget = Math.min(remaining, t.health);
    result.set(t.id, hitsForTarget);
    remaining -= hitsForTarget;
  }
  // If hits left over (all targets near death), dump on first target
  if (remaining > 0 && sorted.length > 0) {
    const firstId = sorted[0].id;
    result.set(firstId, (result.get(firstId) ?? 0) + remaining);
  }
  return result;
}

/**
 * Apply damage from militia hits using pre-computed per-target hit counts.
 * Used after hit allocation (human or auto) — no dice slicing, just damage application.
 */
function applyMilitiaBatchDamage(
  batchLeader: Combatant,
  batchSize: number,
  enemies: Combatant[],
  hitsByTarget: Map<string, number>,
  game: MERCGame,
  casualties: Combatant[],
): CombatResult[] {
  const results: CombatResult[] = [];

  for (const [targetId, hitCount] of hitsByTarget) {
    if (hitCount <= 0) continue;
    const target = enemies.find(e => e.id === targetId);
    if (!target || target.health <= 0) continue;

    const damageDealt = new Map<string, number>();
    const healthBefore = target.health;
    const armorAbsorb = target.armor > 0 ? Math.min(target.armor, hitCount) : 0;
    const expectedHealthDamage = Math.min(hitCount - armorAbsorb, target.health);

    const armorAfter = Math.max(0, target.armor - armorAbsorb);

    if (expectedHealthDamage > 0) {
      game.animate('combat-damage', {
        attackerName: `Militia x${batchSize}`,
        attackerId: batchLeader.id,
        targetName: capitalize(target.name),
        targetId: target.id,
        targetImage: target.image,
        damage: expectedHealthDamage,
        healthBefore,
        healthAfter: healthBefore - expectedHealthDamage,
        armorAbsorb,
        armorAfter,
        maxArmor: target.maxArmor,
      });
      applyDamage(target, hitCount, game, false);
      damageDealt.set(target.id, expectedHealthDamage);
      if (target.sourceElement?.isMerc) {
        target.sourceElement.damage = target.sourceElement.maxHealth - target.health;
      }
    } else if (armorAbsorb > 0) {
      game.animate('combat-armor-soak', {
        attackerName: `Militia x${batchSize}`,
        attackerId: batchLeader.id,
        targetName: capitalize(target.name),
        targetId: target.id,
        targetImage: target.image,
        armorAbsorb,
        armorAfter,
        maxArmor: target.maxArmor,
      });
      const damage = applyDamage(target, hitCount, game, false);
      damageDealt.set(target.id, damage);
      if (target.sourceElement?.isMerc) {
        target.sourceElement.damage = target.sourceElement.maxHealth - target.health;
      }
    }

    if (target.health <= 0) {
      let savedByEpinephrine = false;

      // Check for AI auto-epinephrine save
      if (target.sourceElement?.isMerc) {
        const merc = target.sourceElement;
        if (target.isDictatorSide && game.dictatorPlayer?.isAI) {
          const squadMercs = game.dictatorPlayer.hiredMercs.filter(m => !m.isDead);
          const mercWithEpi = shouldUseEpinephrine(merc, squadMercs);
          if (mercWithEpi) {
            let epiShot: Equipment | undefined;
            if (mercWithEpi.accessorySlot && isEpinephrine(mercWithEpi.accessorySlot.equipmentId)) {
              epiShot = mercWithEpi.unequip('Accessory');
            } else {
              const epiIndex = mercWithEpi.bandolierSlots.findIndex(e => isEpinephrine(e.equipmentId));
              if (epiIndex >= 0) epiShot = mercWithEpi.unequipBandolierSlot(epiIndex);
            }
            if (epiShot) {
              const discard = game.getEquipmentDiscard('Accessory');
              if (discard) epiShot.putInto(discard);
              target.health = 1;
              merc.damage = merc.maxHealth - 1;
              savedByEpinephrine = true;
              game.message(`${mercWithEpi.combatantName} uses Epinephrine Shot to save ${merc.combatantName}!`);
            }
          }
        } else if (!target.isDictatorSide) {
          for (const rebel of game.rebelPlayers) {
            if (rebel.isAI) {
              const allMercs = [...rebel.primarySquad.getMercs(), ...rebel.secondarySquad.getMercs()];
              if (allMercs.some(m => m.id === merc.id)) {
                const squadMercs = allMercs.filter(m => !m.isDead && m.id !== merc.id);
                const mercWithEpi = hasEpinephrineShot(squadMercs);
                if (mercWithEpi) {
                  let epiShot: Equipment | undefined;
                  if (mercWithEpi.accessorySlot && isEpinephrine(mercWithEpi.accessorySlot.equipmentId)) {
                    epiShot = mercWithEpi.unequip('Accessory');
                  } else {
                    const epiIndex = mercWithEpi.bandolierSlots.findIndex(e => isEpinephrine(e.equipmentId));
                    if (epiIndex >= 0) epiShot = mercWithEpi.unequipBandolierSlot(epiIndex);
                  }
                  if (epiShot) {
                    const discard = game.getEquipmentDiscard('Accessory');
                    if (discard) epiShot.putInto(discard);
                    target.health = 1;
                    merc.damage = merc.maxHealth - 1;
                    savedByEpinephrine = true;
                    game.message(`${mercWithEpi.combatantName} uses Epinephrine Shot to save ${merc.combatantName}!`);
                  }
                }
                break;
              }
            }
          }
        }
      }

      if (!savedByEpinephrine) {
        game.animate('combat-death', {
          targetName: capitalize(target.name),
          targetId: target.id,
          targetImage: target.image,
          combatantId: getCombatantId(target),
        });
        casualties.push(target);
        game.message(`Militia kills ${target.name}!`);

        // Handle MERC death — discard equipment
        if (target.sourceElement?.isMerc) {
          const merc = target.sourceElement;
          for (const slotName of ['Weapon', 'Armor', 'Accessory'] as const) {
            const equip = merc.unequip(slotName);
            if (equip) {
              const discardPile = game.getEquipmentDiscard(slotName);
              if (discardPile) equip.putInto(discardPile);
            }
          }
        }
      }
    } else if (expectedHealthDamage > 0) {
      game.message(`Militia hits ${target.name} for ${expectedHealthDamage} damage`);
    }

    results.push({
      attacker: batchLeader,
      rolls: [],
      hits: hitCount,
      targets: [target],
      damageDealt,
    });
  }

  return results;
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
    armor: merc.effectiveArmor,
    maxArmor: merc.equipmentArmor,
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
    armor: dictator.effectiveArmor,
    maxArmor: dictator.equipmentArmor,
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
      name: 'Militia',
      initiative,
      combat: CombatConstants.MILITIA_COMBAT,
      health: CombatConstants.MILITIA_HEALTH,
      maxHealth: CombatConstants.MILITIA_HEALTH,
      armor: CombatConstants.MILITIA_ARMOR,
      maxArmor: CombatConstants.MILITIA_ARMOR,
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
      image: '',
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
    maxArmor: 0,
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
    combatant.armor = merc.effectiveArmor;
    combatant.maxArmor = merc.equipmentArmor;
    combatant.armorPiercing = merc.weaponSlot?.negatesArmor ?? false;
  } else if (combatant.sourceElement?.isDictator) {
    const dictator = combatant.sourceElement as CombatantModel;
    combatant.initiative = dictator.initiative;
    combatant.combat = dictator.combat;
    combatant.armor = dictator.effectiveArmor;
    combatant.maxArmor = dictator.equipmentArmor;
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

// =============================================================================
// Combat Execution
// =============================================================================

/**
 * Queue combat to run through the flow system so UI can mount CombatPanel
 * before resolution (prevents immediate resolve inside action execution).
 */
export function queuePendingCombat(
  game: MERCGame,
  sector: Sector,
  rebel: RebelPlayer,
  attackingPlayerIsRebel: boolean
): void {
  const entry = {
    sectorId: sector.sectorId,
    playerId: `${rebel.seat}`,
    attackingPlayerIsRebel,
  };

  if (!game.pendingCombat && !game.activeCombat) {
    game.pendingCombat = entry;
    return;
  }

  game.pendingCombatQueue.push(entry);
}

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

  // Add dictator card if in this sector
  if (game.isDictatorInSector(sector)) {
    const dictatorCard = game.dictatorPlayer.dictator!;
    dictator.push(dictatorToCombatant(dictatorCard, dictatorColor));
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
 * Get all armor-providing equipment from a MERC in damage distribution priority order:
 * 1. Armor slot, 2. Accessory slot, 3. Bandolier slots (in order)
 */
function getArmorEquipmentInOrder(merc: CombatantModel): Equipment[] {
  const result: Equipment[] = [];
  if (merc.armorSlot && merc.armorSlot.armorRemaining > 0) result.push(merc.armorSlot);
  if (merc.accessorySlot && merc.accessorySlot.armorRemaining > 0) result.push(merc.accessorySlot);
  for (const b of merc.bandolierSlots) {
    if (b.armorRemaining > 0) result.push(b);
  }
  return result;
}

/**
 * Unequip and discard a specific equipment piece by its equippedSlot value.
 */
function unequipAndDiscard(merc: CombatantModel, equip: Equipment, game: MERCGame): void {
  const slot = equip.equippedSlot;
  let removed: Equipment | undefined;

  if (slot === 'armor') {
    removed = merc.unequip('Armor');
  } else if (slot === 'accessory') {
    removed = merc.unequip('Accessory');
  } else if (slot?.startsWith('bandolier:')) {
    const idx = parseInt(slot.split(':')[1]);
    removed = merc.unequipBandolierSlot(idx);
  }

  if (removed) {
    const discard = game.getEquipmentDiscard(removed.equipmentType);
    if (discard) removed.putInto(discard);
  }
}

/**
 * Apply damage to a combatant
 * Per rules (07-combat-system.md): Damage hits armor before health.
 * When armor equipment reaches 0, the piece is destroyed and discarded.
 * Damage distributes across armor-providing equipment in priority order.
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

    // Distribute absorbed damage across equipment pieces in priority order
    if (target.sourceElement && (target.sourceElement.isMerc || target.sourceElement.isDictator)) {
      const merc = target.sourceElement;
      let damageToDistribute = armorAbsorbed;
      const armorEquipment = getArmorEquipmentInOrder(merc);

      for (const equip of armorEquipment) {
        if (damageToDistribute <= 0) break;
        const { absorbed, destroyed } = equip.applyArmorDamage(damageToDistribute);
        damageToDistribute -= absorbed;
        if (destroyed) {
          game.message(`${merc.combatantName}'s ${equip.equipmentName} is destroyed!`);
          unequipAndDiscard(merc, equip, game);
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

  // Create the dog combatant (not yet in game tree — just an object)
  const dog = createAttackDogCombatant(attacker.id, attacker.isDictatorSide, dogIndex);

  game.animate('combat-attack-dog', {
    attackerName: attacker.name.charAt(0).toUpperCase() + attacker.name.slice(1),
    attackerId: attacker.id,
    attackerImage: attacker.image,
    targetName: target.name.charAt(0).toUpperCase() + target.name.slice(1),
    targetId: target.id,
    targetImage: target.image,
    dogId: dog.id,
    dogImage: dog.image,
  });
  dog.attackDogAssignedTo = target.id;
  dog.attackDogTargetName = target.name.charAt(0).toUpperCase() + target.name.slice(1);
  dogState.assignments.set(target.id, dog);
  dogState.dogs.push(dog);
  attacker.hasAttackDog = false;
  game.message(`${attacker.name} releases Attack Dog on ${target.name}!`);
  game.message(`${target.name} must attack the dog before doing anything else.`);

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

  // Create the dog combatant (not yet in game tree — just an object)
  const dog = createAttackDogCombatant(attacker.id, attacker.isDictatorSide, dogIndex);

  game.animate('combat-attack-dog', {
    attackerName: attacker.name.charAt(0).toUpperCase() + attacker.name.slice(1),
    attackerId: attacker.id,
    attackerImage: attacker.image,
    targetName: target.name.charAt(0).toUpperCase() + target.name.slice(1),
    targetId: target.id,
    targetImage: target.image,
    dogId: dog.id,
    dogImage: dog.image,
  });
  dog.attackDogAssignedTo = target.id;
  dog.attackDogTargetName = target.name.charAt(0).toUpperCase() + target.name.slice(1);
  dogState.assignments.set(target.id, dog);
  dogState.dogs.push(dog);
  attacker.hasAttackDog = false;
  game.message(`${attacker.name} releases Attack Dog on ${target.name}!`);
  game.message(`${target.name} must attack the dog before doing anything else.`);

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

    // Simultaneous militia dice rolling: batch militia of same group
    if (attacker.isMilitia) {
      const batch = getMilitiaBatch(allCombatants, i);
      if (batch && batch.militia.length > 0) {
        const enemies = attacker.isDictatorSide ? rebels : dictatorSide;
        const aliveEnemies = enemies.filter(e => e.health > 0 && !e.isAttackDog);

        if (aliveEnemies.length === 0) {
          i = batch.endIndex;
          continue;
        }

        // Use standard target selection: check for stored targets from pendingTargetSelection
        const batchLeaderId = batch.militia[0].id;
        const storedTargetIds = playerSelectedTargets?.get(batchLeaderId);

        // Determine if human-controlled
        const isDictatorMilitia = attacker.isDictatorSide;
        const isDictatorHumanControlled = isDictatorMilitia && !game.dictatorPlayer?.isAI;
        let isRebelMilitiaHumanControlled = false;
        if (!isDictatorMilitia && attacker.ownerId) {
          const ownerPlayer = game.rebelPlayers.find(p => `${p.seat}` === attacker.ownerId);
          isRebelMilitiaHumanControlled = !!(ownerPlayer && !ownerPlayer.isAI);
        }
        const isHumanControlled = isDictatorHumanControlled || isRebelMilitiaHumanControlled;

        let selectedTargets: Combatant[];

        if (storedTargetIds) {
          // Resume with player-selected targets
          selectedTargets = storedTargetIds
            .map(id => aliveEnemies.find(e => e.id === id))
            .filter((e): e is Combatant => e != null);
        } else if (aliveEnemies.length === 1 || !isHumanControlled || !interactive) {
          // Auto-select: single target, AI, or non-interactive
          if (batch.militia.length >= aliveEnemies.length) {
            selectedTargets = aliveEnemies;
          } else {
            // AI: pick batch.length highest-priority targets
            const sorted = sortTargetsByAIPriority(aliveEnemies, () => game.random());
            selectedTargets = sorted.slice(0, batch.militia.length);
          }
        } else if (batch.militia.length >= aliveEnemies.length) {
          // Human but can hit all enemies — no choice needed
          selectedTargets = aliveEnemies;
        } else {
          // Human with more enemies than militia — pause for standard target selection
          return {
            round: { roundNumber, results, casualties },
            complete: false,
            pausedForTargetSelection: {
              attackerId: batchLeaderId,
              attackerName: `Militia x${batch.militia.length}`,
              attackerIndex: i,
              validTargets: aliveEnemies,
              maxTargets: batch.militia.length,
            },
          };
        }

        // ── PATH A: Resume from stored hit allocation ──
        const storedAlloc = game.activeCombat?.selectedTargets?.get(`allocation:${batchLeaderId}`);
        if (storedAlloc && storedAlloc.length > 0) {
          // Convert ['id1','id1','id2'] → Map { id1→2, id2→1 }
          const hitsByTarget = new Map<string, number>();
          for (const id of storedAlloc) {
            hitsByTarget.set(id, (hitsByTarget.get(id) ?? 0) + 1);
          }
          game.activeCombat?.selectedTargets?.delete(`allocation:${batchLeaderId}`);
          const batchResults = applyMilitiaBatchDamage(batch.militia[0], batch.militia.length, enemies, hitsByTarget, game, casualties);
          results.push(...batchResults);
          i = batch.endIndex;
          continue;
        }

        // ── ROLL DICE (shared by Path B and C) ──
        const hitThreshold = (batch.militia[0].isDictatorSide && game.betterWeaponsActive)
          ? 3
          : CombatConstants.HIT_THRESHOLD;
        const allRolls = rollDice(batch.militia.length, game);
        const totalHits = allRolls.filter(r => r >= hitThreshold).length;

        game.message(`Militia x${batch.militia.length} roll [${allRolls.join(', ')}] - ${totalHits} hit(s) (need ${hitThreshold}+)`);

        game.animate('combat-roll', {
          attackerName: `Militia x${batch.militia.length}`,
          attackerId: batch.militia[0].id,
          attackerImage: undefined,
          targetNames: selectedTargets.map(t => capitalize(t.name)),
          targetIds: selectedTargets.map(t => t.id),
          diceRolls: allRolls,
          hits: totalHits,
          hitThreshold,
        });

        if (totalHits === 0) {
          results.push({
            attacker: batch.militia[0],
            rolls: allRolls,
            hits: 0,
            targets: selectedTargets,
            damageDealt: new Map(),
          });
          i = batch.endIndex;
          continue;
        }

        // ── PATH C: Human allocation needed ──
        // Smart-skip: skip if single target, all-militia targets, or overkill
        const allMilitiaTargets = selectedTargets.every(t => t.isMilitia);
        const totalTargetHP = selectedTargets.reduce((sum, t) => sum + t.health, 0);
        const isOverkill = totalHits >= totalTargetHP;
        const needsAllocation = selectedTargets.length > 1 && !allMilitiaTargets && !isOverkill;

        if (interactive && isHumanControlled && needsAllocation) {
          game.activeCombat!.pendingHitAllocation = {
            attackerId: batchLeaderId,
            attackerName: `Militia x${batch.militia.length}`,
            attackerCombatantId: '',
            diceRolls: allRolls,
            hits: totalHits,
            hitThreshold,
            validTargets: selectedTargets.map(t => ({
              id: t.id,
              name: t.name,
              isMerc: !t.isMilitia && !t.isDictator,
              currentHealth: t.health,
              maxHealth: t.maxHealth,
            })),
            wolverineSixes: 0,
            canReroll: false,
            hasRerolled: false,
            rollCount: 1,
          };

          return {
            round: { roundNumber, results, casualties },
            complete: false,
            pausedForHitAllocation: true,
            currentAttackerIndex: i,
          };
        }

        // ── PATH B: Auto-distribute hits ──
        const hitsByTarget = isHumanControlled
          ? distributeHitsEvenly(totalHits, selectedTargets)
          : distributeHitsAI(totalHits, selectedTargets, () => game.random());
        const batchResults = applyMilitiaBatchDamage(batch.militia[0], batch.militia.length, enemies, hitsByTarget, game, casualties);
        results.push(...batchResults);
        i = batch.endIndex;
        continue;
      }
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

    // Pause for combat decisions if unit is human controlled (both sides get choices)
    const isHumanControlled = isRebelHumanControlled || isDictatorHumanControlled;
    const hasSelectedTargets = playerSelectedTargets?.has(attacker.id);

    // BEFORE-ATTACK HEALING: Check if we need to pause for healing before this attacker acts
    // Only for human-controlled MERCs (both sides get the choice)
    if (interactive && isHumanControlled && !attacker.isMilitia && hasMercSource) {
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
            // Emit animation event and assign target to existing dog
            game.animate('combat-attack-dog', {
              attackerName: attacker.name.charAt(0).toUpperCase() + attacker.name.slice(1),
              attackerId: attacker.id,
              attackerImage: attacker.image,
              targetName: target.name.charAt(0).toUpperCase() + target.name.slice(1),
              targetId: target.id,
              targetImage: target.image,
              dogId: existingDog.id,
              dogImage: existingDog.image,
            });
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

            game.message(`${attacker.name} releases Attack Dog on ${target.name}!`);
            game.message(`${target.name} must attack the dog before doing anything else.`);
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
    // Pause for target selection for all human-controlled units (both sides get choices)
    // DEBUG: Log target selection decision
    if (interactive && isHumanControlled && !hasSelectedTargets) {
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
    game.animate('combat-roll', {
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
      game.animate('combat-roll', {
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

      // Pre-compute expected health damage for animation event data (matches applyDamage logic)
      const healthBefore = target.health;
      const armorAbsorb = (!attacker.armorPiercing && target.armor > 0) ? Math.min(target.armor, remainingHits) : 0;
      const expectedHealthDamage = Math.min(remainingHits - armorAbsorb, target.health);
      const armorAfter = Math.max(0, target.armor - armorAbsorb);

      if (expectedHealthDamage > 0) {
        // MERC-38e: Pass armorPiercing flag to applyDamage
        game.animate('combat-damage', {
          attackerName: attacker.name.charAt(0).toUpperCase() + attacker.name.slice(1),
          attackerId: attacker.id,
          targetName: target.name.charAt(0).toUpperCase() + target.name.slice(1),
          targetId: target.id,
          targetImage: target.image,
          damage: expectedHealthDamage,
          healthBefore,
          healthAfter: healthBefore - expectedHealthDamage,
          armorAbsorb,
          armorAfter,
          maxArmor: target.maxArmor,
          armorImage: armorAbsorb > 0
            ? target.sourceElement?.isMerc ? target.sourceElement.armorSlot?.image : undefined
            : undefined,
        });
        applyDamage(target, remainingHits, game, attacker.armorPiercing);
        damageDealt.set(target.id, expectedHealthDamage);
        // Sync damage to source merc immediately (so UI shows correct state during combat)
        if (target.sourceElement?.isMerc) {
          const merc = target.sourceElement;
          merc.damage = merc.maxHealth - target.health;
        }
      } else {
        // Armor soaked all damage — emit visual feedback
        const armorImage = target.sourceElement?.isMerc
          ? target.sourceElement.armorSlot?.image
          : undefined;

        game.animate('combat-armor-soak', {
          attackerName: attacker.name.charAt(0).toUpperCase() + attacker.name.slice(1),
          attackerId: attacker.id,
          targetName: target.name.charAt(0).toUpperCase() + target.name.slice(1),
          targetId: target.id,
          targetImage: target.image,
          armorAbsorb,
          armorAfter,
          maxArmor: target.maxArmor,
          armorImage,
        });

        const damage = applyDamage(target, remainingHits, game, attacker.armorPiercing);
        damageDealt.set(target.id, damage);
        if (target.sourceElement?.isMerc) {
          const merc = target.sourceElement;
          merc.damage = merc.maxHealth - target.health;
        }
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
            game.animate('combat-death', {
              targetName: target.name.charAt(0).toUpperCase() + target.name.slice(1),
              targetId: target.id,
              targetImage: target.image,
              combatantId: getCombatantId(target),
            });
            casualties.push(target);
            game.message(`${attacker.name} kills ${target.name}!`);
          }
        } else {
          game.animate('combat-death', {
            targetName: target.name.charAt(0).toUpperCase() + target.name.slice(1),
            targetId: target.id,
            targetImage: target.image,
            combatantId: getCombatantId(target),
          });
          casualties.push(target);
          game.message(`${attacker.name} kills ${target.name}!`);

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
        game.message(`${attacker.name} hits ${target.name} for ${expectedHealthDamage} damage`);
      }

      // Militia and dogs die in one hit, MERCs can take multiple
      if (target.isMilitia || target.isAttackDog) {
        remainingHits--;
      } else {
        remainingHits -= expectedHealthDamage;
      }
    }

    // Discard equipment with discardAfterAttack (grenades, mortars, SMAW)
    if (attacker.sourceElement?.isMerc) {
      const merc = attacker.sourceElement;
      const weaponDiscard = game.getEquipmentDiscard('Weapon');
      const accessoryDiscard = game.getEquipmentDiscard('Accessory');

      // Check weapon slot (e.g., SMAW)
      if (merc.weaponSlot && checkDiscardAfterAttack(merc.weaponSlot.equipmentId)) {
        game.message(`${merc.combatantName}'s ${merc.weaponSlot.equipmentName} is used up!`);
        const weapon = merc.unequip('Weapon');
        if (weapon && weaponDiscard) {
          weapon.putInto(weaponDiscard);
        }
      }

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

    // MERC-l09: Initialize dog state
    dogState = {
      assignments: new Map(),
      dogs: [],
    };

    game.message(`Rebels: ${rebels.length} units`);
    game.message(`Dictator: ${dictator.length} units`);
    if (dictator.length === 0 && rebels.length > 0) {
      const dp = game.dictatorPlayer;
      game.message(`[WARN] 0 dictator units in combat. baseSectorId=${dp?.baseSectorId}, ` +
        `dictatorSectorId=${dp?.dictator?.sectorId}, militia=${sector.dictatorMilitia}, ` +
        `baseRevealed=${dp?.baseRevealed}, baseSquadSectorId=${dp?.baseSquad?.sectorId}`);
    }

    // Log initiative order for transparency
    const allUnits = sortByInitiative([...rebels, ...dictator]);
    const initiativeOrder = allUnits
      .filter(u => !u.isAttackDog)
      .map(u => `${u.name} (${u.initiative})`)
      .join(' > ');
    game.message(`Initiative order: ${initiativeOrder}`);

    // Initialize activeCombat so executeCombatRound can safely set pending states
    // (pendingHitAllocation, pendingBeforeAttackHealing) without null dereference
    game.activeCombat = {
      sectorId: sector.sectorId,
      attackingPlayerId: `${attackingPlayer.seat}`,
      attackingPlayerIsRebel,
      round: startRound,
      rebelCombatants: rebels,
      dictatorCombatants: dictator,
      rebelCasualties: allRebelCasualties,
      dictatorCasualties: allDictatorCasualties,
      dogAssignments: Array.from(dogState.assignments.entries()),
      dogs: dogState.dogs,
      awaitingRetreatDecisions: false,
    };
    game.animate('combat-panel', buildCombatPanelSnapshot(game));
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
      game.animate('combat-round-start', {
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
        awaitingRetreatDecisions: false,
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
      game.animate('combat-panel', buildCombatPanelSnapshot(game));

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
        awaitingRetreatDecisions: false,
      };

      // MERC-dice: Sync militia casualties so UI reflects kills during combat
      syncMilitiaCasualties(game, sector, rebels, dictator);
      game.animate('combat-panel', buildCombatPanelSnapshot(game));

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
        awaitingRetreatDecisions: false,
      };

      // Sync militia casualties so UI reflects kills during combat
      syncMilitiaCasualties(game, sector, rebels, dictator);
      game.animate('combat-panel', buildCombatPanelSnapshot(game));

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

    // Check if round paused for epinephrine decision
    if (!roundResult.complete && roundResult.pausedForEpinephrine) {
      // pendingEpinephrine is already set on game.activeCombat by executeCombatRound
      // Save the rest of combat state for resuming
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
        currentAttackerIndex: roundResult.currentAttackerIndex,
        roundResults: roundResult.round.results,
        roundCasualties: roundResult.round.casualties,
        awaitingRetreatDecisions: false,
      };

      syncMilitiaCasualties(game, sector, rebels, dictator);
      game.animate('combat-panel', buildCombatPanelSnapshot(game));

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
        awaitingRetreatDecisions: false,
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
      game.animate('combat-panel', buildCombatPanelSnapshot(game));

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
    // Only pause for HUMAN players — AI players decide automatically, and pausing
    // for an AI's retreat option causes an infinite loop when the human player
    // can't retreat (ActionPanel auto-executes the sole combatContinue action).
    const humanRebels = game.rebelPlayers.filter(p => !p.isAI);
    const rebelsCanRetreat = humanRebels.some(p => canRetreatFromModule(game, sector, p));
    const dictatorPlayer = game.dictatorPlayer;
    const dictatorCanRetreat = dictatorPlayer && !dictatorPlayer.isAI
      ? canRetreatFromModule(game, sector, dictatorPlayer)
      : false;  // AI dictators don't need pause for decision

    retreatAvailable = rebelsCanRetreat || dictatorCanRetreat;
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
        awaitingRetreatDecisions: true,
      };
      game.animate('combat-panel', buildCombatPanelSnapshot(game));
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

  const combatEndState = {
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

  // Set combatComplete immediately so UI can close after animations finish.
  game.activeCombat = combatEndState;
  game.animate('combat-panel', buildCombatPanelSnapshot(game));

  // Emit combat-end event for animation playback.
  game.animate('combat-end', {
    rebelVictory: outcome.rebelVictory,
    dictatorVictory: outcome.dictatorVictory,
  });

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

  const rebels = game.activeCombat.rebelCombatants as Combatant[];
  const dictator = game.activeCombat.dictatorCombatants as Combatant[];
  const rebelCasualties = game.activeCombat.rebelCasualties as Combatant[];
  const dictatorCasualties = game.activeCombat.dictatorCasualties as Combatant[];

  // After retreat, check if both sides still have living combatants in the sector.
  // Militia can't retreat (sourceElement is null, so they always pass the sector check).
  // Retreated MERCs have updated sectorId via squad, so they filter out naturally.
  const isStillInSector = (c: Combatant) =>
    c.isMilitia || c.sourceElement?.sectorId === combatSector.sectorId;

  const remainingRebels = rebels.filter(c => c.health > 0 && isStillInSector(c));
  const remainingDictator = dictator.filter(c => c.health > 0 && isStillInSector(c));

  // If both sides still have forces, combat continues (e.g. militia hold the line)
  if (remainingRebels.length > 0 && remainingDictator.length > 0) {
    game.message(`Dictator MERCs retreat, but militia hold the line!`);

    // Update activeCombat with only the combatants still in the sector
    game.activeCombat = {
      sectorId: game.activeCombat.sectorId,
      attackingPlayerId: game.activeCombat.attackingPlayerId,
      attackingPlayerIsRebel: game.activeCombat.attackingPlayerIsRebel,
      round: game.activeCombat.round,
      rebelCombatants: rebels.filter(c => isStillInSector(c)),
      dictatorCombatants: dictator.filter(c => isStillInSector(c)),
      rebelCasualties,
      dictatorCasualties,
      dogAssignments: game.activeCombat.dogAssignments,
      dogs: game.activeCombat.dogs,
    };
    game.animate('combat-panel', buildCombatPanelSnapshot(game));

    return {
      rounds: [],
      rebelVictory: false,
      dictatorVictory: false,
      rebelCasualties,
      dictatorCasualties,
      retreated: true,
      retreatSector,
      combatPending: true,
      canRetreat: false,
    };
  }

  // One side is empty — combat is over
  // Apply combat results (casualties, etc.)
  if (attackingPlayer) {
    applyCombatResults(game, combatSector, rebels, dictator, attackingPlayer);
  }

  game.message(`=== Combat Complete (Retreated) ===`);

  // Build combatEndState and emit animation events so CombatPanel can close.
  // Mirrors the pattern in executeCombat() — clearActiveCombat is handled by
  // the flow engine's clearCombatAnimations action step.
  const combatEndState = {
    sectorId: game.activeCombat.sectorId,
    attackingPlayerId: game.activeCombat.attackingPlayerId,
    attackingPlayerIsRebel: game.activeCombat.attackingPlayerIsRebel,
    round: 1,
    rebelCombatants: rebels,
    dictatorCombatants: dictator,
    rebelCasualties,
    dictatorCasualties,
    dogAssignments: game.activeCombat.dogAssignments,
    dogs: game.activeCombat.dogs,
    combatComplete: true,
  };

  game.activeCombat = combatEndState;
  game.animate('combat-panel', buildCombatPanelSnapshot(game));

  game.animate('combat-end', {
    rebelVictory: false,
    dictatorVictory: false,
  });

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

  // Check for dictator card at this sector
  if (game.isDictatorInSector(sector)) {
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
