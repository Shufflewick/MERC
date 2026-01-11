/**
 * MERC Combat System - Retreat Mechanics
 *
 * Extracted from combat.ts for better code organization.
 * Contains retreat-related functions.
 */

import type { MERCGame, RebelPlayer, DictatorPlayer } from './game.js';
import { Sector } from './elements.js';

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
      (game.dictatorPlayer.baseRevealed &&
       game.dictatorPlayer.baseSectorId === sector.sectorId);

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
  console.log('[canRetreat] Called with sector:', sector.sectorId, 'player type:', game.isDictatorPlayer(player) ? 'dictator' : 'rebel');

  // Dictator retreat check
  if (game.isDictatorPlayer(player)) {
    const dictatorPlayer = game.dictatorPlayer;
    if (!dictatorPlayer) {
      console.log('[canRetreat] No dictator player found');
      return false;
    }

    // Check if dictator card is in this sector and alive
    // Use dictator's current sectorId, not baseSectorId (which is permanent base location)
    const dictatorCardInSector = dictatorPlayer.baseRevealed &&
      dictatorPlayer.dictator?.sectorId === sector.sectorId &&
      dictatorPlayer.dictator &&
      !dictatorPlayer.dictator.isDead;

    console.log('[canRetreat] Dictator check:', {
      baseRevealed: dictatorPlayer.baseRevealed,
      baseSectorId: dictatorPlayer.baseSectorId,
      dictatorSectorId: dictatorPlayer.dictator?.sectorId,
      combatSectorId: sector.sectorId,
      dictatorIsDead: dictatorPlayer.dictator?.isDead,
      dictatorCardInSector,
    });

    // Check if any hired MERCs are in this sector and alive
    const mercsInSector = game.getDictatorMercsInSector(sector);
    const hasLivingMercsInSector = mercsInSector.length > 0;
    console.log('[canRetreat] MERCs in sector:', mercsInSector.map(m => m.mercName), 'hasLiving:', hasLivingMercsInSector);

    if (!dictatorCardInSector && !hasLivingMercsInSector) {
      console.log('[canRetreat] No dictator units in sector, returning false');
      return false;
    }

    const validSectors = getValidRetreatSectors(game, sector, player);
    console.log('[canRetreat] Valid retreat sectors:', validSectors.map(s => s.sectorId));
    return validSectors.length > 0;
  }

  // Rebel retreat check (existing logic)
  const rebelPlayer = player as RebelPlayer;
  const hasLivingMercsInSector =
    (rebelPlayer.primarySquad.sectorId === sector.sectorId && rebelPlayer.primarySquad.livingMercCount > 0) ||
    (rebelPlayer.secondarySquad.sectorId === sector.sectorId && rebelPlayer.secondarySquad.livingMercCount > 0);

  console.log('[canRetreat] Rebel check:', {
    primarySectorId: rebelPlayer.primarySquad.sectorId,
    secondarySectorId: rebelPlayer.secondarySquad.sectorId,
    combatSectorId: sector.sectorId,
    primaryLiving: rebelPlayer.primarySquad.livingMercCount,
    secondaryLiving: rebelPlayer.secondarySquad.livingMercCount,
    hasLivingMercsInSector,
  });

  if (!hasLivingMercsInSector) {
    console.log('[canRetreat] No rebel MERCs in sector, returning false');
    return false;
  }

  const validSectors = getValidRetreatSectors(game, sector, player);
  console.log('[canRetreat] Valid retreat sectors:', validSectors.map(s => s.sectorId));
  return validSectors.length > 0;
}

/**
 * Execute retreat for a player's squad.
 * Per rules: Entire squad must retreat together. Militia cannot retreat.
 * Supports both rebel and dictator players.
 */
export function executeRetreat(
  game: MERCGame,
  fromSector: Sector,
  toSector: Sector,
  player: RebelPlayer | DictatorPlayer
): void {
  // Dictator retreat
  if (game.isDictatorPlayer(player)) {
    const dictatorPlayer = game.dictatorPlayer;
    if (!dictatorPlayer) return;

    // Move dictator card if it's in the combat sector
    // Note: baseSectorId is the PERMANENT base location, dictator.sectorId is current location
    if (dictatorPlayer.baseRevealed && dictatorPlayer.dictator?.sectorId === fromSector.sectorId) {
      dictatorPlayer.dictator.sectorId = toSector.sectorId;
      game.message(`${dictatorPlayer.dictator?.name || 'Dictator'} retreats to ${toSector.sectorName}`);
    }

    // Move any hired MERCs in the sector
    const mercsInSector = game.getDictatorMercsInSector(fromSector);
    for (const merc of mercsInSector) {
      merc.sectorId = toSector.sectorId;
      game.message(`${merc.name} retreats to ${toSector.sectorName}`);
    }

    // Note: Dictator militia do NOT retreat (per rules: "Militia cannot retreat")
    return;
  }

  // Rebel retreat (existing logic)
  const rebelPlayer = player as RebelPlayer;

  // Move primary squad if it's in the combat sector
  if (rebelPlayer.primarySquad.sectorId === fromSector.sectorId) {
    rebelPlayer.primarySquad.sectorId = toSector.sectorId;
    game.message(`${rebelPlayer.name}'s primary squad retreats to ${toSector.sectorName}`);
  }

  // Move secondary squad if it's in the combat sector
  if (rebelPlayer.secondarySquad.sectorId === fromSector.sectorId) {
    rebelPlayer.secondarySquad.sectorId = toSector.sectorId;
    game.message(`${rebelPlayer.name}'s secondary squad retreats to ${toSector.sectorName}`);
  }

  // Note: Militia do NOT retreat (per rules: "Militia cannot retreat")
}
