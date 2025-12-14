import { Card as BaseCard, Piece as BasePiece, Space, Deck as BaseDeck, Hand as BaseHand, Grid, GridCell } from '@boardsmith/engine';
import {
  MercConstants,
  CombatConstants,
  SectorConstants,
  DictatorConstants,
  AdjacencyConstants,
} from './constants.js';

// =============================================================================
// Types and Interfaces
// =============================================================================

export type EquipmentType = 'Weapon' | 'Armor' | 'Accessory';
export type SectorType = 'Wilderness' | 'City' | 'Industry';
export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'black';

export interface MercStats {
  initiative: number;
  training: number;
  combat: number;
}

export interface MercAttributes {
  health: number;
  maxHealth: number;
  targets: number;
  armor: number;
  actions: number;
}

export interface EquipmentBonuses {
  combat?: number;
  initiative?: number;
  training?: number;
  targets?: number;
  armor?: number;
  actions?: number;
}

// =============================================================================
// MERC Card - The mercenary characters
// =============================================================================

export class MercCard extends BaseCard {
  // Identity
  mercId!: string;
  mercName!: string;
  bio!: string;
  ability!: string;
  image!: string;

  // Base skills (from card data)
  baseInitiative!: number;
  baseTraining!: number;
  baseCombat!: number;

  // Current state
  damage: number = 0;
  actionsRemaining: number = 2;

  // Equipment slots (references to equipped cards)
  weaponSlot?: Equipment;
  armorSlot?: Equipment;
  accessorySlot?: Equipment;

  // Constants (imported from game constants)
  static readonly BASE_HEALTH = MercConstants.BASE_HEALTH;
  static readonly BASE_TARGETS = MercConstants.BASE_TARGETS;
  static readonly BASE_ARMOR = MercConstants.BASE_ARMOR;
  static readonly BASE_ACTIONS = MercConstants.ACTIONS_PER_DAY;

  // Computed stats including equipment bonuses
  get initiative(): number {
    let value = this.baseInitiative;
    if (this.weaponSlot?.initiative) value += this.weaponSlot.initiative;
    if (this.armorSlot?.initiative) value += this.armorSlot.initiative;
    if (this.accessorySlot?.initiative) value += this.accessorySlot.initiative;
    return value;
  }

  get training(): number {
    let value = this.baseTraining;
    if (this.weaponSlot?.training) value += this.weaponSlot.training;
    if (this.armorSlot?.training) value += this.armorSlot.training;
    if (this.accessorySlot?.training) value += this.accessorySlot.training;
    return value;
  }

  get combat(): number {
    let value = this.baseCombat;
    if (this.weaponSlot?.combatBonus) value += this.weaponSlot.combatBonus;
    if (this.armorSlot?.combatBonus) value += this.armorSlot.combatBonus;
    if (this.accessorySlot?.combatBonus) value += this.accessorySlot.combatBonus;
    return Math.max(0, value);
  }

  get maxHealth(): number {
    return MercCard.BASE_HEALTH;
  }

  get health(): number {
    return this.maxHealth - this.damage;
  }

  get targets(): number {
    let value = MercCard.BASE_TARGETS;
    if (this.weaponSlot?.targets) value += this.weaponSlot.targets;
    if (this.armorSlot?.targets) value += this.armorSlot.targets;
    if (this.accessorySlot?.targets) value += this.accessorySlot.targets;
    return value;
  }

  get equipmentArmor(): number {
    let value = MercCard.BASE_ARMOR;
    if (this.weaponSlot?.armorBonus) value += this.weaponSlot.armorBonus;
    if (this.armorSlot?.armorBonus) value += this.armorSlot.armorBonus;
    if (this.accessorySlot?.armorBonus) value += this.accessorySlot.armorBonus;
    return value;
  }

  get isDead(): boolean {
    return this.health <= 0;
  }

  get isFullyEquipped(): boolean {
    return !!(this.weaponSlot && this.armorSlot && this.accessorySlot);
  }

  takeDamage(amount: number): number {
    // Armor absorbs damage first (handled by equipment armor value)
    const actualDamage = amount; // Armor piercing handled at combat level
    this.damage = Math.min(this.damage + actualDamage, this.maxHealth);
    return actualDamage;
  }

  heal(amount: number): number {
    const healed = Math.min(amount, this.damage);
    this.damage -= healed;
    return healed;
  }

