---
phase: 17-hiring-unification
plan: 01
subsystem: gameplay
tags: [merc-abilities, hiring, apeiron, vrbansk]

# Dependency graph
requires:
  - phase: 16-abilities-for-controller
    provides: Apeiron/Vrbansk abilities work for controller
provides:
  - Shared equipNewHire helper for all hire paths
  - Unified Apeiron grenade/mortar redraw logic
  - Unified Vrbansk free accessory logic
affects: [hiring, merc-abilities]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared helper functions for cross-cutting MERC abilities"

key-files:
  created: []
  modified:
    - src/rules/actions/helpers.ts
    - src/rules/day-one.ts
    - src/rules/dictator-abilities.ts
    - src/rules/actions/dictator-actions.ts
    - src/rules/actions/rebel-economy.ts

key-decisions:
  - "Extracted equipNewHire helper to helpers.ts rather than creating new module"
  - "Helper handles both Apeiron and Vrbansk in one call for atomic hire"

patterns-established:
  - "MERC hire abilities handled via equipNewHire helper"

issues-created: []

# Metrics
duration: 4min
completed: 2026-01-13
---

# Phase 17 Plan 01: Hiring Unification Summary

**Shared equipNewHire helper function unifies Apeiron/Vrbansk ability handling across all 4 hire paths**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-13T21:39:19Z
- **Completed:** 2026-01-13T21:43:39Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Created `equipNewHire(game, merc, equipType)` helper in helpers.ts
- MERC-70a: Apeiron grenade/mortar redraw logic now shared
- MERC-9mxd: Vrbansk free accessory logic now shared
- All 4 hire paths (rebel + 3 dictator) use the same implementation
- Removed ~50 lines of duplicate code from rebel-economy.ts

## Task Commits

1. **Task 1: Extract shared equipNewHire helper function** - `aa15252` (feat)
2. **Task 2: Update all dictator hire paths to use equipNewHire** - `f128454` (feat)
3. **Task 3: Update rebel hire path to use shared helper** - `e4ab0b1` (refactor)

## Files Created/Modified

- `src/rules/actions/helpers.ts` - Added equipNewHire helper with MERC-70a/MERC-9mxd logic
- `src/rules/day-one.ts` - hireDictatorMerc now uses equipNewHire
- `src/rules/dictator-abilities.ts` - applyCastroTurnAbility now uses equipNewHire
- `src/rules/actions/dictator-actions.ts` - createCastroBonusHireAction now uses equipNewHire
- `src/rules/actions/rebel-economy.ts` - hireMerc action now uses equipNewHire

## Decisions Made

- Placed helper in existing helpers.ts rather than creating new module (consistency with other helpers)
- Helper handles replaced equipment by sending to discard (not sector stash, matches dictator behavior)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Hiring unification complete
- Ready for Phase 18: Data Consistency

---
*Phase: 17-hiring-unification*
*Completed: 2026-01-13*
