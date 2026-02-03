---
phase: 37-extend-ability-registry
plan: 01
subsystem: rules
tags: [typescript, ability-system, stat-modifiers, merc-abilities]

# Dependency graph
requires:
  - phase: none
    provides: existing merc-abilities.ts registry structure
provides:
  - StatModifier interface for declarative stat bonuses
  - statModifiers arrays on all 19 stat-modifying MERCs
  - getActiveStatModifiers() and getAllStatModifiers() helper functions
  - Extended AbilityCondition with squadMateHigherBase
  - Extended BonusTarget with militia
affects: [38-unify-calculation, 39-unify-ui, 40-combat-application]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Declarative stat modifier pattern (stat, bonus, condition, target, label)
    - Condition evaluation function for 13 ability conditions

key-files:
  created: []
  modified:
    - src/rules/merc-abilities.ts

key-decisions:
  - "StatModifier uses string union for stat names (combat/training/initiative/health/targets/actions)"
  - "Conditions default to 'always', target defaults to 'self' - most modifiers need minimal fields"
  - "Haarg uses squadMateHigherBase condition - actual per-stat evaluation deferred to Phase 38"
  - "Existing combatModifiers/squadBonus/passive fields retained until Phase 38 migration"

patterns-established:
  - "StatModifier pattern: { stat, bonus, condition?, label?, target? }"
  - "getActiveStatModifiers(id, context) for condition-filtered modifiers"
  - "getAllStatModifiers(id) for all potential modifiers (UI display)"

# Metrics
duration: 4min
completed: 2026-02-03
---

# Phase 37 Plan 01: Extend Ability Registry Summary

**StatModifier interface with declarative stat bonus definitions for 19 MERCs, plus getActiveStatModifiers() helper for condition-based modifier retrieval**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-03T19:15:50Z
- **Completed:** 2026-02-03T19:19:30Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Added StatModifier interface as single source of truth for stat bonuses
- Extended AbilityCondition type with 'squadMateHigherBase' for Haarg's unique ability
- Extended BonusTarget type with 'militia' for Walter's ability
- Added statModifiers arrays to all 19 stat-modifying MERCs
- Implemented getActiveStatModifiers() with full condition evaluation for 13 condition types
- Implemented getAllStatModifiers() for UI display of potential bonuses

## Task Commits

Each task was committed atomically:

1. **Task 1: Add StatModifier interface and extend types** - `c4aa5d6` (feat)
2. **Task 2: Add statModifiers to all 18 stat-modifying MERCs** - `63affd8` (feat)
3. **Task 3: Add getActiveStatModifiers helper function** - `3e09aec` (feat)

## Files Created/Modified
- `src/rules/merc-abilities.ts` - Extended with StatModifier interface, 19 MERC statModifiers arrays, StatModifierContext interface, evaluateCondition(), getActiveStatModifiers(), getAllStatModifiers()

## Decisions Made
- **StatModifier stat union:** Used explicit union type ('combat' | 'training' | 'initiative' | 'health' | 'targets' | 'actions') rather than string for type safety
- **Default values:** condition defaults to 'always', target defaults to 'self' - keeps common cases minimal
- **Haarg handling:** Uses 'squadMateHigherBase' condition that returns true if any squad mates exist; actual per-stat comparison deferred to calculation layer in Phase 38
- **Additive migration:** Kept existing combatModifiers, squadBonus, passive fields - they remain functional until Phase 38 migrates calculation logic

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- StatModifier interface and data ready for Phase 38 to consume
- getActiveStatModifiers() function available for unified calculation logic
- All 19 MERCs have statModifiers defined, ready for calculation migration
- No blockers for Phase 38

---
*Phase: 37-extend-ability-registry*
*Completed: 2026-02-03*
