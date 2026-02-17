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
import { CombatantModel, Equipment, Sector, TacticsCard } from './elements.js';
import { SectorConstants, DictatorConstants } from './constants.js';
import type { TacticsData } from './setup.js';
import {
  selectNewMercLocation,
  selectMilitiaPlacementSector,
  getRebelControlledSectors,
} from './ai-helpers.js';
import { queuePendingCombat } from './combat.js';
import { equipNewHire } from './actions/helpers.js';
import { buildMapCombatantEntry, emitMapCombatantEntries } from './animation-events.js';
import { executeTacticsEffect } from './tactics-effects.js';

// =============================================================================
// Dictator Ability Types
// =============================================================================

export type DictatorAbilityType =
  | 'castro' | 'kim'
  | 'gadafi' | 'hitler' | 'hussein' | 'mao'
  | 'mussolini' | 'noriega' | 'pinochet' | 'polpot' | 'stalin';

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

/**
 * Apply Hussein's setup ability:
 * "Hussein starts the game with 10 tactics cards instead of 5"
 */
export function applyHusseinSetupAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'hussein') {
    return { success: false, message: 'Not Hussein' };
  }

  const tacticsDeck = game.dictatorPlayer.tacticsDeck;
  if (!tacticsDeck) {
    return { success: false, message: 'No tactics deck' };
  }

  const currentCount = tacticsDeck.count(TacticsCard);
  const additionalNeeded = DictatorConstants.HUSSEIN_TACTICS_CARDS - currentCount;

  if (additionalNeeded <= 0) {
    return { success: true, message: 'Deck already at target size', data: { deckSize: currentCount } };
  }

  // Build pool of all available tactics (expanded by quantity)
  const allTactics: TacticsData[] = [];
  for (const t of game.tacticsData as TacticsData[]) {
    for (let q = 0; q < t.quantity; q++) {
      allTactics.push(t);
    }
  }

  // Select additional random tactics from pool
  const pool = [...allTactics];
  const selected: TacticsData[] = [];
  for (let i = 0; i < additionalNeeded && pool.length > 0; i++) {
    const idx = Math.floor(game.random() * pool.length);
    selected.push(pool.splice(idx, 1)[0]);
  }

  // Create new TacticsCard elements in the deck
  for (let i = 0; i < selected.length; i++) {
    const t = selected[i];
    tacticsDeck.create(TacticsCard, `tactics-hussein-${t.id}-${i}`, {
      tacticsId: t.id,
      tacticsName: t.name,
      story: t.story,
      description: t.description,
      revealsBase: t.revealsBase ?? false,
    });
  }

  // Shuffle the expanded deck
  tacticsDeck.shuffle();

  const deckSize = tacticsDeck.count(TacticsCard);
  game.message(`Hussein starts with ${deckSize} tactics cards!`);
  return {
    success: true,
    message: `Deck expanded to ${deckSize} cards`,
    data: { deckSize },
  };
}

/**
 * Apply Mao's setup ability:
 * "Mao starts with 1 random MERC per rebel player, placed into chosen squads"
 */
export function applyMaoSetupAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'mao') {
    return { success: false, message: 'Not Mao' };
  }

  // Human path is handled via interactive flow (bonusMercSetup action loop)
  if (!game.dictatorPlayer?.isAI) {
    game.message(`Mao's ability: Hire ${game.rebelCount} bonus MERC(s) — choose squads below`);
    return { success: true, message: 'Handled via interactive flow' };
  }

  // AI path: auto-hire N bonus MERCs
  const bonusCount = game.rebelCount;
  let hired = 0;

  for (let i = 0; i < bonusCount; i++) {
    const merc = game.drawMerc();
    if (!merc) {
      game.message('Mao: No more MERCs available');
      break;
    }

    const primarySquad = game.dictatorPlayer.primarySquad;
    const secondarySquad = game.dictatorPlayer.secondarySquad;
    const targetSquad = !primarySquad.isFull ? primarySquad
      : !secondarySquad.isFull ? secondarySquad
      : null;

    if (!targetSquad) {
      merc.putInto(game.mercDiscard);
      game.message('Mao: All squads full, discarding MERC');
      continue;
    }

    merc.putInto(targetSquad);

    // Set squad location if not assigned yet
    if (!targetSquad.sectorId) {
      const targetSector = selectNewMercLocation(game);
      if (targetSector) {
        targetSquad.sectorId = targetSector.sectorId;
      }
    }

    // Auto-equip: Weapon first, then Armor, then Accessory
    let equipType: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
    if (merc.weaponSlot) {
      equipType = merc.armorSlot ? 'Accessory' : 'Armor';
    }
    equipNewHire(game, merc, equipType);
    game.updateAllSargeBonuses();

    // Emit map entry animation
    if (targetSquad.sectorId) {
      emitMapCombatantEntries(game, [buildMapCombatantEntry(merc, targetSquad.sectorId)]);
    }

    game.message(`Mao hired bonus MERC: ${merc.combatantName}`);
    hired++;
  }

  return {
    success: true,
    message: `Mao hired ${hired} bonus MERCs`,
    data: { hired },
  };
}

