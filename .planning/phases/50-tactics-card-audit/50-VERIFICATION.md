---
phase: 50-tactics-card-audit
verified: 2026-02-09T04:15:00Z
status: passed
score: 5/5 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "Every dictator tactics card plays a meaningful visible animation when executed"
  gaps_remaining: []
  regressions: []
must_haves:
  truths:
    - "Every dictator tactics card has been audited and verified or fixed for correct implementation"
    - "Every dictator tactics card plays a meaningful visible animation when executed"
    - "Generalissimo draws 6 MERCs and lets the dictator pick 1 to add to either squad"
    - "Better Weapons gives militia a persistent buff to hit on 3+ going forward"
    - "Lockdown lets the dictator place 5 extra militia on base or adjacent sectors"
  artifacts:
    - path: "src/rules/tactics-effects.ts"
      provides: "All 14 card effects with game.animate() calls"
    - path: "src/rules/game.ts"
      provides: "pendingGeneralissimoHire and pendingLockdownMilitia state"
    - path: "src/rules/actions/dictator-actions.ts"
      provides: "generalissimoPick and lockdownPlaceMilitia actions"
    - path: "src/rules/actions/index.ts"
      provides: "Action registration for both new actions"
    - path: "src/rules/flow.ts"
      provides: "Flow steps for generalissimo-hire and lockdown-militia-placement"
    - path: "src/ui/components/GameTable.vue"
      provides: "Animation handlers for all 14 tactics events + banner overlay"
  key_links:
    - from: "src/rules/tactics-effects.ts"
      to: "src/ui/components/GameTable.vue"
      via: "game.animate() events matched by registerHandler()"
    - from: "src/rules/flow.ts"
      to: "src/rules/actions/dictator-actions.ts"
      via: "flow steps list generalissimoPick and lockdownPlaceMilitia actions"
    - from: "src/rules/actions/index.ts"
      to: "src/rules/actions/dictator-actions.ts"
      via: "imports and registers createGeneralissimoPickAction and createLockdownPlaceMilitiaAction"
---

# Phase 50: Tactics Card Audit Verification Report

