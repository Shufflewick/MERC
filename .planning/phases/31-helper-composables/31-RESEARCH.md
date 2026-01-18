# Phase 31 Research: Helper Composables

**Researched:** 2026-01-18
**Goal:** Extract pure utility functions that have no dependencies on Vue reactivity or game state.

## Function Inventory for Extraction

### HELP-01: useGameViewHelpers (6 pure functions)

| Function | Lines | Signature | Purpose |
|----------|-------|-----------|---------|
| `normalizeClassName` | 58-60 | `(string) → string` | Strips underscore prefix from BoardSmith class names |
| `findByClassName` | 63-80 | `(string, any?) → any \| null` | Recursive traversal of gameView tree by className |
| `findAllByClassName` | 83-102 | `(string, any?) → any[]` | Finds all elements matching className |
| `findByRef` | 147-160 | `(string, any?) → any \| null` | Searches for element by ref attribute |
| `findElementById` | 163-182 | `(number \| string, any?) → any \| null` | Searches by numeric or string ID |
| `getAttr` | 185-189 | `<T>(any, string, T) → T` | Gets property from node attributes or root |

**All are pure functions with no Vue reactivity dependencies.**

### HELP-02: useVictoryCalculations (4 functions/computeds)

| Function | Lines | Signature | Dependencies |
|----------|-------|-----------|--------------|
| `calculateRebelVictoryPoints` | 1194-1214 | `() → number` | findAllByClassName, getAttr |
| `calculateDictatorVictoryPoints` | 1217-1246 | `() → number` | findAllByClassName, findByClassName, getAttr |
| `isGameOver` | 1249-1280 | `computed → boolean` | findDictatorCombatant, getAttr, findByClassName, countTacticsCards |
| `gameWinner` | 1283-1318 | `computed → 'rebels' \| 'dictator' \| null` | isGameOver, victory point functions |

**Helper also needed:**
- `countTacticsCards` (1186-1191): `(containerNode) → number` — counts TacticsCard children

## Key Dependencies & Design Decisions

### gameView Access Pattern

**Problem:** Functions default root to `props.gameView`, but composables can't access component props.

**Solution:** Pass gameView as parameter to composable:
```typescript
export function useGameViewHelpers(gameView: Ref<any> | (() => any))
```

### Reactive Computed Properties

**isGameOver** and **gameWinner** are Vue computed properties that must remain reactive for template binding.

**Solution:** Return computed refs from the composable:
```typescript
return {
  isGameOver: computed(() => ...),
  gameWinner: computed(() => ...),
}
```

### Dependency Chain

Victory calculations depend on HELP-01 functions:
- `calculateRebelVictoryPoints` → `findAllByClassName`, `getAttr`
- `calculateDictatorVictoryPoints` → `findAllByClassName`, `findByClassName`, `getAttr`
- `isGameOver` → `findDictatorCombatant`, `getAttr`, `findByClassName`, `countTacticsCards`
- `gameWinner` → `isGameOver`, both victory point functions

**Solution:** HELP-02 composable takes gameView and internally uses HELP-01 functions.

## Directory Structure

**Current state:** No `src/ui/composables/` directory exists — must be created.

**Existing patterns:**
- `drag-drop-state.ts`: exported reactive ref
- `colors.ts`: exported pure utility functions

## Edge Cases

1. **Empty tree:** `findByClassName('Nonexistent')` returns `null`
2. **Null root:** handled with early return
3. **Mixed attributes:** `getAttr` checks both `.attributes[key]` and direct `.key`
4. **Tie-breaking:** dictator wins ties in victory point comparison

## Usage Patterns

- HELP-01 functions: 200+ occurrences across GameBoard.vue
- Victory functions: called in template for game over display
- `isGameOver`/`gameWinner`: used in template lines 2362, 2365, 2388

## Implementation Approach

1. Create `src/ui/composables/` directory
2. Create `useGameViewHelpers.ts` with pure functions
3. Create `useVictoryCalculations.ts` importing from helpers
4. Both take gameView getter as parameter for reactivity
5. Update GameBoard.vue to import and use composables
6. Remove extracted functions from GameBoard.vue

## Ready for Planning

All information gathered. Functions are:
- Clearly isolated with minimal coupling
- Well-defined signatures
- Consistently used throughout GameBoard.vue
- Edge cases identified
- Support reactive computed properties

---
*Research complete: 2026-01-18*
