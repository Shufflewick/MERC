---
phase: 02-type-safety-assertions
plan: 02
subsystem: type-safety
tags: [typescript, type-guards, assertions, tactics-cards, flow]

# Dependency graph
requires:
  - phase: 02-01
    provides: Type guard utilities in helpers.ts
provides:
  - Typed tactics card state on MERCGame (conscriptsActive, conscriptsAmount, oilReservesActive)
  - Proper type predicate guards for isRebelPlayer/isDictatorPlayer
  - Type-safe flow.ts with no unsafe casts
  - Type-safe tactics-effects.ts with no unsafe casts
affects: [02-03, 02-04, 02-05, 02-06, 02-07, 02-08]

# Tech tracking
tech-stack:
  added: []
  patterns: [type-predicates, typed-game-state]

key-files:
  created: []
  modified:
    - src/rules/game.ts
    - src/rules/flow.ts
    - src/rules/tactics-effects.ts

key-decisions:
  - "Added tactics card state as optional typed properties on MERCGame instead of using dynamic assignment"
  - "Changed type guards to accept `unknown` with type predicates for BoardSmith framework compatibility"

patterns-established:
  - "Type predicate pattern: isX(player: unknown): player is TypeX"
  - "Typed game state: Use optional properties for runtime-added state instead of dynamic assignment"

issues-created: []

# Metrics
duration: 8min
completed: 2026-01-08
---

# Phase 2 Plan 02: flow.ts and tactics-effects.ts Summary

**Added typed tactics card state to MERCGame and eliminated all unsafe `as any` casts from flow.ts and tactics-effects.ts**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-08T18:41:34Z
- **Completed:** 2026-01-08T18:49:43Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added 3 typed optional properties to MERCGame for tactics card state
- Eliminated all 8 `(game as any)` casts in tactics-effects.ts
- Eliminated all 5 `as any` casts in flow.ts
- Improved type guards with proper type predicates accepting `unknown`

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix tactics-effects.ts (game as any) patterns** - `53f9091` (feat)
2. **Task 2: Fix flow.ts player type assertions** - `9eeaf15` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `src/rules/game.ts` - Added conscriptsActive, conscriptsAmount, oilReservesActive properties; changed isRebelPlayer/isDictatorPlayer to proper type predicates
- `src/rules/tactics-effects.ts` - Removed 8 `(game as any)` casts, now uses typed game properties
- `src/rules/flow.ts` - Removed 5 `as any` casts from eachPlayer filters

## Decisions Made

- Added tactics card state as optional typed properties on MERCGame (conscriptsActive?: boolean, conscriptsAmount?: number, oilReservesActive?: boolean) rather than using settings or other dynamic storage. These are real game state that belongs on the game class.
- Changed isRebelPlayer/isDictatorPlayer signatures to `(player: unknown): player is RebelPlayer/DictatorPlayer`. This allows the type guards to accept the base Player type from BoardSmith framework while still providing type narrowing.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - plan executed smoothly.

## Next Phase Readiness

- Type guards now work cleanly with BoardSmith framework's Player type
- Pattern established for typed game state properties
- Ready for 02-03-PLAN.md (dictator-actions.ts)

---
*Phase: 02-type-safety-assertions*
*Completed: 2026-01-08*