/**
 * Apply Mussolini's setup ability:
 * "Mussolini starts with 1 random MERC per rebel player, placed into chosen squads"
 */
export function applyMussoliniSetupAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'mussolini') {
    return { success: false, message: 'Not Mussolini' };
  }

  // Human path is handled via interactive flow (bonusMercSetup action loop)
  if (!game.dictatorPlayer?.isAI) {
    game.message(`Mussolini's ability: Hire ${game.rebelCount} bonus MERC(s) — choose squads below`);
    return { success: true, message: 'Handled via interactive flow' };
  }

  // AI path: auto-hire N bonus MERCs (identical logic to Mao)
  const bonusCount = game.rebelCount;
  let hired = 0;

  for (let i = 0; i < bonusCount; i++) {
    const merc = game.drawMerc();
    if (!merc) {
      game.message('Mussolini: No more MERCs available');
      break;
    }

    const primarySquad = game.dictatorPlayer.primarySquad;
    const secondarySquad = game.dictatorPlayer.secondarySquad;
    const targetSquad = !primarySquad.isFull ? primarySquad
      : !secondarySquad.isFull ? secondarySquad
      : null;

    if (!targetSquad) {
      merc.putInto(game.mercDiscard);
      game.message('Mussolini: All squads full, discarding MERC');
      continue;
    }

    merc.putInto(targetSquad);

    // Set squad location if not assigned yet
    if (!targetSquad.sectorId) {
      const targetSector = selectNewMercLocation(game);
      if (targetSector) {
        targetSquad.sectorId = targetSector.sectorId;
      }
    }

    // Auto-equip: Weapon first, then Armor, then Accessory
    let equipType: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
    if (merc.weaponSlot) {
      equipType = merc.armorSlot ? 'Accessory' : 'Armor';
    }
    equipNewHire(game, merc, equipType);
    game.updateAllSargeBonuses();

    // Emit map entry animation
    if (targetSquad.sectorId) {
      emitMapCombatantEntries(game, [buildMapCombatantEntry(merc, targetSquad.sectorId)]);
    }

    game.message(`Mussolini hired bonus MERC: ${merc.combatantName}`);
    hired++;
  }

  return {
    success: true,
    message: `Mussolini hired ${hired} bonus MERCs`,
    data: { hired },
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

  // Put the hired MERC into the dictator's primary or secondary squad (prefer primary)
  const primarySquad = game.dictatorPlayer.primarySquad;
  const secondarySquad = game.dictatorPlayer.secondarySquad;
  const targetSquad = !primarySquad.isFull ? primarySquad
    : !secondarySquad.isFull ? secondarySquad
    : null;

  if (!targetSquad) {
    // Both squads full — discard all drawn mercs
    for (const merc of drawnMercs) {
      merc.putInto(game.mercDiscard);
    }
    game.message('Castro: All squads full, cannot hire');
    return { success: false, message: 'All squads full' };
  }

  bestMerc.putInto(targetSquad);

  // MERC-2ay: Set squad location per AI rules 4.3.2
  // Dictator-controlled sector closest to weakest rebel sector
  // Note: This moves all mercs in the squad - sectorId is derived from squad
  const targetSector = selectNewMercLocation(game);
  if (targetSector) {
    targetSquad.sectorId = targetSector.sectorId;
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

/**
 * Apply Mao's per-turn ability:
 * "Once per turn, count rebel-controlled sectors and place that many militia
 * on any wilderness sectors (distributed across sectors)."
 */
export function applyMaoTurnAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'mao') {
    return { success: false, message: 'Not Mao' };
  }

  // Count rebel-controlled sectors
  let rebelSectorCount = 0;
  for (const rebel of game.rebelPlayers) {
    rebelSectorCount += game.getControlledSectors(rebel).length;
  }

  if (rebelSectorCount === 0) {
    game.message('Mao: Rebels control no sectors, no militia to place');
    return { success: true, message: 'No rebel sectors', data: { militiaPlaced: 0 } };
  }

  // Filter to wilderness sectors only
  const wildernessSectors = game.gameMap.getAllSectors().filter(s => s.isWilderness);
  if (wildernessSectors.length === 0) {
    game.message('Mao: No wilderness sectors available for militia placement');
    return { success: true, message: 'No wilderness sectors', data: { militiaPlaced: 0 } };
  }

  // AI distribution: place one at a time to spread across sectors
  let totalPlaced = 0;
  let remaining = rebelSectorCount;

  while (remaining > 0) {
    // Filter to wilderness sectors with room
    const available = wildernessSectors.filter(s => s.dictatorMilitia < Sector.MAX_MILITIA_PER_SIDE);
    if (available.length === 0) {
      game.message(`Mao: All wilderness sectors at capacity, ${remaining} militia unplaced`);
      break;
    }

    const targetSector = selectMilitiaPlacementSector(game, available, 'neutral');
    if (!targetSector) break;

    const placed = targetSector.addDictatorMilitia(1);
    totalPlaced += placed;
    remaining--;

    // Check for rebel presence and queue combat
    for (const rebel of game.rebelPlayers) {
      const hasSquad = rebel.primarySquad.sectorId === targetSector.sectorId ||
        rebel.secondarySquad.sectorId === targetSector.sectorId;
      const hasMilitia = targetSector.getRebelMilitia(`${rebel.seat}`) > 0;

      if (hasSquad || hasMilitia) {
        game.message(`Rebels detected at ${targetSector.sectorName} - combat begins!`);
        queuePendingCombat(game, targetSector, rebel, false);
      }
    }
  }

  game.message(`Mao placed ${totalPlaced} militia across wilderness sectors (rebels control ${rebelSectorCount} sectors)`);

  return {
    success: true,
    message: `Placed ${totalPlaced} militia`,
    data: { militiaPlaced: totalPlaced },
  };
}

