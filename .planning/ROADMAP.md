# Roadmap: MERC v1.7 GameBoard Component Refactor

**Created:** 2026-01-18
**Milestone:** v1.7 GameBoard Component Refactor
**Phases:** 31-36 (6 phases)

## Phase Overview

| Phase | Name | Requirements | Focus |
|-------|------|--------------|-------|
| 31 | Helper Composables | HELP-01, HELP-02 | Foundation utilities |
| 32 | State Composables | STATE-01, STATE-02, STATE-03, STATE-04 | Shared state extraction |
| 33 | Small UI Components | UI-03, UI-04 | Simple component extraction |
| 34 | Hagness UI Component | UI-02 | Medium complexity extraction |
| 35 | Hiring Phase Component | UI-01 | Large component extraction |
| 36 | Integration & Cleanup | INT-01, INT-02, INT-03 | Final assembly |

---

## Phase 31: Helper Composables

**Goal:** Extract pure utility functions that have no dependencies on Vue reactivity or game state.

**Requirements:**
- HELP-01: useGameViewHelpers
- HELP-02: useVictoryCalculations

**Status:** ✓ Complete (2026-01-18)

**Success Criteria:**
- [x] useGameViewHelpers composable created in src/ui/composables/
- [x] useVictoryCalculations composable created in src/ui/composables/
- [x] GameBoard.vue imports and uses both composables
- [x] All helper functions removed from GameBoard.vue
- [x] Game runs without errors

**Deliverables:**
- `src/ui/composables/useGameViewHelpers.ts`
- `src/ui/composables/useVictoryCalculations.ts`

---

## Phase 32: State Composables

**Goal:** Extract reactive state derivation into composables that can be shared across components.

**Requirements:**
- STATE-01: usePlayerState
- STATE-02: useSectorState
- STATE-03: useSquadState
- STATE-04: useActionState

**Status:** ✓ Complete (2026-01-18)

**Success Criteria:**
- [x] Four state composables created in src/ui/composables/
- [x] Each composable exports reactive computed properties
- [x] GameBoard.vue imports and uses all state composables
- [x] State derivation logic removed from GameBoard.vue
- [x] Game runs without errors

**Deliverables:**
- `src/ui/composables/usePlayerState.ts` (163 lines)
- `src/ui/composables/useSectorState.ts` (454 lines)
- `src/ui/composables/useSquadState.ts` (426 lines)
- `src/ui/composables/useActionState.ts` (639 lines)

---

## Phase 33: Small UI Components

**Goal:** Extract simple, self-contained UI components with minimal logic.

**Requirements:**
- UI-03: LandingZoneSelection
- UI-04: GameOverOverlay

**Success Criteria:**
- [ ] GameOverOverlay.vue created with victory/defeat display
- [ ] LandingZoneSelection.vue created with sector picker
- [ ] Components use state composables (not props) for game state
- [ ] GameBoard.vue template simplified by using new components
- [ ] Game runs without errors, landing and game over work correctly

**Deliverables:**
- `src/ui/components/GameOverOverlay.vue`
- `src/ui/components/LandingZoneSelection.vue`

---

## Phase 34: Hagness UI Component

**Goal:** Extract the Hagness draw equipment flow into a dedicated component.

**Requirements:**
- UI-02: HagnessDrawEquipment

**Success Criteria:**
- [ ] HagnessDrawEquipment.vue created with full flow
- [ ] Equipment type selection works
- [ ] Drawn equipment display works
- [ ] Recipient selection works
- [ ] Component uses state composables for action state
- [ ] Game runs without errors, Hagness ability works correctly

**Deliverables:**
- `src/ui/components/HagnessDrawEquipment.vue`

---

## Phase 35: Hiring Phase Component

**Goal:** Extract the complex hiring phase UI into a dedicated component.

**Requirements:**
- UI-01: HiringPhase

**Success Criteria:**
- [ ] HiringPhase.vue created with full hiring flow
- [ ] Merc selection works
- [ ] Dictator selection works
- [ ] Equipment type selection works
- [ ] Sector selection (Castro hire) works
- [ ] Skip third hire option works
- [ ] Detail modal works
- [ ] Component uses state composables for action state
- [ ] Game runs without errors, all hiring paths work

**Deliverables:**
- `src/ui/components/HiringPhase.vue`

---

## Phase 36: Integration & Cleanup

**Goal:** Final integration, cleanup, and verification that GameBoard.vue is now an orchestrator.

**Requirements:**
- INT-01: GameBoard.vue uses all extracted composables and components
- INT-02: GameBoard.vue reduced to orchestrator role (<500 lines target)
- INT-03: All existing functionality preserved (no regressions)

**Success Criteria:**
- [ ] GameBoard.vue imports all composables and components
- [ ] GameBoard.vue is under 500 lines
- [ ] No dead code remaining in GameBoard.vue
- [ ] All game flows work: hiring, landing, combat, abilities, game over
- [ ] TypeScript compiles without errors
- [ ] All existing tests pass

**Deliverables:**
- Refactored `src/ui/components/GameBoard.vue` (<500 lines)
- Clean imports and component composition

---

## Requirements Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UI-01 | 35 | Pending |
| UI-02 | 34 | Pending |
| UI-03 | 33 | Pending |
| UI-04 | 33 | Pending |
| HELP-01 | 31 | Complete |
| HELP-02 | 31 | Complete |
| STATE-01 | 32 | Complete |
| STATE-02 | 32 | Complete |
| STATE-03 | 32 | Complete |
| STATE-04 | 32 | Complete |
| INT-01 | 36 | Pending |
| INT-02 | 36 | Pending |
| INT-03 | 36 | Pending |

**Coverage:** 13/13 requirements mapped (100%)

---

## Milestone Summary

**v1.7 GameBoard Component Refactor**
- 6 phases (31-36)
- 13 requirements
- Target: GameBoard.vue from 3,368 lines to <500 lines
- New artifacts: 4 UI components, 6 composables

---
*Roadmap created: 2026-01-18*
