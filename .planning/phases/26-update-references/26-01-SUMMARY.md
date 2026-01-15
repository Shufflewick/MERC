---
phase: 26-update-references
plan: 01
subsystem: rules
tags: [typescript, refactoring, type-system, CombatantModel]

# Dependency graph
requires:
  - phase: 25-refactor-combatant-names
    provides: CombatantModel as unified base class for MercCard/DictatorCard
provides:
  - Removed all backward-compat export aliases (CombatUnit, CombatUnitCard, isCombatUnitCard)
  - Simplified type annotations using CombatantModel instead of MercCard | DictatorCard unions
affects: [rules, actions, combat]

# Tech tracking
tech-stack:
  added: []
  patterns: [Use CombatantModel for combatant type annotations]

key-files:
  created: []
  modified:
    - src/rules/index.ts
    - src/rules/elements.ts
    - src/rules/actions/helpers.ts
    - src/rules/ai-executor.ts
    - src/rules/actions/rebel-economy.ts
    - src/rules/actions/rebel-equipment.ts
    - src/rules/actions/dictator-actions.ts
    - src/rules/actions/rebel-movement.ts
    - src/rules/combat-types.ts

key-decisions:
  - "Replace local type aliases with direct CombatantModel usage for clarity"
  - "Remove deprecated export aliases completely rather than deprecation warnings"

patterns-established:
  - "Use CombatantModel for any function parameter or return type that accepts both MercCard and DictatorCard"

issues-created: []

# Metrics
duration: 12min
completed: 2026-01-14
---

# Phase 26-01: Update References Summary

**Removed backward-compat exports and unified MercCard/DictatorCard type annotations to CombatantModel**

## Performance

- **Duration:** 12 min
- **Started:** 2026-01-14T22:08:00Z
- **Completed:** 2026-01-14T22:20:00Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Removed deprecated CombatUnit, CombatUnitCard, and isCombatUnitCard exports
- Replaced 6 local type aliases (DictatorUnit, ExplorableUnit, CollectableUnit, TrainableUnit, CityUnit, EquippableUnit) with CombatantModel
- Replaced 14 inline MercCard | DictatorCard union annotations with CombatantModel
- All 524 tests pass, build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove backward-compat export aliases** - `e82cbc2` (refactor)
2. **Task 2: Replace type aliases with CombatantModel** - `b724512` (refactor)
3. **Task 3: Replace inline unions with CombatantModel** - `f8f6245` (refactor)

## Files Created/Modified
- `src/rules/index.ts` - Removed CombatUnit/CombatUnitCard re-exports
- `src/rules/elements.ts` - Removed CombatUnitCard alias export
- `src/rules/actions/helpers.ts` - Removed isCombatUnitCard alias, updated getUnitName/findUnitSector signatures
- `src/rules/ai-executor.ts` - Replaced DictatorUnit type alias, updated function signatures
- `src/rules/actions/rebel-economy.ts` - Replaced ExplorableUnit/CollectableUnit/TrainableUnit/CityUnit aliases
- `src/rules/actions/rebel-equipment.ts` - Replaced EquippableUnit alias and inline unions
- `src/rules/actions/dictator-actions.ts` - Replaced DictatorUnit type alias
- `src/rules/actions/rebel-movement.ts` - Replaced inline unions in getAssignableCombatants, getValidTargetSquads, getCombatantName
- `src/rules/combat-types.ts` - Updated Combatant.sourceElement type

## Decisions Made
None - followed plan as specified

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## Next Phase Readiness
- All backward-compat aliases removed
- Codebase uses CombatantModel consistently for combatant type annotations
- Ready for any further refactoring or feature development

---
*Phase: 26-update-references*
*Completed: 2026-01-14*
