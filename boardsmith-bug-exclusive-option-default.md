# Bug: Exclusive player option default uses 0-indexed value compared against 1-indexed seat

## Summary

`WaitingRoom.vue:getExclusiveDefaultIndex()` returns a 0-indexed value, but it's compared against `slot.seat` which is 1-indexed. This causes the wrong player to appear selected in the lobby UI. Since the wrong radio button appears checked, clicking the correct player doesn't fire `@change`, so the server never receives the update.

## Steps to reproduce

1. Define an exclusive player option with `default: "last"` in `boardsmith.json`:
   ```json
   {
     "id": "role",
     "type": "exclusive",
     "default": "last",
     "label": "Dictator",
     "choices": [{ "value": "dictator", "label": "Dictator" }]
   }
   ```
2. Run `npx boardsmith dev --lobby` with 2 players (1 human, 1 bot)
3. In the lobby, observe which player has the exclusive radio button checked
4. Start the game and check which player actually received the exclusive option

## Expected behavior

- The radio button should be checked for Player 2 (the last player, seat 2)
- Player 2's `playerConfigs` should have `role: true`

## Actual behavior

- The radio button appears checked for Player 1 (seat 1)
- Player 2 never receives `role: true` in `playerConfigs`
- Clicking the Player 1 radio doesn't fire `@change` because it already appears checked
- The server-side default (`computeDefaultPlayerOptions`) correctly assigns to last player, but the UI shows the wrong player

## Root cause

In `WaitingRoom.vue:388-391`:

```javascript
function getExclusiveDefaultIndex(opt: ExclusivePlayerOption): number {
  if (opt.default === 'first' || opt.default === undefined) return 0;
  if (opt.default === 'last') return props.lobby.slots.length - 1;
  return opt.default;
}
```

This returns a **0-indexed** value (`slots.length - 1`). But it's used in `slotHasExclusiveOption` (line 382) as:

```javascript
const defaultIndex = getExclusiveDefaultIndex(opt);
return slotPosition === defaultIndex;
```

Where `slotPosition` is `slot.seat`, which is **1-indexed**.

With 2 players and `default: "last"`:
- `getExclusiveDefaultIndex` returns `2 - 1 = 1` (0-indexed, meaning seat 2)
- Seat 1: `1 === 1` → `true` (WRONG — seat 1 is not last)
- Seat 2: `2 === 1` → `false` (WRONG — seat 2 IS last)

The same off-by-one affects `default: "first"`:
- Returns `0`, but no seat has value `0`, so no radio appears checked for any player

And `default: "last"` with 3 players:
- Returns `2`, matches seat 2 instead of seat 3

## Secondary issue

`computeDefaultPlayerOptions` in `lobby-manager.ts:1088-1099` only runs for seat 1 (the host) during initial lobby creation (`game-session.ts:330-338`). AI slots created at lobby initialization time don't get default player options computed. This means the AI slot never receives `role: true` even though it should be the default dictator.

The `toggleSlotType` path (line 568-569) does compute defaults for AI slots, but only when a slot is toggled — not during initial creation.

## Suggested fix

In `getExclusiveDefaultIndex`, return 1-indexed seat numbers to match `slot.seat`:

```javascript
function getExclusiveDefaultIndex(opt: ExclusivePlayerOption): number {
  if (opt.default === 'first' || opt.default === undefined) return 1;
  if (opt.default === 'last') return props.lobby.slots.length;
  return typeof opt.default === 'number' ? opt.default + 1 : opt.default;
}
```

For the secondary issue, compute default player options for all slots (including AI) during initial lobby creation in `game-session.ts`, not just seat 1.
