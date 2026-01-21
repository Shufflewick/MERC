<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { Die3D } from 'boardsmith/ui';
import { UI_COLORS } from '../colors';
import CombatantIcon from './CombatantIcon.vue';
import SectorCardChoice from './SectorCardChoice.vue';
import { useCombatAnimationQueue } from '../composables/useCombatAnimationQueue';
import { useDeathAnimationCoordinator } from '../composables/useDeathAnimationCoordinator';

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
    // Combat animation events for UI to display
    animationEvents?: Array<{
      type: 'roll' | 'damage' | 'death' | 'round-start' | 'combat-end';
      timestamp: number;
      attackerName?: string;
      attackerId?: string;
      attackerImage?: string;
      targetName?: string;
      targetId?: string;
      targetImage?: string;
      diceRolls?: number[];
      hits?: number;
      hitThreshold?: number;
      damage?: number;
      round?: number;
      rebelVictory?: boolean;
      dictatorVictory?: boolean;
    }>;
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
  (e: 'animating', isAnimating: boolean): void;
  (e: 'combat-finished'): void;  // Emitted ONLY when animations done AND combat marked complete
}>();

// Combat animation queue
const {
  isAnimating,
  isFastForward,
  isPreRoll,
  currentEvent,
  currentPhase,  // DEBUG: current animation phase
  eventQueue,
  queuePosition,
  queueEventsFromState,
  fastForward,
  skipAll,
  reset: resetAnimations,
} = useCombatAnimationQueue();

// Death animation coordinator - coordinates with MapGrid
const {
  setCombatAnimationActive,
  triggerDeathByName,
} = useDeathAnimationCoordinator();

// =============================================================================
// Combat Data Caching
// =============================================================================
// Cache combat data so panel stays visible until animations complete.
// Without this, the panel disappears when activeCombat becomes null.

const cachedCombatData = ref<typeof props.activeCombat | null>(null);

// The combat data to actually use for display
const displayCombat = computed(() => {
  // If we have active combat from props, use it and update cache
  if (props.activeCombat) {
    return props.activeCombat;
  }
  // If props.activeCombat is null but we're still animating, use cached data
  if (isAnimating.value && cachedCombatData.value) {
    return cachedCombatData.value;
  }
  // No combat data available
  return null;
});

// Update cache when we get new combat data
watch(() => props.activeCombat, (newCombat) => {
  if (newCombat) {
    // Deep copy the combat data so we have a snapshot
    cachedCombatData.value = JSON.parse(JSON.stringify(newCombat));
  }
}, { deep: true, immediate: true });

// Clear cache when animations complete and there's no active combat
watch(isAnimating, (animating) => {
  if (!animating && !props.activeCombat) {
    // Delay clearing cache slightly to let final state render
    setTimeout(() => {
      if (!props.activeCombat) {
        cachedCombatData.value = null;
      }
    }, 500);
  }
});

// Track which dice have been allocated to which targets
const allocatedHits = ref<Map<number, string>>(new Map()); // dieIndex -> targetId

// Track selected targets for target selection phase
const selectedTargets = ref<Set<string>>(new Set());

// =============================================================================
// Theatre Model: Display Health
// =============================================================================
// The CombatPanel acts as "theatre" - it replays combat for the user's benefit.
// Everyone participating in combat starts ALIVE. Deaths/damage are shown as
// animation events play, not based on the actual game state.
//
// displayHealth tracks health as it should appear in the theatre:
// - When events arrive, compute starting health (current + sum of damage events)
// - As damage events play, decrement displayHealth
// - isDead checks displayHealth, not actual health

// Map from combatant ID to their display health (what the theatre shows)
const displayHealth = ref<Map<string, number>>(new Map());

// Track whether display health has been initialized for current animation sequence
const displayHealthInitialized = ref(false);

// Track combatants who have DIED during this combat - once dead, always dead
// This persists across animation sequences until combat ends entirely
const deadCombatants = ref<Set<string>>(new Set());

/**
 * Compute the starting health for a combatant by working backwards:
 * starting_health = current_health + sum(all_damage_to_this_combatant)
 */
function computeStartingHealth(
  combatant: any,
  events: CombatAnimationEvent[]
): number {
  const combatantId = combatant.id || combatant.sourceElement?.id;
  const combatantName = (combatant.name || '').toLowerCase();
  const currentHealth = combatant.health ?? (combatant.isMerc ? 3 : 1);

  console.debug(`[CombatPanel:Health] computeStartingHealth: combatantId=${combatantId}, name=${combatantName}, currentHealth=${currentHealth}`);

  // Sum up all damage events that target this combatant
  let totalDamage = 0;
  for (const event of events) {
    if (event.type !== 'damage' || !event.damage) continue;

    // Match by ID first, then by name
    const targetId = event.targetId;
    const targetName = (event.targetName || '').toLowerCase();

    if (targetId === combatantId ||
        targetName === combatantName ||
        targetName.includes(combatantName) ||
        combatantName.includes(targetName)) {
      totalDamage += event.damage;
      console.debug(`[CombatPanel:Health]   - found damage event: targetId=${targetId}, targetName=${targetName}, damage=${event.damage}, runningTotal=${totalDamage}`);
    }
  }

  const startingHealth = currentHealth + totalDamage;
  console.debug(`[CombatPanel:Health]   => startingHealth = ${currentHealth} + ${totalDamage} = ${startingHealth}`);

  // Starting health = current health + all damage that will be dealt
  return startingHealth;
}

