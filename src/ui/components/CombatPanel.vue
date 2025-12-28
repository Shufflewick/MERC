<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Die3D } from '@boardsmith/ui';
import { UI_COLORS } from '../colors';

const props = defineProps<{
  activeCombat: {
    sectorId: string;
    round: number;
    rebelCombatants: any[];
    dictatorCombatants: any[];
    rebelCasualties: any[];
    dictatorCasualties: any[];
    pendingHitAllocation?: {
      attackerId: string;
      attackerName: string;
      attackerMercId: string;
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
    };
    pendingWolverineSixes?: {
      attackerId: string;
      attackerName: string;
      sixCount: number;
      bonusTargets: Array<{
        id: string;
        name: string;
        isMerc: boolean;
        currentHealth: number;
        maxHealth: number;
      }>;
    };
  };
  isMyTurn: boolean;
  availableActions: string[];
  sectorName: string;
}>();

const emit = defineEmits<{
  (e: 'allocate-hit', targetId: string): void;
  (e: 'allocate-wolverine-six', targetId: string): void;
  (e: 'reroll'): void;
  (e: 'confirm-allocation'): void;
}>();

// Track which dice have been allocated to which targets
const allocatedHits = ref<Map<number, string>>(new Map()); // dieIndex -> targetId

// Get living rebels (not in casualties)
const livingRebels = computed(() => {
  const casualtyIds = new Set(
    props.activeCombat.rebelCasualties.map((c: any) => c.id || c.sourceElement?.id)
  );
  return props.activeCombat.rebelCombatants.filter(
    (c: any) => !casualtyIds.has(c.id || c.sourceElement?.id)
  );
});

// Get living dictator forces
const livingDictator = computed(() => {
  const casualtyIds = new Set(
    props.activeCombat.dictatorCasualties.map((c: any) => c.id || c.sourceElement?.id)
  );
  return props.activeCombat.dictatorCombatants.filter(
    (c: any) => !casualtyIds.has(c.id || c.sourceElement?.id)
  );
});

// Check if we're in hit allocation mode
const isAllocating = computed(() => {
  return !!props.activeCombat.pendingHitAllocation && props.isMyTurn;
});

// Check if we're allocating Wolverine's 6s
const isAllocatingWolverineSixes = computed(() => {
  return !!props.activeCombat.pendingWolverineSixes && props.isMyTurn;
});

// Get the successful dice (hits)
const successfulDice = computed(() => {
  if (!props.activeCombat.pendingHitAllocation) return [];
  const { diceRolls, hitThreshold } = props.activeCombat.pendingHitAllocation;
  return diceRolls
    .map((value, index) => ({ value, index, isHit: value >= hitThreshold }))
    .filter(d => d.isHit);
});

// Get unallocated successful dice
const unallocatedHits = computed(() => {
  return successfulDice.value.filter(d => !allocatedHits.value.has(d.index));
});

// Get the currently selected die (first unallocated hit)
const selectedDieIndex = ref<number | null>(null);

// Check if a die is a 6 (for Wolverine highlight)
function isDieSix(value: number): boolean {
  return value === 6;
}

// Check if Basic's reroll is available
const canReroll = computed(() => {
  const allocation = props.activeCombat.pendingHitAllocation;
  return allocation?.canReroll && !allocation?.hasRerolled && props.isMyTurn;
});

// Handle clicking a die
function selectDie(dieIndex: number) {
  if (!isAllocating.value) return;
  const die = successfulDice.value.find(d => d.index === dieIndex);
  if (!die || allocatedHits.value.has(dieIndex)) return;
  selectedDieIndex.value = dieIndex;
}

// Handle clicking a target
function selectTarget(targetId: string) {
  if (isAllocatingWolverineSixes.value) {
    emit('allocate-wolverine-six', targetId);
    return;
  }

  if (!isAllocating.value || selectedDieIndex.value === null) return;

  // Allocate the selected die to this target
  allocatedHits.value.set(selectedDieIndex.value, targetId);
  emit('allocate-hit', targetId);

  // Auto-select next unallocated die
  const nextUnallocated = successfulDice.value.find(d => !allocatedHits.value.has(d.index));
  selectedDieIndex.value = nextUnallocated?.index ?? null;

  // If all hits allocated, emit confirm
  if (unallocatedHits.value.length === 0) {
    emit('confirm-allocation');
  }
}

// Handle reroll button
function handleReroll() {
  if (!canReroll.value) return;
  allocatedHits.value.clear();
  selectedDieIndex.value = null;
  emit('reroll');
}

// Get display info for a combatant
function getCombatantDisplay(combatant: any) {
  const source = combatant.sourceElement || combatant;
  const isMerc = !!source.mercId || !!source.mercName;
  return {
    id: combatant.id || source.id,
    name: combatant.name || source.mercName || 'Militia',
    isMerc,
    health: combatant.health ?? source.health ?? 1,
    maxHealth: combatant.maxHealth ?? source.maxHealth ?? (isMerc ? 3 : 1),
    mercId: source.mercId,
    image: source.image || source.attributes?.image,
    isDead: (combatant.health ?? source.health ?? 1) <= 0,
  };
}

