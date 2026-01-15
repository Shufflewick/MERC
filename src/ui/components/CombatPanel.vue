<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Die3D } from '@boardsmith/ui';
import { UI_COLORS } from '../colors';
import CombatantIcon from './CombatantIcon.vue';
import SectorCardChoice from './SectorCardChoice.vue';

const props = defineProps<{
  activeCombat: {
    sectorId: string;
    round: number;
    rebelCombatants: any[];
    dictatorCombatants: any[];
    rebelCasualties: any[];
    dictatorCasualties: any[];
    pendingTargetSelection?: {
      attackerId: string;
      attackerName: string;
      validTargets: Array<{
        id: string;
        name: string;
        isMerc?: boolean;
        isMilitia?: boolean;
        health: number;
        maxHealth?: number;
      }>;
      maxTargets: number;
    };
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
    pendingAttackDogSelection?: {
      attackerId: string;
      attackerName: string;
      validTargets: Array<{
        id: string;
        name: string;
        isMerc: boolean;
        health: number;
        maxHealth: number;
      }>;
    };
    // MERC-l09: Attack Dog assignments - [targetId, dog]
    dogAssignments?: Array<[string, any]>;
  };
  isMyTurn: boolean;
  availableActions: string[];
  sectorName: string;
  isSelectingRetreatSector?: boolean;
  retreatSectorChoices?: Array<{
    id: string | number;
    sectorName: string;
    sectorType: string;
    image: string;
    value: number;
    weaponLoot: number;
    armorLoot: number;
    accessoryLoot: number;
    dictatorMilitia: number;
  }>;
}>();

const emit = defineEmits<{
  (e: 'allocate-hit', targetId: string): void;
  (e: 'allocate-wolverine-six', targetId: string): void;
  (e: 'reroll'): void;
  (e: 'confirm-allocation', allocations: string[]): void;
  (e: 'confirm-targets', targets: string[]): void;
  (e: 'continue-combat'): void;
  (e: 'retreat-combat'): void;
  (e: 'select-retreat-sector', sectorId: string): void;
  (e: 'assign-attack-dog', targetId: string): void;
}>();

// Track which dice have been allocated to which targets
const allocatedHits = ref<Map<number, string>>(new Map()); // dieIndex -> targetId

// Track selected targets for target selection phase
const selectedTargets = ref<Set<string>>(new Set());

// Get living rebels (not in casualties)
const livingRebels = computed(() => {
  const casualtyIds = new Set(
    (props.activeCombat.rebelCasualties || [])
      .filter((c: any) => c != null)
      .map((c: any) => c.id || c.sourceElement?.id)
  );
  return (props.activeCombat.rebelCombatants || [])
    .filter((c: any) => c != null)
    .filter((c: any) => !casualtyIds.has(c.id || c.sourceElement?.id));
});

// Get living dictator forces
const livingDictator = computed(() => {
  const casualtyIds = new Set(
    (props.activeCombat.dictatorCasualties || [])
      .filter((c: any) => c != null)
      .map((c: any) => c.id || c.sourceElement?.id)
  );
  return (props.activeCombat.dictatorCombatants || [])
    .filter((c: any) => c != null)
    .filter((c: any) => !casualtyIds.has(c.id || c.sourceElement?.id));
});

// Check if we're in target selection mode
const isSelectingTargets = computed(() => {
  return !!props.activeCombat.pendingTargetSelection && props.isMyTurn;
});

// Get max targets allowed for target selection
const maxTargets = computed(() => {
  return props.activeCombat.pendingTargetSelection?.maxTargets ?? 0;
});

// Check if we're in hit allocation mode
const isAllocating = computed(() => {
  return !!props.activeCombat.pendingHitAllocation && props.isMyTurn;
});

// Check if we're allocating Wolverine's 6s
const isAllocatingWolverineSixes = computed(() => {
  return !!props.activeCombat.pendingWolverineSixes && props.isMyTurn;
});

// Check if we're assigning an Attack Dog
const isAssigningAttackDog = computed(() => {
  return !!props.activeCombat.pendingAttackDogSelection && props.isMyTurn;
});