/**
 * Initialize display health for all combatants at the start of animation.
 * This computes what their health was BEFORE any animation events played.
 * IMPORTANT: Combatants who have already died stay dead (health = 0).
 */
function initializeDisplayHealth(events: CombatAnimationEvent[]): void {
  console.debug(`[CombatPanel:Health] initializeDisplayHealth called with ${events?.length ?? 0} events`);

  if (!events || events.length === 0) {
    console.debug(`[CombatPanel:Health]   => returning early: no events`);
    return;
  }

  const combat = displayCombat.value;
  if (!combat) {
    console.debug(`[CombatPanel:Health]   => returning early: no displayCombat`);
    return;
  }

  console.debug(`[CombatPanel:Health]   clearing displayHealth map and rebuilding...`);
  displayHealth.value.clear();

  // Build a set of casualty IDs - these combatants are dead in game state
  const casualtyIds = new Set<string>();
  for (const c of [...(combat.rebelCasualties || []), ...(combat.dictatorCasualties || [])]) {
    if (c) {
      const id = c.id || c.sourceElement?.id;
      if (id) casualtyIds.add(id);
    }
  }

  // Gather all combatants including casualties
  const allCombatants = [
    ...(combat.rebelCombatants || []),
    ...(combat.dictatorCombatants || []),
    ...(combat.rebelCasualties || []),
    ...(combat.dictatorCasualties || []),
  ].filter(c => c != null);

  for (const combatant of allCombatants) {
    const id = combatant.id || combatant.sourceElement?.id;
    if (!id) continue;

    // If this combatant has already died (in our tracking OR in casualties), they stay at 0
    if (deadCombatants.value.has(id) || casualtyIds.has(id)) {
      displayHealth.value.set(id, 0);
      deadCombatants.value.add(id); // Ensure they're tracked as dead
      console.debug(`[CombatPanel:Health]   set displayHealth[${id}] = 0 (already dead: inDeadSet=${deadCombatants.value.has(id)}, inCasualties=${casualtyIds.has(id)})`);
      continue;
    }

    const startingHealth = computeStartingHealth(combatant, events);
    displayHealth.value.set(id, startingHealth);
    console.debug(`[CombatPanel:Health]   set displayHealth[${id}] = ${startingHealth} (prop health: ${combatant.health})`);
  }

  displayHealthInitialized.value = true;
  console.debug(`[CombatPanel:Health] initializeDisplayHealth COMPLETE. displayHealthInitialized=${displayHealthInitialized.value}, map size=${displayHealth.value.size}`);
}

/**
 * Get the display health for a combatant (what the theatre shows).
 * Falls back to actual health if not initialized.
 * IMPORTANT: Dead combatants always return 0.
 */
function getDisplayHealth(combatantId: string, actualHealth: number): number {
  // If combatant has died during this combat, they stay at 0
  if (deadCombatants.value.has(combatantId)) {
    return 0;
  }

  if (!displayHealthInitialized.value || !isAnimating.value) {
    return actualHealth;
  }

  const mapValue = displayHealth.value.get(combatantId);
  return mapValue ?? actualHealth;
}

/**
 * Apply damage to display health when a damage event plays.
 * If health reaches 0, add to deadCombatants so they stay dead.
 */
function applyDisplayDamage(targetId: string | null, targetName: string | null, damage: number): void {
  console.debug(`[CombatPanel:Health] applyDisplayDamage: targetId=${targetId}, targetName=${targetName}, damage=${damage}`);

  if (!targetId && !targetName) {
    console.debug(`[CombatPanel:Health]   => returning early: no target identifier`);
    return;
  }

  // Find the combatant ID
  let combatantId = targetId;
  if (!combatantId && targetName) {
    combatantId = findCombatantId(targetName);
    console.debug(`[CombatPanel:Health]   looked up combatantId by name: ${combatantId}`);
  }

  if (!combatantId) {
    console.debug(`[CombatPanel:Health]   => returning early: could not resolve combatantId`);
    return;
  }

  const current = displayHealth.value.get(combatantId);
  console.debug(`[CombatPanel:Health]   current displayHealth[${combatantId}] = ${current}`);

  if (current !== undefined) {
    const newHealth = Math.max(0, current - damage);
    displayHealth.value.set(combatantId, newHealth);
    console.debug(`[CombatPanel:Health]   => updated displayHealth[${combatantId}]: ${current} - ${damage} = ${newHealth}`);

    // If health reached 0, mark as permanently dead for this combat
    if (newHealth <= 0) {
      deadCombatants.value.add(combatantId);
      console.debug(`[CombatPanel:Health]   => marked ${combatantId} as dead`);
    }
  } else {
    console.debug(`[CombatPanel:Health]   => combatantId ${combatantId} not in displayHealth map!`);
  }
}

