# Phase 51: Extract Combat Sub-Flow - Research

**Researched:** 2026-02-16
**Domain:** BoardSmith flow composition, combat flow deduplication
**Confidence:** HIGH

## Summary

The combat resolution flow in `flow.ts` is duplicated **4 times** across different phases: rebel action loop, tactics card combat, dictator MERC actions, and Kim militia combat. Each copy consists of the same ~10 loop/actionStep blocks handling the same combat decision pipeline (before-attack healing, attack dog, target selection, hit allocation, wolverine sixes, epinephrine, continue/retreat, retreat decisions, animation wait). The copies are virtually identical -- only the loop name prefixes differ.

BoardSmith does NOT provide a `subFlow` primitive. The available flow primitives are: `loop`, `eachPlayer`, `actionStep`, `simultaneousActionStep`, `sequence`, `execute`, `phase`. However, since these are all just functions returning flow node objects, the extraction pattern is straightforward: **create a TypeScript function that returns a `sequence(...)` containing all combat resolution nodes**. The caller sites simply invoke this function in place of the inlined combat blocks.

**Primary recommendation:** Extract a `combatResolutionFlow(game)` function that returns a `sequence(...)` of all combat decision loops + animation wait, then replace all 4 inline copies with calls to this function.

## Standard Stack

No new libraries needed. This is purely a refactoring within existing BoardSmith flow primitives.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| boardsmith | current | Flow primitives (loop, sequence, actionStep, etc.) | Already in use |

## Architecture Patterns

### Recommended Extraction Pattern

The key insight: BoardSmith flow primitives (`loop`, `sequence`, `actionStep`, `execute`, `simultaneousActionStep`) are **plain functions returning flow node objects**. A "sub-flow" is just a function that returns one of these nodes.

```typescript
// New function in flow.ts (or a new combat-flow.ts)
function combatResolutionFlow(game: MERCGame): ReturnType<typeof sequence> {
  return sequence(
    // Before-attack healing loop
    loop({ name: 'combat-before-attack-healing', ... }),
    // Attack dog selection loop
    loop({ name: 'combat-attack-dog-selection', ... }),
    // Target selection loop
    loop({ name: 'combat-target-selection', ... }),
    // Hit allocation loop
    loop({ name: 'combat-hit-allocation', ... }),
    // Wolverine 6s loop
    loop({ name: 'combat-wolverine-sixes', ... }),
    // Epinephrine loop
    loop({ name: 'combat-epinephrine', ... }),
    // Combat continue (non-retreat)
    loop({ name: 'combat-continue', ... }),
    // Retreat decision (simultaneous)
    loop({ name: 'combat-retreat-decision', ... }),
    // Animation wait (auto-clear for AI + loop for human)
    execute(() => { /* auto-clear for all-AI games */ }),
    loop({ name: 'combat-animation-wait', ... }),
  );
}
```

### The 4 Duplication Sites

Each site consists of the same combat resolution blocks, only differing in loop name prefixes:

| Site | Location (lines) | Name Prefix | Context |
|------|-------------------|-------------|---------|
| **Rebel action loop** | 396-630 | `combat-*` | Inside `rebel-action-loop`, combat triggered by movement |
| **Tactics card combat** | 807-1037 | `tactics-combat-*` | After `dictator-play-tactics`, combat from Fodder etc. |
| **Dictator MERC actions** | 1079-1309 | `dictator-combat-*` | Inside `dictator-merc-actions` loop, combat from dictator movement |
| **Kim militia combat** | 1396-1626 | `kim-militia-combat-*` | After Kim's ability places militia near rebels |

### Pending Combat Initiation Pattern

Each site ALSO has a **pending combat initiation** block (an `execute` step that dequeues `pendingCombat`/`pendingCombatQueue` and calls `executeCombat`). This block appears in 3 locations:
1. Rebel action loop (lines 377-393)
2. Dictator MERC actions (lines 1060-1075)
3. Kim militia ability (lines 1376-1392)

