---
phase: 51-extract-combat-sub-flow
plan: 01
subsystem: rules
tags: [boardsmith, flow, refactoring, combat, deduplication]

# Dependency graph
requires: []
provides:
  - "combatResolutionFlow(game, prefix) function in flow.ts"
  - "Single source of truth for combat resolution pipeline"
  - "4 call sites using parameterized prefix for loop name uniqueness"
affects:
  - "52-shared-combat-flow"
  - "53-simultaneous-rebel-turns"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sub-flow extraction: TypeScript function returning sequence() for reusable flow composition"

key-files:
  created: []
  modified:
    - "src/rules/flow.ts"

key-decisions:
  - "Kept combatResolutionFlow in flow.ts rather than separate file (uses same helper functions, stays private to flow definition)"
  - "Normalized loop names to use consistent ${prefix}-* pattern across all 4 sites (no tests reference loop names)"

patterns-established:
  - "Flow sub-flow pattern: function returning sequence() with parameterized loop name prefix"

# Metrics
duration: 10min
completed: 2026-02-16
---

# Phase 51 Plan 01: Extract Combat Sub-Flow Summary

**combatResolutionFlow(game, prefix) extracts 10-block combat pipeline from 4 duplicate sites, reducing flow.ts by 934 lines**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-16T21:41:29Z
- **Completed:** 2026-02-16T21:55:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Extracted all 10 combat resolution blocks (healing, attack dog, target, hits, wolverine, epinephrine, continue, retreat, auto-clear, animation-wait) into a single combatResolutionFlow function
- Replaced 4 inline copies at rebel, tactics, dictator, and Kim militia sites with parameterized calls
- Reduced flow.ts from 1648 to 986 lines (934 deletions, 272 insertions)
- All 682 tests pass, no behavioral changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract combatResolutionFlow function** - `82cc063` (refactor)
2. **Task 2: Run full test suite** - verification only, no commit needed

**Plan metadata:** (pending)

## Files Created/Modified
- `src/rules/flow.ts` - Added combatResolutionFlow function, replaced 4 inline combat blocks with calls

## Decisions Made
- Kept function in flow.ts rather than a separate combat-flow.ts file, since it uses the same helper functions (getCombatDecisionPlayer, getCombatDecisionParticipants, etc.) and is private to the flow definition
- Normalized loop name prefixes to be consistent across all 4 sites. The rebel site previously used inconsistent naming (combat-* for most loops but rebel-combat-animation-wait for the animation wait). Now all sites use ${prefix}-* consistently. No tests reference loop names so this is safe.
- Used prefix parameter for loop name uniqueness as recommended by research

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- mcts-clone test flaky timeout (120s boundary, takes ~106-115s). Pre-existing, not caused by refactoring. Passes on retry.
- BoardSmith validate bundle size check fails (860KB > 500KB limit). Pre-existing, not caused by refactoring.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- combatResolutionFlow is ready to be invoked from a shared sub-flow in Phase 52+
- The function signature (game, prefix) supports the simultaneous rebel turns pattern where combat resolution will be invoked from different contexts
- No blockers for next phase

---
*Phase: 51-extract-combat-sub-flow*
*Completed: 2026-02-16*
