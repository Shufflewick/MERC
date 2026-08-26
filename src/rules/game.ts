import { Game, Player, type GameOptions } from 'boardsmith';
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
import { doesntCountTowardLimit, getAutoHealPerDay } from './merc-abilities.js';

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
  isBot?: boolean;
  botLevel?: string;
}

export interface MERCOptions extends GameOptions {
  seed?: string;
  rebelCount?: number;  // 1-6 rebels
  dictatorChoice?: string;  // Which dictator character to use
  expansionModes?: string[]; // 'A' for vehicles, 'B' for I, Dictator
  dictatorIsBot?: boolean;  // MERC-exaf: Explicitly set if dictator is Bot-controlled
  // MERC-pbx4: Role selection - which player seat is the dictator
  // Default: last player (seat = playerCount - 1)
  // Set to 0 for first player, 1 for second player, etc.
  dictatorPlayerSeat?: number;
  // Player configurations from lobby (colors, Bot settings)
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

/** The engine's final verdict on a finished game. */
export interface VictoryOutcome {
  winner: 'rebels' | 'dictator';
  /** Human-readable statement of how the game was won. */
  reason: string;
  rebelPoints: number;
  dictatorPoints: number;
}

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
  /**
   * Free move actions this player holds (Oil Reserves). Spent by the move
   * actions before charging a MERC's own actions; never banked past one turn.
   */
  freeMoveActions: number = 0;
  isBot: boolean = false;
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

  /**
   * Every squad this player owns that has been built yet.
   *
   * Squad lookup throws while setup is still running, so callers that may run
   * mid-setup use this instead of catching — a catch here would also swallow
   * genuine errors from inside the squad and quietly shrink the roster.
   */
  get squads(): Squad[] {
    const game = this.game as MERCGame | undefined;
    if (!game) return [];

    const refs = [this.primarySquadRef, this.secondarySquadRef];
    if (this.isDictator()) refs.push(this.baseSquadRef);

    const squads: Squad[] = [];
    for (const ref of refs) {
      if (!ref) continue;
      const squad = game.first(Squad, s => s.name === ref);
      if (squad) squads.push(squad);
    }
    return squads;
  }

  /** The dictator's base squad, or null while setup has not created it yet. */
  get baseSquadOrNull(): Squad | null {
    if (!this.isDictator() || !this.baseSquadRef) return null;
    const game = this.game as MERCGame | undefined;
    if (!game) return null;
    return game.first(Squad, s => s.name === this.baseSquadRef) ?? null;
  }

  get team(): CombatantModel[] {
    // Return only living MERCs (dead MERCs can't take actions)
    return this.squads.flatMap(squad => squad.getLivingMercs());
  }

