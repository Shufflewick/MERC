# Phase 54: Dictator and AI Alignment - Research

**Researched:** 2026-02-16
**Domain:** Game flow engine, AI player integration, simultaneous action handling
**Confidence:** HIGH

## Summary

This phase has two requirements: (FLOW-05) refactor the dictator turn to use the shared `combatResolutionFlow` sub-flow, and (AI-01) make AI rebel players batch actions correctly within simultaneous play.

**FLOW-05 is already done.** The dictator turn in `flow.ts` already uses `combatResolutionFlow()` at three call sites within the dictator `eachPlayer` block: `combatResolutionFlow(game, 'tactics-combat')` at line 830, `combatResolutionFlow(game, 'dictator-combat')` at line 872, and `combatResolutionFlow(game, 'kim-militia-combat')` at line 958. There is no duplicate inline combat code in the dictator phase. Phase 51 already extracted and wired this in.

**AI-01 is the real work.** BoardSmith's `AIController` handles AI players in simultaneous action steps by finding the first non-completed AI player and making one move at a time via `checkAndPlay()`. After each move, `#scheduleAICheck()` is called again. This means AI players in a `simultaneousActionStep` naturally interleave -- each AI player submits one action, then the next AI player gets a turn, round-robin. However, there is NO batching logic: AI rebels do not "all submit first actions, then resolve, then all submit second actions." The current behavior is serial: one AI acts, flow re-evaluates, next AI acts, etc.

**Primary recommendation:** FLOW-05 needs verification only (already implemented). AI-01 requires designing a batching mechanism where AI rebels coordinate their action submissions within the simultaneous step to ensure all first actions complete before any second actions begin.

## Standard Stack

No new libraries needed. This phase works entirely within existing code:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| boardsmith | current | Flow engine, AIController, simultaneousActionStep | Framework |
| vitest | current | Testing | Existing test framework |

## Architecture Patterns

### Pattern 1: BoardSmith AIController Flow (Current Behavior)

**What:** The `AIController.checkAndPlay()` method in `node_modules/boardsmith/src/session/ai-controller.ts` handles AI turns. For simultaneous steps, it iterates `flowState.awaitingPlayers` and finds the first non-completed AI player with available actions (lines 90-98). It makes ONE move, then `#scheduleAICheck()` reschedules itself via `setImmediate`/`setTimeout(0)`.

**Key insight:** The engine does NOT distinguish between "action 1" and "action 2" for a player. It simply checks `playerDone` and `availableActions` after each action. There is no concept of "action rounds" built into BoardSmith.

**Implication for AI batching:** Batching must be implemented at the MERC game level, not the engine level. The engine's `simultaneousActionStep` treats each action submission independently.

### Pattern 2: simultaneousActionStep Completion Logic

**What:** In `engine.ts` line 1060-1133, `executeSimultaneousActionStep` builds `awaitingPlayers` for each player that isn't skipped/done. In `resumeSimultaneousAction` (line 301-385), after each action:
1. Checks `playerDone` for the acting player
2. Re-evaluates available actions
3. Auto-completes players with no available actions
4. Checks `allDone` for global completion

**Key insight:** `allDone` can break the step early. The rebel-actions step already uses `allDone` to break for combat resolution (line 728-737). This same mechanism could be used for AI batching.

### Pattern 3: How Dictator Turn Already Uses Shared Combat Flow

The dictator turn (`eachPlayer` block starting at line 749) already uses `combatResolutionFlow()` at three points:
1. **After tactics card play** (line 830): `combatResolutionFlow(game, 'tactics-combat')` -- handles combat from Fodder and similar cards
2. **During MERC actions** (line 872): `combatResolutionFlow(game, 'dictator-combat')` -- handles combat from dictator MERC moves
3. **After dictator ability** (line 958): `combatResolutionFlow(game, 'kim-militia-combat')` -- handles combat from Kim's militia placement

Each uses its own prefix for unique loop names, exactly matching the Phase 51 pattern.

### Pattern 4: AI Rebel Action Batching (Proposed)

**Problem:** In a game with 2 AI rebels, the current flow allows Rebel 1 to submit action 1 AND action 2 before Rebel 2 submits anything (since `AIController` just picks the first available AI player).

**Approach options:**

**Option A - Game-level action counter tracking:**
Add a `rebelActionRound` counter to `MERCGame`. In the `simultaneousActionStep`'s action conditions, gate second actions until all rebels have used their first. AI rebels would naturally respect this because actions wouldn't be available.

