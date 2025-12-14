# Militia System

> **PDF Reference:** rules-v6.6.pdf, Page 5 (Militia)

Militia are non-MERC units that serve as the backbone of sector defense.

---

## Militia Overview

Militia are trained local forces that defend sectors. They cannot take actions like MERCs but are essential for holding territory.

---

## Militia Stats

All militia have **fixed stats** that cannot be modified:

| Stat | Value | Notes |
|------|-------|-------|
| Initiative | 2 | Fixed, cannot be modified |
| Combat | 1 | Rolls 1d6 per militia |
| Health | 1 | Dies if hit |
| Armor | 0 | No armor, damage goes directly to health |
| Targets | 1 | Can only target one enemy |

---

## Training Militia

> **See also:** `06-merc-actions.md` (Train Militia action)

### Training Action

**Cost:** 1 action per MERC

**Effect:** Add militia equal to the MERC's **Training** skill to the current sector.

**Example:** A MERC with Training 2 adds 2 militia with one action.

### Militia Placement

- Militia are placed in the sector the MERC occupies
- Use colored chits matching the player (Rebels) or black (Dictator)
- Track count per sector

---

## Militia Limits

### Per-Sector Maximum

**Maximum 10 militia per side per sector.**

This means:
- Dictator can have up to 10 militia in a sector
- All Rebels combined can have up to 10 militia in a sector
- In a contested sector: 10 Dictator + 10 Rebel militia possible

### Exception

Dictator Kim's special ability may override this limit (check Dictator card).

### Training Beyond the Cap

If training would exceed 10:
- Only train up to the cap
- Excess training is wasted

---

## Sector Control via Militia

### Control Rules

Whoever has the **most units** in a sector controls it.

Units include:
- MERCs
- Militia

### Multi-Rebel Sectors

When multiple Rebels have militia in the same sector:
- Track each Rebel's militia separately
- The Rebel with the most militia controls the sector
- MERCs count toward the Rebel's unit total

**Example:**
- Rebel A: 4 militia + 1 MERC = 5 units
- Rebel B: 6 militia = 6 units
- Rebel B controls the sector

### Ties

Ties in sector control favor the **Dictator**.

---

## Militia Limitations

Militia are severely limited compared to MERCs:

| Action | Can Militia Do It? |
|--------|-------------------|
| Move | No |
| Attack | Only defend (automatic in combat) |
| Hire | No |
| Train | No |
| Explore | No |
| Re-Equip | No |
| Use Equipment | No |
| Heal | No |
| Retreat | No |

**Summary:** Militia can **only** defend sectors in combat. They do nothing else.

---

## Militia in Combat

### Automatic Participation

When combat occurs in a sector:
- All militia in the sector automatically participate
- They fight alongside MERCs

### Initiative

All militia act at **Initiative 2**.

If multiple militia are present:
- They all act at the same initiative
- In ties with other units at Initiative 2, **Dictator wins**

### Attacking

Each militia:
1. Targets one enemy
2. Rolls 1d6
3. Hits on 4+
4. Deals 1 damage on hit

### Taking Damage

If a militia takes **any damage**, it dies.
- Remove the chit from the map
- No damage tracking needed

### Cannot Retreat

Militia **cannot retreat** from combat.
- They fight until dead
- They cannot leave a sector for any reason

---

## Gifting Militia

> **PDF Reference:** rules-v6.6.pdf, Page 5 (Militia - gifting)

### Gifting Rules

As a **free action**, you may:
- Give militia to another Rebel
- Request militia from another Rebel

### How to Gift

1. Announce the gift
2. Replace your colored chits with the receiving Rebel's colored chits
3. The militia now belong to the new owner

### Gift Restrictions

- Both players must agree (request can be declined)
- Can only gift to other Rebels
- Cannot gift to/from the Dictator

---

## Dictator Militia

### Dictator Militia Sources

The Dictator gains militia through:

1. **Initial Setup** - Difficulty militia on each unoccupied Industry
2. **Extra Militia** - Distributed on Day 1 per Game Size table
3. **Reinforce Action** - Discard Tactics card to add militia
4. **Dictator Tactics Cards** - Some cards add militia
5. **Special Ability** - Some Dictators can add militia

### Dictator Militia Color

Dictator militia use **black chits**.

---

## Implementation Notes

### Data Structure

```typescript
interface Sector {
  id: string
  type: 'industry' | 'city' | 'wilderness'
  explored: boolean
  militia: {
    [playerId: string]: number  // player ID → count
    dictator: number
  }
  stash: Equipment[]
}

// Helper functions
function getMilitiaCount(sector: Sector, owner: string): number
function getControllingPlayer(sector: Sector): string | null
function canTrainMilitia(sector: Sector, owner: string): boolean
function trainMilitia(sector: Sector, owner: string, count: number): void
function giftMilitia(sector: Sector, from: string, to: string, count: number): void
```

### Control Calculation

```typescript
function calculateControl(sector: Sector): string | null {
  const dictatorUnits = sector.militia.dictator + getDictatorMercsInSector(sector)

  let maxRebelUnits = 0
  let controllingRebel = null

  for (const rebel of rebels) {
    const rebelUnits = sector.militia[rebel.id] + getRebelMercsInSector(sector, rebel.id)
    if (rebelUnits > maxRebelUnits) {
      maxRebelUnits = rebelUnits
      controllingRebel = rebel.id
    }
  }

  // Dictator wins ties
  if (dictatorUnits >= maxRebelUnits && dictatorUnits > 0) {
    return 'dictator'
  }

  return controllingRebel
}
```

### UI Considerations

- Show militia count per player per sector
- Color-code militia by owner
- Show progress toward 10-militia cap
- Indicate who controls each sector
- Animate militia training/removal
