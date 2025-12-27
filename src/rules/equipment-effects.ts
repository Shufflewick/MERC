/**
 * Equipment Effects Registry
 *
 * Data-driven equipment system that replaces scattered string matching checks.
 * All equipment special effects are defined here.
 */

// =============================================================================
// Effect Type Definitions
// =============================================================================

/**
 * Weapon category for MERC ability checks
 */
export type WeaponCategory =
  | 'handgun'      // Bouba gets +1 combat
  | 'uzi'          // Mayhem gets +2 combat
  | 'sword'        // Dutch uses fists bonus
  | 'smaw'         // Moe gets +1 target
  | 'explosive'    // Grenade/mortar - Stumpy gets +1 combat
  | 'rifle'        // Standard rifles
  | 'other';

/**
 * Vehicle movement bonuses
 */
export interface VehicleEffect {
  /** Spaces moved per action */
  movementSpaces: number;
  /** Actions required to move */
  actionsRequired: number;
  /** Max MERCs/militia that can ride */
  capacity: number;
  /** Can move diagonally */
  diagonalMovement?: boolean;
}

/**
 * Healing item properties
 */
export interface HealingEffect {
  /** Health restored per use */
  healPerUse: number;
  /** Combat dice discarded per heal */
  dicePerHeal: number;
  /** Total uses before discard */
  totalUses: number;
}

/**
 * Complete equipment effect definition
 */
export interface EquipmentEffect {
  /** Equipment ID matching equipment.json */
  id: string;

  // --- Weapon Categories (for MERC abilities) ---
  /** Weapon category for ability checks */
  weaponCategory?: WeaponCategory;

  // --- Consumable Properties ---
  /** Item is discarded after use(s) */
  consumable?: boolean;
  /** Number of uses before discard (for multi-use items like Medical Kit) */
  uses?: number;
  /** Discarded after combat attack (grenades) */
  discardAfterAttack?: boolean;

  // --- Healing Properties ---
  /** Healing effect details */
  healing?: HealingEffect;

  // --- Special Items ---
  /** Prevents death and restores health (Epinephrine) */
  preventsDeath?: boolean;
  /** Health restored when preventing death */
  deathPreventionHeal?: number;

  /** Land mine that can be armed in stash */
  isLandMine?: boolean;
  /** Damage dealt when mine detonates */
  mineDamage?: number;

  /** Attack dog with special combat behavior */
  isAttackDog?: boolean;
  /** Attack dog health */
  attackDogHealth?: number;

  /** Repair kit - retrieve from discard */
  retrievesFromDiscard?: boolean;

  /** Extra accessory slots (Bandolier) */
  extraAccessorySlots?: number;

  /** Vehicle with movement bonus */
  vehicle?: VehicleEffect;

  // --- Win Conditions (Expansion B) ---
  /** Part of explosives/detonator win condition */
  isExplosivesComponent?: boolean;
  /** The matching component needed to win */
  matchingComponent?: string;

  // --- Mortar (ranged attack) ---
  /** Can attack adjacent sector */
  rangedAttack?: boolean;
  /** Range in sectors */
  rangedRange?: number;

  // --- Armor Items ---
  /** Equipment is armor (provides armorBonus stat) */
  isArmor?: boolean;
}

// =============================================================================
// Equipment Effects Registry
// =============================================================================