**Phase Goal:** Every dictator tactics card is correctly implemented with visible animations
**Verified:** 2026-02-09T04:15:00Z
**Status:** passed
**Re-verification:** Yes -- after gap closure (commit 0378267)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every dictator tactics card has been audited and verified or fixed for correct implementation | VERIFIED | All 14 card effect functions in tactics-effects.ts (1064 lines) match CSV rules. Fabricated generalisimoActive/lockdownActive bonuses removed from combat.ts and game.ts. Block Trade places militia on all cities. Generalissimo draws 6 MERCs. Lockdown places 5*rebelCount militia. |
| 2 | Every dictator tactics card plays a meaningful visible animation when executed | VERIFIED | All 14 tactic event types have game.animate() calls in tactics-effects.ts (15 calls total; lockdown has 2 for AI vs human paths). SECTOR_TACTIC_EVENTS (8 events) and BANNER_TACTIC_EVENTS (6 events) arrays in GameTable.vue at lines 533-552 now include tactic-generalissimo and tactic-lockdown. Both loops register handlers at lines 576 and 594. Banner overlay renders at line 1238. |
| 3 | Generalissimo draws 6 MERCs and lets the dictator pick 1 to add to either squad | VERIFIED | generalisimo() draws 6 via game.drawMerc() loop. AI auto-picks highest baseCombat. Human gets pendingGeneralissimoHire state (game.ts:610), generalissimoPick action (dictator-actions.ts:608, 3-step: MERC, equipment, sector), flow step generalissimo-hire loop (flow.ts:583). Action registered in index.ts:100,206. |
| 4 | Better Weapons gives militia a persistent buff to hit on 3+ going forward | VERIFIED | betterWeapons() sets betterWeaponsActive=true (game.ts:411) inside game.animate callback (tactics-effects.ts:652). combat.ts line 254 checks betterWeaponsActive and uses 3+ threshold for dictator militia. |
| 5 | Lockdown lets the dictator place 5 extra militia on base or adjacent sectors | VERIFIED | lockdown() computes totalMilitia = 5 * game.rebelCount. Calls revealBase() first. AI distributes round-robin respecting 10 cap. Human gets pendingLockdownMilitia state (game.ts:619), lockdownPlaceMilitia action (dictator-actions.ts:777), flow step lockdown-militia-placement loop (flow.ts:596). Action registered in index.ts:101,207. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/rules/tactics-effects.ts` | All 14 effects with game.animate() + correct logic | VERIFIED | 1064 lines, 15 game.animate() calls covering all 14 cards. No stubs, no TODOs. |
| `src/rules/game.ts` | pendingGeneralissimoHire + pendingLockdownMilitia state | VERIFIED | Lines 610-626. Both properties with proper types and getter methods. betterWeaponsActive at line 411. |
| `src/rules/actions/dictator-actions.ts` | generalissimoPick + lockdownPlaceMilitia actions | VERIFIED | Lines 608 (generalissimoPick) and 777 (lockdownPlaceMilitia). Both exported with substantive implementations. |
| `src/rules/actions/index.ts` | Import and registration of both actions | VERIFIED | Lines 100-101 import, lines 206-207 register. Both present. |
| `src/rules/flow.ts` | Flow steps for both actions | VERIFIED | Lines 583-605. generalissimo-hire loop and lockdown-militia-placement loop with correct while conditions, skipIf guards, and action references. |
| `src/ui/components/GameTable.vue` | Animation handlers for ALL 14 tactics events | VERIFIED | SECTOR_TACTIC_EVENTS (8 events, lines 533-542) and BANNER_TACTIC_EVENTS (6 events, lines 545-552) now include all 14 event types. tactic-generalissimo and tactic-lockdown added in commit 0378267. Handlers registered via loops at lines 576 and 594. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| tactics-effects.ts | game.animate() | 15 animate calls | WIRED | All 14 card effects fire animation events |
| GameTable.vue | animation handlers | registerHandler loops | WIRED | All 14 events have handlers (8 sector + 6 banner). Gap closed. |
| flow.ts | dictator-actions.ts | generalissimoPick action | WIRED | Flow step lists action, action registered in index.ts |
| flow.ts | dictator-actions.ts | lockdownPlaceMilitia action | WIRED | Flow step lists action, action registered in index.ts |
| tactics-effects.ts | game.ts | pendingGeneralissimoHire | WIRED | Set in generalisimo(), read in flow.ts and dictator-actions.ts |
| tactics-effects.ts | game.ts | pendingLockdownMilitia | WIRED | Set in lockdown(), read in flow.ts and dictator-actions.ts |
| combat.ts | game.ts | betterWeaponsActive | WIRED | Line 254 checks flag, threshold applied for dictator militia |
| index.ts | dictator-actions.ts | createGeneralissimoPickAction | WIRED | Imported at line 100, registered at line 206 |
| index.ts | dictator-actions.ts | createLockdownPlaceMilitiaAction | WIRED | Imported at line 101, registered at line 207 |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| TACT-01: Audit every tactics card | SATISFIED | None |
| TACT-02: Visible animation for every card | SATISFIED | None (gap closed) |
| TACT-03: Generalissimo draw 6, pick 1 | SATISFIED | None |
| TACT-04: Better Weapons 3+ buff | SATISFIED | None |
| TACT-05: Lockdown militia placement | SATISFIED | None |
| TACT-06: Artillery Barrage animation | SATISFIED | Handler registered |
| TACT-07: Family Threat animation | SATISFIED | Handler registered |
| TACT-08: Veteran Militia animation | SATISFIED | Handler registered |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | - | - | - | No TODOs, FIXMEs, stubs, or placeholder returns in any modified file |

### Human Verification Required

#### 1. Tactics card banner visibility
**Test:** Play any tactics card as dictator and observe the UI
**Expected:** A red banner overlay appears showing the card name, auto-dismisses after 2-2.5 seconds
**Why human:** Visual appearance and timing cannot be verified programmatically

#### 2. Generalissimo interactive flow
**Test:** As a human dictator player, play the Generalissimo tactics card
**Expected:** After card is played, flow prompts for MERC selection (6 choices), equipment type, and deployment sector
**Why human:** Multi-step interactive flow behavior requires live UI testing

#### 3. Lockdown interactive flow
**Test:** As a human dictator player, play the Lockdown tactics card
**Expected:** After base reveal, flow prompts iteratively for sector and amount until all militia placed
**Why human:** Iterative placement loop behavior requires live UI testing

### Re-verification: Gap Closure Summary

The single gap from the initial verification has been resolved:

- **Previous gap:** `tactic-generalissimo` and `tactic-lockdown` were missing from BANNER_TACTIC_EVENTS in GameTable.vue, so no visible banner appeared when those cards were played.
- **Fix:** Commit 0378267 added both event names to the BANNER_TACTIC_EVENTS array (lines 550-551).
- **Verified:** Both events now appear in the array and are covered by the registerHandler loop at line 594. All 14 tactics events (8 sector + 6 banner) now have registered handlers.
- **Regressions:** None. All 4 previously-passed truths still verified. All artifacts still substantive and wired.

---

_Verified: 2026-02-09T04:15:00Z_
_Verifier: Claude (gsd-verifier)_
