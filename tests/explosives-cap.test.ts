import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Equipment } from '../src/rules/elements.js';

/**
 * Detonator and Explosives both read "Each Rebel may not have more than 1."
 * The cap is per player, so it spans the whole team, not one MERC.
 */
describe('explosives component cap', () => {
  function setup(seed: string) {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed,
      expansionModes: ['B'],
    }).game;
    return { game, rebel: game.rebelPlayers[0] };
  }

  /**
   * The printed deck holds one of each component, so a second copy has to be
   * made here to exercise the cap at all.
   */
  function makeDetonator(game: MERCGame, name: string): Equipment {
    return game.accessoriesDeck.create(Equipment, name, {
      equipmentId: 'detonator',
      equipmentName: 'Detonator',
      equipmentType: 'Accessory',
      serial: 0,
      description: 'If you also have the Explosives you win! Each Rebel may not have more than 1.',
      image: 'equipment/circuit-board.png',
    });
  }

  it('refuses a second Detonator anywhere on the same team', () => {
    const { game, rebel } = setup('detonator-cap');

    const [first, second] = game.all(CombatantModel)
      .filter(m => m.isMerc && !m.isDead)
      .slice(0, 2);
    first.putInto(rebel.primarySquad);
    second.putInto(rebel.primarySquad);

    const a = makeDetonator(game, 'detonator-a');
    const b = makeDetonator(game, 'detonator-b');

    expect(first.canEquip(a)).toBe(true);
    first.equip(a);

    // Same MERC and a squadmate are both capped.
    expect(first.canEquip(b)).toBe(false);
    expect(second.canEquip(b)).toBe(false);
  });

  it('does not cap ordinary equipment', () => {
    const { game, rebel } = setup('normal-equipment-uncapped');
    const merc = game.first(CombatantModel, m => m.isMerc && !m.isDead)!;
    merc.putInto(rebel.primarySquad);

    const weapon = game.first(Equipment, e => e.equipmentType === 'Weapon');
    if (!weapon) return;
    expect(merc.canEquip(weapon)).toBe(true);
  });
});
