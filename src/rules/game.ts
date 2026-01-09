import { Game, Player, type GameOptions, type ElementClass } from '@boardsmith/engine';
import {
  MercCard,
  Equipment,
  Sector,
  DictatorCard,
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
import mercsData from '../../data/mercs.json';
import equipmentData from '../../data/equipment.json';
import sectorsData from '../../data/sectors.json';
import dictatorsData from '../../data/dictators.json';
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
  dictatorId?: string;  // Which dictator character to use
  expansionModes?: string[]; // 'A' for vehicles, 'B' for I, Dictator
  dictatorIsAI?: boolean;  // MERC-exaf: Explicitly set if dictator is AI-controlled
  // MERC-pbx4: Role selection - which player position is the dictator
  // Default: last player (position = playerCount - 1)
  // Set to 0 for first player, 1 for second player, etc.
  dictatorPlayerPosition?: number;
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

interface MercData {
  id: string;
  name: string;
  quantity: number;
  training: number;
  combat: number;
  initiative: number;
  ability: string;
  bio: string;
  image: string;
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

interface DictatorData {
  id: string;
  name: string;
  quantity: number;
  initiative: number;
  combat: number;
  training: number;
  ability: string;
  bio: string;
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
// Player Classes
// =============================================================================

export class RebelPlayer extends Player {
  playerColor!: PlayerColor;
  playerColorHex?: string;  // Hex color from lobby, if set

  // Squad refs - store IDs instead of direct references to avoid stale refs after deserialization
  primarySquadRef!: string;
  secondarySquadRef!: string;

  // Player area ref
  areaRef!: string;

  // Getters that look up elements fresh from the game tree
  // Using name-based lookups to avoid stale object references after deserialization
  get primarySquad(): Squad {
    const game = this.game as MERCGame;
    if (!game) {
      throw new Error(`primarySquad: game not set for player ${this.position}`);
    }
    const squad = game.first(Squad, s => s.name === this.primarySquadRef);
    if (!squad) {
      throw new Error(`primarySquad: could not find squad "${this.primarySquadRef}" for player ${this.position}`);
    }
    return squad;
  }

  get secondarySquad(): Squad {
    const game = this.game as MERCGame;
    if (!game) {
      throw new Error(`secondarySquad: game not set for player ${this.position}`);
    }
    const squad = game.first(Squad, s => s.name === this.secondarySquadRef);
    if (!squad) {
      throw new Error(`secondarySquad: could not find squad "${this.secondarySquadRef}" for player ${this.position}`);
    }
    return squad;
  }

  get area(): PlayerArea {
    const game = this.game as MERCGame;
    if (!game) {
      throw new Error(`area: game not set for player ${this.position}`);
    }
    const area = game.first(PlayerArea, a => a.name === this.areaRef);
    if (!area) {
      throw new Error(`area: could not find area "${this.areaRef}" for player ${this.position}`);
    }
    return area;
  }

  get team(): MercCard[] {
    // Return only living MERCs (dead MERCs can't take actions)
    const mercs: MercCard[] = [];
    const primary = this.primarySquad;
    const secondary = this.secondarySquad;
    if (primary) mercs.push(...primary.getLivingMercs());
    if (secondary) mercs.push(...secondary.getLivingMercs());
    return mercs;
  }

  get teamSize(): number {
    // MERC-0ue: Teresa doesn't count toward team limit
    return this.team.filter(m => m.mercId !== 'teresa').length;
  }

  // Team limit: BASE_TEAM_LIMIT + controlled sectors (from game constants)
  getTeamLimit(game: MERCGame): number {
    return TeamConstants.BASE_TEAM_LIMIT + game.getControlledSectors(this).length;
  }

  canHireMerc(game: MERCGame): boolean {
    return this.teamSize < this.getTeamLimit(game);
  }

  /**
   * Find which squad contains a specific MERC.
   * Returns null if the MERC is not in either squad.
   */
  getSquadContaining(merc: MercCard): Squad | null {
    if (this.primarySquad.getMercs().some(m => m.id === merc.id)) {
      return this.primarySquad;
    }
    if (this.secondarySquad.getMercs().some(m => m.id === merc.id)) {
      return this.secondarySquad;
    }
    return null;
  }

  /**
   * Check if a squad belongs to this player.
   */
  ownsSquad(squad: Squad): boolean {
    return squad.name === this.primarySquadRef ||
           squad.name === this.secondarySquadRef;
  }
}

export class DictatorPlayer extends Player {
  dictator!: DictatorCard;
  tacticsDeck!: TacticsDeck;
  tacticsHand!: TacticsHand;
  tacticsDiscard!: DiscardPile;

  // Squad refs - store IDs instead of direct references to avoid stale refs after deserialization
  // Dictator has 2 squads just like rebels
  primarySquadRef!: string;
  secondarySquadRef!: string;

  // Legacy mercSquad for backward compatibility during migration
  mercSquad!: Squad;
  mercSquadRef!: string;

  // Base state
  baseRevealed: boolean = false;
  baseSectorId?: string;

  // Sector where the Dictator's forces are stationed
  stationedSectorId?: string;

  // MERC-exaf: AI mode - dictator plays cards from deck top, no hand
  // Default to false (human) - set explicitly via game options or when AI is detected
  isAI: boolean = false;

  // MERC-q4v: Privacy Player - Rebel designated to handle AI decisions
  privacyPlayerId?: string;

  // Getters that look up elements fresh from the game tree
  get primarySquad(): Squad {
    const game = this.game as MERCGame;
    if (!game) {
      throw new Error(`primarySquad: game not set for dictator`);
    }
    const squad = game.first(Squad, s => s.name === this.primarySquadRef);
    if (!squad) {
      throw new Error(`primarySquad: could not find squad "${this.primarySquadRef}" for dictator`);
    }
    return squad;
  }

  get secondarySquad(): Squad {
    const game = this.game as MERCGame;
    if (!game) {
      throw new Error(`secondarySquad: game not set for dictator`);
    }
    const squad = game.first(Squad, s => s.name === this.secondarySquadRef);
    if (!squad) {
      throw new Error(`secondarySquad: could not find squad "${this.secondarySquadRef}" for dictator`);
    }
    return squad;
  }

  // hiredMercs returns living MERCs from both squads (excludes dead)
  get hiredMercs(): MercCard[] {
    const mercs: MercCard[] = [];
    try {
      mercs.push(...this.primarySquad.getLivingMercs());
    } catch { /* Squad not initialized yet */ }
    try {
      mercs.push(...this.secondarySquad.getLivingMercs());
    } catch { /* Squad not initialized yet */ }
    return mercs;
  }

  // Get all MERCs including dead ones (for certain game logic)
  get allMercs(): MercCard[] {
    const mercs: MercCard[] = [];
    try {
      mercs.push(...this.primarySquad.getMercs());
    } catch { /* Squad not initialized yet */ }
    try {
      mercs.push(...this.secondarySquad.getMercs());
    } catch { /* Squad not initialized yet */ }
    return mercs;
  }

  get isDefeated(): boolean {
    return this.baseRevealed && this.dictator?.isDead;
  }

  get team(): MercCard[] {
    return this.hiredMercs;
  }

  get teamSize(): number {
    return this.team.length;
  }

  /**
   * Get the squad containing a specific MERC.
   * Returns null if the MERC is not in either squad.
   */
  getSquadContaining(merc: MercCard): Squad | null {
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
           squad.name === this.secondarySquadRef;
  }
}

// Type alias for the player union
export type MERCPlayer = RebelPlayer | DictatorPlayer;

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

export class MERCGame extends Game<MERCGame, MERCPlayer> {
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

  // Tactics card state (permanent effects)
  conscriptsActive?: boolean;  // Conscripts card: add militia each turn
  conscriptsAmount?: number;   // Amount of militia to add per turn
  oilReservesActive?: boolean; // Oil Reserves card: controller gets free action

  // Game state
  // Use 'declare' to avoid class field initialization overwriting the value set in createPlayer()
  declare dictatorPlayer: DictatorPlayer;

  // Use getter to always get fresh player references from the BoardSmith-managed players array
  get rebelPlayers(): RebelPlayer[] {
    return this.players.filter((p): p is RebelPlayer => p instanceof RebelPlayer);
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
    selectedTargets?: Map<string, string[]>; // attackerId -> targetIds
    // Medical Kit healing: dice discarded per combatant this round
    healingDiceUsed?: Map<string, number>; // combatantId -> dice discarded
    // MERC-dice: Combat dice UI state
    pendingHitAllocation?: {
      attackerId: string;
      attackerName: string;
      attackerMercId: string; // For ability checks (Basic, Wolverine)
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
  } | null = null;

  // MERC-t5k: Pending combat - set by move action, initiated by flow
  // This allows proper UI refresh between move and combat
  pendingCombat: {
    sectorId: string;
    playerId: string;
  } | null = null;

  // Explosives victory - set when rebels detonate explosives in palace
  explosivesVictory: boolean = false;

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
  lastExplorer: { mercId: string; sectorId: string } | null = null;

  // Pending loot cache for explore action
  // Caches equipment IDs during selection phase to avoid multiple draws
  // Changed to Map to support multiple MERCs in different unexplored sectors
  // Using persistentMap to survive HMR - stores equipment IDs (numbers) not element refs
  pendingLootMap = this.persistentMap<string, number[]>('pendingLootMap');

  // Hagness ability staging - holds drawn equipment during selection
  // Plain object to ensure it serializes to clients
  // Key: player position (string), Value: serialized equipment data for UI display
  hagnessDrawnEquipmentData: Record<string, {
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
  }> = {};

  // Static reference data loaded from JSON - stored in settings to survive HMR
  // These are loaded once during initializeGame() and don't change during gameplay
  get mercData(): MercData[] {
    return this.settings.mercData || [];
  }
  set mercData(data: MercData[]) {
    this.settings.mercData = data;
  }

  get equipmentData(): EquipmentData[] {
    return this.settings.equipmentData || [];
  }
  set equipmentData(data: EquipmentData[]) {
    this.settings.equipmentData = data;
  }

  get sectorData(): SectorData[] {
    return this.settings.sectorData || [];
  }
  set sectorData(data: SectorData[]) {
    this.settings.sectorData = data;
  }

  get dictatorData(): DictatorData[] {
    return this.settings.dictatorData || [];
  }
  set dictatorData(data: DictatorData[]) {
    this.settings.dictatorData = data;
  }

  get tacticsData(): TacticsData[] {
    return this.settings.tacticsData || [];
  }
  set tacticsData(data: TacticsData[]) {
    this.settings.tacticsData = data;
  }

  get setupConfigurations(): SetupConfiguration[] {
    return this.settings.setupConfigurations || [];
  }
  set setupConfigurations(data: SetupConfiguration[]) {
    this.settings.setupConfigurations = data;
  }

  constructor(options: MERCOptions) {
    // Store playerCount before super() so createPlayer can access it
    // Default to 2 players if not specified (1 rebel + 1 dictator)
    MERCGame._pendingPlayerCount = options.playerCount ?? 2;

    // Store player configs from lobby
    MERCGame._pendingPlayerConfigs = options.playerConfigs || [];

    // Find dictator position from:
    // 1. playerConfigs with isDictator: true (from exclusive player option)
    // 2. dictatorPlayerPosition option (legacy)
    // 3. Default to last player
    let dictatorPos = -1;  // -1 means last player

    // Check playerConfigs for isDictator flag (from exclusive player option in lobby)
    const playerConfigs = options.playerConfigs || [];
    const dictatorConfigIndex = playerConfigs.findIndex(
      (config: any) => config.isDictator === true
    );
    if (dictatorConfigIndex >= 0) {
      dictatorPos = dictatorConfigIndex;
    } else if (options.dictatorPlayerPosition !== undefined) {
      dictatorPos = options.dictatorPlayerPosition;
    }

    // Validate position if explicitly set
    if (dictatorPos >= 0 && dictatorPos >= MERCGame._pendingPlayerCount) {
      throw new Error(
        `Invalid dictator position: ${dictatorPos}. ` +
        `Must be less than playerCount (${MERCGame._pendingPlayerCount}).`
      );
    }
    MERCGame._pendingDictatorPosition = dictatorPos;

    super(options);

    // Register all element classes for serialization
    // Cast to ElementClass is safe - these are all valid GameElement subclasses
    // The cast is needed because our constructors have additional parameters beyond ElementContext
    this._ctx.classRegistry.set('MercCard', MercCard as unknown as ElementClass);
    this._ctx.classRegistry.set('Equipment', Equipment as unknown as ElementClass);
    this._ctx.classRegistry.set('Sector', Sector as unknown as ElementClass);
    this._ctx.classRegistry.set('DictatorCard', DictatorCard as unknown as ElementClass);
    this._ctx.classRegistry.set('TacticsCard', TacticsCard as unknown as ElementClass);
    this._ctx.classRegistry.set('Squad', Squad as unknown as ElementClass);
    this._ctx.classRegistry.set('MercDeck', MercDeck as unknown as ElementClass);
    this._ctx.classRegistry.set('EquipmentDeck', EquipmentDeck as unknown as ElementClass);
    this._ctx.classRegistry.set('TacticsDeck', TacticsDeck as unknown as ElementClass);
    this._ctx.classRegistry.set('TacticsHand', TacticsHand as unknown as ElementClass);
    this._ctx.classRegistry.set('DiscardPile', DiscardPile as unknown as ElementClass);
    this._ctx.classRegistry.set('GameMap', GameMap as unknown as ElementClass);
    this._ctx.classRegistry.set('PlayerArea', PlayerArea as unknown as ElementClass);

    // Determine rebel count from players or options
    this.rebelCount = options.rebelCount ?? Math.max(1, this.players.length - 1);

    // Safety check: ensure dictatorPlayer was created
    if (!this.dictatorPlayer) {
      const dictPos = MERCGame._pendingDictatorPosition >= 0
        ? MERCGame._pendingDictatorPosition
        : MERCGame._pendingPlayerCount - 1;
      throw new Error(
        `DictatorPlayer not created. Players: ${this.players.length}, ` +
        `pendingCount: ${MERCGame._pendingPlayerCount}, dictatorPosition: ${dictPos}`
      );
    }

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
    this.loadMercData(mercsData as MercData[]);
    this.loadEquipmentData(equipmentData as EquipmentData[], options.expansionModes);
    this.loadSectorData(sectorsData as SectorData[]);
    this.loadDictatorData(dictatorsData as DictatorData[]);
    this.loadTacticsData(tacticsData as TacticsData[]);

    // Perform initial setup (build map, select dictator, etc.)
    // Use dictatorCharacter from gameOptions, or dictatorId for legacy/direct API
    const dictatorCharacter = options.gameOptions?.dictatorCharacter;
    const dictatorId = dictatorCharacter && dictatorCharacter !== 'random'
      ? dictatorCharacter
      : options.dictatorId;
    this.performSetup(dictatorId, undefined, options.debugTacticsOrder);
  }

  protected override createPlayer(position: number, name: string): MERCPlayer {
    // MERC-pbx4: Determine which position is the dictator
    // If dictatorPlayerPosition is set, use that; otherwise default to last player
    const totalPlayers = MERCGame._pendingPlayerCount;
    const dictatorPosition = MERCGame._pendingDictatorPosition >= 0
      ? MERCGame._pendingDictatorPosition
      : totalPlayers - 1;
    const isDictator = position === dictatorPosition;

    if (isDictator) {
      const dictator = new DictatorPlayer(position, name);
      dictator.game = this;
      this.dictatorPlayer = dictator;

      // Create two squads for dictator (just like rebels)
      const primaryRef = `squad-dictator-primary`;
      const secondaryRef = `squad-dictator-secondary`;
      this.create(Squad, primaryRef, { isPrimary: true });
      this.create(Squad, secondaryRef, { isPrimary: false });

      dictator.primarySquadRef = primaryRef;
      dictator.secondarySquadRef = secondaryRef;

      // Legacy mercSquad points to primary for backward compatibility
      dictator.mercSquadRef = primaryRef;
      dictator.mercSquad = this.first(Squad, s => s.name === primaryRef)!;

      return dictator;
    } else {
      const rebel = new RebelPlayer(position, name);
      rebel.game = this;

      // Assign color from player config or default based on position
      // Note: position is 1-indexed, but arrays are 0-indexed
      const playerConfig = MERCGame._pendingPlayerConfigs[position - 1];
      if (playerConfig?.color) {
        // Store hex color directly - UI will use this
        rebel.playerColorHex = playerConfig.color;
        // Also set legacy PlayerColor for compatibility (map hex to name)
        rebel.playerColor = hexToPlayerColor(playerConfig.color);
      } else {
        const colors: PlayerColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
        rebel.playerColor = colors[(position - 1) % colors.length];
      }

      // Create squads for rebel and store refs (not direct references)
      const primaryRef = `squad-${position}-primary`;
      const secondaryRef = `squad-${position}-secondary`;
      const areaRef = `area-${position}`;

      this.create(Squad, primaryRef, { isPrimary: true });
      this.create(Squad, secondaryRef, { isPrimary: false });
      this.create(PlayerArea, areaRef, { position, playerColor: rebel.playerColor });

      rebel.primarySquadRef = primaryRef;
      rebel.secondarySquadRef = secondaryRef;
      rebel.areaRef = areaRef;

      return rebel;
    }
  }

  /**
   * Check if a player is a rebel (not the dictator).
   * Type guard that narrows the player type to RebelPlayer.
   * Accepts unknown to work with BoardSmith framework's Player type.
   */
  isRebelPlayer(player: unknown): player is RebelPlayer {
    return player instanceof RebelPlayer;
  }

  /**
   * Check if a player is the dictator.
   * Type guard that narrows the player type to DictatorPlayer.
   * Accepts unknown to work with BoardSmith framework's Player type.
   */
  isDictatorPlayer(player: unknown): player is DictatorPlayer {
    return player instanceof DictatorPlayer;
  }

  // ==========================================================================
  // Data Loading Methods
  // ==========================================================================

  loadMercData(data: MercData[]): void {
    this.mercData = data;
    for (const merc of data) {
      for (let i = 0; i < merc.quantity; i++) {
        const suffix = merc.quantity > 1 ? `-${i + 1}` : '';
        const mercCard = this.mercDeck.create(MercCard, `merc-${merc.id}${suffix}`, {
          mercId: merc.id,
          mercName: merc.name,
          bio: merc.bio,
          ability: merc.ability,
          image: merc.image,
          baseInitiative: merc.initiative,
          baseTraining: merc.training,
          baseCombat: merc.combat,
        });
        // Initialize computed stats (no equipment yet, so just base stats)
        mercCard.updateComputedStats();
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

  loadDictatorData(data: DictatorData[]): void {
    this.dictatorData = data;
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

  // Legacy method for array-based loading
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
   * @param dictatorId - Optional specific dictator to use (random if not specified)
   * @param activeTacticsCount - Number of active tactics cards (default: 5)
   * @param debugTacticsOrder - Debug: specific tactics IDs in draw order (first = top)
   */
  performSetup(dictatorId?: string, activeTacticsCount?: number, debugTacticsOrder?: string[]): void {
    if (!this.setupConfig) {
      throw new Error('Setup configuration not loaded. Call loadSetupConfig first.');
    }

    if (this.sectorData.length === 0) {
      throw new Error('Sector data not loaded. Call loadSectorData first.');
    }

    if (this.dictatorData.length === 0) {
      throw new Error('Dictator data not loaded. Call loadDictatorData first.');
    }

    if (this.tacticsData.length === 0) {
      throw new Error('Tactics data not loaded. Call loadTacticsData first.');
    }

    // Check for debug tactics order in settings as well
    const effectiveTacticsOrder = debugTacticsOrder || this.settings.debugTacticsOrder as string[] | undefined;

    // Skip dictator setup if human player will choose (no dictatorId specified and not AI)
    const skipDictatorSetup = !dictatorId && !this.dictatorPlayer?.isAI;

    performSetup(this, {
      sectorData: this.sectorData as SetupSectorData[],
      dictatorData: this.dictatorData as SetupDictatorData[],
      tacticsData: this.tacticsData as SetupTacticsData[],
      dictatorId,
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
  setupDictator(dictatorId?: string): DictatorCard {
    if (this.dictatorData.length === 0) {
      throw new Error('Dictator data not loaded');
    }
    return setupDictator(this, this.dictatorData as SetupDictatorData[], dictatorId);
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

  drawMerc(): MercCard | undefined {
    // Draw to discard as holding area (caller will putInto final destination)
    let drawn = this.mercDeck.drawTo(this.mercDiscard, 1, MercCard);

    // If deck is empty, reshuffle discard and try again
    if (drawn.length === 0 && this.mercDiscard.count(MercCard) > 0) {
      for (const merc of this.mercDiscard.all(MercCard)) {
        merc.putInto(this.mercDeck);
      }
      this.mercDeck.shuffle();
      drawn = this.mercDeck.drawTo(this.mercDiscard, 1, MercCard);
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

      if (player instanceof DictatorPlayer) {
        // Dictator controls if they have equal or more units than all rebels combined
        // Per rules: "Dictator wins all ties" (02-game-constants-and-configuration.md)
        return dictatorUnits >= totalRebelUnits && dictatorUnits > 0;
      } else {
        // Rebel controls if they have more units than dictator and other rebels
        const rebel = player as RebelPlayer;
        const rebelUnits = this.getRebelUnitsInSector(sector, rebel);

        // Must have more units than dictator (dictator wins ties)
        if (dictatorUnits >= rebelUnits) return false;

        // MERC-eqe: Check against other rebels with tie-breaker
        // Lower position (earlier in turn order) wins ties between rebels
        for (const otherRebel of this.rebelPlayers) {
          if (otherRebel === rebel) continue;
          const otherUnits = this.getRebelUnitsInSector(sector, otherRebel);
          // Other rebel has strictly more units - they win
          if (otherUnits > rebelUnits) return false;
          // Tied units: lower position wins
          if (otherUnits === rebelUnits && otherRebel.position < rebel.position) return false;
        }

        return rebelUnits > 0;
      }
    });
  }

  getMercsInSector(sector: Sector, player: RebelPlayer): MercCard[] {
    const mercs: MercCard[] = [];

    if (player.primarySquad?.sectorId === sector.sectorId) {
      mercs.push(...player.primarySquad.getMercs());
    }
    if (player.secondarySquad?.sectorId === sector.sectorId) {
      mercs.push(...player.secondarySquad.getMercs());
    }

    return mercs;
  }

  /**
   * Update Haarg's ability bonuses for all squads.
   * Call this whenever squad composition changes (hiring, movement, death, etc.)
   */
  updateAllHaargBonuses(): void {
    // Check all rebel squads
    for (const rebel of this.rebelPlayers) {
      try {
        this.updateHaargBonusForSquad(rebel.primarySquad);
      } catch { /* squad not initialized */ }
      try {
        this.updateHaargBonusForSquad(rebel.secondarySquad);
      } catch { /* squad not initialized */ }
    }
    // Check dictator squads (in case Haarg is hired by dictator)
    if (this.dictatorPlayer) {
      try {
        this.updateHaargBonusForSquad(this.dictatorPlayer.primarySquad);
      } catch { /* squad not initialized */ }
      try {
        this.updateHaargBonusForSquad(this.dictatorPlayer.secondarySquad);
      } catch { /* squad not initialized */ }
    }
  }

  /**
   * Update Haarg's bonus for a specific squad
   */
  updateHaargBonusForSquad(squad: Squad): void {
    if (!squad) return;
    const mercs = squad.getMercs();
    const haarg = mercs.find(m => m.mercId === 'haarg');
    if (haarg) {
      haarg.updateHaargBonus(mercs);
    }
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
   * Update all squad-based bonuses (Sarge, Tack, Valkyrie, Snake, Tavisto) for a specific squad
   */
  updateSquadBonuses(squad: Squad): void {
    if (!squad) return;
    const mercs = squad.getMercs();

    // Update Sarge's bonus
    const sarge = mercs.find(m => m.mercId === 'sarge');
    if (sarge) {
      sarge.updateSargeBonus(mercs);
    }

    // Update Tack's squad bonus for ALL mercs in the squad
    // (Tack gives +2 initiative to everyone when she has highest initiative)
    for (const merc of mercs) {
      merc.updateTackSquadBonus(mercs);
    }

    // Update Valkyrie's squad bonus for ALL mercs in the squad
    // (Valkyrie gives +1 initiative to squad mates, not herself)
    for (const merc of mercs) {
      merc.updateValkyrieSquadBonus(mercs);
    }

    // Update Snake's solo bonus (when alone in squad)
    for (const merc of mercs) {
      merc.updateSnakeBonus(mercs);
    }

    // Update Tavisto's woman-in-squad bonus
    for (const merc of mercs) {
      merc.updateTavistoBonus(mercs);
    }
  }

  getDictatorMercsInSector(sector: Sector): MercCard[] {
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
    const militia = sector.getRebelMilitia(`${player.position}`);
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
    if (player instanceof DictatorPlayer) {
      return this.getDictatorUnitsInSector(sector) > 0;
    } else {
      const rebel = player as RebelPlayer;
      return this.getRebelUnitsInSector(sector, rebel) > 0;
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
    // 1. Dictator is defeated (base revealed and dictator killed)
    // 2. Rebels capture the Dictator's base (base revealed and rebels control sector)
    // 3. Dictator tactics deck and hand are empty
    // 4. All rebels are eliminated
    // 5. Day limit reached (after Day 6)
    // 6. All dictator units eliminated (militia + MERCs)
    // 7. All rebel units eliminated (MERCs + militia)

    if (this.dictatorPlayer?.isDefeated) {
      return true;
    }

    // Check if rebels captured the base
    if (this.isBaseCaptured()) {
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
        .some(s => s.getRebelMilitia(`${rebel.position}`) > 0);
      if (hasAnyMilitia) return false;

      // Check if rebel can still hire (has funds and MERCs available)
      if (rebel.canHireMerc(this)) return false;
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
      const hasMilitia = baseSector.getRebelMilitia(`${rebel.position}`) > 0;
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

    // If dictator is defeated, rebels win
    if (this.dictatorPlayer?.isDefeated) {
      return [...this.rebelPlayers];
    }

    // If rebels captured the base, rebels win
    if (this.isBaseCaptured()) {
      return [...this.rebelPlayers];
    }

    // If rebels won via explosives detonation, rebels win
    if (this.explosivesVictory) {
      return [...this.rebelPlayers];
    }

    // If all dictator units eliminated, rebels win
    if (this.allDictatorUnitsEliminated()) {
      this.message('All dictator forces eliminated - Rebels win!');
      return [...this.rebelPlayers];
    }

    // If all rebel units eliminated, dictator wins
    if (this.allRebelUnitsEliminated()) {
      this.message('All rebel forces eliminated - Dictator wins!');
      return this.dictatorPlayer ? [this.dictatorPlayer] : [];
    }

    // If tactics deck empty, check victory points
    // Per rules (11-victory-and-game-end.md): Compare total sector values
    // Rebels win if they have MORE points than dictator; dictator wins ties
    if (this.dictatorPlayer?.tacticsDeck?.count(TacticsCard) === 0 &&
        this.dictatorPlayer?.tacticsHand?.count(TacticsCard) === 0) {
      const { rebelPoints, dictatorPoints } = this.calculateVictoryPoints();
      this.message(`Final score - Rebels: ${rebelPoints}, Dictator: ${dictatorPoints}`);

      // Rebels must have strictly more points to win; dictator wins ties
      if (rebelPoints > dictatorPoints) {
        return [...this.rebelPlayers];
      } else {
        return [this.dictatorPlayer];
      }
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
   * Roll a single d6
   */
  rollDie(): number {
    return Math.floor(Math.random() * CombatConstants.DICE_SIDES) + 1;
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
        if (merc.mercId === 'preaction' && merc.damage > 0) {
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
      if (merc.mercId === 'preaction' && merc.damage > 0) {
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
