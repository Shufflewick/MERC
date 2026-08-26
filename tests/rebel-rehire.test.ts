import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel } from '../src/rules/elements.js';

/**
 * Rulebook p.3 ("Teams") and p.6 ("Death"): a rebel whose MERCs have all died
 * hires again on their next turn, and the first MERC on a team costs nothing.
 * The normal hire action needs a living MERC to spend two actions, so the free
 * `rehireMerc` action stands in for it.
 */
function availableActionNames(game: MERCGame, player: Parameters<MERCGame['getAvailableActions']>[0]) {
  return game.getAvailableActions(player).map(a => a.name);
}

describe('rehiring after a wipe', () => {
  function wipedGame(seed: string) {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed,
    }).game;

    const rebel = game.rebelPlayers[0];
    game.currentDay = 3;
    for (const merc of [...rebel.primarySquad.getMercs(), ...rebel.secondarySquad.getMercs()]) {
      merc.damage = merc.maxHealth;
    }
    return { game, rebel };
  }

  it('offers the free hire to a rebel with no MERCs', () => {
    const { game, rebel } = wipedGame('rehire-available');
    expect(rebel.teamSize).toBe(0);

    expect(game.getAction('rehireMerc')).toBeDefined();
    expect(availableActionNames(game, rebel)).toContain('rehireMerc');
  });

  it('does not offer it while the rebel still has a MERC', () => {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'rehire-not-needed',
    }).game;
    const rebel = game.rebelPlayers[0];
    game.currentDay = 3;

    const merc = game.drawMerc();
    expect(merc).toBeDefined();
    merc!.damage = 0;
    merc!.putInto(rebel.primarySquad);

    expect(rebel.teamSize).toBeGreaterThan(0);
    expect(availableActionNames(game, rebel)).not.toContain('rehireMerc');
  });

  it('does not offer it during day 1 setup', () => {
    const { game, rebel } = wipedGame('rehire-day-one');
    game.currentDay = 1;
    expect(availableActionNames(game, rebel)).not.toContain('rehireMerc');
  });
});
