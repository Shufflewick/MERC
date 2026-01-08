---
phase: 02-type-safety-assertions
plan: 06
subsystem: actions
tags: [typescript, type-assertions, equipment-actions, type-guards]

# Dependency graph
requires:
  - phase: 02-01
    provides: type guard helpers (isRebelPlayer, asRebelPlayer, asMercCard, etc.)
provides:
  - rebel-equipment.ts with zero unsafe type assertions
  - instanceof-based element validation pattern
affects: [03-combat-types, 03-action-flow]

# Tech tracking
tech-stack:
  added: []
  patterns: [instanceof-filter-pattern, unknown-with-type-guard-pattern]

key-files:
  modified: [src/rules/actions/rebel-equipment.ts]

key-decisions:
  - "Used instanceof checks in filter callbacks instead of as unknown as casts"
  - "Used direct ctx.player with type guards that accept unknown"
  - "Changed helper function params from any to unknown with type guard narrowing"
  - "Fixed import typo: getRangedAttackRange to getRangedRange"

patterns-established:
  - "instanceof check before narrowing in filter callbacks: if (!(element instanceof MercCard)) return false"
  - "Type guards accepting unknown enable direct ctx.player usage without casts"

issues-created: []

# Metrics
duration: 14min
completed: 2026-01-08
---

# Phase 2 Plan 6: rebel-equipment.ts Type Assertions Summary

**Eliminated all 28 unsafe type assertions (23 `as any`, 5 `as unknown as`) from rebel-equipment.ts using instanceof checks and type guard narrowing**

## Performance

- **Duration:** 14 min
- **Started:** 2026-01-08T20:28:26Z
- **Completed:** 2026-01-08T20:42:42Z
- **Tasks:** 3 (completed in single commit - all interconnected)
- **Files modified:** 1

## Accomplishments
- Replaced 23 `as any` patterns with proper type handling
- Replaced 5 `as unknown as` patterns with instanceof checks
- Changed all helper function parameters from `any` to `unknown` with type guard narrowing
- Fixed import typo: `getRangedAttackRange` → `getRangedRange`
- All equipment-related tests continue to pass

## Task Commits

All three tasks were interconnected and completed in a single commit:

1. **Tasks 1-3: Fix all type assertions** - `3c52306` (feat)
   - Task 1: Fix player assertions (ctx.player as any → ctx.player)
   - Task 2: Fix element assertions (as unknown as → instanceof)
   - Task 3: Fix args assertions (typed narrowing)

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `src/rules/actions/rebel-equipment.ts` - Equipment management actions (re-equip, drop, repair kit, mortar, explosives)

## Decisions Made
- Used `instanceof MercCard` check pattern in filter callbacks rather than `as unknown as MercCard`
- Changed helper function params from `any` to `unknown` to enable type guards to narrow properly
- Type guards like `game.isRebelPlayer(ctx.player)` now accept `unknown` directly without casts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed import typo**
- **Found during:** TypeScript compilation check
- **Issue:** Import referenced `getRangedAttackRange` but export is `getRangedRange`
- **Fix:** Changed import to correct function name
- **Files modified:** src/rules/actions/rebel-equipment.ts (line 17)
- **Verification:** TypeScript compiles without import error
- **Committed in:** 3c52306

---

**Total deviations:** 1 auto-fixed (blocking import error)
**Impact on plan:** Minor fix required for correct function name. No scope creep.

## Issues Encountered
None - plan executed as expected.

## Next Phase Readiness
- rebel-equipment.ts is now type-safe with zero `as any` or `as unknown as` patterns
- Ready for 02-07-PLAN.md (rebel-hiring.ts type assertions)

---
*Phase: 02-type-safety-assertions*
*Completed: 2026-01-08*
