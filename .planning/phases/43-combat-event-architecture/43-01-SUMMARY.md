---
phase: 43-combat-event-architecture
plan: 01
subsystem: rules
tags: [animation, combat, events, boardsmith, theatre-view]

# Dependency graph
requires:
  - phase: 42-remove-dead-apis
    provides: activeCombat sourced from theatre view only, animation events fire-and-forget
provides:
  - All 13 game.animate() calls in combat system are pure data (no callbacks)
  - combat-heal events carry healthBefore, healthAfter, healAmount fields (SRV-03)
affects: [44-combatpanel-rebuild, 46-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure data animate: game.animate('type', { data }) with mutations after call, not in callback"
    - "Pre-computed event data: healthBefore/healthAfter computed before animate, mutations run after"

key-files:
  created: []
  modified:
    - src/rules/combat.ts
    - src/rules/actions/rebel-combat.ts

key-decisions:
  - "Mutations moved immediately after animate calls (not deferred) preserving synchronous execution order"
  - "combat-end callback removed entirely since state was already set before the animate call"
  - "healthBefore naturally available at animate call site since mutations now run after"

patterns-established:
  - "Pure data animate pattern: game.animate('event', { precomputed data }); mutations(); -- no callback arg"

# Metrics
duration: 4min
completed: 2026-02-08
---

# Phase 43 Plan 01: Extract Animate Callbacks Summary

**All 13 game.animate() combat calls converted to pure data events -- callbacks removed, mutations moved after animate, healthBefore added to all 3 combat-heal events**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-08T16:49:49Z
- **Completed:** 2026-02-08T16:53:29Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Extracted mutation callbacks from all 10 animate calls in combat.ts (attack-dog, roll, damage, death, round-start, end)
- Extracted mutation callbacks from all 3 animate calls in rebel-combat.ts (medical kit heal, before-attack heal, surgeon heal)
- Added healthBefore field to all 3 combat-heal event data objects (SRV-03 compliance)
- All 602 existing tests pass with zero regressions -- combat mechanics completely unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract mutations from all 10 animate callbacks in combat.ts** - `8047357` (feat)
2. **Task 2: Extract mutations from all 3 animate callbacks in rebel-combat.ts** - `e11bf66` (feat)

## Files Created/Modified
- `src/rules/combat.ts` - 10 animate calls converted to pure data (3 attack-dog, 2 roll, 1 damage, 2 death, 1 round-start, 1 end)
- `src/rules/actions/rebel-combat.ts` - 3 combat-heal animate calls converted to pure data with healthBefore field added

## Decisions Made
- Mutations placed immediately after animate calls (not deferred or restructured) to preserve exact execution order
- combat-end callback removed entirely rather than moved -- the `game.activeCombat = combatEndState` was redundant with the assignment on the preceding line
- healthBefore field computed naturally from `targetCombatant.health` at the animate call site, since mutations now execute after the call

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 13 animate calls are pure data events, satisfying SRV-03
- Phase 44 (CombatPanel Rebuild) can now trust that animation events carry complete pre-computed data
- No mutations occur inside callbacks -- UI can render entirely from event data

---
*Phase: 43-combat-event-architecture*
*Completed: 2026-02-08*
