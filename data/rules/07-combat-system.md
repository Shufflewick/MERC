# Combat System

> **PDF Reference:** rules-v6.6.pdf, Pages 6-7 (Combat, An Example Combat)

This document describes how combat is resolved when opposing forces meet.

---

## Combat Overview

Combat occurs when:
- A squad moves into an enemy-occupied sector
- An enemy moves into your sector

Combat continues in **rounds** until one side is eliminated or retreats.

**Important:** Combat does **not** end your turn. You may take remaining actions after combat.

---

## Combat Round Structure

Each round of combat follows this sequence:

```
1. READY    → Determine initiative order
2. AIM      → Declare targets
3. FIRE     → Roll dice, apply damage
4. RETREAT? → Survivors may retreat (optional)
5. REPEAT   → Continue until one side remains
```

---

## Phase 1: Ready (Initiative)

### Determining Order

Initiative determines who acts first **per individual unit**, not per team.

| Unit Type | Initiative |
|-----------|------------|
| MERCs | Individual Initiative stat (+ equipment bonuses) |
| Militia | Always 2 |

### Ordering Rules

1. Sort all units (both sides) by Initiative, highest first
2. **Ties favor the Dictator**
3. Turn order alternates between sides at same Initiative

### Why Initiative Matters

Units act individually in initiative order. Since damage is applied **immediately**, a unit with higher initiative can kill an enemy before that enemy gets to act.

**Example Order:**
```
Initiative 4: Rebel MERC "Fox"
Initiative 3: Rebel MERC "Rizen"
Initiative 2: Dictator militia (x5)
Initiative 2: Rebel MERC "Surgeon"  ← Dictator wins tie
Initiative 1: Dictator MERC "Shadkaam"
```

In this case, militia would act before Surgeon due to the Dictator tie-breaker.

---

## Phase 2: Aim (Target Declaration)

### Declaring Targets

When a unit is about to fire, they must **declare a target**.

Valid targets:
- Enemy MERCs
- Enemy militia (each militia is a separate target)
- Attack dogs (if in play)

### Multiple Targets

Some units can target more than one enemy:
- MERCs may have Targets > 1 (from stats or equipment)
- Certain weapons allow additional targets

**All targets must be declared before rolling.**

---

## Phase 3: Fire (Damage Resolution)

### Step 1: Determine Hits

Roll a number of **d6** equal to the unit's **Combat** stat.

| Roll | Result |
|------|--------|
| 1-3 | Miss |
| 4-6 | Hit |

**Example:** Combat 3 → Roll 3d6. Results: 2, 4, 6 = 2 hits.

### Step 2: Determine Damage

- Each **hit** deals **1 damage**
- Each **miss** deals **0 damage**

### Step 3: Distribute Damage

If targeting multiple enemies, the attacker chooses how to distribute hits among declared targets.

**Example:** 4 hits against 2 targets → could do 2 damage to each, or 3 to one and 1 to another.

### Step 4: Account for Armor

Damage hits **Armor before Health**.

1. Apply damage to armor first
2. When armor reaches 0, discard the armor equipment
3. Remaining damage carries over to Health

**Armor Piercing:** Some weapons ignore armor entirely.

**Militia:** Have no armor (damage goes directly to their 1 Health).

### Step 5: Apply Health Damage

- Place damage chits on MERCs to track health loss
- Militia with any damage are **immediately dead**

---

## Death

### MERC Death

When a MERC's health reaches **0**:
1. The MERC is **dead**
2. Discard the MERC card
3. Discard all equipped equipment

### Militia Death

When militia take **any** damage:
1. The militia is dead
2. Remove the chit from the map

### Total Party Kill

If all your MERCs die:
- You can hire new MERCs on your next turn
- See Hire MERCs action

---

## Phase 4: Retreat (Optional)

At the **end of any combat round**, surviving MERCs may choose to retreat.

### Retreat Requirements

1. There must be an **adjacent sector** that is:
   - Unoccupied, OR
   - Friendly (controlled by you or ally)
