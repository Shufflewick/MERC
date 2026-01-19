# Research: Phase 32 - State Composables

**Completed:** 2026-01-18
**Goal:** Extract reactive state derivation into composables

## Executive Summary

All state derivation code is well-isolated with clear dependencies. The 4 composables map cleanly to GameBoard.vue code sections:

| Requirement | Lines | Key Properties |
|-------------|-------|----------------|
| STATE-01 | 370-601 | players, colors, position helpers |
| STATE-02 | 81-315 + 604-651 | sectors, control, ability flags |
| STATE-03 | 673-870 | squad objects for all players |
| STATE-04 | 1132-1665 | action state, type flags, selections |

**Recommended extraction order:** STATE-01 → STATE-02 → STATE-03 → STATE-04

---

## STATE-01: usePlayerState

**Source:** Lines 370-478, 594-601

### Properties to Extract

```typescript
// Computed properties
players              // Array of player objects with position, color, isDictator
currentPlayerColor   // Current player's color from props.playerPosition
playerColorMap       // Record<position, color> for militia display
dictatorPlayerColor  // Dictator's specific color
currentPlayerIsDictator // Boolean check if current player is dictator

// Helper function
positionToColor(position)  // Convert position to color string
```

### Dependencies

- `props.playerPosition` - passed in
- Tree queries: `findAllByClassName('Squad')`, `findAllByClassName('RebelPlayer')`, `findAllByClassName('DictatorPlayer')`, `findAllByClassName('PlayerArea')`
- Helpers from Phase 31: `normalizeClassName`, `getAttr`, `findAllByClassName`

### Vue Reactivity

- All computed() except `positionToColor` which is pure function
- No refs, no watches

### Key Code

```typescript
// Line 370-425 - players computed
const players = computed(() => {
  const rebelPlayers = findAllByClassName('RebelPlayer');
  const dictatorPlayer = findAllByClassName('DictatorPlayer')[0];
  // ... builds player array
});

// Line 594-601 - positionToColor helper
function positionToColor(position: string | number) {
  const posNum = typeof position === 'string' ? parseInt(position) : position;
  const p = players.value.find(p => p.position === posNum);
  return p?.playerColor || '';
}
```

---

## STATE-02: useSectorState

**Source:** Lines 81-315, 604-651

### Properties to Extract

```typescript
// Core sector state
sectors              // Array of sector objects with coordinates, militias, loot
selectedSectorId     // ref - tracks clicked sector (UI state)
selectedSector       // Sector from selectedSectorId
actionContextSectorId // Sector from action metadata
actionContextSector  // Sector object from action context
activeSector         // Either selectedSector or actionContextSector
selectedSectorStash  // Equipment in selected sector's stash
selectedSectorMercs  // MERCs in active sector
controlMap           // Record<sectorId, controllingColor>

// Ability flags (derived from sector contents)
hasDoc, hasSquidhead, hasMortar, hasDamagedMercs,
hasLandMinesInStash, squidheadHasLandMine
```

### Dependencies

- `selectedSectorId` - local ref (must be writable)
- `sectors` - basic sector data
- Squad state for checking who's in sector (from STATE-03)
- Helper: `findByRef`, `findAllByClassName`, `getAttr`

### Vue Reactivity

- `selectedSectorId` - ref (writable)
- All others - computed

### Event Handlers

- `handleSectorClick(sectorId)` - sets selectedSectorId
- `closeSectorPanel()` - clears selectedSectorId

### Key Code

```typescript
// Line 81-126 - sectors computed
const sectors = computed(() => {
  const sectorElements = findAllByClassName('Sector');
  return sectorElements.map((sector: any) => ({
    sectorId: getAttr(sector, 'sectorId'),
    sectorName: getAttr(sector, 'sectorName'),
    // ... many attributes
  }));
});

// Line 604-651 - controlMap computed
const controlMap = computed(() => {
  const map: Record<string, string> = {};
  for (const sector of sectors.value) {
    // ... determine control by militia counts and MERC positions
  }
  return map;
});
```

---

## STATE-03: useSquadState

**Source:** Lines 673-870

### Properties to Extract

```typescript
// Squad objects
primarySquad         // Rebel primary squad
secondarySquad       // Rebel secondary squad
dictatorPrimarySquad // Dictator's primary squad (with dictator card)
dictatorSecondarySquad // Dictator's secondary squad
dictatorBaseSquad    // Dictator's third squad at base

// Helper
buildDictatorSquad(squad) // Build squad object with dictator included
```

### Squad Object Structure

```typescript
interface SquadState {
  squadId: string;
  isPrimary: boolean;
  sectorId: string;
  sectorName?: string;
  mercs: CombatantModel[];
}
```

### Dependencies

- `props.playerPosition` - for rebel squads
- `currentPlayerIsDictator` - from STATE-01
- `sectors` - from STATE-02 for sector names
- Helpers: `findAllByClassName`, `getAttr`, `findDictatorCombatant`, `isMercDead`

