# Extra Game Modes

> **PDF Reference:** expansion-rules-v1.4.pdf, Page 2 (Extra Game Modes)

These alternate game modes provide different ways to play MERC. Some can be combined.

---

## Mode Compatibility Matrix

| Mode | + Assassination | + Vehicles | + Versus | + I, Dictator | + AI |
|------|-----------------|------------|----------|---------------|------|
| **Assassination** | - | No | No | No | No |
| **Vehicles** | No | - | Yes | Yes | No |
| **Versus** | No | Yes | - | Yes | No |
| **I, Dictator** | No | Yes | Yes | - | Yes |
| **AI** | No | No | No | Yes | - |

---

## Assassination Mode

> **Reference:** expansion-rules-v1.4.pdf, Page 2 (Assassination)

A direct battle mode focused on killing the Dictator rather than area control.

### Compatibility

- **Cannot** combine with any other mode or Dictator AI

### Setup

1. Dictator places base in **one corner** of the map
2. Rebels place all MERCs in the **opposite corner**
3. Neutral zone: diagonal cards between the unused corners (no units)
4. Dictator's side: 1 militia per space
5. Rebel's side: Rebel militia divided evenly

**Dictator Starting Forces:**
- 1 random MERC per Rebel player
- Each MERC gets 1 of each equipment type (weapon, armor, accessory)

**Rebel Starting Forces:**
- 2 MERCs each (normal hire process)
- 1 equipment each (normal)

### Rule Changes

- Dictator **cannot** hire MERCs via special abilities
- All other rules apply normally

### Victory Condition

- Game lasts **5 rounds** (ends when Dictator runs out of cards)
- **Rebels win only by killing the Dictator**
- **Dictator wins** if alive after 5 rounds

---

## Vehicles Mode

> **Reference:** expansion-rules-v1.4.pdf, Page 2 (Vehicles)

Adds vehicle cards to the game for chaos and mobility.

### Compatibility

- Can combine with: Versus, I Dictator
- **Not recommended** with Dictator AI (no AI rules for vehicles)

### Setup

1. Find 5 equipment cards marked with **puzzle letter A**
2. Shuffle vehicle cards into the **Accessories deck**

### Rule Changes

**Vehicle Attachment:**
- Vehicles attach to the **squad**, not individual MERCs
- All vehicle attributes apply to **all squad members**

**Vehicle Capacity:**
- Vehicles have a **crew** limit
- Can transport militia (count toward crew)
- Example: Crew 4 = 2 MERCs + 2 militia, or 1 MERC + 3 militia
- Militia cannot operate vehicles alone

**Vehicle Armor:**
- Vehicle armor = vehicle health
- Damage goes to vehicle before MERCs, militia, or body armor
- When armor reaches 0, vehicle is destroyed

---

## Versus Mode

> **Reference:** expansion-rules-v1.4.pdf, Page 2 (Versus)

Fight teams of MERCs instead of the Dictator.

### Compatibility

- Can combine with: Vehicles, I Dictator
- Best for: 1v1, 1v1v1, 2v2, 3v3

### Setup

1. Set up map normally, **no Dictator**
2. Each faction picks an **Industry** to start
3. Set number of rounds (Short: 5, Long: 10)
4. Roll dice to determine first player

### Rule Changes

**Turn Order:**
- Each faction takes a full turn (all MERC actions)
- Then next faction goes
- Repeat until all factions have gone = 1 round

**Tie Resolution:**
Ties favor the faction that:
1. Controls the **fewest points** of map value
2. If still tied: has the **fewest total MERCs**
3. If still tied: roll dice

### Victory Conditions

Game ends when:

**A - Industry Control:** One faction controls **all industries**

**B - Round Limit:** Set number of rounds expires
- Winner = faction with most total sector value

---

## I, Dictator Mode

> **Reference:** expansion-rules-v1.4.pdf, Page 2 (I, Dictator)

Race to collect super weapon components to become the next Dictator.

### Compatibility

- Can combine with: Normal game, Versus mode, Dictator AI

### Setup

