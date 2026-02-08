# Phase 42: Remove Dead APIs - Research

**Researched:** 2026-02-07
**Domain:** Dead code removal (BoardSmith v2 theatre view APIs)
**Confidence:** HIGH

## Summary

Phase 42 requires deleting references to three BoardSmith v2 APIs that no longer exist in BoardSmith v3.0: `useCurrentView`, `acknowledgeAnimationEvents`, and the `acknowledge` callback option in `createAnimationEvents`. All three APIs have been confirmed removed from the installed `boardsmith@0.0.1-20260208040014` package. The codebase currently produces TypeScript compilation errors for every reference to these APIs.

The removal is straightforward dead code deletion. No replacement logic is needed for this phase -- the code being removed is either already bypassed (acknowledge callback silently ignored by framework) or provides fallback data that will be properly replaced in later phases (43-45). The key risk is that `truthCombatComplete` and `truthActiveCombat` provide fallback combat state that the UI currently relies on. Removing them will degrade the fallback chain, but this is intentional -- later phases rebuild this logic properly.

**Primary recommendation:** Delete all dead API references in a single plan. The changes are mechanical, isolated to 4 files, and all tests already pass.

## Inventory of Dead Code

### File 1: `src/ui/components/CombatPanel.vue`

| Line(s) | Code | Type | Can Delete? |
|---------|------|------|-------------|
| 4 | `useCurrentView` in import from `boardsmith/ui` | Import | YES -- remove from import, keep `useAnimationEvents` |
| 161 | `const currentView = useCurrentView();` | Variable | YES -- only used by `truthCombatComplete` |
| 162-167 | `const truthCombatComplete = computed(...)` | Computed | YES -- used in 3 places (see below) |
| 756 | `|| truthCombatComplete.value` in `computeNextState()` | Usage | YES -- remove the `|| truthCombatComplete.value` clause; `props.activeCombat?.combatComplete` remains |
| 803-805 | `watch(truthCombatComplete, ...)` | Watcher | YES -- delete entire watcher |
| 1122 | `&& !truthCombatComplete` in template v-if | Usage | YES -- remove `&& !truthCombatComplete` clause |

**Impact analysis for `truthCombatComplete` removal:**
- Line 756: `computeNextState()` also checks `props.activeCombat?.combatComplete === true` and `sawCombatEndEvent.value` -- the truth view was a redundant fallback. With it gone, combat completion still detected via the prop and event flag.
- Line 803-805: The watcher just calls `transitionState()` -- other watchers on `props.activeCombat?.combatComplete` (line 798) and `isAnimating`/`pendingCount` (line 785) still trigger state transitions.
- Line 1122: The `!truthCombatComplete` condition hides combat action buttons. The condition already has `!isAnimating` which prevents actions during animation. The `combatComplete` flag from props handles the rest. Removing `!truthCombatComplete` is safe -- if combat is complete, the panel transitions to COMPLETE state and the entire actions div becomes irrelevant.

### File 2: `src/ui/components/GameTable.vue`

| Line(s) | Code | Type | Can Delete? |
|---------|------|------|-------------|
| 6 | `useCurrentView` in import from `boardsmith/ui` | Import | YES -- remove from import, keep other imports |
| 492 | `const currentView = useCurrentView();` | Variable | YES -- only used by `truthActiveCombat` |
| 529-533 | `const truthActiveCombat = computed(...)` | Computed | YES -- used only in line 536 |
| 536 | `?? truthActiveCombat.value` in `activeCombat` computed | Usage | YES -- remove the `?? truthActiveCombat.value` fallback |

**Impact analysis for `truthActiveCombat` removal:**
- Line 536: The `activeCombat` computed becomes `theatreActiveCombat.value ?? null`. This means the combat panel only gets combat data from the theatre view (props), not from a truth view fallback. This is the intended direction -- later phases (43-45) will replace this with event-driven data entirely.

### File 3: `src/ui/App.vue`

| Line(s) | Code | Type | Can Delete? |
|---------|------|------|-------------|
| 28-35 | `acknowledge: (upToId) => { ... }` callback in `createAnimationEvents()` options | Option | YES -- framework ignores it (not in `UseAnimationEventsOptions` type) |
| 29 | Comment about acknowledgeAnimations | Comment | YES |
| 32 | `controller.execute('acknowledgeAnimations', { upToId })` | Call | YES -- contained inside the dead callback |

**Impact analysis:**
- The `acknowledge` callback is already a TypeScript error -- `UseAnimationEventsOptions` does not accept it. The framework silently ignores unknown properties at runtime (JS object spread), but it is never called. Deleting it has zero behavioral impact.

### File 4: `src/rules/actions/rebel-combat.ts`

| Line(s) | Code | Type | Can Delete? |
|---------|------|------|-------------|
| 1600-1635 | `createAcknowledgeAnimationsAction()` function | Function | YES -- entire function |

