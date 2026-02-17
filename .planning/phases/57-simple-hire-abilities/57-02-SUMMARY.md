---
phase: 57-simple-hire-abilities
plan: 02
subsystem: ui-flow-wiring
tags: [dictator-abilities, hiring, flow, vue, composables]
dependency-graph:
  requires: ["57-01"]
  provides: ["gadafiBonusHire and stalinBonusHire fully wired into flow and UI"]
  affects: ["58+"]
tech-stack:
  added: []
  patterns: ["action-name propagation across flow/UI layers"]
key-files:
  created: []
  modified:
    - src/rules/flow.ts
    - src/ui/components/DictatorPanel.vue
    - src/ui/composables/useActionState.ts
    - src/ui/components/GameTable.vue
decisions: []
metrics:
  duration: "4 minutes"
  completed: "2026-02-17"
---

# Phase 57 Plan 02: Flow and UI Wiring Summary

**One-liner:** Wired gadafiBonusHire and stalinBonusHire into dictator-ability flow step, DictatorPanel routing, useActionState composable, and GameTable auto-start.

## What Was Done

### Task 1: Flow step and UI wiring for both hire actions

Added `gadafiBonusHire` and `stalinBonusHire` to every location that previously only referenced `castroBonusHire`:

1. **flow.ts** -- Added both actions to the `dictator-ability` actionStep's `actions` array (now 4 actions total)
2. **DictatorPanel.vue** -- Added to `dictatorSpecificActions` array, sector selection conditional, and added `isGadafiHiring`/`isStalinHiring` computed properties
3. **useActionState.ts** -- Updated 6 locations:
   - Return type interface (added `isGadafiHiring` and `isStalinHiring`)
   - Metadata check in hiring actions conditional
   - `getCurrentActionName()` function
   - `hiringActions` array in `isHiringMercs` computed
   - New `isGadafiHiring`/`isStalinHiring` computed properties
   - Return object
4. **GameTable.vue** -- Added to `hiringActions` auto-start array, destructured new computeds from `useActionState()`

Did NOT add dead-code props to HiringPhase.vue (the existing `isCastroHiring` prop there is unused).

### Task 2: Verify with type check and test suite

- `npx tsc --noEmit` passed clean
- `npx vitest run` -- 694 tests passed, 7 skipped, 0 failures
- Grep verification confirmed every `castroBonusHire` array/conditional has corresponding gadafi/stalin entries
- `applyDictatorTurnAbilities` switch handles `'gadafi'` and `'stalin'` cases (from Plan 01)
- Both actions registered in `registerAllActions` (from Plan 01)

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | Pass |
| `npx vitest run` | 694 passed, 7 skipped |
| castroBonusHire parity | All arrays/conditionals have gadafi+stalin |
| No dead-code props | HiringPhase.vue unchanged |
| Flow step actions | 4 actions listed |
| Return type interface | isGadafiHiring + isStalinHiring added |

## Commits

| Hash | Message |
|------|---------|
| 601bc41 | feat(57-02): wire gadafiBonusHire and stalinBonusHire into flow and UI |
