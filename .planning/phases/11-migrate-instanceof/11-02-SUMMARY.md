---
phase: 11-migrate-instanceof
plan: 02
subsystem: combat
tags: [type-guards, instanceof, bundler-compatibility, typescript]

# Dependency graph
requires:
  - phase: 11-01
    provides: isCombatUnitCard, isMercCard type guards in helpers.ts
provides:
  - rebel-equipment.ts using property-based type guards
  - rebel-economy.ts using property-based type guards
affects: [11-03-other-files, 12-merge-data-files, 13-remove-legacy]

# Tech tracking
tech-stack:
  added: []
  patterns: [property-based-type-guards, optional-chaining-for-type-checks]

key-files:
  created: []
  modified: [src/rules/actions/rebel-equipment.ts, src/rules/actions/rebel-economy.ts]

key-decisions:
  - "Use isCombatUnitCard for unit resolution helpers instead of checking MercCard/DictatorCard separately"
  - "Use isMerc property with type cast for Apeiron special cases"

patterns-established:
  - "Pattern: Replace instanceof X with isMercCard(x) or x.isMerc"
  - "Pattern: Use isCombatUnitCard(x) when handling both MercCard and DictatorCard"

issues-created: []

# Metrics
duration: 8min
completed: 2026-01-11
---

# Phase 11 Plan 02: Actions Directory Migration Summary

**Replaced 32 instanceof MercCard/DictatorCard checks in rebel-equipment.ts and rebel-economy.ts with property-based type guards**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-11T22:18:01Z
- **Completed:** 2026-01-11T22:26:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Migrated 24 instanceof checks in rebel-equipment.ts to property-based guards
- Migrated 8 instanceof checks in rebel-economy.ts to property-based guards
- Simplified unit resolution helpers using isCombatUnitCard
- Maintained all existing functionality with improved bundler compatibility

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate rebel-equipment.ts** - `d49dcf6` (feat)
2. **Task 2: Migrate rebel-economy.ts** - `1c03ec6` (feat)

## Files Created/Modified
- `src/rules/actions/rebel-equipment.ts` - Replaced 24 instanceof checks, added isMercCard/isCombatUnitCard imports
- `src/rules/actions/rebel-economy.ts` - Replaced 8 instanceof checks, added isMercCard/isCombatUnitCard imports

## Decisions Made
- Used `isCombatUnitCard` for helper functions that need to handle both MercCard and DictatorCard
- Used `unit?.isMerc` with type cast for Apeiron-specific checks where we need to access mercId

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- None

## Next Phase Readiness
- Actions directory fully migrated
- Ready for 11-03-PLAN.md (other files migration)

---
*Phase: 11-migrate-instanceof*
*Completed: 2026-01-11*
