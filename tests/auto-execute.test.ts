import { describe, it, expect } from 'vitest';
import type { MERCGame } from '../src/rules/game.js';
import { DICTATORS, randomPlay } from './helpers/random-play.js';

/** Each seat's offers when it is the only one: the client plays a lone enabled action with no choices unless it is manual. */
function autoPlayedOffers(game: MERCGame): string[] {
  const flow = game.getFlowState();
  if (!flow?.awaitingInput) return [];
  const seats = flow.awaitingPlayers?.length
    ? flow.awaitingPlayers.filter(p => !p.completed).map(p => ({ seat: p.playerIndex, offers: p.availableActions }))
    : [{ seat: flow.currentPlayer!, offers: flow.availableActions ?? [] }];
  return seats.flatMap(({ seat, offers }) => {
    if (offers.length !== 1) return [];
    const action = game.getAction(offers[0])!;
    const autoPlayed = action.selections.length === 0 && !action.manual && !(offers[0] in game.getDisabledActions(seat));
    return autoPlayed ? offers : [];
  });
}

describe('client auto-execute', () => {
  it.each(DICTATORS)('never leaves a seat a lone choiceless action for the client to play for it, against %s', (dictator) => {
    const autoPlayed = new Set<string>();
    for (const rebels of [1, 2, 3]) {
      randomPlay('i110', dictator, rebels, game => autoPlayedOffers(game).forEach(name => autoPlayed.add(name)));
    }
    expect([...autoPlayed]).toEqual([]);
  });
});
