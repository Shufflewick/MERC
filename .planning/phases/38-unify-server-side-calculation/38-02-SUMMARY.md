---
phase: 38-unify-server-side-calculation
plan: 02
subsystem: rules
tags: [stat-modifiers, abilities, combatant, elements, game]

# Dependency graph
requires:
  - phase: 38-01
    provides: activeStatModifiers, buildStatModifierContext, updateAbilityBonuses, getAbilityBonus
provides:
  - Unified stat calculation using getAbilityBonus() in updateComputedStats
  - Unified stat getters (initiative, training, combat) using getAbilityBonus()
  - updateSquadBonuses using unified updateAbilityBonuses
  - Deprecated updateHaargBonusForSquad and updateAllHaargBonuses (delegate to unified)
affects: [39-unify-ui-breakdown, 40-unify-combat-time-application]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single source of truth: stat calculations read from activeStatModifiers via getAbilityBonus()"
    - "Unified entry point: game.updateSquadBonuses calls merc.updateAbilityBonuses for all squad members"

key-files:
  created: []
  modified:
    - src/rules/elements.ts
    - src/rules/game.ts

key-decisions:
  - "Removed extraCombat passive lookup from updateComputedStats - now handled by merc-abilities registry"
  - "Deprecated Haarg-specific methods rather than removing for backward compatibility"
  - "All stat getters now consistent with updateComputedStats (both use getAbilityBonus)"

patterns-established:
  - "All stat calculations (cached and real-time) use getAbilityBonus() for ability bonuses"
  - "updateSquadBonuses is now the single entry point for squad ability bonus updates"

# Metrics
duration: 3min
completed: 2026-02-03
---

# Phase 38 Plan 02: Integrate Unified Stat Calculation Summary

**Replaced hardcoded bonus field additions with unified getAbilityBonus() calls across all stat calculation paths**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-03T19:36:52Z
- **Completed:** 2026-02-03T19:39:15Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- updateComputedStats() now uses getAbilityBonus() for training, initiative, combat
- getEffectiveInitiative() now uses getAbilityBonus() for all ability bonuses
- Stat getters (initiative, training, combat) now use getAbilityBonus()
- game.ts updateSquadBonuses() calls merc.updateAbilityBonuses() for all MERCs
- Deprecated Haarg-specific methods delegate to unified system
- All 580 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Update updateComputedStats to use getAbilityBonus** - `09b3246` (feat)
2. **Task 2: Update stat getters to use unified getAbilityBonus** - `2f09054` (feat)
3. **Task 3: Update game.ts to use unified updateAbilityBonuses** - `8abe833` (feat)

## Files Created/Modified
- `src/rules/elements.ts` - Updated updateComputedStats, getEffectiveInitiative, and stat getters
- `src/rules/game.ts` - Updated updateSquadBonuses, deprecated Haarg-specific methods

## Decisions Made
- Removed individual bonus field additions (haargTrainingBonus, sargeTrainingBonus, etc.) from stat calculations - now handled by getAbilityBonus()
- Removed extraCombat passive lookup from updateComputedStats - this is now part of the merc-abilities registry
- Deprecated rather than removed updateHaargBonusForSquad and updateAllHaargBonuses for backward compatibility with existing action code

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Server-side unification complete
- Ready for Phase 39 (Unify UI Breakdown) to use activeStatModifiers for UI display
- Old individual bonus fields still exist on CombatantBase (can be removed in Phase 40)
- Old updateXBonus methods still exist on CombatantBase (deprecated, can be removed in Phase 40)

---
*Phase: 38-unify-server-side-calculation*
*Completed: 2026-02-03*
