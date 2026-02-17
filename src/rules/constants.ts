/**
 * MERC Game Constants and Configuration
 *
 * Based on: data/rules/02-game-constants-and-configuration.md
 * Setup data: data/setup.json
 */

// =============================================================================
// Combat Constants
// =============================================================================

export const CombatConstants = {
  /** Dice roll of 4, 5, or 6 is a hit */
  HIT_THRESHOLD: 4,

  /** Six-sided dice */
  DICE_SIDES: 6,

  /** Fixed initiative for all militia */
  MILITIA_INITIATIVE: 2,

  /** Militia roll 1 die each */
  MILITIA_COMBAT: 1,

  /** Militia die in one hit */
  MILITIA_HEALTH: 1,

  /** Militia have no armor */
  MILITIA_ARMOR: 0,

  /** Militia target 1 enemy */
  MILITIA_TARGETS: 1,
} as const;

// =============================================================================
// MERC Constants
// =============================================================================

export const MercConstants = {
  /** All MERCs start with 3 health */
  BASE_HEALTH: 3,

  /** All MERCs can target 1 enemy by default */
  BASE_TARGETS: 1,

  /** All MERCs start with 0 armor */
  BASE_ARMOR: 0,

  /** All MERCs have 2 actions per day */
  ACTIONS_PER_DAY: 2,

  /** Typical skill value range minimum */
  SKILL_MIN: 0,

  /** Typical skill value range maximum (can go higher with equipment) */
  SKILL_MAX: 3,
} as const;

// =============================================================================
// Sector Constants
// =============================================================================

export const SectorConstants = {
  /** Maximum militia per faction per sector */
  MAX_MILITIA_PER_SIDE: 10,

  /** Kim's base allows 20 militia instead of 10 (dictator ability) */
  KIM_BASE_MAX_MILITIA: 20,
} as const;

// =============================================================================
// Team Constants
// =============================================================================

export const TeamConstants = {
  /** First MERC is always free */
  FREE_MERCS: 1,

  /** Rebels hire 2 MERCs on Day 1 */
  STARTING_MERCS: 2,

  /** Primary and Secondary squads */
  MAX_SQUADS: 2,

  /** Maximum combatants (MERCs + dictator card) per squad */
  MAX_SQUAD_SIZE: 4,

  /**
   * Team Limit Formula: 1 + controlled sectors
   * One MERC per controlled sector + free MERC
   */
  BASE_TEAM_LIMIT: 1,
} as const;

// =============================================================================
// Dictator Constants
// =============================================================================

export const DictatorConstants = {
  /** Dictator hires 1 random MERC on Day 1 */
  STARTING_MERCS: 1,

  /** Dictator fills hand to 3 Tactics cards */
  HAND_SIZE: 3,

  /** Number of Tactics cards in active play */
  ACTIVE_TACTICS_CARDS: 5,

  /** Dictator has no team limit */
  TEAM_LIMIT: Infinity,
} as const;

// =============================================================================
// Game Duration Constants
// =============================================================================

export const GameDurationConstants = {
  /** Total days: 1 setup day + 5 play days */
  TOTAL_DAYS: 6,

  /** Day 1 is the special landing/setup round */
  SETUP_DAY: 1,

  /** Normal play starts on day 2 */
  FIRST_PLAY_DAY: 2,

  /** Game ends after day 6 */
  LAST_DAY: 6,
} as const;

// =============================================================================
// Setup Configuration Types
// =============================================================================

export interface SetupConfiguration {
  /** Number of rebel players */
  rebels: number;

  /** Map dimensions [columns, rows] */
  mapSize: [number, number];

  /** Sector type counts */
  sectorTypes: {
    industries: number;
    cities: number;
    wilderness: number;
  };

  /** Dictator starting strength */
  dictatorStrength: {
    /** Militia placed on each unoccupied industry at start */
    difficulty: number;
    /** Additional militia to distribute on Day 1 */
    extra: number;
  };
}

export interface SetupData {
  setupConfigurations: SetupConfiguration[];
}

// =============================================================================
// Setup Configuration Helper Functions
// =============================================================================

/**
 * Get the setup configuration for a given number of rebels
 */
export function getSetupConfiguration(
  setupData: SetupData,
  rebelCount: number
): SetupConfiguration | undefined {
  return setupData.setupConfigurations.find(c => c.rebels === rebelCount);
}

/**
 * Calculate total sectors for a configuration
 */
export function getTotalSectors(config: SetupConfiguration): number {
  return config.mapSize[0] * config.mapSize[1];
}

/**
 * Calculate reinforcement militia gained when Dictator discards a Tactics card
 * Formula: ceil(Rebel Players / 2) + 1 (per rules: round up)
 */
export function getReinforcementAmount(rebelCount: number): number {
  return Math.ceil(rebelCount / 2) + 1;
}

/**
 * Reinforcement table lookup (for reference)
 */
export const ReinforcementTable: Record<number, number> = {
  1: 1,
  2: 2,
  3: 2,
  4: 3,
  5: 3,
  6: 4,
};

// =============================================================================
// Tie-Breaking Rules
// =============================================================================

export const TieBreakers = {
  /** In initiative ties, Dictator wins */
  INITIATIVE: 'dictator',

  /** In sector control ties, Dictator wins */
  SECTOR_CONTROL: 'dictator',

  /** In victory point ties, Dictator wins */
  VICTORY_POINTS: 'dictator',
} as const;

// =============================================================================
// Adjacency Rules
// =============================================================================

export const AdjacencyConstants = {
  /** Movement directions: orthogonal only (up, down, left, right) */
  DIRECTIONS: [
    [-1, 0],  // up
    [1, 0],   // down
    [0, -1],  // left
    [0, 1],   // right
  ] as const,

  /** No diagonal movement or placement */
  ALLOW_DIAGONAL: false,
} as const;

// =============================================================================
// Expansion Constants (Jagged Alliance)
// =============================================================================

export const ExpansionConstants = {
  /** Base game component counts */
  BASE: {
    MERCS: 47,
    MAP_SECTORS: 16,
    EQUIPMENT: 69,
    DICTATORS: 2,
    DICTATOR_TACTICS: 10,
    PLAYER_COLORS: 4,
    MIN_REBELS: 2,
    MAX_REBELS: 4,
  },

  /** Expansion additions */
  EXPANSION: {
    MERCS: 5,
    MAP_SECTORS: 14,
    EQUIPMENT: 58,
    DICTATORS: 9,
    DICTATOR_TACTICS: 4,
    PLAYER_COLORS: 3,
  },

  /** Total with expansion */
  TOTAL: {
    MERCS: 52,
    MAP_SECTORS: 30,
    EQUIPMENT: 127,
    DICTATORS: 11,
    DICTATOR_TACTICS: 14,
    PLAYER_COLORS: 7,
    MIN_REBELS: 1,
    MAX_REBELS: 6,
  },
} as const;

// =============================================================================
// All Constants Combined
// =============================================================================

export const GameConstants = {
  combat: CombatConstants,
  merc: MercConstants,
  sector: SectorConstants,
  team: TeamConstants,
  dictator: DictatorConstants,
  duration: GameDurationConstants,
  tieBreakers: TieBreakers,
  adjacency: AdjacencyConstants,
  expansion: ExpansionConstants,
} as const;

export default GameConstants;
