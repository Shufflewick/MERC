<script setup lang="ts">
import { computed, ref } from 'vue';
import { getPlayerColor, UI_COLORS } from '../colors';
import DetailModal from './DetailModal.vue';
import EquipmentCard from './EquipmentCard.vue';

// Stat breakdown item for tooltips
interface StatBreakdownItem {
  label: string;
  value: number;
}

interface MercData {
  // Data can be at root level or nested in 'attributes'
  attributes?: Record<string, any>;
  // Root level properties (may not exist if data is in attributes)
  mercId?: string;
  id?: string | number;
  ref?: string;
  mercName?: string;
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
}

const props = defineProps<{
  merc: MercData;
  playerColor?: string;
  showEquipment?: boolean;
  compact?: boolean;
  canDropEquipment?: boolean;
  abilityAvailable?: boolean; // Whether the MERC's ability action can be used
}>();

const emit = defineEmits<{
  dropEquipment: [mercId: string, slotType: 'Weapon' | 'Armor' | 'Accessory' | `Bandolier:${number}`];
  activateAbility: [mercId: string];
}>();

// Handle ability button click
function onAbilityClick() {
  emit('activateAbility', mercId.value as string);
}

// Helper to get a property from either attributes or root level
function getProp<T>(key: string, defaultVal: T): T {
  const attrs = props.merc.attributes;
  if (attrs && attrs[key] !== undefined) return attrs[key];
  const rootVal = (props.merc as any)[key];
  if (rootVal !== undefined) return rootVal;
  return defaultVal;
}

// Helper to get MERC ID
const mercId = computed(() => {
  return getProp('mercId', '') || getProp('id', '') || props.merc.ref || 'unknown';
});

// Helper to get MERC name (properly formatted)
const mercName = computed(() => {
  const rawName = getProp('mercName', '') || getProp('name', '') || String(mercId.value);
  // Remove "merc-" prefix if present and capitalize
  const cleanName = rawName.replace(/^merc-/i, '');
  return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
});

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

// Stats - use computed values from server (includes equipment + abilities)
// The effectiveX properties are explicitly stored and serialized by the server
const training = computed(() => getProp('effectiveTraining', 0) || getProp('training', 0) || getProp('baseTraining', 0));
const combat = computed(() => getProp('effectiveCombat', 0) || getProp('combat', 0) || getProp('baseCombat', 0));
const initiative = computed(() => getProp('effectiveInitiative', 0) || getProp('initiative', 0) || getProp('baseInitiative', 0));

// Targets - base is 1, plus any equipment bonuses
const targets = computed(() => {
  const base = 1; // All MERCs have 1 target by default
  const weaponBonus = getEquipmentBonus(weaponSlot.value, 'targets');
  const armorBonus = getEquipmentBonus(armorSlot.value, 'targets');
  const accessoryBonus = getEquipmentBonus(accessorySlot.value, 'targets');
  // Add bandolier slot bonuses
  let bandolierBonus = 0;
  for (const bSlot of bandolierSlots.value) {
    bandolierBonus += getEquipmentBonus(bSlot, 'targets');
  }
  // MERC-c1f: Ra gets +1 target with any weapon
  const raBonus = (mercId.value === 'ra' && weaponSlot.value) ? 1 : 0;
  return base + weaponBonus + armorBonus + accessoryBonus + bandolierBonus + raBonus;
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

  // Haarg's ability bonus (stored on the merc)
  if (mercId.value === 'haarg') {
    const haargBonusKey = statKey === 'training' ? 'haargTrainingBonus'
                        : statKey === 'initiative' ? 'haargInitiativeBonus'
                        : 'haargCombatBonus';
    const haargBonus = getProp(haargBonusKey, 0);
    if (haargBonus !== 0) {
      breakdown.push({ label: "Haarg's Ability", value: haargBonus });
    }
  }

  // Check for ability-based stat bonuses by comparing effective to base + equipment
  // This catches abilities like Shooter's +3 combat
  if (statKey === 'combat') {
    const effectiveCombat = getProp('effectiveCombat', 0);
    const sumSoFar = breakdown.reduce((sum, item) => sum + item.value, 0);
    const abilityBonus = effectiveCombat - sumSoFar;
    if (abilityBonus > 0) {
      breakdown.push({ label: 'Ability', value: abilityBonus });
    }
  }

  return breakdown;
}

const trainingBreakdown = computed(() => buildStatBreakdown('training', 'baseTraining'));
const combatBreakdown = computed(() => buildStatBreakdown('combat', 'baseCombat'));
const initiativeBreakdown = computed(() => buildStatBreakdown('initiative', 'baseInitiative'));
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

  // MERC-c1f: Ra gets +1 target with any weapon
  if (mercId.value === 'ra' && weaponSlot.value) {
    breakdown.push({ label: 'Ra Ability', value: 1 });
  }

  return breakdown;
});