**Option B - Custom AI orchestration in MERC:**
Override/extend the AI decision layer to coordinate rebel batching. After all AI rebels submit one action, a flag allows the next round.

**Option A is strongly preferred** because it works through the existing action condition system and doesn't require modifying BoardSmith internals. It also naturally handles mixed human+AI games: humans can submit actions freely, but the action conditions would ensure the game-level invariant holds.

### Anti-Patterns to Avoid
- **Modifying BoardSmith's AIController:** The engine's AI handling is generic. Batching logic belongs in MERC's game layer.
- **Using `allDone` for batching:** `allDone` breaks the entire simultaneous step, not just one round. Would need to re-enter the step.
- **Relying on AI execution order:** The `AIController` picks the first non-completed player, but timing is non-deterministic due to async scheduling.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Combat resolution in dictator turn | Inline combat loops | `combatResolutionFlow(game, prefix)` | Already extracted in Phase 51, already wired in |
| AI player detection in simultaneous steps | Custom AI player finding | BoardSmith's `flowState.awaitingPlayers` | Engine handles this correctly |
| Action availability gating | Manual per-player action locks | Action `condition` functions | Standard pattern, works with both human and AI |

## Common Pitfalls

### Pitfall 1: Assuming FLOW-05 Needs Work
**What goes wrong:** Spending time refactoring something already done
**Why it happens:** The phase description says "refactor dictator turn to use shared combat sub-flow" but Phase 51 already did this
**How to avoid:** Verify the three `combatResolutionFlow()` calls in the dictator turn exist; write verification tests only
**Warning signs:** Looking for inline combat code in dictator turn and not finding any

### Pitfall 2: AI Batching Breaking Human Players
**What goes wrong:** Action gating for AI batching accidentally blocks human players from submitting freely
**Why it happens:** Using a global flag that affects all players, not just AI
**How to avoid:** Action conditions should only enforce batching constraints on AI players, OR enforce for all players (which is actually the correct game behavior -- all rebels should act in rounds)
**Warning signs:** Human player has no available actions during their simultaneous turn

### Pitfall 3: Action Round Tracking Desync
**What goes wrong:** The action round counter gets out of sync after combat interruptions
**Why it happens:** Combat breaks out of the simultaneous step via `allDone`, and when re-entering, the round counter is stale
**How to avoid:** Reset action round tracking at the start of each simultaneous step iteration (the outer `rebel-phase` loop re-enters the simultaneous step)
**Warning signs:** AI players stuck or skipping actions after combat resolution

### Pitfall 4: Mixed Game Edge Cases
**What goes wrong:** A game with 1 human + 2 AI rebels has the human waiting for AI to "catch up" or AI waiting for human
**Why it happens:** Batching assumes all players submit at similar rates
**How to avoid:** Let humans submit freely; only use batching to control AI submission order. OR, accept that batching applies to all players (game design decision -- per the requirements, "all AI rebels submit first actions, those resolve, then all submit second actions")
**Warning signs:** Test passes with all-AI but fails with mixed players

### Pitfall 5: endTurn Action and Batching
**What goes wrong:** An AI rebel ends their turn (all MERCs done) but the batching system waits for their "second action"
**Why it happens:** `endTurn` marks a player as done, but batching counter expects another action
**How to avoid:** `playerDone` already handles this -- treat endTurn/no-actions-remaining as completing all rounds
**Warning signs:** Game hangs waiting for a player who already ended their turn

## Code Examples

### Current Dictator Combat Resolution (Already Using Shared Sub-Flow)

```typescript
// flow.ts lines 830, 872, 958 - already extracted
// After tactics card
combatResolutionFlow(game, 'tactics-combat'),

// During dictator MERC actions loop
combatResolutionFlow(game, 'dictator-combat'),

// After Kim militia placement
combatResolutionFlow(game, 'kim-militia-combat'),
```

### BoardSmith AI Controller - How It Finds AI Players in Simultaneous Steps

```typescript
// node_modules/boardsmith/src/session/ai-controller.ts lines 89-98
if (flowState.awaitingPlayers && flowState.awaitingPlayers.length > 0) {
  for (const playerState of flowState.awaitingPlayers) {
    if (!playerState.completed &&
        playerState.availableActions.length > 0 &&
        this.#aiPlayers.has(playerState.playerIndex)) {
      aiPlayer = playerState.playerIndex;
      break;  // Takes FIRST available AI player -- no round-robin
    }
  }
}
```

