import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel } from '../src/rules/elements.js';
import { getEligibleTargets, getValidTargetsForPlayer } from '../src/rules/combat.js';
import type { Combatant } from '../src/rules/combat-types.js';

function newGame(seed: string) {
  return createTestGame(MERCGame, {
    playerCount: 2,
    playerNames: ['Rebel1', 'Dictator'],
    seed,
  }).game;
}

function base(id: string, over: Partial<Combatant> = {}): Combatant {
  return {
    id, name: id, initiative: 1, combat: 1, health: 3, maxHealth: 3,
    armor: 0, maxArmor: 0, targets: 1, isDictatorSide: true, isMilitia: false,
    isDictator: false, isAttackDog: false, sourceElement: null,
    armorPiercing: false, hasAttackDog: false, isImmuneToAttackDogs: false,
    willNotHarmDogs: false, ...over,
  };
}

function mercCombatant(game: MERCGame, combatantId: string): Combatant | null {
  const merc = game.first(CombatantModel, m => m.isMerc && m.combatantId === combatantId);
  if (!merc) return null;
  return base(String(merc.id), { sourceElement: merc, name: merc.combatantName, isDictatorSide: false });
}

describe('getEligibleTargets', () => {
  it('is the same list the human pause path is offered', () => {
    const attacker = base('a', { isDictatorSide: false });
    const enemies = [base('m1', { isMilitia: true }), base('e1')];
    expect(getValidTargetsForPlayer(attacker, enemies)).toEqual(
      getEligibleTargets(attacker, enemies)
    );
  });

  it('drops dead enemies', () => {
    const attacker = base('a', { isDictatorSide: false });
    const enemies = [base('alive'), base('dead', { health: 0 })];
    expect(getEligibleTargets(attacker, enemies).map(t => t.id)).toEqual(['alive']);
  });

  it('protects the dictator while his other units stand', () => {
    const attacker = base('a', { isDictatorSide: false });
    const guard = base('guard', { isMilitia: true });
    const dictator = base('dictator', { isDictator: true });

    expect(getEligibleTargets(attacker, [guard, dictator]).map(t => t.id)).toEqual(['guard']);
    expect(getEligibleTargets(attacker, [dictator]).map(t => t.id)).toEqual(['dictator']);
  });

  it('forbids Buzzkill from targeting militia while an enemy MERC stands', () => {
    const game = newGame('buzzkill-eligibility');
    const buzzkill = mercCombatant(game, 'buzzkill');
    if (!buzzkill) {
      console.log('Buzzkill not in deck, skipping');
      return;
    }

    const merc = base('enemy-merc');
    const militia = base('enemy-militia', { isMilitia: true });
    const dog = base('enemy-dog', { isAttackDog: true });

    expect(getEligibleTargets(buzzkill, [militia, dog, merc]).map(t => t.id)).toEqual(['enemy-merc']);

    // With no enemy MERC left, militia become fair game.
    expect(getEligibleTargets(buzzkill, [militia, dog]).map(t => t.id).sort())
      .toEqual(['enemy-dog', 'enemy-militia']);
  });

  it('applies Buzzkill the same way whoever controls him', () => {
    const game = newGame('buzzkill-parity');
    const buzzkill = mercCombatant(game, 'buzzkill');
    if (!buzzkill) return;

    const enemies = [base('m', { isMilitia: true }), base('merc')];
    expect(getValidTargetsForPlayer(buzzkill, enemies).map(t => t.id)).toEqual(['merc']);
  });
});
