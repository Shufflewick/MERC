/**
 * MERC Game Initial Setup
 *
 * Based on: data/rules/03-initial-setup.md
 *
 * Handles pre-game state initialization before Day 1 begins.
 */

import type { MERCGame } from './game.js';
import {
  Sector,
  CombatantModel,
  TacticsCard,
  TacticsDeck,
  TacticsHand,
  DiscardPile,
  type SectorType,
} from './elements.js';
import { DictatorConstants } from './constants.js';
// Debug config: test-only feature to force deterministic tactics card order
import { DEBUG_TACTICS_ORDER } from './debug-config.js';

// =============================================================================
// Data Interfaces (matching JSON files)
// =============================================================================

export interface SectorData {
  id: string;
  name: string;
  quantity: number;
  type: SectorType;
  value: number;
  weapons: number;
  armor: number;
  accessories: number;
  image: string;
}

// DictatorData matches CombatantData from game.ts, filtered to cardType === 'dictator'
export interface DictatorData {
  id: string;
  cardType: 'merc' | 'dictator';
  name: string;
  quantity: number;
  training: number;
  combat: number;
  initiative: number;
  ability: string;
  bio: string;
  image: string;
  sex?: string;  // Optional field from CombatantData (not used by dictators)
}

export interface TacticsData {
  id: string;
  name: string;
  quantity: number;
  story: string;
  description: string;
  revealsBase?: boolean;
}

// =============================================================================
// Map Building
// =============================================================================

/**
 * Determines if a position is on the checkerboard pattern.
 * Checkerboard positions are where (row + col) % 2 === 0.
 * Industries are always placed on checkerboard positions to ensure
 * no two industries are orthogonally adjacent.
 */
export function isCheckerboardPosition(row: number, col: number): boolean {
  return (row + col) % 2 === 0;
}

/**
 * @deprecated Use isCheckerboardPosition instead. Kept for backwards compatibility.
 */
export function isIndustryPosition(row: number, col: number): boolean {
  return isCheckerboardPosition(row, col);
}

/**
 * Shuffle an array in place using Fisher-Yates algorithm
 * @param random - Seeded random function from game.random()
 */
