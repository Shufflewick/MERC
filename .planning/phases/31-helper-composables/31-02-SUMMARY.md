# Plan 31-02 Summary: useVictoryCalculations Composable

## Status: Complete

## What Was Built

Created `src/ui/composables/useVictoryCalculations.ts` - a composable that extracts victory calculation logic from GameBoard.vue.

### Functions Implemented

1. **`countTacticsCards(containerNode)`** - Counts TacticsCard children in a container node
2. **`calculateRebelVictoryPoints()`** - Sums sectors where rebels have more militia than dictator
3. **`calculateDictatorVictoryPoints()`** - Sums dictator-controlled sectors plus base sector bonus
4. **`isGameOver`** (computed) - Returns true when any end condition is met:
   - Dictator dead (inPlay=true AND damage >= maxHealth)
   - TacticsDeck AND TacticsHand both empty
   - explosivesVictory flag true
5. **`gameWinner`** (computed) - Determines winner ('rebels' | 'dictator' | null):
   - Dictator dead -> rebels win
   - Explosives victory -> rebels win
   - Tactics exhausted -> compare points (dictator wins ties)

### Key Implementation Details

- Uses `getGameView()` getter pattern for reactive tree access
- Imports pure functions from `useGameViewHelpers` with `*InTree` suffix
- Explicit generic type parameters on `getAttr<T>()` calls per Phase 31 decision
- Checks both `gameView.explosivesVictory` and `gameView.attributes.explosivesVictory`
- Dictator wins ties in point comparison (per game rules)

## Commits

1. `85091ff` - feat(ui): create useVictoryCalculations composable

## Verification

- [x] File exists at src/ui/composables/useVictoryCalculations.ts
- [x] TypeScript compiles without errors
- [x] Imports from useGameViewHelpers work correctly
- [x] isGameOver and gameWinner are Vue computed refs
- [x] No direct props access (uses getGameView getter)

## Lines Extracted from GameBoard.vue

Lines 1186-1318 (133 lines) can be removed when this composable is integrated.
