---
phase: 14-image-path-fixes
plan: 01
subsystem: ui
tags: [vue, image-paths, dictator, combatant]

# Dependency graph
requires:
  - phase: 12
    provides: combatants.json with merged merc/dictator data
provides:
  - Correct image path generation for dictators (.png) and mercs (.jpg)
  - MercIconSmall isDictator support for fallback paths
  - SectorPanel dictator detection in getMercImagePath
affects: [16-abilities-for-controller, 17-hiring-unification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "isDictator check determines image extension (.png vs .jpg)"

key-files:
  created: []
  modified:
    - src/ui/components/MercIconSmall.vue
    - src/ui/components/DictatorPanel.vue
    - src/ui/components/SectorPanel.vue

key-decisions:
  - "Check dictatorId before mercId to detect combatant type"

patterns-established:
  - "Dictators use /dictators/*.png, mercs use /mercs/*.jpg"

issues-created: []

# Metrics
duration: 1min
completed: 2026-01-13
---

# Phase 14 Plan 01: Image Path Fixes Summary

**Fixed hardcoded `.jpg` extensions to use `.png` for dictator images, eliminating broken image display after v1.2 merge**

## Performance

- **Duration:** 1 min
- **Started:** 2026-01-13T20:31:28Z
- **Completed:** 2026-01-13T20:32:28Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- MercIconSmall now uses correct extension (.png for dictators, .jpg for mercs)
- DictatorPanel fallback path uses .png instead of .jpg
- SectorPanel getMercImagePath detects dictators via dictatorId and uses correct folder/extension

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix MercIconSmall and DictatorPanel extensions** - `de396b8` (fix)
2. **Task 2: Fix SectorPanel getMercImagePath function** - `c0dd92b` (fix)

## Files Created/Modified

- `src/ui/components/MercIconSmall.vue` - Use .png for dictators in imagePath and fallbackPath
- `src/ui/components/DictatorPanel.vue` - Use .png in dictatorImagePath fallback
- `src/ui/components/SectorPanel.vue` - Detect dictator in getMercImagePath, use correct folder/extension

## Decisions Made

- Check dictatorId before mercId to reliably detect combatant type (dictators always have dictatorId, mercs have mercId)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Phase 14 complete, ready for Phase 15 (Rename to Combatant)
- All dictator images will now display correctly in UI components

---
*Phase: 14-image-path-fixes*
*Completed: 2026-01-13*