/**
 * Apply Mussolini's per-turn ability:
 * "Once per turn, add militia equal to rebel count to a chosen controlled sector,
 * then optionally spread militia from that sector to adjacent sectors."
 */
export function applyMussoliniTurnAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'mussolini') {
    return { success: false, message: 'Not Mussolini' };
  }

  const rebelCount = game.rebelCount;
  if (rebelCount === 0) {
    game.message('Mussolini: No rebels, no militia to place');
    return { success: true, message: 'No rebels', data: { militiaPlaced: 0 } };
  }

  // Get sectors the dictator controls: militia > 0, dictator MERCs present,
  // or the revealed base sector
  const allSectors = game.gameMap.getAllSectors();
  const controlledSectors = allSectors.filter(s => {
    if (s.dictatorMilitia > 0) return true;
    if (game.getDictatorMercsInSector(s).length > 0) return true;
    if (game.dictatorPlayer.baseRevealed && game.dictatorPlayer.baseSectorId === s.sectorId) return true;
    return false;
  });

  if (controlledSectors.length === 0) {
    game.message('Mussolini: No controlled sectors for militia placement');
    return { success: true, message: 'No controlled sectors', data: { militiaPlaced: 0 } };
  }

  // AI picks target sector
  const targetSector = selectMilitiaPlacementSector(game, controlledSectors, 'dictator');
  if (!targetSector) {
    game.message('Mussolini: Could not select a placement sector');
    return { success: true, message: 'No target sector', data: { militiaPlaced: 0 } };
  }

  // Place militia equal to rebel count (standard cap)
  const placed = targetSector.addDictatorMilitia(rebelCount);
  game.message(`Mussolini placed ${placed} militia at ${targetSector.sectorName} (${rebelCount} rebels)`);

  // Check for combat at placement sector
  for (const rebel of game.rebelPlayers) {
    const hasSquad = rebel.primarySquad.sectorId === targetSector.sectorId ||
      rebel.secondarySquad.sectorId === targetSector.sectorId;
    const hasMilitia = targetSector.getRebelMilitia(`${rebel.seat}`) > 0;

    if (hasSquad || hasMilitia) {
      game.message(`Rebels detected at ${targetSector.sectorName} - combat begins!`);
      queuePendingCombat(game, targetSector, rebel, false);
    }
  }

  // AI spread: move militia from source to adjacent sectors opportunistically
  const adjacentSectors = game.getAdjacentSectors(targetSector);
  let spreadTotal = 0;

  // Prioritize adjacent rebel sectors for combat, then neutral
  const rebelAdjacent = adjacentSectors.filter(s => {
    for (const rebel of game.rebelPlayers) {
      const hasSquad = rebel.primarySquad.sectorId === s.sectorId ||
        rebel.secondarySquad.sectorId === s.sectorId;
      const hasMilitia = s.getRebelMilitia(`${rebel.seat}`) > 0;
      if (hasSquad || hasMilitia) return true;
    }
    return false;
  });
  const neutralAdjacent = adjacentSectors.filter(s =>
    s.dictatorMilitia < Sector.MAX_MILITIA_PER_SIDE &&
    !rebelAdjacent.includes(s)
  );
  const spreadOrder = [...rebelAdjacent, ...neutralAdjacent];

  for (const adjSector of spreadOrder) {
    if (targetSector.dictatorMilitia <= 0) break;
    const room = Sector.MAX_MILITIA_PER_SIDE - adjSector.dictatorMilitia;
    if (room <= 0) continue;

    targetSector.removeDictatorMilitia(1);
    adjSector.addDictatorMilitia(1);
    spreadTotal++;

    // Check for combat on spread target
    for (const rebel of game.rebelPlayers) {
      const hasSquad = rebel.primarySquad.sectorId === adjSector.sectorId ||
        rebel.secondarySquad.sectorId === adjSector.sectorId;
      const hasMilitia = adjSector.getRebelMilitia(`${rebel.seat}`) > 0;

      if (hasSquad || hasMilitia) {
        game.message(`Rebels detected at ${adjSector.sectorName} - combat begins!`);
        queuePendingCombat(game, adjSector, rebel, false);
      }
    }
  }

  if (spreadTotal > 0) {
    game.message(`Mussolini spread ${spreadTotal} militia to adjacent sectors`);
  }

  return {
    success: true,
    message: `Placed ${placed} militia, spread ${spreadTotal}`,
    data: { militiaPlaced: placed, militiaSpread: spreadTotal },
  };
}

