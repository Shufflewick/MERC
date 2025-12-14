/**
 * MERC Combat System
 *
 * Based on: data/rules/01-game-elements-and-components.md
 *
 * Combat follows these steps:
 * 1. Determine combatants (MERCs + militia on each side)
 * 2. Sort by initiative (highest first, Dictator wins ties)
 * 3. Each unit attacks in initiative order
 * 4. Roll dice equal to Combat stat, 4+ is a hit
 * 5. Assign hits to targets (up to Targets attribute)
 * 6. Apply damage (armor absorbs first, then health)
 * 7. Remove dead units
 * 8. Check for retreat opportunities
 */

import type { MERCGame, RebelPlayer, DictatorPlayer } from './game.js';
import { MercCard, Sector, DictatorCard, Militia } from './elements.js';
import { CombatConstants, TieBreakers } from './constants.js';

// =============================================================================
// Combat Types
// =============================================================================

export interface Combatant {
  id: string;
  name: string;
  initiative: number;
  combat: number;
  health: number;
  maxHealth: number;
  armor: number;
  targets: number;
  isDictatorSide: boolean;
  isMilitia: boolean;
  isDictator: boolean;
  sourceElement: MercCard | DictatorCard | null;
  ownerId?: string; // For rebel militia
  armorPiercing: boolean; // MERC-38e: Weapon ignores armor
  hasOneUseWeapon: boolean; // MERC-f0y: Weapon is one-use
}

export interface CombatResult {
  attacker: Combatant;
  rolls: number[];
  hits: number;
  targets: Combatant[];
  damageDealt: Map<string, number>;
}

export interface CombatRound {
  roundNumber: number;
  results: CombatResult[];
  casualties: Combatant[];
}

export interface CombatOutcome {
  rounds: CombatRound[];
  rebelVictory: boolean;
  dictatorVictory: boolean;
  rebelCasualties: Combatant[];
  dictatorCasualties: Combatant[];
  retreated: boolean;
  retreatSector?: Sector;
  // MERC-n1f: Interactive combat support
  combatPending: boolean; // True if combat paused for retreat decision
  canRetreat: boolean; // True if retreat is available
}

// =============================================================================
// Combat Helpers
// =============================================================================

/**
 * Roll a single d6
 */
function rollDie(): number {
  return Math.floor(Math.random() * CombatConstants.DICE_SIDES) + 1;
}

/**
 * Roll multiple dice
 */
function rollDice(count: number): number[] {
  return Array.from({ length: count }, () => rollDie());
}

/**
 * Count hits from dice rolls (4+ is a hit)
 */
function countHits(rolls: number[]): number {
  return rolls.filter(r => r >= CombatConstants.HIT_THRESHOLD).length;
}

/**
 * Sort combatants by initiative (highest first)
 * Dictator wins ties
 */
function sortByInitiative(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => {
    if (b.initiative !== a.initiative) {
      return b.initiative - a.initiative;
    }
    // Tie: Dictator side wins
    if (a.isDictatorSide !== b.isDictatorSide) {
      return a.isDictatorSide ? -1 : 1;
    }
    return 0;
  });
}

// =============================================================================
// Combatant Building
// =============================================================================

/**
 * Build combatant from a MERC card
 * MERC-38e: Includes armorPiercing from weapon
 * MERC-f0y: Includes hasOneUseWeapon flag
 */
function mercToCombatant(merc: MercCard, isDictatorSide: boolean): Combatant {
  return {
    id: String(merc.id),
    name: merc.mercName,
    initiative: merc.initiative,
    combat: merc.combat,
    health: merc.health,
    maxHealth: merc.maxHealth,
    armor: merc.equipmentArmor,
    targets: merc.targets,
    isDictatorSide,
    isMilitia: false,
    isDictator: false,
    sourceElement: merc,
    armorPiercing: merc.weaponSlot?.negatesArmor ?? false, // MERC-38e
    hasOneUseWeapon: merc.weaponSlot?.isOneUse ?? false, // MERC-f0y
  };
}

