# v1.8 Roadmap: Unified Stat Ability System

## Overview

5 phases to refactor stat-modifying abilities into a single unified system, eliminating duplicate calculations and ensuring consistent display in UI.

**Goal:** Single source of truth for ability stat bonuses - define once in registry, calculate once server-side, display once in UI.

---

## Phase 37: Extend Ability Registry

**Requirements:** STAT-01

**Goal:** Add `statModifiers` field to `MercAbility` interface and migrate all 18 MERCs' stat bonuses to declarative format.

**Plans:** 1 plan

Plans:
- [x] 37-01-PLAN.md - Add StatModifier interface, migrate 18 MERCs, add getActiveStatModifiers function ✓

**Deliverables:**
- `StatModifier` interface with stat, bonus, condition, label, target fields
- `statModifiers` field on `MercAbility` interface
- All 18 stat-modifying MERCs defined in registry
- `getActiveStatModifiers(merc, context)` function

**Key Files:**
- `src/rules/merc-abilities.ts`

**Success Criteria:**
- All 18 stat-modifying abilities have declarative definitions
- `getActiveStatModifiers` returns correct modifiers for each MERC type
- Existing tests still pass (no behavioral changes yet)

---

## Phase 38: Unify Server-Side Calculation

**Requirements:** STAT-02

**Goal:** Replace 20+ individual bonus fields with single `activeStatModifiers` computed property that reads from registry.

**Deliverables:**
- `calculateStatModifiers(merc, squad)` function in elements.ts
- `activeStatModifiers` computed property on CombatantModel
- `updateAbilityBonuses()` replaces multiple `updateXBonus()` methods
- `updateComputedStats()` uses unified calculation

**Key Files:**
- `src/rules/elements.ts`

**Success Criteria:**
- Single calculation path for all ability stat bonuses
- `effectiveCombat`, `effectiveTraining`, etc. still compute correctly
- All existing tests pass

---

## Phase 39: Unify UI Breakdown

**Requirements:** STAT-03

**Goal:** Remove hardcoded bonus field checks from `CombatantCard.vue` and generate breakdown from `activeStatModifiers`.

**Deliverables:**
- Remove hardcoded bonus field checks
- Read `activeStatModifiers` from merc data
- Generate breakdown items from modifier list
- Remove "Ability +X" fallback logic

**Key Files:**
- `src/ui/components/CombatantCard.vue`

**Success Criteria:**
- No duplicate display of ability bonuses
- Tooltips show correct breakdown for all 18 MERCs
- No hardcoded ability checks in Vue component

---

## Phase 40: Unify Combat-Time Application

**Requirements:** STAT-04

**Goal:** Remove duplicate `applyXBonus()` functions from combat.ts and read from cached stat values.

**Deliverables:**
- Remove duplicate calculation functions from combat.ts
- Combat reads from `effectiveCombat`, `effectiveTraining`, etc.
- Combat-only effects (Max's debuff) applied at combat time only
- Combat stats match displayed stats

**Key Files:**
- `src/rules/combat.ts`

**Success Criteria:**
- Combat calculations use cached values
- No duplicate stat calculation at combat time
- Combat results match UI display

---

## Phase 41: Testing & Verification

**Requirements:** STAT-05

**Goal:** Add integration tests for each stat-modifying ability and verify UI displays correctly.

**Deliverables:**
- Integration tests for equipment-conditional abilities (8 MERCs)
- Integration tests for squad-conditional abilities (6 MERCs)
- Integration tests for passive abilities (3 MERCs)
- Integration tests for combat-only abilities (3 MERCs)
- Visual verification documentation

**Key Files:**
- `tests/merc-abilities-integration.test.ts` (new)

**Success Criteria:**
- All 18 stat-modifying abilities have test coverage
- Visual verification: Stumpy+Mortar shows no duplicate display
- Combat verification: Mayhem+Uzi combat dice match displayed value
- All tests pass

---

## Phase Dependencies

```
Phase 37 (Registry)
    |
    v
Phase 38 (Server-Side)
    |
    v
Phase 39 (UI)          Phase 40 (Combat)
    |                       |
    +----------+------------+
               v
         Phase 41 (Testing)
```

Phases 39 and 40 can be worked in parallel after Phase 38 completes.

---

## Affected Files Summary

| Phase | Primary Files | Secondary Files |
|-------|---------------|-----------------|
| 37 | merc-abilities.ts | - |
| 38 | elements.ts | helpers.ts |
| 39 | CombatantCard.vue | - |
| 40 | combat.ts | combat-types.ts |
| 41 | merc-abilities-integration.test.ts | - |

---
*Created: 2026-02-03 for v1.8 milestone*
