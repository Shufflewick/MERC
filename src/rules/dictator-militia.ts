import type { MERCGame } from './game.js';
import type { Sector } from './elements.js';
import { checkLandMines } from './landmine.js';
import { hasEnemies, queuePendingCombat } from './combat.js';

export interface DictatorMilitiaPlacement {
  placed: number;
  combatQueued: boolean;
}

/**
 * Put dictator militia into a sector. The arriving militia set off any hostile
 * land mine there, and if dictator forces survive alongside rebels, a fight starts.
 * Kim's base holds up to 20 militia; every other sector holds 10 (#130).
 * Every dictator militia placement after setup goes through here (#127).
 */
export function placeDictatorMilitia(
  game: MERCGame,
  sector: Sector,
  count: number,
): DictatorMilitiaPlacement {
  const placed = sector.addDictatorMilitia(count, isKimBase(game, sector));
  if (placed === 0) return { placed, combatQueued: false };

  checkLandMines(game, sector, [], false, placed);

  for (const rebel of game.rebelPlayers) {
    const hasSquad = rebel.primarySquad.sectorId === sector.sectorId ||
      rebel.secondarySquad.sectorId === sector.sectorId;
    const hasMilitia = sector.getRebelMilitia(`${rebel.seat}`) > 0;
    if ((hasSquad || hasMilitia) && hasEnemies(game, sector, rebel)) {
      if (combatPendingAt(game, sector)) return { placed, combatQueued: true };
      game.message(`Rebels detected at ${sector.sectorName} - combat begins!`);
      queuePendingCombat(game, sector, rebel, false);
      return { placed, combatQueued: true };
    }
  }
  return { placed, combatQueued: false };
}

export function isKimBase(game: MERCGame, sector: Sector): boolean {
  return game.dictatorPlayer.dictator?.combatantId === 'kim' &&
    sector.sectorId === game.dictatorPlayer.baseSectorId;
}

function combatPendingAt(game: MERCGame, sector: Sector): boolean {
  return game.pendingCombat?.sectorId === sector.sectorId ||
    game.pendingCombatQueue.some(c => c.sectorId === sector.sectorId);
}
