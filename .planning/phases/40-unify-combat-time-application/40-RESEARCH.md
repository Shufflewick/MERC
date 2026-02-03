# Phase 40: Unify Combat-Time Application - Research

**Researched:** 2026-02-03
**Domain:** MERC Combat System / Stat Calculation
**Confidence:** HIGH

## Summary

This phase completes the unified stat ability system by removing duplicate `applyXBonus()` functions from `combat.ts`. After Phase 38 unified server-side stat calculation, `merc.combat`, `merc.initiative`, etc. already include all ability bonuses via `getAbilityBonus()`. The combat.ts code now DOUBLE-COUNTS these bonuses by also calling `applyBoubaBonus()`, `applySargeBonus()`, etc.

The research identifies 18 duplicate bonus functions to remove, plus special combat-time-only effects that must be preserved (Max's enemy debuff, Walter's militia bonus, Khenn's random initiative, Golem's pre-combat attack).

**Primary recommendation:** Remove all `applyXBonus()` functions that duplicate abilities already calculated in `CombatantModel`'s stat getters, while preserving combat-time-only effects.

## Standard Stack

This phase modifies existing code - no new libraries required.

### Core Files
| File | Purpose | Changes Needed |
|------|---------|----------------|
| `src/rules/combat.ts` | Combat system | Remove 18 duplicate bonus functions |
| `src/rules/combat-types.ts` | Combatant interface | No changes needed |

### Supporting Files
| File | Purpose | Relevance |
|------|---------|-----------|
| `src/rules/elements.ts` | CombatantModel with unified stats | Already correct (Phase 38) |
| `src/rules/merc-abilities.ts` | Ability registry | Already correct (Phase 37) |
| `tests/combat-abilities.test.ts` | Combat ability tests | May need updates |

## Architecture Patterns

### Current Problem: Double-Counting

```
Flow BEFORE Phase 40 (current - BROKEN):
1. mercToCombatant() reads merc.combat
   └── merc.combat getter calls getAbilityBonus('combat')
       └── Returns BASE + EQUIPMENT + ABILITY_BONUS (e.g., +1 for Bouba with handgun)
2. applyBoubaBonus() adds ANOTHER +1 to combatant.combat
   └── Result: +2 instead of +1 (DOUBLE-COUNTING)
```

### Target Architecture: Single Source of Truth

```
Flow AFTER Phase 40 (target - CORRECT):
1. mercToCombatant() reads merc.combat
   └── merc.combat getter calls getAbilityBonus('combat')
       └── Returns BASE + EQUIPMENT + ABILITY_BONUS (correct)
2. No duplicate bonus application
   └── Result: Correct value
```

### Functions to REMOVE (18 duplicate bonus functions)

These functions duplicate bonuses already calculated in `CombatantModel`:

| Function | Line | Already in | Reason |
|----------|------|------------|--------|
| `applyBoubaBonus` | 318 | getAbilityBonus('combat') | Equipment-based |
| `applyMayhemBonus` | 598 | getAbilityBonus('combat') | Equipment-based |
| `applyRozeskeBonus` | 609 | getAbilityBonus('combat') | Equipment-based |
| `applyRaBonus` | 620 | getAbilityBonus('targets') | Equipment-based |
| `applyStumpyBonus` | 648 | getAbilityBonus('combat') | Equipment-based |
| `applyVandradiBonus` | 659 | getAbilityBonus('combat') | Equipment-based |
| `applyDutchBonus` | 887 | getAbilityBonus('combat', 'initiative') | Equipment-based |
| `applyMoeBonus` | 900 | getAbilityBonus('targets') | Equipment-based |
| `applySargeBonus` | 671 | getAbilityBonus('combat', 'initiative', 'training') | Squad conditional |
| `applyTackBonus` | 708 | updateAbilityBonuses (allSquad target) | Squad conditional |
| `applyValkyrieBonus` | 749 | updateAbilityBonuses (squadMates target) | Squad conditional |
| `applyTavistoBonus` | 787 | getAbilityBonus('combat', 'initiative', 'training') | Squad conditional |
| `applyVultureBonus` | 826 | getEffectiveInitiative | Special handling |
| `applyHaargBonus` | 1195 | applyHaargPerStatModifiers | Per-stat conditional |
| `applySnakeBonus` | 1250 | getAbilityBonus('combat', 'initiative', 'training') | Squad conditional |

