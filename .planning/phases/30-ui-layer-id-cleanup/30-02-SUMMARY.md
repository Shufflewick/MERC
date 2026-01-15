---
phase: 30-ui-layer-id-cleanup
plan: 02
subsystem: ui
tags: [vue, refactoring, naming, combatant]

# Dependency graph
requires:
  - phase: 30-01
    provides: UI component interfaces with combatantName
provides:
  - Clean UI components with combatantName as only identity property
  - Removed all mercName/dictatorName fallback chains
  - Data mappings use combatantId/combatantName consistently
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/ui/components/CombatantCard.vue
    - src/ui/components/SectorTile.vue
    - src/ui/components/SquadPanel.vue
    - src/ui/components/DictatorPanel.vue
    - src/ui/components/SectorPanel.vue
    - src/ui/components/GameBoard.vue
    - tests/error-conditions.test.ts

key-decisions:
  - "Removed mercName fallback from computed properties, using combatantName only"
  - "Local variable names kept as-is (mercName variable fetches combatantName value)"

patterns-established: []

issues-created: []

# Metrics
duration: 12 min
completed: 2026-01-15
---

# Phase 30 Plan 02: Remove Fallback Chains Summary

**Removed all mercName/dictatorName fallback chains from UI components, completing v1.6 Final ID Cleanup milestone**

## Performance

- **Duration:** 12 min
- **Started:** 2026-01-15T17:02:00Z
- **Completed:** 2026-01-15T17:14:00Z
- **Tasks:** 4
- **Files modified:** 7

## Accomplishments
- Removed mercName fallback from CombatantCard.vue computed property
- Removed mercId/mercName from SectorTile.vue interface and getMercKey
- Removed dictatorId/dictatorName from DictatorPanel.vue props interface
- Updated all data mappings in GameBoard.vue to use combatantId/combatantName
- Updated test fixture to use combatantId/combatantName

## Task Commits

Each task was committed atomically:

1. **Task 1: Clean up CombatantCard.vue and SectorTile.vue** - `6bd58d9` (refactor)
2. **Task 2: Clean up SquadPanel.vue and DictatorPanel.vue** - `8f8bee3` (refactor)
3. **Task 3: Clean up SectorPanel.vue and GameBoard.vue** - `d24d19f` (refactor)
4. **Task 4: Update test fixture** - `bd325fc` (test)

**Plan metadata:** (pending)

## Files Created/Modified
- `src/ui/components/CombatantCard.vue` - Removed mercName from getProp fallback chain
- `src/ui/components/SectorTile.vue` - Removed mercId/mercName from interface and getMercKey
- `src/ui/components/SquadPanel.vue` - Removed mercId/mercName from interface and getMercKey
- `src/ui/components/DictatorPanel.vue` - Removed dictatorId/dictatorName from props interface
- `src/ui/components/SectorPanel.vue` - Updated data mappings to use combatantId/combatantName
- `src/ui/components/GameBoard.vue` - Updated ~13 data mapping keys and fallback chains
- `tests/error-conditions.test.ts` - Updated test fixture to use combatantId/combatantName

## Decisions Made
None - followed plan as specified

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## Next Phase Readiness
- Phase 30 complete
- v1.6 Final ID Cleanup milestone complete
- All 3 phases (28-30) finished
- Ready for /gsd:complete-milestone

---
*Phase: 30-ui-layer-id-cleanup*
*Completed: 2026-01-15*
