# Requirements: MERC GameBoard Component Refactor

**Defined:** 2026-01-18
**Core Value:** Ship Confidence - maintainable, testable UI components

## v1 Requirements

Requirements for v1.7 milestone. Each maps to roadmap phases.

### UI Components

- [ ] **UI-01**: Extract HiringPhase.vue — merc selection, equipment type, sector selection, dictator selection, skip option, detail modal
- [ ] **UI-02**: Extract HagnessDrawEquipment.vue — equipment type selection, drawn equipment display, recipient selection
- [ ] **UI-03**: Extract LandingZoneSelection.vue — sector picker for landing phase with visual sector cards
- [ ] **UI-04**: Extract GameOverOverlay.vue — victory/defeat display component

### Helper Composables

- [ ] **HELP-01**: Extract useGameViewHelpers — findByClassName, findAllByClassName, findByRef, findElementById, getAttr, normalizeClassName
- [ ] **HELP-02**: Extract useVictoryCalculations — calculateRebelVictoryPoints, calculateDictatorVictoryPoints, isGameOver, gameWinner

### State Composables

- [ ] **STATE-01**: Extract usePlayerState — players, currentPlayerColor, playerColorMap, dictatorPlayerColor, currentPlayerIsDictator, positionToColor
- [ ] **STATE-02**: Extract useSectorState — sectors, selectedSector, activeSector, controlMap, selectedSectorStash, sector ability flags
- [ ] **STATE-03**: Extract useSquadState — primarySquad, secondarySquad, dictatorPrimarySquad, dictatorSecondarySquad, dictatorBaseSquad, buildDictatorSquad
- [ ] **STATE-04**: Extract useActionState — actionChoices, currentSelection, currentActionMetadata, action type flags, selection handlers

### Integration

- [ ] **INT-01**: GameBoard.vue uses all extracted composables and components
- [ ] **INT-02**: GameBoard.vue reduced to orchestrator role (<500 lines target)
- [ ] **INT-03**: All existing functionality preserved (no regressions)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Testing

- **TEST-01**: Unit tests for each composable
- **TEST-02**: Component tests for extracted UI components

### Documentation

- **DOC-01**: Update CLAUDE.md with component/composable architecture

## Out of Scope

| Feature | Reason |
|---------|--------|
| Refactoring other large components | Focus on GameBoard.vue only for this milestone |
| Adding new UI features | Pure refactor, no new functionality |
| Changing component APIs | Preserve existing interfaces for framework compatibility |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| UI-01 | TBD | Pending |
| UI-02 | TBD | Pending |
| UI-03 | TBD | Pending |
| UI-04 | TBD | Pending |
| HELP-01 | TBD | Pending |
| HELP-02 | TBD | Pending |
| STATE-01 | TBD | Pending |
| STATE-02 | TBD | Pending |
| STATE-03 | TBD | Pending |
| STATE-04 | TBD | Pending |
| INT-01 | TBD | Pending |
| INT-02 | TBD | Pending |
| INT-03 | TBD | Pending |

**Coverage:**
- v1 requirements: 13 total
- Mapped to phases: 0
- Unmapped: 13

---
*Requirements defined: 2026-01-18*
*Last updated: 2026-01-18 after initial definition*
