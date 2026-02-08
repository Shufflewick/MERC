# v1.9 Requirements: BoardSmith v3.0 Animation Timeline Migration

**Defined:** 2026-02-07
**Core Value:** Ship Confidence — deterministic combat animation playback via event-driven CombatPanel

## Problem Statement

BoardSmith v3.0 removed the theatre view system (frozen snapshots, mutation capture, acknowledgment protocol). MERC's CombatPanel was built on that system and references multiple removed APIs. The panel must be rebuilt as a 100% event-driven animation player — no vestigial code, no workarounds, no dead references.

**Design Principle:** CombatPanel is a self-contained animation player. It renders entirely from animation event data. The rest of the game UI uses truth directly. Combat events carry full snapshots per decision cycle so refresh/late-join always works.

**Decision Cycle Pattern:**
1. `combat-panel` event — full combatant snapshot (health, images, stats, casualties, decision context)
2. Animation events (`combat-roll`, `combat-damage`, `combat-death`) — animate changes on that snapshot
3. Animations finish — panel state matches truth — player makes decision via actionController
4. New `combat-panel` snapshot + animation events for next cycle
5. Repeat until `combat-end`

---

## DELETE — Remove Old Theatre View System

### DELETE-01: Remove useCurrentView Usage

**Acceptance Criteria:**
- [ ] Delete `useCurrentView` import from CombatPanel.vue
- [ ] Delete `useCurrentView` import from GameTable.vue
- [ ] Delete `currentView` variable and all code that references it in both files
- [ ] Delete `truthCombatComplete` computed in CombatPanel.vue
- [ ] Delete `truthActiveCombat` computed in GameTable.vue
- [ ] Zero references to `useCurrentView` or `CURRENT_VIEW_KEY` anywhere in src/

### DELETE-02: Remove Acknowledgment Protocol

**Acceptance Criteria:**
- [ ] Delete `createAcknowledgeAnimationsAction` function from rebel-combat.ts
- [ ] Delete its registration in the action definitions
- [ ] Delete `acknowledge` callback from `createAnimationEvents` in App.vue
- [ ] Delete the `controller.execute('acknowledgeAnimations')` call in App.vue
- [ ] Delete `game.acknowledgeAnimationEvents()` calls if any remain
- [ ] Zero references to `acknowledgeAnimations` anywhere in src/

### DELETE-03: Remove CombatPanel State Machine

**Acceptance Criteria:**
- [ ] Delete `CombatPanelState` type and `panelState` ref
- [ ] Delete `computeNextState()` and `transitionState()` functions
- [ ] Delete `sawCombatEndEvent` ref
- [ ] Delete all watchers that drive the state machine (isAnimating, pendingCount, combatComplete, truthCombatComplete, activeCombat null check)
- [ ] Zero references to `panelState`, `sawCombatEndEvent`, `computeNextState`, `transitionState`

### DELETE-04: Remove GameTable Combat Fallback Logic

**Acceptance Criteria:**
- [ ] Delete `combatEventSeen` ref and its watcher
- [ ] Delete `lastCombatEventId` ref
- [ ] Delete `cachedCombat` ref and its watchers
- [ ] Delete `activeCombatForPanel` computed
- [ ] Delete `theatreActiveCombat` computed
- [ ] Delete `truthActiveCombat` computed
- [ ] Delete animation pause-until-mount workaround (paused.value watcher)
- [ ] Delete `combatPanelReady` ref and related logic
- [ ] Zero fallback chains for combat state in GameTable

### DELETE-05: Remove displayHealth Manual Tracking

**Acceptance Criteria:**
- [ ] Delete `displayHealth` ref from CombatPanel.vue
- [ ] Delete `initializeDisplayHealth()` function
- [ ] Delete watcher on `activeCombat.sectorId` that calls initializeDisplayHealth
- [ ] Health rendering driven entirely by animation event data (`combat-panel` snapshot + `combat-damage` deltas)

---

## SERVER — Combat Event Architecture

### SRV-01: Combat-Panel Snapshot Event

**Acceptance Criteria:**
- [ ] `combat-panel` event emitted at start of each decision cycle in combat.ts
- [ ] Snapshot contains: sectorId, sectorName, round, all rebel combatants, all dictator combatants, rebel casualties, dictator casualties
- [ ] Each combatant in snapshot has: id, name, image, health, maxHealth, isMerc, isMilitia, isAttackDog, isDictator, playerColor, combatantId
- [ ] Snapshot includes dog assignments if any
- [ ] Snapshot is assembled from live game state at emission time

### SRV-02: Decision Context in Snapshots

