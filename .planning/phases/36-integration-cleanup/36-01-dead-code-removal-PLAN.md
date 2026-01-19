---
wave: 1
depends_on: []
files_modified:
  - src/ui/components/GameBoard.vue
autonomous: true
---

# Plan: 36-01 Dead Code Removal & Import Organization

## Goal

Remove unused imports and functions from GameBoard.vue, reorganize imports into logical groups.

## Tasks

<task id="1">
<title>Remove unused Vue import</title>
<action>
Remove `reactive` from the Vue imports on line 2. The import should change from:
```typescript
import { computed, ref, watch, inject, reactive, nextTick, toRef } from 'vue';
```
to:
```typescript
import { computed, ref, watch, inject, nextTick, toRef } from 'vue';
```
Note: Keep `inject` (used for fetchDeferredChoicesFn) and `nextTick` (used in handlers).
</action>
<verify>Grep for `reactive` in GameBoard.vue - should not appear anywhere after removal</verify>
</task>

<task id="2">
<title>Remove unused component imports</title>
<action>
Remove these unused component imports (they were needed before extraction but are now only used by child components):
- Line 6: `import CombatantCard from './CombatantCard.vue'`
- Line 7: `import EquipmentCard from './EquipmentCard.vue'`
- Line 12: `import DrawEquipmentType from './DrawEquipmentType.vue'`
- Line 14: `import CombatantIcon from './CombatantIcon.vue'`
- Line 15: `import CombatantIconSmall from './CombatantIconSmall.vue'`
- Line 16: `import SectorCardChoice from './SectorCardChoice.vue'`

Verify each is not used in template before removing.
</action>
<verify>Search template section for each component name - none should appear</verify>
</task>

<task id="3">
<title>Remove unused utility import</title>
<action>
Remove `getPlayerColor` from the colors utility import on line 21:
```typescript
import { UI_COLORS, getPlayerColor } from '../colors';
```
Change to:
```typescript
import { UI_COLORS } from '../colors';
```
Note: Path is `../colors` (one level up from components directory).
</action>
<verify>Grep for `getPlayerColor` in GameBoard.vue - should not appear anywhere</verify>
</task>

<task id="4">
<title>Remove dead functions</title>
<action>
Remove the following dead code block (lines ~690-704):
```typescript
let combatantIdCounter = 0;

function getMercId(merc: CombatantModel): string {
  // ... function body
}

function getMercDisplayName(merc: CombatantModel): string {
  // ... function body
}
```

These functions were used by HiringPhase before extraction. The functionality now lives in HiringPhase.vue.
</action>
<verify>Search for `getMercId` and `getMercDisplayName` calls - none should exist</verify>
</task>

<task id="5">
<title>Reorganize imports by category</title>
<action>
Reorganize all imports into logical groups with blank lines between:

```typescript
// 1. Vue core
import { computed, ref, watch, inject, nextTick, toRef } from 'vue';

// 2. External packages
import { useBoardInteraction, type UseActionControllerReturn } from '@boardsmith/ui';

// 3. Components (alphabetical)
import AssignToSquadPanel from './AssignToSquadPanel.vue';
import CombatPanel from './CombatPanel.vue';
import DetailModal from './DetailModal.vue';
import DictatorPanel from './DictatorPanel.vue';
import GameOverOverlay from './GameOverOverlay.vue';
import HagnessDrawEquipment from './HagnessDrawEquipment.vue';
import HiringPhase from './HiringPhase.vue';
import LandingZoneSelection from './LandingZoneSelection.vue';
import MapGrid from './MapGrid.vue';
import SectorPanel from './SectorPanel.vue';
import SquadPanel from './SquadPanel.vue';

// 4. Composables (alphabetical)
import { useActionState } from '../composables/useActionState';
import { useGameViewHelpers } from '../composables/useGameViewHelpers';
import { usePlayerState } from '../composables/usePlayerState';
import { useSectorState } from '../composables/useSectorState';
import { useSquadState } from '../composables/useSquadState';
import { useVictoryCalculations } from '../composables/useVictoryCalculations';

// 5. Utilities
import { UI_COLORS } from '../colors';
```

Note: DetailModal is a local component (not from @boardsmith/ui). Colors path is `../colors`.
</action>
<verify>Imports are grouped logically with clear separation</verify>
</task>

## Verification

- [ ] `reactive` removed from Vue imports
- [ ] 6 unused component imports removed
- [ ] `getPlayerColor` removed from colors import
- [ ] `combatantIdCounter`, `getMercId`, `getMercDisplayName` removed
- [ ] Imports organized into logical groups
- [ ] `npm run build` succeeds with no errors
- [ ] Line count reduced by ~15 lines

## must_haves

- No unused imports remain in GameBoard.vue
- No dead functions remain in GameBoard.vue
- Imports are organized by category (Vue, external, components, composables, utilities, types)
- TypeScript compilation succeeds
