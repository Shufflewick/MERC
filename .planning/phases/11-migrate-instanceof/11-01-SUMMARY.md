---
phase: 11-migrate-instanceof
plan: 01
subsystem: combat
tags: [type-guards, instanceof, bundler-compatibility, typescript]

# Dependency graph
requires:
  - phase: 10-unified-class
    provides: CombatUnitCard class with isMerc/isDictator getters
provides:
  - isCombatUnitCard type guard in helpers.ts
  - isMercCard type guard in helpers.ts
  - Updated isDictatorCard to use property check
  - combat.ts using property-based type guards
affects: [12-merge-data-files, 13-remove-legacy]

# Tech tracking
tech-stack:
  added: []
  patterns: [property-based-type-guards, optional-chaining-for-type-checks]

key-files:
  created: []
  modified: [src/rules/actions/helpers.ts, src/rules/combat.ts]

key-decisions:
  - "Use isMerc property check instead of instanceof MercCard"
  - "Use optional chaining (?.isMerc) for safe null/undefined access"

patterns-established:
  - "Pattern: Replace instanceof X with x?.isMerc or x?.isDictator"
  - "Pattern: Use isCombatUnitCard(x) for type guards in utilities"

issues-created: []

# Metrics
duration: 21min
completed: 2026-01-11
---

# Phase 11 Plan 01: Type Guards and combat.ts Migration Summary

**Added property-based type guards to helpers.ts and migrated all 56 instanceof checks in combat.ts**

## Performance

- **Duration:** 21 min
- **Started:** 2026-01-11T21:55:52Z
- **Completed:** 2026-01-11T22:16:44Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added isCombatUnitCard, isMercCard type guards to helpers.ts
- Updated isDictatorCard to use property check instead of instanceof
- Migrated all 56 instanceof MercCard/DictatorCard checks in combat.ts to property-based checks
- Improved bundler compatibility by removing instanceof reliance

## Task Commits

Each task was committed atomically:

1. **Task 1: Add type guards to helpers.ts** - `b9dedb3` (feat)
2. **Task 2: Migrate combat.ts instanceof checks** - `f34473c` (feat)

## Files Created/Modified
- `src/rules/actions/helpers.ts` - Added isCombatUnitCard, isMercCard type guards; updated isDictatorCard, getUnitName, findUnitSector, asMercCard
- `src/rules/combat.ts` - Replaced all 56 instanceof checks with property-based checks using isMerc/isDictator

## Decisions Made
- Used optional chaining (`?.isMerc`) for safe property access instead of explicit null checks
- Property checks (`isMerc`/`isDictator`) are sufficient without needing full type guard function calls in combat.ts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- None

## Next Phase Readiness
- Type guards established for use in remaining files
- Ready for 11-02-PLAN.md (actions/ directory migration)

---
*Phase: 11-migrate-instanceof*
*Completed: 2026-01-11*
