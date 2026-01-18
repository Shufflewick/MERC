<script setup lang="ts">
import { computed } from 'vue';
import SectorCardChoice from './SectorCardChoice.vue';
import { UI_COLORS } from '../colors';

export interface LandingSector {
  sectorId: string;
  sectorName: string;
  sectorType: string;
  image: string;
  value: number;
  weaponLoot: number;
  armorLoot: number;
  accessoryLoot: number;
  dictatorMilitia: number;
  row: number;
  col: number;
}

const props = defineProps<{
  sectors: LandingSector[];
}>();

const emit = defineEmits<{
  'sector-selected': [sectorId: string];
}>();

// Calculate edge sectors (landing zones)
const edgeSectors = computed(() => {
  if (props.sectors.length === 0) return [];

  const rows = Math.max(...props.sectors.map(s => s.row)) + 1;
  const cols = Math.max(...props.sectors.map(s => s.col)) + 1;

  return props.sectors.filter(s =>
    s.row === 0 || s.row === rows - 1 || s.col === 0 || s.col === cols - 1
  );
});

function handleSectorClick(sector: LandingSector) {
  emit('sector-selected', sector.sectorId);
}
</script>

<template>
  <div class="landing-zone-selection">
    <div class="landing-header">
      <h2 class="action-title">Choose Landing Zone</h2>
      <p class="action-subtitle">Select an edge sector for your landing</p>
    </div>

    <div class="landing-sectors-grid">
      <SectorCardChoice
        v-for="sector in edgeSectors"
        :key="sector.sectorId"
        :sector="{
          sectorName: sector.sectorName,
          sectorId: sector.sectorId,
          image: sector.image,
          value: sector.value,
          weaponLoot: sector.weaponLoot,
          armorLoot: sector.armorLoot,
          accessoryLoot: sector.accessoryLoot,
          dictatorMilitia: sector.dictatorMilitia,
        }"
        size="compact"
        @click="handleSectorClick(sector)"
      />
    </div>

    <p class="landing-hint" v-if="edgeSectors.length === 0">
      No valid landing zones available
    </p>
  </div>
</template>

<style scoped>
.landing-zone-selection {
  padding: 20px;
  background: v-bind('UI_COLORS.backgroundLight');
  border-radius: 12px;
  margin-bottom: 16px;
}

.landing-header {
  text-align: center;
  margin-bottom: 20px;
}

.action-title {
  font-size: 1.3rem;
  color: v-bind('UI_COLORS.accent');
  margin: 0 0 8px 0;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.action-subtitle {
  font-size: 0.95rem;
  color: v-bind('UI_COLORS.textSecondary');
  margin: 0;
}

.landing-sectors-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}

.landing-hint {
  text-align: center;
  color: v-bind('UI_COLORS.textSecondary');
  font-style: italic;
  margin: 16px 0 0 0;
}
</style>
