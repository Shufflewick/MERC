---
phase: 35
plan: 02
wave: 2
depends_on: [35-01]
files_modified:
  - src/ui/components/GameBoard.vue
autonomous: true
---

# Plan 35-02: Integrate HiringPhase into GameBoard.vue

## Objective

Replace the inline hiring phase template in GameBoard.vue with the new HiringPhase component, removing ~320 lines of template and styles.

## Context

- Component created in 35-01: HiringPhase.vue
- Template to remove: lines 1068-1151 (84 lines)
- Styles to remove: lines 1282-1523 (~240 lines, hiring/merc/sector/skip classes)
- Computed properties and methods stay in GameBoard (use actionController/props)
- Event handlers already exist: selectMercToHire, selectEquipmentType, selectSector, skipThirdHire, openHiringMercDetail, closeHiringMercModal

## Tasks

<task id="1">
Import HiringPhase component in GameBoard.vue script section.

Add to component imports:
```typescript
import HiringPhase from './HiringPhase.vue'
```
</task>

<task id="2">
Replace inline template (lines 1068-1151) with component usage.

Replace the entire `<!-- Hiring phase - show MERCs/Dictators to choose from -->` section with:
```vue
<!-- Hiring Phase Component -->
<HiringPhase
  v-if="isHiringMercs"
  :is-hiring-mercs="isHiringMercs"
  :is-selecting-dictator="isSelectingDictator"
  :is-selecting-equipment-type="isSelectingEquipmentType"
  :is-castro-hiring="isCastroHiring"
  :is-selecting-sector="isSelectingSector"
  :hirable-mercs="hirableMercs"
  :has-skip-option="hasSkipOption"
  :equipment-type-choices="equipmentTypeChoices"
  :sector-choices="sectorChoices"
  :selected-merc-for-equipment="selectedMercForEquipment"
  :selected-merc-image-path="selectedMercImagePath"
  :selected-merc-name="selectedMercName"
  :selected-merc-id="selectedMercId"
  :show-hiring-merc-modal="showHiringMercModal"
  :prompt="currentSelection?.prompt || state?.flowState?.prompt || 'Select your MERCs'"
  :player-color="currentPlayerColor"
  @select-merc="selectMercToHire"
  @select-equipment-type="selectEquipmentType"
  @select-sector="selectSector"
  @skip-hire="skipThirdHire"
  @open-detail-modal="openHiringMercDetail"
  @close-detail-modal="closeHiringMercModal"
/>
```

This replaces 84 lines with 22 lines.
</task>

<task id="3">
Remove hiring-specific CSS styles (lines 1282-1523):
- .hiring-phase and all nested selectors
- .hiring-header, .hiring-icon, .hiring-content, .hiring-title, .hiring-prompt
- .selected-mercs, .selected-label, .selected-merc-badge (if only used by hiring)
- .merc-choices-container, .merc-choices, .merc-choice
- .sector-selection, .sector-row, .sector-card-choices
- .sector-prompt, .sector-choices, .sector-choice-btn (if only used by hiring)
- .skip-hire-section, .skip-hire-button, .skip-hint
- .hiring-merc-modal

Keep styles that may be used elsewhere:
- .equipment-type-choices, .equipment-type-button (shared with DrawEquipmentType context)
- .use-action-panel, .action-panel-hint (may be used elsewhere)
</task>

<task id="4">
Verify TypeScript compiles:
```bash
cd /Users/jtsmith/Dropbox/MERC/BoardSmith/MERC && npx vue-tsc --noEmit 2>&1 | head -50
```
</task>

<task id="5">
Verify game runs and all hiring flows work:
- Start dev server if not running
- Navigate to game setup
- Test dictator selection (first player picks dictator)
- Test MERC hiring (first/second/third hire)
- Test equipment type selection after MERC hire
- Test skip third hire option (with Teresa)
- Test Castro bonus hire with sector placement
- Test detail modal (click MERC portrait during equipment selection)
- Verify all paths complete without errors
</task>

## Verification

```bash
# TypeScript compiles
npx vue-tsc --noEmit

# Component is imported
grep -n "HiringPhase" src/ui/components/GameBoard.vue

# Old inline template removed (should NOT find "hiring-header" in template section)
grep -n "hiring-header" src/ui/components/GameBoard.vue

# Hiring styles removed
grep -n "\.hiring-phase" src/ui/components/GameBoard.vue

# Count GameBoard.vue lines (should be ~1,380 lines, down from ~1,706)
wc -l src/ui/components/GameBoard.vue
```

## Must Haves

- [ ] HiringPhase component imported and used
- [ ] All 16 props bound correctly
- [ ] All 6 event handlers wired correctly
- [ ] Inline hiring template removed (84 lines)
- [ ] Hiring/merc/sector/skip styles removed (~240 lines)
- [ ] No TypeScript errors
- [ ] Dictator selection flow works
- [ ] MERC hiring flow works (first/second/third)
- [ ] Equipment type selection works
- [ ] Castro sector placement works
- [ ] Skip third hire works
- [ ] Detail modal opens and closes correctly
- [ ] Game remains fully playable

## Expected Line Reduction

- Template: -84 lines + 22 lines = -62 lines
- Styles: ~-240 lines
- **Total: ~-300 lines**

GameBoard.vue should go from ~1,706 lines to ~1,400 lines.

## Reference Files

- src/ui/components/HiringPhase.vue (created in 35-01)
- src/ui/components/GameBoard.vue (source file)
- src/ui/composables/useActionState.ts (state exports used as props)
