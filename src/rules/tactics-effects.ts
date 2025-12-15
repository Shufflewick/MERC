/**
 * Dictator Tactics Card Effects
 *
 * Based on: data/rules/01-game-elements-and-components.md
 * Tactics data: data/dictator-tactics.json
 *
 * Each tactics card has a unique effect when played.
 */

import type { MERCGame, RebelPlayer } from './game.js';
import { TacticsCard, Sector, MercCard } from './elements.js';
import { SectorConstants } from './constants.js';
import { executeCombat } from './combat.js';
import { selectAIBaseLocation } from './ai-helpers.js';

// =============================================================================
// Types
// =============================================================================

export interface TacticsEffectResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

// =============================================================================
// Individual Tactics Effects
// =============================================================================

/**
 * Artillery Barrage: Attack sectors adjacent to controlled sectors.
 * Roll d6 per sector, deal that many hits.
 */
function artilleryBarrage(game: MERCGame): TacticsEffectResult {
  const dictatorSectors = game.gameMap.getAllSectors().filter(s => s.dictatorMilitia > 0);
  const adjacentRebelSectors = new Set<Sector>();

  // Find rebel-controlled sectors adjacent to dictator sectors
  for (const sector of dictatorSectors) {
    for (const adjacent of game.getAdjacentSectors(sector)) {
      const hasRebels = game.rebelPlayers.some(r =>
        r.primarySquad.sectorId === adjacent.sectorId ||
        r.secondarySquad.sectorId === adjacent.sectorId ||
        adjacent.getTotalRebelMilitia() > 0
      );
      if (hasRebels) {
        adjacentRebelSectors.add(adjacent);
      }
    }
  }

  // Attack up to rebelCount sectors
  const sectorsToAttack = [...adjacentRebelSectors].slice(0, game.rebelCount);
  let totalDamage = 0;

  for (const sector of sectorsToAttack) {
    const roll = game.rollDie();
    game.message(`Artillery targets ${sector.sectorName}: rolled ${roll} hits`);

    // Apply damage to militia first, then MERCs
    let remainingHits = roll;

    // Damage rebel militia
    for (const rebel of game.rebelPlayers) {
      if (remainingHits <= 0) break;
      const militiaRemoved = sector.removeRebelMilitia(`${rebel.position}`, remainingHits);
      remainingHits -= militiaRemoved;
      if (militiaRemoved > 0) {
        game.message(`${militiaRemoved} militia killed at ${sector.sectorName}`);
      }
    }

    // Damage MERCs
    for (const rebel of game.rebelPlayers) {
      if (remainingHits <= 0) break;
      const mercs = game.getMercsInSector(sector, rebel);
      for (const merc of mercs) {
        if (remainingHits <= 0) break;
        merc.takeDamage(1);
        remainingHits--;
        game.message(`${merc.mercName} takes 1 artillery damage`);
      }
    }

    totalDamage += roll;
  }

  return {
    success: true,
    message: `Artillery barrage dealt ${totalDamage} total damage across ${sectorsToAttack.length} sectors`,
    data: { sectorsHit: sectorsToAttack.length, totalDamage },
  };
}

/**
 * Reveal the dictator's base
 * MERC-55b: Now properly sets baseSectorId to a controlled industry
 * MERC-897: Uses AI criteria (furthest from rebels, most defended, highest value)
 */
function revealBase(game: MERCGame): TacticsEffectResult {
  if (game.dictatorPlayer.baseRevealed) {
    return { success: true, message: 'Base was already revealed' };
  }

  // MERC-897: Use AI base selection criteria per rules 4.1
  if (!game.dictatorPlayer.baseSectorId) {
    const baseSector = selectAIBaseLocation(game);
    if (baseSector) {
      game.dictatorPlayer.baseSectorId = baseSector.sectorId;
      game.message(`Dictator base established at ${baseSector.sectorName}`);
    }
  }

  game.dictatorPlayer.baseRevealed = true;
  game.dictatorPlayer.dictator?.enterPlay();

  // Set dictator card location to base sector
  if (game.dictatorPlayer.dictator && game.dictatorPlayer.baseSectorId) {
    game.dictatorPlayer.dictator.sectorId = game.dictatorPlayer.baseSectorId;
  }

  game.message('The Dictator reveals their base!');

  return { success: true, message: 'Base revealed' };
}

