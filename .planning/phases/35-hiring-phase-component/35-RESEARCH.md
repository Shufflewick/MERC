# Research: Phase 35 Hiring Phase Component

**Date:** 2026-01-18
**Phase:** 35 - Hiring Phase Component
**Requirement:** UI-01: HiringPhase

## Current Implementation Location

**GameBoard.vue (lines 1068-1151):**
- Hiring phase UI occupies 84 lines of template code
- Located within the main game board component
- Currently shows:
  - Header with icon, title, and prompt (lines 1070-1076)
  - Equipment type selection UI (lines 1079-1088)
  - Sector selection for Castro hire (lines 1091-1113)
  - MERC selection with cards (lines 1116-1135)
  - Skip third hire button (lines 1129-1134)
  - Detail modal for MERC viewing (lines 1142-1150)

**Supporting computed properties in GameBoard.vue:**
- `hirableMercs` (lines 554-638): Filters available MERCs for hiring, handles dictator selection
- `hasSkipOption` (lines 641-653): Checks if skip option available for third hire
- `landingSectors` (lines 677-685): Edge sectors for landing zone validation

**Supporting state in useActionState composable:**
- `isHiringMercs` (lines 236-249): Computed flag for any hiring action active
- `isSelectingDictator` (lines 252-256): Checks if selecting human dictator
- `isSelectingEquipmentType` (lines 281-284): Checks if in equipment type selection phase
- `isCastroHiring` (lines 287-289): Checks if in Castro bonus hire flow
- `isSelectingSector` (lines 292-295): Checks if selecting sector for Castro placement
- `selectedMercForEquipment` (lines 439-453): MERC being hired (for portrait display)
- `selectedMercImagePath` (lines 456-460): Image path for selected MERC
- `selectedMercName` (lines 463-467): Name for selected MERC
- `selectedMercId` (lines 470-474): ID for selected MERC
- `equipmentTypeChoices` (lines 400-413): Equipment type options
- `sectorChoices` (lines 366-390): Castro hire placement options
- `showHiringMercModal` (lines 142): Ref for detail modal visibility

## Hiring Flow Overview

**From MERC rules (game.ts, combat.ts, flow.ts):**
The hiring phase supports:
1. **Day 1 Rebel Hiring:** `selectDictator` → `hireFirstMerc` → `hireSecondMerc` → `hireThirdMerc` (optional with Teresa)
2. **Day 1 Dictator Hiring:** `dictatorHireFirstMerc`
3. **Castro Bonus Hire:** `castroBonusHire` (can happen during daily turns)
4. **Equipment Selection:** After each merc hire, optionally select equipment type
5. **Sector Placement (Castro only):** After hiring, place Castro in a sector

## Step-by-Step UI Flow

### Step 1: Dictator Selection (lines 1073-1075)
**When:** First action on Day 1 for human rebel player
- Shows prompt from flow state
- Displays available dictators as CombatantCard components
- Dictators fetched from gameView.attributes.settings.combatantData with `cardType === 'dictator'`
- Data structure mapping in hirableMercs computed (lines 583-615):
  - Converts combatant data to CombatantModel-compatible format
  - Maps `name` → `combatantName`
  - Maps `id` → `combatantId`
  - Maps `image`, `initiative`, `combat`, `training`, `ability`, `bio`

### Step 2: MERC Selection (lines 1116-1125)
**When:** First/second/third MERC hire actions available
- Shows hirable MERCs as CombatantCard components
- Filters based on current selection via actionController.getChoices()
- Filters out already-selected MERCs from actionArgs
- Calls `selectMercToHire(merc)` on click
- Flow:
  - Extract choice value from merc._choiceValue (attached during lookup)
  - Check if action already active via actionController.currentAction
  - Either start action with initial args or fill selection
  - actionController handles auto-execute when all selections complete