  fullHeal(): void {
    this.damage = 0;
  }

  resetActions(): void {
    this.actionsRemaining = MercCard.BASE_ACTIONS;
  }

  useAction(cost: number = 1): boolean {
    if (this.actionsRemaining >= cost) {
      this.actionsRemaining -= cost;
      return true;
    }
    return false;
  }

  canEquip(equipment: Equipment): boolean {
    switch (equipment.equipmentType) {
      case 'Weapon':
        return !this.weaponSlot;
      case 'Armor':
        return !this.armorSlot;
      case 'Accessory':
        return !this.accessorySlot;
      default:
        return false;
    }
  }

  equip(equipment: Equipment): Equipment | undefined {
    let replaced: Equipment | undefined;
    switch (equipment.equipmentType) {
      case 'Weapon':
        replaced = this.weaponSlot;
        this.weaponSlot = equipment;
        break;
      case 'Armor':
        replaced = this.armorSlot;
        this.armorSlot = equipment;
        break;
      case 'Accessory':
        replaced = this.accessorySlot;
        this.accessorySlot = equipment;
        break;
    }
    return replaced;
  }

  unequip(type: EquipmentType): Equipment | undefined {
    let equipment: Equipment | undefined;
    switch (type) {
      case 'Weapon':
        equipment = this.weaponSlot;
        this.weaponSlot = undefined;
        break;
      case 'Armor':
        equipment = this.armorSlot;
        this.armorSlot = undefined;
        break;
      case 'Accessory':
        equipment = this.accessorySlot;
        this.accessorySlot = undefined;
        break;
    }
    return equipment;
  }
}

// =============================================================================
// Equipment Card - Weapons, Armor, Accessories
// =============================================================================

export class Equipment extends BaseCard {
  equipmentId!: string;
  equipmentName!: string;
  equipmentType!: EquipmentType;
  serial!: number;
  description!: string;
  image!: string;

  // Stat bonuses (can be negative)
  combatBonus: number = 0;
  initiative: number = 0;
  training: number = 0;
  targets: number = 0;
  armorBonus: number = 0;

  // Special properties
  negatesArmor: boolean = false;
  isOneUse: boolean = false;
  usesRemaining?: number;

  // Damage state - damaged equipment cannot be stashed
  isDamaged: boolean = false;

  // Expansion marker (for special game modes)
  expansion?: string;

  /**
   * Mark equipment as damaged (e.g., when absorbed damage)
   */
  damage(): void {
    this.isDamaged = true;
  }

  /**
   * Repair damaged equipment (e.g., at hospital or with repair kit)
   */
  repair(): void {
    this.isDamaged = false;
  }

  get isVehicle(): boolean {
    return this.expansion === 'A';
  }

  get isIDictatorItem(): boolean {
    return this.expansion === 'B';
  }
}

// =============================================================================
// Sector - Map tile (GridCell for proper grid layout)
// =============================================================================

export class Sector extends GridCell {
  // IMPORTANT: row and col must be declared first among numeric properties
  // due to a BoardSmith bug where it uses the first two numeric attributes
  // for grid sizing instead of $rowCoord/$colCoord
  declare row: number;
  declare col: number;

  sectorId!: string;
  sectorName!: string;
  sectorType!: SectorType;
  value!: number;
  image!: string;

  // Loot icons (equipment drawn when explored)
  weaponLoot: number = 0;
  armorLoot: number = 0;
  accessoryLoot: number = 0;

  // State
  explored: boolean = false;

  // Militia counts per faction
  dictatorMilitia: number = 0;
  rebelMilitia: Map<string, number> = new Map(); // playerId -> count

  // Equipment stash
  stash: Equipment[] = [];

  // Dictator base token
  isBase: boolean = false;

  // Constant (imported from game constants)
  static readonly MAX_MILITIA_PER_SIDE = SectorConstants.MAX_MILITIA_PER_SIDE;

  get isCity(): boolean {
    return this.sectorType === 'City';
  }

  get isIndustry(): boolean {
    return this.sectorType === 'Industry';
  }

  get isWilderness(): boolean {
    return this.sectorType === 'Wilderness';
  }

  get hasHospital(): boolean {
    return this.isCity;
  }

  get hasArmsDealer(): boolean {
    return this.isCity;
  }

