---
phase: 58-setup-phase-abilities
verified: 2026-02-17T19:15:00Z
status: passed
score: 7/7 must-haves verified
---

# Phase 58: Setup-Phase Abilities Verification Report

**Phase Goal:** "Hussein, Mao, and Mussolini modify game state during setup, and Hussein's persistent double-tactics works each turn."
**Verified:** 2026-02-17
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Hussein starts the game with 10 tactics cards instead of 5 | VERIFIED | `applyHusseinSetupAbility` in dictator-abilities.ts:110-166 calculates `additionalNeeded = DictatorConstants.HUSSEIN_TACTICS_CARDS - currentCount`, creates TacticsCard elements from pool, shuffles deck. `HUSSEIN_TACTICS_CARDS: 10` in constants.ts:110. Wired into `applyDictatorSetupAbilities` switch at line 637-638. |
| 2 | Hussein draws and plays a second tactics card each turn | VERIFIED | flow.ts:1020-1051 has execute step (draws card to hand for human, calls `applyHusseinBonusTactics` for AI) plus actionStep `hussein-bonus-tactics` with `['husseinBonusTactics', 'husseinBonusReinforce']` actions. Placed after Conscripts, before hand refill. skipIf guards for non-Hussein and AI. |
| 3 | Second tactics play triggers all post-effects | VERIFIED | flow.ts:1057-1097 contains `hussein-bonus-artillery` loop (artilleryAllocateHits), `hussein-bonus-generalissimo` loop (generalissimoPick), `hussein-bonus-lockdown` loop (lockdownPlaceMilitia), and `combatResolutionFlow(game, 'hussein-bonus-combat')`. All four post-effect types are present. |
| 4 | Mao starts with 1 random MERC per rebel player, placed into chosen squads | VERIFIED | `applyMaoSetupAbility` in dictator-abilities.ts:172-239. AI path loops `game.rebelCount` times, draws MERC, places into primary then secondary, equips, emits animations. Human path returns message, defers to flow loop. Wired into switch at line 639-640. |
| 5 | Mussolini starts with 1 random MERC per rebel player, placed into chosen squads | VERIFIED | `applyMussoliniSetupAbility` in dictator-abilities.ts:245-312. Identical logic to Mao with 'mussolini' guard. Wired into switch at line 641-642. |
| 6 | Squad placement choices are interactive selections for human dictator | VERIFIED | `createBonusMercSetupAction` in day-one-actions.ts:914-1044 presents 3 selections: drawn MERC name, squad choice (Primary/Secondary), equipment type. Flow loop `bonus-merc-placement` in flow.ts:554-569 iterates while `_bonus_mercs_remaining > 0`. Counter initialized at flow.ts:544-551 with `game.rebelCount`. |
| 7 | AI dictator auto-places bonus MERCs | VERIFIED | AI guard in Mao/Mussolini abilities (`game.dictatorPlayer?.isAI`) runs full hire loop directly. Flow loop's while condition returns false for AI (`if (game.dictatorPlayer?.isAI) return false` at flow.ts:559). No double-hiring possible. |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/rules/dictator-abilities.ts` | Setup abilities for Hussein/Mao/Mussolini + per-turn Hussein bonus | VERIFIED | 680 lines. Contains applyHusseinSetupAbility (line 110), applyMaoSetupAbility (line 172), applyMussoliniSetupAbility (line 245), applyHusseinBonusTactics (line 591). All wired into switch dispatchers. |
| `src/rules/constants.ts` | HUSSEIN_TACTICS_CARDS constant | VERIFIED | `HUSSEIN_TACTICS_CARDS: 10` at line 110 in DictatorConstants. |
| `src/rules/actions/day-one-actions.ts` | bonusMercSetup action for Mao/Mussolini | VERIFIED | `createBonusMercSetupAction` at line 914, 130 lines. Has 3 selections, execute handler with squad placement, equip, counter decrement. |
| `src/rules/actions/dictator-actions.ts` | husseinBonusTactics and husseinBonusReinforce | VERIFIED | `createHusseinBonusTacticsAction` at line 1193 (100 lines), `createHusseinBonusReinforceAction` at line 1298 (70 lines). Both have proper conditions, selections, and execute handlers. |
| `src/rules/actions/index.ts` | All new actions registered | VERIFIED | Lines 104-105 import husseinBonusTactics/husseinBonusReinforce. Line 124 imports bonusMercSetup. Lines 204, 217-218 register all three. |
| `src/rules/flow.ts` | bonus-merc-placement loop + hussein-bonus steps | VERIFIED | bonus-merc-placement loop at lines 554-569. Hussein bonus draw+play at lines 1020-1051. Post-effects at lines 1057-1097. |
| `src/ui/components/DictatorPanel.vue` | UI routing for husseinBonusTactics/husseinBonusReinforce | VERIFIED | Added to dictatorSpecificActions (line 136). Action buttons at lines 120-124. Base location routing at line 174. Sector routing at line 178. Equipment routing at line 190. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| flow.ts | bonusMercSetup action | actionStep in bonus-merc-placement loop | WIRED | flow.ts:566 `actions: ['bonusMercSetup']` |
| flow.ts | husseinBonusTactics/Reinforce | actionStep hussein-bonus-tactics | WIRED | flow.ts:1046 `actions: ['husseinBonusTactics', 'husseinBonusReinforce']` |
| flow.ts | applyHusseinBonusTactics | execute step for AI | WIRED | flow.ts:1028 calls imported function |
| dictator-abilities.ts switch | hussein/mao/mussolini | case statements | WIRED | Lines 637-642 in applyDictatorSetupAbilities |
| index.ts | all 3 new actions | registerAllActions | WIRED | Lines 204, 217-218 register bonusMercSetup, husseinBonusTactics, husseinBonusReinforce |
| DictatorPanel.vue | husseinBonusTactics routing | dictatorSpecificActions + selection routing | WIRED | Lines 120-124, 136, 174, 178, 190 |

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| Hussein starts with 10 tactics cards | SATISFIED | Setup ability + constant verified |
| Hussein draws/plays second tactics card each turn | SATISFIED | Flow steps + actions + post-effects verified |
| Mao starts with 1 MERC per rebel player | SATISFIED | Setup ability + flow loop verified |
| Mussolini starts with 1 MERC per rebel player | SATISFIED | Setup ability + flow loop verified |
| Squad placement is interactive | SATISFIED | bonusMercSetup action with 3 selections verified |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | - | - | - | - |

No TODO/FIXME/placeholder patterns found in any modified files. No empty implementations or stub patterns detected.

### Human Verification Required

### 1. Hussein Double Tactics Flow

**Test:** Play a game as human Hussein. After the normal tactics play phase, verify a second "Hussein's Ability: Play a second tactics card" prompt appears.
**Expected:** Can select a card from hand, play it (or reinforce), and any post-effects (artillery, generalissimo, lockdown, combat) resolve correctly.
**Why human:** Full flow execution with UI rendering cannot be verified programmatically.

### 2. Mao/Mussolini Bonus MERC Placement

**Test:** Play a game as human Mao (or Mussolini) with 2 rebel players. During Day 1 setup, after dictator selection, verify 2 bonus MERC placement prompts appear.
**Expected:** Each prompt shows a drawn MERC name, offers Primary/Secondary squad choice, and equipment type selection. MERCs appear on map after placement.
**Why human:** Interactive flow loop with sequential selections requires UI interaction to verify.

### 3. AI Path Correctness

**Test:** Start a game with AI Mao/Mussolini/Hussein dictator. Verify AI dictator's squads have bonus MERCs (Mao/Mussolini) or expanded tactics deck (Hussein).
**Expected:** AI path auto-completes without errors, bonus MERCs appear in squads, Hussein has 10 tactics cards.
**Why human:** AI game progression and state inspection requires running the game.

### Gaps Summary

No gaps found. All must-haves from both 58-01-PLAN.md and 58-02-PLAN.md are verified in the codebase:

- **Hussein setup:** `applyHusseinSetupAbility` creates 5 additional TacticsCard elements (target: 10 total via `HUSSEIN_TACTICS_CARDS` constant), shuffles deck.
- **Hussein per-turn:** Flow has execute step (AI auto-play / human draw-to-hand), actionStep with `husseinBonusTactics`/`husseinBonusReinforce`, and all four post-effect types (artillery, generalissimo, lockdown, combat).
- **Mao/Mussolini setup:** Both have AI auto-hire paths in ability functions and human interactive paths via `bonusMercSetup` action in `bonus-merc-placement` flow loop.
- **Action registration:** All 3 new actions registered in index.ts.
- **UI wiring:** DictatorPanel.vue routes husseinBonusTactics/husseinBonusReinforce through all selection types.
- **Type check:** `npx tsc --noEmit` passes clean.

---

_Verified: 2026-02-17_
_Verifier: Claude (gsd-verifier)_