/**
 * Build combatant from the Dictator card
 */
function dictatorToCombatant(dictator: DictatorCard): Combatant {
  return {
    id: String(dictator.id),
    name: dictator.dictatorName,
    initiative: dictator.initiative,
    combat: dictator.combat,
    health: dictator.health,
    maxHealth: dictator.maxHealth,
    armor: 0, // Dictator armor from equipment if any
    targets: 1,
    isDictatorSide: true,
    isMilitia: false,
    isDictator: true,
    sourceElement: dictator,
    armorPiercing: false,
    hasOneUseWeapon: false,
  };
}

/**
 * Build combatants for militia
 */
function militiaToCombatants(
  count: number,
  isDictatorSide: boolean,
  ownerId?: string
): Combatant[] {
  const combatants: Combatant[] = [];
  for (let i = 0; i < count; i++) {
    combatants.push({
      id: `militia-${isDictatorSide ? 'dictator' : ownerId}-${i}`,
      name: isDictatorSide ? 'Dictator Militia' : 'Rebel Militia',
      initiative: CombatConstants.MILITIA_INITIATIVE,
      combat: CombatConstants.MILITIA_COMBAT,
      health: CombatConstants.MILITIA_HEALTH,
      maxHealth: CombatConstants.MILITIA_HEALTH,
      armor: CombatConstants.MILITIA_ARMOR,
      targets: CombatConstants.MILITIA_TARGETS,
      isDictatorSide,
      isMilitia: true,
      isDictator: false,
      sourceElement: null,
      ownerId,
      armorPiercing: false,
      hasOneUseWeapon: false,
    });
  }
  return combatants;
}

/**
 * MERC-54m: Refresh combatant stats from source element
 * Called between rounds to update stats after equipment changes (lost armor, consumed weapons)
 */
function refreshCombatantStats(combatant: Combatant): void {
  if (combatant.isMilitia) {
    // Militia stats don't change
    return;
  }

  if (combatant.sourceElement instanceof MercCard) {
    const merc = combatant.sourceElement;
    // Refresh stats that can change with equipment
    combatant.initiative = merc.initiative;
    combatant.combat = merc.combat;
    combatant.targets = merc.targets;
    combatant.armor = merc.equipmentArmor;
    combatant.armorPiercing = merc.weaponSlot?.negatesArmor ?? false;
    combatant.hasOneUseWeapon = merc.weaponSlot?.isOneUse ?? false;
  } else if (combatant.sourceElement instanceof DictatorCard) {
    const dictator = combatant.sourceElement;
    combatant.initiative = dictator.initiative;
    combatant.combat = dictator.combat;
    // Dictator targets and armor could be updated here if they get equipment
  }
}

// =============================================================================
// Retreat Mechanics
// =============================================================================

/**
 * Get valid retreat sectors for a player.
 * Per rules (07-combat-system.md): Adjacent sector that is unoccupied or friendly.
 */
export function getValidRetreatSectors(
  game: MERCGame,
  currentSector: Sector,
  player: RebelPlayer
): Sector[] {
  const adjacentSectors = game.getAdjacentSectors(currentSector);

  return adjacentSectors.filter(sector => {
    // MERC-4bp: Check for ALL dictator forces (militia, MERCs, and dictator card)
    const hasDictatorForces = sector.dictatorMilitia > 0 ||
      game.getDictatorMercsInSector(sector).length > 0 ||
      (game.dictatorPlayer.baseRevealed &&
       game.dictatorPlayer.baseSectorId === sector.sectorId);

    if (!hasDictatorForces) {
      return true;
    }

    // MERC-kpv: Friendly = controlled by this player OR any allied rebel
    // Per rules: retreat valid to sector "controlled by you or ally"
    const dictatorUnits = game.getDictatorUnitsInSector(sector);

    // Check if current player controls
    const playerUnits = game.getRebelUnitsInSector(sector, player);
    if (playerUnits > dictatorUnits) {
      return true;
    }

    // Check if any allied rebel controls (total rebel units > dictator)
    const totalRebelUnits = game.getTotalRebelUnitsInSector(sector);
    return totalRebelUnits > dictatorUnits;
  });
}