/**
 * Apply Pol Pot's per-turn ability:
 * "Once per turn, add militia equal to rebel-controlled sector count
 * to any one rebel sector (max 10 per sector). If dictator loses
 * the resulting combat (rebel victory only), hire 1 random MERC."
 */
export function applyPolpotTurnAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'polpot') {
    return { success: false, message: 'Not Pol Pot' };
  }

  // Count rebel-controlled sectors
  let rebelSectorCount = 0;
  for (const rebel of game.rebelPlayers) {
    rebelSectorCount += game.getControlledSectors(rebel).length;
  }

  if (rebelSectorCount === 0) {
    game.message('Pol Pot: Rebels control no sectors, no militia to place');
    return { success: true, message: 'No rebel sectors', data: { militiaPlaced: 0 } };
  }

  // Get rebel-controlled sectors with room for militia
  const rebelSectors = getRebelControlledSectors(game)
    .filter(s => s.dictatorMilitia < Sector.MAX_MILITIA_PER_SIDE);

  if (rebelSectors.length === 0) {
    game.message('Pol Pot: All rebel sectors at militia capacity');
    return { success: true, message: 'No valid targets', data: { militiaPlaced: 0 } };
  }

  // AI picks target sector
  const targetSector = selectMilitiaPlacementSector(game, rebelSectors, 'rebel');
  if (!targetSector) {
    game.message('Pol Pot: Could not select a placement sector');
    return { success: true, message: 'No target sector', data: { militiaPlaced: 0 } };
  }

  // Place militia equal to rebel-controlled sector count (standard cap)
  const placed = targetSector.addDictatorMilitia(rebelSectorCount);
  game.message(`Pol Pot placed ${placed} militia at ${targetSector.sectorName} (rebels control ${rebelSectorCount} sectors)`);

  // Track target for post-combat outcome detection
  game._polpotTargetSectorId = targetSector.sectorId;

  // Queue combat - target is always a rebel sector, so combat always triggers
  // Find the rebel who controls this sector
  for (const rebel of game.rebelPlayers) {
    const hasSquad = rebel.primarySquad.sectorId === targetSector.sectorId ||
      rebel.secondarySquad.sectorId === targetSector.sectorId;
    const hasMilitia = targetSector.getRebelMilitia(`${rebel.seat}`) > 0;

    if (hasSquad || hasMilitia) {
      game.message(`Rebels detected at ${targetSector.sectorName} - combat begins!`);
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

  // Edge case: rebel controls sector via militia only but no units detected
  // (shouldn't happen since getRebelControlledSectors returns sectors with rebel units)
  return {
    success: true,
    message: `Placed ${placed} militia`,
    data: { militiaPlaced: placed, targetSector: targetSector.sectorName },
  };
}

/**
 * Apply Hitler's per-turn ability:
 * "Once per turn, hire 1 random MERC and pick a rebel for auto-initiative override."
 */
export function applyHitlerTurnAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'hitler') {
    return { success: false, message: 'Not Hitler' };
  }

  // Step 1: Hire 1 random MERC (same pattern as Gaddafi)
  const merc = game.drawMerc();
  if (!merc) {
    game.message('Hitler: No MERCs available to hire');
  } else {
    const primarySquad = game.dictatorPlayer.primarySquad;
    const secondarySquad = game.dictatorPlayer.secondarySquad;
    const targetSquad = !primarySquad.isFull ? primarySquad
      : !secondarySquad.isFull ? secondarySquad
      : null;

    if (!targetSquad) {
      merc.putInto(game.mercDiscard);
      game.message('Hitler: All squads full, cannot hire');
    } else {
      merc.putInto(targetSquad);
      const targetSector = selectNewMercLocation(game);
      if (targetSector) {
        targetSquad.sectorId = targetSector.sectorId;
      }

      let equipType: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
      if (merc.weaponSlot) {
        equipType = merc.armorSlot ? 'Accessory' : 'Armor';
      }
      equipNewHire(game, merc, equipType);

      game.updateAllSargeBonuses();

      if (targetSquad.sectorId) {
        emitMapCombatantEntries(game, [buildMapCombatantEntry(merc, targetSquad.sectorId)]);
      }

      game.message(`Hitler hired ${merc.combatantName}`);
    }
  }

  // Step 2: Pick initiative target - rebel with the most controlled sectors
  const rebels = game.rebelPlayers;
  if (rebels.length > 0) {
    let bestRebel = rebels[0];
    let bestCount = game.getControlledSectors(bestRebel).length;

    for (let i = 1; i < rebels.length; i++) {
      const count = game.getControlledSectors(rebels[i]).length;
      if (count > bestCount) {
        bestCount = count;
        bestRebel = rebels[i];
      }
    }

    game.hitlerInitiativeTargetSeat = bestRebel.seat;
    game.hitlerInitiativeSwitchedThisTurn = true;
    game.message(`Hitler targets ${bestRebel.name || 'Rebel ' + bestRebel.seat} for auto-initiative`);
  }

  return { success: true, message: 'Hitler ability complete' };
}

