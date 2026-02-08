---
phase: 42-remove-dead-apis
plan: 01
subsystem: ui
tags: [vue, boardsmith, theatre-view, animation-events, dead-code]

# Dependency graph
requires: []
provides:
  - "Clean codebase with zero references to 7 dead BoardSmith v2 APIs"
  - "DELETE-01 and DELETE-02 requirements satisfied"
affects:
  - "43-combat-event-architecture"
  - "44-combatpanel-rebuild"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Theatre view is sole source of combat state (no truth view fallback)"
    - "Animation events are fire-and-forget (no acknowledgment protocol)"

key-files:
  created: []
  modified:
    - "src/ui/components/CombatPanel.vue"
    - "src/ui/components/GameTable.vue"
    - "src/ui/App.vue"
    - "src/rules/actions/rebel-combat.ts"
    - "src/rules/actions/index.ts"

key-decisions:
  - "No replacement logic needed -- pure deletion of dead code paths"

patterns-established:
  - "activeCombat sourced from theatre view only, no truth view fallback"

# Metrics
duration: 2min
completed: 2026-02-08
---

# Phase 42 Plan 01: Remove Dead APIs Summary

**Deleted 7 dead BoardSmith v2 API references (useCurrentView, acknowledgeAnimations, truthCombatComplete, truthActiveCombat) across 5 files with zero test regressions**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-08T16:10:36Z
- **Completed:** 2026-02-08T16:12:47Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Removed all useCurrentView and CURRENT_VIEW_KEY references from CombatPanel.vue and GameTable.vue
- Removed entire acknowledgment protocol (createAcknowledgeAnimationsAction, acknowledge callback in App.vue)
- Removed truthCombatComplete computed, its watcher, and template reference in CombatPanel.vue
- Removed truthActiveCombat computed in GameTable.vue (activeCombat now uses theatre view only)
- All 602 tests pass with zero regressions
- createClearCombatAnimationsAction confirmed intact (live code, not dead API)

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove useCurrentView and all dependent code (DELETE-01)** - `33f10f7` (feat)
2. **Task 2: Remove acknowledgment protocol (DELETE-02)** - `fbf2e7f` (feat)

## Files Created/Modified
- `src/ui/components/CombatPanel.vue` - Removed useCurrentView import, currentView variable, truthCombatComplete computed + watcher, template reference
- `src/ui/components/GameTable.vue` - Removed useCurrentView import, currentView variable, truthActiveCombat computed + fallback chain
- `src/ui/App.vue` - Removed acknowledge callback from createAnimationEvents options
- `src/rules/actions/rebel-combat.ts` - Deleted createAcknowledgeAnimationsAction function (35 lines)
- `src/rules/actions/index.ts` - Removed import and registration of acknowledgeAnimations action

## Decisions Made
None - followed plan as specified. Pure dead code deletion, no replacement logic needed.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Codebase is clean of all 7 dead BoardSmith v2 API symbols
- TypeScript compilation errors from dead API references are resolved
- Ready for Phase 43 (Combat Event Architecture) to build new event-driven system on clean foundation
- No blockers or concerns

---
*Phase: 42-remove-dead-apis*
*Completed: 2026-02-08*
