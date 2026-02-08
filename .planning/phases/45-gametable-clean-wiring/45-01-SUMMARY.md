---
phase: 45-gametable-clean-wiring
plan: 01
subsystem: ui
tags: [vue, gametable, combat-panel, snapshot, animation-events, wiring-cleanup]

# Dependency graph
requires:
  - phase: 44-combatpanel-rebuild
    provides: CombatPanel self-contained animation player with combatSnapshot ref and event handlers
provides:
  - GameTable owns combat snapshot via combat-panel handler registration
  - CombatPanel receives snapshot as prop, no internal handler
  - Single-condition combat panel visibility (combatSnapshot !== null)
  - Zero fallback chains, zero pause/resume, zero cached combat state
affects: [46-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Snapshot ownership in always-mounted parent: GameTable registers combat-panel handler, stores snapshot, passes as prop to CombatPanel"
    - "Single-condition visibility: hasActiveCombat = combatSnapshot !== null, no fallback chains"
    - "combat-finished lifecycle: CombatPanel emits after combat-end animation, GameTable clears snapshot and calls clearCombatAnimations"

key-files:
  created: []
  modified:
    - src/ui/components/GameTable.vue
    - src/ui/components/CombatPanel.vue

key-decisions:
  - "combat-panel handler in GameTable (always-mounted parent) eliminates chicken-and-egg mounting problem without pause/resume"
  - "CombatPanel snapshot watcher clears healthOverrides on every new snapshot (replacing the internal combat-panel handler's clearing)"
  - "Wolverine 6s individual click emit removed -- allocation tracked internally via hit allocation panel, submitted via confirm-targets"

patterns-established:
  - "Parent-owned snapshot: always-mounted component registers handler, child receives data as prop -- no mount-race workarounds needed"

# Metrics
duration: 5min
completed: 2026-02-08
---

# Phase 45 Plan 01: GameTable Clean Wiring Summary

**Snapshot-driven combat panel: GameTable owns combat-panel handler, CombatPanel receives snapshot as prop, ~240 lines of fallback chains deleted**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-08T17:59:17Z
- **Completed:** 2026-02-08T18:04:33Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- GameTable combat section reduced from ~150 lines to ~15 lines of script: snapshot ref, handler registration, hasActiveCombat computed, handleCombatFinished
- Deleted 10 refs/computeds, 6 watchers, and 4 dead handlers from GameTable
- CombatPanel props simplified from 62-line activeCombat type + sectorName to single combatSnapshot prop
- Removed 3 dead emits from CombatPanel (allocate-hit, allocate-wolverine-six, panel-ready)
- Net deletion: 246 lines across both files (171 insertions removed from GameTable, 90 from CombatPanel, 39 additions)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite GameTable combat section** - `8e9688f` (feat) - 15 insertions, 156 deletions
2. **Task 2: Update CombatPanel to receive snapshot as prop** - `dec6187` (feat) - 24 insertions, 90 deletions

## Files Created/Modified
- `src/ui/components/GameTable.vue` - Combat section rewritten: snapshot ref + handler replaces 10 refs, 6 watchers, 4 dead handlers; template cleaned of dead props/events
- `src/ui/components/CombatPanel.vue` - Receives snapshot as prop instead of managing internal handler; 62-line activeCombat prop type removed; dead emits removed; sectorName computed from snapshot

## Decisions Made
- Moved combat-panel handler to GameTable to solve the chicken-and-egg mounting problem without pause/resume
- CombatPanel watches the snapshot prop to clear healthOverrides (replacing the internal handler's clearing behavior)
- Removed allocate-wolverine-six emit entirely since Wolverine 6s allocation is tracked internally in CombatPanel via the hit allocation panel
- Removed allocate-hit forwarding since GameTable handler was a no-op (tracking is in CombatPanel)
- Kept showGameOverOverlay in the combat section since it reads animationEvents directly (no dependency on deleted refs)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GameTable clean wiring complete: combat panel visibility driven by single combatSnapshot condition
- All DELETE-04 acceptance criteria met: zero fallback chains, zero cached combat state, zero pause-until-mount workaround
- All UI-04 acceptance criteria met: clean readable combat section, snapshot-driven visibility
- Ready for Phase 46 (Verification) -- combat event pipeline fully wired end-to-end

---
*Phase: 45-gametable-clean-wiring*
*Completed: 2026-02-08*
