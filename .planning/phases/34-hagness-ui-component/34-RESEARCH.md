# Research: Phase 34 Hagness UI Component

**Date:** 2026-01-18
**Phase:** 34 - Hagness UI Component
**Requirement:** UI-02: HagnessDrawEquipment

## Current Implementation Location

**GameBoard.vue (lines 1152-1197):**
- Hagness draw UI occupies 46 lines of template code
- Located within the main game board component
- Currently shows:
  - Header with icon, title, and prompt (lines 1154-1160)
  - Equipment type selection UI (lines 1163-1168)
  - Equipment display and recipient selection (lines 1171-1196)

**Supporting state in useActionState composable:**
- `isHagnessDrawActive` (line 259): Computed flag checking if `currentAction === 'hagnessDraw'`
- `isHagnessSelectingType` (lines 304-311): Checks if equipmentType selection unfilled
- `isHagnessSelectingRecipient` (lines 314-323): Checks if recipient selection unfilled and equipmentType filled
- `hagnessEquipmentTypeChoices` (lines 481-494): Equipment type dropdown options
- `hagnessDrawnEquipment` (lines 497-547): Retrieved drawn equipment data
- `hagnessSquadMates` (lines 550-587): Squad mate choices for recipient selection

## Hagness Ability Overview

**What it does:** Hagness can spend 1 action to draw equipment for her squad mates.

**From merc-abilities.ts (line 486-489):**
```typescript
hagness: {
  id: 'hagness',
  passive: { drawsEquipmentForSquad: true },
}
```

**From rebel-equipment.ts (lines 892-1111):**
- Action: `hagnessDraw`
- Cost: 1 action
- Flow:
  1. Select equipment type (Weapon, Armor, or Accessory)
  2. Game draws 1 equipment of that type from deck
  3. Display drawn equipment
  4. Select squad mate to receive it
  5. Equip to recipient, discard replaced equipment

## Step-by-Step UI Flow

**Step 1: Equipment Type Selection (lines 1163-1168 of GameBoard.vue)**
- Reuses `DrawEquipmentType` component
- Shows 3 buttons: Weapon, Armor, Accessory
- When selected, calls `selectEquipmentType(equipType: string)`
- Updates actionArgs['equipmentType']

**Step 2: Equipment Drawing (server-side in action)**
- Not handled in UI - performed in `createHagnessDrawAction` execute phase
- Equipment cached in game.settings with key: `hagnessDrawnEquipmentId:${playerId}:${equipmentType}`

**Step 3: Equipment Display & Recipient Selection (lines 1171-1196)**
- Shows drawn equipment card via `EquipmentCard` component (line 1174)
- Shows "No equipment" message if draw fails (lines 1176-1178)
- Shows recipient selection with `CombatantIcon` components (lines 1184-1194)
- Recipient icons clickable, call `selectHagnessRecipient(choice)`

## Template Sections to Extract

**Header (lines 1154-1160):**
```vue
<div class="hagness-header">
  <div class="hagness-icon">🎒</div>
  <div class="hagness-content">
    <h2 class="hagness-title">Hagness: Draw Equipment</h2>
    <p class="hagness-prompt">{{ ... }}</p>
  </div>
</div>
```

**Equipment Type Selection (lines 1163-1168):**
```vue
<DrawEquipmentType
  v-if="isHagnessSelectingType && hagnessEquipmentTypeChoices.length > 0"
  :choices="hagnessEquipmentTypeChoices"
  prompt="Choose equipment type:"
  @select="selectEquipmentType"
/>
```

**Equipment Display (lines 1171-1196):**
- Conditional rendering based on `isHagnessSelectingRecipient`
- Equipment card display
- Recipient icon grid with click handlers

## Methods Needed

**From GameBoard.vue:**
- `selectEquipmentType(equipType: string)` (lines 737-744)
  - Fills 'equipmentType' selection via actionController

- `selectHagnessRecipient(choice: any)` (lines 746-767)
  - Extracts recipient value from choice object
  - Fills 'recipient' selection via actionController

## Props Component Will Need