  get teamSize(): number {
    if (this.isRebel()) {
      // MERC-0ue: some MERCs (Teresa) don't count toward the team limit
      return this.team.filter(m => !doesntCountTowardLimit(m.combatantId)).length;
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
    for (const squad of this.squads) {
      if (squad.getMercs().some(m => m.id === merc.id)) return squad;
    }
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
  // Player configurations from lobby (colors, Bot settings)
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
  get dictatorPlayer(): MERCPlayer {
    // Always resolve from the live element tree — never cache across calls. A
    // cached reference goes stale when a snapshot restore rebuilds the tree
    // (GameRunner.fromSnapshot → loadSerializedState): the cached player becomes
    // an orphan whose `.dictator` is the orphaned (pre-rebuild) combatant. Acting
    // through it — e.g. dictator.putInto(baseSquad) on base-reveal — then moves
    // that orphan into the base squad while the rebuilt combatant stays at the
    // root, so the dictator combatant exists in TWO places (tree corruption).
    const player = this.first(MERCPlayer, p => p.isDictator());
    if (!player) {
      throw new Error('Dictator player not found');
    }
    return player;
  }

  // Get all rebel players
  get rebelPlayers(): MERCPlayer[] {
    return this.players.filter(p => p.isRebel());
  }

  // MERC-a2h: Multi-player coordinated attack state
  // Set when a rebel declares a multi-player attack; cleared after execution
  coordinatedAttack: {
    targetSectorId: string;
    declaringPlayerSeat: number;
    committedSquads: Array<{ playerSeat: number; squadType: 'primary' | 'secondary' }>;
    declinedPlayers: number[]; // seats that explicitly declined
  } | null = null;

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
    // Golem: "May attack any 1 target before the first round of combat."
    // Optional, so a human-controlled Golem is asked rather than auto-fired.
    pendingGolemAttack?: {
      golemId: string;
      golemName: string;
      validTargets: Array<{
        id: string;
        name: string;
        isMerc: boolean;
        currentHealth: number;
        maxHealth: number;
      }>;
    };
    // Adelheid: "Each hit targeting militia can convert the militia to her side
    // rather than killing it." Per-combat, per-Adelheid toggle; convert by default.
    adelheidKillsInstead?: string[];
    // Golem ids whose pre-combat choice has already been made this combat.
    golemResolved?: string[];
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
    // Locked initiative order for current round (combatant IDs in sorted order)
    // Persists across mid-round pauses so initiative isn't recalculated on resume
    roundInitiativeOrder?: string[];
    // MERC-retreat: Simultaneous retreat/continue decision tracking
    awaitingRetreatDecisions?: boolean;
    // seat -> decision. Map, like its siblings above: the engine's attribute
    // serializer round-trips Map and Set intact (see the engine's
    // map-set-persistence tests, written for this very combat state).
    retreatDecisions?: Map<string, { action: 'continue' | 'retreat'; retreatSectorId?: string; retreatSquadName?: string }>;
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

  /**
   * The engine's final verdict, published on game end so the UI can render it
   * verbatim rather than re-deriving control, points and the winner.
   */
  victoryOutcome: VictoryOutcome | null = null;

  // Flag to track if game end has been announced (prevents duplicate messages)
  private _gameEndAnnounced: boolean = false;

  // Bot rebel action batching state (private = ephemeral, not serialized to clients)
  // Tracks per-Bot-rebel action counts and the current batch round within a simultaneous step
  private _rebelActionCounts: Map<number, number> = new Map();
  private _rebelBatchRound: number = 0;

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

  // Pending Generalissimo hire — dictator picks 1 of 6 drawn MERCs
  pendingGeneralissimoHire: {
    drawnMercIds: number[];  // Element IDs of the 6 drawn MERCs
  } | null = null;

  get hasGeneralissimoPending(): boolean {
    return this.pendingGeneralissimoHire !== null;
  }

  // Pending Lockdown militia placement — dictator places militia on base/adjacent sectors
  pendingLockdownMilitia: {
    remaining: number;           // Militia left to place
    validSectorIds: string[];    // Base sector + adjacent sector IDs
  } | null = null;

  get hasLockdownPending(): boolean {
    return this.pendingLockdownMilitia !== null;
  }

  // Pending Seizure flips — a human dictator chooses which wilderness sectors
  // to flip over, one per iteration.
  pendingSeizureFlips: {
    remaining: number;        // Sectors still to flip
    militiaPerSector: number; // X - 1 militia garrisoned on each
  } | null = null;

  get hasSeizurePending(): boolean {
    return this.pendingSeizureFlips !== null;
  }

  // Pending Mao militia placement — dictator places militia on wilderness sectors
  pendingMaoMilitia: {
    remaining: number;
  } | null = null;

  get hasMaoMilitiaPending(): boolean {
    return this.pendingMaoMilitia !== null;
  }

  // Pending Mussolini spread — dictator moves militia from source sector to adjacent
  pendingMussoliniSpread: {
    sourceSectorId: string;
    remaining: number;  // militia available to move from source to adjacent
  } | null = null;

  get hasMussoliniSpreadPending(): boolean {
    return this.pendingMussoliniSpread !== null;
  }

  // Noriega: pending militia conversion for human flow path
  pendingNoriegaConversion: { convertedCount: number } | null = null;

  // Pol Pot: track which sector the ability targeted for post-combat loss detection
  _polpotTargetSectorId: string | null = null;

  // Pinochet: snapshot of dictator-controlled sector IDs before rebel phase for before/after comparison
  _pinochetControlledSnapshot: Set<string> | null = null;

  // Pinochet: queued hires from sector losses (counter, not boolean, to handle multiple losses)
  _pinochetPendingHires: number = 0;

  // Gaddafi: staged equipment from rebel MERC deaths in combat, waiting for loot assignment
  _gaddafiLootableEquipment: Array<{ equipmentId: number; sectorId: string }> | null = null;

  // Hitler: persistent initiative target (which rebel player is targeted for auto-initiative override)
  // Serialized to clients so all players can see the current target
  hitlerInitiativeTargetSeat: number | null = null;

  // Hitler: per-turn flag tracking whether initiative target was switched this turn
  hitlerInitiativeSwitchedThisTurn: boolean = false;

  // Track the outcome of combat triggered by a dictator ability (for Pol Pot's conditional hire)
  lastAbilityCombatOutcome: {
    rebelVictory: boolean;
    sectorId: string;
  } | null = null;

  /** Pending mortar attack hit allocation (attacker rolled dice, player chooses targets) */
  pendingMortarAttack: {
    attackerName: string;
    attackerCombatantId: string;
    attackerImage?: string;
    targetSectorId: string;
    targetSectorName: string;
    diceRolls: number[];
    hits: number;
    hitThreshold: number;
    attackingPlayerId: string;
    validTargets: Array<{
      id: string;
      name: string;
      type: 'merc' | 'dictator' | 'militia';
      ownerId?: string;
      currentHealth: number;
      maxHealth: number;
      image?: string;
      playerColor?: string;
    }>;
  } | null = null;

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

    // Find dictator seat (1-indexed) from:
    // 1. exclusiveSeats.role (platform lobby — seat number directly)
    // 2. playerConfigs with role:true (BoardSmith exclusive option)
    // 3. playerConfigs with isDictator:true (legacy)
    // 4. dictatorPlayerSeat (legacy, 0-indexed)
    // 5. Default to last player
    let dictatorSeat = -1;  // -1 means last player (resolved below)

    // Platform lobby: exclusiveSeats provides the seat number directly (1-indexed)
    const exclusiveSeats = (options as any).exclusiveSeats;
    if (exclusiveSeats?.role != null) {
      dictatorSeat = exclusiveSeats.role;
    }

    // Fallback: playerConfigs (from BoardSmith dev lobby or legacy)
    if (dictatorSeat < 0) {
      const playerConfigs = options.playerConfigs || [];
      // Exclusive options pass true/false booleans, keyed by option id
      // boardsmith.json uses id:"role", gameDefinition uses isDictator
      const dictatorConfigIndex = playerConfigs.findIndex(
        (config: any) => config.role === true || config.isDictator === true
      );
      if (dictatorConfigIndex >= 0) {
        // playerConfigs is 0-indexed, convert to 1-indexed seat
        dictatorSeat = dictatorConfigIndex + 1;
      } else if (options.dictatorPlayerSeat !== undefined) {
        // Legacy: 0-indexed seat, convert
        dictatorSeat = options.dictatorPlayerSeat + 1;
      }
    }

    // Validate seat if explicitly set (seat is 1-indexed)
    if (dictatorSeat > 0 && dictatorSeat > MERCGame._pendingPlayerCount) {
      throw new Error(
        `Invalid dictator seat: ${dictatorSeat}. ` +
        `Must be <= playerCount (${MERCGame._pendingPlayerCount}).`
      );
    }
    // Store as 1-indexed seat (or -1 for default/last player)
    MERCGame._pendingDictatorPosition = dictatorSeat;

    super(options);

    // Register all element classes for serialization. registerElements routes
    // through the framework's collision guard, unlike a raw write into the
    // private class registry. MERCPlayer is registered automatically by
    // `static PlayerClass`.
    this.registerElements([
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
    ]);

    // BoardSmith v0.6: BoardSmith creates MERCPlayer instances in super() via static PlayerClass
    // Now configure each player as rebel or dictator based on position
    const playerCount = MERCGame._pendingPlayerCount;
    const dictatorPosition = MERCGame._pendingDictatorPosition > 0
      ? MERCGame._pendingDictatorPosition  // Already 1-indexed seat
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

    // MERC-exaf: Set dictator Bot mode from options
    // When true, enables Bot auto-selection logic and privacy player designation
    if (options.dictatorIsBot !== undefined) {
      this.dictatorPlayer.isBot = options.dictatorIsBot;
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
    // No cached reference: dictatorPlayer resolves from the live tree each call
    // (role is set above, so the getter finds this player immediately).

    // Assign color: prefer MERC config, fall back to engine's lobby-assigned color
    const seat = player.seat;
    const playerConfig = MERCGame._pendingPlayerConfigs[seat - 1];
    if (playerConfig?.color) {
      player.playerColorHex = playerConfig.color;
      player.playerColor = hexToPlayerColor(playerConfig.color);
    } else if (player.color) {
      player.playerColorHex = player.color;
      player.playerColor = hexToPlayerColor(player.color);
    }

    // Set Bot flag from player config (for bot players)
    if (playerConfig?.isBot !== undefined) {
      player.isBot = playerConfig.isBot;
    }

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

    // Assign color: prefer MERC config, fall back to engine's lobby-assigned color
    const seat = player.seat;
    const playerConfig = MERCGame._pendingPlayerConfigs[seat - 1];
    if (playerConfig?.color) {
      player.playerColorHex = playerConfig.color;
      player.playerColor = hexToPlayerColor(playerConfig.color);
    } else if (player.color) {
      player.playerColorHex = player.color;
      player.playerColor = hexToPlayerColor(player.color);
    } else {
      const colors: PlayerColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
      player.playerColor = colors[(seat - 1) % colors.length];
    }

    // Set Bot flag from player config (for bot players)
    if (playerConfig?.isBot !== undefined) {
      player.isBot = playerConfig.isBot;
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

    // Skip dictator setup if human player will choose (no dictatorChoice specified and not Bot)
    const skipDictatorSetup = !dictatorChoice && !this.dictatorPlayer?.isBot;

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
   * Recompute squad-conditional ability bonuses (Haarg, Sarge, Tack, Valkyrie,
   * Snake, Tavisto) for every squad in the game, the dictator's base squad
   * included. Call whenever squad composition changes: hiring, movement, death.
   */
  updateAllSquadBonuses(): void {
    for (const player of this.players) {
      for (const squad of player.squads) {
        this.updateSquadBonuses(squad);
      }
    }
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

  /**
   * Single source of truth for whether the dictator card is present at a sector.
   * Checks both the dictator's squad-derived sectorId AND the baseSectorId fallback
   * (when dictator is in baseSquad but baseSquad.sectorId has drifted from baseSectorId).
   */
  isDictatorInSector(sector: Sector): boolean {
    if (!this.dictatorPlayer?.baseRevealed) return false;
    const dictatorCard = this.dictatorPlayer.dictator;
    if (!dictatorCard || dictatorCard.isDead || !dictatorCard.inPlay) return false;

    // Primary: dictator's computed sectorId from parent squad
    if (dictatorCard.sectorId === sector.sectorId) return true;

    // Fallback: dictator is in baseSquad but baseSquad.sectorId drifted from baseSectorId
    if (this.dictatorPlayer.baseSectorId === sector.sectorId) {
      const baseSquad = this.dictatorPlayer.baseSquad;
      if (baseSquad?.all(CombatantModel).some(
        c => c.isDictator && c.combatantId === dictatorCard.combatantId
      )) return true;
    }

    return false;
  }

  /**
   * Does the Dictator control this sector?
   *
   * "Whoever has the most units on it controls it" (rulebook p.6, "Sectors"),
   * counting MERCs and the Dictator card, not militia alone — the Dictator wins
   * ties. His revealed base is his while no rebel stands on it.
   *
   * This is the one control test for reinforce placement and for every tactics
   * card that says "you control"; do not re-derive it with a militia count.
   */
  dictatorControls(sector: Sector): boolean {
    const dictatorUnits = this.getDictatorUnitsInSector(sector);
    const rebelUnits = this.getTotalRebelUnitsInSector(sector);

    if (dictatorUnits > 0 && dictatorUnits >= rebelUnits) return true;

    return this.dictatorPlayer?.baseRevealed === true &&
      this.dictatorPlayer.baseSectorId === sector.sectorId &&
      rebelUnits === 0;
  }

  /** True when neither side has a unit in the sector and it is not the base. */
  isSectorUncontrolled(sector: Sector): boolean {
    return this.getDictatorUnitsInSector(sector) === 0 &&
      this.getTotalRebelUnitsInSector(sector) === 0 &&
      this.dictatorPlayer?.baseSectorId !== sector.sectorId;
  }

  getDictatorUnitsInSector(sector: Sector): number {
    const militia = sector.dictatorMilitia;
    const mercs = this.getDictatorMercsInSector(sector).length;
    const dictatorInSector = this.isDictatorInSector(sector) ? 1 : 0;
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
  // MERC-a2h: Multi-Player Coordinated Attack Management
  // ==========================================================================

  /**
   * Initialize a multi-player coordinated attack.
   * The declaring player's squad is committed immediately.
   */
  initCoordinatedAttack(targetSectorId: string, declaringSeat: number, squadType: 'primary' | 'secondary'): void {
    this.coordinatedAttack = {
      targetSectorId,
      declaringPlayerSeat: declaringSeat,
      committedSquads: [{ playerSeat: declaringSeat, squadType }],
      declinedPlayers: [],
    };
  }

  /**
   * Commit an additional squad to the coordinated attack.
   */
  commitSquadToCoordinatedAttack(playerSeat: number, squadType: 'primary' | 'secondary'): void {
    if (!this.coordinatedAttack) return;
    // Don't add duplicate entries
    if (!this.coordinatedAttack.committedSquads.some(s => s.playerSeat === playerSeat && s.squadType === squadType)) {
      this.coordinatedAttack.committedSquads.push({ playerSeat, squadType });
    }
  }

  /**
   * Decline participation in the coordinated attack.
   */
  declineCoordinatedAttack(playerSeat: number): void {
    if (!this.coordinatedAttack) return;
    if (!this.coordinatedAttack.declinedPlayers.includes(playerSeat)) {
      this.coordinatedAttack.declinedPlayers.push(playerSeat);
    }
  }

  /**
   * Check if a player has responded (committed or declined) to the coordinated attack.
   */
  hasPlayerRespondedToCoordinatedAttack(playerSeat: number): boolean {
    if (!this.coordinatedAttack) return true;
    if (this.coordinatedAttack.declinedPlayers.includes(playerSeat)) return true;
    // Check if all eligible squads for this player are committed or if they committed at least one
    // A player is "done" if they committed a squad or declined
    return this.coordinatedAttack.committedSquads.some(s => s.playerSeat === playerSeat)
      || this.coordinatedAttack.declinedPlayers.includes(playerSeat);
  }

  /**
   * Execute the coordinated attack: move all committed squads, spend actions.
   * Returns the squads that entered the target so the caller can handle landmines and combat.
   */
  executeCoordinatedAttack(): { targetSector: Sector; enteringSquads: Squad[]; firstRebel: MERCPlayer | undefined } | null {
    const attack = this.coordinatedAttack;
    if (!attack) return null;

    const target = this.getSector(attack.targetSectorId);
    if (!target) {
      this.coordinatedAttack = null;
      return null;
    }

    const enteringSquads: Squad[] = [];
    let totalMercs = 0;

    for (const { playerSeat, squadType } of attack.committedSquads) {
      const rebel = this.rebelPlayers.find(p => p.seat === playerSeat);
      if (!rebel) continue;

      const squad = squadType === 'primary' ? rebel.primarySquad : rebel.secondarySquad;
      enteringSquads.push(squad);
      const mercs = squad.getLivingMercs();

      for (const merc of mercs) {
        merc.useAction(1);
      }

      squad.sectorId = target.sectorId;
      totalMercs += mercs.length;
    }

    const firstRebel = this.rebelPlayers.find(p => p.seat === attack.committedSquads[0]?.playerSeat);

    this.message(`Coordinated attack launched on ${target.sectorName} with ${totalMercs} MERC(s)!`);
    this.coordinatedAttack = null;

    return { targetSector: target, enteringSquads, firstRebel };
  }

  /**
   * Get squad types that a player can commit to the current coordinated attack.
   * Returns squads that are adjacent to the target sector, have living mercs with actions,
   * and aren't already committed.
   */
  getEligibleSquadsForCoordinatedAttack(player: MERCPlayer): Array<'primary' | 'secondary'> {
    const attack = this.coordinatedAttack;
    if (!attack || !player.isRebel()) return [];

    const rebel = player as RebelPlayer;
    const targetSector = this.getSector(attack.targetSectorId);
    if (!targetSector) return [];

    const eligible: Array<'primary' | 'secondary'> = [];
    for (const squadType of ['primary', 'secondary'] as const) {
      // Skip if already committed
      if (attack.committedSquads.some(s => s.playerSeat === player.seat && s.squadType === squadType)) continue;

      const squad = squadType === 'primary' ? rebel.primarySquad : rebel.secondarySquad;
      if (squad.livingMercCount === 0 || !squad.sectorId) continue;

      // Must have mercs with actions
      if (!squad.getLivingMercs().every(m => m.actionsRemaining >= 1)) continue;

      // Must be adjacent to target
      const currentSector = this.getSector(squad.sectorId);
      if (!currentSector) continue;
      const adjacent = this.getAdjacentSectors(currentSector);
      if (!adjacent.some(s => s.sectorId === attack.targetSectorId)) continue;

      eligible.push(squadType);
    }
    return eligible;
  }

  // ==========================================================================
  // Game State Queries
  // ==========================================================================

  override isFinished(): boolean {
    const over = this.checkGameOver();
    // Publish the verdict as soon as the game ends, so it is in the game view
    // for the UI whether or not anything has called getWinners() yet.
    this.victoryOutcome = over ? this.evaluateOutcome() : null;
    return over;
  }

  private checkGameOver(): boolean {
    // Game ends when:
    // 1. Dictator is defeated (dictator killed OR base captured by rebels)
    // 2. Dictator tactics deck and hand are empty
    // 3. Day limit reached (after Day 6)
    // 4. Explosives victory (rebels detonate in palace)

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

    // Day limit reached - game ends after Day 6
    if (this.isDayLimitReached()) {
      return true;
    }

    return false;
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

    // Base is captured if no dictator units AND rebels have units there.
    // The Dictator only defends the base while he is standing in it — he may be
    // away with one of his two squads (rulebook p.5), and the base falls behind him.
    const hasDictatorUnits = baseSector.dictatorMilitia > 0 ||
      this.isDictatorInSector(baseSector) ||
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

  /**
   * Who won and why, once the game is over.
   *
   * Serialized into the game view so the UI renders the engine's own verdict
   * instead of re-deriving control and points from the view tree.
   */
  evaluateOutcome(): VictoryOutcome {
    const { rebelPoints, dictatorPoints } = this.calculateVictoryPoints();
    const score = { rebelPoints, dictatorPoints };

    if (this.dictatorPlayer?.isDefeated) {
      return { winner: 'rebels', reason: 'Dictator defeated - Rebels win!', ...score };
    }
    if (this.isBaseCaptured()) {
      return { winner: 'rebels', reason: 'Dictator base captured - Rebels win!', ...score };
    }
    if (this.explosivesVictory) {
      return { winner: 'rebels', reason: 'Palace destroyed - Rebels win!', ...score };
    }

    // The game ran to its end (tactics exhausted, or the day cap with a larger
    // deck): score sector value. Per rules (11-victory-and-game-end.md) rebels
    // must have strictly more points; the Dictator wins ties.
    return rebelPoints > dictatorPoints
      ? { winner: 'rebels', reason: 'Rebels win on points!', ...score }
      : { winner: 'dictator', reason: 'Dictator wins on points!', ...score };
  }

  override getWinners(): MERCPlayer[] {
    if (!this.isFinished()) return [];
    const outcome = this.victoryOutcome ?? this.evaluateOutcome();

    // Announce the verdict exactly once.
    if (!this._gameEndAnnounced) {
      this._gameEndAnnounced = true;
      if (this.isDayLimitReached()) {
        this.message('Day limit reached - scoring the map.');
      }
      this.message(
        `Final score - Rebels: ${outcome.rebelPoints}, Dictator: ${outcome.dictatorPoints}`
      );
      this.message(outcome.reason);
    }

    if (outcome.winner === 'rebels') return [...this.rebelPlayers];
    return this.dictatorPlayer ? [this.dictatorPlayer] : [];
  }

  // ==========================================================================
  // Game Constants Helper Methods
  // ==========================================================================

  /**
   * Calculate reinforcement militia gained when Dictator discards a Tactics card
   * Formula: ceil(Rebel Players / 2) + 1 (rulebook p.5, "round up, plus one")
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

  /**
   * MERC-4t3: some MERCs (Preaction) recover health at the start of each day.
   * The amount comes from the ability registry.
   */
  private applyDailyAutoHeal(merc: CombatantModel): void {
    const amount = getAutoHealPerDay(merc.combatantId);
    if (amount <= 0 || merc.damage <= 0) return;
    const healed = merc.heal(amount);
    if (healed > 0) {
      this.message(
        `${merc.combatantName} auto-heals ${healed} health (${merc.health}/${merc.maxHealth})`
      );
    }
  }

  advanceDay(): void {
    this.currentDay++;

    // Reset all rebel MERC actions
    for (const rebel of this.rebelPlayers) {
      for (const merc of rebel.team) {
        merc.resetActions();
        this.applyDailyAutoHeal(merc);
      }
    }

    // Reset dictator MERC actions
    for (const merc of this.dictatorPlayer.hiredMercs) {
      merc.resetActions();
      this.applyDailyAutoHeal(merc);
    }

    // Reset dictator card actions if in play
    if (this.dictatorPlayer.dictator?.inPlay) {
      this.dictatorPlayer.dictator.actionsRemaining = 2;
    }

    // Reset Hitler's per-turn initiative switch flag
    this.hitlerInitiativeSwitchedThisTurn = false;
  }

  /**
   * Check if the game should end due to day limit
   */
  isDayLimitReached(): boolean {
    return this.currentDay > GameDurationConstants.LAST_DAY;
  }

  // ==========================================================================
  // Bot Rebel Action Batching
  // ==========================================================================

  /**
   * Reset batching state at the start of each simultaneous step entry
   * (including re-entry after combat barriers).
   */
  resetRebelBatching(): void {
    this._rebelBatchRound = 0;
    this._rebelActionCounts.clear();
  }

  /**
   * Check if an Bot rebel player should be gated from taking an action.
   * Returns true if the player is ahead of the current batch round and must wait.
   * Humans are never gated. Dictator actions are never gated.
   */
  shouldGateBotAction(player: MERCPlayer): boolean {
    if (!player.isBot) return false;
    if (!player.isRebel()) return false;
    const count = this._rebelActionCounts.get(player.seat) ?? 0;
    if (count > this._rebelBatchRound) return true;
    return false;
  }

  /**
   * Record that an Bot rebel player has taken an action in the current batch.
   * After recording, checks if all Bot rebels have caught up or are done,
   * and advances the batch round if so.
   */
  recordRebelActionForBatching(player: MERCPlayer): void {
    const currentCount = this._rebelActionCounts.get(player.seat) ?? 0;
    this._rebelActionCounts.set(player.seat, currentCount + 1);

    // Check if all Bot rebels have taken at least _rebelBatchRound + 1 actions, or are "done"
    const botRebels = this.rebelPlayers.filter(p => p.isBot);
    const allCaughtUp = botRebels.every(p => {
      const actionCount = this._rebelActionCounts.get(p.seat) ?? 0;
      if (actionCount >= this._rebelBatchRound + 1) return true;
      // Player is "done" if no MERCs have actions remaining
      return !p.team.some(m => m.actionsRemaining > 0);
    });

    if (allCaughtUp) {
      this._rebelBatchRound++;
    }
  }

}
