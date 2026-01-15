---
phase: 29-rules-layer-id-cleanup
plan: 01
subsystem: rules
tags: [refactoring, naming, typescript, state-types]

# Dependency graph
requires:
  - phase: 28-remove-legacy-comments
    provides: Clean codebase without legacy comments
provides:
  - Consistent combatantId/combatantName naming in state types
  - Renamed getCombatantId utility function
  - Updated pendingEpinephrine and pendingHitAllocation structures
affects: [30-ui-layer-id-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/rules/game.ts
    - src/rules/combat.ts
    - src/rules/actions/rebel-combat.ts
    - src/rules/actions/rebel-economy.ts
    - src/ui/components/CombatPanel.vue

key-decisions:
  - "Preserved dictatorId in setup context (semantically correct - selects which dictator character)"

patterns-established: []

issues-created: []

# Metrics
duration: 8min
completed: 2026-01-15
---

# Phase 29 Plan 01: Update Core State Types Summary

**State types and combat utilities now use combatantId/combatantName consistently, eliminating mercId naming from type definitions**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-15T21:42:00Z
- **Completed:** 2026-01-15T21:50:42Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Updated `lastExplorer` type from `mercId` to `combatantId` in game.ts
- Updated `pendingEpinephrine` type fields (dyingMercId → dyingCombatantId, etc.)
- Updated `pendingHitAllocation` type (attackerMercId → attackerCombatantId)
- Renamed `getCombatantMercId` function to `getCombatantId` in combat.ts
- Updated all local variable names and references throughout combat utilities

## Task Commits

Each task was committed atomically:

1. **Task 1: Update game.ts state types** - `f6a71d6` (refactor)
2. **Task 2: Update combat.ts utilities** - `20d6f48` (refactor)
3. **Task 3: Update combat action usages** - `b9c546d` (refactor)

## Files Created/Modified

- `src/rules/game.ts` - Updated state type definitions (lastExplorer, pendingEpinephrine, pendingHitAllocation)
- `src/rules/combat.ts` - Renamed function and updated 13+ local variable names
- `src/rules/actions/rebel-combat.ts` - Updated pendingEpinephrine field references
- `src/rules/actions/rebel-economy.ts` - Updated lastExplorer.combatantId usage
- `src/ui/components/CombatPanel.vue` - Updated type definition to match

## Decisions Made

- Preserved `dictatorId` in MERCGameOptions and setup functions (lines 65, 754-757, 932, 984-989) - semantically correct as it selects which dictator character to use, not an identity field

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added rebel-economy.ts updates**
- **Found during:** Task 1 (game.ts state types)
- **Issue:** Plan only mentioned game.ts, but rebel-economy.ts uses `lastExplorer.mercId` which needed updating
- **Fix:** Updated to use `lastExplorer.combatantId`
- **Files modified:** src/rules/actions/rebel-economy.ts
- **Verification:** Build passes
- **Committed in:** f6a71d6 (Task 1 commit)

**2. [Rule 3 - Blocking] Added CombatPanel.vue updates**
- **Found during:** Task 3 (combat action usages)
- **Issue:** CombatPanel.vue has a type definition mirroring rules layer that needed updating
- **Fix:** Updated `attackerMercId` to `attackerCombatantId` in type definition
- **Files modified:** src/ui/components/CombatPanel.vue
- **Verification:** Build passes
- **Committed in:** b9c546d (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both blocking - build would fail without them), 0 deferred
**Impact on plan:** Both fixes necessary for build to pass. No scope creep.

## Issues Encountered

None

## Next Phase Readiness

- Core state types and combat utilities now use combatantId consistently
- Ready for 29-02: Update action layer files (rebel-equipment.ts, day-one-actions.ts)

---
*Phase: 29-rules-layer-id-cleanup*
*Completed: 2026-01-15*
