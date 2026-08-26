import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel } from '../src/rules/elements.js';
import { applyWalterBonus } from '../src/rules/combat.js';
import type { Combatant } from '../src/rules/combat-types.js';

function newGame(seed: string) {
  return createTestGame(MERCGame, {
    playerCount: 2,
    playerNames: ['Rebel1', 'Dictator'],
    seed,
  }).game;
}

function findMerc(game: MERCGame, combatantId: string): CombatantModel | undefined {
  return game.first(CombatantModel, m => m.isMerc && m.combatantId === combatantId);
}

function militia(id: string, isDictatorSide: boolean, ownerId?: string): Combatant {
  return {
    id, name: 'militia', initiative: 2, combat: 1, health: 1, maxHealth: 1,
    armor: 0, maxArmor: 0, targets: 1, isDictatorSide, isMilitia: true,
    isDictator: false, isAttackDog: false, sourceElement: null, ownerId,
    armorPiercing: false, hasAttackDog: false, isImmuneToAttackDogs: false,
    willNotHarmDogs: false,
  };
}

function mercCombatant(merc: CombatantModel, isDictatorSide: boolean): Combatant {
  return {
    id: String(merc.id), name: merc.combatantName, initiative: merc.initiative,
    combat: merc.combat, health: merc.health, maxHealth: merc.maxHealth,
    armor: 0, maxArmor: 0, targets: 1, isDictatorSide, isMilitia: false,
    isDictator: false, isAttackDog: false, sourceElement: merc,
    armorPiercing: false, hasAttackDog: false, isImmuneToAttackDogs: false,
    willNotHarmDogs: false,
  };
}

describe("Haarg's +1", () => {
  it('never exceeds +1 per skill, however many units out-stat him', () => {
    const game = newGame('haarg-cap');
    const haarg = findMerc(game, 'haarg');
    if (!haarg) {
      console.log('Haarg not in deck, skipping');
      return;
    }

    const rebel = game.rebelPlayers[0];
    haarg.putInto(rebel.primarySquad);

    // Squadmates who beat him on every base stat.
    const mates = game.all(CombatantModel)
      .filter(m => m.isMerc && m.combatantId !== 'haarg' && !m.isDead)
      .filter(m => m.baseInitiative > haarg.baseInitiative || m.baseCombat > haarg.baseCombat)
      .slice(0, 3);

    for (const mate of mates) mate.putInto(rebel.primarySquad);

    const squad = rebel.primarySquad.getMercs();
    for (const merc of squad) merc.updateAbilityBonuses(squad);

    expect(haarg.initiative).toBeLessThanOrEqual(haarg.baseInitiative + 1);
    expect(haarg.combat).toBeLessThanOrEqual(haarg.baseCombat + 1);
    expect(haarg.training).toBeLessThanOrEqual(haarg.baseTraining + 1);
  });
});

describe("Walter's militia bonus", () => {
  it('buffs dictator militia when the dictator hired him', () => {
    const game = newGame('walter-dictator');
    const walter = findMerc(game, 'walter');
    if (!walter) {
      console.log('Walter not in deck, skipping');
      return;
    }

    const dictatorMilitia = militia('dm', true);
    const rebelMilitia = militia('rm', false, '0');
    const combatants = [mercCombatant(walter, true), dictatorMilitia, rebelMilitia];

    applyWalterBonus(game, combatants);

    expect(dictatorMilitia.initiative).toBe(4);
    expect(rebelMilitia.initiative).toBe(2);
  });

  it('buffs only his own rebel militia when a rebel hired him', () => {
    const game = newGame('walter-rebel');
    const walter = findMerc(game, 'walter');
    if (!walter) {
      console.log('Walter not in deck, skipping');
      return;
    }

    const rebel = game.rebelPlayers[0];
    walter.putInto(rebel.primarySquad);
    walter.damage = 0;

    const ownMilitia = militia('own', false, `${rebel.seat}`);
    const otherMilitia = militia('other', false, '99');
    const dictatorMilitia = militia('dm', true);
    const combatants = [mercCombatant(walter, false), ownMilitia, otherMilitia, dictatorMilitia];

    applyWalterBonus(game, combatants);

    expect(ownMilitia.initiative).toBe(4);
    expect(otherMilitia.initiative).toBe(2);
    expect(dictatorMilitia.initiative).toBe(2);
  });
});
