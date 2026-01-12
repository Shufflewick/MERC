/**
 * MERC AI Action Helpers
 *
 * Extracted from ai-helpers.ts for better code organization.
 * Contains AI action decision logic.
 */

import type { MERCGame } from './game.js';
import { Sector, MercCard } from './elements.js';
import {
  calculateRebelStrength,
  getRebelControlledSectors,
} from './ai-combat-helpers.js';

// Forward import to avoid circular dependency
// distanceBetweenSectors is kept in ai-helpers.ts since it's used by many functions
import { distanceBetweenSectors, shouldLeaveInStash } from './ai-helpers.js';

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

    // Final tie-breaker: random using seeded random
    return game.random() - 0.5;
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
