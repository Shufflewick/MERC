/**
 * Day 1 - The Landing
 *
 * Based on: data/rules/04-day-one-the-landing.md
 *
 * Day 1 is a special setup round where the invasion begins.
 * It follows different rules than Days 2-6.
 */

import type { MERCGame, RebelPlayer } from './game.js';
import { MercCard, Equipment, Sector, TacticsCard } from './elements.js';
import { TeamConstants, DictatorConstants, SectorConstants } from './constants.js';
import { applyDictatorSetupAbilities } from './dictator-abilities.js';
import { selectNewMercLocation } from './ai-helpers.js';

// =============================================================================
// Rebel Phase - Day 1
// =============================================================================

/**
 * Draw multiple MERCs for initial hiring selection.
 * Rebels draw 3, then choose which to hire.
 */
export function drawMercsForHiring(game: MERCGame, count: number = 3): MercCard[] {
  const drawnMercs: MercCard[] = [];

  for (let i = 0; i < count; i++) {
    const merc = game.drawMerc();
    if (merc) {
      drawnMercs.push(merc);
    }
  }

  return drawnMercs;
}

/**
 * Hire selected MERCs from the drawn pool.
 * Returns unhired MERCs to the discard pile.
 */
export function hireSelectedMercs(
  game: MERCGame,
  player: RebelPlayer,
  drawnMercs: MercCard[],
  selectedIndices: number[]
): MercCard[] {
  const hiredMercs: MercCard[] = [];

  for (let i = 0; i < drawnMercs.length; i++) {
    const merc = drawnMercs[i];

    if (selectedIndices.includes(i)) {
      // Hire this MERC - add to player's primary squad
      merc.putInto(player.primarySquad);
      hiredMercs.push(merc);
      game.message(`${player.name} hired ${merc.mercName}`);
    } else {
      // Discard unhired MERC
      merc.putInto(game.mercDiscard);
    }
  }

  return hiredMercs;
}

/**
 * Check if a sector is a valid landing zone.
 * - Must be on the map edge
 * - Cannot be claimed by another rebel
 * - Cannot be the dictator's base
 */
export function isValidLandingSector(game: MERCGame, sector: Sector): boolean {
  // Must be an edge sector
  if (!game.gameMap.isEdgeSector(sector)) {
    return false;
  }

  // Cannot be dictator's base
  if (sector.isBase) {
    return false;
  }

  // Cannot be where another rebel has already landed
  for (const rebel of game.rebelPlayers) {
    if (rebel.primarySquad.sectorId === sector.sectorId) {
      return false;
    }
  }

  return true;
}

/**
 * Get all valid landing sectors for a rebel.
 */
export function getValidLandingSectors(game: MERCGame): Sector[] {
  return game.gameMap.getEdgeSectors().filter(sector =>
    isValidLandingSector(game, sector)
  );
}

/**
 * Place a rebel's primary squad on their chosen landing sector.
 */
export function placeLanding(
  game: MERCGame,
  player: RebelPlayer,
  sector: Sector
): void {
  if (!isValidLandingSector(game, sector)) {
    throw new Error(`Invalid landing sector: ${sector.sectorName}`);
  }

  player.primarySquad.sectorId = sector.sectorId;
  game.message(`${player.name} landed at ${sector.sectorName}`);
}

/**
 * Equip starting equipment on a MERC.
 * Each newly hired MERC gets 1 free equipment from any deck.
 */
export function equipStartingEquipment(
  game: MERCGame,
  merc: MercCard,
  equipmentType: 'Weapon' | 'Armor' | 'Accessory'
): Equipment | undefined {
  const equipment = game.drawEquipment(equipmentType);

  if (equipment) {
    merc.equip(equipment);
    game.message(`${merc.mercName} equipped ${equipment.equipmentName}`);
  }

  return equipment;
}

/**
 * Complete the rebel phase of Day 1 for a single player.
 * This is a helper function that orchestrates the full rebel setup.
 */
export interface RebelDay1Setup {
  drawnMercs: MercCard[];
  hiredMercs: MercCard[];
  landingSector: Sector | null;
  startingEquipment: Equipment[];
}

// =============================================================================
// Dictator Phase - Day 1
// =============================================================================

/**
 * Get all unoccupied industries on the map.
 * Industries are unoccupied if no rebel has landed there.
 */
export function getUnoccupiedIndustries(game: MERCGame): Sector[] {
  const occupiedSectorIds = new Set<string>();

  // Mark sectors where rebels have landed as occupied
  for (const rebel of game.rebelPlayers) {
    if (rebel.primarySquad?.sectorId) {
      occupiedSectorIds.add(rebel.primarySquad.sectorId);
    }
    if (rebel.secondarySquad?.sectorId) {
      occupiedSectorIds.add(rebel.secondarySquad.sectorId);
    }
  }

  // Return industries that aren't occupied
  return game.gameMap.getAllSectors().filter(sector =>
    sector.isIndustry && !occupiedSectorIds.has(sector.sectorId)
  );
}

