# Feature request: thread the player type through `ActionContext`, like `ctx.game`

## Summary

`Action.create<MyGame>('name')` types `ctx.game` in every callback, and the accumulated selection args type `args` in `execute`. `ctx.player` is left as bare `Player`, so every handler that touches a game-specific player property still has to cast. That is the last systematic cast in an otherwise cast-free action file.

## Current behaviour

`src/engine/action/types.ts:414-421`:

```ts
export interface ActionContext<G extends Game = Game> {
  /** The game instance, typed as the concrete game class. */
  game: G;
  /** The player taking the action */
  player: Player;          // <- not derived from G
  args: Record<string, unknown>;
}
```

So even with everything declared correctly:

```ts
class MERCGame extends Game<MERCGame, MERCPlayer> {
  static PlayerClass = MERCPlayer;
}

Action.create<MERCGame>('hireMerc')
  .condition({
    'can hire': (ctx) => ctx.player.canHireMerc(ctx.game),
    //                       ^^^^^^^^^^ Property 'canHireMerc' does not exist on type 'Player<any, any>'
  })
```

`ctx.game` is `MERCGame`. `ctx.player` is `Player<any, any>`.

## Evidence from a real migration

Adopting the typed builder across MERC (88 `Action.create` sites, ~11,000 lines of action code) let the compiler prove **106** casts redundant — every `args.x as Sector | Squad | CombatantModel | Equipment | TacticsCard | string` and every runtime `asSector(args.x)`-style guard on an arg.

It removed **zero** `ctx.player as MERCPlayer` casts. There are 52 of those left across `src/rules/`, and no way to remove them without changing the framework.

## Suggested fix

Derive the player type from the game type parameter:

```ts
export interface ActionContext<G extends Game = Game> {
  game: G;
  player: G extends Game<any, infer P> ? P : Player;
  args: Record<string, unknown>;
}
```

`Game<G, P>` already carries `P`, and `static PlayerClass` already ties it to a concrete class at runtime, so the information is present — it just is not propagated.

## Impact

`ctx.player as MyPlayer` is the single most repeated cast in an action file. It is also the one most likely to be *wrong* and go unnoticed, because it is a downcast the compiler cannot check: a condition that receives a spectator, or a game that later gains a second player class, would fail at runtime with the cast silently in place. Typing it would turn that into a compile error, which is the same argument that motivated typing `ctx.game` and `args`.
