# Post-Mortem: Player Color Fallback Mismatch

**Date:** 2025-01-09
**Severity:** Medium (UI display bug, confusing but not blocking)
**Time to Resolution:** ~45 minutes

## Summary

MERCs appeared twice in the SectorPanel - once under "My Squad" with the wrong border color, and again under "Allies" with the correct color. The root cause was inconsistent fallback logic between two computed properties when player data wasn't found in the game tree.

## Symptoms

1. Player's own MERCs displayed in both "My Squad" and "Allies" sections
2. "My Squad" section had red borders instead of the player's actual color (green/teal)
3. "Allies" section showed the same MERCs with correct green borders

## Root Cause Chain

### 1. Player Data Not in Game Tree

`RebelPlayer` objects have the `playerColor` attribute, but they're stored in BoardSmith's base `Game.players` array - **not** in the game element tree that the UI can search with `findAllByClassName()`.

```typescript
// RebelPlayer is created with 'new', not 'this.create()'
const rebel = new RebelPlayer(position, name);
rebel.playerColor = 'green';  // Color is set here

// PlayerArea IS in the tree, but had no playerColor
this.create(PlayerArea, areaRef);  // No color passed!
```

### 2. UI Searched Wrong Element Type

The UI searched for `RebelPlayer`, `DictatorPlayer`, and `PlayerArea`:

```typescript
const rebelPlayers = findAllByClassName('RebelPlayer');     // Returns 0 - not in tree!
const dictatorPlayers = findAllByClassName('DictatorPlayer'); // Returns 0
const playerAreas = findAllByClassName('PlayerArea');         // Returns 1 - but no color
```

### 3. Inconsistent Fallbacks Masked the Bug

Two different computed properties used **different fallback strategies** when player color wasn't found:

```typescript
// currentPlayerColor - falls back to 'red'
const currentPlayerColor = computed(() => {
  const player = players.value.find(p => p.position === props.playerPosition);
  return player?.playerColor || 'red';  // <-- Always 'red' when not found
});

// allMercs - falls back to position-based array
playerColor = player?.playerColor ||
  ['red', 'blue', 'green', 'yellow', 'purple', 'orange'][playerPos] || 'red';
  // Position 2 -> 'green'
```

For player position 2:
- `currentPlayerColor` returned `'red'` (hardcoded fallback)
- `allMercs` returned `'green'` (position-based fallback)

### 4. The Mismatch Caused Duplicate Display

With `currentPlayerColor = 'red'` but mercs having `playerColor = 'green'`:

```typescript
// My MERCs filter: merc.playerColor === props.playerColor
// 'green' === 'red' -> FALSE, so MERCs don't appear in myMercsInSector

// Ally filter: merc.playerColor !== props.playerColor && !== 'dictator'
// 'green' !== 'red' && 'green' !== 'dictator' -> TRUE, MERCs appear as allies!
```

Meanwhile, `squadInSector` showed the MERCs from the squad object directly (not filtered by color), so they appeared there too.

## The Fix

1. Added `position` and `playerColor` attributes to `PlayerArea` class
2. Set these when creating the PlayerArea during game setup:

```typescript
this.create(PlayerArea, areaRef, { position, playerColor: rebel.playerColor });
```

3. Removed all fallbacks from UI - replaced with warnings:

```typescript
if (!player) {
  console.warn('[currentPlayerColor] No player found for position', props.playerPosition);
  return '';  // Empty string instead of 'red' fallback
}
```

## Recommendations for BoardSmith

### 1. Document Player Data Access Patterns

Game developers need clear guidance on how to access player data from the UI:
- What's in the game tree vs. Game.players array
- Whether to search by className or use BoardSmith's player API
- How player positions work (1-indexed)

### 2. Consider Exposing Players in Game Tree

If `RebelPlayer`/`DictatorPlayer` were in the searchable game tree (or had a dedicated accessor), UI code wouldn't need to hunt for player data in multiple places.

### 3. Warn Against Fallback Anti-Pattern

Fallbacks that silently provide default values are dangerous because:
- They mask bugs that would otherwise be obvious
- Different fallbacks in different places create subtle mismatches
- The "working" code gives false confidence

Better pattern:
```typescript
// BAD: Silent fallback
return player?.color || 'red';

// GOOD: Explicit failure
if (!player?.color) {
  console.warn('Missing player color for position', position);
  return '';  // Or throw, depending on severity
}
return player.color;
```

### 4. Player Position Indexing Consistency

Document clearly that players are 1-indexed. The bug was compounded by position-based fallback arrays that were 0-indexed:

```typescript
// Players are 1-indexed, but this array is 0-indexed
['red', 'blue', 'green'][playerPos]  // playerPos=2 gives 'green', but is that right?
```

## Files Changed

- `src/rules/elements.ts` - Added `position` and `playerColor` to `PlayerArea` class
- `src/rules/game.ts` - Pass position and color when creating `PlayerArea`
- `src/ui/components/GameBoard.vue` - Removed fallbacks, added warnings

## Lessons Learned

1. **Fallbacks hide bugs** - When two fallbacks disagree, you get subtle, hard-to-debug issues
2. **Data should live in one place** - Player color was on `RebelPlayer` but UI needed it on `PlayerArea`
3. **Warnings > Silent defaults** - A console warning would have revealed this bug immediately
4. **Test with non-default values** - Testing only with player position 0 (red) would miss this entirely

## Testing Note

This fix requires starting a new game since `PlayerArea` attributes are set during game setup. Existing games won't have the data until recreated.
