/**
 * Dictator Tactics Card Effects
 *
 * Based on: data/rules/01-game-elements-and-components.md
 * Tactics data: data/dictator-tactics.json
 *
 * Each tactics card has a unique effect when played.
 */

import type { MERCGame, RebelPlayer } from './game.js';
import { TacticsCard, Sector, CombatantModel } from './elements.js';
import { SectorConstants } from './constants.js';
import { queuePendingCombat } from './combat.js';
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
 * Build list of valid targets for artillery allocation in a sector
 */
export function buildArtilleryTargets(game: MERCGame, sector: Sector): Array<{
  id: string;
  name: string;
  type: 'militia' | 'merc';
  ownerId: string;
  currentHealth: number;
  maxHealth: number;
}> {
  const targets: Array<{
    id: string;
    name: string;
    type: 'militia' | 'merc';
    ownerId: string;
    currentHealth: number;
    maxHealth: number;
  }> = [];

  for (const rebel of game.rebelPlayers) {
    const playerId = `${rebel.seat}`;

    // Add militia as single target per player (with count as "health")
    const militiaCount = sector.getRebelMilitia(playerId);
    if (militiaCount > 0) {
      targets.push({
        id: `militia-${playerId}-${sector.sectorId}`,
        name: `${rebel.seat} Militia (${militiaCount})`,
        type: 'militia',
        ownerId: playerId,
        currentHealth: militiaCount, // Each hit kills one militia
        maxHealth: militiaCount,
      });
    }

    // Add individual MERCs
    const mercs = game.getMercsInSector(sector, rebel);
    for (const merc of mercs) {
      targets.push({
        id: merc.combatantId,
        name: merc.combatantName,
        type: 'merc',
        ownerId: playerId,
        currentHealth: merc.health - merc.damage, // Available health
        maxHealth: merc.health,
      });
    }
  }

  return targets;
}

