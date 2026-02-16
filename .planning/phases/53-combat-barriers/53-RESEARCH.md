# Phase 53: Combat Barriers - Research

**Researched:** 2026-02-16
**Domain:** BoardSmith flow engine / combat barrier pattern / simultaneous step exit/re-entry
**Confidence:** HIGH

## Summary

Phase 53 implements combat and coordinated attacks as "synchronization barriers" within the simultaneous rebel step established in Phase 52. The current flow.ts (post-Phase 52) already has the complete architecture for this: a `rebel-phase` loop containing a sequence of combat resolution, mortar allocation, coordinated attack response, and a `simultaneousActionStep('rebel-actions')`. The `allDone` callback on the simultaneous step already exits when combat/coordinated attack/mortar state is detected. The outer loop already re-enters the simultaneous step after those barriers resolve.

In other words, Phase 52 already built the barrier architecture as part of implementing the simultaneous step. The `allDone` function (flow.ts lines 728-737) checks for `activeCombat`, `pendingCombat`, `pendingCombatQueue`, `coordinatedAttack`, and `pendingMortarAttack` and returns `true` (exit) when any are present. The outer loop's `while` condition (lines 604-612) keeps the loop alive while these states exist. The sequence inside the loop handles combat initiation (execute block), combat resolution (combatResolutionFlow), mortar allocation, and coordinated attack response BEFORE re-entering the simultaneous step.

**Primary recommendation:** Verify that the existing barrier pattern works correctly for FLOW-03 and FLOW-04 through testing. The flow structure is already in place. The main work is ensuring: (1) players who ended their turn before a barrier stay done after it resolves, (2) combat triggered by one rebel properly pauses all rebels, and (3) coordinated attack declare/commit/decline/resolve cycle works within the barrier pattern. Write tests that exercise these specific scenarios.

## Standard Stack

### Core (already in project, no changes needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| boardsmith | installed | `simultaneousActionStep`, `loop`, `sequence`, `execute` | All barrier primitives already imported and used |

No new dependencies needed.

### Key APIs Already in Use

**`allDone` on simultaneousActionStep (the barrier exit mechanism):**
- Evaluated at step entry (engine.ts line 1122) AND after each action (engine.ts line 371)
- When `allDone` returns `true`, the simultaneous step completes immediately
- All `awaitingPlayers` are cleared; the step's frame is marked `completed`
- The flow engine continues with the next node in the parent sequence

**`skipPlayer` on simultaneousActionStep (the barrier re-entry mechanism):**
- Evaluated at step entry (engine.ts line 1075) for each player
- Players returning `true` are never added to `awaitingPlayers`
- On re-entry after a barrier, players whose MERCs have `actionsRemaining === 0` are skipped

**`playerDone` on simultaneousActionStep:**
- Evaluated at step entry (engine.ts line 1080) AND after each action (engine.ts line 350-351)
- Players returning `true` are not added to `awaitingPlayers`
- This is how "done before barrier" players stay done after barrier resolves

## Architecture Patterns

### Current Flow Structure (already implemented in Phase 52)

```
loop('rebel-phase')                              // Outer barrier loop
  while: !finished && (combatActive || combatPending || coordAttack || mortar || anyRebelHasActions)
  maxIterations: 200
  do: sequence(
    execute(() => { initiatePendingCombat })      // [1] Combat initiation
    combatResolutionFlow(game, 'combat')          // [2] Combat barrier resolution
    loop('rebel-mortar-allocation') ...           // [3] Mortar barrier
    loop('coordinated-attack-response') ...       // [4] Coordinated attack barrier
    simultaneousActionStep('rebel-actions')        // [5] Rebel parallel play
      allDone: combatActive || pendingCombat || coordAttack || mortar || allDone
```

### Pattern 1: Combat Barrier (FLOW-03)

**How it works (already wired):**
1. Rebel A calls `move` action, which sets `game.pendingCombat = { sectorId, playerId }`
2. Engine calls `resumeSimultaneousAction` which re-evaluates `allDone` (engine.ts line 371)
3. `allDone` sees `game.pendingCombat !== null` and returns `true`
4. Simultaneous step completes (engine.ts lines 376-381), all awaitingPlayers cleared
5. Flow continues in the outer loop sequence -- next iteration hits:
   - `execute` block dequeues pendingCombat and calls `executeCombat`
   - `combatResolutionFlow` runs sequentially to completion
   - Mortar/coordinated attack loops skip (not applicable)
   - `simultaneousActionStep` re-enters -- `skipPlayer`/`playerDone` re-evaluated for each rebel
