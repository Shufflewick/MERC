<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { UI_COLORS } from '../colors';
import { useAnimationEvents } from 'boardsmith/ui';
import type { AnimationEvent } from 'boardsmith';
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
  // Attack Dog animation
  dogId?: string;
  dogImage?: string;
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
    pendingBeforeAttackHealing?: {
      attackerId: string;
      attackerName: string;
      availableHealers: Array<{
        healerId: string;
        healerName: string;
        itemName: string;
      }>;
      damagedAllies: Array<{
        id: string;
        name: string;
        damage: number;
      }>;
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
  (e: 'select-retreat-sector', sectorId: string | number): void;
  (e: 'assign-attack-dog', targetId: string): void;
  (e: 'combat-finished'): void;
  (e: 'panel-ready'): void;
  (e: 'use-medical-kit'): void;
  (e: 'use-surgeon-heal'): void;
  (e: 'use-before-attack-heal'): void;
  (e: 'skip-before-attack-heal'): void;
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
  ATTACK_DOG_DURATION: 1500, // Time to show Attack Dog assignment animation
  HEAL_DURATION: 1500, // Time to show healing animation
  // Fast-forward speeds
  FAST_PRE_ROLL: 50,
  FAST_ROLL: 100,
  FAST_POST_ROLL: 100,
  FAST_DAMAGE: 50,
  FAST_DEATH: 100,
  FAST_PAUSE: 25,
  FAST_COMBAT_END: 200,
  FAST_ATTACK_DOG: 200,
  FAST_HEAL: 200,
};

// Local display state
const currentEvent = ref<AnimationDisplayState | null>(null);
const isPreRoll = ref(false);
const isFastForward = ref(false);
const combatSnapshot = ref<Record<string, unknown> | null>(null);
const healthOverrides = ref<Map<string, number>>(new Map());

// Use BoardSmith's animation events (injected by GameTable)
const animationEvents = useAnimationEvents();
const isAnimating = computed(() => animationEvents?.isAnimating.value ?? false);


// Track combatants currently being healed (for UI visual effect)
const healingCombatants = ref<Set<string>>(new Set());

