---
phase: 50-tactics-card-audit
plan: 03
subsystem: tactics, actions, flow
tags: [generalissimo, merc-hire, tactics-cards, dictator-actions, flow-step]

# Dependency graph
requires:
  - phase: 50-01
    provides: Removed fabricated generalisimoActive flag from combat system
provides:
  - Correct Generalissimo implementation that draws 6 MERCs per CSV rules
  - Interactive generalissimoPick action for human dictator players
  - Flow step that yields for human MERC selection after playing Generalissimo
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pending hire state pattern (pendingGeneralissimoHire) matching pendingArtilleryAllocation"

key-files:
  created: []
  modified:
    - src/rules/game.ts
    - src/rules/tactics-effects.ts
    - src/rules/actions/dictator-actions.ts
    - src/rules/actions/index.ts
    - src/rules/flow.ts

key-decisions:
  - "Generalissimo AI auto-picks highest baseCombat MERC (same heuristic as Castro)"
  - "Human dictator gets 3-step interactive choice: MERC, equipment type, deployment sector"
  - "Flow step placed after artillery-allocation loop, before tactics-combat loops"

patterns-established:
  - "Pending hire state with drawnMercIds for deferred interactive selection"

# Metrics
duration: 4min
completed: 2026-02-09
---

# Phase 50 Plan 03: Generalissimo Rewrite Summary

**Rewrote Generalissimo to draw 6 MERCs and let dictator pick 1, with AI auto-pick and interactive human flow step**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-09T02:47:37Z
- **Completed:** 2026-02-09T02:51:17Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Completely rewrote generalisimo() to draw 6 MERCs from merc deck per CSV rules
- AI dictator auto-picks highest combat MERC, places in squad, equips, discards rest
- Human dictator gets interactive 3-step choice via generalissimoPick action
- Flow step yields after artillery allocation for human MERC selection
- Action properly registered in index.ts for flow step to find it

## Task Commits

Each task was committed atomically:

1. **Task 1: Add pending state and rewrite Generalissimo effect** - `ddc4794` (feat)
2. **Task 2: Create generalissimoPick action, register it, and add flow step** - `65e293f` (feat)

## Files Created/Modified
- `src/rules/game.ts` - Added pendingGeneralissimoHire property and hasGeneralissimoPending getter
- `src/rules/tactics-effects.ts` - Complete rewrite of generalisimo() function; removed dead generalisimoActive reference
- `src/rules/actions/dictator-actions.ts` - Added createGeneralissimoPickAction (3-step: MERC, equipment, sector)
- `src/rules/actions/index.ts` - Import and registration of createGeneralissimoPickAction
- `src/rules/flow.ts` - Added generalissimo-hire loop after artillery-allocation

## Decisions Made
- **AI heuristic:** Auto-picks highest baseCombat MERC, matching Castro's existing pattern in dictator-abilities.ts
- **Interactive flow:** Human dictator gets 3-step choice (MERC, equipment type, deployment sector) following castroBonusHire action pattern exactly
- **Flow placement:** Generalissimo hire loop placed after artillery allocation and before tactics-triggered combat loops, since the hire needs to resolve before any combat

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Generalissimo card fully implemented per CSV rules
- Lockdown card still needs rewrite (plan 04) -- its lockdownActive flag reference remains as dead code
- All 650 tests pass with no regressions

---
*Phase: 50-tactics-card-audit*
*Completed: 2026-02-09*
