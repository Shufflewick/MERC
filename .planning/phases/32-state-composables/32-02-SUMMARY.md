# Plan 32-02 Summary: Create useSectorState Composable

## Completed

Created `src/ui/composables/useSectorState.ts` composable that extracts sector-related state derivation from GameBoard.vue.

## What Was Built

### Exported Types
- `Sector` - Interface for sector data (id, sectorId, sectorName, coordinates, militia, loot, etc.)
- `StashEquipment` - Interface for equipment items in sector stash
- `SectorState` - Return type with all computed refs
- `SectorStateDependencies` - Interface for injected dependencies

### Exported Function
- `useSectorState(getGameView, deps)` - Composable function

### Returned State
- `sectors` - Array of all map sectors
- `selectedSectorId` - Writable ref for UI click selection
- `selectedSector` - Sector from selectedSectorId
- `actionContextSectorId` - Sector inferred from action context
- `actionContextSector` - Sector from action context
- `activeSector` - Preferred sector (selectedSector ?? actionContextSector)
- `selectedSectorStash` - Equipment in active sector's stash
- `selectedSectorMercs` - MERCs in active sector
- `controlMap` - Record<sectorId, controllingColor>

### Ability Flags
- `hasDoc` - Player has Doc on team
- `hasSquidhead` - Player has Squidhead on team
- `hasMortar` - Player has mortar equipped
- `hasDamagedMercs` - Player has damaged MERCs
- `hasLandMinesInStash` - Active sector has land mines in stash
- `squidheadHasLandMine` - Squidhead has land mine equipped

## Design Decisions

1. **Dependency Injection Pattern** - Used `SectorStateDependencies` interface to inject dependencies rather than passing props directly. This allows the composable to be decoupled from GameBoard's specific prop shape and supports testing.

2. **Explicit Generic Type Parameters** - Used explicit type parameters on `getAttr<T>()` calls (e.g., `getAttr<{ equipmentName?: string } | null>()`) to avoid TypeScript literal inference issues with null defaults.

3. **Getter Functions for Dependencies** - Dependencies are provided as getter functions rather than reactive refs to allow lazy evaluation and avoid circular dependency issues between composables.

## Commits

1. `feat(32-02): create useSectorState composable` - 454 lines added

## Lines Impact

- New: 454 lines (composable file)
- GameBoard reduction: Pending integration in future plan

## Verification

- [x] File exists at src/ui/composables/useSectorState.ts
- [x] TypeScript compiles without errors (in new file)
- [x] Exports: useSectorState function
- [x] Returns all sector-related computed refs plus selectedSectorId ref
- [x] selectedSectorId is a writable Ref<string | null>
- [x] Uses useGameViewHelpers for tree queries