### Step 3: Equipment Type Selection (lines 1079-1088)
**When:** After merc hire, during equipment selection phase
- Reuses DrawEquipmentType component (also used by Hagness)
- Shows 3 buttons: Weapon, Armor, Accessory
- MERC portrait + name displayed for context
- Calls `selectEquipmentType(equipType: string)`
- Updates actionArgs['equipmentType']

### Step 4: Castro Sector Placement (lines 1091-1113)
**When:** After Castro hire, before equipment selection
- Shows sector choices as SectorCardChoice visual cards
- MERC portrait on left, sector cards on right
- Each sector shows:
  - Name, image, type
  - Victory points
  - Equipment loot breakdown (weapon/armor/accessory icons)
  - Dictator militia presence
- Calls `selectSector(sector)` with {value, label}
- Fills 'targetSector' selection

### Step 5: Skip Third Hire Option (lines 1129-1134)
**When:** Third hire action available (Teresa bonus)
- Shows "Skip Third Hire" button alongside MERC choices
- Only appears if skip option in choices
- Calls `skipThirdHire()`:
  - Finds choice with display containing "skip" (case-insensitive)
  - Calls selectMercToHire with skip choice value
- Shows hint text explaining the option

### Step 6: Detail Modal (lines 1142-1150)
**When:** User clicks MERC card or portrait
- Opens DetailModal overlay (Teleport to body, z-index 1000)
- Shows full CombatantCard with all stats
- Backdrop click or close button dismisses
- showHiringMercModal ref controls visibility
- Called by:
  - openHiringMercDetail() when selectedMercForEquipment exists
  - onClick handlers on CombatantIcon and MERC cards

## Methods to Extract

### selectMercToHire(merc: any) (lines 706-736)
- Gets current selection from currentSelection composable value
- Returns early if no selection or no choice value
- Determines action name via getCurrentActionName()
- Checks if action already active via actionController.currentAction
- If not active: calls actionController.start(actionName, { [selection.name]: choiceValue })
- If active: calls actionController.fill(selection.name, choiceValue)
- Critical: Must NOT call start() if action already active (prevents reset)

### selectEquipmentType(equipType: string) (lines 739-745)
- Gets current selection from currentSelection composable value
- Calls actionController.fill(selection.name, equipType)
- actionController handles auto-execute when ready
- Reused by Hagness draw as well

### selectSector(sector: {value: string; label: string}) (lines 784-788)
- Gets current selection from currentSelection composable value
- Fills selection with sector.value
- For Castro hire, selection.name === 'targetSector'

### skipThirdHire() (lines 656-674)
- Gets current selection
- Gets choices from actionController.getChoices(selection)
- Finds choice with display matching "skip" (case-insensitive)
- Calls selectMercToHire({ _choiceValue: skipChoice.value })

### openHiringMercDetail() (lines 791-795)
- Checks if selectedMercForEquipment exists
- Sets showHiringMercModal.value = true

### closeHiringMercModal() (lines 798-800)
- Sets showHiringMercModal.value = false

## Props Component Will Need

```typescript
interface HiringPhaseProps {
  // Action state flags
  isHiringMercs: boolean;
  isSelectingDictator: boolean;
  isSelectingEquipmentType: boolean;
  isCastroHiring: boolean;
  isSelectingSector: boolean;

  // Available choices for current selection
  hirableMercs: any[]; // MERCs or Dictators
  hasSkipOption: boolean;
  equipmentTypeChoices: Array<{ value: string; label: string }>;
  sectorChoices: SectorChoice[];

  // Current selection state
  selectedMercForEquipment: any; // For portrait during equipment/sector selection
  selectedMercImagePath: string;
  selectedMercName: string;
  selectedMercId: string;

  // Modal state
  showHiringMercModal: boolean;

  // Metadata for display
  currentSelection: any; // For prompt text
  state: any; // For accessing flowState.prompt

  // Context
  playerColor: string;
  currentPlayerColor: string;
}
```

## Events to Emit

```typescript
emit('select-merc', merc: any)
emit('select-equipment-type', equipType: string)
emit('select-sector', sector: { value: string; label: string })
emit('skip-hire')
emit('close-detail-modal')
emit('open-detail-modal')
```

