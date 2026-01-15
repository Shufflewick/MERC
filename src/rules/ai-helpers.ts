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

import type { MERCGame } from './game.js';
import { Sector, MercCard, Equipment, CombatantModel } from './elements.js';
import {
  isLandMine,
  isRepairKit,
  isEpinephrine,
  isAttackDog,
  isHealingItem,
  hasRangedAttack,
} from './equipment-effects.js';
import { isMercCard } from './actions/helpers.js';

// Re-export from ai-combat-helpers.ts for backwards compatibility
export {
  calculateRebelStrength,
  chooseWeakestRebelSector,
  getRebelControlledSectors,
  sortTargetsByAIPriority,
  detonateLandMines,
} from './ai-combat-helpers.js';
export type { CombatTarget } from './ai-combat-helpers.js';

// Import for internal use
import {
  calculateRebelStrength,
  chooseWeakestRebelSector,
  getRebelControlledSectors,
} from './ai-combat-helpers.js';

// Re-export from ai-action-helpers.ts for backwards compatibility
export {
  sortMercsByInitiative,
  getSquadMercs,
  canSquadMoveTogether,
  getSquadAction,
  findUnoccupiedIndustriesInRange,
  getAIMercAction,
  getAIMercActionPriority,
  findClosestRebelSector,
  getBestMoveDirection,
} from './ai-action-helpers.js';
export type { AIActionType, AIActionDecision } from './ai-action-helpers.js';

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
 * Chooses the most valuable industry not occupied by rebels.
 * If there are multiple industries with the same value, chooses randomly.
 */
