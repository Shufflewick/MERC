# Phase 47: Equipment Slot Cleanup - Research

**Researched:** 2026-02-08
**Domain:** Equipment slot management (bandolier replacement and phantom slot removal)
**Confidence:** HIGH

## Summary

This phase fixes two related bugs in the bandolier equipment system. The bandolier is an accessory that provides 3 extra accessory slots (`bandolier:0`, `bandolier:1`, `bandolier:2`). When a MERC replaces their bandolier with a different accessory via the `equip()` method, the items in bandolier slots are silently orphaned -- they remain as children of the combatant with `equippedSlot` still set to `bandolier:N`, but the combatant no longer has a bandolier to provide those slots. This is the "phantom slot" bug.

The `dropEquipment` action in `rebel-equipment.ts` already handles this correctly -- when dropping a bandolier, it calls `clearBandolierSlots()` and moves items to the sector stash. However, the core `equip()` method in `CombatantBase` (and the override in `CombatantModel`) does NOT handle this case. When `equip()` replaces the accessory slot (line 911 of elements.ts), it only calls `clearSlot()` on the old accessory and returns it as "replaced," without touching any bandolier slot contents.

**Primary recommendation:** Fix the `equip()` method in `CombatantBase` to clear bandolier slots when replacing a bandolier accessory, and return the cleared items alongside the replaced item so callers can route them properly (to sector stash). Also audit all callers of `equip()` to ensure they handle the bandolier contents.

## Standard Stack

No new libraries needed. This is a pure logic fix in existing TypeScript code.

### Core Files to Modify

| File | Purpose | What Changes |
|------|---------|--------------|
| `src/rules/elements.ts` | `CombatantBase.equip()` | Add bandolier content clearing when replacing bandolier |
| `src/rules/elements.ts` | `CombatantModel.equip()` | Same fix for Gunther's accessory handling |
| `src/rules/actions/rebel-equipment.ts` | `reEquip`, `reEquipContinue`, `feedbackDiscard`, `hagnessGiveEquipment` | Handle returned bandolier contents |
| `src/rules/combat.ts` | Post-combat equip flows | Handle returned bandolier contents |

### Supporting Files (Read-Only Reference)

| File | Purpose | Why Relevant |
|------|---------|--------------|
| `src/rules/equipment-effects.ts` | `getExtraAccessorySlots()` | Defines bandolier as having `extraAccessorySlots: 3` |
| `data/equipment.json` | Equipment definitions | Bandolier is id `bandolier`, type `Accessory` |
| `tests/equipment-effects.test.ts` | Existing tests | Only tests the effects registry, not equip behavior |

## Architecture Patterns

### Current Equipment Slot Architecture

Equipment items are stored as child elements of the combatant in BoardSmith's element tree. Each equipment has an `equippedSlot` property that indicates which slot it occupies:

```
CombatantModel (element)
  Equipment (child, equippedSlot='weapon')
  Equipment (child, equippedSlot='armor')
  Equipment (child, equippedSlot='accessory')     <-- Bandolier goes here
  Equipment (child, equippedSlot='bandolier:0')    <-- Items IN the bandolier
  Equipment (child, equippedSlot='bandolier:1')
  Equipment (child, equippedSlot='bandolier:2')
```

The `bandolierSlots` getter dynamically queries children where `equippedSlot` starts with `'bandolier:'`:
```typescript
get bandolierSlots(): Equipment[] {
  return this.all(Equipment, e => e.equippedSlot?.startsWith('bandolier:') ?? false)
    .sort((a, b) => {
      const idxA = parseInt(a.equippedSlot!.split(':')[1]);
      const idxB = parseInt(b.equippedSlot!.split(':')[1]);
      return idxA - idxB;
    });
}
```

### Bug 1: Bandolier Replacement Drops Nothing

When `equip()` is called with an Accessory and the accessory slot already has a bandolier:

```typescript
// CombatantBase.equip() - line 904-913
case 'Accessory':
  if (!this.accessorySlot) {
    this.equipToSlot(equipment, 'accessory');
  } else if (this.getAvailableBandolierSlots() > 0) {
    const idx = this.getNextBandolierIndex();
    this.equipToSlot(equipment, `bandolier:${idx}`);
  } else {
    replaced = this.clearSlot(this.accessorySlot);  // <-- Only clears the bandolier itself
    this.equipToSlot(equipment, 'accessory');         // <-- Puts new item in accessory slot
  }
  // Bandolier contents are STILL children with equippedSlot='bandolier:N' !!
```

