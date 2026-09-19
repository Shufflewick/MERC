/**
 * Builders for combat state a test needs to stand up directly.
 *
 * These exist so a test says "a combat is running here" in the shape the game
 * itself writes. Hand-written literals had drifted into an invented
 * `{ rebels, dictator }` object that no production code reads: the real state
 * carries `rebelCombatants`/`dictatorCombatants` and their casualty lists, and
 * names the attacker by seat.
 */

import type { MERCGame } from '../../src/rules/game.js';

type ActiveCombat = NonNullable<MERCGame['activeCombat']>;

/**
 * The state of a combat that has just begun in `sectorId`, with nobody on
 * either side yet. `attackingPlayerSeat` is the seat that declared it, which is
 * how the game's own actions find the attacking player.
 */
export function activeCombatIn(sectorId: string, attackingPlayerSeat: number): ActiveCombat {
  return {
    sectorId,
    attackingPlayerId: `${attackingPlayerSeat}`,
    round: 1,
    rebelCombatants: [],
    dictatorCombatants: [],
    rebelCasualties: [],
    dictatorCasualties: [],
  };
}
