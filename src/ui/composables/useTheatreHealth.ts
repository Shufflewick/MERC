import { ref, type Ref, type ComputedRef } from 'vue';

/**
 * Minimal animation event shape used for health initialization.
 * This is compatible with both the old TheatreAnimationEvent and BoardSmith AnimationEvent types.
 */
export interface TheatreAnimationEvent {
  type: string;
  damage?: number;
  targetId?: string;
  targetName?: string;
}

/**
 * Combatant data shape for theatre health tracking.
 */
export interface TheatreCombatant {
  id?: string;
  sourceElement?: { id?: string };
  name?: string;
  health?: number;
  isMerc?: boolean;
  isMilitia?: boolean;
  isAttackDog?: boolean;
}

/**
 * Combat data shape for theatre health tracking.
 */
export interface TheatreCombatData {
  rebelCombatants?: TheatreCombatant[];
  dictatorCombatants?: TheatreCombatant[];
  rebelCasualties?: TheatreCombatant[];
  dictatorCasualties?: TheatreCombatant[];
}

/**
 * Return type for useTheatreHealth composable.
 */
export interface TheatreHealthReturn {
  // State
  displayHealth: Ref<Map<string, number>>;
  displayHealthInitialized: Ref<boolean>;
  deadCombatants: Ref<Set<string>>;

  // Methods
  initializeDisplayHealth: (events: TheatreAnimationEvent[], combat: TheatreCombatData | null) => void;
  getDisplayHealth: (combatantId: string, actualHealth: number, isAnimating: boolean) => number;
  applyDisplayDamage: (targetId: string | null, targetName: string | null, damage: number, combat: TheatreCombatData | null) => void;
  findCombatantIdByName: (name: string, combat: TheatreCombatData | null) => string | null;
  resetTheatreState: () => void;
}

/**
 * Theatre Model: Display Health Composable
 *
 * The CombatPanel acts as "theatre" - it replays combat for the user's benefit.
 * Everyone participating in combat starts ALIVE. Deaths/damage are shown as
 * animation events play, not based on the actual game state.
 *
 * displayHealth tracks health as it should appear in the theatre:
 * - When events arrive, compute starting health (current + sum of damage events)
 * - As damage events play, decrement displayHealth
 * - isDead checks displayHealth, not actual health
 */
export function useTheatreHealth(): TheatreHealthReturn {
  // Map from combatant ID to their display health (what the theatre shows)
  const displayHealth = ref<Map<string, number>>(new Map());

  // Track whether display health has been initialized for current animation sequence
  const displayHealthInitialized = ref(false);

  // Track combatants who have DIED during this combat - once dead, always dead
  // This persists across animation sequences until combat ends entirely
  const deadCombatants = ref<Set<string>>(new Set());

  /**
   * Get combatant ID from combatant data.
   */
  function getCombatantId(combatant: TheatreCombatant): string | null {
    return combatant.id || combatant.sourceElement?.id || null;
  }

  /**
   * Compute the starting health for a combatant by working backwards:
   * starting_health = current_health + sum(all_damage_to_this_combatant)
   */
  function computeStartingHealth(
    combatant: TheatreCombatant,
    events: TheatreAnimationEvent[]
  ): number {
    const combatantId = getCombatantId(combatant);
    const combatantName = (combatant.name || '').toLowerCase();
    const currentHealth = combatant.health ?? (combatant.isMerc ? 3 : 1);

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
      }
    }

    // Starting health = current health + all damage that will be dealt
    return currentHealth + totalDamage;
  }

  /**
   * Initialize display health for all combatants at the start of animation.
   * This computes what their health was BEFORE any animation events played.
   * IMPORTANT: Combatants who have already died stay dead (health = 0).
   */
  function initializeDisplayHealth(events: TheatreAnimationEvent[], combat: TheatreCombatData | null): void {
    if (!events || events.length === 0) return;
    if (!combat) return;

    displayHealth.value.clear();

    // Build a set of casualty IDs - these combatants are dead in game state
    const casualtyIds = new Set<string>();
    for (const c of [...(combat.rebelCasualties || []), ...(combat.dictatorCasualties || [])]) {
      if (c) {
        const id = getCombatantId(c);
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
      const id = getCombatantId(combatant);
      if (!id) continue;

      // If this combatant has already died (in our tracking OR in casualties), they stay at 0
      if (deadCombatants.value.has(id) || casualtyIds.has(id)) {
        displayHealth.value.set(id, 0);
        deadCombatants.value.add(id); // Ensure they're tracked as dead
        continue;
      }

      const startingHealth = computeStartingHealth(combatant, events);
      displayHealth.value.set(id, startingHealth);
    }

    displayHealthInitialized.value = true;
  }

  /**
   * Get the display health for a combatant (what the theatre shows).
   * Falls back to actual health if not initialized.
   * IMPORTANT: Dead combatants always return 0.
   */
  function getDisplayHealth(combatantId: string, actualHealth: number, isAnimating: boolean): number {
    // If combatant has died during this combat, they stay at 0
    if (deadCombatants.value.has(combatantId)) {
      return 0;
    }

    if (!displayHealthInitialized.value || !isAnimating) {
      return actualHealth;
    }

    const mapValue = displayHealth.value.get(combatantId);
    return mapValue ?? actualHealth;
  }

  /**
   * Find combatant ID by name (case-insensitive).
   */
  function findCombatantIdByName(name: string, combat: TheatreCombatData | null): string | null {
    if (!name || !combat) return null;
    const lowerName = name.toLowerCase();

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
        return getCombatantId(c);
      }
    }
    return null;
  }

  /**
   * Apply damage to display health when a damage event plays.
   * If health reaches 0, add to deadCombatants so they stay dead.
   */
  function applyDisplayDamage(targetId: string | null, targetName: string | null, damage: number, combat: TheatreCombatData | null): void {
    if (!targetId && !targetName) return;

    // Find the combatant ID
    let combatantId = targetId;
    if (!combatantId && targetName) {
      combatantId = findCombatantIdByName(targetName, combat);
    }

    if (!combatantId) return;

    const current = displayHealth.value.get(combatantId);
    if (current !== undefined) {
      const newHealth = Math.max(0, current - damage);
      displayHealth.value.set(combatantId, newHealth);

      // If health reached 0, mark as permanently dead for this combat
      if (newHealth <= 0) {
        deadCombatants.value.add(combatantId);
      }
    }
  }

  /**
   * Reset all theatre state (call when combat ends or new combat starts).
   */
  function resetTheatreState(): void {
    displayHealthInitialized.value = false;
    displayHealth.value.clear();
    deadCombatants.value.clear();
  }

  return {
    // State
    displayHealth,
    displayHealthInitialized,
    deadCombatants,

    // Methods
    initializeDisplayHealth,
    getDisplayHealth,
    applyDisplayDamage,
    findCombatantIdByName,
    resetTheatreState,
  };
}
