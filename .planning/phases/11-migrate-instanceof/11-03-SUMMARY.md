---
phase: 11-migrate-instanceof
plan: 03
subsystem: ai
tags: [type-guards, instanceof, bundler-compatibility, typescript]

# Dependency graph
requires:
  - phase: 11-02
    provides: rebel-equipment.ts and rebel-economy.ts migrated
provides:
  - All remaining src/rules files using property-based type guards
  - Zero instanceof MercCard/DictatorCard checks remaining
affects: [12-merge-data-files, 13-remove-legacy]

# Tech tracking
tech-stack:
  added: []
  patterns: [property-based-type-guards]

key-files:
  created: []
  modified: [src/rules/ai-helpers.ts, src/rules/ai-executor.ts, src/rules/actions/day-one-actions.ts, src/rules/actions/rebel-combat.ts, src/rules/actions/dictator-actions.ts, tests/action-conditions.test.ts]

key-decisions:
  - "Use .isMerc/.isDictator properties for unit type discrimination in existing code"
  - "Use isMercCard() type guard for unknown/element types"

patterns-established:
  - "Pattern: For DictatorUnit types use unit.isMerc or unit.isDictator properties"
  - "Pattern: For GameElement lookups use isMercCard(el) type guard"

issues-created: []

# Metrics
duration: 8min
completed: 2026-01-11
---

# Phase 11 Plan 03: Remaining Files Migration Summary

**Completed instanceof migration across all remaining files - zero instanceof MercCard/DictatorCard checks remain in codebase**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-11T22:25:36Z
- **Completed:** 2026-01-11T22:33:57Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Migrated 4 instanceof checks in ai-helpers.ts to property-based guards
- Migrated 3 instanceof checks in ai-executor.ts to property-based guards
- Migrated 3 instanceof checks in day-one-actions.ts to isMercCard type guard
- Migrated 2 instanceof checks in rebel-combat.ts to isMercCard type guard
- Migrated 2 instanceof checks in dictator-actions.ts to isMercCard type guard
- Migrated 1 instanceof check in tests/action-conditions.test.ts
- Verified zero remaining instanceof MercCard/DictatorCard in src/rules/ and tests/

## Task Commits

Each task was committed atomically:

1. **Task 1: helpers.ts remaining checks** - Already complete (migrated in Plan 01)
2. **Task 2: AI and action files** - `6ea6e56` (feat)
3. **Task 3: Test file and verification** - `345693e` (test)

## Files Created/Modified
- `src/rules/ai-helpers.ts` - 4 checks migrated, added isMercCard import
- `src/rules/ai-executor.ts` - 3 checks migrated, added isMercCard import
- `src/rules/actions/day-one-actions.ts` - 3 checks migrated, added isMercCard import
- `src/rules/actions/rebel-combat.ts` - 2 checks migrated, added isMercCard import
- `src/rules/actions/dictator-actions.ts` - 2 checks migrated, added isMercCard import
- `tests/action-conditions.test.ts` - 1 check migrated, added isMercCard import

## Decisions Made
- For DictatorUnit types (MercCard | DictatorCard), use `.isMerc`/`.isDictator` properties directly since CombatUnitCard provides them
- For unknown/element types from getElementById, use `isMercCard()` type guard for proper type narrowing

## Deviations from Plan

None - plan executed exactly as written. Note: helpers.ts had no remaining checks to migrate as they were completed in Plan 01.

## Issues Encountered
- None

## Phase 11 Completion Summary

**Total instanceof MercCard/DictatorCard checks migrated across Phase 11:**
- Plan 01: 56 checks (combat.ts)
- Plan 02: 32 checks (rebel-equipment.ts, rebel-economy.ts)
- Plan 03: 15 checks (ai-helpers.ts, ai-executor.ts, day-one-actions.ts, rebel-combat.ts, dictator-actions.ts, tests)
- **Total: 103 instanceof checks eliminated**

**Verification complete:**
- `npm run build` passes
- `grep -r "instanceof MercCard" src/rules/` returns empty
- `grep -r "instanceof DictatorCard" src/rules/` returns empty
- `grep -r "instanceof MercCard" tests/` returns empty
- `grep -r "instanceof DictatorCard" tests/` returns empty

## Next Phase Readiness
- Phase 11 complete - all instanceof checks migrated
- Ready for Phase 12: Merge Data Files

---
*Phase: 11-migrate-instanceof*
*Completed: 2026-01-11*
