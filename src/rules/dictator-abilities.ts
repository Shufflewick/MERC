/**
 * Dictator Special Abilities
 *
 * Based on: data/rules/01-game-elements-and-components.md
 * Dictator data: data/combatants.json (cardType='dictator')
 *
 * Each dictator has a unique special ability that triggers during setup
 * and/or once per turn.
 */

import type { MERCGame } from './game.js';
import { CombatantModel, Sector } from './elements.js';
import { SectorConstants } from './constants.js';
import {
  selectNewMercLocation,
  selectMilitiaPlacementSector,
  getRebelControlledSectors,
} from './ai-helpers.js';
import { queuePendingCombat } from './combat.js';
import { equipNewHire } from './actions/helpers.js';

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
  if (!dictator || dictator.combatantId !== 'kim') {
    return { success: false, message: 'Not Kim' };
  }

  // Skip if already applied (base already revealed)
  if (game.dictatorPlayer.baseRevealed) {
    return { success: true, message: 'Kim ability already applied' };
  }

  // Find base sector first
  const baseSector = game.getSector(game.dictatorPlayer.baseSectorId!);
  if (!baseSector) {
    return { success: false, message: 'No base sector found' };
  }

  // Reveal base
  game.dictatorPlayer.baseRevealed = true;

  // Put dictator card into play at the base - sectorId inherited from squad
  dictator.enterPlay();
  game.dictatorPlayer.baseSquad.sectorId = baseSector.sectorId;
  dictator.putInto(game.dictatorPlayer.baseSquad);

  // Dictators get 1 free equipment when entering play, just like MERCs
  // Only auto-equip for AI - human players choose via the chooseKimBase action
  if (game.dictatorPlayer?.isAI) {
    let equipType: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
    if (dictator.weaponSlot) {
      equipType = dictator.armorSlot ? 'Accessory' : 'Armor';
    }
    const freeEquipment = game.drawEquipment(equipType);
    if (freeEquipment) {
      const { displacedBandolierItems } = dictator.equip(freeEquipment);
      for (const item of displacedBandolierItems) {
        const discard = game.getEquipmentDiscard(item.equipmentType);
        if (discard) item.putInto(discard);
      }
      game.message(`${dictator.combatantName} equipped ${freeEquipment.equipmentName}`);
    }
  }

  // Calculate militia: 5 per rebel, max 20
  const militiaCount = Math.min(5 * game.rebelCount, 20);

  // Add militia to base sector
  // MERC-td6: Use bypassCap=true to allow Kim's max of 20 militia
  const placed = baseSector.addDictatorMilitia(militiaCount, true);
  game.message(`Kim's base is revealed at ${baseSector.sectorName} with ${placed} militia!`);

  return {
    success: true,
    message: `Base revealed with ${placed} militia`,
    data: { militiaPlaced: placed },
  };
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
  if (!dictator || dictator.combatantId !== 'castro') {
    return { success: false, message: 'Not Castro' };
  }

  // Draw 3 MERCs
  const drawnMercs: CombatantModel[] = [];
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

  // Put the hired MERC into the dictator's primary squad
  bestMerc.putInto(game.dictatorPlayer.primarySquad);

  // MERC-2ay: Set squad location per AI rules 4.3.2
  // Dictator-controlled sector closest to weakest rebel sector
  // Note: This moves all mercs in the squad - sectorId is derived from squad
  const targetSector = selectNewMercLocation(game);
  if (targetSector) {
    game.dictatorPlayer.primarySquad.sectorId = targetSector.sectorId;
  }

  // All hired MERCs get 1 free equipment - prioritize weapon
  // Uses shared helper for Apeiron/Vrbansk ability handling
  let equipType: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
  if (bestMerc.weaponSlot) {
    equipType = bestMerc.armorSlot ? 'Accessory' : 'Armor';
  }
  equipNewHire(game, bestMerc, equipType);

  // Discard the others
  for (const merc of drawnMercs) {
    if (merc !== bestMerc) {
      merc.putInto(game.mercDiscard);
    }
  }

  game.message(`Castro hired ${bestMerc.combatantName} (chose from ${drawnMercs.length} MERCs)`);

  return {
    success: true,
    message: `Hired ${bestMerc.combatantName}`,
    data: { hiredMerc: bestMerc.combatantName },
  };
}

/**
 * Apply Kim's per-turn ability:
 * "Once per turn, count the number of Rebel controlled sectors,
 * and place that many militia on any sector."
 */
export function applyKimTurnAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'kim') {
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
    const hasMilitia = targetSector.getRebelMilitia(`${rebel.seat}`) > 0;

    if (hasSquad || hasMilitia) {
      game.message(`Rebels detected at ${targetSector.sectorName} - combat begins!`);
      // Dictator initiated combat, queue it so UI can mount CombatPanel
      queuePendingCombat(game, targetSector, rebel, false);
      return {
        success: true,
        message: `Placed ${placed} militia and engaged in combat`,
        data: {
          militiaPlaced: placed,
          targetSector: targetSector.sectorName,
          combatTriggered: true,
          combatQueued: true,
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

  switch (dictator.combatantId) {
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

  switch (dictator.combatantId) {
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
