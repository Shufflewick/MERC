<script setup lang="ts">
import { UI_COLORS } from '../colors';
import CombatantIcon from './CombatantIcon.vue';

interface EquipmentChoice {
  value: string;
  label: string;
}

const props = defineProps<{
  choices: EquipmentChoice[];
  prompt?: string;
  combatantId?: string; // Combatant ID for portrait
  combatantName?: string; // Combatant name
  playerColor?: string; // Player color for border
  isDictator?: boolean; // Whether this is a dictator (affects image path)
}>();

const emit = defineEmits<{
  (e: 'select', value: string): void;
  (e: 'clickMerc'): void;
}>();

function handleMercClick() {
  emit('clickMerc');
}

function getIcon(label: string): string {
  const lower = label.toLowerCase();
  if (lower === 'weapon') return '⚔️';
  if (lower === 'armor') return '🛡️';
  return '📦'; // Accessory
}

function handleClick(value: string) {
  emit('select', value);
}
</script>

<template>
  <div class="draw-equipment-type">
    <div class="equipment-row">
      <!-- MERC/Dictator portrait with name (clickable to view details) -->
      <CombatantIcon
        v-if="combatantName"
        :combatant-id="combatantId"
        :combatant-name="combatantName"
        :player-color="playerColor"
        :is-dictator="isDictator"
        size="large"
        clickable
        @click="handleMercClick"
      />
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
