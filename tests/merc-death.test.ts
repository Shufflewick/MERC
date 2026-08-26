import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Equipment } from '../src/rules/elements.js';
import { killMercOutsideCombat, getEpinephrineSavers } from '../src/rules/merc-death.js';

function newGame(seed: string) {
  return createTestGame(MERCGame, {
    playerCount: 2,
    playerNames: ['Rebel1', 'Dictator'],
    seed,
  }).game;
}

/** Give the first rebel a MERC from the deck, placed in their primary squad. */
function giveRebelAMerc(game: MERCGame): CombatantModel {
  const rebel = game.rebelPlayers[0];
  const merc = game.first(CombatantModel, m => m.isMerc && !m.isDead)!;
  merc.putInto(rebel.primarySquad);
  merc.damage = 0;
  return merc;
}

function findEquipment(game: MERCGame, equipmentId: string): Equipment | undefined {
  return game.first(Equipment, e => e.equipmentId === equipmentId);
}

describe('out-of-combat MERC death', () => {
  it('discards the dead MERC card and its equipment', () => {
    const game = newGame('death-pipeline');
    const merc = giveRebelAMerc(game);

    const weapon = game.first(Equipment, e => e.equipmentType === 'Weapon');
    if (weapon) merc.equip(weapon);

    merc.takeDamage(merc.maxHealth);
    const died = killMercOutsideCombat(game, merc, 'test death');

    expect(died).toBe(true);
    expect(merc.parent).toBe(game.mercDiscard);
    expect(merc.weaponSlot).toBeUndefined();
    if (weapon) expect(weapon.parent).toBe(game.weaponsDiscard);
  });

  it('lets a MERC spend his own Epinephrine Shot to survive', () => {
    const game = newGame('epi-self-save');
    const merc = giveRebelAMerc(game);

    const epi = findEquipment(game, 'epinephrine-shot');
    expect(epi, 'epinephrine-shot must exist in the accessory deck').toBeDefined();
    merc.equip(epi!);

    expect(getEpinephrineSavers(game, merc).map(m => m.id)).toContain(merc.id);

    merc.takeDamage(merc.maxHealth);
    const died = killMercOutsideCombat(game, merc, 'test death');

    expect(died).toBe(false);
    expect(merc.isDead).toBe(false);
    expect(merc.health).toBe(1);
    expect(merc.parent).not.toBe(game.mercDiscard);
    expect(epi!.parent).toBe(game.accessoriesDiscard);
  });
});