/**
 * Place initial militia on unoccupied industries.
 * Each unoccupied industry receives 'difficulty' militia.
 */
export function placeInitialMilitia(game: MERCGame): number {
  const difficulty = game.setupConfig.dictatorStrength.difficulty;
  const unoccupiedIndustries = getUnoccupiedIndustries(game);

  let totalPlaced = 0;

  for (const sector of unoccupiedIndustries) {
    const placed = sector.addDictatorMilitia(difficulty);
    totalPlaced += placed;
    game.message(`Placed ${placed} militia at ${sector.sectorName}`);
  }

  game.message(`Initial militia: ${totalPlaced} total on ${unoccupiedIndustries.length} industries`);

  return totalPlaced;
}

/**
 * Hire the dictator's first MERC.
 * The dictator draws 1 random MERC (no choice).
 * The MERC is placed at a sector the Dictator controls.
 * All hired MERCs get 1 free equipment.
 */
export function hireDictatorMerc(game: MERCGame): MercCard | undefined {
  const merc = game.drawMerc();

  if (merc) {
    // MERC-rwdv: Put the hired MERC into the dictator's squad
    merc.putInto(game.dictatorPlayer.mercSquad);

    // MERC-2ay: Place at sector closest to weakest rebel per AI rules 4.3.2
    const targetSector = selectNewMercLocation(game);
    if (targetSector) {
      merc.sectorId = targetSector.sectorId;
      game.dictatorPlayer.mercSquad.sectorId = targetSector.sectorId;
      game.dictatorPlayer.stationedSectorId = targetSector.sectorId;
      game.message(`Dictator hired ${merc.mercName} (stationed at ${targetSector.sectorName})`);
    } else {
      // No location available yet
      game.message(`Dictator hired ${merc.mercName}`);
    }

    // All hired MERCs get 1 free equipment - prioritize weapon
    let equipType: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
    if (merc.weaponSlot) {
      equipType = merc.armorSlot ? 'Accessory' : 'Armor';
    }
    const freeEquipment = game.drawEquipment(equipType);
    if (freeEquipment) {
      merc.equip(freeEquipment);
      game.message(`${merc.mercName} equipped free ${freeEquipment.equipmentName}`);
    }
  }

  return merc;
}

/**
 * Check and apply dictator's special ability during setup.
 * Some dictators have abilities that trigger during setup.
 */
export function applyDictatorSetupAbility(game: MERCGame): void {
  // Use the new dictator abilities module
  applyDictatorSetupAbilities(game);
}

/**
 * Draw tactics cards until the dictator has a full hand.
 * MERC-5j2: AI does not draw a hand - plays directly from deck.
 */
export function drawTacticsHand(game: MERCGame): TacticsCard[] {
  // MERC-5j2: AI doesn't have a hand, plays from deck top
  if (game.dictatorPlayer.isAI) {
    game.message('AI Dictator plays tactics from deck (no hand)');
    return [];
  }

  const drawnCards: TacticsCard[] = [];
  const targetHandSize = DictatorConstants.HAND_SIZE;
  const tacticsHand = game.dictatorPlayer.tacticsHand;
  const tacticsDeck = game.dictatorPlayer.tacticsDeck;

  while (tacticsHand.count(TacticsCard) < targetHandSize) {
    const card = tacticsDeck.first(TacticsCard);
    if (!card) break;

    card.putInto(tacticsHand);
    drawnCards.push(card);
  }

  game.message(`Dictator drew ${drawnCards.length} tactics cards`);

  return drawnCards;
}

/**
 * Place extra militia on dictator-controlled sectors.
 * The dictator can distribute these across multiple sectors.
 */
export function placeExtraMilitia(
  game: MERCGame,
  placements: Map<string, number>
): number {
  const extraBudget = game.setupConfig.dictatorStrength.extra;
  let totalPlaced = 0;

  for (const [sectorId, count] of placements) {
    if (totalPlaced + count > extraBudget) {
      const remaining = extraBudget - totalPlaced;
      if (remaining <= 0) break;

      const sector = game.getSector(sectorId);
      if (sector) {
        const placed = sector.addDictatorMilitia(remaining);
        totalPlaced += placed;
        game.message(`Placed ${placed} extra militia at ${sector.sectorName}`);
      }
      break;
    }

    const sector = game.getSector(sectorId);
    if (sector) {
      const placed = sector.addDictatorMilitia(count);
      totalPlaced += placed;
      game.message(`Placed ${placed} extra militia at ${sector.sectorName}`);
    }
  }

  return totalPlaced;
}

