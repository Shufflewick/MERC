import { describe, it, expect, vi } from 'vitest';
import { mcts } from 'boardsmith/sim';
import { gameDefinition } from '../src/rules/index.js';
import { getCurrentAction } from './helpers/auto-play.js';
import { castroGameAtDayTwo } from './helpers/day-two.js';

/**
 * The bot dictator's Day 2 turn never ended: its search threw away every step
 * on a face-down card, so it chose at random and flipped a MERC between squads
 * forever (#82). Played here the way the server plays it, seeded.
 */
describe('bot dictator Day 2 turn (#82)', () => {
  it('searches without throwing steps away and hands the turn back', { timeout: 600_000 }, async () => {
    const runner = castroGameAtDayTwo(2, 2);
    const game = runner.game;
    const warnings: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((...parts: unknown[]) => { warnings.push(parts.join(' ')); });
    const bot = mcts(60);
    let draws = 0;

    const played: string[] = [];
    while (getCurrentAction(game.getFlowState())?.currentPlayer === 2 && played.length < 20) {
      const move = await bot.choose({ game, seat: 2, random: { next: () => ++draws }, definition: gameDefinition } as never);
      if ('noMove' in move) throw new Error(move.noMove);
      if ('waitUntil' in move) throw new Error(`The bot waited for the step clock (until ${move.waitUntil}) instead of moving, but MERC has no timed steps.`);
      const result = runner.performAction(move.action, 2, move.args);
      expect(result.success, `${move.action} was refused: ${result.error}`).toBe(true);
      played.push(move.action);
    }

    expect(warnings.filter((w) => w.includes('search steps were thrown away'))).toEqual([]);
    expect(getCurrentAction(game.getFlowState())?.currentPlayer, `the dictator was still to move after ${played.join(', ')}`).toBe(1);
  });
});