### Functions to KEEP (combat-time-only effects)

These effects ONLY apply during combat, not displayed on cards:

| Function | Line | Reason to Keep |
|----------|------|----------------|
| `applyEnemyDebuffs` | 193 | Max's -1 combat to ENEMIES only during combat |
| `applyWalterBonus` | 858 | Militia +2 initiative (militia not tracked outside combat) |
| `applyKhennInitiative` | 635 | Random D6 roll at combat start |
| `executeGolemPreCombat` | 912 | Pre-combat attack action |

### Recommended Pattern for Combat-Time Effects

```typescript
// In executeCombatRound (after refreshCombatantStats):

// Combat-time-only effects that don't duplicate server-side calculations
applyKhennInitiative([...rebels, ...dictatorSide], game);  // Random roll
applyEnemyDebuffs(rebels, dictatorSide);                   // Max's debuff
applyEnemyDebuffs(dictatorSide, rebels);                   // Max's debuff (reverse)
applyWalterMilitiaBonus(dictatorSide);                     // Militia bonus

// Golem pre-combat (only on round 1)
if (roundNumber === 1) {
  executeGolemPreCombat(game, rebels, dictatorSide);
}
```

## Don't Hand-Roll

Problems that look simple but have edge cases:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stat calculations | Custom per-MERC logic | `merc.combat` getter | Already unified in Phase 38 |
| Squad bonus distribution | Manual iteration | `updateAbilityBonuses()` | Handles all targets/conditions |
| Condition evaluation | If-else chains | `evaluateCondition()` | Registry handles all cases |

**Key insight:** The entire point of Phases 37-39 was to eliminate duplicate calculation logic. Phase 40 removes the last vestiges.

## Common Pitfalls

### Pitfall 1: Forgetting Combat-Only Effects
**What goes wrong:** Removing ALL bonus functions, breaking Max/Walter/Khenn/Golem
**Why it happens:** Seeing pattern of "remove duplicate functions" and applying too broadly
**How to avoid:** Review each function - ask "is this calculated on CombatantModel?"
**Warning signs:** Tests failing for Max's enemy debuff or Walter's militia

### Pitfall 2: Breaking Haarg's Cross-Combat Comparison
**What goes wrong:** Haarg's bonus compares to ALL combatants, not just squad
**Why it happens:** Server-side Haarg compares to squad; combat-side could compare to all combatants
**How to avoid:** Verify current Haarg behavior matches expected per-combat-vs-per-squad semantics
**Warning signs:** Haarg getting different bonuses in combat vs display

### Pitfall 3: Not Removing Helper Functions
**What goes wrong:** Leaving orphaned isBouba(), hasHandgun(), etc. helper functions
**Why it happens:** Forgetting to remove functions that were only used by removed bonus functions
**How to avoid:** Search for callers of each isX() and hasX() helper
**Warning signs:** Dead code, linter warnings

### Pitfall 4: Double-Counting Still Occurring
**What goes wrong:** Stats differ between UI display and combat
**Why it happens:** Not removing all bonus applications
**How to avoid:** After removal, verify mercToCombatant values match CombatantCard display
**Warning signs:** Combat showing higher stats than displayed stats

## Code Examples

### Current mercToCombatant (reads from unified getters)

```typescript
// Source: combat.ts line 1024-1046
function mercToCombatant(merc: CombatantModel, isDictatorSide: boolean, playerColor?: string): Combatant {
  return {
    id: String(merc.id),
    name: merc.combatantName,
    initiative: merc.initiative,  // Already includes ability bonuses
    combat: merc.combat,          // Already includes ability bonuses
    health: merc.health,
    maxHealth: merc.maxHealth,
    armor: merc.equipmentArmor,
    targets: merc.targets,        // Already includes ability bonuses
    // ... other fields
  };
}
```

