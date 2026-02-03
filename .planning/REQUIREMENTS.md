# v1.8 Requirements: Unified Stat Ability System

## Problem Statement

Stat-modifying abilities are currently implemented in **three separate paths**:
1. **Server-side** (`elements.ts`): 20+ explicit bonus fields stored on CombatantBase
2. **Combat-time** (`combat.ts`): Runtime-only bonus functions that recalculate everything
3. **UI-side** (`CombatantCard.vue`): Hardcoded checks for each bonus field PLUS a fallback calculation

This causes:
- **Double display bug**: UI shows both "Ability +2" (fallback) AND "Mayhem's Ability +2" (explicit check)
- **Maintenance nightmare**: Adding a new ability requires changes in 3+ files
- **Inconsistent behavior**: Combat stats calculated differently than display stats

## Affected MERCs (18 total with stat bonuses)

| Type | MERCs |
|------|-------|
| **Equipment-conditional** | Bouba, Mayhem, Rozeske, Stumpy, Vandradi, Dutch, Moe, Ra |
| **Squad-conditional** | Haarg, Sarge, Tack, Valkyrie, Snake, Tavisto |
| **Passive (always-on)** | Shooter, Juicer, Ewok |
| **Combat-only** | Max, Walter, Vulture |

---

## STAT-01: Unified Ability Registry

**Goal:** All stat-modifying abilities defined declaratively in `merc-abilities.ts` with standard `StatModifier` interface.

**Acceptance Criteria:**
- [x] `StatModifier` interface added to `merc-abilities.ts` with: stat, bonus, condition, label, target
- [x] `statModifiers` field added to `MercAbility` interface
- [x] All 18 stat-modifying MERCs have their bonuses defined in registry (19 total found)
- [x] `getActiveStatModifiers(merc, context)` function returns active modifiers for a combatant

**Status:** Complete (Phase 37)

**Key Changes:**
- `src/rules/merc-abilities.ts` - Extend registry with StatModifier interface and data

---

## STAT-02: Single Server-Side Calculation

**Goal:** One function `calculateStatModifiers()` that reads from registry and computes all active bonuses.

**Acceptance Criteria:**
- [ ] `calculateStatModifiers(merc, squad)` function added to elements.ts
- [ ] Function reads from ability registry (not hardcoded logic)
- [ ] `activeStatModifiers` computed property on CombatantModel
- [ ] `updateComputedStats()` uses unified calculation
- [ ] Remove duplicate `updateXBonus()` methods (replace with single `updateAbilityBonuses()`)

**Key Changes:**
- `src/rules/elements.ts` - Replace 20+ bonus fields with unified calculation

---

## STAT-03: Unified UI Display

**Goal:** `CombatantCard.vue` reads from ability data, no hardcoded bonus field checks, no fallback calculation.

**Acceptance Criteria:**
- [ ] Remove all hardcoded bonus field checks from `CombatantCard.vue`
- [ ] Read `activeStatModifiers` from merc data
- [ ] Generate breakdown items from modifier list
- [ ] Remove "Ability +X" fallback logic entirely
- [ ] No duplicate display of ability bonuses

**Key Changes:**
- `src/ui/components/CombatantCard.vue` - Unified breakdown generation

---

## STAT-04: Combat Consistency

**Goal:** Combat stats read from cached values, no duplicate calculation functions.

**Acceptance Criteria:**
- [ ] Remove duplicate `applyXBonus()` functions from `combat.ts`
- [ ] Combat reads from cached stat values (already calculated server-side)
- [ ] Combat-only effects (Max's debuff to enemies) applied at combat time
- [ ] Combat stats match displayed stats exactly

**Key Changes:**
- `src/rules/combat.ts` - Remove duplicate calculations

---

## STAT-05: Test Coverage

**Goal:** Integration tests verify all 18 stat-modifying abilities display and calculate correctly.

**Acceptance Criteria:**
- [ ] Test each equipment-conditional ability (Bouba, Mayhem, Rozeske, Stumpy, Vandradi, Dutch, Moe, Ra)
- [ ] Test each squad-conditional ability (Haarg, Sarge, Tack, Valkyrie, Snake, Tavisto)
- [ ] Test each passive ability (Shooter, Juicer, Ewok)
- [ ] Test combat-only abilities (Max, Walter, Vulture)
- [ ] Visual verification: start game, equip Stumpy with Mortar, verify no duplicate display

**Key Changes:**
- `tests/merc-abilities-integration.test.ts` - New test file

---

## Architecture

### Single Source of Truth: `merc-abilities.ts`

```typescript
interface StatModifier {
  stat: 'combat' | 'training' | 'initiative' | 'health' | 'targets' | 'actions';
  bonus: number;
  condition?: AbilityCondition;
  label?: string;  // For UI display (defaults to "[Name]'s Ability")
  target?: 'self' | 'squadMates' | 'allSquad' | 'enemyMercs' | 'militia';
}

interface MercAbility {
  id: string;
  statModifiers?: StatModifier[];  // NEW: unified stat bonuses
  // ... existing fields
}
```

### Unified Calculation Path

```
                    merc-abilities.ts
                    (single source)
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
   elements.ts                      CombatantCard.vue
   (server-side cache)              (UI breakdown)
          │                               │
          ▼                               │
   combat.ts                              │
   (reads cached values)                  │
          │                               │
          └───────────────┬───────────────┘
                          ▼
                    Consistent display
```

---

## Verification

1. **Unit tests**: Run `npm test` - all existing tests pass
2. **Visual verification**: Start game, equip Stumpy with Mortar, verify:
   - Combat shows 8 (Base 2 + Mortar +5 + Ability +1)
   - Tooltip shows exactly 3 lines (no duplication)
3. **Combat verification**: Enter combat with Mayhem+Uzi, verify combat dice match displayed value

---
*Created: 2026-02-03 for v1.8 milestone*
