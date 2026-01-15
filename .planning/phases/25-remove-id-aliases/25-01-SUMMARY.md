---
phase: 25-remove-id-aliases
plan: 01
subsystem: core
tags: [refactoring, class-hierarchy, combatant, identity, typescript]

# Dependency graph
requires:
  - phase: 24-merge-classes
    provides: CombatantModel with _combatantId/_combatantName properties
provides:
  - MercCard/DictatorCard no longer have their own ID property declarations
  - combatantId/combatantName are the sole identity properties (via parent)
  - mercId/mercName and dictatorId/dictatorName are now backward-compat getters
  - Data loading uses combatantId/combatantName directly
affects: [25-02-rename-usages-rules, 25-03-rename-usages-ui, 25-04-remove-aliases]

# Tech tracking
tech-stack:
  added: []
  patterns: [backward-compat-alias-getters]

key-files:
  created: []
  modified: [src/rules/elements.ts, src/rules/game.ts, src/rules/setup.ts]

key-decisions:
  - "Removed mercId!/mercName!/dictatorId!/dictatorName! property declarations"
  - "Changed combatantId/combatantName getters to return parent's _combatantId/_combatantName directly"
  - "Added temporary backward-compat getter/setter aliases marked for removal in Plan 04"
  - "Updated data loading to pass combatantId/combatantName instead of subclass property names"

patterns-established:
  - "Backward-compat alias pattern: get mercId() { return this.combatantId; }"

issues-created: []

# Metrics
duration: 8min
completed: 2026-01-15
---

# Phase 25 Plan 01: Prepare Identity Property Unification Summary

**MercCard/DictatorCard now use parent's combatantId/combatantName directly; subclass-specific IDs are backward-compat aliases**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-15T02:43:01Z
- **Completed:** 2026-01-15T02:50:34Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Removed `mercId!` and `mercName!` property declarations from MercCard
- Removed `dictatorId!` and `dictatorName!` property declarations from DictatorCard
- Changed combatantId/combatantName getters in both classes to use parent's `_combatantId/_combatantName` directly
- Added backward-compat getter/setter aliases for mercId/mercName and dictatorId/dictatorName
- Updated `loadCombatantData()` in game.ts to use combatantId/combatantName
- Updated `setupDictator()` in setup.ts to use combatantId/combatantName

## Task Commits

1. **Task 1: Update MercCard to use parent identity with backward-compat getters** - `f4c1c78` (refactor)
2. **Task 2: Update DictatorCard to use parent identity with backward-compat getters** - `b176e9d` (refactor)
3. **Task 3: Update data loading to use combatantId/combatantName** - `bb8809f` (refactor)

## Files Created/Modified

- `src/rules/elements.ts` - MercCard and DictatorCard now use parent identity with backward-compat aliases
- `src/rules/game.ts` - loadCombatantData() uses combatantId/combatantName
- `src/rules/setup.ts` - setupDictator() uses combatantId/combatantName

## Decisions Made

- Property declarations removed, replaced by getter/setter pairs
- Backward-compat aliases are clearly marked "TEMPORARY, remove in Phase 25 Plan 04"
- Data loading updated now so new combatants have canonical properties populated

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Verification Results

- `npm run build` - Passed
- `npm test` - 524 passed, 1 skipped (pre-existing)

## Next Phase Readiness

- Ready for Plan 02: Rename .mercId/.mercName usages in rules/ and tests/
- Ready for Plan 03: Rename .dictatorId/.dictatorName usages in ui/
- Backward-compat aliases ensure no runtime breakage during migration

---
*Phase: 25-remove-id-aliases*
*Completed: 2026-01-15*
