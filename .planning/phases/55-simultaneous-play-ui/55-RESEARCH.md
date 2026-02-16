# Phase 55: Simultaneous Play UI - Research

**Researched:** 2026-02-16
**Domain:** Vue 3 UI components for BoardSmith simultaneous action step visualization
**Confidence:** HIGH

## Summary

The BoardSmith engine and GameShell already have substantial infrastructure for simultaneous play UI. The `PlayersPanel` component already accepts `awaitingPlayerSeats` prop and highlights all active players. The `ActionPanel` already accepts `awaitingPlayers` prop and renders a "Waiting for [names]" message when a player has finished their turn. GameShell already computes both `awaitingPlayerSeats` and `awaitingPlayerNames` from `flowState.awaitingPlayers` and passes them to these components.

The key finding is that **most of the plumbing already exists** -- the research question is what still needs to be wired up at the MERC GameTable level, and what new visuals are needed for combat barrier transitions.

**Primary recommendation:** This phase is primarily about wiring existing BoardSmith props through the MERC UI layer and adding a combat barrier transition overlay.

## What Already Exists (HIGH confidence)

### PlayersPanel (BoardSmith component)

**File:** `node_modules/boardsmith/src/ui/components/PlayersPanel.vue`

Already has:
- `awaitingPlayerSeats?: number[]` prop
- `isPlayerActive(seat)` function that returns true for both `currentPlayerSeat` matches AND `awaitingPlayerSeats` matches
- Active players get `.current` CSS class (blue glow background) and pulsing turn indicator dot
- **Already wired in GameShell** -- `awaitingPlayerSeats` is computed and passed to PlayersPanel

**Status for UI-01:** Already working. When `flowState.awaitingPlayers` has entries, all non-completed players show as active in PlayersPanel. No MERC-side work needed.

### ActionPanel (BoardSmith auto-UI component)

**File:** `node_modules/boardsmith/src/ui/components/auto-ui/ActionPanel.vue`

Already has:
- `awaitingPlayers?: Array<{ seat: number; name: string; color?: string }>` prop
- When `!isMyTurn`, renders a `.waiting-message` div with three template variants:
  1. If `awaitingPlayers?.length` -- shows "Waiting for [Name1], [Name2]" with colored player names
  2. If `latestMessage` -- shows "[CurrentPlayerName]: [message]"
  3. Else -- shows "It is [PlayerName]'s turn"
- **Already wired in GameShell** -- `awaitingPlayerNames` is computed and passed as `awaitingPlayers` prop

**Status for UI-02:** Already working. When a player finishes during simultaneous step, `isMyTurn` becomes false (because `isPlayersTurn` checks `completed` flag), and ActionPanel shows the awaiting players who haven't finished.

### GameShell (BoardSmith orchestrator)

**File:** `node_modules/boardsmith/src/ui/components/GameShell.vue`

Already computes:
```typescript
// Available actions -- checks awaitingPlayers first for simultaneous steps
const availableActions = computed(() => {
  const flowState = state.value?.flowState as any;
  if (flowState.awaitingPlayers?.length > 0) {
    const myPlayerState = flowState.awaitingPlayers.find(
      (p) => p.playerIndex === playerSeat.value
    );
    if (myPlayerState && !myPlayerState.completed) {
      return myPlayerState.availableActions || [];
    }
  }
  return flowState.availableActions || [];
});

// Awaiting seats for PlayersPanel
const awaitingPlayerSeats = computed(() => {
  return flowState.awaitingPlayers
    .filter((p) => !p.completed && p.availableActions.length > 0)
    .map((p) => p.playerIndex);
});

// Awaiting player info for ActionPanel
const awaitingPlayerNames = computed(() => {
  return flowState.awaitingPlayers
    .filter((p) => !p.completed && p.availableActions.length > 0)
    .map((p) => ({
      seat: p.playerIndex,
      name: player?.name || `Player ${p.playerIndex}`,
      color: player?.color,
    }));
});
```

### isMyTurn during Simultaneous Steps

**File:** `node_modules/boardsmith/src/session/utils.ts`

```typescript
function isPlayersTurn(flowState, playerPosition): boolean {
  if (flowState.awaitingPlayers?.length > 0) {
    const playerState = flowState.awaitingPlayers.find(p => p.playerIndex === playerPosition);
    return playerState ? !playerState.completed && playerState.availableActions.length > 0 : false;
  }
  return flowState.currentPlayer === playerPosition;
}
```

When a player completes their actions during a simultaneous step, `isMyTurn` becomes `false` for them immediately. This triggers ActionPanel to show the waiting message.

