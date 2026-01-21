<script setup lang="ts">
import { Die3D } from 'boardsmith/ui';

const props = defineProps<{
  diceRolls: number[];
  hitThreshold: number;
  rollCount?: number;
  // For interactive mode (hit allocation)
  selectedDieIndex?: number | null;
  allocatedDice?: Set<number>;
  interactive?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select-die', index: number): void;
}>();

function isDieSix(value: number): boolean {
  return value === 6;
}

function isHit(value: number): boolean {
  return value >= props.hitThreshold;
}

function isAllocated(index: number): boolean {
  return props.allocatedDice?.has(index) ?? false;
}

function handleDieClick(index: number) {
  if (!props.interactive) return;
  if (isAllocated(index)) return;
  if (!isHit(props.diceRolls[index])) return;
  emit('select-die', index);
}
</script>

<template>
  <div class="dice-row">
    <div
      v-for="(value, index) in diceRolls"
      :key="index"
      class="die-container"
      :class="{
        hit: isHit(value),
        miss: !isHit(value),
        selected: selectedDieIndex === index,
        allocated: isAllocated(index),
        six: isDieSix(value),
        interactive: interactive && isHit(value) && !isAllocated(index),
      }"
      @click="handleDieClick(index)"
    >
      <Die3D
        :sides="6"
        :value="value"
        :die-id="`die-${index}`"
        :roll-count="rollCount ?? 1"
        :size="50"
        :color="isHit(value) ? '#4CAF50' : '#666'"
      />
    </div>
  </div>
</template>

<style scoped>
.dice-row {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.die-container {
  padding: 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid transparent;
  transition: all 0.2s;
}

.die-container.hit {
  border-color: #4CAF50;
}

.die-container.miss {
  opacity: 0.5;
  border-color: #666;
}

.die-container.interactive {
  cursor: pointer;
}

.die-container.interactive:hover {
  transform: scale(1.05);
  box-shadow: 0 0 8px rgba(76, 175, 80, 0.4);
}

.die-container.selected {
  border-color: #D4A84B;
  box-shadow: 0 0 12px rgba(212, 168, 75, 0.6);
  transform: scale(1.1);
}

.die-container.allocated {
  opacity: 0.4;
  cursor: default;
}

.die-container.six {
  background: rgba(255, 152, 0, 0.2);
}
</style>