### CombatantModel.combat getter (Phase 38 unified calculation)

```typescript
// Source: elements.ts line 704-715
get combat(): number {
  let value = this.baseCombat;
  value += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'combatBonus');
  value += this.getEquipValue(this.armorSlot, this.armorSlotData, 'combatBonus');
  value += this.getEquipValue(this.accessorySlot, this.accessorySlotData, 'combatBonus');
  for (let idx = 0; idx < this.bandolierSlotsData.length; idx++) {
    value += this.getEquipValue(this.bandolierSlots[idx], this.bandolierSlotsData[idx], 'combatBonus');
  }
  // Unified ability bonus from activeStatModifiers
  value += this.getAbilityBonus('combat');
  return Math.max(0, value);
}
```

### refreshCombatantStats (reads from unified getters)

```typescript
// Source: combat.ts line 1154-1174
function refreshCombatantStats(combatant: Combatant): void {
  if (combatant.isMilitia) return;

  if (combatant.sourceElement?.isMerc) {
    const merc = combatant.sourceElement;
    // Refresh stats that can change with equipment
    combatant.initiative = merc.initiative;  // Already unified
    combatant.combat = merc.combat;          // Already unified
    combatant.targets = merc.targets;        // Already unified
    combatant.armor = merc.equipmentArmor;
    combatant.armorPiercing = merc.weaponSlot?.negatesArmor ?? false;
  }
}
```

## State of the Art

| Phase | What Was Done | Impact on combat.ts |
|-------|---------------|---------------------|
| Phase 37 | Extended ability registry with StatModifier | No direct impact |
| Phase 38 | Unified server-side calculation | merc.combat etc. now correct |
| Phase 39 | Unified UI breakdown | CombatantCard shows correct stats |
| **Phase 40** | **Remove combat.ts duplicates** | **Combat uses correct stats** |

**Current state:** Double-counting bonuses in combat
**After Phase 40:** Single source of truth for all stats

## Open Questions

### Resolved: Haarg Combat vs Server-Side
**What we know:** Server-side Haarg compares to squad mates (lines 416-438)
**What was unclear:** Does combat-side Haarg compare to ALL combatants?
**Resolution:** Looking at `applyHaargBonus` (line 1195), it compares to ALL combatants in combat. However, the Phase 38 unified system compares to squad mates. This might be intentional - Haarg could get bonuses at both levels. Need to verify expected behavior with game rules.
**Recommendation:** Verify Haarg's expected behavior. If combat should compare to ALL combatants, keep `applyHaargBonus`. If squad-only is correct, remove it.

### Resolved: Walter's Militia Bonus
**What we know:** `applyWalterBonus` gives militia +2 initiative
**What was unclear:** Is this in the ability registry?
**Resolution:** Looking at merc-abilities.ts line 383-388, Walter has `statModifiers: [{ stat: 'initiative', bonus: 2, target: 'militia' }]`. However, militia aren't tracked by CombatantModel - they're created fresh in `militiaToCombatants`. So `applyWalterBonus` must be kept to apply this to the Combatant interface.
**Recommendation:** Keep `applyWalterBonus` - militia handling is combat-time-only.

## Sources

### Primary (HIGH confidence)
- `src/rules/combat.ts` - Examined lines 193-1800 for all bonus functions
- `src/rules/elements.ts` - Verified Phase 38 unified calculation at lines 704-715, 691-701, 656-662
- `src/rules/merc-abilities.ts` - Verified registry definitions

### Secondary (MEDIUM confidence)
- `.planning/phases/38-unify-server-side-calculation/38-VERIFICATION.md` - Phase 38 completion evidence
- `.planning/phases/39-unify-ui-breakdown/39-VERIFICATION.md` - Phase 39 completion evidence

## Metadata

**Confidence breakdown:**
- Functions to remove: HIGH - Direct code analysis of duplicate calculations
- Combat-only effects: HIGH - Clear distinction between model-level and combat-level
- Haarg behavior: MEDIUM - Needs verification of expected game rules

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (stable codebase)
