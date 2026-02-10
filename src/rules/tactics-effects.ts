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
import { selectAIBaseLocation, selectNewMercLocation } from './ai-helpers.js';
import { equipNewHire } from './actions/helpers.js';

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

  // Pure UI signal — mutations happen through the allocation flow
  game.animate('tactic-artillery-barrage', {
    cardName: 'Artillery Barrage',
    description: 'Bombarding rebel sectors with mortar fire',
    sectorsTargeted: sectorsWithTargets.map(s => ({
      sectorId: s.sector.sectorId,
      sectorName: s.sector.sectorName,
      hits: s.hits,
    })),
  }, () => {});

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
  // Pre-compute affected sectors before animation
  const affectedSectors: Array<{ sectorId: string; sectorName: string; removed: number }> = [];
  for (const sector of game.gameMap.getAllSectors()) {
    let sectorRemoved = 0;
    for (const rebel of game.rebelPlayers) {
      const available = sector.getRebelMilitia(`${rebel.seat}`);
      const toRemove = Math.min(2, available);
      sectorRemoved += toRemove;
    }
    if (sectorRemoved > 0) {
      affectedSectors.push({
        sectorId: sector.sectorId,
        sectorName: sector.sectorName,
        removed: sectorRemoved,
      });
    }
  }

  let totalRemoved = 0;

  game.animate('tactic-family-threat', {
    cardName: 'Family Threat',
    description: 'Each rebel sector loses 2 militia as they run home to their families',
    affectedSectors,
  }, () => {
    for (const sector of game.gameMap.getAllSectors()) {
      for (const rebel of game.rebelPlayers) {
        const removed = sector.removeRebelMilitia(`${rebel.seat}`, 2);
        if (removed > 0) {
          totalRemoved += removed;
          game.message(`${removed} militia fled from ${sector.sectorName}`);
        }
      }
    }
  });

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
  // Pre-compute targets before animation
  const targets: Array<{
    rebelName: string;
    sectorId: string;
    sectorName: string;
    rebelMilitia: number;
    militiaSent: number;
    rebel: InstanceType<typeof game.rebelPlayers[0]>;
    sector: Sector;
  }> = [];

  for (const rebel of game.rebelPlayers) {
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
      targets.push({
        rebelName: rebel.name,
        sectorId: targetSector.sectorId,
        sectorName: targetSector.sectorName,
        rebelMilitia: maxMilitia,
        militiaSent: Math.ceil(maxMilitia / 2),
        rebel,
        sector: targetSector,
      });
    }
  }

  const combatsTriggered: string[] = [];

  game.animate('tactic-fodder', {
    cardName: 'Fodder',
    description: 'Sending militia to overwhelm rebel strongholds',
    targets: targets.map(t => ({
      sectorId: t.sectorId,
      sectorName: t.sectorName,
      rebelName: t.rebelName,
      militiaSent: t.militiaSent,
    })),
  }, () => {
    for (const target of targets) {
      const placed = target.sector.addDictatorMilitia(target.militiaSent);
      game.message(`Dictator sends ${placed} militia to attack ${target.rebelName} at ${target.sectorName}`);

      if (placed > 0) {
        combatsTriggered.push(target.sectorName);
        queuePendingCombat(game, target.sector, target.rebel, false);
      }
    }
  });

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

  game.animate('tactic-reinforcements', {
    cardName: 'Reinforcements',
    description: 'Palace guards reinforce every controlled industry',
    sectors: industries.map(s => ({
      sectorId: s.sectorId,
      sectorName: s.sectorName,
      militiaAdded: game.rebelCount,
    })),
  }, () => {
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
            queuePendingCombat(game, sector, rebel, false);
            break; // Only trigger combat once per sector
          }
        }
      }
    }
  });

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

  game.animate('tactic-seizure', {
    cardName: 'Seizure',
    description: 'Seizing wilderness sectors and garrisoning them with militia',
    sectors: sectorsToFlip.map(s => ({
      sectorId: s.sectorId,
      sectorName: s.sectorName,
      militiaAdded: militiaToAdd,
    })),
  }, () => {
    for (const sector of sectorsToFlip) {
      sector.explore();
      sectorsFlipped++;
      game.message(`Seizure: ${sector.sectorName} is now explored`);

      if (militiaToAdd > 0) {
        const placed = sector.addDictatorMilitia(militiaToAdd);
        totalMilitiaPlaced += placed;
        if (placed > 0) {
          game.message(`Seizure: ${placed} militia placed at ${sector.sectorName}`);
        }
      }
    }
  });

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

  // Pre-compute uncontrolled sectors
  const uncontrolledSectors: Sector[] = [];
  for (const sector of game.gameMap.getAllSectors()) {
    const dictatorControls = sector.dictatorMilitia > 0;
    const rebelControls = sector.getTotalRebelMilitia() > 0 ||
      game.rebelPlayers.some(r =>
        r.primarySquad.sectorId === sector.sectorId ||
        r.secondarySquad.sectorId === sector.sectorId
      );

    if (!dictatorControls && !rebelControls) {
      uncontrolledSectors.push(sector);
    }
  }

  let totalPlaced = 0;

  game.animate('tactic-sentry', {
    cardName: 'Sentry',
    description: 'Deploying militia sentries to uncontrolled sectors',
    sectors: uncontrolledSectors.map(s => ({
      sectorId: s.sectorId,
      sectorName: s.sectorName,
      militiaAdded: militiaToAdd,
    })),
  }, () => {
    for (const sector of uncontrolledSectors) {
      const placed = sector.addDictatorMilitia(militiaToAdd);
      totalPlaced += placed;
      if (placed > 0) {
        game.message(`Sentry: ${placed} militia placed at ${sector.sectorName}`);
      }
    }
  });

  return {
    success: true,
    message: `Sentry: ${totalPlaced} militia placed`,
    data: { totalPlaced },
  };
}