The tactics card combat site does NOT have this block because combat is triggered inline by the tactics card effect, not via the pending queue.

**Decision needed:** Whether to include pending combat initiation in the sub-flow function or keep it separate. Recommendation: keep it separate since it's context-dependent (rebel vs dictator initiation path, and tactics doesn't use it).

### Loop Name Uniqueness

BoardSmith flow nodes have `name` properties used for debugging and state tracking. Currently each copy uses unique prefixed names (e.g., `rebel-combat-animation-wait` vs `tactics-combat-animation-wait`).

**Critical question:** Does BoardSmith require globally unique flow node names? If yes, the extracted function needs a `prefix` parameter. If no, a single set of names works.

**Recommendation:** Use a `prefix` parameter to be safe:
```typescript
function combatResolutionFlow(game: MERCGame, prefix: string) {
  return sequence(
    loop({ name: `${prefix}-before-attack-healing`, ... }),
    // ...
  );
}
```

### Helper Functions Already Shared

These functions are already defined once and used across all 4 sites:
- `getCombatDecisionPlayer(game, attackerId, fallback)` -- resolves player for combat decisions
- `getCombatDecisionParticipants(game)` -- finds human players in active combat
- `getEpinephrineDecisionPlayer(game, fallback)` -- resolves epinephrine decision owner
- `getPlayerBySeat(game, seat)` -- seat-to-player lookup

These are already at module scope in `flow.ts` and need no changes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sub-flow mechanism | Custom flow runner | TypeScript function returning `sequence(...)` | BoardSmith primitives are composable functions |
| Unique names | Manual prefixing at each site | Template string parameter | Prevents name collision bugs |

## Common Pitfalls

### Pitfall 1: Breaking the Retreat Decision Execute Block
**What goes wrong:** The retreat decision processing (`execute` block after `simultaneousActionStep`) contains subtle logic -- retreat ordering by seat, checking `canRetreat`, calling `executeCombatRetreat`, then conditionally resuming combat. Any drift between the 4 copies during extraction will break multiplayer retreat.
**Why it happens:** Copy-paste differences accumulated; need to verify all 4 copies are truly identical.
**How to avoid:** Diff all 4 retreat decision blocks to confirm they are byte-identical before extracting. If they differ, investigate which version is correct.
**Warning signs:** Retreat decisions not processing in multi-player games.

### Pitfall 2: Loop Name Collisions
**What goes wrong:** If two combat resolution flows could theoretically be active simultaneously (they cannot currently, but guard against future changes), duplicate names could confuse BoardSmith's flow state tracking.
**Why it happens:** Extracting to a single function without parameterization.
**How to avoid:** Use prefix parameter as shown above.

### Pitfall 3: Rebel Action Loop Has Extra Context
**What goes wrong:** The rebel action loop wraps combat blocks inside a larger loop that also contains the regular `rebel-action` actionStep, mortar allocation, and coordinated attack. Extraction must only pull the combat blocks, not the surrounding context.
**Why it happens:** Combat resolution is interleaved with non-combat action steps in the rebel loop.
**How to avoid:** Extract only the 10 combat decision loops + animation wait. The pending combat initiation and regular action steps stay in place.

### Pitfall 4: The `combatComplete` Skip Pattern
**What goes wrong:** The regular action steps (`rebel-action`, `dictator-merc-action`) have `skipIf: () => game.activeCombat !== null && !game.activeCombat.combatComplete` -- they allow actions while combat animation plays. If the animation wait loop is moved into the sub-flow, the skipIf on the action step still needs to work correctly.
**Why it happens:** Combat resolution and regular actions are interleaved in the same parent loop.
**How to avoid:** The sub-flow handles everything from first combat decision through animation clear. Regular action steps remain outside the sub-flow.

### Pitfall 5: Test Stability
**What goes wrong:** Tests that run through the flow (smoke tests, combat integration tests) may be sensitive to flow step names or ordering.
**Why it happens:** Some tests may match on step names.
**How to avoid:** Run full test suite after extraction. If tests reference step names, the prefix parameter handles this.

