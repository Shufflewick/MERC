<script setup lang="ts">
import { computed, ref, watch, onUnmounted, onMounted } from 'vue';
import { UI_COLORS } from '../colors';
import { useAnimationEvents } from 'boardsmith/ui';
import type { AnimationEvent } from 'boardsmith';
import { useDeathAnimationCoordinator } from '../composables/useDeathAnimationCoordinator';
import { useTheatreHealth, type TheatreCombatData } from '../composables/useTheatreHealth';
import { useCombatSequence } from '../composables/useCombatSequence';
import CombatPanelCombatant from './CombatPanelCombatant.vue';
import DiceRollDisplay from './DiceRollDisplay.vue';
import HitAllocationPanel, { type PendingHitAllocation } from './HitAllocationPanel.vue';
import TargetSelectionPanel from './TargetSelectionPanel.vue';
import AttackDogAssignmentPanel, { type AttackDogTarget } from './AttackDogAssignmentPanel.vue';
import RetreatSectorSelection, { type RetreatSector } from './RetreatSectorSelection.vue';

// Animation display state for UI
interface AnimationDisplayState {
  type: string;
  attackerName?: string;
  attackerId?: string;
  attackerImage?: string;
  targetName?: string;
  targetId?: string;
  targetImage?: string;
  targetNames?: string[];
  targetIds?: string[];
  diceRolls?: number[];
  hits?: number;
  hitThreshold?: number;
  damage?: number;
  round?: number;
  rebelVictory?: boolean;
  dictatorVictory?: boolean;
}

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
    combatComplete?: boolean;
  } | null;
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
// Animation Events (BoardSmith v2.4 Animation Event System)
// =============================================================================

// Animation timing constants
const TIMING = {
  PRE_ROLL_DELAY: 400,
  ROLL_DURATION: 1500,
  POST_ROLL_DELAY: 1000, // Time to display dice results after animation
  DAMAGE_DURATION: 800,
  DEATH_DURATION: 1000,
  PAUSE_BETWEEN: 400,
  COMBAT_END_DELAY: 1500,
  // Fast-forward speeds
  FAST_PRE_ROLL: 50,
  FAST_ROLL: 100,
  FAST_POST_ROLL: 100,
  FAST_DAMAGE: 50,
  FAST_DEATH: 100,
  FAST_PAUSE: 25,
  FAST_COMBAT_END: 200,
};

// Local display state
const currentEvent = ref<AnimationDisplayState | null>(null);
const isPreRoll = ref(false);
const isFastForward = ref(false);

// Use BoardSmith's animation events (injected by GameTable)
const animationEvents = useAnimationEvents();
const isAnimating = computed(() => animationEvents?.isAnimating.value ?? false);

