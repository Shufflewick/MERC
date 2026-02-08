import { Game, Player, type GameOptions, type ElementClass } from 'boardsmith';
import {
  CombatantModel,
  Equipment,
  Sector,
  TacticsCard,
  Squad,
  MercDeck,
  EquipmentDeck,
  TacticsDeck,
  TacticsHand,
  DiscardPile,
  GameMap,
  PlayerArea,
  type EquipmentType,
  type SectorType,
  type PlayerColor,
} from './elements.js';
import { createGameFlow } from './flow.js';
import { registerAllActions } from './actions.js';
import {
  type SetupConfiguration,
  type SetupData,
  getSetupConfiguration,
  getReinforcementAmount,
  GameConstants,
  TeamConstants,
  DictatorConstants,
  GameDurationConstants,
  CombatConstants,
} from './constants.js';
import {
  performSetup,
  buildMap,
  setupDictator,
  setupTacticsDeck,
  shuffleDecks,
  getSetupSummary,
  type SectorData as SetupSectorData,
  type DictatorData as SetupDictatorData,
  type TacticsData as SetupTacticsData,
} from './setup.js';
import type { Combatant, CombatResult } from './combat.js';

// Import game data from JSON files
import combatantsData from '../../data/combatants.json';
import equipmentData from '../../data/equipment.json';
import sectorsData from '../../data/sectors.json';
import tacticsData from '../../data/dictator-tactics.json';
import setupData from '../../data/setup.json';

// Re-export SetupConfiguration for external use
export type { SetupConfiguration } from './constants.js';

// Per-player configuration from lobby
export interface PlayerConfig {
  color?: string;
  isAI?: boolean;
  aiLevel?: string;
}

export interface MERCOptions extends GameOptions {
  seed?: string;
  rebelCount?: number;  // 1-6 rebels
  dictatorChoice?: string;  // Which dictator character to use
  expansionModes?: string[]; // 'A' for vehicles, 'B' for I, Dictator
  dictatorIsAI?: boolean;  // MERC-exaf: Explicitly set if dictator is AI-controlled
  // MERC-pbx4: Role selection - which player seat is the dictator
  // Default: last player (seat = playerCount - 1)
  // Set to 0 for first player, 1 for second player, etc.
  dictatorPlayerSeat?: number;
  // Player configurations from lobby (colors, AI settings)
  playerConfigs?: PlayerConfig[];
  // Game options from lobby
  gameOptions?: {
    dictatorCharacter?: string;  // 'random', 'castro', 'kim'
  };
  // Debug: stack tactics deck with specific cards in order (first = top of deck)
  debugTacticsOrder?: string[];
}

// =============================================================================
// JSON Data Interfaces (matching data files)
// =============================================================================

// Unified interface for both mercs and dictators (from combatants.json)
interface CombatantData {
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
  sex?: string;  // Optional, only some mercs have this
}

interface EquipmentData {
  id: string;
  name: string;
  quantity: number;
  type: EquipmentType;
  serial: number;
  combat?: number;
  initiative?: number;
  training?: number;
  targets?: number;
  armor?: number;
  negatesArmor: boolean;
  description: string;
  image: string;
  expansion?: string;
}

interface SectorData {
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

interface TacticsData {
  id: string;
  name: string;
  quantity: number;
  story: string;
  description: string;
  revealsBase?: boolean;
}

// =============================================================================
// Player Class - Unified player for both rebels and dictator
// =============================================================================

export type MERCPlayerRole = 'rebel' | 'dictator';

/**
 * Unified player class for rebels and dictator. Check role with isRebel()/isDictator().
 * Rebels have playerColor and area; dictator has dictator card, tactics deck, and base state.
 */
export class MERCPlayer extends Player {
  // Role determines rebel vs dictator behavior
  role!: MERCPlayerRole;

  // Common properties (both roles)
  primarySquadRef?: string;
  secondarySquadRef?: string;

  // Rebel-specific properties
  playerColor?: PlayerColor;
  playerColorHex?: string;  // Hex color from lobby, if set
  areaRef?: string;

  // Dictator-specific properties
  dictator?: CombatantModel;
  tacticsDeck?: TacticsDeck;
  tacticsHand?: TacticsHand;
  tacticsDiscard?: DiscardPile;
  mercSquadRef?: string;
  baseSquadRef?: string; // Dictator's base squad (third squad)
  baseRevealed: boolean = false;
  baseSectorId?: string;
  stationedSectorId?: string;
  isAI: boolean = false;
  privacyPlayerId?: string;

  // Type guards
  isRebel(): boolean {
    return this.role === 'rebel';
  }

  isDictator(): boolean {
    return this.role === 'dictator';
  }

  // Getters that look up elements fresh from the game tree
  get primarySquad(): Squad {
    const game = this.game as MERCGame;
    if (!game) {
      throw new Error(`primarySquad: game not set for player ${this.seat}`);
    }
    if (!this.primarySquadRef) {
      throw new Error(`primarySquad: primarySquadRef not set for player ${this.seat}`);
    }
    const squad = game.first(Squad, s => s.name === this.primarySquadRef);
    if (!squad) {
      throw new Error(`primarySquad: could not find squad "${this.primarySquadRef}" for player ${this.seat}`);
    }
    return squad;
  }

  get secondarySquad(): Squad {
    const game = this.game as MERCGame;
    if (!game) {
      throw new Error(`secondarySquad: game not set for player ${this.seat}`);
    }
    if (!this.secondarySquadRef) {
      throw new Error(`secondarySquad: secondarySquadRef not set for player ${this.seat}`);
    }
    const squad = game.first(Squad, s => s.name === this.secondarySquadRef);
    if (!squad) {
      throw new Error(`secondarySquad: could not find squad "${this.secondarySquadRef}" for player ${this.seat}`);
    }
    return squad;
  }

  // Dictator-only: base squad (third squad at base sector)
  get baseSquad(): Squad {
    if (!this.isDictator()) {
      throw new Error(`baseSquad: only dictator has base squad`);
    }
    const game = this.game as MERCGame;
    if (!game) {
      throw new Error(`baseSquad: game not set for player ${this.seat}`);
    }
    if (!this.baseSquadRef) {
      throw new Error(`baseSquad: baseSquadRef not set for player ${this.seat}`);
    }
    const squad = game.first(Squad, s => s.name === this.baseSquadRef);
    if (!squad) {
      throw new Error(`baseSquad: could not find squad "${this.baseSquadRef}" for player ${this.seat}`);
    }
    return squad;
  }

  // Rebel-only: player area
  get area(): PlayerArea {
    if (!this.isRebel()) {
      throw new Error(`area: only rebels have areas`);
    }
    const game = this.game as MERCGame;
    if (!game) {
      throw new Error(`area: game not set for player ${this.seat}`);
    }
    if (!this.areaRef) {
      throw new Error(`area: areaRef not set for player ${this.seat}`);
    }
    const area = game.first(PlayerArea, a => a.name === this.areaRef);
    if (!area) {
      throw new Error(`area: could not find area "${this.areaRef}" for player ${this.seat}`);
    }
    return area;
  }

  get team(): CombatantModel[] {
    // Return only living MERCs (dead MERCs can't take actions)
    const mercs: CombatantModel[] = [];
    try {
      mercs.push(...this.primarySquad.getLivingMercs());
    } catch { /* Squad not initialized yet */ }
    try {
      mercs.push(...this.secondarySquad.getLivingMercs());
    } catch { /* Squad not initialized yet */ }
    // Dictator also has base squad
    if (this.isDictator() && this.baseSquadRef) {
      try {
        mercs.push(...this.baseSquad.getLivingMercs());
      } catch { /* Squad not initialized yet */ }
    }
    return mercs;
  }

