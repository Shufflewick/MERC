/**
 * Dictator Special Abilities
 *
 * Based on: data/rules/01-game-elements-and-components.md
 * Dictator data: data/dictators.json
 *
 * Each dictator has a unique special ability that triggers during setup
 * and/or once per turn.
 */

import type { MERCGame } from './game.js';
import { MercCard, Sector } from './elements.js';
import { SectorConstants } from './constants.js';

// =============================================================================
// Dictator Ability Types
// =============================================================================

export type DictatorAbilityType = 'castro' | 'kim';

export interface DictatorAbilityResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

// =============================================================================
// Setup Abilities (called during Day 1)
// =============================================================================

/**
 * Apply Kim's setup ability:
 * "Your base starts revealed with 5 militia per Rebel (max 20)"
 */
export function applyKimSetupAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.dictatorId !== 'kim') {
    return { success: false, message: 'Not Kim' };
  }

  // Reveal base
  game.dictatorPlayer.baseRevealed = true;

  // Calculate militia: 5 per rebel, max 20
  const militiaCount = Math.min(5 * game.rebelCount, 20);

  // Find base sector and add militia
  const baseSector = game.getSector(game.dictatorPlayer.baseSectorId!);
  if (baseSector) {
    const placed = baseSector.addDictatorMilitia(militiaCount);
    game.message(`Kim's base is revealed with ${placed} militia!`);
    return {
      success: true,
      message: `Base revealed with ${placed} militia`,
      data: { militiaPlaced: placed },
    };
  }

  return { success: false, message: 'No base sector found' };
}

// =============================================================================
// Per-Turn Abilities (called at start of Dictator turn)
// =============================================================================

/**
 * Apply Castro's per-turn ability:
 * "Once per turn, draw 3 random MERCs and hire 1."
 */
export function applyCastroTurnAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.dictatorId !== 'castro') {
    return { success: false, message: 'Not Castro' };
  }

  // Draw 3 MERCs
  const drawnMercs: MercCard[] = [];
  for (let i = 0; i < 3; i++) {
    const merc = game.drawMerc();
    if (merc) {
      drawnMercs.push(merc);
    }
  }

  if (drawnMercs.length === 0) {
    game.message('Castro: No MERCs available to hire');
    return { success: false, message: 'No MERCs available' };
  }

  // AI/Auto selection: hire the MERC with highest combat
  const bestMerc = drawnMercs.reduce((best, current) =>
    current.baseCombat > best.baseCombat ? current : best
  );

  // Hire the selected MERC
  game.dictatorPlayer.hiredMercs.push(bestMerc);

  // Set the MERC's location (prefer base, fallback to highest militia sector)
  if (game.dictatorPlayer.baseSectorId) {
    bestMerc.sectorId = game.dictatorPlayer.baseSectorId;
  } else {
    const controlledSectors = game.gameMap.getAllSectors()
      .filter(s => s.dictatorMilitia > 0)
      .sort((a, b) => b.dictatorMilitia - a.dictatorMilitia);
    if (controlledSectors.length > 0) {
      bestMerc.sectorId = controlledSectors[0].sectorId;
    }
  }

  // Discard the others
  for (const merc of drawnMercs) {
    if (merc !== bestMerc) {
      merc.putInto(game.mercDiscard);
    }
  }

  game.message(`Castro hired ${bestMerc.mercName} (chose from ${drawnMercs.length} MERCs)`);

  return {
    success: true,
    message: `Hired ${bestMerc.mercName}`,
    data: { hiredMerc: bestMerc.mercName },
  };
}

/**
 * Apply Kim's per-turn ability:
 * "Once per turn, count the number of Rebel controlled sectors,
 * and place that many militia on any sector."
 */
export function applyKimTurnAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.dictatorId !== 'kim') {
    return { success: false, message: 'Not Kim' };
  }

  // Count rebel-controlled sectors
  let rebelSectorCount = 0;
  for (const rebel of game.rebelPlayers) {
    rebelSectorCount += game.getControlledSectors(rebel).length;
  }

  if (rebelSectorCount === 0) {
    game.message('Kim: Rebels control no sectors, no militia to place');
    return { success: true, message: 'No rebel sectors', data: { militiaPlaced: 0 } };
  }

  // AI/Auto: Place on the sector with most existing militia (defensive strategy)
  const dictatorSectors = game.gameMap.getAllSectors()
    .filter(s => s.dictatorMilitia > 0 || s.isBase)
    .sort((a, b) => b.dictatorMilitia - a.dictatorMilitia);

  let targetSector: Sector;
  if (dictatorSectors.length > 0) {
    targetSector = dictatorSectors[0];
  } else {
    // Fallback to any industry
    const industries = game.gameMap.getAllSectors().filter(s => s.isIndustry);
    targetSector = industries[0] || game.gameMap.getAllSectors()[0];
  }

  const placed = targetSector.addDictatorMilitia(rebelSectorCount);
  game.message(`Kim placed ${placed} militia at ${targetSector.sectorName} (rebels control ${rebelSectorCount} sectors)`);

  return {
    success: true,
    message: `Placed ${placed} militia`,
    data: { militiaPlaced: placed, targetSector: targetSector.sectorName },
  };
}

// =============================================================================
// Main Ability Dispatcher
// =============================================================================

/**
 * Apply setup abilities for the current dictator
 */
export function applyDictatorSetupAbilities(game: MERCGame): void {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator) return;

  switch (dictator.dictatorId) {
    case 'kim':
      applyKimSetupAbility(game);
      break;
    case 'castro':
      // Castro has no special setup ability
      game.message(`Castro's ability: ${dictator.ability}`);
      break;
    default:
      game.message(`Dictator ability: ${dictator.ability}`);
  }
}

/**
 * Apply per-turn abilities for the current dictator
 */
export function applyDictatorTurnAbilities(game: MERCGame): void {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator) return;

  switch (dictator.dictatorId) {
    case 'castro':
      applyCastroTurnAbility(game);
      break;
    case 'kim':
      applyKimTurnAbility(game);
      break;
    default:
      // Unknown dictator - no special handling
      break;
  }
}
