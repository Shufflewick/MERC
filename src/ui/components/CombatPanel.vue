<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { UI_COLORS } from '../colors';
import { useCombatAnimationQueue, type CombatAnimationEvent, type AnimationDisplayState } from '../composables/useCombatAnimationQueue';
import { useDeathAnimationCoordinator } from '../composables/useDeathAnimationCoordinator';
import { useTheatreHealth, type TheatreCombatData } from '../composables/useTheatreHealth';
import { useCombatSequence } from '../composables/useCombatSequence';
import CombatPanelCombatant from './CombatPanelCombatant.vue';
import DiceRollDisplay from './DiceRollDisplay.vue';
import HitAllocationPanel, { type PendingHitAllocation } from './HitAllocationPanel.vue';
import TargetSelectionPanel from './TargetSelectionPanel.vue';
import AttackDogAssignmentPanel, { type AttackDogTarget } from './AttackDogAssignmentPanel.vue';
import RetreatSectorSelection, { type RetreatSector } from './RetreatSectorSelection.vue';

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
    pendingHitAllocation?: PendingHitAllocation;
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
      validTargets: AttackDogTarget[];
    };
    dogAssignments?: Array<[string, any]>;
    animationEvents?: CombatAnimationEvent[];
    combatComplete?: boolean;
  };
  isMyTurn: boolean;
  availableActions: string[];
  sectorName: string;
  isSelectingRetreatSector?: boolean;
  retreatSectorChoices?: RetreatSector[];
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
  (e: 'animating', isAnimating: boolean): void;
  (e: 'combat-finished'): void;
}>();

// =============================================================================
// Composables
// =============================================================================

// Combat animation queue
const {
  isAnimating,
  isFastForward,
  isPreRoll,
  currentEvent,
  eventQueue,
  queuePosition,
  queueEventsFromState,
  fastForward,
  reset: resetAnimations,
} = useCombatAnimationQueue();

// Death animation coordinator
const {
  setCombatAnimationActive,
  triggerDeathByName,
} = useDeathAnimationCoordinator();

// Theatre health model
const {
  displayHealthInitialized,
  deadCombatants,
  initializeDisplayHealth,
  getDisplayHealth,
  applyDisplayDamage,
  findCombatantIdByName,
  resetTheatreState,
} = useTheatreHealth();

// Combat sequence (attacker/target highlighting)
const {
  activeAttackerId,
  showMissShake,
  startAttackSequence,
  clearAttackSequence,
  isCurrentAttacker,
  isCurrentTarget,
  getTargetHits,
  addDisplayedDamage,
  markTargetDead,
  scheduleMissShake,
  getBulletHolePosition,
} = useCombatSequence();

// =============================================================================
// Combat Data Caching
// =============================================================================

const cachedCombatData = ref<typeof props.activeCombat | null>(null);

const displayCombat = computed(() => {
  if (props.activeCombat) {
    return props.activeCombat;
  }
  if (isAnimating.value && cachedCombatData.value) {
    return cachedCombatData.value;
  }
  return null;
});

watch(() => props.activeCombat, (newCombat) => {
  if (newCombat) {
    cachedCombatData.value = JSON.parse(JSON.stringify(newCombat));
  }
}, { deep: true, immediate: true });

watch(isAnimating, (animating) => {
  if (!animating && !props.activeCombat) {
    setTimeout(() => {
      if (!props.activeCombat) {
        cachedCombatData.value = null;
      }
    }, 500);
  }
});

// =============================================================================
// Local State
// =============================================================================

// Track selected targets for target selection phase
const selectedTargets = ref<Set<string>>(new Set());

// Reference to hit allocation panel for calling methods
const hitAllocationRef = ref<InstanceType<typeof HitAllocationPanel> | null>(null);

// Track pending roll event for attack sequence
const pendingRollEvent = ref<AnimationDisplayState | null>(null);

// =============================================================================
// Computed
// =============================================================================