### FlowState.awaitingPlayers

**Type:** `PlayerAwaitingState[]` from `node_modules/boardsmith/src/engine/flow/types.ts`

```typescript
interface PlayerAwaitingState {
  playerIndex: number;
  availableActions: string[];
  completed: boolean;
}
```

This is exposed via `state.value?.flowState` in the client.

## What Needs to Be Built

### UI-01: Turn Indicator Shows All Active Rebels

**Status: Already handled by BoardSmith PlayersPanel.**

The PlayersPanel in GameShell already passes `awaitingPlayerSeats`. During a simultaneous step, all non-completed rebel players show with the active indicator. No MERC-side changes needed.

**Verification:** Needs manual testing to confirm the visual result is correct (all rebels lit up, not just one).

### UI-02: Waiting Message Shows Specific Players

**Status: Already handled by BoardSmith ActionPanel.**

The ActionPanel in GameShell already passes `awaitingPlayerNames`. When `isMyTurn` is false during a simultaneous step, the "Waiting for [Name1], [Name2]" message renders automatically.

**One edge case to consider:** When the current player finishes, the `awaitingPlayerNames` list should exclude the current player (since they're done). Looking at the computation, `awaitingPlayerNames` filters for `!p.completed` -- so a player who just finished WILL see the remaining players. This is correct behavior.

### UI-03: All Actions Visible to All Players in Real-Time

**This needs investigation.** Currently, the game view updates for all connected players via WebSocket when any player acts. The `useGame` composable in BoardSmith receives state updates in real-time. So when Player A moves a MERC, all other connected clients receive the updated game view.

**What already works:**
- All state mutations (movement, equipment, training) are reflected in the game view
- The MapGrid, SquadPanel, SectorPanel all render from `gameView` which updates for everyone
- Animation events (combat panels, equip sessions, mortar strikes) are broadcast to all clients

**What may need work:**
- During simultaneous play, actions resolve immediately (no animation queue between players)
- There's no explicit "Player A just moved Haarg to Sector 3" notification for other players
- The game view simply updates -- other players see the map/squads change

**Key question:** Does "all actions visible to all players" mean:
  (a) The game state updates are visible (map changes, squad changes) -- **already works**
  (b) There should be explicit toast/notification for each action -- **needs building**
  (c) Animation events should play for all players -- **partially works** (combat animations broadcast, but movement doesn't have animation events)

Based on the success criteria "All player actions are visible to all players (including dictator) as they resolve in real-time", this likely means (a) -- the game state is shared and renders update. Movement on the map, equipment changes in squads -- all visible through the shared game view.

### UI-04: Combat Barrier Transition Visual

**This needs to be built.** When a combat barrier activates during simultaneous play (via `allDone` returning true because `pendingCombat !== null` or `activeCombat !== null`), the simultaneous step exits, combat resolves, then re-enters the simultaneous step.

**Current combat panel behavior:**
- CombatPanel appears when `combatSnapshot` ref is set (via `combat-panel` animation event)
- When `combat-panel` animation event fires, `combatSnapshot.value = event.data`
- `hasActiveCombat` computed shows CombatPanel, hiding SectorPanel/HiringPhase

**What happens during barrier transition:**
1. A rebel's action triggers combat (pendingCombat set)
2. `allDone` returns true, simultaneous step exits
3. Flow enters combat resolution sub-flow
4. Combat animation events fire (`combat-panel`, `combat-roll`, etc.)
5. After combat, flow re-enters the simultaneous step loop

**What's missing:** There's no explicit "Combat barrier activated -- simultaneous actions paused" message. The combat panel just appears. Players who were in the middle of their turns may not understand why their actions suddenly stopped.

**Recommendation:** Use a GameOverlay (already used for tactics banners and game over) to show a brief "Combat! Actions paused while combat resolves" banner before the combat panel appears. This could be:
- A new animation event type (e.g., `combat-barrier`) fired by the flow
- Or detected client-side when `isMyTurn` transitions from true to false AND `combatSnapshot` appears

## Architecture Patterns

### How Data Flows for Simultaneous Steps

```
Server (flow engine)
  └── simultaneousActionStep sets awaitingPlayers[] in FlowState
       ├── Each player gets their own available actions
       ├── completed flag tracks per-player progress
       └── allDone/playerDone trigger step completion

  ↓ WebSocket state broadcast

Client (GameShell)
  ├── state.value.flowState.awaitingPlayers  (raw flow state)
  ├── availableActions computed  (per-player, from awaitingPlayers)
  ├── isMyTurn computed  (true if not completed and has actions)
  ├── awaitingPlayerSeats computed  → PlayersPanel
  └── awaitingPlayerNames computed  → ActionPanel

  ↓ Props

PlayersPanel
  └── Shows all active players with indicators

ActionPanel
  ├── isMyTurn=true  → Shows action buttons
  └── isMyTurn=false → Shows "Waiting for [names]"

GameTable
  ├── isMyTurn controls action availability
  └── Receives same gameView as all other clients (real-time)
```

### Combat Barrier Flow

```
simultaneousActionStep (rebel-actions)
  ├── Player A moves into enemy sector
  ├── pendingCombat set by move action
  ├── allDone() → true (barrier condition)
  └── Step exits

combatResolutionFlow
  ├── Combat panel animation events
  ├── clearCombatAnimations action step
  └── Returns

loop re-evaluates while condition
  └── Re-enters simultaneousActionStep
       └── resetRebelBatching() called before
```

### Existing Animation/Overlay Patterns

For barrier transitions, the codebase uses these patterns:

1. **GameOverlay component** (from boardsmith/ui) -- used for game over, tactics banners
   - `<GameOverlay :active="condition">` with content inside
   - Backdrops with configurable opacity

2. **Animation events** -- registered in GameTable, async handlers
   - `animationEvents.registerHandler('event-type', async (event) => { ... })`
   - Sleep-based timing, skip support

3. **Tactics card banner pattern** (in GameTable) -- closest to what's needed:
   ```vue
   <GameOverlay :active="!!activeTacticEvent" :backdrop-opacity="0.7">
     <div class="tactics-banner-content">
       <div class="tactics-banner-label">Dictator Tactics</div>
       <div class="tactics-banner-name">{{ activeTacticEvent?.cardName }}</div>
     </div>
   </GameOverlay>
   ```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Turn indicator for multiple players | Custom indicator component | PlayersPanel `awaitingPlayerSeats` prop | Already built and wired in BoardSmith |
| Waiting message with player names | Custom waiting component | ActionPanel `awaitingPlayers` prop | Already built and wired in BoardSmith |
| Overlay for barrier transitions | Custom modal/dialog | GameOverlay component | Consistent with tactics banners, game over |
| Real-time state sync | Custom broadcast mechanism | BoardSmith WebSocket state sync | Game view already broadcasts to all clients |

## Common Pitfalls

### Pitfall 1: Trying to Wire PlayersPanel/ActionPanel Props in MERC Code
**What goes wrong:** MERC GameTable doesn't pass awaitingPlayerSeats to PlayersPanel because it's not used there.
**Why it happens:** PlayersPanel and ActionPanel are rendered by GameShell, not GameTable.
**How to avoid:** Recognize that GameShell already handles this. No MERC-side wiring needed for UI-01 and UI-02.

### Pitfall 2: Confusing isMyTurn During Simultaneous Steps
**What goes wrong:** Code assumes isMyTurn is only true for one player at a time.
**Why it happens:** Normal turn-based flow has one current player.
**How to avoid:** isMyTurn can be true for multiple players simultaneously. The flow engine handles per-player action tracking via awaitingPlayers.

### Pitfall 3: Combat Barrier Detection on Client Side
**What goes wrong:** Trying to detect when a combat barrier activates purely from client state changes.
**Why it happens:** There's no explicit "barrier activated" event; the simultaneous step just ends.
**How to avoid:** Either add a new animation event from the server (in flow.ts) when combat barriers fire, or detect the transition client-side by watching for `isMyTurn` going false while `combatSnapshot` appears.

### Pitfall 4: Stale awaitingPlayers After Step Exits
**What goes wrong:** awaitingPlayers array clears when the simultaneous step exits (e.g., for combat barrier). The UI momentarily shows no active players.
**Why it happens:** Flow engine clears awaitingPlayers when step completes.
**How to avoid:** The combat panel appearing is the visual cue during this gap. If needed, add a brief transition overlay before combat panel.

## Code Examples

### GameShell Already Passes Simultaneous Props

From `GameShell.vue` (lines 1117-1127):
```vue
<PlayersPanel
  :players="players"
  :player-seat="playerSeat"
  :current-player-seat="state?.state.currentPlayer"
  :color-selection-enabled="colorSelectionEnabled"
  :awaiting-player-seats="awaitingPlayerSeats"
>
```

From `GameShell.vue` (lines 1178-1192):
```vue
<ActionPanel
  :available-actions="isViewingHistory ? [] : availableActions"
  :action-metadata="isViewingHistory ? {} : actionMetadata"
  :player-seat="playerSeat"
  :is-my-turn="isMyTurn && !isViewingHistory"
  :awaiting-players="awaitingPlayerNames"
  ...
/>
```

### Tactics Banner Pattern (for Combat Barrier Overlay)

From `GameTable.vue` (lines 1391-1399):
```vue
<GameOverlay :active="!!activeTacticEvent" :backdrop-opacity="0.7">
  <div class="tactics-banner-content">
    <div class="tactics-banner-label">Dictator Tactics</div>
    <div class="tactics-banner-name">{{ activeTacticEvent?.cardName }}</div>
    <div v-if="activeTacticEvent?.data?.description" class="tactics-banner-description">
      {{ activeTacticEvent.data.description }}
    </div>
  </div>
</GameOverlay>
```

### FlowState awaitingPlayers Structure

From server state (what clients receive):
```json
{
  "flowState": {
    "awaitingInput": true,
    "awaitingPlayers": [
      { "playerIndex": 2, "availableActions": ["move", "train", "endTurn"], "completed": false },
      { "playerIndex": 3, "availableActions": ["move", "explore", "endTurn"], "completed": false },
      { "playerIndex": 4, "availableActions": [], "completed": true }
    ]
  }
}
```

### Combat Barrier Conditions (from flow.ts lines 739-748)

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

## Detailed Requirement Analysis

### UI-01: Turn Indicator Shows All Active Rebels
**Verdict: Already implemented in BoardSmith.**
- PlayersPanel has `awaitingPlayerSeats` prop
- GameShell computes and passes it
- All non-completed players show with turn indicator dot and active background
- **Action needed: Verify with manual testing**

### UI-02: Waiting Message Shows Specific Players
**Verdict: Already implemented in BoardSmith.**
- ActionPanel has `awaitingPlayers` prop with name/color
- GameShell computes and passes it
- Shows "Waiting for [Name1], [Name2]" with colored names
- **Action needed: Verify with manual testing**

### UI-03: Actions Visible to All Players in Real-Time
**Verdict: Already works through game state sync.**
- WebSocket broadcasts state updates to all clients
- gameView is shared and renders update across all connected clients
- Map, squads, sectors all re-render when state changes
- **Action needed: Verify that during simultaneous step, Player A's actions cause immediate visual updates for Player B**

### UI-04: Combat Barrier Transition Visual
**Verdict: Needs to be built.**
- No existing transition/notification when combat barrier activates
- Combat panel just appears; players may not understand why actions paused
- **Build a brief overlay/banner before combat panel appears**
- Pattern: GameOverlay with "Combat detected -- actions paused" message

## Open Questions

1. **UI-03 granularity**: Does "visible to all players" require action-level notifications (e.g., "Player A moved Haarg to Alpha"), or is the game state updating sufficient? The success criteria says "as they resolve in real-time" which suggests the latter.

2. **Dictator during simultaneous step**: The dictator is not in the simultaneous step. They observe via the same WebSocket state sync. Do they need any special UI treatment, or is seeing the map update sufficient?

3. **Re-entry after combat barrier**: When the simultaneous step re-enters after combat resolution, do players who already finished their turn stay finished? Looking at the flow, `resetRebelBatching()` is called, and `playerDone` re-evaluates `actionsRemaining > 0`. So a player who ended their turn stays done. Only players with remaining actions re-enter.

## Sources

### Primary (HIGH confidence)
- `node_modules/boardsmith/src/ui/components/PlayersPanel.vue` -- turn indicator implementation
- `node_modules/boardsmith/src/ui/components/auto-ui/ActionPanel.vue` -- waiting message implementation
- `node_modules/boardsmith/src/ui/components/GameShell.vue` -- prop wiring, computed values
- `node_modules/boardsmith/src/session/utils.ts` -- isPlayersTurn logic
- `node_modules/boardsmith/src/engine/flow/types.ts` -- PlayerAwaitingState, FlowState types
- `node_modules/boardsmith/src/engine/flow/builders.ts` -- simultaneousActionStep API
- `src/rules/flow.ts` -- MERC simultaneous steps and barrier conditions
- `src/ui/components/GameTable.vue` -- MERC game board, combat panel, tactics banner pattern
- `src/ui/components/CombatPanel.vue` -- combat animation handling

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- reading actual source code, not external docs
- Architecture: HIGH -- traced full data flow from server to UI components
- Pitfalls: HIGH -- identified from actual code structure
- UI-04 approach: MEDIUM -- GameOverlay pattern is established, but exact implementation details TBD

**Research date:** 2026-02-16
**Valid until:** Stable -- based on codebase analysis, not external dependencies