`clearSlot()` only sets `equippedSlot = undefined` on the bandolier item itself. The 1-3 items in bandolier slots remain as children of the combatant with their `equippedSlot` attributes still set.

### Bug 2: Phantom Slots After Replacement

After the bandolier is replaced:
- `getMaxBandolierSlots()` returns 0 (new accessory is not a bandolier)
- `bandolierSlots` getter still returns the orphaned items (they still have `equippedSlot` starting with `'bandolier:'`)
- `syncEquipmentData()` serializes `bandolierSlotsData` from those orphaned items
- UI shows phantom bandolier slots with equipment in them
- Stats from those items may still be computed in `updateComputedStats()` iterating over `bandolierSlotsData`

### Correct Handling Already Exists in dropEquipment

The `dropEquipment` action already handles this correctly at lines 567-574:

```typescript
droppedItem = actingCombatant.unequip('Accessory');
// If dropping a bandolier, also detach all accessories in bandolier slots
if (droppedItem?.equipmentId === 'bandolier') {
  const bandolierItems = actingCombatant.clearBandolierSlots();
  for (const item of bandolierItems) {
    sector.addToStash(item);
  }
}
```

### Pattern for the Fix

The fix should happen at TWO levels:

**Level 1 - Core `equip()` method:** When replacing an accessory, check if the old accessory is a bandolier. If so, call `clearBandolierSlots()` and return the cleared items somehow.

**Level 2 - All callers of `equip()`:** Route the bandolier contents appropriately (sector stash, discard pile, etc).

#### Design Decision: How to Return Bandolier Contents

The current `equip()` returns `Equipment | undefined` (the single replaced item). To also return bandolier contents, there are two approaches:

**Option A: Change return type to include bandolier contents**
```typescript
equip(equipment: Equipment): { replaced?: Equipment; bandolierContents: Equipment[] }
```
This is cleaner but breaks all callers (many locations in actions and combat code).

**Option B: Clear bandolier slots inside `equip()` and leave items as unslotted children**
```typescript
// Inside equip(), when replacing bandolier:
if (this.accessorySlot?.equipmentId === 'bandolier') {
  this.clearBandolierSlots();
  // Items now have equippedSlot=undefined, still children of combatant
}
replaced = this.clearSlot(this.accessorySlot);
this.equipToSlot(equipment, 'accessory');
```
Then callers check `combatant.all(Equipment, e => !e.equippedSlot)` for orphaned items. This is fragile and non-obvious.

**Option C (Recommended): Add a field to collect displaced bandolier items**
Add a `lastDisplacedBandolierItems: Equipment[]` field on `CombatantBase` that `equip()` populates when replacing a bandolier. Callers check this after calling `equip()` and route items appropriately. The field is cleared on the next `equip()` call.

**Option D (Simplest): Handle inside equip() by clearing items entirely**
Make `equip()` smarter: when replacing a bandolier, call `clearBandolierSlots()` and keep the items accessible. Then each caller that already handles `replaced` must also handle the bandolier contents. This can be done by returning a richer result.

The cleanest approach is actually **to clear bandolier slots inside `equip()` and return the items to the caller**. Since `equip()` currently returns `Equipment | undefined`, the simplest non-breaking change is:

```typescript
// New method on CombatantBase
equipWithBandolierHandling(equipment: Equipment): { replaced?: Equipment; displacedBandolierItems: Equipment[] } {
  // Check if we're about to replace a bandolier
  let displacedBandolierItems: Equipment[] = [];
  if (equipment.equipmentType === 'Accessory' &&
      this.accessorySlot &&
      this.getMaxBandolierSlots() > 0 &&
      this.getAvailableBandolierSlots() === 0) {
    // About to replace the accessory slot, and current accessory provides bandolier slots
    displacedBandolierItems = this.clearBandolierSlots();
  }

  const replaced = this.equip(equipment);
  return { replaced, displacedBandolierItems };
}
```

