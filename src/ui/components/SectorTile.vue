<script setup lang="ts">
import { computed, ref } from 'vue';
import { getPlayerColor } from '../colors';
import MilitiaIndicator from './MilitiaIndicator.vue';

interface SectorData {
  sectorId: string;
  sectorName: string;
  sectorType: 'Wilderness' | 'City' | 'Industry';
  value: number;
  image?: string;
  explored: boolean;
  dictatorMilitia: number;
  rebelMilitia?: Record<string, number>;
}

interface MercInSector {
  mercId: string;
  mercName: string;
  image?: string;
  playerColor?: string;
}

const props = defineProps<{
  sector: SectorData;
  controllingPlayerColor?: string;
  mercsInSector: MercInSector[];
  isClickable?: boolean;
}>();

const emit = defineEmits<{
  click: [sectorId: string];
}>();

const showTooltip = ref(false);

const borderColor = computed(() => {
  if (!props.controllingPlayerColor) return 'transparent';
  return getPlayerColor(props.controllingPlayerColor);
});

const displayName = computed(() => {
  const { sectorName, sectorType } = props.sector;
  // sectorName already includes the type (e.g., "Silver Industry", "Maplewood City")
  // Just use sectorName directly unless it's missing
  if (sectorName) {
    return sectorName;
  }
  // Fallback to just showing the type
  return sectorType;
});

const imagePath = computed(() => {
  if (props.sector.image) return props.sector.image;
  // Fallback based on type
  const type = props.sector.sectorType.toLowerCase();
  if (type === 'wilderness') return '/sectors/wilderness.jpg';
  if (type === 'city') return '/sectors/town---a.jpg';
  return '/sectors/industry---coal.jpg';
});

// Group MERCs by player color for display
const mercsByPlayer = computed(() => {
  const grouped: Record<string, MercInSector[]> = {};
  for (const merc of props.mercsInSector) {
    const color = merc.playerColor || 'unknown';
    if (!grouped[color]) grouped[color] = [];
    grouped[color].push(merc);
  }
  return grouped;
});

// Rebel militia entries (filter out zeros)
const rebelMilitiaEntries = computed(() => {
  const rm = props.sector.rebelMilitia || {};
  return Object.entries(rm).filter(([, count]) => count > 0);
});

function handleClick() {
  if (props.isClickable) {
    emit('click', props.sector.sectorId);
  }
}

function getMercImagePath(merc: MercInSector) {
  if (merc.image) return merc.image;
  return `/mercs/${merc.mercId}.jpg`;
}
</script>

<template>
  <div
    class="sector-tile"
    :class="{ clickable: isClickable, controlled: controllingPlayerColor }"
    :style="{
      backgroundImage: `url(${imagePath})`,
      borderColor,
    }"
    @click="handleClick"
    @mouseenter="showTooltip = true"
    @mouseleave="showTooltip = false"
  >
    <!-- Dark overlay for readability -->
    <div class="overlay"></div>

    <!-- Top row: Name and Value -->
    <div class="top-row">
      <span class="sector-name">{{ displayName }}</span>
      <span class="sector-value">Value: {{ sector.value }}</span>
    </div>

    <!-- Center: Unexplored or loot -->
    <div class="center-area">
      <template v-if="!sector.explored">
        <div class="unexplored">
          <span class="question-mark">?</span>
          <span class="unexplored-text">Unexplored</span>
        </div>
      </template>
    </div>

    <!-- Bottom row: MERCs and Militia -->
    <div class="bottom-row">
      <!-- MERC portraits -->
      <div class="mercs-area">
        <div
          v-for="merc in mercsInSector.slice(0, 4)"
          :key="merc.mercId"
          class="merc-portrait"
          :style="{ borderColor: getPlayerColor(merc.playerColor) }"
        >
          <img :src="getMercImagePath(merc)" :alt="merc.mercName" />
        </div>
        <div v-if="mercsInSector.length > 4" class="more-mercs">
          +{{ mercsInSector.length - 4 }}
        </div>
      </div>

      <!-- Militia indicators -->
      <div class="militia-area">
        <MilitiaIndicator
          v-if="sector.dictatorMilitia > 0"
          :count="sector.dictatorMilitia"
          :is-dictator="true"
        />
        <MilitiaIndicator
          v-for="[color, count] in rebelMilitiaEntries"
          :key="color"
          :count="count"
          :player-color="color"
        />
      </div>
    </div>

    <!-- Tooltip for MERCs -->
    <div v-if="showTooltip && mercsInSector.length > 0" class="merc-tooltip">
      <div
        v-for="merc in mercsInSector"
        :key="merc.mercId"
        class="tooltip-merc"
      >
        <div
          class="tooltip-portrait"
          :style="{ borderColor: getPlayerColor(merc.playerColor) }"
        >
          <img :src="getMercImagePath(merc)" :alt="merc.mercName" />
        </div>
        <span class="tooltip-name">{{ merc.mercName }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sector-tile {
  position: relative;
  aspect-ratio: 2 / 1;
  background-size: cover;
  background-position: center;
  border-radius: 8px;
  border: 3px solid transparent;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
}

.sector-tile.controlled {
  border-style: solid;
}

.sector-tile.clickable {
  cursor: pointer;
}

.sector-tile.clickable:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.6) 0%,
    rgba(0, 0, 0, 0.2) 40%,
    rgba(0, 0, 0, 0.4) 100%
  );
}

.top-row,
.center-area,
.bottom-row {
  position: relative;
  z-index: 1;
}

.top-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 10px;
}

.sector-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: white;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.sector-value {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.center-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
}

.unexplored {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.question-mark {
  font-size: 2rem;
  color: rgba(255, 255, 255, 0.7);
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.unexplored-text {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.8);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.bottom-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 8px 10px;
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
}

.mercs-area {
  display: flex;
  gap: 4px;
}

.merc-portrait {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid;
  overflow: hidden;
  background: #333;
}

.merc-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.more-mercs {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 0.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.militia-area {
  display: flex;
  gap: 4px;
}

/* Tooltip */
.merc-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(30, 40, 30, 0.95);
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 150px;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.tooltip-merc {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tooltip-portrait {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid;
  overflow: hidden;
}

.tooltip-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tooltip-name {
  font-size: 0.85rem;
  color: white;
}
</style>