### Proposed Action Round Tracking Pattern

```typescript
// In MERCGame class
rebelActionRound: number = 0;  // Tracks current "round" of rebel actions
rebelActionsThisRound: Map<number, number> = new Map();  // seat -> actions taken this round

// In action conditions for rebel actions (move, explore, train, etc.)
condition: ({ game, player }) => {
  // Only enforce batching during simultaneous rebel play
  if (!game.rebelActionBatchingActive) return true;

  const actionsThisRound = game.rebelActionsThisRound.get(player.seat) ?? 0;
  // Player has already taken their action for this round
  // Wait for all other rebels to catch up
  if (actionsThisRound > game.rebelActionRound) return false;
  return true;
}
```

### Test Pattern from Phase 53 (GameRunner-based)

```typescript
// From combat-barriers.test.ts - pattern for flow interaction testing
import { GameRunner } from 'boardsmith/runtime';

function getCurrentAction(flowState: any) {
  if (flowState.awaitingPlayers && flowState.awaitingPlayers.length > 0) {
    const firstAwaiting = flowState.awaitingPlayers.find(
      (p: any) => !p.completed && p.availableActions.length > 0
    );
    if (!firstAwaiting) return null;
    return { currentPlayer: firstAwaiting.playerIndex, available: firstAwaiting.availableActions };
  }
  if (flowState.currentPlayer !== undefined && flowState.availableActions) {
    return { currentPlayer: flowState.currentPlayer, available: flowState.availableActions };
  }
  return null;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline combat in dictator turn | `combatResolutionFlow(game, prefix)` | Phase 51 | Already done -- 3 call sites in dictator turn |
| No rebel action batching | N/A (this phase implements it) | Phase 54 | AI rebels will submit in coordinated rounds |

## Open Questions

1. **Should batching apply to ALL players or just AI?**
   - What we know: Requirements say "AI rebel players batch actions by action number." Mixed games should "work correctly with AI batching inside the simultaneous step."
   - What's unclear: Should human players also be constrained to act in rounds? Or should they submit freely while only AI is batched?
   - Recommendation: Start with AI-only batching (less disruptive to human UX). If the game design requires all players to act in rounds, that's a separate design decision. The requirements specifically call out "AI rebel players."

2. **What constitutes "first action" vs "second action"?**
   - What we know: Each MERC has 2 actions per day. But a player may have 2-3 MERCs, each with 2 actions.
   - What's unclear: Does "first action" mean the first action of ANY merc, or the first action of EACH merc?
   - Recommendation: Interpret as "each rebel player submits one action (for any of their MERCs), then all resolve, then each submits next action." This matches the requirement text: "all AI rebels submit first actions, those resolve, then all submit second actions."

3. **How does FLOW-05 verification differ from existing Phase 51 tests?**
   - What we know: Phase 51 extracted combatResolutionFlow and wired it into all 4 call sites including the 3 dictator ones.
   - What's unclear: Whether Phase 51 tests specifically verify the dictator call sites.
   - Recommendation: Write focused verification tests that dictator-triggered combat goes through the shared sub-flow (e.g., tactics card combat, dictator MERC move combat, Kim militia combat).

## Sources

### Primary (HIGH confidence)
- `src/rules/flow.ts` - Direct code inspection of dictator turn and combatResolutionFlow usage
- `src/rules/game.ts` - MERCPlayer class, isAI flag, game structure
- `src/rules/ai-executor.ts` - Current AI dictator execution logic
- `node_modules/boardsmith/src/engine/flow/engine.ts` - Flow engine simultaneous step handling
- `node_modules/boardsmith/src/engine/flow/builders.ts` - simultaneousActionStep API
- `node_modules/boardsmith/src/session/ai-controller.ts` - AI player move selection in simultaneous steps
- `node_modules/boardsmith/src/session/game-session.ts` - AI scheduling and execution loop

### Secondary (MEDIUM confidence)
- `tests/combat-barriers.test.ts` - Test patterns for flow interaction testing

## Metadata

**Confidence breakdown:**
- FLOW-05 status: HIGH - Direct code inspection confirms already implemented
- AI simultaneous behavior: HIGH - Read the engine source code directly
- AI batching approach: MEDIUM - Proposed pattern is sound but untested; the action-condition gating approach needs validation
- Test patterns: HIGH - Based on actual existing test code from Phase 53

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable codebase, no expected engine changes)
