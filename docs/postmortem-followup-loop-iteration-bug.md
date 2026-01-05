# Post-Mortem: followUp Actions Counting as Loop Iterations

**Date:** 2026-01-05
**Game:** MERC
**Severity:** Medium (gameplay-breaking in specific scenarios)
**Status:** RESOLVED - Fixed in BoardSmith engine

## Summary

When using recursive `followUp` chains within an action loop, each followUp completion was counting as a loop iteration against `maxIterations`. This caused player turns to end prematurely after ~20-30 equipment selections during the Explore action.

**This issue has been fixed in the BoardSmith engine.** The MERC workaround has been reverted.

## Symptoms

- Player explores a sector, finds equipment in stash
- Player clicks to equip items from stash repeatedly (swapping equipment back and forth)
- After approximately 20-30 clicks, the turn suddenly ends
- Turn ends even though the player still has MERCs with actions remaining

## Root Cause

### The Flow Structure

```typescript
loop({
  name: 'rebel-action-loop',
  while: (ctx) => player.team.some(m => m.actionsRemaining > 0),
  maxIterations: 30, // Safety limit
  do: actionStep({
    actions: ['explore', 'move', 'train', /* ... */],
  }),
})
```

### The Action Chain

1. **explore** action executes, draws equipment to sector stash
2. **explore** returns `followUp: { action: 'collectEquipment', args: {...} }`
3. **collectEquipment** lets player pick one item
4. **collectEquipment** returns `followUp: { action: 'collectEquipment', args: {...} }` if stash still has items
5. Steps 3-4 repeat for each equipment selection

### The Bug

Each `followUp` action that completed was counting as one iteration of the parent flow loop.

## Resolution

### BoardSmith Engine Fix

The BoardSmith team fixed this at the framework level in `packages/engine/src/flow/engine.ts`:

1. **resume() method**: Added early return when `result.followUp` exists - don't complete the actionStep or count the move until the entire followUp chain completes.
2. **resumeAfterExternalAction() method**: Applied the same fix for external action execution.

Now followUp chains correctly count as a single loop iteration regardless of chain length.

### MERC Changes

- Reverted temporary workaround (maxIterations: 500 -> 50)
- Both `rebel-action-loop` and `dictator-merc-actions` now use sensible `maxIterations: 50`

## Files Changed (MERC)

- `src/rules/flow.ts`: Lines 269, 431 - reverted maxIterations to 50

## Lessons Learned

1. Framework-level behaviors around action chaining should be well-documented
2. Recursive `followUp` patterns are valid and useful for "repeat until done" UX
3. Safety limits like `maxIterations` should account for expected usage patterns
