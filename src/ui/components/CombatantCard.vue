<script setup lang="ts">
import { computed, ref } from 'vue';
import { getPlayerColor, UI_COLORS } from '../colors';
import { GameOverlay } from 'boardsmith/ui';
import EquipmentCard from './EquipmentCard.vue';
import CombatantIconSmall from './CombatantIconSmall.vue';
import ModalContent from './ModalContent.vue';

// Stat breakdown item for tooltips
interface StatBreakdownItem {
  label: string;
  value: number;
}

interface MercData {
  // Data can be at root level or nested in 'attributes'
  attributes?: Record<string, any>;
  // Root level properties (may not exist if data is in attributes)
  id?: string | number;
  ref?: string;
  combatantName?: string;
  name?: string;
  image?: string;
  baseTraining?: number;
  baseCombat?: number;
  baseInitiative?: number;
  training?: number;
  combat?: number;
  initiative?: number;
  health?: number;
  maxHealth?: number;
  damage?: number;
  actionsRemaining?: number;
  ability?: string;
  bio?: string;
  weaponSlot?: { equipmentName?: string; name?: string } | null;
  armorSlot?: { equipmentName?: string; name?: string } | null;
  accessorySlot?: { equipmentName?: string; name?: string } | null;
  bandolierSlotsData?: Array<{ equipmentName?: string; name?: string }>;
  // Unified ability stat modifiers from server - populated by updateAbilityBonuses()
  activeStatModifiers?: Array<{
    stat: string;
    bonus: number;
    label?: string;
  }>;
}

const props = defineProps<{
  merc: MercData;
  playerColor?: string;
  squadName?: string;  // "Primary" or "Secondary" - shown in team color
  sectorName?: string; // Sector location - shown under name
  showEquipment?: boolean;
  compact?: boolean;
  canDropEquipment?: boolean;
  abilityAvailable?: boolean; // Whether the MERC's ability action can be used
  pendingSlot?: 'Weapon' | 'Armor' | 'Accessory' | null; // Highlight this slot as pending selection
  canReassign?: boolean; // Whether clicking the squad badge triggers reassignment
}>();

const emit = defineEmits<{
  dropEquipment: [combatantElementId: number, equipmentId: number];
  activateAbility: [combatantId: string];
  reassignCombatant: [combatantName: string];
}>();

// Handle ability button click
function onAbilityClick() {
  emit('activateAbility', combatantId.value as string);
}

// Handle squad badge click (for reassignment)
function onSquadBadgeClick() {
  if (!props.canReassign) return;
  emit('reassignCombatant', displayName.value);
}

// Helper to get a property from either attributes or root level
function getProp<T>(key: string, defaultVal: T): T {
  const attrs = props.merc.attributes;
  if (attrs && attrs[key] !== undefined) return attrs[key];
  const rootVal = (props.merc as any)[key];
  if (rootVal !== undefined) return rootVal;
  return defaultVal;
}

/**
 * Get ability modifiers for a specific stat from activeStatModifiers.
 * Returns breakdown items ready for display.
 */
function getAbilityModifiersForStat(stat: string): StatBreakdownItem[] {
  const modifiers = getProp<Array<{stat: string; bonus: number; label?: string}>>('activeStatModifiers', []);
  return modifiers
    .filter(m => m.stat === stat)
    .map(m => ({
      label: m.label || 'Ability',
      value: m.bonus
    }));
}

// Helper to get combatant ID
const combatantId = computed(() => {
  return getProp('combatantId', '') || getProp('id', '') || props.merc.ref || 'unknown';
});

// Helper to get combatant display name (properly formatted)
const displayName = computed(() => {
  const rawName = getProp('combatantName', '') || getProp('name', '') || String(combatantId.value);
  // Remove "merc-" prefix if present and capitalize
  const cleanName = rawName.replace(/^merc-/i, '');
  return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
});

// Sector location for display - prefer prop, fall back to merc data
const sectorName = computed(() => props.sectorName || getProp('sectorName', ''));

// Equipment slots - defined first so stats can use them
// Try weaponSlotData first (serialized data), fall back to weaponSlot (legacy)
const weaponSlot = computed(() => getProp('weaponSlotData', null) || getProp('weaponSlot', null));
const armorSlot = computed(() => getProp('armorSlotData', null) || getProp('armorSlot', null));
const accessorySlot = computed(() => getProp('accessorySlotData', null) || getProp('accessorySlot', null));
const bandolierSlots = computed(() => getProp<Array<any>>('bandolierSlotsData', []));

