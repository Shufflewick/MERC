import { describe, it, expect } from 'vitest';
import { createTestGame, presetStartOptions } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { gameDefinition } from '../src/rules/index';
import config from '../boardsmith.json';

/**
 * The platform refuses an exclusive option without choices, so the dictator
 * option lives once, in boardsmith.json, as `role`.
 */
describe('Dictator player option', () => {
  it('is declared in boardsmith.json as an exclusive role with choices', () => {
    const role = config.playerOptions.find(opt => opt.id === 'role');
    expect(role?.type).toBe('exclusive');
    expect(role?.choices.length).toBeGreaterThan(0);
  });

  it.each(gameDefinition.presets.map(p => [p.name, p.players] as const))(
    'preset "%s" gives role to one seat, and the game seats its dictator there',
    (_name, players) => {
      // A host refuses a preset seat with fields other than color, isBot, botLevel and playerOptions
      const holders = players.flatMap((p, i) => ('playerOptions' in p && p.playerOptions.role === 'dictator' ? [i + 1] : []));
      expect(holders).toHaveLength(1);

      // The host hands the holder's seat to the game as exclusiveSeats.role
      const { game } = createTestGame(MERCGame, {
        playerCount: players.length,
        seed: 'dictator-option',
        exclusiveSeats: { role: holders[0] },
      });
      expect(game.dictatorPlayer.seat).toBe(holders[0]);
    },
  );

  it('"Play as Dictator", set up as boardsmith dev sets up a preset, seats the human in seat 1 as the dictator', () => {
    const options = presetStartOptions(gameDefinition, 'Play as Dictator');
    const { game } = createTestGame(MERCGame, { ...options, seed: 'play-as-dictator' });

    expect(game.dictatorPlayer.seat).toBe(1);
    expect(game.dictatorPlayer.isBot).toBe(false);
  });
});

describe('Dictator Character game option', () => {
  it('deals the chosen dictator to a bot dictator', () => {
    const { game } = createTestGame(MERCGame, {
      playerCount: 2,
      seed: 'dictator-character',
      dictatorCharacter: 'kim',
      playerConfigs: [{ isBot: false }, { isBot: true }],
    });
    expect(game.dictatorPlayer.dictator?.combatantId).toBe('kim');
  });
});