// Import type for animation events
type CombatAnimationEvent = NonNullable<typeof props.activeCombat>['animationEvents'] extends (infer T)[] | undefined ? T : never;

// Watch currentEvent to coordinate death animations with MapGrid
watch(currentEvent, (event) => {
  if (!event) return;

  // Trigger the MapGrid death animation when death events play
  if (event.type === 'death' && event.targetName) {
    triggerDeathByName(event.targetName);
  }
});

// Coordinate with death animation system - tell MapGrid when we're animating
watch(isAnimating, (animating) => {
  setCombatAnimationActive(animating);
});

/**
 * Find combatant ID by name (case-insensitive).
 */
function findCombatantIdByName(name: string): string | null {
  if (!name) return null;
  const lowerName = name.toLowerCase();

  const allCombatants = [
    ...(props.activeCombat?.rebelCombatants || []),
    ...(props.activeCombat?.dictatorCombatants || []),
  ];

  for (const c of allCombatants) {
    if (!c) continue;
    const cName = (c.name || '').toLowerCase();
    if (cName === lowerName || cName.includes(lowerName) || lowerName.includes(cName)) {
      return c.id || c.sourceElement?.id || null;
    }
  }
  return null;
}

// Get rebels to display
// While animating: show ALL combatants INCLUDING casualties (so they're visible during death animation)
// When not animating: filter out casualties
const livingRebels = computed(() => {
  const combat = displayCombat.value;
  if (!combat) return [];
  const allRebels = (combat.rebelCombatants || []).filter((c: any) => c != null);
  const casualties = (combat.rebelCasualties || []).filter((c: any) => c != null);

  // While animating, show all combatants including those that will die
  if (isAnimating.value) {
    // Merge combatants and casualties, avoiding duplicates
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

  // When not animating, filter out casualties
  const casualtyIds = new Set(casualties.map((c: any) => c.id || c.sourceElement?.id));
  return allRebels.filter((c: any) => !casualtyIds.has(c.id || c.sourceElement?.id));
});

// Get dictator forces to display
// While animating: show ALL combatants INCLUDING casualties (so they're visible during death animation)
// When not animating: filter out casualties
const livingDictator = computed(() => {
  const combat = displayCombat.value;
  if (!combat) return [];
  const allDictator = (combat.dictatorCombatants || []).filter((c: any) => c != null);
  const casualties = (combat.dictatorCasualties || []).filter((c: any) => c != null);

  // While animating, show all combatants including those that will die
  if (isAnimating.value) {
    // Merge combatants and casualties, avoiding duplicates
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

  // When not animating, filter out casualties
  const casualtyIds = new Set(casualties.map((c: any) => c.id || c.sourceElement?.id));
  return allDictator.filter((c: any) => !casualtyIds.has(c.id || c.sourceElement?.id));
});

// Check if we're in target selection mode
const isSelectingTargets = computed(() => {
  return !!props.activeCombat?.pendingTargetSelection && props.isMyTurn;
});

// Get max targets allowed for target selection
const maxTargets = computed(() => {
  return props.activeCombat?.pendingTargetSelection?.maxTargets ?? 0;
});

// Check if we're in hit allocation mode
const isAllocating = computed(() => {
  return !!props.activeCombat?.pendingHitAllocation && props.isMyTurn;
});

// Check if we're allocating Wolverine's 6s
const isAllocatingWolverineSixes = computed(() => {
  return !!props.activeCombat?.pendingWolverineSixes && props.isMyTurn;
});

// Check if we're assigning an Attack Dog
const isAssigningAttackDog = computed(() => {
  return !!props.activeCombat?.pendingAttackDogSelection && props.isMyTurn;
});

// Queue animation events whenever combat state changes
// Use flush: 'sync' to capture events immediately before Vue batches clears
watch(
  () => props.activeCombat?.animationEvents,
  (events) => {
    console.debug(`[CombatPanel:Health] animationEvents watcher: ${events?.length ?? 0} events, displayHealthInitialized=${displayHealthInitialized.value}`);
    // DEBUG: Log the raw events structure
    if (events && events.length > 0) {
      console.debug(`[CombatPanel:Health]   raw events:`, JSON.stringify(events.map(e => ({
        type: e.type,
        targetId: e.targetId,
        targetName: e.targetName,
        damage: e.damage,
        attackerName: e.attackerName
      })), null, 2));
    }

    // Initialize display health when new events arrive (Theatre model)
    // Only initialize if we haven't yet - subsequent event batches use same display state
    if (events && events.length > 0 && !displayHealthInitialized.value) {
      console.debug(`[CombatPanel:Health]   => will initialize display health`);
      initializeDisplayHealth(events as CombatAnimationEvent[]);
    } else if (events && events.length > 0 && displayHealthInitialized.value) {
      console.debug(`[CombatPanel:Health]   => SKIPPING initialization (already initialized)`);
    }

    // Queue any new events from the game state
    queueEventsFromState(events);
  },
  { deep: true, immediate: true, flush: 'sync' }
);

// Reset animations and dead tracking when combat ends
onUnmounted(() => {
  resetAnimations();
  deadCombatants.value.clear();
});

// When combat data changes significantly (new combat starts), clear dead tracking and reset animations
watch(() => props.activeCombat?.sectorId, (newSectorId, oldSectorId) => {
  // If sector changes, it's a new combat - clear state for fresh start
  if (newSectorId && newSectorId !== oldSectorId) {
    console.debug(`[CombatPanel:Health] New combat detected (sector ${oldSectorId} → ${newSectorId}), resetting all state`);
    deadCombatants.value.clear();
    displayHealthInitialized.value = false;
    displayHealth.value.clear();
    resetAnimations(); // Clear queuedEventIds so new events aren't filtered as duplicates
  }
});

// Emit animation state changes to parent so it can keep panel mounted
// Only reset theatre state when combat is ACTUALLY complete (not just between event batches)
watch(isAnimating, (animating) => {
  console.debug(`[CombatPanel:Health] isAnimating watcher: animating=${animating}`);
  emit('animating', animating);

  // When animations stop, check if combat is truly complete
  // DON'T reset immediately - events arrive in batches, so we might just be between batches
  if (!animating) {
    // Use a delay to allow any pending events to arrive
    setTimeout(() => {
      // Only reset if:
      // 1. Still not animating (no new events arrived)
      // 2. Combat is marked complete OR activeCombat is null (combat ended)
      const combatEnded = !props.activeCombat || props.activeCombat.combatComplete;
      if (!isAnimating.value && combatEnded) {
        console.debug(`[CombatPanel:Health]   => combat complete, resetting all state`);
        displayHealthInitialized.value = false;
        displayHealth.value.clear();
        resetAnimations();
        emit('combat-finished');
      } else {
        console.debug(`[CombatPanel:Health]   => animations paused, waiting for more events (combatComplete=${props.activeCombat?.combatComplete})`);
      }
    }, 100);
  }
}, { immediate: true });

// MERC-l09: Get dog target names - maps dogId -> targetName
const dogTargetNames = computed(() => {
  const nameMap = new Map<string, string>();
  const assignments = props.activeCombat?.dogAssignments || [];

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
  if (!props.activeCombat?.pendingHitAllocation) return [];
  const { diceRolls, hitThreshold } = props.activeCombat.pendingHitAllocation;
  if (!diceRolls) return [];
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
  const allocation = props.activeCombat?.pendingHitAllocation;
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
    const validTargetIds = props.activeCombat?.pendingTargetSelection?.validTargets.map(t => t.id) ?? [];
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
  const validTargetIds = props.activeCombat?.pendingHitAllocation?.validTargets.map(t => t.id) ?? [];
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
  const isAttackDogUnit = combatant.isAttackDog === true;
  const isMerc = !combatant.isMilitia && !isAttackDogUnit && (combatant.combatantId || combatant.isDictator);

  // Get name - capitalize it
  let name = combatant.name;
  if (combatant.isMilitia) {
    name = 'Militia';
  } else if (isAttackDogUnit) {
    name = 'Attack Dog';
  } else if (isMerc) {
    name = capitalize(combatant.name || 'MERC');
  }

  // Get image directly from combatant (populated from JSON data in combat.ts)
  const image = combatant.image || null;

  // Attack dogs have 3 health like MERCs
  const defaultMaxHealth = isMerc ? 3 : isAttackDogUnit ? 3 : 1;
  const actualHealth = combatant.health ?? (isAttackDogUnit ? 3 : 1);
  const maxHealth = combatant.maxHealth ?? defaultMaxHealth;

  // Theatre model: use display health when animating
  // This shows combatants as ALIVE when panel opens, deaths occur as events play
  const combatantId = combatant.id || combatant.sourceElement?.id;
  const health = getDisplayHealth(combatantId, actualHealth);

  return {
    id: combatant.id,
    name,
    isMerc,
    isAttackDog: isAttackDogUnit,
    health,
    maxHealth,
    combatantId: combatant.combatantId,
    image,
    isDead: health <= 0,
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
    return props.activeCombat?.pendingTargetSelection?.validTargets.some(t => t.id === targetId) ?? false;
  }
  // Wolverine 6s allocation
  if (isAllocatingWolverineSixes.value) {
    return props.activeCombat?.pendingWolverineSixes?.bonusTargets.some(t => t.id === targetId) ?? false;
  }
  // Normal hit allocation
  return props.activeCombat?.pendingHitAllocation?.validTargets.some(t => t.id === targetId) ?? false;
}

// Reset allocation state when pendingHitAllocation changes
watch(() => props.activeCombat?.pendingHitAllocation, () => {
  allocatedHits.value.clear();
  selectedDieIndex.value = null;
  // Auto-select first hit die
  if (props.activeCombat?.pendingHitAllocation && successfulDice.value.length > 0) {
    selectedDieIndex.value = successfulDice.value[0].index;
  }
}, { immediate: true });

// Reset selected targets when pendingTargetSelection changes
watch(() => props.activeCombat?.pendingTargetSelection, () => {
  selectedTargets.value.clear();
}, { immediate: true });

// =============================================================================
// Combat Animation State
// =============================================================================
// Track attack sequences persistently so targets stay highlighted through death.

// Current attack sequence state (persists from roll through all damage/death events)
const activeAttackerId = ref<string | null>(null);
const activeTargets = ref<Map<string, { isTarget: boolean; isDead: boolean }>>(new Map());
const activeAttackMissed = ref(false);

// Shake animation state - controlled separately from scaling
// The shake only shows AFTER the scale-up animation completes
const showMissShake = ref(false);
let shakeTimeoutId: ReturnType<typeof setTimeout> | null = null;

// Track damage that has actually been animated (not pre-computed)
// This is separate from activeTargets so bullet holes only show when damage events play
const displayedDamage = ref<Map<string, number>>(new Map());

/**
 * Find combatant ID by name from all combatants.
 */
function findCombatantId(name: string): string | null {
  if (!name) {
    return null;
  }
  const lowerName = name.toLowerCase();

  const combat = displayCombat.value;
  if (!combat) {
    return null;
  }

  const allCombatants = [
    ...(combat.rebelCombatants || []),
    ...(combat.dictatorCombatants || []),
    ...(combat.rebelCasualties || []),
    ...(combat.dictatorCasualties || []),
  ];

  for (const c of allCombatants) {
    if (!c) continue;
    const cName = (c.name || '').toLowerCase();
    if (cName === lowerName || cName.includes(lowerName) || lowerName.includes(cName)) {
      return c.id || c.sourceElement?.id || null;
    }
  }
  return null;
}

/**
 * When a roll event starts, capture the attacker and targets.
 * Uses targetIds from the roll event (declared targets) so we can highlight
 * targets even when the attack misses (no damage events).
 */
function startAttackSequence(rollEvent: any, queue: any[], startPos: number) {
  // Find attacker ID - prefer ID from event, fallback to name lookup
  let attackerId = rollEvent?.attackerId || null;
  if (!attackerId && rollEvent?.attackerName) {
    attackerId = findCombatantId(rollEvent.attackerName);
  }
  activeAttackerId.value = attackerId;
  activeAttackMissed.value = (rollEvent?.hits || 0) === 0;

  // Pre-compute which combatants are targets for this attack sequence
  // NOTE: We only track that they ARE targets, not how much damage they'll take.
  // Damage is tracked separately in displayedDamage when damage events actually play.
  const targets = new Map<string, { isTarget: boolean; isDead: boolean }>();

  // FIRST: Use targetIds from the roll event (declared targets)
  // This ensures targets are highlighted even when the attack misses
  if (rollEvent?.targetIds && Array.isArray(rollEvent.targetIds)) {
    for (const targetId of rollEvent.targetIds) {
      if (targetId) {
        targets.set(targetId, { isTarget: true, isDead: false });
      }
    }
  }
  // Fallback: Use targetNames if targetIds not available
  else if (rollEvent?.targetNames && Array.isArray(rollEvent.targetNames)) {
    for (const targetName of rollEvent.targetNames) {
      const targetId = findCombatantId(targetName);
      if (targetId) {
        targets.set(targetId, { isTarget: true, isDead: false });
      }
    }
  }

  // ALSO look ahead for death events to mark targets as dead
  if (queue && Array.isArray(queue)) {
    for (let i = startPos; i < queue.length; i++) {
      const e = queue[i];
      if (!e) continue;

      // Stop if we hit a different attacker's roll
      if (e.type === 'roll' && i > startPos) {
        break;
      }

      if (e.type === 'death' && e.targetName) {
        let targetId = e.targetId || findCombatantId(e.targetName);
        if (targetId) {
          const existing = targets.get(targetId);
          targets.set(targetId, {
            isTarget: existing?.isTarget || true,
            isDead: true,
          });
        }
      }
    }
  }

  activeTargets.value = targets;
}

/**
 * Clear attack sequence state.
 */
function clearAttackSequence() {
  activeAttackerId.value = null;
  activeTargets.value = new Map();
  activeAttackMissed.value = false;
  displayedDamage.value.clear();

  // Clear shake state and cancel any pending shake timer
  showMissShake.value = false;
  if (shakeTimeoutId) {
    clearTimeout(shakeTimeoutId);
    shakeTimeoutId = null;
  }
}

// Track the pending roll event that will start when pre-roll ends
const pendingRollEvent = ref<any>(null);

// Watch for roll events to start attack sequences
// Use flush: 'sync' so scaling happens BEFORE the roll display renders
watch(currentEvent, (event, oldEvent) => {
  try {
    // DEBUG: Log every event that comes through
    if (event) {
      console.debug(`[CombatPanel:Health] currentEvent: type=${event.type}, targetId=${event.targetId}, targetName=${event.targetName}, damage=${event.damage}`);
    } else {
      console.debug(`[CombatPanel:Health] currentEvent: null (animation ended)`);
    }

    // Check if we need to clear the previous attack sequence
    // This happens when:
    // 1. A new roll event starts (clear during pre-roll, combatants scale down)
    // 2. Animation ends (event becomes null)
    // 3. Non-attack event (round-start, combat-end)
    const isNewRoll = event?.type === 'roll';
    const isAnimationEnded = !event;
    const isNonAttackEvent = event?.type === 'round-start' || event?.type === 'combat-end';

    if (activeAttackerId.value && (isNewRoll || isAnimationEnded || isNonAttackEvent)) {
      // Clear the previous attack sequence
      // For roll events, this happens during pre-roll so combatants scale DOWN first
      clearAttackSequence();
    }

    if (!event) {
      // Animation ended completely
      pendingRollEvent.value = null;
      return;
    }

    if (event.type === 'roll') {
      // Store the roll event - we'll start the attack sequence when pre-roll ends
      // This gives time for the previous combatants to scale DOWN during pre-roll
      pendingRollEvent.value = event;
    }

    // Track displayed damage when damage events play - this is when bullet holes appear
    // ALSO update theatre display health so health bars animate
    // DEBUG: Log damage event check
    if (event.type === 'damage') {
      console.debug(`[CombatPanel:Health]   damage event check: targetName=${event.targetName} (truthy=${!!event.targetName}), damage=${event.damage} (truthy=${!!event.damage})`);
    }
    if (event.type === 'damage' && event.targetName && event.damage) {
      const targetId = event.targetId || findCombatantId(event.targetName);
      if (targetId) {
        const current = displayedDamage.value.get(targetId) || 0;
        displayedDamage.value.set(targetId, current + event.damage);
      }

      // Theatre model: update display health for health bar animation
      applyDisplayDamage(event.targetId || null, event.targetName || null, event.damage);
    }

    // Mark targets as dead when death event plays
    if (event.type === 'death' && event.targetName) {
      const targetId = findCombatantId(event.targetName);
      if (targetId && activeTargets.value.has(targetId)) {
        const existing = activeTargets.value.get(targetId)!;
        activeTargets.value.set(targetId, { ...existing, isDead: true });
      }
    }
  } catch {
    // Silently ignore errors in animation watcher
  }
}, { flush: 'sync' });

// Clear attack state when animations complete (safety net)
// The main clearing happens in currentEvent watcher when event becomes null
watch(isAnimating, (animating) => {
  if (!animating) {
    // Ensure attack sequence is cleared when animations end
    // This is a safety net - main clearing happens in currentEvent watcher
    clearAttackSequence();
    pendingRollEvent.value = null;
  }
});

// Watch for pre-roll ending - this is when we START the attack sequence
// During pre-roll, the previous combatants scale DOWN
// When pre-roll ends, the new attacker/targets scale UP
// THEN after scale-up completes, the shake animation plays (if miss)
watch(isPreRoll, (preRoll, wasPreRoll) => {
  // When pre-roll ends (transitions from true to false)
  if (wasPreRoll && !preRoll && pendingRollEvent.value) {
    const rollEvent = pendingRollEvent.value;
    startAttackSequence(rollEvent, eventQueue.value, queuePosition.value);
    pendingRollEvent.value = null;

    // If this attack missed (0 hits), show shake AFTER scale-up completes + visible pause
    // Scale transition is 300ms, then we want ~300ms visible pause before shake
    const isMiss = (rollEvent?.hits || 0) === 0;
    if (isMiss) {
      shakeTimeoutId = setTimeout(() => {
        showMissShake.value = true;
      }, 600); // 600ms = scale transition (300ms) + visible pause (300ms)
    }
  }
});

/**
 * Check if a combatant is the current attacker.
 */
function isCurrentAttacker(combatantId: string): boolean {
  return activeAttackerId.value === combatantId;
}

/**
 * Check if a combatant is a current target.
 */
function isCurrentTarget(combatantId: string): boolean {
  return activeTargets.value.has(combatantId);
}

/**
 * Get hit count for a targeted combatant.
 * Returns damage that has actually been animated, not pre-computed damage.
 */
function getTargetHits(combatantId: string): number {
  return displayedDamage.value.get(combatantId) || 0;
}

/**
 * Whether the current attack missed (0 hits on a roll event).
 */
const attackMissed = computed(() => activeAttackMissed.value);

/**
 * Generate a deterministic pseudo-random position for a bullet hole.
 * Uses a seeded PRNG based on combatantId + hitIndex to get consistent positions
 * that don't jump around during re-renders.
 */
function getBulletHolePosition(combatantId: string, hitIndex: number): { top: string; left: string } {
  // Mulberry32 PRNG - simple but effective seeded random
  function mulberry32(seed: number) {
    return function() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Create a seed from combatantId + hitIndex
  let seed = 0;
  const str = `${combatantId}-${hitIndex}`;
  for (let i = 0; i < str.length; i++) {
    seed = ((seed << 5) - seed) + str.charCodeAt(i);
    seed = seed | 0; // Convert to 32bit integer
  }

  // Get two random values for top and left
  const random = mulberry32(seed);
  const randTop = random();
  const randLeft = random();

  // Map to 10%-85% range to keep within visible card area
  const top = 10 + randTop * 75;
  const left = 10 + randLeft * 75;

  return {
    top: `${top}%`,
    left: `${left}%`,
  };
}
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
          <div
            v-for="combatant in livingRebels"
            :key="getCombatantDisplay(combatant).id"
            class="combatant"
            :class="{
              merc: getCombatantDisplay(combatant).isMerc,
              militia: !getCombatantDisplay(combatant).isMerc && !getCombatantDisplay(combatant).isAttackDog,
              'attack-dog': getCombatantDisplay(combatant).isAttackDog,
              attacking: activeCombat?.pendingHitAllocation?.attackerId === getCombatantDisplay(combatant).id,
              targetable: isValidTarget(getCombatantDisplay(combatant).id),
              selected: selectedDieIndex !== null && isValidTarget(getCombatantDisplay(combatant).id),
              'target-selected': isSelectingTargets && isTargetSelected(getCombatantDisplay(combatant).id),
              'death-flash': getCombatantDisplay(combatant).isDead && isAnimating,
              'is-attacking': isCurrentAttacker(getCombatantDisplay(combatant).id),
              'is-targeted': isCurrentTarget(getCombatantDisplay(combatant).id),
              'attack-missed': isCurrentAttacker(getCombatantDisplay(combatant).id) && showMissShake,
            }"
            @click="selectTarget(getCombatantDisplay(combatant).id)"
          >
            <CombatantIcon
              :image="combatant.image"
              :combatant-id="combatant.combatantId"
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
            <!-- Bullet holes for targeted combatants during animation -->
            <div v-if="getTargetHits(getCombatantDisplay(combatant).id) > 0" class="bullet-holes">
              <span
                v-for="n in getTargetHits(getCombatantDisplay(combatant).id)"
                :key="n"
                class="bullet-hole"
                :style="getBulletHolePosition(getCombatantDisplay(combatant).id, n)"
              >◎</span>
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
              'death-flash': getCombatantDisplay(combatant).isDead && isAnimating,
              'is-attacking': isCurrentAttacker(getCombatantDisplay(combatant).id),
              'is-targeted': isCurrentTarget(getCombatantDisplay(combatant).id),
              'attack-missed': isCurrentAttacker(getCombatantDisplay(combatant).id) && showMissShake,
            }"
            @click="selectTarget(getCombatantDisplay(combatant).id)"
          >
            <CombatantIcon
              :image="combatant.image"
              :combatant-id="combatant.combatantId"
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
            <!-- Bullet holes for targeted combatants during animation -->
            <div v-if="getTargetHits(getCombatantDisplay(combatant).id) > 0" class="bullet-holes">
              <span
                v-for="n in getTargetHits(getCombatantDisplay(combatant).id)"
                :key="n"
                class="bullet-hole"
                :style="getBulletHolePosition(getCombatantDisplay(combatant).id, n)"
              >◎</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Dice area - HIDE during animation to prevent stale state -->
    <div v-if="activeCombat?.pendingHitAllocation && !isAnimating" class="dice-area">
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

    <!-- Combat animation display (from queue) - hide during pre-roll phase -->
    <!-- Show for ALL roll events, even with 0 dice (e.g., Teresa with no combat stat) -->
    <div v-if="currentEvent && currentEvent.type === 'roll' && !isPreRoll" class="animation-display">
      <div class="attacker-info">
        <strong>{{ currentEvent.attackerName }}</strong> attacks!
        <span class="hit-count">{{ currentEvent.hits ?? 0 }} hit(s)</span>
      </div>

      <div class="dice-row">
        <div
          v-for="(value, index) in (currentEvent.diceRolls || [])"
          :key="index"
          class="die-container"
          :class="{
            hit: value >= (currentEvent.hitThreshold ?? 4),
            miss: value < (currentEvent.hitThreshold ?? 4),
            six: isDieSix(value),
          }"
        >
          <Die3D
            :sides="6"
            :value="value"
            :die-id="`anim-die-${index}`"
            :roll-count="1"
            :size="50"
            :color="value >= (currentEvent.hitThreshold ?? 4) ? '#4CAF50' : '#666'"
          />
        </div>
      </div>

      <!-- Fast-forward button -->
      <button
        class="fast-forward-btn"
        :class="{ active: isFastForward }"
        @click="fastForward"
        title="Speed up animations"
      >
        >>
      </button>
    </div>

    <!-- Wolverine's 6s allocation - HIDE during animation -->
    <div v-if="activeCombat?.pendingWolverineSixes && !isAnimating" class="wolverine-area">
      <div class="wolverine-info">
        <strong>{{ activeCombat.pendingWolverineSixes.attackerName }}</strong> - Wolverine's Ability!
        <span class="six-count">{{ activeCombat.pendingWolverineSixes.sixCount }} bonus target(s) from 6s</span>
      </div>
      <div class="allocation-hint">
        Click additional targets to allocate Wolverine's bonus hits
      </div>
    </div>

    <!-- Attack Dog assignment - HIDE during animation -->
    <div v-if="isAssigningAttackDog && !isAnimating" class="attack-dog-area">
      <div class="attack-dog-info">
        <strong>{{ activeCombat?.pendingAttackDogSelection?.attackerName }}</strong> - Attack Dog!
        <span class="dog-hint">Assign the dog to an enemy MERC</span>
      </div>
      <div class="attack-dog-targets">
        <button
          v-for="target in activeCombat?.pendingAttackDogSelection?.validTargets"
          :key="target.id"
          class="attack-dog-target-btn"
          @click="emit('assign-attack-dog', target.id)"
        >
          {{ target.name }}
        </button>
      </div>
    </div>

    <!-- Target selection area (before rolling) - HIDE during animation -->
    <div v-if="isSelectingTargets && !isAnimating" class="target-selection-area">
      <div class="target-selection-info">
        <strong>{{ activeCombat?.pendingTargetSelection?.attackerName }}</strong> is attacking!
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

    <!-- Combat actions - Continue/Retreat (when not in any allocation mode and not selecting retreat sector) - HIDE during animation -->
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
  transition: width 0.5s ease-out;
}