// Get rebels to display
const livingRebels = computed(() => {
  const combat = displayCombat.value;
  if (!combat) return [];
  const allRebels = (combat.rebelCombatants || []).filter((c: any) => c != null);
  const casualties = (combat.rebelCasualties || []).filter((c: any) => c != null);

  if (isAnimating.value) {
    const seen = new Set<string>();
    const combined: any[] = [];
    for (const c of [...allRebels, ...casualties]) {
      const id = c.id || c.sourceElement?.id;
      if (id && !seen.has(id)) {
        seen.add(id);
        combined.push(c);
      }
    }
    return combined;
  }

  const casualtyIds = new Set(casualties.map((c: any) => c.id || c.sourceElement?.id));
  return allRebels.filter((c: any) => !casualtyIds.has(c.id || c.sourceElement?.id));
});

// Get dictator forces to display
const livingDictator = computed(() => {
  const combat = displayCombat.value;
  if (!combat) return [];
  const allDictator = (combat.dictatorCombatants || []).filter((c: any) => c != null);
  const casualties = (combat.dictatorCasualties || []).filter((c: any) => c != null);

  if (isAnimating.value) {
    const seen = new Set<string>();
    const combined: any[] = [];
    for (const c of [...allDictator, ...casualties]) {
      const id = c.id || c.sourceElement?.id;
      if (id && !seen.has(id)) {
        seen.add(id);
        combined.push(c);
      }
    }
    return combined;
  }

  const casualtyIds = new Set(casualties.map((c: any) => c.id || c.sourceElement?.id));
  return allDictator.filter((c: any) => !casualtyIds.has(c.id || c.sourceElement?.id));
});

// Mode checks
const isSelectingTargets = computed(() => {
  return !!props.activeCombat?.pendingTargetSelection && props.isMyTurn;
});

const maxTargets = computed(() => {
  return props.activeCombat?.pendingTargetSelection?.maxTargets ?? 0;
});

const isAllocating = computed(() => {
  return !!props.activeCombat?.pendingHitAllocation && props.isMyTurn;
});

const isAllocatingWolverineSixes = computed(() => {
  return !!props.activeCombat?.pendingWolverineSixes && props.isMyTurn;
});

const isAssigningAttackDog = computed(() => {
  return !!props.activeCombat?.pendingAttackDogSelection && props.isMyTurn;
});