// MERC-l09: Get dog target names - maps dogId -> targetName
const dogTargetNames = computed(() => {
  const nameMap = new Map<string, string>();
  const assignments = props.activeCombat.dogAssignments || [];

  // assignments is Array<[targetId, dog]>
  // We need to find the target's name from the combatants
  const allCombatants = [...livingRebels.value, ...livingDictator.value];

  for (const [targetId, dog] of assignments) {
    const target = allCombatants.find((c: any) => (c.id || c.sourceElement?.id) === targetId);
    if (target && dog) {
      const dogId = dog.id || dog.sourceElement?.id;
      const targetName = target.name || 'Unknown';
      nameMap.set(dogId, targetName);
    }
  }
  return nameMap;
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

// Auto-select first unallocated die when hit allocation becomes active
watch(isAllocating, (active) => {
  if (active) {
    // Clear any previous allocations
    allocatedHits.value.clear();
    // Auto-select first successful die
    const firstDie = successfulDice.value[0];
    selectedDieIndex.value = firstDie?.index ?? null;
  } else {
    selectedDieIndex.value = null;
  }
}, { immediate: true });

// Handle clicking a die
function selectDie(dieIndex: number) {
  if (!isAllocating.value) return;
  const die = successfulDice.value.find(d => d.index === dieIndex);
  if (!die || allocatedHits.value.has(dieIndex)) return;
  selectedDieIndex.value = dieIndex;
}

// Build allocation strings from current allocatedHits
function buildAllocations(): string[] {
  const hitCountByTarget = new Map<string, number>();
  allocatedHits.value.forEach((targetId) => {
    hitCountByTarget.set(targetId, (hitCountByTarget.get(targetId) ?? 0) + 1);
  });

  // Build allocation strings in format "targetId::hitIndex"
  const allocations: string[] = [];
  const hitIndexByTarget = new Map<string, number>();
  allocatedHits.value.forEach((targetId) => {
    const hitIndex = hitIndexByTarget.get(targetId) ?? 0;
    allocations.push(`${targetId}::${hitIndex}`);
    hitIndexByTarget.set(targetId, hitIndex + 1);
  });
  return allocations;
}

// Handle clicking a target
function selectTarget(targetId: string) {
  // Handle target selection mode (before rolling)
  if (isSelectingTargets.value) {
    const validTargetIds = props.activeCombat.pendingTargetSelection?.validTargets.map(t => t.id) ?? [];
    if (!validTargetIds.includes(targetId)) return;

    // Toggle selection
    if (selectedTargets.value.has(targetId)) {
      selectedTargets.value.delete(targetId);
    } else if (selectedTargets.value.size < maxTargets.value) {
      selectedTargets.value.add(targetId);
    }
    // Force reactivity update
    selectedTargets.value = new Set(selectedTargets.value);
    return;
  }

  // Handle Wolverine's 6s allocation
  if (isAllocatingWolverineSixes.value) {
    emit('allocate-wolverine-six', targetId);
    return;
  }

  // Handle hit allocation mode (after rolling)
  if (!isAllocating.value || selectedDieIndex.value === null) return;

  // Check if this is a valid target
  const validTargetIds = props.activeCombat.pendingHitAllocation?.validTargets.map(t => t.id) ?? [];
  if (!validTargetIds.includes(targetId)) return;

  // Allocate the selected die to this target
  allocatedHits.value.set(selectedDieIndex.value, targetId);
  emit('allocate-hit', targetId);

  // Auto-select next unallocated die
  const nextUnallocated = successfulDice.value.find(d => !allocatedHits.value.has(d.index));
  selectedDieIndex.value = nextUnallocated?.index ?? null;

  // Note: User must click "Confirm" button to execute the action
}

// Check if a target is selected (for target selection mode)
function isTargetSelected(targetId: string): boolean {
  return selectedTargets.value.has(targetId);
}

// Handle reroll button
function handleReroll() {
  if (!canReroll.value) return;
  allocatedHits.value.clear();
  selectedDieIndex.value = null;
  emit('reroll');
}

// Get display info for a combatant
function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getCombatantDisplay(combatant: any) {
  const isAttackDog = combatant.isAttackDog === true;
  const isMerc = !combatant.isMilitia && !isAttackDog && (combatant.combatantId || combatant.mercId || combatant.isDictator);

  // Get name - capitalize it
  let name = combatant.name;
  if (combatant.isMilitia) {
    name = 'Militia';
  } else if (isAttackDog) {
    name = 'Attack Dog';
  } else if (isMerc) {
    name = capitalize(combatant.name || 'MERC');
  }

  // Get image directly from combatant (populated from JSON data in combat.ts)
  const image = combatant.image || null;

  // Attack dogs have 3 health like MERCs
  const defaultMaxHealth = isMerc ? 3 : isAttackDog ? 3 : 1;

  return {
    id: combatant.id,
    name,
    isMerc,
    isAttackDog,
    health: combatant.health ?? (isAttackDog ? 3 : 1),
    maxHealth: combatant.maxHealth ?? defaultMaxHealth,
    mercId: combatant.combatantId || combatant.mercId, // backward compat
    image,
    isDead: (combatant.health ?? 1) <= 0,
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

// Check if target is valid for allocation or selection
function isValidTarget(targetId: string): boolean {
  // Target selection mode (before rolling)
  if (isSelectingTargets.value) {
    return props.activeCombat.pendingTargetSelection?.validTargets.some(t => t.id === targetId) ?? false;
  }
  // Wolverine 6s allocation
  if (isAllocatingWolverineSixes.value) {
    return props.activeCombat.pendingWolverineSixes?.bonusTargets.some(t => t.id === targetId) ?? false;
  }
  // Normal hit allocation
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

// Reset selected targets when pendingTargetSelection changes
watch(() => props.activeCombat.pendingTargetSelection, () => {
  selectedTargets.value.clear();
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
              militia: !getCombatantDisplay(combatant).isMerc && !getCombatantDisplay(combatant).isAttackDog,
              'attack-dog': getCombatantDisplay(combatant).isAttackDog,
              attacking: activeCombat.pendingHitAllocation?.attackerId === getCombatantDisplay(combatant).id,
              targetable: isValidTarget(getCombatantDisplay(combatant).id),
              selected: selectedDieIndex !== null && isValidTarget(getCombatantDisplay(combatant).id),
              'target-selected': isSelectingTargets && isTargetSelected(getCombatantDisplay(combatant).id),
            }"
            @click="selectTarget(getCombatantDisplay(combatant).id)"
          >
            <CombatantIcon
              :image="combatant.image"
              :combatant-id="combatant.combatantId || combatant.mercId"
              :combatant-name="getCombatantDisplay(combatant).name"
              :player-color="combatant.playerColor"
              :is-militia="combatant.isMilitia"
              :is-attack-dog="combatant.isAttackDog"
              size="small"
            />
            <div class="health-bar">
              <div
                class="health-fill"
                :style="{ width: `${(getCombatantDisplay(combatant).health / getCombatantDisplay(combatant).maxHealth) * 100}%` }"
              ></div>
              <span class="health-text">
                {{ getCombatantDisplay(combatant).health }}/{{ getCombatantDisplay(combatant).maxHealth }}
              </span>
            </div>
            <!-- MERC-l09: Show dog's target -->
            <div v-if="getCombatantDisplay(combatant).isAttackDog && dogTargetNames.get(getCombatantDisplay(combatant).id)" class="dog-target-info">
              Targeting: {{ dogTargetNames.get(getCombatantDisplay(combatant).id) }}
            </div>
            <!-- Show allocated hits -->
            <div v-if="getAllocatedHitsForTarget(getCombatantDisplay(combatant).id) > 0" class="allocated-hits">
              +{{ getAllocatedHitsForTarget(getCombatantDisplay(combatant).id) }} hit(s)
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
              militia: !getCombatantDisplay(combatant).isMerc && !getCombatantDisplay(combatant).isAttackDog,
              'attack-dog': getCombatantDisplay(combatant).isAttackDog,
              targetable: isValidTarget(getCombatantDisplay(combatant).id),
              selected: selectedDieIndex !== null && isValidTarget(getCombatantDisplay(combatant).id),
              'target-selected': isSelectingTargets && isTargetSelected(getCombatantDisplay(combatant).id),
            }"
            @click="selectTarget(getCombatantDisplay(combatant).id)"
          >
            <CombatantIcon
              :image="combatant.image"
              :combatant-id="combatant.combatantId || combatant.mercId"
              :combatant-name="getCombatantDisplay(combatant).name"
              :player-color="combatant.playerColor"
              :is-militia="combatant.isMilitia"
              :is-attack-dog="combatant.isAttackDog"
              size="small"
            />
            <div class="health-bar">
              <div
                class="health-fill"
                :style="{ width: `${(getCombatantDisplay(combatant).health / getCombatantDisplay(combatant).maxHealth) * 100}%` }"
              ></div>
              <span class="health-text">
                {{ getCombatantDisplay(combatant).health }}/{{ getCombatantDisplay(combatant).maxHealth }}
              </span>
            </div>
            <!-- MERC-l09: Show dog's target -->
            <div v-if="getCombatantDisplay(combatant).isAttackDog && dogTargetNames.get(getCombatantDisplay(combatant).id)" class="dog-target-info">
              Targeting: {{ dogTargetNames.get(getCombatantDisplay(combatant).id) }}
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
        Click a die, then click a target to allocate {{ unallocatedHits.length }} remaining hit(s)
      </div>

      <!-- Confirm button when all hits allocated -->
      <button
        v-if="isAllocating && unallocatedHits.length === 0"
        class="confirm-button"
        @click="emit('confirm-allocation', buildAllocations())"
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

    <!-- Attack Dog assignment -->
    <div v-if="isAssigningAttackDog" class="attack-dog-area">
      <div class="attack-dog-info">
        <strong>{{ activeCombat.pendingAttackDogSelection?.attackerName }}</strong> - Attack Dog!
        <span class="dog-hint">Assign the dog to an enemy MERC</span>
      </div>
      <div class="attack-dog-targets">
        <button
          v-for="target in activeCombat.pendingAttackDogSelection?.validTargets"
          :key="target.id"
          class="attack-dog-target-btn"
          @click="emit('assign-attack-dog', target.id)"
        >
          {{ target.name }}
        </button>
      </div>
    </div>

    <!-- Target selection area (before rolling) -->
    <div v-if="isSelectingTargets" class="target-selection-area">
      <div class="target-selection-info">
        <strong>{{ activeCombat.pendingTargetSelection?.attackerName }}</strong> is attacking!
        <span class="target-count">Select up to {{ maxTargets }} target(s)</span>
      </div>
      <div class="target-selection-hint">
        Click enemies above to select targets ({{ selectedTargets.size }}/{{ maxTargets }} selected)
      </div>

      <!-- Confirm button when at least one target selected -->
      <button
        v-if="selectedTargets.size > 0"
        class="confirm-targets-button"
        @click="emit('confirm-targets', Array.from(selectedTargets))"
      >
        Confirm {{ selectedTargets.size }} Target{{ selectedTargets.size > 1 ? 's' : '' }}
      </button>
    </div>

    <!-- Combat actions - Continue/Retreat (when not in any allocation mode and not selecting retreat sector) -->
    <div
      v-if="!isAllocating && !isSelectingTargets && !isAllocatingWolverineSixes && !isAssigningAttackDog && !isSelectingRetreatSector && isMyTurn"
      class="combat-actions"
    >
      <button
        v-if="availableActions.includes('combatContinue')"
        class="combat-continue-btn"
        @click="emit('continue-combat')"
      >
        Continue Fighting
      </button>
      <button
        v-if="availableActions.includes('combatRetreat')"
        class="combat-retreat-btn"
        @click="emit('retreat-combat')"
      >
        Retreat
      </button>
    </div>

    <!-- Retreat sector selection (shown after clicking Retreat button) -->
    <div v-if="isSelectingRetreatSector && retreatSectorChoices && retreatSectorChoices.length > 0" class="retreat-sector-selection">
      <div class="retreat-selection-header">
        <strong>Retreat to which sector?</strong>
      </div>
      <div class="sector-card-choices">
        <SectorCardChoice
          v-for="sector in retreatSectorChoices"
          :key="sector.id"
          :sector="sector"
          size="compact"
          @click="emit('select-retreat-sector', sector.id)"
        />
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
  position: relative;
}

/* Allow clicks to pass through CombatantIcon to parent combatant div */
.combatant :deep(.combatant-icon) {
  pointer-events: none;
}

.combatant.merc {
  border: 2px solid rgba(100, 181, 246, 0.5);
}

.combatant.militia {
  border: 2px solid rgba(158, 158, 158, 0.3);
}

.combatant.attack-dog {
  border: 2px solid rgba(139, 90, 43, 0.5);
  background: rgba(139, 90, 43, 0.1);
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

/* MERC-l09: Dog target display */
.dog-target-info {
  font-size: 0.65rem;
  color: #D2691E;
  font-weight: bold;
  margin-top: 2px;
  background: rgba(139, 69, 19, 0.2);
  padding: 2px 4px;
  border-radius: 3px;
  width: 100%;
  text-align: center;
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

/* Target selection area */
.target-selection-area {
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

/* Selected target in target selection mode */
.combatant.target-selected {
  border-color: #4CAF50 !important;
  box-shadow: 0 0 12px rgba(76, 175, 80, 0.6), inset 0 0 8px rgba(76, 175, 80, 0.3);
  background: rgba(76, 175, 80, 0.2);
}

.combatant.target-selected::after {
  content: '✓';
  position: absolute;
  top: -8px;
  right: -8px;
  background: #4CAF50;
  color: white;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: bold;
}

/* Combat action buttons - Continue/Retreat */
.combat-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.combat-continue-btn {
  padding: 12px 24px;
  background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.combat-continue-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
}

.combat-retreat-btn {
  padding: 12px 24px;
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.combat-retreat-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(255, 152, 0, 0.4);
}

/* Attack Dog assignment */
.attack-dog-area {
  background: rgba(139, 69, 19, 0.2);
  border: 2px solid #8B4513;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  margin-top: 12px;
}

.attack-dog-info {
  color: #D2691E;
  margin-bottom: 12px;
}

.dog-hint {
  margin-left: 8px;
  font-size: 0.9rem;
  opacity: 0.8;
}

.attack-dog-targets {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}

.attack-dog-target-btn {
  padding: 12px 20px;
  background: linear-gradient(135deg, #8B4513 0%, #A0522D 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 100px;
}

.attack-dog-target-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(139, 69, 19, 0.4);
}

/* Retreat sector selection */
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
