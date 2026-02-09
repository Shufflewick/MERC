import type { MERCGame } from './game.js';
import type { Sector, Squad, CombatantModel } from './elements.js';
import { isLandMine, getMineDamage } from './equipment-effects.js';
import { handlesLandMines } from './merc-abilities.js';

export interface LandmineResult {
  detonated: boolean;
  disarmed: boolean;
  disarmedBy?: string;
}

const NO_OP: LandmineResult = { detonated: false, disarmed: false };

/**
 * Check for and handle landmine detonation when squads enter a sector.
 *
 * Bidirectional: the mine always hurts whoever walks into it.
 * - Rebel entering dictator sector -> rebels take damage
 * - Dictator entering rebel sector -> dictator units take damage
 *
 * Squidhead counter: if any merc in the entering squads has the
 * handlesLandMines ability, the mine is auto-disarmed and sent to
 * the accessory discard pile. No damage is dealt.
 *
 * Friendly mines: if the entering player has no enemies in the sector,
 * the mine belongs to the entering player's faction and does not trigger.
 *
 * @param game - The game instance
 * @param sector - The destination sector being entered
 * @param enteringSquads - The squad(s) entering the sector
 * @param enteringPlayerIsRebel - Whether the entering player is a rebel
 * @returns LandmineResult indicating what happened
 */
