---
phase: 42-remove-dead-apis
verified: 2026-02-08T16:20:00Z
status: passed
score: 6/6 must-haves verified
---

# Phase 42: Remove Dead APIs Verification Report

**Phase Goal:** All references to BoardSmith v2 theatre view APIs are gone -- the codebase compiles clean against BoardSmith v3.0 without dead imports or calls to removed functions
**Verified:** 2026-02-08T16:20:00Z
**Status:** PASSED
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Zero references to useCurrentView or CURRENT_VIEW_KEY anywhere in src/ | VERIFIED | grep returns zero matches in src/ |
| 2 | Zero references to acknowledgeAnimations, acknowledgeAnimationEvents, or createAcknowledgeAnimationsAction anywhere in src/ | VERIFIED | grep for all three symbols returns zero matches in src/ |
| 3 | Zero references to truthCombatComplete or truthActiveCombat anywhere in src/ | VERIFIED | grep returns zero matches in src/ |
| 4 | The acknowledge callback is removed from createAnimationEvents in App.vue | VERIFIED | App.vue line 26-28: createAnimationEvents call only has `events:` property, no `acknowledge:` |
| 5 | All existing tests pass with no regressions | VERIFIED | 602 passed, 7 skipped (pre-existing), 14 test files, 0 failures |
| 6 | TypeScript compilation no longer has dead-API errors for these 4 symbols | VERIFIED | Test suite compiles and runs clean; imports in CombatPanel.vue, GameTable.vue, App.vue reference only valid boardsmith/ui exports |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/ui/components/CombatPanel.vue` | CombatPanel without useCurrentView or truthCombatComplete | VERIFIED | 1508 lines; imports only `useAnimationEvents` from boardsmith/ui; combatComplete sourced from `props.activeCombat?.combatComplete` only; zero references to removed symbols |
| `src/ui/components/GameTable.vue` | GameTable without useCurrentView or truthActiveCombat | VERIFIED | 1693 lines; imports `useBoardInteraction, UseActionControllerReturn, useAnimationEvents, GameOverlay` from boardsmith/ui; activeCombat computed returns `theatreActiveCombat.value ?? null` with no truth view fallback |
| `src/ui/App.vue` | App without acknowledge callback in createAnimationEvents | VERIFIED | 730 lines; createAnimationEvents call (line 26-28) has only `events:` property |
| `src/rules/actions/rebel-combat.ts` | rebel-combat without createAcknowledgeAnimationsAction | VERIFIED | 1600 lines; createClearCombatAnimationsAction present at line 1585 (live code); createAcknowledgeAnimationsAction completely removed |
| `src/rules/actions/index.ts` | Action index without acknowledgeAnimations import/registration | VERIFIED | 208 lines; import block (line 64) has createClearCombatAnimationsAction, no createAcknowledgeAnimationsAction; registration (line 172) only registers clearCombatAnimations |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| CombatPanel.vue | boardsmith/ui | import | VERIFIED | `import { useAnimationEvents } from 'boardsmith/ui'` (line 4) |
| App.vue | boardsmith/ui | createAnimationEvents call | VERIFIED | `createAnimationEvents({ events: ... })` (lines 26-28), no acknowledge callback |
| rebel-combat.ts | index.ts | export/import | VERIFIED | createClearCombatAnimationsAction exported from rebel-combat.ts, imported and registered in index.ts |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| DELETE-01: Remove useCurrentView Usage | SATISFIED | None -- zero references to useCurrentView, CURRENT_VIEW_KEY, truthCombatComplete, truthActiveCombat |
| DELETE-02: Remove Acknowledgment Protocol | SATISFIED | None -- zero references to acknowledgeAnimations, acknowledgeAnimationEvents, createAcknowledgeAnimationsAction; acknowledge callback removed from App.vue |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| GameTable.vue | 323 | "placeholder" in comment | Info | Pre-existing code about dictator card node lookup; unrelated to this phase |

No blockers or warnings found.

### Human Verification Required

None required. All success criteria are verifiable programmatically (grep for symbol absence + test suite).

### Gaps Summary

No gaps found. All 7 dead API symbols have zero references in src/. The acknowledge callback is cleanly removed from createAnimationEvents. All 602 tests pass. The live code (createClearCombatAnimationsAction) is confirmed intact and properly wired. Phase goal is fully achieved.

---

*Verified: 2026-02-08T16:20:00Z*
*Verifier: Claude (gsd-verifier)*
