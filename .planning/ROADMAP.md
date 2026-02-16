# Roadmap: MERC v2.0 Simultaneous Rebel Turns

## Milestones

- v1.0 through v1.10 (Phases 1-50) -- shipped, see STATE.md
- **v2.0 Simultaneous Rebel Turns** - Phases 51-55 (in progress)

## Phases

- [x] **Phase 51: Extract Combat Sub-Flow** - Pull combat resolution out of rebel/dictator phases into a shared callable sub-flow
- [x] **Phase 52: Simultaneous Rebel Step** - Replace sequential rebel turns with loop + simultaneousActionStep for all rebels
- [ ] **Phase 53: Combat Barriers** - Combat and coordinated attacks exit the simultaneous step, resolve sequentially, then re-enter
- [ ] **Phase 54: Dictator and AI Alignment** - Dictator phase uses shared combat sub-flow; AI rebels batch actions correctly
- [ ] **Phase 55: Simultaneous Play UI** - Turn indicators, waiting messages, and visual transitions for simultaneous play

## Phase Details

### Phase 51: Extract Combat Sub-Flow
**Goal**: Combat resolution exists as a standalone sub-flow that any phase can invoke
**Depends on**: Nothing (foundation)
**Requirements**: FLOW-01
**Success Criteria** (what must be TRUE):
  1. Combat triggered during rebel phase resolves through the extracted sub-flow, not inline rebel flow code
  2. Combat triggered during dictator phase resolves through the same extracted sub-flow
  3. All existing combat tests pass without modification (no behavioral regression)
**Plans**: 1 plan

Plans:
- [x] 51-01-PLAN.md -- Extract combatResolutionFlow function and replace 4 inline duplication sites

### Phase 52: Simultaneous Rebel Step
**Goal**: All rebels act freely during the rebel phase through a simultaneousActionStep, with per-player action evaluation and done tracking
**Depends on**: Phase 51
**Requirements**: FLOW-02, FLOW-06, FLOW-07, ACT-01, ACT-02, ACT-03, ACT-04
**Success Criteria** (what must be TRUE):
  1. Multiple rebel players can submit actions during the same rebel phase without waiting for each other
  2. Each rebel sees only the actions available to them based on their own state and board state
  3. A rebel who ends their turn (explicitly or by exhausting actions) is skipped when the simultaneous step re-enters
  4. The rebel phase completes only when all rebels are done
  5. Day 1 rebel phase uses the same simultaneous model as Day 2+ (no special-casing)
**Plans**: 2 plans

Plans:
- [x] 52-01-PLAN.md -- Replace Day 2+ eachPlayer rebel-turns with loop + simultaneousActionStep
- [x] 52-02-PLAN.md -- Replace Day 1 eachPlayer rebel-landing with loop + simultaneousActionStep

### Phase 53: Combat Barriers
**Goal**: Combat and coordinated attacks act as synchronization barriers that pause simultaneous play, resolve sequentially, then resume
**Depends on**: Phase 52
**Requirements**: FLOW-03, FLOW-04
**Success Criteria** (what must be TRUE):
  1. When a rebel triggers combat, all rebels exit the simultaneous step, combat resolves to completion, then the simultaneous step resumes for remaining players
  2. When a rebel declares a coordinated attack, the simultaneous step exits, other rebels get commit/decline flow, combat resolves, then simultaneous play resumes
  3. Players who had already ended their turn before the barrier remain done after the barrier resolves
**Plans**: 1 plan

Plans:
- [ ] 53-01-PLAN.md -- Verify barrier architecture with integration tests for combat, coordinated attack, and done preservation

### Phase 54: Dictator and AI Alignment
**Goal**: Dictator phase uses the shared combat sub-flow; AI rebel players batch actions correctly within simultaneous play
**Depends on**: Phase 51, Phase 52
**Requirements**: FLOW-05, AI-01
**Success Criteria** (what must be TRUE):
  1. Dictator turn triggers combat through the shared sub-flow extracted in Phase 51 (not duplicate inline code)
  2. AI rebel players submit actions in batched rounds -- all AI rebels submit first actions, those resolve, then all submit second actions
  3. Mixed games (human + AI rebels) work correctly with AI batching inside the simultaneous step
**Plans**: TBD

Plans:
- [ ] 54-01: TBD

### Phase 55: Simultaneous Play UI
**Goal**: Players have clear visual feedback about simultaneous play state, waiting conditions, and barrier transitions
**Depends on**: Phase 52, Phase 53
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. PlayersPanel turn indicator shows all active rebels during the simultaneous step (not cycling through one at a time)
  2. When a player finishes their turn, ActionPanel shows which specific players are still acting
  3. All player actions are visible to all players (including dictator) as they resolve in real-time
  4. When a combat barrier activates, there is a clear visual transition explaining why simultaneous actions paused
**Plans**: TBD

Plans:
- [ ] 55-01: TBD

## Progress

**Execution Order:** 51 -> 52 -> 53 -> 54 -> 55

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 51. Extract Combat Sub-Flow | 1/1 | ✓ Complete | 2026-02-16 |
| 52. Simultaneous Rebel Step | 2/2 | ✓ Complete | 2026-02-16 |
| 53. Combat Barriers | 0/1 | Not started | - |
| 54. Dictator and AI Alignment | 0/TBD | Not started | - |
| 55. Simultaneous Play UI | 0/TBD | Not started | - |
