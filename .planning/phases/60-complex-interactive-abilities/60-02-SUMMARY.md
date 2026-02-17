---
phase: 60-complex-interactive-abilities
plan: 02
subsystem: rules
tags: [noriega, dictator-ability, militia-conversion, conditional-hire, flow]

# Dependency graph
requires:
  - phase: 60-01
    provides: Hitler per-turn ability pattern with multi-step flow
  - phase: 59
    provides: Pol Pot conditional hire pattern, militia placement actions
provides:
  - Noriega AI turn ability (convert, place, conditional hire)
  - Noriega human multi-step flow (convert -> choose sector -> conditional hire)
  - pendingNoriegaConversion game state for human flow
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Noriega conversion: auto-execute step + sector choice + conditional hire"

key-files:
  created: []
  modified:
    - src/rules/game.ts
    - src/rules/dictator-abilities.ts
    - src/rules/actions/dictator-actions.ts
    - src/rules/actions/index.ts
    - src/rules/flow.ts
    - src/ui/components/DictatorPanel.vue
    - src/ui/composables/useActionState.ts

key-decisions:
  - "No 'has ability' switch needed -- applyDictatorTurnAbilities dispatcher is sufficient"
  - "AI sector selection: prefer non-rebel sector with most adjacent rebel sectors"

patterns-established:
  - "Auto-execute conversion + human sector choice: noriegaConvertMilitia runs automatically, then noriegaPlaceMilitia presents sector choice"

# Metrics
duration: 8min
completed: 2026-02-17
---

# Phase 60 Plan 02: Noriega Per-Turn Ability Summary

**Noriega militia conversion from rebel sectors, human sector choice for placement, and conditional MERC hire when behind on sector count**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-17T19:47:11Z
- **Completed:** 2026-02-17T19:55:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- AI Noriega converts 1 rebel militia per rebel-controlled sector, places strategically adjacent to rebel territory, and hires a MERC when controlling fewer sectors
- Human Noriega flow: automatic conversion -> choose destination sector -> conditional hire with full Gaddafi-pattern equipment/sector selection
- Combat queued when converted militia land in sectors with rebel forces

## Task Commits

Each task was committed atomically:

1. **Task 1: Noriega AI ability and game state** - `f2e0d9e` (feat)
2. **Task 2: Noriega human actions, flow steps, and UI wiring** - `9928b44` (feat)

## Files Created/Modified
- `src/rules/game.ts` - Added pendingNoriegaConversion state for human flow
- `src/rules/dictator-abilities.ts` - Added applyNoriegaTurnAbility AI function and noriega case in dispatcher
- `src/rules/actions/dictator-actions.ts` - Three new actions: noriegaConvertMilitia, noriegaPlaceMilitia, noriegaBonusHire
- `src/rules/actions/index.ts` - Registered all 3 Noriega actions
- `src/rules/flow.ts` - Added noriegaConvertMilitia to dictator-ability step, noriega-place-militia and noriega-bonus-hire flow steps
- `src/ui/components/DictatorPanel.vue` - Added Noriega actions to dictatorSpecificActions and sector selection routing
- `src/ui/composables/useActionState.ts` - Added isNoriegaHiring computed

## Decisions Made
- No "has ability" switch block exists in the codebase -- the applyDictatorTurnAbilities dispatcher handles all dictators via a single switch, so only one case needed
- AI sector strategy: pick non-rebel sector with most adjacent rebel sectors (strategic placement near enemy lines)
- chooseFrom prompt does not support functions, used static string instead of dynamic count

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed dynamic prompt on chooseFrom**
- **Found during:** Task 2
- **Issue:** Plan specified dynamic prompt function for noriegaPlaceMilitia chooseFrom, but boardsmith's chooseFrom prompt is typed as string only
- **Fix:** Used static string "Choose sector for converted militia" instead
- **Files modified:** src/rules/actions/dictator-actions.ts
- **Committed in:** 9928b44

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor -- static prompt still clearly communicates the action purpose.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 11 expansion dictator per-turn abilities now implemented (Phase 60 complete)
- Ready for any remaining complex interactive abilities if more plans exist

---
*Phase: 60-complex-interactive-abilities*
*Completed: 2026-02-17*