/**
 * Apply Gaddafi's per-turn ability:
 * "Once per turn, hire 1 random MERC."
 */
export function applyGadafiTurnAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'gadafi') {
    return { success: false, message: 'Not Gaddafi' };
  }

  const merc = game.drawMerc();
  if (!merc) {
    game.message('Gaddafi: No MERCs available to hire');
    return { success: false, message: 'No MERCs available' };
  }

  const primarySquad = game.dictatorPlayer.primarySquad;
  const secondarySquad = game.dictatorPlayer.secondarySquad;
  const targetSquad = !primarySquad.isFull ? primarySquad
    : !secondarySquad.isFull ? secondarySquad
    : null;

  if (!targetSquad) {
    merc.putInto(game.mercDiscard);
    game.message('Gaddafi: All squads full, cannot hire');
    return { success: false, message: 'All squads full' };
  }

  merc.putInto(targetSquad);
  const targetSector = selectNewMercLocation(game);
  if (targetSector) {
    targetSquad.sectorId = targetSector.sectorId;
  }

  let equipType: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
  if (merc.weaponSlot) {
    equipType = merc.armorSlot ? 'Accessory' : 'Armor';
  }
  equipNewHire(game, merc, equipType);

  game.updateAllSargeBonuses();
  game.message(`Gaddafi hired ${merc.combatantName}`);
  return { success: true, message: `Hired ${merc.combatantName}` };
}

/**
 * Apply Stalin's per-turn ability:
 * "Once per turn, hire 1 random MERC to primary squad;
 * if base revealed, also hire 1 to secondary squad."
 */
export function applyStalinTurnAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'stalin') {
    return { success: false, message: 'Not Stalin' };
  }

  // First hire: always to primary squad
  const merc1 = game.drawMerc();
  if (merc1) {
    const primarySquad = game.dictatorPlayer.primarySquad;
    if (!primarySquad.isFull) {
      merc1.putInto(primarySquad);
      const targetSector = selectNewMercLocation(game);
      if (targetSector) primarySquad.sectorId = targetSector.sectorId;
      let equipType: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
      if (merc1.weaponSlot) equipType = merc1.armorSlot ? 'Accessory' : 'Armor';
      equipNewHire(game, merc1, equipType);
      game.updateAllSargeBonuses();
      game.message(`Stalin hired ${merc1.combatantName} to primary squad`);
    } else {
      merc1.putInto(game.mercDiscard);
      game.message('Stalin: Primary squad full, cannot hire');
    }
  } else {
    game.message('Stalin: No MERCs available to hire');
  }

  // Second hire: only if base is revealed, to secondary squad
  if (game.dictatorPlayer.baseRevealed) {
    const merc2 = game.drawMerc();
    if (merc2) {
      const secondarySquad = game.dictatorPlayer.secondarySquad;
      if (!secondarySquad.isFull) {
        merc2.putInto(secondarySquad);
        const targetSector = selectNewMercLocation(game);
        if (targetSector) secondarySquad.sectorId = targetSector.sectorId;
        let equipType: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
        if (merc2.weaponSlot) equipType = merc2.armorSlot ? 'Accessory' : 'Armor';
        equipNewHire(game, merc2, equipType);
        game.updateAllSargeBonuses();
        game.message(`Stalin hired ${merc2.combatantName} to secondary squad`);
      } else {
        merc2.putInto(game.mercDiscard);
        game.message('Stalin: Secondary squad full, cannot hire');
      }
    }
  }

  return { success: true, message: 'Stalin hire complete' };
}

// =============================================================================
// Pinochet's Per-Turn Abilities (AI + Human Paths)
// =============================================================================

/**
 * Apply Pinochet's pending hires from sector losses (AI auto-hire).
 * For each pending hire: draw a MERC, place in non-full squad, auto-equip, emit map entry.
 */
