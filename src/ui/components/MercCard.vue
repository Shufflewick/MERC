<script setup lang="ts">
import { computed } from 'vue';
import { getPlayerColor, UI_COLORS } from '../colors';

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
}

const props = defineProps<{
  merc: MercData;
  playerColor?: string;
  showEquipment?: boolean;
  compact?: boolean;
}>();

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

// Computed stats - check attributes first, then root level
const training = computed(() => getProp('training', 0) || getProp('baseTraining', 0));
const combat = computed(() => getProp('combat', 0) || getProp('baseCombat', 0));
const initiative = computed(() => getProp('initiative', 0) || getProp('baseInitiative', 0));
const currentHealth = computed(() => {
  const health = getProp('health', undefined);
  if (health !== undefined) return health;
  const max = getProp('maxHealth', 3);
  const dmg = getProp('damage', 0);
  return Math.max(0, max - dmg);
});
const maxHealth = computed(() => getProp('maxHealth', 3));
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

const weaponSlot = computed(() => getProp('weaponSlot', null));
const armorSlot = computed(() => getProp('armorSlot', null));
const accessorySlot = computed(() => getProp('accessorySlot', null));

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
      <div class="stat">
        <span class="stat-icon">&#9825;</span>
        <span class="stat-label">Training:</span>
        <span class="stat-value">{{ training }}</span>
      </div>
      <div class="stat">
        <span class="stat-icon">&#9889;</span>
        <span class="stat-label">Combat:</span>
        <span class="stat-value">{{ combat }}</span>
      </div>
      <div class="stat">
        <span class="stat-icon">&#187;</span>
        <span class="stat-label">Initiative:</span>
        <span class="stat-value">{{ initiative }}</span>
      </div>
      <div class="stat">
        <span class="stat-icon">&#9829;</span>
        <span class="stat-label">Health:</span>
        <span class="stat-value" :class="{ damaged: currentHealth < maxHealth }">
          {{ currentHealth }}/{{ maxHealth }}
        </span>
      </div>
    </div>

    <!-- Ability Section -->
    <div class="ability-section" v-if="abilityText && !compact">
      <div class="ability-header">Ability:</div>
      <div class="ability-text">{{ abilityText }}</div>
    </div>

    <!-- Equipment Section -->
    <div class="equipment-section" v-if="showEquipment && !compact">
      <div class="equipment-slot">
        <span class="slot-icon">&#9881;</span>
        <span class="slot-label" :class="{ empty: !weaponName }">
          {{ weaponName || 'No weapon' }}
        </span>
      </div>
      <div class="equipment-slot">
        <span class="slot-icon">&#9830;</span>
        <span class="slot-label" :class="{ empty: !armorName }">
          {{ armorName || 'No armor' }}
        </span>
      </div>
      <div class="equipment-slot">
        <span class="slot-icon">&#9632;</span>
        <span class="slot-label" :class="{ empty: !accessoryName }">
          {{ accessoryName || 'No accessory' }}
        </span>
      </div>
    </div>
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
</style>
