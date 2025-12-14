# Victory and Game End

> **PDF Reference:** rules-v6.6.pdf, Page 3 (Ending The Game)

This document describes all conditions that end the game and how victory is determined.

---

## Game End Conditions

The game can end in three ways:

| Condition | Trigger | Immediate? |
|-----------|---------|------------|
| Tactics Exhausted | Dictator has no cards in hand or deck | End of Dictator turn |
| Base Captured | Rebels take control of Dictator's base | Immediate |
| Dictator Killed | Dictator card health reaches 0 | Immediate |

---

## Condition 1: Tactics Exhausted (Normal End)

### Trigger

The game ends at the end of the Dictator's turn when:
- Dictator has **0 cards in hand**, AND
- Dictator has **0 cards in Active Tactics deck**

### Timeline

This typically occurs on **Day 6** (after 5 full rounds of play).

**Card Flow:**
- Start: 5 cards in deck, 0 in hand
- Day 1: Draw 3 → Deck: 2, Hand: 3
- Day 2: Play 1, Draw 1 → Deck: 1, Hand: 3
- Day 3: Play 1, Draw 1 → Deck: 0, Hand: 3
- Day 4: Play 1, Draw 0 → Deck: 0, Hand: 2
- Day 5: Play 1, Draw 0 → Deck: 0, Hand: 1
- Day 6: Play 1, Draw 0 → Deck: 0, Hand: 0 → **Game Ends**

### Victory Determination

Compare **total sector value** controlled by each side:

**Rebels Win:** If combined Rebel sector value > Dictator sector value
**Dictator Wins:** If Dictator sector value >= Rebel sector value

> **Important:** The Dictator wins ties.

---

## Condition 2: Base Captured (Instant Rebel Win)

### Trigger

Rebels **immediately win** if they take control of the Dictator's base.

### Requirements

1. Base must be **revealed** (placed on map)
2. Rebels must **control** the base sector

### Control Definition

Rebels control a sector when they have **more units** than the Dictator:
- Units = MERCs + Militia
- Must defeat all Dictator units (MERCs and militia)
- The Dictator card must also be defeated

### Timing

This victory is **immediate** - game ends the moment control shifts.

---

## Condition 3: Dictator Killed (Instant Rebel Win)

### Trigger

Rebels **immediately win** if the Dictator card's health reaches 0.

### Requirements

1. Base must be **revealed** (Dictator card only in play after revelation)
2. Dictator card must be **targetable** (all other Dictator units in sector defeated)
3. Dictator card takes lethal damage

### Protection Rule

Remember: The Dictator card cannot be attacked until all other Dictator-controlled units in the same sector are defeated.

### Timing

This victory is **immediate** - game ends when Dictator dies.

---

## Calculating Sector Value

### Sector Values

Each sector has a **point value** displayed on the card.

Typical ranges:
- **Industries:** Higher values (key strategic targets)
- **Cities:** Lower values (but strategic for abilities)
- **Wilderness:** Lowest values

### Calculating Control

For each sector:
1. Count units per side (MERCs + Militia)
2. Side with more units controls it
3. **Dictator wins ties**

### Total Value

Sum the values of all sectors each side controls:

```
Rebel Total = Sum of values of Rebel-controlled sectors
Dictator Total = Sum of values of Dictator-controlled sectors
```

---

## Victory Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    GAME END CHECK                           │
└─────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │Base Captured│ │Dictator Dead│ │Cards Gone   │
    └─────────────┘ └─────────────┘ └─────────────┘
           │               │               │
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │REBELS WIN   │ │REBELS WIN   │ │Compare Value│
    │(Immediate)  │ │(Immediate)  │ └─────────────┘
    └─────────────┘ └─────────────┘        │
                                           ▼
                              ┌────────────────────────┐
                              │Rebels > Dictator?      │
                              └────────────────────────┘
                                    │         │
                                   Yes        No
                                    │         │
                                    ▼         ▼
                              ┌────────┐ ┌────────────┐
                              │REBELS  │ │DICTATOR    │
                              │WIN     │ │WINS        │
                              └────────┘ │(wins ties) │
                                         └────────────┘
```

---

## Edge Cases

### All Rebels' MERCs Die

If all MERCs for a Rebel die:
- Rebel can hire new MERCs on their next turn
- Game does **not** end
- Rebel temporarily has no units

### Dictator Has No MERCs

The Dictator can have no MERCs and still:
- Control sectors via militia
- Play Tactics cards
- Use special ability (if applicable)

### Empty MERC Deck

If the MERC deck is empty:
- No more MERCs can be hired by anyone
- Reshuffle discard pile if needed (rules unclear, suggest house rule)

### Sector With No Units

Sectors with no units:
- Are neutral (no one controls)
- Don't count toward anyone's total

---

## Multi-Rebel Victory

When Rebels win, they win **together** (cooperative victory).

However, for competitive scoring among Rebels:
- Individual Rebels could compare their controlled sector values
- Not in base rules but could be a variant

---

## Implementation Notes

### Game End Check

```typescript
function checkGameEnd(): GameEndResult | null {
  // Condition 2: Base captured (immediate)
  if (dictator.baseRevealed) {
    const baseControl = getControl(dictator.baseLocation)
    if (baseControl !== 'dictator') {
      return { winner: 'rebels', reason: 'BASE_CAPTURED' }
    }
  }

  // Condition 3: Dictator killed (immediate)
  if (dictator.dictatorInPlay && dictator.card.health <= 0) {
    return { winner: 'rebels', reason: 'DICTATOR_KILLED' }
  }

  // Condition 1: Tactics exhausted (end of Dictator turn)
  if (dictator.hand.length === 0 && dictator.tacticsDeck.length === 0) {
    return calculateVictoryByValue()
  }

  return null  // Game continues
}

function calculateVictoryByValue(): GameEndResult {
  let rebelValue = 0
  let dictatorValue = 0

  for (const sector of allSectors) {
    const control = getControl(sector)
    if (control === 'dictator') {
      dictatorValue += sector.value
    } else if (control !== null) {
      rebelValue += sector.value
    }
  }

  // Dictator wins ties
  if (dictatorValue >= rebelValue) {
    return { winner: 'dictator', reason: 'VALUE_VICTORY', scores: { rebel: rebelValue, dictator: dictatorValue } }
  } else {
    return { winner: 'rebels', reason: 'VALUE_VICTORY', scores: { rebel: rebelValue, dictator: dictatorValue } }
  }
}
```

### When to Check

```typescript
// Check after combat resolves
afterCombat() {
  const result = checkGameEnd()
  if (result) endGame(result)
}

// Check at end of Dictator turn
endDictatorTurn() {
  const result = checkGameEnd()
  if (result) endGame(result)
  else advanceDay()
}
```

### UI Considerations

- Show running score (sector values per side)
- Indicate Tactics cards remaining
- Highlight base location when revealed
- Show Dictator's protection status
- Display clear victory screen with reason