export function applyPinochetPendingHires(game: MERCGame): void {
  if (game._pinochetPendingHires <= 0) return;

  const hiresToProcess = game._pinochetPendingHires;
  game._pinochetPendingHires = 0;

  for (let i = 0; i < hiresToProcess; i++) {
    const merc = game.drawMerc();
    if (!merc) {
      game.message('Pinochet: No MERCs available to hire');
      break;
    }

    const primarySquad = game.dictatorPlayer.primarySquad;
    const secondarySquad = game.dictatorPlayer.secondarySquad;
    const targetSquad = !primarySquad.isFull ? primarySquad
      : !secondarySquad.isFull ? secondarySquad
      : null;

    if (!targetSquad) {
      merc.putInto(game.mercDiscard);
      game.message('Pinochet: All squads full, cannot hire');
      continue;
    }

    merc.putInto(targetSquad);

    // Set squad location if not assigned yet
    if (!targetSquad.sectorId) {
      const targetSector = selectNewMercLocation(game);
      if (targetSector) {
        targetSquad.sectorId = targetSector.sectorId;
      }
    }

    // Auto-equip: Weapon first, then Armor, then Accessory
    let equipType: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
    if (merc.weaponSlot) {
      equipType = merc.armorSlot ? 'Accessory' : 'Armor';
    }
    equipNewHire(game, merc, equipType);
    game.updateAllSargeBonuses();

    // Emit map entry animation
    if (targetSquad.sectorId) {
      emitMapCombatantEntries(game, [buildMapCombatantEntry(merc, targetSquad.sectorId)]);
    }

    game.message(`Pinochet lost a sector - hired ${merc.combatantName}`);
  }
}

/**
 * Apply Pinochet's damage spread ability.
 * Distributes damage equal to rebel-controlled sector count across all rebel forces.
 * Damage is spread as evenly as possible across living MERCs and militia.
 * Runs for both AI and human Pinochet (no player choices required).
 */
export function applyPinochetDamageSpread(game: MERCGame): void {
  // Count rebel-controlled sectors
  let rebelSectorCount = 0;
  for (const rebel of game.rebelPlayers) {
    rebelSectorCount += game.getControlledSectors(rebel).length;
  }

  if (rebelSectorCount === 0) {
    game.message('Pinochet: Rebels control no sectors - no damage to distribute');
    return;
  }

  const totalDamage = rebelSectorCount;

  // Gather all rebel forces as a flat array of targets
  // MERCs first (determines who gets remainder damage), then militia
  interface DamageTarget {
    type: 'merc' | 'militia';
    merc?: CombatantModel;
    sector?: Sector;
    playerId?: string;
  }

  const targets: DamageTarget[] = [];

  // MERCs first
  for (const rebel of game.rebelPlayers) {
    for (const merc of rebel.team) {
      if (!merc.isDead) {
        targets.push({ type: 'merc', merc });
      }
    }
  }

  // Then militia
  for (const rebel of game.rebelPlayers) {
    const playerId = String(rebel.seat);
    for (const sector of game.gameMap.getAllSectors()) {
      const militiaCount = sector.getRebelMilitia(playerId);
      for (let i = 0; i < militiaCount; i++) {
        targets.push({ type: 'militia', sector, playerId });
      }
    }
  }

  if (targets.length === 0) {
    game.message('Pinochet: No rebel forces to damage');
    return;
  }

  // Distribute damage evenly
  const perUnit = Math.floor(totalDamage / targets.length);
  const remainder = totalDamage % targets.length;

  let totalApplied = 0;

  for (let i = 0; i < targets.length; i++) {
    const dmg = i < remainder ? perUnit + 1 : perUnit;
    if (dmg <= 0) continue;

    const target = targets[i];

    if (target.type === 'merc' && target.merc) {
      const merc = target.merc;
      merc.takeDamage(dmg);
      totalApplied += dmg;

      if (merc.isDead) {
        // Discard all equipment (same pattern as combat.ts death handling)
        const equipmentTypes: Array<'Weapon' | 'Armor' | 'Accessory'> = ['Weapon', 'Armor', 'Accessory'];
        for (const eqType of equipmentTypes) {
          const equipment = merc.unequip(eqType);
          if (equipment) {
            const discard = game.getEquipmentDiscard(eqType);
            if (discard) equipment.putInto(discard);
          }
        }
        merc.putInto(game.mercDiscard);
        game.message(`${merc.combatantName} killed by Pinochet's damage spread!`);
      }
    } else if (target.type === 'militia' && target.sector && target.playerId) {
      target.sector.removeRebelMilitia(target.playerId, dmg);
      totalApplied += dmg;
    }
  }

  game.message(`Pinochet distributes ${totalApplied} damage across rebel forces (rebels control ${rebelSectorCount} sectors)`);
}