/**
 * Artillery Barrage: Attack sectors adjacent to controlled sectors.
 * Roll d6 per sector, deal that many hits.
 *
 * Rebels choose how to allocate hits to their units via pendingArtilleryAllocation.
 * Each sector is processed one at a time through the allocation action.
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

  if (sectorsToAttack.length === 0) {
    return { success: true, message: 'Artillery Barrage: No valid targets' };
  }

  // Roll for all sectors upfront
  const sectorRolls: Array<{ sector: Sector; hits: number }> = [];
  for (const sector of sectorsToAttack) {
    const roll = game.rollDie();
    game.message(`Artillery targets ${sector.sectorName}: rolled ${roll} hits`);
    sectorRolls.push({ sector, hits: roll });
  }

  // Filter to sectors with actual targets and hits > 0
  const sectorsWithTargets = sectorRolls.filter(({ sector, hits }) => {
    if (hits === 0) return false;
    // Check if sector has any rebel units
    return game.rebelPlayers.some(rebel => {
      const militia = sector.getRebelMilitia(`${rebel.seat}`);
      const mercs = game.getMercsInSector(sector, rebel);
      return militia > 0 || mercs.length > 0;
    });
  });

  if (sectorsWithTargets.length === 0) {
    return { success: true, message: 'Artillery Barrage: All misses or no targets' };
  }

  // Build pending state for first sector
  const firstSector = sectorsWithTargets[0];
  const validTargets = buildArtilleryTargets(game, firstSector.sector);

  // Queue remaining sectors
  const remaining = sectorsWithTargets.slice(1).map(({ sector, hits }) => ({
    sectorId: sector.sectorId,
    sectorName: sector.sectorName,
    hits,
  }));

  game.pendingArtilleryAllocation = {
    sectorId: firstSector.sector.sectorId,
    sectorName: firstSector.sector.sectorName,
    hits: firstSector.hits,
    allocatedHits: 0,
    validTargets,
    sectorsRemaining: remaining,
  };

  return {
    success: true,
    message: `Artillery Barrage: Allocate ${firstSector.hits} hits at ${firstSector.sector.sectorName}`,
    data: { sectorsHit: sectorsWithTargets.length, pending: true },
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
      if (game.dictatorPlayer.dictator) {
        game.dictatorPlayer.dictator.baseSectorId = baseSector.sectorId;
      }
      game.message(`Dictator base established at ${baseSector.sectorName}`);
    }
  }

  game.dictatorPlayer.baseRevealed = true;
  game.dictatorPlayer.dictator?.enterPlay();
  // Ensure dictator card has baseSectorId set (may have been set earlier by human player)
  if (game.dictatorPlayer.dictator && game.dictatorPlayer.baseSectorId) {
    game.dictatorPlayer.dictator.baseSectorId = game.dictatorPlayer.baseSectorId;
  }

  // Put dictator into base squad (not primary/secondary) at the base location
  // Using baseSquad avoids teleporting any MERCs already in primary/secondary squads
  if (game.dictatorPlayer.dictator && game.dictatorPlayer.baseSectorId) {
    const baseSquad = game.dictatorPlayer.baseSquad;
    baseSquad.sectorId = game.dictatorPlayer.baseSectorId;
    game.dictatorPlayer.dictator.putInto(baseSquad);
  }

  // Dictators get 1 free equipment when entering play, just like MERCs
  // Only auto-equip for AI - human players choose via the playTactics action's dictatorEquipment step
  const dictator = game.dictatorPlayer.dictator;
  if (game.dictatorPlayer?.isAI && dictator) {
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
      const removed = sector.removeRebelMilitia(`${rebel.seat}`, 2);
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
      const rebelMilitia = sector.getRebelMilitia(`${rebel.seat}`);
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
        // Trigger combat - dictator initiated
        queuePendingCombat(game, targetSector, rebel, false);
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
  const combatsTriggered: string[] = [];

  for (const sector of industries) {
    const placed = sector.addDictatorMilitia(game.rebelCount);
    totalPlaced += placed;
    if (placed > 0) {
      game.message(`Reinforced ${sector.sectorName} with ${placed} militia`);

      // Check for combat with any rebel in this sector
      for (const rebel of game.rebelPlayers) {
        const hasSquad = rebel.primarySquad.sectorId === sector.sectorId ||
          rebel.secondarySquad.sectorId === sector.sectorId;
        const hasMilitia = sector.getRebelMilitia(`${rebel.seat}`) > 0;

        if (hasSquad || hasMilitia) {
          game.message(`Rebels detected at ${sector.sectorName} - combat begins!`);
          combatsTriggered.push(sector.sectorName);
          // Dictator initiated combat
          queuePendingCombat(game, sector, rebel, false);
          break; // Only trigger combat once per sector
        }
      }
    }
  }

  return {
    success: true,
    message: `Reinforcements: ${totalPlaced} militia placed`,
    data: { totalPlaced, industriesReinforced: industries.length, combatsTriggered },
  };
}

/**
 * Seizure: Flip wilderness sectors and add militia
 * MERC-wyvg: X = number of rebel players
 * - Flip X wilderness sectors to explored
 * - Add X-1 militia to each flipped sector
 */
function seizure(game: MERCGame): TacticsEffectResult {
  const x = game.rebelCount;
  const militiaToAdd = Math.max(0, x - 1);

  // Find unexplored wilderness sectors
  const unexploredWilderness = game.gameMap.getAllSectors().filter(
    s => s.isWilderness && !s.explored
  );

  // Flip up to X sectors
  const sectorsToFlip = unexploredWilderness.slice(0, x);
  let sectorsFlipped = 0;
  let totalMilitiaPlaced = 0;

  for (const sector of sectorsToFlip) {
    sector.explore();
    sectorsFlipped++;
    game.message(`Seizure: ${sector.sectorName} is now explored`);

    // Add X-1 militia to the sector
    if (militiaToAdd > 0) {
      const placed = sector.addDictatorMilitia(militiaToAdd);
      totalMilitiaPlaced += placed;
      if (placed > 0) {
        game.message(`Seizure: ${placed} militia placed at ${sector.sectorName}`);
      }
    }
  }

  return {
    success: true,
    message: `Seizure: ${sectorsFlipped} sectors explored, ${totalMilitiaPlaced} militia placed`,
    data: { sectorsFlipped, totalMilitiaPlaced },
  };
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
  game.conscriptsActive = true;
  game.conscriptsAmount = Math.ceil(game.rebelCount / 2);

  game.message(`Conscripts activated: ${game.conscriptsAmount} militia will be added each turn`);

  return {
    success: true,
    message: 'Conscripts permanent effect activated',
    data: { amount: game.conscriptsAmount },
  };
}

