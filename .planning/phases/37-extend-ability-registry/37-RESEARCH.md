# Phase 37: Extend Ability Registry - Research

**Researched:** 2026-02-03
**Domain:** TypeScript interface design, game ability systems
**Confidence:** HIGH

## Summary

This research examines the existing `merc-abilities.ts` registry and `elements.ts` stat calculation system to inform how to add a unified `StatModifier` interface. The codebase already has a well-structured ability registry with condition types and target definitions - the goal is to extend it with a new `statModifiers` array that replaces the scattered bonus properties.

The key insight is that the existing `CombatModifier`, `SquadBonus`, and `PassiveAbility` interfaces already define stat bonuses in different ways. The new `StatModifier` interface must unify these into a single declarative format while preserving the existing condition evaluation logic.

**Primary recommendation:** Add `StatModifier` interface and `statModifiers` field to existing structures, then migrate existing bonus definitions to use the new format. This is additive - existing code continues to work until phase 38 replaces the calculation logic.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x | Type definitions | Already in use, native to codebase |
| boardsmith/engine | local | Game element framework | Core dependency |

### Supporting
No additional libraries needed - this is pure TypeScript interface design within the existing codebase structure.

**Installation:**
```bash
# No new dependencies required
```

## Architecture Patterns

### Existing Registry Structure
```
src/rules/merc-abilities.ts
|-- AbilityCondition type (string union)
|-- BonusTarget type (string union)
|-- CombatModifier interface
|-- SquadBonus interface
|-- EnemyDebuff interface
|-- PassiveAbility interface
|-- MercAbility interface (top-level)
|-- MERC_ABILITIES record (data)
|-- Helper functions (getMercAbility, etc.)
```

### Recommended StatModifier Location
Place `StatModifier` interface AFTER the existing type definitions but BEFORE `MercAbility` interface:

```typescript
// After line 79 (EnemyDebuff interface)

/**
 * Unified stat modifier for declarative ability definitions.
 * Single source of truth for stat bonuses.
 */
export interface StatModifier {
  stat: 'combat' | 'training' | 'initiative' | 'health' | 'targets' | 'actions';
  bonus: number;
  condition?: AbilityCondition;
  label?: string;  // For UI display (defaults to "[Name]'s Ability")
  target?: BonusTarget;
}
```

### Pattern 1: Declarative Stat Modifiers
**What:** Define stat bonuses as an array of `StatModifier` objects on each ability
**When to use:** For all 18 stat-modifying MERCs
**Example:**
```typescript
// Source: Existing merc-abilities.ts pattern extended
bouba: {
  id: 'bouba',
  combatModifiers: { combatBonus: 1, condition: 'hasHandgun' }, // EXISTING (keep for now)
  statModifiers: [  // NEW
    { stat: 'combat', bonus: 1, condition: 'hasHandgun', label: "Bouba's Ability" }
  ],
},

shooter: {
  id: 'shooter',
  passive: { extraCombat: 3 },  // EXISTING (keep for now)
  statModifiers: [  // NEW
    { stat: 'combat', bonus: 3, label: "Shooter's Ability" }
  ],
},
```

### Pattern 2: Squad-Wide Bonuses
**What:** Modifiers with `target: 'squadMates'` or `target: 'allSquad'`
**When to use:** Tack, Valkyrie, and similar squad-affecting abilities
**Example:**
```typescript
// Source: Existing squadBonus pattern unified
tack: {
  id: 'tack',
  isFemale: true,
  squadBonus: { initiative: 2, condition: 'highestInitInSquad', appliesTo: 'allSquad' }, // EXISTING
  statModifiers: [  // NEW
    { stat: 'initiative', bonus: 2, condition: 'highestInitInSquad', target: 'allSquad', label: "Tack's Ability" }
  ],
},
```

### Pattern 3: Enemy Debuffs
**What:** Modifiers with negative bonus and `target: 'enemyMercs'`
**When to use:** Max's ability
**Example:**
```typescript
// Source: Existing enemyDebuff pattern unified
max: {
  id: 'max',
  enemyDebuff: { combat: -1, initiative: -1, appliesTo: 'enemyMercs' }, // EXISTING
  statModifiers: [  // NEW
    { stat: 'combat', bonus: -1, target: 'enemyMercs', label: "Max's Intimidation" },
    { stat: 'initiative', bonus: -1, target: 'enemyMercs', label: "Max's Intimidation" }
  ],
},
```

