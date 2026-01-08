---
phase: 02-type-safety-assertions
plan: 08
subsystem: type-safety
tags: [typescript, type-guards, as-any, rebel-combat, ai-helpers, combat-unit]

# Dependency graph
requires:
  - phase: 02-01
    provides: Type guard utilities and isRebelPlayer helper
provides:
  - Zero `as any` casts in src/rules/
  - Type-safe rebel combat actions
  - Type-safe AI helper functions
affects: [phase-3-helpers, code-quality]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Use imported type guards instead of game.isRebelPlayer() with as any
    - Type arrays as CombatUnit[] when mixing MercCard and DictatorCard

key-files:
  created: []
  modified:
    - src/rules/actions/rebel-combat.ts
    - src/rules/ai-helpers.ts

key-decisions:
  - "Used imported isRebelPlayer helper for consistent type narrowing across files"
  - "Typed mixed MercCard/DictatorCard arrays as CombatUnit[] (shared base class)"

patterns-established:
  - "Import isRebelPlayer from helpers.ts instead of using game.isRebelPlayer(ctx.player as any)"
  - "Use CombatUnit[] for arrays containing both MercCards and DictatorCard"

issues-created: []

# Metrics
duration: 7min
completed: 2026-01-08
---

# Phase 2 Plan 8: Fix Remaining Files Summary

**Zero `as any` casts in src/rules/ - Phase 2 complete**

## Performance

- **Duration:** 7 min
- **Started:** 2026-01-08T21:24:20Z
- **Completed:** 2026-01-08T21:31:33Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Removed all 6 `as any` casts from rebel-combat.ts
- Removed 1 `as any` cast from ai-helpers.ts
- Verified combat.ts and elements.ts had zero `as any` (no changes needed)
- Phase 2 complete: src/rules/ has 0 `as any` casts remaining

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix combat.ts and rebel-combat.ts assertions** - `c892af9` (feat)
2. **Task 2: Fix ai-helpers.ts and elements.ts assertions** - `c150909` (feat)
3. **Task 3: Final verification and cleanup** - This metadata commit (docs)

## Files Created/Modified

- `src/rules/actions/rebel-combat.ts` - Replaced 6 `as any` casts with type guards
- `src/rules/ai-helpers.ts` - Typed units array as CombatUnit[] instead of using as any

## Decisions Made

- Used imported `isRebelPlayer` helper from helpers.ts for all ctx.player type checks
- Used `CombatUnit[]` typing for arrays containing both MercCard and DictatorCard (both extend CombatUnit)
- Used inline object type `{ value: unknown }` for choice object type narrowing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Phase 2 Summary

Phase 2 "Type Safety: Assertions" is now complete:

| File | `as any` Before | `as any` After |
|------|-----------------|----------------|
| src/rules/game.ts | Many | 0 |
| src/rules/flow.ts | Several | 0 |
| src/rules/tactics-effects.ts | Several | 0 |
| src/rules/actions/dictator-actions.ts | Many | 0 |
| src/rules/actions/rebel-movement.ts | Several | 0 |
| src/rules/actions/rebel-economy.ts | Several | 0 |
| src/rules/actions/rebel-equipment.ts | Many | 0 |
| src/rules/actions/day-one-actions.ts | Many | 0 |
| src/rules/actions/rebel-combat.ts | 6 | 0 |
| src/rules/ai-helpers.ts | 1 | 0 |
| **Total in src/rules/** | **191** | **0** |

## Next Phase Readiness

- Phase 2 complete, all `as any` casts removed from src/rules/
- Ready for Phase 3: Code Quality: Helpers
- Type guard infrastructure established in helpers.ts

---
*Phase: 02-type-safety-assertions*
*Completed: 2026-01-08*