**Acceptance Criteria:**
- [ ] `combat-panel` snapshot includes `pendingTargetSelection` when applicable (attackerId, attackerName, validTargets, maxTargets)
- [ ] Includes `pendingHitAllocation` when applicable
- [ ] Includes `pendingWolverineSixes` when applicable
- [ ] Includes `pendingAttackDogSelection` when applicable
- [ ] Includes `pendingBeforeAttackHealing` when applicable
- [ ] Includes `combatComplete` flag when combat ends
- [ ] Decision context matches what CombatPanel needs — no extra lookups required

### SRV-03: Pure Data Animation Events

**Acceptance Criteria:**
- [ ] All `game.animate()` calls are pure data — no callbacks
- [ ] `combat-roll` events carry: attackerName, attackerId, attackerImage, targetNames, targetIds, diceRolls, hits, hitThreshold
- [ ] `combat-damage` events carry: attackerName, attackerId, targetName, targetId, targetImage, damage, healthBefore, healthAfter
- [ ] `combat-death` events carry: targetName, targetId, targetImage
- [ ] `combat-end` events carry: rebelVictory, dictatorVictory
- [ ] `combat-heal` events carry: targetId, targetName, healerName, healthBefore, healthAfter
- [ ] `combat-attack-dog` events carry existing data
- [ ] `combat-round-start` events carry round number
- [ ] Mutations happen as normal code after `game.animate()` calls, not inside callbacks

---

## UI — CombatPanel Rebuild

### UI-01: Event-Driven Combatant Rendering

**Acceptance Criteria:**
- [ ] CombatPanel stores latest `combat-panel` snapshot in local state
- [ ] Rebel and dictator combatant lists rendered from snapshot data
- [ ] Health values come from snapshot, updated by `combat-damage` events
- [ ] Casualties rendered from snapshot casualty lists
- [ ] No `activeCombat` prop used for combatant rendering
- [ ] No `gameView` prop used for combatant rendering

### UI-02: Event-Driven Decision Prompts

**Acceptance Criteria:**
- [ ] Target selection reads from `combat-panel` snapshot's pendingTargetSelection
- [ ] Hit allocation reads from snapshot's pendingHitAllocation
- [ ] Wolverine sixes reads from snapshot's pendingWolverineSixes
- [ ] Attack dog assignment reads from snapshot's pendingAttackDogSelection
- [ ] Before-attack healing reads from snapshot's pendingBeforeAttackHealing
- [ ] Player actions still submitted via actionController (emit events unchanged)

### UI-03: Simplified Panel Lifecycle

**Acceptance Criteria:**
- [ ] Panel opens when first `combat-panel` event is received
- [ ] Panel closes after `combat-end` animation finishes
- [ ] No state machine — just presence/absence of combat snapshot
- [ ] Animation handlers remain: combat-roll, combat-damage, combat-death, combat-end, combat-attack-dog, combat-heal, combat-round-start
- [ ] Fast-forward still works

### UI-04: GameTable Clean Wiring

**Acceptance Criteria:**
- [ ] Combat panel visibility driven by animation event presence (has combat snapshot = show panel)
- [ ] No theatre/truth fallback chains
- [ ] No cached combat state
- [ ] No pause-until-mount workaround
- [ ] Clean, readable combat section in GameTable

---

## TEST — Verification

### TEST-01: Combat Animation Flow Tests

**Acceptance Criteria:**
- [ ] Test that combat emits `combat-panel` snapshot with correct combatant data
- [ ] Test that snapshot includes decision context when at decision point
- [ ] Test that animation events carry correct data (rolls, damage, deaths)
- [ ] Test that `combat-panel` is emitted again after player decision with updated state
- [ ] Test that `combat-end` is emitted when combat finishes
- [ ] All existing tests pass (no regressions)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Changing how non-combat animations work | Only combat uses the event-driven pattern |
| Refactoring actionController | Player action submission is unchanged |
| Changing combat rules/logic | Only the event emission pattern changes, not combat mechanics |
| MapGrid or other UI components | They use truth directly and are unaffected |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DELETE-01 | Phase 42 | Complete |
| DELETE-02 | Phase 42 | Complete |
| DELETE-03 | Phase 44 | Pending |
| DELETE-04 | Phase 45 | Pending |
| DELETE-05 | Phase 44 | Pending |
| SRV-01 | Phase 43 | Complete |
| SRV-02 | Phase 43 | Complete |
| SRV-03 | Phase 43 | Complete |
| UI-01 | Phase 44 | Pending |
| UI-02 | Phase 44 | Pending |
| UI-03 | Phase 44 | Pending |
| UI-04 | Phase 45 | Pending |
| TEST-01 | Phase 46 | Pending |

**Coverage:**
- v1.9 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-02-07*
*Last updated: 2026-02-08 after Phase 43 execution*
