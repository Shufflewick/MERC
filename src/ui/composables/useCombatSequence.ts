import { ref, computed, type Ref, type ComputedRef } from 'vue';
import type { CombatAnimationEvent, AnimationDisplayState } from './useCombatAnimationQueue';
import type { TheatreCombatData } from './useTheatreHealth';

/**
 * Target info for attack sequence.
 */
export interface AttackTargetInfo {
  isTarget: boolean;
  isDead: boolean;
}

/**
 * Return type for useCombatSequence composable.
 */
export interface CombatSequenceReturn {
  // State
  activeAttackerId: Ref<string | null>;
  activeTargets: Ref<Map<string, AttackTargetInfo>>;
  activeAttackMissed: Ref<boolean>;
  showMissShake: Ref<boolean>;
  displayedDamage: Ref<Map<string, number>>;

  // Computed
  attackMissed: ComputedRef<boolean>;

  // Methods
  startAttackSequence: (rollEvent: AnimationDisplayState, queue: CombatAnimationEvent[], startPos: number, findCombatantId: (name: string) => string | null) => void;
  clearAttackSequence: () => void;
  isCurrentAttacker: (combatantId: string) => boolean;
  isCurrentTarget: (combatantId: string) => boolean;
  getTargetHits: (combatantId: string) => number;
  addDisplayedDamage: (targetId: string, damage: number) => void;
  markTargetDead: (targetId: string) => void;
  scheduleMissShake: () => void;
  getBulletHolePosition: (combatantId: string, hitIndex: number) => { top: string; left: string };
}

/**
 * Combat Animation Sequence Composable
 *
 * Tracks attack sequences persistently so targets stay highlighted through death.
 * Manages:
 * - Current attacker/targets during animations
 * - Displayed damage (for bullet holes)
 * - Miss shake animation timing
 * - Bullet hole positioning
 */
export function useCombatSequence(): CombatSequenceReturn {
  // Current attack sequence state (persists from roll through all damage/death events)
  const activeAttackerId = ref<string | null>(null);
  const activeTargets = ref<Map<string, AttackTargetInfo>>(new Map());
  const activeAttackMissed = ref(false);

  // Shake animation state - controlled separately from scaling
  // The shake only shows AFTER the scale-up animation completes
  const showMissShake = ref(false);
  let shakeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Track damage that has actually been animated (not pre-computed)
  // This is separate from activeTargets so bullet holes only show when damage events play
  const displayedDamage = ref<Map<string, number>>(new Map());

  // Computed: whether current attack missed
  const attackMissed = computed(() => activeAttackMissed.value);

  /**
   * When a roll event starts, capture the attacker and targets.
   * Uses targetIds from the roll event (declared targets) so we can highlight
   * targets even when the attack misses (no damage events).
   */
  function startAttackSequence(
    rollEvent: AnimationDisplayState,
    queue: CombatAnimationEvent[],
    startPos: number,
    findCombatantId: (name: string) => string | null
  ): void {
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
    const targets = new Map<string, AttackTargetInfo>();

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
          const targetId = e.targetId || findCombatantId(e.targetName);
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
  function clearAttackSequence(): void {
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
   * Add displayed damage for a target (when damage event plays).
   */
  function addDisplayedDamage(targetId: string, damage: number): void {
    const current = displayedDamage.value.get(targetId) || 0;
    displayedDamage.value.set(targetId, current + damage);
  }

  /**
   * Mark a target as dead when death event plays.
   */
  function markTargetDead(targetId: string): void {
    if (activeTargets.value.has(targetId)) {
      const existing = activeTargets.value.get(targetId)!;
      activeTargets.value.set(targetId, { ...existing, isDead: true });
    }
  }

  /**
   * Schedule the miss shake animation after scale-up completes.
   * Scale transition is 300ms, then we want ~300ms visible pause before shake.
   */
  function scheduleMissShake(): void {
    shakeTimeoutId = setTimeout(() => {
      showMissShake.value = true;
    }, 600); // 600ms = scale transition (300ms) + visible pause (300ms)
  }

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

  return {
    // State
    activeAttackerId,
    activeTargets,
    activeAttackMissed,
    showMissShake,
    displayedDamage,

    // Computed
    attackMissed,

    // Methods
    startAttackSequence,
    clearAttackSequence,
    isCurrentAttacker,
    isCurrentTarget,
    getTargetHits,
    addDisplayedDamage,
    markTargetDead,
    scheduleMissShake,
    getBulletHolePosition,
  };
}
