---
phase: 47-equipment-slot-cleanup
verified: 2026-02-09T01:15:00Z
status: passed
score: 3/3 must-haves verified
---

# Phase 47: Equipment Slot Cleanup Verification Report

**Phase Goal:** Bandolier equipment behaves correctly when replaced or removed
**Verified:** 2026-02-09T01:15:00Z
**Status:** PASSED
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When a MERC replaces their bandolier with a different accessory, all items in bandolier slots are returned to the sector stash | VERIFIED | `CombatantBase.equip()` (elements.ts:922-925) calls `clearBandolierSlots()` before replacing the accessory when `getMaxBandolierSlots() > 0`, returning displaced items in `EquipResult.displacedBandolierItems`. All 16 caller sites destructure and route displaced items to sector stash (when available) or discard pile (when no sector). Test "replacing bandolier with items returns displaced bandolier contents" verifies the core behavior. |
| 2 | When a MERC no longer has a bandolier equipped, the bandolier slots are removed and no phantom slots remain | VERIFIED | `clearBandolierSlots()` (elements.ts:964-972) clears all `equippedSlot` values on bandolier items and calls `syncEquipmentData()` + `updateComputedStats()`. Tests verify `bandolierSlots` returns `[]` and `getMaxBandolierSlots()` returns `0` after replacement. |
| 3 | Existing tests continue to pass (no regressions in equipment handling) | VERIFIED | Full test suite: 637 passed, 7 skipped, 0 failures. TypeScript compiles cleanly with zero errors. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/rules/elements.ts` | EquipResult interface and bandolier-aware equip() in both CombatantBase and CombatantModel | VERIFIED | EquipResult at line 36-41, CombatantBase.equip() at line 903 returns EquipResult with bandolier clearing at line 924-925, CombatantModel.equip() override at line 1046 handles Gunther path at line 1063-1064 |
| `tests/equipment-slots.test.ts` | Tests for bandolier replacement and phantom slot removal | VERIFIED | 294 lines, 10 tests in 3 describe blocks: non-bandolier operations (5 tests), bandolier replacement (4 tests), Gunther bandolier replacement (1 test). All pass. |
| `src/rules/actions/rebel-equipment.ts` | 5 call sites destructure EquipResult and route displaced items | VERIFIED | Lines 219, 368, 730, 799, 1139 all destructure `{ replaced, displacedBandolierItems }` with proper routing (stash or discard) |
| `src/rules/actions/rebel-economy.ts` | 3 call sites destructure EquipResult and route displaced items | VERIFIED | Lines 515, 666, 1175 all destructure and route to sector stash with discard fallback |
| `src/rules/actions/helpers.ts` | 1 call site destructure, 1 initial equip (safe to ignore) | VERIFIED | Line 492 destructures with stash/discard routing. Line 459 is Vrbansk initial hire on empty merc -- correctly skipped. |
| `src/rules/actions/day-one-actions.ts` | 2 call sites destructure EquipResult | VERIFIED | Lines 706 and 768 destructure `{ displacedBandolierItems }` with discard routing |
| `src/rules/actions/dictator-actions.ts` | 1 call site destructures EquipResult | VERIFIED | Line 197 destructures with discard routing |
| `src/rules/day-one.ts` | 1 call site destructure, 1 initial equip (safe to ignore) | VERIFIED | Line 174 destructures with stash/discard routing. Line 141 is Vrbansk initial hire on empty merc -- correctly skipped. |
| `src/rules/dictator-abilities.ts` | 1 call site destructures EquipResult | VERIFIED | Line 76 destructures with discard routing |
| `src/rules/tactics-effects.ts` | 1 call site destructures EquipResult | VERIFIED | Line 212 destructures with discard routing |
| `src/rules/ai-helpers.ts` | 1 call site destructures EquipResult | VERIFIED | Line 545 destructures with stash/discard routing |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| CombatantBase.equip() | clearBandolierSlots() | Called when replacing bandolier accessory | WIRED | Line 925: `displacedBandolierItems = this.clearBandolierSlots()` inside `if (this.getMaxBandolierSlots() > 0)` guard |
| CombatantModel.equip() (Gunther) | clearBandolierSlots() | Called in Gunther's else branch | WIRED | Line 1064: same pattern as CombatantBase |
| All callers | sector.addToStash() or discard.putInto() | Routing displaced bandolier items | WIRED | Every caller with sector access routes to stash (with discard fallback for damaged items). Every caller without sector access routes to discard pile. |
| equip() return type | EquipResult | Compiler-enforced | WIRED | TypeScript compiles with zero errors. All callers destructure EquipResult. Two Vrbansk initial-hire calls correctly skip destructuring (merc starts empty, no displacement possible). |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| EQUIP-01: Replacing a bandolier with another accessory drops all bandolier slot contents to sector stash | SATISFIED | None |
| EQUIP-02: Bandolier slots are removed when bandolier is no longer equipped | SATISFIED | None |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No anti-patterns detected |

### Human Verification Required

None required. All truths are verifiable programmatically through test execution and code inspection.

### Gaps Summary

No gaps found. All three must-haves are verified:

1. The core `equip()` method in both `CombatantBase` and `CombatantModel` properly clears bandolier contents before replacing a bandolier accessory, returning displaced items in `EquipResult.displacedBandolierItems`.
2. All 16 caller sites across 9 files properly destructure the result and route displaced items to sector stash (when available) or discard pile (when no sector context exists).
3. The full test suite (637 tests) passes with zero regressions, TypeScript compiles cleanly, and 10 new equipment slot tests specifically cover bandolier replacement scenarios including Gunther's special path.

---

_Verified: 2026-02-09T01:15:00Z_
_Verifier: Claude (gsd-verifier)_
