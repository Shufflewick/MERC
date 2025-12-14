# Dictator AI

> **PDF Reference:** expansion-rules-v1.4.pdf, Page 1 (Dictator AI)

The Dictator AI allows all players to play as Rebels against a robot Dictator, enabling full co-op and solo play modes.

---

## AI Overview

The AI follows a priority-based decision system. When faced with choices, the AI follows ordered rules until it finds one that applies.

**Core Principle:** If a situation can benefit the Dictator and is legal, assume the AI makes the best choice for itself.

---

## AI Setup Differences

### No Hand

The AI Dictator:
- Does **not** have a hand of Tactics cards
- Plays cards in the order they are shuffled (top of deck)
- Cannot choose which card to play

### Privacy Player

Designate 1 Rebel player to:
- Take all Dictator actions
- See hidden information (mine locations, etc.)
- Make AI decisions impartially

### Extra Militia

During setup (unless solo/1 Rebel):
- AI gets extra militia from Game Size table
- Distribute **evenly** among Dictator-controlled Industries

---

## AI MERC Action Priority

When the AI's MERCs take actions, follow this priority list. After each action, start from the top again.

**Order of evaluation:**

### 3.1 - If MERCs aren't fully equipped
→ Explore the sector and equip/re-equip MERCs

### 3.2 - If Squad is on an undefended Industry
→ All MERCs spend 1 action training militia

### 3.3 - If there is an unoccupied Industry in range
→ Move to the unoccupied Industry
→ If actions remain after arriving, train militia

### 3.4 - If a Rebel is in range
→ Move toward the closest Rebel-controlled sector
→ Never split the squad
→ All MERCs with actions remaining move together

### 3.5 - If sector not at max militia (10)
→ Each MERC spends 1 action training militia

### 3.6 - If none of the above
→ Move to an adjacent sector closest to a Rebel-controlled sector
→ See "Choosing Between Rebel Sectors"

### Action Order

MERCs act in **Initiative order** (highest first), but move together when possible.

---

## Special Event Handlers

### 4.1 - Base Revealed

When a card reveals the base, choose the location:

1. **Furthest from Rebels** - Choose an Industry as far from Rebel forces as possible
2. **Most Defended** - If tied, choose the Industry with the most Dictator forces
3. **Highest Value** - If still tied, choose the highest value Industry
4. **Random** - If still tied, roll dice to determine

**Post-Revelation Behavior:**
- Dictator stays at base (never leaves)
- Takes actions as if a MERC (equip, train, etc.)

---

### 4.2 - When Attacked

If a Rebel attacks a Dictator-controlled sector with an equipment stash:
- Look at the stash
- Detonate any **Land Mines** in the stash

---

### 4.3 - Hiring MERCs

If the AI can hire MERCs (via ability):

**4.3.1** - If choice of more than 1, pick randomly from top of deck

**4.3.2** - New MERC forms a squad at:
- Dictator-controlled sector closest to the weakest Rebel sector
- See "Choosing Between Rebel Sectors"

**4.3.3** - Always choose a **Weapon** as free equipment

---

### 4.4 - Placing Militia

Placement depends on where the card/ability allows:

**4.4.1 - On Rebel Sectors:**
→ Use "Choosing Between Rebel Sectors"

**4.4.2 - On Neutral Sectors:**
→ Highest value sector closest to Dictator's base (or other Dictator sector if no base)

**4.4.3 - On Dictator Sectors:**
→ Sector closest to a Rebel-controlled sector

---

### 4.5 - Choosing Between Rebel Sectors

Calculate **total armor + health** of all Rebel forces in each sector.

**4.5.1** - Choose the **weaker** force
**4.5.2** - If tied, roll dice to determine

---

### 4.6 - Choosing Targets in Combat

The AI prioritizes targets:

**4.6.1** - Lowest health + armor
**4.6.2** - If tied, highest number of targets (can attack most enemies)
**4.6.3** - If still tied, highest initiative
**4.6.4** - If still tied, roll dice

---

### 4.7 - Choosing Equipment

Equipment cards have unique numbers (upper right corner).

**4.7.1** - Equip MERCs in **alphabetical order** (Adelheid before Vandal)

**4.7.2** - Always leave these in the stash:
- Land Mines
- Repair Kits

**4.7.3** - Take equipment with the **highest number**:
- Highest numbered weapon
- Highest numbered armor
- Highest numbered accessory

---

### 4.8 - Healing Injured MERCs

If any MERC in the squad is injured:

**4.8.1** - Use MERC healing abilities first
**4.8.2** - Discard combat dice as needed to use Medical Kit or First Aid Kit

---

### 4.9 - Saving Dying MERCs

If a MERC is about to die and any squad member has an **Epinephrine Shot**:
→ Use it

---

### 4.10 - MERC Special Abilities

The AI **always uses** MERC special abilities when appropriate.

---

### 4.11 - Attack Dogs

The AI **always assigns** Attack Dogs to Rebel MERCs when possible.
- Use "Choosing Targets in Combat" rules for selection

