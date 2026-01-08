---
phase: 03-code-quality-helpers
plan: 04
subsystem: rules
tags: [helpers, refactoring, code-quality, deduplication]

# Dependency graph
requires:
  - phase: 03-01
    provides: cache helpers (getCachedValue, setCachedValue, clearCachedValue), getUnitName
  - phase: 03-02
    provides: pattern for replacing duplicates
  - phase: 03-03
    provides: pattern established in rebel-equipment.ts
provides:
  - All action files using shared helpers
  - Phase 3 complete
affects: [04-code-quality-state-legacy]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared helper usage, generic cache pattern with composite keys]

key-files:
  created: []
  modified: [src/rules/actions/day-one-actions.ts, src/rules/actions/dictator-actions.ts]

key-decisions:
  - "Removed unused getDictatorUnitName (dead code) instead of replacing usages"

patterns-established:
  - "All duplicate patterns extracted to helpers.ts across all action files"

issues-created: []

# Metrics
duration: 7min
completed: 2026-01-08
---

# Phase 3 Plan 04: Replace duplicates in day-one-actions.ts and dictator-actions.ts Summary

**Replaced 3 cache helper duplicates and removed 1 unused function - net reduction of ~30 lines, completing Phase 3 helper extraction**

## Performance

- **Duration:** 7 min
- **Started:** 2026-01-08T22:07:23Z
- **Completed:** 2026-01-08T22:14:04Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Replaced getCachedMercIds, setCachedMercIds, clearCachedMercIds with generic cache helpers in day-one-actions.ts
- Removed unused getDictatorUnitName function from dictator-actions.ts (dead code)
- Verified no remaining duplicate helper patterns in action files
- Phase 3: Code Quality: Helpers complete

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace cache helpers in day-one-actions.ts** - `f936638` (feat)
2. **Task 2: Remove unused getDictatorUnitName in dictator-actions.ts** - `2733ffa` (feat)
3. **Task 3: Final verification and cleanup** - (no commit, verification only)

**Plan metadata:** (pending)

## Files Created/Modified

- `src/rules/actions/day-one-actions.ts` - Replaced 3 local cache functions with shared helpers, removed ~24 lines
- `src/rules/actions/dictator-actions.ts` - Removed unused getDictatorUnitName function, removed ~6 lines

## Decisions Made

- Removed getDictatorUnitName instead of replacing usages because it was dead code (defined but never called)
- Kept getMercsFromCache as a local wrapper since it provides domain-specific logic (converting IDs to MercCard objects)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing test failures unrelated to this plan (dictator setup, MERC abilities, flow state issues)
- Pre-existing TypeScript errors (aiSelect, defer, skipIf properties) unrelated to cache helper changes

## Phase 3 Complete Summary

### Total Lines Removed Across All Files (Phase 3)

| File | Lines Removed | Helpers Replaced |
|------|---------------|------------------|
| rebel-economy.ts | ~62 lines | isDictatorCard, getUnitName, findMercSector, cache helpers |
| rebel-equipment.ts | ~74 lines | isDictatorCard, getUnitName, findUnitSector, Hagness cache helpers |
| day-one-actions.ts | ~24 lines | cache helpers (getCachedMercIds, etc.) |
| dictator-actions.ts | ~6 lines | getDictatorUnitName (dead code) |
| **Total** | **~166 lines** | **17 duplicate patterns** |

### Helper Functions Added in Phase 3

- `isDictatorCard(unit)` - Type guard for DictatorCard
- `getUnitName(unit)` - Get display name from MercCard or DictatorCard
- `findUnitSector(unit, player, game)` - Find sector containing a unit
- `getCachedValue<T>(game, prefix, playerId)` - Generic settings cache getter
- `setCachedValue<T>(game, prefix, playerId, value)` - Generic settings cache setter
- `clearCachedValue(game, prefix, playerId)` - Generic settings cache clearer

## Next Phase Readiness

- Phase 3: Code Quality: Helpers complete
- Ready for Phase 4: Code Quality: State & Legacy
- helpers.ts is now the single source for shared utilities

---
*Phase: 03-code-quality-helpers*
*Completed: 2026-01-08*
