# Roadmap: MERC Codebase

## Milestones

- ✅ **v1.0 Codebase Cleanup** - Phases 1-6 (shipped)
- ✅ **v1.1 Polish** - Phases 7-8 (shipped)
- ✅ **v1.2 Merge Dictator and Merc Cards** - Phases 9-13 (shipped)
- ✅ **v1.3 Combatant Unification** - Phases 14-19 (shipped)
- ✅ **v1.4 Combatant Naming Unification** - Phases 20-23 (shipped)
- ✅ **v1.5 Final Combatant Unification** - Phases 24-27 (shipped)
- ✅ **v1.6 Final ID Cleanup** - Phases 28-30 (shipped)
- ✅ **v1.7 GameBoard Component Refactor** - Phases 31-36 (shipped)
- ✅ **v1.8 Unified Stat Ability System** - Phases 37-41 (shipped 2026-02-03)
- 🚧 **v1.9 BoardSmith v3.0 Animation Timeline Migration** - Phases 42-46 (in progress)

## Phases

<details>
<summary>✅ v1.8 Unified Stat Ability System (Phases 37-41) - SHIPPED 2026-02-03</summary>

### Phase 37: Extend Ability Registry
**Goal**: Add statModifiers to MercAbility interface, migrate 18 MERCs
**Plans**: 1 plan
Plans:
- [x] 37-01: Add StatModifier interface, migrate 18 MERCs

### Phase 38: Unify Server-Side Calculation
**Goal**: Single calculation path for all ability stat bonuses
**Plans**: 2 plans
Plans:
- [x] 38-01: Add unified infrastructure
- [x] 38-02: Integrate with stat calculation and game.ts

### Phase 39: Unify UI Breakdown
**Goal**: Generate breakdown from activeStatModifiers, remove hardcoded checks
**Plans**: 2 plans
Plans:
- [x] 39-01: Replace hardcoded bonus checks with unified iteration
- [x] 39-02: Add labels to self-targeting modifiers

### Phase 40: Unify Combat-Time Application
**Goal**: Remove duplicate bonus functions from combat.ts
**Plans**: 1 plan
Plans:
- [x] 40-01: Remove duplicate bonus functions, fix targets getter

### Phase 41: Testing & Verification
**Goal**: Integration tests for all 18 stat-modifying abilities
**Plans**: 2 plans
Plans:
- [x] 41-01: Equipment-conditional and passive ability tests (11 MERCs)
- [x] 41-02: Squad-conditional and combat-only ability tests (10 MERCs)

</details>

### 🚧 v1.9 BoardSmith v3.0 Animation Timeline Migration (In Progress)

**Milestone Goal:** Migrate CombatPanel from the removed BoardSmith theatre view system to a 100% event-driven animation player. Remove all dead APIs and vestigial code. Build combat-panel snapshot events with decision context. Rebuild CombatPanel to render entirely from events. Clean up GameTable wiring. Verify with tests.

#### Phase 42: Remove Dead APIs
**Goal**: All references to BoardSmith v2 theatre view APIs are gone -- the codebase compiles clean against BoardSmith v3.0 without dead imports or calls to removed functions
**Depends on**: Nothing (first phase of v1.9)
**Requirements**: DELETE-01, DELETE-02
**Success Criteria** (what must be TRUE):
  1. Zero references to `useCurrentView` or `CURRENT_VIEW_KEY` anywhere in src/
  2. Zero references to `acknowledgeAnimations`, `acknowledgeAnimationEvents`, or `createAcknowledgeAnimationsAction` anywhere in src/
  3. The `acknowledge` callback is removed from `createAnimationEvents` in App.vue
  4. All existing tests pass (no regressions from removing dead code)
**Plans**: 1 plan

Plans:
- [ ] 42-01-PLAN.md -- Remove useCurrentView, truthCombatComplete, truthActiveCombat, and acknowledgment protocol from 5 files

