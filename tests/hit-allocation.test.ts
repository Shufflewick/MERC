import { describe, it, expect } from 'vitest';
import { allocateHits } from '../src/rules/combat.js';
import type { Combatant } from '../src/rules/combat-types.js';

function makeCombatant(id: string, health: number, armor: number): Combatant {
  return {
    id,
    name: id,
    initiative: 1,
    combat: 1,
    health,
    maxHealth: health,
    armor,
    maxArmor: armor,
    targets: 1,
    isDictatorSide: true,
    isMilitia: false,
    isDictator: false,
    isAttackDog: false,
    sourceElement: null,
    armorPiercing: false,
    hasAttackDog: false,
    isImmuneToAttackDogs: false,
    willNotHarmDogs: false,
  };
}

describe('allocateHits', () => {
  it('honours the attacker\'s per-target allocation exactly', () => {
    const a = makeCombatant('a', 3, 0);
    const b = makeCombatant('b', 3, 0);
    // Player allocated 1 hit to A and 2 to B (one entry per hit).
    const plan = allocateHits([a, b, b], 3, false, true);
    expect(plan).toEqual([
      { target: a, hits: 1 },
      { target: b, hits: 2 },
    ]);
  });

  it('never allocates more hits than were rolled', () => {
    const a = makeCombatant('a', 3, 0);
    const b = makeCombatant('b', 3, 0);
    const plan = allocateHits([a, a, b, b], 2, false, true);
    expect(plan.reduce((sum, p) => sum + p.hits, 0)).toBe(2);
  });

  it('spends hits on armour before spilling to the next target', () => {
    const armoured = makeCombatant('armoured', 3, 2);
    const soft = makeCombatant('soft', 3, 0);
    // 6 hits: 2 soak armour + 3 kill health = 5 on the first target, 1 spills.
    const plan = allocateHits([armoured, soft], 6, false, false);
    expect(plan).toEqual([
      { target: armoured, hits: 5 },
      { target: soft, hits: 1 },
    ]);
  });

  it('does not re-spend armour-absorbed hits on later targets', () => {
    const armoured = makeCombatant('armoured', 1, 3);
    const soft = makeCombatant('soft', 3, 0);
    const plan = allocateHits([armoured, soft], 4, false, false);
    expect(plan.reduce((sum, p) => sum + p.hits, 0)).toBe(4);
    expect(plan[0].hits).toBe(4);
    expect(plan.length).toBe(1);
  });

  it('ignores armour for armour-piercing attacks', () => {
    const armoured = makeCombatant('armoured', 1, 3);
    const soft = makeCombatant('soft', 3, 0);
    const plan = allocateHits([armoured, soft], 4, true, false);
    expect(plan).toEqual([
      { target: armoured, hits: 1 },
      { target: soft, hits: 3 },
    ]);
  });

  it('gives a 1-health militia exactly one hit', () => {
    const m1 = makeCombatant('m1', 1, 0);
    const m2 = makeCombatant('m2', 1, 0);
    const m3 = makeCombatant('m3', 1, 0);
    const plan = allocateHits([m1, m2, m3], 3, false, false);
    expect(plan.every(p => p.hits === 1)).toBe(true);
    expect(plan.length).toBe(3);
  });
});
