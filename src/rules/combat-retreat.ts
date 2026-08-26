/**
 * MERC Combat System - Retreat Mechanics
 *
 * Extracted from combat.ts for better code organization.
 * Contains retreat-related functions.
 */

import type { MERCGame, RebelPlayer, DictatorPlayer } from './game.js';
import { Sector, Squad } from './elements.js';

// =============================================================================
// Retreat Mechanics
// =============================================================================

/**
 * Get valid retreat sectors for a player.
 * Per rules (07-combat-system.md): Adjacent sector that is unoccupied or friendly.
 * Supports both rebel and dictator players.
 */
export function getValidRetreatSectors(
  game: MERCGame,
  currentSector: Sector,
  player: RebelPlayer | DictatorPlayer
): Sector[] {
  const adjacentSectors = game.getAdjacentSectors(currentSector);

  // Dictator retreat logic
  if (game.isDictatorPlayer(player)) {
    return adjacentSectors.filter(sector => {
      // Check for rebel forces in the sector
      const hasRebelForces = game.getTotalRebelUnitsInSector(sector) > 0;

      if (!hasRebelForces) {
        // Neutral sector - valid for retreat
        return true;
      }

      // Dictator-controlled = dictator units > rebel units
      const dictatorUnits = game.getDictatorUnitsInSector(sector);
      const rebelUnits = game.getTotalRebelUnitsInSector(sector);
      return dictatorUnits > rebelUnits;
    });
  }

  // Rebel retreat logic (existing)
  return adjacentSectors.filter(sector => {
    // MERC-4bp: Check for ALL dictator forces (militia, MERCs, and dictator card)
    const hasDictatorForces = sector.dictatorMilitia > 0 ||
      game.getDictatorMercsInSector(sector).length > 0 ||
      game.isDictatorInSector(sector);

    if (!hasDictatorForces) {
      return true;
    }

    // MERC-kpv: Friendly = controlled by this player OR any allied rebel
    // Per rules: retreat valid to sector "controlled by you or ally"
    const dictatorUnits = game.getDictatorUnitsInSector(sector);

    // Check if current player controls
    const playerUnits = game.getRebelUnitsInSector(sector, player as RebelPlayer);
    if (playerUnits > dictatorUnits) {
      return true;
    }

    // Check if any allied rebel controls (total rebel units > dictator)
    const totalRebelUnits = game.getTotalRebelUnitsInSector(sector);
    return totalRebelUnits > dictatorUnits;
  });
}

/**
 * Check if retreat is possible for a player.
 * Per rules: Only MERCs can retreat, militia cannot retreat.
 * Supports both rebel and dictator players.
 */
export function canRetreat(
  game: MERCGame,
  sector: Sector,
  player: RebelPlayer | DictatorPlayer
): boolean {
  if (getRetreatableSquads(game, sector, player).length === 0) {
    return false;
  }

  return getValidRetreatSectors(game, sector, player).length > 0;
}

/**
 * The squads a player could pull out of a sector.
 *
 * Retreat is per squad (rulebook p.3: "If one member of a squad needs to retreat
 * from combat, then the entire squad must retreat" — the squad, not the player).
 * The Dictator's base squad is excluded: it exists to hold the base, and he "must
 * be part of one of the 2 squads if he wishes to leave his base" (p.5).
 */
export function getRetreatableSquads(
  game: MERCGame,
  sector: Sector,
  player: RebelPlayer | DictatorPlayer
): Squad[] {
  const base = game.isDictatorPlayer(player) ? player.baseSquadOrNull : null;
  return player.squads.filter(squad =>
    squad.sectorId === sector.sectorId &&
    squad.livingMercCount > 0 &&
    (!base || squad.name !== base.name)
  );
}

/**
 * Execute retreat for a player.
 * Per rules: an entire squad retreats together, and militia never retreat.
 *
 * `squadName` pulls out just that squad, leaving the player's other squad to
 * fight on. Omit it to retreat every squad the player has in the sector.
 */
export function executeRetreat(
  game: MERCGame,
  fromSector: Sector,
  toSector: Sector,
  player: RebelPlayer | DictatorPlayer,
  squadName?: string
): void {
  const retreating = getRetreatableSquads(game, fromSector, player)
    .filter(squad => !squadName || squad.name === squadName);

  if (retreating.length === 0) return;

  for (const squad of retreating) {
    for (const merc of squad.getLivingMercs()) {
      game.message(`${merc.combatantName} retreats to ${toSector.sectorName}`);
    }
    // MERCs inherit the sector from their squad via a computed getter.
    squad.sectorId = toSector.sectorId;
  }

  // Note: militia do NOT retreat (per rules: "Militia cannot retreat")
}
