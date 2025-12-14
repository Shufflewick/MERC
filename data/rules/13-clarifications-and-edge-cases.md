# Clarifications and Edge Cases

> **PDF Reference:** rules-v6.6.pdf, Page 4 (MERC Clarifications), Page 5 (Equipment Clarifications), Page 8 (FAQ)

This document addresses specific MERC abilities, equipment edge cases, and frequently asked questions.

---

## MERC Clarifications

### Ewok

**Ability:** Can take 1 more action than her squad.

**Clarification:**
- She gets 3 actions instead of 2
- Other squad members do **not** get extra actions
- May need to split into secondary squad to use the extra action
- Example: Squad moves (1 action each), Ewok can still train (her 2nd action), but squad can't

### Gunther

**Ability:** Can use accessories instead of armor or weapons.

**Clarification:**
- Can equip accessories in the armor slot
- Can equip accessories in the weapon slot
- Allows carrying multiple accessories
- Choice is made per slot

### Haarg

**Ability:** Gets +1 to any skill/attribute where someone else has a higher value.

**Clarification:**
- Compare to all other units in combat
- If anyone has higher Initiative → Haarg gets +1 Initiative
- If anyone has higher Combat → Haarg gets +1 Combat
- Can get bonuses to multiple stats simultaneously
- Recalculates each combat round

### Preaction

**Ability:** Heal ability.

**Clarification:**
- Can only heal **himself**, not other MERCs
- See MERC card for specific mechanics

### Rizen

**Ability:** Can target all militia with his attack.

**Clarification:**
- Normally a MERC can only target 1 militia at a time
- Rizen can target **all militia** in the sector
- If there are 10 militia, he can have 10 targets
- Can still add additional targets from weapons
- Only applies when targeting militia (not MERCs)

### Snake

**Ability:** Bonus when alone.

**Clarification:**
- Only gets ability if he is the **sole member** of his squad
- Other squads can exist, but Snake must be alone in his
- Splitting off into secondary squad triggers ability

### Vandal

**Ability:** Fires twice.

**Clarification:**
- First shot: Normal initiative position
- Second shot: After everyone else has fired **this round**
- Both shots are in the same combat round
- Can target same or different enemies

---

## Equipment Clarifications

### Land Mine

**Timing Clarification:**
- Must trigger **before combat begins** for full effect
- If you forget and remember mid-combat, it goes off when you remember
- Deals damage to whoever remains at that moment
- If forgotten entirely, enemy "side-stepped" the minefield