6. Players whose MERCs have no actions remaining are skipped (they stay "done")

**Key insight:** The `allDone` check happens AFTER the triggering action succeeds. The move action sets `pendingCombat` in its execute handler, then when the engine checks `allDone`, it returns true. All rebels immediately exit the simultaneous step.

### Pattern 2: Coordinated Attack Barrier (FLOW-04)

**How it works (already wired):**
1. Rebel A calls `declareMultiPlayerAttack`, which sets `game.coordinatedAttack = { ... }`
2. `allDone` sees `game.coordinatedAttack !== null`, returns `true`, simultaneous step exits
3. Outer loop continues:
   - Combat initiation execute: no-op (no pendingCombat)
   - combatResolutionFlow: skips (no activeCombat)
   - Mortar allocation: skips (no pendingMortarAttack)
   - **Coordinated attack response loop enters:**
     - `simultaneousActionStep('coordinated-attack-commit')` runs for eligible rebels
     - Each rebel commits/declines
     - `execute` calls `game.executeCoordinatedAttack()`, which may queue combat
   - simultaneousActionStep('rebel-actions') re-enters (or outer loop iterates again if combat was queued)

### Pattern 3: "Done Before Barrier" Preservation

When a rebel ends their turn (calls `endTurn`), all their MERCs get `actionsRemaining = 0`. On re-entry to the simultaneous step after a barrier:

```typescript
skipPlayer: (_ctx, player) => {
  if (game.isFinished()) return true;
  const rebel = player as RebelPlayer;
  return !rebel.team.some(m => m.actionsRemaining > 0);  // true = skip this player
},
playerDone: (_ctx, player) => {
  const rebel = player as RebelPlayer;
  return !rebel.team.some(m => m.actionsRemaining > 0);  // true = this player is done
},
```

Both `skipPlayer` and `playerDone` check the same condition. If a rebel had ended their turn before the barrier, their MERCs still have `actionsRemaining === 0` after combat resolves. They will be skipped on re-entry. This satisfies success criterion 3.

### Anti-Patterns to Avoid

- **Adding explicit "barrier mode" state:** The existing `pendingCombat`/`activeCombat`/`coordinatedAttack` state IS the barrier signal. No new state flag needed.
- **Trying to "pause" the simultaneous step without exiting:** The engine has no pause mechanism. The pattern is exit (via `allDone`) then re-enter (via the outer loop).
- **Resetting player done state after barrier:** Don't reset actionsRemaining. The endTurn action zeroed them out; that persists through barriers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Barrier exit signal | Custom "barrier mode" flag | `allDone` checking existing combat/attack state | State already exists, allDone already checks it |
| Player state preservation across barriers | Custom "was done before barrier" map | `skipPlayer`/`playerDone` checking `actionsRemaining` | Natural state: endTurn zeros actionsRemaining, which persists through barriers |
| Sequential combat within simultaneous play | Custom flow node interleaving | Outer loop with sequence (combat before simultaneous step) | Already the established pattern from Phase 52 |

## Common Pitfalls

### Pitfall 1: Combat Resolution Completing But activeCombat Still Set
**What goes wrong:** After `combatResolutionFlow` finishes (including animation wait), if `activeCombat` is not fully cleared, the outer loop's `while` condition keeps it alive but the `simultaneousActionStep` immediately exits via `allDone`.
**Why it happens:** The animation-wait step (block 10 of combatResolutionFlow) clears `activeCombat` via `clearCombatAnimations` action. If that action doesn't fully null out `activeCombat`, the loop spins.
**How to avoid:** Verify that `clearCombatAnimations` action sets `game.activeCombat = null`. Check that after the full combatResolutionFlow sequence completes, `activeCombat` is null.

### Pitfall 2: Coordinated Attack Declaring Player Also In Simultaneous Step
**What goes wrong:** The rebel who declared the coordinated attack is also a participant in the commit/decline simultaneous step. If their squadType was already committed during declaration, they might be presented with commit/decline options incorrectly.
**Why it happens:** `declareMultiPlayerAttack` sets `coordinatedAttack.committedSquads` with the declaring player's first squad. The `coordinated-attack-commit` players function checks for eligible squads.
**How to avoid:** The existing `players` function (flow.ts lines 666-675) already handles this: it includes the declaring player only if they have a SECOND eligible squad. Verify this logic covers all cases.

