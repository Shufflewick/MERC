---
phase: 35
plan: 01
wave: 1
depends_on: []
files_modified:
  - src/ui/components/HiringPhase.vue (new)
autonomous: true
---

# Plan 35-01: Create HiringPhase.vue Component

## Objective

Create a standalone component that encapsulates the entire hiring phase UI with five conditional sections: dictator selection, MERC selection, equipment type selection, Castro sector selection, and detail modal.

## Context

- Template to extract: GameBoard.vue lines 1068-1151 (84 lines)
- Styles to extract: GameBoard.vue lines 1282-1523 (~240 lines)
- Reuses existing components: CombatantCard, DrawEquipmentType, SectorCardChoice, CombatantIconSmall, DetailModal
- State exposed via props from parent (follows HagnessDrawEquipment pattern)
- Larger component than Hagness due to more flow variations (~250-300 lines)

## Tasks

<task id="1">
Create `src/ui/components/HiringPhase.vue` with script setup:
- Import UI_COLORS from '../colors'
- Import child components: CombatantCard, DrawEquipmentType, SectorCardChoice, CombatantIconSmall, DetailModal
- Import SectorChoice interface from SectorCardChoice.vue

Define props interface:
```typescript
interface Props {
  // Action state flags
  isHiringMercs: boolean;
  isSelectingDictator: boolean;
  isSelectingEquipmentType: boolean;
  isCastroHiring: boolean;
  isSelectingSector: boolean;

  // Available choices
  hirableMercs: any[];
  hasSkipOption: boolean;
  equipmentTypeChoices: Array<{ value: string; label: string }>;
  sectorChoices: SectorChoice[];

  // Selected MERC state (for equipment/sector selection context)
  selectedMercForEquipment: any | null;
  selectedMercImagePath: string;
  selectedMercName: string;
  selectedMercId: string;

  // Modal state
  showHiringMercModal: boolean;

  // Display context
  prompt: string;
  playerColor: string;
}
```

Define type-safe emit:
```typescript
const emit = defineEmits<{
  'select-merc': [merc: any];
  'select-equipment-type': [equipType: string];
  'select-sector': [sector: { value: string; label: string }];
  'skip-hire': [];
  'open-detail-modal': [];
  'close-detail-modal': [];
}>();
```
</task>

<task id="2">
Add helper function to get combatant ID for v-for key (copy from GameBoard.vue logic):
```typescript
let combatantIdCounter = 0;
function getMercId(merc: any): string {
  const id = merc.attributes?.combatantId || merc.combatantId || merc.id || merc.ref;
  if (id) return id;
  const name = merc.attributes?.combatantName || merc.combatantName || '';
  return name ? `temp-${name}` : `temp-combatant-${++combatantIdCounter}`;
}
```

Add event handler wrappers:
```typescript
function handleMercSelect(merc: any) {
  emit('select-merc', merc);
}

function handleEquipmentTypeSelect(value: string) {
  emit('select-equipment-type', value);
}

function handleSectorSelect(sector: { value: string; label: string }) {
  emit('select-sector', sector);
}

function handleSkipHire() {
  emit('skip-hire');
}

function handleOpenDetailModal() {
  if (props.selectedMercForEquipment) {
    emit('open-detail-modal');
  }
}

function handleCloseDetailModal() {
  emit('close-detail-modal');
}
```
</task>

<task id="3">
Add template with header section (from GameBoard.vue lines 1070-1076):
- Main container with class "hiring-phase"
- Header with people emoji icon, title (dynamic: "Choose Your Dictator" vs "Hiring Phase"), and prompt
- Title changes based on isSelectingDictator prop
- Prompt from props.prompt

Template structure:
```vue
<template>
  <div class="hiring-phase">
    <div class="hiring-header">
      <div class="hiring-icon">👥</div>
      <div class="hiring-content">
        <h2 class="hiring-title">{{ isSelectingDictator ? 'Choose Your Dictator' : 'Hiring Phase' }}</h2>
        <p class="hiring-prompt">{{ prompt }}</p>
      </div>
    </div>

    <!-- Content sections follow -->
  </div>
</template>
```
</task>

<task id="4">
Add equipment type selection section (from GameBoard.vue lines 1079-1088):
- Shows when: isSelectingEquipmentType && equipmentTypeChoices.length > 0
- Uses DrawEquipmentType component
- Props: choices, combatantId, combatantName, image, playerColor
- Emits: @select → handleEquipmentTypeSelect, @clickMerc → handleOpenDetailModal

```vue
<!-- Equipment type selection -->
<DrawEquipmentType
  v-if="isSelectingEquipmentType && equipmentTypeChoices.length > 0"
  :choices="equipmentTypeChoices"
  :combatant-id="selectedMercId"
  :combatant-name="selectedMercName"
  :image="selectedMercImagePath"
  :player-color="playerColor"
  @select="handleEquipmentTypeSelect"
  @clickMerc="handleOpenDetailModal"
/>
```
</task>

<task id="5">
Add sector selection section for Castro hire (from GameBoard.vue lines 1091-1113):
- Shows when: isSelectingSector && sectorChoices.length > 0 (v-else-if after equipment type)
- Container with class "sector-selection"
- Row with MERC portrait (CombatantIconSmall) + sector cards (SectorCardChoice)
- Portrait clickable to open detail modal