  get teamSize(): number {
    if (this.isRebel()) {
      // MERC-0ue: Teresa doesn't count toward team limit for rebels
      return this.team.filter(m => m.combatantId !== 'teresa').length;
    }
    return this.team.length;
  }

  // Rebel-only: team limit based on controlled sectors
  getTeamLimit(game: MERCGame): number {
    if (!this.isRebel()) {
      return Infinity; // Dictator has no team limit
    }
    return TeamConstants.BASE_TEAM_LIMIT + game.getControlledSectors(this).length;
  }

  canHireMerc(game: MERCGame): boolean {
    return this.teamSize < this.getTeamLimit(game);
  }

  // Dictator-only: hired mercs (alias for team)
  get hiredMercs(): CombatantModel[] {
    return this.team;
  }

  // Dictator-only: all mercs including dead ones
  get allMercs(): CombatantModel[] {
    const mercs: CombatantModel[] = [];
    try {
      mercs.push(...this.primarySquad.getMercs());
    } catch { /* Squad not initialized yet */ }
    try {
      mercs.push(...this.secondarySquad.getMercs());
    } catch { /* Squad not initialized yet */ }
    return mercs;
  }

  // Dictator-only: check if defeated (dead OR base captured)
  get isDefeated(): boolean {
    if (!this.isDictator()) return false;
    // Dictator is defeated if dead OR base is captured
    return (this.baseRevealed && this.dictator?.isDead === true) ||
           (this.game as MERCGame).isBaseCaptured();
  }

  /**
   * Find which squad contains a specific MERC.
   * Returns null if the MERC is not in either squad.
   */
  getSquadContaining(merc: CombatantModel): Squad | null {
    try {
      if (this.primarySquad.getMercs().some(m => m.id === merc.id)) {
        return this.primarySquad;
      }
    } catch { /* Squad not initialized */ }
    try {
      if (this.secondarySquad.getMercs().some(m => m.id === merc.id)) {
        return this.secondarySquad;
      }
    } catch { /* Squad not initialized */ }
    return null;
  }

  /**
   * Check if a squad belongs to this player.
   */
  ownsSquad(squad: Squad): boolean {
    return squad.name === this.primarySquadRef ||
           squad.name === this.secondarySquadRef ||
           squad.name === this.baseSquadRef;
  }
}

// Type aliases for convenience - both roles use the same MERCPlayer class
export type RebelPlayer = MERCPlayer;
export type DictatorPlayer = MERCPlayer;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Map a hex color to our PlayerColor type.
 * Uses the BoardSmith standard palette mapping.
 */
function hexToPlayerColor(hex: string): PlayerColor {
  const colorMap: Record<string, PlayerColor> = {
    '#e74c3c': 'red',
    '#3498db': 'blue',
    '#27ae60': 'green',
    '#e67e22': 'orange',
    '#9b59b6': 'purple',
    '#f1c40f': 'yellow',
    '#95a5a6': 'black',  // Gray/dictator color maps to black
    '#ecf0f1': 'black',  // White also maps to black for now
  };
  return colorMap[hex.toLowerCase()] || 'red';
}

// =============================================================================
// Main Game Class
// =============================================================================

/**
 * Root game container for MERC. Manages map, decks, players, and combat state.
 * Access dictatorPlayer and rebelPlayers for player references.
 */
export class MERCGame extends Game<MERCGame, MERCPlayer> {
  // BoardSmith v0.6: Use unified MERCPlayer class for all players
  static PlayerClass = MERCPlayer;

  // Static storage for playerCount during construction (workaround for super() timing)
  private static _pendingPlayerCount: number = 2;
  // MERC-pbx4: Static storage for dictator position during construction
  // -1 means "use default" (last player)
  private static _pendingDictatorPosition: number = -1;
  // Player configurations from lobby (colors, AI settings)
  private static _pendingPlayerConfigs: PlayerConfig[] = [];

  // Configuration
  rebelCount!: number;
  setupConfig!: SetupConfiguration;
  currentDay: number = 1;

  // Game Map
  gameMap!: GameMap;

  // Card pools (master decks)
  mercDeck!: MercDeck;
  weaponsDeck!: EquipmentDeck;
  armorDeck!: EquipmentDeck;
  accessoriesDeck!: EquipmentDeck;

  // Discard piles
  mercDiscard!: DiscardPile;
  weaponsDiscard!: DiscardPile;
  armorDiscard!: DiscardPile;
  accessoriesDiscard!: DiscardPile;

  // Militia bonus flags (from tactics cards)
  betterWeaponsActive: boolean = false;  // +1 combat die per dictator militia
  veteranMilitiaActive: boolean = false; // +1 initiative for dictator militia

  // Base defense bonus flags (from tactics cards)
  generalisimoActive: boolean = false;   // Dictator gives +1 combat to all units at base
  lockdownActive: boolean = false;       // All units at base get +1 armor

  // Tactics card state (permanent effects)
  conscriptsActive?: boolean;  // Conscripts card: add militia each turn
  conscriptsAmount?: number;   // Amount of militia to add per turn
  oilReservesActive?: boolean; // Oil Reserves card: controller gets free action

  // Game state
  // Dictator player reference - cached for performance
  private _dictatorPlayer?: MERCPlayer;

  get dictatorPlayer(): MERCPlayer {
    if (!this._dictatorPlayer) {
      // Find the player with dictator role
      const player = this.first(MERCPlayer, p => p.isDictator());
      if (player) {
        this._dictatorPlayer = player;
      }
    }
    if (!this._dictatorPlayer) {
      throw new Error('Dictator player not found');
    }
    return this._dictatorPlayer;
  }

  set dictatorPlayer(player: MERCPlayer) {
    this._dictatorPlayer = player;
  }

  // Get all rebel players
  get rebelPlayers(): MERCPlayer[] {
    return this.players.filter(p => p.isRebel());
  }

  // Get all players in the game
  get players(): MERCPlayer[] {
    return [...this.all(MERCPlayer)];
  }

  // MERC-a2h: Track pending coordinated attacks across multiple rebel players
  // Key: target sectorId, Value: array of { playerId, squadType }
  // Using persistentMap to survive HMR
  pendingCoordinatedAttacks = this.persistentMap<string, Array<{ playerId: string; squadType: 'primary' | 'secondary' }>>('pendingCoordinatedAttacks');