/**
 * Check if retreat is possible for a player.
 */
export function canRetreat(
  game: MERCGame,
  sector: Sector,
  player: RebelPlayer
): boolean {
  return getValidRetreatSectors(game, sector, player).length > 0;
}

/**
 * Execute retreat for a player's squad.
 * Per rules: Entire squad must retreat together. Militia cannot retreat.
 */
export function executeRetreat(
  game: MERCGame,
  fromSector: Sector,
  toSector: Sector,
  player: RebelPlayer
): void {
  // Move primary squad if it's in the combat sector
  if (player.primarySquad.sectorId === fromSector.sectorId) {
    player.primarySquad.sectorId = toSector.sectorId;
    game.message(`${player.name}'s primary squad retreats to ${toSector.sectorName}`);
  }

  // Move secondary squad if it's in the combat sector
  if (player.secondarySquad.sectorId === fromSector.sectorId) {
    player.secondarySquad.sectorId = toSector.sectorId;
    game.message(`${player.name}'s secondary squad retreats to ${toSector.sectorName}`);
  }

  // Note: Militia do NOT retreat (per rules: "Militia cannot retreat")
}

// =============================================================================
// Combat Execution
// =============================================================================

/**
 * Get all combatants for a sector
 * Per rules (06-merc-actions.md lines 195-218): Coordinated attacks allow
 * multiple squads from same or different rebels to attack together.
 * All rebel forces in the sector participate in combat.
 */
export function getCombatants(
  game: MERCGame,
  sector: Sector,
  attackingPlayer: RebelPlayer
): { rebels: Combatant[]; dictator: Combatant[] } {
  const rebels: Combatant[] = [];
  const dictator: Combatant[] = [];

  // Add ALL rebel MERCs in the sector (coordinated attacks)
  for (const rebel of game.rebelPlayers) {
    const rebelMercs = game.getMercsInSector(sector, rebel);
    for (const merc of rebelMercs) {
      if (!merc.isDead) {
        rebels.push(mercToCombatant(merc, false));
      }
    }

    // Add this rebel's militia
    const rebelMilitia = sector.getRebelMilitia(`${rebel.position}`);
    rebels.push(...militiaToCombatants(rebelMilitia, false, `${rebel.position}`));
  }

  // Add dictator's militia
  dictator.push(...militiaToCombatants(sector.dictatorMilitia, true));

  // Add dictator's MERCs if present at this sector
  const dictatorMercs = game.getDictatorMercsInSector(sector);
  for (const merc of dictatorMercs) {
    dictator.push(mercToCombatant(merc, true));
  }

  // Add dictator card if base is revealed and at this sector
  if (game.dictatorPlayer.baseRevealed && game.dictatorPlayer.baseSectorId === sector.sectorId) {
    const dictatorCard = game.dictatorPlayer.dictator;
    if (dictatorCard && !dictatorCard.isDead) {
      dictator.push(dictatorToCombatant(dictatorCard));
    }
  }

  return { rebels, dictator };
}

/**
 * Check if dictator can be targeted (only if no other dictator units remain)
 */
function canTargetDictator(dictatorSide: Combatant[]): boolean {
  const nonDictatorUnits = dictatorSide.filter(c => !c.isDictator && c.health > 0);
  return nonDictatorUnits.length === 0;
}

/**
 * Select targets for an attacker
 */
function selectTargets(
  attacker: Combatant,
  enemies: Combatant[],
  maxTargets: number
): Combatant[] {
  const aliveEnemies = enemies.filter(e => e.health > 0);

  // If attacker is rebel and dictator is present, check protection rule
  if (!attacker.isDictatorSide) {
    const canHitDictator = canTargetDictator(aliveEnemies);
    const validTargets = canHitDictator
      ? aliveEnemies
      : aliveEnemies.filter(e => !e.isDictator);

    return validTargets.slice(0, maxTargets);
  }

  return aliveEnemies.slice(0, maxTargets);
}

