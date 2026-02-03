# Phase 39: Unify UI Breakdown - Research

**Researched:** 2026-02-03
**Domain:** Vue component stat breakdown display
**Confidence:** HIGH

## Summary

Phase 39 requires modifying `CombatantCard.vue` to read ability bonuses from the unified `activeStatModifiers` array instead of checking individual hardcoded bonus fields. The current UI has two sources of ability bonus display:

1. **Hardcoded field checks** (lines 220-358): Individual checks like `getProp('boubaHandgunCombatBonus', 0)`, `getProp('tackSquadInitiativeBonus', 0)`, etc.
2. **"Ability +X" fallback** (lines 233-240): Calculates the difference between `effectiveX` and the sum of base+equipment bonuses, showing a generic "Ability" line

This dual approach causes the double display bug where abilities can appear twice in tooltips - once from the explicit check and once from the fallback.

**Primary recommendation:** Replace all hardcoded bonus checks with a single loop over `activeStatModifiers` from merc data, keyed by stat type.

## Standard Stack

The established approach for this domain:

### Core Pattern
| Approach | Version | Purpose | Why Standard |
|----------|---------|---------|--------------|
| Vue computed properties | Vue 3.x | Reactive breakdown generation | Already used in component |
| TypeScript interfaces | TS 5.x | Type-safe modifier structure | Already defined in merc-abilities.ts |

**No new dependencies required.** This is purely a refactor within existing component.

## Architecture Patterns

### Current Breakdown Generation (BEFORE)

```typescript
// Current trainingBreakdown (lines 245-261)
const trainingBreakdown = computed(() => {
  const breakdown = buildStatBreakdown('training', 'baseTraining');

  // Snake's solo training bonus - HARDCODED CHECK
  const snakeBonus = getProp('snakeSoloTrainingBonus', 0);
  if (snakeBonus > 0) {
    breakdown.push({ label: "Snake's Ability", value: snakeBonus });
  }

  // Tavisto's woman-in-squad training bonus - HARDCODED CHECK
  const tavistoBonus = getProp('tavistoWomanTrainingBonus', 0);
  if (tavistoBonus > 0) {
    breakdown.push({ label: "Tavisto's Ability", value: tavistoBonus });
  }

  return breakdown;
});
```

### Recommended Pattern (AFTER)

```typescript
// AFTER: Read from activeStatModifiers
const trainingBreakdown = computed(() => {
  const breakdown = buildStatBreakdown('training', 'baseTraining');

  // Get ability modifiers from unified source
  const modifiers = getAbilityModifiersForStat('training');
  for (const mod of modifiers) {
    breakdown.push({ label: mod.label, value: mod.bonus });
  }

  return breakdown;
});

// Helper to filter activeStatModifiers by stat type
function getAbilityModifiersForStat(stat: string) {
  const modifiers = getProp<Array<{stat: string; bonus: number; label?: string}>>('activeStatModifiers', []);
  return modifiers.filter(m => m.stat === stat);
}
```

### StatModifier Structure (from merc-abilities.ts)

```typescript
interface StatModifier {
  stat: 'combat' | 'training' | 'initiative' | 'health' | 'targets' | 'actions';
  bonus: number;
  condition?: AbilityCondition;  // Already evaluated server-side
  label?: string;                // Display label, defaults to "[Name]'s Ability"
  target?: BonusTarget;          // Already filtered to self-targeting in updateAbilityBonuses
}
```

The `activeStatModifiers` property on CombatantBase is populated by `updateAbilityBonuses()` (Phase 38) and includes:
- Self-targeting modifiers (target undefined or 'self')
- Received squad bonuses from other MERCs (Tack, Valkyrie)
- Haarg's per-stat evaluated bonuses

### Recommended Project Structure

No structural changes needed. All changes are within `CombatantCard.vue`.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stat modifier filtering | Custom loops per stat | Generic helper function | 6 stats would need 6 copies |
| Default label generation | String concatenation | Server-provided label | Labels already set in updateAbilityBonuses |
| Condition evaluation | Client-side checks | Already done server-side | activeStatModifiers only contains active modifiers |

**Key insight:** The server already does condition evaluation in `updateAbilityBonuses()`. The UI just needs to display what's in `activeStatModifiers` - no condition logic needed client-side.

## Common Pitfalls

### Pitfall 1: Keeping the Fallback Logic

