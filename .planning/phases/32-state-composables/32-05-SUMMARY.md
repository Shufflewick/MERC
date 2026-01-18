# Plan 05 Summary: Integrate State Composables into GameBoard.vue

## Completed Tasks

### Task 1: Add imports
- Added imports for all four state composables: usePlayerState, useSectorState, useSquadState, useActionState
- Added toRef import for creating reactive ref from props

### Task 2: Initialize composables in dependency order
1. **usePlayerState** - Independent, creates players, currentPlayerColor, etc.
2. **useSectorState** - Takes lazy getters for allMercs and squad data (resolved by useSquadState)
3. **useSquadState** - Depends on sectors from useSectorState, provides allMercs
4. **useActionState** - Depends on sectors, primarySquad, secondarySquad

Key insight: Circular dependency between useSectorState (needs allMercs) and useSquadState (needs sectors) resolved through lazy getter functions that are evaluated after both composables are initialized.

### Task 3: Remove extracted definitions
Removed approximately **1,285 lines** of duplicate state definitions:

**From STATE-01 (Player State):**
- `players` computed
- `currentPlayerColor` computed
- `playerColorMap` computed
- `dictatorPlayerColor` computed
- `currentPlayerIsDictator` computed
- `positionToColor` function

**From STATE-02 (Sector State):**
- `sectors` computed
- `selectedSectorId` ref
- `selectedSector` computed
- `actionContextSectorId` computed
- `actionContextSector` computed
- `activeSector` computed
- `selectedSectorStash` computed
- `selectedSectorMercs` computed
- `controlMap` computed
- Ability flags: hasDoc, hasSquidhead, hasMortar, hasDamagedMercs, hasLandMinesInStash, squidheadHasLandMine

**From STATE-03 (Squad State):**
- `getSquadPlayerPosition` function
- `primarySquad` computed
- `secondarySquad` computed
- `buildDictatorSquad` function
- `dictatorPrimarySquad` computed
- `dictatorSecondarySquad` computed
- `dictatorBaseSquad` computed
- `dictatorSquad` alias
- `allMercs` computed

**From STATE-04 (Action State):**
- `actionChoices` computed
- All action type flags (isHiringMercs, isSelectingDictator, etc.)
- `retreatSectorChoices` computed
- `sectorChoices` computed
- `landingZoneMetadata` computed
- `equipmentTypeChoices` computed
- Selected MERC computeds
- Hagness-specific state
- `getCurrentActionName` function
- `findMercByName` function
- `getSectorImageFallback` function
- UI state refs

**Kept (not extracted):**
- `selectedSectorHasDictatorForces` - uses activeSector from composable
- `selectedSectorIsBase` - uses activeSector and dictatorBaseSectorId
- `hasExplosivesComponents` - uses primarySquad and secondarySquad
- `dictatorCard` computed - uses findDictatorCombatant helper
- `dictatorBaseSectorId` computed
- `tacticsHand` computed
- `militiaBonuses` computed
- Combat panel state
- All event handlers

### Task 4: Restore accidentally removed handlers
Re-added these handler functions that were removed during duplicate cleanup:
- `handleSelectRetreatSector`
- `selectSector`
- `openHiringMercDetail`
- `closeHiringMercModal`
- `handleReassignCombatant`
- `assignToSquadPanelRef` ref

### Task 5 & 6: Verification
- TypeScript check: Pre-existing type issues in other files, no new issues from refactoring
- Browser testing blocked by pre-existing dependency issue (`@boardsmith/session` package configuration)

## Results

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| GameBoard.vue lines | ~3,093 | ~1,808 | -1,285 (-42%) |
| Composable imports | 2 | 6 | +4 |
| State computeds | ~60 | ~15 | -45 |

## Known Issues

1. **Pre-existing type errors** in day-one-actions.ts and other files (not related to this refactoring)
2. **Pre-existing dependency issue** with `@boardsmith/session` package blocking browser testing
3. **Type compatibility** between composable interfaces and component prop interfaces needs cleanup

## Commits

1. `feat(32-05): add imports for state composables`
2. `feat(32-05): initialize state composables`
3. `refactor(32-05): remove duplicate definitions from GameBoard.vue`

## Files Modified

- `src/ui/components/GameBoard.vue` - Major refactoring, ~1,285 lines removed
- `src/ui/composables/useActionState.ts` - Updated ActionStateProps interface for broader compatibility
