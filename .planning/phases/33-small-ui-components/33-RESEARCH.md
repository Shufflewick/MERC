# Phase 33 Research: Small UI Components

## Overview

Phase 33 extracts two simple, self-contained UI components:
- **UI-03:** LandingZoneSelection — sector picker for landing phase
- **UI-04:** GameOverOverlay — victory/defeat display component

## 1. GameOverOverlay — Current Implementation

### Template (GameBoard.vue lines 989-1002)

```html
<div v-if="isGameOver" class="game-over-overlay">
  <div class="game-over-content">
    <h1 class="game-over-title">Game Over</h1>
    <div v-if="gameWinner === 'rebels'" class="game-over-winner rebels">
      <h2>Rebels Victory!</h2>
      <p>The dictator has been eliminated. Freedom prevails!</p>
    </div>
    <div v-else class="game-over-winner dictator">
      <h2>Dictator Victory!</h2>
      <p>The rebellion has been crushed. Order is restored.</p>
    </div>
  </div>
</div>
```

### Styling (Lines 1927-1996)

- Fixed positioning overlay with dark background
- Animated fadeIn and slideUp transitions
- Victory/defeat conditional rendering (green for rebels, red for dictator)

### Logic Dependencies

- `isGameOver` — computed from `useVictoryCalculations`
- `gameWinner` — computed from `useVictoryCalculations` (returns `'rebels' | 'dictator' | null`)

### Key Observation

Pure display component with **no user interaction or event handling needed**.

---

## 2. LandingZoneSelection — Current Implementation

### Template Locations

- **Lines 1204-1207, 1222-1233:** Display prompt in map section
- **Line handling:** `handleSectorClick()` when `isPlacingLanding.value` is true

### Current Landing Zone Flow

1. **Detection Flag:** `isPlacingLanding` from useActionState
2. **Display Prompt:** Shown in map section headers
3. **User Interaction:** Handled via `handleSectorClick()`
4. **Clickable Sectors:** `clickableSectors` computed ref (lines 926-983)

### Click Handler (lines 812-849)

```typescript
// Get selection metadata
const metadata = landingZoneMetadata.value;
const selection = metadata?.selections?.[0];

// Find sector by sectorId
const sector = sectors.value.find(s => s.sectorId === sectorId);

// Handle two selection types: 'element' vs choice-based
// Execute 'placeLanding' action with appropriate value format
```

### Current Visual Elements

- No dedicated component; displayed via map section title/subtitle
- Edge sectors highlighted as clickable (calculated in `landingSectors`)
- MapGrid component shows clickable sectors visually

### Styling (Lines 1773-1782)

- Action title (accent color, 1.3rem font)
- Action subtitle (muted color)

### Key Logic Components

- `landingZoneMetadata` — extracted from action metadata in useActionState
- `isPlacingLanding` — flag indicating landing phase is active
- `clickableSectors` — computed list of valid landing zones (edge sectors)
- `landingSectors` — edge sectors calculation (lines 674-682)

---

## 3. State Composables Needed

### For GameOverOverlay

```typescript
useVictoryCalculations(() => gameView)
// Provides:
// - isGameOver: ComputedRef<boolean>
// - gameWinner: ComputedRef<'rebels' | 'dictator' | null>
```

### For LandingZoneSelection

```typescript
useSectorState({ ... })
// Provides: sectors

useActionState({ ... })
// Provides: isPlacingLanding, landingZoneMetadata
```

Plus: Edge sector calculation (pure math, no state needed)

---

## 4. Component Structure

### GameOverOverlay.vue

**Props:** None — uses composable-based state via provide/inject pattern

**Composable Usage:**
```typescript
const { isGameOver, gameWinner } = useVictoryCalculations(gameViewGetter);
```

**Events:** None — display-only component

**Styling:** Relocate `.game-over-*` styles from GameBoard.vue

### LandingZoneSelection.vue

**Props:**
- `sectors: Sector[]` — all map sectors
- `clickableSectors: string[]` — valid landing sector IDs
- Or receive via provide/inject

**Events:**
- `@sector-selected` — when player clicks a landing zone

**Alternative Pattern:** Component could emit to parent, which handles action execution

---

## 5. Similar Component Patterns

### SectorCardChoice.vue — Reference for LandingZoneSelection

- Takes sector data as prop
- Displays image with overlay + name
- Shows stats (value points, loot, militia)
- Emits click events

### DetailModal.vue — Reference for GameOverOverlay

- Teleport to body
- Transition animations
- Close button
- Backdrop click handling

---

## 6. Integration Points

### Current Integration

- GameOverOverlay: Direct inline template
- LandingZoneSelection: Spread across landing-specific handler + map display

### After Extraction

- GameOverOverlay.vue: Display-only, no props needed
- LandingZoneSelection.vue: Receives data via provide/inject or minimal props
- Keep `handleSectorClick()` in GameBoard but delegate landing display to component

### Removed from GameBoard

- Game over overlay template and styles
- Landing zone prompt display logic
- ~50-100 lines estimated removal

---

## 7. Validation Checklist

### For GameOverOverlay.vue

- [x] v-if shows only when game is over
- [x] Victory/defeat messaging based on gameWinner
- [x] Fixed positioning overlay works correctly
- [x] Animations play smoothly
- [x] Doesn't interfere with other UI

### For LandingZoneSelection.vue

- [x] Shows only when isPlacingLanding is true
- [x] Displays only valid landing sectors (edge sectors)
- [x] Clicking sector triggers parent action handler
- [x] Visual feedback on hover/selection
- [x] Integrates with existing patterns

---

## 8. Architectural Decision

**Recommended Pattern:** Use provide/inject for gameView getter rather than passing props for state composables. This matches the existing Phase 32 pattern and keeps components decoupled.

**For LandingZoneSelection:** The component handles display; action execution stays in GameBoard (same pattern as other action handlers).

---

*Research completed: 2026-01-18*