export const EQUIPMENT_EFFECTS: Record<string, EquipmentEffect> = {
  // --- Handguns ---
  '9mm-handgun': {
    id: '9mm-handgun',
    weaponCategory: 'handgun',
  },
  '9mm-handgun-with-ap-ammo': {
    id: '9mm-handgun-with-ap-ammo',
    weaponCategory: 'handgun',
  },
  '9mm-handgun-with-laser-sight': {
    id: '9mm-handgun-with-laser-sight',
    weaponCategory: 'handgun',
  },
  '45-caliber-handgun': {
    id: '45-caliber-handgun',
    weaponCategory: 'handgun',
  },
  '45-caliber-handgun-with-ap-ammo': {
    id: '45-caliber-handgun-with-ap-ammo',
    weaponCategory: 'handgun',
  },
  '45-caliber-handgun-with-laser-sight': {
    id: '45-caliber-handgun-with-laser-sight',
    weaponCategory: 'handgun',
  },

  // --- Uzis ---
  'uzi': {
    id: 'uzi',
    weaponCategory: 'uzi',
  },
  'uzi-with-ap-ammo': {
    id: 'uzi-with-ap-ammo',
    weaponCategory: 'uzi',
  },

  // --- Rifles ---
  'm16': {
    id: 'm16',
    weaponCategory: 'rifle',
  },
  'm16-with-ap-ammo': {
    id: 'm16-with-ap-ammo',
    weaponCategory: 'rifle',
  },
  'm16-with-burst-fire': {
    id: 'm16-with-burst-fire',
    weaponCategory: 'rifle',
  },
  'm16-with-laser-sight': {
    id: 'm16-with-laser-sight',
    weaponCategory: 'rifle',
  },
  'ak-47': {
    id: 'ak-47',
    weaponCategory: 'rifle',
  },
  'ak-47-with-bipod': {
    id: 'ak-47-with-bipod',
    weaponCategory: 'rifle',
  },
  'ak-47-with-burst-fire': {
    id: 'ak-47-with-burst-fire',
    weaponCategory: 'rifle',
  },
  'ak-47-with-full-auto': {
    id: 'ak-47-with-full-auto',
    weaponCategory: 'rifle',
  },
  '50-caliber-rifle': {
    id: '50-caliber-rifle',
    weaponCategory: 'rifle',
  },
  '50-caliber-rifle-with-flir-scope': {
    id: '50-caliber-rifle-with-flir-scope',
    weaponCategory: 'rifle',
  },

  // --- SMAW ---
  'smaw': {
    id: 'smaw',
    weaponCategory: 'smaw',
  },

  // --- Explosives (Grenades/Mortars) ---
  'grenade': {
    id: 'grenade',
    weaponCategory: 'explosive',
    consumable: true,
    discardAfterAttack: true,
  },
  'fragmentation-grenade': {
    id: 'fragmentation-grenade',
    weaponCategory: 'explosive',
    consumable: true,
    discardAfterAttack: true,
  },
  'mortar': {
    id: 'mortar',
    weaponCategory: 'explosive',
    consumable: true,
    discardAfterAttack: true,
    rangedAttack: true,
    rangedRange: 1,
  },

  // --- Healing Items ---
  'medical-kit': {
    id: 'medical-kit',
    healing: {
      healPerUse: 1,
      dicePerHeal: 1,
      totalUses: 3,
    },
    consumable: true,
    uses: 3,
  },
  'first-aid-kit': {
    id: 'first-aid-kit',
    healing: {
      healPerUse: 1,
      dicePerHeal: 1,
      totalUses: 1,
    },
    consumable: true,
    uses: 1,
  },
  'epinephrine-shot': {
    id: 'epinephrine-shot',
    preventsDeath: true,
    deathPreventionHeal: 1,
    consumable: true,
  },

  // --- Special Accessories ---
  'land-mine': {
    id: 'land-mine',
    isLandMine: true,
    mineDamage: 1,
    consumable: true,
  },
  'attack-dog': {
    id: 'attack-dog',
    isAttackDog: true,
    attackDogHealth: 3,
  },
  'repair-kit': {
    id: 'repair-kit',
    retrievesFromDiscard: true,
    consumable: true,
  },
  'bandolier': {
    id: 'bandolier',
    extraAccessorySlots: 3,
  },
  'field-radio': {
    id: 'field-radio',
    // Just stat bonuses, no special effect
  },
  'army-fm-30-25': {
    id: 'army-fm-30-25',
    // Just training bonus, no special effect
  },

  // --- Vehicles (Expansion A) ---
  'chopper': {
    id: 'chopper',
    vehicle: {
      movementSpaces: 2,
      actionsRequired: 1,
      capacity: 4,
      diagonalMovement: true,
    },
  },
  'deuce': {
    id: 'deuce',
    vehicle: {
      movementSpaces: 1,
      actionsRequired: 1,
      capacity: 10,
    },
  },
  'humvee': {
    id: 'humvee',
    vehicle: {
      movementSpaces: 2,
      actionsRequired: 1,
      capacity: 4,
    },
  },
  'jeep': {
    id: 'jeep',
    vehicle: {
      movementSpaces: 2,
      actionsRequired: 1,
      capacity: 4,
    },
  },
  'tank': {
    id: 'tank',
    vehicle: {
      movementSpaces: 1,
      actionsRequired: 2,
      capacity: 4,
    },
  },

  // --- Win Condition Items (Expansion B) ---
  'detonator': {
    id: 'detonator',
    isExplosivesComponent: true,
    matchingComponent: 'explosives',
  },
  'explosives': {
    id: 'explosives',
    isExplosivesComponent: true,
    matchingComponent: 'detonator',
  },

  // --- Armor Items ---
  // Armor provides stat bonuses (armorBonus, combat penalty, initiative penalty)
  // These are defined here for registry completeness
  'body-armor': {
    id: 'body-armor',
    isArmor: true,
  },
  'body-armor-with-ceramic-plates': {
    id: 'body-armor-with-ceramic-plates',
    isArmor: true,
  },
  'body-armor-with-ceramic-plates-and-kevlar-helmet': {
    id: 'body-armor-with-ceramic-plates-and-kevlar-helmet',
    isArmor: true,
  },
  'flak-vest': {
    id: 'flak-vest',
    isArmor: true,
  },
  'flak-vest-with-ceramic-plates-and-kevlar-helmet': {
    id: 'flak-vest-with-ceramic-plates-and-kevlar-helmet',
    isArmor: true,
  },
  'flak-vest-with-kevlar-helmet': {
    id: 'flak-vest-with-kevlar-helmet',
    isArmor: true,
  },
  'full-body-armor': {
    id: 'full-body-armor',
    isArmor: true,
  },
  'ghillie-suit': {
    id: 'ghillie-suit',
    isArmor: true,
  },
  'kevlar-vest': {
    id: 'kevlar-vest',
    isArmor: true,
  },
  'kevlar-vest-with-ceramic-plates': {
    id: 'kevlar-vest-with-ceramic-plates',
    isArmor: true,
  },
  'kevlar-vest-with-ceramic-plates-and-kevlar-helmet': {
    id: 'kevlar-vest-with-ceramic-plates-and-kevlar-helmet',
    isArmor: true,
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get equipment effect by ID
 */
export function getEquipmentEffect(equipmentId: string): EquipmentEffect | undefined {
  return EQUIPMENT_EFFECTS[equipmentId];
}

/**
 * Check if equipment is a specific weapon category
 */
export function isWeaponCategory(equipmentId: string, category: WeaponCategory): boolean {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.weaponCategory === category;
}

/**
 * Check if equipment is a handgun
 */
export function isHandgun(equipmentId: string): boolean {
  return isWeaponCategory(equipmentId, 'handgun');
}

/**
 * Check if equipment is an Uzi
 */
export function isUzi(equipmentId: string): boolean {
  return isWeaponCategory(equipmentId, 'uzi');
}

/**
 * Check if equipment is an explosive (grenade/mortar)
 */
export function isExplosive(equipmentId: string): boolean {
  return isWeaponCategory(equipmentId, 'explosive');
}

/**
 * Check if equipment is a sword (for Dutch's ability)
 */
export function isSword(equipmentId: string): boolean {
  return isWeaponCategory(equipmentId, 'sword');
}

/**
 * Check if equipment is a SMAW
 */
export function isSmaw(equipmentId: string): boolean {
  return isWeaponCategory(equipmentId, 'smaw');
}

/**
 * Check if equipment is a land mine
 */
export function isLandMine(equipmentId: string): boolean {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.isLandMine ?? false;
}

/**
 * Check if equipment is an attack dog
 */
export function isAttackDog(equipmentId: string): boolean {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.isAttackDog ?? false;
}

/**
 * Check if equipment is an epinephrine shot
 */
export function isEpinephrine(equipmentId: string): boolean {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.preventsDeath ?? false;
}

/**
 * Check if equipment is a repair kit
 */
export function isRepairKit(equipmentId: string): boolean {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.retrievesFromDiscard ?? false;
}

/**
 * Check if equipment is a healing item
 */
export function isHealingItem(equipmentId: string): boolean {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.healing !== undefined;
}

/**
 * Get healing amount per use (0 if not a healing item)
 */
export function getHealAmount(equipmentId: string): number {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.healing?.healPerUse ?? 0;
}

/**
 * Get total uses for a healing item (0 if not a healing item)
 */
export function getHealingUses(equipmentId: string): number {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.healing?.totalUses ?? 0;
}

/**
 * Check if equipment is consumable
 */
export function isConsumable(equipmentId: string): boolean {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.consumable ?? false;
}

/**
 * Check if equipment should be discarded after attack
 */
export function discardAfterAttack(equipmentId: string): boolean {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.discardAfterAttack ?? false;
}

/**
 * Check if equipment is a vehicle
 */
export function isVehicle(equipmentId: string): boolean {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.vehicle !== undefined;
}

/**
 * Get vehicle movement details (undefined if not a vehicle)
 */
export function getVehicleEffect(equipmentId: string): VehicleEffect | undefined {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.vehicle;
}

/**
 * Check if equipment has ranged attack capability
 */
export function hasRangedAttack(equipmentId: string): boolean {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.rangedAttack ?? false;
}

/**
 * Get ranged attack range (0 if no ranged attack)
 */
export function getRangedRange(equipmentId: string): number {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.rangedRange ?? 0;
}

/**
 * Get land mine damage (0 if not a mine)
 */
export function getMineDamage(equipmentId: string): number {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.mineDamage ?? 0;
}

/**
 * Get attack dog health (0 if not a dog)
 */
export function getAttackDogHealth(equipmentId: string): number {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.attackDogHealth ?? 0;
}

/**
 * Check if equipment is part of the explosives/detonator win condition
 */
export function isExplosivesComponent(equipmentId: string): boolean {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.isExplosivesComponent ?? false;
}

/**
 * Get the matching component for win condition
 */
export function getMatchingComponent(equipmentId: string): string | undefined {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.matchingComponent;
}

/**
 * Get extra accessory slots provided by equipment (0 if none)
 */
export function getExtraAccessorySlots(equipmentId: string): number {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.extraAccessorySlots ?? 0;
}

/**
 * Check if equipment is armor
 */
export function isArmor(equipmentId: string): boolean {
  const effect = EQUIPMENT_EFFECTS[equipmentId];
  return effect?.isArmor ?? false;
}