/**
 * Apply Pinochet's per-turn ability (AI dispatcher entry point).
 * Processes pending hires first (from sector losses), then applies damage spread.
 */
export function applyPinochetTurnAbility(game: MERCGame): void {
  applyPinochetPendingHires(game);
  applyPinochetDamageSpread(game);
}

// =============================================================================
// Noriega's Per-Turn Ability (AI Path)
// =============================================================================

/**
 * Apply Noriega's per-turn ability:
 * "Convert 1 militia from each rebel-controlled sector to dictator militia,
 * move all converted to one chosen non-rebel sector.
 * If dictator controls fewer sectors than rebels (post-conversion), hire 1 MERC."
 */
export function applyNoriegaTurnAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'noriega') {
    return { success: false, message: 'Not Noriega' };
  }

  // Step 1: Convert 1 rebel militia from each rebel-controlled sector
  let totalConverted = 0;
  for (const rebel of game.rebelPlayers) {
    const controlledSectors = game.getControlledSectors(rebel);
    for (const sector of controlledSectors) {
      const removed = sector.removeRebelMilitia(String(rebel.seat), 1);
      if (removed > 0) {
        totalConverted += removed;
        game.message(`Noriega converts 1 militia in ${sector.sectorName}`);
      }
    }
  }

  if (totalConverted === 0) {
    game.message('Noriega: No rebel militia to convert');
  }

  // Step 2: Place converted militia in a non-rebel sector
  if (totalConverted > 0) {
    // Find all non-rebel-controlled sectors
    const rebelControlledIds = new Set<string>();
    for (const rebel of game.rebelPlayers) {
      for (const sector of game.getControlledSectors(rebel)) {
        rebelControlledIds.add(sector.sectorId);
      }
    }
    const nonRebelSectors = game.gameMap.getAllSectors()
      .filter(s => !rebelControlledIds.has(s.sectorId));

    if (nonRebelSectors.length === 0) {
      // Edge case: all sectors are rebel-controlled, place on any sector with dictator presence
      const fallback = game.gameMap.getAllSectors().find(s => s.dictatorMilitia > 0);
      if (fallback) {
        fallback.addDictatorMilitia(totalConverted);
        game.message(`Noriega moved ${totalConverted} converted militia to ${fallback.sectorName}`);
      }
    } else {
      // AI strategy: prefer non-rebel sector with most adjacent rebel sectors
      let bestSector = nonRebelSectors[0];
      let bestScore = -1;

      for (const sector of nonRebelSectors) {
        const adjacent = game.getAdjacentSectors(sector);
        const adjacentRebelCount = adjacent.filter(a => rebelControlledIds.has(a.sectorId)).length;
        if (adjacentRebelCount > bestScore) {
          bestScore = adjacentRebelCount;
          bestSector = sector;
        }
      }

      bestSector.addDictatorMilitia(totalConverted);
      game.message(`Noriega moved ${totalConverted} converted militia to ${bestSector.sectorName}`);

      // Check for combat in destination sector
      for (const rebel of game.rebelPlayers) {
        const hasSquad = rebel.primarySquad.sectorId === bestSector.sectorId ||
          rebel.secondarySquad.sectorId === bestSector.sectorId;
        const hasMilitia = bestSector.getRebelMilitia(`${rebel.seat}`) > 0;

        if (hasSquad || hasMilitia) {
          game.message(`Rebels detected at ${bestSector.sectorName} - combat begins!`);
          queuePendingCombat(game, bestSector, rebel, false);
        }
      }
    }
  }

  // Step 3: Conditional hire -- compare post-conversion sector counts
  const dictatorSectors = game.getControlledSectors(game.dictatorPlayer).length;
  let totalRebelSectors = 0;
  for (const rebel of game.rebelPlayers) {
    totalRebelSectors += game.getControlledSectors(rebel).length;
  }

  if (dictatorSectors < totalRebelSectors) {
    const merc = game.drawMerc();
    if (merc) {
      const primarySquad = game.dictatorPlayer.primarySquad;
      const secondarySquad = game.dictatorPlayer.secondarySquad;
      const targetSquad = !primarySquad.isFull ? primarySquad
        : !secondarySquad.isFull ? secondarySquad
        : null;

      if (!targetSquad) {
        merc.putInto(game.mercDiscard);
        game.message('Noriega: All squads full, cannot hire');
      } else {
        merc.putInto(targetSquad);
        const targetSector = selectNewMercLocation(game);
        if (targetSector) {
          targetSquad.sectorId = targetSector.sectorId;
        }

        let equipType: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
        if (merc.weaponSlot) {
          equipType = merc.armorSlot ? 'Accessory' : 'Armor';
        }
        equipNewHire(game, merc, equipType);

        game.updateAllSargeBonuses();

        if (targetSquad.sectorId) {
          emitMapCombatantEntries(game, [buildMapCombatantEntry(merc, targetSquad.sectorId)]);
        }

        game.message(`Noriega hired ${merc.combatantName} (controlling fewer sectors than rebels)`);
      }
    } else {
      game.message('Noriega: No MERCs available to hire');
    }
  } else {
    game.message('Noriega controls enough sectors - no bonus hire');
  }

  return {
    success: true,
    message: `Converted ${totalConverted} militia`,
    data: { totalConverted, dictatorSectors, totalRebelSectors },
  };
}

