---
phase: 50-tactics-card-audit
plan: 04
subsystem: rules
tags: [tactics, lockdown, militia-placement, dictator, flow]

# Dependency graph
requires:
  - phase: 50-01
    provides: "Removed fabricated lockdownActive/generalisimoActive flags from game.ts"
  - phase: 50-03
    provides: "Generalissimo rewrite pattern, pendingGeneralissimoHire, flow loop placement"
provides:
  - "Correct Lockdown card: places 5 * rebelCount militia on base/adjacent sectors"
  - "pendingLockdownMilitia state for interactive human dictator placement"
  - "lockdownPlaceMilitia action for iterative sector+amount selection"
  - "lockdown-militia-placement flow loop between generalissimo-hire and tactics-combat"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Iterative placement action with per-round sector+amount selection"

key-files:
  created: []
  modified:
    - "src/rules/game.ts"
    - "src/rules/tactics-effects.ts"
    - "src/rules/actions/dictator-actions.ts"
    - "src/rules/actions/index.ts"
    - "src/rules/flow.ts"

key-decisions:
  - "AI distributes militia one-at-a-time round-robin to achieve even distribution across base+adjacent sectors"
  - "Human dictator picks sector and amount per action iteration, reuses existing loop pattern from kimBonusMilitia"
  - "Lockdown combat loops reuse the existing tactics-combat loops already in flow (no additional combat loops needed)"

patterns-established:
  - "Pending militia placement with sector filtering by cap: pattern for future placement actions"

# Metrics
duration: 3min
completed: 2026-02-09
---

# Phase 50 Plan 04: Lockdown Card Rewrite Summary

**Lockdown card rewritten to place 5 * rebelCount militia on base/adjacent sectors per CSV rules, replacing fabricated +1 armor bonus**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-09T02:53:02Z
- **Completed:** 2026-02-09T02:56:43Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Completely rewrote lockdown() to compute totalMilitia = 5 * rebelCount and place on base/adjacent sectors
- AI dictator auto-distributes evenly with round-robin, respecting 10-per-sector cap
- Human dictator gets iterative lockdownPlaceMilitia action with sector and amount choices
- Flow loop placed after generalissimo-hire, before existing tactics-combat loops which handle any queued combat
- Removed all references to fabricated lockdownActive flag

## Task Commits

Each task was committed atomically:

1. **Task 1: Add pending state and rewrite Lockdown effect** - `74c2faa` (feat)
2. **Task 2: Create lockdownPlaceMilitia action, register, and add flow step** - `d0018ed` (feat)

## Files Created/Modified
- `src/rules/game.ts` - Added pendingLockdownMilitia state and hasLockdownPending getter
- `src/rules/tactics-effects.ts` - Rewrote lockdown() from fabricated armor bonus to actual militia placement
- `src/rules/actions/dictator-actions.ts` - Created createLockdownPlaceMilitiaAction for interactive placement
- `src/rules/actions/index.ts` - Imported and registered createLockdownPlaceMilitiaAction
- `src/rules/flow.ts` - Added lockdown-militia-placement loop after generalissimo-hire

## Decisions Made
- AI distributes militia one-at-a-time in round-robin fashion across base + adjacent sectors, ensuring even spread while respecting 10-per-sector cap
- Human dictator uses iterative action pattern (same approach as Kim bonus militia) where each execution places militia in one sector with a chosen amount
- No additional combat loops needed for lockdown -- the existing tactics-combat loops already positioned after the lockdown loop naturally handle any combat queued during militia placement

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 4 plans in phase 50 are now complete
- All 14 tactics cards audited: Generalissimo, Lockdown, and Block Trade implementations corrected
- All tactics cards have animations via game.animate()
- Phase 50 (Tactics Card Audit) is complete

---
*Phase: 50-tactics-card-audit*
*Completed: 2026-02-09*
