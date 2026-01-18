# Plan 32-04 Summary: Create useActionState Composable

## Outcome

COMPLETE - Created `useActionState` composable for action-related state derivation.

## Changes Made

### New File
- `src/ui/composables/useActionState.ts` (639 lines)

### Composable Structure

**Core State:**
- `actionChoices` - Current action args as record
- `currentActionMetadata` - Metadata for hiring/hagnessDraw/explore actions
- `currentSelection` - First unfilled selection from metadata
- `allSelectionsComplete` - Boolean when all selections filled
- `getCurrentActionName()` - Function returning action name for custom UI

**Action Type Flags (12 computed booleans):**
- `isHiringMercs` - Day 1 or Castro hiring mode
- `isSelectingDictator` - Human dictator selection
- `isHagnessDrawActive` - Hagness draw action active
- `isPlacingLanding` - Landing zone placement mode
- `isSelectingRetreatSector` - Retreat sector selection
- `isEquipping` - Starting equipment phase
- `isSelectingEquipmentType` - Equipment type selection
- `isCastroHiring` - Castro bonus hire flow
- `isSelectingSector` - Sector selection (Castro placement)
- `showAssignToSquad` - AssignToSquad panel visibility
- `isHagnessSelectingType` - Hagness equipment type step
- `isHagnessSelectingRecipient` - Hagness recipient step

**Derived State:**
- `retreatSectorChoices` - Full sector data for retreat selection
- `sectorChoices` - Full sector data for Castro placement
- `landingZoneMetadata` - Landing zone action metadata
- `selectedMercForEquipment` - MERC being hired
- `selectedMercImagePath` - Image path for hired MERC
- `selectedMercName` - Name of hired MERC
- `selectedMercId` - ID of hired MERC
- `equipmentTypeChoices` - Normalized equipment type choices

**Hagness-Specific State:**
- `hagnessEquipmentTypeChoices` - Hagness equipment type choices
- `hagnessDrawnEquipment` - Equipment drawn by Hagness
- `hagnessSquadMates` - Squad mates for recipient selection

**UI State Refs:**
- `deferredChoicesLoading` - Loading indicator for deferred choices
- `fetchedDeferredChoices` - Cache of fetched deferred choices
- `showHiringMercModal` - MERC detail modal visibility
- `assignToSquadDelayedHide` - Delayed hide for animation

**Utility Functions:**
- `findMercByName()` - Find MERC by name in game tree
- `getSectorImageFallback()` - Fallback image for sector types

## Design Decisions

### Watch Handler Placement

Watchers remain in GameBoard.vue because they:
1. Call `props.actionController.start()` (auto-start hiring actions)
2. Use injected `fetchDeferredChoicesFn` (deferred choices fetch)
3. Update timeout state that interacts with component lifecycle

The composable exports reactive refs that these watchers can modify.

### Type Definition

The `ActionStateProps` interface uses `Record<string, any>` for `state.state` to allow flexibility for game-specific properties like `hagnessDrawnEquipmentData`.

### Explicit Type Parameters

Added explicit `getAttr<string>()` type parameter to avoid TypeScript inference issues with the generic function.

## Commits

1. `feat(32-04): create useActionState composable`

## Verification

- [x] File exists at src/ui/composables/useActionState.ts
- [x] TypeScript compiles without errors
- [x] Exports: useActionState function
- [x] Returns all action-related computed refs and UI state refs
- [x] Correctly derives current selection from metadata
- [x] Preserves deferred choices caching pattern (reactive object)
