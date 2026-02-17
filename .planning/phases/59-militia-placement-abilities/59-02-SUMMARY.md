---
phase: 59-militia-placement-abilities
plan: 02
subsystem: rules
tags: [dictator-abilities, militia, mussolini, flow, actions]

# Dependency graph
requires:
  - phase: 59-militia-placement-abilities/01
    provides: "Mao militia placement pattern, dictator-ability flow infrastructure"
provides:
  - "Mussolini per-turn militia placement (AI and human)"
  - "Mussolini spread-to-adjacent loop (AI and human)"
  - "pendingMussoliniSpread game state field"
affects: [59-militia-placement-abilities/03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-step dictator ability: place then spread loop"
    - "Optional loop with 'Done spreading' skip choice"

key-files:
  created: []
  modified:
    - src/rules/game.ts
    - src/rules/dictator-abilities.ts
    - src/rules/actions/dictator-actions.ts
    - src/rules/actions/index.ts
    - src/rules/flow.ts
    - src/ui/components/DictatorPanel.vue

key-decisions:
  - "Spread remaining tracks total militia in source sector (not just placed), allowing dictator to move any militia from source"
  - "AI spread prioritizes rebel-occupied adjacent sectors for combat, then neutral sectors"
  - "Human spread uses loop with explicit 'Done spreading' first in choices array"

patterns-established:
  - "Two-step ability pattern: first action sets up pending state, loop handles subsequent iterations"

# Metrics
duration: 2min
completed: 2026-02-17
---

# Phase 59 Plan 02: Mussolini Militia Placement Summary

**Mussolini two-step per-turn ability: place militia equal to rebel count, then optionally spread to adjacent sectors via loop**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T19:09:14Z
- **Completed:** 2026-02-17T19:11:40Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Mussolini AI path places militia on controlled sector and spreads to adjacent (prioritizing rebel sectors)
- Human Mussolini sees two-step flow: choose controlled sector for placement, then loop to spread or skip
- pendingMussoliniSpread state tracks source sector and remaining militia for the spread loop
- Combat triggers when militia placed or spread to rebel-occupied sectors

## Task Commits

Each task was committed atomically:

1. **Task 1: Mussolini AI path and game state** - `4c15f2b` (feat)
2. **Task 2: Mussolini human actions, flow, and registration** - `7a226f9` (feat)

## Files Created/Modified
- `src/rules/game.ts` - Added pendingMussoliniSpread state field and hasMussoliniSpreadPending getter
- `src/rules/dictator-abilities.ts` - Added applyMussoliniTurnAbility with placement and AI spread logic
- `src/rules/actions/dictator-actions.ts` - Added createMussoliniBonusMilitiaAction and createMussoliniSpreadMilitiaAction
- `src/rules/actions/index.ts` - Imported and registered both Mussolini actions
- `src/rules/flow.ts` - Added mussoliniBonusMilitia to dictator-ability step, added mussolini-spread loop
- `src/ui/components/DictatorPanel.vue` - Added both actions to dictatorSpecificActions and isSelectingSector

## Decisions Made
- Spread remaining is set to total militia in source sector after placement (not just newly placed amount), allowing dictator to move any militia from source
- AI spread prioritizes rebel-occupied adjacent sectors for combat opportunities, then neutral sectors
- Human spread uses a loop pattern with "Done spreading" as the first choice option for easy skip

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Mussolini ability complete, ready for Plan 03 (remaining militia placement abilities)
- Pattern established for two-step abilities with optional loops

---
*Phase: 59-militia-placement-abilities*
*Completed: 2026-02-17*
