---
phase: 38-unify-server-side-calculation
plan: 01
subsystem: rules
tags: [stat-modifiers, abilities, combatant, merc-abilities]

# Dependency graph
requires:
  - phase: 37-extend-ability-registry
    provides: StatModifier interface, getActiveStatModifiers(), StatModifierContext
provides:
  - activeStatModifiers property on CombatantBase
  - buildStatModifierContext() helper for condition evaluation
  - updateAbilityBonuses() unified entry point for ability calculations
  - getAbilityBonus() helper for summing modifiers by stat
affects: [39-unify-ui-breakdown, 40-unify-combat-time-application]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Unified stat modifier pattern: single activeStatModifiers array replaces individual bonus fields"
    - "Context builder pattern: buildStatModifierContext creates evaluation context for conditions"

key-files:
  created: []
  modified:
    - src/rules/elements.ts

key-decisions:
  - "Uses BASE initiative for highestInitInSquad check (per research, Sarge/Tack check base initiative)"
  - "Haarg's per-stat evaluation is special-cased because it can't be expressed in generic condition system"
  - "allSquad bonuses (Tack) include the source, squadMates bonuses (Valkyrie) exclude the source"

patterns-established:
  - "buildStatModifierContext: protected helper builds complete context for condition evaluation"
  - "updateAbilityBonuses: single entry point replaces multiple updateXBonus methods"
  - "getAbilityBonus: sums all modifiers for a specific stat"

# Metrics
duration: 2min
completed: 2026-02-03
---

# Phase 38 Plan 01: Add Unified Stat Modifier Infrastructure Summary

**activeStatModifiers array and helpers added to CombatantBase for unified ability stat calculations**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-03T19:33:44Z
- **Completed:** 2026-02-03T19:35:36Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Added activeStatModifiers: StatModifier[] property to hold all active stat modifiers
- Created buildStatModifierContext() to build evaluation context for ability conditions
- Created updateAbilityBonuses() as single entry point for ability calculations
- Created getAbilityBonus() to sum modifiers for a given stat
- Handles squad-received bonuses (Tack's allSquad, Valkyrie's squadMates)
- Special-cased Haarg's per-stat evaluation

## Task Commits

Each task was committed atomically:

1. **Task 1: Add imports and activeStatModifiers property** - `425db01` (feat)
2. **Task 2: Add buildStatModifierContext helper** - `5ad08c5` (feat)
3. **Task 3: Add updateAbilityBonuses and getAbilityBonus helpers** - `e60f975` (feat)

## Files Created/Modified
- `src/rules/elements.ts` - Added unified stat modifier infrastructure to CombatantBase

## Decisions Made
- Used equipment-effects helpers (isHandgun, isUzi, isExplosive, isSmaw) for weapon type determination in context builder
- Added hasExplosiveEquipped extension for Stumpy's accessory-based explosive check
- Uses BASE initiative for highestInitInSquad (per research, Sarge/Tack check base initiative before bonuses)
- Haarg's per-stat evaluation is special-cased - evaluates each stat individually since the squadMateHigherBase condition applies per-stat, not as a blanket check

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Infrastructure ready for Phase 39 (Unify UI Breakdown)
- activeStatModifiers array populated but not yet used in stat calculations (backward compatible)
- Old individual bonus fields (haargTrainingBonus, etc.) still used by updateComputedStats()
- Next phase will integrate getAbilityBonus() into updateComputedStats() and UI components

---
*Phase: 38-unify-server-side-calculation*
*Completed: 2026-02-03*
