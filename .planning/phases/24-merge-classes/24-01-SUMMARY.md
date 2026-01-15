---
phase: 24-merge-classes
plan: 01
subsystem: core
tags: [refactoring, class-hierarchy, combatant, typescript]

# Dependency graph
requires:
  - phase: 23-documentation
    provides: documented combatant class hierarchy
provides:
  - CombatantModel is now concrete (not abstract)
  - Unified _combatantId/_combatantName properties on CombatantModel
  - MercCard/DictatorCard use parent properties with backward-compat aliases
affects: [25-unify-type-checks, 26-remove-subclass-properties]

# Tech tracking
tech-stack:
  added: []
  patterns: [property-delegation-with-fallback]

key-files:
  created: []
  modified: [src/rules/elements.ts]

key-decisions:
  - "Used protected _combatantId/_combatantName for parent properties"
  - "Subclass getters prefer their own properties, fall back to parent"
  - "Setters sync both parent and subclass properties for full compatibility"

patterns-established:
  - "Property delegation: subclass.property || parent._property"

issues-created: []

# Metrics
duration: 9min
completed: 2026-01-15
---

# Phase 24 Plan 01: Make CombatantModel Concrete Summary

**CombatantModel is now a concrete class with _combatantId/_combatantName properties; MercCard/DictatorCard delegate to parent with backward-compatible fallbacks**

## Performance

- **Duration:** 9 min
- **Started:** 2026-01-15T02:24:54Z
- **Completed:** 2026-01-15T02:33:41Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- Made CombatantModel a concrete class (removed abstract keyword)
- Added _combatantId/_combatantName properties with getters/setters to CombatantModel
- Updated MercCard to delegate with `mercId || _combatantId` fallback
- Updated DictatorCard to delegate with `dictatorId || _combatantId` fallback
- All setters sync both parent and subclass properties

## Task Commits

All tasks committed together as a coherent refactoring unit:

1. **Task 1: Add ID properties to CombatantModel** - `518ac79` (refactor)
2. **Task 2: Simplify MercCard to use parent properties** - `518ac79` (refactor)
3. **Task 3: Simplify DictatorCard to use parent properties** - `518ac79` (refactor)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/rules/elements.ts` - Made CombatantModel concrete with unified ID properties, updated MercCard/DictatorCard to delegate

## Decisions Made

- Used `protected` visibility for _combatantId/_combatantName so subclasses can access
- Subclass getters prefer their own properties (mercId/dictatorId) with fallback to parent
- Setters sync both properties for full backward compatibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- CombatantModel is now concrete and ready for further unification
- MercCard/DictatorCard are now thin wrappers with backward-compat aliases
- Ready for Phase 24 Plan 02 (if any) or Phase 25

---
*Phase: 24-merge-classes*
*Completed: 2026-01-15*
