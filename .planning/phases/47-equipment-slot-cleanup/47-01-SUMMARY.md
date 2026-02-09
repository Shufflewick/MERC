---
phase: 47-equipment-slot-cleanup
plan: 01
subsystem: rules
tags: [equipment, bandolier, equip, tdd, type-safety]

# Dependency graph
requires: []
provides:
  - "EquipResult type for equip() return values"
  - "Bandolier displacement on accessory replacement in CombatantBase and CombatantModel"
  - "10 equipment-slot tests covering bandolier and non-bandolier equip scenarios"
affects:
  - "47-02: Must update all equip() callers to use EquipResult"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "EquipResult return type forces callers to handle displaced bandolier items"
    - "clearBandolierSlots() called before clearSlot() when replacing a bandolier accessory"

key-files:
  created:
    - "tests/equipment-slots.test.ts"
  modified:
    - "src/rules/elements.ts"
    - "tests/hagness-vulture.test.ts"

key-decisions:
  - "Changed equip() return type from Equipment | undefined to EquipResult (compiler-enforced pit of success)"
  - "Removed unreachable 'replace empty bandolier' test case (equip() never triggers replacement when bandolier has available slots)"

patterns-established:
  - "EquipResult { replaced?: Equipment; displacedBandolierItems: Equipment[] } for all equip() callers"

# Metrics
duration: 5min
completed: 2026-02-08
---

# Phase 47 Plan 01: Bandolier-aware equip() return type Summary

**EquipResult type on equip() with bandolier displacement, 10 TDD tests, compiler catches all callers needing update**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-09T00:56:31Z
- **Completed:** 2026-02-09T01:01:16Z
- **Tasks:** 1 feature (TDD: RED + GREEN, no REFACTOR needed)
- **Files modified:** 3

## Accomplishments
- `CombatantBase.equip()` and `CombatantModel.equip()` now return `EquipResult` with both replaced item and displaced bandolier contents
- When replacing a bandolier accessory, `clearBandolierSlots()` is called before clearing the accessory slot, eliminating phantom slots
- Gunther's special accessory equip path also handles bandolier displacement
- TypeScript compiler enforces that all callers handle the new return type (4 source files flagged)
- All 637 existing tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **RED: Failing tests for bandolier-aware equip()** - `8e244d7` (test)
2. **GREEN: Implement EquipResult return type** - `329e983` (feat)

_REFACTOR phase skipped -- implementation was clean, no cleanup needed._

## Files Created/Modified
- `src/rules/elements.ts` - Added EquipResult interface, updated CombatantBase.equip() and CombatantModel.equip() to return it with bandolier handling
- `tests/equipment-slots.test.ts` - 10 new tests: 5 non-bandolier scenarios, 3 bandolier replacement scenarios, 1 armor scenario, 1 Gunther scenario
- `tests/hagness-vulture.test.ts` - Updated 3 existing tests to use EquipResult destructuring

## Decisions Made
- Changed `equip()` return type rather than adding a separate method -- this is the "pit of success" approach where the compiler forces all callers to handle displaced bandolier items
- Removed the "replace empty bandolier" test case -- it was unreachable because `equip()` only enters the replacement branch when `getAvailableBandolierSlots() === 0`, and an empty bandolier always has available slots

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated hagness-vulture.test.ts for new return type**
- **Found during:** GREEN phase (all-tests regression check)
- **Issue:** 3 tests in hagness-vulture.test.ts compared equip() result directly to Equipment/undefined, breaking with new EquipResult type
- **Fix:** Updated to use `result.replaced` destructuring pattern
- **Files modified:** tests/hagness-vulture.test.ts
- **Verification:** All 637 tests pass
- **Committed in:** 329e983 (GREEN phase commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to maintain zero-regression test baseline. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- EquipResult type is exported and ready for callers to import
- TypeScript compiler identifies all 4 source files needing update: helpers.ts, rebel-economy.ts, rebel-equipment.ts, day-one.ts
- Plan 02 will update these callers to destructure EquipResult and route displaced bandolier items to sector stash

---
*Phase: 47-equipment-slot-cleanup*
*Completed: 2026-02-08*