### Vue Reactivity

- All computed()

### Special Handling

- Dictator squads include dictator card when `inPlay=true`
- Dictator card mapped to merc-like format with `isDictator: true`
- Dead MERCs filtered with `isMercDead` check

### Key Code

```typescript
// Line 673-699 - primarySquad
const primarySquad = computed(() => {
  const squads = findAllByClassName('Squad');
  const squad = squads.find((s: any) => {
    const playerPos = getSquadPlayerPosition(s);
    const isPrimary = getAttr(s, 'isPrimary', false);
    return playerPos === props.playerPosition && isPrimary === true;
  });
  // ...
});

// Line 730-771 - buildDictatorSquad helper
function buildDictatorSquad(squad: any): SquadState | null {
  // ... builds squad with dictator card when in base sector
}
```

---

## STATE-04: useActionState

**Source:** Lines 1132-1665

### Properties to Extract

```typescript
// Core action state
actionChoices        // Copy of props.actionArgs
currentActionMetadata // Metadata for current action
currentSelection     // First unfilled selection from metadata
allSelectionsComplete // Boolean check if all filled

// Action type flags (computed booleans)
isHiringMercs, isSelectingDictator, isHagnessDrawActive,
isPlacingLanding, isSelectingRetreatSector, isEquipping,
isSelectingEquipmentType, isCastroHiring, isSelectingSector,
showAssignToSquad, isHagnessSelectingType, isHagnessSelectingRecipient

// Derived state
retreatSectorChoices // Full sector data for retreat
sectorChoices        // Full sector data for selection
landingZoneMetadata  // Metadata for landing zone action
selectedMercForEquipment // MERC selected for equipment

// Hagness-specific
hagnessEquipmentTypeChoices, hagnessEquipmentTypeSelection,
hagnessDrawnEquipmentToAssign, hagnessRecipientChoices
```

### Dependencies

- `props.availableActions` - what actions available
- `props.actionController` - current action/selection
- `props.actionArgs` - filled selections
- `props.state?.state?.actionMetadata` - action metadata
- `sectors` - from STATE-02
- `primarySquad`, `secondarySquad` - from STATE-03

### Vue Reactivity

- computed() for derived state
- ref() for:
  - `deferredChoicesLoading`
  - `fetchedDeferredChoices` (reactive object)
  - `showHiringMercModal`
  - `assignToSquadDelayedHide`

### Watch Handlers

```typescript
// Watch availableActions - auto-start hiring
watch(() => props.availableActions, (actions) => {
  if (actions.includes('hireMerc')) { ... }
});

// Watch equipmentType - load deferred choices
watch(() => props.actionArgs['equipmentType'], async (type) => {
  if (type && isHagnessDrawActive.value) { ... }
});

// Watch currentSelection - fetch deferred choices
watch(() => currentSelection.value, async (selection) => {
  if (selection?.source === 'deferred') { ... }
});
```

### Event Handlers

```typescript
selectMercToHire(merc)           // Select merc for hiring
selectEquipmentType(equipType)   // Select equipment type
selectHagnessRecipient(choice)   // Select hagness recipient
handleSelectRetreatSector(sectorId) // Select retreat sector
```

### Cache Pattern

```typescript
// fetchedDeferredChoices - cache for async choices
const fetchedDeferredChoices = reactive<Record<string, any[]>>({});
// Key format: `${actionName}:${selectionName}`
```

---

## Dependency Graph

```
usePlayerState (independent)
     ↓
useSectorState (uses helpers only)
     ↓
useSquadState (uses playerState + sectorState)
     ↓
useActionState (uses all above + actionController)
```

## Extraction Order

1. **STATE-01: usePlayerState** - No dependencies on other state
2. **STATE-02: useSectorState** - Light deps on helpers only
3. **STATE-03: useSquadState** - Needs playerState + sectors
4. **STATE-04: useActionState** - Needs all + actionController

## Composable Signature Pattern

Following Phase 31:

```typescript
export function usePlayerState(
  getGameView: () => any,
  playerPosition: Ref<number> | number
) {
  const { findAllByClassName, getAttr } = useGameViewHelpers(getGameView);

  const players = computed(() => { ... });

  return { players, currentPlayerColor, ... };
}
```

## Risks & Considerations

1. **positionToColor depends on players.value** - Must return from usePlayerState even though pure
2. **Watch handlers have async logic** - Must preserve try/catch error handling
3. **Deferred choices cache** - Uses reactive() object, maintain pattern
4. **Modal state mixing** - `showAssignToSquad` mixes ref + computed logic
5. **selectedSectorId is writable** - Must be ref, exposed for event handlers

## What Stays in GameBoard.vue

- Component-level modal visibility flags
- Injected dependencies (fetchDeferredChoicesFn)
- Event handlers that call action methods
- Board interaction integration (useBoardInteraction)

---

*Research completed: 2026-01-18*
