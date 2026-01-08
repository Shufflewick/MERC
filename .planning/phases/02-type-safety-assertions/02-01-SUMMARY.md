---
phase: 02-type-safety-assertions
plan: 01
subsystem: type-safety
tags: [typescript, type-guards, assertions, game-engine]

# Dependency graph
requires:
  - phase: 01-type-safety-combat
    provides: Type imports pattern using import type
provides:
  - Type assertion helpers (asRebelPlayer, asMercCard, asSector, etc.)
  - isRebelPlayer type guard
  - Safe game.ts with no `as any` casts
affects: [02-02, 02-03, 02-04, 02-05, 02-06, 02-07, 02-08]

# Tech tracking
tech-stack:
  added: []
  patterns: [type-guards, assertion-helpers, safe-casts]

key-files:
  created: []
  modified:
    - src/rules/actions/helpers.ts
    - src/rules/game.ts

key-decisions:
  - "Used constructor.name check for isRebelPlayer to avoid circular dependencies"
  - "Used `as unknown as ElementClass` pattern for classRegistry instead of `as any`"

patterns-established:
  - "Type guard pattern: isX(value) for type checking, asX(value) for assertion"
  - "Constructor name check for type guards when import cycles prevent instanceof"

issues-created: []

# Metrics
duration: 5min
completed: 2026-01-08
---

# Phase 2 Plan 01: Type Guard Utilities and game.ts Summary

**Created 8 type-safe assertion helpers and eliminated all `as any` casts from game.ts**

## Performance

- **Duration:** 5 min
- **Started:** 2026-01-08T18:33:50Z
- **Completed:** 2026-01-08T18:38:50Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added 8 type-safe assertion/guard helpers to helpers.ts
- Eliminated all 13 `as any` casts in game.ts classRegistry
- Established type guard pattern for use in remaining Phase 2 plans

## Task Commits

Each task was committed atomically:

1. **Task 1: Add typed assertion helpers** - `4394bf6` (feat)
2. **Task 2: Fix game.ts type assertions** - `f5ae4e2` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `src/rules/actions/helpers.ts` - Added 8 assertion helpers: isRebelPlayer, asRebelPlayer, asRebelPlayerOrNull, asMercCard, asSector, asTacticsCard, asEquipment, getTypedArg
- `src/rules/game.ts` - Replaced 13 `as any` casts with `as unknown as ElementClass` pattern

## Decisions Made

- Used `constructor.name === 'RebelPlayer'` check instead of instanceof to avoid circular dependency issues between helpers.ts and game.ts
- Used `as unknown as ElementClass` for classRegistry entries - this is necessary because element class constructors don't perfectly match the BoardSmith ElementClass signature, but the double-cast is safer than `as any` and documents the intentional type coercion

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added isRebelPlayer type guard**
- **Found during:** Task 1 (assertion helper implementation)
- **Issue:** The asRebelPlayer helper needed a type guard, but instanceof RebelPlayer caused circular dependency
- **Fix:** Added isRebelPlayer using constructor.name check
- **Files modified:** src/rules/actions/helpers.ts
- **Verification:** TypeScript compiles without errors
- **Committed in:** 4394bf6 (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor addition of type guard to support the planned assertion helper. No scope creep.

## Issues Encountered

None - plan executed smoothly.

## Next Phase Readiness

- Type guard utilities now available for remaining Phase 2 files
- Pattern established: use `asX()` helpers from helpers.ts for element type assertions
- Ready for 02-02-PLAN.md (flow.ts and tactics-effects.ts)

---
*Phase: 02-type-safety-assertions*
*Completed: 2026-01-08*
