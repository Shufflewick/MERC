---
phase: 39-unify-ui-breakdown
plan: 01
subsystem: ui
tags: [vue, stat-modifiers, tooltips, breakdown]

# Dependency graph
requires:
  - phase: 38-unify-server-side-calculation
    provides: activeStatModifiers array populated by updateAbilityBonuses()
provides:
  - Unified breakdown generation from activeStatModifiers
  - getAbilityModifiersForStat() helper for stat-specific filtering
  - Removed 20+ hardcoded bonus field checks
affects: [40-unify-combat-time-application, 41-testing-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read ability bonuses from activeStatModifiers array instead of individual fields"
    - "Use getAbilityModifiersForStat() to filter modifiers by stat type"

key-files:
  created: []
  modified:
    - src/ui/components/CombatantCard.vue

key-decisions:
  - "Vulture's penalty negation preserved as intentional exception - not in activeStatModifiers"
  - "Prefer effectiveTargets and effectiveActions from server when available"

patterns-established:
  - "UI reads ability bonuses from unified source, no hardcoded ability checks"

# Metrics
duration: 3min
completed: 2026-02-03
---

# Phase 39 Plan 01: Unify UI Breakdown Summary

**Replaced 20+ hardcoded bonus field checks in CombatantCard.vue with unified iteration over activeStatModifiers**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-03T19:52:46Z
- **Completed:** 2026-02-03T19:55:21Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added getAbilityModifiersForStat() helper to filter modifiers by stat type
- Replaced all hardcoded bonus checks in 6 breakdown computeds
- Removed "Ability +X" fallback that caused double display bug
- Preserved Vulture's penalty negation as intentional special case
- Net reduction of 108 lines (-142 removed, +34 added)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add MercData interface field and helper function** - `f0c5358` (feat)
2. **Task 2: Replace hardcoded bonus checks with unified iteration** - `886c32a` (refactor)

## Files Created/Modified
- `src/ui/components/CombatantCard.vue` - Unified ability bonus display from activeStatModifiers

## Decisions Made
- **Vulture preserved:** Vulture's ability negates equipment penalties (calculated client-side from breakdown), not a bonus from activeStatModifiers. This is intentional - it shows penalty negation, not an additive bonus.
- **Server preference:** Updated targets and maxActions computeds to prefer effectiveTargets/effectiveActions from server when available, with client-side fallback calculation.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- UI breakdown now unified with server-calculated ability bonuses
- Ready for Phase 40: Unify Combat-Time Application
- All 580 tests pass

---
*Phase: 39-unify-ui-breakdown*
*Completed: 2026-02-03*
