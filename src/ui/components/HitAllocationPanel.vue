<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import DiceRollDisplay from './DiceRollDisplay.vue';
import { UI_COLORS } from '../colors';

export interface PendingHitAllocation {
  attackerId: string;
  attackerName: string;
  attackerCombatantId: string;
  diceRolls: number[];
  hits: number;
  hitThreshold: number;
  validTargets: Array<{
    id: string;
    name: string;
    isMerc: boolean;
    currentHealth: number;
    maxHealth: number;
  }>;
  wolverineSixes: number;
  canReroll: boolean;
  hasRerolled: boolean;
  rollCount: number;
}

const props = defineProps<{
  pendingAllocation: PendingHitAllocation;
  isMyTurn: boolean;
}>();

const emit = defineEmits<{
  (e: 'allocate-hit', targetId: string): void;
  (e: 'confirm-allocation', allocations: string[]): void;
  (e: 'reroll'): void;
  (e: 'select-die', dieIndex: number): void;
}>();

// Track which dice have been allocated to which targets
const allocatedHits = ref<Map<number, string>>(new Map()); // dieIndex -> targetId

// Track allocations when dice data is unavailable (simple list of targetIds)
const fallbackAllocations = ref<string[]>([]);

// Get the currently selected die index (first unallocated hit)
const selectedDieIndex = ref<number | null>(null);

// Check if we have dice data
const hasDiceData = computed(() => {
  return props.pendingAllocation.diceRolls && props.pendingAllocation.diceRolls.length > 0;
});

// Get the successful dice (hits)
const successfulDice = computed(() => {
  const { diceRolls, hitThreshold } = props.pendingAllocation;
  if (!diceRolls) return [];
  return diceRolls
    .map((value, index) => ({ value, index, isHit: value >= hitThreshold }))
    .filter(d => d.isHit);
});

// Get unallocated hit count - works with or without dice data
const unallocatedHitCount = computed(() => {
  const totalHits = props.pendingAllocation.hits || 0;
  if (hasDiceData.value) {
    return successfulDice.value.filter(d => !allocatedHits.value.has(d.index)).length;
  }
  return totalHits - fallbackAllocations.value.length;
});

// Get unallocated successful dice (for dice-based UI)
const unallocatedHits = computed(() => {
  return successfulDice.value.filter(d => !allocatedHits.value.has(d.index));
});

// Check if Basic's reroll is available
const canReroll = computed(() => {
  return props.pendingAllocation.canReroll &&
         !props.pendingAllocation.hasRerolled &&
         props.isMyTurn;
});

// Convert allocatedHits to a Set for the DiceRollDisplay
const allocatedDiceSet = computed(() => {
  return new Set(allocatedHits.value.keys());
});

// Reset allocation state when pendingAllocation changes
watch(() => props.pendingAllocation, () => {
  allocatedHits.value.clear();
  fallbackAllocations.value = [];
  // Auto-select first hit die (only when dice data is available)
  if (successfulDice.value.length > 0) {
    selectedDieIndex.value = successfulDice.value[0].index;
  } else {
    selectedDieIndex.value = null;
  }
}, { immediate: true });

// Handle clicking a die
function selectDie(dieIndex: number) {
  if (!props.isMyTurn) return;
  const die = successfulDice.value.find(d => d.index === dieIndex);
  if (!die || allocatedHits.value.has(dieIndex)) return;
  selectedDieIndex.value = dieIndex;
  emit('select-die', dieIndex);
}