// Helper to get equipment stat bonus
function getEquipmentBonus(slot: any, statKey: string): number {
  if (!slot) return 0;
  // Check direct property
  if (slot[statKey] !== undefined) return slot[statKey];
  // Check combatBonus for combat stat
  if (statKey === 'combat' && slot.combatBonus !== undefined) return slot.combatBonus;
  // Check armorBonus for armor stat
  if (statKey === 'armor' && slot.armorBonus !== undefined) return slot.armorBonus;
  // Check nested in attributes
  if (slot.attributes?.[statKey] !== undefined) return slot.attributes[statKey];
  if (statKey === 'combat' && slot.attributes?.combatBonus !== undefined) return slot.attributes.combatBonus;
  if (statKey === 'armor' && slot.attributes?.armorBonus !== undefined) return slot.attributes.armorBonus;
  return 0;
}

// Stats - prefer server-computed effectiveX, fall back to client-side calculation with equipment bonuses
// Client-side calculation is needed for preview cards during equipment selection
const training = computed(() => {
  const effective = getProp('effectiveTraining', 0);
  if (effective > 0) return effective;
  // Fallback: calculate client-side
  const base = getProp('baseTraining', 0) || getProp('training', 0);
  const weaponBonus = getEquipmentBonus(weaponSlot.value, 'training');
  const armorBonus = getEquipmentBonus(armorSlot.value, 'training');
  const accessoryBonus = getEquipmentBonus(accessorySlot.value, 'training');
  let bandolierBonus = 0;
  for (const bSlot of bandolierSlots.value) {
    bandolierBonus += getEquipmentBonus(bSlot, 'training');
  }
  return base + weaponBonus + armorBonus + accessoryBonus + bandolierBonus;
});

const combat = computed(() => {
  const effective = getProp('effectiveCombat', 0);
  if (effective > 0) return effective;
  // Fallback: calculate client-side
  const base = getProp('baseCombat', 0) || getProp('combat', 0);
  const weaponBonus = getEquipmentBonus(weaponSlot.value, 'combat');
  const armorBonus = getEquipmentBonus(armorSlot.value, 'combat');
  const accessoryBonus = getEquipmentBonus(accessorySlot.value, 'combat');
  let bandolierBonus = 0;
  for (const bSlot of bandolierSlots.value) {
    bandolierBonus += getEquipmentBonus(bSlot, 'combat');
  }
  return base + weaponBonus + armorBonus + accessoryBonus + bandolierBonus;
});

const initiative = computed(() => {
  const effective = getProp('effectiveInitiative', 0);
  if (effective > 0) return effective;
  // Fallback: calculate client-side
  const base = getProp('baseInitiative', 0) || getProp('initiative', 0);
  const weaponBonus = getEquipmentBonus(weaponSlot.value, 'initiative');
  const armorBonus = getEquipmentBonus(armorSlot.value, 'initiative');
  const accessoryBonus = getEquipmentBonus(accessorySlot.value, 'initiative');
  let bandolierBonus = 0;
  for (const bSlot of bandolierSlots.value) {
    bandolierBonus += getEquipmentBonus(bSlot, 'initiative');
  }
  return base + weaponBonus + armorBonus + accessoryBonus + bandolierBonus;
});

// Targets - base is 1, plus equipment bonuses and ability modifiers
const targets = computed(() => {
  // Check if server has computed effective targets
  const effective = getProp('effectiveTargets', 0);
  if (effective > 0) return effective;
  // Fallback: calculate client-side from base + equipment + abilities
  const base = 1; // All MERCs have 1 target by default
  const weaponBonus = getEquipmentBonus(weaponSlot.value, 'targets');
  const armorBonus = getEquipmentBonus(armorSlot.value, 'targets');
  const accessoryBonus = getEquipmentBonus(accessorySlot.value, 'targets');
  // Add bandolier slot bonuses
  let bandolierBonus = 0;
  for (const bSlot of bandolierSlots.value) {
    bandolierBonus += getEquipmentBonus(bSlot, 'targets');
  }
  // Add ability target bonuses from unified source
  const abilityBonus = getAbilityModifiersForStat('targets')
    .reduce((sum, mod) => sum + mod.value, 0);
  return base + weaponBonus + armorBonus + accessoryBonus + bandolierBonus + abilityBonus;
});