**What goes wrong:** Leaving the "Ability +X" fallback (lines 233-240) in `buildStatBreakdown()` after adding modifier iteration
**Why it happens:** Developer might think "better safe than sorry"
**How to avoid:** The fallback exists BECAUSE there were no unified modifiers. Remove it completely when switching to `activeStatModifiers`.
**Warning signs:** Combat breakdown shows "Ability +2" and "Mayhem's Ability +2" (double display)

### Pitfall 2: Checking Individual Bonus Fields

**What goes wrong:** Keeping some hardcoded checks "just in case"
**Why it happens:** Fear of missing edge cases
**How to avoid:** ALL ability bonuses are now in `activeStatModifiers`. The individual bonus fields on CombatantBase still exist but are deprecated - don't read them in UI.
**Warning signs:** New ability added to registry doesn't appear in breakdown because it's not hardcoded in Vue

### Pitfall 3: Missing the MercData Interface Update

**What goes wrong:** `activeStatModifiers` not accessible via `getProp()`
**Why it happens:** TypeScript interface doesn't include the property
**How to avoid:** Add `activeStatModifiers?: Array<{stat: string; bonus: number; label?: string}>` to MercData interface
**Warning signs:** Runtime errors or empty breakdown for ability bonuses

### Pitfall 4: Forgetting Haarg's Special Handling

**What goes wrong:** Haarg's ability showing incorrectly
**Why it happens:** Haarg's ability is special-cased in server but UI expects generic pattern
**How to avoid:** Haarg's bonuses ARE in `activeStatModifiers` with proper labels. No special client handling needed - the server already handles the per-stat evaluation.
**Warning signs:** Haarg breakdown missing or showing wrong labels

### Pitfall 5: Forgetting Health and Actions Breakdowns

**What goes wrong:** Only updating combat/training/initiative breakdowns
**Why it happens:** Those are the most common stat modifiers
**How to avoid:** Review ALL breakdown computeds: `healthBreakdown` (Juicer), `actionsBreakdown` (Ewok), `targetsBreakdown` (Moe, Ra)
**Warning signs:** Juicer shows "Ability +2" instead of "Juicer's Ability +2" for health

## Code Examples

### Current Hardcoded Checks to Remove

```typescript
// Lines 220-229: Haarg-specific check
if (combatantId.value === 'haarg') {
  const haargBonusKey = statKey === 'training' ? 'haargTrainingBonus'
                      : statKey === 'initiative' ? 'haargInitiativeBonus'
                      : 'haargCombatBonus';
  const haargBonus = getProp(haargBonusKey, 0);
  if (haargBonus !== 0) {
    breakdown.push({ label: "Haarg's Ability", value: haargBonus });
  }
}

// Lines 233-240: "Ability +X" fallback (in buildStatBreakdown)
if (statKey === 'combat') {
  const effectiveCombat = getProp('effectiveCombat', 0);
  const sumSoFar = breakdown.reduce((sum, item) => sum + item.value, 0);
  const abilityBonus = effectiveCombat - sumSoFar;
  if (abilityBonus > 0) {
    breakdown.push({ label: 'Ability', value: abilityBonus });
  }
}

// Lines 263-310: combatBreakdown individual ability checks
const boubaBonus = getProp('boubaHandgunCombatBonus', 0);
const mayhemBonus = getProp('mayhemUziCombatBonus', 0);
const rozeskeBonus = getProp('rozeskeArmorCombatBonus', 0);
// ... etc
```

### Complete List of Hardcoded Checks to Remove

**In `buildStatBreakdown()` (lines 185-243):**
- `haargTrainingBonus`, `haargInitiativeBonus`, `haargCombatBonus` (Haarg special case)
- "Ability +X" fallback calculation for combat

**In `trainingBreakdown` (lines 245-261):**
- `snakeSoloTrainingBonus`
- `tavistoWomanTrainingBonus`

**In `combatBreakdown` (lines 263-310):**
- `boubaHandgunCombatBonus`
- `mayhemUziCombatBonus`
- `rozeskeArmorCombatBonus`
- `stumpyExplosiveCombatBonus`
- `vandradiMultiTargetCombatBonus`
- `dutchUnarmedCombatBonus`
- `snakeSoloCombatBonus`
- `tavistoWomanCombatBonus`

**In `initiativeBreakdown` (lines 313-360):**
- Vulture's initiative penalty negation (lines 317-327) - Note: This may need special handling since Vulture's ability negates penalties rather than adds a bonus
- `tackSquadInitiativeBonus`
- `valkyrieSquadInitiativeBonus`
- `dutchUnarmedInitiativeBonus`
- `snakeSoloInitiativeBonus`
- `tavistoWomanInitiativeBonus`

