---
phase: 41-testing-verification
plan: 01
subsystem: testing
tags: [vitest, integration-tests, stat-modifiers, merc-abilities]

# Dependency graph
requires:
  - phase: 40
    provides: Unified stat ability system with activeStatModifiers
provides:
  - Integration tests for 11 stat-modifying abilities
  - Bug fix for hasExplosive condition (accessory slot support)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Equipment-conditional ability test pattern: equip + updateAbilityBonuses + verify effectiveStat + verify activeStatModifiers"
    - "Passive ability test pattern: updateAbilityBonuses + verify effective stat = base + bonus + verify activeStatModifiers"

key-files:
  created: []
  modified:
    - tests/merc-abilities-integration.test.ts
    - src/rules/merc-abilities.ts

key-decisions:
  - "Shooter test uses relative check (baseCombat + 3) since JSON base stats vary"
  - "Fixed hasExplosive condition to support accessory/bandolier slots (Stumpy's grenade usage)"

patterns-established:
  - "All equipment-conditional tests follow: equip -> updateAbilityBonuses([]) -> verify effectiveStat -> verify activeStatModifiers"
  - "Use isHandgun/isUzi/isExplosive/isSmaw helpers for type-safe equipment lookup"

# Metrics
duration: 4min
completed: 2026-02-03
---

# Phase 41 Plan 01: Equipment-Conditional and Passive Ability Stats Summary

**Integration tests verifying unified stat system for 11 MERCs: 8 equipment-conditional abilities and 3 passive abilities with effectiveStat and activeStatModifiers verification**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-03T21:07:21Z
- **Completed:** 2026-02-03T21:11:32Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added 8 equipment-conditional ability tests (Bouba, Mayhem, Rozeske, Stumpy, Vandradi, Dutch, Moe, Ra)
- Added Shooter passive ability test verifying +3 combat bonus
- Enhanced Juicer and Ewok tests to verify activeStatModifiers content
- Fixed bug in hasExplosive condition evaluation for Stumpy's accessory-slot grenades
- All 589 tests pass (64 in merc-abilities-integration.test.ts)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add equipment-conditional ability tests** - `987ca8f` (test)
2. **Task 2: Add passive ability tests** - `ae8c4f1` (test)

## Files Created/Modified

- `tests/merc-abilities-integration.test.ts` - Added Equipment-Conditional Ability Stats describe block with 8 tests, enhanced Health and Action Modifiers section with Shooter test and activeStatModifiers verification for Juicer/Ewok
- `src/rules/merc-abilities.ts` - Fixed hasExplosive condition to check hasExplosiveEquipped for accessory/bandolier slots

## Decisions Made

1. **Shooter test uses relative check** - The plan stated Shooter has baseCombat=0, but JSON shows baseCombat=3. Test updated to verify `effectiveCombat === baseCombat + 3` without assuming specific base value.
2. **Fixed hasExplosive condition** - The evaluateCondition function only checked weapon slot, but Stumpy can use grenades from accessory/bandolier slots. Added check for `hasExplosiveEquipped` field from context.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed hasExplosive condition for accessory-slot explosives**
- **Found during:** Task 1 (Stumpy test)
- **Issue:** `evaluateCondition('hasExplosive', context)` only checked `equipment?.weapon?.type`, missing explosives in accessory/bandolier slots
- **Fix:** Added check for `hasExplosiveEquipped` field from buildStatModifierContext()
- **Files modified:** src/rules/merc-abilities.ts
- **Verification:** Stumpy test passes with grenade in accessory slot
- **Committed in:** 987ca8f (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Bug fix was necessary for correct Stumpy ability behavior. No scope creep.

## Issues Encountered

- Plan research incorrectly stated Shooter's baseCombat=0, but JSON shows baseCombat=3. Adjusted test to not assume specific base stat value.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 41 is the final phase of v1.8 Unified Stat Ability System milestone
- All 11 MERCs tested for equipment-conditional and passive abilities
- Combat-only abilities (Max, Walter, Khenn, Golem) preserved in combat.ts per Phase 40 design
- Milestone complete: Single source of truth for ability stat bonuses verified

---
*Phase: 41-testing-verification*
*Completed: 2026-02-03*
