---
phase: 20-model-renaming
plan: 03
subsystem: rules
tags: [typescript, refactoring, type-guards]

# Dependency graph
requires:
  - phase: 20-02
    provides: CombatantModel exports and backward-compat aliases
provides:
  - Complete model renaming across all TypeScript files
  - Updated type guard function usage (isCombatantModel)
affects: [21-vue-renaming]

# Tech tracking
tech-stack:
  added: []
  patterns: [isCombatantModel type guard]

key-files:
  created: []
  modified:
    - src/rules/actions/rebel-economy.ts
    - src/rules/actions/rebel-equipment.ts

key-decisions:
  - "Most files already use correct concrete types (MercCard, DictatorCard)"
  - "Only type guard function needed renaming in action files"

patterns-established:
  - "Use isCombatantModel for type guards, not deprecated isCombatUnitCard"

issues-created: []

# Metrics
duration: 11min
completed: 2026-01-14
---

# Phase 20 Plan 03: Update Remaining Files Summary

**Completed model renaming by updating type guard function usage from isCombatUnitCard to isCombatantModel in action files**

## Performance

- **Duration:** 11 min
- **Started:** 2026-01-14T18:32:00Z
- **Completed:** 2026-01-14T18:43:28Z
- **Tasks:** 3 (2 no-op, 1 actual change)
- **Files modified:** 2

## Accomplishments

- Updated rebel-economy.ts to import and use `isCombatantModel` instead of `isCombatUnitCard`
- Updated rebel-equipment.ts to import and use `isCombatantModel` instead of `isCombatUnitCard`
- Verified AI helper files already use correct types (CombatantModel where polymorphism needed)
- Verified rules files use correct concrete types (MercCard, DictatorCard)
- Verified test files don't reference old CombatUnit/CombatUnitCard names

## Task Commits

1. **Task 1: Update AI helper files** - NO CHANGES NEEDED (already uses CombatantModel)
2. **Task 2: Update remaining rules files** - NO CHANGES NEEDED (use concrete types)
3. **Task 3: Update test files** - NO CHANGES NEEDED (use MercCard/DictatorCard)

Actual change committed:
- **Update action files to use isCombatantModel** - `ea2fb23` (feat)

## Files Created/Modified

- `src/rules/actions/rebel-economy.ts` - Import and usage of isCombatantModel
- `src/rules/actions/rebel-equipment.ts` - Import and usage of isCombatantModel

## Decisions Made

- Most AI helper and rules files already use the correct concrete types (`MercCard`, `DictatorCard`) where specificity is needed
- The `CombatantModel` type is only needed where polymorphism is required (type guards, generic combatant handling)
- Test files correctly import concrete types from elements.js and don't need updating

## Deviations from Plan

### Analysis Results

The plan expected more files to need updating, but analysis showed:

1. **AI helper files** - Already correctly use `CombatantModel` for polymorphic operations and `MercCard`/`DictatorCard` for specific operations
2. **Rules files** - Correctly use concrete types (`MercCard`, `DictatorCard`, `TacticsCard`) since they work with specific card types
3. **Test files** - Import from elements.js using concrete types, not the abstract base classes

Only the type guard function (`isCombatUnitCard` → `isCombatantModel`) in action files needed updating.

**Impact on plan:** Minimal actual changes needed. The codebase was already well-organized with appropriate type usage.

## Issues Encountered

- Pre-existing TypeScript errors in day-one-actions.ts and dictator-actions.ts (API compatibility issues with @boardsmith/engine) - unrelated to model renaming
- Pre-existing test failures (56 in action-conditions.test.ts) - documented in STATE.md as unrelated to cleanup work

## Next Phase Readiness

- Phase 20 (Model Renaming) complete
- All TypeScript files use correct naming (CombatantBase/CombatantModel)
- Backward-compat aliases (`CombatUnit`, `CombatUnitCard`, `isCombatUnitCard`) preserved in exports for gradual migration
- Ready for Phase 21 (Vue Component Renaming)

---
*Phase: 20-model-renaming*
*Completed: 2026-01-14*
