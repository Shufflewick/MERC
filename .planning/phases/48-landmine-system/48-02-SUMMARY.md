---
phase: 48-landmine-system
plan: 02
subsystem: game-logic
tags: [landmine, movement, combat, wiring, rebel-movement]

# Dependency graph
requires:
  - phase: 48-01
    provides: checkLandMines() function in src/rules/landmine.ts
provides:
  - "checkLandMines() wired into all 3 movement actions (move, coordinatedAttack, executeCoordinatedAttack)"
  - "Old detonateLandMines() call removed from combat.ts -- no double-detonation possible"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Movement-triggered landmine check: always called after squad.sectorId assignment, before hasEnemies() check"
    - "Coordinated attack collects entering squads during movement loop for single checkLandMines() call"

key-files:
  created: []
  modified:
    - src/rules/actions/rebel-movement.ts
    - src/rules/combat.ts

key-decisions:
  - "isRebel flag reused from existing scope in move action (already computed at line 213)"
  - "Coordinated attacks hardcode true for enteringPlayerIsRebel since both actions are rebel-only"

patterns-established:
  - "Movement action wiring: import from landmine.ts, call between squad relocation and hasEnemies()"

# Metrics
duration: 2min
completed: 2026-02-08
---

# Phase 48 Plan 02: Wire checkLandMines into Movement Actions Summary

**checkLandMines() wired into all 3 movement entry points with old detonateLandMines() call removed from combat.ts**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-09T01:44:33Z
- **Completed:** 2026-02-09T01:46:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Wired `checkLandMines()` into move, coordinatedAttack, and executeCoordinatedAttack actions
- Correct ordering enforced: squad.sectorId assignment -> checkLandMines() -> hasEnemies()
- Removed old `detonateLandMines()` call from combat.ts (line 2502) and its import
- All 653 existing tests pass with no regressions
- TypeScript compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire checkLandMines into all movement actions** - `10c4f59` (feat)
2. **Task 2: Remove old detonateLandMines call from combat.ts** - `9ff3225` (fix)

## Files Created/Modified
- `src/rules/actions/rebel-movement.ts` - Added checkLandMines import and 3 call sites (move, coordinatedAttack, executeCoordinatedAttack)
- `src/rules/combat.ts` - Removed detonateLandMines import and MERC-b65 call site

## Decisions Made
None - followed plan as specified.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All landmine detonation now happens at the movement level via `checkLandMines()`
- The old `detonateLandMines()` function in `ai-combat-helpers.ts` and its re-export from `ai-helpers.ts` remain for reference but are no longer called
- Phase 48 landmine system is complete: core logic (Plan 01) + wiring (Plan 02)

---
*Phase: 48-landmine-system*
*Completed: 2026-02-08*