// Get allocated hits count for a target
function getAllocatedHitsForTarget(targetId: string): number {
  let count = 0;
  allocatedHits.value.forEach((tid) => {
    if (tid === targetId) count++;
  });
  return count;
}

// Check if target is valid for allocation
function isValidTarget(targetId: string): boolean {
  if (isAllocatingWolverineSixes.value) {
    return props.activeCombat.pendingWolverineSixes?.bonusTargets.some(t => t.id === targetId) ?? false;
  }
  return props.activeCombat.pendingHitAllocation?.validTargets.some(t => t.id === targetId) ?? false;
}

// Reset allocation state when pendingHitAllocation changes
watch(() => props.activeCombat.pendingHitAllocation, () => {
  allocatedHits.value.clear();
  selectedDieIndex.value = null;
  // Auto-select first hit die
  if (props.activeCombat.pendingHitAllocation && successfulDice.value.length > 0) {
    selectedDieIndex.value = successfulDice.value[0].index;
  }
}, { immediate: true });
</script>

<template>
  <div class="combat-panel">
    <!-- Header -->
    <div class="combat-header">
      <h2>Combat - {{ sectorName }}</h2>
      <div class="round-indicator">Round {{ activeCombat.round }}</div>
    </div>

    <!-- Main battle area -->
    <div class="battle-area">
      <!-- Rebel side -->
      <div class="side rebel-side">
        <h3 class="side-label">Rebels</h3>
        <div class="combatants">
          <div
            v-for="combatant in livingRebels"
            :key="getCombatantDisplay(combatant).id"
            class="combatant"
            :class="{
              merc: getCombatantDisplay(combatant).isMerc,
              militia: !getCombatantDisplay(combatant).isMerc,
              attacking: activeCombat.pendingHitAllocation?.attackerId === getCombatantDisplay(combatant).id,
            }"
          >
            <div class="combatant-portrait">
              <img
                v-if="getCombatantDisplay(combatant).image"
                :src="getCombatantDisplay(combatant).image"
                :alt="getCombatantDisplay(combatant).name"
              />
              <div v-else class="militia-shield">🛡️</div>
            </div>
            <div class="combatant-name">{{ getCombatantDisplay(combatant).name }}</div>
            <div class="health-bar">
              <div
                class="health-fill"
                :style="{ width: `${(getCombatantDisplay(combatant).health / getCombatantDisplay(combatant).maxHealth) * 100}%` }"
              ></div>
              <span class="health-text">
                {{ getCombatantDisplay(combatant).health }}/{{ getCombatantDisplay(combatant).maxHealth }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- VS divider -->
      <div class="vs-divider">
        <span class="vs-text">VS</span>
      </div>

      <!-- Dictator side -->
      <div class="side dictator-side">
        <h3 class="side-label">Dictator</h3>
        <div class="combatants">
          <div
            v-for="combatant in livingDictator"
            :key="getCombatantDisplay(combatant).id"
            class="combatant"
            :class="{
              merc: getCombatantDisplay(combatant).isMerc,
              militia: !getCombatantDisplay(combatant).isMerc,
              targetable: isValidTarget(getCombatantDisplay(combatant).id),
              selected: selectedDieIndex !== null && isValidTarget(getCombatantDisplay(combatant).id),
            }"
            @click="selectTarget(getCombatantDisplay(combatant).id)"
          >
            <div class="combatant-portrait">
              <img
                v-if="getCombatantDisplay(combatant).image"
                :src="getCombatantDisplay(combatant).image"
                :alt="getCombatantDisplay(combatant).name"
              />
              <div v-else class="militia-shield">🛡️</div>
            </div>
            <div class="combatant-name">{{ getCombatantDisplay(combatant).name }}</div>
            <div class="health-bar">
              <div
                class="health-fill"
                :style="{ width: `${(getCombatantDisplay(combatant).health / getCombatantDisplay(combatant).maxHealth) * 100}%` }"
              ></div>
              <span class="health-text">
                {{ getCombatantDisplay(combatant).health }}/{{ getCombatantDisplay(combatant).maxHealth }}
              </span>
            </div>
            <!-- Show allocated hits -->
            <div v-if="getAllocatedHitsForTarget(getCombatantDisplay(combatant).id) > 0" class="allocated-hits">
              +{{ getAllocatedHitsForTarget(getCombatantDisplay(combatant).id) }} hit(s)
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Dice area -->
    <div v-if="activeCombat.pendingHitAllocation" class="dice-area">
      <div class="attacker-info">
        <strong>{{ activeCombat.pendingHitAllocation.attackerName }}</strong> attacks!
        <span class="hit-count">{{ activeCombat.pendingHitAllocation.hits }} hit(s)</span>
      </div>

      <div class="dice-row">
        <div
          v-for="(value, index) in activeCombat.pendingHitAllocation.diceRolls"
          :key="index"
          class="die-container"
          :class="{
            hit: value >= activeCombat.pendingHitAllocation.hitThreshold,
            miss: value < activeCombat.pendingHitAllocation.hitThreshold,
            selected: selectedDieIndex === index,
            allocated: allocatedHits.has(index),
            six: isDieSix(value),
          }"
          @click="selectDie(index)"
        >
          <Die3D
            :sides="6"
            :value="value"
            :die-id="`combat-die-${index}`"
            :roll-count="activeCombat.pendingHitAllocation.rollCount"
            :size="50"
            :color="value >= activeCombat.pendingHitAllocation.hitThreshold ? '#4CAF50' : '#666'"
          />
        </div>
      </div>

      <!-- Allocation instructions -->
      <div v-if="isAllocating && unallocatedHits.length > 0" class="allocation-hint">
        Click a target to allocate {{ unallocatedHits.length }} remaining hit(s)
      </div>

      <!-- Basic's reroll button -->
      <button
        v-if="canReroll"
        class="reroll-button"
        @click="handleReroll"
      >
        🎲 Reroll All Dice (Basic's Ability)
      </button>
    </div>

    <!-- Wolverine's 6s allocation -->
    <div v-if="activeCombat.pendingWolverineSixes" class="wolverine-area">
      <div class="wolverine-info">
        <strong>{{ activeCombat.pendingWolverineSixes.attackerName }}</strong> - Wolverine's Ability!
        <span class="six-count">{{ activeCombat.pendingWolverineSixes.sixCount }} bonus target(s) from 6s</span>
      </div>
      <div class="allocation-hint">
        Click additional targets to allocate Wolverine's bonus hits
      </div>
    </div>
  </div>
</template>

<style scoped>
.combat-panel {
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  border: 2px solid v-bind('UI_COLORS.accent');
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.combat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.combat-header h2 {
  margin: 0;
  color: v-bind('UI_COLORS.accent');
  font-size: 1.3rem;
}

.round-indicator {
  background: v-bind('UI_COLORS.accent');
  color: #1a1a2e;
  padding: 4px 12px;
  border-radius: 12px;
  font-weight: bold;
  font-size: 0.9rem;
}

.battle-area {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.side {
  flex: 1;
  min-width: 0;
}

.side-label {
  margin: 0 0 12px;
  font-size: 1rem;
  text-align: center;
}

.rebel-side .side-label {
  color: #4CAF50;
}

.dictator-side .side-label {
  color: #f44336;
}

.vs-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
}

.vs-text {
  font-size: 2rem;
  font-weight: bold;
  color: v-bind('UI_COLORS.accent');
  text-shadow: 0 0 10px rgba(212, 168, 75, 0.5);
}

.combatants {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.combatant {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  min-width: 80px;
  transition: all 0.2s;
}

.combatant.merc {
  border: 2px solid rgba(100, 181, 246, 0.5);
}

.combatant.militia {
  border: 2px solid rgba(158, 158, 158, 0.3);
}

.combatant.attacking {
  border-color: v-bind('UI_COLORS.accent');
  box-shadow: 0 0 12px rgba(212, 168, 75, 0.4);
}

.combatant.targetable {
  cursor: pointer;
  border-color: #ff6b6b;
}

.combatant.targetable:hover {
  background: rgba(255, 107, 107, 0.2);
  transform: scale(1.05);
}

.combatant.selected {
  box-shadow: 0 0 12px rgba(255, 107, 107, 0.6);
}

.combatant-portrait {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.combatant-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.militia-shield {
  font-size: 1.5rem;
}

.combatant-name {
  font-size: 0.75rem;
  color: #e0e0e0;
  margin-top: 4px;
  text-align: center;
  max-width: 70px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.health-bar {
  width: 100%;
  height: 8px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 4px;
  margin-top: 4px;
  position: relative;
  overflow: hidden;
}

.health-fill {
  height: 100%;
  background: linear-gradient(90deg, #4CAF50, #8BC34A);
  border-radius: 4px;
  transition: width 0.3s;
}

.health-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.allocated-hits {
  font-size: 0.7rem;
  color: #ff6b6b;
  font-weight: bold;
  margin-top: 4px;
}

.dice-area {
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

.dice-row {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
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
  cursor: pointer;
}

.die-container.miss {
  opacity: 0.5;
  border-color: #666;
}

.die-container.selected {
  border-color: v-bind('UI_COLORS.accent');
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

.allocation-hint {
  color: #ff9800;
  font-size: 0.9rem;
  margin-top: 8px;
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

.wolverine-area {
  background: rgba(255, 152, 0, 0.1);
  border: 2px solid #ff9800;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  margin-top: 12px;
}

.wolverine-info {
  color: #ff9800;
  margin-bottom: 8px;
}

.six-count {
  margin-left: 8px;
  font-weight: bold;
}
</style>