export function checkLandMines(
  game: MERCGame,
  sector: Sector,
  enteringSquads: Squad[],
  enteringPlayerIsRebel: boolean,
): LandmineResult {
  // 1. Find first land mine in sector stash
  const stash = sector.getStashContents();
  const mineIndex = stash.findIndex(e => isLandMine(e.equipmentId));
  if (mineIndex === -1) return NO_OP;

  // 2. Check if mine is friendly (entering player controls the sector unopposed).
  //    A mine placed by the entering player's faction does not trigger.
  //    The mine is only friendly when the entering player has militia AND
  //    there are no enemy forces -- meaning the entering player controls
  //    the sector exclusively.
  if (isFriendlyMine(game, sector, enteringPlayerIsRebel)) {
    return NO_OP;
  }

  const mine = stash[mineIndex];
  const damage = getMineDamage(mine.equipmentId);

  // 3. Check Squidhead counter-ability across all entering squads
  const disarmer = findDisarmer(enteringSquads);
  if (disarmer) {
    // Disarm path: remove mine from stash, send to discard pile
    const taken = sector.takeFromStash(mineIndex);
    if (taken) {
      const discard = game.getEquipmentDiscard('Accessory');
      if (discard) {
        taken.putInto(discard);
      }
    }

    game.message(`${disarmer.combatantName} disarms a land mine at ${sector.sectorName}!`);

    return {
      detonated: false,
      disarmed: true,
      disarmedBy: disarmer.combatantName,
    };
  }

  // 4. Detonate path: pre-compute targets, then apply damage and discard mine
  //    The mine damages the ENTERING player's units.
  const targetMercs = getEnteringPlayerMercs(game, sector, enteringPlayerIsRebel);

  // Pre-compute animation data
  const targetNames = targetMercs.map(m => m.combatantName);
  const sectorName = sector.sectorName;

  // Check dictator card as a target (only when dictator is the entering player)
  let dictatorTarget: CombatantModel | undefined;
  if (!enteringPlayerIsRebel && game.isDictatorInSector(sector)) {
    dictatorTarget = game.dictatorPlayer.dictator;
    if (dictatorTarget) {
      targetNames.push(dictatorTarget.combatantName);
    }
  }

  // Militia counts for entering player
  const militiaCounts = getEnteringPlayerMilitia(game, sector, enteringPlayerIsRebel);

  game.animate('landmine-detonate', {
    sectorId: sector.sectorId,
    sectorName,
    targetNames,
    damage,
  }, () => {
    // Apply damage to entering player's mercs
    for (const merc of targetMercs) {
      merc.takeDamage(damage);
    }

    // Apply damage to dictator card if applicable
    if (dictatorTarget) {
      dictatorTarget.takeDamage(damage);
    }

    // Kill ALL militia belonging to the entering player
    if (enteringPlayerIsRebel) {
      for (const { playerId, count } of militiaCounts) {
        if (count > 0) {
          sector.removeRebelMilitia(playerId, count);
        }
      }
    } else {
      const dictatorMilitia = sector.dictatorMilitia;
      if (dictatorMilitia > 0) {
        sector.removeDictatorMilitia(dictatorMilitia);
      }
    }

    // Remove mine from stash and discard it
    // Re-find mine index since stash may have shifted
    const currentStash = sector.getStashContents();
    const currentIndex = currentStash.findIndex(e => isLandMine(e.equipmentId));
    if (currentIndex !== -1) {
      const taken = sector.takeFromStash(currentIndex);
      if (taken) {
        const discard = game.getEquipmentDiscard('Accessory');
        if (discard) {
          taken.putInto(discard);
        }
      }
    }
  });

  // Log damage messages
  for (const merc of targetMercs) {
    game.message(`Land mine deals ${damage} damage to ${merc.combatantName}`);
  }
  if (dictatorTarget) {
    game.message(`Land mine deals ${damage} damage to ${dictatorTarget.combatantName}`);
  }
  for (const { playerId, count } of militiaCounts) {
    if (count > 0) {
      if (enteringPlayerIsRebel) {
        const rebel = game.rebelPlayers.find(p => `${p.seat}` === playerId);
        game.message(`Land mine kills ${count} of ${rebel?.name ?? 'rebel'}'s militia`);
      }
    }
  }
  if (!enteringPlayerIsRebel) {
    const dictatorMilitiaKilled = militiaCounts.length > 0 ? militiaCounts[0]?.count ?? 0 : 0;
    if (dictatorMilitiaKilled > 0) {
      game.message(`Land mine kills ${dictatorMilitiaKilled} dictator militia`);
    }
  }

  game.message(`Land mine detonates at ${sector.sectorName}!`);

  return { detonated: true, disarmed: false };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Check if the mine is friendly to the entering player.
 * A mine is friendly when the entering player has militia in the sector
 * AND there are no enemy forces present. This means the entering player
 * controls the sector unopposed -- the mine was placed by their faction.
 *
 * If the sector is contested (both sides have forces) or empty (no
 * militia from either side), the mine is treated as hostile.
 */
function isFriendlyMine(
  game: MERCGame,
  sector: Sector,
  enteringPlayerIsRebel: boolean,
): boolean {
  if (enteringPlayerIsRebel) {
    // Rebel entering: friendly if rebel militia present AND no dictator forces
    if (sector.getTotalRebelMilitia() === 0) return false;
    if (sector.dictatorMilitia > 0) return false;
    if (game.getDictatorMercsInSector(sector).length > 0) return false;
    if (game.isDictatorInSector(sector)) return false;
    return true;
  } else {
    // Dictator entering: friendly if dictator militia present AND no rebel forces
    if (sector.dictatorMilitia === 0) return false;
    for (const rebel of game.rebelPlayers) {
      if (sector.getRebelMilitia(`${rebel.seat}`) > 0) return false;
      if (game.getMercsInSector(sector, rebel).length > 0) return false;
    }
    return true;
  }
}

/**
 * Find a merc with the landmine disarm ability in any of the entering squads.
 */
function findDisarmer(enteringSquads: Squad[]): CombatantModel | undefined {
  for (const squad of enteringSquads) {
    const living = squad.getLivingMercs();
    const disarmer = living.find(m => handlesLandMines(m.combatantId));
    if (disarmer) return disarmer;
  }
  return undefined;
}

/**
 * Get all mercs belonging to the entering player that are in the sector.
 * These are the damage targets for the landmine.
 */
function getEnteringPlayerMercs(
  game: MERCGame,
  sector: Sector,
  enteringPlayerIsRebel: boolean,
): CombatantModel[] {
  if (enteringPlayerIsRebel) {
    const mercs: CombatantModel[] = [];
    for (const rebel of game.rebelPlayers) {
      mercs.push(...game.getMercsInSector(sector, rebel));
    }
    return mercs;
  } else {
    return game.getDictatorMercsInSector(sector);
  }
}

/**
 * Get militia counts for the entering player by playerId.
 * Returns an array of { playerId, count } pairs for removal.
 */
function getEnteringPlayerMilitia(
  game: MERCGame,
  sector: Sector,
  enteringPlayerIsRebel: boolean,
): Array<{ playerId: string; count: number }> {
  if (enteringPlayerIsRebel) {
    return game.rebelPlayers.map(rebel => ({
      playerId: `${rebel.seat}`,
      count: sector.getRebelMilitia(`${rebel.seat}`),
    }));
  } else {
    // For dictator, return a single entry with the full militia count
    return [{ playerId: 'dictator', count: sector.dictatorMilitia }];
  }
}
