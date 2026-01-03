<script setup lang="ts">
import { computed } from 'vue';
import { UI_COLORS, getPlayerColor } from '../colors';

interface EquipmentChoice {
  value: string;
  label: string;
}

const props = defineProps<{
  choices: EquipmentChoice[];
  prompt?: string;
  mercImage?: string; // MERC portrait image path
  mercName?: string; // MERC name for alt text
  playerColor?: string; // Player color for border
}>();

const emit = defineEmits<{
  (e: 'select', value: string): void;
}>();

function getIcon(label: string): string {
  const lower = label.toLowerCase();
  if (lower === 'weapon') return '⚔️';
  if (lower === 'armor') return '🛡️';
  return '📦'; // Accessory
}

function handleClick(value: string) {
  emit('select', value);
}

const portraitBorderColor = computed(() => {
  return props.playerColor ? getPlayerColor(props.playerColor) : UI_COLORS.accent;
});

const mercImagePath = computed(() => {
  if (props.mercImage) return props.mercImage;
  // No default - don't show portrait if no image
  return null;
});
</script>

<template>
  <div class="draw-equipment-type">
    <div class="equipment-row">
      <!-- MERC portrait -->
      <div
        v-if="mercImagePath"
        class="merc-portrait"
        :style="{ borderColor: portraitBorderColor }"
      >
        <img :src="mercImagePath" :alt="mercName || 'MERC'" />
      </div>
      <!-- Equipment type buttons -->
      <button
        v-for="choice in choices"
        :key="choice.value"
        class="equipment-type-button"
        :class="choice.label.toLowerCase()"
        @click="handleClick(choice.value)"
      >
        <span class="equip-icon">{{ getIcon(choice.label) }}</span>
        <span class="equip-label">{{ choice.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.draw-equipment-type {
  width: 100%;
}

.equipment-row {
  display: flex;
  gap: 16px;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
}

.merc-portrait {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 3px solid;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.4);
}

.merc-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.equipment-type-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 24px;
  border: 2px solid v-bind('UI_COLORS.border');
  border-radius: 12px;
  background: v-bind('UI_COLORS.surfaceAlt');
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 100px;
}

.equipment-type-button .equip-icon {
  font-size: 2rem;
}

.equipment-type-button .equip-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: v-bind('UI_COLORS.textPrimary');
}

.equipment-type-button.weapon {
  border-color: rgba(255, 107, 138, 0.5);
}

.equipment-type-button.weapon:hover {
  background: rgba(255, 107, 138, 0.2);
  border-color: #ff6b8a;
}

.equipment-type-button.armor {
  border-color: rgba(100, 181, 246, 0.5);
}

.equipment-type-button.armor:hover {
  background: rgba(100, 181, 246, 0.2);
  border-color: #64b5f6;
}

.equipment-type-button.accessory {
  border-color: rgba(129, 212, 168, 0.5);
}

.equipment-type-button.accessory:hover {
  background: rgba(129, 212, 168, 0.2);
  border-color: #81d4a8;
}
</style>
