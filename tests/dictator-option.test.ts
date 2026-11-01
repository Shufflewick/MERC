import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { gameDefinition } from '../src/rules/index';
import config from '../boardsmith.json';

/**
 * The platform refuses an exclusive option without choices, so the dictator
 * option lives once, in boardsmith.json, as `role`.
 */
describe('Dictator player option', () => {
  it('is declared only in boardsmith.json, as an exclusive role with choices', () => {
    expect(gameDefinition.playerOptions).not.toHaveProperty('isDictator');

    const role = config.playerOptions.find(opt => opt.id === 'role');
    expect(role?.type).toBe('exclusive');
    expect(role?.choices.length).toBeGreaterThan(0);
  });

  it.each(gameDefinition.presets.map(p => [p.name, p.players] as const))(
    'preset "%s" seats its dictator where it marks role',
    (_name, players) => {
      const marked = players.findIndex(p => 'role' in p && p.role === true);
      expect(marked).toBeGreaterThanOrEqual(0);

      const { game } = createTestGame(MERCGame, {
        playerCount: players.length,
        seed: 'dictator-option',
        playerConfigs: [...players],
      } as never);
      expect(game.dictatorPlayer.seat).toBe(marked + 1);
    },
  );
});