// Stat breakdown for tooltips
function buildStatBreakdown(statKey: string, baseStatKey: string): StatBreakdownItem[] {
  const breakdown: StatBreakdownItem[] = [];

  // Get actual base stat (without equipment)
  const actualBase = getProp(baseStatKey, 0);
  breakdown.push({ label: 'Base', value: actualBase });

  // Equipment bonuses
  const wBonus = getEquipmentBonus(weaponSlot.value, statKey);
  if (wBonus !== 0) {
    const wName = getEquipmentName(weaponSlot.value) || 'Weapon';
    breakdown.push({ label: wName, value: wBonus });
  }

  const aBonus = getEquipmentBonus(armorSlot.value, statKey);
  if (aBonus !== 0) {
    const aName = getEquipmentName(armorSlot.value) || 'Armor';
    breakdown.push({ label: aName, value: aBonus });
  }

  const accBonus = getEquipmentBonus(accessorySlot.value, statKey);
  if (accBonus !== 0) {
    const accName = getEquipmentName(accessorySlot.value) || 'Accessory';
    breakdown.push({ label: accName, value: accBonus });
  }

  // Bandolier slot bonuses
  for (const bSlot of bandolierSlots.value) {
    const bBonus = getEquipmentBonus(bSlot, statKey);
    if (bBonus !== 0) {
      const bName = getEquipmentName(bSlot) || 'Bandolier Item';
      breakdown.push({ label: bName, value: bBonus });
    }
  }

  // Ability bonuses are added by callers via getAbilityModifiersForStat()
  // Removed: Haarg-specific check (now in activeStatModifiers)
  // Removed: "Ability +X" fallback (caused double display bug)

  return breakdown;
}

const trainingBreakdown = computed(() => {
  const breakdown = buildStatBreakdown('training', 'baseTraining');
  // Add all ability modifiers for training from unified source
  breakdown.push(...getAbilityModifiersForStat('training'));
  return breakdown;
});

const combatBreakdown = computed(() => {
  const breakdown = buildStatBreakdown('combat', 'baseCombat');
  // Add all ability modifiers for combat from unified source
  breakdown.push(...getAbilityModifiersForStat('combat'));
  return breakdown;
});

// Initiative breakdown with Vulture's penalty negation handling
const initiativeBreakdown = computed(() => {
  const breakdown = buildStatBreakdown('initiative', 'baseInitiative');

  // For Vulture, add a line showing the ability negates initiative penalties
  // This is special - Vulture negates equipment penalties, not a bonus from activeStatModifiers
  if (combatantId.value === 'vulture') {
    // Calculate total penalties from equipment (negative values)
    const penaltyTotal = breakdown
      .filter(item => item.label !== 'Base' && item.value < 0)
      .reduce((sum, item) => sum + item.value, 0);

    if (penaltyTotal < 0) {
      // Vulture's ability negates the penalties
      breakdown.push({ label: "Vulture's Ability", value: -penaltyTotal });
    }
  }

  // Add all ability modifiers for initiative from unified source
  breakdown.push(...getAbilityModifiersForStat('initiative'));
  return breakdown;
});
const targetsBreakdown = computed(() => {
  const breakdown: StatBreakdownItem[] = [{ label: 'Base', value: 1 }];

  const wBonus = getEquipmentBonus(weaponSlot.value, 'targets');
  if (wBonus !== 0) {
    const wName = getEquipmentName(weaponSlot.value) || 'Weapon';
    breakdown.push({ label: wName, value: wBonus });
  }

  const aBonus = getEquipmentBonus(armorSlot.value, 'targets');
  if (aBonus !== 0) {
    const aName = getEquipmentName(armorSlot.value) || 'Armor';
    breakdown.push({ label: aName, value: aBonus });
  }

  const accBonus = getEquipmentBonus(accessorySlot.value, 'targets');
  if (accBonus !== 0) {
    const accName = getEquipmentName(accessorySlot.value) || 'Accessory';
    breakdown.push({ label: accName, value: accBonus });
  }

  // Bandolier slot bonuses
  for (const bSlot of bandolierSlots.value) {
    const bBonus = getEquipmentBonus(bSlot, 'targets');
    if (bBonus !== 0) {
      const bName = getEquipmentName(bSlot) || 'Bandolier Item';
      breakdown.push({ label: bName, value: bBonus });
    }
  }

  // Add all ability modifiers for targets from unified source
  breakdown.push(...getAbilityModifiersForStat('targets'));
  return breakdown;
});

// Health breakdown for tooltip
const healthBreakdown = computed(() => {
  const breakdown: StatBreakdownItem[] = [{ label: 'Base', value: 3 }];
  // Add all ability modifiers for health from unified source
  breakdown.push(...getAbilityModifiersForStat('health'));
  return breakdown;
});

// Tooltip state
const activeTooltip = ref<string | null>(null);

function showTooltip(stat: string) {
  activeTooltip.value = stat;
}

function hideTooltip() {
  activeTooltip.value = null;
}

function toggleTooltip(stat: string) {
  // For mobile tap support
  activeTooltip.value = activeTooltip.value === stat ? null : stat;
}

