import { Card as BaseCard, Piece as BasePiece, Space, Deck as BaseDeck, Hand as BaseHand, Grid, GridCell } from '@boardsmith/engine';
import {
  MercConstants,
  CombatConstants,
  SectorConstants,
  DictatorConstants,
  AdjacencyConstants,
} from './constants.js';
import {
  getExtraAccessorySlots,
  isHandgun,
  isUzi,
  isExplosive,
  isSmaw,
} from './equipment-effects.js';
import { getMercAbility, ignoresInitiativePenalties, FEMALE_MERCS } from './merc-abilities.js';

// =============================================================================
// Types and Interfaces
// =============================================================================

export type EquipmentType = 'Weapon' | 'Armor' | 'Accessory';

/**
 * Check if equipment is a grenade or mortar (restricted for Apeiron).
 * MERC-70a: Apeiron won't use grenades or mortars.
 */
export function isGrenadeOrMortar(equipment: Equipment | { equipmentName?: string; equipmentId?: string } | null | undefined): boolean {
  if (!equipment) return false;
  const name = (equipment.equipmentName || '').toLowerCase();
  return name.includes('grenade') || name.includes('mortar');
}

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

// Equipment data for UI serialization (includes all stats for modals)
export interface EquipmentSlotData {
  equipmentId: string;
  equipmentName: string;
  equipmentType: string;
  description?: string;
  combatBonus?: number;
  initiative?: number;
  training?: number;
  targets?: number;
  armorBonus?: number;
  negatesArmor?: boolean;
  isDamaged?: boolean;
  serial?: number;
  image?: string;
}

// =============================================================================
// CombatUnit - Abstract base class for MERCs and Dictators
// =============================================================================

export abstract class CombatUnit extends BaseCard {
  // Identity - generic names, subclasses provide aliases
  unitId!: string;
  unitName!: string;
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
  sectorId: string = '';

  // Haarg's ability bonuses (stored explicitly since parent isn't available during serialization)
  haargTrainingBonus: number = 0;
  haargInitiativeBonus: number = 0;
  haargCombatBonus: number = 0;

  // Sarge's ability bonuses (+1 to all when highest initiative in squad)
  sargeTrainingBonus: number = 0;
  sargeInitiativeBonus: number = 0;
  sargeCombatBonus: number = 0;

  // Tack's squad initiative bonus (applied to all squad members when Tack has highest initiative)
  tackSquadInitiativeBonus: number = 0;

  // Valkyrie's squad initiative bonus (applied to squad mates, not Valkyrie herself)
  valkyrieSquadInitiativeBonus: number = 0;

  // Equipment-conditional combat bonuses (displayed in UI tooltips)
  boubaHandgunCombatBonus: number = 0;
  mayhemUziCombatBonus: number = 0;
  rozeskeArmorCombatBonus: number = 0;
  stumpyExplosiveCombatBonus: number = 0;
  vandradiMultiTargetCombatBonus: number = 0;
  dutchUnarmedCombatBonus: number = 0;
  dutchUnarmedInitiativeBonus: number = 0;
  moeSmawTargetBonus: number = 0;
  raWeaponTargetBonus: number = 0;

  // Squad-conditional bonuses (displayed in UI tooltips)
  snakeSoloCombatBonus: number = 0;
  snakeSoloInitiativeBonus: number = 0;
  snakeSoloTrainingBonus: number = 0;
  tavistoWomanCombatBonus: number = 0;
  tavistoWomanInitiativeBonus: number = 0;
  tavistoWomanTrainingBonus: number = 0;

  // Faustina's extra training-only action (separate from regular actions)
  trainingActionsRemaining: number = 0;

  // Computed stat caches (updated when equipment/abilities change)
  effectiveTraining: number = 0;
  effectiveInitiative: number = 0;
  effectiveCombat: number = 0;
  effectiveMaxHealth: number = MercConstants.BASE_HEALTH;

  // Equipment slots - stored as child elements with equippedSlot attribute
  get weaponSlot(): Equipment | undefined {
    return this.first(Equipment, e => e.equippedSlot === 'weapon');
  }
  get armorSlot(): Equipment | undefined {
    return this.first(Equipment, e => e.equippedSlot === 'armor');
  }
  get accessorySlot(): Equipment | undefined {
    return this.first(Equipment, e => e.equippedSlot === 'accessory');
  }
  get bandolierSlots(): Equipment[] {
    return this.all(Equipment, e => e.equippedSlot?.startsWith('bandolier:') ?? false)
      .sort((a, b) => {
        const idxA = parseInt(a.equippedSlot!.split(':')[1]);
        const idxB = parseInt(b.equippedSlot!.split(':')[1]);
        return idxA - idxB;
      });
  }

