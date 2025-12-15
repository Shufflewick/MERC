/**
 * AI Helper Functions
 *
 * Based on: data/rules/10-dictator-ai.md
 *
 * Contains helper functions for AI decision-making including:
 * - Rebel strength calculation
 * - Target prioritization
 * - Distance calculations
 * - Sector selection logic
 */

import type { MERCGame, RebelPlayer } from './game.js';
import { Sector, MercCard, Equipment } from './elements.js';

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

  // If tied, roll dice (random)
  if (weakest.length > 1) {
    const randomIndex = Math.floor(Math.random() * weakest.length);
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
// Distance Calculations
// =============================================================================

/**
 * Calculate minimum distance from a sector to any rebel-controlled sector.
 * Uses BFS to find shortest path.
 */
export function distanceToNearestRebel(game: MERCGame, sector: Sector): number {
  const rebelSectors = getRebelControlledSectors(game);
  if (rebelSectors.length === 0) return Infinity;

  // Check if this sector itself is rebel-controlled
  if (rebelSectors.some(r => r.sectorId === sector.sectorId)) {
    return 0;
  }

  // BFS to find shortest distance
  const visited = new Set<string>([sector.sectorId]);
  const queue: Array<{ sector: Sector; distance: number }> = [{ sector, distance: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const adjacent of game.getAdjacentSectors(current.sector)) {
      if (visited.has(adjacent.sectorId)) continue;
      visited.add(adjacent.sectorId);

      if (rebelSectors.some(r => r.sectorId === adjacent.sectorId)) {
        return current.distance + 1;
      }

      queue.push({ sector: adjacent, distance: current.distance + 1 });
    }
  }

  return Infinity;
}

/**
 * Calculate minimum distance between two sectors.
 * Uses BFS to find shortest path.
 */
export function distanceBetweenSectors(game: MERCGame, from: Sector, to: Sector): number {
  if (from.sectorId === to.sectorId) return 0;

  const visited = new Set<string>([from.sectorId]);
  const queue: Array<{ sector: Sector; distance: number }> = [{ sector: from, distance: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const adjacent of game.getAdjacentSectors(current.sector)) {
      if (visited.has(adjacent.sectorId)) continue;
      visited.add(adjacent.sectorId);

      if (adjacent.sectorId === to.sectorId) {
        return current.distance + 1;
      }

      queue.push({ sector: adjacent, distance: current.distance + 1 });
    }
  }

  return Infinity;
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
 */
export function sortTargetsByAIPriority<T extends CombatTarget>(targets: T[]): T[] {
  return [...targets].sort((a, b) => {
    // 4.6.1 - Lowest health + armor (survivability)
    const survA = a.health + a.armor;
    const survB = b.health + b.armor;
    if (survA !== survB) return survA - survB;

    // 4.6.2 - Highest number of targets
    if (a.targets !== b.targets) return b.targets - a.targets;

    // 4.6.3 - Highest initiative
    if (a.initiative !== b.initiative) return b.initiative - a.initiative;

    // 4.6.4 - Random tie-breaker
    return Math.random() - 0.5;
  });
}

// =============================================================================
// Base Location Selection (Section 4.1)
// =============================================================================

/**
 * Select base location for AI dictator.
 * Per rules 4.1:
 * 1. Furthest from Rebels
 * 2. If tied, most defended (most Dictator forces)
 * 3. If tied, highest value Industry
 * 4. If still tied, random
 */
export function selectAIBaseLocation(game: MERCGame): Sector | null {
  const controlledIndustries = game.gameMap.getAllSectors()
    .filter(s => s.isIndustry && s.dictatorMilitia > 0);

  if (controlledIndustries.length === 0) {
    // Fallback to any controlled sector
    const anyControlled = game.gameMap.getAllSectors()
      .filter(s => s.dictatorMilitia > 0);
    if (anyControlled.length === 0) return null;
    return anyControlled[0];
  }

  if (controlledIndustries.length === 1) {
    return controlledIndustries[0];
  }

  // Sort by priority criteria
  const sorted = [...controlledIndustries].sort((a, b) => {
    // 4.1.1 - Furthest from rebels (higher distance = better)
    const distA = distanceToNearestRebel(game, a);
    const distB = distanceToNearestRebel(game, b);
    if (distA !== distB) return distB - distA;

    // 4.1.2 - Most defended (higher militia = better)
    if (a.dictatorMilitia !== b.dictatorMilitia) {
      return b.dictatorMilitia - a.dictatorMilitia;
    }

    // 4.1.3 - Highest value (higher value = better)
    if (a.industryValue !== b.industryValue) {
      return (b.industryValue || 0) - (a.industryValue || 0);
    }

    // 4.1.4 - Random tie-breaker
    return Math.random() - 0.5;
  });

  return sorted[0];
}

// =============================================================================
// AI Militia Placement (Section 4.4)
// =============================================================================

/**
 * Select sector for AI militia placement.
 * Per rules 4.4, depends on placement type:
 * - Rebel sectors: weakest rebel force
 * - Neutral sectors: highest value closest to base
 * - Dictator sectors: closest to rebel
 */
export function selectMilitiaPlacementSector(
  game: MERCGame,
  allowedSectors: Sector[],
  placementType: 'rebel' | 'neutral' | 'dictator'
): Sector | null {
  if (allowedSectors.length === 0) return null;
  if (allowedSectors.length === 1) return allowedSectors[0];

  switch (placementType) {
    case 'rebel':
      // 4.4.1 - Choose weakest rebel sector
      return chooseWeakestRebelSector(game, allowedSectors);

    case 'neutral':
      // 4.4.2 - Highest value closest to base
      const baseSector = game.dictatorPlayer.baseSectorId
        ? game.getSector(game.dictatorPlayer.baseSectorId)
        : null;
      const dictatorSectors = game.gameMap.getAllSectors()
        .filter(s => s.dictatorMilitia > 0);

      return [...allowedSectors].sort((a, b) => {
        // Closest to base (or any dictator sector)
        let distA = baseSector ? distanceBetweenSectors(game, a, baseSector) : Infinity;
        let distB = baseSector ? distanceBetweenSectors(game, b, baseSector) : Infinity;

        if (!baseSector && dictatorSectors.length > 0) {
          distA = Math.min(...dictatorSectors.map(d => distanceBetweenSectors(game, a, d)));
          distB = Math.min(...dictatorSectors.map(d => distanceBetweenSectors(game, b, d)));
        }

        if (distA !== distB) return distA - distB;

        // Highest value
        return (b.industryValue || 0) - (a.industryValue || 0);
      })[0];

    case 'dictator':
      // 4.4.3 - Closest to rebel-controlled sector
      return [...allowedSectors].sort((a, b) => {
        const distA = distanceToNearestRebel(game, a);
        const distB = distanceToNearestRebel(game, b);
        return distA - distB;
      })[0];

    default:
      return allowedSectors[0];
  }
}

// =============================================================================
// AI Equipment Selection (Section 4.7)
// =============================================================================

/**
 * Check if equipment should be left in stash.
 * Per rules 4.7.2: Always leave Land Mines and Repair Kits.
 */
export function shouldLeaveInStash(equipment: Equipment): boolean {
  const name = equipment.equipmentName.toLowerCase();
  return name.includes('land mine') || name.includes('repair kit');
}

/**
 * Sort equipment by AI priority (highest serial number first).
 * Per rules 4.7.3: Take equipment with highest number.
 */
export function sortEquipmentByAIPriority(equipment: Equipment[]): Equipment[] {
  return [...equipment]
    .filter(e => !shouldLeaveInStash(e))
    .sort((a, b) => (b.serial || 0) - (a.serial || 0));
}

/**
 * Sort MERCs alphabetically for equipping order.
 * Per rules 4.7.1: Equip MERCs in alphabetical order.
 */
export function sortMercsAlphabetically(mercs: MercCard[]): MercCard[] {
  return [...mercs].sort((a, b) => a.mercName.localeCompare(b.mercName));
}

// =============================================================================
// AI MERC Hiring (Section 4.3)
// =============================================================================

/**
 * Select sector for new AI MERC placement.
 * Per rules 4.3.2: Dictator-controlled sector closest to weakest rebel sector.
 */
export function selectNewMercLocation(game: MERCGame): Sector | null {
  const dictatorSectors = game.gameMap.getAllSectors()
    .filter(s => s.dictatorMilitia > 0);

  if (dictatorSectors.length === 0) return null;
  if (dictatorSectors.length === 1) return dictatorSectors[0];

  // Find weakest rebel sector
  const rebelSectors = getRebelControlledSectors(game);
  if (rebelSectors.length === 0) {
    // No rebels - just return most defended sector
    return dictatorSectors.sort((a, b) => b.dictatorMilitia - a.dictatorMilitia)[0];
  }

  const weakestRebel = chooseWeakestRebelSector(game, rebelSectors);
  if (!weakestRebel) return dictatorSectors[0];

  // Find dictator sector closest to weakest rebel
  return dictatorSectors.sort((a, b) => {
    const distA = distanceBetweenSectors(game, a, weakestRebel);
    const distB = distanceBetweenSectors(game, b, weakestRebel);
    return distA - distB;
  })[0];
}

// =============================================================================
// AI Land Mine Detonation (Section 4.8)
// =============================================================================

/**
 * Check and detonate land mine when dictator is attacked.
 * MERC-b65: Per rules 4.8, when rebels attack a sector, AI detonates
 * land mines immediately before combat, dealing 1 damage to all attackers.
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
  const landMines = stash.filter(e => e.equipmentName.toLowerCase().includes('land mine'));

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

// =============================================================================
// AI Auto-Equip (Section 4.7)
// =============================================================================

/**
 * Auto-equip dictator units from stash according to AI rules.
 * MERC-0dp: Per rules 4.7:
 * 1. Equip MERCs in alphabetical order
 * 2. Take equipment with highest serial number first
 * 3. Leave land mines and repair kits in stash
 * Returns the number of items equipped.
 */
export function autoEquipDictatorUnits(game: MERCGame, sector: Sector): number {
  // Get all dictator units in this sector
  const units = game.dictatorPlayer.hiredMercs.filter(m => m.sectorId === sector.sectorId);
  if (game.dictatorPlayer.dictator?.inPlay && game.dictatorPlayer.dictator.sectorId === sector.sectorId) {
    units.push(game.dictatorPlayer.dictator as any);
  }

  if (units.length === 0) return 0;

  // Sort MERCs alphabetically (dictator card goes last)
  const sortedUnits = units.sort((a, b) => {
    const nameA = a instanceof MercCard ? a.mercName : 'ZZZZZ'; // Dictator card at end
    const nameB = b instanceof MercCard ? b.mercName : 'ZZZZZ';
    return nameA.localeCompare(nameB);
  });

  // Get equipment from stash, sorted by priority
  const stash = sector.getStashContents();
  const prioritizedEquipment = sortEquipmentByAIPriority(stash);

  let equippedCount = 0;

  // Equip each unit with highest priority equipment they can use
  for (const unit of sortedUnits) {
    for (const equipment of prioritizedEquipment) {
      // Skip if already removed from stash
      if (!sector.getStashContents().includes(equipment)) continue;

      // Check if unit can equip this type
      if (!unit.canEquip(equipment.equipmentType)) continue;

      // Check if unit already has this type
      const current = unit.getEquipmentOfType(equipment.equipmentType);
      if (current) {
        // Only swap if new equipment has higher serial
        if ((equipment.serial || 0) <= (current.serial || 0)) continue;

        // Unequip current
        unit.unequip(equipment.equipmentType);
        sector.addToStash(current);
      }

      // Equip new item
      const stashIdx = sector.getStashContents().indexOf(equipment);
      if (stashIdx >= 0) {
        sector.takeFromStash(stashIdx);
      }
      unit.equip(equipment);
      equippedCount++;

      if (unit instanceof MercCard) {
        game.message(`${unit.mercName} equipped ${equipment.equipmentName}`);
      } else {
        game.message(`Dictator equipped ${equipment.equipmentName}`);
      }
    }
  }

  return equippedCount;
}

// =============================================================================
// AI MERC Action Priority (Section 4.9)
// =============================================================================

export type AIActionType = 'attack' | 'move' | 'explore' | 'train' | 're-equip';

/**
 * Get prioritized actions for AI MERC.
 * MERC-vbc: Per rules 4.9, action priority is:
 * 1. Attack (if enemies present)
 * 2. Move toward weakest rebel
 * 3. Explore (if at unexplored sector)
 * 4. Train (if at controlled sector)
 * 5. Re-equip (if better equipment available)
 */
export function getAIMercActionPriority(
  game: MERCGame,
  merc: MercCard
): AIActionType[] {
  const priorities: AIActionType[] = [];
  const sector = merc.sectorId ? game.getSector(merc.sectorId) : null;

  if (!sector) return priorities;

  // 1. Attack - if enemies present in sector
  const hasEnemies = game.rebelPlayers.some(r =>
    r.primarySquad?.sectorId === sector.sectorId ||
    r.secondarySquad?.sectorId === sector.sectorId ||
    sector.getTotalRebelMilitia() > 0
  );
  if (hasEnemies) {
    priorities.push('attack');
  }

  // 2. Move - always an option if not attacking
  priorities.push('move');

  // 3. Explore - if at unexplored sector
  if (!sector.explored) {
    priorities.push('explore');
  }

  // 4. Train - if at controlled sector
  if (sector.dictatorMilitia > 0 && merc.training > 0) {
    priorities.push('train');
  }

  // 5. Re-equip - if stash has equipment
  if (sector.getStashContents().length > 0) {
    priorities.push('re-equip');
  }

  return priorities;
}

/**
 * Determine best move direction for AI MERC.
 * Moves toward the weakest rebel-controlled sector.
 */
export function getBestMoveDirection(game: MERCGame, fromSector: Sector): Sector | null {
  const adjacent = game.getAdjacentSectors(fromSector);
  if (adjacent.length === 0) return null;

  const rebelSectors = getRebelControlledSectors(game);
  if (rebelSectors.length === 0) {
    // No rebels - don't move
    return null;
  }

  const weakestRebel = chooseWeakestRebelSector(game, rebelSectors);
  if (!weakestRebel) return null;

  // Find adjacent sector that gets us closest to weakest rebel
  return [...adjacent].sort((a, b) => {
    const distA = distanceBetweenSectors(game, a, weakestRebel);
    const distB = distanceBetweenSectors(game, b, weakestRebel);
    return distA - distB;
  })[0];
}

// =============================================================================
// AI Healing and Saving MERCs (Section 4.10)
// =============================================================================

/**
 * Check if a MERC needs healing.
 * Per rules 4.10, AI prioritizes healing when MERCs are at low health.
 */
export function mercNeedsHealing(merc: MercCard): boolean {
  // Prioritize healing when health is 1 or less
  return merc.health <= 1 && merc.damage > 0;
}

/**
 * Check if stash has a repair kit.
 */
export function hasRepairKit(sector: Sector): boolean {
  return sector.getStashContents().some(e =>
    e.equipmentName.toLowerCase().includes('repair kit')
  );
}

/**
 * Use repair kit from stash to heal a MERC.
 * MERC-gqy: Per rules 4.10, AI uses repair kits to heal MERCs.
 * Returns true if healing was performed.
 */
export function useRepairKit(game: MERCGame, sector: Sector, merc: MercCard): boolean {
  const stash = sector.getStashContents();
  const repairKitIdx = stash.findIndex(e =>
    e.equipmentName.toLowerCase().includes('repair kit')
  );

  if (repairKitIdx < 0) return false;

  // Use the repair kit
  const repairKit = sector.takeFromStash(repairKitIdx);
  if (!repairKit) return false;

  // Heal the MERC fully
  const healed = merc.damage;
  merc.fullHeal();

  // Discard the repair kit (it's one-use)
  const discard = game.getEquipmentDiscard('Accessory');
  if (discard) {
    repairKit.putInto(discard);
  }

  game.message(`${merc.mercName} used Repair Kit and healed ${healed} damage`);
  return true;
}

/**
 * Get the damaged MERC that most needs healing.
 * Per rules 4.10, prioritize the lowest health MERC.
 */
export function getMostDamagedMerc(mercs: MercCard[]): MercCard | null {
  const damaged = mercs.filter(m => m.damage > 0 && !m.isDead);
  if (damaged.length === 0) return null;

  // Sort by health (lowest first), then alphabetically
  return damaged.sort((a, b) => {
    if (a.health !== b.health) return a.health - b.health;
    return a.mercName.localeCompare(b.mercName);
  })[0];
}

/**
 * Check if there's a hospital sector adjacent.
 * Hospitals are city sectors that have a hospital icon.
 */
export function findNearestHospital(game: MERCGame, fromSector: Sector): Sector | null {
  // BFS to find nearest hospital (city sector)
  const visited = new Set<string>([fromSector.sectorId]);
  const queue: Array<{ sector: Sector; distance: number }> = [{ sector: fromSector, distance: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Check if this is a hospital (city)
    if (current.sector.isCity && current.distance > 0) {
      return current.sector;
    }

    for (const adjacent of game.getAdjacentSectors(current.sector)) {
      if (visited.has(adjacent.sectorId)) continue;
      visited.add(adjacent.sectorId);
      queue.push({ sector: adjacent, distance: current.distance + 1 });
    }
  }

  return null;
}

// =============================================================================
// AI Mortar Attacks (Section 4.12)
// =============================================================================

/**
 * Check if a unit has a mortar equipped.
 */
export function hasMortar(unit: MercCard | { weaponSlot?: Equipment }): boolean {
  const weapon = unit.weaponSlot;
  return weapon?.equipmentName.toLowerCase().includes('mortar') ?? false;
}

/**
 * Get valid mortar targets from a sector.
 * MERC-un4: Mortars can attack adjacent rebel-controlled sectors.
 */
export function getMortarTargets(game: MERCGame, fromSector: Sector): Sector[] {
  const adjacent = game.getAdjacentSectors(fromSector);
  return adjacent.filter(sector => {
    // Check if sector has rebel forces
    const hasRebelMercs = game.rebelPlayers.some(r =>
      r.primarySquad?.sectorId === sector.sectorId ||
      r.secondarySquad?.sectorId === sector.sectorId
    );
    const hasRebelMilitia = sector.getTotalRebelMilitia() > 0;
    return hasRebelMercs || hasRebelMilitia;
  });
}

/**
 * Select best mortar target using AI priority.
 * MERC-un4: Per rules 4.12, AI always attacks with mortars when possible.
 * Targets the weakest rebel sector.
 */
export function selectMortarTarget(game: MERCGame, fromSector: Sector): Sector | null {
  const targets = getMortarTargets(game, fromSector);
  if (targets.length === 0) return null;

  // Choose weakest rebel sector
  return chooseWeakestRebelSector(game, targets);
}
