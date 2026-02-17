---
phase: 59-militia-placement-abilities
verified: 2026-02-17T19:30:00Z
status: passed
score: 11/11 must-haves verified
---

# Phase 59: Militia Placement Abilities Verification Report

**Phase Goal:** Mao, Mussolini, and Pol Pot place militia each turn following patterns similar to Kim's existing militia ability.
**Verified:** 2026-02-17T19:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Mao places militia equal to rebel-controlled sector count into wilderness sectors each turn | VERIFIED | `applyMaoTurnAbility` at dictator-abilities.ts:486 counts rebel sectors, filters wilderness, places one-at-a-time via loop |
| 2 | Human Mao can distribute militia across multiple wilderness sectors interactively | VERIFIED | `createMaoBonusMilitiaAction` at dictator-actions.ts:843 with chooseFrom targetSector (wilderness filter) + amount; flow loop at flow.ts:1006 |
| 3 | AI Mao distributes militia across wilderness sectors automatically | VERIFIED | `applyMaoTurnAbility` uses `selectMilitiaPlacementSector` per iteration, spreading one-at-a-time |
| 4 | Placing militia on rebel-occupied wilderness triggers combat | VERIFIED | Both AI (dictator-abilities.ts:530) and human (dictator-actions.ts:890) check rebel presence and call `queuePendingCombat` |
| 5 | Mussolini adds militia equal to rebel count to a chosen controlled sector each turn | VERIFIED | `applyMussoliniTurnAbility` at dictator-abilities.ts:556 uses `game.rebelCount`, filters controlled sectors, calls `addDictatorMilitia(rebelCount)` |
| 6 | After placing, Mussolini can optionally spread militia to adjacent sectors | VERIFIED | AI spread at dictator-abilities.ts:606; human spread via `createMussoliniSpreadMilitiaAction` at dictator-actions.ts:987 with "Done spreading" skip option |
| 7 | Spread step is optional — dictator can skip it | VERIFIED | "Done spreading" is first in choices array at dictator-actions.ts:1009; execute handles it at line 1029 clearing pending |
| 8 | AI Mussolini places and spreads militia automatically | VERIFIED | Full AI path in `applyMussoliniTurnAbility` at dictator-abilities.ts:556-657 with prioritized spread |
| 9 | Pol Pot adds militia equal to rebel-controlled sector count to any one rebel sector (max 10 per sector) | VERIFIED | `applyPolpotTurnAbility` at dictator-abilities.ts:665 and `createPolpotBonusMilitiaAction` at dictator-actions.ts:1091; standard cap via `addDictatorMilitia` |
| 10 | If dictator loses combat (rebel victory only), Pol Pot hires 1 random MERC | VERIFIED | Combat outcome tracked via `_polpotTargetSectorId` + sector control check at flow.ts:1054-1097; AI auto-hire at line 1073; human hire via `createPolpotBonusHireAction` at dictator-actions.ts:1174 |
| 11 | Dictator CHOOSES which squad for the hired MERC (interactive) | VERIFIED | `chooseFrom('targetSquad')` at dictator-actions.ts:1209 presents Primary/Secondary squad choices |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/rules/dictator-abilities.ts` | applyMaoTurnAbility | VERIFIED | 63 lines (486-549), substantive AI logic with wilderness filter, one-at-a-time spread, combat check |
| `src/rules/dictator-abilities.ts` | applyMussoliniTurnAbility | VERIFIED | 101 lines (556-657), two-step: place + AI spread with rebel-priority ordering |
| `src/rules/dictator-abilities.ts` | applyPolpotTurnAbility | VERIFIED | 70 lines (665-734), rebel sector targeting + combat queue + target tracking |
| `src/rules/actions/dictator-actions.ts` | createMaoBonusMilitiaAction | VERIFIED | 66 lines (843-909), sector+amount chooseFrom, cap enforcement, combat check |
| `src/rules/actions/dictator-actions.ts` | createMussoliniBonusMilitiaAction | VERIFIED | 58 lines (919-977), controlled sector choice, sets up pendingMussoliniSpread |
| `src/rules/actions/dictator-actions.ts` | createMussoliniSpreadMilitiaAction | VERIFIED | 93 lines (987-1080), adjacent sectors + "Done spreading", source/target militia moves |
| `src/rules/actions/dictator-actions.ts` | createPolpotBonusMilitiaAction | VERIFIED | 72 lines (1091-1163), rebel sector filter, combat queue, target tracking |
| `src/rules/actions/dictator-actions.ts` | createPolpotBonusHireAction | VERIFIED | 80+ lines (1174+), MERC draw cache, squad choice, equipment choice, full execute logic |
| `src/rules/game.ts` | pendingMaoMilitia | VERIFIED | State field + getter at lines 644-650 |
| `src/rules/game.ts` | pendingMussoliniSpread | VERIFIED | State field + getter at lines 653-660 |
| `src/rules/game.ts` | _polpotTargetSectorId + lastAbilityCombatOutcome | VERIFIED | Fields at lines 663-669 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| dictator-abilities.ts | applyDictatorTurnAbilities switch | case 'mao'/'mussolini'/'polpot' | WIRED | Lines 931-939 |
| actions/index.ts | registerAllActions | 5 action registrations | WIRED | Lines 220-228, all imports at 102-110 |
| flow.ts | dictator-ability actionStep | maoBonusMilitia, mussoliniBonusMilitia, polpotBonusMilitia in actions | WIRED | Line 1001 |
| flow.ts | mao-militia-distribution loop | maoBonusMilitia in loop body | WIRED | Lines 1006-1016 |
| flow.ts | mussolini-spread loop | mussoliniSpreadMilitia in loop body | WIRED | Lines 1018-1029 |
| flow.ts | polpot-bonus-hire actionStep | polpotBonusHire + skipIf guard | WIRED | Lines 1100-1108 |
| flow.ts | combat outcome capture | _polpotTargetSectorId + sector control | WIRED | Lines 1054-1097 |
| DictatorPanel.vue | dictatorSpecificActions | All 5 action names | WIRED | Line 136 |
| DictatorPanel.vue | isSelectingSector | maoBonusMilitia, mussoliniBonusMilitia, mussoliniSpreadMilitia, polpotBonusMilitia | WIRED | Line 170 |

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| Mao wilderness militia placement | SATISFIED | AI and human paths, wilderness-only filter |
| Mussolini controlled sector + spread | SATISFIED | Two-step flow, optional spread with "Done" |
| Pol Pot rebel sector + conditional hire | SATISFIED | Combat outcome tracking, interactive squad choice |
| Interactive selections with valid sector filtering | SATISFIED | All actions use chooseFrom with filtered sector lists |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | - |

No TODO/FIXME/placeholder patterns found in Phase 59 code. TypeScript compiles cleanly with zero errors.

### Human Verification Required

### 1. Mao Wilderness Militia Placement (Human)

**Test:** Start a game as human Mao. During dictator ability phase, verify wilderness sector choices appear with amount selection. Place militia across multiple sectors.
**Expected:** Loop continues until all militia distributed. Sectors show only wilderness with room. Combat triggers on rebel-occupied wilderness.
**Why human:** Interactive flow requires real game session to verify UX.

### 2. Mussolini Two-Step Ability (Human)

**Test:** Start a game as human Mussolini. During dictator ability phase, choose a controlled sector for placement. Then verify the spread loop appears with "Done spreading" as first option.
**Expected:** Step 1 shows controlled sectors. Step 2 shows adjacent sectors + Done option. Militia are moved (not created). Choosing "Done spreading" ends the loop.
**Why human:** Two-step flow with optional skip needs real game verification.

### 3. Pol Pot Combat Loss Hire (Human)

**Test:** Start a game as human Pol Pot. Place militia on a rebel sector. If rebels win the combat, verify the hire step appears with MERC draw and squad selection.
**Expected:** Rebel victory triggers hire step. Dictator chooses squad (Primary/Secondary). Retreat does NOT trigger hire.
**Why human:** Combat outcome conditional flow requires actual combat resolution.

---

_Verified: 2026-02-17T19:30:00Z_
_Verifier: Claude (gsd-verifier)_
