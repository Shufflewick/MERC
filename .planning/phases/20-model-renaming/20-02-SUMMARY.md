---
phase: 20-model-renaming
plan: 02
subsystem: rules
tags: [typescript, exports, imports, backward-compat, type-guards]

# Dependency graph
requires:
  - phase: 20-model-renaming (20-01)
    provides: CombatantBase and CombatantModel classes in elements.ts
provides:
  - CombatantBase and CombatantModel exports from rules/index.ts
  - Backward-compat re-exports (CombatUnit, CombatUnitCard) from rules/index.ts
  - isCombatantModel type guard function with isCombatUnitCard alias
  - CombatantModel type export with CombatUnitCard alias from helpers.ts
affects: [UI components importing from rules, future phases updating remaining CombatUnitCard references]

# Tech tracking
tech-stack:
  added: []
  patterns: [backward-compat re-exports, type guard aliases]

key-files:
  created: []
  modified:
    - src/rules/index.ts
    - src/rules/ai-helpers.ts
    - src/rules/actions/helpers.ts

key-decisions:
  - "Added isCombatantModel as canonical function name, kept isCombatUnitCard as alias for backward compat"
  - "Re-exported CombatantModel as CombatUnitCard from both index.ts and helpers.ts"
  - "Most action files needed no changes - they import isCombatUnitCard from helpers.ts which now provides the alias"

patterns-established:
  - "Backward-compat re-exports: New name exported, old name as alias (CombatantModel as CombatUnitCard)"
  - "Type guard pattern: Canonical function (isCombatantModel) with alias (isCombatUnitCard)"

issues-created: []

# Metrics
duration: 12min
completed: 2026-01-14
---

# Phase 20-02: Model Renaming Summary

**Updated exports and imports across rules layer to use CombatantBase/CombatantModel with backward-compat aliases**

## Performance

- **Duration:** 12 min
- **Started:** 2026-01-14T18:00:00Z
- **Completed:** 2026-01-14T18:12:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added CombatantBase and CombatantModel exports to rules/index.ts
- Added backward-compat re-exports (CombatUnit, CombatUnitCard) from rules/index.ts
- Updated ai-helpers.ts to use CombatantModel instead of CombatUnitCard
- Renamed isCombatUnitCard to isCombatantModel in helpers.ts with backward-compat alias
- Updated type re-exports from helpers.ts with CombatantModel and CombatUnitCard alias

## Task Commits

Each task was committed atomically:

1. **Task 1: Update exports in index.ts** - `b4e5c4c` (feat)
2. **Task 2: Update ai-helpers.ts imports** - `9196661` (feat)
3. **Task 3: Update helpers.ts with new type guard and exports** - `56916a9` (feat)

## Files Created/Modified

- `src/rules/index.ts` - Added CombatantBase, CombatantModel exports and CombatUnit, CombatUnitCard backward-compat re-exports
- `src/rules/ai-helpers.ts` - Updated import and type annotation from CombatUnitCard to CombatantModel
- `src/rules/actions/helpers.ts` - Renamed isCombatUnitCard to isCombatantModel with alias, updated type re-exports

## Decisions Made

1. **Type guard alias pattern**: Created isCombatantModel as the canonical name with isCombatUnitCard kept as a constant alias (`export const isCombatUnitCard = isCombatantModel`). This allows existing code to keep working while encouraging use of the new name.

2. **Minimal changes to consuming files**: Since helpers.ts provides the backward-compat alias, files like rebel-economy.ts and rebel-equipment.ts that import isCombatUnitCard needed no changes - they get the alias automatically.

3. **Type re-export with alias**: Used `export type { CombatantModel, CombatantModel as CombatUnitCard }` to provide both the canonical type and backward-compat alias.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript errors found are pre-existing (48 test failures, same as before plan 20-01).

## Next Phase Readiness

- All exports and imports in rules layer updated
- Backward-compat aliases in place for gradual migration
- Ready for any UI layer updates if needed
- Existing code using CombatUnitCard/isCombatUnitCard will continue to work

---
*Phase: 20-model-renaming*
*Completed: 2026-01-14*