### Anti-Patterns to Avoid
- **Removing existing fields prematurely:** Keep `combatModifiers`, `squadBonus`, `passive` until phase 38 migrates the calculation logic
- **Duplicating condition evaluation:** The `getActiveStatModifiers` function should reuse existing condition checking patterns
- **Hardcoding MERC names in labels:** Use a helper to generate default labels like `"${mercName}'s Ability"` if not specified

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Condition types | New string union | Existing `AbilityCondition` type | Already has all 12 needed conditions |
| Target types | New enum | Existing `BonusTarget` type | Already has 'self', 'squadMates', 'allSquad', 'enemyMercs' |
| Stat names | Arbitrary strings | Union type of valid stat names | Type safety prevents typos |
| Label generation | Per-MERC logic | Default pattern with override | `label ?? \`${mercName}'s Ability\`` |

**Key insight:** The existing type definitions are well-designed. Reuse them in the new `StatModifier` interface.

## Common Pitfalls

### Pitfall 1: Stat Name Mismatches
**What goes wrong:** Using 'health' in modifier but property is 'effectiveMaxHealth'
**Why it happens:** Different names for same concept in different contexts
**How to avoid:** Define stat union with canonical names, map to properties in calculation
**Warning signs:** Tests pass but UI shows wrong values

### Pitfall 2: Target Scope Confusion
**What goes wrong:** Bonus applied to self when should apply to squadMates
**Why it happens:** Default target is 'self', forgot to specify 'squadMates' for squad bonuses
**How to avoid:** Make target required for squad-affecting abilities (consider runtime validation)
**Warning signs:** Valkyrie gives herself +1 instead of squad mates

### Pitfall 3: Condition Already Evaluated
**What goes wrong:** Condition evaluated twice (once in storage, once in display)
**Why it happens:** Current system stores computed bonuses, new system stores declarations
**How to avoid:** `getActiveStatModifiers()` should filter by condition, not store pre-computed values
**Warning signs:** Bonus appears when condition not met, or missing when condition met

### Pitfall 4: Missing Militia Target
**What goes wrong:** Walter's militia initiative bonus has no target type
**Why it happens:** Current `BonusTarget` type doesn't include 'militia'
**How to avoid:** Add 'militia' to BonusTarget type (or use special handling for Walter)
**Warning signs:** Walter's ability not working or TypeScript errors

## Code Examples

Verified patterns from the existing codebase:

### Current AbilityCondition Type (lines 15-28)
```typescript
// Source: merc-abilities.ts
export type AbilityCondition =
  | 'always'                    // Always active
  | 'highestInitInSquad'        // Has highest initiative in squad
  | 'hasWeapon'                 // Has any weapon equipped (Ra)
  | 'hasHandgun'                // Has a handgun equipped
  | 'hasUzi'                    // Has an Uzi equipped
  | 'hasArmor'                  // Has armor equipped
  | 'hasAccessory'              // Has accessory equipped
  | 'hasExplosive'              // Has grenade or mortar equipped
  | 'hasMultiTargetWeapon'      // Has weapon with targets > 0
  | 'hasSmaw'                   // Has SMAW equipped
  | 'hasSwordOrUnarmed'         // Has sword or no weapon (Dutch)
  | 'womanInSquad'              // A woman is in the squad
  | 'aloneInSquad';             // Only MERC in squad (Snake)
```

### Current BonusTarget Type (line 33)
```typescript
// Source: merc-abilities.ts
export type BonusTarget = 'self' | 'squadMates' | 'allSquad' | 'enemyMercs';
```

### Current Bonus Storage Pattern (elements.ts lines 133-150)
```typescript
// Source: elements.ts - CombatantBase
// Equipment-conditional combat bonuses (displayed in UI tooltips)
boubaHandgunCombatBonus: number = 0;
mayhemUziCombatBonus: number = 0;
rozeskeArmorCombatBonus: number = 0;
stumpyExplosiveCombatBonus: number = 0;
vandradiMultiTargetCombatBonus: number = 0;
dutchUnarmedCombatBonus: number = 0;
dutchUnarmedInitiativeBonus: number = 0;
moeSmawTargetBonus: number = 0;
raWeaponTargetBonus: number = 0;

// Squad-conditional bonuses
snakeSoloCombatBonus: number = 0;
snakeSoloInitiativeBonus: number = 0;
snakeSoloTrainingBonus: number = 0;
// ... etc
```

