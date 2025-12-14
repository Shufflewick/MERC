# Initial Setup

> **PDF Reference:** rules-v6.6.pdf, Page 2 (Setup)

This document covers the pre-game state initialization before Day 1 begins.

---

## Setup Sequence

### 1. Determine Player Count

1. Count total players
2. Designate one player as the Dictator
3. Remaining players are Rebels
4. Look up configuration in Game Size table (see `02-game-constants-and-configuration.md`)

---

### 2. Prepare the Map Deck

1. Separate Map deck by sector type:
   - Industries (have "Industry" in title)
   - Cities
   - Wilderness

2. Select correct number of each type per Game Size table

3. Return unused map cards to the box

---

### 3. Build the Map

> **PDF Reference:** rules-v6.6.pdf, Page 2 (map layout diagram)

**Checkerboard Pattern Rule:** No two Industries may be adjacent (orthogonally).

**Placement Algorithm:**

1. Place first Industry in a corner
2. Alternate between Industry and non-Industry (City or Wilderness)
3. Every other space should be an Industry
4. Non-Industry spaces can be City or Wilderness

**Example 3x4 Map Layout:**

```
┌─────────┬─────────┬─────────┬─────────┐
│ Industry│Wildernes│ Industry│  City   │
├─────────┼─────────┼─────────┼─────────┤
│Wildernes│ Industry│Wildernes│ Industry│
├─────────┼─────────┼─────────┼─────────┤
│ Industry│Wildernes│ Industry│Wildernes│
└─────────┴─────────┴─────────┴─────────┘
```

**Map State:**
- All sectors start **unexplored side up** (brighter, shows loot icons)

---

### 4. Select Dictator

1. Randomly choose 1 card from the Dictators deck
2. Place it face up in front of the Dictator player
3. Return remaining Dictator cards to the box

---

### 5. Prepare Dictator Tactics Deck

1. Shuffle the Dictator Tactics deck
2. Randomly choose 5 cards
3. These form the **Active Dictator Tactics deck**
4. Place face-down next to the Dictator
5. Return remaining cards to the box

> **Tip:** Add more Dictator Tactics cards for a longer game.

---

### 6. Distribute Components to Dictator

Give the Dictator player:
- Black pawns (large and small)
- Black chits (for militia)
- Base token
- Dictator player mat

---

### 7. Distribute Components to Rebels

Each Rebel player chooses:
- A color set of chits
- Matching colored pawns (large and small)
- A Rebel player mat

---

### 8. Prepare Equipment Decks

1. Separate Equipment cards into three decks:
   - Weapons
   - Armor
   - Accessories

2. Shuffle each deck separately

3. Place all three decks face-down next to the map

---

### 9. Prepare MERC Deck

1. Shuffle the MERCs deck
2. Place face-down next to the map

---

## Setup Complete

At this point:

| Item | State |
|------|-------|
| Map | Built with all sectors unexplored |
| Dictator | Selected, card visible |
| Tactics Deck | 5 cards, face-down |
| Equipment | 3 shuffled decks ready |
| MERCs | 1 shuffled deck ready |
| Players | Have their color components |
| Pawns | Not yet on map |
| Militia | Not yet placed |

**Proceed to Day 1 (see `04-day-one-the-landing.md`)**

---

## Implementation Notes

### Required Data
- Game Size configuration table: `../setup.json`
- Sector card data: `../sectors.json` + images in `/sectors/`
- Dictator card data: `../dictators.json` + images (not yet available)
- Dictator Tactics card data: `../dictator-tactics.json` + images (not yet available)
- Equipment card data: `../equipment.json` + images (not yet available)
- MERC card data: `../mercs.json` + images in `/mercs/`

### State to Track After Setup
```
gameState = {
  map: Sector[][] // 2D grid of sectors
  dictator: {
    card: Dictator
    tacticsDeck: TacticsCard[]
    hand: TacticsCard[] // empty until Day 1
    mercs: [] // empty until Day 1
    militia: {} // sector -> count, empty until Day 1
  }
  rebels: [{
    color: string
    mercs: []
    militia: {} // sector -> count
    primarySquad: { sector: null, mercs: [] }
    secondarySquad: { sector: null, mercs: [] }
  }]
  equipmentDecks: {
    weapons: Card[]
    armor: Card[]
    accessories: Card[]
  }
  mercDeck: MercCard[]
  currentDay: 0 // Setup complete, Day 1 begins
}
```
