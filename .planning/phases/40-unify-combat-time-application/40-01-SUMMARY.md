---
phase: 40-unify-combat-time-application
plan: 01
subsystem: combat
tags: [stat-calculation, combat-system, refactoring, dead-code-removal]
dependency-graph:
  requires: [37-01, 38-01, 38-02, 39-01, 39-02]
  provides:
    - unified-combat-stats
    - no-double-counting
  affects: [41]
tech-stack:
  added: []
  patterns:
    - Single source of truth for stat calculations
key-files:
  created: []
  modified:
    - src/rules/combat.ts
    - src/rules/elements.ts
decisions:
  - id: STAT-04-1
    choice: "Remove 14 duplicate bonus functions and 20+ helper functions"
    reason: "CombatantModel stat getters already calculate all ability bonuses via getAbilityBonus()"
  - id: STAT-04-2
    choice: "Preserve combat-time-only effects (Haarg, Max, Walter, Khenn, Golem)"
    reason: "These effects apply only during combat, not displayed on cards"
  - id: STAT-04-3
    choice: "Unify targets getter with getAbilityBonus('targets')"
    reason: "Moe and Ra targets bonuses now use same pattern as other stat getters"
metrics:
  duration: 5min
  completed: 2026-02-03
---

# Phase 40 Plan 01: Unify Combat-Time Application Summary

Removed 610 lines of duplicate stat calculation code from combat.ts by eliminating applyXBonus functions that double-counted abilities already calculated in CombatantModel's unified stat getters.

## What Was Done

### Task 1: Remove duplicate bonus functions from combat.ts
**Commit:** 1507b9b

Removed 14 duplicate applyXBonus functions:
- Equipment-conditional: applyBoubaBonus, applyMayhemBonus, applyRozeskeBonus, applyRaBonus, applyStumpyBonus, applyVandradiBonus, applyDutchBonus, applyMoeBonus
- Squad-conditional: applySargeBonus, applyTackBonus, applyValkyrieBonus, applyTavistoBonus, applyVultureBonus, applySnakeBonus

Removed 20+ helper functions only used by removed bonus functions:
- isBouba, hasHandgun, isMayhem, hasUzi, isRa, isRozeske, hasArmor
- isSarge, isStumpy, hasExplosive, isTack, isTavisto, isValkyrie
- isVandradi, hasMultiTargetWeapon, isVulture, isDutch, isDutchUsingFists
- isMoe, hasSmaw, isSnake

Removed imports no longer needed:
- isHandgun, isUzi, isExplosive, isSword, isSmaw (from equipment-effects.js)

Preserved combat-time-only functions:
- applyHaargBonus (compares to ALL combatants per rules, not just squad)
- applyEnemyDebuffs (Max's -1 combat to enemies only during combat)
- applyWalterBonus (militia not tracked by CombatantModel)
- applyKhennInitiative (random D6 roll at combat start)
- executeGolemPreCombat (pre-combat attack)

### Task 2: Fix targets getter to use unified getAbilityBonus
**Commit:** c5055d7

- Changed targets getter from individual bonus fields to `getAbilityBonus('targets')`
- Removed moeSmawTargetBonus and raWeaponTargetBonus properties from CombatantBase
- Removed their initialization from updateEquipmentBonuses()
- Ra and Moe targets bonuses now work via activeStatModifiers

## Metrics

| Metric | Value |
|--------|-------|
| Tasks completed | 2/2 |
| Tests passing | 580 |
| Lines removed | 610 |
| Files modified | 2 |
| Duration | 5 min |

## Verification Results

1. All tests pass (580/580)
2. No duplicate bonus function calls in executeCombatRound
3. Combat-time functions preserved (11 occurrences found)
4. targets getter uses unified getAbilityBonus('targets')

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

Phase 41 (Testing & Verification) can proceed:
- All stat calculations now use single source of truth
- Combat stats match displayed stats exactly
- No double-counting of ability bonuses
