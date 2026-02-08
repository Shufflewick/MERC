<script setup lang="ts">
import SectorCardChoice from './SectorCardChoice.vue';

export interface RetreatSector {
  id: string | number;
  sectorName: string;
  sectorType: string;
  image: string;
  value: number;
  weaponLoot: number;
  armorLoot: number;
  accessoryLoot: number;
  dictatorMilitia: number;
}

const props = defineProps<{
  sectors: RetreatSector[];
}>();

const emit = defineEmits<{
  (e: 'select', sectorId: string | number): void;
}>();

function handleSelect(sector: RetreatSector) {
  emit('select', sector.id);
}
</script>

<template>
  <div class="retreat-sector-selection">
    <div class="retreat-selection-header">
      <strong>Retreat to which sector?</strong>
    </div>
    <div class="sector-card-choices">
      <SectorCardChoice
        v-for="sector in sectors"
        :key="sector.id"
        :sector="sector"
        size="compact"
        @click="handleSelect(sector)"
      />
    </div>
  </div>
</template>

<style scoped>
.retreat-sector-selection {
  background: rgba(255, 152, 0, 0.1);
  border: 2px solid #ff9800;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  margin-top: 12px;
}

.retreat-selection-header {
  color: #ff9800;
  margin-bottom: 12px;
  font-size: 1.1rem;
}

.sector-card-choices {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}
</style>