#### Phase 43: Combat Event Architecture
**Goal**: Combat emits a complete, self-contained event stream -- `combat-panel` snapshots with full combatant data and decision context at each decision cycle, plus pure data animation events with no mutation callbacks
**Depends on**: Phase 42
**Requirements**: SRV-01, SRV-02, SRV-03
**Success Criteria** (what must be TRUE):
  1. Every decision cycle in combat emits a `combat-panel` event containing full combatant snapshots (id, name, image, health, maxHealth, type flags, playerColor) for both sides, plus casualties
  2. Decision context (pendingTargetSelection, pendingHitAllocation, pendingWolverineSixes, pendingAttackDogSelection, pendingBeforeAttackHealing, combatComplete) is embedded in the `combat-panel` snapshot when applicable -- no extra lookups required
  3. All `game.animate()` calls in combat are pure data (no callbacks) -- mutations happen as normal code after the animate call
  4. Animation events (`combat-roll`, `combat-damage`, `combat-death`, `combat-end`, `combat-heal`, `combat-attack-dog`, `combat-round-start`) carry all data specified in SRV-03
  5. Existing combat tests pass -- combat mechanics are unchanged, only event emission is new
**Plans**: TBD

Plans:
- [ ] 43-01: TBD
- [ ] 43-02: TBD

#### Phase 44: CombatPanel Rebuild
**Goal**: CombatPanel is a self-contained animation player that renders 100% from event data -- no gameView reads, no activeCombat prop for rendering, no state machine, no manual health tracking
**Depends on**: Phase 43
**Requirements**: UI-01, UI-02, UI-03, DELETE-03, DELETE-05
**Success Criteria** (what must be TRUE):
  1. CombatPanel stores the latest `combat-panel` snapshot in local state and renders all combatants, health values, and casualties from it
  2. All decision prompts (target selection, hit allocation, wolverine sixes, attack dog, before-attack healing) read from the snapshot's decision context -- player actions still submitted via actionController
  3. Panel opens when first `combat-panel` event arrives and closes after `combat-end` animation finishes -- no state machine drives the lifecycle
  4. Zero references to `panelState`, `CombatPanelState`, `computeNextState`, `transitionState`, `sawCombatEndEvent`, `displayHealth`, or `initializeDisplayHealth` in CombatPanel.vue
  5. Fast-forward still works
**Plans**: TBD

Plans:
- [ ] 44-01: TBD
- [ ] 44-02: TBD

#### Phase 45: GameTable Clean Wiring
**Goal**: GameTable's combat panel section is simple and readable -- panel visibility driven by event presence, no fallback chains, no cached state, no workarounds
**Depends on**: Phase 44
**Requirements**: UI-04, DELETE-04
**Success Criteria** (what must be TRUE):
  1. Combat panel visibility in GameTable is driven by a single condition: presence of a combat snapshot from animation events
  2. Zero references to `combatEventSeen`, `lastCombatEventId`, `cachedCombat`, `activeCombatForPanel`, `theatreActiveCombat`, `truthActiveCombat`, `combatPanelReady`, or `paused` workaround in GameTable.vue
  3. The combat section of GameTable is under 20 lines of template and under 10 lines of script logic
**Plans**: TBD

Plans:
- [ ] 45-01: TBD

#### Phase 46: Verification
**Goal**: Automated tests confirm the combat event pipeline works end-to-end -- snapshot contents, decision context, animation event data, and the full cycle of snapshot-events-decision-snapshot
**Depends on**: Phase 45
**Requirements**: TEST-01
**Success Criteria** (what must be TRUE):
  1. Tests verify `combat-panel` snapshot contains correct combatant data (both sides, health, images, type flags)
  2. Tests verify snapshot includes appropriate decision context at decision points (target selection, hit allocation, etc.)
  3. Tests verify animation events carry correct data (roll details, damage amounts, death info)
  4. Tests verify `combat-panel` is re-emitted after a player decision with updated state
  5. All existing tests pass (zero regressions)
**Plans**: TBD

Plans:
- [ ] 46-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 42 -> 43 -> 44 -> 45 -> 46

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 42. Remove Dead APIs | 0/1 | Not started | - |
| 43. Combat Event Architecture | 0/TBD | Not started | - |
| 44. CombatPanel Rebuild | 0/TBD | Not started | - |
| 45. GameTable Clean Wiring | 0/TBD | Not started | - |
| 46. Verification | 0/TBD | Not started | - |
