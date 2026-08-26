# Bug: Always-live dev host omits role-based `playerConfigs` from the start op, breaking seat→role games (MERC dictator)

> **RESOLVED UPSTREAM (verified 2026-08-26).** BoardSmith's `MultiplayerHost` now
> builds `playerConfigs` into `startGameOptions` — `src/cli/dev-host/multiplayer-host.ts`
> emits a per-seat `{ name, isBot, botLevel, ...playerOptions }` array sized off
> `playerCount`, and its own comment names this exact failure chain ("the game
> treats the bot seat as a human ... MCTS later finds 'No available moves'").
> A regression test citing MERC by name holds it closed
> (`src/cli/dev-host/multiplayer-host.test.ts`, "passes playerConfigs with per-seat
> isBot to the game"), and CR-01 additionally keeps `playerOptions`/`playerIsBot`/
> `playerConfigs` the same length when a preset changes the player count.
>
> **The evidence below is left exactly as filed and is PRE-RENAME.** It quotes the
> engine as it was on the day, so `playerIsAI`, `aiSeats`, `aiLevel`, `handleAITurn`
> and `runAITurns()` appear throughout. The automaton has since been renamed from AI
> to BOT everywhere (ShufflewickPub #28, engine contract r16): those are now
> `playerIsBot`, `botSeats`, `botLevel`, `handleBotTurn` and `runBotTurns()`. Read
> the names below as history, never as current API — rewriting them would falsify
> the report's account of what was actually observed.
>
> The **Secondary findings** section (zone visibility dropped by snapshot/restore)
> was NOT part of this fix and has not been re-verified against r16.

## Summary

The always-live dev host (`MultiplayerHost`) auto-seats the first arriving dev and immediately starts the game, but the `startGameOptions` it builds carry only `playerIsAI` and per-seat colors — **not** the role-based `playerConfigs` that role games depend on. In MERC the dictator seat is determined from `options.playerConfigs` (`role: true` / `isDictator`). With no `playerConfigs`, MERC cannot assign the dictator role: the dictator player is left unconfigured (`combatantName === undefined`), the human who intended to be the dictator is seated as a rebel, and the dictator seat resolves to an AI seat. When that AI dictator's turn arrives, the MCTS bot finds no legal move, throws `No available moves`, and `runAITurns()` never yields control back to the client — so the human's action panel and game area render blank.

Net effect in MERC: **a human cannot be the dictator under `boardsmith dev`, and the dictator's turn hangs the game with a blank screen.**

## Environment

- boardsmith dev host running from source at `/Users/jtsmith/BoardSmith` (global `boardsmith` CLI is symlinked there)
- MERC app engine: vendored `boardsmith-0.0.1-undofix.tgz`
- Regressed by the always-live refactor:
  - `763cae0 feat(dev): always-live game — dev auto-seats; seat-picker only for joiners`
  - `90941c9 fix(dev): drive opening AI turns + wire the --ai flag`

## Steps to reproduce

1. Run `npm run dev` (`boardsmith dev`) on MERC (1 dictator + rebels, role-based seating).
2. Open the game as the first/only dev. You are auto-seated and the game starts immediately (no seat-picker).
3. Advance to the dictator's turn.

## Expected behavior

- The dev can be seated into the **dictator role**, and MERC receives `playerConfigs` with the dictator seat marked (`role: true` / `isDictator`).
- The dictator player is configured (has a dictator combatant; `combatantName` is defined).
- On the dictator's turn, `playTactics` / `reinforce` are offered and the action panel renders.

## Actual behavior

- The Day 1 summary logs `Dictator: Name: undefined` — the dictator player was never configured.
- The human is effectively a rebel; the dictator seat is an (unconfigured) AI seat.
- On the dictator turn the server logs:
  ```
  [boardsmith dev] server_request 'action' failed: Error: No available moves
      at _MCTSBot.playSingle (.boardsmith/runtime-bundle.mjs …)
      at _MCTSBot.play (…)
      at handleAITurn (…)
      at SnapshotSessionHost.runAITurns (src/session/snapshot-session-host.ts:77)
  ```
- The client shows nothing: no action-panel buttons, empty game area. (`DictatorPanel`'s `playTactics` button is gated on `tacticsHand.length > 0`, and the dictator's serialized hand is empty — see secondary findings.)

## Root cause

`src/cli/dev-host/multiplayer-host.ts` (`startGame`, ~lines 256–276):

```js
const humanSeats = new Set(
  [...this.seats.values()].filter((s) => s.clientId).map((s) => s.seat),
);
this.aiSeats = [];
for (let seat = 1; seat <= playerCount; seat++) {
  if (!humanSeats.has(seat)) this.aiSeats.push({ seat, level: this.opts.aiLevel });
}

const startGameOptions = {
  playerCount,
  seed: (this.opts.makeSeed ?? defaultSeed)(),
  ...this.opts.baseGameOptions,
  playerOptions: this.buildPerSeatOptions(),                 // colors only
  playerIsAI: Array.from({ length: playerCount }, (_, i) => !humanSeats.has(i + 1)),
};
```

`startGameOptions` has no `playerConfigs`, and the auto-seat branch (~lines 123–130) seats the dev into "the first open seat (preferring one not in `--ai`)" with **no notion of role**. The pre-always-live lobby/seat-picker is what used to collect each seat's exclusive role option into `playerConfigs`; auto-seat skips it.

MERC consumes role config in `src/rules/game.ts` (~lines 808–829), looking for the dictator via `options.playerConfigs` (`role: true`, legacy `isDictator`). With `playerConfigs` absent it falls through to defaults, leaving the dictator player unconfigured (`combatantName === undefined`).

The AI pump then drives the dictator seat: `SnapshotSessionHost.runAITurns()` → `executeOp({type:'aiTurn', seats: aiSeats})` → `handleAITurn` → `MCTSBot`. The bot has no enumerable move for the unconfigured/role-less dictator step and throws `No available moves`; the pump aborts mid-turn and control is never returned to the client.

## Suggested fix

The always-live host must carry seat→role configuration into the start op the same way the seat-picker lobby did:

- Build `playerConfigs` for `startGameOptions` from each seat's exclusive/role options (and AI flags), so role games receive the dictator assignment. `playerIsAI` alone is insufficient for games where a *specific* seat must hold a role.
- For a single auto-seated dev in a role game, either let the dev pick the role (mini seat-picker), or honor a default/`--ai` so the human can claim the role seat and the bot takes the others.
- Defensive: if `runAITurns()` / `handleAITurn` hits `No available moves`, surface a clear host error (which seat/step) instead of leaving the client hung.

## Secondary findings (same divergence, lower priority)

While tracing this, the dictator's player view also showed a **stale/divergent serialized state** vs. the flow's live game:

- The serialized `TacticsHand` had 0 children while `game.dictatorPlayer.tacticsHand.count() > 0` on the flow's instance (cards still under `TacticsDeck` in the view — i.e. pre-draw), and
- The serialized `TacticsDeck` cards were **visible** (`__hidden` not set) despite setup calling `tacticsDeck.contentsHidden()`.

`contentsHidden()` sets `_zoneVisibility`, which is **not serialized** (`GameElement.toJSON` skips `_`-prefixed keys and only emits element-level `visibility` for explicit `_visibility`). So any snapshot/restore round-trip silently drops zone visibility. Worth confirming whether the snapshot-session-host's per-op serialize/restore is the source of the view↔flow divergence, and whether zone visibility should be persisted.

## Repro/diagnostic notes

- `available` in `actionStep` is condition-filtered via `game.getAvailableActions(player)` (`engine/flow/engine.ts:1217,1231`), so a `playTactics` entry in `availableActions` does mean its condition (`tacticsHand.count() > 0`) passed on the flow instance — confirming the view/flow divergence.
- `mcts-clone.test.ts > should clone correctly after playerConfigs is stripped (HMR scenario)` passes (snapshot via `getConstructorOptions()` preserves `playerConfigs`), so the divergence is specific to the **live always-live host start/seat path**, not fresh construction.