/**
 * Apply conscripts effect at end of dictator turn
 */
export function applyConscriptsEffect(game: MERCGame): void {
  if (!game.conscriptsActive) return;

  const amount = game.conscriptsAmount ?? 1;
  let totalPlaced = 0;

  for (const sector of game.gameMap.getAllSectors()) {
    if (sector.dictatorMilitia > 0) {
      const placed = sector.addDictatorMilitia(amount);
      totalPlaced += placed;

      // Check for combat with any rebel in this sector
      if (placed > 0) {
        for (const rebel of game.rebelPlayers) {
          const hasSquad = rebel.primarySquad.sectorId === sector.sectorId ||
            rebel.secondarySquad.sectorId === sector.sectorId;
          const hasMilitia = sector.getRebelMilitia(`${rebel.seat}`) > 0;

          if (hasSquad || hasMilitia) {
            game.message(`Conscripts triggered combat at ${sector.sectorName}!`);
            // Dictator initiated combat
            queuePendingCombat(game, sector, rebel, false);
            break; // Only trigger combat once per sector
          }
        }
      }
    }
  }

  if (totalPlaced > 0) {
    game.message(`Conscripts: ${totalPlaced} militia reinforced`);
  }
}

/**
 * Veteran Militia: Reveals base AND militia get +1 initiative
 * MERC-ohos: Adds permanent militia initiative bonus
 */
function veteranMilitia(game: MERCGame): TacticsEffectResult {
  // First reveal the base
  const baseResult = revealBase(game);

  // Set the permanent militia initiative bonus flag
  game.veteranMilitiaActive = true;
  game.message('Veteran Militia: Dictator militia now have +1 initiative');

  return {
    success: baseResult.success,
    message: `${baseResult.message}. Militia +1 initiative`,
    data: { ...baseResult.data, militiaInitiativeBonus: true },
  };
}

/**
 * Better Weapons: Reveals base AND militia hit on 3+
 * MERC-7zax: Adds permanent militia combat bonus
 */
function betterWeapons(game: MERCGame): TacticsEffectResult {
  // First reveal the base
  const baseResult = revealBase(game);

  // Set the permanent militia bonus flag
  game.betterWeaponsActive = true;
  game.message('Better Weapons: Dictator militia now hit on 3+');

  return {
    success: baseResult.success,
    message: `${baseResult.message}. Militia hit on 3+`,
    data: { ...baseResult.data, militiaBonus: true },
  };
}

/**
 * Generalisimo: Reveals base AND dictator gives combat bonus to all units at base
 * The dictator fights alongside forces at the base, giving +1 combat to all friendly units there.
 */
function generalisimo(game: MERCGame): TacticsEffectResult {
  // First reveal the base
  const baseResult = revealBase(game);

  // Set the permanent combat bonus flag for base defenders
  game.generalisimoActive = true;
  game.message('Generalisimo: Dictator inspires forces at base (+1 combat to all units at base)');

  return {
    success: baseResult.success,
    message: `${baseResult.message}. Dictator combat bonus active at base`,
    data: { ...baseResult.data, generalisimoBonus: true },
  };
}

/**
 * Lockdown: Reveals base AND provides defensive bonuses at base
 * Prepare defenses for the final battle - all units at base get +1 armor.
 */