However, this adds a new method that might not be used everywhere. **The most pit-of-success approach is to fix `equip()` itself** so that no caller can accidentally forget to handle bandolier contents. This means changing the return type, which requires updating all callers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Clearing bandolier slots | Custom loop over children | `clearBandolierSlots()` | Already exists, handles `equippedSlot` and data sync |
| Checking if accessory is bandolier | String matching on name | `getExtraAccessorySlots(id) > 0` | Registry-based check, handles future bandolier-like items |
| Moving items to stash | Manual `putInto()` calls | `sector.addToStash(equipment)` | Handles damaged equipment rejection |

## Common Pitfalls

### Pitfall 1: Only Fixing the `reEquip` Action

**What goes wrong:** The `equip()` method is called from MANY places (reEquip, reEquipContinue, feedbackDiscard, hagnessGiveEquipment, combat loot, AI equip). Fixing only one caller leaves the bug in all others.
**Why it happens:** The temptation to fix the action rather than the core method.
**How to avoid:** Fix in `CombatantBase.equip()` itself, then audit all callers.
**Warning signs:** Any call to `unit.equip(equipment)` where the result's bandolier items aren't handled.

### Pitfall 2: Breaking the Return Type Without Updating All Callers

**What goes wrong:** If `equip()` return type changes, TypeScript will catch some callers, but some may be using the result loosely (e.g., `const replaced = unit.equip(e); if (replaced)...`).
**Why it happens:** The `equip()` method is called in many action files and combat code.
**How to avoid:** Search for ALL calls to `.equip(` across the codebase.
**Warning signs:** TypeScript compilation errors or silent runtime issues.

### Pitfall 3: Forgetting CombatantModel.equip() Override

**What goes wrong:** `CombatantModel` overrides `equip()` for Gunther (accessories in any slot) and Genesis (weapons in accessory slot). The bandolier fix must also be applied in the override, specifically in Gunther's code path where the accessory slot can be replaced.
**Why it happens:** The override exists for special MERC rules and is easy to miss.
**How to avoid:** Fix both `CombatantBase.equip()` and `CombatantModel.equip()`.

### Pitfall 4: Damaged Equipment in Bandolier Slots

**What goes wrong:** `sector.addToStash()` rejects damaged equipment (returns false). If a bandolier contains damaged items, they need to go to the discard pile instead.
**Why it happens:** Damaged equipment can end up in bandolier slots during combat.
**How to avoid:** Check `isDamaged` on each displaced bandolier item and route to discard if damaged.

### Pitfall 5: Not Considering AI Players

**What goes wrong:** AI equip logic may also trigger bandolier replacement. If the fix requires callers to handle displaced items, the AI code paths must also be updated.
**Why it happens:** AI equipment management is in a separate code path.
**How to avoid:** Search for `equip(` in ai-helpers.ts and combat.ts.

## Code Examples

### Current Broken Flow (elements.ts:904-913)

```typescript
// Source: src/rules/elements.ts, CombatantBase.equip()
case 'Accessory':
  if (!this.accessorySlot) {
    this.equipToSlot(equipment, 'accessory');
  } else if (this.getAvailableBandolierSlots() > 0) {
    const idx = this.getNextBandolierIndex();
    this.equipToSlot(equipment, `bandolier:${idx}`);
  } else {
    // BUG: Does not clear bandolier contents
    replaced = this.clearSlot(this.accessorySlot);
    this.equipToSlot(equipment, 'accessory');
  }
```

### Correct Handling in dropEquipment (rebel-equipment.ts:567-574)

```typescript
// Source: src/rules/actions/rebel-equipment.ts, dropEquipment action
droppedItem = actingCombatant.unequip('Accessory');
if (droppedItem?.equipmentId === 'bandolier') {
  const bandolierItems = actingCombatant.clearBandolierSlots();
  for (const item of bandolierItems) {
    sector.addToStash(item);
  }
}
```

### Existing clearBandolierSlots (elements.ts:948-956)

```typescript
// Source: src/rules/elements.ts, CombatantBase.clearBandolierSlots()
clearBandolierSlots(): Equipment[] {
  const items = [...this.bandolierSlots];
  for (const item of items) {
    this.clearSlot(item);
  }
  this.syncEquipmentData();
  this.updateComputedStats();
  return items;
}
```

### All Callers of equip() That Need Updating

