---
phase: 34
plan: 02
wave: 2
depends_on: [34-01]
files_modified:
  - src/ui/components/GameBoard.vue
autonomous: true
---

# Plan 34-02: Integrate HagnessDrawEquipment into GameBoard.vue

## Objective

Replace the inline Hagness draw template in GameBoard.vue with the new HagnessDrawEquipment component, removing ~236 lines of template and styles.

## Context

- Component created in 34-01: HagnessDrawEquipment.vue
- Template to remove: lines 1152-1197 (46 lines)
- Styles to remove: lines 1558-1747 (~190 lines)
- Event handlers already exist: selectEquipmentType, selectHagnessRecipient

## Tasks

<task id="1">
Import HagnessDrawEquipment component in GameBoard.vue script section.

Add to component imports:
```typescript
import HagnessDrawEquipment from './HagnessDrawEquipment.vue'
```
</task>

<task id="2">
Replace inline template (lines 1152-1197) with component usage:

Replace the entire `<!-- Hagness Draw Equipment UI -->` section with:
```vue
<!-- Hagness Draw Equipment UI -->
<HagnessDrawEquipment
  v-if="isHagnessDrawActive"
  :is-selecting-type="isHagnessSelectingType"
  :is-selecting-recipient="isHagnessSelectingRecipient"
  :equipment-type-choices="hagnessEquipmentTypeChoices"
  :drawn-equipment="hagnessDrawnEquipment"
  :squad-mates="hagnessSquadMates"
  :player-color="currentPlayerColor"
  @equipment-type-selected="selectEquipmentType"
  @recipient-selected="selectHagnessRecipient"
/>
```

This replaces 46 lines with 12 lines.
</task>

<task id="3">
Remove Hagness-specific CSS styles (lines 1558-1747):
- .hagness-phase and all nested selectors
- .hagness-header, .hagness-icon, .hagness-content, .hagness-title, .hagness-prompt
- .step-label (if only used by Hagness)
- .drawn-equipment-card
- .recipient-buttons-inline, .recipient-label-inline
- .no-equipment (first occurrence if duplicated)
- .recipient-buttons, .recipient-label, .recipient-button-row, .recipient-button
- .hagness-loading
- .hagness-equipment-display, .hagness-drawn-section, .hagness-recipient-section
- .recipient-icons
- .hagness-recipient-prompt, .recipient-message, .no-mercs-message
- Related media queries for .hagness-* classes
</task>

<task id="4">
Verify TypeScript compiles:
```bash
cd /Users/jtsmith/Dropbox/MERC/BoardSmith/MERC && npx vue-tsc --noEmit 2>&1 | head -50
```
</task>

<task id="5">
Verify game runs and Hagness ability works:
- Start dev server if not running
- Navigate to a game with Hagness in squad
- Trigger Hagness draw ability
- Verify: equipment type selection appears
- Verify: after selecting type, drawn equipment card appears
- Verify: recipient icons appear and are clickable
- Verify: selecting recipient completes the action
</task>

## Verification

```bash
# TypeScript compiles
npx vue-tsc --noEmit

# Component is imported
grep -n "HagnessDrawEquipment" src/ui/components/GameBoard.vue

# Old inline template removed (should NOT find "hagness-header" in template section)
grep -n "hagness-header" src/ui/components/GameBoard.vue

# Hagness styles removed
grep -n "\.hagness-phase" src/ui/components/GameBoard.vue

# Count GameBoard.vue lines (should be ~1,700 lines, down from ~1,930)
wc -l src/ui/components/GameBoard.vue
```

## Must Haves

- [ ] HagnessDrawEquipment component imported and used
- [ ] Event handlers wired correctly (@equipment-type-selected, @recipient-selected)
- [ ] Inline Hagness template removed (46 lines)
- [ ] Hagness styles removed from GameBoard.vue (~190 lines)
- [ ] No TypeScript errors
- [ ] Hagness draw flow works: type selection -> equipment display -> recipient selection
- [ ] Game remains fully playable

## Expected Line Reduction

- Template: -46 lines + 12 lines = -34 lines
- Styles: ~-190 lines
- **Total: ~-224 lines**

GameBoard.vue should go from ~1,930 lines to ~1,706 lines.

## Reference Files

- src/ui/components/HagnessDrawEquipment.vue (created in 34-01)
- src/ui/components/GameBoard.vue (source file)
