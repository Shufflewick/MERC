/**
 * A two-seat Castro game played by first-legal moves until a seat is to act on Day 2,
 * the position the bot was first seen stuck in (#82).
 */

import { GameRunner } from 'boardsmith/runtime';
import { MERCGame } from '../../src/rules/game.js';
import { autoResolveArgs, getCurrentAction } from './auto-play.js';

/** Seat 1 or 2 holds the dictator; the other seat is the rebel. The dictator's seat is marked a bot when it is seat 2, the rebel's when it is. */
export function castroGameAtDayTwo(dictatorSeat: 1 | 2, seat: number): GameRunner<MERCGame> {
  const dictator = { role: true, isBot: dictatorSeat === 2 };
  const rebel = { isBot: dictatorSeat === 1 };
  const runner = new GameRunner<MERCGame>({
    GameClass: MERCGame,
    gameType: 'merc',
    gameOptions: {
      playerCount: 2,
      playerNames: ['One', 'Two'],
      seed: 'i82-determinize',
      dictatorChoice: 'castro',
      playerConfigs: dictatorSeat === 1 ? [dictator, rebel] : [rebel, dictator],
    } as never,
  });
  runner.start();
  const game = runner.game;
  for (;;) {
    const turn = getCurrentAction(game.getFlowState());
    if (!turn) throw new Error(`The game stopped on Day ${game.currentDay} before seat ${seat} acted on Day 2.`);
    if (game.currentDay >= 2 && turn.currentPlayer === seat) return runner;
    const played = turn.available.some((action) => {
      const args = autoResolveArgs(game, action, turn.currentPlayer);
      return args !== null && runner.performAction(action, turn.currentPlayer, args).success;
    });
    if (!played) throw new Error(`Seat ${turn.currentPlayer} had no legal move on Day ${game.currentDay}.`);
  }
}