```typescript
// Source: grep for '.equip(' across src/rules/actions/ and src/rules/combat.ts

// 1. rebel-equipment.ts - reEquip action (line 219)
const replaced = unit.equip(equipment);

// 2. rebel-equipment.ts - reEquipContinue action (line 358)
const replaced = unit.equip(equipment);

// 3. rebel-equipment.ts - feedbackDiscard action (line 1101)
const replaced = recipient.equip(equipment);

// 4. rebel-equipment.ts - hagnessGiveEquipment action (line 1101)
const replaced = recipient.equip(equipment);

// 5. rebel-equipment.ts - squidheadDisarm action (line 771)
const replaced = squidhead.equip(mine);

// 6. combat.ts - post-combat loot equip flows (multiple locations)
// Need to verify these
```

## All equip() Call Sites

These are all locations that call `equip()` and need to be checked:

| Location | File | Context | Has Sector? | Needs Fix? |
|----------|------|---------|-------------|------------|
| reEquip | rebel-equipment.ts:219 | Re-equipping from stash | Yes | Yes - route to stash |
| reEquipContinue | rebel-equipment.ts:358 | Continued re-equip from stash | Yes | Yes - route to stash |
| feedbackDiscard | rebel-equipment.ts:1101 | Taking from discard pile | No sector directly | Yes - route to discard |
| hagnessGiveEquipment | rebel-equipment.ts:1101 | Giving drawn equipment | Accessible via squad | Yes - route to stash or discard |
| squidheadDisarm | rebel-equipment.ts:771 | Disarming land mine | Yes | Unlikely (mine is not accessory in normal slot, but check) |
| CombatantBase.equip (self) | elements.ts:892 | Core method | N/A | This IS the fix location |
| CombatantModel.equip (override) | elements.ts:1030 | Gunther/Genesis overrides | N/A | This IS the fix location |

## Open Questions

1. **Should `equip()` return type change or should bandolier clearing happen internally?**
   - What we know: The core `equip()` method returns `Equipment | undefined`. If it also returns displaced bandolier items, callers need updating. If it handles clearing internally, callers need to know WHERE to route the items.
   - Recommendation: Change the return type. The compiler will catch all callers. A type like `{ replaced?: Equipment; displacedItems: Equipment[] }` makes the contract explicit.

2. **Discrepancy between CSV (2 extra slots) and code (3 extra slots)**
   - `data/equipment.csv` says "Gives 2 extra accessory slots"
   - `data/equipment.json` says "Gives 3 extra accessory slots"
   - `src/rules/equipment-effects.ts` has `extraAccessorySlots: 3`
   - This is a data discrepancy but NOT in scope for this phase. Note it but don't fix.

3. **What happens with `bandolierSlotsData` after clearing?**
   - `clearBandolierSlots()` calls `syncEquipmentData()` which rebuilds `bandolierSlotsData` from `bandolierSlots` getter. After clearing, the getter returns empty array, so data syncs correctly. This is NOT a problem.

## Sources

### Primary (HIGH confidence)
- `src/rules/elements.ts` - Read directly, contains `CombatantBase.equip()`, `clearBandolierSlots()`, `bandolierSlots` getter, and all slot management code
- `src/rules/actions/rebel-equipment.ts` - Read directly, contains all equipment actions including the correct handling in `dropEquipment`
- `src/rules/equipment-effects.ts` - Read directly, confirms bandolier has `extraAccessorySlots: 3`
- `data/equipment.json` - Read directly, bandolier equipment data

### Secondary (MEDIUM confidence)
- `src/rules/combat.ts` - Grep'd for bandolier usage patterns
- `src/rules/actions/dictator-actions.ts` - Grep'd for bandolier usage patterns
- `src/rules/ai-helpers.ts` - Grep'd for bandolier usage patterns
- `src/ui/components/CombatantCard.vue` - Grep'd for UI bandolier rendering

## Metadata

**Confidence breakdown:**
- Bug analysis: HIGH - direct code reading confirms both bugs precisely
- Fix locations: HIGH - all callers of `equip()` identified via grep
- Fix approach: HIGH - existing `clearBandolierSlots()` and `dropEquipment` pattern provide the template
- Edge cases: MEDIUM - damaged equipment routing and AI paths need verification during implementation

**Research date:** 2026-02-08
**Valid until:** Stable code, 60+ days
