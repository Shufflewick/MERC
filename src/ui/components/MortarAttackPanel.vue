<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { UI_COLORS } from '../colors';
import DiceRollDisplay from './DiceRollDisplay.vue';
import CombatPanelCombatant from './CombatPanelCombatant.vue';

export interface MortarAttackData {
  attackerName: string;
  attackerCombatantId: string;
  attackerImage?: string;
  targetSectorId: string;
  targetSectorName: string;
  diceRolls: number[];
  hits: number;
  hitThreshold: number;
  validTargets: Array<{
    id: string;
    name: string;
    type: 'merc' | 'dictator' | 'militia';
    ownerId?: string;
    currentHealth: number;
    maxHealth: number;
    image?: string;
    playerColor?: string;
  }>;
}

const props = defineProps<{
  mortarData: MortarAttackData;
  isMyTurn: boolean;
}>();

const emit = defineEmits<{
  (e: 'confirm-allocation', allocations: string[]): void;
  (e: 'mortar-finished'): void;
}>();

// Track which dice have been allocated to which targets: dieIndex -> targetId
const allocatedHits = ref<Map<number, string>>(new Map());

// Currently selected die index
const selectedDieIndex = ref<number | null>(null);

// Get the successful dice (hits)
const successfulDice = computed(() => {
  const { diceRolls, hitThreshold } = props.mortarData;
  return diceRolls
    .map((value, index) => ({ value, index, isHit: value >= hitThreshold }))
    .filter(d => d.isHit);
});

// Total health across all targets — caps how many hits can actually be allocated
const totalTargetHealth = computed(() => {
  return props.mortarData.validTargets.reduce((sum, t) => sum + t.currentHealth, 0);
});

// Max hits that can actually be assigned (capped by target health)
const maxAllocatable = computed(() => {
  return Math.min(successfulDice.value.length, totalTargetHealth.value);
});

// Unallocated hits remaining (of the allocatable ones)
const unallocatedHitCount = computed(() => {
  const allocated = allocatedHits.value.size;
  return maxAllocatable.value - allocated;
});

// Set of allocated dice indices (for DiceRollDisplay)
const allocatedDiceSet = computed(() => {
  return new Set(allocatedHits.value.keys());
});

// Count hits allocated to each target
const hitsPerTarget = computed(() => {
  const counts = new Map<string, number>();
  for (const targetId of allocatedHits.value.values()) {
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }
  return counts;
});

// Can a target receive more hits? (capped at currentHealth)
function canReceiveHit(target: MortarAttackData['validTargets'][0]): boolean {
  const allocated = hitsPerTarget.value.get(target.id) ?? 0;
  return allocated < target.currentHealth;
}

// Reset when mortar data changes
watch(() => props.mortarData, () => {
  allocatedHits.value = new Map();
  if (successfulDice.value.length > 0) {
    selectedDieIndex.value = successfulDice.value[0].index;
  } else {
    selectedDieIndex.value = null;
  }
}, { immediate: true });

function selectDie(dieIndex: number) {
  if (!props.isMyTurn) return;
  const die = successfulDice.value.find(d => d.index === dieIndex);
  if (!die || allocatedHits.value.has(dieIndex)) return;
  selectedDieIndex.value = dieIndex;
}

function addHitToTarget(targetId: string) {
  if (!props.isMyTurn) return;
  if (selectedDieIndex.value === null) return;

  const target = props.mortarData.validTargets.find(t => t.id === targetId);
  if (!target || !canReceiveHit(target)) return;

  allocatedHits.value.set(selectedDieIndex.value, targetId);

  // Auto-select next unallocated die
  const next = successfulDice.value.find(d => !allocatedHits.value.has(d.index));
  selectedDieIndex.value = next?.index ?? null;
}

function removeHitFromTarget(targetId: string) {
  if (!props.isMyTurn) return;

  // Find and remove the last die allocated to this target
  const entries = [...allocatedHits.value.entries()].filter(([_, tid]) => tid === targetId);
  if (entries.length > 0) {
    const [dieIndex] = entries[entries.length - 1];
    allocatedHits.value.delete(dieIndex);
    selectedDieIndex.value = dieIndex;
  }
}

