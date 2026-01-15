---
phase: 29-rules-layer-id-cleanup
plan: 02
subsystem: rules
tags: [refactoring, naming, typescript, actions]

# Dependency graph
requires:
  - phase: 29-rules-layer-id-cleanup
    provides: Core state types with combatantId naming
provides:
  - Action layer args use combatantId consistently
  - Local variables use combatantId naming
  - Rules layer cleanup complete
affects: [30-ui-layer-id-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/rules/actions/rebel-economy.ts
    - src/rules/actions/rebel-equipment.ts
    - src/rules/actions/day-one-actions.ts

key-decisions:
  - "Preserved mercId in helpers.ts (canHireMercWithTeam is MERC-specific)"
  - "Preserved mercId in merc-abilities.ts (MERC-specific ability lookups)"
  - "Preserved dictatorId in setup.ts (selects which dictator character)"

patterns-established: []

issues-created: []

# Metrics
duration: 6min
completed: 2026-01-15
---

# Phase 29 Plan 02: Update Action Layer Summary

**Action layer args and local variables now use combatantId consistently, completing the rules layer cleanup**

## Performance

- **Duration:** 6 min
- **Started:** 2026-01-15T22:13:00Z
- **Completed:** 2026-01-15T22:19:21Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Updated `collectEquipment` and `takeFromStash` followUp args in rebel-economy.ts
- Updated `reEquip` and `reEquipContinue` followUp args in rebel-equipment.ts
- Updated `getDrawnMerc` helper and hire actions in day-one-actions.ts
- All action arg patterns now use `combatantId:` instead of `mercId:`

## Task Commits

Each task was committed atomically:

1. **Task 1: Update rebel-economy.ts** - `06b72bc` (refactor)
2. **Task 2: Update rebel-equipment.ts** - `55bd099` (refactor)
3. **Task 3: Update day-one-actions.ts** - `a39cabb` (refactor)

## Files Created/Modified

- `src/rules/actions/rebel-economy.ts` - Updated followUp args and getUnit helper
- `src/rules/actions/rebel-equipment.ts` - Updated followUp args and getMercOrNull helper
- `src/rules/actions/day-one-actions.ts` - Updated getDrawnMerc and hire action variables

## Decisions Made

- Preserved `mercId` parameter in helpers.ts `canHireMercWithTeam()` - semantically correct for MERC-specific hiring logic
- Preserved `mercId` throughout merc-abilities.ts - all functions are MERC-specific ability lookups
- Preserved `dictatorId` in setup.ts - selects which dictator character to use (configuration, not identity)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Rules layer cleanup complete (Phase 29)
- Ready for Phase 30: UI Layer ID Cleanup (mercName/dictatorName → combatantName)

---
*Phase: 29-rules-layer-id-cleanup*
*Completed: 2026-01-15*