/**
 * Apply damage to a combatant
 * Per rules (07-combat-system.md): Damage hits armor before health.
 * When armor reaches 0, the armor equipment is destroyed.
 * MERC-38e: Armor Piercing weapons ignore armor entirely.
 * Returns actual damage dealt to health
 */
function applyDamage(target: Combatant, damage: number, game: MERCGame, armorPiercing: boolean = false): number {
  let remainingDamage = damage;

  // MERC-38e: Armor Piercing weapons skip armor entirely
  if (!armorPiercing && target.armor > 0 && remainingDamage > 0) {
    const armorAbsorbed = Math.min(target.armor, remainingDamage);
    target.armor -= armorAbsorbed;
    remainingDamage -= armorAbsorbed;

    // If armor is destroyed, mark the equipment as damaged/destroyed
    if (target.armor <= 0 && target.sourceElement instanceof MercCard) {
      const merc = target.sourceElement;
      if (merc.armorSlot) {
        merc.armorSlot.isDamaged = true;
        game.message(`${merc.mercName}'s ${merc.armorSlot.equipmentName} is destroyed!`);
        // Discard the armor
        const armor = merc.unequip('Armor');
        if (armor) {
          const discard = game.getEquipmentDiscard('Armor');
          if (discard) armor.putInto(discard);
        }
      }
    }
  } else if (armorPiercing && target.armor > 0) {
    game.message(`Armor piercing attack ignores ${target.name}'s armor!`);
  }

  // Apply remaining damage to health
  const healthDamage = Math.min(remainingDamage, target.health);
  target.health -= healthDamage;

  return healthDamage;
}

/**
 * Execute a single combat round
 */
function executeCombatRound(
  roundNumber: number,
  rebels: Combatant[],
  dictatorSide: Combatant[],
  game: MERCGame
): CombatRound {
  // MERC-54m: Refresh all combatant stats at start of round
  // This updates initiative/combat/targets after equipment changes in previous rounds
  for (const combatant of [...rebels, ...dictatorSide]) {
    if (combatant.health > 0) {
      refreshCombatantStats(combatant);
    }
  }

  const allCombatants = sortByInitiative([...rebels, ...dictatorSide]);
  const results: CombatResult[] = [];
  const casualties: Combatant[] = [];

  for (const attacker of allCombatants) {
    // Skip dead combatants
    if (attacker.health <= 0) continue;

    // Determine enemies
    const enemies = attacker.isDictatorSide ? rebels : dictatorSide;
    const aliveEnemies = enemies.filter(e => e.health > 0);

    if (aliveEnemies.length === 0) continue;

    // MERC-pd5: Select targets BEFORE rolling dice (per rules)
    const targets = selectTargets(attacker, enemies, attacker.targets);
    const targetNames = targets.map(t => t.name).join(', ');
    game.message(`${attacker.name} declares targets: ${targetNames}`);

    // Roll dice
    const rolls = rollDice(attacker.combat);
    const hits = countHits(rolls);
    game.message(`${attacker.name} rolls [${rolls.join(', ')}] - ${hits} hit(s)`);

    if (hits === 0) {
      results.push({
        attacker,
        rolls,
        hits: 0,
        targets: [],
        damageDealt: new Map(),
      });
      continue;
    }

    const damageDealt = new Map<string, number>();

    // Distribute hits among targets
    let remainingHits = hits;
    for (const target of targets) {
      if (remainingHits <= 0) break;

      // MERC-38e: Pass armorPiercing flag to applyDamage
      const damage = applyDamage(target, remainingHits, game, attacker.armorPiercing);
      damageDealt.set(target.id, damage);

      if (target.health <= 0) {
        casualties.push(target);
        game.message(`${attacker.name} kills ${target.name}!`);
      } else {
        game.message(`${attacker.name} hits ${target.name} for ${damage} damage`);
      }

      // Militia die in one hit, MERCs can take multiple
      if (target.isMilitia) {
        remainingHits--;
      } else {
        remainingHits -= damage;
      }
    }

    // MERC-f0y: Consume one-use weapon after attack
    if (attacker.hasOneUseWeapon && attacker.sourceElement instanceof MercCard) {
      const merc = attacker.sourceElement;
      if (merc.weaponSlot?.isOneUse) {
        game.message(`${merc.mercName}'s ${merc.weaponSlot.equipmentName} is used up!`);
        const weapon = merc.unequip('Weapon');
        if (weapon) {
          const discard = game.getEquipmentDiscard('Weapon');
          if (discard) weapon.putInto(discard);
        }
        // Mark combatant as no longer having one-use weapon for subsequent rounds
        attacker.hasOneUseWeapon = false;
        attacker.armorPiercing = false; // One-use weapons lose their effects
      }
    }

    results.push({
      attacker,
      rolls,
      hits,
      targets,
      damageDealt,
    });
  }

  return { roundNumber, results, casualties };
}

