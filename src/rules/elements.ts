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
  // Location tracking (used for dictator MERCs; rebel MERCs use Squad.sectorId)
  // Must have default value for serialization to gameView
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
  boubaHandgunCombatBonus: number = 0;      // Bouba: +1 combat with handgun
  mayhemUziCombatBonus: number = 0;         // Mayhem: +2 combat with Uzi
  rozeskeArmorCombatBonus: number = 0;      // Rozeske: +1 combat with armor
  stumpyExplosiveCombatBonus: number = 0;   // Stumpy: +1 combat with explosives
  vandradiMultiTargetCombatBonus: number = 0; // Vandradi: +1 combat with multi-target weapon
  dutchUnarmedCombatBonus: number = 0;      // Dutch: +1 combat without weapon
  dutchUnarmedInitiativeBonus: number = 0;  // Dutch: +1 initiative without weapon
  moeSmawTargetBonus: number = 0;           // Moe: +1 target with SMAW
  raWeaponTargetBonus: number = 0;          // Ra: +1 target with any weapon

  // Squad-conditional bonuses (displayed in UI tooltips)
  snakeSoloCombatBonus: number = 0;         // Snake: +1 combat when alone
  snakeSoloInitiativeBonus: number = 0;     // Snake: +1 initiative when alone
  snakeSoloTrainingBonus: number = 0;       // Snake: +1 training when alone
  tavistoWomanCombatBonus: number = 0;      // Tavisto: +1 combat with woman in squad
  tavistoWomanInitiativeBonus: number = 0;  // Tavisto: +1 initiative with woman in squad
  tavistoWomanTrainingBonus: number = 0;    // Tavisto: +1 training with woman in squad

  // Faustina's extra training-only action (separate from regular actions)
  trainingActionsRemaining: number = 0;     // Faustina: +1 action for training only

  // Computed stat caches (updated when equipment/abilities change)
  // These are serialized and sent to the UI since getters aren't serialized by BoardSmith
  effectiveTraining: number = 0;
  effectiveInitiative: number = 0;
  effectiveCombat: number = 0;
  effectiveMaxHealth: number = MercConstants.BASE_HEALTH;

  // Equipment slots - now stored as child elements with equippedSlot attribute
  // These getters query children, making equipment survive HMR via element hierarchy
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
  // BoardSmith doesn't serialize element references, only plain data
  weaponSlotData?: EquipmentSlotData | null;
  armorSlotData?: EquipmentSlotData | null;
  accessorySlotData?: EquipmentSlotData | null;
  bandolierSlotsData: EquipmentSlotData[] = [];

  // Constants (imported from game constants)
  static readonly BASE_HEALTH = MercConstants.BASE_HEALTH;
  static readonly BASE_TARGETS = MercConstants.BASE_TARGETS;
  static readonly BASE_ARMOR = MercConstants.BASE_ARMOR;
  static readonly BASE_ACTIONS = MercConstants.ACTIONS_PER_DAY;

  // Helper to get equipment value with fallback to serialized data
  // BoardSmith doesn't serialize element references, so we need to check *SlotData
  private getEquipValue(
    slot: Equipment | undefined,
    slotData: EquipmentSlotData | null | undefined,
    prop: keyof EquipmentSlotData
  ): number {
    // Try the slot reference first (available during session)
    if (slot && typeof slot[prop as keyof Equipment] === 'number') {
      return slot[prop as keyof Equipment] as number;
    }
    // Fall back to serialized data (available after restore)
    if (slotData && typeof slotData[prop] === 'number') {
      return slotData[prop] as number;
    }
    return 0;
  }

  /**
   * Get the maximum number of bandolier slots available.
   * Returns 0 if no bandolier is equipped, otherwise the extraAccessorySlots value.
   */
  getMaxBandolierSlots(): number {
    // Check accessory slot for bandolier
    const accessoryId = this.accessorySlot?.equipmentId || this.accessorySlotData?.equipmentId;
    if (accessoryId) {
      return getExtraAccessorySlots(accessoryId);
    }
    return 0;
  }

  /**
   * Get the number of available (empty) bandolier slots.
   * Now uses bandolierSlots getter which queries children (survives HMR).
   */
  getAvailableBandolierSlots(): number {
    const max = this.getMaxBandolierSlots();
    return Math.max(0, max - this.bandolierSlots.length);
  }

  /**
   * Get the next available bandolier slot index.
   * Returns -1 if no slots available.
   */
  private getNextBandolierIndex(): number {
    const max = this.getMaxBandolierSlots();
    const used = new Set(this.bandolierSlots.map(e => parseInt(e.equippedSlot!.split(':')[1])));
    for (let i = 0; i < max; i++) {
      if (!used.has(i)) return i;
    }
    return -1;
  }

  // Helper to get base stat + equipment (without Haarg bonus) for comparison
  private getBaseStatWithEquip(stat: 'initiative' | 'training' | 'combat'): number {
    if (stat === 'initiative') {
      let value = this.baseInitiative;
      value += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'initiative');
      value += this.getEquipValue(this.armorSlot, this.armorSlotData, 'initiative');
      value += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'initiative');
      // Add bandolier slot bonuses (use data length as source of truth - element refs aren't serialized)
      for (let i = 0; i < this.bandolierSlotsData.length; i++) {
        value += this.getEquipValue(this.bandolierSlots[i], this.bandolierSlotsData[i], 'initiative');
      }
      return value;
    } else if (stat === 'training') {
      let value = this.baseTraining;
      value += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'training');
      value += this.getEquipValue(this.armorSlot, this.armorSlotData, 'training');
      value += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'training');
      // Add bandolier slot bonuses (use data length as source of truth - element refs aren't serialized)
      for (let i = 0; i < this.bandolierSlotsData.length; i++) {
        value += this.getEquipValue(this.bandolierSlots[i], this.bandolierSlotsData[i], 'training');
      }
      return value;
    } else {
      let value = this.baseCombat;
      value += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'combatBonus');
      value += this.getEquipValue(this.armorSlot, this.armorSlotData, 'combatBonus');
      value += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'combatBonus');
      // Add bandolier slot bonuses (use data length as source of truth - element refs aren't serialized)
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
    // First update equipment-conditional bonuses
    this.updateEquipmentBonuses();

    // MaxHealth - check for ability bonuses (e.g., Juicer's +2 health)
    const ability = getMercAbility(this.mercId);
    const extraHealth = ability?.passive?.extraHealth || 0;
    this.effectiveMaxHealth = MercCard.BASE_HEALTH + extraHealth;

    // Training
    let t = this.baseTraining;
    t += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'training');
    t += this.getEquipValue(this.armorSlot, this.armorSlotData, 'training');
    t += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'training');
    // Add bandolier slot bonuses (use data length as source of truth)
    for (let idx = 0; idx < this.bandolierSlotsData.length; idx++) {
      t += this.getEquipValue(this.bandolierSlots[idx], this.bandolierSlotsData[idx], 'training');
    }
    if (this.mercId === 'haarg') {
      t += this.haargTrainingBonus || 0;
    }
    if (this.mercId === 'sarge') {
      t += this.sargeTrainingBonus || 0;
    }
    // Snake's solo training bonus
    t += this.snakeSoloTrainingBonus || 0;
    // Tavisto's woman-in-squad training bonus
    t += this.tavistoWomanTrainingBonus || 0;
    this.effectiveTraining = t;

    // Initiative - use getEffectiveInitiative() which accounts for Vulture's ability
    this.effectiveInitiative = this.getEffectiveInitiative();

    // Combat
    let c = this.baseCombat;
    c += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'combatBonus');
    c += this.getEquipValue(this.armorSlot, this.armorSlotData, 'combatBonus');
    c += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'combatBonus');
    // Add bandolier slot bonuses (use data length as source of truth)
    for (let idx = 0; idx < this.bandolierSlotsData.length; idx++) {
      c += this.getEquipValue(this.bandolierSlots[idx], this.bandolierSlotsData[idx], 'combatBonus');
    }
    if (this.mercId === 'haarg') {
      c += this.haargCombatBonus || 0;
    }
    if (this.mercId === 'sarge') {
      c += this.sargeCombatBonus || 0;
    }
    // Add ability-based combat bonus (e.g., Shooter's +3 combat)
    c += ability?.passive?.extraCombat || 0;
    // Equipment-conditional combat bonuses
    c += this.boubaHandgunCombatBonus || 0;
    c += this.mayhemUziCombatBonus || 0;
    c += this.rozeskeArmorCombatBonus || 0;
    c += this.stumpyExplosiveCombatBonus || 0;
    c += this.vandradiMultiTargetCombatBonus || 0;
    c += this.dutchUnarmedCombatBonus || 0;
    // Snake's solo combat bonus
    c += this.snakeSoloCombatBonus || 0;
    // Tavisto's woman-in-squad combat bonus
    c += this.tavistoWomanCombatBonus || 0;
    this.effectiveCombat = Math.max(0, c);
  }

  /**
   * Update Haarg's ability bonuses based on squad mates.
   * Call this whenever squad composition changes.
   * @param squadMates - Array of other MERCs in the same squad
   */
  updateHaargBonus(squadMates: MercCard[]): void {
    if (this.mercId !== 'haarg') return;

    // Reset bonuses
    this.haargTrainingBonus = 0;
    this.haargInitiativeBonus = 0;
    this.haargCombatBonus = 0;

    // Check each stat against squad mates' BASE stats
    for (const mate of squadMates) {
      if (mate.mercId === 'haarg' || mate.isDead) continue;

      if (mate.baseTraining > this.baseTraining) {
        this.haargTrainingBonus = 1;
      }
      if (mate.baseInitiative > this.baseInitiative) {
        this.haargInitiativeBonus = 1;
      }
      if (mate.baseCombat > this.baseCombat) {
        this.haargCombatBonus = 1;
      }
    }

    // Update computed stats after changing bonuses
    this.updateComputedStats();
  }

  /**
   * Update Sarge's ability bonuses based on squad mates.
   * Sarge gets +1 to all skills when his BASE initiative is highest in the squad.
   * Call this whenever squad composition changes.
   * @param squadMates - Array of all MERCs in the same squad (including Sarge)
   */
  updateSargeBonus(squadMates: MercCard[]): void {
    if (this.mercId !== 'sarge') return;

    // Reset bonuses
    this.sargeTrainingBonus = 0;
    this.sargeInitiativeBonus = 0;
    this.sargeCombatBonus = 0;

    // Check if Sarge has highest BASE initiative in squad
    let hasHighest = true;
    for (const mate of squadMates) {
      if (mate.mercId === 'sarge' || mate.isDead) continue;

      // Compare BASE initiatives only (no equipment)
      if (mate.baseInitiative >= this.baseInitiative) {
        hasHighest = false;
        break;
      }
    }

    // If Sarge has highest base initiative, give +1 to all skills
    if (hasHighest && squadMates.filter(m => !m.isDead && m.mercId !== 'sarge').length > 0) {
      this.sargeTrainingBonus = 1;
      this.sargeInitiativeBonus = 1;
      this.sargeCombatBonus = 1;
    }

    // Update computed stats after changing bonuses
    this.updateComputedStats();
  }

  /**
   * Update Tack's squad initiative bonus for this MERC.
   * When Tack has highest initiative in the squad, all squad members get +2 initiative.
   * Call this whenever squad composition or initiative changes.
   * @param squadMates - Array of all MERCs in the same squad
   */
  updateTackSquadBonus(squadMates: MercCard[]): void {
    // Reset bonus
    this.tackSquadInitiativeBonus = 0;

    // Find Tack in the squad
    const tack = squadMates.find(m => m.mercId === 'tack' && !m.isDead);
    if (!tack) return;

    // Check if Tack has highest BASE initiative in squad
    let tackHasHighest = true;
    for (const mate of squadMates) {
      if (mate.mercId === 'tack' || mate.isDead) continue;

      // Compare BASE initiatives only (no equipment or bonuses)
      if (mate.baseInitiative > tack.baseInitiative) {
        tackHasHighest = false;
        break;
      }
    }

    // If Tack has highest base initiative, give +2 to all squad members (including Tack)
    if (tackHasHighest) {
      this.tackSquadInitiativeBonus = 2;
    }

    // Update computed stats after changing bonuses
    this.updateComputedStats();
  }

  /**
   * Update Valkyrie's squad initiative bonus for this MERC.
   * When Valkyrie is in the squad, all OTHER squad members get +1 initiative.
   * Call this whenever squad composition changes.
   * @param squadMates - Array of all MERCs in the same squad
   */
  updateValkyrieSquadBonus(squadMates: MercCard[]): void {
    // Reset bonus
    this.valkyrieSquadInitiativeBonus = 0;

    // Valkyrie herself doesn't get the bonus
    if (this.mercId === 'valkyrie') return;

    // Find Valkyrie in the squad
    const valkyrie = squadMates.find(m => m.mercId === 'valkyrie' && !m.isDead);
    if (!valkyrie) return;

    // Give +1 initiative to this squad mate
    this.valkyrieSquadInitiativeBonus = 1;

    // Update computed stats after changing bonuses
    this.updateComputedStats();
  }

  /**
   * Update equipment-conditional bonuses for this MERC.
   * These bonuses depend on what equipment is equipped:
   * - Bouba: +1 combat with handgun
   * - Mayhem: +2 combat with Uzi
   * - Rozeske: +1 combat with armor
   * - Stumpy: +1 combat with explosives
   * - Vandradi: +1 combat with multi-target weapon
   * - Dutch: +1 combat and +1 initiative without weapon
   * - Moe: +1 target with SMAW
   * - Ra: +1 target with any weapon
   * Call this whenever equipment changes.
   */
  updateEquipmentBonuses(): void {
    // Reset all equipment-conditional bonuses
    this.boubaHandgunCombatBonus = 0;
    this.mayhemUziCombatBonus = 0;
    this.rozeskeArmorCombatBonus = 0;
    this.stumpyExplosiveCombatBonus = 0;
    this.vandradiMultiTargetCombatBonus = 0;
    this.dutchUnarmedCombatBonus = 0;
    this.dutchUnarmedInitiativeBonus = 0;
    this.moeSmawTargetBonus = 0;
    this.raWeaponTargetBonus = 0;

    // Get weapon info
    const weaponId = this.weaponSlot?.equipmentId || this.weaponSlotData?.equipmentId;
    const hasWeaponEquipped = !!weaponId;
    const hasArmorEquipped = !!(this.armorSlot?.equipmentId || this.armorSlotData?.equipmentId);
    const weaponTargets = this.weaponSlot?.targets ?? this.weaponSlotData?.targets ?? 0;

    // Bouba: +1 combat with handgun
    if (this.mercId === 'bouba' && weaponId && isHandgun(weaponId)) {
      this.boubaHandgunCombatBonus = 1;
    }

    // Mayhem: +2 combat with Uzi
    if (this.mercId === 'mayhem' && weaponId && isUzi(weaponId)) {
      this.mayhemUziCombatBonus = 2;
    }

    // Rozeske: +1 combat with armor
    if (this.mercId === 'rozeske' && hasArmorEquipped) {
      this.rozeskeArmorCombatBonus = 1;
    }

    // Stumpy: +1 combat with explosives
    if (this.mercId === 'stumpy' && weaponId && isExplosive(weaponId)) {
      this.stumpyExplosiveCombatBonus = 1;
    }

    // Vandradi: +1 combat with multi-target weapon (targets > 0)
    if (this.mercId === 'vandradi' && weaponTargets > 0) {
      this.vandradiMultiTargetCombatBonus = 1;
    }

    // Dutch: +1 combat and +1 initiative without weapon
    if (this.mercId === 'dutch' && !hasWeaponEquipped) {
      this.dutchUnarmedCombatBonus = 1;
      this.dutchUnarmedInitiativeBonus = 1;
    }

    // Moe: +1 target with SMAW
    if (this.mercId === 'moe' && weaponId && isSmaw(weaponId)) {
      this.moeSmawTargetBonus = 1;
    }

    // Ra: +1 target with any weapon
    if (this.mercId === 'ra' && hasWeaponEquipped) {
      this.raWeaponTargetBonus = 1;
    }
  }

  /**
   * Update Snake's solo bonuses for this MERC.
   * Snake gets +1 to all stats when alone in the squad.
   * Call this whenever squad composition changes.
   * @param squadMates - Array of all MERCs in the same squad
   */
  updateSnakeBonus(squadMates: MercCard[]): void {
    // Reset bonuses
    this.snakeSoloCombatBonus = 0;
    this.snakeSoloInitiativeBonus = 0;
    this.snakeSoloTrainingBonus = 0;

    // Only Snake gets this bonus
    if (this.mercId !== 'snake') return;

    // Count living squad mates (excluding self)
    const livingMates = squadMates.filter(m => !m.isDead && m.mercId !== 'snake').length;

    // If alone in squad, give +1 to all stats
    if (livingMates === 0) {
      this.snakeSoloCombatBonus = 1;
      this.snakeSoloInitiativeBonus = 1;
      this.snakeSoloTrainingBonus = 1;
    }
  }

  /**
   * Update Tavisto's woman-in-squad bonuses for this MERC.
   * Tavisto gets +1 to all stats when there's a woman in the squad.
   * Call this whenever squad composition changes.
   * @param squadMates - Array of all MERCs in the same squad
   */
  updateTavistoBonus(squadMates: MercCard[]): void {
    // Reset bonuses
    this.tavistoWomanCombatBonus = 0;
    this.tavistoWomanInitiativeBonus = 0;
    this.tavistoWomanTrainingBonus = 0;

    // Only Tavisto gets this bonus
    if (this.mercId !== 'tavisto') return;

    // Check if there's a living woman in the squad
    const hasWoman = squadMates.some(m => !m.isDead && FEMALE_MERCS.includes(m.mercId));

    // If there's a woman, give +1 to all stats
    if (hasWoman) {
      this.tavistoWomanCombatBonus = 1;
      this.tavistoWomanInitiativeBonus = 1;
      this.tavistoWomanTrainingBonus = 1;
    }
  }

  // Computed stats including equipment bonuses and Haarg's ability
  // Note: Getters are inlined to ensure they work during BoardSmith serialization
  get initiative(): number {
    let value = this.baseInitiative;
    value += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'initiative');
    value += this.getEquipValue(this.armorSlot, this.armorSlotData, 'initiative');
    value += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'initiative');
    // Add bandolier slot bonuses (use data length as source of truth)
    for (let idx = 0; idx < this.bandolierSlotsData.length; idx++) {
      value += this.getEquipValue(this.bandolierSlots[idx], this.bandolierSlotsData[idx], 'initiative');
    }
    // Haarg's ability bonus
    if (this.mercId === 'haarg') {
      value += this.haargInitiativeBonus || 0;
    }
    // Sarge's ability bonus
    if (this.mercId === 'sarge') {
      value += this.sargeInitiativeBonus || 0;
    }
    // Tack's squad bonus (when Tack has highest initiative in squad)
    if (this.tackSquadInitiativeBonus > 0) {
      value += this.tackSquadInitiativeBonus;
    }
    // Valkyrie's squad bonus (squad mates get +1)
    if (this.valkyrieSquadInitiativeBonus > 0) {
      value += this.valkyrieSquadInitiativeBonus;
    }
    // Dutch's unarmed initiative bonus
    value += this.dutchUnarmedInitiativeBonus || 0;
    // Snake's solo initiative bonus
    value += this.snakeSoloInitiativeBonus || 0;
    // Tavisto's woman-in-squad initiative bonus
    value += this.tavistoWomanInitiativeBonus || 0;
    return value;
  }

  /**
   * Get effective initiative for combat, accounting for Vulture's ability.
   * Vulture ignores initiative PENALTIES (negative values) from equipment,
   * but still receives initiative BONUSES (positive values).
   */
  getEffectiveInitiative(): number {
    let value = this.baseInitiative;

    // Check if this MERC ignores initiative penalties (Vulture)
    const ignoresPenalties = ignoresInitiativePenalties(this.mercId);

    // Helper to add initiative value, filtering out penalties if needed
    const addInitiative = (initValue: number) => {
      if (ignoresPenalties && initValue < 0) {
        return; // Vulture ignores negative initiative from equipment
      }
      value += initValue;
    };

    // Add equipment initiative (filtering penalties for Vulture)
    addInitiative(this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'initiative'));
    addInitiative(this.getEquipValue(this.armorSlot, this.armorSlotData, 'initiative'));
    addInitiative(this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'initiative'));

    // Add bandolier slot bonuses
    for (let idx = 0; idx < this.bandolierSlotsData.length; idx++) {
      addInitiative(this.getEquipValue(this.bandolierSlots[idx], this.bandolierSlotsData[idx], 'initiative'));
    }

    // Haarg's ability bonus (not equipment, so always applied)
    if (this.mercId === 'haarg') {
      value += this.haargInitiativeBonus || 0;
    }
    // Sarge's ability bonus (not equipment, so always applied)
    if (this.mercId === 'sarge') {
      value += this.sargeInitiativeBonus || 0;
    }

    // Tack's squad bonus (when Tack has highest initiative in squad)
    if (this.tackSquadInitiativeBonus > 0) {
      value += this.tackSquadInitiativeBonus;
    }

    // Valkyrie's squad bonus (squad mates get +1)
    if (this.valkyrieSquadInitiativeBonus > 0) {
      value += this.valkyrieSquadInitiativeBonus;
    }

    // Dutch's unarmed initiative bonus
    value += this.dutchUnarmedInitiativeBonus || 0;
    // Snake's solo initiative bonus
    value += this.snakeSoloInitiativeBonus || 0;
    // Tavisto's woman-in-squad initiative bonus
    value += this.tavistoWomanInitiativeBonus || 0;

    return value;
  }

  get training(): number {
    let value = this.baseTraining;
    value += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'training');
    value += this.getEquipValue(this.armorSlot, this.armorSlotData, 'training');
    value += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'training');
    // Add bandolier slot bonuses (use data length as source of truth)
    for (let idx = 0; idx < this.bandolierSlotsData.length; idx++) {
      value += this.getEquipValue(this.bandolierSlots[idx], this.bandolierSlotsData[idx], 'training');
    }
    // Haarg's ability bonus
    if (this.mercId === 'haarg') {
      value += this.haargTrainingBonus || 0;
    }
    // Sarge's ability bonus
    if (this.mercId === 'sarge') {
      value += this.sargeTrainingBonus || 0;
    }
    // Snake's solo training bonus
    value += this.snakeSoloTrainingBonus || 0;
    // Tavisto's woman-in-squad training bonus
    value += this.tavistoWomanTrainingBonus || 0;
    return value;
  }

  get combat(): number {
    let value = this.baseCombat;
    value += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'combatBonus');
    value += this.getEquipValue(this.armorSlot, this.armorSlotData, 'combatBonus');
    value += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'combatBonus');
    // Add bandolier slot bonuses (use data length as source of truth)
    for (let idx = 0; idx < this.bandolierSlotsData.length; idx++) {
      value += this.getEquipValue(this.bandolierSlots[idx], this.bandolierSlotsData[idx], 'combatBonus');
    }
    // Haarg's ability bonus
    if (this.mercId === 'haarg') {
      value += this.haargCombatBonus || 0;
    }
    // Sarge's ability bonus
    if (this.mercId === 'sarge') {
      value += this.sargeCombatBonus || 0;
    }
    // Equipment-conditional combat bonuses
    value += this.boubaHandgunCombatBonus || 0;
    value += this.mayhemUziCombatBonus || 0;
    value += this.rozeskeArmorCombatBonus || 0;
    value += this.stumpyExplosiveCombatBonus || 0;
    value += this.vandradiMultiTargetCombatBonus || 0;
    value += this.dutchUnarmedCombatBonus || 0;
    // Snake's solo combat bonus
    value += this.snakeSoloCombatBonus || 0;
    // Tavisto's woman-in-squad combat bonus
    value += this.tavistoWomanCombatBonus || 0;
    return Math.max(0, value);
  }

  get maxHealth(): number {
    // Check for ability-based health bonuses (e.g., Juicer's +2 health)
    const ability = getMercAbility(this.mercId);
    const extraHealth = ability?.passive?.extraHealth || 0;
    return MercCard.BASE_HEALTH + extraHealth;
  }

  get health(): number {
    // MERC-iqe: Per rules 13-clarifications-and-edge-cases.md,
    // minimum health is 1 to prevent edge cases
    const calculatedHealth = this.maxHealth - this.damage;
    return calculatedHealth <= 0 ? 0 : calculatedHealth;
  }

  get targets(): number {
    let value = MercCard.BASE_TARGETS;
    value += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'targets');
    value += this.getEquipValue(this.armorSlot, this.armorSlotData, 'targets');
    value += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'targets');
    // Add bandolier slot bonuses (use data length as source of truth)
    for (let idx = 0; idx < this.bandolierSlotsData.length; idx++) {
      value += this.getEquipValue(this.bandolierSlots[idx], this.bandolierSlotsData[idx], 'targets');
    }
    // Moe's SMAW target bonus
    value += this.moeSmawTargetBonus || 0;
    // Ra's weapon target bonus
    value += this.raWeaponTargetBonus || 0;
    return value;
  }

  get equipmentArmor(): number {
    let value = MercCard.BASE_ARMOR;
    value += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'armorBonus');
    value += this.getEquipValue(this.armorSlot, this.armorSlotData, 'armorBonus');
    value += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'armorBonus');
    // Add bandolier slot bonuses (use data length as source of truth)
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
    // MERC-qb1: Ewok gets +1 action (3 total instead of 2)
    if (this.mercId === 'ewok') {
      this.actionsRemaining = MercCard.BASE_ACTIONS + 1;
    } else {
      this.actionsRemaining = MercCard.BASE_ACTIONS;
    }

    // MERC-bd4: Faustina gets +1 action for training only (separate from regular actions)
    if (this.mercId === 'faustina') {
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
    // MERC-70a: Apeiron won't use grenades or mortars
    if (this.mercId === 'apeiron') {
      const name = equipment.equipmentName.toLowerCase();
      if (name.includes('grenade') || name.includes('mortar')) {
        return false;
      }
    }

    // MERC-42g: Gunther can use all equipment slots for accessories
    if (this.mercId === 'gunther' && equipment.equipmentType === 'Accessory') {
      // Gunther can equip accessory if ANY slot is empty or bandolier slots available
      return !this.accessorySlot || !this.weaponSlot || !this.armorSlot || this.getAvailableBandolierSlots() > 0;
    }

    // MERC-vwi: Genesis can carry a weapon in his accessory slot
    if (this.mercId === 'genesis' && equipment.equipmentType === 'Weapon') {
      // Genesis can equip weapon if weapon slot OR accessory slot is empty
      return !this.weaponSlot || !this.accessorySlot;
    }

    switch (equipment.equipmentType) {
      case 'Weapon':
        return !this.weaponSlot;
      case 'Armor':
        return !this.armorSlot;
      case 'Accessory':
        // Can equip accessory if main slot is empty OR bandolier slots available
        return !this.accessorySlot || this.getAvailableBandolierSlots() > 0;
      default:
        return false;
    }
  }

  /**
   * Sync the serialized equipment data properties from the actual slot references.
   * Called after equip/unequip to ensure UI gets updated data.
   */
  private syncEquipmentData(): void {
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
    // Sync bandolier slots data
    this.bandolierSlotsData = this.bandolierSlots.map(equip => toSlotData(equip)!);
  }

  /**
   * Helper to equip item to a specific slot.
   * Moves equipment to be a child of this MERC and sets equippedSlot.
   */
  private equipToSlot(equipment: Equipment, slot: string): void {
    equipment.putInto(this);
    equipment.equippedSlot = slot;
    // Equipped items are visible to all players (visibility fix for dictator MERCs)
    equipment.showToAll();
  }

  /**
   * Helper to unequip from a slot.
   * Clears equippedSlot but does NOT move the equipment - caller must handle that.
   */
  private clearSlot(equipment: Equipment | undefined): Equipment | undefined {
    if (equipment) {
      equipment.equippedSlot = undefined;
    }
    return equipment;
  }

  equip(equipment: Equipment): Equipment | undefined {
    let replaced: Equipment | undefined;

    // MERC-42g: Gunther can equip accessories in any slot
    if (this.mercId === 'gunther' && equipment.equipmentType === 'Accessory') {
      // Try accessory slot first, then bandolier slots, then weapon, then armor
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
        // All slots full, replace accessory slot
        replaced = this.clearSlot(this.accessorySlot);
        this.equipToSlot(equipment, 'accessory');
      }
      this.syncEquipmentData();
      this.updateComputedStats();
      return replaced;
    }

    // MERC-vwi: Genesis can equip weapons in accessory slot
    if (this.mercId === 'genesis' && equipment.equipmentType === 'Weapon') {
      // Try weapon slot first, then accessory slot
      if (!this.weaponSlot) {
        this.equipToSlot(equipment, 'weapon');
      } else if (!this.accessorySlot) {
        this.equipToSlot(equipment, 'accessory');
      } else {
        // Both slots full, replace weapon slot
        replaced = this.clearSlot(this.weaponSlot);
        this.equipToSlot(equipment, 'weapon');
      }
      this.syncEquipmentData();
      this.updateComputedStats();
      return replaced;
    }

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
        // Try main accessory slot first, then bandolier slots
        if (!this.accessorySlot) {
          this.equipToSlot(equipment, 'accessory');
        } else if (this.getAvailableBandolierSlots() > 0) {
          const idx = this.getNextBandolierIndex();
          this.equipToSlot(equipment, `bandolier:${idx}`);
        } else {
          // No bandolier slots available, replace main accessory
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
        // Note: When unequipping bandolier, bandolier slots become invalid
        // The caller should handle clearing bandolierSlots if needed
        break;
    }
    this.syncEquipmentData();
    this.updateComputedStats();
    return equipment;
  }

  /**
   * Unequip an item from a specific bandolier slot.
   * @param index - The index of the bandolier slot (0-based)
   * @returns The unequipped equipment, or undefined if slot was empty
   */
  unequipBandolierSlot(index: number): Equipment | undefined {
    const equipment = this.bandolierSlots.find(e => e.equippedSlot === `bandolier:${index}`);
    if (!equipment) {
      return undefined;
    }
    this.clearSlot(equipment);
    this.syncEquipmentData();
    this.updateComputedStats();
    return equipment;
  }

  /**
   * Get all items that would be dropped if the bandolier is unequipped.
   * Used to return bandolier slot items to stash when bandolier is removed.
   */
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
      case 'Weapon':
        return this.weaponSlot;
      case 'Armor':
        return this.armorSlot;
      case 'Accessory':
        return this.accessorySlot;
      default:
        return undefined;
    }
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

  // MERC-07j: Location tracking (like MercCard)
  // Must have default value for serialization to gameView
  sectorId: string = '';

  // Equipment slots - now stored as child elements with equippedSlot attribute
  // These getters query children, making equipment survive HMR via element hierarchy
  get weaponSlot(): Equipment | undefined {
    return this.first(Equipment, e => e.equippedSlot === 'weapon');
  }
  get armorSlot(): Equipment | undefined {
    return this.first(Equipment, e => e.equippedSlot === 'armor');
  }
  get accessorySlot(): Equipment | undefined {
    return this.first(Equipment, e => e.equippedSlot === 'accessory');
  }

  // Constants (same as MercCard)
  static readonly BASE_ACTIONS = MercConstants.ACTIONS_PER_DAY;

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

  // MERC-07j: Action methods (matching MercCard interface)
  resetActions(): void {
    this.actionsRemaining = DictatorCard.BASE_ACTIONS;
  }

  useAction(cost: number = 1): boolean {
    if (this.actionsRemaining >= cost) {
      this.actionsRemaining -= cost;
      return true;
    }
    return false;
  }

  // MERC-07j: Equipment methods (matching MercCard interface)
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

  /**
   * Helper to equip item to a specific slot.
   * Moves equipment to be a child of this Dictator and sets equippedSlot.
   */
  private equipToSlot(equipment: Equipment, slot: string): void {
    equipment.putInto(this);
    equipment.equippedSlot = slot;
    // Equipped items are visible to all players
    equipment.showToAll();
  }

  /**
   * Helper to unequip from a slot.
   * Clears equippedSlot but does NOT move the equipment - caller must handle that.
   */
  private clearSlot(equipment: Equipment | undefined): Equipment | undefined {
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
        replaced = this.clearSlot(this.accessorySlot);
        this.equipToSlot(equipment, 'accessory');
        break;
    }
    return replaced;
  }

  unequip(type: EquipmentType): Equipment | undefined {
    switch (type) {
      case 'Weapon':
        return this.clearSlot(this.weaponSlot);
      case 'Armor':
        return this.clearSlot(this.armorSlot);
      case 'Accessory':
        return this.clearSlot(this.accessorySlot);
    }
    return undefined;
  }

  getEquipmentOfType(type: EquipmentType): Equipment | undefined {
    switch (type) {
      case 'Weapon':
        return this.weaponSlot;
      case 'Armor':
        return this.armorSlot;
      case 'Accessory':
        return this.accessorySlot;
      default:
        return undefined;
    }
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
}
