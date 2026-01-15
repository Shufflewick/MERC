---
phase: 28-remove-legacy-comments
plan: 01
subsystem: rules, ui
tags: [cleanup, comments, deprecation, migration]

# Dependency graph
requires:
  - phase: 27-documentation
    provides: v1.5 CombatantModel unification completed
provides:
  - Clean codebase free of legacy migration markers
  - Removed all deprecated functions
  - Preserved UI fallback logic for saved games
affects: [29-rules-layer-id-cleanup, 30-ui-layer-id-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/rules/game.ts
    - src/rules/actions/rebel-economy.ts
    - src/rules/combat.ts
    - src/rules/ai-action-helpers.ts
    - src/rules/ai-helpers.ts
    - src/ui/components/CombatPanel.vue
    - src/ui/components/SectorTile.vue
    - src/ui/components/SquadPanel.vue
    - src/ui/components/GameBoard.vue
    - src/ui/components/SectorPanel.vue

key-decisions:
  - "Keep UI fallback logic (mercId || combatantId) for saved game compatibility"
  - "Remove type aliases RebelPlayer/DictatorPlayer as they're unused"

patterns-established: []

issues-created: []

# Metrics
duration: 8min
completed: 2026-01-15
---

# Phase 28 Plan 01: Remove Legacy Comments Summary

**Removed 10 deprecated functions, 2 type aliases, and all backward-compat comments while preserving saved game fallback logic**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-15T20:31:35Z
- **Completed:** 2026-01-15T20:40:14Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Removed 10 legacy wrapper functions from rebel-economy.ts (findMercSectorForExplore, isMercOwnedForExplore, canMercExplore, findMercSectorForTrain, canMercTrain, isMercOwnedForTrain, getPlayerMercsForCity, isMercOwnedForCity, etc.)
- Removed deprecated isBadger() and isKastern() functions from combat.ts
- Removed deprecated getAIMercActionPriority() from ai-action-helpers.ts
- Removed mercSquad legacy property and RebelPlayer/DictatorPlayer type aliases from game.ts
- Cleaned 8+ backward compat comments from Vue components while preserving fallback logic

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove legacy comments and type aliases from rules layer** - `47d74f0` (refactor)
2. **Task 2: Clean up backward compat comments in UI layer** - `e1ca999` (refactor)
3. **Task 3: Verify and update exports** - No commit (verification only)

**Plan metadata:** (pending)

## Files Created/Modified

- `src/rules/game.ts` - Removed mercSquad property, type aliases, legacy comment
- `src/rules/actions/rebel-economy.ts` - Removed 10 legacy wrapper functions
- `src/rules/combat.ts` - Removed deprecated isBadger/isKastern functions
- `src/rules/ai-action-helpers.ts` - Removed deprecated getAIMercActionPriority
- `src/rules/ai-helpers.ts` - Removed getAIMercActionPriority re-export
- `src/ui/components/CombatPanel.vue` - Removed comment, kept fallback logic
- `src/ui/components/SectorTile.vue` - Removed comment, kept interface properties
- `src/ui/components/SquadPanel.vue` - Removed comments, kept interface properties
- `src/ui/components/GameBoard.vue` - Removed 6 backward compat comments
- `src/ui/components/SectorPanel.vue` - Updated comment wording

## Decisions Made

- Kept UI fallback logic (e.g., `combatantId || mercId`) for saved game compatibility - these components may consume serialized data from older saves
- Removed RebelPlayer/DictatorPlayer type aliases since they were unused exports
- Verified all deprecated functions were truly unused before removal via grep

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all verifications passed (524 tests, build clean).

## Next Phase Readiness

- Legacy comments and deprecated functions fully cleaned
- Ready for Phase 29: Rules Layer ID Cleanup
- No blockers

---
*Phase: 28-remove-legacy-comments*
*Completed: 2026-01-15*
