---
phase: 47-equipment-slot-cleanup
plan: 02
subsystem: rules
tags: [equipment, bandolier, equip, callers, displaced-items]

# Dependency graph
requires:
  - "47-01: EquipResult type and bandolier-aware equip() method"
provides:
  - "All equip() callers updated to handle EquipResult with displaced bandolier items"
  - "Displaced bandolier items routed to sector stash or discard pile at every call site"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Destructure { replaced, displacedBandolierItems } at every equip() call site"
    - "Route displaced items to sector stash when available, discard pile otherwise"
    - "Handle damaged displaced items via discard fallback when sector.addToStash() returns false"

key-files:
  created: []
  modified:
    - "src/rules/actions/rebel-equipment.ts"
    - "src/rules/actions/rebel-economy.ts"
    - "src/rules/actions/day-one-actions.ts"
    - "src/rules/actions/helpers.ts"
    - "src/rules/actions/dictator-actions.ts"
    - "src/rules/day-one.ts"
    - "src/rules/dictator-abilities.ts"
    - "src/rules/tactics-effects.ts"
    - "src/rules/ai-helpers.ts"

key-decisions:
  - "Two Vrbansk initial equip calls left without destructuring (merc starts empty, no displacement possible)"
  - "Displaced items that fail sector.addToStash() (damaged) fall through to discard pile"
  - "Game messages inform players when bandolier contents are displaced"

patterns-established:
  - "Every equip() caller destructures EquipResult and routes displaced bandolier items"

# Metrics
duration: 5min
completed: 2026-02-08
---

# Phase 47 Plan 02: Update all equip() callers for EquipResult Summary

**All 16 equip() call sites updated to destructure EquipResult, route displaced bandolier items to stash or discard, zero TypeScript errors**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-09T01:02:37Z
- **Completed:** 2026-02-09T01:07:30Z
- **Tasks:** 1 feature task
- **Files modified:** 9

## Accomplishments
- Updated 16 equip() call sites across 9 files to handle EquipResult return type
- Call sites with sector access (reEquip, reEquipContinue, collectEquipment, equipFromStash, buyAndEquip, squidheadDisarm, AI equip, equipNewHire) route displaced items to sector stash
- Call sites without sector access (feedbackDiscard, hagnessGiveEquipment, dictator equip, tactics equip) route displaced items to discard pile
- Damaged displaced items that fail addToStash() fall through to discard pile
- Game messages added at every call site when bandolier contents are displaced
- TypeScript compiles cleanly with zero errors (was 33 errors before)
- All 637 existing tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Update all equip() callers to handle EquipResult** - `0a0c5a9` (feat)

## Files Created/Modified
- `src/rules/actions/rebel-equipment.ts` - Updated reEquip, reEquipContinue, feedbackDiscard, squidheadDisarm, hagnessGiveEquipment (5 call sites)
- `src/rules/actions/rebel-economy.ts` - Updated collectEquipment, equipFromStash, buyAndEquip (3 call sites)
- `src/rules/actions/helpers.ts` - Updated equipNewHire (2 call sites)
- `src/rules/actions/day-one-actions.ts` - Updated dictator merc hire and Kim base equip (2 call sites)
- `src/rules/day-one.ts` - Updated equipStartingEquipment (1 call site, plus Vrbansk initial equip)
- `src/rules/actions/dictator-actions.ts` - Updated playTactics dictator equip (1 call site)
- `src/rules/dictator-abilities.ts` - Updated Kim base reveal equip (1 call site)
- `src/rules/tactics-effects.ts` - Updated base reveal equip (1 call site)
- `src/rules/ai-helpers.ts` - Updated AI auto-equip (1 call site)

## Decisions Made
- Two Vrbansk initial equip calls (day-one.ts:141 and helpers.ts:459) left without destructuring because they equip the FIRST item on an empty merc -- no slot replacement or bandolier displacement is possible. The return value is safely discarded.
- Displaced items that fail `sector.addToStash()` (damaged equipment) fall through to the discard pile, matching the existing pattern in `dropEquipment`.
- Every call site that logs "returned X to stash" also logs displaced bandolier items being returned, using a separate message to avoid confusing bandolier contents with the replaced accessory.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None -- no external service configuration required.

## Next Phase Readiness
- Phase 47 (Equipment Slot Cleanup) is complete
- EQUIP-01 satisfied: replacing bandolier drops contents to stash
- EQUIP-02 satisfied: no phantom bandolier slots after replacement
- All equip() callers handle the full EquipResult contract
- Ready for next phase in v1.10 roadmap

---
*Phase: 47-equipment-slot-cleanup*
*Completed: 2026-02-08*
