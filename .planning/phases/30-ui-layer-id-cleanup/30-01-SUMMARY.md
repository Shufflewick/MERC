# Phase 30-01 Summary: UI Component Interface Updates

## Objective
Update UI component interfaces to use `combatantName` as the primary identity property instead of `mercName`/`dictatorName`.

## Changes Made

### 1. CombatantCard.vue
- Changed interface property `mercName?: string` → `combatantName?: string`
- Updated `mercId` computed to check `combatantId` first: `getProp('combatantId', '') || getProp('mercId', '') || ...`
- Updated `mercName` computed to check `combatantName` first: `getProp('combatantName', '') || getProp('mercName', '') || ...`

### 2. MapGrid.vue
- Changed MercData interface:
  - `mercId: string` → `combatantId: string`
  - `mercName: string` → `combatantName: string`

### 3. DictatorPanel.vue
- Updated dictator props interface:
  - Added `combatantId?: string` and `combatantName?: string` as new primary properties
  - Changed `dictatorId: string` → `dictatorId?: string` for backward compatibility
  - Changed `dictatorName: string` → `dictatorName?: string` for backward compatibility
- Template already uses fallback pattern: `dictator.combatantName || dictator.dictatorName`

### 4. SectorPanel.vue
- Updated allMercsInSector interface:
  - Added `combatantId?: string` and `combatantName?: string` as new primary properties
  - Kept `mercId?: string` and `mercName?: string` as optional for backward compatibility

### Files Already Updated (from prior work)
- **SectorTile.vue**: MercInSector interface already has `combatantId: string` and `combatantName?: string`
- **SquadPanel.vue**: MercData interface already has `combatantId?: string` and `combatantName?: string`

## Verification
- `npm run build` - SUCCESS (no TypeScript errors)
- `npm test` - SUCCESS (524 tests passed, 1 skipped)

## Pattern Applied
Interface properties now follow the canonical naming convention:
- Primary: `combatantId`, `combatantName`
- Fallback: Legacy `mercId`/`mercName` or `dictatorId`/`dictatorName` kept as optional for runtime data compatibility

Fallback chains in computed properties prioritize new names but still check legacy names.
