# Requirements: MERC v2.0 Simultaneous Rebel Turns

**Defined:** 2026-02-16
**Core Value:** Ship Confidence — the game should behave correctly, consistently, and visibly.

## v1 Requirements

### Flow Architecture

- [ ] **FLOW-01**: Extract combat into a shared standalone sub-flow callable from both rebel and dictator phases
- [ ] **FLOW-02**: Replace sequential `eachPlayer('rebel-turns')` with a loop wrapping `simultaneousActionStep` for all rebel players
- [ ] **FLOW-03**: Combat acts as a barrier — when any rebel triggers combat, the simultaneous step exits via `allDone`, combat runs sequentially to completion, then the loop re-enters the simultaneous step
- [ ] **FLOW-04**: Coordinated attack acts as a barrier — declare exits simultaneous step, commit/decline flow runs for other rebels, then combat resolves, then simultaneous step resumes
- [ ] **FLOW-05**: Refactor dictator turn to use the shared combat sub-flow for consistency
- [ ] **FLOW-06**: Day 1 rebel phase uses the same simultaneous model as Day 2+
- [ ] **FLOW-07**: Players who have ended their turn are skipped on simultaneous step re-entry via `skipPlayer`

### Action System

- [ ] **ACT-01**: Each rebel gets independently evaluated action list based on own state + board state (per-player `actions` function)
- [ ] **ACT-02**: Server-side validation rejects stale/invalid actions and returns contextual error messages explaining why the action failed
- [ ] **ACT-03**: A rebel is "done" when all their MERCs have exhausted actions OR they explicitly end turn
- [ ] **ACT-04**: Rebel phase completes when all rebels are done (all `playerDone` returns true)

### AI

- [ ] **AI-01**: AI rebel players batch actions by action number — all AI rebels submit first actions, those resolve, then all submit second actions

### UI

- [ ] **UI-01**: Turn indicator in PlayersPanel shows all active rebels during simultaneous step (not just one)
- [ ] **UI-02**: Waiting message in ActionPanel shows which specific players haven't finished when current player is done
- [ ] **UI-03**: All actions visible to all players (including dictator) in real-time as they resolve
- [ ] **UI-04**: Clear visual transition when combat barrier activates — players understand why simultaneous actions paused

## v2 Requirements

### Advanced Coordination

- **COORD-01**: Rebel action coordination tools (e.g., action queuing, undo before commit)
- **COORD-02**: Rebel communication/planning phase before simultaneous actions begin

## Out of Scope

| Feature | Reason |
|---------|--------|
| Simultaneous dictator play | Dictator is always a single player |
| Parallel combat resolution | Combat is a barrier — one at a time, simplest correct model |
| BoardSmith engine changes | Composable loop pattern works with existing primitives |
| Fog of war between rebels | Rebels are on same team, full visibility |
| Action replay/history | Not needed for v2.0, real-time updates sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FLOW-01 | TBD | Pending |
| FLOW-02 | TBD | Pending |
| FLOW-03 | TBD | Pending |
| FLOW-04 | TBD | Pending |
| FLOW-05 | TBD | Pending |
| FLOW-06 | TBD | Pending |
| FLOW-07 | TBD | Pending |
| ACT-01 | TBD | Pending |
| ACT-02 | TBD | Pending |
| ACT-03 | TBD | Pending |
| ACT-04 | TBD | Pending |
| AI-01 | TBD | Pending |
| UI-01 | TBD | Pending |
| UI-02 | TBD | Pending |
| UI-03 | TBD | Pending |
| UI-04 | TBD | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 0
- Unmapped: 16

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-02-16 after initial definition*