function shuffleArray<T>(array: T[], random: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Select random items from an array
 * @param random - Seeded random function from game.random()
 */
function selectRandom<T>(array: T[], count: number, random: () => number): T[] {
  const shuffled = shuffleArray(array, random);
  return shuffled.slice(0, count);
}

/**
 * Build the game map with sectors placed in checkerboard pattern.
 *
 * Layout rules (all player counts, no special cases):
 * 1. Industries → ALWAYS on checkerboard positions (strict requirement)
 * 2. Cities → Prefer checkerboard, overflow to non-checkerboard if needed
 * 3. Wilderness → Fill all remaining non-checkerboard positions
 *
 * This ensures no two industries are ever orthogonally adjacent.
 *
 * @param game - The game instance
 * @param sectorData - Array of sector data from JSON
 */
export function buildMap(game: MERCGame, sectorData: SectorData[]): void {
  const config = game.setupConfig;
  if (!config) {
    throw new Error('Setup configuration not loaded');
  }

  const [cols, rows] = config.mapSize;
  game.gameMap.rows = rows;
  game.gameMap.cols = cols;
  game.gameMap.updateLabels();

  // Separate sectors by type
  const industries = sectorData.filter(s => s.type === 'Industry');
  const cities = sectorData.filter(s => s.type === 'City');
  const wilderness = sectorData.filter(s => s.type === 'Wilderness');

  // Select the required number of each type
  const selectedIndustries = selectRandom(industries, config.sectorTypes.industries, game.random);
  const selectedCities = selectRandom(cities, config.sectorTypes.cities, game.random);
  const selectedWilderness = selectRandom(wilderness, config.sectorTypes.wilderness, game.random);

  // Categorize ALL positions by checkerboard pattern
  const checkerboardPositions: Array<{row: number; col: number}> = [];
  const nonCheckerboardPositions: Array<{row: number; col: number}> = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (isCheckerboardPosition(row, col)) {
        checkerboardPositions.push({ row, col });
      } else {
        nonCheckerboardPositions.push({ row, col });
      }
    }
  }

  // Shuffle both arrays for variety
  const shuffledCheckerboard = shuffleArray(checkerboardPositions, game.random);
  const shuffledNonCheckerboard = shuffleArray(nonCheckerboardPositions, game.random);

  // Place sectors in priority order
  const positionMap = new Map<string, SectorData>();
  let checkerIdx = 0;
  let nonCheckerIdx = 0;

  const key = (pos: {row: number; col: number}) => `${pos.row},${pos.col}`;

  // 1. Industries → checkerboard only (strict requirement)
  for (const industry of selectedIndustries) {
    if (checkerIdx >= shuffledCheckerboard.length) {
      throw new Error(`Not enough checkerboard positions for industries: need ${selectedIndustries.length}, have ${shuffledCheckerboard.length}`);
    }
    positionMap.set(key(shuffledCheckerboard[checkerIdx++]), industry);
  }

  // 2. Cities → remaining checkerboard first, then overflow to non-checkerboard
  for (const city of selectedCities) {
    if (checkerIdx < shuffledCheckerboard.length) {
      positionMap.set(key(shuffledCheckerboard[checkerIdx++]), city);
    } else {
      if (nonCheckerIdx >= shuffledNonCheckerboard.length) {
        throw new Error('Not enough positions for cities');
      }
      positionMap.set(key(shuffledNonCheckerboard[nonCheckerIdx++]), city);
    }
  }

  // 3. Wilderness → remaining non-checkerboard positions
  for (const wild of selectedWilderness) {
    if (nonCheckerIdx >= shuffledNonCheckerboard.length) {
      throw new Error('Not enough non-checkerboard positions for wilderness');
    }
    positionMap.set(key(shuffledNonCheckerboard[nonCheckerIdx++]), wild);
  }

  // Build the map
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sectorInfo = positionMap.get(`${row},${col}`);

      if (!sectorInfo) {
        throw new Error(`No sector assigned to position (${row}, ${col})`);
      }

      // Create the sector in the game map
      // IMPORTANT: row and col must be first due to BoardSmith bug (uses first two numeric attrs for grid sizing)
      // Use sectorInfo.name as the element name so it displays properly in AutoUI
      game.gameMap.create(Sector, sectorInfo.name, {
        row,
        col,
        sectorId: sectorInfo.id,
        sectorName: sectorInfo.name,
        sectorType: sectorInfo.type,
        value: sectorInfo.value,
        image: sectorInfo.image,
        weaponLoot: sectorInfo.weapons,
        armorLoot: sectorInfo.armor,
        accessoryLoot: sectorInfo.accessories,
        explored: false,
        dictatorMilitia: 0,
        isBase: false,
      });
    }
  }

  game.message(`Map built: ${cols}x${rows} grid with ${cols * rows} sectors`);
}

// =============================================================================
// Dictator Setup
// =============================================================================

/**
 * Select and set up the dictator for the game.
 *
 * @param game - The game instance
 * @param dictatorData - Array of dictator data from JSON
 * @param dictatorChoice - Optional specific dictator to use (random if not specified)
 */
export function setupDictator(
  game: MERCGame,
  dictatorData: DictatorData[],
  dictatorChoice?: string
): CombatantModel {
  // Select dictator (random or specified)
  let selectedDictator: DictatorData;

  if (dictatorChoice) {
    const found = dictatorData.find(d => d.id === dictatorChoice);
    if (!found) {
      throw new Error(`Dictator not found: ${dictatorChoice}`);
    }
    selectedDictator = found;
  } else {
    // Random selection using seeded random
    const randomIndex = Math.floor(game.random() * dictatorData.length);
    selectedDictator = dictatorData[randomIndex];
  }

  // Create the dictator card
  const dictatorCard = game.create(CombatantModel, `dictator-${selectedDictator.id}`, {
    cardType: 'dictator',
    inPlay: false, // Dictator starts hidden until base is revealed
    combatantId: selectedDictator.id,
    combatantName: selectedDictator.name,
    ability: selectedDictator.ability,
    bio: selectedDictator.bio,
    image: selectedDictator.image,
    baseInitiative: selectedDictator.initiative,
    baseTraining: selectedDictator.training,
    baseCombat: selectedDictator.combat,
    damage: 0,
  });

  // Assign to dictator player
  game.dictatorPlayer.dictator = dictatorCard;

  game.message(`Dictator selected: ${selectedDictator.name}`);

  return dictatorCard;
}

// =============================================================================
// Tactics Deck Setup
// =============================================================================