  // Serialized equipment data for UI (updated when equipment changes)
  weaponSlotData?: EquipmentSlotData | null;
  armorSlotData?: EquipmentSlotData | null;
  accessorySlotData?: EquipmentSlotData | null;
  bandolierSlotsData: EquipmentSlotData[] = [];

  // Constants
  static readonly BASE_HEALTH = MercConstants.BASE_HEALTH;
  static readonly BASE_TARGETS = MercConstants.BASE_TARGETS;
  static readonly BASE_ARMOR = MercConstants.BASE_ARMOR;
  static readonly BASE_ACTIONS = MercConstants.ACTIONS_PER_DAY;

  // Helper to get equipment value with fallback to serialized data
  protected getEquipValue(
    slot: Equipment | undefined,
    slotData: EquipmentSlotData | null | undefined,
    prop: keyof EquipmentSlotData
  ): number {
    if (slot && typeof slot[prop as keyof Equipment] === 'number') {
      return slot[prop as keyof Equipment] as number;
    }
    if (slotData && typeof slotData[prop] === 'number') {
      return slotData[prop] as number;
    }
    return 0;
  }

  getMaxBandolierSlots(): number {
    const accessoryId = this.accessorySlot?.equipmentId || this.accessorySlotData?.equipmentId;
    if (accessoryId) {
      return getExtraAccessorySlots(accessoryId);
    }
    return 0;
  }

  getAvailableBandolierSlots(): number {
    const max = this.getMaxBandolierSlots();
    return Math.max(0, max - this.bandolierSlots.length);
  }

  protected getNextBandolierIndex(): number {
    const max = this.getMaxBandolierSlots();
    const used = new Set(this.bandolierSlots.map(e => parseInt(e.equippedSlot!.split(':')[1])));
    for (let i = 0; i < max; i++) {
      if (!used.has(i)) return i;
    }
    return -1;
  }

