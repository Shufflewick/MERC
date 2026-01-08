---
phase: 02-type-safety-assertions
plan: 05
subsystem: game-logic
tags: [type-assertions, typescript, rebel-economy, type-guards]

# Dependency graph
requires:
  - phase: 02-01
    provides: type guard utilities (asRebelPlayer, asMercCard, asSector, asEquipment)
  - phase: 02-04
    provides: unknown-param-pattern for helper functions
provides:
  - Properly typed rebel-economy.ts with no `as any` or `as unknown as` patterns
affects: [02-06, 02-07, 02-08]

# Tech tracking
tech-stack:
  added: []
  patterns: [instanceof-narrowing, type-guard-in-filter]

key-files:
  created: []
  modified:
    - src/rules/actions/rebel-economy.ts

key-decisions:
  - "Used instanceof checks in filter callbacks instead of casts"
  - "Changed helper function params from any to unknown with type guards"
  - "Used getElementById with instanceof narrowing instead of direct casts"

patterns-established:
  - "For getElementById results, use instanceof check instead of casting"
  - "In filter callbacks, check instanceof before property access"

issues-created: []

# Metrics
duration: 11min
completed: 2026-01-08
---

# Phase 2 Plan 5: rebel-economy.ts Type Assertions Summary

**Eliminated all 15 `as any` casts and 3 `as unknown as` patterns in rebel-economy.ts using type guards and instanceof checks**

## Performance

- **Duration:** 11 min
- **Started:** 2026-01-08T20:15:10Z
- **Completed:** 2026-01-08T20:26:57Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Removed all `as any` casts from isRebelPlayer/isDictatorPlayer calls (15 instances)
- Replaced all `as unknown as` patterns with instanceof checks (3 instances)
- Changed 10+ helper function params from `any` to `unknown` with type guard narrowing
- Added asRebelPlayer, asMercCard, asSector, asEquipment imports

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix player assertions** - `d0226f5` (feat)
2. **Task 2: Fix element and args assertions** - `ec7b9d3` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/rules/actions/rebel-economy.ts` - Replaced unsafe assertions with type guards and instanceof checks

## Decisions Made

- Changed helper functions like `findUnitSectorForExplore`, `isUnitOwnedForExplore`, `canUnitExplore`, `getPlayerUnitsForExplore`, `findUnitSectorForTrain`, `canUnitTrain`, `getPlayerUnitsForTrain`, `getPlayerMercsForCity`, `isMercOwnedForCity`, `findMercSectorForCity`, `getSectorsWithStash` from `player: any` to `player: unknown`
- Used `asRebelPlayer()` after type guard checks instead of direct casts
- Used `instanceof` checks in filter callbacks for type narrowing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - the pre-existing TypeScript errors (related to BoardSmith typing) are unrelated to type assertion changes and exist throughout the codebase.

## Next Phase Readiness

- rebel-economy.ts fully typed with proper assertion helpers
- Pattern established: use `unknown` param + type guard narrowing for helper functions
- Ready for 02-06-PLAN.md (rebel-combat.ts)

---
*Phase: 02-type-safety-assertions*
*Completed: 2026-01-08*
