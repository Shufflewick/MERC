/**
 * MERC Ability Registry
 *
 * Data-driven ability system that replaces scattered if (mercId === 'xxx') checks.
 * All MERC abilities are defined here with their modifiers and conditions.
 */

// =============================================================================
// Ability Type Definitions
// =============================================================================

/**
 * Conditions for when an ability activates
 */
export type AbilityCondition =
  | 'always'                    // Always active
  | 'highestInitInSquad'        // Has highest initiative in squad
  | 'hasHandgun'                // Has a handgun equipped
  | 'hasUzi'                    // Has an Uzi equipped
  | 'hasArmor'                  // Has armor equipped
  | 'hasAccessory'              // Has accessory equipped
  | 'hasExplosive'              // Has grenade or mortar equipped
  | 'hasMultiTargetWeapon'      // Has weapon with targets > 0
  | 'hasSmaw'                   // Has SMAW equipped
  | 'hasSwordOrUnarmed'         // Has sword or no weapon (Dutch)
  | 'womanInSquad'              // A woman is in the squad
  | 'aloneInSquad';             // Only MERC in squad (Snake)

/**
 * Who the bonus applies to
 */
export type BonusTarget = 'self' | 'squadMates' | 'allSquad' | 'enemyMercs';

/**
 * Combat modifiers that affect dice rolling and hit calculation
 */
export interface CombatModifier {
  /** Hit on this number or higher (default 4) */
  hitThreshold?: number;
  /** Combat stat bonus when condition met */
  combatBonus?: number;
  /** Initiative bonus when condition met */
  initiativeBonus?: number;
  /** Training bonus when condition met */
  trainingBonus?: number;
  /** Extra targets when condition met */
  targetBonus?: number;
  /** Condition for this modifier to apply */
  condition?: AbilityCondition;
}

/**
 * Bonuses applied to squad mates
 */
export interface SquadBonus {
  /** Initiative bonus to apply */
  initiative?: number;
  /** Combat bonus to apply */
  combat?: number;
  /** Training bonus to apply */
  training?: number;
  /** Condition for bonus to apply */
  condition?: AbilityCondition;
  /** Who receives the bonus */
  appliesTo?: BonusTarget;
}

/**
 * Debuffs applied to enemies
 */
export interface EnemyDebuff {
  /** Combat penalty to enemies */
  combat?: number;
  /** Initiative penalty to enemies */
  initiative?: number;
  /** Who is affected */
  appliesTo?: 'enemyMercs' | 'allEnemies';
}

/**
 * Special targeting behaviors
 */
export interface TargetingBehavior {
  /** Always has initiative over militia (Badger) */
  alwaysBeforesMilitia?: boolean;
  /** Always goes first in combat (Kastern) */
  alwaysFirst?: boolean;
  /** Rolls D6 for initiative at combat start (Khenn) */
  rollsInitiative?: boolean;
  /** Is always the last MERC targeted (Runde) */
  targetedLast?: boolean;
  /** Ignores initiative penalties from equipment (Vulture) */
  ignoresInitiativePenalties?: boolean;
  /** Always attacks MERCs instead of militia when possible (Buzzkill) */
  prioritizeMercs?: boolean;
  /** Each hit on militia can kill separate militia (Rizen) */
  eachHitNewMilitiaTarget?: boolean;
  /** Can redirect 6s to other targets (Wolverine) */
  sixesCanRetarget?: boolean;
}

/**
 * Special combat actions
 */
export interface CombatAction {
  /** May reroll all dice once per combat (Basic) */
  mayRerollOnce?: boolean;
  /** Can sacrifice a die to heal 1 to squad mate (Surgeon) */
  sacrificeDieToHeal?: boolean;
  /** May attack before first round (Golem) */
  preemptiveStrike?: boolean;
  /** Fires second shot at end of round (Vandal) */
  secondShot?: boolean;
  /** Each hit on militia can convert instead of kill (Adelheid) */
  convertsMilitia?: boolean;
}

/**
 * Passive abilities and restrictions
 */