2. Adjacent = orthogonal only (no diagonal)

### Retreat Rules

- **Entire squad must retreat together**
- If one MERC in a squad retreats, all must retreat
- Militia **cannot retreat** (they stand their ground)

### Tactical Note: "Run and Gun"

You can use retreat to move through an enemy sector:
1. Attack sector
2. Fight one or more rounds
3. Retreat to the far side

This is risky but can bypass defenders.

---

## Combat Continuation

Combat continues for as many rounds as necessary until:
- One side is completely eliminated (dead or retreated)
- All remaining enemies are militia and all MERCs retreat

---

## Squad Splitting in Combat

> **PDF Reference:** rules-v6.6.pdf, Page 3 (Squads)

You may split off a secondary squad at **any time**, including during combat.

**Use Case:** One MERC needs to retreat, but others want to stay and fight.

1. Break off the retreating MERC(s) into the secondary squad
2. Secondary squad retreats
3. Primary squad continues fighting

---

## Combat Example

> **PDF Reference:** rules-v6.6.pdf, Page 7 (An Example Combat)

### Setup

**Dictator Forces:**
- 7 militia (Initiative 2, Combat 1 each)
- Shadkaam (Initiative 2, Combat 6, Armor 1)

**Rebel Forces:**
- Rizen (Initiative 3, Combat 6, special: unlimited militia targets)
- Surgeon (Initiative -1, Combat 7, Targets 5, Armor 2, special: heal self)

### Round 1

**Initiative Order:** Rizen (3) → Shadkaam & militia (2) → Surgeon (-1)

1. **Rizen** (Init 3): Targets all militia. Rolls 6d6 → 4 hits. Kills 4 militia.

2. **Shadkaam** (Init 2): Targets Surgeon. Rolls 6d6 → 2 hits. Destroys Surgeon's armor (2). No health damage.

3. **Remaining 3 militia** (Init 2): All target Surgeon. Roll 1d6 each. 2 hits → 2 damage to Surgeon (now at 1 health).

4. **Surgeon** (Init -1): Uses ability to discard 2 combat dice and heal to full. Targets 3 militia + Shadkaam (4 targets). Rolls 5d6 → 4 hits. Assigns all 4 to Shadkaam (Armor 1 + Health 3 = 4). Shadkaam dies. Mortar discarded (1-use).

**End Round 1:** 3 militia remain. Rebels choose to continue.

### Round 2

**Initiative Order:** Rizen (3) → militia (2) → Surgeon (2, lost equipment)

1. **Rizen** (Init 3): Targets militia. Rolls 6d6 → 3 hits. Kills all 3 militia.

**Combat Over.** Rebels control the sector.

---

## Implementation Notes

### Combat State Machine

```
interface CombatState {
  attackers: Unit[]
  defenders: Unit[]
  round: number
  initiativeOrder: Unit[]
  currentUnitIndex: number
  phase: 'AIM' | 'FIRE' | 'RETREAT_DECISION'
}

resolveCombat(attackingSector, defendingSector) {
  // Gather all units
  // Sort by initiative (Dictator wins ties)
  // Loop through rounds until one side eliminated

  while (bothSidesHaveUnits()) {
    for (unit of initiativeOrder) {
      if (unit.isDead) continue

      targets = declareTargets(unit)
      hits = rollCombat(unit.combat)
      distributeDamage(hits, targets)
      removeDeadUnits()
    }

    if (offersRetreat()) {
      handleRetreats()
    }
  }

  return determineVictor()
}
```

### Dice Rolling

```
rollCombat(combatValue: number): number {
  let hits = 0
  for (let i = 0; i < combatValue; i++) {
    const roll = Math.floor(Math.random() * 6) + 1
    if (roll >= 4) hits++
  }
  return hits
}
```

### UI Considerations

- Show initiative order clearly
- Animate dice rolls
- Show damage application step by step
- Highlight valid retreat paths
- Confirm retreat decisions
- Track armor vs health damage separately
