---
phase: 44-combatpanel-rebuild
plan: 02
subsystem: ui
tags: [vue, combat-panel, snapshot-decisions, state-machine-removal, event-lifecycle]

# Dependency graph
requires:
  - phase: 44-combatpanel-rebuild-01
    provides: Snapshot-driven combatant rendering with combatSnapshot ref and healthOverrides
provides:
  - All 5 decision prompts read from combatSnapshot decision context fields
  - Event-driven panel lifecycle (snapshot presence = open, combat-end handler = close)
  - State machine fully removed (DELETE-03, DELETE-05)
  - combat-finished emitted from combat-end handler
affects: [45-gametable-clean-wiring, 46-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Snapshot decision computeds: snapshotTargetSelection, snapshotHitAllocation, etc. as typed accessors to combatSnapshot decision context"
    - "Event-driven lifecycle: combat-end handler is sole path to panel close and combat-finished emit"

key-files:
  created: []
  modified:
    - src/ui/components/CombatPanel.vue

key-decisions:
  - "Snapshot decision context accessed via 5 computed helpers (snapshotTargetSelection, snapshotHitAllocation, snapshotWolverineSixes, snapshotAttackDogSelection, snapshotBeforeAttackHealing) instead of inline casts in template"
  - "combat-end handler is the sole lifecycle exit path: clears snapshot, healthOverrides, healingCombatants, resets animations, then emits combat-finished"
  - "getCombatantId and capitalize deleted as unused after snapshot migration"

patterns-established:
  - "Event-driven lifecycle: no state machine, panel presence driven by combatSnapshot ref, close driven by combat-end handler"

# Metrics
duration: 4min
completed: 2026-02-08
---

# Phase 44 Plan 02: Decision Prompts from Snapshot + State Machine Removal Summary

**All 5 decision prompts rewired to combatSnapshot, state machine deleted, event-driven lifecycle via combat-end handler**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-08T17:27:07Z
- **Completed:** 2026-02-08T17:31:03Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- All 5 decision prompts (target selection, hit allocation, wolverine sixes, attack dog, before-attack healing) read from combatSnapshot decision context fields via computed helpers
- State machine fully removed: CombatPanelState type, panelState ref, sawCombatEndEvent ref, computeNextState, transitionState, and 4 watchers deleted (-110 lines)
- combat-end handler is now the sole lifecycle exit: clears all state and emits combat-finished
- Deleted unused getCombatantId (legacy element-ref resolution) and capitalize functions
- CombatPanel is now a self-contained animation player rendering 100% from event data

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewire decision prompts and interactive functions to snapshot** - `8d027e0` (feat)
2. **Task 2: Remove state machine, add event-driven lifecycle** - `f719bfa` (feat)

## Files Created/Modified
- `src/ui/components/CombatPanel.vue` - Decision prompts from snapshot, state machine removed, event-driven lifecycle, unused functions deleted

## Decisions Made
- Used 5 snapshot computed helpers (snapshotTargetSelection, snapshotHitAllocation, etc.) instead of inline `as any` casts in templates -- cleaner, type-safe accessors
- combat-end handler is the sole lifecycle exit path, replacing state machine COMPLETE state entry action
- Deleted getCombatantId and capitalize as dead code after snapshot migration (Rule 1 cleanup)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CombatPanel rebuild is complete: renders 100% from animation events, zero vestigial theatre view code
- Ready for Phase 45 (GameTable Clean Wiring) -- activeCombat prop type can be simplified since CombatPanel only needs it as a mount trigger
- Ready for Phase 46 (Verification) -- all DELETE and UI requirements met

---
*Phase: 44-combatpanel-rebuild*
*Completed: 2026-02-08*