function handleTargetClick(targetId: string) {
  addHitToTarget(targetId);
}

function handleConfirm() {
  const hitIndexByTarget = new Map<string, number>();
  const allocations: string[] = [];

  allocatedHits.value.forEach((targetId) => {
    const hitIndex = hitIndexByTarget.get(targetId) ?? 0;
    allocations.push(`${targetId}::${hitIndex}`);
    hitIndexByTarget.set(targetId, hitIndex + 1);
  });

  emit('confirm-allocation', allocations);
}
</script>

<template>
  <div class="mortar-attack-panel">
    <!-- Header -->
    <div class="mortar-header">
      <h2>Mortar Strike - {{ mortarData.targetSectorName }}</h2>
    </div>

    <div class="mortar-info">
      <strong>{{ mortarData.attackerName }}</strong> fires mortar!
      <span class="hit-count">{{ mortarData.hits }} hit(s)</span>
    </div>

    <!-- Dice Display -->
    <DiceRollDisplay
      :dice-rolls="mortarData.diceRolls"
      :hit-threshold="mortarData.hitThreshold"
      :roll-count="1"
      :selected-die-index="selectedDieIndex"
      :allocated-dice="allocatedDiceSet"
      :interactive="isMyTurn"
      @select-die="selectDie"
    />

    <!-- Allocation instructions -->
    <div v-if="isMyTurn && unallocatedHitCount > 0" class="allocation-hint">
      Click a die, then click a target to allocate {{ unallocatedHitCount }} remaining hit(s)
    </div>

    <!-- Targets Grid -->
    <div class="targets-section">
      <h3 class="targets-label">Targets</h3>
      <div class="targets-grid">
        <CombatPanelCombatant
          v-for="target in mortarData.validTargets"
          :key="target.id"
          :combatant-id="target.id"
          :name="target.name"
          :image="target.image"
          :player-color="target.playerColor"
          :is-merc="target.type === 'merc' || target.type === 'dictator'"
          :is-militia="target.type === 'militia'"
          :health="target.currentHealth"
          :max-health="target.maxHealth"
          :is-dead="false"
          :is-targetable="isMyTurn && canReceiveHit(target) && selectedDieIndex !== null"
          :show-hit-controls="isMyTurn"
          :allocated-hits="hitsPerTarget.get(target.id) ?? 0"
          @click="handleTargetClick(target.id)"
          @add-hit="addHitToTarget(target.id)"
          @remove-hit="removeHitFromTarget(target.id)"
        />
      </div>
    </div>

    <!-- Confirm button -->
    <button
      v-if="isMyTurn && unallocatedHitCount === 0"
      class="confirm-button"
      @click="handleConfirm"
    >
      Confirm Hit Allocation
    </button>

    <!-- Waiting state for non-active player -->
    <div v-if="!isMyTurn" class="waiting-message">
      Waiting for opponent to allocate mortar hits...
    </div>
  </div>
</template>

<style scoped>
.mortar-attack-panel {
  background: linear-gradient(180deg, #2a1a1a 0%, #1e1628 100%);
  border: 2px solid #ff6b35;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.mortar-header {
  text-align: center;
  margin-bottom: 12px;
}

.mortar-header h2 {
  margin: 0;
  font-size: 1.3rem;
  color: #ff6b35;
}

.mortar-info {
  text-align: center;
  margin-bottom: 12px;
  color: v-bind('UI_COLORS.text');
}

.hit-count {
  margin-left: 8px;
  color: #4CAF50;
  font-weight: bold;
}

.allocation-hint {
  text-align: center;
  color: #ff9800;
  font-size: 0.9rem;
  margin-top: 12px;
}

.targets-section {
  margin-top: 16px;
}

.targets-label {
  color: v-bind('UI_COLORS.textMuted');
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 8px 0;
}

.targets-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.confirm-button {
  display: block;
  margin: 16px auto 0;
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

.waiting-message {
  text-align: center;
  color: v-bind('UI_COLORS.textMuted');
  font-style: italic;
  margin-top: 16px;
}
</style>