export interface PassiveAbility {
  /** Immune to attack dogs (Shadkaam) */
  immuneToAttackDogs?: boolean;
  /** Will not harm dogs (Tao) */
  willNotHarmDogs?: boolean;
  /** Won't use grenades or mortars (Apeiron) */
  wontUseExplosives?: boolean;
  /** Won't fight without accessory (Meatbop) */
  requiresAccessory?: boolean;
  /** Doesn't count toward team limit (Teresa) */
  doesntCountTowardLimit?: boolean;
  /** Auto-heals 1 per day (Preaction) */
  autoHealPerDay?: number;
  /** Extra actions per turn (Ewok) */
  extraActions?: number;
  /** Extra training-only actions (Faustina) */
  extraTrainingActions?: number;
  /** Extra health (Juicer) */
  extraHealth?: number;
  /** Can carry weapon in accessory slot (Genesis) */
  weaponInAccessorySlot?: boolean;
  /** All slots can be accessories (Gunther) */
  allSlotsAccessories?: boolean;
  /** Gets free accessory on hire (Vrbansk) */
  freeAccessoryOnHire?: boolean;
  /** Can bring militia when moving (Sonia) */
  bringsMilitia?: number;
  /** Heals all squad outside combat (Doc) */
  healsSquadOutsideCombat?: boolean;
  /** Can take equipment from discard (Feedback) */
  retrievesFromDiscard?: boolean;
  /** Disarms/arms land mines (Squidhead) */
  handlesLandMines?: boolean;
  /** Draws equipment for squad mate (Hagness) */
  drawsEquipmentForSquad?: boolean;
  /** Gives militia initiative bonus (Walter) */
  militiaInitiativeBonus?: number;
}

/**
 * Work restrictions - who won't work with who
 */
export interface WorkRestriction {
  /** Won't work with these MERCs */
  incompatibleWith?: string[];
}

/**
 * Complete MERC ability definition
 */
export interface MercAbility {
  /** MERC ID matching mercs.json */
  id: string;
  /** Combat stat modifiers */
  combatModifiers?: CombatModifier;
  /** Bonuses to squad mates */
  squadBonus?: SquadBonus;
  /** Debuffs to enemies */
  enemyDebuff?: EnemyDebuff;
  /** Special targeting behaviors */
  targeting?: TargetingBehavior;
  /** Special combat actions */
  combatActions?: CombatAction;
  /** Passive abilities */
  passive?: PassiveAbility;
  /** Work restrictions */
  restrictions?: WorkRestriction;
  /** Is this MERC female? (for Tavisto's ability) */
  isFemale?: boolean;
}

// =============================================================================
// MERC Ability Registry
// =============================================================================

