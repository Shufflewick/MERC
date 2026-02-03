---
phase: 39-unify-ui-breakdown
verified: 2026-02-03T13:59:00Z
status: gaps_found
score: 3/4 must-haves verified
gaps:
  - truth: "Ability bonuses display with proper labels (e.g., 'Stumpy's Ability +2')"
    status: partial
    reason: "Self-targeting modifiers lack MERC name labels - show as 'Ability' not '[Name]'s Ability'"
    artifacts:
      - path: "src/rules/elements.ts"
        issue: "updateAbilityBonuses() does not add labels for selfOnlyModifiers (line 345)"
    missing:
      - "Label transformation for selfOnlyModifiers: label: mod.label || `${this.combatantName}'s Ability`"
    note: "This is a Phase 38 issue - server should add labels. Phase 39 UI correctly reads labels but server doesn't provide them for self modifiers."
---

# Phase 39: Unify UI Breakdown Verification Report

**Phase Goal:** Remove hardcoded bonus field checks from CombatantCard.vue and generate breakdown from activeStatModifiers.
**Verified:** 2026-02-03T13:59:00Z
**Status:** gaps_found
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Ability bonuses display with proper labels (e.g., 'Stumpy's Ability +2') | PARTIAL | Self modifiers show "Ability" not "[Name]'s Ability" - Phase 38 doesn't add labels for selfOnlyModifiers |
| 2 | No duplicate display of ability bonuses in tooltips | VERIFIED | "Ability +X" fallback removed (line 245-246 comment), all checks use unified helper |
| 3 | All 18 stat-modifying MERC abilities appear correctly in breakdowns | VERIFIED | 6 breakdown computeds use getAbilityModifiersForStat (training, combat, initiative, targets, health, actions) |
| 4 | Vulture's penalty negation still displays correctly | VERIFIED | Lines 271-280 preserve Vulture special handling for penalty negation |

**Score:** 3/4 truths verified (1 partial)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/ui/components/CombatantCard.vue` | Unified breakdown from activeStatModifiers | VERIFIED | 1181 lines, substantive, getAbilityModifiersForStat at line 91 |

**Artifact Level Checks:**
- Level 1 (Exists): PASS - file exists
- Level 2 (Substantive): PASS - 1181 lines, no TODO/FIXME/placeholder patterns
- Level 3 (Wired): PASS - uses getProp('activeStatModifiers', []) at line 92

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| CombatantCard.vue | activeStatModifiers | getProp() in getAbilityModifiersForStat | WIRED | Line 92: `getProp<Array<{stat: string; bonus: number; label?: string}>>('activeStatModifiers', [])` |

### Hardcoded Bonus Field Removal

Verification command: `grep -E "(haarg|sarge|tack|valkyrie|bouba|mayhem|rozeske|stumpy|vandradi|dutch|snake|tavisto|moe|ra)[A-Z].*Bonus" src/ui/components/CombatantCard.vue`

**Result:** No matches found - all hardcoded bonus field checks removed

Additional verification:
- `combatantId.value === 'ewok'` check: Not found (removed)
- `combatantId.value === 'vulture'` check: Found at line 271 (intentionally preserved)

### Breakdown Computed Verification

All 6 breakdown computeds use getAbilityModifiersForStat():

| Breakdown | Line | Call |
|-----------|------|------|
| trainingBreakdown | 254 | `breakdown.push(...getAbilityModifiersForStat('training'))` |
| combatBreakdown | 261 | `breakdown.push(...getAbilityModifiersForStat('combat'))` |
| initiativeBreakdown | 284 | `breakdown.push(...getAbilityModifiersForStat('initiative'))` |
| targetsBreakdown | 318 | `breakdown.push(...getAbilityModifiersForStat('targets'))` |
| healthBreakdown | 326 | `breakdown.push(...getAbilityModifiersForStat('health'))` |
| actionsBreakdown | 381 | `breakdown.push(...getAbilityModifiersForStat('actions'))` |

### Tests

All 580 tests pass (1 skipped):
```
Test Files  14 passed (14)
     Tests  580 passed | 1 skipped (581)
```

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| - | - | None found | - | - |

No TODO, FIXME, placeholder, or stub patterns found in modified file.

### Human Verification Required

| # | Test | Expected | Why Human |
|---|------|----------|-----------|
| 1 | Check Stumpy+Mortar tooltip | Should show "Stumpy's Ability +1" | Need to see actual label rendering |
| 2 | Check Haarg with higher squad mate | Should show "Haarg's Ability +1" | Visual verification of special case |
| 3 | Check Tack squad bonus on teammate | Should show "Tack's Ability +2" | Visual verification of squad bonus |
| 4 | Check Vulture with armor penalty | Should show "Vulture's Ability +3" (negating -3) | Visual verification of penalty negation |

### Gaps Summary

**1 gap found affecting Truth #1:**

Self-targeting modifiers (Stumpy, Bouba, Mayhem, Rozeske, Vandradi, Dutch, Snake, Tavisto, Sarge, Moe, Ra, Ewok, Juicer) will display as generic "Ability +X" instead of "[Name]'s Ability +X" in UI tooltips.

**Root cause:** Phase 38 `updateAbilityBonuses()` in elements.ts (line 345) does not add labels for `selfOnlyModifiers`. It only adds labels for:
- Squad-received modifiers (line 382, 388): `${mate.combatantName}'s Ability`
- Haarg's special modifiers (line 426-432): Explicitly adds "Haarg's Ability"

**Fix location:** Phase 38 code in `src/rules/elements.ts`, not Phase 39 UI code.

**Suggested fix in elements.ts line 345:**
```typescript
// Filter to self-only modifiers (target undefined or 'self')
const selfOnlyModifiers = selfModifiers
  .filter(m => !m.target || m.target === 'self')
  .map(m => ({
    ...m,
    label: m.label || `${this.combatantName}'s Ability`,
  }));
```

---

*Verified: 2026-02-03T13:59:00Z*
*Verifier: Claude (gsd-verifier)*