/**
 * Family Threat: Each rebel sector loses 2 militia
 */
function familyThreat(game: MERCGame): TacticsEffectResult {
  let totalRemoved = 0;

  for (const sector of game.gameMap.getAllSectors()) {
    for (const rebel of game.rebelPlayers) {
      const removed = sector.removeRebelMilitia(`${rebel.position}`, 2);
      if (removed > 0) {
        totalRemoved += removed;
        game.message(`${removed} militia fled from ${sector.sectorName}`);
      }
    }
  }

  return {
    success: true,
    message: `Family threat: ${totalRemoved} militia fled`,
    data: { militiaRemoved: totalRemoved },
  };
}

/**
 * Fodder: Send militia to rebel sectors with most militia, then combat
 */
function fodder(game: MERCGame): TacticsEffectResult {
  const combatsTriggered: string[] = [];

  for (const rebel of game.rebelPlayers) {
    // Find sector with most rebel militia for this player
    let maxMilitia = 0;
    let targetSector: Sector | null = null;

    for (const sector of game.gameMap.getAllSectors()) {
      const rebelMilitia = sector.getRebelMilitia(`${rebel.position}`);
      if (rebelMilitia > maxMilitia) {
        maxMilitia = rebelMilitia;
        targetSector = sector;
      }
    }

    if (targetSector && maxMilitia > 0) {
      // Send half (round up) of their militia as dictator militia
      const toSend = Math.ceil(maxMilitia / 2);
      const placed = targetSector.addDictatorMilitia(toSend);
      game.message(`Dictator sends ${placed} militia to attack ${rebel.name} at ${targetSector.sectorName}`);

      if (placed > 0) {
        combatsTriggered.push(targetSector.sectorName);
        // Trigger combat
        executeCombat(game, targetSector, rebel);
      }
    }
  }

  return {
    success: true,
    message: `Fodder triggered combat at ${combatsTriggered.length} sectors`,
    data: { combats: combatsTriggered },
  };
}

/**
 * Reinforcements: Add X militia to every controlled industry (X = rebel count)
 */
function reinforcements(game: MERCGame): TacticsEffectResult {
  const industries = game.gameMap.getAllSectors().filter(s =>
    s.isIndustry && s.dictatorMilitia > 0
  );

  let totalPlaced = 0;
  for (const sector of industries) {
    const placed = sector.addDictatorMilitia(game.rebelCount);
    totalPlaced += placed;
    if (placed > 0) {
      game.message(`Reinforced ${sector.sectorName} with ${placed} militia`);
    }
  }

  return {
    success: true,
    message: `Reinforcements: ${totalPlaced} militia placed`,
    data: { totalPlaced, industriesReinforced: industries.length },
  };
}

/**
 * Seizure: Effect is incomplete in data, treating as reveal base
 */
function seizure(game: MERCGame): TacticsEffectResult {
  // The description only says "X = the number of rebel players" with no action
  // This appears incomplete, so we treat it as a reveal base effect
  game.message('Seizure effect triggered (incomplete card effect)');
  return revealBase(game);
}

/**
 * Sentry: Add militia to uncontrolled sectors
 */
function sentry(game: MERCGame): TacticsEffectResult {
  const militiaToAdd = Math.ceil(game.rebelCount / 2);
  let totalPlaced = 0;

  for (const sector of game.gameMap.getAllSectors()) {
    // Check if sector is uncontrolled
    const dictatorControls = sector.dictatorMilitia > 0;
    const rebelControls = sector.getTotalRebelMilitia() > 0 ||
      game.rebelPlayers.some(r =>
        r.primarySquad.sectorId === sector.sectorId ||
        r.secondarySquad.sectorId === sector.sectorId
      );

    if (!dictatorControls && !rebelControls) {
      const placed = sector.addDictatorMilitia(militiaToAdd);
      totalPlaced += placed;
      if (placed > 0) {
        game.message(`Sentry: ${placed} militia placed at ${sector.sectorName}`);
      }
    }
  }

  return {
    success: true,
    message: `Sentry: ${totalPlaced} militia placed`,
    data: { totalPlaced },
  };
}

/**
 * Block Trade: Flip all cities to explored
 */