  get totalLoot(): number {
    return this.weaponLoot + this.armorLoot + this.accessoryLoot;
  }

  getTotalRebelMilitia(): number {
    let total = 0;
    this.rebelMilitia.forEach(count => total += count);
    return total;
  }

  getRebelMilitia(playerId: string): number {
    return this.rebelMilitia.get(playerId) || 0;
  }

  addDictatorMilitia(count: number): number {
    const canAdd = Math.min(count, Sector.MAX_MILITIA_PER_SIDE - this.dictatorMilitia);
    this.dictatorMilitia += canAdd;
    return canAdd;
  }

  addRebelMilitia(playerId: string, count: number): number {
    const current = this.getRebelMilitia(playerId);
    const totalRebel = this.getTotalRebelMilitia();
    const canAdd = Math.min(count, Sector.MAX_MILITIA_PER_SIDE - totalRebel);
    this.rebelMilitia.set(playerId, current + canAdd);
    return canAdd;
  }

  removeDictatorMilitia(count: number): number {
    const removed = Math.min(count, this.dictatorMilitia);
    this.dictatorMilitia -= removed;
    return removed;
  }

  removeRebelMilitia(playerId: string, count: number): number {
    const current = this.getRebelMilitia(playerId);
    const removed = Math.min(count, current);
    this.rebelMilitia.set(playerId, current - removed);
    return removed;
  }

  explore(): void {
    this.explored = true;
  }

  /**
   * Add equipment to sector stash.
   * Damaged equipment cannot be stashed - must be discarded instead.
   * @returns true if added, false if equipment was damaged
   */
  addToStash(equipment: Equipment): boolean {
    if (equipment.isDamaged) {
      // Damaged equipment cannot be stashed - caller should discard
      return false;
    }
    this.stash.push(equipment);
    return true;
  }

  takeFromStash(index: number): Equipment | undefined {
    if (index >= 0 && index < this.stash.length) {
      return this.stash.splice(index, 1)[0];
    }
    return undefined;
  }

  /**
   * Find equipment in stash by type
   */
  findInStash(type: EquipmentType): Equipment | undefined {
    return this.stash.find(e => e.equipmentType === type);
  }

  /**
   * Get all equipment in stash
   */
  getStashContents(): Equipment[] {
    return [...this.stash];
  }
}

// =============================================================================
// Dictator Card
// =============================================================================

export class DictatorCard extends BaseCard {
  dictatorId!: string;
  dictatorName!: string;
  ability!: string;
  bio!: string;
  image!: string;

  // Stats (used when in play after base revealed)
  baseInitiative!: number;
  baseTraining!: number;
  baseCombat!: number;

  // State
  damage: number = 0;
  actionsRemaining: number = 2;
  inPlay: boolean = false;

  // Equipment slots
  weaponSlot?: Equipment;
  armorSlot?: Equipment;
  accessorySlot?: Equipment;

  // Constant (imported from game constants - Dictator uses same health as MERCs)
  static readonly BASE_HEALTH = MercConstants.BASE_HEALTH;

  get maxHealth(): number {
    return DictatorCard.BASE_HEALTH;
  }

  get health(): number {
    return this.maxHealth - this.damage;
  }

  get isDead(): boolean {
    return this.health <= 0;
  }

  get initiative(): number {
    let value = this.baseInitiative;
    if (this.weaponSlot?.initiative) value += this.weaponSlot.initiative;
    if (this.armorSlot?.initiative) value += this.armorSlot.initiative;
    if (this.accessorySlot?.initiative) value += this.accessorySlot.initiative;
    return value;
  }

  get training(): number {
    let value = this.baseTraining;
    if (this.weaponSlot?.training) value += this.weaponSlot.training;
    if (this.armorSlot?.training) value += this.armorSlot.training;
    if (this.accessorySlot?.training) value += this.accessorySlot.training;
    return value;
  }

  get combat(): number {
    let value = this.baseCombat;
    if (this.weaponSlot?.combatBonus) value += this.weaponSlot.combatBonus;
    if (this.armorSlot?.combatBonus) value += this.armorSlot.combatBonus;
    if (this.accessorySlot?.combatBonus) value += this.accessorySlot.combatBonus;
    return Math.max(0, value);
  }

