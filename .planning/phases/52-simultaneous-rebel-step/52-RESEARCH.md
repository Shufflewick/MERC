# Phase 52: Simultaneous Rebel Step - Research

**Researched:** 2026-02-16
**Domain:** BoardSmith flow engine / simultaneous action steps / MERC rebel turn structure
**Confidence:** HIGH

## Summary

This phase replaces the sequential `eachPlayer('rebel-turns')` pattern (lines 609-746 of flow.ts) with a `loop` wrapping a `simultaneousActionStep` so all rebels act freely in parallel during the rebel phase. The existing codebase already uses `simultaneousActionStep` in two places (retreat decisions at line 314, coordinated attack response at line 713), providing proven patterns to follow.

The main complexity is that combat resolution is currently embedded inside the per-player rebel action loop. When one rebel triggers combat, it must resolve before any rebel can continue. The `combatResolutionFlow` sub-flow (extracted in Phase 51) handles combat via single-player `actionStep` nodes, which are fundamentally incompatible with being nested inside a `simultaneousActionStep`. The flow must exit the simultaneous step, resolve combat, then re-enter.

**Primary recommendation:** Use a `loop` containing a `simultaneousActionStep` for rebel actions, with an `allDone` escape when combat is pending. After the simultaneous step, run combat resolution via `combatResolutionFlow`, then loop back. The outer loop continues until all rebels are done.

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| boardsmith | installed | `simultaneousActionStep`, `loop`, `sequence`, `execute` | Framework provides all needed primitives |

No new dependencies needed. Everything required is already imported in flow.ts.

### Key BoardSmith APIs

**`simultaneousActionStep` signature (from builders.ts:279-298):**
```typescript
simultaneousActionStep({
  name?: string;
  players?: (context: FlowContext) => Player[];
  actions: string[] | ((context: FlowContext, player: Player) => string[]);
  playerDone?: (context: FlowContext, player: Player) => boolean;
  allDone?: (context: FlowContext) => boolean;
  skipPlayer?: (context: FlowContext, player: Player) => boolean;
})
```

Key behaviors verified from engine.ts:
- `skipPlayer` is evaluated at step entry (line 1075) -- players returning true are never added to awaitingPlayers
- `playerDone` is evaluated at step entry (line 1080) AND after each action (line 350-351)
- `allDone` is evaluated at step entry (line 1122) AND after each action (line 371-372)
- Players with no available actions are auto-completed (line 1106, line 365-367)
- `actions` as a function receives `(context, player)` -- enabling per-player action filtering
- After action execution, available actions are re-evaluated for the acting player (lines 354-367)

## Architecture Patterns

### Pattern 1: Loop + SimultaneousActionStep + Combat Breakout

The core pattern: wrap `simultaneousActionStep` in a loop that also handles combat resolution.

```
loop('rebel-phase-loop')
  while: !allRebelsDone && !game.isFinished()
  do: sequence(
    // Check/initiate pending combat
    execute(() => { initiatePendingCombat() })

    // Combat resolution (from Phase 51)
    combatResolutionFlow(game, 'rebel-combat')

    // Simultaneous rebel actions
    simultaneousActionStep({
      name: 'rebel-actions',
      players: () => game.rebelPlayers,
      actions: (ctx, player) => rebelActionList,
      skipPlayer: (ctx, player) => isRebelDone(player) || combatActive(),
      playerDone: (ctx, player) => isRebelDone(player),
      allDone: () => allRebelsDone() || combatPending() || game.isFinished(),
    })

    // Mortar allocation (per-triggering-player)
    // Coordinated attack response (already simultaneous)
  )
```

**Why this works:**
- When a rebel triggers combat (via move), `pendingCombat` gets set
- The simultaneous step's `allDone` fires and sees `combatPending()` is true, exits the step
- The outer loop continues, combat resolution runs at the top of next iteration
- After combat resolves, the simultaneous step re-enters, re-evaluating all players

### Pattern 2: "Done" Tracking via Game State