## State Composables to Use

**From useActionState (primary):**
- `isHiringMercs` - determine if in hiring phase
- `isSelectingDictator` - switch to dictator-specific UI
- `isSelectingEquipmentType` - show equipment type selection
- `isCastroHiring` - special handling for Castro flow
- `isSelectingSector` - show sector selection cards
- `selectedMercForEquipment` - MERC being equipped
- `selectedMercImagePath` - portrait for display
- `selectedMercName` - MERC name for display
- `selectedMercId` - MERC ID for display
- `equipmentTypeChoices` - equipment buttons
- `sectorChoices` - sector card options
- `showHiringMercModal` - detail modal visibility
- `currentSelection` - current flow stage
- `findMercByName()` - lookup MERCs in game tree

**From usePlayerState:**
- `currentPlayerColor` - for styling

**Additional state needed:**
- `currentActionMetadata` from useActionState for prompt text
- `state` prop from GameBoard for flowState.prompt fallback

## Dependencies & Props from Parent

**Required from GameBoard.vue:**
```vue
<HiringPhase
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
  :current-selection="currentSelection"
  :state="state"
  :player-color="currentPlayerColor"
  @select-merc="selectMercToHire"
  @select-equipment-type="selectEquipmentType"
  @select-sector="selectSector"
  @skip-hire="skipThirdHire"
  @close-detail-modal="closeHiringMercModal"
/>
```

## Styling to Extract

**CSS Classes (lines 1282-1706 of GameBoard.vue):**
- `.hiring-phase` - Main container with border and padding
- `.hiring-header` - Flex header with icon, title, prompt (lines 1289-1315)
- `.hiring-icon`, `.hiring-content`, `.hiring-title`, `.hiring-prompt`
- `.merc-choices-container` - Flex container for MERC grid and skip button (lines 1341-1347)
- `.merc-choices` - Flex grid of MERC cards (lines 1349-1354)
- `.merc-choice` - Individual MERC card wrapper with hover effects (lines 1356-1365)
- `.sector-selection` - Container for Castro sector placement (lines 1431-1437)
- `.sector-row` - Flex row with MERC portrait + sector cards (lines 1439-1445)
- `.sector-card-choices` - Flex container for sector cards (lines 1486-1492)
- `.skip-hire-section` - Container for skip button and hint (lines 1494-1523)
- `.skip-hire-button` - Button styling
- `.skip-hint` - Hint text styling
- `.use-action-panel` - Loading state (lines 1525-1534)

**Color scheme:**
- Uses UI_COLORS from colors.ts for consistency
- Hiring header: `UI_COLORS.accent` color for title
- MERC card hover: `UI_COLORS.accent` glow effect with translateY
- Skip button: `UI_COLORS.backgroundLight` background, `UI_COLORS.textMuted` border

## Complications & Edge Cases

### 1. MERC vs. Dictator Selection
- **Problem:** hirableMercs computed returns different data for dictator vs. merc selections
- **Lines 583-615:** When isSelectingDictator, maps combatant data to CombatantModel format
- **Solution:** Component receives pre-processed data, displays as CombatantCard
- **Edge case:** Dictator images may not be in game tree, falls back to provided image data

### 2. Choice Value Extraction
- **Problem:** Choices come from ActionController in format `{ value, display }` but sometimes are strings
- **Lines 621-637:** Handles multiple choice formats (string, object with value/display, object without)
- **Lines 698-703:** getMercDisplayName ensures proper capitalization for action
- **Lines 690-696:** getMercId fallback logic for combatant identity
- **Solution:** Component attaches `_choiceValue` to merc object during rendering for later extraction

### 3. Action Lifecycle Management
- **Problem:** actionController auto-starts actions, can cause issues with start() calls
- **Lines 724-735:** Must check if action already active before calling start()
- **Lines 517-529:** Watch on availableActions auto-starts hiring/selection actions
- **Solution:** Check actionController.currentAction before starting; use fill() for already-active actions

