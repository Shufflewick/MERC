---
phase: 52-simultaneous-rebel-step
plan: 01
subsystem: rules
tags: [boardsmith, flow, simultaneousActionStep, rebel-turns, parallel-play]

# Dependency graph
requires:
  - phase: 51-extract-combat-sub-flow
    provides: "combatResolutionFlow(game, prefix) for combat resolution in outer loop"
provides:
  - "Day 2+ rebel phase using loop + simultaneousActionStep"
  - "Mortar actionStep with player: override for correct player context outside eachPlayer"
  - "Oil Reserves applied to all rebels in single execute block before rebel phase"
affects:
  - "52-02 (Day 1 landing simultaneousActionStep)"
  - "53-combat-barriers"
  - "55-simultaneous-play-ui"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "simultaneousActionStep for multi-rebel parallel actions with allDone combat breakout"
    - "player: override on actionStep for correct player context outside eachPlayer"

key-files:
  created: []
  modified:
    - "src/rules/flow.ts"

key-decisions:
  - "Used RebelPlayer cast in skipPlayer/playerDone since BoardSmith Player type lacks team property"
  - "Kept mortar and coordinated attack in outer loop sequence, not inside simultaneousActionStep"

patterns-established:
  - "allDone breakout: simultaneousActionStep exits when combat/mortar/coordinated attack is pending, outer loop handles resolution"
  - "player: override pattern: actionStep uses player callback to resolve correct player from game state when eachPlayer is not used"

# Metrics
duration: 4min
completed: 2026-02-16
---

# Phase 52 Plan 01: Simultaneous Rebel Step Summary

**Day 2+ rebel phase replaced with loop + simultaneousActionStep; all rebels act in parallel with combat/mortar/coordinated attack breakout via allDone**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-16T20:13:16Z
- **Completed:** 2026-02-16T20:17:39Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Replaced sequential `eachPlayer('rebel-turns')` with `loop('rebel-phase')` wrapping `simultaneousActionStep('rebel-actions')`
- Oil Reserves now applies to all rebels in a single execute block before the rebel phase loop (was per-player)
- Mortar allocation actionStep uses `player:` override to resolve firing player from `pendingMortarAttack.attackingPlayerId`
- Combat, mortar, and coordinated attack break out of simultaneousActionStep via `allDone`, resolve in outer loop, then re-enter
- `skipPlayer` and `playerDone` both check `actionsRemaining === 0` via team property
- All 682 tests pass with no modifications needed

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace eachPlayer rebel-turns with loop + simultaneousActionStep** - `a75ee73` (feat)
2. **Task 2: Verify full test suite and multi-player flow correctness** - verification only, no commit needed

## Files Created/Modified
- `src/rules/flow.ts` - Replaced Day 2+ rebel phase with loop + simultaneousActionStep structure

## Decisions Made
- Cast `player` parameter to `RebelPlayer` in skipPlayer/playerDone callbacks since BoardSmith's `Player<any, any>` base type does not expose the `team` property. This is safe because the `players` callback returns `game.rebelPlayers` which are all RebelPlayer instances.
- Kept mortar allocation and coordinated attack response in the outer loop sequence (not inside simultaneousActionStep) as the plan specified, avoiding the anti-pattern of nesting regular actionSteps inside simultaneous steps.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- mcts-clone test flaky timeout (120s boundary, takes ~106-115s). Pre-existing, not caused by this change. Passes on retry.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Day 2+ rebel phase is simultaneous; ready for 52-02 to convert Day 1 landing to same pattern
- The allDone breakout pattern is proven and can be referenced by Phase 53 combat barriers work
- No blockers for next plan

---
*Phase: 52-simultaneous-rebel-step*
*Completed: 2026-02-16*