export function selectAIBaseLocation(game: MERCGame): Sector | null {
  // Get industries with dictator militia (not chosen by rebels)
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

  // Find the highest industry value
  const maxValue = Math.max(...controlledIndustries.map(s => s.industryValue || 0));

  // Get all industries with the highest value
  const highestValueIndustries = controlledIndustries.filter(
    s => (s.industryValue || 0) === maxValue
  );

  // If only one, return it; otherwise pick randomly
  if (highestValueIndustries.length === 1) {
    return highestValueIndustries[0];
  }

  // Random selection among ties using seeded random
  const randomIndex = Math.floor(game.random() * highestValueIndustries.length);
  return highestValueIndustries[randomIndex];
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
  return isLandMine(equipment.equipmentId) || isRepairKit(equipment.equipmentId);
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
export function sortMercsAlphabetically(mercs: CombatantModel[]): CombatantModel[] {
  return [...mercs].sort((a, b) => a.combatantName.localeCompare(b.combatantName));
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
export function selectAIMercForHiring(availableMercs: CombatantModel[], random: () => number): number {
  if (availableMercs.length === 0) return -1;
  if (availableMercs.length === 1) return 0;

  // MERC-632: Random selection using seeded random
  return Math.floor(random() * availableMercs.length);
}

/**
 * Select multiple MERCs for AI hiring.
 * MERC-632: Per rules 4.3.1, pick randomly when there's a choice.
 * Returns indices of selected MERCs.
 */
export function selectAIMercsForHiring(
  availableMercs: CombatantModel[],
  countToSelect: number,
  random: () => number
): number[] {
  if (availableMercs.length === 0 || countToSelect <= 0) return [];

  const indices: number[] = [];
  const available = availableMercs.map((_, i) => i);

  for (let i = 0; i < Math.min(countToSelect, availableMercs.length); i++) {
    // MERC-632: Random selection using seeded random
    const randomIdx = Math.floor(random() * available.length);
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
  // Get all dictator units in this sector (MercCards + DictatorCard share CombatantModel base)
  const units: CombatantModel[] = game.dictatorPlayer.hiredMercs.filter(m => m.sectorId === sector.sectorId);
  if (game.dictatorPlayer.dictator?.inPlay && game.dictatorPlayer.dictator.sectorId === sector.sectorId) {
    units.push(game.dictatorPlayer.dictator);
  }

  if (units.length === 0) return 0;

  // Sort MERCs alphabetically (dictator card goes last)
  const sortedUnits = units.sort((a, b) => {
    const nameA = a.isMerc ? a.combatantName : 'ZZZZZ'; // Dictator card at end
    const nameB = b.isMerc ? b.combatantName : 'ZZZZZ';
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
      if (!sector.getStashContents().some(e => e.id === equipment.id)) continue;

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

      if (unit.isMerc) {
        game.message(`${unit.combatantName} equipped ${equipment.equipmentName}`);
      } else {
        game.message(`Dictator equipped ${equipment.equipmentName}`);
      }
    }
  }

  return equippedCount;
}

// =============================================================================
// AI Healing and Saving MERCs (Sections 4.8-4.10)
// =============================================================================

/**
 * Check if a MERC needs healing.
 * Per rules 4.8, AI prioritizes healing when MERCs are injured.
 */
export function mercNeedsHealing(merc: CombatantModel): boolean {
  return merc.damage > 0 && !merc.isDead;
}

/**
 * Get MERCs with healing abilities.
 * MERC-6kw: Per rules 4.8.1, AI uses MERC healing abilities first.
 */
export function getMercsWithHealingAbility(mercs: CombatantModel[]): CombatantModel[] {
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
  type: 'ability' | 'item' | 'repairKit';
  merc?: CombatantModel;
  item?: string;
  target: CombatantModel;
  sector?: Sector;
}

export function getAIHealingPriority(
  game: MERCGame,
  damagedMercs: CombatantModel[],
  allMercs: CombatantModel[]
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
    // Check accessory slot
    const accessory = merc.accessorySlot;
    if (accessory && isHealingItem(accessory.equipmentId)) {
      return { type: 'item', merc, item: accessory.equipmentName, target };
    }
    // Check bandolier slots
    for (const bSlot of merc.bandolierSlots) {
      if (isHealingItem(bSlot.equipmentId)) {
        return { type: 'item', merc, item: bSlot.equipmentName, target };
      }
    }
  }

  // MERC-3po: 4.7.2 - Try Repair Kit from stash (AI leaves these in stash per rules)
  // Check if the damaged MERC's sector has a repair kit
  if (target.sectorId) {
    const sector = game.getSector(target.sectorId);
    if (sector && hasRepairKitInStash(sector)) {
      return { type: 'repairKit', target, sector };
    }
  }

  return null;
}

/**
 * Check if squad has Epinephrine Shot.
 * MERC-jjr: Per rules 4.9, AI saves dying MERCs with Epinephrine Shot.
 */
export function hasEpinephrineShot(mercs: CombatantModel[]): CombatantModel | null {
  for (const merc of mercs) {
    // Check accessory slot
    const accessory = merc.accessorySlot;
    if (accessory && isEpinephrine(accessory.equipmentId)) {
      return merc;
    }
    // Check bandolier slots
    if (merc.bandolierSlots.some(e => isEpinephrine(e.equipmentId))) {
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
  dyingMerc: CombatantModel,
  squadMercs: CombatantModel[]
): CombatantModel | null {
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
export function shouldUseSpecialAbility(merc: CombatantModel, _situation: string): boolean {
  // AI always uses abilities when they can be used
  return !!merc.ability && merc.ability.length > 0;
}

/**
 * Get list of special ability activations for the AI.
 * MERC-65u: AI always uses abilities when beneficial.
 */
export function getAIAbilityActivations(mercs: CombatantModel[]): CombatantModel[] {
  return mercs.filter(m => !m.isDead && shouldUseSpecialAbility(m, 'any'));
}

// =============================================================================
// AI Attack Dog Assignment (Section 4.11)
// =============================================================================

/**
 * Check if a unit has Attack Dogs.
 * MERC-dol: Per rules 4.11, AI always assigns Attack Dogs to Rebel MERCs.
 */
export function hasAttackDogEquipped(unit: CombatantModel): boolean {
  // Check accessory slot
  if (unit.accessorySlot && isAttackDog(unit.accessorySlot.equipmentId)) {
    return true;
  }
  // Check bandolier slots
  return unit.bandolierSlots.some(e => isAttackDog(e.equipmentId));
}

/**
 * Get all units with Attack Dogs.
 * MERC-dol: Returns units that can assign dogs to enemies.
 */
export function getUnitsWithAttackDogs(mercs: CombatantModel[]): CombatantModel[] {
  return mercs.filter(m => !m.isDead && hasAttackDogEquipped(m));
}

/**
 * Select target for Attack Dog assignment using AI target rules.
 * MERC-dol: Per rules 4.11, uses "Choosing Targets in Combat" (4.6).
 * @param random - Seeded random function from game.random
 */
export function selectAttackDogTarget(
  targets: CombatTarget[],
  random: () => number
): CombatTarget | null {
  if (targets.length === 0) return null;

  // Use standard AI target priority (4.6)
  const sorted = sortTargetsByAIPriority(targets, random);
  return sorted[0];
}

/**
 * Check if stash has a repair kit.
 */
export function hasRepairKitInStash(sector: Sector): boolean {
  return sector.getStashContents().some(e => isRepairKit(e.equipmentId));
}

/**
 * Use repair kit from stash to heal a MERC.
 * MERC-gqy: Per rules 4.10, AI uses repair kits to heal MERCs.
 * Returns true if healing was performed.
 */
export function useRepairKit(game: MERCGame, sector: Sector, merc: CombatantModel): boolean {
  const stash = sector.getStashContents();
  const repairKitIdx = stash.findIndex(e => isRepairKit(e.equipmentId));

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

  game.message(`${merc.combatantName} used Repair Kit and healed ${healed} damage`);
  return true;
}

/**
 * Get the damaged MERC that most needs healing.
 * Per rules 4.10, prioritize the lowest health MERC.
 */
export function getMostDamagedMerc(mercs: CombatantModel[]): CombatantModel | null {
  const damaged = mercs.filter(m => m.damage > 0 && !m.isDead);
  if (damaged.length === 0) return null;

  // Sort by health (lowest first), then alphabetically
  return damaged.sort((a, b) => {
    if (a.health !== b.health) return a.health - b.health;
    return a.combatantName.localeCompare(b.combatantName);
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
 * Check if a unit has a mortar equipped (in accessory slot or bandolier).
 */
export function hasMortar(unit: CombatantModel | { accessorySlot?: Equipment }): boolean {
  // Check accessory slot
  const accessory = 'accessorySlot' in unit ? unit.accessorySlot : undefined;
  if (accessory && hasRangedAttack(accessory.equipmentId)) {
    return true;
  }

  // Check bandolier slots (only for MercCard)
  if (isMercCard(unit)) {
    return unit.bandolierSlots.some(e => hasRangedAttack(e.equipmentId));
  }

  return false;
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
      count += rebel.primarySquad.getLivingMercs().length;
    }
    if (rebel.secondarySquad?.sectorId === sector.sectorId) {
      count += rebel.secondarySquad.getLivingMercs().length;
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

    // Random tie-breaker using seeded random
    return game.random() - 0.5;
  });

  return sortedTargets[0];
}
