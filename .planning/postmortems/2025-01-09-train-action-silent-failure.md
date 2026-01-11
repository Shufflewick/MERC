# Post-Mortem: Train Action Silent Failure

**Date:** 2025-01-09
**Severity:** High (action completely non-functional)
**Time to Resolution:** ~2 hours of debugging

## Summary

The train action in MERC was completely non-functional. Clicking the train button appeared to do nothing - no selection UI, no game history, no server logs, no action spent.

## Root Cause

**Variable shadowing bug** in the action's execute function.

```typescript
// Line 912-916 of rebel-economy.ts
const [idStr, , isDictatorStr] = unitChoiceStr.split(':');
const unitId = parseInt(idStr, 10);
const isDictatorCard = isDictatorStr === 'true';  // <-- LOCAL VARIABLE

// Later in the same function (line ~936)
if (isDictatorCard(actingUnit)) {  // <-- TRIES TO CALL THE BOOLEAN AS A FUNCTION!
```

The local variable `isDictatorCard` (a boolean) shadowed the imported function `isDictatorCard` from `helpers.ts`. When the code later tried to call `isDictatorCard(actingUnit)`, JavaScript attempted to invoke a boolean as a function, throwing `TypeError: isDictatorCard is not a function`.

## Why It Was Hard to Debug

1. **Silent failure**: The exception was caught somewhere in BoardSmith's action execution pipeline and the action was silently abandoned, with no error propagated to logs or UI.

2. **Build caching**: The dev server runs from pre-built `dist/rules/rules.js`, not from source. Changes to source files required an explicit `npm run build` to take effect - this wasn't obvious initially.

3. **Multiple UI layers**: The action was started from BoardSmith's GameShell action panel, while we were initially looking at the SectorPanel UI. The SectorPanel was correctly detecting and preparing to show the selection UI, but the action was completing (and failing) through a different code path.

4. **No execution boundary logging**: There was no indication that the execute function was even being called, or where it was failing.

## The Fix

Renamed the local variable to avoid shadowing:

```typescript
// Before (buggy)
const isDictatorCard = isDictatorStr === 'true';

// After (fixed)
const isUnitDictatorCard = isDictatorStr === 'true';
```

## Recommendations for BoardSmith

### 1. Add ESLint Rule for Variable Shadowing
Configure ESLint with `no-shadow` rule to catch these issues at build time:

```json
{
  "rules": {
    "no-shadow": ["error", { "builtinGlobals": true }]
  }
}
```

Or for TypeScript: `@typescript-eslint/no-shadow`

### 2. Improve Action Execution Error Visibility
When an action's execute function throws an exception:
- Log the full error with stack trace to server console
- Show an error message in the game UI (e.g., "Action failed: [error message]")
- Don't silently abandon the action

### 3. Consider Hot Reloading for Rules
Currently, changes to `src/rules/` require a manual `npm run build`. Consider:
- Adding a watch mode that rebuilds rules on change
- Or having the dev server compile rules on-the-fly like it does for UI

### 4. Document the Build Requirement
Make it clearer in the dev workflow that server-side rules require rebuilding. Perhaps add a warning when `npm run dev` starts if rules are out of date.

## Files Changed

- `src/rules/actions/rebel-economy.ts` - Fixed variable name from `isDictatorCard` to `isUnitDictatorCard`

## Lessons Learned

1. When debugging silent failures, add logging at execution boundaries first
2. Variable shadowing in TypeScript/JavaScript can cause subtle, hard-to-debug issues
3. Understanding the build pipeline is critical for effective debugging
4. Actions that "do nothing" might actually be throwing unlogged exceptions