### Pitfall 3: Multiple Combats Queued Before Barrier Resolves
**What goes wrong:** If somehow multiple combats get queued (via `pendingCombatQueue`), the barrier might only resolve one before re-entering the simultaneous step.
**Why it happens:** The outer loop's `while` condition checks `pendingCombatQueue.length > 0`, and the `execute` block at the top dequeues one combat per iteration.
**How to avoid:** This is actually handled correctly: the outer loop keeps iterating until the queue is empty. But verify that `allDone` also checks `pendingCombatQueue.length > 0` (it does, line 732).

### Pitfall 4: Mortar Attack During Simultaneous Play
**What goes wrong:** Mortar hit allocation needs a specific player context (the rebel who fired the mortar). The `actionStep` for mortar allocation uses a `player:` override (flow.ts lines 645-649) that reads `game.pendingMortarAttack.attackingPlayerId`.
**Why it happens:** The mortar action sets `pendingMortarAttack` which triggers `allDone` (line 734), exits the simultaneous step, and the mortar allocation loop runs with the correct player override.
**How to avoid:** Already handled correctly. Verify the player override resolves correctly.

### Pitfall 5: AI Rebels in Simultaneous Step After Barrier
**What goes wrong:** After a barrier, AI rebels need to continue acting. The engine handles AI in simultaneous steps by providing actions to the AI executor for each awaiting AI player.
**Why it happens:** This is the standard engine behavior.
**How to avoid:** No special handling needed, but verify via tests that AI rebels resume correctly after a combat barrier.

## Code Examples

### Current allDone Implementation (already in flow.ts lines 728-737)
```typescript
allDone: () => {
  if (game.isFinished()) return true;
  // Break out for combat resolution
  if (game.activeCombat !== null && !game.activeCombat.combatComplete) return true;
  if (game.pendingCombat !== null || game.pendingCombatQueue.length > 0) return true;
  if (game.coordinatedAttack !== null) return true;
  if (game.pendingMortarAttack != null) return true;
  // All rebels done
  return game.rebelPlayers.every(p => !p.team.some(m => m.actionsRemaining > 0));
},
```

### Current Outer Loop While Condition (flow.ts lines 604-612)
```typescript
while: () => {
  if (game.isFinished()) return false;
  // Keep going while combat is active or pending
  if (game.activeCombat !== null && !game.activeCombat.combatComplete) return true;
  if (game.pendingCombat !== null || game.pendingCombatQueue.length > 0) return true;
  if (game.coordinatedAttack !== null) return true;
  if (game.pendingMortarAttack != null) return true;
  // Continue while any rebel has actions remaining
  return game.rebelPlayers.some(p => p.team.some(m => m.actionsRemaining > 0));
},
```

### Combat Initiation Execute Block (flow.ts lines 617-633)
```typescript
execute(() => {
  if (!game.pendingCombat && game.pendingCombatQueue.length > 0) {
    game.pendingCombat = game.pendingCombatQueue.shift() || null;
  }
  if (game.pendingCombat && !game.activeCombat) {
    const sector = game.getSector(game.pendingCombat.sectorId);
    const player = game.rebelPlayers.find(
      p => `${p.seat}` === game.pendingCombat!.playerId
    );
    if (sector && player) {
      executeCombat(game, sector, player, {
        attackingPlayerIsRebel: game.pendingCombat.attackingPlayerIsRebel ?? true,
      });
    }
    game.pendingCombat = null;
  }
}),
```