## Code Examples

### Current Pattern (repeated 4x)
```typescript
// This block appears 4 times with different name prefixes
// Before-attack healing
loop({
  name: 'PREFIX-combat-before-attack-healing',
  while: () => game.activeCombat?.pendingBeforeAttackHealing != null && !game.isFinished(),
  maxIterations: 50,
  do: actionStep({
    name: 'before-attack-heal',
    player: (ctx) => {
      const pending = game.activeCombat?.pendingBeforeAttackHealing;
      if (!pending) return ctx.player!;
      return getCombatDecisionPlayer(game, pending.attackerId, ctx.player!);
    },
    actions: ['combatBeforeAttackHeal', 'combatSkipBeforeAttackHeal'],
    skipIf: () => game.isFinished() || game.activeCombat?.pendingBeforeAttackHealing == null,
  }),
}),
// ... 9 more loops identical across all 4 sites
```

### Extracted Pattern
```typescript
function combatResolutionFlow(game: MERCGame, prefix: string) {
  return sequence(
    // Before-attack healing
    loop({
      name: `${prefix}-before-attack-healing`,
      while: () => game.activeCombat?.pendingBeforeAttackHealing != null && !game.isFinished(),
      maxIterations: 50,
      do: actionStep({ /* ... */ }),
    }),
    // ... all other combat loops ...
    // Animation wait
    execute(() => {
      if (game.activeCombat?.combatComplete &&
          game.dictatorPlayer?.isAI &&
          game.rebelPlayers.every(p => p.isAI)) {
        clearActiveCombat(game);
      }
    }),
    loop({
      name: `${prefix}-animation-wait`,
      while: () => game.activeCombat?.combatComplete === true &&
        !(game.dictatorPlayer?.isAI && game.rebelPlayers.every(p => p.isAI)),
      maxIterations: 5,
      do: actionStep({
        name: 'wait-for-combat-animations',
        actions: ['clearCombatAnimations'],
        skipIf: () => !game.activeCombat?.combatComplete,
      }),
    }),
  );
}
```

### Call Sites After Extraction
```typescript
// Rebel action loop (inside rebel-action-loop sequence)
combatResolutionFlow(game, 'rebel-combat'),
actionStep({ name: 'rebel-action', ... }),

// Tactics card combat
combatResolutionFlow(game, 'tactics-combat'),

// Dictator MERC actions (inside dictator-merc-actions loop sequence)
combatResolutionFlow(game, 'dictator-combat'),
actionStep({ name: 'dictator-merc-action', ... }),

// Kim militia combat
combatResolutionFlow(game, 'kim-militia-combat'),
```

## Detailed Duplication Analysis

### Block-by-block comparison of all 4 sites

| Block | Rebel (lines) | Tactics (lines) | Dictator MERC (lines) | Kim Militia (lines) | Identical? |
|-------|--------------|-----------------|----------------------|---------------------|------------|
| Before-attack healing | 396-410 | 807-821 | 1079-1093 | 1396-1410 | YES (except name prefix) |
| Attack dog selection | 412-427 | 824-838 | 1095-1110 | 1412-1427 | YES (except name prefix) |
| Target selection | 429-444 | 840-855 | 1112-1127 | 1429-1444 | YES (except name prefix) |
| Hit allocation | 446-461 | 857-872 | 1129-1144 | 1446-1461 | YES (except name prefix) |
| Wolverine 6s | 463-473 | 874-884 | 1146-1156 | 1463-1473 | YES (except name prefix) |
| Epinephrine | 475-486 | 886-897 | 1158-1169 | 1475-1486 | YES (except name prefix) |
| Combat continue | 488-516 | 899-927 | 1171-1199 | 1488-1516 | YES (except name prefix) |
| Retreat decision | 518-609 | 929-1016 | 1201-1288 | 1518-1605 | YES (except name prefix) |
| Auto-clear execute | 611-619 | 1018-1026 | 1290-1298 | 1607-1615 | YES |
| Animation wait loop | 620-630 | 1027-1037 | 1299-1309 | 1616-1626 | YES (except name prefix) |

