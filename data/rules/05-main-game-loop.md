# Main Game Loop (Days 2-6)

> **PDF Reference:** rules-v6.6.pdf, Page 2-3 (Play - Day 2 through 6)

This document describes the core turn structure for Days 2 through 6, which form the main gameplay.

---

## Day Structure

Each day (round) consists of two phases:
1. **Rebel Phase** - All Rebels take their actions simultaneously
2. **Dictator Phase** - Dictator plays a card, then takes MERC actions

```
┌─────────────────────────────────────────────────┐
│                    DAY N                        │
├─────────────────────────────────────────────────┤
│  REBEL PHASE                                    │
│  ├─ All Rebels act simultaneously               │
│  └─ Each MERC takes 2 actions                   │
├─────────────────────────────────────────────────┤
│  DICTATOR PHASE                                 │
│  ├─ Play 1 Tactics card OR Reinforce            │
│  ├─ Each Dictator MERC takes 2 actions          │
│  └─ Use Special Ability (if applicable)         │
├─────────────────────────────────────────────────┤
│  END OF DAY → Check for game end                │
└─────────────────────────────────────────────────┘
```

---

## Rebel Phase

### Simultaneous Play

All Rebels should be playing **simultaneously**. They do not take turns.

### Actions Per MERC

Each Rebel MERC can take **2 actions** per day.

Available actions:
- Hire MERCs (2 actions)
- Explore Sector (1 action)
- Re-Equip (1 action)
- Train Militia (1 action)
- Move MERCs (1 action)
- Hospital - heal (1 action, City only)
- Arms Dealer - draw equipment (1 action, City only)

> **See:** `06-merc-actions.md` for detailed action descriptions.

### Squad Independence

- MERCs in different squads may take different actions
- MERCs in the **same squad** must move together
- One MERC can train while another in a different squad moves

### Phase Completion

The Rebel phase is complete when all Rebel MERCs have used all their actions (or chosen not to).

---

## Dictator Phase

### Step 1: Play Tactics Card OR Reinforce

The Dictator **must** do one of the following:

#### Option A: Play a Tactics Card

1. Choose 1 card from hand
2. Resolve the card's effect
3. Discard the card

#### Option B: Reinforce

1. Discard 1 Tactics card (do not resolve its effect)
2. Place militia on a Dictator-controlled sector

**Reinforcement Amount:**
```
Militia = floor(Rebel Players / 2) + 1
```

| Rebels | Militia Gained |
|--------|----------------|
| 1      | 1              |
| 2      | 2              |
| 3      | 2              |
| 4      | 3              |
| 5      | 3              |
| 6      | 4              |

**Reinforcement Rules:**
- All militia must go to **one** sector
- Sector must be Dictator-controlled
- Still subject to 10 militia per sector maximum
- Excess militia are discarded

### Step 2: MERC Actions

If the Dictator has any MERCs, each may take **2 actions**.

The Dictator's MERCs follow the same action rules as Rebel MERCs:
- Hire MERCs (only if special ability allows)
- Explore Sector
- Re-Equip
- Train Militia
- Move MERCs

> **Note:** The Dictator has **no team limit**.

### Step 3: Special Ability

The Dictator may use their Dictator card's special ability.

- Ability is printed in yellow on the card
- Usable **every turn** (unless ability specifies otherwise)
- Available whether base is revealed or not

### Step 4: Refill Hand

Draw from Active Dictator Tactics deck until hand has 3 cards.

If the deck is empty, do not draw.

---

## End of Day

After the Dictator completes their phase:

### Check for Game End

The game ends if:
1. Dictator has no cards in hand **AND** no cards in deck
2. Rebels capture the Dictator's base
3. Rebels kill the Dictator (card)

> **See:** `11-victory-and-game-end.md` for victory determination.

### If Game Continues

- Increment day counter
- Begin next day with Rebel Phase

---

## Day Progression

```
Day 1 → Day 2 → Day 3 → Day 4 → Day 5 → Day 6 → Game End
         ↑_____________________________________|
              Main Game Loop (this document)
```

---

## Combat During Main Loop

Combat triggers when:
- A squad moves into an enemy-occupied sector
- An enemy moves into your sector

Combat does **not** end your turn. After combat resolves, remaining actions can still be taken.

> **See:** `07-combat-system.md` for combat resolution.

---

## Implementation Notes

### Turn State Machine

```
enum Phase {
  REBEL_PHASE,
  DICTATOR_TACTICS,
  DICTATOR_ACTIONS,
  END_OF_DAY
}

dayLoop() {
  phase = REBEL_PHASE

  // Rebels act (can be parallel in multiplayer)
  while (rebelsHaveActions()) {
    processRebelActions()
  }

  phase = DICTATOR_TACTICS
  dictatorPlayOrReinforce()

  phase = DICTATOR_ACTIONS
  while (dictatorMercsHaveActions()) {
    processDictatorActions()
  }
  dictatorUseSpecialAbility() // optional
  dictatorRefillHand()

  phase = END_OF_DAY
  if (checkGameEnd()) {
    return determineWinner()
  }

  currentDay++
  return dayLoop()
}
```

### Tracking Actions

Each MERC needs:
- `actionsRemaining: 2` (reset each day)
- Track which actions have been taken
- Some actions cost 2 (Hire), most cost 1

### Simultaneous Rebel Play

For web implementation, consider:
- All Rebels submit actions independently
- Reveal/resolve in batches
- Or: sequential turns for simplicity (variant)

### Combat Integration

- Movement action may trigger combat
- Combat resolves immediately
- Remaining actions available post-combat
