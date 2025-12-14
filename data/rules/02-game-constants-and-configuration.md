# Game Constants and Configuration

> **PDF Reference:** rules-v6.6.pdf, Page 2 (Setup chart)

This document defines the scaling tables and configuration values that vary based on player count and difficulty settings.

---

## Game Size Configuration

The following table determines map size and sector distribution based on number of Rebel players.

| Rebels | Map Size | Industries | Cities | Wilderness | Difficulty | Extra Militia |
|--------|----------|------------|--------|------------|------------|---------------|
| 1*     | 3x3 (9)  | 4          | 1      | 4          | 2          | 0             |
| 2      | 3x4 (12) | 6          | 1      | 5          | 3          | 4             |
| 3      | 4x4 (16) | 8          | 1      | 7          | 4          | 9             |
| 4*     | 4x5 (20) | 10         | 2      | 8          | 5          | 12            |
| 5*     | 5x5 (25) | 12         | 2      | 11         | 6          | 15            |
| 6*     | 5x6 (30) | 13         | 3      | 14         | 7          | 18            |

*\* Only possible with the Jagged Alliance expansion.*

> **Implementation Note:** This table is in `../setup.json` for runtime lookup.

---

## Column Definitions

### Map Size
- Format: `columns x rows`
- Total sectors = columns × rows

### Sector Counts
- **Industries:** Must be placed in checkerboard pattern (no two adjacent)
- **Cities:** Strategic value, provide Hospital and Arms Dealer
- **Wilderness:** Low value filler sectors

### Difficulty
- Number of militia the Dictator places on each unoccupied industry at start
- Can be adjusted by players for harder/easier games

### Extra Militia
- Additional militia the Dictator can distribute on Day 1
- Placed after initial difficulty-based placement
- Still subject to 10 militia per sector maximum

---

## Fixed Game Constants

### Combat Constants

| Constant | Value | Description |
|----------|-------|-------------|
| Hit Threshold | 4+ | Dice roll of 4, 5, or 6 is a hit |
| Dice Type | d6 | Six-sided dice |
| Militia Initiative | 2 | Fixed initiative for all militia |
| Militia Combat | 1 | Militia roll 1 die each |
| Militia Health | 1 | Militia die in one hit |

### MERC Constants

| Constant | Value | Description |
|----------|-------|-------------|
| Base Health | 3 | All MERCs start with 3 health |
| Base Targets | 1 | All MERCs can target 1 enemy by default |
| Base Armor | 0 | All MERCs start with 0 armor |
| Actions Per Day | 2 | All MERCs have 2 actions |
| Skill Range | 0-3 | Typical skill value range (can go higher) |

### Sector Constants

| Constant | Value | Description |
|----------|-------|-------------|
| Max Militia Per Side | 10 | Maximum militia per faction per sector |
| Explore Loot | Varies | Determined by icons on unexplored side |

### Team Constants

| Constant | Value | Description |
|----------|-------|-------------|
| Free MERCs | 1 | First MERC is always free |
| Starting MERCs | 2 | Rebels hire 2 MERCs on Day 1 |
| Max Squads | 2 | Primary and Secondary |
| Team Limit Formula | 1 + sectors | One MERC per controlled sector + free MERC |

### Dictator Constants

| Constant | Value | Description |
|----------|-------|-------------|
| Starting MERCs | 1 | Dictator hires 1 random MERC on Day 1 |
| Hand Size | 3 | Dictator fills hand to 3 Tactics cards |
| Active Tactics Cards | 5 | Number of Tactics cards in play |
| Team Limit | None | Dictator has no team limit |

### Reinforce Formula

When the Dictator discards a Tactics card to reinforce:

```
Militia Gained = floor(Rebel Players / 2) + 1
```

| Rebels | Reinforcement |
|--------|---------------|
| 1      | 1             |
| 2      | 2             |
| 3      | 2             |
| 4      | 3             |
| 5      | 3             |
| 6      | 4             |

---

## Game Duration

| Constant | Value | Description |
|----------|-------|-------------|
| Total Days | 6 | 1 setup day + 5 play days |
| Day 1 | Setup | Special landing round |
| Days 2-6 | Play | Normal action rounds |

---

## Adjacency Rules

- **Orthogonal Only:** Up, Down, Left, Right
- **No Diagonal:** Movement and placement never use diagonal adjacency
- Applies to: Movement, Militia placement, Retreat, Base proximity calculations

---

## Tie-Breaking Rules

| Situation | Tie Resolution |
|-----------|----------------|
| Initiative ties | Dictator wins |
| Sector control ties | Dictator wins |
| Victory point ties | Dictator wins |

---

## Expansion Additions (Jagged Alliance)

The expansion adds:

| Component | Base | Expansion | Total |
|-----------|------|-----------|-------|
| MERCs | 47 | +5 | 52 |
| Map Sectors | 16 | +14 | 30 |
| Equipment | 69 | +58 | 127 |
| Dictators | 2 | +9 | 11 |
| Dictator Tactics | 10 | +4 | 14 |
| Player Colors | 4 | +3 | 7 |

Expansion enables:
- Solo play (1 Rebel)
- 5-7 player games
- Dictator AI
- 4 new game modes
