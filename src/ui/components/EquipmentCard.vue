<script setup lang="ts">
import { computed } from 'vue';
import { UI_COLORS } from '../colors';

interface EquipmentData {
  // Can be at root level or nested in 'attributes'
  attributes?: Record<string, any>;
  equipmentId?: string;
  equipmentName?: string;
  name?: string;
  equipmentType?: 'Weapon' | 'Armor' | 'Accessory';
  type?: 'Weapon' | 'Armor' | 'Accessory';
  description?: string;
  combatBonus?: number;
  combat?: number;
  initiative?: number;
  training?: number;
  targets?: number;
  armorBonus?: number;
  armor?: number;
  negatesArmor?: boolean;
  image?: string;
  serial?: number;
}

const props = defineProps<{
  equipment: EquipmentData;
}>();

// Helper to get a property from either attributes or root level
function getProp<T>(key: string, defaultVal: T): T {
  const attrs = props.equipment.attributes;
  if (attrs && attrs[key] !== undefined) return attrs[key];
  const rootVal = (props.equipment as any)[key];
  if (rootVal !== undefined) return rootVal;
  return defaultVal;
}

const equipmentName = computed(() => getProp('equipmentName', '') || getProp('name', 'Unknown'));
const equipmentType = computed(() => getProp('equipmentType', '') || getProp('type', 'Unknown'));
const description = computed(() => getProp('description', ''));
const combatBonus = computed(() => getProp('combatBonus', 0) || getProp('combat', 0));
const initiative = computed(() => getProp('initiative', 0));
const training = computed(() => getProp('training', 0));
const targets = computed(() => getProp('targets', 0));
const armorBonus = computed(() => getProp('armorBonus', 0) || getProp('armor', 0));
const negatesArmor = computed(() => getProp('negatesArmor', false));
const serial = computed(() => getProp('serial', 0));

const typeIcon = computed(() => {
  switch (equipmentType.value) {
    case 'Weapon': return '⚔️';
    case 'Armor': return '🛡️';
    case 'Accessory': return '📦';
    default: return '❓';
  }
});

const typeColor = computed(() => {
  switch (equipmentType.value) {
    case 'Weapon': return '#ff6b8a';  // bright pink
    case 'Armor': return '#64b5f6';   // light blue
    case 'Accessory': return '#81d4a8'; // mint green
    default: return '#ccc';
  }
});

// Check if any stats are present
const hasStats = computed(() =>
  combatBonus.value !== 0 ||
  initiative.value !== 0 ||
  training.value !== 0 ||
  targets.value !== 0 ||
  armorBonus.value !== 0 ||
  negatesArmor.value
);
</script>

<template>
  <div class="equipment-card">
    <!-- Header -->
    <div class="equipment-header">
      <span class="type-icon" :style="{ color: typeColor }">{{ typeIcon }}</span>
      <div class="name-section">
        <span class="equipment-name">{{ equipmentName }}</span>
        <span class="equipment-type" :style="{ color: typeColor }">{{ equipmentType }}</span>
      </div>
      <span class="serial-badge" v-if="serial">#{{ serial }}</span>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid" v-if="hasStats">
      <div class="stat" v-if="combatBonus !== 0">
        <span class="stat-icon">⚡</span>
        <span class="stat-label">Combat:</span>
        <span class="stat-value" :class="{ positive: combatBonus > 0, negative: combatBonus < 0 }">
          {{ combatBonus > 0 ? '+' : '' }}{{ combatBonus }}
        </span>
      </div>
      <div class="stat" v-if="initiative !== 0">
        <span class="stat-icon">»</span>
        <span class="stat-label">Initiative:</span>
        <span class="stat-value" :class="{ positive: initiative > 0, negative: initiative < 0 }">
          {{ initiative > 0 ? '+' : '' }}{{ initiative }}
        </span>
      </div>
      <div class="stat" v-if="training !== 0">
        <span class="stat-icon">♡</span>
        <span class="stat-label">Training:</span>
        <span class="stat-value" :class="{ positive: training > 0, negative: training < 0 }">
          {{ training > 0 ? '+' : '' }}{{ training }}
        </span>
      </div>
      <div class="stat" v-if="targets !== 0">
        <span class="stat-icon">🎯</span>
        <span class="stat-label">Targets:</span>
        <span class="stat-value">{{ targets }}</span>
      </div>
      <div class="stat" v-if="armorBonus !== 0">
        <span class="stat-icon">🛡️</span>
        <span class="stat-label">Armor:</span>
        <span class="stat-value" :class="{ positive: armorBonus > 0 }">
          {{ armorBonus > 0 ? '+' : '' }}{{ armorBonus }}
        </span>
      </div>
      <div class="stat special" v-if="negatesArmor">
        <span class="stat-icon">💥</span>
        <span class="stat-label">Armor Piercing</span>
      </div>
    </div>

    <!-- Description -->
    <div class="description-section" v-if="description">
      <div class="description-text">{{ description }}</div>
    </div>
  </div>
</template>

<style scoped>
.equipment-card {
  background: rgba(70, 85, 70, 0.98);
  border-radius: 12px;
  padding: 12px;
  min-width: 240px;
  max-width: 320px;
  color: #ffffff;
  font-family: inherit;
}

/* Header */
.equipment-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  padding-right: 32px; /* Room for modal close button */
  border-bottom: 1px solid v-bind('UI_COLORS.border');
}

.type-icon {
  font-size: 1.5rem;
}

.name-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.equipment-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: #ffffff;
}

.equipment-type {
  font-size: 0.8rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.serial-badge {
  background: rgba(255, 255, 255, 0.15);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  color: #c0c0c0;
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

.stat.special {
  grid-column: span 2;
  justify-content: center;
  background: rgba(255, 107, 138, 0.25);  /* bright pink tint */
  padding: 4px 8px;
  border-radius: 4px;
}

.stat-icon {
  color: #ffd54f;  /* bright yellow */
  font-size: 0.9rem;
  width: 18px;
}

.stat-label {
  color: #e0e0e0;
  font-size: 0.85rem;
}

.stat-value {
  color: #ffffff;
  font-weight: 600;
  margin-left: auto;
}

.stat-value.positive {
  color: #69f0ae;  /* bright mint green */
}

.stat-value.negative {
  color: #ff6b8a;  /* bright pink */
}

/* Description Section */
.description-section {
  border-left: 3px solid v-bind('UI_COLORS.accent');
  padding-left: 10px;
}

.description-text {
  font-size: 0.9rem;
  line-height: 1.4;
  color: v-bind('UI_COLORS.text');
}
</style>
