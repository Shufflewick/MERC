# Phase 54 Plan 01: AI Rebel Action Batching Summary

AI rebel batch-round gating ensures all AI rebels complete round N before any starts round N+1 in simultaneous play. FLOW-05 (dictator combat sub-flow) verified at all 3 call sites.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add AI rebel batching state and methods to MERCGame, reset in flow.ts | 19d23e6 | src/rules/game.ts, src/rules/flow.ts |
| 2 | Wire AI batch gate condition and recording hook into all rebel actions | 2e4c3e3 | src/rules/actions/rebel-movement.ts, rebel-economy.ts, rebel-equipment.ts |
| 3 | Write FLOW-05 verification and AI-01 batching integration tests | 031a15d | tests/dictator-combat-subflow.test.ts, tests/ai-rebel-batching.test.ts |

## What Was Built

### AI Rebel Batching (AI-01)

**Game state (MERCGame):**
- Private `_rebelActionCounts` map and `_rebelBatchRound` counter (ephemeral, not serialized)
- `resetRebelBatching()` clears state before each simultaneous step entry
- `shouldGateAIAction(player)` returns true when an AI rebel is ahead of the current batch round
- `recordRebelActionForBatching(player)` increments count and auto-advances round when all AI rebels are caught up or done

**Action wiring (20 actions across 3 files):**
- `'ai batch gate'` condition added to all rebel simultaneous-step actions
- `recordRebelActionForBatching()` call added to each action's execute function, guarded by `isRebel() && isAI`

**Flow integration:**
- `resetRebelBatching()` called before Day 1 and Day 2+ simultaneous steps (including re-entry after combat barriers)

### FLOW-05 Verification

Structural test confirms all 3 `combatResolutionFlow` call sites in the dictator turn: tactics-combat, dictator-combat, kim-militia-combat.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Private properties for batch state | BoardSmith does not serialize private fields; batch state is ephemeral to the simultaneous step |
| Guard recording with `isRebel() && isAI` | Prevents dictator actions and human rebel actions from corrupting batch tracking |
| Reset test uses direct method call instead of full combat barrier simulation | Full barrier simulation is fragile in tests; structural verification confirms flow.ts calls reset |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan file-to-action mapping inaccurate**
- **Found during:** Task 2
- **Issue:** Plan listed actions under rebel-combat.ts that are actually in rebel-equipment.ts, rebel-movement.ts, and rebel-economy.ts
- **Fix:** Used grep to find actual action locations and updated them in their real files
- **Files modified:** rebel-movement.ts, rebel-economy.ts, rebel-equipment.ts

**2. [Rule 1 - Bug] Hospital action execute missing ctx parameter**
- **Found during:** Task 2
- **Issue:** hospital action's `.execute((args) => {...})` didn't have ctx parameter needed for the `ctx.player.isRebel() && ctx.player.isAI` guard
- **Fix:** Changed signature to `.execute((args, ctx) => {...})`
- **Files modified:** src/rules/actions/rebel-economy.ts

**3. [Rule 1 - Bug] Day 1 flow.ts needed sequence() wrapper**
- **Found during:** Task 1
- **Issue:** Adding `execute(() => game.resetRebelBatching())` before the Day 1 simultaneousActionStep required wrapping both in a `sequence()` call
- **Fix:** Wrapped the execute + simultaneousActionStep in sequence()
- **Files modified:** src/rules/flow.ts

## Test Results

- 22 test files passed (690 tests passed, 7 skipped)
- 1 pre-existing timeout (mcts-clone.test.ts) excluded -- unrelated to changes
- New: tests/dictator-combat-subflow.test.ts (1 test)
- New: tests/ai-rebel-batching.test.ts (5 tests)

## Metrics

- Duration: ~15 minutes
- Completed: 2026-02-16
- Tasks: 3/3
