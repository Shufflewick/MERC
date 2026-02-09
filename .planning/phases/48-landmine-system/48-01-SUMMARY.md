---
phase: 48-landmine-system
plan: 01
subsystem: game-logic
tags: [landmine, combat, squidhead, equipment, bidirectional, tdd]

# Dependency graph
requires:
  - phase: none
    provides: Existing equipment-effects.ts, merc-abilities.ts, elements.ts infrastructure
provides:
  - "checkLandMines() -- shared bidirectional landmine trigger function"
  - "LandmineResult interface for callers to inspect detonation/disarm outcomes"
  - "Squidhead auto-disarm to discard pile on sector entry"
  - "Friendly mine detection (entering player controls sector unopposed)"
affects: [48-02 movement action wiring, 48-03 combat.ts cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bidirectional damage: single function handles both rebel-entering and dictator-entering via enteringPlayerIsRebel flag"
    - "Friendly mine detection: mine is friendly only when entering player has militia AND no enemy forces (exclusive control)"

key-files:
  created:
    - src/rules/landmine.ts
    - tests/landmine.test.ts
  modified: []

key-decisions:
  - "Friendly mine heuristic: mine is friendly when entering player has militia AND no enemies. Contested sectors (both sides present) always trigger the mine."
  - "Auto-disarm always discards the mine to accessory discard pile. Never equips on Squidhead, never leaves in stash."
  - "Uses game.animate() with mutations inside callback for theatre view compatibility. Messages logged outside callback."

patterns-established:
  - "Movement-triggered effects: checkLandMines() is called after squad.sectorId is set, before hasEnemies() check"
  - "Bidirectional function pattern: single enteringPlayerIsRebel flag controls which side takes damage"

# Metrics
duration: 5min
completed: 2026-02-08
---

# Phase 48 Plan 01: checkLandMines Summary

**TDD-built bidirectional landmine trigger with Squidhead counter-ability, friendly mine detection, and theatre-view-compatible animation**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-09T01:36:46Z
- **Completed:** 2026-02-09T01:42:31Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- Created `checkLandMines()` function handling all 5 landmine cases: no-op, rebel detonation, dictator detonation, Squidhead disarm, and friendly mine
- Bidirectional damage: same function works whether rebel or dictator triggers the mine, determined by `enteringPlayerIsRebel` flag
- Squidhead auto-disarm sends mine to accessory discard pile (resolved design decision from plan)
- Friendly mine detection uses dual check: entering player has militia AND no enemies present (exclusive sector control)
- 16 tests covering all cases including edge cases for damage amount helpers and ability registry
- Full test suite (653 tests) passes with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for checkLandMines** - `bb2e5bb` (test)
2. **Task 1 (GREEN): Implement checkLandMines** - `f70dd9b` (feat)

_TDD task: RED committed failing tests with stub, GREEN committed working implementation._

## Files Created/Modified
- `src/rules/landmine.ts` - Shared bidirectional landmine trigger function (checkLandMines, LandmineResult, internal helpers)
- `tests/landmine.test.ts` - 16 tests covering all 5 landmine cases plus edge cases

## Decisions Made

1. **Friendly mine = exclusive control:** A mine is friendly only when the entering player has militia AND no enemies. If the sector is contested (both sides have forces), the mine fires. If the sector is empty (no militia from either side), the mine fires. This handles the scenario where a dictator mine is still in stash but rebels have moved in -- if dictator forces remain, the mine is hostile.

2. **Auto-disarm always discards:** Per plan's resolved decision. Squidhead's auto-disarm on sector entry sends the mine directly to the accessory discard pile. This is simpler than the manual `squidheadDisarm` action which tries to equip.

3. **Militia-only friendly check:** Friendly mine detection uses militia presence, not merc/squad presence. Squads are the entering units (they trigger the mine), while militia are persistent control indicators. This avoids the circular problem of checking if the entering squad's own mercs count as "pre-existing presence."

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed militia test scenarios to include enemy presence**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Original test cases for "kills ALL militia" had entering player's militia but no enemies, causing the friendly-mine check to skip detonation. The tests were describing an impossible real-game scenario (your own mine killing your own militia with no enemies around).
- **Fix:** Added enemy militia to militia-killing test scenarios to make the mine hostile (contested sector with both sides present). This matches how mines actually work: the mine was planted by an enemy, and the sector is contested.
- **Files modified:** tests/landmine.test.ts
- **Verification:** All 16 tests pass
- **Committed in:** f70dd9b (GREEN phase commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test setup)
**Impact on plan:** Test correction was necessary for logical consistency. The core implementation matches the plan specification exactly.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `checkLandMines()` is ready to be wired into movement actions (Plan 02)
- The function accepts `enteringSquads: Squad[]` to handle both single-squad moves and coordinated attacks
- The `LandmineResult` return value lets callers know if detonation occurred (for deciding whether combat should still start)
- The existing `detonateLandMines()` in ai-combat-helpers.ts and the call in combat.ts:2502 should be removed in Plan 02/03

---
*Phase: 48-landmine-system*
*Completed: 2026-02-08*
