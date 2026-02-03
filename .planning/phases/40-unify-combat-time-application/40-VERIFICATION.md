---
phase: 40-unify-combat-time-application
verified: 2026-02-03T20:35:33Z
status: passed
score: 4/4 must-haves verified
---

# Phase 40: Unify Combat-Time Application Verification Report

**Phase Goal:** Remove duplicate applyXBonus() functions from combat.ts and read from cached stat values.
**Verified:** 2026-02-03T20:35:33Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Combat stats match displayed stats (no double-counting) | VERIFIED | All 14 duplicate applyXBonus functions removed from combat.ts. mercToCombatant reads merc.combat/initiative/targets directly from unified getters (lines 523-528). |
| 2 | Equipment-conditional bonuses (Bouba, Mayhem, etc.) applied once from CombatantModel | VERIFIED | No matches for applyBouba/applyMayhem/applyRozeske/applyRa/applyStumpy/applyVandradi/applyDutch/applyMoe in combat.ts. Helper functions (isBouba, hasHandgun, etc.) also removed. |
| 3 | Squad-conditional bonuses (Sarge, Tack, Valkyrie) applied once from CombatantModel | VERIFIED | No matches for applySarge/applyTack/applyValkyrie/applyTavisto/applyVulture/applySnake in combat.ts. Helper functions (isSarge, isTack, etc.) also removed. |
| 4 | Combat-only effects (Max debuff, Walter militia, Khenn roll, Haarg all-combatant, Golem) still work | VERIFIED | All 5 combat-time functions preserved with both definitions and calls: applyEnemyDebuffs (188, 1185-1186), applyKhennInitiative (364, 1192), applyWalterBonus (378, 1189), applyHaargBonus (690, 1182), executeGolemPreCombat (407, 1195). Tests pass for all. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/rules/combat.ts` | Combat execution without duplicate bonus functions | VERIFIED | 2603 lines. No duplicate applyXBonus calls. Contains applyEnemyDebuffs at line 188. |
| `src/rules/elements.ts` | Unified targets getter | VERIFIED | targets getter at line 723 uses `getAbilityBonus('targets')` at line 732. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| src/rules/combat.ts | src/rules/elements.ts | mercToCombatant reads merc.combat, merc.initiative, merc.targets | WIRED | Lines 523-528: `initiative: merc.initiative`, `combat: merc.combat`, `targets: merc.targets`. refreshCombatantStats also reads same getters at lines 658-660. |

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| STAT-04 (from ROADMAP) | SATISFIED | Duplicate bonus functions removed, combat uses unified stat getters |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | - |

No TODO/FIXME/PLACEHOLDER patterns found in combat.ts.

### Human Verification Required

None required. All checks passed programmatically. Tests (580/580) cover combat-time effects.

### Test Results

All 580 tests pass. Test coverage verified for:
- Max's enemy debuff: `tests/merc-abilities.test.ts` lines 301-307
- Walter's militia bonus: `tests/merc-abilities-integration.test.ts` lines 573-581
- Khenn's initiative roll: `tests/combat-execution.test.ts` lines 212-217
- Haarg's bonus: `tests/merc-abilities-integration.test.ts` lines 271-312
- Golem's pre-combat: `tests/combat-execution.test.ts` lines 126-130

### Summary

Phase 40 successfully completed:

1. **Removed 14 duplicate bonus functions** - All equipment-conditional (Bouba, Mayhem, Rozeske, Ra, Stumpy, Vandradi, Dutch, Moe) and squad-conditional (Sarge, Tack, Valkyrie, Tavisto, Vulture, Snake) bonus functions removed.

2. **Removed 20+ helper functions** - All isX() and hasX() helper functions used only by removed bonus functions removed.

3. **Preserved combat-time-only effects** - applyEnemyDebuffs, applyWalterBonus, applyKhennInitiative, applyHaargBonus, executeGolemPreCombat all preserved with their helper functions (isWalter, isKhenn, isHaarg, isGolem).

4. **Unified targets getter** - Changed from individual bonus fields (moeSmawTargetBonus, raWeaponTargetBonus) to `getAbilityBonus('targets')`.

5. **Key link verified** - mercToCombatant and refreshCombatantStats both read from unified CombatantModel getters.

---

*Verified: 2026-02-03T20:35:33Z*
*Verifier: Claude (gsd-verifier)*