/**
 * Auto-place extra militia during setup.
 * MERC-cgn: Per AI Setup rules, extra militia are distributed EVENLY
 * among Dictator-controlled Industries during setup.
 * Note: For card-based placement during play, use selectMilitiaPlacementSector.
 */
export function autoPlaceExtraMilitia(game: MERCGame): number {
  const { distributeExtraMilitiaEvenly } = require('./ai-helpers.js');
  const extraBudget = game.setupConfig.dictatorStrength.extra;

  if (extraBudget === 0) {
    return 0;
  }

  // MERC-cgn: During setup, distribute evenly among dictator-controlled industries
  const placements = distributeExtraMilitiaEvenly(game, extraBudget);

  let totalPlaced = 0;
  for (const count of placements.values()) {
    totalPlaced += count;
  }

  if (totalPlaced > 0) {
    game.message(`Total: ${totalPlaced} extra militia distributed evenly`);
  }

  return totalPlaced;
}

// =============================================================================
// Complete Day 1 Execution
// =============================================================================

/**
 * Execute the complete dictator phase of Day 1.
 * This is called after all rebels have completed their phase.
 */
export function executeDictatorDay1(game: MERCGame): void {
  game.message('=== Dictator Day 1 Phase ===');

  // Step 1: Place initial militia on unoccupied industries
  placeInitialMilitia(game);

  // Step 2: Hire dictator's first MERC
  hireDictatorMerc(game);

  // Step 3: Check dictator special ability
  applyDictatorSetupAbility(game);

  // Step 4: Draw tactics hand
  drawTacticsHand(game);

  // Step 5: Place extra militia
  autoPlaceExtraMilitia(game);

  game.message('=== Dictator Day 1 Complete ===');
}

/**
 * Get the summary of Day 1 state after completion.
 */
export function getDay1Summary(game: MERCGame): string {
  const lines: string[] = [];

  lines.push('=== Day 1 Complete ===');
  lines.push('');

  // Rebel summary
  lines.push('Rebels:');
  for (const rebel of game.rebelPlayers) {
    const sector = game.getSector(rebel.primarySquad.sectorId!);
    const mercs = rebel.team.map(m => m.mercName).join(', ');
    lines.push(`  ${rebel.name}: ${mercs}`);
    lines.push(`    Landing: ${sector?.sectorName ?? 'Unknown'}`);
  }

  lines.push('');

  // Dictator summary
  lines.push('Dictator:');
  lines.push(`  Name: ${game.dictatorPlayer.dictator?.dictatorName}`);
  lines.push(`  Tactics in hand: ${game.dictatorPlayer.tacticsHand?.count(TacticsCard)}`);
  lines.push(`  Tactics in deck: ${game.dictatorPlayer.tacticsDeck?.count(TacticsCard)}`);

  // Militia summary
  const sectorsWithMilitia = game.gameMap.getAllSectors().filter(s => s.dictatorMilitia > 0);
  const totalMilitia = sectorsWithMilitia.reduce((sum, s) => sum + s.dictatorMilitia, 0);
  lines.push(`  Total militia: ${totalMilitia} across ${sectorsWithMilitia.length} sectors`);

  lines.push('');
  lines.push('Proceed to Day 2');

  return lines.join('\n');
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Check if a rebel has completed all Day 1 requirements.
 */
export function isRebelDay1Complete(game: MERCGame, player: RebelPlayer): boolean {
  // Must have hired 2 MERCs
  if (player.teamSize < TeamConstants.STARTING_MERCS) {
    return false;
  }

  // Must have placed on a sector
  if (!player.primarySquad.sectorId) {
    return false;
  }

  // Each MERC should have starting equipment
  // (This is optional in some variants, so we don't enforce it strictly)

  return true;
}

/**
 * Check if all rebels have completed Day 1.
 */
export function isRebelPhaseComplete(game: MERCGame): boolean {
  return game.rebelPlayers.every(rebel => isRebelDay1Complete(game, rebel));
}

/**
 * Get the number of MERCs a rebel should hire on Day 1.
 */
export function getStartingMercCount(): number {
  return TeamConstants.STARTING_MERCS;
}

/**
 * Get the number of MERCs to draw for hiring selection.
 */
export function getMercsToDrawForHiring(): number {
  return 3; // Draw 3, pick 1-3
}

/**
 * Get maximum militia per sector.
 */
export function getMaxMilitiaPerSector(): number {
  return SectorConstants.MAX_MILITIA_PER_SIDE;
}