/**
 * Apply combat results to actual game state
 * Handles coordinated attacks - updates all participating rebels' militia
 * MERC-4ib: Handles MERC death by discarding card and equipment
 */
function applyCombatResults(
  game: MERCGame,
  sector: Sector,
  rebels: Combatant[],
  dictatorSide: Combatant[],
  attackingPlayer: RebelPlayer
): void {
  // Update MERC damage and handle deaths
  for (const combatant of [...rebels, ...dictatorSide]) {
    if (combatant.sourceElement instanceof MercCard) {
      const merc = combatant.sourceElement;
      const damageTaken = combatant.maxHealth - combatant.health;
      merc.damage = damageTaken;

      // MERC-4ib: Handle MERC death - discard card and equipment
      if (combatant.health <= 0) {
        merc.isDead = true;

        // Discard all equipment
        const equipmentTypes: Array<'Weapon' | 'Armor' | 'Accessory'> = ['Weapon', 'Armor', 'Accessory'];
        for (const eqType of equipmentTypes) {
          const equipment = merc.unequip(eqType);
          if (equipment) {
            const discard = game.getEquipmentDiscard(eqType);
            if (discard) equipment.putInto(discard);
          }
        }

        // Remove from owner's team and put in discard
        if (combatant.isDictatorSide) {
          // Remove from dictator's hired MERCs
          const idx = game.dictatorPlayer.hiredMercs.indexOf(merc);
          if (idx >= 0) {
            game.dictatorPlayer.hiredMercs.splice(idx, 1);
          }
        } else {
          // Remove from rebel's team
          for (const rebel of game.rebelPlayers) {
            const idx = rebel.team.indexOf(merc);
            if (idx >= 0) {
              rebel.team.splice(idx, 1);
              break;
            }
          }
        }

        // Put MERC card in discard pile
        merc.putInto(game.mercDiscard);
        game.message(`${merc.mercName} has been killed in combat!`);
      }
    } else if (combatant.sourceElement instanceof DictatorCard) {
      const dictator = combatant.sourceElement;
      const damageTaken = combatant.maxHealth - combatant.health;
      dictator.damage = damageTaken;

      // Handle dictator death
      if (combatant.health <= 0) {
        dictator.isDead = true;
        game.message(`THE DICTATOR HAS BEEN KILLED! REBELS WIN!`);
      }
    }
  }

  // Update dictator militia count
  const survivingDictatorMilitia = dictatorSide.filter(c => c.isMilitia && c.health > 0).length;
  sector.dictatorMilitia = survivingDictatorMilitia;

  // Update militia for ALL rebel players who had militia in combat (coordinated attacks)
  for (const rebel of game.rebelPlayers) {
    const playerId = `${rebel.position}`;
    const survivingMilitia = rebels.filter(
      c => c.isMilitia && c.health > 0 && c.ownerId === playerId
    ).length;
    sector.rebelMilitia.set(playerId, survivingMilitia);
  }
}

