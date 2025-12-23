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
import {
  selectNewMercLocation,
  selectMilitiaPlacementSector,
  getRebelControlledSectors,
} from './ai-helpers.js';
import { executeCombat } from './combat.js';

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
  // MERC-td6: Use bypassCap=true to allow Kim's max of 20 militia
  const baseSector = game.getSector(game.dictatorPlayer.baseSectorId!);
  if (baseSector) {
    const placed = baseSector.addDictatorMilitia(militiaCount, true);
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

  // MERC-rwdv: Put the hired MERC into the dictator's squad
  bestMerc.putInto(game.dictatorPlayer.mercSquad);

  // MERC-2ay: Set MERC location per AI rules 4.3.2
  // Dictator-controlled sector closest to weakest rebel sector
  const targetSector = selectNewMercLocation(game);
  if (targetSector) {
    bestMerc.sectorId = targetSector.sectorId;
    game.dictatorPlayer.mercSquad.sectorId = targetSector.sectorId;
  }

  // All hired MERCs get 1 free equipment - prioritize weapon
  let equipType: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
  if (bestMerc.weaponSlot) {
    equipType = bestMerc.armorSlot ? 'Accessory' : 'Armor';
  }
  const freeEquipment = game.drawEquipment(equipType);
  if (freeEquipment) {
    bestMerc.equip(freeEquipment);
    game.message(`${bestMerc.mercName} equipped free ${freeEquipment.equipmentName}`);
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

  // MERC-611: Use AI placement rules per section 4.4
  const allSectors = game.gameMap.getAllSectors();
  const rebelSectors = getRebelControlledSectors(game);
  const dictatorSectors = allSectors.filter(s => s.dictatorMilitia > 0);
  const neutralSectors = allSectors.filter(s =>
    s.dictatorMilitia === 0 &&
    s.getTotalRebelMilitia() === 0 &&
    !game.rebelPlayers.some(r =>
      r.primarySquad?.sectorId === s.sectorId ||
      r.secondarySquad?.sectorId === s.sectorId
    )
  );

  // Try placement in priority order
  let targetSector: Sector | null = null;
  if (rebelSectors.length > 0) {
    targetSector = selectMilitiaPlacementSector(game, rebelSectors, 'rebel');
  } else if (neutralSectors.length > 0) {
    targetSector = selectMilitiaPlacementSector(game, neutralSectors, 'neutral');
  } else if (dictatorSectors.length > 0) {
    targetSector = selectMilitiaPlacementSector(game, dictatorSectors, 'dictator');
  }

  if (!targetSector) {
    // Fallback to any industry
    const industries = allSectors.filter(s => s.isIndustry);
    targetSector = industries[0] || allSectors[0];
  }

  const placed = targetSector.addDictatorMilitia(rebelSectorCount);
  game.message(`Kim placed ${placed} militia at ${targetSector.sectorName} (rebels control ${rebelSectorCount} sectors)`);

  // Check if any rebel has units at this sector and trigger combat
  for (const rebel of game.rebelPlayers) {
    const hasSquad = rebel.primarySquad.sectorId === targetSector.sectorId ||
      rebel.secondarySquad.sectorId === targetSector.sectorId;
    const hasMilitia = targetSector.getRebelMilitia(`${rebel.position}`) > 0;

    if (hasSquad || hasMilitia) {
      game.message(`Rebels detected at ${targetSector.sectorName} - combat begins!`);
      const outcome = executeCombat(game, targetSector, rebel);
      return {
        success: true,
        message: `Placed ${placed} militia and engaged in combat`,
        data: {
          militiaPlaced: placed,
          targetSector: targetSector.sectorName,
          combatTriggered: true,
          rebelVictory: outcome.rebelVictory,
          dictatorVictory: outcome.dictatorVictory,
        },
      };
    }
  }

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