// Format bonus with + or - sign
function formatBonus(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

// Calculate total from breakdown
function getBreakdownTotal(breakdown: StatBreakdownItem[]): number {
  return breakdown.reduce((sum, item) => sum + item.value, 0);
}

const currentHealth = computed(() => {
  const health = getProp('health', undefined);
  if (health !== undefined) return health;
  const max = getProp('effectiveMaxHealth', 0) || getProp('maxHealth', 3);
  const dmg = getProp('damage', 0);
  return Math.max(0, max - dmg);
});
const maxHealth = computed(() => getProp('effectiveMaxHealth', 0) || getProp('maxHealth', 3));
const actionsRemaining = computed(() => getProp('actionsRemaining', 2));
const maxActions = computed(() => {
  // Check if server has computed effective actions
  const effective = getProp('effectiveActions', 0);
  if (effective > 0) return effective;
  // Fallback: base of 2 plus any action ability modifiers
  const base = 2;
  const abilityBonus = getAbilityModifiersForStat('actions')
    .reduce((sum, mod) => sum + mod.value, 0);
  return base + abilityBonus;
});

// Actions breakdown for tooltip
const actionsBreakdown = computed(() => {
  const breakdown: StatBreakdownItem[] = [{ label: 'Base', value: 2 }];
  // Add all ability modifiers for actions from unified source
  breakdown.push(...getAbilityModifiersForStat('actions'));
  return breakdown;
});

// Ability text
const abilityText = computed(() => getProp('ability', '') || getProp('bio', ''));

const borderColor = computed(() => getPlayerColor(props.playerColor));
const imagePath = computed(() => {
  const img = getProp('image', '');
  if (img) return img;
  // No fallback - log warning for debugging
  console.warn('[CombatantCard] No image for merc:', combatantId.value);
  return ''; // Return empty - broken image will be visible
});

// Helper to extract equipment name from slot data
// Equipment might be: { equipmentName: "..." } or { attributes: { equipmentName: "..." } }
function getEquipmentName(slot: any): string | null {
  if (!slot) return null;
  // Direct property
  if (slot.equipmentName) return slot.equipmentName;
  if (slot.name) return slot.name;
  // Nested in attributes (BoardSmith element structure)
  if (slot.attributes?.equipmentName) return slot.attributes.equipmentName;
  if (slot.attributes?.name) return slot.attributes.name;
  // Check ref as fallback
  if (slot.ref) return slot.ref;
  return null;
}

const weaponName = computed(() => getEquipmentName(weaponSlot.value));
const armorName = computed(() => getEquipmentName(armorSlot.value));
const accessoryName = computed(() => getEquipmentName(accessorySlot.value));

// Modal state for equipment details
const showEquipmentModal = ref(false);
const selectedEquipment = ref<any>(null);
const selectedSlotType = ref<'Weapon' | 'Armor' | 'Accessory' | null>(null);
const selectedBandolierIndex = ref<number | null>(null);
const showDropConfirm = ref(false);

function showEquipmentDetails(slot: any, slotType: 'Weapon' | 'Armor' | 'Accessory', bandolierIndex?: number) {
  if (slot) {
    selectedEquipment.value = slot;
    selectedSlotType.value = slotType;
    selectedBandolierIndex.value = bandolierIndex ?? null;
    showEquipmentModal.value = true;
    showDropConfirm.value = false;
  }
}

function closeEquipmentModal() {
  showEquipmentModal.value = false;
  selectedEquipment.value = null;
  selectedSlotType.value = null;
  selectedBandolierIndex.value = null;
  showDropConfirm.value = false;
}

function initiateDropEquipment() {
  showDropConfirm.value = true;
}

function cancelDrop() {
  showDropConfirm.value = false;
}

function confirmDropEquipment() {
  // Get the merc's numeric ID - at top level
  const mercNumericId = (props.merc as any).id;

  // Get the equipment's numeric ID - need to find it in children array
  // The slot data doesn't have the ID, but the actual child element does
  const children = (props.merc as any).children || [];
  const equipmentName = selectedEquipment.value?.equipmentName;
  const equipmentId_fromSlot = selectedEquipment.value?.equipmentId;

  // Find the equipment element in children by matching equipmentName or equipmentId
  let equipmentId: number | undefined;
  for (const child of children) {
    const childEquipName = child.attributes?.equipmentName || child.equipmentName;
    const childEquipId = child.attributes?.equipmentId || child.equipmentId;
    if (childEquipName === equipmentName || childEquipId === equipmentId_fromSlot) {
      equipmentId = child.id;
      break;
    }
  }

  if (!mercNumericId || !equipmentId) {
    closeEquipmentModal();
    return;
  }

  emit('dropEquipment', mercNumericId, equipmentId);
  closeEquipmentModal();
}
</script>

<template>
  <div class="combatant-card" :class="{ compact }" :data-combatant="displayName">
    <!-- Header: Portrait + Name + Squad Label -->
    <div class="merc-header">
      <CombatantIconSmall
        :combatant-id="combatantId"
        :image="imagePath"
        :alt="displayName"
        :player-color="playerColor"
        :size="compact ? 40 : 56"
      />
      <div class="name-section">
        <div class="name-and-location">
          <span class="merc-name">{{ displayName }}</span>
          <span v-if="sectorName" class="sector-location">{{ sectorName }}</span>
        </div>
        <span
          v-if="squadName"
          class="squad-badge"
          :class="{ clickable: canReassign }"
          :style="{ backgroundColor: borderColor }"
          @click.stop="onSquadBadgeClick"
        >{{ squadName }}</span>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid" v-if="!compact">
      <div
        class="stat stat-with-tooltip"
        @mouseenter="showTooltip('training')"
        @mouseleave="hideTooltip"
        @click="toggleTooltip('training')"
        tabindex="0"
        @focus="showTooltip('training')"
        @blur="hideTooltip"
      >
        <span class="stat-icon">&#9825;</span>
        <span class="stat-label">Training:</span>
        <span class="stat-value" :class="{ modified: trainingBreakdown.length > 1 }">{{ training }}</span>
        <div class="stat-tooltip" v-if="activeTooltip === 'training'">
          <div v-for="(item, idx) in trainingBreakdown" :key="idx" class="tooltip-row">
            <span class="tooltip-label">{{ item.label }}</span>
            <span class="tooltip-value" :class="{ positive: item.value > 0 && idx > 0, negative: item.value < 0 }">
              {{ idx === 0 ? item.value : formatBonus(item.value) }}
            </span>
          </div>
          <div class="tooltip-row tooltip-total">
            <span class="tooltip-label">Total</span>
            <span class="tooltip-value">{{ getBreakdownTotal(trainingBreakdown) }}</span>
          </div>
        </div>
      </div>
      <div
        class="stat stat-with-tooltip"
        @mouseenter="showTooltip('combat')"
        @mouseleave="hideTooltip"
        @click="toggleTooltip('combat')"
        tabindex="0"
        @focus="showTooltip('combat')"
        @blur="hideTooltip"
      >
        <span class="stat-icon">&#9889;</span>
        <span class="stat-label">Combat:</span>
        <span class="stat-value" :class="{ modified: combatBreakdown.length > 1 }">{{ combat }}</span>
        <div class="stat-tooltip" v-if="activeTooltip === 'combat'">
          <div v-for="(item, idx) in combatBreakdown" :key="idx" class="tooltip-row">
            <span class="tooltip-label">{{ item.label }}</span>
            <span class="tooltip-value" :class="{ positive: item.value > 0 && idx > 0, negative: item.value < 0 }">
              {{ idx === 0 ? item.value : formatBonus(item.value) }}
            </span>
          </div>
          <div class="tooltip-row tooltip-total">
            <span class="tooltip-label">Total</span>
            <span class="tooltip-value">{{ getBreakdownTotal(combatBreakdown) }}</span>
          </div>
        </div>
      </div>
      <div
        class="stat stat-with-tooltip"
        @mouseenter="showTooltip('initiative')"
        @mouseleave="hideTooltip"
        @click="toggleTooltip('initiative')"
        tabindex="0"
        @focus="showTooltip('initiative')"
        @blur="hideTooltip"
      >
        <span class="stat-icon">&#187;</span>
        <span class="stat-label">Initiative:</span>
        <span class="stat-value" :class="{ modified: initiativeBreakdown.length > 1 }">{{ initiative }}</span>
        <div class="stat-tooltip" v-if="activeTooltip === 'initiative'">
          <div v-for="(item, idx) in initiativeBreakdown" :key="idx" class="tooltip-row">
            <span class="tooltip-label">{{ item.label }}</span>
            <span class="tooltip-value" :class="{ positive: item.value > 0 && idx > 0, negative: item.value < 0 }">
              {{ idx === 0 ? item.value : formatBonus(item.value) }}
            </span>
          </div>
          <div class="tooltip-row tooltip-total">
            <span class="tooltip-label">Total</span>
            <span class="tooltip-value">{{ getBreakdownTotal(initiativeBreakdown) }}</span>
          </div>
        </div>
      </div>
      <div
        class="stat stat-with-tooltip"
        @mouseenter="showTooltip('health')"
        @mouseleave="hideTooltip"
        @click="toggleTooltip('health')"
        tabindex="0"
        @focus="showTooltip('health')"
        @blur="hideTooltip"
      >
        <span class="stat-icon">&#9829;</span>
        <span class="stat-label">Health:</span>
        <span class="stat-value" :class="{ damaged: currentHealth < maxHealth, modified: healthBreakdown.length > 1 && currentHealth === maxHealth }">
          {{ currentHealth }}/{{ maxHealth }}
        </span>
        <div class="stat-tooltip" v-if="activeTooltip === 'health'">
          <div v-for="(item, idx) in healthBreakdown" :key="idx" class="tooltip-row">
            <span class="tooltip-label">{{ item.label }}</span>
            <span class="tooltip-value" :class="{ positive: item.value > 0 && idx > 0, negative: item.value < 0 }">
              {{ idx === 0 ? item.value : formatBonus(item.value) }}
            </span>
          </div>
          <div class="tooltip-row tooltip-total">
            <span class="tooltip-label">Total</span>
            <span class="tooltip-value">{{ getBreakdownTotal(healthBreakdown) }}</span>
          </div>
        </div>
      </div>
      <div
        class="stat stat-with-tooltip"
        @mouseenter="showTooltip('targets')"
        @mouseleave="hideTooltip"
        @click="toggleTooltip('targets')"
        tabindex="0"
        @focus="showTooltip('targets')"
        @blur="hideTooltip"
      >
        <span class="stat-icon">&#8982;</span>
        <span class="stat-label">Targets:</span>
        <span class="stat-value" :class="{ modified: targetsBreakdown.length > 1 }">{{ targets }}</span>
        <div class="stat-tooltip" v-if="activeTooltip === 'targets'">
          <div v-for="(item, idx) in targetsBreakdown" :key="idx" class="tooltip-row">
            <span class="tooltip-label">{{ item.label }}</span>
            <span class="tooltip-value" :class="{ positive: item.value > 0 && idx > 0, negative: item.value < 0 }">
              {{ idx === 0 ? item.value : formatBonus(item.value) }}
            </span>
          </div>
          <div class="tooltip-row tooltip-total">
            <span class="tooltip-label">Total</span>
            <span class="tooltip-value">{{ getBreakdownTotal(targetsBreakdown) }}</span>
          </div>
        </div>
      </div>
      <div
        class="stat stat-with-tooltip"
        @mouseenter="showTooltip('actions')"
        @mouseleave="hideTooltip"
        @click="toggleTooltip('actions')"
        tabindex="0"
        @focus="showTooltip('actions')"
        @blur="hideTooltip"
      >
        <span class="stat-icon">&#9733;</span>
        <span class="stat-label">Actions:</span>
        <span class="stat-value" :class="{ modified: actionsBreakdown.length > 1 }">{{ actionsRemaining }}/{{ maxActions }}</span>
        <div class="stat-tooltip" v-if="activeTooltip === 'actions'">
          <div v-for="(item, idx) in actionsBreakdown" :key="idx" class="tooltip-row">
            <span class="tooltip-label">{{ item.label }}</span>
            <span class="tooltip-value" :class="{ positive: item.value > 0 && idx > 0, negative: item.value < 0 }">
              {{ idx === 0 ? item.value : formatBonus(item.value) }}
            </span>
          </div>
          <div class="tooltip-row tooltip-total">
            <span class="tooltip-label">Total</span>
            <span class="tooltip-value">{{ getBreakdownTotal(actionsBreakdown) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Ability Section -->
    <div class="ability-section" v-if="abilityText && !compact">
      <div class="ability-header">Ability:</div>
      <div class="ability-text">{{ abilityText }}</div>
      <button
        v-if="abilityAvailable"
        class="ability-button"
        @click.stop="onAbilityClick"
      >
        Use Ability
      </button>
    </div>

    <!-- Equipment Section -->
    <div class="equipment-section" v-if="showEquipment && !compact">
      <div
        class="equipment-slot"
        :class="{ clickable: weaponSlot, pending: pendingSlot === 'Weapon' }"
        @click="showEquipmentDetails(weaponSlot, 'Weapon')"
      >
        <span class="slot-icon">&#9881;</span>
        <span class="slot-label" :class="{ empty: !weaponName }">
          {{ weaponName || 'No weapon' }}
        </span>
        <span class="click-hint" v-if="weaponSlot">ℹ</span>
      </div>
      <div
        class="equipment-slot"
        :class="{ clickable: armorSlot, pending: pendingSlot === 'Armor' }"
        @click="showEquipmentDetails(armorSlot, 'Armor')"
      >
        <span class="slot-icon">&#9830;</span>
        <span class="slot-label" :class="{ empty: !armorName }">
          {{ armorName || 'No armor' }}
        </span>
        <span class="click-hint" v-if="armorSlot">ℹ</span>
      </div>
      <div
        class="equipment-slot"
        :class="{ clickable: accessorySlot, pending: pendingSlot === 'Accessory' }"
        @click="showEquipmentDetails(accessorySlot, 'Accessory')"
      >
        <span class="slot-icon">&#9632;</span>
        <span class="slot-label" :class="{ empty: !accessoryName }">
          {{ accessoryName || 'No accessory' }}
        </span>
        <span class="click-hint" v-if="accessorySlot">ℹ</span>
      </div>
      <!-- Bandolier Slots -->
      <div
        v-for="(bSlot, idx) in bandolierSlots"
        :key="`bandolier-${idx}`"
        class="equipment-slot bandolier-slot clickable"
        @click="showEquipmentDetails(bSlot, 'Accessory', idx)"
      >
        <span class="slot-icon bandolier-icon">&#9670;</span>
        <span class="slot-label">
          {{ getEquipmentName(bSlot) || 'Empty' }}
        </span>
        <span class="click-hint">ℹ</span>
      </div>
    </div>

    <!-- Equipment Details Modal -->
    <GameOverlay :active="showEquipmentModal" @click="closeEquipmentModal">
      <ModalContent @close="closeEquipmentModal">
        <div class="equipment-modal-content">
          <EquipmentCard v-if="selectedEquipment" :equipment="selectedEquipment">
            <template #actions>
              <!-- Drop to Stash Button -->
              <div class="drop-section" v-if="canDropEquipment">
                <div v-if="!showDropConfirm" class="drop-button-container">
                  <button class="drop-button" @click="initiateDropEquipment">
                    Unequip
                  </button>
                  <span class="drop-hint">Free action - drops equipment in current sector</span>
                </div>
                <div v-else class="drop-confirm">
                  <p class="confirm-text">Drop this equipment to the sector stash?</p>
                  <div class="confirm-buttons">
                    <button class="confirm-yes" @click="confirmDropEquipment">Yes, Drop It</button>
                    <button class="confirm-no" @click="cancelDrop">Cancel</button>
                  </div>
                </div>
              </div>
            </template>
          </EquipmentCard>
        </div>
      </ModalContent>
    </GameOverlay>
  </div>
</template>

<style scoped>
.combatant-card {
  background: v-bind('UI_COLORS.cardBg');
  border-radius: 12px;
  padding: 12px;
  min-width: 240px;
  max-width: 320px;
  color: v-bind('UI_COLORS.text');
  font-family: inherit;
}

.combatant-card.compact {
  min-width: 160px;
  max-width: 200px;
  padding: 8px;
}

/* Header */
.merc-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.compact .merc-header {
  margin-bottom: 0;
}

.name-section {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.name-and-location {
  display: flex;
  flex-direction: column;
}

.merc-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: v-bind('UI_COLORS.accent');
}

.compact .merc-name {
  font-size: 0.95rem;
}

.sector-location {
  font-size: 0.75rem;
  color: #888;
  margin-top: 2px;
}

.squad-badge {
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  transition: all 0.2s ease;
}

.squad-badge.clickable {
  cursor: pointer;
}

.squad-badge.clickable:hover {
  filter: brightness(1.2);
  box-shadow: 0 0 8px rgba(212, 168, 75, 0.6);
  transform: scale(1.05);
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 10px;
  background: v-bind('UI_COLORS.backgroundLight');
  border-radius: 8px;
  margin-bottom: 12px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat-with-tooltip {
  position: relative;
  cursor: pointer;
  border-radius: 4px;
  padding: 2px 4px;
  margin: -2px -4px;
  transition: background-color 0.15s ease;
}

.stat-with-tooltip:hover,
.stat-with-tooltip:focus {
  background-color: rgba(212, 168, 75, 0.15);
  outline: none;
}

.stat-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: v-bind('UI_COLORS.cardBg');
  border: 1px solid v-bind('UI_COLORS.accent');
  border-radius: 6px;
  padding: 8px 12px;
  min-width: 140px;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  margin-bottom: 6px;
}

.stat-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: v-bind('UI_COLORS.accent');
}

.tooltip-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 2px 0;
  font-size: 0.85rem;
}

.tooltip-row:first-child {
  border-bottom: 1px solid v-bind('UI_COLORS.backgroundLight');
  padding-bottom: 4px;
  margin-bottom: 2px;
}

.tooltip-label {
  color: v-bind('UI_COLORS.textMuted');
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}

.tooltip-row:first-child .tooltip-label {
  color: v-bind('UI_COLORS.text');
  font-weight: 500;
}

.tooltip-value {
  font-weight: 600;
  color: v-bind('UI_COLORS.text');
}

.tooltip-value.positive {
  color: #4caf50;
}

.tooltip-value.negative {
  color: #e63946;
}

.tooltip-total {
  border-top: 1px solid v-bind('UI_COLORS.backgroundLight');
  padding-top: 4px;
  margin-top: 2px;
}

.tooltip-total .tooltip-label {
  color: v-bind('UI_COLORS.text');
  font-weight: 600;
}

.tooltip-total .tooltip-value {
  color: v-bind('UI_COLORS.accent');
}

.stat-icon {
  color: v-bind('UI_COLORS.accent');
  font-size: 1rem;
  width: 16px;
}

.stat-label {
  color: v-bind('UI_COLORS.textMuted');
  font-size: 0.85rem;
}

.stat-value {
  color: v-bind('UI_COLORS.accent');
  font-weight: 600;
  margin-left: auto;
}

.stat-value.damaged {
  color: #e63946;
}

.stat-value.modified {
  color: #4caf50;
}

/* Ability Section */
.ability-section {
  border-left: 3px solid v-bind('UI_COLORS.accent');
  padding-left: 10px;
  margin-bottom: 12px;
}

.ability-header {
  font-size: 0.85rem;
  font-weight: 600;
  color: v-bind('UI_COLORS.accent');
  margin-bottom: 4px;
}

.ability-text {
  font-size: 0.9rem;
  line-height: 1.4;
  color: v-bind('UI_COLORS.text');
}

.ability-button {
  margin-top: 10px;
  background: #81d4a8;
  color: #1a1a1a;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  width: 100%;
}

.ability-button:hover {
  background: #6bc494;
  transform: translateY(-1px);
}

/* Equipment Section */
.equipment-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.equipment-slot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: v-bind('UI_COLORS.backgroundLight');
  border-radius: 6px;
  transition: all 0.2s ease;
}

