---
phase: 43-combat-event-architecture
plan: 02
subsystem: rules
tags: [animation, combat, events, snapshot, combat-panel]

# Dependency graph
requires:
  - phase: 43-01-extract-animate-callbacks
    provides: All 13 game.animate() calls are pure data (no callbacks)
provides:
  - combat-panel snapshot emitted at all 8 decision cycle points in executeCombat
  - serializeCombatant() and buildCombatPanelSnapshot() helper functions
  - Epinephrine decision cycle has dedicated handler in executeCombat (SRV-02)
  - Full snapshot data contract for Phase 44 CombatPanel rebuild
affects: [44-combatpanel-rebuild, 46-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "combat-panel snapshot: game.animate('combat-panel', buildCombatPanelSnapshot(game)) after every activeCombat state save"
    - "Snapshot contains serialized combatants + decision context -- CombatPanel needs no element refs"

key-files:
  created: []
  modified:
    - src/rules/combat.ts

key-decisions:
  - "Snapshot emitted AFTER syncMilitiaCasualties so militia counts are accurate"
  - "Snapshot emitted BEFORE combat-end event at combat complete so UI gets final state before end animation"
  - "Epinephrine handler preserves pendingEpinephrine via spread of existing activeCombat"
  - "combatant serialization uses isMerc = !isMilitia && !isDictator && !isAttackDog (process of elimination)"

patterns-established:
  - "Combat-panel snapshot pattern: buildCombatPanelSnapshot reads activeCombat, serializeCombatant maps each combatant to plain data"
  - "Decision context always explicit null (not undefined) via ?? null for cleaner UI consumption"

# Metrics
duration: 4min
completed: 2026-02-08
---

# Phase 43 Plan 02: Combat Panel Snapshot Events Summary

**combat-panel snapshot events emitted at all 8 decision cycles with full combatant data, casualties, and decision context -- complete data contract for CombatPanel rebuild**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-08T16:56:07Z
- **Completed:** 2026-02-08T17:00:29Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added serializeCombatant() mapping Combatant to plain data with all CombatPanel fields (id, name, image, health, maxHealth, type flags, playerColor, attack dog state)
- Added buildCombatPanelSnapshot() building complete snapshot from activeCombat including combatant arrays, casualties, dogAssignments, and all 6 decision context fields
- Emitted combat-panel snapshot at 8 decision cycle points: combat start, target selection, hit allocation, before-attack healing, epinephrine, attack dog selection, retreat/continue, combat complete
- Added dedicated epinephrine handler in executeCombat (previously fell through to round completion) with full state save and combatPending return
- All 602 existing tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add serializeCombatant() and buildCombatPanelSnapshot() helper functions** - `90000c7` (feat)
2. **Task 2: Emit combat-panel snapshot at all 8 decision cycle points in executeCombat** - `75b7e92` (feat)

## Files Created/Modified
- `src/rules/combat.ts` - Added serializeCombatant/buildCombatPanelSnapshot helpers and 8 combat-panel emissions across all decision cycle points

## Decisions Made
- Snapshot emitted after syncMilitiaCasualties (where present) to ensure militia counts are accurate in snapshot
- Snapshot emitted before combat-end event at combat complete so UI gets combatComplete: true state before the end animation
- Epinephrine handler follows same pattern as other handlers: spread existing activeCombat (preserving pendingEpinephrine set by executeCombatRound), overlay standard combat state, emit snapshot, return combatPending: true
- Decision context fields use ?? null (not undefined) for explicit null values in snapshot -- cleaner for UI consumption

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SRV-01 and SRV-02 fully satisfied: combat-panel snapshot at every decision cycle with complete combatant data and decision context
- Phase 44 (CombatPanel Rebuild) can now render entirely from combat-panel animation events
- Data contract established: snapshot contains serialized combatants (no element refs), casualties, dogAssignments, combatComplete flag, and all 6 pending decision types

---
*Phase: 43-combat-event-architecture*
*Completed: 2026-02-08*