/**
 * Block Trade: Flip all cities to explored, add militia to each city
 * Per expansion CSV: "Flip all cities to explored. Add half rebel count (round up) militia to each city."
 */
function blockTrade(game: MERCGame): TacticsEffectResult {
  const allCities = game.gameMap.getAllSectors().filter(s => s.isCity);
  const unexploredCities = allCities.filter(s => !s.explored);
  const militiaPerCity = Math.ceil(game.rebelCount / 2);

  let totalPlaced = 0;
  const combatsTriggered: string[] = [];

  game.animate('tactic-block-trade', {
    cardName: 'Block Trade',
    description: 'Blocking rebel supply lines by occupying all cities',
    cities: allCities.map(c => ({
      sectorId: c.sectorId,
      sectorName: c.sectorName,
      wasUnexplored: !c.explored,
      militiaAdded: militiaPerCity,
    })),
  }, () => {
    // Step 1: Flip unexplored cities to explored
    for (const city of unexploredCities) {
      city.explore();
      game.message(`${city.sectorName} is now explored (trade blocked)`);
    }

    // Step 2: Place militia on ALL cities (not just flipped ones)
    for (const city of allCities) {
      const placed = city.addDictatorMilitia(militiaPerCity);
      totalPlaced += placed;
      if (placed > 0) {
        game.message(`${placed} militia placed at ${city.sectorName}`);

        // Check for combat with any rebel in this sector
        for (const rebel of game.rebelPlayers) {
          const hasSquad = rebel.primarySquad.sectorId === city.sectorId ||
            rebel.secondarySquad.sectorId === city.sectorId;
          const hasMilitia = city.getRebelMilitia(`${rebel.seat}`) > 0;

          if (hasSquad || hasMilitia) {
            game.message(`Rebels detected at ${city.sectorName} - combat begins!`);
            combatsTriggered.push(city.sectorName);
            queuePendingCombat(game, city, rebel, false);
            break; // Only trigger combat once per sector
          }
        }
      }
    }
  });

  return {
    success: true,
    message: `Block Trade: ${unexploredCities.length} cities explored, ${totalPlaced} militia placed`,
    data: { citiesExplored: unexploredCities.length, militiaPlaced: totalPlaced, combatsTriggered },
  };
}

/**
 * Conscripts: Permanent effect - add militia each turn
 * This sets a game flag that flow should check
 */
