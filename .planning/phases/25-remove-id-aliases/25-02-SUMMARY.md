---
phase: 25-remove-id-aliases
plan: 02
status: complete
started: 2026-01-15
completed: 2026-01-15
duration: 45 min
---

# Summary: Replace alias properties in rules layer

## What Changed

Replaced all `.mercId/.mercName/.dictatorId/.dictatorName/.unitId/.unitName` property accesses with `.combatantId/.combatantName` across 21 files in the rules layer (~324 occurrences).

## Commits

- `4423521` - refactor(25-02): update combat types and core combat code
- `0f5fcaa` - refactor(25-02): replace remaining alias properties

## Key Files Modified

**Combat system:**
- combat-types.ts: `mercId` → `combatantId` in Combatant interface
- combat.ts: 50+ property access replacements
- combat-retreat.ts: `dictatorName` → `combatantName`

**Rebel actions:**
- rebel-combat.ts, rebel-economy.ts, rebel-equipment.ts, rebel-movement.ts: All alias usages replaced

**Other rule files:**
- day-one-actions.ts, dictator-actions.ts, helpers.ts, actions/index.ts
- day-one.ts, dictator-abilities.ts, tactics-effects.ts, flow.ts
- game.ts, setup.ts, ai-executor.ts
- ai-helpers.ts, ai-action-helpers.ts, ai-combat-helpers.ts
- elements.ts (internal method calls updated)

## Verification

- Build: ✅ Passes
- Tests: ✅ 387 passed, 1 skipped
- Grep check: Only interface properties and function parameters remain (not class property accesses)

## Notes

Some remaining usages are intentional - they're interface property names and function parameters, not class property accesses:
- `options.dictatorId` - function option parameter
- `ctx.args?.mercId` - action context args
- `game.lastExplorer.mercId` - stored state object interface

These will be addressed in Plan 25-03 (UI/Tests) when updating the interfaces.