**AI Behavior:**
- AI always detonates mines when attacked (see Dictator AI doc)
- AI leaves mines in stash (doesn't equip)

### Grenades

**Combat Bonus Stacking:**
- Gun with +2 Combat stacks with grenade
- First round: Combined bonus (grenade + weapon)
- After grenade thrown: Only weapon bonus remains
- Stats auto-adjust when grenade is discarded

### One-Use Items

Items marked as one-use (mortars, grenades, etc.):
- Discard after use
- Cannot be stashed after use
- Effect resolves before discard

### Armor Piercing

Weapons with armor piercing:
- Ignore target's armor completely
- Damage goes directly to health
- Does not destroy armor equipment (just bypasses it)

### Repair Kits

- Used to repair damaged armor equipment
- AI always leaves these in stash

---

## Frequently Asked Questions

### Movement

**Q: Can I move diagonally?**
A: No. Adjacency always means orthogonal (up, down, left, right), never diagonal.

**Q: Can the Dictator place militia diagonally?**
A: No. Same rule applies to all placement.

### Militia

**Q: Can militia do _____?**
A: No. Militia can only defend sectors. They cannot:
- Heal
- Move
- Hire
- Train
- Use equipment
- Take any other action

**Q: Can there be more than 10 militia from a side in a sector?**
A: No. Maximum is always 10 per side, except for Dictator Kim's special ability.

**Q: When two Rebels team up in a sector, can they have 20 militia?**
A: No. Combined Rebel militia is still capped at 10.

### MERCs

**Q: Can a MERC heal themselves?**
A: Yes, if they have an ability or equipment that enables it.

**Q: Can one MERC train/hire while another MERC moves?**
A: Yes, if they are in **different squads**. MERCs in the same squad must move together.

**Q: Can two MERCs each perform a hire action?**
A: Yes. Each would draw 3 potential MERCs. This does **not** increase team limit.

### Equipment

**Q: How does more equipment get added after setup?**
A: Through:
- Exploring sectors
- Hiring new MERCs (free equipment)
- Arms Dealer action (cities)

**Q: When can I look at equipment in a sector stash?**
A: Anytime you control the sector.

**Q: If I have a gun with +2 combat, does it help when throwing a grenade?**
A: Yes. First round combines both bonuses. After grenade is thrown, stats adjust to weapon only.

### Combat

**Q: It seems impossible for a MERC to take out a group of militia. Any tricks?**
A: Militia are meant to be tough. Best strategies:
- Area effect weapons (grenades, burst fire)
- Weapons that hit multiple targets
- Coordinated attacks with other Rebels

**Q: It seems impossible to take out MERCs with militia. Any tricks?**
A: Heavily equipped MERCs are hard to kill. Strategies:
- Snowball effect: All militia target weakest MERC first
- Reduce enemy action economy
- Keep your MERCs nearby to defend militia

### Sectors

**Q: If I lose control of a sector, do I lose a MERC?**
A: No. You don't need to fire anyone. However, you **cannot take a hire action** if over team limit.

### Targets

**Q: What if I can hit 3 targets but only have 2 available?**
A: You can only hit as many targets as you can see/exist.

---

## Ambiguous Situations

These situations aren't explicitly covered in rules. Suggested interpretations:

### Tied Sector Control (Rebels)

When multiple Rebels have equal units in a sector:
- **Suggestion:** First to enter controls, or resolve cooperatively

### Empty MERC Deck

If no MERCs remain to hire:
- **Suggestion:** Reshuffle discard pile, or no hiring possible

### MERC with 0 Health from Start

If equipment/ability would set health to 0:
- **Suggestion:** Minimum health is 1, or MERC cannot be hired

### Simultaneous Deaths

If two units kill each other simultaneously:
- **Suggestion:** Both die (damage is assigned, then deaths resolved)

### Retreat Destination Attacked

If retreat sector becomes hostile mid-combat:
- **Suggestion:** Choose new valid sector, or cannot retreat

---

## Implementation Notes

### Special Ability Registry

```typescript
const mercAbilities: Record<string, MercAbility> = {
  'ewok': {
    type: 'EXTRA_ACTIONS',
    extraActions: 1,
    appliesTo: 'self'
  },
  'gunther': {
    type: 'FLEXIBLE_SLOTS',
    allowAccessoryIn: ['weapon', 'armor']
  },
  'haarg': {
    type: 'COMPARATIVE_BONUS',
    bonus: 1,
    compareTo: 'all_units',
    stats: ['initiative', 'combat', 'training']
  },
  'rizen': {
    type: 'MULTI_TARGET',
    condition: 'militia_only',
    targets: 'unlimited'
  },
  'snake': {
    type: 'SOLO_BONUS',
    condition: 'alone_in_squad'
  },
  'vandal': {
    type: 'DOUBLE_ATTACK',
    secondAttackTiming: 'end_of_round'
  }
}
```

### Edge Case Handlers

```typescript
function handleEdgeCase(situation: string, context: GameContext): Resolution {
  switch (situation) {
    case 'TIED_REBEL_CONTROL':
      // First to enter or cooperative decision
      return promptCooperativeDecision(context)

    case 'EMPTY_MERC_DECK':
      // Reshuffle discard
      return reshuffleMercDiscard()

    case 'SIMULTANEOUS_DEATH':
      // Both die
      return { deaths: context.combatants.filter(c => c.health <= 0) }

    default:
      return promptGameMasterDecision(situation, context)
  }
}
```

### Validation Helpers

```typescript
function validateMilitiaPlacement(sector: Sector, owner: string, count: number): ValidationResult {
  const current = sector.militia[owner] || 0
  const max = 10

  if (current + count > max) {
    return {
      valid: false,
      actualCount: max - current,
      message: `Can only place ${max - current} militia (cap is ${max})`
    }
  }

  return { valid: true, actualCount: count }
}

function validateMovement(from: Sector, to: Sector): boolean {
  // Orthogonal only
  const dx = Math.abs(from.x - to.x)
  const dy = Math.abs(from.y - to.y)
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1)
}
```

---

## Rule References by Topic

| Topic | Main Document | Clarification |
|-------|---------------|---------------|
| MERC Stats | 01 | This doc (MERC section) |
| Combat | 07 | This doc (Combat FAQ) |
| Militia | 08 | This doc (Militia FAQ) |
| Equipment | 01 | This doc (Equipment section) |
| Movement | 06 | This doc (Movement FAQ) |
| Sectors | 01, 06 | This doc (Sector FAQ) |
| Dictator AI | 10 | This doc (AI clarifications) |
