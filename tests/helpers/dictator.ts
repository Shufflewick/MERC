/**
 * Reaching the dictator's own piles from a test.
 *
 * `MERCPlayer.tacticsDeck` and `tacticsDiscard` are optional because only the
 * dictator's seat has them. A test that has already set the dictator up is
 * entitled to them, and should say so loudly rather than optional-chain into a
 * silent no-op that leaves the assertion below it passing on nothing.
 */

import type { MERCGame } from '../../src/rules/game.js';
import type { TacticsDeck, DiscardPile } from '../../src/rules/elements.js';

export function tacticsDeckOf(game: MERCGame): TacticsDeck {
  const deck = game.dictatorPlayer.tacticsDeck;
  if (!deck) throw new Error('The dictator has no tactics deck; set the dictator up before this point.');
  return deck;
}

export function tacticsDiscardOf(game: MERCGame): DiscardPile {
  const discard = game.dictatorPlayer.tacticsDiscard;
  if (!discard) throw new Error('The dictator has no tactics discard pile; set the dictator up before this point.');
  return discard;
}