```vue
<!-- Sector selection (Castro hire placement) -->
<div v-else-if="isSelectingSector && sectorChoices.length > 0" class="sector-selection">
  <div class="sector-row">
    <!-- MERC portrait (clickable to view details) -->
    <CombatantIconSmall
      v-if="selectedMercImagePath"
      :image="selectedMercImagePath"
      :alt="selectedMercName || 'MERC'"
      :player-color="playerColor"
      :size="80"
      clickable
      @click="handleOpenDetailModal"
    />
    <!-- Sector cards -->
    <div class="sector-card-choices">
      <SectorCardChoice
        v-for="sector in sectorChoices"
        :key="sector.value"
        :sector="sector"
        @click="handleSectorSelect(sector)"
      />
    </div>
  </div>
</div>
```
</task>

<task id="6">
Add MERC selection section (from GameBoard.vue lines 1116-1135):
- Shows when: hirableMercs.length > 0 || hasSkipOption (v-else-if after sector selection)
- Container with class "merc-choices-container"
- MERC grid with CombatantCard components
- Skip button section (only if hasSkipOption)

```vue
<!-- MERC/Dictator selection -->
<div class="merc-choices-container" v-else-if="hirableMercs.length > 0 || hasSkipOption">
  <div class="merc-choices">
    <div
      v-for="merc in hirableMercs"
      :key="getMercId(merc)"
      class="merc-choice"
      @click="handleMercSelect(merc)"
    >
      <CombatantCard :merc="merc" :player-color="playerColor" />
    </div>
  </div>

  <!-- Skip button for third hire (optional) -->
  <div v-if="hasSkipOption" class="skip-hire-section">
    <button class="skip-hire-button" @click="handleSkipHire">
      Skip Third Hire
    </button>
    <p class="skip-hint">You can hire a third MERC thanks to Teresa, or skip</p>
  </div>
</div>
```
</task>

<task id="7">
Add loading state and detail modal (from GameBoard.vue lines 1137-1150):
- Loading state: v-else shows "Loading MERCs..."
- Detail modal: DetailModal with showHiringMercModal and CombatantCard

```vue
<!-- Loading state -->
<div v-else class="use-action-panel">
  <p class="action-panel-hint">Loading MERCs...</p>
</div>

<!-- MERC Detail Modal -->
<DetailModal :show="showHiringMercModal" @close="handleCloseDetailModal">
  <div class="hiring-merc-modal">
    <CombatantCard
      v-if="selectedMercForEquipment"
      :merc="selectedMercForEquipment"
      :player-color="playerColor"
    />
  </div>
</DetailModal>
```
</task>

<task id="8">
Add scoped styles from GameBoard.vue (lines 1282-1523):
- .hiring-phase container with accent border
- .hiring-header, .hiring-icon, .hiring-content, .hiring-title, .hiring-prompt
- .merc-choices-container, .merc-choices, .merc-choice (with hover effects)
- .sector-selection, .sector-row, .sector-card-choices
- .skip-hire-section, .skip-hire-button, .skip-hint
- .use-action-panel, .action-panel-hint
- .hiring-merc-modal
- Use UI_COLORS v-bind for theme consistency
</task>

<task id="9">
Verify TypeScript compiles:
```bash
cd /Users/jtsmith/Dropbox/MERC/BoardSmith/MERC && npx vue-tsc --noEmit 2>&1 | head -50
```
</task>

## Verification

```bash
# File exists with correct structure
ls -la src/ui/components/HiringPhase.vue

# TypeScript compiles
npx vue-tsc --noEmit

# Component has expected sections
grep -n "hiring-phase\|DrawEquipmentType\|SectorCardChoice\|CombatantCard\|DetailModal" src/ui/components/HiringPhase.vue
```

## Must Haves

- [ ] Component receives all state as props (not calling composables directly)
- [ ] Six events emitted: select-merc, select-equipment-type, select-sector, skip-hire, open-detail-modal, close-detail-modal
- [ ] Reuses DrawEquipmentType, CombatantCard, SectorCardChoice, CombatantIconSmall, DetailModal components
- [ ] Five conditional sections: equipment type, sector selection, MERC selection, loading, detail modal
- [ ] Dynamic title: "Choose Your Dictator" vs "Hiring Phase"
- [ ] Skip option section with button and hint text
- [ ] MERC portrait clickable to open detail modal (in equipment type and sector selection phases)
- [ ] Accent color (#d4a84b) for hiring theme
- [ ] TypeScript compiles without new errors

## Reference Files

- src/ui/components/GameBoard.vue (lines 1068-1151 template, lines 1282-1523 styles)
- src/ui/components/HagnessDrawEquipment.vue (Phase 34 pattern reference)
- src/ui/components/DrawEquipmentType.vue (reused component interface)
- src/ui/components/SectorCardChoice.vue (reused component interface, SectorChoice type)
- src/ui/components/CombatantIconSmall.vue (reused component interface)
- src/ui/components/DetailModal.vue (reused component interface)
- src/ui/composables/useActionState.ts (state exports reference)
