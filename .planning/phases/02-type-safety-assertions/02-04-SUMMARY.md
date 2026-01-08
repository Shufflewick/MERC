---
phase: 02-type-safety-assertions
plan: 04
subsystem: game-logic
tags: [type-assertions, typescript, rebel-movement, type-guards]

# Dependency graph
requires:
  - phase: 02-01
    provides: type guard utilities (asRebelPlayer, asSector, asMercCard)
provides:
  - Properly typed rebel-movement.ts
  - asSquad helper added to helpers.ts
  - asRebelPlayer/asRebelPlayerOrNull now accept unknown
affects: [02-05, 02-06, 02-07, 02-08]

# Tech tracking
tech-stack:
  added: []
  patterns: [type-guard-narrowing, unknown-param-pattern]

key-files:
  created: []
  modified:
    - src/rules/actions/rebel-movement.ts
    - src/rules/actions/helpers.ts

key-decisions:
  - "Changed asRebelPlayer to accept unknown for framework compatibility"
  - "Changed internal helper function params from any to unknown"
  - "Used type guard narrowing instead of explicit casts where possible"

patterns-established:
  - "Helper functions accepting players should use unknown param with type guard"
  - "Use asX() helpers for all element type assertions in filters and execute blocks"

issues-created: []

# Metrics
duration: 16min
completed: 2026-01-08
---

# Phase 2 Plan 4: rebel-movement.ts Type Assertions Summary

**Eliminated all 14 `as any` casts and 9 `as unknown as` patterns in rebel-movement.ts using type guards and assertion helpers**

## Performance

- **Duration:** 16 min
- **Started:** 2026-01-08T19:39:18Z
- **Completed:** 2026-01-08T19:56:17Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Removed all `as any` casts from isRebelPlayer/isDictatorPlayer calls (14 instances)
- Replaced all `as unknown as` patterns with type-safe helpers (9 instances)
- Added `asSquad()` helper to helpers.ts
- Changed asRebelPlayer/asRebelPlayerOrNull to accept `unknown` for framework compatibility
- Changed internal helper function params from `any` to `unknown` with type guard narrowing

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove player as any casts** - `6cc3641` (feat)
2. **Task 2: Fix element and player assertions** - `6da4019` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/rules/actions/rebel-movement.ts` - Replaced unsafe assertions with type guards and helpers
- `src/rules/actions/helpers.ts` - Added asSquad helper, changed asRebelPlayer to accept unknown

## Decisions Made

- Changed `asRebelPlayer(player: MERCPlayer)` to `asRebelPlayer(player: unknown)` to allow it to accept BoardSmith's base `Player<Game>` type from `ctx.player`. The type guard `isRebelPlayer` validates the type at runtime.
- Changed internal helper functions (`getMovableSquads`, `isSquadOwnedByPlayer`, `isAdjacentToMovableSquad`) from `player: any` to `player: unknown`, then used type guards to narrow the type within the function body.
- Used `asSquad()`, `asSector()`, `asMercCard()`, `asRebelPlayer()` helpers consistently throughout for all element/player assertions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added asSquad helper**
- **Found during:** Task 2 (element assertions)
- **Issue:** Plan mentioned using `asSquad()` but helper didn't exist
- **Fix:** Added `asSquad()` to helpers.ts following existing pattern
- **Files modified:** src/rules/actions/helpers.ts
- **Verification:** TypeScript compiles, pattern consistent with other helpers
- **Committed in:** 6da4019 (Task 2 commit)

**2. [Rule 3 - Blocking] Changed asRebelPlayer signature**
- **Found during:** Task 2 (TypeScript errors)
- **Issue:** `asRebelPlayer(MERCPlayer)` couldn't accept `ctx.player` which is `Player<Game<any, any>>`
- **Fix:** Changed to `asRebelPlayer(unknown)` since it uses type guard internally
- **Files modified:** src/rules/actions/helpers.ts
- **Verification:** TypeScript compiles, no type errors in rebel-movement.ts
- **Committed in:** 6da4019 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Both fixes necessary for correct operation. No scope creep.

## Issues Encountered

None - plan executed smoothly. Pre-existing test failures (13) unrelated to type assertion changes.

## Next Phase Readiness

- rebel-movement.ts fully typed with proper assertion helpers
- Pattern established for remaining files: use `unknown` param + type guard narrowing
- asSquad helper now available for other files needing Squad type assertions
- Ready for 02-05-PLAN.md (rebel-economy.ts)

---
*Phase: 02-type-safety-assertions*
*Completed: 2026-01-08*