/**
 * Set up the Dictator Tactics deck.
 * Selects 5 random tactics cards to form the active deck.
 *
 * @param game - The game instance
 * @param tacticsData - Array of tactics data from JSON
 * @param activeTacticsCount - Number of active tactics cards (default: 5)
 * @param debugTacticsOrder - Optional: specific tactics IDs in draw order (first = top)
 */
export function setupTacticsDeck(
  game: MERCGame,
  tacticsData: TacticsData[],
  activeTacticsCount: number = DictatorConstants.ACTIVE_TACTICS_CARDS,
  debugTacticsOrder?: string[]
): void {
  // Create tactics deck for dictator player
  const tacticsDeck = game.create(TacticsDeck, 'tactics-deck');
  tacticsDeck.setOrder('stacking');
  tacticsDeck.contentsHidden();

  // Create tactics hand
  const tacticsHand = game.create(TacticsHand, 'tactics-hand');

  // Create tactics discard pile
  const tacticsDiscard = game.create(DiscardPile, 'tactics-discard');

  // Assign to dictator player
  game.dictatorPlayer.tacticsDeck = tacticsDeck;
  game.dictatorPlayer.tacticsHand = tacticsHand;
  game.dictatorPlayer.tacticsDiscard = tacticsDiscard;

  // Create all tactics cards (some games have multiple copies)
  const allTacticsCards: TacticsData[] = [];
  for (const tactics of tacticsData) {
    for (let i = 0; i < tactics.quantity; i++) {
      allTacticsCards.push(tactics);
    }
  }

  let selectedTactics: TacticsData[];

  // Check for debug tactics order from: 1) function param, 2) debug-config.ts file
  const effectiveDebugOrder = debugTacticsOrder || DEBUG_TACTICS_ORDER;

  if (effectiveDebugOrder && effectiveDebugOrder.length > 0) {
    // Debug mode: use specific tactics in specified order
    // Reverse order because cards are added to bottom but drawn from top (stacking order)
    selectedTactics = [];
    const reversedOrder = [...effectiveDebugOrder].reverse();
    for (const tacticsId of reversedOrder) {
      const tactics = tacticsData.find(t => t.id === tacticsId);
      if (tactics) {
        selectedTactics.push(tactics);
      } else {
        console.warn(`[setupTacticsDeck] Unknown tactics ID: ${tacticsId}`);
      }
    }
    game.message(`[DEBUG] Tactics deck stacked with: ${effectiveDebugOrder.join(', ')}`);
  } else {
    // Normal mode: select random tactics for active deck
    selectedTactics = selectRandom(allTacticsCards, activeTacticsCount, game.random);
  }

  // Create the selected tactics cards in the deck
  for (let i = 0; i < selectedTactics.length; i++) {
    const tactics = selectedTactics[i];
    tacticsDeck.create(TacticsCard, `tactics-${tactics.id}-${i}`, {
      tacticsId: tactics.id,
      tacticsName: tactics.name,
      story: tactics.story,
      description: tactics.description,
      revealsBase: tactics.revealsBase ?? false,
    });
  }

  // Only shuffle in normal mode
  if (!effectiveDebugOrder || effectiveDebugOrder.length === 0) {
    tacticsDeck.shuffle();
  }

  game.message(`Tactics deck prepared with ${selectedTactics.length} cards`);
}

// =============================================================================
// Equipment and MERC Deck Setup
// =============================================================================

/**
 * Shuffle all equipment and MERC decks.
 */
export function shuffleDecks(game: MERCGame): void {
  // Shuffle MERC deck
  if (game.mercDeck.count() > 0) {
    game.mercDeck.shuffle();
    game.message(`MERC deck shuffled (${game.mercDeck.count()} cards)`);
  }

  // Shuffle equipment decks
  if (game.weaponsDeck.count() > 0) {
    game.weaponsDeck.shuffle();
    game.message(`Weapons deck shuffled (${game.weaponsDeck.count()} cards)`);
  }

  if (game.armorDeck.count() > 0) {
    game.armorDeck.shuffle();
    game.message(`Armor deck shuffled (${game.armorDeck.count()} cards)`);
  }

  if (game.accessoriesDeck.count() > 0) {
    game.accessoriesDeck.shuffle();
    game.message(`Accessories deck shuffled (${game.accessoriesDeck.count()} cards)`);
  }
}

// =============================================================================
// Complete Setup
// =============================================================================