export const MERC_ABILITIES: Record<string, MercAbility> = {
  // --- MERCs with Combat Modifiers ---

  lucid: {
    id: 'lucid',
    combatModifiers: { hitThreshold: 3 },
  },

  bouba: {
    id: 'bouba',
    combatModifiers: { combatBonus: 1, condition: 'hasHandgun' },
  },

  mayhem: {
    id: 'mayhem',
    combatModifiers: { combatBonus: 2, condition: 'hasUzi' },
  },

  rozeske: {
    id: 'rozeske',
    combatModifiers: { combatBonus: 1, condition: 'hasArmor' },
  },

  stumpy: {
    id: 'stumpy',
    combatModifiers: { combatBonus: 1, condition: 'hasExplosive' },
  },

  vandradi: {
    id: 'vandradi',
    combatModifiers: { combatBonus: 1, condition: 'hasMultiTargetWeapon' },
  },

  moe: {
    id: 'moe',
    combatModifiers: { targetBonus: 1, condition: 'hasSmaw' },
  },

  dutch: {
    id: 'dutch',
    combatModifiers: {
      combatBonus: 1,
      initiativeBonus: 1,
      condition: 'hasSwordOrUnarmed',
    },
  },

  snake: {
    id: 'snake',
    combatModifiers: {
      combatBonus: 1,
      initiativeBonus: 1,
      trainingBonus: 1,
      condition: 'aloneInSquad',
    },
  },

  ra: {
    id: 'ra',
    combatModifiers: { targetBonus: 1, condition: 'always' },
  },

  // --- MERCs with Conditional Self Bonuses ---

  sarge: {
    id: 'sarge',
    combatModifiers: {
      combatBonus: 1,
      initiativeBonus: 1,
      trainingBonus: 1,
      condition: 'highestInitInSquad',
    },
  },

  tavisto: {
    id: 'tavisto',
    combatModifiers: {
      combatBonus: 1,
      initiativeBonus: 1,
      trainingBonus: 1,
      condition: 'womanInSquad',
    },
  },

  haarg: {
    id: 'haarg',
    // Special: +1 to any skill someone in squad has higher
    // Implemented in elements.ts MercCard.getHaargBonus()
    passive: {},
  },

  // --- MERCs with Squad Bonuses ---

  tack: {
    id: 'tack',
    isFemale: true,
    squadBonus: {
      initiative: 2,
      condition: 'highestInitInSquad',
      appliesTo: 'allSquad',
    },
  },

  valkyrie: {
    id: 'valkyrie',
    isFemale: true,
    squadBonus: {
      initiative: 1,
      condition: 'always',
      appliesTo: 'squadMates',
    },
  },

  walter: {
    id: 'walter',
    passive: { militiaInitiativeBonus: 2 },
  },

  // --- MERCs with Enemy Debuffs ---

  max: {
    id: 'max',
    enemyDebuff: {
      combat: -1,
      appliesTo: 'enemyMercs',
    },
  },

  // --- MERCs with Targeting Behaviors ---

  badger: {
    id: 'badger',
    targeting: { alwaysBeforesMilitia: true },
  },

  kastern: {
    id: 'kastern',
    targeting: { alwaysFirst: true },
  },

  khenn: {
    id: 'khenn',
    targeting: { rollsInitiative: true },
  },

  runde: {
    id: 'runde',
    targeting: { targetedLast: true },
  },

  vulture: {
    id: 'vulture',
    targeting: { ignoresInitiativePenalties: true },
  },

  buzzkill: {
    id: 'buzzkill',
    targeting: { prioritizeMercs: true },
  },

  rizen: {
    id: 'rizen',
    targeting: { eachHitNewMilitiaTarget: true },
  },

  wolverine: {
    id: 'wolverine',
    targeting: { sixesCanRetarget: true },
  },

  // --- MERCs with Combat Actions ---

  basic: {
    id: 'basic',
    combatActions: { mayRerollOnce: true },
  },

  surgeon: {
    id: 'surgeon',
    combatActions: { sacrificeDieToHeal: true },
  },

  golem: {
    id: 'golem',
    combatActions: { preemptiveStrike: true },
  },

  vandal: {
    id: 'vandal',
    combatActions: { secondShot: true },
  },

  adelheid: {
    id: 'adelheid',
    isFemale: true,
    combatActions: { convertsMilitia: true },
  },

  // --- MERCs with Passive Abilities ---

  shadkaam: {
    id: 'shadkaam',
    passive: { immuneToAttackDogs: true },
  },

  tao: {
    id: 'tao',
    passive: { willNotHarmDogs: true },
  },

  apeiron: {
    id: 'apeiron',
    passive: { wontUseExplosives: true },
  },

  meatbop: {
    id: 'meatbop',
    passive: { requiresAccessory: true },
  },

  teresa: {
    id: 'teresa',
    isFemale: true,
    passive: { doesntCountTowardLimit: true },
  },

  preaction: {
    id: 'preaction',
    passive: { autoHealPerDay: 1 },
  },

  ewok: {
    id: 'ewok',
    isFemale: true,
    passive: { extraActions: 1 },
  },

  faustina: {
    id: 'faustina',
    isFemale: true,
    passive: { extraTrainingActions: 1 },
  },

  juicer: {
    id: 'juicer',
    passive: { extraHealth: 2 },
  },

  genesis: {
    id: 'genesis',
    passive: { weaponInAccessorySlot: true },
  },

  gunther: {
    id: 'gunther',
    passive: { allSlotsAccessories: true },
  },

  vrbansk: {
    id: 'vrbansk',
    passive: { freeAccessoryOnHire: true },
  },

  sonia: {
    id: 'sonia',
    isFemale: true,
    passive: { bringsMilitia: 2 },
  },

  doc: {
    id: 'doc',
    passive: { healsSquadOutsideCombat: true },
  },

  feedback: {
    id: 'feedback',
    passive: { retrievesFromDiscard: true },
  },

  squidhead: {
    id: 'squidhead',
    passive: { handlesLandMines: true },
  },

  hagness: {
    id: 'hagness',
    passive: { drawsEquipmentForSquad: true },
  },

  // --- MERCs with Work Restrictions ---

  borris: {
    id: 'borris',
    restrictions: { incompatibleWith: ['squirrel'] },
  },

  moose: {
    id: 'moose',
    restrictions: { incompatibleWith: ['borris'] },
  },

  natasha: {
    id: 'natasha',
    isFemale: true,
    restrictions: { incompatibleWith: ['moose'] },
  },

  squirrel: {
    id: 'squirrel',
    restrictions: { incompatibleWith: ['natasha'] },
  },

  // --- MERCs with no special abilities (just stats) ---

  shooter: {
    id: 'shooter',
    // Just has high combat (6), no special ability
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get ability definition for a MERC by ID
 */
export function getMercAbility(mercId: string): MercAbility | undefined {
  return MERC_ABILITIES[mercId];
}

/**
 * Check if a MERC has a specific combat modifier condition
 */
export function hasCombatCondition(mercId: string, condition: AbilityCondition): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.combatModifiers?.condition === condition;
}

/**
 * Get the hit threshold for a MERC (default 4)
 */
export function getHitThreshold(mercId: string): number {
  const ability = MERC_ABILITIES[mercId];
  return ability?.combatModifiers?.hitThreshold ?? 4;
}

/**
 * Check if a MERC is female (for Tavisto's ability)
 */
export function isFemale(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.isFemale ?? false;
}

/**
 * List of all female MERC IDs
 */
export const FEMALE_MERCS = Object.entries(MERC_ABILITIES)
  .filter(([_, ability]) => ability.isFemale)
  .map(([id]) => id);

/**
 * Check if a MERC can reroll dice once per combat
 */
export function canRerollOnce(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.combatActions?.mayRerollOnce ?? false;
}

/**
 * Check if a MERC can sacrifice a die to heal
 */
export function canSacrificeDieToHeal(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.combatActions?.sacrificeDieToHeal ?? false;
}

/**
 * Check if a MERC always goes first in combat
 */
export function alwaysGoesFirst(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.targeting?.alwaysFirst ?? false;
}

/**
 * Check if a MERC always has initiative over militia
 */
export function alwaysBeforesMilitia(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.targeting?.alwaysBeforesMilitia ?? false;
}

/**
 * Check if a MERC rolls for initiative
 */
export function rollsForInitiative(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.targeting?.rollsInitiative ?? false;
}

/**
 * Check if a MERC is always targeted last
 */
export function isTargetedLast(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.targeting?.targetedLast ?? false;
}

/**
 * Check if a MERC ignores initiative penalties
 */
export function ignoresInitiativePenalties(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.targeting?.ignoresInitiativePenalties ?? false;
}

/**
 * Check if a MERC prioritizes attacking MERCs over militia
 */
export function prioritizesMercs(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.targeting?.prioritizeMercs ?? false;
}

/**
 * Check if a MERC's hits count as new targets against militia
 */
export function eachHitNewMilitiaTarget(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.targeting?.eachHitNewMilitiaTarget ?? false;
}

/**
 * Check if a MERC can retarget 6s
 */
export function canRetargetSixes(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.targeting?.sixesCanRetarget ?? false;
}

/**
 * Check if a MERC can perform a preemptive strike
 */
export function canPreemptiveStrike(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.combatActions?.preemptiveStrike ?? false;
}

/**
 * Check if a MERC fires a second shot
 */
export function firesSecondShot(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.combatActions?.secondShot ?? false;
}

/**
 * Check if a MERC can convert militia instead of killing
 */
export function canConvertMilitia(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.combatActions?.convertsMilitia ?? false;
}

/**
 * Check if a MERC is immune to attack dogs
 */
export function isImmuneToAttackDogs(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.passive?.immuneToAttackDogs ?? false;
}

/**
 * Check if a MERC won't harm dogs
 */
export function willNotHarmDogs(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.passive?.willNotHarmDogs ?? false;
}

/**
 * Check if a MERC won't use explosives
 */
export function wontUseExplosives(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.passive?.wontUseExplosives ?? false;
}

/**
 * Check if a MERC requires an accessory to fight
 */
export function requiresAccessory(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.passive?.requiresAccessory ?? false;
}

/**
 * Check if a MERC doesn't count toward team limit
 */
export function doesntCountTowardLimit(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.passive?.doesntCountTowardLimit ?? false;
}

/**
 * Get auto-heal amount per day (0 if none)
 */
export function getAutoHealPerDay(mercId: string): number {
  const ability = MERC_ABILITIES[mercId];
  return ability?.passive?.autoHealPerDay ?? 0;
}

/**
 * Get extra actions for a MERC (0 if none)
 */
export function getExtraActions(mercId: string): number {
  const ability = MERC_ABILITIES[mercId];
  return ability?.passive?.extraActions ?? 0;
}

/**
 * Get extra training-only actions (0 if none)
 */
export function getExtraTrainingActions(mercId: string): number {
  const ability = MERC_ABILITIES[mercId];
  return ability?.passive?.extraTrainingActions ?? 0;
}

/**
 * Get extra health for a MERC (0 if none)
 */
export function getExtraHealth(mercId: string): number {
  const ability = MERC_ABILITIES[mercId];
  return ability?.passive?.extraHealth ?? 0;
}

/**
 * Check if a MERC can carry a weapon in accessory slot
 */
export function canWeaponInAccessorySlot(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.passive?.weaponInAccessorySlot ?? false;
}

/**
 * Check if all slots can be accessories
 */
export function allSlotsAccessories(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.passive?.allSlotsAccessories ?? false;
}

/**
 * Check if a MERC gets a free accessory on hire
 */
export function getsFreeAccessoryOnHire(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.passive?.freeAccessoryOnHire ?? false;
}

/**
 * Get number of militia a MERC can bring when moving
 */
export function getMilitiaBringCount(mercId: string): number {
  const ability = MERC_ABILITIES[mercId];
  return ability?.passive?.bringsMilitia ?? 0;
}

/**
 * Check if a MERC heals squad outside combat
 */
export function healsSquadOutsideCombat(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.passive?.healsSquadOutsideCombat ?? false;
}

/**
 * Check if a MERC can retrieve from discard
 */
export function canRetrieveFromDiscard(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.passive?.retrievesFromDiscard ?? false;
}

/**
 * Check if a MERC handles land mines
 */
export function handlesLandMines(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.passive?.handlesLandMines ?? false;
}

/**
 * Check if a MERC draws equipment for squad
 */
export function drawsEquipmentForSquad(mercId: string): boolean {
  const ability = MERC_ABILITIES[mercId];
  return ability?.passive?.drawsEquipmentForSquad ?? false;
}

/**
 * Get militia initiative bonus provided by a MERC
 */
export function getMilitiaInitiativeBonus(mercId: string): number {
  const ability = MERC_ABILITIES[mercId];
  return ability?.passive?.militiaInitiativeBonus ?? 0;
}

/**
 * Get enemy combat debuff applied by a MERC
 */
export function getEnemyCombatDebuff(mercId: string): number {
  const ability = MERC_ABILITIES[mercId];
  return ability?.enemyDebuff?.combat ?? 0;
}

/**
 * Check if two MERCs are incompatible
 */
export function areIncompatible(mercId1: string, mercId2: string): boolean {
  const ability1 = MERC_ABILITIES[mercId1];
  const ability2 = MERC_ABILITIES[mercId2];

  return (
    (ability1?.restrictions?.incompatibleWith?.includes(mercId2) ?? false) ||
    (ability2?.restrictions?.incompatibleWith?.includes(mercId1) ?? false)
  );
}

/**
 * Get list of MERCs that a MERC won't work with
 */
export function getIncompatibleMercs(mercId: string): string[] {
  const ability = MERC_ABILITIES[mercId];
  return ability?.restrictions?.incompatibleWith ?? [];
}
