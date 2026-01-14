---
phase: 21-vue-component-renaming
plan: 01
subsystem: ui
tags: [vue, refactoring, component-renaming]

# Dependency graph
requires:
  - phase: 20-model-renaming
    provides: CombatantModel base class with backward-compat aliases
provides:
  - Vue component renamed from MercCard.vue to CombatantCard.vue
  - All Vue imports and template usages updated
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/ui/components/CombatantCard.vue (renamed from MercCard.vue)
    - src/ui/components/GameBoard.vue
    - src/ui/components/SectorPanel.vue
    - src/ui/components/DictatorPanel.vue
    - src/ui/components/SquadPanel.vue
    - src/ui/components/SectorTile.vue

key-decisions:
  - "Task 3 skipped - className strings refer to TypeScript model class, not Vue component"
  - "Model class MercCard kept as-is; Vue component renamed to CombatantCard"

patterns-established: []

issues-created: []

# Metrics
duration: 3min
completed: 2026-01-14
---

# Phase 21 Plan 01: Rename MercCard.vue Summary

**Renamed Vue component MercCard.vue to CombatantCard.vue with CSS class and import updates across 5 files**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-14T18:51:32Z
- **Completed:** 2026-01-14T18:54:57Z
- **Tasks:** 2 completed, 1 skipped (see Deviations)
- **Files modified:** 6

## Accomplishments

- Renamed MercCard.vue to CombatantCard.vue
- Updated CSS class from .merc-card to .combatant-card
- Updated all Vue component imports in 5 files
- Updated all template usages from `<MercCard>` to `<CombatantCard>`
- Build passes successfully

## Task Commits

1. **Task 1: Rename MercCard.vue to CombatantCard.vue** - `0c790c7` (refactor)
2. **Task 2: Update Vue component imports** - `b8fbbb7` (refactor)
3. **Task 3: Update className string references** - SKIPPED (see Deviations)

## Files Created/Modified

- `src/ui/components/CombatantCard.vue` - Renamed from MercCard.vue, CSS class updated
- `src/ui/components/GameBoard.vue` - Import and template usage updated
- `src/ui/components/SectorPanel.vue` - Import and template usage updated
- `src/ui/components/DictatorPanel.vue` - Import and template usage updated
- `src/ui/components/SquadPanel.vue` - Import and template usage updated
- `src/ui/components/SectorTile.vue` - Import and template usage updated

## Decisions Made

- **Task 3 skipped** - The plan asked to update `className === 'MercCard'` strings to `'CombatantCard'`, but these strings refer to the **TypeScript model class** (MercCard in elements.ts), not the Vue component. Changing them without renaming the model class would break serialization.

## Deviations from Plan

### Skipped Task

**Task 3: Update className string references** - SKIPPED

- **Reason:** The `'MercCard'` strings in game.ts and GameBoard.vue are BoardSmith classRegistry keys and className checks that must match the TypeScript model class name. The model class is `class MercCard extends CombatantModel` in elements.ts. Changing the registry key or className checks to `'CombatantCard'` without renaming the model class would break:
  1. Element serialization/deserialization
  2. UI element identification

- **Impact:** None - the Vue component is correctly renamed. The model class name is a separate concern that should be addressed in a dedicated phase if desired.

- **Evidence:** The build passes and all Vue component references are correctly updated.

---

**Total deviations:** 1 task skipped (architectural mismatch in plan)
**Impact on plan:** Vue component renaming complete. Model class renaming is separate scope.

## Issues Encountered

None - tasks 1 and 2 completed cleanly.

## Next Phase Readiness

- Phase 21 (Vue Component Renaming) complete
- CombatantCard.vue is the new Vue component name
- Build passes successfully
- Model class `MercCard` remains unchanged (correct - it's a separate concern)

---
*Phase: 21-vue-component-renaming*
*Completed: 2026-01-14*
