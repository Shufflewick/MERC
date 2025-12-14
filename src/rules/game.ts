import { Game, Player, type GameOptions } from '@boardsmith/engine';
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

// Import game data from JSON files
import mercsData from '../../data/mercs.json';
import equipmentData from '../../data/equipment.json';
import sectorsData from '../../data/sectors.json';
import dictatorsData from '../../data/dictators.json';
import tacticsData from '../../data/dictator-tactics.json';
import setupData from '../../data/setup.json';

// Re-export SetupConfiguration for external use
export type { SetupConfiguration } from './constants.js';

export interface MERCOptions extends GameOptions {
  seed?: string;
  rebelCount?: number;  // 1-6 rebels
  dictatorId?: string;  // Which dictator to use
  expansionModes?: string[]; // 'A' for vehicles, 'B' for I, Dictator
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
}

// =============================================================================
// Player Classes
// =============================================================================

export class RebelPlayer extends Player {
  playerColor!: PlayerColor;

  // Squads (set by game after creation)
  primarySquad!: Squad;
  secondarySquad!: Squad;

  // Player area
  area!: PlayerArea;

  get team(): MercCard[] {
    const mercs: MercCard[] = [];
    if (this.primarySquad) mercs.push(...this.primarySquad.getMercs());
    if (this.secondarySquad) mercs.push(...this.secondarySquad.getMercs());
    return mercs;
  }

  get teamSize(): number {
    return this.team.length;
  }

  // Team limit: BASE_TEAM_LIMIT + controlled sectors (from game constants)
  getTeamLimit(game: MERCGame): number {
    return TeamConstants.BASE_TEAM_LIMIT + game.getControlledSectors(this).length;
  }

  canHireMerc(game: MERCGame): boolean {
    return this.teamSize < this.getTeamLimit(game);
  }
}

export class DictatorPlayer extends Player {
  dictator!: DictatorCard;
  tacticsDeck!: TacticsDeck;
  tacticsHand!: TacticsHand;
  tacticsDiscard!: DiscardPile;

  // Hired MERCs fighting for the Dictator
  hiredMercs: MercCard[] = [];

  // Base state
  baseRevealed: boolean = false;
  baseSectorId?: string;

  // Sector where the Dictator's forces are stationed
  stationedSectorId?: string;

  get isDefeated(): boolean {
    return this.baseRevealed && this.dictator?.isDead;
  }

  get team(): MercCard[] {
    return this.hiredMercs.filter(m => !m.isDead);
  }

  get teamSize(): number {
    return this.team.length;
  }
}

// Type alias for the player union
export type MERCPlayer = RebelPlayer | DictatorPlayer;

// =============================================================================
// Main Game Class
// =============================================================================

export class MERCGame extends Game<MERCGame, MERCPlayer> {
  // Static storage for playerCount during construction (workaround for super() timing)
  private static _pendingPlayerCount: number = 2;

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

  // Game state
  // Use 'declare' to avoid class field initialization overwriting the value set in createPlayer()
  declare dictatorPlayer: DictatorPlayer;
  rebelPlayers: RebelPlayer[] = [];

  // Data loaded from JSON
  private mercData: MercData[] = [];
  private equipmentData: EquipmentData[] = [];
  private sectorData: SectorData[] = [];
  private dictatorData: DictatorData[] = [];
  private tacticsData: TacticsData[] = [];
  private setupConfigurations: SetupConfiguration[] = [];