function lockdown(game: MERCGame): TacticsEffectResult {
  // First reveal the base
  const baseResult = revealBase(game);

  // Set the permanent defensive bonus flag for base
  game.lockdownActive = true;
  game.message('Lockdown: Base defenses prepared (+1 armor to all units at base)');

  return {
    success: baseResult.success,
    message: `${baseResult.message}. Defensive bonuses active at base`,
    data: { ...baseResult.data, lockdownBonus: true },
  };
}

/**
 * Oil Reserves: Permanent effect - free move for oil controller
 * This sets a game flag
 */
function oilReserves(game: MERCGame): TacticsEffectResult {
  game.oilReservesActive = true;
  game.message('Oil Reserves activated: Controller of oil industry gains 1 free move action');

  return {
    success: true,
    message: 'Oil Reserves permanent effect activated',
  };
}

/**
 * Apply Oil Reserves effect at start of turn
 * MERC-vqmi: Controller of oil industry gains +1 action to one MERC
 */
export function applyOilReservesEffect(game: MERCGame, isRebelTurn: boolean, rebelPlayer?: RebelPlayer): void {
  if (!game.oilReservesActive) return;

  // Find the oil industry sector
  const oilSector = game.gameMap.getAllSectors().find(s => s.sectorId === 'industry---oil');
  if (!oilSector) return;

  // Determine who controls the oil industry (who has presence there)
  const dictatorPresence = oilSector.dictatorMilitia > 0 ||
    (game.dictatorPlayer.dictator?.inPlay && game.dictatorPlayer.dictator.sectorId === oilSector.sectorId);
  const hasAnyRebelPresence = game.rebelPlayers.some(r =>
    r.primarySquad.sectorId === oilSector.sectorId ||
    r.secondarySquad.sectorId === oilSector.sectorId ||
    oilSector.getRebelMilitia(`${r.seat}`) > 0
  );

  if (isRebelTurn && rebelPlayer) {
    // Check if this rebel controls the oil (no dictator presence AND this rebel has presence)
    const thisRebelPresence =
      rebelPlayer.primarySquad.sectorId === oilSector.sectorId ||
      rebelPlayer.secondarySquad.sectorId === oilSector.sectorId ||
      oilSector.getRebelMilitia(`${rebelPlayer.seat}`) > 0;

    if (!dictatorPresence && thisRebelPresence) {
      // Grant +1 action to the first living MERC with < max actions
      const merc = rebelPlayer.team.find(m => !m.isDead);
      if (merc) {
        merc.actionsRemaining += 1;
        game.message(`Oil Reserves: ${merc.combatantName} gains 1 free action`);
      }
    }
  } else if (!isRebelTurn) {
    // Dictator turn - check if dictator controls the oil (no rebel presence)
    if (dictatorPresence && !hasAnyRebelPresence) {
      // Grant +1 action to first available unit
      const merc = game.dictatorPlayer.hiredMercs.find(m => !m.isDead);
      if (merc) {
        merc.actionsRemaining += 1;
        game.message(`Oil Reserves: ${merc.combatantName} gains 1 free action`);
      } else if (game.dictatorPlayer.dictator?.inPlay && !game.dictatorPlayer.dictator.isDead) {
        game.dictatorPlayer.dictator.actionsRemaining += 1;
        game.message('Oil Reserves: Dictator gains 1 free action');
      }
    }
  }
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
      const removed = sector.removeRebelMilitia(`${rebel.seat}`, amount);
      militiaRemoved += removed;
    }
  }

  // Damage all rebel MERCs (ignores armor)
  for (const rebel of game.rebelPlayers) {
    for (const merc of rebel.team) {
      merc.damage += 1; // Direct damage, bypassing armor
      mercsDamaged++;
      game.message(`${merc.combatantName} poisoned by tainted water (1 damage)`);
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
      return betterWeapons(game);

    case 'veteran-militia':
      return veteranMilitia(game);

    case 'generalisimo':
      return generalisimo(game);

    case 'lockdown':
      return lockdown(game);

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
