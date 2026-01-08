---
phase: 04-code-quality-state
plan: 02
subsystem: actions
tags: [cache, settings, migration]

# Dependency graph
requires:
  - phase: 04-code-quality-state
    plan: 01
    provides: global cache helpers (getGlobalCachedValue, setGlobalCachedValue, clearGlobalCachedValue)
provides:
  - dictator-actions.ts migrated to global cache helpers
  - day-one-actions.ts migrated to global cache helpers
affects: [04-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [global-cache-helpers]

key-files:
  created: []
  modified:
    - src/rules/actions/dictator-actions.ts
    - src/rules/actions/day-one-actions.ts

key-decisions:
  - "Use explicit type generics on get calls for type safety"

patterns-established:
  - "Global cache usage for dictator/game state that doesn't need player scoping"

issues-created: []

# Metrics
duration: 10 min
completed: 2026-01-08
---

# Phase 4 Plan 2: Global Cache Migration Summary

**Migrated dictator-actions.ts and day-one-actions.ts to use global cache helpers**

## Performance

- **Duration:** 10 min
- **Started:** 2026-01-08
- **Completed:** 2026-01-08
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Migrated Castro special action (castroBonusHire) to use global cache helpers
- Migrated dictator first merc hire (dictatorHireFirstMerc) to use global cache helpers
- Migrated dictator extra militia placement (dictatorPlaceExtraMilitia) to use global cache helpers
- Replaced 8 raw game.settings[] accesses in dictator-actions.ts
- Replaced 14 raw game.settings[] accesses in day-one-actions.ts
- All replacements use explicit type generics for type safety

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate dictator-actions.ts Castro special action** - `8288f2a` (refactor)
2. **Task 2: Migrate day-one-actions.ts dictator state** - `868af20` (refactor)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/rules/actions/dictator-actions.ts` - Migrated DRAWN_MERCS_KEY accesses to global cache helpers
- `src/rules/actions/day-one-actions.ts` - Migrated DRAWN_MERC_KEY and REMAINING_MILITIA_KEY accesses to global cache helpers

## Cache Keys Migrated

### dictator-actions.ts
- `_castro_drawn_mercs` (DRAWN_MERCS_KEY) - stores merc IDs drawn for Castro's bonus hire action

### day-one-actions.ts
- `dictatorFirstMercId` (DRAWN_MERC_KEY) - stores ID of drawn merc for dictator's first hire
- `_extra_militia_remaining` (REMAINING_MILITIA_KEY) - tracks remaining militia to place during setup

## Decisions Made
- Used `getGlobalCachedValue<number[]>` and `getGlobalCachedValue<number>` for explicit typing
- Used `?? []` or `?? total` fallbacks as specified in plan since getGlobalCachedValue returns undefined for missing keys

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Verification Results
- `npm run build` succeeds
- No raw game.settings[KEY] access remains for migrated keys
- Pre-existing test failures unrelated to migration (dictator initialization, MERC abilities)

## Next Phase Readiness
- Pattern established for migrating remaining files in 04-03 (rebel-economy.ts, flow.ts)

---
*Phase: 04-code-quality-state*
*Completed: 2026-01-08*