  // Helper to get base stat + equipment (without ability bonuses) for comparison
  protected getBaseStatWithEquip(stat: 'initiative' | 'training' | 'combat'): number {
    if (stat === 'initiative') {
      let value = this.baseInitiative;
      value += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'initiative');
      value += this.getEquipValue(this.armorSlot, this.armorSlotData, 'initiative');
      value += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'initiative');
      for (let i = 0; i < this.bandolierSlotsData.length; i++) {
        value += this.getEquipValue(this.bandolierSlots[i], this.bandolierSlotsData[i], 'initiative');
      }
      return value;
    } else if (stat === 'training') {
      let value = this.baseTraining;
      value += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'training');
      value += this.getEquipValue(this.armorSlot, this.armorSlotData, 'training');
      value += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'training');
      for (let i = 0; i < this.bandolierSlotsData.length; i++) {
        value += this.getEquipValue(this.bandolierSlots[i], this.bandolierSlotsData[i], 'training');
      }
      return value;
    } else {
      let value = this.baseCombat;
      value += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'combatBonus');
      value += this.getEquipValue(this.armorSlot, this.armorSlotData, 'combatBonus');
      value += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'combatBonus');
      for (let i = 0; i < this.bandolierSlotsData.length; i++) {
        value += this.getEquipValue(this.bandolierSlots[i], this.bandolierSlotsData[i], 'combatBonus');
      }
      return value;
    }
  }

  /**
   * Update computed stat caches.
   * Call this whenever equipment or abilities change.
   */
  updateComputedStats(): void {
    this.updateEquipmentBonuses();

    const ability = getMercAbility(this.unitId);
    const extraHealth = ability?.passive?.extraHealth || 0;
    this.effectiveMaxHealth = CombatUnit.BASE_HEALTH + extraHealth;

    // Training
    let t = this.baseTraining;
    t += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'training');
    t += this.getEquipValue(this.armorSlot, this.armorSlotData, 'training');
    t += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'training');
    for (let idx = 0; idx < this.bandolierSlotsData.length; idx++) {
      t += this.getEquipValue(this.bandolierSlots[idx], this.bandolierSlotsData[idx], 'training');
    }
    if (this.unitId === 'haarg') t += this.haargTrainingBonus || 0;
    if (this.unitId === 'sarge') t += this.sargeTrainingBonus || 0;
    t += this.snakeSoloTrainingBonus || 0;
    t += this.tavistoWomanTrainingBonus || 0;
    this.effectiveTraining = t;

    // Initiative
    this.effectiveInitiative = this.getEffectiveInitiative();

    // Combat
    let c = this.baseCombat;
    c += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'combatBonus');
    c += this.getEquipValue(this.armorSlot, this.armorSlotData, 'combatBonus');
    c += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'combatBonus');
    for (let idx = 0; idx < this.bandolierSlotsData.length; idx++) {
      c += this.getEquipValue(this.bandolierSlots[idx], this.bandolierSlotsData[idx], 'combatBonus');
    }
    if (this.unitId === 'haarg') c += this.haargCombatBonus || 0;
    if (this.unitId === 'sarge') c += this.sargeCombatBonus || 0;
    c += ability?.passive?.extraCombat || 0;
    c += this.boubaHandgunCombatBonus || 0;
    c += this.mayhemUziCombatBonus || 0;
    c += this.rozeskeArmorCombatBonus || 0;
    c += this.stumpyExplosiveCombatBonus || 0;
    c += this.vandradiMultiTargetCombatBonus || 0;
    c += this.dutchUnarmedCombatBonus || 0;
    c += this.snakeSoloCombatBonus || 0;
    c += this.tavistoWomanCombatBonus || 0;
    this.effectiveCombat = Math.max(0, c);
  }

  /**
   * Update Haarg's ability bonuses based on squad mates.
   */
  updateHaargBonus(squadMates: CombatUnit[]): void {
    if (this.unitId !== 'haarg') return;

    this.haargTrainingBonus = 0;
    this.haargInitiativeBonus = 0;
    this.haargCombatBonus = 0;

    for (const mate of squadMates) {
      if (mate.unitId === 'haarg' || mate.isDead) continue;
      if (mate.baseTraining > this.baseTraining) this.haargTrainingBonus = 1;
      if (mate.baseInitiative > this.baseInitiative) this.haargInitiativeBonus = 1;
      if (mate.baseCombat > this.baseCombat) this.haargCombatBonus = 1;
    }

    this.updateComputedStats();
  }

  /**
   * Update Sarge's ability bonuses based on squad mates.
   */
  updateSargeBonus(squadMates: CombatUnit[]): void {
    if (this.unitId !== 'sarge') return;

    this.sargeTrainingBonus = 0;
    this.sargeInitiativeBonus = 0;
    this.sargeCombatBonus = 0;

    let hasHighest = true;
    for (const mate of squadMates) {
      if (mate.unitId === 'sarge' || mate.isDead) continue;
      if (mate.baseInitiative >= this.baseInitiative) {
        hasHighest = false;
        break;
      }
    }

    if (hasHighest && squadMates.filter(m => !m.isDead && m.unitId !== 'sarge').length > 0) {
      this.sargeTrainingBonus = 1;
      this.sargeInitiativeBonus = 1;
      this.sargeCombatBonus = 1;
    }

    this.updateComputedStats();
  }

  /**
   * Update Tack's squad initiative bonus for this unit.
   */
  updateTackSquadBonus(squadMates: CombatUnit[]): void {
    this.tackSquadInitiativeBonus = 0;

    const tack = squadMates.find(m => m.unitId === 'tack' && !m.isDead);
    if (!tack) return;

    let tackHasHighest = true;
    for (const mate of squadMates) {
      if (mate.unitId === 'tack' || mate.isDead) continue;
      if (mate.baseInitiative > tack.baseInitiative) {
        tackHasHighest = false;
        break;
      }
    }

    if (tackHasHighest) this.tackSquadInitiativeBonus = 2;
    this.updateComputedStats();
  }

  /**
   * Update Valkyrie's squad initiative bonus for this unit.
   */
  updateValkyrieSquadBonus(squadMates: CombatUnit[]): void {
    this.valkyrieSquadInitiativeBonus = 0;
    if (this.unitId === 'valkyrie') return;

    const valkyrie = squadMates.find(m => m.unitId === 'valkyrie' && !m.isDead);
    if (!valkyrie) return;

    this.valkyrieSquadInitiativeBonus = 1;
    this.updateComputedStats();
  }

  /**
   * Update equipment-conditional bonuses for this unit.
   */
  updateEquipmentBonuses(): void {
    this.boubaHandgunCombatBonus = 0;
    this.mayhemUziCombatBonus = 0;
    this.rozeskeArmorCombatBonus = 0;
    this.stumpyExplosiveCombatBonus = 0;
    this.vandradiMultiTargetCombatBonus = 0;
    this.dutchUnarmedCombatBonus = 0;
    this.dutchUnarmedInitiativeBonus = 0;
    this.moeSmawTargetBonus = 0;
    this.raWeaponTargetBonus = 0;

    const weaponId = this.weaponSlot?.equipmentId || this.weaponSlotData?.equipmentId;
    const hasWeaponEquipped = !!weaponId;
    const hasArmorEquipped = !!(this.armorSlot?.equipmentId || this.armorSlotData?.equipmentId);
    const weaponTargets = this.weaponSlot?.targets ?? this.weaponSlotData?.targets ?? 0;

    if (this.unitId === 'bouba' && weaponId && isHandgun(weaponId)) this.boubaHandgunCombatBonus = 1;
    if (this.unitId === 'mayhem' && weaponId && isUzi(weaponId)) this.mayhemUziCombatBonus = 2;
    if (this.unitId === 'rozeske' && hasArmorEquipped) this.rozeskeArmorCombatBonus = 1;
    if (this.unitId === 'stumpy' && weaponId && isExplosive(weaponId)) this.stumpyExplosiveCombatBonus = 1;
    if (this.unitId === 'vandradi' && weaponTargets > 0) this.vandradiMultiTargetCombatBonus = 1;
    if (this.unitId === 'dutch' && !hasWeaponEquipped) {
      this.dutchUnarmedCombatBonus = 1;
      this.dutchUnarmedInitiativeBonus = 1;
    }
    if (this.unitId === 'moe' && weaponId && isSmaw(weaponId)) this.moeSmawTargetBonus = 1;
    if (this.unitId === 'ra' && hasWeaponEquipped) this.raWeaponTargetBonus = 1;
  }

  /**
   * Update Snake's solo bonuses for this unit.
   */
  updateSnakeBonus(squadMates: CombatUnit[]): void {
    this.snakeSoloCombatBonus = 0;
    this.snakeSoloInitiativeBonus = 0;
    this.snakeSoloTrainingBonus = 0;

    if (this.unitId !== 'snake') return;

    const livingMates = squadMates.filter(m => !m.isDead && m.unitId !== 'snake').length;
    if (livingMates === 0) {
      this.snakeSoloCombatBonus = 1;
      this.snakeSoloInitiativeBonus = 1;
      this.snakeSoloTrainingBonus = 1;
    }
  }

  /**
   * Update Tavisto's woman-in-squad bonuses for this unit.
   */
  updateTavistoBonus(squadMates: CombatUnit[]): void {
    this.tavistoWomanCombatBonus = 0;
    this.tavistoWomanInitiativeBonus = 0;
    this.tavistoWomanTrainingBonus = 0;

    if (this.unitId !== 'tavisto') return;

    const hasWoman = squadMates.some(m => !m.isDead && FEMALE_MERCS.includes(m.unitId));
    if (hasWoman) {
      this.tavistoWomanCombatBonus = 1;
      this.tavistoWomanInitiativeBonus = 1;
      this.tavistoWomanTrainingBonus = 1;
    }
  }

  // Stat getters with full bonus support
  get initiative(): number {
    let value = this.baseInitiative;
    value += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'initiative');
    value += this.getEquipValue(this.armorSlot, this.armorSlotData, 'initiative');
    value += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'initiative');
    for (let idx = 0; idx < this.bandolierSlotsData.length; idx++) {
      value += this.getEquipValue(this.bandolierSlots[idx], this.bandolierSlotsData[idx], 'initiative');
    }
    if (this.unitId === 'haarg') value += this.haargInitiativeBonus || 0;
    if (this.unitId === 'sarge') value += this.sargeInitiativeBonus || 0;
    if (this.tackSquadInitiativeBonus > 0) value += this.tackSquadInitiativeBonus;
    if (this.valkyrieSquadInitiativeBonus > 0) value += this.valkyrieSquadInitiativeBonus;
    value += this.dutchUnarmedInitiativeBonus || 0;
    value += this.snakeSoloInitiativeBonus || 0;
    value += this.tavistoWomanInitiativeBonus || 0;
    return value;
  }

  /**
   * Get effective initiative for combat, accounting for Vulture's ability.
   */
  getEffectiveInitiative(): number {
    let value = this.baseInitiative;
    const ignoresPenalties = ignoresInitiativePenalties(this.unitId);

    const addInitiative = (initValue: number) => {
      if (ignoresPenalties && initValue < 0) return;
      value += initValue;
    };

    addInitiative(this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'initiative'));
    addInitiative(this.getEquipValue(this.armorSlot, this.armorSlotData, 'initiative'));
    addInitiative(this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'initiative'));

    for (let idx = 0; idx < this.bandolierSlotsData.length; idx++) {
      addInitiative(this.getEquipValue(this.bandolierSlots[idx], this.bandolierSlotsData[idx], 'initiative'));
    }

    if (this.unitId === 'haarg') value += this.haargInitiativeBonus || 0;
    if (this.unitId === 'sarge') value += this.sargeInitiativeBonus || 0;
    if (this.tackSquadInitiativeBonus > 0) value += this.tackSquadInitiativeBonus;
    if (this.valkyrieSquadInitiativeBonus > 0) value += this.valkyrieSquadInitiativeBonus;
    value += this.dutchUnarmedInitiativeBonus || 0;
    value += this.snakeSoloInitiativeBonus || 0;
    value += this.tavistoWomanInitiativeBonus || 0;

    return value;
  }

  get training(): number {
    let value = this.baseTraining;
    value += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'training');
    value += this.getEquipValue(this.armorSlot, this.armorSlotData, 'training');
    value += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'training');
    for (let idx = 0; idx < this.bandolierSlotsData.length; idx++) {
      value += this.getEquipValue(this.bandolierSlots[idx], this.bandolierSlotsData[idx], 'training');
    }
    if (this.unitId === 'haarg') value += this.haargTrainingBonus || 0;
    if (this.unitId === 'sarge') value += this.sargeTrainingBonus || 0;
    value += this.snakeSoloTrainingBonus || 0;
    value += this.tavistoWomanTrainingBonus || 0;
    return value;
  }

  get combat(): number {
    let value = this.baseCombat;
    value += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'combatBonus');
    value += this.getEquipValue(this.armorSlot, this.armorSlotData, 'combatBonus');
    value += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'combatBonus');
    for (let idx = 0; idx < this.bandolierSlotsData.length; idx++) {
      value += this.getEquipValue(this.bandolierSlots[idx], this.bandolierSlotsData[idx], 'combatBonus');
    }
    if (this.unitId === 'haarg') value += this.haargCombatBonus || 0;
    if (this.unitId === 'sarge') value += this.sargeCombatBonus || 0;
    value += this.boubaHandgunCombatBonus || 0;
    value += this.mayhemUziCombatBonus || 0;
    value += this.rozeskeArmorCombatBonus || 0;
    value += this.stumpyExplosiveCombatBonus || 0;
    value += this.vandradiMultiTargetCombatBonus || 0;
    value += this.dutchUnarmedCombatBonus || 0;
    value += this.snakeSoloCombatBonus || 0;
    value += this.tavistoWomanCombatBonus || 0;
    return Math.max(0, value);
  }

  get maxHealth(): number {
    const ability = getMercAbility(this.unitId);
    const extraHealth = ability?.passive?.extraHealth || 0;
    return CombatUnit.BASE_HEALTH + extraHealth;
  }

  get health(): number {
    const calculatedHealth = this.maxHealth - this.damage;
    return calculatedHealth <= 0 ? 0 : calculatedHealth;
  }

  get targets(): number {
    let value = CombatUnit.BASE_TARGETS;
    value += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'targets');
    value += this.getEquipValue(this.armorSlot, this.armorSlotData, 'targets');
    value += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'targets');
    for (let idx = 0; idx < this.bandolierSlotsData.length; idx++) {
      value += this.getEquipValue(this.bandolierSlots[idx], this.bandolierSlotsData[idx], 'targets');
    }
    value += this.moeSmawTargetBonus || 0;
    value += this.raWeaponTargetBonus || 0;
    return value;
  }

  get equipmentArmor(): number {
    let value = CombatUnit.BASE_ARMOR;
    value += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'armorBonus');
    value += this.getEquipValue(this.armorSlot, this.armorSlotData, 'armorBonus');
    value += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'armorBonus');
    for (let idx = 0; idx < this.bandolierSlotsData.length; idx++) {
      value += this.getEquipValue(this.bandolierSlots[idx], this.bandolierSlotsData[idx], 'armorBonus');
    }
    return value;
  }

  get isDead(): boolean {
    return this.health <= 0;
  }

  get isFullyEquipped(): boolean {
    return !!(this.weaponSlot && this.armorSlot && this.accessorySlot);
  }

  takeDamage(amount: number): number {
    const actualDamage = amount;
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
    // Ewok gets +1 action (3 total instead of 2)
    if (this.unitId === 'ewok') {
      this.actionsRemaining = CombatUnit.BASE_ACTIONS + 1;
    } else {
      this.actionsRemaining = CombatUnit.BASE_ACTIONS;
    }

    // Faustina gets +1 action for training only
    if (this.unitId === 'faustina') {
      this.trainingActionsRemaining = 1;
    } else {
      this.trainingActionsRemaining = 0;
    }
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
        return !this.accessorySlot || this.getAvailableBandolierSlots() > 0;
      default:
        return false;
    }
  }

  /**
   * Sync the serialized equipment data properties from the actual slot references.
   */
  protected syncEquipmentData(): void {
    const toSlotData = (equip: Equipment | undefined): EquipmentSlotData | null => {
      if (!equip) return null;
      return {
        equipmentId: equip.equipmentId,
        equipmentName: equip.equipmentName,
        equipmentType: equip.equipmentType,
        description: equip.description,
        combatBonus: equip.combatBonus,
        initiative: equip.initiative,
        training: equip.training,
        targets: equip.targets,
        armorBonus: equip.armorBonus,
        negatesArmor: equip.negatesArmor,
        isDamaged: equip.isDamaged,
        serial: equip.serial,
        image: equip.image,
      };
    };
    this.weaponSlotData = toSlotData(this.weaponSlot);
    this.armorSlotData = toSlotData(this.armorSlot);
    this.accessorySlotData = toSlotData(this.accessorySlot);
    this.bandolierSlotsData = this.bandolierSlots.map(equip => toSlotData(equip)!);
  }

  protected equipToSlot(equipment: Equipment, slot: string): void {
    equipment.putInto(this);
    equipment.equippedSlot = slot;
    equipment.showToAll();
  }

  protected clearSlot(equipment: Equipment | undefined): Equipment | undefined {
    if (equipment) {
      equipment.equippedSlot = undefined;
    }
    return equipment;
  }

  equip(equipment: Equipment): Equipment | undefined {
    let replaced: Equipment | undefined;

    switch (equipment.equipmentType) {
      case 'Weapon':
        replaced = this.clearSlot(this.weaponSlot);
        this.equipToSlot(equipment, 'weapon');
        break;
      case 'Armor':
        replaced = this.clearSlot(this.armorSlot);
        this.equipToSlot(equipment, 'armor');
        break;
      case 'Accessory':
        if (!this.accessorySlot) {
          this.equipToSlot(equipment, 'accessory');
        } else if (this.getAvailableBandolierSlots() > 0) {
          const idx = this.getNextBandolierIndex();
          this.equipToSlot(equipment, `bandolier:${idx}`);
        } else {
          replaced = this.clearSlot(this.accessorySlot);
          this.equipToSlot(equipment, 'accessory');
        }
        break;
    }
    this.syncEquipmentData();
    this.updateComputedStats();
    return replaced;
  }

  unequip(type: EquipmentType): Equipment | undefined {
    let equipment: Equipment | undefined;
    switch (type) {
      case 'Weapon':
        equipment = this.clearSlot(this.weaponSlot);
        break;
      case 'Armor':
        equipment = this.clearSlot(this.armorSlot);
        break;
      case 'Accessory':
        equipment = this.clearSlot(this.accessorySlot);
        break;
    }
    this.syncEquipmentData();
    this.updateComputedStats();
    return equipment;
  }

  unequipBandolierSlot(index: number): Equipment | undefined {
    const equipment = this.bandolierSlots.find(e => e.equippedSlot === `bandolier:${index}`);
    if (!equipment) return undefined;
    this.clearSlot(equipment);
    this.syncEquipmentData();
    this.updateComputedStats();
    return equipment;
  }

  clearBandolierSlots(): Equipment[] {
    const items = [...this.bandolierSlots];
    for (const item of items) {
      this.clearSlot(item);
    }
    this.syncEquipmentData();
    this.updateComputedStats();
    return items;
  }

  getEquipmentOfType(type: EquipmentType): Equipment | undefined {
    switch (type) {
      case 'Weapon': return this.weaponSlot;
      case 'Armor': return this.armorSlot;
      case 'Accessory': return this.accessorySlot;
      default: return undefined;
    }
  }
}

