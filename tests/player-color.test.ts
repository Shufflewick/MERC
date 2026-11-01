import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';

describe('player colour', () => {
  it('maps each colour in the MERC palette to its player colour', () => {
    const { game } = createTestGame(MERCGame, {
      playerCount: 3,
      playerNames: ['Rebel1', 'Rebel2', 'Dictator'],
      seed: 'player-color-known',
      playerConfigs: [{ color: '#E74C3C' }, { color: '#3498db' }, { color: '#95a5a6', role: true }],
    });

    expect(game.rebelPlayers.map(p => p.playerColor)).toEqual(['red', 'blue']);
    expect(game.dictatorPlayer.playerColor).toBe('black');
  });

  it('refuses a colour outside the MERC palette, naming it', () => {
    expect(() => createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'player-color-unknown',
      playerConfigs: [{ color: '#1abc9c' }, { color: '#95a5a6', role: true }],
    })).toThrow(/#1abc9c.*colorPalette/);
  });
});