// Health breakdown for tooltip
const healthBreakdown = computed(() => {
  const breakdown: StatBreakdownItem[] = [{ label: 'Base', value: 3 }];

  // Check for ability-based health bonus (e.g., Juicer's +2)
  const effectiveMax = getProp('effectiveMaxHealth', 3);
  const abilityBonus = effectiveMax - 3;
  if (abilityBonus > 0) {
    breakdown.push({ label: 'Ability', value: abilityBonus });
  }

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

const currentHealth = computed(() => {
  const health = getProp('health', undefined);
  if (health !== undefined) return health;
  const max = getProp('effectiveMaxHealth', 0) || getProp('maxHealth', 3);
  const dmg = getProp('damage', 0);
  return Math.max(0, max - dmg);
});
const maxHealth = computed(() => getProp('effectiveMaxHealth', 0) || getProp('maxHealth', 3));
const actionsRemaining = computed(() => getProp('actionsRemaining', 2));
const maxActions = computed(() => 2); // Standard is 2

// Ability text
const abilityText = computed(() => getProp('ability', '') || getProp('bio', ''));

const borderColor = computed(() => getPlayerColor(props.playerColor));
const imagePath = computed(() => {
  const img = getProp('image', '');
  if (img) return img;
  return `/mercs/${mercId.value}.jpg`;
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
  if (selectedBandolierIndex.value !== null) {
    // Dropping from bandolier slot
    emit('dropEquipment', mercId.value as string, `Bandolier:${selectedBandolierIndex.value}`);
    closeEquipmentModal();
  } else if (selectedSlotType.value) {
    emit('dropEquipment', mercId.value as string, selectedSlotType.value);
    closeEquipmentModal();
  }
}
</script>

<template>
  <div class="merc-card" :class="{ compact }">
    <!-- Header: Portrait + Name + Actions -->
    <div class="merc-header">
      <div class="portrait-wrapper" :style="{ borderColor }">
        <img :src="imagePath" :alt="mercName" class="portrait" />
      </div>
      <div class="name-section">
        <span class="merc-name">{{ mercName }}</span>
        <span class="actions-badge">{{ actionsRemaining }}/{{ maxActions }}</span>
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
        :class="{ clickable: weaponSlot }"
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
        :class="{ clickable: armorSlot }"
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
        :class="{ clickable: accessorySlot }"
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
    <DetailModal :show="showEquipmentModal" @close="closeEquipmentModal">
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
    </DetailModal>
  </div>
</template>

<style scoped>
.merc-card {
  background: v-bind('UI_COLORS.cardBg');
  border-radius: 12px;
  padding: 12px;
  min-width: 240px;
  max-width: 320px;
  color: v-bind('UI_COLORS.text');
  font-family: inherit;
}

.merc-card.compact {
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

.portrait-wrapper {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 3px solid;
  overflow: hidden;
  flex-shrink: 0;
}

.compact .portrait-wrapper {
  width: 40px;
  height: 40px;
  border-width: 2px;
}

.portrait {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.name-section {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.merc-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: v-bind('UI_COLORS.accent');
}

.compact .merc-name {
  font-size: 0.95rem;
}

.actions-badge {
  background: v-bind('UI_COLORS.backgroundLight');
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 500;
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
