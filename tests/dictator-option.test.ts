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
  it('is declared in boardsmith.json as an exclusive role with choices', () => {
    const role = config.playerOptions.find(opt => opt.id === 'role');
    expect(role?.type).toBe('exclusive');
    expect(role?.choices.length).toBeGreaterThan(0);
  });

  it.each(gameDefinition.presets.map(p => [p.name, p.players] as const))(
    'preset "%s" seats its dictator where it marks role',
    (_name, players) => {
      // Every seat sets role, so a lobby's 'last' default cannot add a second dictator
      const roles: boolean[] = players.map(p => p.role);
      expect(roles.filter(r => r === true)).toHaveLength(1);
      const marked = roles.indexOf(true);

      const { game } = createTestGame(MERCGame, {
        playerCount: players.length,
        seed: 'dictator-option',
        playerConfigs: [...players],
      } as never);
      expect(game.dictatorPlayer.seat).toBe(marked + 1);
    },
  );
});

describe('Dictator Character game option', () => {
  it('deals the chosen dictator to a bot dictator', () => {
    const { game } = createTestGame(MERCGame, {
      playerCount: 2,
      seed: 'dictator-character',
      dictatorCharacter: 'kim',
      playerConfigs: [{ isBot: false }, { role: true, isBot: true }],
    } as never);
    expect(game.dictatorPlayer.dictator?.combatantId).toBe('kim');
  });
});