A rebel is "done" when:
1. All their MERCs have `actionsRemaining === 0`, OR
2. They explicitly call `endTurn` (which sets all MERCs' `actionsRemaining` to 0)

This is already computed identically to the current `rebel-action-loop` while condition (line 631):
```typescript
function isRebelDone(player: RebelPlayer): boolean {
  return !player.team.some(m => m.actionsRemaining > 0);
}
```

No additional "done" flag needed -- the existing `endTurn` action already zeros out `actionsRemaining`, making `playerDone` return true naturally.

### Pattern 3: Day 1 Simultaneous Landing (FLOW-06)

Day 1 rebel setup is currently sequential via `eachPlayer('rebel-landing')`. Each rebel does: placeLanding -> hireFirstMerc -> hireSecondMerc -> (optional hireThirdMerc).

This is a multi-step sequence per player, not a free-form action loop. Two approaches:

**Option A: Single simultaneousActionStep with state machine per player**
- Each rebel progresses through landing states independently
- `actions` function returns different actions based on player's current landing state
- `playerDone` checks if player completed all hiring steps

**Option B: Keep eachPlayer for Day 1, only change Day 2+**
- Day 1 is inherently sequential (each player does 3-4 fixed steps)
- Requirement FLOW-06 says "same simultaneous model" but the spirit is likely "rebels don't wait for each other"

**Recommendation: Option A** -- use `simultaneousActionStep` with state-aware `actions` function. The Day 1 actions already have proper conditions (`has landed`, `has no MERCs yet`, etc.) that naturally gate progression. Bundle all Day 1 rebel actions into the available list and let conditions handle ordering.

### Pattern 4: Combat Interruption Handling

When combat triggers mid-simultaneous-step:
1. Rebel A moves into enemy sector -> `pendingCombat` set
2. `allDone` checks `pendingCombat` -> returns true -> exits simultaneous step
3. Outer loop: `execute` initiates combat from `pendingCombat`
4. `combatResolutionFlow` runs (single-player action steps for decisions)
5. Combat completes, animation wait finishes
6. Outer loop: back to `simultaneousActionStep`, all non-done rebels resume

**Critical: Oil Reserves effect** (line 614-618) currently runs at the start of each rebel's turn via `execute`. In simultaneous mode, this needs to run once for all rebels at the start of the rebel phase, or per-rebel when actions reset.

### Anti-Patterns to Avoid

- **Nesting actionStep inside simultaneousActionStep:** The combat resolution sub-flow uses regular `actionStep` nodes. These cannot be children of a `simultaneousActionStep`. Combat must be handled OUTSIDE the simultaneous step.
- **Per-player loops inside simultaneousActionStep:** Don't try to have per-player mortar allocation or coordinated attack loops inside the simultaneous step. Handle them in the outer loop.
- **Adding a custom "done" flag:** Don't add a `rebelTurnDone` boolean to player state. Use the existing `actionsRemaining === 0` check, which `endTurn` already manages.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-player action filtering | Custom action gate logic | `actions: (ctx, player) => [...]` callback on `simultaneousActionStep` | Engine already evaluates conditions per-player via `getAvailableActions(player)` |
| Player completion tracking | Custom done map/set | `playerDone` + existing `actionsRemaining` | Engine handles completion state internally |
| Player skip on re-entry | Custom skip logic | `skipPlayer: (ctx, player) => isRebelDone(player)` | Engine evaluates at step entry (line 1075) |
| Action validation per player | Custom validation layer | BoardSmith's `condition()` on each action | Already uses `ctx.player` for all checks |

## Common Pitfalls

### Pitfall 1: Combat Resolution Inside Simultaneous Step
**What goes wrong:** Trying to nest `combatResolutionFlow` inside `simultaneousActionStep` causes the engine to crash or deadlock. Combat action steps are single-player and expect `ctx.player` to be set by the flow engine.
**Why it happens:** `simultaneousActionStep` doesn't set `ctx.player` for child nodes -- it manages multiple players via `awaitingPlayers`.
**How to avoid:** Break out of the simultaneous step when combat is pending (via `allDone`), resolve combat in the outer loop, then re-enter.

### Pitfall 2: Stale Player State After Combat
**What goes wrong:** After combat resolves, a rebel's MERCs may be dead or have different `actionsRemaining`. If `skipPlayer`/`playerDone` isn't re-evaluated, that rebel might be stuck.
**How to avoid:** Both `skipPlayer` and `playerDone` are re-evaluated each time the simultaneous step is entered (the outer loop re-enters it). The engine also re-evaluates `playerDone` after each action. So state changes from combat are naturally picked up.

### Pitfall 3: Coordinated Attack Response Deadlock
**What goes wrong:** The coordinated attack response (line 709-742) is already a `simultaneousActionStep`. If nested inside the rebel phase's simultaneous step, there would be conflicting simultaneous states.
**How to avoid:** Handle coordinated attack in the outer loop, after the main simultaneous step exits. The `allDone` should also check for `game.coordinatedAttack !== null`.

### Pitfall 4: Mortar Allocation Player Mismatch
**What goes wrong:** Mortar allocation (line 695-705) uses a regular `actionStep` that relies on `ctx.player` being the rebel who fired the mortar. In simultaneous mode, there's no single current player.
**How to avoid:** Use `player:` override on the mortar allocation `actionStep` to specify which player should act, or set `pendingMortarAttack` to include the player reference and use that.

### Pitfall 5: Oil Reserves Per-Player Timing
**What goes wrong:** Oil Reserves currently fires at the start of each player's sequential turn. In simultaneous mode, there's no per-player "turn start."
**How to avoid:** Apply Oil Reserves for ALL rebels in an `execute` block before the simultaneous step loop begins, at the start of the rebel phase.

### Pitfall 6: endTurn Action Day Check
**What goes wrong:** `endTurn` has condition `'day 2 or later': () => game.currentDay >= 2`. If Day 1 also uses simultaneous mode, rebels can't explicitly end their Day 1 turn.
**How to avoid:** Day 1 rebels complete naturally (all hiring steps done). `playerDone` should check Day 1 completion state separately, or the Day 1 flow should use a different `playerDone` condition.

## Code Examples

### Main Rebel Phase (Day 2+) -- Proposed Structure
```typescript
// Rebel phase - all rebels act simultaneously
loop({
  name: 'rebel-phase',
  while: () => {
    if (game.isFinished()) return false;
    // Keep going while any rebel has actions or combat is active
    if (game.activeCombat !== null && !game.activeCombat.combatComplete) return true;
    if (game.pendingCombat !== null || game.pendingCombatQueue.length > 0) return true;
    if (game.coordinatedAttack !== null) return true;
    if (game.pendingMortarAttack != null) return true;
    return game.rebelPlayers.some(p => p.team.some(m => m.actionsRemaining > 0));
  },
  maxIterations: 200, // Higher limit: multiple rebels * actions each
  do: sequence(
    // Initiate pending combat
    execute(() => { /* dequeue pendingCombat, call executeCombat */ }),

    // Combat resolution
    combatResolutionFlow(game, 'rebel-combat'),

    // Mortar allocation (if pending)
    loop({
      name: 'rebel-mortar-allocation',
      while: () => game.pendingMortarAttack != null && !game.isFinished(),
      maxIterations: 10,
      do: actionStep({
        name: 'rebel-mortar-allocate',
        actions: ['mortarAllocateHits'],
        skipIf: () => game.isFinished() || game.pendingMortarAttack == null,
      }),
    }),

    // Coordinated attack response
    loop({
      name: 'coordinated-attack-response',
      while: () => game.coordinatedAttack !== null,
      maxIterations: 1,
      do: sequence(
        simultaneousActionStep({
          name: 'coordinated-attack-commit',
          players: () => { /* same as current */ },
          actions: ['commitSquadToCoordinatedAttack', 'declineCoordinatedAttack'],
          playerDone: (_ctx, player) => game.hasPlayerRespondedToCoordinatedAttack(player.seat),
        }),
        execute(() => { /* executeCoordinatedAttack, checkLandMines, queuePendingCombat */ }),
      ),
    }),

    // Main simultaneous action step
    simultaneousActionStep({
      name: 'rebel-actions',
      players: () => game.rebelPlayers.filter(p => !game.isFinished()),
      actions: [
        'move', 'coordinatedAttack', 'declareMultiPlayerAttack',
        'explore', 'train', 'hireMerc', 'reEquip', 'dropEquipment',
        'hospital', 'feedbackDiscard', 'squidheadDisarm', 'squidheadArm',
        'hagnessDrawType', 'hagnessGiveEquipment', 'armsDealer',
        'repairKit', 'mortar', 'assignToSquad', 'endTurn',
      ],
      skipPlayer: (_ctx, player) => {
        if (game.isFinished()) return true;
        if (!game.isRebelPlayer(player)) return true;
        // Skip if rebel is done (no actions remaining)
        return !player.team.some(m => m.actionsRemaining > 0);
      },
      playerDone: (_ctx, player) => {
        if (!game.isRebelPlayer(player)) return true;
        return !player.team.some(m => m.actionsRemaining > 0);
      },
      allDone: () => {
        if (game.isFinished()) return true;
        // Break out for combat
        if (game.activeCombat !== null && !game.activeCombat.combatComplete) return true;
        if (game.pendingCombat !== null || game.pendingCombatQueue.length > 0) return true;
        if (game.coordinatedAttack !== null) return true;
        if (game.pendingMortarAttack != null) return true;
        // All rebels done
        return game.rebelPlayers.every(p => !p.team.some(m => m.actionsRemaining > 0));
      },
    }),
  ),
})
```

### Day 1 Simultaneous Landing
```typescript
// Day 1 rebel phase - simultaneous landing
loop({
  name: 'rebel-landing',
  while: () => !game.isFinished() && game.rebelPlayers.some(p => !isDay1Complete(p)),
  maxIterations: 50,
  do: simultaneousActionStep({
    name: 'rebel-landing-actions',
    players: () => game.rebelPlayers,
    actions: ['placeLanding', 'hireFirstMerc', 'hireSecondMerc', 'hireThirdMerc'],
    skipPlayer: (_ctx, player) => isDay1Complete(player),
    playerDone: (_ctx, player) => isDay1Complete(player),
  }),
})

// Helper: check if a rebel has completed Day 1 setup
function isDay1Complete(player: Player): boolean {
  if (!game.isRebelPlayer(player)) return true;
  const rebel = player as RebelPlayer;
  // Has landed AND has at least 2 MERCs (or 3 if Teresa)
  if (!rebel.primarySquad.sectorId) return false;
  const teamSize = rebel.team.length;
  const hasTeresa = rebel.team.some(m => m.combatantId === 'teresa');
  return hasTeresa ? teamSize >= 3 : teamSize >= 2;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `eachPlayer` + per-player `loop` | `loop` + `simultaneousActionStep` | This phase | Rebels act in parallel, no waiting |
| Sequential Day 1 landing | Simultaneous Day 1 landing | This phase | Faster setup, same guarantees |

## Open Questions

1. **Mortar allocation player context**
   - What we know: `mortarAllocateHits` currently runs inside eachPlayer, so `ctx.player` is set automatically
   - What's unclear: In the outer loop (outside simultaneousActionStep), `ctx.player` may not be set to the mortar-firing rebel
   - Recommendation: Check if `pendingMortarAttack` stores the player reference; if not, add it. Use `player:` override on the actionStep.

2. **Action reset timing**
   - What we know: MERCs get `actionsRemaining` reset at the start of each day via `advanceDay()` (or similar)
   - What's unclear: Whether any per-rebel-turn reset logic exists beyond what `advanceDay` handles
   - Recommendation: Verify `advanceDay` resets all rebel MERCs' actions. Oil Reserves is the only per-turn effect found.

3. **AI rebel handling**
   - What we know: AI rebels use the same flow steps, the engine calls AI executor when it's an AI player's turn
   - What's unclear: How AI rebels behave in `simultaneousActionStep` -- does the engine call AI for each awaiting AI player?
   - Recommendation: Verify AI handling in simultaneous steps. The retreat decision step already handles this case.

## Sources

### Primary (HIGH confidence)
- `node_modules/boardsmith/src/engine/flow/builders.ts` - `simultaneousActionStep` builder API
- `node_modules/boardsmith/src/engine/flow/engine.ts:1060-1133` - Simultaneous step execution logic
- `node_modules/boardsmith/src/engine/flow/engine.ts:290-385` - Simultaneous step resume logic
- `node_modules/boardsmith/src/engine/flow/types.ts:141-152` - `SimultaneousActionStepConfig` type
- `src/rules/flow.ts` - Current flow definition (all patterns, combat sub-flow)
- `src/rules/actions/rebel-economy.ts:1290-1325` - endTurn action definition

### Secondary (MEDIUM confidence)
- `src/rules/actions/day-one-actions.ts` - Day 1 action conditions and state management
- `src/rules/elements.ts` - actionsRemaining property on CombatantBase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All APIs verified from source code in node_modules
- Architecture: HIGH - Pattern derived from existing simultaneousActionStep usage in this codebase (retreat decisions, coordinated attacks) combined with engine source code analysis
- Pitfalls: HIGH - Identified from engine execution flow and current flow structure analysis

**Research date:** 2026-02-16
**Valid until:** Stable -- tied to BoardSmith engine version currently installed
