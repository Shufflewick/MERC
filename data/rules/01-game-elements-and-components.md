# Game Elements and Components

> **PDF Reference:** rules-v6.6.pdf, Page 1 (Components), Page 3 (MERCs, Attributes, Skills)

This document defines all the core "nouns" of the game - the entities, their properties, and their relationships.

---

## MERCs

MERCs are the primary actors in the game. Each MERC card represents a mercenary with unique skills and abilities.

### Attributes

Attributes are inherent traits all MERCs share. Final values are calculated by summing the base MERC value plus any equipped equipment bonuses.

| Attribute | Description | Default |
|-----------|-------------|---------|
| Health | Ability to absorb damage. At 0, the MERC is dead. | 3 |
| Targets | Number of enemies a MERC can assign damage to when attacking | 1 |
| Armor | Prevents health from being reduced. Damage hits armor first. | 0 |
| Actions | Number of actions a MERC can perform per day | 2 |

### Skills

All MERCs have 3 skills with values generally ranging from 0-3 (some can go higher).

| Skill | Description |
|-------|-------------|
| Initiative | Determines turn order in combat. Higher goes first. |
| Training | Determines how many militia can be trained per action (1 militia per point) |
| Combat | Determines number of d6 rolled when attacking |

### MERC Card Anatomy

```
┌─────────────────────────────┐
│  [A] Photo                  │
│                             │
│  [B] Personality (white)    │
│  [C] Special Abilities      │
│      (yellow)               │
│                             │
│  [D] Name                   │
│                             │
│  [F] Weapons ←──────────────┤ [E] Armor
│  [H] Skills                 │
│  [I] Attributes             │
│  [G] Accessories            │
└─────────────────────────────┘
```

> **Implementation Note:** MERC data is in `../mercs.json`. Images are in `/mercs/{name}.jpg` (e.g., `/mercs/rizen.jpg`, `/mercs/surgeon.jpg`).

---

## Equipment

> **PDF Reference:** rules-v6.6.pdf, Page 5 (Equipment)

Equipment provides bonuses to attributes and skills, plus special abilities.

### Equipment Types

| Type | Slot | Description |
|------|------|-------------|
| Weapons | F slot | Primarily boost Combat, may add Targets or special abilities |
| Armor | E slot | Provides Armor rating, absorbs damage before Health |
| Accessories | G slot | Various utility bonuses and special abilities |

### Equipment Properties

- Equipment cards slide under the MERC card to show critical values
- When a deck is empty, reshuffle the discard pile
- Damaged equipment cannot be stashed (must be discarded)

### Sector Stash

- Equipment that cannot be carried goes under the sector card
- Available via "Re-Equip" action
- Contents are not public knowledge

> **Implementation Note:** Equipment data is in `../equipment.json`. Images not yet available.

---

## Sectors (Map Cards)

> **PDF Reference:** rules-v6.6.pdf, Page 6 (Sectors)

Sectors are map tiles that make up the game board. Each sector has two sides: unexplored (brighter, shows loot icons) and explored (darker, shows details).

### Sector Types

| Type | Strategic Value | Point Value | Special Abilities |
|------|-----------------|-------------|-------------------|
| Wilderness | Low | Low | None |
| City | High (strategic) | Low | Hospital, Arms Dealer |
| Industry | High | High | Extra equipment from exploration |

### City Abilities

| Ability | Cost | Effect |
|---------|------|--------|
| Hospital | 1 action | Fully heal the MERC |
| Arms Dealer | 1 action | Draw 1 equipment from any deck |

### Sector Properties

- **Value:** Point value for victory calculation (number on card)
- **Loot Icons:** Show equipment gained when explored (bottom-left corner)
- **Control:** Determined by whoever has the most units on it

> **Implementation Note:** Sector data is in `../sectors.json`. Images are in `/sectors/` (e.g., `/sectors/industry---gold.jpg`, `/sectors/town---a.jpg`, `/sectors/wilderness.jpg`).

---

## Dictators

> **PDF Reference:** rules-v6.6.pdf, Page 5 (The Dictator, Dictator Card)

Dictator cards represent the antagonist the Rebels must overthrow.

### Dictator Properties

- **Special Ability:** Unique power (in yellow) usable every turn
- **Stats:** Functions like a MERC when in play (after base revealed)
- **Protection:** Cannot be attacked until all other Dictator units in sector are defeated

> **Implementation Note:** Dictator data is in `../dictators.json`. Images not yet available.

---

## Dictator Tactics Cards

> **PDF Reference:** rules-v6.6.pdf, Page 2 (Setup - Dictator Tactics)

Cards representing the evil actions the Dictator can unleash on the Rebels.

### Usage

- Dictator draws 5 random cards at setup to form Active deck
- Fills hand to 3 cards
- Plays 1 card per turn (or discards to Reinforce)
- Game ends when deck and hand are empty

> **Implementation Note:** Dictator Tactics data is in `../dictator-tactics.json`. Images not yet available.

---

## Militia

> **PDF Reference:** rules-v6.6.pdf, Page 5 (Militia)

Militia are non-MERC units that defend sectors.

### Fixed Stats

| Stat | Value |
|------|-------|
| Initiative | 2 |
| Combat | 1 (rolls 1 die) |
| Health | 1 (dies if hit) |
| Armor | 0 |

### Limitations

- Cannot heal, move, hire, train, or take any actions
- Cannot use equipment
- Cannot retreat from combat
- Maximum 10 militia per sector per side

### Gifting

- Militia can be gifted to another Rebel as a free action
- Change chit colors when gifting

---

## Physical Components

> **PDF Reference:** rules-v6.6.pdf, Page 1 (Components)

| Component | Description | Quantity |
|-----------|-------------|----------|
| MERC Deck | Mercenary cards | 47 base (+5 expansion) |
| Map Deck | Sector tiles | 16 base (+14 expansion) |
| Equipment Deck | Weapons, Armor, Accessories | 69 base (+58 expansion) |
| Dictators Deck | Dictator cards | 2 base (+9 expansion) |
| Dictator Tactics Deck | Evil action cards | 10 base (+4 expansion) |
| D6 | Six-sided dice | 10 |
| Chits | Colored counters (7 colors) | Multiple stacks |
| Pawns | Large + Small per player color | 4 colors base (+3 expansion) |
| Base Token | Dictator's base marker | 1 |
| Player Mats | Reference cards | 1 Dictator + 3 Rebel (+3 expansion) |

---

## Squads and Teams

> **PDF Reference:** rules-v6.6.pdf, Page 3 (Teams, Squads)

### Teams

- A team is the total sum of a player's MERCs
- First MERC is always free
- Team limit = 1 + number of controlled sectors
- Must always have at least 1 MERC if MERCs remain in deck

### Squads

- A squad is a sub-group of your team
- Maximum 2 squads: Primary (large pawn) and Secondary (small pawn)
- Squads act independently
- All members of a squad move together
- All members retreat together
- Can split off secondary squad at any time (including during combat)

---

## Pawns and Markers

| Marker | Purpose |
|--------|---------|
| Large Pawn | Primary squad location |
| Small Pawn | Secondary squad location |
| Black Chits | Dictator's militia |
| Colored Chits | Rebel militia (matches pawn color) |
| Damage Chits | Placed on MERCs to track health loss |
| Base Token | Marks Dictator's base location |