  // MERC-n1f: Interactive combat state
  // Tracks active combat that's paused for player decision (retreat/continue)
  activeCombat: {
    sectorId: string;
    attackingPlayerId: string;
    attackingPlayerIsRebel?: boolean; // True if rebel initiated combat, false if dictator
    round: number;
    rebelCombatants: Combatant[];
    dictatorCombatants: Combatant[];
    rebelCasualties: Combatant[];
    dictatorCasualties: Combatant[];
    // MERC-l09: Attack Dog state
    dogAssignments?: Array<[string, Combatant]>;
    dogs?: Combatant[];
    // MERC-t5k: Player target selection - turn-by-turn
    currentAttackerIndex?: number; // Position in initiative order (for mid-round pause)
    roundResults?: CombatResult[];
    roundCasualties?: Combatant[];
    pendingTargetSelection?: {
      attackerId: string; // ID of the attacking combatant
      attackerName: string;
      validTargets: Combatant[];
      maxTargets: number;
    };
    // MERC-l09: Attack Dog assignment choice (for human players)
    pendingAttackDogSelection?: {
      attackerId: string; // ID of the MERC with the dog
      attackerName: string;
      validTargets: Combatant[]; // Enemy MERCs the dog can be assigned to
    };
    selectedTargets?: Map<string, string[]>; // attackerId -> targetIds
    selectedDogTargets?: Map<string, string>; // attackerId -> targetId for Attack Dog
    // Medical Kit healing: dice discarded per combatant this round
    healingDiceUsed?: Map<string, number>; // combatantId -> dice discarded
    // Track which attackers have had their before-attack healing phase processed
    beforeAttackHealingProcessed?: Set<string>; // attackerId set
    // MERC-dice: Combat dice UI state
    pendingHitAllocation?: {
      attackerId: string;
      attackerName: string;
      attackerCombatantId: string; // For ability checks (Basic, Wolverine)
      diceRolls: number[]; // The actual dice values
      hits: number; // Number of successful hits (4+, or 3+ for Lucid)
      hitThreshold: number; // What counts as a hit (4 normally, 3 for Lucid)
      validTargets: Array<{
        id: string;
        name: string;
        isMerc: boolean;
        currentHealth: number;
        maxHealth: number;
      }>;
      wolverineSixes: number; // Count of 6s for Wolverine's ability
      canReroll: boolean; // Basic's ability available
      hasRerolled: boolean; // Basic already used reroll this combat
      rollCount: number; // Increment to trigger dice animation
    };
    // Wolverine's bonus 6s allocation (after normal allocation)
    pendingWolverineSixes?: {
      attackerId: string;
      attackerName: string;
      sixCount: number;
      bonusTargets: Array<{
        id: string;
        name: string;
        isMerc: boolean;
        currentHealth: number;
        maxHealth: number;
      }>;
    };
    // Epinephrine Shot choice - pause when a MERC takes lethal damage
    pendingEpinephrine?: {
      dyingCombatantId: number;
      dyingCombatantName: string;
      dyingCombatantSide: 'rebel' | 'dictator';
      availableSavers: Array<{ combatantId: number; combatantName: string }>;
    };
    // Before-attack healing - pause before a MERC's attack to allow healing
    // Per rules: "On your initiative, before your attack, discard 1 combat dice to heal"
    pendingBeforeAttackHealing?: {
      attackerId: string;
      attackerName: string;
      // All allied MERCs with healing items (attacker or squadmates)
      availableHealers: Array<{
        healerId: string;
        healerName: string;
        healingItemId: string;
        itemName: string;
        usesRemaining: number;
        dicePerHeal: number;
        healPerUse: number;
      }>;
      // Damaged allies that can be healed
      damagedAllies: Array<{
        id: string;
        name: string;
        currentHealth: number;
        maxHealth: number;
        damage: number;
      }>;
    };
    // Flag indicating combat is complete but UI is still animating
    // Flow system exits combat loop when this is true
    // UI clears activeCombat after animations complete
    combatComplete?: boolean;
  } | null = null;

  // MERC-t5k: Pending combat - set by move action, initiated by flow
  // This allows proper UI refresh between move and combat
  pendingCombat: {
    sectorId: string;
    playerId: string;
    attackingPlayerIsRebel?: boolean;
  } | null = null;

  // Queue for multiple pending combats triggered by a single action (e.g., tactics effects)
  pendingCombatQueue: Array<{
    sectorId: string;
    playerId: string;
    attackingPlayerIsRebel?: boolean;
  }> = [];

  // Explosives victory - set when rebels detonate explosives in palace
  explosivesVictory: boolean = false;

  // Flag to track if game end has been announced (prevents duplicate messages)
  private _gameEndAnnounced: boolean = false;

  // Pending artillery allocation - rebels choose how to allocate hits during dictator's turn
  pendingArtilleryAllocation: {
    sectorId: string;        // Which sector is being attacked
    sectorName: string;      // For display
    hits: number;            // Total hits to allocate
    allocatedHits: number;   // Hits allocated so far
    validTargets: Array<{
      id: string;            // Target identifier
      name: string;          // Display name
      type: 'militia' | 'merc';
      ownerId: string;       // Which rebel owns this target
      currentHealth: number; // For MERCs
      maxHealth: number;     // For MERCs
    }>;
    sectorsRemaining: Array<{  // Queue of sectors still to process
      sectorId: string;
      sectorName: string;
      hits: number;
    }>;
  } | null = null;

  /** Check if artillery allocation is pending (rebels need to allocate hits) */
  get hasArtilleryPending(): boolean {
    return this.pendingArtilleryAllocation !== null;
  }

  // Track last explorer for "Take from stash" action
  // Only the MERC who just explored can take from stash (until they do or action changes)
  lastExplorer: { combatantId: string; sectorId: string } | null = null;

  // Pending loot cache for explore action
  // Caches equipment IDs during selection phase to avoid multiple draws
  // Changed to Map to support multiple MERCs in different unexplored sectors
  // Using persistentMap to survive HMR - stores equipment IDs (numbers) not element refs
  pendingLootMap = this.persistentMap<string, number[]>('pendingLootMap');

  // Hagness ability staging - holds drawn equipment during selection
  // Stored in settings to ensure it serializes to clients
  // Key: player seat:equipmentType (string), Value: serialized equipment data for UI display
  get hagnessDrawnEquipmentData(): Record<string, {
    equipmentId: number;
    equipmentName: string;
    equipmentType: string;
    description: string;
    combatBonus: number;
    initiative: number;
    training: number;
    targets: number;
    armorBonus: number;
    negatesArmor: boolean;
    serial: number;
    image: string;
  }> {
    const settings = this.settings as Record<string, unknown>;
    if (!settings.hagnessDrawnEquipmentData) {
      settings.hagnessDrawnEquipmentData = {};
    }
    return settings.hagnessDrawnEquipmentData as Record<string, {
      equipmentId: number;
      equipmentName: string;
      equipmentType: string;
      description: string;
      combatBonus: number;
      initiative: number;
      training: number;
      targets: number;
      armorBonus: number;
      negatesArmor: boolean;
      serial: number;
      image: string;
    }>;
  }

  // Static reference data loaded from JSON - stored in settings to survive HMR
  // These are loaded once during initializeGame() and don't change during gameplay
  // Type assertions needed because boardsmith's settings is typed as {}
  get combatantData(): CombatantData[] {
    return (this.settings as Record<string, unknown>).combatantData as CombatantData[] ?? [];
  }
  set combatantData(data: CombatantData[]) {
    (this.settings as Record<string, unknown>).combatantData = data;
  }

  get equipmentData(): EquipmentData[] {
    return (this.settings as Record<string, unknown>).equipmentData as EquipmentData[] ?? [];
  }
  set equipmentData(data: EquipmentData[]) {
    (this.settings as Record<string, unknown>).equipmentData = data;
  }

  get sectorData(): SectorData[] {
    return (this.settings as Record<string, unknown>).sectorData as SectorData[] ?? [];
  }
  set sectorData(data: SectorData[]) {
    (this.settings as Record<string, unknown>).sectorData = data;
  }

  get tacticsData(): TacticsData[] {
    return (this.settings as Record<string, unknown>).tacticsData as TacticsData[] ?? [];
  }
  set tacticsData(data: TacticsData[]) {
    (this.settings as Record<string, unknown>).tacticsData = data;
  }

