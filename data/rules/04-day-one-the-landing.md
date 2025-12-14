# Day 1 - The Landing

> **PDF Reference:** rules-v6.6.pdf, Page 2 (Starting The Game - Day 1)

Day 1 is a special setup round where the invasion begins. It follows different rules than Days 2-6.

---

## Day 1 Overview

Day 1 consists of:
1. **Rebel Phase** - Hire MERCs, land on map, equip
2. **Dictator Phase** - Place militia, hire MERC, setup abilities, draw hand, place extra militia

---

## Rebel Phase (Day 1)

### Step 1: Hire Starting MERCs

Each Rebel performs a **Hire action** to get their first 2 MERCs:

1. Draw 3 cards from the top of the MERC deck
2. Choose which MERCs to hire (may hire 1, 2, or all 3)
3. Discard unchosen MERCs

**Cost:** The first 2 MERCs are **free** (no sector control required).

### Step 2: Choose Landing Sector

Each Rebel places their **primary squad pawn** on a sector along the **edge of the map**.

**Valid Landing Sectors:**
- Any sector on the outer edge of the map
- Cannot land on a sector another Rebel has claimed

**Strategic Considerations:**
- Higher value sectors are more valuable but also more contested
- Consider city positions (for Hospital/Arms Dealer access)
- Consider positioning relative to other Rebels
- Remember: valuable sectors are also valuable to the Dictator

> **Tip:** Work out a "landing strategy" before placing pawns. Coordinate who takes which sectors.

### Step 3: Equip Starting Equipment

For each newly hired MERC:

1. Draw 1 piece of equipment from **any** equipment deck (Weapons, Armor, or Accessories)
2. Equip it on the MERC

This starting equipment is **free**.

### Step 4: Take Control

Each Rebel now **controls** the sector they landed on.

---

## Rebel Phase Complete

The Rebels' Day 1 turn is complete when:
- [x] Each Rebel has hired 2 MERCs
- [x] Each Rebel has placed their primary squad pawn on an edge sector
- [x] Each MERC has been equipped with 1 piece of starting equipment
- [x] Each Rebel controls their landing sector

---

## Dictator Phase (Day 1)

### Step 1: Place Initial Militia

Place black militia chits on **each unoccupied Industry**:

- Number of militia = **Difficulty** value from Game Size table
- Only on Industries the Dictator controls (not Rebel-occupied)
- Wilderness and Cities do not receive militia

**Example (3 Rebels, Difficulty 4):**
Each unoccupied Industry gets 4 militia.

### Step 2: Hire Dictator's First MERC

1. Draw 1 card from the top of the MERC deck (random, no choice)
2. This MERC forms the Dictator's **primary squad**
3. Place the squad on any sector the Dictator controls

> **Note:** The Dictator does not get free starting equipment for this MERC.

### Step 3: Check Dictator Special Ability

Read the selected Dictator card for any **starting setup information** in the special ability text.

Some Dictators have abilities that trigger during setup.

### Step 4: Draw Tactics Hand

The Dictator draws cards from the Active Dictator Tactics deck until hand contains **3 cards**.

### Step 5: Place Extra Militia

The Dictator may distribute **Extra** militia (from Game Size table) on Dictator-controlled sectors:

- May be placed on any Dictator-controlled sector(s)
- May be split across multiple sectors
- Still subject to **10 militia per sector maximum**

**Example (3 Rebels, Extra = 9):**
The Dictator can place 9 additional militia, distributed however desired, on sectors they control.

---

## Dictator Phase Complete

The Dictator's Day 1 turn is complete when:
- [x] Initial militia placed on unoccupied Industries (Difficulty count each)
- [x] 1 MERC hired and placed
- [x] Dictator special ability setup checked
- [x] Hand filled to 3 Tactics cards
- [x] Extra militia distributed

---

## Day 1 Complete

**Proceed to Day 2 (see `05-main-game-loop.md`)**

---

## State After Day 1

```
gameState = {
  currentDay: 1

  map: {
    // Rebel landing sectors: controlled by respective Rebels
    // Unoccupied Industries: have Difficulty militia each
    // Other sectors: uncontrolled, no militia
  }

  dictator: {
    hand: TacticsCard[3]
    tacticsDeck: TacticsCard[2] // 5 - 3 drawn
    mercs: [MERC] // 1 random MERC
    primarySquad: { sector: SectorRef, mercs: [MERC] }
    militia: {
      // Difficulty militia on each unoccupied Industry
      // Plus Extra militia distributed
    }
  }

  rebels: [{
    mercs: [MERC, MERC] // 2 hired MERCs
    primarySquad: { sector: EdgeSector, mercs: [MERC, MERC] }
    // Each MERC has 1 equipment
  }]
}
```

---

## Implementation Notes

### Day 1 Specific Logic

1. **Landing Validation:**
   - Sector must be on map edge
   - Sector must not be claimed by another Rebel

2. **Hiring Logic (Day 1):**
   - Skip team limit check (first 2 are free)
   - Draw 3, pick 1-3

3. **Equipment Selection:**
   - Allow choice of which deck to draw from
   - Auto-equip (no stash exists yet)

4. **Dictator Militia Placement:**
   - Calculate which Industries are unoccupied
   - Place Difficulty militia on each
   - Track extra militia budget
   - Enforce 10 max per sector

### UI Considerations

- Show available edge sectors for landing
- Highlight Industries that will receive Dictator militia
- Display Difficulty and Extra values from config
- Allow Rebels to coordinate landing strategy
