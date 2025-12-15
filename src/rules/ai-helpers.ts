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
// Privacy Player Designation (Section AI Setup)
// =============================================================================

/**
 * Check if a player is the designated privacy player.
 * MERC-q4v: Per rules, one Rebel player is designated to:
 * - Take all Dictator actions
 * - See hidden information (mine locations, etc.)
 * - Make AI decisions impartially
 */
export function isPrivacyPlayer(game: MERCGame, playerId: string): boolean {
  return game.dictatorPlayer.privacyPlayerId === playerId;
}

/**
 * Get the privacy player.
 * MERC-q4v: Per rules, returns the designated Rebel player for AI decisions.
 */
export function getPrivacyPlayer(game: MERCGame): { name: string; position: number } | null {
  const privacyId = game.dictatorPlayer.privacyPlayerId;
  if (!privacyId) return null;

  const rebel = game.rebelPlayers.find(r => r.position.toString() === privacyId);
  if (rebel) {
    return { name: rebel.name, position: rebel.position };
  }
  return null;
}

/**
 * Designate a privacy player for AI decisions.
 * MERC-q4v: Should be called during setup.
 */
export function setPrivacyPlayer(game: MERCGame, playerId: string): void {
  game.dictatorPlayer.privacyPlayerId = playerId;
  game.message(`Player ${playerId} designated as Privacy Player for AI decisions`);
}

// =============================================================================
// Dictator Base Restriction (Section 4.1)
// =============================================================================

/**
 * Check if dictator can move from their current sector.
 * MERC-mme: Per rules 4.1 "Post-Revelation Behavior":
 * - Dictator stays at base (never leaves)
 * - Takes actions as if a MERC (equip, train, etc.)
 */
export function canDictatorMove(game: MERCGame): boolean {
  // If base is not revealed yet, dictator hasn't spawned so can't move
  if (!game.dictatorPlayer.baseRevealed) {
    return false;
  }

  // MERC-mme: Once revealed, dictator NEVER leaves base
  return false;
}

/**
 * Check if a unit is the dictator at their base.
 * MERC-mme: Used to enforce base restriction.
 */
export function isDictatorAtBase(game: MERCGame): boolean {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || !dictator.inPlay) return false;

  const baseSectorId = game.dictatorPlayer.baseSectorId;
  return dictator.sectorId === baseSectorId;
}

/**
 * Get valid actions for dictator at base.
 * MERC-mme: Dictator can equip, train, but NOT move.
 */
