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
    });
  }
  return combatants;
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
    // Unoccupied (no dictator forces)
    const hasDictatorForces = sector.dictatorMilitia > 0 ||
      (game.dictatorPlayer.baseRevealed &&
       game.dictatorPlayer.baseSectorId === sector.sectorId);

    if (!hasDictatorForces) {
      return true;
    }

    // Friendly (controlled by this player)
    const playerUnits = game.getRebelUnitsInSector(sector, player);
    const dictatorUnits = game.getDictatorUnitsInSector(sector);
    return playerUnits > dictatorUnits;
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
 * Returns actual damage dealt to health
 */
function applyDamage(target: Combatant, damage: number, game: MERCGame): number {
  let remainingDamage = damage;

  // Armor absorbs damage first
  if (target.armor > 0 && remainingDamage > 0) {
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

    // Roll dice
    const rolls = rollDice(attacker.combat);
    const hits = countHits(rolls);

    if (hits === 0) {
      results.push({
        attacker,
        rolls,
        hits: 0,
        targets: [],
        damageDealt: new Map(),
      });
      game.message(`${attacker.name} rolls [${rolls.join(', ')}] - no hits`);
      continue;
    }

    // Select targets
    const targets = selectTargets(attacker, enemies, attacker.targets);
    const damageDealt = new Map<string, number>();

    // Distribute hits among targets
    let remainingHits = hits;
    for (const target of targets) {
      if (remainingHits <= 0) break;

      const damage = applyDamage(target, remainingHits, game);
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

    results.push({
      attacker,
      rolls,
      hits,
      targets,
      damageDealt,
    });

    game.message(`${attacker.name} rolls [${rolls.join(', ')}] - ${hits} hit(s)`);
  }

  return { roundNumber, results, casualties };
}

/**
 * Apply combat results to actual game state
 * Handles coordinated attacks - updates all participating rebels' militia
 */
function applyCombatResults(
  game: MERCGame,
  sector: Sector,
  rebels: Combatant[],
  dictatorSide: Combatant[],
  attackingPlayer: RebelPlayer
): void {
  // Update MERC damage
  for (const combatant of [...rebels, ...dictatorSide]) {
    if (combatant.sourceElement instanceof MercCard) {
      const merc = combatant.sourceElement;
      const damageTaken = combatant.maxHealth - combatant.health;
      merc.damage = damageTaken;
    } else if (combatant.sourceElement instanceof DictatorCard) {
      const dictator = combatant.sourceElement;
      const damageTaken = combatant.maxHealth - combatant.health;
      dictator.damage = damageTaken;
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
 */
export function executeCombat(
  game: MERCGame,
  sector: Sector,
  attackingPlayer: RebelPlayer,
  maxRounds: number = 10
): CombatOutcome {
  game.message(`=== Combat at ${sector.sectorName} ===`);

  const { rebels, dictator } = getCombatants(game, sector, attackingPlayer);

  game.message(`Rebels: ${rebels.length} units`);
  game.message(`Dictator: ${dictator.length} units`);

  const rounds: CombatRound[] = [];
  const allRebelCasualties: Combatant[] = [];
  const allDictatorCasualties: Combatant[] = [];

  let retreatSector: Sector | undefined;
  let didRetreat = false;

  for (let round = 1; round <= maxRounds; round++) {
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

    // Per rules (07-combat-system.md): At end of each round, survivors may retreat
    // AI auto-retreat logic: retreat if severely outnumbered or low health
    const rebelMercs = aliveRebels.filter(c => !c.isMilitia);
    const totalRebelHealth = rebelMercs.reduce((sum, c) => sum + c.health, 0);
    const dictatorStrength = aliveDictator.reduce((sum, c) => sum + c.combat, 0);

    // Consider retreating if MERCs are at less than 50% health and outnumbered
    const shouldConsiderRetreat = totalRebelHealth < rebelMercs.length * 1.5 ||
      dictatorStrength > aliveRebels.reduce((sum, c) => sum + c.combat, 0) * 2;

    if (shouldConsiderRetreat && canRetreat(game, sector, attackingPlayer)) {
      const validRetreats = getValidRetreatSectors(game, sector, attackingPlayer);
      if (validRetreats.length > 0) {
        retreatSector = validRetreats[0];
        executeRetreat(game, sector, retreatSector, attackingPlayer);
        didRetreat = true;
        game.message(`Rebels retreat from ${sector.sectorName}!`);
        break;
      }
    }
  }

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
  };

  if (outcome.rebelVictory) {
    game.message(`Rebels are victorious at ${sector.sectorName}!`);
  } else if (outcome.dictatorVictory) {
    game.message(`Dictator forces hold ${sector.sectorName}!`);
  } else if (outcome.retreated) {
    game.message(`Rebels have retreated to ${retreatSector?.sectorName}!`);
  } else {
    game.message(`Combat continues at ${sector.sectorName}...`);
  }

  game.message(`=== Combat Complete ===`);

  return outcome;
}

/**
 * Check if a sector has enemies to fight
 */
export function hasEnemies(game: MERCGame, sector: Sector, player: RebelPlayer): boolean {
  return sector.dictatorMilitia > 0 ||
    (game.dictatorPlayer.baseRevealed &&
     game.dictatorPlayer.baseSectorId === sector.sectorId &&
     !game.dictatorPlayer.dictator?.isDead);
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