  constructor(options: MERCOptions) {
    // Store playerCount before super() so createPlayer can access it
    // Default to 2 players if not specified (1 rebel + 1 dictator)
    MERCGame._pendingPlayerCount = options.playerCount ?? 2;
    super(options);

    // Register all element classes for serialization
    this._ctx.classRegistry.set('MercCard', MercCard as any);
    this._ctx.classRegistry.set('Equipment', Equipment as any);
    this._ctx.classRegistry.set('Sector', Sector as any);
    this._ctx.classRegistry.set('DictatorCard', DictatorCard as any);
    this._ctx.classRegistry.set('TacticsCard', TacticsCard as any);
    this._ctx.classRegistry.set('Squad', Squad as any);
    this._ctx.classRegistry.set('MercDeck', MercDeck as any);
    this._ctx.classRegistry.set('EquipmentDeck', EquipmentDeck as any);
    this._ctx.classRegistry.set('TacticsDeck', TacticsDeck as any);
    this._ctx.classRegistry.set('TacticsHand', TacticsHand as any);
    this._ctx.classRegistry.set('DiscardPile', DiscardPile as any);
    this._ctx.classRegistry.set('GameMap', GameMap as any);
    this._ctx.classRegistry.set('PlayerArea', PlayerArea as any);

    // Determine rebel count from players or options
    this.rebelCount = options.rebelCount ?? Math.max(1, this.players.length - 1);

    // Safety check: ensure dictatorPlayer was created
    if (!this.dictatorPlayer) {
      throw new Error(`DictatorPlayer not created. Players: ${this.players.length}, pendingCount: ${MERCGame._pendingPlayerCount}`);
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
    this.performSetup(options.dictatorId);
  }

  protected override createPlayer(position: number, name: string): MERCPlayer {
    // Initialize rebelPlayers if not already done (needed because createPlayer
    // is called from super() before class property initializers run)
    if (!this.rebelPlayers) {
      this.rebelPlayers = [];
    }

    // Last player is the Dictator, others are Rebels
    // This ensures that with --ai 1, the AI (last position) is the dictator
    // and human players (earlier positions) are rebels
    const totalPlayers = MERCGame._pendingPlayerCount;
    const isDictator = position === totalPlayers - 1;

    if (isDictator) {
      const dictator = new DictatorPlayer(position, name);
      dictator.game = this;
      this.dictatorPlayer = dictator;
      return dictator;
    } else {
      const rebel = new RebelPlayer(position, name);
      rebel.game = this;

      // Assign color based on position
      const colors: PlayerColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
      rebel.playerColor = colors[position % colors.length];

      // Create squads for rebel
      rebel.primarySquad = this.create(Squad, `squad-${position}-primary`, { isPrimary: true });
      rebel.secondarySquad = this.create(Squad, `squad-${position}-secondary`, { isPrimary: false });

      // Create player area
      rebel.area = this.create(PlayerArea, `area-${position}`);

      this.rebelPlayers.push(rebel);
      return rebel;
    }
  }

  /**
   * Check if a player is a rebel (not the dictator)
   */
  isRebelPlayer(player: MERCPlayer): boolean {
    return player instanceof RebelPlayer;
  }

  /**
   * Check if a player is the dictator
   */
  isDictatorPlayer(player: MERCPlayer): boolean {
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
        this.mercDeck.create(MercCard, `merc-${merc.id}${suffix}`, {
          mercId: merc.id,
          mercName: merc.name,
          bio: merc.bio,
          ability: merc.ability,
          image: `/mercs/${merc.id}.jpg`,
          baseInitiative: merc.initiative,
          baseTraining: merc.training,
          baseCombat: merc.combat,
        });
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
   */
  performSetup(dictatorId?: string, activeTacticsCount?: number): void {
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

    performSetup(this, {
      sectorData: this.sectorData as SetupSectorData[],
      dictatorData: this.dictatorData as SetupDictatorData[],
      tacticsData: this.tacticsData as SetupTacticsData[],
      dictatorId,
      activeTacticsCount,
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

        // Must have more units than any other rebel (first rebel wins ties between rebels)
        for (const otherRebel of this.rebelPlayers) {
          if (otherRebel === rebel) continue;
          const otherUnits = this.getRebelUnitsInSector(sector, otherRebel);
          if (otherUnits >= rebelUnits) return false;
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
  // Game State Queries
  // ==========================================================================

  override isFinished(): boolean {
    // Game ends when:
    // 1. Dictator is defeated (base revealed and dictator killed)
    // 2. Rebels capture the Dictator's base (base revealed and rebels control sector)
    // 3. Dictator tactics deck and hand are empty
    // 4. All rebels are eliminated
    // 5. Day limit reached (after Day 6)

    if (this.dictatorPlayer?.isDefeated) {
      return true;
    }

    // Check if rebels captured the base
    if (this.isBaseCaptured()) {
      return true;
    }

    if (this.dictatorPlayer?.tacticsDeck?.count(TacticsCard) === 0 &&
        this.dictatorPlayer?.tacticsHand?.count(TacticsCard) === 0) {
      return true;
    }

    const aliveRebels = this.rebelPlayers.filter(r => r.teamSize > 0 || r.canHireMerc(this));
    if (aliveRebels.length === 0 && this.rebelPlayers.length > 0) {
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

    // Base is captured if no dictator units AND rebels have units there
    const hasDictatorUnits = baseSector.dictatorMilitia > 0 ||
      (this.dictatorPlayer.dictator && !this.dictatorPlayer.dictator.isDead);

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

    // Otherwise dictator wins
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
      }
    }

    // Reset dictator MERC actions
    for (const merc of this.dictatorPlayer.hiredMercs) {
      merc.resetActions();
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
