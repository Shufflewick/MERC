<script setup lang="ts">

const props = defineProps<{
  attackerName: string;
  maxTargets: number;
  selectedCount: number;
}>();

const emit = defineEmits<{
  (e: 'confirm-targets'): void;
}>();
</script>

<template>
  <div class="target-selection-panel">
    <div class="target-selection-info">
      <strong>{{ attackerName }}</strong> is attacking!
      <span class="target-count">Select up to {{ maxTargets }} target(s)</span>
    </div>
    <div class="target-selection-hint">
      Click enemies above to select targets ({{ selectedCount }}/{{ maxTargets }} selected)
    </div>

    <!-- Confirm button when at least one target selected -->
    <button
      v-if="selectedCount > 0"
      class="confirm-targets-button"
      @click="emit('confirm-targets')"
    >
      Confirm {{ selectedCount }} Target{{ selectedCount > 1 ? 's' : '' }}
    </button>
  </div>
</template>

<style scoped>
.target-selection-panel {
  background: rgba(76, 175, 80, 0.1);
  border: 2px solid #4CAF50;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  margin-top: 12px;
}

.target-selection-info {
  color: #4CAF50;
  margin-bottom: 8px;
}

.target-count {
  margin-left: 8px;
  font-weight: bold;
}

.target-selection-hint {
  color: #81C784;
  font-size: 0.9rem;
  margin-bottom: 12px;
}

.confirm-targets-button {
  padding: 12px 24px;
  background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.confirm-targets-button:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
}
</style>
