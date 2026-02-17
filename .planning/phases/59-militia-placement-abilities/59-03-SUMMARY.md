---
phase: 59-militia-placement-abilities
plan: 03
subsystem: rules
tags: [dictator-abilities, militia, polpot, combat-outcome, hire, flow, actions]

# Dependency graph
requires:
  - phase: 59-militia-placement-abilities/02
    provides: "Mussolini militia placement pattern, dictator-ability flow infrastructure"
provides:
  - "Pol Pot per-turn militia placement on rebel sectors (AI and human)"
  - "Combat outcome tracking via _polpotTargetSectorId + sector control check"
  - "Conditional MERC hire on combat loss (rebel victory only)"
  - "Interactive squad choice for human Pol Pot hire"
  - "lastAbilityCombatOutcome game state field"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Post-combat outcome tracking: set target sector before combat, check sector control after resolution"
    - "Conditional post-combat action: actionStep with skipIf checking lastAbilityCombatOutcome"

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
  - "Combat loss detection via sector control check after combat resolution (rebels still control sector = dictator lost)"
  - "Retreat does NOT trigger hire because sector control may shift on retreat, so rebels lose control"
  - "Human Pol Pot chooses squad for hired MERC (interactive, not auto-place)"

patterns-established:
  - "Post-combat conditional action: track target sector, check outcome after combat resolution, gate action with skipIf"

# Metrics
duration: 3min
completed: 2026-02-17
---

# Phase 59 Plan 03: Pol Pot Militia Placement Summary

**Pol Pot per-turn militia placement on rebel sectors with conditional MERC hire on combat loss**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-17T19:13:03Z
- **Completed:** 2026-02-17T19:16:03Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Pol Pot AI places militia equal to rebel-controlled sector count on any rebel sector, auto-hires on combat loss
- Pol Pot human path presents rebel-controlled sector choices with sector card UI
- Combat outcome tracked via _polpotTargetSectorId field and post-combat sector control check
- Conditional MERC hire only triggers on rebel victory (not retreat)
- Human dictator interactively chooses squad for hired MERC

## Task Commits

Each task was committed atomically:

1. **Task 1: Combat outcome tracking and Pol Pot AI path** - `ac0af41` (feat)
2. **Task 2: Pol Pot human actions, flow hire step, and registration** - `0da68d9` (feat)

## Files Created/Modified
- `src/rules/game.ts` - Added _polpotTargetSectorId and lastAbilityCombatOutcome fields
- `src/rules/dictator-abilities.ts` - Added applyPolpotTurnAbility function and polpot switch case
- `src/rules/actions/dictator-actions.ts` - Added createPolpotBonusMilitiaAction and createPolpotBonusHireAction
- `src/rules/actions/index.ts` - Imported and registered both new actions
- `src/rules/flow.ts` - Added combat outcome tracking, AI hire logic, human hire actionStep, and polpotBonusMilitia to ability step
- `src/ui/components/DictatorPanel.vue` - Added polpotBonusMilitia and polpotBonusHire to action arrays

## Decisions Made
- Used sector control check (rebels still control target sector after combat) to detect combat loss, rather than tracking combat result directly. This is simpler and naturally handles the retreat case correctly (retreat changes control, so rebels may lose the sector, meaning no hire).
- Human Pol Pot chooses squad interactively (Primary/Secondary) for the consolation hire, following the plan's explicit requirement.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All three militia placement ability plans (Mao, Mussolini, Pol Pot) are now complete
- Phase 59 militia placement abilities is fully implemented

---
*Phase: 59-militia-placement-abilities*
*Completed: 2026-02-17*