---

### 4.12 - Mortars

The AI **always attacks with mortars** from adjacent sectors when possible.

If multiple sectors available:
1. Choose sector with the most targets
2. After firing, re-evaluate movement using "Choosing Between Rebel Sectors"

---

## AI Decision Flowchart

```
┌─────────────────────────────────────────┐
│         AI MERC Action Decision         │
└─────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ Fully equipped?       │──No──→ EXPLORE & EQUIP
        └───────────────────────┘
                    │ Yes
                    ▼
        ┌───────────────────────┐
        │ On undefended Industry│──Yes─→ TRAIN MILITIA
        └───────────────────────┘
                    │ No
                    ▼
        ┌───────────────────────┐
        │ Unoccupied Industry   │──Yes─→ MOVE (then train if actions left)
        │ in range?             │
        └───────────────────────┘
                    │ No
                    ▼
        ┌───────────────────────┐
        │ Rebel in range?       │──Yes─→ MOVE toward weakest Rebel
        └───────────────────────┘
                    │ No
                    ▼
        ┌───────────────────────┐
        │ Militia < 10?         │──Yes─→ TRAIN MILITIA
        └───────────────────────┘
                    │ No
                    ▼
        ┌───────────────────────┐
        │ Default               │──────→ MOVE toward nearest Rebel
        └───────────────────────┘
```

---

## Implementation Notes

### AI State

```typescript
interface AIState extends DictatorState {
  privacyPlayer: string  // Rebel handling AI decisions
}
```

### Priority System

```typescript
function getAIAction(merc: MERC, sector: Sector): Action {
  // 3.1 - Not fully equipped
  if (!isFullyEquipped(merc) && !sector.explored) {
    return { type: 'EXPLORE' }
  }
  if (!isFullyEquipped(merc) && sector.stash.length > 0) {
    return { type: 'RE_EQUIP' }
  }

  // 3.2 - On undefended Industry
  if (sector.type === 'industry' && sector.militia.dictator === 0) {
    return { type: 'TRAIN' }
  }

  // 3.3 - Unoccupied Industry in range
  const unoccupiedIndustry = findUnoccupiedIndustryInRange(sector)
  if (unoccupiedIndustry) {
    return { type: 'MOVE', target: unoccupiedIndustry }
  }

  // 3.4 - Rebel in range
  const nearestRebel = findNearestRebelSector(sector)
  if (isInRange(sector, nearestRebel)) {
    return { type: 'MOVE', target: nearestRebel }
  }

  // 3.5 - Not at max militia
  if (sector.militia.dictator < 10) {
    return { type: 'TRAIN' }
  }

  // 3.6 - Default: move toward rebels
  const pathToRebel = findPathToNearestRebel(sector)
  return { type: 'MOVE', target: pathToRebel[0] }
}
```

### Rebel Strength Calculation

```typescript
function calculateRebelStrength(sector: Sector): number {
  let total = 0

  for (const merc of getMercsInSector(sector)) {
    if (merc.owner !== 'dictator') {
      total += merc.health + merc.armor
    }
  }

  return total
}

function chooseWeakestRebelSector(sectors: Sector[]): Sector {
  let weakest = sectors[0]
  let minStrength = calculateRebelStrength(weakest)

  for (const sector of sectors.slice(1)) {
    const strength = calculateRebelStrength(sector)
    if (strength < minStrength) {
      minStrength = strength
      weakest = sector
    }
  }

  // Handle ties with random
  const tied = sectors.filter(s => calculateRebelStrength(s) === minStrength)
  if (tied.length > 1) {
    return tied[Math.floor(Math.random() * tied.length)]
  }

  return weakest
}
```

### Target Priority

```typescript
function selectAITarget(enemies: Unit[]): Unit {
  return enemies.sort((a, b) => {
    // 4.6.1 - Lowest health + armor
    const survA = a.health + a.armor
    const survB = b.health + b.armor
    if (survA !== survB) return survA - survB

    // 4.6.2 - Most targets
    if (a.targets !== b.targets) return b.targets - a.targets

    // 4.6.3 - Highest initiative
    if (a.initiative !== b.initiative) return b.initiative - a.initiative

    // 4.6.4 - Random
    return Math.random() - 0.5
  })[0]
}
```

### Base Location Selection

```typescript
function selectBaseLocation(industries: Sector[]): Sector {
  const rebelSectors = getRebelControlledSectors()

  // Sort by distance from rebels (furthest first)
  industries.sort((a, b) => {
    const distA = minDistanceToRebels(a, rebelSectors)
    const distB = minDistanceToRebels(b, rebelSectors)
    if (distA !== distB) return distB - distA

    // Tie: most defended
    const forceA = getDictatorForces(a)
    const forceB = getDictatorForces(b)
    if (forceA !== forceB) return forceB - forceA

    // Tie: highest value
    if (a.value !== b.value) return b.value - a.value

    // Tie: random
    return Math.random() - 0.5
  })

  return industries[0]
}
```