### Helper Function Pattern (getMercAbility)
```typescript
// Source: merc-abilities.ts line 529
export function getMercAbility(combatantId: string): MercAbility | undefined {
  return MERC_ABILITIES[combatantId];
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-MERC if statements | MERC_ABILITIES registry | v1.0 | Centralized ability data |
| Separate bonus properties | Still in use (to be replaced) | Phase 38 | Multiple sources of truth |
| UI hardcoded checks | Still in use (to be replaced) | Phase 39 | Duplicate display bugs |

**Current pattern to preserve:**
- `getMercAbility()` lookup pattern
- `AbilityCondition` and `BonusTarget` types
- `MercAbility` interface structure

**Pattern to add:**
- `StatModifier` interface
- `statModifiers` array on each ability
- `getActiveStatModifiers(merc, context)` function

## MERCs to Migrate (18 total)

### Equipment-Conditional (8 MERCs)
| MERC | Condition | Stat | Bonus | Current Field |
|------|-----------|------|-------|---------------|
| Bouba | hasHandgun | combat | +1 | boubaHandgunCombatBonus |
| Mayhem | hasUzi | combat | +2 | mayhemUziCombatBonus |
| Rozeske | hasArmor | combat | +1 | rozeskeArmorCombatBonus |
| Stumpy | hasExplosive | combat | +1 | stumpyExplosiveCombatBonus |
| Vandradi | hasMultiTargetWeapon | combat | +1 | vandradiMultiTargetCombatBonus |
| Dutch | hasSwordOrUnarmed | combat | +1, initiative | +1 | dutchUnarmedCombatBonus, dutchUnarmedInitiativeBonus |
| Moe | hasSmaw | targets | +1 | moeSmawTargetBonus |
| Ra | hasWeapon | targets | +1 | raWeaponTargetBonus |

### Squad-Conditional (6 MERCs)
| MERC | Condition | Stat | Bonus | Target | Current Field |
|------|-----------|------|-------|--------|---------------|
| Haarg | squadMateHigher | combat/training/initiative | +1 each | self | haargXBonus |
| Sarge | highestInitInSquad | combat/training/initiative | +1 each | self | sargeXBonus |
| Tack | highestInitInSquad | initiative | +2 | allSquad | tackSquadInitiativeBonus |
| Valkyrie | always | initiative | +1 | squadMates | valkyrieSquadInitiativeBonus |
| Snake | aloneInSquad | combat/training/initiative | +1 each | self | snakeSoloXBonus |
| Tavisto | womanInSquad | combat/training/initiative | +1 each | self | tavistoWomanXBonus |

### Passive Always-On (3 MERCs)
| MERC | Stat | Bonus | Current Field |
|------|------|-------|---------------|
| Shooter | combat | +3 | passive.extraCombat |
| Juicer | health | +2 | passive.extraHealth |
| Ewok | actions | +1 | passive.extraActions |

### Combat-Only (3 MERCs)
| MERC | Effect | Target | Current Field |
|------|--------|--------|---------------|
| Max | combat -1, initiative -1 | enemyMercs | enemyDebuff |
| Walter | initiative +2 | militia | passive.militiaInitiativeBonus |
| Vulture | ignores initiative penalties | self | targeting.ignoresInitiativePenalties |

**Note:** Vulture's ability is behavior-based, not a stat modifier. It may not fit the `StatModifier` pattern and should be handled separately (already handled by `ignoresInitiativePenalties` flag).

## Open Questions

Things that couldn't be fully resolved:

1. **Haarg's Unique Condition**
   - What we know: Haarg gets +1 to any stat where a squad mate has a higher BASE stat
   - What's unclear: This condition is unique (not in AbilityCondition type)
   - Recommendation: Add new condition type 'squadMateHigherBase' OR handle Haarg specially in getActiveStatModifiers

2. **Walter's Militia Target**
   - What we know: Walter gives +2 initiative to militia, not MERCs
   - What's unclear: BonusTarget doesn't include 'militia'
   - Recommendation: Add 'militia' to BonusTarget type

3. **Vulture's Non-Modifier Ability**
   - What we know: Vulture ignores initiative penalties, not a stat bonus
   - What's unclear: Should this be in statModifiers at all?
   - Recommendation: Keep as separate `targeting.ignoresInitiativePenalties` flag, don't migrate

## Sources

### Primary (HIGH confidence)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/rules/merc-abilities.ts` - Full registry structure (848 lines)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/rules/elements.ts` - CombatantBase bonus fields (lines 117-159)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/.planning/REQUIREMENTS.md` - STAT-01 acceptance criteria

### Secondary (MEDIUM confidence)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/ui/components/CombatantCard.vue` - UI bonus display pattern (lines 184-404)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/data/combatants.json` - MERC ability text (for label defaults)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Pure TypeScript, no external dependencies
- Architecture: HIGH - Clear extension of existing patterns
- Pitfalls: HIGH - Based on direct code analysis

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (stable codebase, no external dependencies)