  get setupConfigurations(): SetupConfiguration[] {
    return (this.settings as Record<string, unknown>).setupConfigurations as SetupConfiguration[] ?? [];
  }
  set setupConfigurations(data: SetupConfiguration[]) {
    (this.settings as Record<string, unknown>).setupConfigurations = data;
  }

  constructor(options: MERCOptions) {
    // Store playerCount before super() so createPlayer can access it
    // Default to 2 players if not specified (1 rebel + 1 dictator)
    MERCGame._pendingPlayerCount = options.playerCount ?? 2;

    // Store player configs from lobby
    MERCGame._pendingPlayerConfigs = options.playerConfigs || [];

    // Find dictator position from:
    // 1. playerConfigs with isDictator: true (from exclusive player option)
    // 2. dictatorPlayerSeat option (legacy)
    // 3. Default to last player
    let dictatorPos = -1;  // -1 means last player

    // Check playerConfigs for isDictator flag (from exclusive player option in lobby)
    const playerConfigs = options.playerConfigs || [];
    const dictatorConfigIndex = playerConfigs.findIndex(
      (config: any) => config.isDictator === true
    );

    if (dictatorConfigIndex >= 0) {
      dictatorPos = dictatorConfigIndex;
    } else if (options.dictatorPlayerSeat !== undefined) {
      dictatorPos = options.dictatorPlayerSeat;
    }

    // Validate seat if explicitly set
    if (dictatorPos >= 0 && dictatorPos >= MERCGame._pendingPlayerCount) {
      throw new Error(
        `Invalid dictator seat: ${dictatorPos}. ` +
        `Must be less than playerCount (${MERCGame._pendingPlayerCount}).`
      );
    }
    MERCGame._pendingDictatorPosition = dictatorPos;

    super(options);

    // Register all element classes for serialization
    // Cast to ElementClass is safe - these are all valid GameElement subclasses
    // The cast is needed because our constructors have additional parameters beyond ElementContext
    // Register CombatantModel for serialization
    this._ctx.classRegistry.set('CombatantModel', CombatantModel as unknown as ElementClass);
    this._ctx.classRegistry.set('Equipment', Equipment as unknown as ElementClass);
    this._ctx.classRegistry.set('Sector', Sector as unknown as ElementClass);
    this._ctx.classRegistry.set('TacticsCard', TacticsCard as unknown as ElementClass);
    this._ctx.classRegistry.set('Squad', Squad as unknown as ElementClass);
    this._ctx.classRegistry.set('MercDeck', MercDeck as unknown as ElementClass);
    this._ctx.classRegistry.set('EquipmentDeck', EquipmentDeck as unknown as ElementClass);
    this._ctx.classRegistry.set('TacticsDeck', TacticsDeck as unknown as ElementClass);
    this._ctx.classRegistry.set('TacticsHand', TacticsHand as unknown as ElementClass);
    this._ctx.classRegistry.set('DiscardPile', DiscardPile as unknown as ElementClass);
    this._ctx.classRegistry.set('GameMap', GameMap as unknown as ElementClass);
    this._ctx.classRegistry.set('PlayerArea', PlayerArea as unknown as ElementClass);

    // Register MERCPlayer class for serialization
    this._ctx.classRegistry.set('MERCPlayer', MERCPlayer as unknown as ElementClass);

    // BoardSmith v0.6: BoardSmith creates MERCPlayer instances in super() via static PlayerClass
    // Now configure each player as rebel or dictator based on position
    const playerCount = MERCGame._pendingPlayerCount;
    const dictatorPosition = MERCGame._pendingDictatorPosition >= 0
      ? MERCGame._pendingDictatorPosition + 1  // Convert 0-indexed to 1-indexed
      : playerCount;  // Default: last player

    for (const player of this.players) {
      if (player.seat === dictatorPosition) {
        this.configureAsDictator(player);
      } else {
        this.configureAsRebel(player);
      }
    }

    // Determine rebel count from players or options
    this.rebelCount = options.rebelCount ?? Math.max(1, playerCount - 1);

    // MERC-exaf: Set dictator AI mode from options
    // When true, enables AI auto-selection logic and privacy player designation
    if (options.dictatorIsAI !== undefined) {
      this.dictatorPlayer.isAI = options.dictatorIsAI;
    }

    // Create decks (will be populated later when data is loaded)
    this.mercDeck = this.create(MercDeck, 'merc-deck');
    this.mercDeck.setOrder('stacking');

    this.weaponsDeck = this.create(EquipmentDeck, 'weapons-deck', { equipmentType: 'Weapon' });
    this.weaponsDeck.setOrder('stacking');

    this.armorDeck = this.create(EquipmentDeck, 'armor-deck', { equipmentType: 'Armor' });
    this.armorDeck.setOrder('stacking');

    this.accessoriesDeck = this.create(EquipmentDeck, 'accessories-deck', { equipmentType: 'Accessory' });
    this.accessoriesDeck.setOrder('stacking');

    // Create discard piles
    this.mercDiscard = this.create(DiscardPile, 'merc-discard');
    this.weaponsDiscard = this.create(DiscardPile, 'weapons-discard');
    this.armorDiscard = this.create(DiscardPile, 'armor-discard');
    this.accessoriesDiscard = this.create(DiscardPile, 'accessories-discard');

    // Create game map (will be populated when data is loaded)
    this.gameMap = this.create(GameMap, 'game-map');

    // Register all actions
    registerAllActions(this);

    // Set up game flow
    this.setFlow(createGameFlow(this));

    // Load game data from JSON files
    this.loadSetupConfig(setupData as SetupData);
    this.loadCombatantData(combatantsData as CombatantData[]);
    this.loadEquipmentData(equipmentData as EquipmentData[], options.expansionModes);
    this.loadSectorData(sectorsData as SectorData[]);
    this.loadTacticsData(tacticsData as TacticsData[]);

    // Perform initial setup (build map, select dictator, etc.)
    // Use dictatorCharacter from gameOptions, or dictatorChoice for legacy/direct API
    const dictatorCharacter = options.gameOptions?.dictatorCharacter;
    const dictatorChoice = dictatorCharacter && dictatorCharacter !== 'random'
      ? dictatorCharacter
      : options.dictatorChoice;
    this.performSetup(dictatorChoice, undefined, options.debugTacticsOrder);
  }

  /**
   * Configure a player as the dictator.
   */
  private configureAsDictator(player: MERCPlayer): void {
    player.role = 'dictator';
    this._dictatorPlayer = player;

    // Create three squads for dictator: primary, secondary, and base
    const primaryRef = `squad-dictator-primary`;
    const secondaryRef = `squad-dictator-secondary`;
    const baseRef = `squad-dictator-base`;
    this.create(Squad, primaryRef, { isPrimary: true });
    this.create(Squad, secondaryRef, { isPrimary: false });
    this.create(Squad, baseRef, { isPrimary: false, isBase: true });

    player.primarySquadRef = primaryRef;
    player.secondarySquadRef = secondaryRef;
    player.baseSquadRef = baseRef;
    player.mercSquadRef = primaryRef;
  }

