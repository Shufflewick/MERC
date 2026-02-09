---
phase: 50-tactics-card-audit
plan: 01
subsystem: combat, tactics
tags: [tactics-cards, combat-bonuses, militia-placement, block-trade, generalissimo, lockdown]

# Dependency graph
requires:
  - phase: 49-sector-panel-audit
    provides: clean sector panel with correct auto-fill behavior
provides:
  - Clean combat.ts without fabricated base defense bonuses
  - Block Trade with correct militia placement per CSV rules
  - Foundation for correct Generalissimo/Lockdown rewrites in plans 03/04
affects: [50-03 (Generalissimo rewrite), 50-04 (Lockdown rewrite)]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/rules/combat.ts
    - src/rules/game.ts
    - src/rules/tactics-effects.ts
    - tests/combat-execution.test.ts

key-decisions:
  - "Fabricated base defense bonuses removed entirely (not repurposed) since they have no basis in CSV rules"
  - "Block Trade places militia on ALL cities (not just newly flipped ones) per CSV wording"

patterns-established: []

# Metrics
duration: 2min
completed: 2026-02-08
---

# Phase 50 Plan 01: Tactics Card Audit - Fabricated Bonuses & Block Trade Summary

**Removed fabricated generalisimoActive/lockdownActive combat bonuses and fixed Block Trade to place militia on all cities per expansion CSV rules**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-09T02:37:50Z
- **Completed:** 2026-02-09T02:39:44Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Removed fabricated +1 combat (generalisimoActive) and +1 armor (lockdownActive) base defense bonuses from combat system
- Removed applyBaseDefenseBonuses function and its call site in executeCombat
- Removed 3 test cases that validated fabricated bonus behavior
- Fixed Block Trade to flip unexplored cities AND place ceil(rebelCount/2) militia on ALL cities
- Added combat triggering when rebels are present at cities receiving militia

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove fabricated base defense bonuses from combat system** - `90c42e6` (fix)
2. **Task 2: Fix Block Trade to place militia on flipped cities** - `8b3b5e1` (fix)

## Files Created/Modified
- `src/rules/combat.ts` - Removed applyBaseDefenseBonuses function (44 lines) and its call site
- `src/rules/game.ts` - Removed generalisimoActive and lockdownActive property declarations
- `src/rules/tactics-effects.ts` - Rewrote blockTrade to add militia placement and combat triggering
- `tests/combat-execution.test.ts` - Removed 3 fabricated bonus test cases (Base Defense Bonuses describe block)

## Decisions Made
- **Fabricated bonuses removed entirely:** The generalisimoActive (+1 combat at base) and lockdownActive (+1 armor at base) flags have no basis in any CSV rules document. They were removed rather than repurposed. The flags still exist in tactics-effects.ts (where they are set to true) but will be removed when those functions are rewritten in plans 03 and 04.
- **Block Trade places militia on ALL cities:** The CSV says "Add half rebel count (round up) militia to each city" -- "each city" means all cities, not just the ones that were flipped from unexplored to explored.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Combat system is clean of fabricated bonuses, ready for correct Generalissimo (plan 03) and Lockdown (plan 04) implementations
- The generalisimoActive/lockdownActive flags still exist in tactics-effects.ts but are now dead code (no consumers) -- they will be removed when those effect functions are rewritten
- All 650 tests pass with no regressions

---
*Phase: 50-tactics-card-audit*
*Completed: 2026-02-08*
