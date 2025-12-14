# MERC Actions

> **PDF Reference:** rules-v6.6.pdf, Page 4 (Actions)

This document details all possible actions MERCs can take during the game.

---

## Action Summary

| Action | Cost | Description |
|--------|------|-------------|
| Hire MERCs | 2 actions | Draw 3 MERCs, choose to hire |
| Explore Sector | 1 action | Flip sector, gain equipment |
| Re-Equip | 1 action | Trade/swap equipment |
| Train Militia | 1 action | Add militia to sector |
| Move MERCs | 1 action | Move squad to adjacent sector |
| Hospital | 1 action | Fully heal (City only) |
| Arms Dealer | 1 action | Draw 1 equipment (City only) |

---

## Hire MERCs

> **Cost:** 2 actions

### Procedure

1. Draw the top **3 cards** from the MERC deck
2. Review the available MERCs
3. Choose which to hire (may hire 0, 1, 2, or all 3)
4. Discard unchosen MERCs

### Team Limit

You may only have MERCs up to your **team limit**:

```
Team Limit = 1 (free) + number of controlled sectors
```

**Example:** Control 3 sectors → may have 4 MERCs total.

### Placement

When you hire a MERC:
- If no squads on map: place in any friendly sector
- If squads exist: new MERC must join an existing squad

### Starting Equipment

Newly hired MERCs:
- Start with **0 actions** this turn
- Draw **1 equipment** from any deck (free)
- Equip it immediately

### Firing MERCs

During a Hire action, you may also **fire** a MERC:
1. Drop the MERC's equipment into the current sector's stash
2. Discard the MERC card

---

## Explore Sector

> **Cost:** 1 action

### Requirements

- MERC must be in an **unexplored** sector
- Sector has not been explored before

### Procedure

1. Look at the **3 loot icons** in the lower-left corner of the map card
2. Draw equipment from the respective decks:
   - Weapon icon → draw from Weapons deck
   - Armor icon → draw from Armor deck
   - Accessory icon → draw from Accessories deck
3. Flip the map card to its **explored side**
4. Perform a free **Re-Equip** (see below)

### Stashing Loot

Any equipment you cannot equip or choose not to equip:
- Place face-down under the sector card
- This forms the **sector stash**
- Available later via Re-Equip action

### One-Time Only

Once explored, a sector cannot be explored again.

---

## Re-Equip

> **Cost:** 1 action

### Options

1. **From Stash:** Take equipment from the sector stash and equip it
2. **Trade:** Exchange equipment with another MERC also taking Re-Equip

### Trading Requirements

- Both MERCs must be in the same sector
- Both MERCs must be spending a Re-Equip action
- Or trading occurs as part of Explore action

### Equipment Slots

Each MERC has:
- 1 Weapon slot
- 1 Armor slot
- 1 Accessory slot

To equip new gear in an occupied slot, the old item goes to the stash (or trade partner).

---

## Train Militia

> **Cost:** 1 action

### Procedure

1. The MERC trains militia equal to their **Training** skill
2. Place that many militia chits in the current sector

### Rules

- Militia are your color (Rebels) or black (Dictator)
- **Maximum 10 militia per side per sector**
- Multiple Rebels can train in the same sector

### Sector Control

Whoever has the **most militia** in a sector controls it.

When Rebels share a sector:
- Each Rebel's militia are tracked separately
- The Rebel with the most militia controls the sector
- In ties, control goes to... (the rules don't specify, likely first to claim)

---

## Move MERCs

> **Cost:** 1 action (for the entire squad)

### Procedure

1. Move squad pawn to an **adjacent** sector
2. Adjacent = orthogonal only (up, down, left, right)
3. **No diagonal movement**

### Squad Movement Rules

- **All MERCs in the squad must move together**
- All MERCs in the squad spend 1 action
- Cannot split a squad during movement

### Combat Trigger

If moving into an **enemy-occupied sector**, combat begins immediately.

> **See:** `07-combat-system.md`

---

## City Actions

> **PDF Reference:** rules-v6.6.pdf, Page 6 (Cities)

These actions are only available when in a **City** sector.

### Hospital

> **Cost:** 1 action

- **Fully heal** the MERC
- Restore health to maximum (3)

### Arms Dealer

> **Cost:** 1 action

- Draw **1 equipment** from any deck (Weapons, Armor, or Accessories)
- May then Re-Equip to use it

---

## Coordinated Attacks

> **PDF Reference:** rules-v6.6.pdf, Page 4 (Coordinated Attacks)

Two or more squads may attack the same sector simultaneously.

### Procedure

1. All attacking squads declare the same target sector
2. All squads move into the sector together
3. Combat begins with all attackers participating

### Diagram

```
                 [Target Sector]
                       ↑
         ┌─────────────┼─────────────┐
         │             │             │
    [Squad A]     [Squad B]     [Squad C]
    (Rebel 1)     (Rebel 1)     (Rebel 2)
```

All three squads attack simultaneously.

---

## Action Restrictions

### Same Squad Actions

MERCs in the same squad:
- Must move together (if any move, all move)
- May take different non-movement actions

### Different Squad Actions

MERCs in different squads:
- Act independently
- One squad can train while another attacks

### Zero-Action MERCs

Newly hired MERCs have 0 actions the turn they're hired.

---

## Free Actions

Some actions don't cost action points:

- **Gifting militia** to another Rebel
- **Requesting militia** from another Rebel
- **Splitting off a secondary squad** (can happen anytime, including combat)

---

## Implementation Notes

### Action Validation

```
canTakeAction(merc, action, sector) {
  if (merc.actionsRemaining < action.cost) return false

  switch(action) {
    case HIRE:
      return true // can always attempt, team limit checked after

    case EXPLORE:
      return !sector.explored

    case RE_EQUIP:
      return sector.stash.length > 0 || hasTradePartner(merc)

    case TRAIN:
      return getMilitiaCount(sector, merc.owner) < 10

    case MOVE:
      return getAdjacentSectors(sector).length > 0

    case HOSPITAL:
      return sector.type === 'city' && merc.health < 3

    case ARMS_DEALER:
      return sector.type === 'city'
  }
}
```

### UI Considerations

- Highlight available actions based on context
- Show action cost prominently
- Display team limit when hiring
- Show militia cap (10) progress
- Indicate explored vs unexplored sectors