function conscripts(game: MERCGame): TacticsEffectResult {
  const amount = Math.ceil(game.rebelCount / 2);

  game.animate('tactic-conscripts', {
    cardName: 'Conscripts',
    description: `${amount} militia added to controlled sectors each turn`,
    amount,
  }, () => {
    game.conscriptsActive = true;
    game.conscriptsAmount = amount;
    game.message(`Conscripts activated: ${amount} militia will be added each turn`);
  });

  return {
    success: true,
    message: 'Conscripts permanent effect activated',
    data: { amount },
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
  // Reveal the base BEFORE animate (base reveal has its own state changes)
  const baseResult = revealBase(game);

  game.animate('tactic-veteran-militia', {
    cardName: 'Veteran Militia',
    description: 'Militia +1 initiative',
  }, () => {
    game.veteranMilitiaActive = true;
    game.message('Veteran Militia: Dictator militia now have +1 initiative');
  });

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
  // Reveal the base BEFORE animate (base reveal has its own state changes)
  const baseResult = revealBase(game);

  game.animate('tactic-better-weapons', {
    cardName: 'Better Weapons',
    description: 'Militia now hit on 3+',
  }, () => {
    game.betterWeaponsActive = true;
    game.message('Better Weapons: Dictator militia now hit on 3+');
  });

  return {
    success: baseResult.success,
    message: `${baseResult.message}. Militia hit on 3+`,
    data: { ...baseResult.data, militiaBonus: true },
  };
}

/**
 * Generalisimo: Reveals base AND draws 6 MERCs — dictator picks 1 to hire.
 * Per CSV: "Reveal base. Draw 6 MERCs, pick 1 to add to either squad."
 * AI auto-picks highest combat MERC. Human sets pending state for interactive flow.
 */
function generalisimo(game: MERCGame): TacticsEffectResult {
  // First reveal the base
  const baseResult = revealBase(game);

  // Draw 6 MERCs from the merc deck
  const drawnMercs: CombatantModel[] = [];
  for (let i = 0; i < 6; i++) {
    const m = game.drawMerc();
    if (m) drawnMercs.push(m);
  }

  if (drawnMercs.length === 0) {
    game.message('Generalissimo: No MERCs available to hire');
    return {
      success: baseResult.success,
      message: `${baseResult.message}. No MERCs available to hire`,
      data: { ...baseResult.data },
    };
  }

  // AI dictator: auto-pick the highest combat MERC
  if (game.dictatorPlayer.isAI) {
    const bestMerc = drawnMercs.reduce((best, current) =>
      current.baseCombat > best.baseCombat ? current : best
    );

    // Determine target squad and sector (same pattern as applyCastroTurnAbility)
    const primarySquad = game.dictatorPlayer.primarySquad;
    const secondarySquad = game.dictatorPlayer.secondarySquad;
    const primaryMercs = primarySquad.getLivingMercs();

    const targetSquad = primaryMercs.length < 3 ? primarySquad : secondarySquad;

    bestMerc.putInto(targetSquad);

    // Set squad location per AI rules
    const targetSector = selectNewMercLocation(game);
    if (targetSector && !targetSquad.sectorId) {
      targetSquad.sectorId = targetSector.sectorId;
    }

    // Update squad-based ability bonuses
    game.updateAllSargeBonuses();

    // Give equipment — prioritize weapon
    let equipType: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
    if (bestMerc.weaponSlot) {
      equipType = bestMerc.armorSlot ? 'Accessory' : 'Armor';
    }

    game.animate('tactic-generalissimo', {
      cardName: 'Generalissimo',
      description: `Hiring ${bestMerc.combatantName} as a new MERC`,
      mercHired: bestMerc.combatantName,
    }, () => {});

    equipNewHire(game, bestMerc, equipType);

    // Discard the rest
    for (const merc of drawnMercs) {
      if (merc !== bestMerc) {
        merc.putInto(game.mercDiscard);
      }
    }

    game.message(`Generalissimo: Hired ${bestMerc.combatantName} (chose from ${drawnMercs.length} MERCs)`);

    return {
      success: baseResult.success,
      message: `${baseResult.message}. Hired ${bestMerc.combatantName}`,
      data: { ...baseResult.data, mercHired: bestMerc.combatantName },
    };
  }

  // Human dictator: set pending state for interactive flow step
  game.pendingGeneralissimoHire = {
    drawnMercIds: drawnMercs.map(m => m.id),
  };

  game.message(`Generalissimo: ${drawnMercs.length} MERCs drawn — choose one to hire`);

  return {
    success: baseResult.success,
    message: `${baseResult.message}. Choose a MERC to hire`,
    data: { ...baseResult.data, pending: true, drawnCount: drawnMercs.length },
  };
}

/**
 * Lockdown: Reveals base AND places 5 * rebelCount militia on base or adjacent sectors.
 * Per CSV: "Reveal base. Get 5 extra militia per rebel player. Place them on base or adjacent sectors."
 * AI auto-distributes evenly; human sets pending state for interactive flow.
 */
function lockdown(game: MERCGame): TacticsEffectResult {
  // First reveal the base — must complete before computing adjacent sectors
  // because the base location may be set during revealBase
  const baseResult = revealBase(game);

  const totalMilitia = 5 * game.rebelCount;

  // Get base sector (must exist after revealBase)
  const baseSector = game.gameMap.getAllSectors().find(
    s => s.sectorId === game.dictatorPlayer.baseSectorId
  );
  if (!baseSector) {
    return {
      success: false,
      message: 'Lockdown failed: no base sector found after revealBase',
    };
  }

  // Build valid sectors: base + adjacent
  const adjacentSectors = game.getAdjacentSectors(baseSector);
  const validSectorIds = [baseSector.sectorId, ...adjacentSectors.map(s => s.sectorId)];

  // AI dictator: auto-distribute evenly across base + adjacent sectors
  if (game.dictatorPlayer.isAI) {
    const validSectors = [baseSector, ...adjacentSectors];
    const placedSectors: Array<{ sectorId: string; sectorName: string; militiaPlaced: number }> = [];
    let remaining = totalMilitia;

    // Distribute evenly, respecting 10-per-sector cap
    // Prioritize base sector first, then adjacent sectors
    while (remaining > 0) {
      let placedThisRound = 0;
      for (const sector of validSectors) {
        if (remaining <= 0) break;
        if (sector.dictatorMilitia >= 10) continue; // Respect 10 cap
        const room = 10 - sector.dictatorMilitia;
        const toPlace = Math.min(1, room, remaining);
        if (toPlace > 0) {
          sector.addDictatorMilitia(toPlace);
          remaining -= toPlace;
          placedThisRound += toPlace;

          // Track for animation data
          const existing = placedSectors.find(p => p.sectorId === sector.sectorId);
          if (existing) {
            existing.militiaPlaced += toPlace;
          } else {
            placedSectors.push({
              sectorId: sector.sectorId,
              sectorName: sector.sectorName,
              militiaPlaced: toPlace,
            });
          }
        }
      }
      // If no placement happened this round, all sectors are at cap
      if (placedThisRound === 0) break;
    }

    // Pure UI signal — mutations already done above
    game.animate('tactic-lockdown', {
      cardName: 'Lockdown',
      description: `Deploying ${totalMilitia} extra militia around the base`,
      totalMilitia,
      sectors: placedSectors,
    }, () => {});

    // Check each sector for rebel presence and queue combat
    for (const placed of placedSectors) {
      const sector = game.gameMap.getAllSectors().find(s => s.sectorId === placed.sectorId);
      if (!sector) continue;
      for (const rebel of game.rebelPlayers) {
        const hasSquad = rebel.primarySquad.sectorId === sector.sectorId ||
          rebel.secondarySquad.sectorId === sector.sectorId;
        const hasMilitia = sector.getRebelMilitia(`${rebel.seat}`) > 0;
        if (hasSquad || hasMilitia) {
          game.message(`Rebels detected at ${sector.sectorName} - combat begins!`);
          queuePendingCombat(game, sector, rebel, false);
          break; // Only trigger combat once per sector
        }
      }
    }

    game.message(`Lockdown: ${totalMilitia - remaining} militia placed across ${placedSectors.length} sectors`);

    return {
      success: baseResult.success,
      message: `${baseResult.message}. Placed ${totalMilitia - remaining} militia on base and adjacent sectors`,
      data: { ...baseResult.data, totalMilitia, placedSectors },
    };
  }

  // Human dictator: set pending state for interactive flow step
  game.pendingLockdownMilitia = { remaining: totalMilitia, validSectorIds };

  // Pure UI signal
  game.animate('tactic-lockdown', {
    cardName: 'Lockdown',
    description: `Place ${totalMilitia} extra militia around your base`,
    totalMilitia,
  }, () => {});

  game.message(`Lockdown: ${totalMilitia} militia to place on base or adjacent sectors`);

  return {
    success: baseResult.success,
    message: `${baseResult.message}. Place ${totalMilitia} militia on base or adjacent sectors`,
    data: { ...baseResult.data, totalMilitia, pending: true },
  };
}

/**
 * Oil Reserves: Permanent effect - free move for oil controller
 * This sets a game flag
 */
function oilReserves(game: MERCGame): TacticsEffectResult {
  game.animate('tactic-oil-reserves', {
    cardName: 'Oil Reserves',
    description: 'Oil controller gets free action each turn',
  }, () => {
    game.oilReservesActive = true;
    game.message('Oil Reserves activated: Controller of oil industry gains 1 free move action');
  });

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

  // Pre-compute affected sectors (those with rebel militia)
  const affectedSectors: Array<{ sectorId: string; sectorName: string; militiaToRemove: number }> = [];
  for (const sector of game.gameMap.getAllSectors()) {
    let sectorTotal = 0;
    for (const rebel of game.rebelPlayers) {
      sectorTotal += Math.min(amount, sector.getRebelMilitia(`${rebel.seat}`));
    }
    if (sectorTotal > 0) {
      affectedSectors.push({
        sectorId: sector.sectorId,
        sectorName: sector.sectorName,
        militiaToRemove: sectorTotal,
      });
    }
  }

  // Pre-compute affected MERCs
  const affectedMercs: Array<{ combatantId: string; combatantName: string }> = [];
  for (const rebel of game.rebelPlayers) {
    for (const merc of rebel.team) {
      affectedMercs.push({
        combatantId: merc.combatantId,
        combatantName: merc.combatantName,
      });
    }
  }

  let militiaRemoved = 0;
  let mercsDamaged = 0;

  game.animate('tactic-tainted-water', {
    cardName: 'Tainted Water',
    description: 'Poisoning the water supply — rebel militia removed, MERCs take 1 damage',
    sectors: affectedSectors,
    mercs: affectedMercs,
  }, () => {
    for (const sector of game.gameMap.getAllSectors()) {
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
  });

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
