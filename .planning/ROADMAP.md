# Roadmap: MERC v2.1 Expansion Dictators

## Overview

Add 9 expansion dictators (Gaddafi, Hitler, Hussein, Mao, Mussolini, Noriega, Pinochet, Pol Pot, Stalin) to the game, each with unique abilities across per-turn, setup, persistent, and reactive categories. Phases are ordered by implementation complexity, starting with data foundation and progressing through ability tiers from simple hire patterns to complex interactive and reactive mechanics.

## Phases

### Phase 56: Data Foundation

**Goal:** All 9 expansion dictators exist in the game data and players can select any dictator during setup.

**Dependencies:** None (foundation phase)

**Requirements:** DATA-01, DATA-02

**Plans:** 1 plan

Plans:
- [ ] 56-01-PLAN.md -- Add 9 expansion dictators to combatants.json, lobby dropdown, and DictatorAbilityType

**Success Criteria:**
1. All 9 expansion dictators appear in combatants.json with correct stats, ability descriptions, and image references
2. Game setup UI presents all 11 dictators (2 existing + 9 new) for selection
3. Selecting any expansion dictator starts a game with that dictator's identity visible on the board
4. Expansion dictators without implemented abilities function as stat-only dictators (no crashes, no missing data)

---

### Phase 57: Simple Hire Abilities

**Goal:** Gaddafi and Stalin can hire MERCs each turn, following the established Castro pattern.

**Dependencies:** Phase 56 (dictator data must exist)

**Requirements:** TURN-01, TURN-08

**Success Criteria:**
1. Gaddafi hires 1 random MERC per turn during the dictator ability step
2. Stalin hires 1 random MERC to primary squad each turn; when base is revealed, also hires 1 to secondary squad
3. Hired MERCs appear in the correct squad and are usable immediately in the dictator's turn
4. Flow step includes both abilities alongside existing castroBonusHire and kimBonusMilitia

---

### Phase 58: Setup-Phase Abilities

**Goal:** Hussein, Mao, and Mussolini modify game state during setup, and Hussein's persistent double-tactics works each turn.

**Dependencies:** Phase 56 (dictator data must exist)

**Requirements:** SETUP-01, SETUP-02, SETUP-03, REACT-01

**Success Criteria:**
1. Hussein starts the game with 10 tactics cards instead of 5
2. Hussein draws and plays a second tactics card each turn (persistent effect throughout the game)
3. Mao starts with 1 random MERC per rebel player, with the dictator choosing which squad each goes to
4. Mussolini starts with 1 random MERC per rebel player, with the dictator choosing which squad each goes to
5. Squad placement choices are presented as interactive selections during the setup phase

---

### Phase 59: Militia Placement Abilities

**Goal:** Mao, Mussolini, and Pol Pot place militia each turn following patterns similar to Kim's existing militia ability.

**Dependencies:** Phase 56 (dictator data), Phase 58 (Mao/Mussolini setup abilities complete)

**Requirements:** TURN-03, TURN-04, TURN-07

**Success Criteria:**
1. Mao places militia equal to rebel-controlled sector count into any wilderness sectors each turn
2. Mussolini adds militia equal to rebel count to a chosen controlled sector, then spreads militia from that sector to adjacent sectors
3. Pol Pot adds militia equal to rebel-controlled sector count to any one rebel sector (capped at 10 per sector); hires 1 random MERC if combat was lost
4. Militia placement choices are presented as interactive selections with valid sector filtering

---

### Phase 60: Complex Interactive Abilities

**Goal:** Hitler and Noriega execute multi-step interactive abilities each turn.

**Dependencies:** Phase 57 (hire pattern established)

**Requirements:** TURN-02, TURN-05

**Success Criteria:**
1. Hitler hires 1 random MERC per turn AND picks a rebel to have auto-initiative over (persistent until switched, switchable once per turn)
2. Noriega converts 1 militia from each rebel sector to dictator militia, moves all converted to one chosen non-rebel sector, and hires 1 random MERC if controlling fewer sectors than rebels
3. Multi-step flows present each choice sequentially with clear prompts
4. Hitler's initiative target persists across turns and is visible to the affected rebel

---

### Phase 61: Reactive Abilities

**Goal:** Gaddafi, Pinochet, and Pol Pot respond to game events with triggered abilities.

**Dependencies:** Phase 57 (Gaddafi hire exists), Phase 59 (Pol Pot militia exists)

**Requirements:** REACT-02, REACT-03, TURN-06

**Success Criteria:**
1. When dictator forces kill a MERC under Gaddafi, the dictator is offered the dead MERC's equipment for dictator MERCs in that sector
2. When Pinochet loses control of a sector, a free MERC hire is queued and placed at the start of the next turn
3. Pinochet distributes damage equal to rebel-controlled sector count as evenly as possible across all rebel forces each turn
4. Reactive abilities trigger reliably on the correct game events without interfering with combat flow or animations

---

### Phase 62: AI & Comprehensive Testing

**Goal:** AI can play as any of the 9 expansion dictators, and all abilities have test coverage.

**Dependencies:** Phases 57-61 (all abilities implemented)

**Requirements:** AI-01, AI-02, AI-03, TEST-01, TEST-02, TEST-03, TEST-04

**Success Criteria:**
1. AI dictator makes reasonable decisions for all 9 per-turn abilities (sector selection, target selection, squad placement)
2. AI dictator handles setup-phase choices (Mao/Mussolini squad placement)
3. AI dictator handles reactive ability choices (Gaddafi equipment looting, Pinochet hire placement)
4. Unit tests verify each dictator's per-turn, setup, and reactive abilities in isolation
5. Integration tests verify AI dictator plays a full game without errors for each expansion dictator

---

## Progress

| Phase | Name | Status | Requirements |
|-------|------|--------|--------------|
| 56 | Data Foundation | Planned | DATA-01, DATA-02 |
| 57 | Simple Hire Abilities | Pending | TURN-01, TURN-08 |
| 58 | Setup-Phase Abilities | Pending | SETUP-01, SETUP-02, SETUP-03, REACT-01 |
| 59 | Militia Placement Abilities | Pending | TURN-03, TURN-04, TURN-07 |
| 60 | Complex Interactive Abilities | Pending | TURN-02, TURN-05 |
| 61 | Reactive Abilities | Pending | REACT-02, REACT-03, TURN-06 |
| 62 | AI & Comprehensive Testing | Pending | AI-01, AI-02, AI-03, TEST-01, TEST-02, TEST-03, TEST-04 |

**Coverage:** 23/23 v1 requirements mapped

---
*Roadmap created: 2026-02-17*
*Last updated: 2026-02-17*
