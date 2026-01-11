<script setup lang="ts">
import { computed } from 'vue';
import { getPlayerColor } from '../colors';

const props = defineProps<{
  count: number;
  playerColor?: string;
  isDictator?: boolean;
}>();

const bgColor = computed(() => {
  return getPlayerColor(props.playerColor);
});
</script>

<template>
  <div class="militia-indicator" v-if="count > 0" :style="{ backgroundColor: bgColor }">
    <span class="shield-icon">🛡️</span>
    <span class="count">{{ count }}</span>
  </div>
</template>

<style scoped>
.militia-indicator {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 600;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.shield-icon {
  font-size: 0.65rem;
}

.count {
  min-width: 12px;
  text-align: center;
}
</style>