/**
 * Execute full combat in a sector
 * MERC-n1f: Supports interactive mode where combat pauses after each round for retreat decision
 */
export function executeCombat(
  game: MERCGame,
  sector: Sector,
  attackingPlayer: RebelPlayer,
  options: { maxRounds?: number; interactive?: boolean } = {}
): CombatOutcome {
  const { maxRounds = 10, interactive = true } = options;

  // Check if resuming from paused combat
  const isResuming = game.activeCombat !== null && game.activeCombat.sectorId === sector.sectorId;

  let rebels: Combatant[];
  let dictator: Combatant[];
  let rounds: CombatRound[];
  let allRebelCasualties: Combatant[];
  let allDictatorCasualties: Combatant[];
  let startRound: number;

  if (isResuming && game.activeCombat) {
    // Resume from saved state
    rebels = game.activeCombat.rebelCombatants as Combatant[];
    dictator = game.activeCombat.dictatorCombatants as Combatant[];
    rounds = [];
    allRebelCasualties = game.activeCombat.rebelCasualties as Combatant[];
    allDictatorCasualties = game.activeCombat.dictatorCasualties as Combatant[];
    startRound = game.activeCombat.round + 1;
    game.message(`--- Combat continues at ${sector.sectorName} ---`);
  } else {
    // Start new combat
    game.message(`=== Combat at ${sector.sectorName} ===`);
    const combatants = getCombatants(game, sector, attackingPlayer);
    rebels = combatants.rebels;
    dictator = combatants.dictator;
    rounds = [];
    allRebelCasualties = [];
    allDictatorCasualties = [];
    startRound = 1;

    game.message(`Rebels: ${rebels.length} units`);
    game.message(`Dictator: ${dictator.length} units`);
  }

  let retreatSector: Sector | undefined;
  let didRetreat = false;
  let combatPending = false;
  let retreatAvailable = false;

  for (let round = startRound; round <= maxRounds; round++) {
    game.message(`--- Round ${round} ---`);

    const roundResult = executeCombatRound(round, rebels, dictator, game);
    rounds.push(roundResult);

    // Track casualties
    for (const casualty of roundResult.casualties) {
      if (casualty.isDictatorSide) {
        allDictatorCasualties.push(casualty);
      } else {
        allRebelCasualties.push(casualty);
      }
    }

    // Check for combat end
    const aliveRebels = rebels.filter(c => c.health > 0);
    const aliveDictator = dictator.filter(c => c.health > 0);

    if (aliveRebels.length === 0 || aliveDictator.length === 0) {
      break;
    }

    // MERC-n1f: Check if retreat is possible and pause for player decision
    retreatAvailable = canRetreat(game, sector, attackingPlayer);
    if (interactive && retreatAvailable) {
      // Save combat state and pause for player decision
      game.activeCombat = {
        sectorId: sector.sectorId,
        attackingPlayerId: `${attackingPlayer.position}`,
        round,
        rebelCombatants: rebels,
        dictatorCombatants: dictator,
        rebelCasualties: allRebelCasualties,
        dictatorCasualties: allDictatorCasualties,
      };
      combatPending = true;
      game.message(`Round ${round} complete. You may retreat or continue fighting.`);
      break;
    }
  }

  // If combat is pending, don't apply final results yet
  if (combatPending) {
    return {
      rounds,
      rebelVictory: false,
      dictatorVictory: false,
      rebelCasualties: allRebelCasualties,
      dictatorCasualties: allDictatorCasualties,
      retreated: false,
      combatPending: true,
      canRetreat: retreatAvailable,
    };
  }

  // Clear any saved combat state
  game.activeCombat = null;

  // Apply results to game state
  applyCombatResults(game, sector, rebels, dictator, attackingPlayer);

  const aliveRebels = rebels.filter(c => c.health > 0);
  const aliveDictator = dictator.filter(c => c.health > 0);

  const outcome: CombatOutcome = {
    rounds,
    rebelVictory: aliveDictator.length === 0 && !didRetreat,
    dictatorVictory: aliveRebels.length === 0,
    rebelCasualties: allRebelCasualties,
    dictatorCasualties: allDictatorCasualties,
    retreated: didRetreat,
    retreatSector: retreatSector,
    combatPending: false,
    canRetreat: false,
  };

  if (outcome.rebelVictory) {
    game.message(`Rebels are victorious at ${sector.sectorName}!`);
  } else if (outcome.dictatorVictory) {
    game.message(`Dictator forces hold ${sector.sectorName}!`);
  } else if (outcome.retreated) {
    game.message(`Rebels have retreated to ${retreatSector?.sectorName}!`);
  }

  game.message(`=== Combat Complete ===`);

  return outcome;
}