```typescript
interface HagnessDrawEquipmentProps {
  // Equipment type selection
  equipmentTypeChoices: Array<{ value: string; label: string }>;
  isSelectingType: boolean;

  // Equipment display
  drawnEquipment: any | null;
  isSelectingRecipient: boolean;

  // Recipient selection
  squadMates: Array<{
    displayName: string;
    combatantId: string;
    choice: any;
  }>;

  // Player data for styling
  playerColor: string;

  // Title/prompt text
  title?: string;
  selectTypePrompt?: string;
  recipientPrompt?: string;
}
```

## Events to Emit

```typescript
emit('equipment-type-selected', equipmentType: string)
emit('recipient-selected', choice: any)
```

## State Composables to Use

**From useActionState (already tracking Hagness state):**
- `isHagnessSelectingType` - determine if showing type selection
- `isHagnessSelectingRecipient` - determine if showing recipient selection
- `hagnessEquipmentTypeChoices` - equipment type options
- `hagnessDrawnEquipment` - drawn equipment data
- `hagnessSquadMates` - recipient options

**From other composables:**
- `useGameViewHelpers` - for finding assets/helpers
- Could benefit from local state for any intermediate UI state

## Dependencies & Props from Parent

**Required from GameBoard.vue:**
```vue
<HagnessDrawEquipment
  :equipment-type-choices="hagnessEquipmentTypeChoices"
  :is-selecting-type="isHagnessSelectingType"
  :drawn-equipment="hagnessDrawnEquipment"
  :is-selecting-recipient="isHagnessSelectingRecipient"
  :squad-mates="hagnessSquadMates"
  :player-color="currentPlayerColor"
  @equipment-type-selected="selectEquipmentType"
  @recipient-selected="selectHagnessRecipient"
/>
```

## Styling to Extract

**CSS Classes (lines 1558-1747 of GameBoard.vue):**
- `.hagness-phase` - Main container
- `.hagness-header` - Header section
- `.hagness-icon`, `.hagness-content`, `.hagness-title`, `.hagness-prompt`
- `.hagness-equipment-display` - Main display flex container
- `.hagness-drawn-section` - Equipment card section
- `.hagness-recipient-section` - Recipient selection section
- `.recipient-label`, `.recipient-icons` - Recipient UI
- `.no-equipment` - Empty state
- Responsive media queries for mobile layout

**Color scheme:**
- Hagness theme color: `#81d4a8` (mint green)
- Uses UI_COLORS from colors.ts for consistency

## Complications & Edge Cases

1. **Equipment caching:** Equipment is drawn in action and cached in game.settings with composite key `${playerId}:${equipmentType}`. Component needs to handle:
   - Cache misses (show "no equipment" message)
   - Multiple draws of same type shouldn't redraw
   - Cache cleared after selection

2. **Recipient choice format:** Choices come from action as objects with structure:
   ```typescript
   { value: "MercName", display: "MercName ← EquipmentName", equipment: {...} }
   ```
   Component must extract name properly for display

3. **Squad mate data sources:** Squad mates can come from:
   - Fetched deferred choices (preferred)
   - Direct squad data (fallback)
   - Component needs both paths

4. **Player type handling:** Action works for both rebel and dictator players:
   - Rebels: Hagness in rebel squad
   - Dictator: Hagness in hired mercs (if applicable)
   - Already handled by action, component just uses passed data

5. **Action consumption:** Hagness uses 1 action - component doesn't need to track this (handled by action)

## Consistency with Phase 33 Patterns

**From GameOverOverlay.vue:**
- Uses Teleport for z-index management (not needed for Hagness - not overlay)
- Transition animations for show/hide
- Centered content with background gradient

**From LandingZoneSelection.vue:**
- Receives all options from parent
- Filters/processes internally for display
- Emits events for selection
- Self-contained component logic

**Hagness component should follow:**
- Receive all needed state as props
- Emit events for user interactions
- Use action composables (not direct action calls)
- Consistent styling with other components
- Self-contained with clear inputs/outputs

## File Structure Plan

New component: `src/ui/components/HagnessDrawEquipment.vue`
- ~120-150 lines (similar to GameOverOverlay at 108 lines)
- Three main sections: header, equipment type selection, equipment display + recipient
- Reuse existing components: DrawEquipmentType, EquipmentCard, CombatantIcon
- Scoped styling with CSS variables for theming

## RESEARCH COMPLETE
