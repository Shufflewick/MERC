<script setup lang="ts">
import { computed } from 'vue';
import { UI_COLORS } from '../colors';

export interface SectorChoice {
  sectorName: string;
  sectorId?: string;
  image: string;
  value?: number;
  value_points?: number;
  weaponLoot?: number;
  armorLoot?: number;
  accessoryLoot?: number;
  dictatorMilitia?: number;
}

const props = withDefaults(defineProps<{
  sector: SectorChoice;
  size?: 'default' | 'compact';
}>(), {
  size: 'default',
});

defineEmits<{
  click: [];
}>();

const displayValue = computed(() => {
  return props.sector.value_points ?? props.sector.value ?? 0;
});

const hasLoot = computed(() => {
  return (props.sector.weaponLoot ?? 0) > 0
    || (props.sector.armorLoot ?? 0) > 0
    || (props.sector.accessoryLoot ?? 0) > 0;
});

const cardWidth = computed(() => props.size === 'compact' ? '160px' : '180px');
const imageHeight = computed(() => props.size === 'compact' ? '80px' : '100px');
</script>

<template>
  <div
    class="sector-card-choice"
    :class="size"
    @click="$emit('click')"
  >
    <div class="sector-card-image" :style="{ backgroundImage: `url(${sector.image})` }">
      <div class="sector-card-overlay"></div>
      <div class="sector-card-name">{{ sector.sectorName }}</div>
    </div>
    <div class="sector-card-stats">
      <div class="sector-stat">
        <span class="stat-icon">💰</span>
        <span class="stat-value">{{ displayValue }}</span>
      </div>
      <div class="sector-stat" v-if="hasLoot">
        <span class="stat-icon">📦</span>
        <span class="stat-value">
          <span v-if="(sector.weaponLoot ?? 0) > 0" title="Weapons">⚔️{{ sector.weaponLoot }}</span>
          <span v-if="(sector.armorLoot ?? 0) > 0" title="Armor">🛡️{{ sector.armorLoot }}</span>
          <span v-if="(sector.accessoryLoot ?? 0) > 0" title="Accessories">💍{{ sector.accessoryLoot }}</span>
        </span>
      </div>
      <div class="sector-stat" v-if="(sector.dictatorMilitia ?? 0) > 0">
        <span class="stat-icon">🎖️</span>
        <span class="stat-value">{{ sector.dictatorMilitia }} militia</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sector-card-choice {
  width: v-bind(cardWidth);
  background: v-bind('UI_COLORS.surface');
  border: 2px solid v-bind('UI_COLORS.border');
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.sector-card-choice.compact {
  border-radius: 10px;
}

.sector-card-choice:hover {
  border-color: #8b0000;
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
}

.sector-card-choice.compact:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 16px rgba(139, 0, 0, 0.4);
}

.sector-card-image {
  position: relative;
  height: v-bind(imageHeight);
  background-size: cover;
  background-position: center;
}

.sector-card-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.2) 0%,
    rgba(0, 0, 0, 0.6) 100%
  );
}

.sector-card-name {
  position: absolute;
  bottom: 8px;
  left: 8px;
  right: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
}

.compact .sector-card-name {
  bottom: 6px;
  left: 6px;
  right: 6px;
  font-size: 0.85rem;
}

.sector-card-stats {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: v-bind('UI_COLORS.backgroundLight');
}

.compact .sector-card-stats {
  padding: 8px 10px;
  gap: 4px;
}

.sector-stat {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: v-bind('UI_COLORS.textSecondary');
}

.stat-icon {
  font-size: 0.9rem;
}

.stat-value {
  display: flex;
  gap: 6px;
  color: v-bind('UI_COLORS.text');
}

.stat-value span {
  display: flex;
  align-items: center;
  gap: 2px;
}
</style>