function blockTrade(game: MERCGame): TacticsEffectResult {
  const cities = game.gameMap.getAllSectors().filter(s => s.isCity && !s.explored);

  for (const city of cities) {
    city.explore();
    game.message(`${city.sectorName} is now explored (trade blocked)`);
  }

  return {
    success: true,
    message: `Block Trade: ${cities.length} cities explored`,
    data: { citiesExplored: cities.length },
  };
}

/**
 * Conscripts: Permanent effect - add militia each turn
 * This sets a game flag that flow should check
 */
function conscripts(game: MERCGame): TacticsEffectResult {
  // Store the effect on the game state
  (game as any).conscriptsActive = true;
  (game as any).conscriptsAmount = Math.ceil(game.rebelCount / 2);

  game.message(`Conscripts activated: ${(game as any).conscriptsAmount} militia will be added each turn`);

  return {
    success: true,
    message: 'Conscripts permanent effect activated',
    data: { amount: (game as any).conscriptsAmount },
  };
}

/**
 * Apply conscripts effect at end of dictator turn
 */
export function applyConscriptsEffect(game: MERCGame): void {
  if (!(game as any).conscriptsActive) return;

  const amount = (game as any).conscriptsAmount || 1;
  let totalPlaced = 0;

  for (const sector of game.gameMap.getAllSectors()) {
    if (sector.dictatorMilitia > 0) {
      const placed = sector.addDictatorMilitia(amount);
      totalPlaced += placed;
    }
  }

  if (totalPlaced > 0) {
    game.message(`Conscripts: ${totalPlaced} militia reinforced`);
  }
}

/**
 * Oil Reserves: Permanent effect - free move for oil controller
 * This sets a game flag
 */
function oilReserves(game: MERCGame): TacticsEffectResult {
  (game as any).oilReservesActive = true;
  game.message('Oil Reserves activated: Controller of oil industry gains 1 free move action');

  return {
    success: true,
    message: 'Oil Reserves permanent effect activated',
  };
}

/**
 * Tainted Water: Remove militia and damage MERCs
 */
function taintedWater(game: MERCGame): TacticsEffectResult {
  const amount = Math.ceil(game.rebelCount / 2);
  let militiaRemoved = 0;
  let mercsDamaged = 0;

  for (const sector of game.gameMap.getAllSectors()) {
    // Remove rebel militia
    for (const rebel of game.rebelPlayers) {
      const removed = sector.removeRebelMilitia(`${rebel.position}`, amount);
      militiaRemoved += removed;
    }
  }

  // Damage all rebel MERCs (ignores armor)
  for (const rebel of game.rebelPlayers) {
    for (const merc of rebel.team) {
      merc.damage += 1; // Direct damage, bypassing armor
      mercsDamaged++;
      game.message(`${merc.mercName} poisoned by tainted water (1 damage)`);
    }
  }

  game.message(`Tainted water: ${militiaRemoved} militia killed, ${mercsDamaged} MERCs poisoned`);

  return {
    success: true,
    message: `Tainted Water: ${militiaRemoved} militia, ${mercsDamaged} MERCs damaged`,
    data: { militiaRemoved, mercsDamaged },
  };
}

// =============================================================================
// Main Effect Dispatcher
// =============================================================================

/**
 * Execute a tactics card effect
 */
export function executeTacticsEffect(game: MERCGame, card: TacticsCard): TacticsEffectResult {
  game.message(`Executing tactics: ${card.tacticsName}`);
  game.message(`Effect: ${card.description}`);

  switch (card.tacticsId) {
    case 'artillery-barrage':
      return artilleryBarrage(game);

    case 'better-weapons':
    case 'generalisimo':
    case 'lockdown':
    case 'veteran-militia':
      return revealBase(game);

    case 'family-threat':
      return familyThreat(game);

    case 'fodder':
      return fodder(game);

    case 'reinforcements':
      return reinforcements(game);

    case 'seizure':
      return seizure(game);

    case 'sentry':
      return sentry(game);

    case 'block-trade':
      return blockTrade(game);

    case 'conscripts':
      return conscripts(game);

    case 'oil-reserves':
      return oilReserves(game);

    case 'tainted-water':
      return taintedWater(game);

    default:
      game.message(`Unknown tactics effect: ${card.tacticsId}`);
      return { success: false, message: `Unknown effect: ${card.tacticsId}` };
  }
}