.equipment-slot.clickable {
  cursor: pointer;
}

.equipment-slot.clickable:hover {
  background: v-bind('UI_COLORS.border');
}

.equipment-slot.pending {
  background: rgba(212, 168, 75, 0.3);
  animation: pulse-pending 1.5s ease-in-out infinite;
}

@keyframes pulse-pending {
  0%, 100% { background: rgba(212, 168, 75, 0.2); }
  50% { background: rgba(212, 168, 75, 0.4); }
}

.click-hint {
  margin-left: auto;
  color: v-bind('UI_COLORS.textMuted');
  font-size: 0.8rem;
  opacity: 0.6;
  transition: opacity 0.2s ease;
}

.equipment-slot.clickable:hover .click-hint {
  opacity: 1;
  color: v-bind('UI_COLORS.accent');
}

.slot-icon {
  color: v-bind('UI_COLORS.accent');
  font-size: 1rem;
}

.slot-label {
  font-size: 0.9rem;
}

.slot-label.empty {
  color: v-bind('UI_COLORS.textMuted');
  font-style: italic;
}

/* Bandolier Slots */
.bandolier-slot {
  margin-left: 16px;
  border-left: 2px solid v-bind('UI_COLORS.accent');
  padding-left: 12px;
}

.bandolier-icon {
  color: #81d4a8; /* mint green to match accessory color */
}