// Helper to get timing based on fast-forward state
function getTiming(type: 'pre-roll' | 'roll' | 'post-roll' | 'damage' | 'death' | 'pause' | 'combat-end'): number {
  if (isFastForward.value) {
    switch (type) {
      case 'pre-roll': return TIMING.FAST_PRE_ROLL;
      case 'roll': return TIMING.FAST_ROLL;
      case 'post-roll': return TIMING.FAST_POST_ROLL;
      case 'damage': return TIMING.FAST_DAMAGE;
      case 'death': return TIMING.FAST_DEATH;
      case 'pause': return TIMING.FAST_PAUSE;
      case 'combat-end': return TIMING.FAST_COMBAT_END;
    }
  }
  switch (type) {
    case 'pre-roll': return TIMING.PRE_ROLL_DELAY;
    case 'roll': return TIMING.ROLL_DURATION;
    case 'post-roll': return TIMING.POST_ROLL_DELAY;
    case 'damage': return TIMING.DAMAGE_DURATION;
    case 'death': return TIMING.DEATH_DURATION;
    case 'pause': return TIMING.PAUSE_BETWEEN;
    case 'combat-end': return TIMING.COMBAT_END_DELAY;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Map BoardSmith AnimationEvent to our display state
function mapEventToDisplayState(event: AnimationEvent): AnimationDisplayState {
  const data = event.data as Record<string, unknown>;
  return {
    type: event.type.replace('combat-', ''), // 'combat-roll' -> 'roll'
    attackerName: data.attackerName as string | undefined,
    attackerId: data.attackerId as string | undefined,
    attackerImage: data.attackerImage as string | undefined,
    targetName: data.targetName as string | undefined,
    targetId: data.targetId as string | undefined,
    targetImage: data.targetImage as string | undefined,
    targetNames: data.targetNames as string[] | undefined,
    targetIds: data.targetIds as string[] | undefined,
    diceRolls: data.diceRolls as number[] | undefined,
    hits: data.hits as number | undefined,
    hitThreshold: data.hitThreshold as number | undefined,
    damage: data.damage as number | undefined,
    round: data.round as number | undefined,
    rebelVictory: data.rebelVictory as boolean | undefined,
    dictatorVictory: data.dictatorVictory as boolean | undefined,
  };
}

// Register animation event handlers
onMounted(() => {
  if (!animationEvents) {
    console.warn('[CombatPanel] No animation events context - animations will not play');
    return;
  }

  // Roll event handler
  animationEvents.registerHandler('combat-roll', async (event) => {
    isPreRoll.value = true;
    currentEvent.value = mapEventToDisplayState(event);
    await sleep(getTiming('pre-roll'));
    isPreRoll.value = false;
    await sleep(getTiming('roll'));
    await sleep(getTiming('post-roll')); // Keep dice results visible for 1 second
  });

  // Damage event handler
  animationEvents.registerHandler('combat-damage', async (event) => {
    currentEvent.value = mapEventToDisplayState(event);
    await sleep(getTiming('damage'));
    await sleep(getTiming('pause'));
  });

  // Death event handler
  animationEvents.registerHandler('combat-death', async (event) => {
    currentEvent.value = mapEventToDisplayState(event);
    await sleep(getTiming('death'));
    await sleep(getTiming('pause'));
  });

  // Round start handler
  animationEvents.registerHandler('combat-round-start', async (event) => {
    currentEvent.value = mapEventToDisplayState(event);
    await sleep(getTiming('pause'));
  });

  // Combat end handler
  animationEvents.registerHandler('combat-end', async (event) => {
    currentEvent.value = mapEventToDisplayState(event);
    sawCombatEndEvent.value = true;
    await sleep(getTiming('combat-end'));
  });
});

// Fast forward function
function fastForward(): void {
  isFastForward.value = true;
}

// Reset for new combat
function resetAnimations(): void {
  currentEvent.value = null;
  isPreRoll.value = false;
  isFastForward.value = false;
}

function resetForNewCombat(): void {
  resetAnimations();
}

// =============================================================================
// Composables
// =============================================================================

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
  // Use cached data when activeCombat is cleared during animations
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

// Initialize display health when combat starts or current event changes
// Animation events are now handled by BoardSmith's useAnimationEvents system
watch(currentEvent, (event) => {
  if (!event) return;

  // Initialize display health on first event
  if (!displayHealthInitialized.value && displayCombat.value) {
    // Create a minimal events array for initialization
    initializeDisplayHealth([{ type: event.type }] as any, displayCombat.value as TheatreCombatData);
  }

  // Coordinate death animations
  if (event.type === 'death' && event.targetName) {
    triggerDeathByName(event.targetName);
  }
});

// =============================================================================
// Combat Panel State Machine
// =============================================================================
// States: IDLE | ANIMATING | WAITING_FOR_INPUT | COMPLETE
//
// Transitions:
//   IDLE → ANIMATING: Animation events playing
//   ANIMATING → WAITING_FOR_INPUT: Animations done, combatComplete is false
//   ANIMATING → COMPLETE: Animations done AND (combatComplete is true OR saw combat-end event)
//   WAITING_FOR_INPUT → ANIMATING: New events arrive
//   COMPLETE → (emit combat-finished, panel closes)
//
// This is event-driven - BoardSmith's useAnimationEvents handles the queue.

type CombatPanelState = 'IDLE' | 'ANIMATING' | 'WAITING_FOR_INPUT' | 'COMPLETE';
const panelState = ref<CombatPanelState>('IDLE');

// Track if we've seen a combat-end event (definitive signal that combat is over)
// This is set by the combat-end handler in onMounted
const sawCombatEndEvent = ref(false);

// Derive state from current conditions
function computeNextState(): CombatPanelState {
  const animationsPlaying = isAnimating.value;
  const hasPendingEvents = (animationEvents?.pendingCount.value ?? 0) > 0;
  const combatComplete = props.activeCombat?.combatComplete === true;

  // If we're playing animations
  if (animationsPlaying || hasPendingEvents) {
    return 'ANIMATING';
  }

  // Combat is ONLY complete when we have definitive evidence:
  // 1. combatComplete flag is true, OR
  // 2. We've seen a combat-end event in the queue
  // NOT just because activeCombat became null (game might clear it prematurely)
  if (combatComplete || sawCombatEndEvent.value) {
    return 'COMPLETE';
  }

  // Waiting for more events or user input
  return 'WAITING_FOR_INPUT';
}

// Handle state transitions
function transitionState() {
  const newState = computeNextState();
  const oldState = panelState.value;

  if (newState !== oldState) {
    console.log(`[CombatPanel] State: ${oldState} → ${newState}`, {
      combatComplete: props.activeCombat?.combatComplete,
      activeCombatExists: props.activeCombat !== null,
      isAnimating: isAnimating.value,
      pendingCount: animationEvents?.pendingCount.value ?? 0,
    });

    panelState.value = newState;

    // Handle state entry actions
    if (newState === 'COMPLETE') {
      console.log('[CombatPanel] CLOSING PANEL (state machine)');
      resetTheatreState();
      resetAnimations();
      emit('combat-finished');
    }
  }
}

// Coordinate with death animation system
watch(isAnimating, (animating) => {
  setCombatAnimationActive(animating);
  emit('animating', animating);

  if (!animating) {
    // Reset displayHealthInitialized so the next round's events will trigger initializeDisplayHealth
    displayHealthInitialized.value = false;
  }

  // Trigger state transition check
  transitionState();
});

// Also check state when combatComplete changes
watch(() => props.activeCombat?.combatComplete, () => {
  transitionState();
});

// Also check state when activeCombat becomes null
watch(() => props.activeCombat, (newVal, oldVal) => {
  if (oldVal && !newVal) {
    console.log('[CombatPanel] activeCombat became null', {
      isAnimating: isAnimating.value,
      sawCombatEndEvent: sawCombatEndEvent.value,
    });
    // Don't force close here - let the state machine handle it based on sawCombatEndEvent
    transitionState();
  }
});

// Reset on new combat
watch(() => props.activeCombat?.sectorId, (newSectorId, oldSectorId) => {
  if (newSectorId && newSectorId !== oldSectorId) {
    deadCombatants.value.clear();
    resetTheatreState();
    resetForNewCombat();
    sawCombatEndEvent.value = false;
    panelState.value = 'IDLE';
    console.log('[CombatPanel] Reset for new combat in sector:', newSectorId);
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
    startAttackSequence(rollEvent, findCombatantId);
    pendingRollEvent.value = null;

    const isMiss = (rollEvent?.hits || 0) === 0;
    if (isMiss) {
      scheduleMissShake();
    }
  }
});

// Cleanup
onUnmounted(() => {
  resetForNewCombat();  // Full cleanup on unmount
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