  takeDamage(amount: number): number {
    this.damage = Math.min(this.damage + amount, this.maxHealth);
    return amount;
  }

  enterPlay(): void {
    this.inPlay = true;
  }
}

// =============================================================================
// Dictator Tactics Card
// =============================================================================

export class TacticsCard extends BaseCard {
  tacticsId!: string;
  tacticsName!: string;
  story!: string;
  description!: string;

  get revealsBase(): boolean {
    // Cards that mention "Reveal your base" in description
    return this.description.toLowerCase().includes('reveal your base');
  }
}

// =============================================================================
// Militia - Simple combat unit
// =============================================================================

export class Militia extends BasePiece {
  // Fixed stats - militia always have the same values (from game constants)
  static readonly INITIATIVE = CombatConstants.MILITIA_INITIATIVE;
  static readonly COMBAT = CombatConstants.MILITIA_COMBAT;
  static readonly HEALTH = CombatConstants.MILITIA_HEALTH;
  static readonly ARMOR = CombatConstants.MILITIA_ARMOR;
  static readonly TARGETS = CombatConstants.MILITIA_TARGETS;

  isDictator: boolean = false;
  ownerId?: string; // For rebel militia, tracks which player owns them

  get initiative(): number {
    return Militia.INITIATIVE;
  }

  get combat(): number {
    return Militia.COMBAT;
  }

  // Militia die instantly when hit
  takeDamage(_amount: number): boolean {
    return true; // Always dies
  }
}

// =============================================================================
// Squad - A group of MERCs that move together
// =============================================================================

export class Squad extends Space {
  isPrimary: boolean = true; // Primary (large pawn) or Secondary (small pawn)
  sectorId?: string; // Which sector this squad is in

  getMercs(): MercCard[] {
    return this.all(MercCard);
  }

  get mercCount(): number {
    return this.count(MercCard);
  }

  get hasNoMercs(): boolean {
    return this.mercCount === 0;
  }
}

// =============================================================================
// Decks and Collections
// =============================================================================

export class MercDeck extends BaseDeck {
  // Deck of available MERCs to hire
}

export class EquipmentDeck extends BaseDeck {
  equipmentType!: EquipmentType;
}

export class TacticsDeck extends BaseDeck {
  // Dictator's tactics cards
}

export class TacticsHand extends BaseHand {
  // Dictator's hand of tactics cards (from game constants)
  static readonly MAX_SIZE = DictatorConstants.HAND_SIZE;
}

export class DiscardPile extends Space {
  // Discard pile for any card type
}

// =============================================================================
// Game Map - Grid of Sectors
// =============================================================================

export class GameMap extends Grid {
  // Tell AutoUI which properties to use for grid coordinates
  $rowCoord = 'row';
  $colCoord = 'col';

  // Labels for rows and columns (set dynamically based on grid size)
  $rowLabels: string[] = [];
  $columnLabels: string[] = [];

  rows!: number;
  cols!: number;

  /**
   * Update the row/column labels based on current grid dimensions
   */
  updateLabels(): void {
    this.$rowLabels = Array.from({ length: this.rows }, (_, i) => String(i));
    this.$columnLabels = Array.from({ length: this.cols }, (_, i) => String(i));
  }

  getSector(row: number, col: number): Sector | undefined {
    return this.first(Sector, s => s.row === row && s.col === col);
  }

  getAllSectors(): Sector[] {
    return this.all(Sector);
  }

  getAdjacentSectors(sector: Sector): Sector[] {
    const adjacent: Sector[] = [];

    // Use orthogonal directions only (from game constants)
    for (const [dr, dc] of AdjacencyConstants.DIRECTIONS) {
      const neighbor = this.getSector(sector.row + dr, sector.col + dc);
      if (neighbor) {
        adjacent.push(neighbor);
      }
    }

    return adjacent;
  }

  isEdgeSector(sector: Sector): boolean {
    return (
      sector.row === 0 ||
      sector.row === this.rows - 1 ||
      sector.col === 0 ||
      sector.col === this.cols - 1
    );
  }

  getEdgeSectors(): Sector[] {
    return this.getAllSectors().filter(s => this.isEdgeSector(s));
  }
}

// =============================================================================
// Player Mat / Player Area
// =============================================================================

export class PlayerArea extends Space {
  // Contains the player's squads, hired MERCs, etc.
}