1. Find 2 equipment cards marked with **puzzle letter B**
2. Set up map with **at least 2 cities**
3. Place explosive cards (2) and detonator cards (2) near the map

### Rule Changes

**Acquiring Components:**
- **Detonator:** 1 action at Arms Dealer (in a city)
- **Explosive:** 1 action at Arms Dealer (in a **different** city)
- Must get each from **separate cities**
- Each Rebel may only have **1 of each** at any time

**Component Loss:**
- If MERC holding component dies:
  - Card returns to the supply pile
  - Immediately available at Arms Dealers again

### Victory Condition

**Instant Win:** Any Rebel gains both a detonator AND an explosive at the same time.

This overrides normal victory conditions.

---

## Mode-Specific Equipment

Some modes have special equipment cards identified by puzzle letters:

| Letter | Mode | Cards |
|--------|------|-------|
| A | Vehicles | 5 vehicle cards |
| B | I, Dictator | 2 explosive + 2 detonator cards |

> **Implementation Note:** Equipment data in `../equipment.json` indicates which mode each card belongs to.

---

## Implementation Notes

### Mode Selection

```typescript
interface GameMode {
  assassination: boolean
  vehicles: boolean
  versus: boolean
  iDictator: boolean
  dictatorAI: boolean
}

function validateModeCompatibility(modes: GameMode): boolean {
  if (modes.assassination) {
    // Assassination cannot combine with anything
    return !modes.vehicles && !modes.versus && !modes.iDictator && !modes.dictatorAI
  }

  if (modes.vehicles && modes.dictatorAI) {
    return false  // Not recommended
  }

  return true
}
```

### Versus Mode Turn Structure

```typescript
interface Faction {
  id: string
  players: Player[]
  mercs: MERC[]
  controlledValue: number
}

function versusTurn(factions: Faction[]) {
  // Sort by turn order (first player, then clockwise or by roll)
  for (const faction of factions) {
    // Faction takes all MERC actions
    for (const merc of faction.mercs) {
      while (merc.actionsRemaining > 0) {
        const action = selectAction(merc)
        executeAction(merc, action)
      }
    }
  }
  roundNumber++
}

function checkVersusEnd(factions: Faction[]): GameEndResult | null {
  // Check industry control
  const industries = sectors.filter(s => s.type === 'industry')
  for (const faction of factions) {
    const controlled = industries.filter(i => getControl(i) === faction.id)
    if (controlled.length === industries.length) {
      return { winner: faction.id, reason: 'ALL_INDUSTRIES' }
    }
  }

  // Check round limit
  if (roundNumber >= roundLimit) {
    const winner = factions.reduce((a, b) =>
      a.controlledValue > b.controlledValue ? a : b
    )
    return { winner: winner.id, reason: 'ROUND_LIMIT' }
  }

  return null
}
```

### I, Dictator Components

```typescript
interface IDictatorState {
  explosives: { available: number, held: Map<string, boolean> }
  detonators: { available: number, held: Map<string, boolean> }
}

function acquireComponent(rebel: string, type: 'explosive' | 'detonator', city: Sector) {
  const state = iDictatorState[type + 's']

  // Check if already holding one
  if (state.held.get(rebel)) {
    return false  // Can only hold 1
  }

  // Check if different city than other component
  // (Implementation detail: track which city each was obtained from)

  state.available--
  state.held.set(rebel, true)

  // Check instant win
  if (iDictatorState.explosives.held.get(rebel) &&
      iDictatorState.detonators.held.get(rebel)) {
    endGame({ winner: rebel, reason: 'SUPER_WEAPON' })
  }
}

function onMercDeath(merc: MERC) {
  // Return components to supply
  if (merc.hasExplosive) {
    iDictatorState.explosives.available++
    iDictatorState.explosives.held.set(merc.owner, false)
  }
  if (merc.hasDetonator) {
    iDictatorState.detonators.available++
    iDictatorState.detonators.held.set(merc.owner, false)
  }
}
```

### UI Considerations

- Mode selection screen before game setup
- Show incompatible mode combinations
- Track super weapon components (I, Dictator)
- Display faction scores (Versus)
- Show round counter for timed modes
- Vehicle crew capacity display
