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
// Combat Execution
// =============================================================================

/**
 * Get all combatants for a sector
 */
export function getCombatants(
  game: MERCGame,
  sector: Sector,
  attackingPlayer: RebelPlayer
): { rebels: Combatant[]; dictator: Combatant[] } {
  const rebels: Combatant[] = [];
  const dictator: Combatant[] = [];

  // Add attacking rebel's MERCs
  const attackingMercs = game.getMercsInSector(sector, attackingPlayer);
  for (const merc of attackingMercs) {
    if (!merc.isDead) {
      rebels.push(mercToCombatant(merc, false));
    }
  }

  // Add attacking rebel's militia
  const rebelMilitia = sector.getRebelMilitia(`${attackingPlayer.position}`);
  rebels.push(...militiaToCombatants(rebelMilitia, false, `${attackingPlayer.position}`));

  // Add dictator's militia
  dictator.push(...militiaToCombatants(sector.dictatorMilitia, true));

  // Add dictator's MERC if present and base is revealed
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
 * Returns actual damage dealt to health
 */
function applyDamage(target: Combatant, damage: number): number {
  // Armor absorbs damage first
  let remainingDamage = damage;

  if (target.armor > 0 && remainingDamage > 0) {
    const armorAbsorbed = Math.min(target.armor, remainingDamage);
    remainingDamage -= armorAbsorbed;
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

      const damage = applyDamage(target, remainingHits);
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

  // Update militia counts
  const survivingDictatorMilitia = dictatorSide.filter(c => c.isMilitia && c.health > 0).length;
  sector.dictatorMilitia = survivingDictatorMilitia;

  const survivingRebelMilitia = rebels.filter(
    c => c.isMilitia && c.health > 0 && c.ownerId === `${attackingPlayer.position}`
  ).length;
  sector.rebelMilitia.set(`${attackingPlayer.position}`, survivingRebelMilitia);
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
  }

  // Apply results to game state
  applyCombatResults(game, sector, rebels, dictator, attackingPlayer);

  const aliveRebels = rebels.filter(c => c.health > 0);
  const aliveDictator = dictator.filter(c => c.health > 0);

  const outcome: CombatOutcome = {
    rounds,
    rebelVictory: aliveDictator.length === 0,
    dictatorVictory: aliveRebels.length === 0,
    rebelCasualties: allRebelCasualties,
    dictatorCasualties: allDictatorCasualties,
    retreated: false,
  };

  if (outcome.rebelVictory) {
    game.message(`Rebels are victorious at ${sector.sectorName}!`);
  } else if (outcome.dictatorVictory) {
    game.message(`Dictator forces hold ${sector.sectorName}!`);
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