export function getDictatorBaseActions(): AIActionType[] {
  return ['explore', 're-equip', 'train']; // No 'move'
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
// AI Militia Placement (Section 4.4 & Setup)
// =============================================================================

/**
 * Check if extra militia should be skipped for solo/1-rebel games.
 * MERC-93p: Per AI Setup rules, extra militia is skipped "unless solo/1 Rebel".
 */
export function shouldSkipExtraMilitia(game: MERCGame): boolean {
  // MERC-93p: Skip extra militia for solo games (1 rebel)
  return game.rebelPlayers.length <= 1;
}

/**
 * Distribute militia evenly among Dictator-controlled Industries.
 * MERC-cgn: Per AI Setup rules, extra militia during setup are distributed EVENLY
 * among Dictator-controlled Industries (not using placement priority).
 * MERC-93p: Skips if solo/1-rebel game.
 */
export function distributeExtraMilitiaEvenly(
  game: MERCGame,
  totalMilitia: number
): Map<string, number> {
  const placements = new Map<string, number>();

  // MERC-93p: Skip extra militia for solo games
  if (shouldSkipExtraMilitia(game)) {
    game.message('Solo game: skipping extra militia');
    return placements;
  }

  // Get dictator-controlled industries
  const dictatorIndustries = game.gameMap.getAllSectors().filter(
    s => s.isIndustry && s.dictatorMilitia > 0
  );

  if (dictatorIndustries.length === 0 || totalMilitia === 0) {
    return placements;
  }

  // Calculate even distribution
  const basePerSector = Math.floor(totalMilitia / dictatorIndustries.length);
  let remainder = totalMilitia % dictatorIndustries.length;

  // Sort industries by value (highest first) for distributing remainder
  const sortedIndustries = [...dictatorIndustries].sort((a, b) =>
    (b.industryValue || 0) - (a.industryValue || 0)
  );

  for (const sector of sortedIndustries) {
    let toPlace = basePerSector;

    // Distribute remainder to highest value industries first
    if (remainder > 0) {
      toPlace++;
      remainder--;
    }

    if (toPlace > 0) {
      const placed = sector.addDictatorMilitia(toPlace);
      if (placed > 0) {
        placements.set(sector.sectorId, placed);
        game.message(`Placed ${placed} extra militia at ${sector.sectorName}`);
      }
    }
  }

  return placements;
}

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
 * Get free equipment type for AI.
 * MERC-pyo: Per rules 4.3.3, AI always chooses Weapon as free equipment.
 */
export function getAIFreeEquipmentType(): 'Weapon' | 'Armor' | 'Accessory' {
  return 'Weapon';
}

/**
 * Select MERC for AI hiring when there's a choice.
 * MERC-632: Per rules 4.3.1, if choice of more than 1, pick randomly from top of deck.
 * Returns the index of the selected MERC.
 */
export function selectAIMercForHiring(availableMercs: MercCard[]): number {
  if (availableMercs.length === 0) return -1;
  if (availableMercs.length === 1) return 0;

  // MERC-632: Random selection
  return Math.floor(Math.random() * availableMercs.length);
}

/**
 * Select multiple MERCs for AI hiring.
 * MERC-632: Per rules 4.3.1, pick randomly when there's a choice.
 * Returns indices of selected MERCs.
 */
export function selectAIMercsForHiring(
  availableMercs: MercCard[],
  countToSelect: number
): number[] {
  if (availableMercs.length === 0 || countToSelect <= 0) return [];

  const indices: number[] = [];
  const available = availableMercs.map((_, i) => i);

  for (let i = 0; i < Math.min(countToSelect, availableMercs.length); i++) {
    // MERC-632: Random selection
    const randomIdx = Math.floor(Math.random() * available.length);
    indices.push(available[randomIdx]);
    available.splice(randomIdx, 1);
  }

  return indices;
}

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
// AI MERC Action Priority (Section 3)
// =============================================================================

export type AIActionType = 'explore' | 're-equip' | 'train' | 'move';

export interface AIActionDecision {
  action: AIActionType;
  target?: Sector;
  reason: string;
}

/**
 * Sort MERCs by Initiative order (highest first).
 * MERC-est: Per rules Section 3 "Action Order", MERCs act in Initiative order.
 */
export function sortMercsByInitiative(mercs: MercCard[]): MercCard[] {
  return [...mercs].sort((a, b) => {
    // Higher initiative acts first
    if (a.initiative !== b.initiative) {
      return b.initiative - a.initiative;
    }
    // Tie-breaker: alphabetical
    return a.mercName.localeCompare(b.mercName);
  });
}

/**
 * Get all AI MERCs in the same squad/sector for movement cohesion.
 * MERC-1gu: Per rules 3.4, "Never split the squad - All MERCs with actions remaining move together"
 */
export function getSquadMercs(game: MERCGame): MercCard[] {
  const mercs = game.dictatorPlayer.hiredMercs.filter(m => !m.isDead && m.sectorId);
  return sortMercsByInitiative(mercs);
}

/**
 * Check if all MERCs in a sector can move together.
 * MERC-1gu: Squad cohesion - never split the squad.
 */
export function canSquadMoveTogether(game: MERCGame, fromSectorId: string): boolean {
  const mercsInSector = game.dictatorPlayer.hiredMercs.filter(
    m => m.sectorId === fromSectorId && !m.isDead
  );
  // All MERCs must have actions remaining to move together
  return mercsInSector.every(m => m.actionsRemaining > 0);
}

/**
 * Get squad action decision - considers all MERCs in the squad together.
 * MERC-1gu: Per rules 3.4, all MERCs move together when possible.
 * Returns a single decision for the entire squad.
 */
export function getSquadAction(game: MERCGame): AIActionDecision & { mercs: MercCard[] } {
  const mercs = getSquadMercs(game);
  if (mercs.length === 0) {
    return { action: 'move', reason: 'No MERCs available', mercs: [] };
  }

  // Get the first MERC's sector (all should be in same sector for squad cohesion)
  const sector = mercs[0].sectorId ? game.getSector(mercs[0].sectorId) : null;
  if (!sector) {
    return { action: 'move', reason: 'No sector', mercs };
  }

  // Get decision for the leader (highest initiative)
  const decision = getAIMercAction(game, mercs[0]);

  // For move actions, ensure all MERCs move together
  if (decision.action === 'move' && decision.target) {
    const canMove = canSquadMoveTogether(game, sector.sectorId);
    if (!canMove) {
      // Some MERCs don't have actions - train instead if possible
      if (sector.dictatorMilitia < 10 && mercs.some(m => m.training > 0)) {
        return { action: 'train', reason: 'MERC-1gu: Squad cannot move together, train instead', mercs };
      }
    }
  }

  return { ...decision, mercs };
}

/**
 * Check if MERC is fully equipped.
 * MERC-81u: Per rules 3.1, not fully equipped = explore/re-equip priority
 */
function isMercFullyEquipped(merc: MercCard): boolean {
  return merc.isFullyEquipped;
}

/**
 * Check if sector is an undefended industry.
 * MERC-ang: Per rules 3.2, undefended = industry with 0 dictator militia
 */
function isUndefendedIndustry(sector: Sector): boolean {
  return sector.isIndustry && sector.dictatorMilitia === 0;
}

/**
 * Find unoccupied industries within movement range.
 * MERC-qzt: Per rules 3.3, unoccupied = no forces present
 */
export function findUnoccupiedIndustriesInRange(game: MERCGame, fromSector: Sector): Sector[] {
  const allSectors = game.gameMap.getAllSectors();
  return allSectors.filter(s => {
    if (!s.isIndustry) return false;
    // Unoccupied = no dictator militia, no rebel militia, no squads
    if (s.dictatorMilitia > 0) return false;
    if (s.getTotalRebelMilitia() > 0) return false;
    const hasSquads = game.rebelPlayers.some(r =>
      r.primarySquad?.sectorId === s.sectorId ||
      r.secondarySquad?.sectorId === s.sectorId
    );
    if (hasSquads) return false;
    // Check if in range (adjacent or reachable in 1-2 moves)
    const dist = distanceBetweenSectors(game, fromSector, s);
    return dist <= 2; // "in range" = within 2 moves
  });
}

/**
 * Check if any rebel is in range.
 * MERC-1gu: Per rules 3.4, rebel in range = adjacent or close
 */
function isRebelInRange(game: MERCGame, fromSector: Sector): boolean {
  const rebelSectors = getRebelControlledSectors(game);
  for (const rebelSector of rebelSectors) {
    const dist = distanceBetweenSectors(game, fromSector, rebelSector);
    if (dist <= 2) return true; // In range = within 2 moves
  }
  return false;
}

/**
 * Get AI MERC action decision following priority rules.
 * Per rules Section 3, priority order is:
 * 3.1 - If not fully equipped → Explore and equip/re-equip
 * 3.2 - If on undefended Industry → Train militia
 * 3.3 - If unoccupied Industry in range → Move to it
 * 3.4 - If Rebel in range → Move toward closest Rebel
 * 3.5 - If militia < 10 → Train militia
 * 3.6 - Default → Move toward nearest Rebel
 */
export function getAIMercAction(game: MERCGame, merc: MercCard): AIActionDecision {
  const sector = merc.sectorId ? game.getSector(merc.sectorId) : null;

  if (!sector) {
    return { action: 'move', reason: 'No sector' };
  }

  // 3.1 - If not fully equipped, explore or re-equip
  if (!isMercFullyEquipped(merc)) {
    if (!sector.explored) {
      return { action: 'explore', reason: '3.1: Not fully equipped, explore sector' };
    }
    const stash = sector.getStashContents();
    const usableEquipment = stash.filter(e => !shouldLeaveInStash(e));
    if (usableEquipment.length > 0) {
      return { action: 're-equip', reason: '3.1: Not fully equipped, equip from stash' };
    }
  }

  // 3.2 - If on undefended Industry, train militia
  if (isUndefendedIndustry(sector) && merc.training > 0) {
    return { action: 'train', reason: '3.2: On undefended industry, train militia' };
  }

  // 3.3 - If unoccupied Industry in range, move to it
  const unoccupiedIndustries = findUnoccupiedIndustriesInRange(game, sector);
  if (unoccupiedIndustries.length > 0) {
    // Find closest unoccupied industry
    const closest = unoccupiedIndustries.sort((a, b) =>
      distanceBetweenSectors(game, sector, a) - distanceBetweenSectors(game, sector, b)
    )[0];
    return { action: 'move', target: closest, reason: '3.3: Move to unoccupied industry' };
  }

  // 3.4 - If Rebel in range, move toward closest
  if (isRebelInRange(game, sector)) {
    const target = getBestMoveDirection(game, sector);
    if (target) {
      return { action: 'move', target, reason: '3.4: Rebel in range, move toward' };
    }
  }

  // 3.5 - If militia < 10, train
  if (sector.dictatorMilitia < 10 && merc.training > 0) {
    return { action: 'train', reason: '3.5: Militia < 10, train' };
  }

  // 3.6 - Default: move toward nearest rebel
  const target = getBestMoveDirection(game, sector);
  if (target) {
    return { action: 'move', target, reason: '3.6: Default, move toward rebel' };
  }

  // Fallback: train if possible
  if (merc.training > 0 && sector.dictatorMilitia < 10) {
    return { action: 'train', reason: 'Fallback: train militia' };
  }

  return { action: 'move', reason: 'No action available' };
}

/**
 * Legacy function for backwards compatibility.
 * @deprecated Use getAIMercAction instead
 */
export function getAIMercActionPriority(
  game: MERCGame,
  merc: MercCard
): AIActionType[] {
  const decision = getAIMercAction(game, merc);
  return [decision.action];
}

/**
 * Find the closest rebel-controlled sector.
 * MERC-asf: Per rules 3.4, move toward CLOSEST rebel sector.
 */
export function findClosestRebelSector(game: MERCGame, fromSector: Sector): Sector | null {
  const rebelSectors = getRebelControlledSectors(game);
  if (rebelSectors.length === 0) return null;

  // Sort by distance (closest first), then by strength (weakest first) as tie-breaker
  const sorted = [...rebelSectors].sort((a, b) => {
    const distA = distanceBetweenSectors(game, fromSector, a);
    const distB = distanceBetweenSectors(game, fromSector, b);

    // MERC-asf: Primary sort by distance (closest first)
    if (distA !== distB) return distA - distB;

    // Tie-breaker: weaker force per rules 4.5
    const strengthA = calculateRebelStrength(game, a);
    const strengthB = calculateRebelStrength(game, b);
    if (strengthA !== strengthB) return strengthA - strengthB;

    // Final tie-breaker: random
    return Math.random() - 0.5;
  });

  return sorted[0];
}

/**
 * Determine best move direction for AI MERC.
 * MERC-asf: Per rules 3.4, moves toward the CLOSEST rebel-controlled sector.
 * Uses "weakest" (4.5) only as tie-breaker when multiple sectors are equidistant.
 */
export function getBestMoveDirection(game: MERCGame, fromSector: Sector): Sector | null {
  const adjacent = game.getAdjacentSectors(fromSector);
  if (adjacent.length === 0) return null;

  const rebelSectors = getRebelControlledSectors(game);
  if (rebelSectors.length === 0) {
    // No rebels - don't move
    return null;
  }

  // MERC-asf: Find the CLOSEST rebel sector (not weakest)
  const closestRebel = findClosestRebelSector(game, fromSector);
  if (!closestRebel) return null;

  // Find adjacent sector that gets us closest to the closest rebel
  return [...adjacent].sort((a, b) => {
    const distA = distanceBetweenSectors(game, a, closestRebel);
    const distB = distanceBetweenSectors(game, b, closestRebel);
    return distA - distB;
  })[0];
}

// =============================================================================
// AI Healing and Saving MERCs (Sections 4.8-4.10)
// =============================================================================

/**
 * Check if a MERC needs healing.
 * Per rules 4.8, AI prioritizes healing when MERCs are injured.
 */
export function mercNeedsHealing(merc: MercCard): boolean {
  return merc.damage > 0 && !merc.isDead;
}

/**
 * Get MERCs with healing abilities.
 * MERC-6kw: Per rules 4.8.1, AI uses MERC healing abilities first.
 */
export function getMercsWithHealingAbility(mercs: MercCard[]): MercCard[] {
  return mercs.filter(m =>
    !m.isDead &&
    m.ability &&
    (m.ability.toLowerCase().includes('heal') ||
     m.ability.toLowerCase().includes('medical') ||
     m.ability.toLowerCase().includes('restore'))
  );
}

/**
 * Get AI healing priority order.
 * MERC-6kw: Per rules 4.8:
 * 1. Use MERC healing abilities first
 * 2. Then discard combat dice for Medical Kit / First Aid Kit
 */
export interface AIHealingAction {
  type: 'ability' | 'item';
  merc?: MercCard;
  item?: string;
  target: MercCard;
}

export function getAIHealingPriority(
  game: MERCGame,
  damagedMercs: MercCard[],
  allMercs: MercCard[]
): AIHealingAction | null {
  if (damagedMercs.length === 0) return null;

  // Sort damaged MERCs by health (lowest first)
  const sortedDamaged = [...damagedMercs].sort((a, b) => a.health - b.health);
  const target = sortedDamaged[0];

  // MERC-6kw: 4.8.1 - Try MERC healing abilities first
  const healers = getMercsWithHealingAbility(allMercs);
  if (healers.length > 0) {
    return { type: 'ability', merc: healers[0], target };
  }

  // 4.8.2 - Then try Medical Kit or First Aid Kit
  for (const merc of allMercs) {
    const accessory = merc.accessorySlot;
    if (accessory) {
      const name = accessory.equipmentName.toLowerCase();
      if (name.includes('medical kit') || name.includes('first aid kit')) {
        return { type: 'item', merc, item: accessory.equipmentName, target };
      }
    }
  }

  return null;
}

/**
 * Check if squad has Epinephrine Shot.
 * MERC-jjr: Per rules 4.9, AI saves dying MERCs with Epinephrine Shot.
 */
export function hasEpinephrineShot(mercs: MercCard[]): MercCard | null {
  for (const merc of mercs) {
    const accessory = merc.accessorySlot;
    if (accessory?.equipmentName.toLowerCase().includes('epinephrine')) {
      return merc;
    }
  }
  return null;
}

/**
 * Check if a MERC should use Epinephrine Shot.
 * MERC-jjr: Per rules 4.9, AI uses Epinephrine to save dying MERCs.
 * Returns the MERC with the shot if saving is needed.
 */
export function shouldUseEpinephrine(
  dyingMerc: MercCard,
  squadMercs: MercCard[]
): MercCard | null {
  // Only save if MERC is about to die (0 health)
  if (dyingMerc.health > 0 || dyingMerc.isDead) return null;

  // Find squad member with Epinephrine Shot
  return hasEpinephrineShot(squadMercs);
}

// =============================================================================
// AI Special Abilities (Section 4.10)
// =============================================================================

/**
 * Check if AI should use a MERC's special ability.
 * MERC-65u: Per rules 4.10, AI ALWAYS uses MERC special abilities when appropriate.
 */
export function shouldUseSpecialAbility(merc: MercCard, _situation: string): boolean {
  // AI always uses abilities when they can be used
  return !!merc.ability && merc.ability.length > 0;
}

/**
 * Get list of special ability activations for the AI.
 * MERC-65u: AI always uses abilities when beneficial.
 */
export function getAIAbilityActivations(mercs: MercCard[]): MercCard[] {
  return mercs.filter(m => !m.isDead && shouldUseSpecialAbility(m, 'any'));
}

// =============================================================================
// AI Attack Dog Assignment (Section 4.11)
// =============================================================================

/**
 * Check if a unit has Attack Dogs.
 * MERC-dol: Per rules 4.11, AI always assigns Attack Dogs to Rebel MERCs.
 */
export function hasAttackDog(unit: MercCard): boolean {
  const accessory = unit.accessorySlot;
  return accessory?.equipmentName.toLowerCase().includes('attack dog') ?? false;
}

/**
 * Get all units with Attack Dogs.
 * MERC-dol: Returns units that can assign dogs to enemies.
 */
export function getUnitsWithAttackDogs(mercs: MercCard[]): MercCard[] {
  return mercs.filter(m => !m.isDead && hasAttackDog(m));
}

/**
 * Select target for Attack Dog assignment using AI target rules.
 * MERC-dol: Per rules 4.11, uses "Choosing Targets in Combat" (4.6).
 */
export function selectAttackDogTarget(
  targets: CombatTarget[]
): CombatTarget | null {
  if (targets.length === 0) return null;

  // Use standard AI target priority (4.6)
  const sorted = sortTargetsByAIPriority(targets);
  return sorted[0];
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
 * Count targets in a sector (MERCs + militia).
 * MERC-gcb: Per rules 4.12, choose sector with most targets.
 */
export function countTargetsInSector(game: MERCGame, sector: Sector): number {
  let count = 0;

  // Count rebel MERCs
  for (const rebel of game.rebelPlayers) {
    if (rebel.primarySquad?.sectorId === sector.sectorId) {
      count += rebel.primarySquad.getMercs().filter(m => !m.isDead).length;
    }
    if (rebel.secondarySquad?.sectorId === sector.sectorId) {
      count += rebel.secondarySquad.getMercs().filter(m => !m.isDead).length;
    }
  }

  // Count rebel militia
  count += sector.getTotalRebelMilitia();

  return count;
}

/**
 * Select best mortar target using AI priority.
 * MERC-gcb: Per rules 4.12, AI always attacks with mortars when possible.
 * Chooses sector with most targets. If tied, uses target selection rules.
 */
export function selectMortarTarget(game: MERCGame, fromSector: Sector): Sector | null {
  const targets = getMortarTargets(game, fromSector);
  if (targets.length === 0) return null;

  // MERC-gcb: Sort by number of targets (most first)
  const sortedTargets = [...targets].sort((a, b) => {
    const countA = countTargetsInSector(game, a);
    const countB = countTargetsInSector(game, b);

    // Most targets first
    if (countA !== countB) return countB - countA;

    // Tie-breaker: choose weakest rebel force
    const strengthA = calculateRebelStrength(game, a);
    const strengthB = calculateRebelStrength(game, b);
    if (strengthA !== strengthB) return strengthA - strengthB;

    // Random tie-breaker
    return Math.random() - 0.5;
  });

  return sortedTargets[0];
}
