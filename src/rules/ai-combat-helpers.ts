/**
 * MERC AI Combat Helpers
 *
 * Extracted from ai-helpers.ts for better code organization.
 * Contains combat-related AI functions.
 */

import type { MERCGame } from './game.js';
import { Sector, MercCard } from './elements.js';
import { isLandMine } from './equipment-effects.js';

// =============================================================================
// Rebel Strength Calculation (Section 4.5)
// =============================================================================

/**
 * Calculate rebel strength in a sector.
 * Per rules 4.5: Total armor + health of all Rebel forces.
 */
export function calculateRebelStrength(game: MERCGame, sector: Sector): number {
  let total = 0;

  for (const rebel of game.rebelPlayers) {
    // Check if rebel has squads in this sector
    if (rebel.primarySquad?.sectorId === sector.sectorId) {
      for (const merc of rebel.primarySquad.getMercs()) {
        total += merc.health + merc.equipmentArmor;
      }
    }
    if (rebel.secondarySquad?.sectorId === sector.sectorId) {
      for (const merc of rebel.secondarySquad.getMercs()) {
        total += merc.health + merc.equipmentArmor;
      }
    }

    // Add militia (each militia has 1 health, 0 armor)
    const militia = sector.getRebelMilitia(`${rebel.position}`);
    total += militia; // 1 health each, 0 armor
  }

  return total;
}

/**
 * Choose the weakest rebel sector from a list.
 * Per rules 4.5.1: Choose the weaker force.
 * Per rules 4.5.2: If tied, roll dice (random).
 */
export function chooseWeakestRebelSector(game: MERCGame, sectors: Sector[]): Sector | null {
  if (sectors.length === 0) return null;
  if (sectors.length === 1) return sectors[0];

  // Calculate strength for each sector
  const sectorsWithStrength = sectors.map(s => ({
    sector: s,
    strength: calculateRebelStrength(game, s),
  }));

  // Find minimum strength
  const minStrength = Math.min(...sectorsWithStrength.map(s => s.strength));

  // Get all sectors with minimum strength (for tie-breaking)
  const weakest = sectorsWithStrength.filter(s => s.strength === minStrength);

  // If tied, roll dice using seeded random
  if (weakest.length > 1) {
    const randomIndex = Math.floor(game.random() * weakest.length);
    return weakest[randomIndex].sector;
  }

  return weakest[0].sector;
}

/**
 * Get all rebel-controlled sectors.
 */
export function getRebelControlledSectors(game: MERCGame): Sector[] {
  const rebelSectors: Sector[] = [];

  for (const rebel of game.rebelPlayers) {
    const controlled = game.getControlledSectors(rebel);
    for (const sector of controlled) {
      if (!rebelSectors.some(s => s.sectorId === sector.sectorId)) {
        rebelSectors.push(sector);
      }
    }
  }

  return rebelSectors;
}

// =============================================================================
// AI Target Selection (Section 4.6)
// =============================================================================

export interface CombatTarget {
  id: string;
  name: string;
  health: number;
  armor: number;
  targets: number;
  initiative: number;
  sourceElement: MercCard | null;
}

/**
 * Sort targets by AI priority.
 * Per rules 4.6:
 * 1. Lowest health + armor
 * 2. If tied, highest number of targets
 * 3. If tied, highest initiative
 * 4. If still tied, random
 * @param random - Seeded random function from game.random
 */
export function sortTargetsByAIPriority<T extends CombatTarget>(targets: T[], random: () => number): T[] {
  return [...targets].sort((a, b) => {
    // 4.6.1 - Lowest health + armor (survivability)
    const survA = a.health + a.armor;
    const survB = b.health + b.armor;
    if (survA !== survB) return survA - survB;

    // 4.6.2 - Highest number of targets
    if (a.targets !== b.targets) return b.targets - a.targets;

    // 4.6.3 - Highest initiative
    if (a.initiative !== b.initiative) return b.initiative - a.initiative;

    // 4.6.4 - Random tie-breaker using seeded random
    return random() - 0.5;
  });
}

// =============================================================================
// AI Land Mine Detonation (Section 4.2 - When Attacked)
// =============================================================================

/**
 * Check and detonate land mine when dictator is attacked.
 * MERC-0nu: Per rules 4.2 ("When Attacked"), when rebels attack a sector,
 * AI detonates land mines immediately before combat, dealing 1 damage to all attackers.
 * Returns the number of land mines detonated.
 */
export function detonateLandMines(
  game: MERCGame,
  sector: Sector,
  attackingPlayer: { name: string }
): { detonated: number; damageDealt: number } {
  // Check if sector has dictator forces (land mine must be "planted" by dictator)
  if (sector.dictatorMilitia === 0 && !game.dictatorPlayer.hiredMercs.some(m => m.sectorId === sector.sectorId)) {
    return { detonated: 0, damageDealt: 0 };
  }

  // Find land mines in stash
  const stash = sector.getStashContents();
  const landMines = stash.filter(e => isLandMine(e.equipmentId));

  if (landMines.length === 0) {
    return { detonated: 0, damageDealt: 0 };
  }

  // Detonate first land mine (rules say "a mine" singular)
  const mine = landMines[0];
  const idx = stash.indexOf(mine);
  sector.takeFromStash(idx);

  // Deal 1 damage to every rebel unit in the sector
  let damageDealt = 0;

  // Damage rebel MERCs
  for (const rebel of game.rebelPlayers) {
    const mercsInSector = game.getMercsInSector(sector, rebel);
    for (const merc of mercsInSector) {
      merc.takeDamage(1);
      damageDealt++;
      game.message(`Land mine deals 1 damage to ${merc.mercName}`);
    }
  }

  // Damage rebel militia
  for (const rebel of game.rebelPlayers) {
    const militia = sector.getRebelMilitia(`${rebel.position}`);
    if (militia > 0) {
      sector.removeRebelMilitia(`${rebel.position}`, 1);
      damageDealt++;
      game.message(`Land mine kills 1 of ${rebel.name}'s militia`);
    }
  }

  // Discard the mine
  const discard = game.getEquipmentDiscard('Accessory');
  if (discard) {
    mine.putInto(discard);
  }

  game.message(`Dictator detonates land mine at ${sector.sectorName}!`);

  return { detonated: 1, damageDealt };
}