// =============================================================================
// MERC Card - The mercenary characters
// =============================================================================

export class MercCard extends CombatUnit {
  // Identity - BoardSmith populates from JSON with these names
  mercId!: string;
  mercName!: string;

  // Provide unitId/unitName for base class compatibility
  get unitId(): string { return this.mercId; }
  get unitName(): string { return this.mercName; }

  // MERC-specific equip rules override
  override canEquip(equipment: Equipment): boolean {
    // MERC-70a: Apeiron won't use grenades or mortars
    if (this.mercId === 'apeiron') {
      const name = equipment.equipmentName.toLowerCase();
      if (name.includes('grenade') || name.includes('mortar')) {
        return false;
      }
    }

    // MERC-o7js: Bandolier cannot be combined with another bandolier
    if (equipment.equipmentId === 'bandolier') {
      if (this.accessorySlot?.equipmentId === 'bandolier') return false;
      if (this.bandolierSlots.some(e => e.equipmentId === 'bandolier')) return false;
    }

    // MERC-42g: Gunther can use all equipment slots for accessories
    if (this.mercId === 'gunther' && equipment.equipmentType === 'Accessory') {
      return !this.accessorySlot || !this.weaponSlot || !this.armorSlot || this.getAvailableBandolierSlots() > 0;
    }

    // MERC-vwi: Genesis can carry a weapon in his accessory slot
    if (this.mercId === 'genesis' && equipment.equipmentType === 'Weapon') {
      return !this.weaponSlot || !this.accessorySlot;
    }

    return super.canEquip(equipment);
  }