// =============================================================================
// Hussein's Per-Turn Bonus Tactics (AI Path)
// =============================================================================

/**
 * Apply Hussein's per-turn ability (AI path):
 * "Draw and play a second tactics card at the end of each turn."
 * AI auto-plays the top card from the deck.
 */
export function applyHusseinBonusTactics(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'hussein') {
    return { success: false, message: 'Not Hussein' };
  }

  const tacticsDeck = game.dictatorPlayer.tacticsDeck;
  if (!tacticsDeck) {
    return { success: false, message: 'No tactics deck' };
  }

  const card = tacticsDeck.first(TacticsCard);
  if (!card) {
    return { success: true, message: 'No cards remaining' };
  }

  // Move card to discard
  card.putInto(game.dictatorPlayer.tacticsDiscard!);

  // Execute the card's effect (handles base reveal, militia placement, etc.)
  const result = executeTacticsEffect(game, card);

  game.message(`Hussein plays bonus tactics card: ${card.tacticsName}`);

  return {
    success: true,
    message: `Hussein bonus tactics: ${card.tacticsName} - ${result.message}`,
    data: result.data,
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
    case 'hussein':
      applyHusseinSetupAbility(game);
      break;
    case 'mao':
      applyMaoSetupAbility(game);
      break;
    case 'mussolini':
      applyMussoliniSetupAbility(game);
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
    case 'gadafi':
      applyGadafiTurnAbility(game);
      break;
    case 'stalin':
      applyStalinTurnAbility(game);
      break;
    case 'mao':
      applyMaoTurnAbility(game);
      break;
    case 'mussolini':
      applyMussoliniTurnAbility(game);
      break;
    case 'polpot':
      applyPolpotTurnAbility(game);
      break;
    case 'hitler':
      applyHitlerTurnAbility(game);
      break;
    case 'noriega':
      applyNoriegaTurnAbility(game);
      break;
    case 'pinochet':
      applyPinochetTurnAbility(game);
      break;
    default:
      // Unknown dictator - no special handling
      break;
  }
}

// =============================================================================
// Gaddafi's Reactive Equipment Loot (Post-Combat)
// =============================================================================

/**
 * Search all 3 equipment discard piles for an equipment element by its BoardSmith ID.
 * Returns the Equipment if found, undefined otherwise.
 */
export function findEquipmentInDiscards(game: MERCGame, equipmentId: number): Equipment | undefined {
  for (const type of ['Weapon', 'Armor', 'Accessory'] as const) {
    const discard = game.getEquipmentDiscard(type);
    if (!discard) continue;
    const found = discard.first(Equipment, e => e.id === equipmentId);
    if (found) return found;
  }
  return undefined;
}

/**
 * Process Gaddafi's looted equipment (AI auto-equip path).
 * For each staged equipment item, find a dictator MERC in the combat sector
 * with an open slot of the matching type and equip it.
 * Equipment with no valid recipient stays in the discard pile.
 */
export function processGaddafiLoot(game: MERCGame): void {
  if (!game._gaddafiLootableEquipment || game._gaddafiLootableEquipment.length === 0) return;

  const lootItems = [...game._gaddafiLootableEquipment];
  game._gaddafiLootableEquipment = null;

  for (const item of lootItems) {
    const sector = game.getSector(item.sectorId);
    if (!sector) continue;

    const dictatorMercs = game.getDictatorMercsInSector(sector);
    if (dictatorMercs.length === 0) continue;

    const equipment = findEquipmentInDiscards(game, item.equipmentId);
    if (!equipment) continue;

    const equipType = equipment.equipmentType as 'Weapon' | 'Armor' | 'Accessory';

    // Find dictator MERC with open slot of matching type
    const recipient = dictatorMercs.find(m => {
      if (equipType === 'Weapon') return !m.weaponSlot;
      if (equipType === 'Armor') return !m.armorSlot;
      if (equipType === 'Accessory') return !m.accessorySlot;
      return false;
    });

    if (!recipient) {
      game.message(`Gaddafi: No MERC in sector can use ${equipment.equipmentName} - discarded`);
      continue;
    }

    // equip() handles moving equipment from its current container (discard pile) to the MERC's slot
    recipient.equip(equipment);
    game.message(`Gaddafi loots ${equipment.equipmentName} onto ${recipient.combatantName}`);
  }
}
