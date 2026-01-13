---
phase: 16-abilities-for-controller
plan: 01
subsystem: gameplay
tags: [merc-abilities, doc, feedback, squidhead, hagness, dictator]

# Dependency graph
requires:
  - phase: 15-rename-to-combatant
    provides: Unified MERCPlayer class with team property
provides:
  - MERC abilities available to whoever controls the MERC (rebel or dictator)
  - Dictator can use Doc, Feedback, Squidhead, Hagness abilities
affects: [hiring-unification, data-consistency]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Controller-agnostic ability checks (isRebelPlayer OR isDictatorPlayer)

key-files:
  modified:
    - src/rules/actions/rebel-equipment.ts
    - src/rules/flow.ts

key-decisions:
  - "Use OR check (isRebelPlayer OR isDictatorPlayer) rather than separate implementations"

patterns-established:
  - "Ability actions check current player has the merc, regardless of rebel/dictator role"

issues-created: []

# Metrics
duration: 6min
completed: 2026-01-13
---

# Phase 16 Plan 01: Abilities for Controller Summary

**MERC special abilities now work for any controller - dictator can use Doc heal, Feedback discard, Squidhead mine handling, and Hagness equipment draw**

## Performance

- **Duration:** 6 min
- **Started:** 2026-01-13T20:57:00Z
- **Completed:** 2026-01-13T21:03:12Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Removed rebel-specific checks from 5 ability actions (docHeal, feedbackDiscard, squidheadDisarm, squidheadArm, hagnessDraw)
- Changed condition checks to work for both rebel AND dictator players
- Added all 5 ability actions to dictator-merc-action step in flow.ts
- Verified all Hagness tests pass (19 tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update action conditions** - `69f6099` (feat)
2. **Task 2: Add actions to flow** - `ecb497f` (feat)
3. **Task 3: Run tests** - (verification only, no commit)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `src/rules/actions/rebel-equipment.ts` - Updated docHeal, feedbackDiscard, squidheadDisarm, squidheadArm, hagnessDraw to check for both rebel and dictator players
- `src/rules/flow.ts` - Added docHeal, feedbackDiscard, squidheadDisarm, squidheadArm, hagnessDraw to dictator-merc-action step

## Decisions Made

- Used OR check pattern (`isRebelPlayer || isDictatorPlayer`) to allow both player types to use abilities when they control the relevant MERC
- Used `MERCPlayer` type (which both RebelPlayer and DictatorPlayer alias to) for type safety

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed successfully.

## Next Phase Readiness

- Phase 16 complete, ready for Phase 17 (Hiring Unification)
- Pre-existing test failures (52) remain from earlier work, unrelated to this phase

---
*Phase: 16-abilities-for-controller*
*Completed: 2026-01-13*
