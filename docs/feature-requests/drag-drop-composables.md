# Feature Request: Drag-and-Drop Composables for Custom Components

## Summary

Expose BoardSmith's internal drag-and-drop utilities as composables so custom game components can implement drag-drop interactions without reimplementing the wiring manually.

## Problem

MERC's `AssignToSquadPanel.vue` currently uses a two-step click workflow:
1. Click a combatant to select it
2. Click a target squad to complete the assignment

This works, but drag-and-drop would be more intuitive for this type of "move item from A to B" interaction.

BoardSmith already has excellent drag-drop infrastructure inside `AutoElement.vue`:
- `handleDragStart`/`handleDragEnd` handlers
- `handleDragOver`/`handleDrop` handlers
- `is-draggable`, `is-dragging`, `is-drop-target` CSS classes
- Pulse animations for valid drop targets

And `useBoardInteraction()` exposes the state:
- `startDrag(element)`, `endDrag()`
- `setDropTargets(targets, onDrop)`, `triggerDrop(target)`
- `isDragging`, `draggedElement`, `dropTargets`
- `isDropTarget()`, `isDraggedElement()`

**The gap:** This infrastructure is internal to `AutoElement.vue`. Custom components can access `useBoardInteraction()` but must manually:

1. Set up HTML5 drag event listeners (`dragstart`, `dragend`, `dragover`, `drop`)
2. Decide when to call `startDrag`/`endDrag`
3. Convert action controller selections to `ElementRef` format
4. Call `setDropTargets` with properly formatted `ValidElement[]`
5. Handle the drop callback to call `actionController.fill()`
6. Apply CSS classes manually based on state

## Proposed Solution

### New Composables

#### `useDraggable(elementRef, options)`

Creates a draggable element that integrates with BoardSmith's drag-drop system.

```typescript
interface UseDraggableOptions {
  /** Only allow drag when this returns true */
  canDrag?: () => boolean;
  /** Called when drag starts */
  onDragStart?: () => void;
  /** Called when drag ends (regardless of success) */
  onDragEnd?: () => void;
}

interface UseDraggableReturn {
  /** Bind to element: v-bind="dragProps" */
  dragProps: {
    draggable: boolean;
    onDragstart: (e: DragEvent) => void;
    onDragend: (e: DragEvent) => void;
  };
  /** True while this element is being dragged */
  isDragging: ComputedRef<boolean>;
  /** CSS classes to apply */
  dragClasses: ComputedRef<{
    'is-draggable': boolean;
    'is-dragging': boolean;
  }>;
}

function useDraggable(
  elementRef: ElementRef | (() => ElementRef),
  options?: UseDraggableOptions
): UseDraggableReturn;
```

**Usage:**

```vue
<script setup>
const { dragProps, dragClasses } = useDraggable(
  () => ({ name: combatant.name }),
  { canDrag: () => isSelectingCombatant.value }
);
</script>

<template>
  <div v-bind="dragProps" :class="dragClasses">
    {{ combatant.name }}
  </div>
</template>
```

#### `useDropZone(elementRef, options)`

Creates a drop zone that receives dragged elements.

```typescript
interface UseDropZoneOptions {
  /** Return true if this zone accepts the currently dragged element */
  canDrop?: (draggedElement: ElementRef) => boolean;
  /** Called when a valid element is dropped */
  onDrop: (draggedElement: ElementRef) => void;
}

interface UseDropZoneReturn {
  /** Bind to element: v-bind="dropProps" */
  dropProps: {
    onDragover: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
  };
  /** True when a dragged element is over this zone and can be dropped */
  isOver: ComputedRef<boolean>;
  /** True when this zone is a valid target for the current drag */
  isValidTarget: ComputedRef<boolean>;
  /** CSS classes to apply */
  dropClasses: ComputedRef<{
    'is-drop-target': boolean;
    'is-drop-hover': boolean;
  }>;
}

function useDropZone(
  elementRef: ElementRef | (() => ElementRef),
  options: UseDropZoneOptions
): UseDropZoneReturn;
```

**Usage:**

```vue
<script setup>
const { dropProps, dropClasses } = useDropZone(
  () => ({ name: squad.squadId }),
  {
    canDrop: (dragged) => isValidTargetSquad(squad, dragged),
    onDrop: (dragged) => handleTransfer(dragged, squad)
  }
);
</script>

<template>
  <div v-bind="dropProps" :class="dropClasses">
    {{ squad.name }}
  </div>
</template>
```

#### `useDragDropAction(actionController, options)`

Higher-level composable that integrates drag-drop with the action controller.

```typescript
interface UseDragDropActionOptions {
  /** Which selection step is the "source" (draggable) */
  sourceSelection: string;
  /** Which selection step is the "target" (drop zone) */
  targetSelection: string;
  /** Extract element ref from a choice value */
  choiceToRef?: (choice: unknown) => ElementRef;
}

interface UseDragDropActionReturn {
  /** Create draggable props for a source element */
  makeDraggable: (choice: unknown) => UseDraggableReturn;
  /** Create drop zone props for a target element */
  makeDropZone: (choice: unknown) => UseDropZoneReturn;
  /** Current drag state */
  isDragging: ComputedRef<boolean>;
  /** The element being dragged */
  draggedElement: ComputedRef<ElementRef | null>;
}

function useDragDropAction(
  actionController: UseActionControllerReturn,
  options: UseDragDropActionOptions
): UseDragDropActionReturn;
```

**Usage (full AssignToSquadPanel example):**

```vue
<script setup>
const { makeDraggable, makeDropZone, isDragging } = useDragDropAction(
  props.actionController,
  {
    sourceSelection: 'combatantName',
    targetSelection: 'targetSquad',
    choiceToRef: (choice) => ({ name: String(choice) })
  }
);

// For each combatant
const combatantDrag = computed(() =>
  makeDraggable(getCombatantName(merc))
);

// For each squad
const squadDrop = computed(() =>
  makeDropZone(getSquadLabel(squad))
);
</script>

<template>
  <div class="squads-container">
    <div
      v-for="squad in squads"
      v-bind="makeDropZone(squad.label).dropProps"
      :class="makeDropZone(squad.label).dropClasses"
    >
      <div
        v-for="merc in squad.mercs"
        v-bind="makeDraggable(merc.name).dragProps"
        :class="makeDraggable(merc.name).dragClasses"
      >
        {{ merc.name }}
      </div>
    </div>
  </div>
</template>
```

### CSS Exports

Export the drag-drop CSS classes from `@boardsmith/ui` so custom components get consistent styling:

```typescript
// @boardsmith/ui exports
export { dragDropStyles } from './styles/drag-drop.css';
```

Or provide a `<DragDropStyles>` component that injects the necessary CSS.

## Benefits

1. **Consistency** - Custom components use the same drag-drop behavior as AutoElement
2. **Less Boilerplate** - No manual HTML5 drag event wiring
3. **Action Integration** - `useDragDropAction` handles the fill/selection dance automatically
4. **Accessible** - Single source of truth for drag-drop accessibility features
5. **Testable** - Composables can be unit tested independently

## Migration Path

This is purely additive. Existing games using click-based selection continue to work. Games that want drag-drop can adopt incrementally.

## Related Files

- `packages/ui/src/composables/useBoardInteraction.ts` - Existing state management
- `packages/ui/src/components/auto-ui/AutoElement.vue` - Existing implementation to extract from
- MERC's `src/ui/components/AssignToSquadPanel.vue` - Example consumer

## Priority

Medium - The two-step click workflow works fine, but drag-drop is more intuitive for spatial reorganization tasks. This would also benefit future games with similar "move from A to B" interactions.
