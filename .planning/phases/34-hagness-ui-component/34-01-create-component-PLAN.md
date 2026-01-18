---
phase: 34
plan: 01
wave: 1
depends_on: []
files_modified:
  - src/ui/components/HagnessDrawEquipment.vue (new)
autonomous: true
---

# Plan 34-01: Create HagnessDrawEquipment.vue Component

## Objective

Create a standalone component that encapsulates the Hagness draw equipment flow with three sections: header, equipment type selection, and equipment display with recipient selection.

## Context

- Template to extract: GameBoard.vue lines 1152-1197 (46 lines)
- Styles to extract: GameBoard.vue lines 1558-1747 (~190 lines)
- Reuses existing components: DrawEquipmentType, EquipmentCard, CombatantIcon
- State already exposed via useActionState composable

## Tasks

<task id="1">
Create `src/ui/components/HagnessDrawEquipment.vue` with script setup:
- Define props interface for all needed state
- Define emit for 'equipment-type-selected' and 'recipient-selected' events
- Import UI_COLORS from '../../colors'
- Import child components: DrawEquipmentType, EquipmentCard, CombatantIcon

Props interface:
```typescript
interface Props {
  isSelectingType: boolean
  isSelectingRecipient: boolean
  equipmentTypeChoices: Array<{ value: string; label: string }>
  drawnEquipment: any | null
  squadMates: Array<{ displayName: string; combatantId: string; choice: any }>
  playerColor: string
}
```
</task>

<task id="2">
Add template with three sections from GameBoard.vue lines 1152-1197:
- Header section: icon (backpack emoji), title "Hagness: Draw Equipment", dynamic prompt
- Equipment type selection: DrawEquipmentType component (v-if isSelectingType)
- Equipment display + recipient selection: EquipmentCard + CombatantIcon grid (v-else-if isSelectingRecipient)
- Handle "no equipment" empty state

Prompt logic:
- isSelectingType → "Choose equipment type to draw"
- isSelectingRecipient → "Choose who receives the equipment"
- else → "Drawing equipment..."
</task>

<task id="3">
Add scoped styles from GameBoard.vue lines 1558-1747:
- .hagness-phase container with mint green border (#81d4a8)
- .hagness-header, .hagness-icon, .hagness-content, .hagness-title, .hagness-prompt
- .hagness-equipment-display flex layout
- .hagness-drawn-section, .hagness-recipient-section
- .recipient-label, .recipient-icons
- .no-equipment empty state
- Responsive media query for mobile layout (max-width: 600px)
- Use UI_COLORS v-bind for theme consistency
</task>

<task id="4">
Verify TypeScript compiles:
```bash
cd /Users/jtsmith/Dropbox/MERC/BoardSmith/MERC && npx vue-tsc --noEmit 2>&1 | head -50
```
</task>

## Verification

```bash
# File exists with correct structure
ls -la src/ui/components/HagnessDrawEquipment.vue

# TypeScript compiles
npx vue-tsc --noEmit

# No pre-existing errors introduced (compare to baseline)
```

## Must Haves

- [ ] Component receives all state as props (not calling composables directly)
- [ ] Emits 'equipment-type-selected' and 'recipient-selected' events
- [ ] Reuses DrawEquipmentType, EquipmentCard, CombatantIcon components
- [ ] Handles "no equipment drawn" empty state
- [ ] Mint green (#81d4a8) Hagness theme color
- [ ] Responsive layout for mobile (stacks vertically, centers recipient icons)
- [ ] TypeScript compiles without new errors

## Reference Files

- src/ui/components/GameBoard.vue (lines 1152-1197 template, lines 1558-1747 styles)
- src/ui/components/LandingZoneSelection.vue (Phase 33 pattern reference)
- src/ui/composables/useActionState.ts (state exports reference)