export interface SetupOptions {
  sectorData: SectorData[];
  dictatorData: DictatorData[];
  tacticsData: TacticsData[];
  dictatorChoice?: string;
  activeTacticsCount?: number;
  /** Debug: specify tactics IDs in order (first = top of deck, drawn first) */
  debugTacticsOrder?: string[];
  /** If true, skip dictator setup (human player will choose during Day 1) */
  skipDictatorSetup?: boolean;
}

/**
 * Perform complete game setup.
 *
 * This should be called after:
 * - Game instance is created with players
 * - Setup configuration is loaded (via loadSetupConfig)
 * - MERC data is loaded (via loadMercData)
 * - Equipment data is loaded (via loadEquipmentData)
 *
 * @param game - The game instance
 * @param options - Setup options including data arrays
 */
export function performSetup(game: MERCGame, options: SetupOptions): void {
  game.message('=== Beginning Game Setup ===');

  // 1. Build the map
  buildMap(game, options.sectorData);

  // 2. Set up the dictator (skip if human player will choose during Day 1)
  if (!options.skipDictatorSetup) {
    setupDictator(game, options.dictatorData, options.dictatorChoice);
  } else {
    game.message('Dictator selection deferred to Day 1');
  }

  // 3. Set up tactics deck
  setupTacticsDeck(game, options.tacticsData, options.activeTacticsCount, options.debugTacticsOrder);

  // 4. Shuffle all decks
  shuffleDecks(game);

  // 5. Initialize game state
  game.currentDay = 0; // Setup complete, Day 1 will begin

  game.message('=== Setup Complete ===');
  game.message('Map: All sectors unexplored');
  if (game.dictatorPlayer?.dictator) {
    game.message(`Dictator: ${game.dictatorPlayer.dictator.combatantName} selected`);
  } else {
    game.message('Dictator: Will be selected on Day 1');
  }
  game.message(`Tactics: ${game.dictatorPlayer.tacticsDeck?.count(TacticsCard) ?? 0} cards in deck`);
  game.message('Equipment: 3 decks ready');
  game.message('MERCs: Deck ready');
  game.message('Pawns: Not yet on map');
  game.message('Militia: Not yet placed');
  game.message('');
  game.message('Proceed to Day 1: The Landing');
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate that the setup configuration matches the available sector data.
 */
export function validateSetupConfig(
  sectorData: SectorData[],
  config: { industries: number; cities: number; wilderness: number }
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const industries = sectorData.filter(s => s.type === 'Industry');
  const cities = sectorData.filter(s => s.type === 'City');
  const wilderness = sectorData.filter(s => s.type === 'Wilderness');

  if (industries.length < config.industries) {
    errors.push(`Not enough industries: need ${config.industries}, have ${industries.length}`);
  }

  if (cities.length < config.cities) {
    errors.push(`Not enough cities: need ${config.cities}, have ${cities.length}`);
  }

  if (wilderness.length < config.wilderness) {
    errors.push(`Not enough wilderness: need ${config.wilderness}, have ${wilderness.length}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get setup summary for debugging/display.
 */
export function getSetupSummary(game: MERCGame): string {
  const lines: string[] = [];

  lines.push('=== Setup Summary ===');
  lines.push(`Rebel Players: ${game.rebelPlayers.length}`);
  lines.push(`Map Size: ${game.gameMap.cols}x${game.gameMap.rows}`);
  lines.push(`Total Sectors: ${game.gameMap.getAllSectors().length}`);

  const sectors = game.gameMap.getAllSectors();
  const industries = sectors.filter(s => s.isIndustry);
  const cities = sectors.filter(s => s.isCity);
  const wilderness = sectors.filter(s => s.isWilderness);

  lines.push(`  Industries: ${industries.length}`);
  lines.push(`  Cities: ${cities.length}`);
  lines.push(`  Wilderness: ${wilderness.length}`);

  if (game.dictatorPlayer?.dictator) {
    lines.push(`Dictator: ${game.dictatorPlayer.dictator.combatantName}`);
  }

  if (game.dictatorPlayer?.tacticsDeck) {
    lines.push(`Tactics Deck: ${game.dictatorPlayer.tacticsDeck.count(TacticsCard)} cards`);
  }

  lines.push(`MERC Deck: ${game.mercDeck.count()} cards`);
  lines.push(`Weapons Deck: ${game.weaponsDeck.count()} cards`);
  lines.push(`Armor Deck: ${game.armorDeck.count()} cards`);
  lines.push(`Accessories Deck: ${game.accessoriesDeck.count()} cards`);

  return lines.join('\n');
}