**Impact analysis:**
- The function calls `game.acknowledgeAnimationEvents(upToId)` which no longer exists on `MERCGame` (inherited from BoardSmith's `Game` class). This is a compilation error.
- The function's condition checks `game.pendingAnimationEvents` which still exists but is irrelevant since the execute body fails.

### File 5: `src/rules/actions/index.ts`

| Line(s) | Code | Type | Can Delete? |
|---------|------|------|-------------|
| 65 | `createAcknowledgeAnimationsAction,` in import | Import | YES |
| 175-176 | `game.registerAction(createAcknowledgeAnimationsAction(game));` | Registration | YES |
| 175 | Comment above it ("Acknowledge animation events...") | Comment | YES |

## Compilation Error Proof

The following TypeScript errors exist today and are fixed by this phase:

```
src/rules/actions/rebel-combat.ts(1629,12): error TS2339: Property 'acknowledgeAnimationEvents' does not exist on type 'MERCGame'.
src/ui/App.vue(28,3): error TS2353: Object literal may only specify known properties, and 'acknowledge' does not exist in type 'UseAnimationEventsOptions'.
src/ui/components/CombatPanel.vue(4,30): error TS2305: Module '"boardsmith/ui"' has no exported member 'useCurrentView'.
src/ui/components/GameTable.vue(6,83): error TS2305: Module '"boardsmith/ui"' has no exported member 'useCurrentView'.
```

## Scope Boundaries

### What IS in scope (Phase 42)
- DELETE-01: Remove `useCurrentView` and all code depending on it
- DELETE-02: Remove `acknowledgeAnimations` action and acknowledge callback

### What is NOT in scope (later phases)
- DELETE-03 (Phase 44): State machine removal (`panelState`, `computeNextState`, etc.)
- DELETE-04 (Phase 45): GameTable fallback chain removal (`cachedCombat`, `combatEventSeen`, etc.)
- DELETE-05 (Phase 44): `displayHealth` removal
- `clearCombatAnimations` action -- this is NOT dead code, it is actively used by 4 flow.ts locations and GameTable

### Important: `clearCombatAnimations` stays
The `clearCombatAnimations` action (lines 1585-1598 of rebel-combat.ts) is NOT being removed. It is actively used:
- `flow.ts` lines 424, 646, 805, 977 (4 action steps)
- `GameTable.vue` line 630 (UI handler)
- It calls `clearActiveCombat(game)` which is a valid function
- Only `createAcknowledgeAnimationsAction` (lines 1600-1635) is being deleted

## Common Pitfalls

### Pitfall 1: Leaving stale imports
**What goes wrong:** Removing a function but leaving its import in `index.ts`
**How to avoid:** Delete both the import line (65) and the registration line (176) in `index.ts`

### Pitfall 2: Partial import cleanup
**What goes wrong:** Removing `useCurrentView` from the import but leaving it as a named import (syntax error)
**How to avoid:** In CombatPanel.vue, the import is `import { useAnimationEvents, useCurrentView } from 'boardsmith/ui'` -- change to `import { useAnimationEvents } from 'boardsmith/ui'`. In GameTable.vue, the import is `import { useBoardInteraction, type UseActionControllerReturn, useAnimationEvents, useCurrentView, GameOverlay } from 'boardsmith/ui'` -- just remove `, useCurrentView` from the list.

### Pitfall 3: Removing too much from CombatPanel template
**What goes wrong:** Removing the entire `v-if` condition on line 1122 instead of just the `!truthCombatComplete` clause
**How to avoid:** Only remove `&& !truthCombatComplete` from the condition. The rest of the v-if stays intact.

### Pitfall 4: Confusing clearCombatAnimations with acknowledgeAnimations
**What goes wrong:** Accidentally deleting the `createClearCombatAnimationsAction` function (which is still actively used)
**How to avoid:** Only delete `createAcknowledgeAnimationsAction` (lines 1600-1635). The `createClearCombatAnimationsAction` (lines 1585-1598) immediately above it must remain.

### Pitfall 5: Breaking the acknowledge callback block in App.vue
**What goes wrong:** Removing only part of the acknowledge callback, leaving a syntax error
**How to avoid:** Remove the entire `acknowledge: (upToId) => { ... },` property from the `createAnimationEvents({...})` options object. The result should be just `createAnimationEvents({ events: () => animationEventsFromState.value })`.

## Verification Strategy

After all deletions:

1. **Grep verification** (zero results expected):
   ```
   grep -r "useCurrentView" src/
   grep -r "CURRENT_VIEW_KEY" src/
   grep -r "acknowledgeAnimations" src/
   grep -r "acknowledgeAnimationEvents" src/
   grep -r "createAcknowledgeAnimationsAction" src/
   grep -r "truthCombatComplete" src/
   grep -r "truthActiveCombat" src/
   ```

2. **TypeScript compilation** -- the 4 errors listed above should be resolved. Other pre-existing errors in the codebase are unrelated.

3. **Test suite** -- all 602 tests should continue to pass (none reference the dead APIs).

## Open Questions

None. This phase is fully scoped -- all code locations are identified, all dependencies analyzed, and all removal actions are pure deletion with no replacement logic needed.

## Sources

### Primary (HIGH confidence)
- Direct codebase grep of all src/ files for each dead API symbol
- BoardSmith v3.0 source at `node_modules/boardsmith/src/ui/index.ts` -- confirmed `useCurrentView` not exported
- BoardSmith v3.0 source at `node_modules/boardsmith/src/ui/composables/useAnimationEvents.ts` -- confirmed `UseAnimationEventsOptions` has no `acknowledge` property
- BoardSmith v3.0 source at `node_modules/boardsmith/src/engine/` -- confirmed `acknowledgeAnimationEvents` method removed from Game class
- TypeScript compilation output (`npx vue-tsc --noEmit`) confirming 4 dead-API errors
- Test suite output (`npx vitest --run`) confirming all 602 tests pass

## Metadata

**Confidence breakdown:**
- Dead API locations: HIGH -- exhaustive grep of entire src/ tree
- Impact analysis: HIGH -- read every usage site and its surrounding context
- Scope boundaries: HIGH -- verified against v1.9 REQUIREMENTS.md and ROADMAP.md
- Pitfalls: HIGH -- derived from actual code structure, not hypothetical

**Research date:** 2026-02-07
**Valid until:** Until Phase 42 is complete (findings are codebase-snapshot-specific)