  // MERC-specific equip rules override
  override equip(equipment: Equipment): Equipment | undefined {
    let replaced: Equipment | undefined;

    // MERC-42g: Gunther can equip accessories in any slot
    if (this.mercId === 'gunther' && equipment.equipmentType === 'Accessory') {
      if (!this.accessorySlot) {
        this.equipToSlot(equipment, 'accessory');
      } else if (this.getAvailableBandolierSlots() > 0) {
        const idx = this.getNextBandolierIndex();
        this.equipToSlot(equipment, `bandolier:${idx}`);
      } else if (!this.weaponSlot) {
        this.equipToSlot(equipment, 'weapon');
      } else if (!this.armorSlot) {
        this.equipToSlot(equipment, 'armor');
      } else {
        replaced = this.clearSlot(this.accessorySlot);
        this.equipToSlot(equipment, 'accessory');
      }
      this.syncEquipmentData();
      this.updateComputedStats();
      return replaced;
    }

    // MERC-vwi: Genesis can equip weapons in accessory slot
    if (this.mercId === 'genesis' && equipment.equipmentType === 'Weapon') {
      if (!this.weaponSlot) {
        this.equipToSlot(equipment, 'weapon');
      } else if (!this.accessorySlot) {
        this.equipToSlot(equipment, 'accessory');
      } else {
        replaced = this.clearSlot(this.weaponSlot);
        this.equipToSlot(equipment, 'weapon');
      }
      this.syncEquipmentData();
      this.updateComputedStats();
      return replaced;
    }

    return super.equip(equipment);
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
  usesRemaining?: number;

  // Damage state - damaged equipment cannot be stashed
  isDamaged: boolean = false;

  // Expansion marker (for special game modes)
  expansion?: string;

  // Which slot this equipment is in (survives HMR via element hierarchy)
  // Values: 'weapon', 'armor', 'accessory', 'bandolier:0', 'bandolier:1', 'bandolier:2', etc.
  equippedSlot?: string;

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
  rebelMilitia: Record<string, number> = {}; // playerId -> count

  // Equipment stash - stored as element children in a Space named 'stash'
  // This ensures equipment serializes properly in gameView

  // Dictator base token
  isBase: boolean = false;

  /**
   * Get or create the stash zone (lazy initialization)
   */
  private getOrCreateStashZone(): Space {
    let zone = this.first(Space, { name: 'stash' });
    if (!zone) {
      zone = this.create(Space, 'stash');
    }
    return zone;
  }

  /**
   * Get equipment in stash as array (getter replaces old property)
   */
  get stash(): Equipment[] {
    const zone = this.first(Space, { name: 'stash' });
    return zone ? [...zone.all(Equipment)] : [];
  }

  /**
   * Get count of equipment in stash
   */
  get stashCount(): number {
    const zone = this.first(Space, { name: 'stash' });
    return zone?.count(Equipment) ?? 0;
  }

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
    for (const count of Object.values(this.rebelMilitia)) {
      total += count;
    }
    return total;
  }

