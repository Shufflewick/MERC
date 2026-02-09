# Roadmap: MERC v1.10 Grievances

## Overview

Fix gameplay bugs, missing implementations, and UI inconsistencies so the game plays correctly and visibly. Four phases address equipment slot bugs, a missing landmine trigger system, inconsistent sector panel wiring, and incomplete dictator tactics card implementations.

## Milestones

- v1.0 Codebase Cleanup (Phases 1-6) - shipped
- v1.1 Polish (Phases 7-8) - shipped
- v1.2 Merge Dictator and Merc Cards (Phases 9-13) - shipped
- v1.3 Combatant Unification (Phases 14-19) - shipped
- v1.4 Combatant Naming Unification (Phases 20-23) - shipped
- v1.5 Final Combatant Unification (Phases 24-27) - shipped
- v1.6 Final ID Cleanup (Phases 28-30) - shipped
- v1.7 GameBoard Component Refactor (Phases 31-36) - shipped
- v1.8 Unified Stat Ability System (Phases 37-41) - shipped
- v1.9 BoardSmith v3.0 Animation Timeline Migration (Phases 42-46) - shipped
- **v1.10 Grievances (Phases 47-50) - in progress**

## Phases

- [x] **Phase 47: Equipment Slot Cleanup** - Fix bandolier replacement dropping contents and phantom slot removal
- [x] **Phase 48: Landmine System** - Implement landmine trigger, damage, discard, and Squidhead counter-ability
- [x] **Phase 49: Sector Panel Audit** - Fix all sector panel actions for consistent context, options, and wiring
- [ ] **Phase 50: Tactics Card Audit** - Audit and fix every dictator tactics card implementation and animation

## Phase Details

### Phase 47: Equipment Slot Cleanup
**Goal**: Bandolier equipment behaves correctly when replaced or removed
**Depends on**: Nothing (self-contained bug fix)
**Requirements**: EQUIP-01, EQUIP-02
**Success Criteria** (what must be TRUE):
  1. When a MERC replaces their bandolier with a different accessory, all items in bandolier slots are returned to the sector stash
  2. When a MERC no longer has a bandolier equipped, the bandolier slots are removed and no phantom slots remain
  3. Existing tests continue to pass (no regressions in equipment handling)
**Plans**: 2 plans

Plans:
- [x] 47-01-PLAN.md -- TDD: Fix equip() return type to include displaced bandolier items
- [x] 47-02-PLAN.md -- Update all equip() callers to handle EquipResult

### Phase 48: Landmine System
**Goal**: Landmines in sector stashes trigger correctly when enemies enter, with Squidhead counter-ability
**Depends on**: Nothing (self-contained rules system)
**Requirements**: MINE-01, MINE-02, MINE-03, MINE-04
**Success Criteria** (what must be TRUE):
  1. When an enemy squad or combatant enters a sector containing a landmine in the stash, the landmine detonates
  2. A detonated landmine deals 1 damage to every enemy combatant present in the sector
  3. After detonation, the landmine is removed from the sector stash (discarded)
  4. When Squidhead is present in the sector, the landmine does not detonate
**Plans**: 2 plans

Plans:
- [x] 48-01-PLAN.md -- TDD: Create checkLandMines() bidirectional trigger function with tests
- [x] 48-02-PLAN.md -- Wire checkLandMines into movement actions, remove old combat.ts call

### Phase 49: Sector Panel Audit
**Goal**: Every action launched from the sector panel works identically to its action panel counterpart
**Depends on**: Nothing (UI wiring audit, independent of rules changes)
**Requirements**: SECT-01, SECT-02, SECT-03
**Success Criteria** (what must be TRUE):
  1. Every sector panel action prepopulates the selected sector as context (no manual re-selection)
  2. Sector panel actions show the same combatant options that the corresponding action panel shows
  3. All sector panel actions have been audited and any wiring inconsistencies fixed
**Plans**: 1 plan

Plans:
- [x] 49-01-PLAN.md -- Fix auto-fill format mismatch, add coordinatedAttack pre-fill, remove debug logging

### Phase 50: Tactics Card Audit
**Goal**: Every dictator tactics card is correctly implemented with visible animations
**Depends on**: Nothing (independent audit and implementation work)
**Requirements**: TACT-01, TACT-02, TACT-03, TACT-04, TACT-05, TACT-06, TACT-07, TACT-08
**Success Criteria** (what must be TRUE):
  1. Every dictator tactics card has been audited and verified or fixed for correct implementation
  2. Every dictator tactics card plays a meaningful visible animation when executed
  3. Generalissimo draws 6 mercs and lets the dictator pick 1 to add to either squad
  4. Better Weapons gives militia a persistent buff to hit on 3+ going forward
  5. Lockdown lets the dictator place 5 extra militia on base or adjacent sectors
**Plans**: 4 plans

Plans:
- [ ] 50-01-PLAN.md -- Remove fabricated base defense bonuses, fix Block Trade militia placement
- [ ] 50-02-PLAN.md -- Add animations to all 11 working tactics effects + GameTable.vue handlers
- [ ] 50-03-PLAN.md -- Rewrite Generalissimo: draw 6 MERCs, pick 1, add to squad
- [ ] 50-04-PLAN.md -- Rewrite Lockdown: place 5*rebelCount militia on base/adjacent sectors

## Progress

**Execution Order:** 47 -> 48 -> 49 -> 50

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 47. Equipment Slot Cleanup | 2/2 | Complete | 2026-02-08 |
| 48. Landmine System | 2/2 | Complete | 2026-02-08 |
| 49. Sector Panel Audit | 1/1 | Complete | 2026-02-08 |
| 50. Tactics Card Audit | 0/4 | Not started | - |
