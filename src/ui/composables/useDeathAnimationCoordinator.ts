import { ref, computed } from 'vue';

/**
 * Death animation data
 */
export interface DeathAnimationData {
  id: string;
  combatantId: string;
  combatantName: string;
  image?: string;
  playerColor?: string;
  sectorId: string;
  source: 'combat' | 'tactics' | 'mortar' | 'mine' | 'other';
}

/**
 * Singleton state for death animation coordination.
 * This allows CombatPanel and MapGrid to coordinate death animations.
 */
const pendingDeaths = ref<DeathAnimationData[]>([]);
const isCombatAnimationActive = ref(false);
const suppressedDeaths = ref<DeathAnimationData[]>([]);

let deathIdCounter = 0;
function getDeathId(): string {
  return `death-${Date.now()}-${++deathIdCounter}`;
}

/**
 * Composable for coordinating death animations between CombatPanel and MapGrid.
 *
 * Problem: When combat happens, the game state updates immediately (showing deaths),
 * but the CombatPanel plays animations sequentially. This causes MapGrid to show
 * death animations before the CombatPanel reaches that point in its queue.
 *
 * Solution:
 * 1. CombatPanel sets isCombatAnimationActive=true while animating
 * 2. MapGrid checks this flag before auto-triggering deaths
 * 3. During combat, deaths are suppressed and queued
 * 4. CombatPanel calls triggerDeath() when its queue reaches a death event
 * 5. When combat animations end, any remaining suppressed deaths are triggered
 */
export function useDeathAnimationCoordinator() {
  /**
   * Set whether combat animation is currently active.
   * While active, MapGrid should not auto-trigger death animations.
   */
  function setCombatAnimationActive(active: boolean) {
    isCombatAnimationActive.value = active;

    // When combat ends, trigger any remaining suppressed deaths
    if (!active && suppressedDeaths.value.length > 0) {
      for (const death of suppressedDeaths.value) {
        pendingDeaths.value.push(death);
      }
      suppressedDeaths.value = [];
    }
  }

  /**
   * Check if combat animation is active.
   * MapGrid uses this to decide whether to suppress auto-death detection.
   */
  function isCombatAnimating(): boolean {
    return isCombatAnimationActive.value;
  }

  /**
   * Queue a death animation from MapGrid's auto-detection.
   * If combat is active, the death is suppressed until combat ends
   * OR until CombatPanel explicitly triggers it.
   */
  function queueDeath(data: Omit<DeathAnimationData, 'id' | 'source'>, source: DeathAnimationData['source'] = 'other') {
    const death: DeathAnimationData = {
      ...data,
      id: getDeathId(),
      source,
    };

    if (isCombatAnimationActive.value && source === 'combat') {
      // Combat death while animating - suppress until triggered by combat panel
      suppressedDeaths.value.push(death);
    } else {
      // Non-combat death or combat not active - show immediately
      pendingDeaths.value.push(death);
    }
  }

  /**
   * Trigger a specific death animation (called by CombatPanel when its queue reaches a death event).
   * This finds the suppressed death by combatant name and moves it to pending.
   */
  function triggerDeathByName(combatantName: string) {
    const lowerName = combatantName.toLowerCase();
    const idx = suppressedDeaths.value.findIndex(
      d => d.combatantName.toLowerCase() === lowerName
    );

    if (idx >= 0) {
      const death = suppressedDeaths.value.splice(idx, 1)[0];
      pendingDeaths.value.push(death);
    }
  }

  /**
   * Get pending death animations to display.
   * MapGrid uses this to render CombatantDeathAnimation components.
   */
  function getPendingDeaths(): DeathAnimationData[] {
    return pendingDeaths.value;
  }

  /**
   * Remove a death from pending (called when animation completes).
   */
  function removePendingDeath(deathId: string) {
    pendingDeaths.value = pendingDeaths.value.filter(d => d.id !== deathId);
  }

  /**
   * Clear all state (for cleanup/reset).
   */
  function reset() {
    pendingDeaths.value = [];
    suppressedDeaths.value = [];
    isCombatAnimationActive.value = false;
  }

  return {
    // State (reactive)
    pendingDeaths: computed(() => pendingDeaths.value),
    isCombatAnimationActive: computed(() => isCombatAnimationActive.value),

    // Methods
    setCombatAnimationActive,
    isCombatAnimating,
    queueDeath,
    triggerDeathByName,
    getPendingDeaths,
    removePendingDeath,
    reset,
  };
}
