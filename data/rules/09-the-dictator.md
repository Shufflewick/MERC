# The Dictator

> **PDF Reference:** rules-v6.6.pdf, Page 5 (The Dictator, The Dictator's Base, Dictator Card, Special Ability, Reinforce)

This document covers all rules specific to the Dictator player.

---

## Dictator Overview

The Dictator is a player who follows the same base rules as Rebels with several key exceptions:

| Aspect | Rebels | Dictator |
|--------|--------|----------|
| Team Limit | 1 + controlled sectors | **No limit** |
| Hiring MERCs | Via Hire action | Only via special ability (if allowed) |
| Militia Placement | Via Train action | Via setup, reinforce, tactics cards, abilities |
| Tactics Cards | None | Hand of 3, plays 1 per turn |
| Special Ability | MERC abilities | Dictator card ability (always active) |
| Win Condition | Control most value | Control most value OR survive |

---

## The Dictator's Base

### Hidden Base

The Dictator has a **hidden base** that the Rebels don't know the location of initially.

**Important:** If Rebels capture the base, they **immediately win**.

### Base Revelation

The base location is revealed when the Dictator plays a Tactics card that **mentions the base**.

### Choosing Base Location

When revealed, the Dictator chooses any **Industry they control** to place the base:

1. Select an Industry the Dictator controls
2. Place the base token on that sector
3. The Dictator card enters play at the base (see below)

**Strategic Choice:** Typically choose:
- The most defended Industry
- The most remote Industry
- An Industry difficult for Rebels to reach

### Base Token

The base token marks the Dictator's base location. It stays on that sector for the rest of the game.

---

## The Dictator Card (As Actor)

> **PDF Reference:** rules-v6.6.pdf, Page 5 (Dictator Card)

### Activation

When the base is revealed, the **Dictator card enters play** as an actor on the battlefield.

### Starting Position

The Dictator always starts **at their base**.

### Squad Rules

The Dictator can form a **third squad** if the other 2 squads are already in play:
- Can stay at base alone
- To leave the base, must join one of the two regular squads

### Acting Like a MERC

Once in play, the Dictator card:
- Has actions (2 per turn)
- Can equip equipment
- Has stats (from card + equipment)
- Can attack and be attacked

### Protection

The Dictator is **protected**:
- Cannot be attacked until all other Dictator-controlled units in the sector are defeated
- Must eliminate all militia and MERCs before targeting the Dictator

### Killing the Dictator

If the Dictator card is killed, the **Rebels immediately win**.

---

## Special Ability

### Always Active

The Dictator card's special ability (printed in yellow) is usable:
- **Every turn**
- Whether the base has been revealed or not
- From the start of the game

### Ability Types

Each Dictator has a unique ability. Examples:
- Some allow hiring MERCs
- Some add militia
- Some modify combat
- Some have setup effects

> **Implementation Note:** Dictator abilities are defined in `../dictators.json`. Each ability will need custom implementation.

---

## Dictator Turn Structure

The Dictator's turn consists of:

### 1. Play Tactics Card OR Reinforce

**Option A: Play a Card**
- Choose 1 card from hand
- Resolve its effect
- Discard the card

**Option B: Reinforce**
- Discard 1 card without resolving it
- Add militia to a Dictator-controlled sector
- Amount = floor(Rebels / 2) + 1

### 2. MERC Actions

If the Dictator has MERCs (including the Dictator card when in play):
- Each MERC takes 2 actions
- Same action options as Rebels (except Hire unless ability allows)

### 3. Special Ability

Use the Dictator card's special ability (if applicable this turn).

### 4. Refill Hand

Draw from Active Dictator Tactics deck until hand has 3 cards.

---

## Reinforce Action

> **PDF Reference:** rules-v6.6.pdf, Page 5 (Reinforce)

Instead of playing a Tactics card, the Dictator may **reinforce**.

### Procedure

1. Discard 1 Tactics card (do not resolve)
2. Choose 1 Dictator-controlled sector
3. Add militia to that sector

### Amount Calculation

```
Militia = floor(Rebel_Players / 2) + 1
```

| Rebels | Militia |
|--------|---------|
| 1 | 1 |
| 2 | 2 |
| 3 | 2 |
| 4 | 3 |
| 5 | 3 |
| 6 | 4 |

### Restrictions

- All militia go to **one** sector (cannot split)
- Must be a Dictator-controlled sector
- **10 militia per sector cap** still applies
- Excess militia are lost

---

## Dictator Tactics Cards

### Deck Setup

1. Shuffle all Tactics cards
2. Draw 5 randomly to form the **Active deck**
3. Return rest to box

### Hand Management

- Dictator fills hand to **3 cards**
- Plays (or discards for reinforce) **1 card per turn**
- Draws to refill at end of turn

### Game End Trigger

When the Dictator has:
- No cards in hand, AND
- No cards in deck

The game ends at the end of that Dictator turn.

> **Implementation Note:** Tactics card effects are defined in `../dictator-tactics.json`. Each card will need custom implementation.

---

## Dictator Strategy Notes

### Strengths

- No team limit (can have many MERCs if ability allows)
- Tactics cards provide powerful effects
- Starts with militia on Industries
- Wins ties

### Weaknesses

- Base capture = instant loss
- Dictator death = instant loss
- Cannot freely hire MERCs
- Rebels act simultaneously (outnumbered in actions)

---

## Implementation Notes

### Dictator State

```typescript
interface DictatorState {
  card: DictatorCard
  baseRevealed: boolean
  baseLocation: Sector | null
  dictatorInPlay: boolean
  hand: TacticsCard[]
  tacticsDeck: TacticsCard[]
  mercs: MERC[]
  primarySquad: Squad
  secondarySquad: Squad | null
  // Dictator card can be a third "squad" when at base
}
```

### Base Revelation Logic

```typescript
function playTacticsCard(card: TacticsCard) {
  if (card.mentionsBase && !dictator.baseRevealed) {
    revealBase()
  }
  resolveCardEffect(card)
}

function revealBase() {
  // Get valid industries (Dictator-controlled)
  const validIndustries = sectors.filter(s =>
    s.type === 'industry' && getControl(s) === 'dictator'
  )

  // Prompt Dictator to choose (or use AI logic)
  const chosenIndustry = selectBaseLocation(validIndustries)

  dictator.baseRevealed = true
  dictator.baseLocation = chosenIndustry
  dictator.dictatorInPlay = true

  // Place Dictator card at base
  placeDictatorAtBase()
}
```

### Protection Check

```typescript
function canTargetDictator(sector: Sector): boolean {
  if (!dictator.dictatorInPlay) return false
  if (dictator.baseLocation !== sector) return false

  // Check if any other Dictator units remain
  const otherMercs = dictator.mercs.filter(m =>
    m.sector === sector && m !== dictator.card
  )
  const militia = sector.militia.dictator

  return otherMercs.length === 0 && militia === 0
}
```

### UI Considerations

- Show Tactics card hand (to Dictator only)
- Show deck size
- Track base revelation
- Highlight base location when revealed
- Show protection status on Dictator card
- Indicate when Dictator can be targeted
