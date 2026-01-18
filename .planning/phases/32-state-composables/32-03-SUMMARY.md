# Plan 32-03 Summary: Create useSquadState Composable

## Completed

Created `src/ui/composables/useSquadState.ts` (426 lines) extracting squad-related state derivation from GameBoard.vue.

## What Was Built

### Exported Types

- `SquadState` - Interface for squad data (squadId, isPrimary, isBase?, sectorId, sectorName?, mercs)
- `MercWithLocation` - Interface for merc data with location and player info
- `SquadStateReturn` - Return type containing all computed refs

### Exported Function

`useSquadState(getGameView, playerPosition, currentPlayerIsDictator, sectors, players)` returns:

| Computed | Description |
|----------|-------------|
| `primarySquad` | Current rebel player's primary squad |
| `secondarySquad` | Current rebel player's secondary squad |
| `dictatorPrimarySquad` | Dictator's primary squad with dictator card |
| `dictatorSecondarySquad` | Dictator's secondary squad |
| `dictatorBaseSquad` | Dictator's base/third squad |
| `dictatorSquad` | Alias for dictatorPrimarySquad |
| `allMercs` | All living MERCs with location/color for control map |

### Internal Helpers

- `getSquadPlayerPosition(squad)` - Extract player position from squad via multiple attribute patterns
- `buildDictatorSquad(squad, isPrimary)` - Build squad state including dictator card when in play

## Key Patterns

1. **Dictator card mapping**: When dictator combatant is in play, it's included in the squad and mapped to merc-like format with `isDictator: true` flag and prefixed combatantId
2. **Dead MERC filtering**: Uses `isMercDead()` helper from useGameViewHelpers to filter out dead combatants
3. **Sector name lookup**: Looks up sector names from the passed `sectors` computed ref
4. **Player color lookup**: Uses `players` computed ref for allMercs player color assignment

## Dependencies

- `useGameViewHelpers` for tree traversal (findAllByClassName, getAttr, isMercDead)
- `Sector` type from useSectorState
- `Player` type from usePlayerState
- Receives `currentPlayerIsDictator` and `sectors` as computed refs (circular dep avoidance)

## Commits

1. `feat(32-03): create useSquadState composable` (+426 lines)

## Must Haves Verification

- [x] `primarySquad` returns rebel player's primary squad
- [x] `secondarySquad` returns rebel player's secondary squad
- [x] `dictatorPrimarySquad` includes dictator card when in play
- [x] `dictatorSecondarySquad` returns dictator's secondary squad
- [x] `dictatorBaseSquad` returns dictator's base/third squad
- [x] `dictatorSquad` returns whichever dictator squad is relevant
- [x] `allMercs` returns all living MERCs across all squads
- [x] Dead MERCs are filtered out using isMercDead
- [x] Dictator card mapped to merc-like format when included
- [x] TypeScript types exported for SquadState