/* Health damage flash animation */
@keyframes health-flash {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; background: linear-gradient(90deg, #ff4444, #ff6666); }
}

.health-bar.taking-damage .health-fill {
  animation: health-flash 0.3s ease-out;
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

/* Combat animation display (from queue) */
.animation-display {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  border: 2px solid rgba(76, 175, 80, 0.5);
  position: relative;
  margin-top: 12px;
}

/* Fast-forward button */
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

/* =============================================================================
   Combat Animation Styles - Attacker/Target Highlighting
   ============================================================================= */

/* Attacker - scaled up with gold glow */
.combatant.is-attacking {
  transform: scale(1.2);
  z-index: 10;
  box-shadow: 0 0 20px rgba(212, 168, 75, 0.8);
  border-color: v-bind('UI_COLORS.accent') !important;
}

/* Target - scaled up with red glow */
.combatant.is-targeted {
  transform: scale(1.15);
  z-index: 9;
  box-shadow: 0 0 15px rgba(255, 107, 107, 0.8);
  border-color: #ff6b6b !important;
}

/* Smooth transitions for all combatants */
.combatant {
  transition: transform 0.3s ease-out, box-shadow 0.3s ease-out, border-color 0.3s ease-out;
}

/* =============================================================================
   Death Flash Effect
   ============================================================================= */
.combatant.death-flash {
  animation: death-flash 0.8s ease-out forwards;
}

@keyframes death-flash {
  0% {
    filter: brightness(1);
  }
  20% {
    filter: brightness(2) sepia(1) hue-rotate(-30deg);
    background: rgba(255, 50, 50, 0.4);
  }
  100% {
    filter: brightness(0.5) sepia(0.5) hue-rotate(-30deg);
    background: rgba(139, 0, 0, 0.3);
  }
}

/* =============================================================================
   Bullet Hole Effect
   ============================================================================= */
.bullet-holes {
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* No flexbox - children are absolutely positioned */
}

.bullet-hole {
  position: absolute;
  font-size: 20px;
  color: #ff3333;
  text-shadow:
    0 0 4px rgba(255, 0, 0, 0.8),
    0 0 8px rgba(255, 0, 0, 0.5);
  animation: bullet-impact 0.3s ease-out;
  /* Center the bullet hole character on its position */
  transform: translate(-50%, -50%);
}

@keyframes bullet-impact {
  0% {
    transform: translate(-50%, -50%) scale(2);
    opacity: 0;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.2);
  }
  100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
}

/* =============================================================================
   Shake Animation for Misses
   ============================================================================= */
/* Shake is applied via JavaScript AFTER the scale-up transition completes.
   The showMissShake ref is set with a 350ms delay after scale-up starts. */
.combatant.attack-missed {
  animation: shake 0.5s ease-in-out;
}

@keyframes shake {
  0%, 100% { transform: scale(1.2) translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: scale(1.2) translateX(-4px); }
  20%, 40%, 60%, 80% { transform: scale(1.2) translateX(4px); }
}
</style>
