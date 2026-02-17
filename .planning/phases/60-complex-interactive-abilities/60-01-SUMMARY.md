---
phase: 60-complex-interactive-abilities
plan: 01
subsystem: rules
tags: [dictator-abilities, combat-initiative, hitler, action-system, flow]

# Dependency graph
requires:
  - phase: 57-simple-hire-abilities
    provides: Gaddafi/Stalin hire action patterns, dictator ability flow infrastructure
provides:
  - Hitler AI ability (hire + initiative target auto-selection)
  - Hitler human actions (hitlerBonusHire, hitlerPickInitiativeTarget)
  - Initiative override in sortByInitiative for targeted rebel
  - Persistent cross-turn state (hitlerInitiativeTargetSeat)
affects:
  - 60-02 (remaining complex interactive abilities)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Initiative override pattern: sortByInitiative accepts optional game param for cross-cutting combat mechanics"
    - "Multi-step dictator ability: hire action followed by separate pick-target action step in flow"

key-files:
  created: []
  modified:
    - src/rules/game.ts
    - src/rules/dictator-abilities.ts
    - src/rules/combat.ts
    - src/rules/actions/dictator-actions.ts
    - src/rules/actions/index.ts
    - src/rules/flow.ts
    - src/ui/components/DictatorPanel.vue
    - src/ui/composables/useActionState.ts

key-decisions:
  - "sortByInitiative takes optional game parameter rather than always requiring it, preserving backward compatibility"
  - "Hitler initiative target pick is a separate flow step after the hire step, not embedded in the same action"
  - "hitlerPickInitiativeTarget always runs each turn (player must pick), not gated by hitlerInitiativeSwitchedThisTurn"

patterns-established:
  - "Initiative override pattern: game state checked inside sort comparator via optional game param"

# Metrics
duration: 4min
completed: 2026-02-17
---

# Phase 60 Plan 01: Hitler Ability Summary

**Hitler per-turn ability with hire + persistent initiative override targeting a chosen rebel player**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-17T19:40:39Z
- **Completed:** 2026-02-17T19:44:47Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- AI Hitler hires 1 MERC per turn and auto-selects the rebel with most controlled sectors as initiative target
- Human Hitler gets hire action with equipment/sector choices, then initiative target pick
- Initiative override in sortByInitiative makes dictator forces go before targeted rebel forces in combat
- Persistent cross-turn state: hitlerInitiativeTargetSeat survives across turns, hitlerInitiativeSwitchedThisTurn resets daily

## Task Commits

Each task was committed atomically:

1. **Task 1: Hitler AI ability, game state, and initiative override** - `d8aa4f4` (feat)
2. **Task 2: Hitler human actions, flow steps, and UI wiring** - `8a66810` (feat)

## Files Created/Modified
- `src/rules/game.ts` - Added hitlerInitiativeTargetSeat and hitlerInitiativeSwitchedThisTurn state, reset in advanceDay
- `src/rules/dictator-abilities.ts` - Added applyHitlerTurnAbility AI function and case in switch
- `src/rules/combat.ts` - Added Hitler initiative override in sortByInitiative, updated all 4 call sites
- `src/rules/actions/dictator-actions.ts` - Created hitlerBonusHire and hitlerPickInitiativeTarget human actions
- `src/rules/actions/index.ts` - Registered both new actions
- `src/rules/flow.ts` - Added hitlerBonusHire to dictator-ability step, added hitler-pick-target step
- `src/ui/components/DictatorPanel.vue` - Added actions to dictatorSpecificActions, isHitlerHiring computed
- `src/ui/composables/useActionState.ts` - Added isHitlerHiring to interface and return

## Decisions Made
- sortByInitiative takes optional game parameter rather than always requiring it, preserving backward compatibility for the function signature
- Hitler initiative target pick is a separate flow step after the hire step, giving clear UX separation
- hitlerPickInitiativeTarget always runs each turn regardless of current target state

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Hitler ability fully wired for AI and human players
- Ready for Plan 02 (remaining complex interactive abilities)
- No blockers or concerns

---
*Phase: 60-complex-interactive-abilities*
*Completed: 2026-02-17*
