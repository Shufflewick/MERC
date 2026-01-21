import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';

/**
 * Timing constants for combat animations (in milliseconds).
 */
const ANIMATION_TIMING = {
  PRE_ROLL_DELAY: 400,      // Delay before showing roll (lets scale animation complete)
  ROLL_DURATION: 1500,      // Time to show dice roll animation
  DAMAGE_DURATION: 800,     // Time to show damage numbers
  DEATH_DURATION: 1000,     // Time for death animation
  PAUSE_BETWEEN: 400,       // Pause between events
  COMBAT_END_DELAY: 1500,   // Keep showing results after combat ends
  // Fast-forward speeds
  FAST_PRE_ROLL: 50,
  FAST_ROLL: 100,
  FAST_DAMAGE: 50,
  FAST_DEATH: 100,
  FAST_PAUSE: 25,
  FAST_COMBAT_END: 200,
} as const;

/**
 * Combat animation event from game state.
 */
export interface CombatAnimationEvent {
  type: 'roll' | 'damage' | 'death' | 'round-start' | 'combat-end';
  eventId: number;  // Unique ID for deduplication (timestamp alone can collide)
  timestamp: number;
  attackerName?: string;
  attackerId?: string;
  attackerImage?: string;
  targetName?: string;
  targetId?: string;
  targetImage?: string;
  // For roll events: all declared targets (used for highlighting even on miss)
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

/**
 * Current animation event with display state.
 */
export interface AnimationDisplayState {
  type: CombatAnimationEvent['type'];
  attackerName?: string;
  attackerId?: string;
  attackerImage?: string;
  targetName?: string;
  targetId?: string;
  targetImage?: string;
  // For roll events: all declared targets (used for highlighting even on miss)
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

/**
 * Return type from useCombatAnimationQueue composable.
 */
export interface CombatAnimationQueueReturn {
  // State
  isAnimating: ComputedRef<boolean>;
  isFastForward: Ref<boolean>;
  isPreRoll: Ref<boolean>;  // True during pre-roll delay (combatants scaled, dice not shown yet)
  currentEvent: Ref<AnimationDisplayState | null>;
  currentPhase: Ref<string>;  // DEBUG: Current phase description
  eventQueue: Ref<CombatAnimationEvent[]>;
  queuePosition: Ref<number>;

