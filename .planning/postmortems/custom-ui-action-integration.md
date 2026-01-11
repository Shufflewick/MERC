# Post-Mortem: Custom UI Action Integration Issues

**Date:** January 2026
**Game:** MERC
**Components Affected:** CombatPanel.vue, GameBoard.vue, flow.ts

## Summary

We encountered multiple issues when building a custom CombatPanel UI component that needed to trigger BoardSmith actions outside the standard ActionPanel flow. After several debugging iterations, we reached out to the BoardSmith team for guidance on proper patterns for custom UI integration.

## Issues Encountered

### Issue 1: Combat Target Selection Not Working

**Symptom:** The CombatPanel displayed target selection UI with a "Confirm Target" button, but clicking it did nothing. The action conditions were passing (verified via console logs), but the action never executed.

**Initial Approach (Wrong):**
```typescript
// We were checking if action was available, then executing
async function handleConfirmTargets(targetIds: string[]) {
  if (!props.availableActions.includes('combatSelectTarget')) return;
  await props.actionController.execute('combatSelectTarget', { targets: targetIds });
}
```

**Root Cause:** The code was correct, but the combat flow was exiting before we could click the button (see Issue 3). We initially thought this was an action triggering issue.

**Resolution:** The `execute()` pattern was actually correct for `combatSelectTarget` since we had all required parameters. The real fix was in the flow control (Issue 3).

---

### Issue 2: Combat Retreat Button Not Working

**Symptom:** Clicking the "Retreat" button in CombatPanel did nothing. The `combatRetreat` action has a `chooseElement<Sector>` step that requires selecting a destination sector.

**Initial Approach (Wrong):**
```typescript
async function handleRetreatCombat() {
  if (!props.availableActions.includes('combatRetreat')) return;
  // WRONG: Trying to execute without the required retreatSector parameter
  await props.actionController.execute('combatRetreat', {});
}
```

**Root Cause:** We were calling `execute()` with empty params, but `combatRetreat` requires a `retreatSector` parameter that comes from user selection. The action definition uses `chooseElement<Sector>('retreatSector', {...})` which needs wizard mode to gather the selection.

**BoardSmith Team Guidance:**
> For multi-step actions where button click is step 1 and board/element selection is step 2, use `actionController.start()` to enter wizard mode. This activates the element filters and waits for selection.

**Resolution:**
```typescript
async function handleRetreatCombat() {
  if (!props.availableActions.includes('combatRetreat')) return;
  // CORRECT: Start wizard mode, let BoardSmith handle sector selection
  await props.actionController.start('combatRetreat');
}
```

We then added UI in CombatPanel to show sector buttons when `isSelectingRetreatSector` is true, using `actionController.getChoices()` to get valid sectors and `actionController.fill()` to complete the selection.

---

### Issue 3: Combat Flow Exiting Prematurely (Critical)

**Symptom:** After combat started and a MERC needed to select targets, the game would immediately log "Dictator MERC actions complete" and advance to the next day. The next day's initialization would clear the "stale" combat state, losing the combat entirely.

**Debug Output:**
```
Doc is ready to attack. Select targets.
Dictator MERC actions complete
...
Day 3 begins
Warning: Clearing stale combat state
```

**Root Cause:** The `dictator-merc-actions` loop in `flow.ts` only checked if MERCs had actions remaining:

```typescript
// BEFORE (Bug)
loop({
  name: 'dictator-merc-actions',
  while: () => {
    const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
    const hasActionsLeft = dictatorMercs.some(m => m.actionsRemaining > 0);
    return hasActionsLeft && !game.isFinished();
  },
  // ...
})
```

Once all MERC actions were used (by the move that triggered combat), the loop exited even though `activeCombat.pendingTargetSelection` was waiting for player input.

Compare to the `rebel-action-loop` which correctly had:
```typescript
while: (ctx) => {
  if (game.isFinished()) return false;
  if (game.activeCombat !== null) return true;  // Keep looping for combat!
  if (game.pendingCombat !== null) return true;
  // Then check actions...
}
```

**Resolution:**
```typescript
// AFTER (Fixed)
loop({
  name: 'dictator-merc-actions',
  while: () => {
    if (game.isFinished()) return false;
    // Keep loop active while combat needs resolution
    if (game.activeCombat !== null) return true;
    if (game.pendingCombat !== null) return true;
    // Then check for MERC actions
    const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
    const hasActionsLeft = dictatorMercs.some(m => m.actionsRemaining > 0);
    return hasActionsLeft;
  },
  // ...
})
```

---

## Key Learnings for BoardSmith Integration

### Pattern 1: Direct Execute (All Params Known)
Use when custom UI has gathered all required parameters:
```typescript
await actionController.execute('actionName', { param1: value1, param2: value2 });
```
Example: `combatSelectTarget` where UI has collected target IDs.

### Pattern 2: Start Wizard Mode (Multi-Step Selection)
Use when action needs board/element selection after button click:
```typescript
await actionController.start('actionName');
// BoardSmith enters wizard mode, applies filters to board
// User clicks element on board
// Action auto-completes when all params filled
```
Example: `combatRetreat` where user clicks Retreat button, then clicks destination sector.

### Pattern 3: Fill Params Incrementally
Use when custom UI provides selections one at a time:
```typescript
const choices = actionController.getChoices(currentSelection);
// Display choices in custom UI
// On user selection:
actionController.fill(currentSelection.name, selectedValue);
```
Example: Retreat sector buttons in CombatPanel.

### Pattern 4: Flow Loop Guards
**Critical:** Any game flow loop that can trigger combat must check `activeCombat` and `pendingCombat` in its `while` condition, not just action availability. Combat resolution is asynchronous and requires player input.

---

## Suggestions for BoardSmith

1. **Documentation:** Consider adding a "Custom UI Integration" guide showing these patterns with examples. The distinction between `execute()` vs `start()` vs `fill()` wasn't immediately clear.

2. **TypeScript Hints:** The action definition could potentially expose metadata about whether it requires wizard mode (has `chooseElement`/`chooseFrom` steps) to help developers choose the right pattern.

3. **Flow Template:** Consider providing a "combat-aware loop" template or helper that automatically includes the `activeCombat`/`pendingCombat` guards, since this is a common pattern that's easy to forget.

4. **Debug Mode:** A debug mode that warns "Action X requires parameter Y but execute() was called without it" would have caught the retreat issue immediately.

---

## Files Modified

- `src/ui/components/GameBoard.vue` - Added retreat sector handling, debug logging
- `src/ui/components/CombatPanel.vue` - Added retreat sector selection UI
- `src/rules/flow.ts` - Added combat state guards to dictator-merc-actions loop

## Time to Resolution

- Initial debugging attempts: ~3 hours
- Questions sent to BoardSmith team: 1 day wait
- Implementation after receiving guidance: ~1 hour

The BoardSmith team's response with clear patterns dramatically accelerated the fix.
