import { describe, it, expect } from 'vitest';
import { GameRunner } from 'boardsmith/runtime';
import { MERCGame } from '../src/rules/game.js';
import { autoResolveArgs, getCurrentAction, playUntilComplete } from './helpers/auto-play.js';

/**
 * AI Dictator Integration Tests (62-03)
 *
 * End-to-end verification that AI can play a complete game as each of the 9
 * expansion dictators without errors. Exercises setup abilities, per-turn
 * abilities, and reactive abilities through natural gameplay flow.
 */

function createAIDictatorGame(dictator: string, seed: string): GameRunner<MERCGame> {
  return new GameRunner<MERCGame>({
    GameClass: MERCGame,
    gameType: 'merc',
    gameOptions: {
      playerCount: 2,
      playerNames: ['AIRebel', 'DictatorBot'],
      seed,
      dictatorIsAI: true,
      dictatorChoice: dictator,
      playerConfigs: [
        { color: '#e74c3c', isDictator: false, isAI: true },
        { color: '#95a5a6', isDictator: true, isAI: true, aiLevel: 'medium' },
      ],
    } as any,
  });
}

const EXPANSION_DICTATORS = [
  'gadafi', 'hitler', 'hussein', 'mao', 'mussolini',
  'noriega', 'pinochet', 'polpot', 'stalin',
];

describe('AI Dictator Integration', () => {
  for (const dictator of EXPANSION_DICTATORS) {
    it(`AI plays as ${dictator} (seed 1)`, () => {
      const runner = createAIDictatorGame(dictator, `${dictator}-int-1`);
      runner.start();

      const { actionCount, completed } = playUntilComplete(runner, 500);

      // Verify correct dictator was selected
      expect(runner.game.dictatorPlayer.dictator.combatantId).toBe(dictator);

      // Game must progress meaningfully OR complete naturally
      if (!completed) {
        expect(actionCount).toBeGreaterThan(10);
      }
    }, 30_000);

    it(`AI plays as ${dictator} (seed 2)`, () => {
      const runner = createAIDictatorGame(dictator, `${dictator}-int-2`);
      runner.start();

      const { actionCount, completed } = playUntilComplete(runner, 500);

      // Verify correct dictator was selected
      expect(runner.game.dictatorPlayer.dictator.combatantId).toBe(dictator);

      // Game must progress meaningfully OR complete naturally
      if (!completed) {
        expect(actionCount).toBeGreaterThan(10);
      }
    }, 30_000);
  }
});