  getRebelMilitia(playerId: string): number {
    return this.rebelMilitia[playerId] || 0;
  }

  /**
   * Add dictator militia to this sector.
   * @param count - Number of militia to add
   * @param bypassCap - If true, bypasses the normal 10 militia cap (for Kim's ability)
   * MERC-td6: Added bypassCap parameter for Kim's setup ability (max 20)
   */
  addDictatorMilitia(count: number, bypassCap: boolean = false): number {
    if (bypassCap) {
      // Kim's ability allows up to 20 militia
      const kimMax = 20;
      const canAdd = Math.min(count, kimMax - this.dictatorMilitia);
      this.dictatorMilitia += canAdd;
      return canAdd;
    }
    const canAdd = Math.min(count, Sector.MAX_MILITIA_PER_SIDE - this.dictatorMilitia);
    this.dictatorMilitia += canAdd;
    return canAdd;
  }

  addRebelMilitia(playerId: string, count: number): number {
    const current = this.getRebelMilitia(playerId);
    const totalRebel = this.getTotalRebelMilitia();
    const canAdd = Math.min(count, Sector.MAX_MILITIA_PER_SIDE - totalRebel);
    this.rebelMilitia[playerId] = current + canAdd;
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
    this.rebelMilitia[playerId] = current - removed;
    return removed;
  }

