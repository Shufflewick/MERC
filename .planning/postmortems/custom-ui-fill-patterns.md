# Post-Mortem: Custom UI `fill()` Patterns for chooseElement Actions

**Date:** January 2026
**Game:** MERC
**Components Affected:** CombatPanel.vue, GameBoard.vue, rebel-combat.ts

## Summary

We implemented a custom CombatPanel UI that needed to trigger a `combatRetreat` action with a `chooseElement<Sector>` step. After extensive debugging, we discovered several undocumented patterns for using `actionController.fill()` with custom UI components.

## The Action Definition

```typescript
Action.create('combatRetreat')
  .prompt('Retreat from combat')
  .condition({ /* ... */ })
  .chooseElement<Sector>('retreatSector', {
    prompt: 'Choose sector to retreat to',
    elementClass: Sector,
    filter: (element, ctx) => { /* filter valid sectors */ },
    boardRef: (element) => ({ id: (element as unknown as Sector).id }),
  })
  .execute((args, ctx) => {
    const retreatSector = args.retreatSector as Sector;
    // ... execute retreat
  });
```

## Issues Encountered

### Issue 1: `getChoices()` Returns Different Structure Than `boardRef`

**Symptom:** Sector buttons showed "Unknown" instead of sector names.

**Root Cause:** We assumed `getChoices()` would return the same structure as `boardRef`:

```typescript
// boardRef returns:
{ id: element.id }

// But getChoices() returns:
{ value: element.id, display: "Sector Name" }
```

The `id` property from `boardRef` becomes `value` in `getChoices()`, and BoardSmith adds a `display` property.

**Fix:** Use `choice.value` instead of `choice.id`:

```typescript
// WRONG
const numericId = choice.id;  // undefined!

// CORRECT
const numericId = choice.value;  // the element ID
```

---

### Issue 2: `fill()` Expects Raw Value, Not Choice Object

**Symptom:** `fill()` succeeded on client but action never executed on server.

**Root Cause:** We were passing the entire choice object to `fill()`:

```typescript
// WRONG - passing the choice object
const selectedSector = choices.find(c => c.value === sectorId);
await actionController.fill(selection.name, selectedSector);
// selectedSector = { value: 142, display: "Wilderness" }

// CORRECT - passing just the value
await actionController.fill(selection.name, selectedSector.value);
// passes 142
```

Other working examples in the codebase all pass raw values:
- `fill(selection.name, equipType)` - string
- `fill('recipient', recipientValue)` - string
- `fill(selection.name, matchingElement.id)` - number

---

### Issue 3: `fill()` Returns a Promise That Must Be Awaited

**Symptom:** Action seemed to succeed but nothing happened.

**Root Cause:** The handler wasn't async and didn't await `fill()`:

```typescript
// WRONG - Promise ignored
function handleSelectRetreatSector(sectorId: number) {
  actionController.fill(selection.name, sectorId);  // returns Promise!
}

// CORRECT - await the Promise
async function handleSelectRetreatSector(sectorId: number) {
  await actionController.fill(selection.name, sectorId);
}
```

---

## Key Patterns for Custom UI with `chooseElement`

### Pattern 1: Getting Choices

```typescript
const currentSel = actionController.currentSelection.value;
const choices = actionController.getChoices(currentSel) || [];

// Each choice has: { value: <element_id>, display: <string> }
// NOT the structure from boardRef!
```

### Pattern 2: Filling a Selection

```typescript
// Find the matching choice
const selectedChoice = choices.find(c => c.value === userSelectedId);

// Pass the VALUE, not the object
await actionController.fill(currentSel.name, selectedChoice.value);
```

### Pattern 3: Complete Flow for Multi-Step Action

```typescript
// 1. Start the action in wizard mode
await actionController.start('actionName');

// 2. Get choices for current selection
const choices = actionController.getChoices(currentSel);

// 3. Display choices in custom UI
// ... user clicks one ...

// 4. Fill with the value (async!)
await actionController.fill(currentSel.name, selectedChoice.value);

// 5. Action auto-executes when all selections are filled
```

---

## Suggestions for BoardSmith

### 1. Document `getChoices()` Return Structure

The transformation from `boardRef` output to `getChoices()` output should be clearly documented:

```typescript
// If boardRef returns: { id: element.id, foo: element.foo }
// Then getChoices() returns: { value: element.id, display: "...", ...rest }
// Note: "id" becomes "value"
```

### 2. Consider Accepting Choice Objects in `fill()`

Allow passing either the raw value OR the choice object:

```typescript
// Both should work:
actionController.fill(name, 142);
actionController.fill(name, { value: 142, display: "..." });
```

### 3. Add TypeScript Type Hints

The `getChoices()` return type should clearly indicate `{ value: T, display: string }[]` where T is the element ID type.

### 4. Consider `fill()` Returning Useful Information

Currently `fill()` succeeds silently even if the value doesn't match any element. Consider returning:

```typescript
interface FillResult {
  success: boolean;
  elementFound: boolean;
  error?: string;
}
```

### 5. Add a Debug Mode Warning

When `fill()` is called with an object instead of a raw value, warn:

```
Warning: fill() received an object. Did you mean to pass choice.value instead of the choice object?
```

---

## Files Modified

- `src/ui/components/GameBoard.vue` - Fixed `retreatSectorChoices` and `handleSelectRetreatSector`
- `src/ui/components/CombatPanel.vue` - Retreat sector selection UI
- `src/rules/actions/rebel-combat.ts` - Added safety check for undefined retreatSector

## Time to Resolution

- Initial debugging (wrong property names): ~2 hours
- Discovering `fill()` needs raw value: ~2 hours
- Understanding async requirement: ~1 hour
- Total: ~5 hours

Most time was spent adding debug logging and testing various combinations. Clear documentation of these patterns would have saved significant debugging time.