  /**
   * Configure a player as a rebel.
   */
  private configureAsRebel(player: MERCPlayer): void {
    player.role = 'rebel';

    // Assign color and AI flag from player config
    const seat = player.seat;
    const playerConfig = MERCGame._pendingPlayerConfigs[seat - 1];
    if (playerConfig?.color) {
      player.playerColorHex = playerConfig.color;
      player.playerColor = hexToPlayerColor(playerConfig.color);
    } else {
      const colors: PlayerColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
      player.playerColor = colors[(seat - 1) % colors.length];
    }

    // Set AI flag from player config (for bot players)
    if (playerConfig?.isAI !== undefined) {
      player.isAI = playerConfig.isAI;
    }

    // Create squads and area for rebel
    const primaryRef = `squad-${seat}-primary`;
    const secondaryRef = `squad-${seat}-secondary`;
    const areaRef = `area-${seat}`;

    this.create(Squad, primaryRef, { isPrimary: true });
    this.create(Squad, secondaryRef, { isPrimary: false });
    const area = this.create(PlayerArea, areaRef);
    area.playerColor = player.playerColor;

    player.primarySquadRef = primaryRef;
    player.secondarySquadRef = secondaryRef;
    player.areaRef = areaRef;
  }

  /**
   * Check if a player is a rebel (not the dictator).
   */
  isRebelPlayer(player: unknown): player is MERCPlayer {
    return player instanceof MERCPlayer && player.isRebel();
  }

  /**
   * Check if a player is the dictator.
   */
  isDictatorPlayer(player: unknown): player is MERCPlayer {
    return player instanceof MERCPlayer && player.isDictator();
  }

  // ==========================================================================
  // Data Loading Methods
  // ==========================================================================

  loadCombatantData(data: CombatantData[]): void {
    this.combatantData = data;
    // Create CombatantModel elements for merc entries
    const mercEntries = data.filter(d => d.cardType === 'merc');
    for (const merc of mercEntries) {
      for (let i = 0; i < merc.quantity; i++) {
        const suffix = merc.quantity > 1 ? `-${i + 1}` : '';
        const combatant = this.mercDeck.create(CombatantModel, `merc-${merc.id}${suffix}`, {
          cardType: 'merc',
          combatantId: merc.id,
          combatantName: merc.name,
          bio: merc.bio,
          ability: merc.ability,
          image: merc.image,
          baseInitiative: merc.initiative,
          baseTraining: merc.training,
          baseCombat: merc.combat,
        });
        // Initialize computed stats (no equipment yet, so just base stats)
        combatant.updateComputedStats();
      }
    }
  }

  loadEquipmentData(data: EquipmentData[], expansionModes: string[] = []): void {
    this.equipmentData = data;
    for (const equip of data) {
      // Skip expansion equipment unless that mode is enabled
      if (equip.expansion && !expansionModes.includes(equip.expansion)) {
        continue;
      }

      const deck = this.getEquipmentDeck(equip.type);
      if (!deck) continue;

      for (let i = 0; i < equip.quantity; i++) {
        const suffix = equip.quantity > 1 ? `-${i + 1}` : '';
        deck.create(Equipment, `equip-${equip.id}${suffix}`, {
          equipmentId: equip.id,
          equipmentName: equip.name,
          equipmentType: equip.type,
          serial: equip.serial,
          description: equip.description,
          image: equip.image,
          combatBonus: equip.combat ?? 0,
          initiative: equip.initiative ?? 0,
          training: equip.training ?? 0,
          targets: equip.targets ?? 0,
          armorBonus: equip.armor ?? 0,
          negatesArmor: equip.negatesArmor,
          expansion: equip.expansion,
        });
      }
    }
  }

  loadSectorData(data: SectorData[]): void {
    this.sectorData = data;
    // Sectors are loaded but not placed on the map yet - that happens during setup
  }

  loadTacticsData(data: TacticsData[]): void {
    this.tacticsData = data;
  }

  loadSetupConfig(setupData: SetupData): void {
    this.setupConfigurations = setupData.setupConfigurations;
    // Find the right config for our rebel count using helper function
    const config = getSetupConfiguration(setupData, this.rebelCount);
    if (config) {
      this.setupConfig = config;
      // mapSize is [cols, rows] in the JSON data
      const [cols, rows] = config.mapSize;
      this.gameMap.cols = cols;
      this.gameMap.rows = rows;
      this.gameMap.updateLabels();
    }
  }

  loadSetupConfigArray(configs: SetupConfiguration[]): void {
    this.loadSetupConfig({ setupConfigurations: configs });
  }

  // ==========================================================================
  // Game Setup Methods
  // ==========================================================================

  /**
   * Perform complete game setup using loaded data.
   * This should be called after all data is loaded via loadXxxData methods.
   *
   * @param dictatorChoice - Optional specific dictator to use (random if not specified)
   * @param activeTacticsCount - Number of active tactics cards (default: 5)
   * @param debugTacticsOrder - Debug: specific tactics IDs in draw order (first = top)
   */
  performSetup(dictatorChoice?: string, activeTacticsCount?: number, debugTacticsOrder?: string[]): void {
    if (!this.setupConfig) {
      throw new Error('Setup configuration not loaded. Call loadSetupConfig first.');
    }

    if (this.sectorData.length === 0) {
      throw new Error('Sector data not loaded. Call loadSectorData first.');
    }

    // Filter combatantData to get dictator entries
    const dictatorData = this.combatantData.filter(d => d.cardType === 'dictator');
    if (dictatorData.length === 0) {
      throw new Error('Dictator data not found in combatants. Call loadCombatantData first.');
    }

    if (this.tacticsData.length === 0) {
      throw new Error('Tactics data not loaded. Call loadTacticsData first.');
    }

    // Check for debug tactics order in settings as well
    const effectiveTacticsOrder = debugTacticsOrder || this.settings.debugTacticsOrder as string[] | undefined;

    // Skip dictator setup if human player will choose (no dictatorChoice specified and not AI)
    const skipDictatorSetup = !dictatorChoice && !this.dictatorPlayer?.isAI;

    performSetup(this, {
      sectorData: this.sectorData as SetupSectorData[],
      dictatorData: dictatorData as SetupDictatorData[],
      tacticsData: this.tacticsData as SetupTacticsData[],
      dictatorChoice,
      activeTacticsCount,
      debugTacticsOrder: effectiveTacticsOrder,
      skipDictatorSetup,
    });
  }

  /**
   * Build just the map (useful for testing or custom setup)
   */
  buildMap(): void {
    if (!this.setupConfig) {
      throw new Error('Setup configuration not loaded');
    }
    if (this.sectorData.length === 0) {
      throw new Error('Sector data not loaded');
    }
    buildMap(this, this.sectorData as SetupSectorData[]);
  }

  /**
   * Set up just the dictator (useful for testing or custom setup)
   */
  setupDictator(dictatorChoice?: string): CombatantModel {
    const dictatorData = this.combatantData.filter(d => d.cardType === 'dictator');
    if (dictatorData.length === 0) {
      throw new Error('Dictator data not found in combatants');
    }
    return setupDictator(this, dictatorData as SetupDictatorData[], dictatorChoice);
  }

  /**
   * Set up just the tactics deck (useful for testing or custom setup)
   */
  setupTacticsDeck(activeTacticsCount?: number): void {
    if (this.tacticsData.length === 0) {
      throw new Error('Tactics data not loaded');
    }
    setupTacticsDeck(this, this.tacticsData as SetupTacticsData[], activeTacticsCount);
  }

  /**
   * Shuffle all decks
   */
  shuffleAllDecks(): void {
    shuffleDecks(this);
  }

