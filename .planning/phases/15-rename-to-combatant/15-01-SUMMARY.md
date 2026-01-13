---
phase: 15-rename-to-combatant
plan: 01
subsystem: ui
tags: [vue, components, refactor, combatant]

# Dependency graph
requires:
  - phase: 14
    provides: image path fixes ensuring dictators use .png extension
provides:
  - CombatantIcon.vue with auto-detect dictator via mercId prefix
  - CombatantIconSmall.vue with same auto-detection
  - All consumers updated to unified combatant component naming
affects: [16-abilities, 17-hiring, future UI work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Auto-detect dictator from mercId prefix (dictator-*)
    - Unified combatant icon components for both mercs and dictators

key-files:
  created:
    - src/ui/components/CombatantIcon.vue
    - src/ui/components/CombatantIconSmall.vue
  modified:
    - src/ui/components/SectorTile.vue
    - src/ui/components/DictatorPanel.vue
    - src/ui/components/SectorPanel.vue
    - src/ui/components/GameBoard.vue
    - src/ui/components/MercCard.vue
    - src/ui/components/DrawEquipmentType.vue
    - src/ui/components/CombatPanel.vue

key-decisions:
  - "Auto-detect dictator via mercId prefix rather than explicit prop"
  - "Keep isDictator prop available as override"

patterns-established:
  - "Combatant naming: unified terminology for mercs and dictators in UI"
  - "Auto-detection: components infer type from data prefix"

issues-created: []

# Metrics
duration: 5min
completed: 2026-01-13
---

# Phase 15 Plan 01: Rename MercIcon to CombatantIcon Summary

**Created CombatantIcon.vue and CombatantIconSmall.vue with auto-detect dictator via mercId prefix, updated 7 consumer components**

## Performance

- **Duration:** 5 min
- **Started:** 2026-01-13T20:36:29Z
- **Completed:** 2026-01-13T20:41:18Z
- **Tasks:** 3
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments

- Created CombatantIcon.vue with auto-detect dictator logic (checks for `dictator-` prefix)
- Created CombatantIconSmall.vue with same auto-detection pattern
- Updated all 7 consumer components to use new Combatant naming
- Verified build passes with new component structure

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename and enhance icon components** - `becca7b` (refactor)
2. **Task 2: Update all consumers** - `c40e0aa` (refactor)
3. **Task 3: Verify TypeScript types and build** - (verified, no commit needed)

**Plan metadata:** (pending)

## Files Created/Modified

### Created
- `src/ui/components/CombatantIcon.vue` - Full-size combatant icon with name, auto-detects dictator
- `src/ui/components/CombatantIconSmall.vue` - Small portrait icon, auto-detects dictator

### Modified
- `src/ui/components/SectorTile.vue` - 2 usages updated with mercId prop
- `src/ui/components/DictatorPanel.vue` - 2 usages updated
- `src/ui/components/SectorPanel.vue` - 9 usages updated
- `src/ui/components/GameBoard.vue` - Imports and 2 usages updated
- `src/ui/components/MercCard.vue` - Header portrait updated
- `src/ui/components/DrawEquipmentType.vue` - Equipment selection portrait updated
- `src/ui/components/CombatPanel.vue` - 2 usages and CSS selector updated

### Deleted
- `src/ui/components/MercIcon.vue`
- `src/ui/components/MercIconSmall.vue`

## Decisions Made

- **Auto-detect over explicit:** Components auto-detect dictator status from `mercId?.startsWith('dictator-')` rather than requiring explicit `isDictator` prop
- **Keep override:** isDictator prop remains available as override for edge cases
- **CSS class naming:** Updated from `.merc-icon` to `.combatant-icon` for consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing TypeScript errors in day-one-actions.ts (unrelated to this rename)
- Build passes despite TS errors (these are pre-existing)

## Next Phase Readiness

- Icon components renamed and unified under "Combatant" terminology
- Auto-detection pattern established for dictator vs merc
- Ready for Phase 16: Abilities for Controller

---
*Phase: 15-rename-to-combatant*
*Completed: 2026-01-13*