  explore(): void {
    this.explored = true;
  }

  /**
   * Add equipment to sector stash.
   * Damaged equipment cannot be stashed - must be discarded instead.
   * Uses putInto() to move equipment into the element tree for proper serialization.
   * @returns true if added, false if equipment was damaged
   */
  addToStash(equipment: Equipment): boolean {
    if (equipment.isDamaged) {
      // Damaged equipment cannot be stashed - caller should discard
      return false;
    }
    const zone = this.getOrCreateStashZone();
    equipment.putInto(zone);  // Move into element tree
    return true;
  }

  /**
   * Take equipment from stash by index.
   * Returns the equipment element - caller is responsible for moving it.
   */
  takeFromStash(index: number): Equipment | undefined {
    const zone = this.first(Space, { name: 'stash' });
    if (!zone) return undefined;
    const items = zone.all(Equipment);
    if (index >= 0 && index < items.length) {
      return items[index];  // Caller moves it with putInto() or equip()
    }
    return undefined;
  }

  /**
   * Remove specific equipment from stash by reference.
   * Note: The equipment is already in the element tree, caller moves it elsewhere.
   * @returns true if found in stash, false if not found
   */
  removeFromStash(equipment: Equipment): boolean {
    const zone = this.first(Space, { name: 'stash' });
    if (!zone) return false;
    const found = zone.first(Equipment, e => e.id === equipment.id);
    return !!found;
    // Note: equipment.putInto(newParent) by caller actually moves it out of stash
  }

