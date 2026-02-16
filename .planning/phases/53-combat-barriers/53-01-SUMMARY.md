---
phase: 53-combat-barriers
plan: 01
subsystem: flow-engine
tags: [combat-barriers, simultaneous-play, integration-tests, flow-engine]

dependency-graph:
  requires: [52-simultaneous-rebel-step]
  provides: [barrier-verification-tests]
  affects: []

tech-stack:
  added: []
  patterns: [barrier-exit-resume-via-allDone, manual-state-injection-testing]

key-files:
  created:
    - tests/combat-barriers.test.ts
  modified:
    - src/rules/day-one.ts

decisions:
  - id: 53-01-01
    summary: "Manual pendingCombat/coordinatedAttack injection instead of natural combat trigger"
    reason: "Natural combat requires specific board layout (militia in reachable sector). Manual state injection tests the same flow path — the move action just sets game.pendingCombat."
  - id: 53-01-02
    summary: "Identify rebel-actions step by available actions rather than step name"
    reason: "BoardSmith FlowState does not expose stepName. Rebel simultaneous step identified by awaitingPlayers with Day 2+ rebel actions (move, endTurn, etc.)."
  - id: 53-01-03
    summary: "Multi-seed iteration pattern for test robustness"
    reason: "Game state depends on random seed affecting board layout, AI choices, and equipment draws. Tests try multiple seeds to find viable game states."

metrics:
  duration: "~12 minutes"
  completed: "2026-02-16"
---

# Phase 53 Plan 01: Combat Barrier Integration Tests Summary

Integration tests proving the combat barrier architecture (built in Phase 52) correctly synchronizes simultaneous rebel play around combat and coordinated attack events.

## What Was Done

### Task 1: Write combat barrier integration tests
**Commit:** 5804e97

Created `tests/combat-barriers.test.ts` with 5 passing tests across 3 test groups:

**Test Group 1: Combat Barrier (FLOW-03)** — 2 tests
- `should exit simultaneous step when pendingCombat is set and resume after combat resolves`: Injects pendingCombat during rebel actions, triggers allDone via endTurn, drives through combat resolution, verifies rebel-actions step re-enters with remaining rebel.
- `should drain pendingCombatQueue before re-entering simultaneous step`: Queues 2 pending combats, verifies both are fully resolved before the simultaneous step resumes.

**Test Group 2: Coordinated Attack Barrier (FLOW-04)** — 1 test
- `should exit simultaneous step when coordinatedAttack is set and resume after resolution`: Injects coordinatedAttack with pre-declined second rebel, triggers allDone, verifies coordinatedAttack is cleared and rebel actions resume.

**Test Group 3: Done Before Barrier Preservation** — 2 tests
- `should not include a rebel who ended turn in awaitingPlayers after combat barrier resolves`: Rebel1 ends turn (actionsRemaining=0), then barrier fires. After resolution, rebel1 is NOT in awaitingPlayers while rebel2 is.
- `should preserve done state through multiple consecutive barriers`: Same setup with 2 sequential barriers. Rebel1 stays done through both. Handles day advancement correctly.

### Task 2: Fix any flow bugs (conditional)
No-op. All tests passed on first run after fixing the blocking module issue. No flow bugs discovered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed dynamic require in day-one.ts**
- **Found during:** Task 1 (3-player game setup)
- **Issue:** `autoPlaceExtraMilitia()` in day-one.ts used `require('./ai-helpers.js')` (CJS dynamic import) which fails in vitest's ESM environment. This blocked all 3-player game tests because dictator AI extra militia placement (extra=4 for 2 rebels) always threw `MODULE_NOT_FOUND`.
- **Fix:** Added `distributeExtraMilitiaEvenly` to the existing static ESM import from `./ai-helpers.js` (line 15), replaced the `require()` with a comment.
- **Files modified:** `src/rules/day-one.ts`
- **Commit:** 5804e97

**2. [Rule 3 - Blocking] FlowState does not expose stepName**
- **Found during:** Task 1 (step identification)
- **Issue:** Plan assumed `flowState.stepName` would identify the `rebel-actions` simultaneous step. BoardSmith's `FlowState` interface has no `stepName` property.
- **Fix:** Created `isRebelActionsStep()` helper that identifies the step by checking `awaitingPlayers` presence, `currentDay >= 2`, and available actions containing rebel Day 2+ actions (`move`, `endTurn`, etc.).
- **Files modified:** `tests/combat-barriers.test.ts` (test infrastructure only)
- **Commit:** 5804e97

## Verification

1. `npx vitest run tests/combat-barriers.test.ts` — 5/5 tests pass
2. `npx vitest run` — 688 passed, 7 skipped, 1 pre-existing timeout (mcts-clone bot test)
3. All 3 success criteria covered:
   - FLOW-03: Combat barrier exit + re-entry verified (2 tests)
   - FLOW-04: Coordinated attack barrier exit + re-entry verified (1 test)
   - Done preservation: Players who ended turn before barrier stay done (2 tests)

## Next Phase Readiness

No blockers. The barrier architecture works correctly as implemented in Phase 52. All success criteria for Phase 53 have been verified.