// Helper to get timing based on fast-forward state
function getTiming(type: 'pre-roll' | 'roll' | 'post-roll' | 'damage' | 'death' | 'pause' | 'combat-end' | 'attack-dog' | 'heal'): number {
  if (isFastForward.value) {
    switch (type) {
      case 'pre-roll': return TIMING.FAST_PRE_ROLL;
      case 'roll': return TIMING.FAST_ROLL;
      case 'post-roll': return TIMING.FAST_POST_ROLL;
      case 'damage': return TIMING.FAST_DAMAGE;
      case 'death': return TIMING.FAST_DEATH;
      case 'pause': return TIMING.FAST_PAUSE;
      case 'combat-end': return TIMING.FAST_COMBAT_END;
      case 'attack-dog': return TIMING.FAST_ATTACK_DOG;
      case 'heal': return TIMING.FAST_HEAL;
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
    case 'attack-dog': return TIMING.ATTACK_DOG_DURATION;
    case 'heal': return TIMING.HEAL_DURATION;
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
    dogId: data.dogId as string | undefined,
    dogImage: data.dogImage as string | undefined,
  };
}

// =============================================================================
// Animation Event Handler Registration
// =============================================================================
// IMPORTANT: Register handlers synchronously in setup scope, NOT in onMounted().
// BoardSmith's useAnimationEvents watcher has { immediate: true }, so events
// may be processed when App.vue mounts, BEFORE CombatPanel's onMounted runs.
// By registering here, handlers exist before any reactive effects process events.

if (animationEvents) {
  // Snapshot handler — authoritative combatant data at each decision point
  animationEvents.registerHandler('combat-panel', async (event) => {
    combatSnapshot.value = event.data as Record<string, unknown>;
    healthOverrides.value.clear(); // Snapshot health is authoritative at decision points
  });

  // Roll event handler
  animationEvents.registerHandler('combat-roll', async (event) => {
    isPreRoll.value = true;
    currentEvent.value = mapEventToDisplayState(event);
    await sleep(getTiming('pre-roll'));
    isPreRoll.value = false;
    await sleep(getTiming('roll'));
    await sleep(getTiming('post-roll')); // Keep dice results visible for 1 second
  });

  // Damage event handler — healthAfter is always present (Phase 43 SRV-03)
  animationEvents.registerHandler('combat-damage', async (event) => {
    currentEvent.value = mapEventToDisplayState(event);
    const data = event.data as Record<string, unknown>;
    const targetId = normalizeId(data.targetId);
    const healthAfter = typeof data.healthAfter === 'number'
      ? data.healthAfter
      : undefined;
    if (targetId && typeof healthAfter === 'number') {
      healthOverrides.value.set(targetId, healthAfter);
    }
    await sleep(getTiming('damage'));
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

  // Attack Dog assignment handler
  animationEvents.registerHandler('combat-attack-dog', async (event) => {
    currentEvent.value = mapEventToDisplayState(event);
    await sleep(getTiming('attack-dog'));
    currentEvent.value = null; // Explicitly clear after display
  });

  // Healing event handler — update healthOverrides + track UI effect
  animationEvents.registerHandler('combat-heal', async (event) => {
    currentEvent.value = mapEventToDisplayState(event);

    const data = event.data as Record<string, unknown>;
    const targetId = normalizeId(data.targetId);
    if (targetId) {
      healingCombatants.value.add(targetId);
      const healthAfter = typeof data.healthAfter === 'number' ? data.healthAfter : undefined;
      if (typeof healthAfter === 'number') {
        healthOverrides.value.set(targetId, healthAfter);
      }
    }

    await sleep(getTiming('heal'));

    if (targetId) {
      healingCombatants.value.delete(targetId);
    }
    currentEvent.value = null;
    await sleep(getTiming('pause'));
  });
}

onMounted(() => {
  emit('panel-ready');
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
  healthOverrides.value.clear();
}

function resetForNewCombat(): void {
  resetAnimations();
}

// =============================================================================
// Composables
// =============================================================================

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
// Helper Functions
// =============================================================================

/**
 * Find combatant ID by name (case-insensitive).
 * Reads from snapshot combatants which have plain name/id fields.
 */
function findCombatantIdByName(name: string): string | null {
  if (!name) return null;
  const lowerName = name.toLowerCase();

  const allCombatants = [...livingRebels.value, ...livingDictator.value];

  for (const c of allCombatants) {
    if (!c) continue;
    const cName = (String(c.name ?? '')).toLowerCase();
    if (cName === lowerName || cName.includes(lowerName) || lowerName.includes(cName)) {
      return String(c.id ?? '') || null;
    }
  }
  return null;
}

// =============================================================================
// Combat Display — snapshot-driven rendering
// =============================================================================

const displayCombat = computed(() => combatSnapshot.value);

watch(() => props.activeCombat, (newCombat, oldCombat) => {
  if (newCombat && !oldCombat) {
    // Combat starting — reset UI state
    resetAnimations();
    healingCombatants.value.clear();
    combatSnapshot.value = null;
  }
}, { immediate: true });


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

// Get rebels to display — combine combatants + casualties from snapshot, dedup
const livingRebels = computed(() => {
  const snapshot = combatSnapshot.value;
  if (!snapshot) return [];
  const combatants = (snapshot.rebelCombatants as any[]) || [];
  const casualties = (snapshot.rebelCasualties as any[]) || [];
  const seen = new Set<string>();
  const combined: any[] = [];
  for (const c of [...combatants, ...casualties]) {
    const id = String(c?.id ?? '');
    if (id && !seen.has(id)) {
      seen.add(id);
      combined.push(c);
    }
  }
  return combined;
});

// Get dictator forces to display — combine combatants + casualties from snapshot, dedup
const livingDictator = computed(() => {
  const snapshot = combatSnapshot.value;
  if (!snapshot) return [];
  const combatants = (snapshot.dictatorCombatants as any[]) || [];
  const casualties = (snapshot.dictatorCasualties as any[]) || [];
  const seen = new Set<string>();
  const combined: any[] = [];
  for (const c of [...combatants, ...casualties]) {
    const id = String(c?.id ?? '');
    if (id && !seen.has(id)) {
      seen.add(id);
      combined.push(c);
    }
  }
  return combined;
});

// Snapshot decision context computed helpers — used in script and template
const snapshotTargetSelection = computed(() => combatSnapshot.value?.pendingTargetSelection as any);
const snapshotHitAllocation = computed(() => combatSnapshot.value?.pendingHitAllocation as PendingHitAllocation | null);
const snapshotWolverineSixes = computed(() => combatSnapshot.value?.pendingWolverineSixes as any);
const snapshotAttackDogSelection = computed(() => combatSnapshot.value?.pendingAttackDogSelection as any);
const snapshotBeforeAttackHealing = computed(() => combatSnapshot.value?.pendingBeforeAttackHealing as any);

// Mode checks
const isSelectingTargets = computed(() => {
  return !!snapshotTargetSelection.value && props.isMyTurn;
});

const maxTargets = computed(() => {
  return snapshotTargetSelection.value?.maxTargets ?? 0;
});

const isAllocating = computed(() => {
  return !!snapshotHitAllocation.value && props.isMyTurn;
});

const isAllocatingWolverineSixes = computed(() => {
  return !!snapshotWolverineSixes.value && props.isMyTurn;
});

const isAssigningAttackDog = computed(() => {
  return !!snapshotAttackDogSelection.value && props.isMyTurn;
});

const isHealingBeforeAttack = computed(() => {
  return !!snapshotBeforeAttackHealing.value && props.isMyTurn;
});

// Dog target names map — reads directly from snapshot combatant fields
const dogTargetNames = computed(() => {
  const nameMap = new Map<string, string>();
  const allCombatants = [...livingRebels.value, ...livingDictator.value];
  for (const c of allCombatants) {
    if (!c?.isAttackDog) continue;
    const dogId = String(c.id ?? '');
    if (!dogId) continue;
    if (c.attackDogPendingTarget) {
      nameMap.set(dogId, 'Selecting...');
    } else if (c.attackDogTargetName) {
      nameMap.set(dogId, c.attackDogTargetName);
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

function normalizeId(id: unknown): string | null {
  if (id === null || id === undefined) return null;
  return String(id);
}

function getCombatantId(combatant: any): string | null {
  const rawId =
    combatant?.id ||
    combatant?.sourceElement?.id ||
    combatant?.__elementRef ||
    combatant?.attributes?.id ||
    null;
  return normalizeId(rawId);
}

function getCombatantDisplay(combatant: any) {
  const id = String(combatant.id ?? '');
  const health = healthOverrides.value.get(id) ?? (combatant.health as number);
  const maxHealth = combatant.maxHealth as number;

  return {
    id,
    name: combatant.name as string,
    isMerc: combatant.isMerc as boolean,
    isAttackDog: combatant.isAttackDog as boolean,
    isMilitia: combatant.isMilitia as boolean,
    health,
    maxHealth,
    combatantId: (combatant.combatantId as string) || '',
    image: combatant.image as string | undefined,
    isDead: health <= 0,
    playerColor: combatant.playerColor as string | undefined,
    attackDogTargetName: combatant.attackDogTargetName as string | undefined,
    attackDogPendingTarget: combatant.attackDogPendingTarget as boolean | undefined,
  };
}

function findCombatantId(name: string): string | null {
  return findCombatantIdByName(name);
}

function isValidTarget(targetId: string): boolean {
  const normalized = normalizeId(targetId);
  if (!normalized) return false;
  if (isSelectingTargets.value) {
    return snapshotTargetSelection.value?.validTargets?.some((t: any) => normalizeId(t.id) === normalized) ?? false;
  }
  if (isAllocatingWolverineSixes.value) {
    return snapshotWolverineSixes.value?.bonusTargets?.some((t: any) => normalizeId(t.id) === normalized) ?? false;
  }
  return snapshotHitAllocation.value?.validTargets?.some((t: any) => normalizeId(t.id) === normalized) ?? false;
}

function isTargetSelected(targetId: string): boolean {
  const normalized = normalizeId(targetId);
  if (!normalized) return false;
  return selectedTargets.value.has(normalized);
}

function getAllocatedHitsForTarget(targetId: string): number {
  if (!hitAllocationRef.value) return 0;
  const normalized = normalizeId(targetId);
  if (!normalized) return 0;
  let count = 0;
  hitAllocationRef.value.allocatedHits.forEach((tid: string) => {
    if (normalizeId(tid) === normalized) count++;
  });
  return count;
}

function isHealingCombatant(combatantId: string): boolean {
  const normalized = normalizeId(combatantId);
  if (!normalized) return false;
  return healingCombatants.value.has(normalized);
}

function selectTarget(targetId: string) {
  const normalized = normalizeId(targetId);
  if (!normalized) return;
  // Handle target selection mode (before rolling)
  if (isSelectingTargets.value) {
    const validTargetIds = (snapshotTargetSelection.value?.validTargets ?? [])
      .map((t: any) => normalizeId(t.id))
      .filter((id: string | null): id is string => !!id);
    if (!validTargetIds.includes(normalized)) return;

    if (selectedTargets.value.has(normalized)) {
      selectedTargets.value.delete(normalized);
    } else if (selectedTargets.value.size < maxTargets.value) {
      selectedTargets.value.add(normalized);
    }
    selectedTargets.value = new Set(selectedTargets.value);
    return;
  }

  // Handle Wolverine's 6s allocation
  if (isAllocatingWolverineSixes.value) {
    emit('allocate-wolverine-six', normalized);
    return;
  }

  // Handle hit allocation mode - clicking adds a hit
  if (isAllocating.value && hitAllocationRef.value) {
    const validTargetIds = (snapshotHitAllocation.value?.validTargets ?? [])
      .map((t: any) => normalizeId(t.id))
      .filter((id: string | null): id is string => !!id);
    if (!validTargetIds.includes(normalized)) return;
    hitAllocationRef.value.addHitToTarget(normalized);
  }
}

function addHitToTarget(targetId: string) {
  if (!isAllocating.value || !hitAllocationRef.value) return;
  const normalized = normalizeId(targetId);
  if (!normalized) return;
  const validTargetIds = (snapshotHitAllocation.value?.validTargets ?? [])
    .map((t: any) => normalizeId(t.id))
    .filter((id: string | null): id is string => !!id);
  if (!validTargetIds.includes(normalized)) return;
  hitAllocationRef.value.addHitToTarget(normalized);
}

function removeHitFromTarget(targetId: string) {
  if (!isAllocating.value || !hitAllocationRef.value) return;
  const normalized = normalizeId(targetId);
  if (!normalized) return;
  hitAllocationRef.value.removeHitFromTarget(normalized);
}

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
// This is set by the combat-end handler
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
    panelState.value = newState;

    // Handle state entry actions
    if (newState === 'COMPLETE') {
      healingCombatants.value.clear();
      resetAnimations();
      emit('combat-finished');
    }
  }
}

// Watch animation activity to drive state machine transitions
watch([isAnimating, () => animationEvents?.pendingCount.value ?? 0], () => {
  transitionState();
});

// Also check state when combatComplete changes
watch(() => props.activeCombat?.combatComplete, () => {
  transitionState();
});

// Also check state when activeCombat becomes null
watch(() => props.activeCombat, (newVal, oldVal) => {
  if (oldVal && !newVal) {
    // Don't force close here - let the state machine handle it based on sawCombatEndEvent
    transitionState();
  }
});

// Reset on new combat
watch(() => props.activeCombat?.sectorId, (newSectorId, oldSectorId) => {
  if (newSectorId && newSectorId !== oldSectorId) {
    healingCombatants.value.clear();
    resetForNewCombat();
    sawCombatEndEvent.value = false;
    panelState.value = 'IDLE';
  }
});

// Reset selected targets when snapshot target selection changes
watch(() => combatSnapshot.value?.pendingTargetSelection, () => {
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
      // Display health is now updated in the combat-damage event handler via healthAfter
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
    // Clear the current event display when animations finish
    // This prevents dice/attack displays from persisting while waiting for user input
    // Attack-dog events are cleared by their handler after display duration
    if (currentEvent.value?.type !== 'attack-dog') {
      currentEvent.value = null;
    }
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
  resetForNewCombat();
  healingCombatants.value.clear();
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
            :is-attacking="snapshotHitAllocation?.attackerId === getCombatantDisplay(combatant).id"
            :is-targetable="isValidTarget(getCombatantDisplay(combatant).id)"
            :is-selected="hitAllocationRef?.selectedDieIndex !== null && isValidTarget(getCombatantDisplay(combatant).id)"
            :is-target-selected="isSelectingTargets && isTargetSelected(getCombatantDisplay(combatant).id)"
            :is-animating-attacker="isCurrentAttacker(getCombatantDisplay(combatant).id)"
            :is-animating-target="isCurrentTarget(getCombatantDisplay(combatant).id)"
            :attack-missed="isCurrentAttacker(getCombatantDisplay(combatant).id) && showMissShake"
            :is-animating="isAnimating"
            :is-healing="isHealingCombatant(getCombatantDisplay(combatant).id)"
            :allocated-hits="getAllocatedHitsForTarget(getCombatantDisplay(combatant).id)"
            :target-hits="getTargetHits(getCombatantDisplay(combatant).id)"
            :show-hit-controls="isAllocating"
            :dog-target-name="getCombatantDisplay(combatant).attackDogTargetName ||
                              (getCombatantDisplay(combatant).attackDogPendingTarget ? 'Selecting...' : dogTargetNames.get(getCombatantDisplay(combatant).id))"
            :get-bullet-hole-position="getBulletHolePosition"
            @click="selectTarget(getCombatantDisplay(combatant).id)"
            @add-hit="addHitToTarget(getCombatantDisplay(combatant).id)"
            @remove-hit="removeHitFromTarget(getCombatantDisplay(combatant).id)"
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
            :is-healing="isHealingCombatant(getCombatantDisplay(combatant).id)"
            :allocated-hits="getAllocatedHitsForTarget(getCombatantDisplay(combatant).id)"
            :target-hits="getTargetHits(getCombatantDisplay(combatant).id)"
            :show-hit-controls="isAllocating"
            :dog-target-name="getCombatantDisplay(combatant).attackDogTargetName ||
                              (getCombatantDisplay(combatant).attackDogPendingTarget ? 'Selecting...' : dogTargetNames.get(getCombatantDisplay(combatant).id))"
            :get-bullet-hole-position="getBulletHolePosition"
            @click="selectTarget(getCombatantDisplay(combatant).id)"
            @add-hit="addHitToTarget(getCombatantDisplay(combatant).id)"
            @remove-hit="removeHitFromTarget(getCombatantDisplay(combatant).id)"
          />
        </div>
      </div>
    </div>

    <!-- Hit allocation panel -->
    <HitAllocationPanel
      v-if="snapshotHitAllocation && !isAnimating"
      ref="hitAllocationRef"
      :pending-allocation="snapshotHitAllocation"
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

    <!-- Attack Dog assignment animation -->
    <div v-if="currentEvent && currentEvent.type === 'attack-dog'" class="animation-display attack-dog-animation">
      <div class="attack-dog-header">
        <img
          v-if="currentEvent.dogImage"
          :src="currentEvent.dogImage"
          alt="Attack Dog"
          class="attack-dog-icon"
        />
        <div class="attack-dog-text">
          <strong>{{ currentEvent.attackerName }}</strong> releases Attack Dog!
        </div>
      </div>
      <div class="attack-dog-target">
        <span class="target-arrow">→</span>
        <span class="target-name">Targeting: <strong>{{ currentEvent.targetName }}</strong></span>
      </div>
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
    <div v-if="snapshotWolverineSixes && !isAnimating" class="wolverine-area">
      <div class="wolverine-info">
        <strong>{{ snapshotWolverineSixes?.attackerName }}</strong> - Wolverine's Ability!
        <span class="six-count">{{ snapshotWolverineSixes?.sixCount }} bonus target(s) from 6s</span>
      </div>
      <div class="allocation-hint">
        Click additional targets to allocate Wolverine's bonus hits
      </div>
    </div>

    <!-- Attack Dog assignment -->
    <AttackDogAssignmentPanel
      v-if="isAssigningAttackDog && !isAnimating"
      :attacker-name="snapshotAttackDogSelection?.attackerName ?? ''"
      :valid-targets="snapshotAttackDogSelection?.validTargets ?? []"
      @assign="emit('assign-attack-dog', $event)"
    />

    <!-- Before-attack healing phase -->
    <div v-if="isHealingBeforeAttack && !isAnimating" class="healing-phase-panel">
      <div class="healing-header">
        <strong>{{ snapshotBeforeAttackHealing?.attackerName }}</strong>'s Turn - Healing Phase
      </div>
      <div class="healing-hint">
        Use Medical Kit/First Aid Kit to heal an ally before attacking
      </div>
      <div class="healing-options">
        <div class="healers-available">
          <span class="label">Available healers:</span>
          <span v-for="healer in snapshotBeforeAttackHealing?.availableHealers"
                :key="healer.healerId" class="healer-badge">
            {{ healer.healerName }} ({{ healer.itemName }})
          </span>
        </div>
        <div class="damaged-allies">
          <span class="label">Can heal:</span>
          <span v-for="ally in snapshotBeforeAttackHealing?.damagedAllies"
                :key="ally.id" class="ally-badge">
            {{ ally.name }} ({{ ally.damage }} damage)
          </span>
        </div>
      </div>
      <div class="healing-actions">
        <button class="healing-use-btn" @click="emit('use-before-attack-heal')">
          Use Healing Item
        </button>
        <button class="healing-skip-btn" @click="emit('skip-before-attack-heal')">
          Skip Healing
        </button>
      </div>
    </div>

    <!-- Target selection -->
    <TargetSelectionPanel
      v-if="isSelectingTargets && !isAnimating"
      :attacker-name="snapshotTargetSelection?.attackerName ?? ''"
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
        v-if="availableActions.includes('combatHeal')"
        class="combat-heal-btn"
        @click="emit('use-medical-kit')"
      >
        Use Medical Kit
      </button>
      <button
        v-if="availableActions.includes('combatSurgeonHeal')"
        class="combat-heal-btn"
        @click="emit('use-surgeon-heal')"
      >
        Surgeon's Heal
      </button>
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

/* Attack Dog Animation Styles */
.attack-dog-animation {
  border-color: rgba(139, 90, 43, 0.8);
  background: rgba(139, 69, 19, 0.2);
}

.attack-dog-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 12px;
}

.attack-dog-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid #D2691E;
  object-fit: cover;
}

.attack-dog-text {
  color: v-bind('UI_COLORS.text');
  font-size: 1.1rem;
}

.attack-dog-target {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255, 107, 107, 0.2);
  border-radius: 4px;
  margin-bottom: 8px;
}

.target-arrow {
  font-size: 1.5rem;
  color: #ff6b6b;
  animation: pulse-arrow 0.8s ease-in-out infinite;
}

@keyframes pulse-arrow {
  0%, 100% { opacity: 0.6; transform: translateX(0); }
  50% { opacity: 1; transform: translateX(4px); }
}

.target-name {
  color: #ff6b6b;
  font-size: 1rem;
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

.combat-heal-btn {
  padding: 12px 24px;
  background: linear-gradient(135deg, #4fc3f7 0%, #0288d1 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.combat-heal-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(79, 195, 247, 0.4);
}

/* Before-attack healing phase panel */
.healing-phase-panel {
  background: rgba(79, 195, 247, 0.1);
  border: 2px solid #4fc3f7;
  border-radius: 8px;
  padding: 16px;
  margin-top: 12px;
  text-align: center;
}

.healing-header {
  color: #4fc3f7;
  font-size: 1.1rem;
  margin-bottom: 8px;
}

.healing-hint {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
  margin-bottom: 12px;
}

.healing-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
}

.healers-available, .damaged-allies {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.healing-options .label {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.85rem;
}

.healer-badge, .ally-badge {
  background: rgba(79, 195, 247, 0.2);
  border: 1px solid rgba(79, 195, 247, 0.4);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
}

.ally-badge {
  background: rgba(244, 67, 54, 0.2);
  border-color: rgba(244, 67, 54, 0.4);
}

.healing-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}

.healing-use-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #4fc3f7 0%, #0288d1 100%);
  border: none;
  border-radius: 6px;
  color: white;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.healing-use-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(79, 195, 247, 0.4);
}

.healing-skip-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #666 0%, #444 100%);
  border: none;
  border-radius: 6px;
  color: white;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.healing-skip-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
</style>
