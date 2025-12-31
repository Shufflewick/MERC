<script setup lang="ts">
import { computed } from 'vue';
import SectorTile from './SectorTile.vue';

interface SectorData {
  sectorId: string;
  sectorName: string;
  sectorType: 'Wilderness' | 'City' | 'Industry';
  value: number;
  row: number;
  col: number;
  image?: string;
  explored: boolean;
  dictatorMilitia: number;
  rebelMilitia?: Record<string, number>;
}

interface MercData {
  mercId: string;
  mercName: string;
  image?: string;
  playerColor?: string;
  sectorId?: string;
}

interface PlayerData {
  position: number;
  playerColor?: string;
  isDictator?: boolean;
}

const props = defineProps<{
  sectors: SectorData[];
  mercs: MercData[];
  players: PlayerData[];
  controlMap: Record<string, string | undefined>; // sectorId -> playerColor
  clickableSectors?: string[];
  canDropEquipment?: boolean;
}>();

const emit = defineEmits<{
  sectorClick: [sectorId: string];
  dropEquipment: [mercId: number, equipmentId: number];
}>();

function handleDropEquipment(mercId: number, equipmentId: number) {
  emit('dropEquipment', mercId, equipmentId);
}

// Calculate grid dimensions
const gridDimensions = computed(() => {
  let maxRow = 0;
  let maxCol = 0;
  for (const sector of props.sectors) {
    if (sector.row > maxRow) maxRow = sector.row;
    if (sector.col > maxCol) maxCol = sector.col;
  }
  return { rows: maxRow + 1, cols: maxCol + 1 };
});

// Sort sectors by position (row, col) for grid layout
const sortedSectors = computed(() => {
  return [...props.sectors].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });
});

// Get MERCs for a given sector
function getMercsInSector(sectorId: string) {
  return props.mercs.filter((m) => m.sectorId === sectorId);
}

// Map player positions to colors (for rebel militia display)
const playerColorMap = computed(() => {
  const map: Record<string, string> = {};
  for (const player of props.players) {
    if (player.playerColor && !player.isDictator) {
      map[String(player.position)] = player.playerColor;
    }
  }
  return map;
});

// Check if sector is clickable
function isClickable(sectorId: string) {
  if (!props.clickableSectors) return false;
  return props.clickableSectors.includes(sectorId);
}

function handleSectorClick(sectorId: string) {
  emit('sectorClick', sectorId);
}
</script>

<template>
  <div
    class="map-grid"
    :style="{
      gridTemplateColumns: `repeat(${gridDimensions.cols}, 1fr)`,
      gridTemplateRows: `repeat(${gridDimensions.rows}, 1fr)`,
    }"
  >
    <SectorTile
      v-for="sector in sortedSectors"
      :key="sector.sectorId"
      :sector="sector"
      :controlling-player-color="controlMap[sector.sectorId]"
      :mercs-in-sector="getMercsInSector(sector.sectorId)"
      :player-color-map="playerColorMap"
      :is-clickable="isClickable(sector.sectorId)"
      :can-drop-equipment="canDropEquipment"
      @click="handleSectorClick"
      @drop-equipment="handleDropEquipment"
    />
  </div>
</template>

<style scoped>
.map-grid {
  display: grid;
  gap: 8px;
  width: 100%;
}
</style>
