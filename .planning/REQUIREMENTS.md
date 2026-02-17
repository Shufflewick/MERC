# Requirements: MERC v2.1 Expansion Dictators

**Defined:** 2026-02-17
**Core Value:** Ship Confidence — the game should behave correctly, consistently, and visibly.

## v1 Requirements

### Data & Setup

- [ ] **DATA-01**: Add all 9 expansion dictators to combatants.json with correct stats, abilities, and images
- [ ] **DATA-02**: Dictator selection UI allows players to choose any of the 11 dictators during game setup

### Per-Turn Abilities

- [ ] **TURN-01**: Gaddafi — hire 1 random MERC per turn
- [ ] **TURN-02**: Hitler — hire 1 random MERC per turn; pick a rebel to have auto-initiative over (persistent until switched, can switch once per turn)
- [ ] **TURN-03**: Mao — place militia equal to rebel-controlled sector count into any wilderness sectors
- [ ] **TURN-04**: Mussolini — add militia equal to rebel count to a controlled sector, then move militia from that sector to adjacent sectors
- [ ] **TURN-05**: Noriega — convert 1 militia from each rebel sector to dictator militia, move all to one chosen non-rebel sector; hire 1 random MERC if controlling fewer sectors than rebels
- [ ] **TURN-06**: Pinochet — distribute damage equal to rebel-controlled sector count as evenly as possible across all rebel forces (MERCs and militia)
- [ ] **TURN-07**: Pol Pot — add militia equal to rebel-controlled sector count to any one rebel sector (max 10); hire 1 random MERC if combat lost
- [ ] **TURN-08**: Stalin — hire 1 random MERC to primary squad; if base revealed, also hire 1 to secondary squad

### Setup-Phase Abilities

- [ ] **SETUP-01**: Hussein — start with 10 tactics cards instead of 5
- [ ] **SETUP-02**: Mao — start with 1 random MERC per rebel (dictator chooses squad placement)
- [ ] **SETUP-03**: Mussolini — start with 1 random MERC per rebel (dictator chooses squad placement)

### Persistent/Reactive Abilities

- [ ] **REACT-01**: Hussein — draw and play a second tactics card each turn
- [ ] **REACT-02**: Gaddafi — when dictator forces kill a MERC, offer their equipment to dictator MERCs in the sector instead of discarding
- [ ] **REACT-03**: Pinochet — queue a free MERC hire when losing control of a sector (placed at start of next turn)

### AI Support

- [ ] **AI-01**: AI decision-making for all 9 dictator per-turn abilities
- [ ] **AI-02**: AI decision-making for setup-phase choices (squad placement for Mao/Mussolini starting MERCs)
- [ ] **AI-03**: AI decision-making for reactive abilities (Gaddafi equipment looting, Pinochet hire placement)

### Testing

- [ ] **TEST-01**: Unit tests for each dictator's per-turn ability
- [ ] **TEST-02**: Unit tests for setup-phase abilities
- [ ] **TEST-03**: Unit tests for persistent/reactive abilities
- [ ] **TEST-04**: Integration tests for AI dictator ability decisions

## v2 Requirements

(None — this milestone is self-contained)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Expansion MERC characters | Separate milestone — this is dictators only |
| Dictator-specific map layouts | Not part of expansion content |
| Multiplayer dictator (co-op dictator) | Dictator is always a single player |
| Balancing/tuning passes | Ship first, tune later based on playtesting |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 56 | Pending |
| DATA-02 | Phase 56 | Pending |
| TURN-01 | Phase 57 | Pending |
| TURN-02 | Phase 60 | Pending |
| TURN-03 | Phase 59 | Pending |
| TURN-04 | Phase 59 | Pending |
| TURN-05 | Phase 60 | Pending |
| TURN-06 | Phase 61 | Pending |
| TURN-07 | Phase 59 | Pending |
| TURN-08 | Phase 57 | Pending |
| SETUP-01 | Phase 58 | Pending |
| SETUP-02 | Phase 58 | Pending |
| SETUP-03 | Phase 58 | Pending |
| REACT-01 | Phase 58 | Pending |
| REACT-02 | Phase 61 | Pending |
| REACT-03 | Phase 61 | Pending |
| AI-01 | Phase 62 | Pending |
| AI-02 | Phase 62 | Pending |
| AI-03 | Phase 62 | Pending |
| TEST-01 | Phase 62 | Pending |
| TEST-02 | Phase 62 | Pending |
| TEST-03 | Phase 62 | Pending |
| TEST-04 | Phase 62 | Pending |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-02-17*
*Last updated: 2026-02-17 after roadmap creation*
