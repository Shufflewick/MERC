import { describe, it, expect } from 'vitest';
import { mcts } from 'boardsmith/sim';
import { GameRunner } from 'boardsmith/runtime';
import { MERCGame } from '../src/rules/game.js';
import { Sector } from '../src/rules/elements.js';
import { gameDefinition } from '../src/rules/index.js';
import { autoResolveArgs, getCurrentAction } from './helpers/auto-play.js';

/**
 * On Day 6 ending the turn loses the game, so the bot rebel's search scored
 * every move that kept the turn above it. Assigning a MERC to a squad is free
 * and undoes itself, so it flipped MERCs between squads forever (#90). Taking
 * from the stash after an explore is free too, and a pick into a full slot
 * swaps back, so a deeper search swapped gear forever instead (#103).
 */
describe('bot rebel on the last day (#90, #103)', () => {
  it.each([100, 300])('spends its turn and hands it back at mcts(%i) instead of repeating free moves', { timeout: 600_000 }, async (iterations) => {
    const runner = new GameRunner<MERCGame>({
      GameClass: MERCGame,
      gameType: 'merc',
      gameOptions: {
        playerCount: 2,
        playerNames: ['Dictator', 'Rebel'],
        seed: 'probe-1',
        dictatorChoice: 'castro',
        exclusiveSeats: { role: 1 },
        playerConfigs: [{ isBot: false }, { isBot: true }],
      } as never,
    });
    runner.start();
    const game = runner.game;

    // The rebel lands and hires as the bot did in the reported game, then ends Days 2 to 5; the dictator plays first-legal moves.
    const landing = game.first(Sector, (s) => s.sectorId === 'industry---copper')!;
    const rebelDayOne: [string, Record<string, unknown>][] = [
      ['placeLanding', { sector: landing.id }],
      ['hireFirstMerc', { merc: 'Badger', equipmentType: 'Accessory' }],
      ['hireSecondMerc', { merc: 'Sarge', equipmentType: 'Accessory' }],
    ];
    for (;;) {
      const turn = getCurrentAction(game.getFlowState());
      if (!turn) throw new Error(`The game stopped on Day ${game.currentDay} before the rebel's Day 6 turn.`);
      if (turn.currentPlayer === 2) {
        if (game.currentDay === 6) break;
        const [action, args] = game.currentDay === 1 ? rebelDayOne.shift()! : ['endTurn', { confirm: 'Yes, end turn' }];
        const result = runner.performAction(action, 2, args);
        expect(result.success, `${action} was refused: ${result.error}`).toBe(true);
        continue;
      }
      const played = turn.available.some((action) => {
        const args = autoResolveArgs(game, action, 1);
        return args !== null && runner.performAction(action, 1, args).success;
      });
      if (!played) throw new Error(`The dictator had no legal move on Day ${game.currentDay}.`);
    }

    const bot = mcts(iterations);
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

    expect(getCurrentAction(game.getFlowState())?.currentPlayer, `the rebel was still to move after ${played.join(', ')}`).toBe(1);
  });
});