**All 10 blocks are functionally identical across all 4 sites.** The only difference is the name prefix on the loop nodes. This is a clean extraction.

## Test Coverage

Combat-related test files:
| File | Focus | Tests |
|------|-------|-------|
| `tests/combat-events.test.ts` | Animation events pipeline | combat-panel snapshots, dice events, damage events, death events |
| `tests/combat-execution.test.ts` | Combat mechanics | Dice rolling, hit counting, combat resolution, dictator presence |
| `tests/combat-abilities.test.ts` | MERC abilities in combat | Basic reroll, Kastern initiative, conditional bonuses |
| `tests/smoke.test.ts` | Full game playthrough | End-to-end flow (exercises combat through the flow engine) |
| `tests/landmine.test.ts` | Landmine triggers | Combat triggered by landmine detonation |

The smoke test is the most flow-sensitive -- it runs through the entire game flow with AI players. All combat tests that call `executeCombat` directly test the combat engine, not the flow wiring. The smoke test is the one that validates flow structure.

## Risks and Complications

### Risk 1: File size and function signature (LOW risk)
`flow.ts` is already 1648 lines. Adding a helper function adds ~5 lines but removes ~900 lines of duplication. Net reduction of ~895 lines. Could also put the helper in a separate `combat-flow.ts` file.

### Risk 2: Return type of sequence() (LOW risk)
Need to verify the return type. The function signature should use `ReturnType<typeof sequence>` or whatever BoardSmith exports as the flow node type. The import already includes `type FlowDefinition` but the individual node types may need investigation.

### Risk 3: Pending combat initiation is NOT part of the extraction (MEDIUM risk)
The 3 sites that initiate pending combat (rebel, dictator MERC, Kim) have an `execute` block before the combat resolution. These are slightly different (rebel checks `game.pendingCombat` from rebel player, dictator checks from rebel player too but in a different context). These should remain inline, NOT be extracted. The planner must make this clear to avoid over-extraction.

## Open Questions

1. **Flow node name uniqueness requirement**
   - What we know: Names are used for debugging; each site currently has unique prefixed names
   - What's unclear: Whether BoardSmith enforces uniqueness or uses names for state tracking
   - Recommendation: Use prefix parameter (safe default). Verify by checking if tests pass with shared names.

2. **Where to put the extracted function**
   - Option A: Same file (`flow.ts`) as a module-level function -- simplest, keeps all flow logic together
   - Option B: New file (`combat-flow.ts`) -- cleaner separation, but adds an import
   - Recommendation: Keep in `flow.ts` since it's private to the flow definition and uses the same helper functions

3. **Inner actionStep names**
   - The `name` on actionSteps inside loops (e.g., `name: 'before-attack-heal'`) is currently the SAME across all 4 sites -- only the loop names differ
   - This suggests BoardSmith may scope step names within their parent loop
   - Recommendation: Keep inner names the same, only parameterize loop names

## Sources

### Primary (HIGH confidence)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/rules/flow.ts` - Full flow definition, all 4 combat duplication sites analyzed line-by-line
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/rules/combat.ts` - Combat engine exports (executeCombat, clearActiveCombat, etc.)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/rules/actions/rebel-combat.ts` - clearCombatAnimations action definition

### Secondary (MEDIUM confidence)
- BoardSmith flow primitives are composable functions (inferred from import/usage patterns, not verified from engine source)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, pure refactoring
- Architecture: HIGH - all 4 duplication sites analyzed, extraction pattern is straightforward TypeScript function composition
- Pitfalls: HIGH - based on direct code analysis of all 4 sites and their surrounding context

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable -- this is internal refactoring, not version-dependent)