// Handle allocating to a target (called from parent)
function allocateToTarget(targetId: string) {
  // When dice data is available, use dice-based allocation
  if (hasDiceData.value) {
    // Check if any die is already allocated to this target - if so, deselect it
    const allocatedToTarget = [...allocatedHits.value.entries()]
      .filter(([_, tid]) => tid === targetId);

    if (allocatedToTarget.length > 0) {
      // Remove the last allocation to this target and select that die
      const [dieIndex] = allocatedToTarget[allocatedToTarget.length - 1];
      allocatedHits.value.delete(dieIndex);
      selectedDieIndex.value = dieIndex;
      return;
    }

    // Normal allocation
    if (selectedDieIndex.value === null) return;

    allocatedHits.value.set(selectedDieIndex.value, targetId);
    emit('allocate-hit', targetId);

    // Auto-select next unallocated die
    const nextUnallocated = successfulDice.value.find(d => !allocatedHits.value.has(d.index));
    selectedDieIndex.value = nextUnallocated?.index ?? null;
  } else {
    // Fallback mode: no dice data, just track allocations by count
    // Check for deselection first
    const lastIndex = fallbackAllocations.value.lastIndexOf(targetId);
    if (lastIndex !== -1) {
      fallbackAllocations.value.splice(lastIndex, 1);
      return;
    }

    const totalHits = props.pendingAllocation.hits || 0;
    if (fallbackAllocations.value.length >= totalHits) return;

    fallbackAllocations.value.push(targetId);
    emit('allocate-hit', targetId);
  }
}

// Build allocation strings from current allocatedHits
function buildAllocations(): string[] {
  const hitIndexByTarget = new Map<string, number>();
  const allocations: string[] = [];

  if (hasDiceData.value) {
    allocatedHits.value.forEach((targetId) => {
      const hitIndex = hitIndexByTarget.get(targetId) ?? 0;
      allocations.push(`${targetId}::${hitIndex}`);
      hitIndexByTarget.set(targetId, hitIndex + 1);
    });
  } else {
    // Fallback mode: build from fallbackAllocations
    for (const targetId of fallbackAllocations.value) {
      const hitIndex = hitIndexByTarget.get(targetId) ?? 0;
      allocations.push(`${targetId}::${hitIndex}`);
      hitIndexByTarget.set(targetId, hitIndex + 1);
    }
  }

  return allocations;
}

function handleConfirm() {
  emit('confirm-allocation', buildAllocations());
}

function handleReroll() {
  if (!canReroll.value) return;
  allocatedHits.value.clear();
  selectedDieIndex.value = null;
  emit('reroll');
}

// Expose allocateToTarget for parent to call
defineExpose({
  allocateToTarget,
  selectedDieIndex,
  allocatedHits,
});
</script>

<template>
  <div class="hit-allocation-panel">
    <div class="attacker-info">
      <strong>{{ pendingAllocation.attackerName }}</strong> attacks!
      <span class="hit-count">{{ pendingAllocation.hits }} hit(s)</span>
    </div>

    <DiceRollDisplay
      :dice-rolls="pendingAllocation.diceRolls ?? []"
      :hit-threshold="pendingAllocation.hitThreshold"
      :roll-count="pendingAllocation.rollCount"
      :selected-die-index="selectedDieIndex"
      :allocated-dice="allocatedDiceSet"
      :interactive="isMyTurn"
      @select-die="selectDie"
    />

    <!-- Allocation instructions -->
    <div v-if="isMyTurn && unallocatedHitCount > 0" class="allocation-hint">
      <template v-if="hasDiceData">
        Click a die, then click a target to allocate {{ unallocatedHitCount }} remaining hit(s)
      </template>
      <template v-else>
        Click a target to allocate {{ unallocatedHitCount }} remaining hit(s)
      </template>
    </div>

    <!-- Confirm button when all hits allocated -->
    <button
      v-if="isMyTurn && unallocatedHitCount === 0"
      class="confirm-button"
      @click="handleConfirm"
    >
      ✓ Confirm Hit Allocation
    </button>

    <!-- Basic's reroll button -->
    <button
      v-if="canReroll"
      class="reroll-button"
      @click="handleReroll"
    >
      🎲 Reroll All Dice (Basic's Ability)
    </button>
  </div>
</template>

<style scoped>
.hit-allocation-panel {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}

.attacker-info {
  margin-bottom: 12px;
  color: v-bind('UI_COLORS.text');
}

.hit-count {
  margin-left: 8px;
  color: #4CAF50;
  font-weight: bold;
}

.allocation-hint {
  color: #ff9800;
  font-size: 0.9rem;
  margin-top: 12px;
}

.confirm-button {
  margin-top: 12px;
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

.confirm-button:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
}

.reroll-button {
  margin-top: 12px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.reroll-button:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(33, 150, 243, 0.4);
}
</style>