### 4. Equipment Type Selection Context
- **Problem:** Equipment selection happens for both hiring and Castro, needs MERC context
- **Lines 1079-1088:** Shows selected MERC portrait during equipment selection
- **Lines 1093-1102:** Shows selected MERC portrait during Castro sector selection
- **Solution:** Component receives selectedMercForEquipment, selectedMercImagePath, selectedMercName

### 5. Dictator Hire Flow Differences
- **Problem:** Dictator hiring doesn't use equipment selection or sector placement
- **Lines 242-248:** isHiringMercs includes dictatorHireFirstMerc action
- **Lines 583-615:** hirableMercs converts dictator data to display format
- **Solution:** Component checks isSelectingDictator and isSelectingEquipmentType to show/hide equipment UI

### 6. Castro Sector Selection Display
- **Problem:** Need to show detailed sector cards with equipment loot and militia info
- **Lines 1091-1113:** Template currently shows sector choices from sectorChoices computed
- **Lines 366-390 in useActionState:** sectorChoices includes full sector data
- **Solution:** Reuse SectorCardChoice component with populated data

### 7. Skip Option Logic
- **Problem:** Skip choice is in same array as MERC choices, needs separate UI
- **Lines 641-653:** hasSkipOption computed finds "skip" in display string
- **Lines 656-674:** skipThirdHire finds and selects skip choice
- **Solution:** Render skip button separately, call selectMercToHire with skip choice value

### 8. Modal Integration
- **Problem:** Detail modal shown when clicking MERC card or portrait
- **Lines 791-800:** Handler functions control showHiringMercModal ref
- **Lines 1142-1150:** Current template shows modal with CombatantCard
- **Solution:** Component receives showHiringMercModal ref and selectedMercForEquipment for modal content

## Consistency with Phase 34 Patterns

**From HagnessDrawEquipment.vue:**
- Uses state composables for derived state (not direct game tree access)
- Emits events for user interactions (handler in parent)
- Type-safe emit syntax with tuple parameter types
- Scoped styles with CSS variables for theming
- Reuses existing sub-components (DrawEquipmentType, CombatantCard, etc.)

**Hiring component should follow:**
- Receive all needed state as props from parent
- Emit events for each user interaction type
- Use type-safe emit syntax
- Keep styles scoped and component-specific
- Reuse CombatantCard, DrawEquipmentType, SectorCardChoice, DetailModal components
- Self-contained UI with clear inputs/outputs
- Conditional rendering for different hiring phases

## File Structure Plan

New component: `src/ui/components/HiringPhase.vue`
- ~200-250 lines (larger than Hagness due to more phases)
- Five main conditional sections: dictator selection, MERC selection, equipment type, sector selection, detail modal
- Reuse existing components: CombatantCard, DrawEquipmentType, SectorCardChoice, DetailModal
- Scoped styling extracted from GameBoard.vue
- Type definitions for props and events

## Integration Points with GameBoard

**Removal from GameBoard:**
1. Remove hiring phase template block (lines 1068-1151)
2. Remove hirableMercs computed (lines 554-638)
3. Remove hasSkipOption computed (lines 641-653)
4. Remove hiring-related methods:
   - selectMercToHire (lines 706-736)
   - selectEquipmentType (lines 739-745)
   - selectSector (lines 784-788)
   - skipThirdHire (lines 656-674)
   - openHiringMercDetail (lines 791-795)
   - closeHiringMercModal (lines 798-800)
5. Remove showHiringMercModal ref (currently in composable)
6. Remove hiring-related CSS classes (lines 1282-1523)

**Modifications to GameBoard:**
1. Update condition hiding other panels during hiring: `!isHiringMercs` → component handles this
2. Add HiringPhase component import
3. Add HiringPhase component in template with all prop bindings
4. Wire event handlers to handler functions (can stay in GameBoard for now)
5. Keep visibility conditions: `v-if="isHiringMercs"` on component itself

## RESEARCH COMPLETE
