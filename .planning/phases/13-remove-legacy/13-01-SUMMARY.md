---
phase: 13-remove-legacy
plan: 01
subsystem: data
tags: [json, data-migration, cleanup, cardType]

# Dependency graph
requires:
  - phase: 12-merge-data-files
    provides: combatants.json with unified CombatantData interface
provides:
  - Removed legacy data files (mercs.json, dictators.json)
  - All code references updated to use combatantData with filter
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Filter combatantData by cardType for merc/dictator lists"

key-files:
  created: []
  modified:
    - src/rules/actions/day-one-actions.ts
    - src/ui/components/GameBoard.vue
    - src/rules/dictator-abilities.ts
    - src/rules/merc-abilities.ts

key-decisions:
  - "Use inline filter: game.combatantData.filter(d => d.cardType === 'dictator')"

patterns-established:
  - "Pattern: Access dictator data via combatantData.filter(d => d.cardType === 'dictator')"
  - "Pattern: Access merc data via combatantData.filter(d => d.cardType === 'merc')"

issues-created: []

# Metrics
duration: 8min
completed: 2026-01-11
---

# Phase 13 Plan 01: Remove Legacy Summary

**Deleted mercs.json and dictators.json, updated all code references to use combatantData with cardType filter**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-11T23:08:12Z
- **Completed:** 2026-01-11T23:16:20Z
- **Tasks:** 3
- **Files modified:** 4 source files + 2 data files deleted

## Accomplishments

- Fixed day-one-actions.ts to filter combatantData for dictator entries
- Fixed GameBoard.vue to read settings.combatantData and filter for dictators
- Deleted legacy data/mercs.json and data/dictators.json
- Updated code comments to reference combatants.json

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix day-one-actions.ts dictatorData references** - `f67bc50` (fix)
2. **Task 2: Fix GameBoard.vue dictatorData references** - `115a8be` (fix)
3. **Task 3: Delete old data files and clean up comments** - `3404051` (chore)

## Files Created/Modified

- `src/rules/actions/day-one-actions.ts` - Updated createSelectDictatorAction to filter combatantData
- `src/ui/components/GameBoard.vue` - Changed dictator selection to read combatantData
- `src/rules/dictator-abilities.ts` - Updated comment header
- `src/rules/merc-abilities.ts` - Updated MercAbility interface comment
- `data/mercs.json` - DELETED
- `data/dictators.json` - DELETED

## Decisions Made

- Used inline filtering approach `game.combatantData.filter(d => d.cardType === 'dictator')` rather than adding a getter, maintaining consistency with Phase 12 pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

**Milestone v1.2 COMPLETE!**

All 5 phases of the "Merge Dictator and Merc Cards" milestone are now finished:
- Phase 9: Added cardType discriminator
- Phase 10: Created CombatUnitCard unified class
- Phase 11: Migrated 103 instanceof checks to property-based guards
- Phase 12: Merged data files into combatants.json
- Phase 13: Removed legacy files and updated remaining references

The codebase now has:
- Single data file (combatants.json) for all combat units
- Unified CombatantData interface with cardType discriminator
- Property-based type guards throughout
- Clean architecture ready for future expansion

---
*Phase: 13-remove-legacy*
*Completed: 2026-01-11*
