---
phase: 44-combatpanel-rebuild
plan: 01
subsystem: ui
tags: [vue, combat-panel, animation-events, snapshot-rendering]

# Dependency graph
requires:
  - phase: 43-combat-event-architecture
    provides: combat-panel snapshot events emitted at all 8 decision cycle points
provides:
  - CombatPanel renders all combatants from combat-panel snapshot events
  - Health tracking via snapshot + healthOverrides (combat-damage/heal events)
  - gameView prop removed from CombatPanel
affects: [44-02 (decision panel rewire, cleanup getCombatantId/capitalize), 45 (GameTable clean wiring)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Snapshot-driven rendering: combatSnapshot ref + healthOverrides Map replaces theatre view element resolution"
    - "Event handler health tracking: healthOverrides.set() on combat-damage/heal, cleared on combat-panel snapshot"

key-files:
  created: []
  modified:
    - src/ui/components/CombatPanel.vue
    - src/ui/components/GameTable.vue

key-decisions:
  - "getCombatantDisplay reads plain snapshot fields directly -- no more resolveCombatant/getAttr indirection"
  - "healthOverrides cleared on each combat-panel snapshot -- snapshot health is authoritative at decision points"
  - "findCombatantIdByName reads from livingRebels/livingDictator (snapshot) instead of activeCombat prop"

patterns-established:
  - "Snapshot + override pattern: combatSnapshot for authoritative state at decision points, healthOverrides for smooth per-hit updates between snapshots"

# Metrics
duration: 5min
completed: 2026-02-08
---

# Phase 44 Plan 01: Snapshot-Driven CombatPanel Rendering Summary

**CombatPanel rewired to render all combatants from combat-panel snapshot events with healthOverrides for smooth per-hit health updates**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-08T17:20:46Z
- **Completed:** 2026-02-08T17:25:22Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- CombatPanel renders all combatant data (names, images, health, type badges) from combat-panel snapshot events instead of activeCombat prop + gameView element resolution
- Health tracking uses snapshot health at decision points + healthOverrides from combat-damage/combat-heal events for smooth per-hit updates
- Removed 100 lines of indirection: displayHealth, initializeDisplayHealth, resolveCombatant, findElementById, getAttr, useGameViewHelpers, gameView prop
- GameTable no longer passes gameView to CombatPanel

## Task Commits

Each task was committed atomically:

1. **Task 1: Add snapshot state, register combat-panel handler, rewire health tracking** - `e7d9457` (feat)
2. **Task 2: Remove gameView prop binding from GameTable** - `f67b931` (feat)

## Files Created/Modified
- `src/ui/components/CombatPanel.vue` - Snapshot-driven rendering: combatSnapshot ref, healthOverrides, simplified getCombatantDisplay, livingRebels/livingDictator/dogTargetNames from snapshot
- `src/ui/components/GameTable.vue` - Removed :game-view="gameView" prop binding from CombatPanel

## Decisions Made
- getCombatantDisplay reads plain snapshot fields directly with no fallback chains -- snapshot combatants are pre-serialized with all fields present
- healthOverrides cleared on each combat-panel snapshot arrival, ensuring snapshot health is authoritative at decision points
- findCombatantIdByName updated to read from snapshot-backed livingRebels/livingDictator instead of activeCombat prop (Rule 3 blocking fix)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated findCombatantIdByName to use snapshot data**
- **Found during:** Task 1 (removing resolveCombatant and getAttr)
- **Issue:** findCombatantIdByName called resolveCombatant() and getAttr() which were being removed
- **Fix:** Rewrote to read from livingRebels/livingDictator computeds using plain c.name/c.id fields
- **Files modified:** src/ui/components/CombatPanel.vue
- **Verification:** grep confirms zero references to resolveCombatant/getAttr
- **Committed in:** e7d9457 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix to remove all getAttr/resolveCombatant usage. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CombatPanel snapshot-driven rendering complete, ready for plan 02 (decision panel rewire)
- getCombatantId and capitalize functions remain (used by currentEvent watcher / findCombatantIdByName) -- cleanup deferred to plan 02
- activeCombat prop still used for pending decision state (pendingTargetSelection, pendingHitAllocation, etc.) -- this is correct per plan design

---
*Phase: 44-combatpanel-rebuild*
*Completed: 2026-02-08*