  /**
   * Find equipment in stash by type
   */
  findInStash(type: EquipmentType): Equipment | undefined {
    const zone = this.first(Space, { name: 'stash' });
    if (!zone) return undefined;
    return zone.first(Equipment, e => e.equipmentType === type);
  }

  /**
   * Get all equipment in stash
   */
  getStashContents(): Equipment[] {
    return this.stash;  // Uses the getter
  }
}

// =============================================================================
// Dictator Card - Extends CombatUnit with minimal dictator-specific logic
// =============================================================================

export class DictatorCard extends CombatUnit {
  // Identity - BoardSmith populates from JSON with these names
  dictatorId!: string;
  dictatorName!: string;

  // Provide unitId/unitName for base class compatibility
  get unitId(): string { return this.dictatorId; }
  get unitName(): string { return this.dictatorName; }

  // Dictator-specific state
  inPlay: boolean = false;

  /**
   * Put the dictator into play (when base is revealed).
   */
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
  // Cards with "revealsBase": true in JSON will trigger base reveal UI
  // Must be a property (not getter) for BoardSmith to populate from JSON
  revealsBase: boolean = false;
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
    return this.getMercs().length;
  }

  // Get only living MERCs (for UI and certain game logic)
  getLivingMercs(): MercCard[] {
    return this.all(MercCard).filter(m => !m.isDead);
  }

  get livingMercCount(): number {
    return this.getLivingMercs().length;
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
  position?: number;
  playerColor?: string;
}