### Coordinated Attack Response (flow.ts lines 658-692)
```typescript
loop({
  name: 'coordinated-attack-response',
  while: () => game.coordinatedAttack !== null,
  maxIterations: 1,
  do: sequence(
    simultaneousActionStep({
      name: 'coordinated-attack-commit',
      players: () => {
        const attack = game.coordinatedAttack;
        if (!attack) return [];
        return game.rebelPlayers.filter(p => {
          if (p.seat === attack.declaringPlayerSeat) {
            return game.getEligibleSquadsForCoordinatedAttack(p).length > 0;
          }
          return game.getEligibleSquadsForCoordinatedAttack(p).length > 0
            || !game.hasPlayerRespondedToCoordinatedAttack(p.seat);
        });
      },
      actions: ['commitSquadToCoordinatedAttack', 'declineCoordinatedAttack'],
      playerDone: (_ctx, player) => {
        return game.hasPlayerRespondedToCoordinatedAttack(player.seat);
      },
    }),
    execute(() => {
      const result = game.executeCoordinatedAttack();
      if (!result) return;
      const { targetSector, enteringSquads, firstRebel } = result;
      checkLandMines(game, targetSector, enteringSquads, true);
      if (firstRebel && hasEnemies(game, targetSector, firstRebel as RebelPlayer)) {
        queuePendingCombat(game, targetSector, firstRebel as RebelPlayer, true);
      }
    }),
  ),
}),
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Combat inside `eachPlayer` loop | Combat in outer loop, exits `simultaneousActionStep` via `allDone` | Phase 52 | Barrier pattern already established |
| Coordinated attack inside sequential rebel turn | Coordinated attack in outer loop, outside simultaneous step | Phase 52 | Barrier pattern already established |

## Open Questions

1. **Is `combatComplete` check in `allDone` correct?**
   - What we know: `allDone` checks `game.activeCombat !== null && !game.activeCombat.combatComplete` -- it only exits for ACTIVE (non-complete) combat. If `combatComplete` is true, `allDone` does NOT exit for that condition.
   - What's unclear: Should it also exit when `combatComplete` is true (animation wait phase)?
   - Analysis: The animation wait is handled by `combatResolutionFlow` block 10. If combat completes INSIDE the simultaneous step (unlikely -- combat is resolved outside), the `activeCombat` would still be non-null but `combatComplete` would be true. The outer loop's `while` also only checks `!combatComplete`, so the loop would exit. This seems correct: combat is initiated outside the simultaneous step, so `activeCombat` should never be set while inside the simultaneous step.
   - Recommendation: Verify via test that the flow does not get stuck if somehow `activeCombat.combatComplete === true` when entering the simultaneous step.

2. **Does the engine preserve per-player action state across allDone exits?**
   - What we know: When `allDone` returns true, `awaitingPlayers` is cleared (engine.ts line 378). On re-entry, `executeSimultaneousActionStep` rebuilds `awaitingPlayers` from scratch (engine.ts lines 1071-1113).
   - What's unclear: If Rebel A was mid-selection (e.g., choosing move destination) when `allDone` fires from Rebel B's combat trigger, does Rebel A lose their selection progress?
   - Analysis: Yes, they would. The `allDone` fires after Rebel B's action succeeds, which means Rebel A hasn't submitted their action yet. Their in-progress selection state is client-side only and would need to be re-initiated.
   - Recommendation: This is expected behavior for a barrier. The UI should handle re-presenting options when the simultaneous step re-enters. Document this as expected behavior.

3. **Test coverage for barrier scenarios**
   - What we know: Existing tests cover basic simultaneous play (Phase 52)
   - What's unclear: Whether existing tests exercise the combat barrier path specifically
   - Recommendation: Write targeted tests for: (a) combat barrier exit + re-entry, (b) coordinated attack barrier, (c) player done before barrier stays done after

## Sources

### Primary (HIGH confidence)
- `src/rules/flow.ts` (lines 600-739) - Current rebel phase flow with all barrier patterns
- `node_modules/boardsmith/src/engine/flow/engine.ts` (lines 301-385) - `resumeSimultaneousAction` showing `allDone` evaluation after each action
- `node_modules/boardsmith/src/engine/flow/engine.ts` (lines 1060-1133) - `executeSimultaneousActionStep` showing entry evaluation
- `node_modules/boardsmith/src/engine/flow/types.ts` (lines 141-152) - `SimultaneousActionStepConfig` interface
- `src/rules/actions/rebel-movement.ts` (lines 256-263) - `move` action setting `pendingCombat`
- `src/rules/actions/rebel-movement.ts` (lines 410-555) - Coordinated attack actions
- `src/rules/game.ts` (lines 1426-1515) - Coordinated attack state management

### Secondary (MEDIUM confidence)
- `.planning/phases/52-simultaneous-rebel-step/52-RESEARCH.md` - Phase 52 research (verified patterns)
- `.planning/phases/52-simultaneous-rebel-step/52-02-SUMMARY.md` - Phase 52 completion status

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries; all APIs verified from engine source
- Architecture: HIGH - The barrier pattern is already implemented in flow.ts from Phase 52. The `allDone`/outer loop structure is verified from engine source and flow source.
- Pitfalls: HIGH - All pitfalls derived from engine source code analysis of how `allDone` interacts with `resumeSimultaneousAction`

**Key finding:** The combat barrier architecture is already in place from Phase 52. This phase is primarily about **verification and testing**, not new flow construction. The flow structure already exits the simultaneous step on combat/coordinated attack/mortar state, resolves them sequentially, and re-enters. The main deliverable should be comprehensive tests proving the barrier behavior works correctly.

**Research date:** 2026-02-16
**Valid until:** Stable -- tied to current flow.ts structure and BoardSmith engine version