**In `targetsBreakdown` (lines 361-404):**
- `moeSmawTargetBonus`
- `raWeaponTargetBonus`

**In `healthBreakdown` (lines 407-418):**
- "Ability" fallback calculation (needs Juicer's proper label)

**In `actionsBreakdown` (lines 464-471):**
- `combatantId.value === 'ewok'` hardcoded check

### Unified Pattern

```typescript
// MercData interface addition (lines 15-40)
interface MercData {
  // ... existing properties
  activeStatModifiers?: Array<{
    stat: string;
    bonus: number;
    label?: string;
  }>;
}

// Helper function (add near line 75)
function getAbilityModifiersForStat(stat: string): Array<{label: string; value: number}> {
  const modifiers = getProp<Array<{stat: string; bonus: number; label?: string}>>('activeStatModifiers', []);
  return modifiers
    .filter(m => m.stat === stat)
    .map(m => ({
      label: m.label || 'Ability',  // Fallback shouldn't be needed, server provides labels
      value: m.bonus
    }));
}

// Example: trainingBreakdown refactored
const trainingBreakdown = computed(() => {
  const breakdown = buildStatBreakdown('training', 'baseTraining');

  // Add all ability modifiers for this stat
  for (const mod of getAbilityModifiersForStat('training')) {
    breakdown.push(mod);
  }

  return breakdown;
});
```

### Special Case: Vulture's Initiative Penalty Negation

Vulture's ability doesn't add a bonus - it negates equipment penalties. The server calculates this in `getEffectiveInitiative()` by skipping negative values. The UI currently shows this as:

```typescript
// Lines 317-327: Current Vulture handling
if (combatantId.value === 'vulture') {
  const penaltyTotal = breakdown
    .filter(item => item.label !== 'Base' && item.value < 0)
    .reduce((sum, item) => sum + item.value, 0);

  if (penaltyTotal < 0) {
    breakdown.push({ label: "Vulture's Ability", value: -penaltyTotal });
  }
}
```

This is NOT in `activeStatModifiers` because Vulture's ability doesn't add a stat modifier - it modifies how equipment penalties are calculated. **This handling should remain in `initiativeBreakdown`** since it's displaying how the ability negates existing penalties, not adding a bonus.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 20+ individual bonus fields | `activeStatModifiers` array | Phase 37-38 | Single source of truth |
| Multiple `updateXBonus()` methods | Single `updateAbilityBonuses()` | Phase 38 | Unified calculation |
| Hardcoded UI bonus checks | Read from server data | Phase 39 (now) | No UI maintenance for new abilities |

**Deprecated/outdated:**
- Individual bonus properties (`haargTrainingBonus`, `sargeTrainingBonus`, etc.) - still exist on CombatantBase but should not be read by UI
- `updateHaargBonus()`, `updateSargeBonus()`, etc. - deprecated methods that delegate to unified system

## Open Questions

Things that couldn't be fully resolved:

1. **Vulture's Initiative Penalty Negation**
   - What we know: This is a special case that shows how penalties are negated, not a bonus
   - What's unclear: Whether this should be represented in `activeStatModifiers` differently
   - Recommendation: Keep the current Vulture handling in `initiativeBreakdown` as it displays penalty negation (not a bonus). Document this as intentional exception.

2. **Equipment Bonus Display Order**
   - What we know: Equipment bonuses come before ability bonuses in current breakdown
   - What's unclear: Should ability modifiers always appear after equipment in tooltip?
   - Recommendation: Maintain current order (Base -> Equipment -> Abilities) for consistency

## Sources

### Primary (HIGH confidence)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/ui/components/CombatantCard.vue` - Current implementation (1270 lines)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/rules/elements.ts` - `activeStatModifiers` property and `updateAbilityBonuses()`
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/rules/merc-abilities.ts` - `StatModifier` interface

### Secondary (MEDIUM confidence)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/.planning/phases/38-unify-server-side-calculation/38-02-SUMMARY.md` - Phase 38 implementation details
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/.planning/REQUIREMENTS.md` - STAT-03 acceptance criteria

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Vue 3 computed properties already in use
- Architecture: HIGH - Pattern is clear, just iterate over array
- Pitfalls: HIGH - Double display bug documented in requirements

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (30 days - stable codebase)