// Dog target names map
const dogTargetNames = computed(() => {
  const nameMap = new Map<string, string>();
  const assignments = props.activeCombat?.dogAssignments || [];
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

// =============================================================================
// Methods
// =============================================================================

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getCombatantDisplay(combatant: any) {
  const isAttackDogUnit = combatant.isAttackDog === true;
  const isMerc = !combatant.isMilitia && !isAttackDogUnit && !!(combatant.combatantId || combatant.isDictator);

  let name = combatant.name;
  if (combatant.isMilitia) {
    name = 'Militia';
  } else if (isAttackDogUnit) {
    name = 'Attack Dog';
  } else if (isMerc) {
    name = capitalize(combatant.name || 'MERC');
  }

  const image = combatant.image || null;
  const defaultMaxHealth = isMerc ? 3 : isAttackDogUnit ? 3 : 1;
  const actualHealth = combatant.health ?? (isAttackDogUnit ? 3 : 1);
  const maxHealth = combatant.maxHealth ?? defaultMaxHealth;

  const combatantId = combatant.id || combatant.sourceElement?.id;
  const health = getDisplayHealth(combatantId, actualHealth, isAnimating.value);

  return {
    id: combatant.id,
    name,
    isMerc,
    isAttackDog: isAttackDogUnit,
    isMilitia: combatant.isMilitia,
    health,
    maxHealth,
    combatantId: combatant.combatantId,
    image,
    isDead: health <= 0,
    playerColor: combatant.playerColor,
  };
}

function findCombatantId(name: string): string | null {
  return findCombatantIdByName(name, displayCombat.value as TheatreCombatData);
}

function isValidTarget(targetId: string): boolean {
  if (isSelectingTargets.value) {
    return props.activeCombat?.pendingTargetSelection?.validTargets.some(t => t.id === targetId) ?? false;
  }
  if (isAllocatingWolverineSixes.value) {
    return props.activeCombat?.pendingWolverineSixes?.bonusTargets.some(t => t.id === targetId) ?? false;
  }
  return props.activeCombat?.pendingHitAllocation?.validTargets.some(t => t.id === targetId) ?? false;
}

function isTargetSelected(targetId: string): boolean {
  return selectedTargets.value.has(targetId);
}

function getAllocatedHitsForTarget(targetId: string): number {
  if (!hitAllocationRef.value) return 0;
  let count = 0;
  hitAllocationRef.value.allocatedHits.forEach((tid: string) => {
    if (tid === targetId) count++;
  });
  return count;
}

function selectTarget(targetId: string) {
  // Handle target selection mode (before rolling)
  if (isSelectingTargets.value) {
    const validTargetIds = props.activeCombat?.pendingTargetSelection?.validTargets.map(t => t.id) ?? [];
    if (!validTargetIds.includes(targetId)) return;

    if (selectedTargets.value.has(targetId)) {
      selectedTargets.value.delete(targetId);
    } else if (selectedTargets.value.size < maxTargets.value) {
      selectedTargets.value.add(targetId);
    }
    selectedTargets.value = new Set(selectedTargets.value);
    return;
  }

  // Handle Wolverine's 6s allocation
  if (isAllocatingWolverineSixes.value) {
    emit('allocate-wolverine-six', targetId);
    return;
  }

  // Handle hit allocation mode
  if (isAllocating.value && hitAllocationRef.value) {
    const validTargetIds = props.activeCombat?.pendingHitAllocation?.validTargets.map(t => t.id) ?? [];
    if (!validTargetIds.includes(targetId)) return;
    hitAllocationRef.value.allocateToTarget(targetId);
  }
}

// =============================================================================
// Watchers
// =============================================================================

// Queue animation events
watch(
  () => props.activeCombat?.animationEvents,
  (events) => {
    if (events && events.length > 0 && !displayHealthInitialized.value) {
      initializeDisplayHealth(events, displayCombat.value as TheatreCombatData);
    }
    queueEventsFromState(events);
  },
  { deep: true, immediate: true, flush: 'sync' }
);

// Coordinate death animations
watch(currentEvent, (event) => {
  if (!event) return;

  if (event.type === 'death' && event.targetName) {
    triggerDeathByName(event.targetName);
  }
});

// Coordinate with death animation system
watch(isAnimating, (animating) => {
  setCombatAnimationActive(animating);
  emit('animating', animating);

  if (!animating) {
    // Reset displayHealthInitialized so the next round's events will trigger initializeDisplayHealth
    displayHealthInitialized.value = false;

    setTimeout(() => {
      const combatEnded = !props.activeCombat || props.activeCombat.combatComplete;
      if (!isAnimating.value && combatEnded) {
        resetTheatreState();
        resetAnimations();
        emit('combat-finished');
      }
    }, 100);
  }
});

// Reset on new combat
watch(() => props.activeCombat?.sectorId, (newSectorId, oldSectorId) => {
  if (newSectorId && newSectorId !== oldSectorId) {
    deadCombatants.value.clear();
    resetTheatreState();
    resetAnimations();
  }
});

// Reset selected targets
watch(() => props.activeCombat?.pendingTargetSelection, () => {
  selectedTargets.value.clear();
}, { immediate: true });

// Watch for attack sequence events
watch(currentEvent, (event, oldEvent) => {
  try {
    const isNewRoll = event?.type === 'roll';
    const isAnimationEnded = !event;
    const isNonAttackEvent = event?.type === 'round-start' || event?.type === 'combat-end';

    if (activeAttackerId.value && (isNewRoll || isAnimationEnded || isNonAttackEvent)) {
      clearAttackSequence();
    }

    if (!event) {
      pendingRollEvent.value = null;
      return;
    }

    if (event.type === 'roll') {
      pendingRollEvent.value = event;
    }

    if (event.type === 'damage' && event.targetName && event.damage) {
      const targetId = event.targetId || findCombatantId(event.targetName);
      if (targetId) {
        addDisplayedDamage(targetId, event.damage);
      }
      applyDisplayDamage(event.targetId || null, event.targetName || null, event.damage, displayCombat.value as TheatreCombatData);
    }

    if (event.type === 'death' && event.targetName) {
      const targetId = findCombatantId(event.targetName);
      if (targetId) {
        markTargetDead(targetId);
      }
    }
  } catch {
    // Silently ignore errors
  }
}, { flush: 'sync' });

// Clear on animation end
watch(isAnimating, (animating) => {
  if (!animating) {
    clearAttackSequence();
    pendingRollEvent.value = null;
  }
});

// Start attack sequence when pre-roll ends
watch(isPreRoll, (preRoll, wasPreRoll) => {
  if (wasPreRoll && !preRoll && pendingRollEvent.value) {
    const rollEvent = pendingRollEvent.value;
    startAttackSequence(rollEvent, eventQueue.value, queuePosition.value, findCombatantId);
    pendingRollEvent.value = null;

    const isMiss = (rollEvent?.hits || 0) === 0;
    if (isMiss) {
      scheduleMissShake();
    }
  }
});

// Cleanup
onUnmounted(() => {
  resetAnimations();
  deadCombatants.value.clear();
});
</script>

<template>
  <div class="combat-panel">
    <!-- Header -->
    <div class="combat-header">
      <h2>Combat - {{ sectorName }}</h2>
      <div class="round-indicator">Round {{ displayCombat?.round ?? 1 }}</div>
    </div>

    <!-- Main battle area -->
    <div class="battle-area">
      <!-- Rebel side -->
      <div class="side rebel-side">
        <h3 class="side-label">Rebels</h3>
        <div class="combatants">
          <CombatPanelCombatant
            v-for="combatant in livingRebels"
            :key="getCombatantDisplay(combatant).id"
            :combatant-id="getCombatantDisplay(combatant).id"
            :name="getCombatantDisplay(combatant).name"
            :image="getCombatantDisplay(combatant).image"
            :player-color="getCombatantDisplay(combatant).playerColor"
            :is-merc="getCombatantDisplay(combatant).isMerc"
            :is-militia="getCombatantDisplay(combatant).isMilitia"
            :is-attack-dog="getCombatantDisplay(combatant).isAttackDog"
            :health="getCombatantDisplay(combatant).health"
            :max-health="getCombatantDisplay(combatant).maxHealth"
            :is-dead="getCombatantDisplay(combatant).isDead"
            :is-attacking="activeCombat?.pendingHitAllocation?.attackerId === getCombatantDisplay(combatant).id"
            :is-targetable="isValidTarget(getCombatantDisplay(combatant).id)"
            :is-selected="hitAllocationRef?.selectedDieIndex !== null && isValidTarget(getCombatantDisplay(combatant).id)"
            :is-target-selected="isSelectingTargets && isTargetSelected(getCombatantDisplay(combatant).id)"
            :is-animating-attacker="isCurrentAttacker(getCombatantDisplay(combatant).id)"
            :is-animating-target="isCurrentTarget(getCombatantDisplay(combatant).id)"
            :attack-missed="isCurrentAttacker(getCombatantDisplay(combatant).id) && showMissShake"
            :is-animating="isAnimating"
            :allocated-hits="getAllocatedHitsForTarget(getCombatantDisplay(combatant).id)"
            :target-hits="getTargetHits(getCombatantDisplay(combatant).id)"
            :dog-target-name="dogTargetNames.get(getCombatantDisplay(combatant).id)"
            :get-bullet-hole-position="getBulletHolePosition"
            @click="selectTarget(getCombatantDisplay(combatant).id)"
          />
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
          <CombatPanelCombatant
            v-for="combatant in livingDictator"
            :key="getCombatantDisplay(combatant).id"
            :combatant-id="getCombatantDisplay(combatant).id"
            :name="getCombatantDisplay(combatant).name"
            :image="getCombatantDisplay(combatant).image"
            :player-color="getCombatantDisplay(combatant).playerColor"
            :is-merc="getCombatantDisplay(combatant).isMerc"
            :is-militia="getCombatantDisplay(combatant).isMilitia"
            :is-attack-dog="getCombatantDisplay(combatant).isAttackDog"
            :health="getCombatantDisplay(combatant).health"
            :max-health="getCombatantDisplay(combatant).maxHealth"
            :is-dead="getCombatantDisplay(combatant).isDead"
            :is-targetable="isValidTarget(getCombatantDisplay(combatant).id)"
            :is-selected="hitAllocationRef?.selectedDieIndex !== null && isValidTarget(getCombatantDisplay(combatant).id)"
            :is-target-selected="isSelectingTargets && isTargetSelected(getCombatantDisplay(combatant).id)"
            :is-animating-attacker="isCurrentAttacker(getCombatantDisplay(combatant).id)"
            :is-animating-target="isCurrentTarget(getCombatantDisplay(combatant).id)"
            :attack-missed="isCurrentAttacker(getCombatantDisplay(combatant).id) && showMissShake"
            :is-animating="isAnimating"
            :allocated-hits="getAllocatedHitsForTarget(getCombatantDisplay(combatant).id)"
            :target-hits="getTargetHits(getCombatantDisplay(combatant).id)"
            :dog-target-name="dogTargetNames.get(getCombatantDisplay(combatant).id)"
            :get-bullet-hole-position="getBulletHolePosition"
            @click="selectTarget(getCombatantDisplay(combatant).id)"
          />
        </div>
      </div>
    </div>

    <!-- Hit allocation panel -->
    <HitAllocationPanel
      v-if="activeCombat?.pendingHitAllocation && !isAnimating"
      ref="hitAllocationRef"
      :pending-allocation="activeCombat.pendingHitAllocation"
      :is-my-turn="isMyTurn"
      @allocate-hit="emit('allocate-hit', $event)"
      @confirm-allocation="emit('confirm-allocation', $event)"
      @reroll="emit('reroll')"
    />

    <!-- Combat animation display -->
    <div v-if="currentEvent && currentEvent.type === 'roll' && !isPreRoll" class="animation-display">
      <div class="attacker-info">
        <strong>{{ currentEvent.attackerName }}</strong> attacks!
        <span class="hit-count">{{ currentEvent.hits ?? 0 }} hit(s)</span>
      </div>

      <DiceRollDisplay
        :dice-rolls="currentEvent.diceRolls || []"
        :hit-threshold="currentEvent.hitThreshold ?? 4"
        :roll-count="1"
      />

      <button
        class="fast-forward-btn"
        :class="{ active: isFastForward }"
        @click="fastForward"
        title="Speed up animations"
      >
        >>
      </button>
    </div>

    <!-- Wolverine's 6s allocation -->
    <div v-if="activeCombat?.pendingWolverineSixes && !isAnimating" class="wolverine-area">
      <div class="wolverine-info">
        <strong>{{ activeCombat.pendingWolverineSixes.attackerName }}</strong> - Wolverine's Ability!
        <span class="six-count">{{ activeCombat.pendingWolverineSixes.sixCount }} bonus target(s) from 6s</span>
      </div>
      <div class="allocation-hint">
        Click additional targets to allocate Wolverine's bonus hits
      </div>
    </div>

    <!-- Attack Dog assignment -->
    <AttackDogAssignmentPanel
      v-if="isAssigningAttackDog && !isAnimating"
      :attacker-name="activeCombat?.pendingAttackDogSelection?.attackerName ?? ''"
      :valid-targets="activeCombat?.pendingAttackDogSelection?.validTargets ?? []"
      @assign="emit('assign-attack-dog', $event)"
    />

    <!-- Target selection -->
    <TargetSelectionPanel
      v-if="isSelectingTargets && !isAnimating"
      :attacker-name="activeCombat?.pendingTargetSelection?.attackerName ?? ''"
      :max-targets="maxTargets"
      :selected-count="selectedTargets.size"
      @confirm-targets="emit('confirm-targets', Array.from(selectedTargets))"
    />

    <!-- Combat actions -->
    <div
      v-if="!isAllocating && !isSelectingTargets && !isAllocatingWolverineSixes && !isAssigningAttackDog && !isSelectingRetreatSector && isMyTurn && !isAnimating"
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

    <!-- Retreat sector selection -->
    <RetreatSectorSelection
      v-if="isSelectingRetreatSector && retreatSectorChoices && retreatSectorChoices.length > 0"
      :sectors="retreatSectorChoices"
      @select="emit('select-retreat-sector', $event)"
    />
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

.animation-display {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  border: 2px solid rgba(76, 175, 80, 0.5);
  position: relative;
  margin-top: 12px;
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

.fast-forward-btn {
  position: absolute;
  bottom: 8px;
  right: 8px;
  padding: 6px 12px;
  background: linear-gradient(135deg, #555 0%, #333 100%);
  border: 1px solid #666;
  border-radius: 4px;
  color: #ccc;
  font-size: 0.9rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.fast-forward-btn:hover {
  background: linear-gradient(135deg, #666 0%, #444 100%);
  color: #fff;
}

.fast-forward-btn.active {
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
  border-color: #ff9800;
  color: #fff;
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

.allocation-hint {
  color: #ff9800;
  font-size: 0.9rem;
}

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
</style>