/**
 * MERC-n1f: Execute retreat for active combat
 */
export function executeCombatRetreat(
  game: MERCGame,
  retreatSector: Sector
): CombatOutcome {
  if (!game.activeCombat) {
    throw new Error('No active combat to retreat from');
  }

  const combatSector = game.getSector(game.activeCombat.sectorId);
  if (!combatSector) {
    throw new Error('Combat sector not found');
  }

  const attackingPlayer = game.rebelPlayers.find(
    p => `${p.position}` === game.activeCombat!.attackingPlayerId
  );
  if (!attackingPlayer) {
    throw new Error('Attacking player not found');
  }

  // Execute the retreat
  executeRetreat(game, combatSector, retreatSector, attackingPlayer);

  // Apply combat results (casualties, etc.)
  const rebels = game.activeCombat.rebelCombatants as Combatant[];
  const dictator = game.activeCombat.dictatorCombatants as Combatant[];
  applyCombatResults(game, combatSector, rebels, dictator, attackingPlayer);

  // Clear combat state
  const rebelCasualties = game.activeCombat.rebelCasualties as Combatant[];
  const dictatorCasualties = game.activeCombat.dictatorCasualties as Combatant[];
  game.activeCombat = null;

  game.message(`=== Combat Complete (Retreated) ===`);

  return {
    rounds: [],
    rebelVictory: false,
    dictatorVictory: false,
    rebelCasualties,
    dictatorCasualties,
    retreated: true,
    retreatSector,
    combatPending: false,
    canRetreat: false,
  };
}

/**
 * Check if a sector has enemies to fight
 * MERC-7un: Also checks for dictator hired MERCs, not just militia and dictator card
 */
export function hasEnemies(game: MERCGame, sector: Sector, player: RebelPlayer): boolean {
  // Check for dictator militia
  if (sector.dictatorMilitia > 0) return true;

  // MERC-7un: Check for dictator hired MERCs
  const dictatorMercs = game.getDictatorMercsInSector(sector);
  if (dictatorMercs.length > 0) return true;

  // Check for dictator card at revealed base
  if (game.dictatorPlayer.baseRevealed &&
      game.dictatorPlayer.baseSectorId === sector.sectorId &&
      !game.dictatorPlayer.dictator?.isDead) {
    return true;
  }

  return false;
}

/**
 * Calculate expected combat advantage (for AI)
 */
export function calculateCombatOdds(
  game: MERCGame,
  sector: Sector,
  player: RebelPlayer
): { rebelStrength: number; dictatorStrength: number; advantage: number } {
  const { rebels, dictator } = getCombatants(game, sector, player);

  const rebelStrength = rebels.reduce((sum, c) => sum + c.combat * c.health, 0);
  const dictatorStrength = dictator.reduce((sum, c) => sum + c.combat * c.health, 0);

  return {
    rebelStrength,
    dictatorStrength,
    advantage: rebelStrength - dictatorStrength,
  };
}