/* Equipment Modal Drop Section */
.equipment-modal-content {
  display: flex;
  flex-direction: column;
  background: rgba(70, 85, 70, 0.98);
  border-radius: 12px;
  padding: 12px;
  min-width: 400px;
}

.equipment-modal-content :deep(.equipment-card) {
  /* Remove duplicate padding/background from nested EquipmentCard */
  background: transparent;
  padding: 0;
  border-radius: 0;
}

.drop-section {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 12px;
  margin-top: auto;
}

.drop-button-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.drop-button {
  background: #e57373;
  color: white;
  border: none;
  padding: 10px 24px;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.drop-button:hover {
  background: #ef5350;
}

.drop-hint {
  font-size: 0.8rem;
  color: v-bind('UI_COLORS.textMuted');
  font-style: italic;
}

.drop-confirm {
  text-align: center;
}

.confirm-text {
  margin: 0 0 12px;
  font-size: 0.95rem;
  color: v-bind('UI_COLORS.text');
}

.confirm-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.confirm-yes {
  background: #e57373;
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.confirm-yes:hover {
  background: #ef5350;
}

.confirm-no {
  background: v-bind('UI_COLORS.backgroundLight');
  color: v-bind('UI_COLORS.text');
  border: 1px solid v-bind('UI_COLORS.border');
  padding: 8px 20px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.confirm-no:hover {
  background: v-bind('UI_COLORS.border');
}
</style>
