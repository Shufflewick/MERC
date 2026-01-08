---
phase: 03-code-quality-helpers
plan: 03
subsystem: rules
tags: [helpers, refactoring, code-quality, deduplication]

# Dependency graph
requires:
  - phase: 03-01
    provides: isDictatorCard, getUnitName, findUnitSector, cache helpers
  - phase: 03-02
    provides: pattern for replacing duplicates
provides:
  - rebel-equipment.ts using shared helpers instead of duplicates
affects: [03-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared helper usage, generic cache pattern with composite keys]

key-files:
  created: []
  modified: [src/rules/actions/rebel-equipment.ts]

key-decisions:
  - "Used composite key pattern (playerId:equipmentType) for Hagness cache"

patterns-established:
  - "Replace local duplicate functions with shared helpers from helpers.ts"

issues-created: []

# Metrics
duration: 4min
completed: 2026-01-08
---

# Phase 3 Plan 03: Replace duplicates in rebel-equipment.ts Summary

**Removed 6 duplicate local functions from rebel-equipment.ts, replacing them with shared helpers - net reduction of ~74 lines**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-08T21:53:00Z
- **Completed:** 2026-01-08T21:57:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Replaced isDictatorCardForEquip, getUnitNameForEquip, findUnitSectorForEquip, and findMercSectorForMortar with shared helpers
- Replaced Hagness equipment cache helpers with generic getCachedValue/setCachedValue using composite key pattern
- Net reduction: ~74 lines (92 deleted, 18 added for imports/replacements)

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace isDictatorCard, getUnitName, and findUnitSector duplicates** - `594e92d` (feat)
2. **Task 2: Replace Hagness equipment cache helpers** - `dff99ff` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `src/rules/actions/rebel-equipment.ts` - Removed 6 duplicate functions, updated imports to use shared helpers

## Decisions Made

- Used composite key pattern (playerId:equipmentType) for Hagness equipment cache to maintain the same key structure while leveraging shared utilities

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adapted to actual cache function names**
- **Found during:** Task 2 (Hagness cache helpers)
- **Issue:** Plan referenced non-existent functions (getHagnessEquipmentChoice, etc.) - actual implementation used getHagnessEquipmentId, setHagnessEquipmentId
- **Fix:** Adapted refactoring to the actual code structure
- **Files modified:** src/rules/actions/rebel-equipment.ts
- **Verification:** TypeScript compiles, cache behavior preserved
- **Committed in:** dff99ff (Task 2 commit)

---

**Total deviations:** 1 (adapted to actual code structure)
**Impact on plan:** Minor - same outcome achieved, just different function names than planned

## Issues Encountered

None

## Next Phase Readiness

- Ready for 03-04-PLAN.md (replace duplicates in day-one-actions.ts and dictator-actions.ts)
- Pattern well-established: update imports, remove local functions, replace usages with shared helpers

---
*Phase: 03-code-quality-helpers*
*Completed: 2026-01-08*