  /**
   * Get a summary of the current setup state
   */
  getSetupSummary(): string {
    return getSetupSummary(this);
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  getEquipmentDeck(type: EquipmentType): EquipmentDeck | undefined {
    switch (type) {
      case 'Weapon': return this.weaponsDeck;
      case 'Armor': return this.armorDeck;
      case 'Accessory': return this.accessoriesDeck;
      default: return undefined;
    }
  }

  getEquipmentDiscard(type: EquipmentType): DiscardPile | undefined {
    switch (type) {
      case 'Weapon': return this.weaponsDiscard;
      case 'Armor': return this.armorDiscard;
      case 'Accessory': return this.accessoriesDiscard;
      default: return undefined;
    }
  }

  drawEquipment(type: EquipmentType): Equipment | undefined {
    const deck = this.getEquipmentDeck(type);
    const discard = this.getEquipmentDiscard(type);
    if (!deck || !discard) return undefined;

    // Draw to discard as holding area (caller will putInto final destination)
    let drawn = deck.drawTo(discard, 1, Equipment);

    // If deck is empty, reshuffle discard and try again
    if (drawn.length === 0 && discard.count(Equipment) > 0) {
      for (const eq of discard.all(Equipment)) {
        eq.putInto(deck);
      }
      deck.shuffle();
      drawn = deck.drawTo(discard, 1, Equipment);
    }

    return drawn[0];
  }

  drawMerc(): CombatantModel | undefined {
    // Draw to discard as holding area (caller will putInto final destination)
    let drawn = this.mercDeck.drawTo(this.mercDiscard, 1, CombatantModel);

    // If deck is empty, reshuffle discard and try again
    if (drawn.length === 0 && this.mercDiscard.count(CombatantModel) > 0) {
      for (const merc of this.mercDiscard.all(CombatantModel)) {
        merc.putInto(this.mercDeck);
      }
      this.mercDeck.shuffle();
      drawn = this.mercDeck.drawTo(this.mercDiscard, 1, CombatantModel);
    }

    return drawn[0];
  }

  getSector(sectorId: string): Sector | undefined {
    return this.gameMap.first(Sector, s => s.sectorId === sectorId);
  }

  getAdjacentSectors(sector: Sector): Sector[] {
    return this.gameMap.getAdjacentSectors(sector);
  }

  // Get sectors controlled by a specific player
  // Per rules (11-victory-and-game-end.md): Units = MERCs + Militia, Dictator wins ties
  // MERC-eqe: For rebel vs rebel ties, lower position (earlier in turn order) wins
  getControlledSectors(player: MERCPlayer): Sector[] {
    return this.gameMap.getAllSectors().filter(sector => {
      const dictatorUnits = this.getDictatorUnitsInSector(sector);
      const totalRebelUnits = this.getTotalRebelUnitsInSector(sector);

      if (player.isDictator()) {
        // Dictator controls if they have equal or more units than all rebels combined
        // Per rules: "Dictator wins all ties" (02-game-constants-and-configuration.md)
        return dictatorUnits >= totalRebelUnits && dictatorUnits > 0;
      } else {
        // Rebel controls if they have more units than dictator and other rebels
        const rebel = player;
        const rebelUnits = this.getRebelUnitsInSector(sector, rebel);

        // Must have more units than dictator (dictator wins ties)
        if (dictatorUnits >= rebelUnits) return false;

        // MERC-eqe: Check against other rebels with tie-breaker
        // Lower seat (earlier in turn order) wins ties between rebels
        for (const otherRebel of this.rebelPlayers) {
          if (otherRebel === rebel) continue;
          const otherUnits = this.getRebelUnitsInSector(sector, otherRebel);
          // Other rebel has strictly more units - they win
          if (otherUnits > rebelUnits) return false;
          // Tied units: lower seat wins
          if (otherUnits === rebelUnits && otherRebel.seat < rebel.seat) return false;
        }

        return rebelUnits > 0;
      }
    });
  }

  getMercsInSector(sector: Sector, player: RebelPlayer): CombatantModel[] {
    const mercs: CombatantModel[] = [];

    if (player.primarySquad?.sectorId === sector.sectorId) {
      mercs.push(...player.primarySquad.getMercs());
    }
    if (player.secondarySquad?.sectorId === sector.sectorId) {
      mercs.push(...player.secondarySquad.getMercs());
    }

    return mercs;
  }

  /**
   * Update ability bonuses for all squads in the game.
   * @deprecated Individual methods like updateAllHaargBonuses are superseded by unified updateSquadBonuses.
   */
  updateAllHaargBonuses(): void {
    // Update all rebel squads
    for (const rebel of this.rebelPlayers) {
      try {
        this.updateSquadBonuses(rebel.primarySquad);
      } catch { /* squad not initialized */ }
      try {
        this.updateSquadBonuses(rebel.secondarySquad);
      } catch { /* squad not initialized */ }
    }
    // Update dictator squads
    if (this.dictatorPlayer) {
      try {
        this.updateSquadBonuses(this.dictatorPlayer.primarySquad);
      } catch { /* squad not initialized */ }
      try {
        this.updateSquadBonuses(this.dictatorPlayer.secondarySquad);
      } catch { /* squad not initialized */ }
    }
  }

  /**
   * @deprecated Use updateSquadBonuses instead. Haarg is now handled by unified updateAbilityBonuses.
   */
  updateHaargBonusForSquad(squad: Squad): void {
    // Delegate to unified method - updates all MERCs including Haarg
    this.updateSquadBonuses(squad);
  }

  /**
   * Update Sarge's and Tack's ability bonuses for all squads.
   * Sarge gets +1 to all skills when his initiative is highest in the squad.
   * Tack gives +2 initiative to her whole squad when she has highest initiative.
   * Call this whenever squad composition changes (hiring, movement, death, etc.)
   */
  updateAllSargeBonuses(): void {
    // Check all rebel squads
    for (const rebel of this.rebelPlayers) {
      try {
        this.updateSquadBonuses(rebel.primarySquad);
      } catch { /* squad not initialized */ }
      try {
        this.updateSquadBonuses(rebel.secondarySquad);
      } catch { /* squad not initialized */ }
    }
    // Check dictator squads (in case Sarge/Tack is hired by dictator)
    if (this.dictatorPlayer) {
      try {
        this.updateSquadBonuses(this.dictatorPlayer.primarySquad);
      } catch { /* squad not initialized */ }
      try {
        this.updateSquadBonuses(this.dictatorPlayer.secondarySquad);
      } catch { /* squad not initialized */ }
    }
  }

  /**
   * Update Sarge's bonus for a specific squad (legacy method)
   */
  updateSargeBonusForSquad(squad: Squad): void {
    this.updateSquadBonuses(squad);
  }

  /**
   * Update all ability-based stat bonuses for a specific squad.
   * Uses unified updateAbilityBonuses() which reads from ability registry.
   * Handles: Sarge, Tack, Valkyrie, Snake, Tavisto, Haarg, and all equipment-conditional bonuses.
   */
  updateSquadBonuses(squad: Squad): void {
    if (!squad) return;
    const mercs = squad.getMercs();

    // Single unified update for all ability bonuses
    // Each MERC's updateAbilityBonuses builds context and computes activeStatModifiers
    for (const merc of mercs) {
      merc.updateAbilityBonuses(mercs);
    }
  }

  getDictatorMercsInSector(sector: Sector): CombatantModel[] {
    if (!this.dictatorPlayer) return [];
    return this.dictatorPlayer.hiredMercs.filter(m =>
      !m.isDead && m.sectorId === sector.sectorId
    );
  }

  getDictatorUnitsInSector(sector: Sector): number {
    const militia = sector.dictatorMilitia;
    const mercs = this.getDictatorMercsInSector(sector).length;
    // Count dictator card if in play at this sector
    const dictatorCard = this.dictatorPlayer?.dictator;
    const dictatorInSector = dictatorCard?.inPlay &&
      this.dictatorPlayer?.baseSectorId === sector.sectorId ? 1 : 0;
    return militia + mercs + dictatorInSector;
  }

  getRebelUnitsInSector(sector: Sector, player: RebelPlayer): number {
    const militia = sector.getRebelMilitia(`${player.seat}`);
    const mercs = this.getMercsInSector(sector, player).length;
    return militia + mercs;
  }

  getTotalRebelUnitsInSector(sector: Sector): number {
    let total = 0;
    for (const rebel of this.rebelPlayers) {
      total += this.getRebelUnitsInSector(sector, rebel);
    }
    return total;
  }

  /**
   * Check if a player can see a sector's stash contents.
   * Per rules (01-game-elements-and-components.md): Stash contents are not public knowledge.
   * A player can only see stash if they have units in the sector.
   */
  canSeeStash(sector: Sector, player: MERCPlayer): boolean {
    if (player.isDictator()) {
      return this.getDictatorUnitsInSector(sector) > 0;
    } else {
      return this.getRebelUnitsInSector(sector, player) > 0;
    }
  }

  /**
   * Get visible stash contents for a player.
   * Returns empty array if player cannot see the stash.
   */
  getVisibleStash(sector: Sector, player: MERCPlayer): Equipment[] {
    if (this.canSeeStash(sector, player)) {
      return [...sector.stash];
    }
    return [];
  }

  // ==========================================================================
  // MERC-a2h: Coordinated Attack Management
  // ==========================================================================

  /**
   * Declare a coordinated attack on a target sector.
   * Squad will wait for other participants before executing the attack.
   */
  declareCoordinatedAttack(targetSectorId: string, playerId: string, squadType: 'primary' | 'secondary'): void {
    if (!this.pendingCoordinatedAttacks.has(targetSectorId)) {
      this.pendingCoordinatedAttacks.set(targetSectorId, []);
    }
    const attacks = this.pendingCoordinatedAttacks.get(targetSectorId)!;

    // Don't add duplicate entries
    if (!attacks.some(a => a.playerId === playerId && a.squadType === squadType)) {
      attacks.push({ playerId, squadType });
      this.message(`Squad declared coordinated attack on sector`);
    }
  }

  /**
   * Get pending coordinated attacks for a target sector.
   */
  getPendingCoordinatedAttack(targetSectorId: string): Array<{ playerId: string; squadType: 'primary' | 'secondary' }> {
    return this.pendingCoordinatedAttacks.get(targetSectorId) || [];
  }

  /**
   * Clear pending coordinated attack for a target sector (after execution).
   */
  clearCoordinatedAttack(targetSectorId: string): void {
    this.pendingCoordinatedAttacks.delete(targetSectorId);
  }

  /**
   * Check if a squad has a pending coordinated attack declared.
   */
  hasCoordinatedAttackDeclared(playerId: string, squadType: 'primary' | 'secondary'): string | null {
    for (const [sectorId, attacks] of this.pendingCoordinatedAttacks.entries()) {
      if (attacks.some(a => a.playerId === playerId && a.squadType === squadType)) {
        return sectorId;
      }
    }
    return null;
  }

  /**
   * Cancel a squad's pending coordinated attack declaration.
   */
  cancelCoordinatedAttack(playerId: string, squadType: 'primary' | 'secondary'): void {
    for (const [sectorId, attacks] of this.pendingCoordinatedAttacks.entries()) {
      const index = attacks.findIndex(a => a.playerId === playerId && a.squadType === squadType);
      if (index >= 0) {
        attacks.splice(index, 1);
        if (attacks.length === 0) {
          this.pendingCoordinatedAttacks.delete(sectorId);
        }
        break;
      }
    }
  }

  // ==========================================================================
  // Game State Queries
  // ==========================================================================

  override isFinished(): boolean {
    // Game ends when:
    // 1. Dictator is defeated (dictator killed OR base captured by rebels)
    // 2. Dictator tactics deck and hand are empty
    // 3. All dictator units eliminated (militia + MERCs)
    // 4. All rebel units eliminated (MERCs + militia)
    // 5. Day limit reached (after Day 6)
    // 6. Explosives victory (rebels detonate in palace)

    // isDefeated now covers both dictator death AND base capture
    if (this.dictatorPlayer?.isDefeated) {
      return true;
    }

    // Check if rebels won via explosives detonation
    if (this.explosivesVictory) {
      return true;
    }

    if (this.dictatorPlayer?.tacticsDeck?.count(TacticsCard) === 0 &&
        this.dictatorPlayer?.tacticsHand?.count(TacticsCard) === 0) {
      return true;
    }

    // Check if all dictator units are eliminated (rebels win)
    if (this.allDictatorUnitsEliminated()) {
      return true;
    }

    // Check if all rebel units are eliminated (dictator wins)
    if (this.allRebelUnitsEliminated()) {
      return true;
    }

    // Day limit reached - game ends after Day 6
    if (this.isDayLimitReached()) {
      return true;
    }

    return false;
  }

  /**
   * Check if all dictator units have been eliminated.
   * This includes all militia across all sectors and all hired MERCs.
   * Only valid after Day 1 is complete (Day 2+).
   */
  allDictatorUnitsEliminated(): boolean {
    // Only check from Day 2 onwards - Day 1 is setup, units can't be eliminated yet
    if (this.currentDay < 2) return false;

    // Check for any militia on any sector
    const totalMilitia = this.gameMap.getAllSectors()
      .reduce((sum, s) => sum + s.dictatorMilitia, 0);
    if (totalMilitia > 0) return false;

    // Check for any living hired MERCs
    const livingMercs = this.dictatorPlayer?.hiredMercs.filter(m => !m.isDead) ?? [];
    if (livingMercs.length > 0) return false;

    // All dictator units eliminated
    return true;
  }

  /**
   * Check if all rebel units have been eliminated.
   * This includes all MERCs and militia for all rebel players.
   * Only valid after Day 1 is complete (Day 2+).
   */
  allRebelUnitsEliminated(): boolean {
    // Only check from Day 2 onwards - Day 1 is setup, units can't be eliminated yet
    if (this.currentDay < 2) return false;

    // No rebel players means nothing to check
    if (this.rebelPlayers.length === 0) return false;

    for (const rebel of this.rebelPlayers) {
      // Check if this rebel has living MERCs
      if (rebel.teamSize > 0) return false;

      // Check if this rebel has militia anywhere
      const hasAnyMilitia = this.gameMap.getAllSectors()
        .some(s => s.getRebelMilitia(`${rebel.seat}`) > 0);
      if (hasAnyMilitia) return false;

      // Note: We intentionally do NOT check canHireMerc here.
      // If rebels have no living units (MERCs or militia), they lose immediately.
      // The ability to potentially hire doesn't save them from elimination.
    }

    // All rebel units eliminated
    return true;
  }

  /**
   * Check if rebels have captured the dictator's base.
   * Base is captured when: base is revealed AND rebels control the sector
   * (no dictator militia/MERCs AND at least one rebel unit present)
   */
  isBaseCaptured(): boolean {
    if (!this.dictatorPlayer?.baseRevealed || !this.dictatorPlayer?.baseSectorId) {
      return false;
    }

    const baseSector = this.getSector(this.dictatorPlayer.baseSectorId);
    if (!baseSector) return false;

    // Base is captured if no dictator units AND rebels have units there
    // MERC-1e8: Must check for militia, dictator card, AND hired MERCs
    const hasDictatorUnits = baseSector.dictatorMilitia > 0 ||
      (this.dictatorPlayer.dictator && !this.dictatorPlayer.dictator.isDead) ||
      this.getDictatorMercsInSector(baseSector).length > 0;

    if (hasDictatorUnits) return false;

    // Check if any rebel has units at the base
    const hasRebelUnits = this.rebelPlayers.some(rebel => {
      const hasSquad = rebel.primarySquad.sectorId === baseSector.sectorId ||
        rebel.secondarySquad.sectorId === baseSector.sectorId;
      const hasMilitia = baseSector.getRebelMilitia(`${rebel.seat}`) > 0;
      return hasSquad || hasMilitia;
    });

    return hasRebelUnits;
  }

  /**
   * Calculate victory points for each side based on controlled sector values.
   * Per rules (11-victory-and-game-end.md): Sum values of controlled sectors.
   * Neutral sectors (no units) don't count toward anyone's total.
   */
  calculateVictoryPoints(): { rebelPoints: number; dictatorPoints: number } {
    let rebelPoints = 0;
    let dictatorPoints = 0;

    for (const sector of this.gameMap.getAllSectors()) {
      const dictatorUnits = this.getDictatorUnitsInSector(sector);
      const totalRebelUnits = this.getTotalRebelUnitsInSector(sector);

      // Skip neutral sectors (no units)
      if (dictatorUnits === 0 && totalRebelUnits === 0) continue;

      // Dictator wins ties
      if (dictatorUnits >= totalRebelUnits) {
        dictatorPoints += sector.value;
      } else {
        rebelPoints += sector.value;
      }
    }

    return { rebelPoints, dictatorPoints };
  }

  override getWinners(): MERCPlayer[] {
    if (!this.isFinished()) return [];

    // Helper to announce game end only once
    const announce = (msg: string) => {
      if (!this._gameEndAnnounced) {
        this._gameEndAnnounced = true;
        this.message(msg);
      }
    };

    // If dictator is defeated, rebels win
    if (this.dictatorPlayer?.isDefeated) {
      announce('Dictator defeated - Rebels win!');
      return [...this.rebelPlayers];
    }

    // If rebels captured the base, rebels win
    if (this.isBaseCaptured()) {
      announce('Dictator base captured - Rebels win!');
      return [...this.rebelPlayers];
    }

    // If rebels won via explosives detonation, rebels win
    if (this.explosivesVictory) {
      announce('Palace destroyed - Rebels win!');
      return [...this.rebelPlayers];
    }

    // If all dictator units eliminated, rebels win
    if (this.allDictatorUnitsEliminated()) {
      announce('All dictator forces eliminated - Rebels win!');
      return [...this.rebelPlayers];
    }

    // If all rebel units eliminated, dictator wins
    if (this.allRebelUnitsEliminated()) {
      announce('All rebel forces eliminated - Dictator wins!');
      return this.dictatorPlayer ? [this.dictatorPlayer] : [];
    }

    // If tactics deck empty, check victory points
    // Per rules (11-victory-and-game-end.md): Compare total sector values
    // Rebels win if they have MORE points than dictator; dictator wins ties
    if (this.dictatorPlayer?.tacticsDeck?.count(TacticsCard) === 0 &&
        this.dictatorPlayer?.tacticsHand?.count(TacticsCard) === 0) {
      const { rebelPoints, dictatorPoints } = this.calculateVictoryPoints();
      announce(`Final score - Rebels: ${rebelPoints}, Dictator: ${dictatorPoints}`);

      // Rebels must have strictly more points to win; dictator wins ties
      if (rebelPoints > dictatorPoints) {
        announce('Rebels win on points!');
        return [...this.rebelPlayers];
      } else {
        announce('Dictator wins on points!');
        return [this.dictatorPlayer];
      }
    }

    // Day limit reached - dictator wins
    if (this.isDayLimitReached()) {
      announce('Day limit reached - Dictator wins!');
    }

    // Otherwise dictator wins (day limit or other edge case)
    return this.dictatorPlayer ? [this.dictatorPlayer] : [];
  }

  // ==========================================================================
  // Game Constants Helper Methods
  // ==========================================================================

  /**
   * Calculate reinforcement militia gained when Dictator discards a Tactics card
   * Formula: floor(Rebel Players / 2) + 1
   */
  getReinforcementAmount(): number {
    return getReinforcementAmount(this.rebelCount);
  }

  /**
   * Check if a dice roll is a hit (4+ on d6)
   */
  isHit(roll: number): boolean {
    return roll >= CombatConstants.HIT_THRESHOLD;
  }

  /**
   * Roll a single d6 using seeded random
   */
  rollDie(): number {
    return Math.floor(this.random() * CombatConstants.DICE_SIDES) + 1;
  }

  /**
   * Roll multiple dice and return results
   */
  rollDice(count: number): number[] {
    const results: number[] = [];
    for (let i = 0; i < count; i++) {
      results.push(this.rollDie());
    }
    return results;
  }

  /**
   * Count hits from a set of dice results
   */
  countHits(rolls: number[]): number {
    return rolls.filter(r => this.isHit(r)).length;
  }

  /**
   * Check if game is in the setup day (Day 1 - The Landing)
   */
  isSetupDay(): boolean {
    return this.currentDay === GameDurationConstants.SETUP_DAY;
  }

  /**
   * Check if game is on the last day
   */
  isLastDay(): boolean {
    return this.currentDay >= GameDurationConstants.LAST_DAY;
  }

  /**
   * Get total game days
   */
  getTotalDays(): number {
    return GameDurationConstants.TOTAL_DAYS;
  }

  /**
   * Get remaining days in the game
   */
  getRemainingDays(): number {
    return Math.max(0, GameDurationConstants.LAST_DAY - this.currentDay);
  }

  // ==========================================================================
  // Day Management
  // ==========================================================================

  advanceDay(): void {
    this.currentDay++;

    // Reset all rebel MERC actions
    for (const rebel of this.rebelPlayers) {
      for (const merc of rebel.team) {
        merc.resetActions();
        // MERC-4t3: Preaction auto-heals 1 health at the start of each day
        if (merc.combatantId === 'preaction' && merc.damage > 0) {
          const healed = merc.heal(1);
          if (healed > 0) {
            this.message(`Preaction auto-heals 1 health (${merc.health}/${merc.maxHealth})`);
          }
        }
      }
    }

    // Reset dictator MERC actions
    for (const merc of this.dictatorPlayer.hiredMercs) {
      merc.resetActions();
      // MERC-4t3: Preaction auto-heals 1 health at the start of each day
      if (merc.combatantId === 'preaction' && merc.damage > 0) {
        const healed = merc.heal(1);
        if (healed > 0) {
          this.message(`Preaction auto-heals 1 health (${merc.health}/${merc.maxHealth})`);
        }
      }
    }

    // Reset dictator card actions if in play
    if (this.dictatorPlayer.dictator?.inPlay) {
      this.dictatorPlayer.dictator.actionsRemaining = 2;
    }
  }

  /**
   * Check if the game should end due to day limit
   */
  isDayLimitReached(): boolean {
    return this.currentDay > GameDurationConstants.LAST_DAY;
  }
}
