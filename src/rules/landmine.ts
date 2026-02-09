import type { MERCGame } from './game.js';
import type { Sector, Squad } from './elements.js';

export interface LandmineResult {
  detonated: boolean;
  disarmed: boolean;
  disarmedBy?: string;
}

/**
 * Check for and handle landmine detonation when squads enter a sector.
 *
 * Handles:
 * - Bidirectional detonation (rebel mines hurt dictator, dictator mines hurt rebels)
 * - Squidhead counter-ability (auto-disarm, mine goes to discard)
 * - Friendly mine detection (no trigger when entering player controls sector)
 *
 * @param game - The game instance
 * @param sector - The destination sector being entered
 * @param enteringSquads - The squad(s) entering the sector
 * @param enteringPlayerIsRebel - Whether the entering player is a rebel
 * @returns LandmineResult indicating what happened
 */
export function checkLandMines(
  _game: MERCGame,
  _sector: Sector,
  _enteringSquads: Squad[],
  _enteringPlayerIsRebel: boolean,
): LandmineResult {
  // Stub - not yet implemented
  throw new Error('checkLandMines not yet implemented');
}