  // Methods
  queueEventsFromState: (events: CombatAnimationEvent[] | undefined) => void;
  playNext: () => Promise<void>;
  fastForward: () => void;
  skipAll: () => void;
  reset: () => void;
}

/**
 * Composable for managing combat animation queue.
 * Reads events from game.activeCombat.animationEvents (passed via props).
 *
 * Usage:
 * 1. Call queueEventsFromState(activeCombat.animationEvents) when combat state changes
 * 2. Events play automatically via watcher
 * 3. Use fastForward() or skipAll() to speed through or skip animations
 */
export function useCombatAnimationQueue(): CombatAnimationQueueReturn {
  // Animation queue state
  const eventQueue = ref<CombatAnimationEvent[]>([]);
  const queuePosition = ref(0);
  const currentEvent = ref<AnimationDisplayState | null>(null);
  const isFastForward = ref(false);
  const isPreRoll = ref(false);  // True during pre-roll delay
  const currentPhase = ref('idle');  // DEBUG: Current phase

  // Promise chain for serialized animation playback
  // Each playNext() chains onto this, guaranteeing no concurrent animations
  let currentAnimation: Promise<void> = Promise.resolve();

  // Track which event IDs we've already queued (to avoid duplicates)
  const queuedEventIds = ref(new Set<number>());

  // Computed: are we currently animating?
  const isAnimating = computed(() => {
    return eventQueue.value.length > 0 && queuePosition.value < eventQueue.value.length;
  });

  /**
   * Queue events from game state (activeCombat.animationEvents).
   * Only queues events that haven't been queued before (by eventId).
   */
  function queueEventsFromState(events: CombatAnimationEvent[] | undefined): void {
    if (!events || events.length === 0) {
      return;
    }

    console.debug(`[AnimQueue] queueEventsFromState: ${events.length} events received`);
    console.debug(`[AnimQueue]   queuedEventIds before: [${Array.from(queuedEventIds.value).join(', ')}]`);
    console.debug(`[AnimQueue]   incoming eventIds: [${events.map(e => e.eventId).join(', ')}]`);

    // Filter to only new events (not already queued) - use eventId for uniqueness
    const newEvents = events.filter(e => !queuedEventIds.value.has(e.eventId));

    console.debug(`[AnimQueue]   filtered to ${newEvents.length} new events (eventIds: [${newEvents.map(e => e.eventId).join(', ')}])`);

    if (newEvents.length > 0) {
      // Mark these event IDs as queued
      for (const e of newEvents) {
        queuedEventIds.value.add(e.eventId);
      }
      // Add to queue
      eventQueue.value = [...eventQueue.value, ...newEvents];
      console.debug(`[AnimQueue]   queue now has ${eventQueue.value.length} events, position=${queuePosition.value}`);
    } else {
      console.debug(`[AnimQueue]   NO new events to queue!`);
    }
  }

  /**
   * Get timing for current animation speed.
   */
  function getTiming(type: 'pre-roll' | 'roll' | 'damage' | 'death' | 'pause' | 'combat-end'): number {
    if (isFastForward.value) {
      switch (type) {
        case 'pre-roll': return ANIMATION_TIMING.FAST_PRE_ROLL;
        case 'roll': return ANIMATION_TIMING.FAST_ROLL;
        case 'damage': return ANIMATION_TIMING.FAST_DAMAGE;
        case 'death': return ANIMATION_TIMING.FAST_DEATH;
        case 'pause': return ANIMATION_TIMING.FAST_PAUSE;
        case 'combat-end': return ANIMATION_TIMING.FAST_COMBAT_END;
      }
    }
    switch (type) {
      case 'pre-roll': return ANIMATION_TIMING.PRE_ROLL_DELAY;
      case 'roll': return ANIMATION_TIMING.ROLL_DURATION;
      case 'damage': return ANIMATION_TIMING.DAMAGE_DURATION;
      case 'death': return ANIMATION_TIMING.DEATH_DURATION;
      case 'pause': return ANIMATION_TIMING.PAUSE_BETWEEN;
      case 'combat-end': return ANIMATION_TIMING.COMBAT_END_DELAY;
    }
  }

  /**
   * Sleep for a duration.
   */
  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Play the next event in the queue.
   * Uses Promise chaining to guarantee serialization - no race conditions possible.
   */
  async function playNext(): Promise<void> {
    // Chain onto the current animation to guarantee serialization
    currentAnimation = currentAnimation.then(async () => {
      // Check if there are events to play
      if (queuePosition.value >= eventQueue.value.length) {
        currentPhase.value = 'idle';
        return;
      }

      const event = eventQueue.value[queuePosition.value];

      // For roll events, set isPreRoll FIRST to hide dice
      if (event.type === 'roll') {
        currentPhase.value = `PRE-ROLL: ${event.attackerName} → scaling up`;
        isPreRoll.value = true;
      }

      // Set current event for display (spread to include all fields like targetIds)
      currentEvent.value = { ...event };

      // Wait for animation duration based on event type
      switch (event.type) {
        case 'roll':
          await sleep(getTiming('pre-roll'));
          currentPhase.value = `ROLL: ${event.attackerName} → showing dice`;
          isPreRoll.value = false;
          await sleep(getTiming('roll'));
          break;
        case 'damage':
          currentPhase.value = `DAMAGE: ${event.attackerName} → ${event.targetName} (${event.damage} dmg)`;
          await sleep(getTiming('damage'));
          break;
        case 'death':
          currentPhase.value = `DEATH: ${event.targetName} dies`;
          await sleep(getTiming('death'));
          break;
        case 'round-start':
          currentPhase.value = `ROUND START: Round ${event.round}`;
          await sleep(getTiming('pause'));
          break;
        case 'combat-end':
          currentPhase.value = `COMBAT END`;
          await sleep(getTiming('combat-end'));
          break;
      }

      // Pause between events
      currentPhase.value = 'PAUSE between events';
      await sleep(getTiming('pause'));

      // Advance queue
      queuePosition.value++;

      // Continue to next event if there are more
      if (queuePosition.value < eventQueue.value.length) {
        // Recursively play next (within the chain)
        await playNextInternal();
      } else {
        // Animation complete
        currentPhase.value = 'COMPLETE';
        currentEvent.value = null;
      }
    });

    return currentAnimation;
  }

  /**
   * Internal function to continue playing events within the same Promise chain.
   */
  async function playNextInternal(): Promise<void> {
    if (queuePosition.value >= eventQueue.value.length) {
      currentPhase.value = 'idle';
      currentEvent.value = null;
      return;
    }

    const event = eventQueue.value[queuePosition.value];

    // For roll events, set isPreRoll FIRST to hide dice
    if (event.type === 'roll') {
      currentPhase.value = `PRE-ROLL: ${event.attackerName} → scaling up`;
      isPreRoll.value = true;
    }

    // Set current event for display (spread to include all fields like targetIds)
    currentEvent.value = { ...event };

    // Wait for animation duration based on event type
    switch (event.type) {
      case 'roll':
        await sleep(getTiming('pre-roll'));
        currentPhase.value = `ROLL: ${event.attackerName} → showing dice`;
        isPreRoll.value = false;
        await sleep(getTiming('roll'));
        break;
      case 'damage':
        currentPhase.value = `DAMAGE: ${event.attackerName} → ${event.targetName} (${event.damage} dmg)`;
        await sleep(getTiming('damage'));
        break;
      case 'death':
        currentPhase.value = `DEATH: ${event.targetName} dies`;
        await sleep(getTiming('death'));
        break;
      case 'round-start':
        currentPhase.value = `ROUND START: Round ${event.round}`;
        await sleep(getTiming('pause'));
        break;
      case 'combat-end':
        currentPhase.value = `COMBAT END`;
        await sleep(getTiming('combat-end'));
        break;
    }

    // Pause between events
    currentPhase.value = 'PAUSE between events';
    await sleep(getTiming('pause'));

    // Advance queue
    queuePosition.value++;

    // Continue to next event if there are more
    if (queuePosition.value < eventQueue.value.length) {
      await playNextInternal();
    } else {
      currentPhase.value = 'COMPLETE';
      currentEvent.value = null;
    }
  }

  /**
   * Enable fast-forward mode (speeds up remaining animations).
   */
  function fastForward(): void {
    isFastForward.value = true;
  }

  /**
   * Skip all remaining animations immediately.
   */
  function skipAll(): void {
    queuePosition.value = eventQueue.value.length;
    currentEvent.value = null;
    currentPhase.value = 'skipped';
    // Reset the Promise chain to allow fresh animations
    currentAnimation = Promise.resolve();
  }

  /**
   * Reset the animation queue (call when combat ends or new combat starts).
   */
  function reset(): void {
    console.debug(`[AnimQueue] reset() called. Clearing queue (had ${eventQueue.value.length} events), queuedEventIds (had ${queuedEventIds.value.size} ids)`);
    eventQueue.value = [];
    queuePosition.value = 0;
    currentEvent.value = null;
    currentPhase.value = 'idle';
    isFastForward.value = false;
    // Reset the Promise chain
    currentAnimation = Promise.resolve();
    queuedEventIds.value.clear();
  }

  // Auto-play when new events are queued
  // With Promise chain serialization, we just call playNext() and it will chain properly
  watch(
    () => eventQueue.value.length,
    (newLen, oldLen) => {
      if (newLen > oldLen && queuePosition.value < newLen) {
        playNext();
      }
    }
  );

  return {
    // State
    isAnimating,
    isFastForward,
    isPreRoll,
    currentEvent,
    currentPhase,
    eventQueue,
    queuePosition,

    // Methods
    queueEventsFromState,
    playNext,
    fastForward,
    skipAll,
    reset,
  };
}
