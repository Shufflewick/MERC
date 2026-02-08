# Phase 45: GameTable Clean Wiring - Research

**Researched:** 2026-02-08
**Domain:** Vue 3 component wiring cleanup -- removing obsolete combat state management from GameTable.vue
**Confidence:** HIGH

## Summary

Phase 45 cleans up GameTable.vue's combat panel section, which currently contains ~120 lines of script and ~25 lines of template for managing CombatPanel visibility and data flow. The old wiring was a multi-layered fallback system: theatre-view activeCombat, cached combat state, raw animation event tracking, and a pause-until-mount mechanism. Phase 44 made CombatPanel self-contained (renders 100% from animation events), so all of this intermediate state in GameTable is now vestigial.

The core challenge is a chicken-and-egg problem: CombatPanel registers its `combat-panel` event handler in setup scope, but the component must be mounted first. Currently GameTable detects combat via theatre-view `activeCombat` and mounts CombatPanel, then pauses animations until CombatPanel signals ready. The clean solution is to move the combat snapshot reception to GameTable itself: GameTable registers a `combat-panel` handler, stores the snapshot in a ref, and uses snapshot presence as the single mount condition. CombatPanel receives the snapshot as a prop instead of managing it internally. This eliminates the pause/resume dance entirely because the snapshot is already available before CombatPanel mounts.

**Primary recommendation:** Move combat snapshot handling to GameTable. Register the `combat-panel` and `combat-end` animation event handlers in GameTable, store the snapshot in a single ref, mount CombatPanel when the ref is non-null, and pass the snapshot as a prop. Delete all fallback chains, cached state, pause/resume watchers, and event tracking. CombatPanel's internal snapshot handling migrates to reading from the prop.

## Current State (What Must Change)

### GameTable.vue Combat Section -- Lines 484-725 (241 lines of script)

**Refs to DELETE (DELETE-04):**
| Ref/Computed | Line | Purpose | Why Obsolete |
|---|---|---|---|
| `combatPanelReady` | 488 | Tracks if CombatPanel has mounted | Pause/resume no longer needed |
| `rawAnimationEvents` | 493-497 | Computed to access raw animation events from state | Only used for `combatEventSeen` tracking |
| `combatEventSeen` | 499 | Tracks if any combat event has been seen | Replaced by snapshot presence |
| `lastCombatEventId` | 500 | Tracks last combat event ID for dedup | Replaced by snapshot presence |
| `theatreActiveCombat` | 520-525 | Reads activeCombat from theatre view | Replaced by snapshot |
| `activeCombat` (computed) | 527-529 | Wraps theatreActiveCombat | Replaced by snapshot |
| `cachedCombat` | 531 | Caches last non-null activeCombat | Replaced by snapshot |
| `activeCombatForPanel` | 545-549 | Multi-source fallback: activeCombat OR cached OR seen | Replaced by snapshot |
| `hasActiveCombat` | 557-559 | Panel visibility with 3-way OR | Replaced by `combatSnapshot !== null` |
| `combatSectorName` | 629-633 | Looks up sector name from activeCombat.sectorId | Snapshot has sectorName directly |

**Watchers to DELETE:**
| Watcher | Lines | Purpose | Why Obsolete |
|---|---|---|---|
| `watch(rawAnimationEvents)` | 502-512 | Tracks combat events for `combatEventSeen` | Snapshot presence replaces this |
| `watch(activeCombat)` | 533-537 | Updates cachedCombat | No cached combat |
| `watch([activeCombat, hasPendingCombatEvents])` | 539-543 | Clears cachedCombat | No cached combat |
| Pause-on-combat-start | 562-580 | Pauses animation processing when combat starts | Handler-wait in BoardSmith handles timing |
| Unpause-on-ready | 582-595 | Resumes when CombatPanel signals ready | No pause/resume needed |
| `watch([hasPendingCombatEvents, activeCombatForPanel])` | 597-604 | Clears combatEventSeen | No combatEventSeen |

**Functions to DELETE:**
| Function | Line | Why Obsolete |
|---|---|---|
| `handleCombatPanelReady` | 723-725 | No pause/resume mechanism |
| `handleAllocateHit` | 637-640 | No-op function (body is a comment) |
| `handleAllocateWolverineSix` | 643-645 | No-op function (body is a comment) |
| `handleDisplayComplete` | 718-721 | Dead code -- `display-complete` event is never emitted by CombatPanel, `combatDisplayContinue` action only exists in this handler |

**Functions to KEEP:**
| Function | Line | Why Needed |
|---|---|---|
| `handleCombatFinished` | 619-626 | Executes `clearCombatAnimations` action |
| `handleReroll` | 648-650 | Delegates to actionController |
| `handleConfirmAllocation` | 653-658 | Delegates to actionController |
| `handleConfirmTargets` | 662-668 | Delegates to actionController |
| `handleContinueCombat` | 671-674 | Delegates to actionController |
| `handleRetreatCombat` | 678-683 | Delegates to actionController |
| `handleAssignAttackDog` | 686-689 | Delegates to actionController |
| `handleUseMedicalKit` | 692-696 | Delegates to actionController |
| `handleUseSurgeonHeal` | 699-703 | Delegates to actionController |
| `handleUseBeforeAttackHeal` | 706-709 | Delegates to actionController |
| `handleSkipBeforeAttackHeal` | 712-715 | Delegates to actionController |

### GameTable.vue Template -- Lines 1253-1278 (CombatPanel binding)

Current template has 25 lines for CombatPanel with 6 props and 16 event handlers. The target is under 20 lines of template.

**Props to remove from CombatPanel binding:**
- `:active-combat="activeCombatForPanel"` -- replaced by snapshot prop
- `:sector-name="combatSectorName"` -- snapshot has sectorName

**Props to add:**
- `:combat-snapshot="combatSnapshot"` -- the snapshot ref

**Event handlers to remove from binding:**
- `@allocate-hit` -- no-op handler
- `@allocate-wolverine-six` -- handled internally by CombatPanel (doesn't call actionController)
- `@display-complete` -- dead code
- `@panel-ready` -- no pause/resume

### CombatPanel.vue Changes Required

CombatPanel currently manages its own `combatSnapshot` ref and `combat-panel` event handler (Phase 44). For GameTable to drive visibility from the snapshot, the handler must move to GameTable.

**What moves to GameTable:**
- `combat-panel` handler registration (currently CombatPanel line 227-230)
- `combat-end` handler's snapshot clearing and `combat-finished` emit (currently CombatPanel lines 274, 278)

**What stays in CombatPanel:**
- All other animation event handlers (`combat-roll`, `combat-damage`, `combat-death`, `combat-round-start`, `combat-attack-dog`, `combat-heal`)
- `healthOverrides` ref (inter-snapshot health tracking)
- `combat-end` handler's visual animation and state cleanup (but NOT the `combat-finished` emit)
- All snapshot-driven computeds and rendering logic
- The `combatSnapshot` ref, but now set from a prop watch instead of internal handler

**CombatPanel prop changes:**
- Remove `activeCombat` prop (62-line type definition)
- Remove `sectorName` prop
- Add `combatSnapshot` prop (the snapshot data, or null)
- Keep `isMyTurn`, `availableActions`, `isSelectingRetreatSector`, `retreatSectorChoices`

**CombatPanel emit changes:**
- Remove `panel-ready` emit
- Remove `allocate-hit` emit (CombatPanel still emits it but GameTable handler is a no-op)
- Keep `combat-finished` (but now GameTable handles the timing -- see Architecture Patterns)

Wait -- re-examining this. The `combat-end` handler in CombatPanel does visual animation (shows "Combat End" display, waits for timing). The `combat-finished` emit must come AFTER that animation completes. So the `combat-end` handler should stay in CombatPanel, and CombatPanel should still emit `combat-finished`. GameTable's `combat-end` handler would just clear the snapshot.

Actually the cleanest approach: CombatPanel keeps its `combat-end` handler for the visual animation and emits `combat-finished` when done. GameTable handles `combat-finished` by (1) clearing the snapshot and (2) calling `clearCombatAnimations`. No `combat-end` handler in GameTable needed -- CombatPanel is already self-contained for this lifecycle.

## Architecture Patterns

### Pattern 1: GameTable Owns the Snapshot Ref

**What:** GameTable registers a `combat-panel` animation event handler, stores the snapshot in a local ref, and mounts CombatPanel when the ref is non-null. CombatPanel receives the snapshot as a prop.

**Why:** Solves the chicken-and-egg problem without pause/resume. GameTable is always mounted, so the handler is always registered. CombatPanel receives data immediately on mount.

```typescript
// GameTable.vue
const animationEvents = useAnimationEvents();
const combatSnapshot = ref<Record<string, unknown> | null>(null);

if (animationEvents) {
  animationEvents.registerHandler('combat-panel', async (event) => {
    combatSnapshot.value = event.data as Record<string, unknown>;
  });
}

const hasActiveCombat = computed(() => combatSnapshot.value !== null);
```

**Template:**
```html
<CombatPanel
  v-if="hasActiveCombat"
  :combat-snapshot="combatSnapshot"
  :is-my-turn="isMyTurn"
  :available-actions="availableActions"
  :is-selecting-retreat-sector="isSelectingRetreatSector"
  :retreat-sector-choices="retreatSectorChoices"
  @reroll="handleReroll"
  @confirm-allocation="handleConfirmAllocation"
  @confirm-targets="handleConfirmTargets"
  @continue-combat="handleContinueCombat"
  @retreat-combat="handleRetreatCombat"
  @assign-attack-dog="handleAssignAttackDog"
  @combat-finished="handleCombatFinished"
  @use-medical-kit="handleUseMedicalKit"
  @use-surgeon-heal="handleUseSurgeonHeal"
  @use-before-attack-heal="handleUseBeforeAttackHeal"
  @skip-before-attack-heal="handleSkipBeforeAttackHeal"
/>
```

### Pattern 2: CombatPanel Reads Snapshot from Prop

**What:** CombatPanel's `combatSnapshot` ref is replaced by a prop. All existing snapshot-driven computeds (`livingRebels`, `livingDictator`, `snapshotTargetSelection`, etc.) continue to work -- they just read from the prop instead of a local ref.

```typescript
// CombatPanel.vue
const props = defineProps<{
  combatSnapshot: Record<string, unknown> | null;
  isMyTurn: boolean;
  availableActions: string[];
  isSelectingRetreatSector?: boolean;
  retreatSectorChoices?: RetreatSector[];
}>();

// Existing computeds continue to work -- just change the source
const displayCombat = computed(() => props.combatSnapshot);
const sectorName = computed(() => (props.combatSnapshot?.sectorName as string) ?? 'Unknown');

const livingRebels = computed(() => {
  const snapshot = props.combatSnapshot;
  if (!snapshot) return [];
  // ... same logic as today
});
```

### Pattern 3: combat-finished Clears Snapshot in GameTable

**What:** When CombatPanel emits `combat-finished` (after `combat-end` animation completes), GameTable's handler clears the snapshot AND calls `clearCombatAnimations`.

```typescript
// GameTable.vue
async function handleCombatFinished() {
  combatSnapshot.value = null;
  try {
    await props.actionController.execute('clearCombatAnimations', {});
  } catch {
    // Action may fail if game already cleared activeCombat
  }
}
```

### Pattern 4: healthOverrides Cleared on New Snapshot

**What:** CombatPanel clears its `healthOverrides` map when it receives a new snapshot via the prop. This replaces the current behavior where the `combat-panel` handler clears overrides.

```typescript
// CombatPanel.vue
watch(() => props.combatSnapshot, (newSnapshot, oldSnapshot) => {
  if (newSnapshot && newSnapshot !== oldSnapshot) {
    healthOverrides.value.clear();
  }
  if (newSnapshot && !oldSnapshot) {
    // New combat starting -- reset all UI state
    resetAnimations();
    healingCombatants.value.clear();
  }
});
```

### Anti-Patterns to Avoid

- **Keeping any cached/fallback combat state:** The snapshot ref is the single source of truth. No caching, no fallback chains.
- **Re-introducing pause/resume:** BoardSmith's handler-wait mechanism (3s timeout) handles lazy handler registration. The `combat-panel` handler in GameTable is always registered, so this is not even needed.
- **Using theatre-view activeCombat for anything:** The whole point is to remove all theatre-view combat reading from GameTable.
- **CombatPanel registering combat-panel handler internally:** If CombatPanel handles its own snapshot, we're back to the chicken-and-egg problem requiring pause/resume.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Combat panel mounting | Pause/resume mechanism, multiple watchers | Snapshot ref in always-mounted parent | Parent handler always registered, no race condition |
| Combat state caching | `cachedCombat` ref + watchers | Single snapshot ref | Snapshot is authoritative, no need to cache theatre-view state |
| Combat event detection | `rawAnimationEvents` + `combatEventSeen` + ID tracking | `combatSnapshot !== null` | Snapshot presence IS the signal |
| Sector name for combat | Lookup from `activeCombat.sectorId` through sectors array | `combatSnapshot.sectorName` | Snapshot already has the name |

## Common Pitfalls

### Pitfall 1: combat-end Handler Must Stay in CombatPanel
**What goes wrong:** Moving `combat-end` handler to GameTable means the combat end animation (1.5s display) doesn't play -- GameTable immediately clears the snapshot.
**Why it happens:** Temptation to handle all lifecycle in GameTable.
**How to avoid:** CombatPanel keeps its `combat-end` handler for visual animation. It emits `combat-finished` after the animation completes. GameTable clears the snapshot in the `combat-finished` event handler.
**Warning signs:** Combat panel disappears instantly at combat end instead of showing the result.

### Pitfall 2: healthOverrides Must Clear on Snapshot Update
**What goes wrong:** Health values show stale data from the previous decision cycle's damage events.
**Why it happens:** Currently the `combat-panel` handler in CombatPanel clears healthOverrides. If the handler moves to GameTable, the clearing must happen elsewhere.
**How to avoid:** Use a watcher on the snapshot prop in CombatPanel that clears healthOverrides when the snapshot object changes.
**Warning signs:** Health bars show wrong values after a decision point.

### Pitfall 3: hasActiveCombat Still Used by DictatorPanel and SectorPanel
**What goes wrong:** DictatorPanel and SectorPanel stop being hidden during combat.
**Why it happens:** Both panels use `!hasActiveCombat` in their v-if conditions (lines 1284, 1296).
**How to avoid:** Keep `hasActiveCombat` as a computed that checks `combatSnapshot !== null`. Both other panels continue to reference it.
**Warning signs:** SectorPanel or DictatorPanel show during active combat.

### Pitfall 4: CombatPanel onUnmounted Cleanup
**What goes wrong:** CombatPanel's `onUnmounted` hook (line 687-690) calls `resetAnimations()` and clears healing state. If the snapshot is cleared before CombatPanel unmounts, the cleanup may conflict.
**Why it happens:** Vue reactivity -- the v-if change triggers unmount, which triggers cleanup.
**How to avoid:** The `handleCombatFinished` handler in GameTable clears the snapshot, which removes the v-if condition. CombatPanel unmounts and its onUnmounted runs. This is the correct order: snapshot cleared -> CombatPanel unmounts -> cleanup runs. The `combat-end` handler in CombatPanel has already run before `combat-finished` is emitted, so there's no conflict.
**Warning signs:** Console errors or state leaks after combat ends.

### Pitfall 5: hasPendingCombatEvents Used by showGameOverOverlay
**What goes wrong:** `showGameOverOverlay` (line 607-615) checks `animationEvents?.isAnimating` and `animationEvents?.pendingCount` to delay game over display until animations finish. Removing `hasPendingCombatEvents` could accidentally break this.
**Why it happens:** `hasPendingCombatEvents` and `showGameOverOverlay` both use `animationEvents` but for different purposes.
**How to avoid:** `showGameOverOverlay` directly reads `animationEvents?.isAnimating` and `animationEvents?.pendingCount` -- it does NOT depend on `hasPendingCombatEvents`. It is safe to delete `hasPendingCombatEvents` without affecting `showGameOverOverlay`.
**Warning signs:** Game over overlay appears during final combat animations.

### Pitfall 6: allocate-wolverine-six Still Emitted by CombatPanel
**What goes wrong:** Removing `@allocate-wolverine-six` handler from GameTable template causes Vue warning about unhandled emit.
**Why it happens:** CombatPanel's `selectTarget()` function emits `allocate-wolverine-six` (line 582).
**How to avoid:** Check whether CombatPanel actually needs this emit. If the allocation is tracked internally in CombatPanel (like `allocate-hit`), the emit is a no-op and can be removed from CombatPanel's defineEmits too. If CombatPanel uses it, keep the handler. Review carefully.
**Warning signs:** Vue warnings in console during Wolverine combat.

## Code Examples

### GameTable Combat Section -- AFTER Cleanup

**Script (under 10 lines of combat-specific logic):**
```typescript
// Combat panel -- driven by animation events
const combatSnapshot = ref<Record<string, unknown> | null>(null);

if (animationEvents) {
  animationEvents.registerHandler('combat-panel', async (event) => {
    combatSnapshot.value = event.data as Record<string, unknown>;
  });
}

const hasActiveCombat = computed(() => combatSnapshot.value !== null);

async function handleCombatFinished() {
  combatSnapshot.value = null;
  try {
    await props.actionController.execute('clearCombatAnimations', {});
  } catch {
    // Action may fail if game already cleared activeCombat
  }
}
```

**Template (under 20 lines):**
```html
<!-- Combat Panel - shown when combat snapshot is present -->
<CombatPanel
  v-if="hasActiveCombat"
  :combat-snapshot="combatSnapshot"
  :is-my-turn="isMyTurn"
  :available-actions="availableActions"
  :is-selecting-retreat-sector="isSelectingRetreatSector"
  :retreat-sector-choices="retreatSectorChoices"
  @reroll="handleReroll"
  @confirm-allocation="handleConfirmAllocation"
  @confirm-targets="handleConfirmTargets"
  @continue-combat="handleContinueCombat"
  @retreat-combat="handleRetreatCombat"
  @assign-attack-dog="handleAssignAttackDog"
  @combat-finished="handleCombatFinished"
  @use-medical-kit="handleUseMedicalKit"
  @use-surgeon-heal="handleUseSurgeonHeal"
  @use-before-attack-heal="handleUseBeforeAttackHeal"
  @skip-before-attack-heal="handleSkipBeforeAttackHeal"
/>
```

### CombatPanel Props -- AFTER Cleanup

```typescript
const props = defineProps<{
  combatSnapshot: Record<string, unknown> | null;
  isMyTurn: boolean;
  availableActions: string[];
  isSelectingRetreatSector?: boolean;
  retreatSectorChoices?: RetreatSector[];
}>();
```

Replaces the current 60-line `activeCombat` prop type definition + `sectorName` string prop.

## Key Measurements

### Before (current state)
- Combat-related script in GameTable: ~150 lines (lines 484-634, 718-725)
- Combat-related template in GameTable: 25 lines (lines 1253-1278)
- Number of combat refs/computeds: 10 (combatPanelReady, rawAnimationEvents, combatEventSeen, lastCombatEventId, theatreActiveCombat, activeCombat, cachedCombat, activeCombatForPanel, hasActiveCombat, combatSectorName)
- Number of combat watchers: 6
- Number of no-op/dead handlers: 4 (handleAllocateHit, handleAllocateWolverineSix, handleDisplayComplete, handleCombatPanelReady)

### After (target state)
- Combat-related script in GameTable: ~15 lines (snapshot ref, handler registration, hasActiveCombat computed, handleCombatFinished)
- Combat-related template in GameTable: 19 lines (CombatPanel binding with event handlers)
- Number of combat refs/computeds: 2 (combatSnapshot, hasActiveCombat)
- Number of combat watchers: 0
- Number of no-op/dead handlers: 0

### Net deletion: ~135 lines of script, 6 lines of template

## Sequencing Recommendation

This phase has two clear sub-plans:

### Plan 45-01: Move Snapshot to GameTable + Delete Fallback Chains
1. Register `combat-panel` handler in GameTable, store in `combatSnapshot` ref
2. Replace `hasActiveCombat` computed with `combatSnapshot !== null`
3. Delete: `combatPanelReady`, `rawAnimationEvents`, `combatEventSeen`, `lastCombatEventId`, `theatreActiveCombat`, `activeCombat` (computed), `cachedCombat`, `activeCombatForPanel`, `combatSectorName`
4. Delete: All 6 combat watchers
5. Delete: `handleCombatPanelReady`, `handleAllocateHit`, `handleAllocateWolverineSix`, `handleDisplayComplete`
6. Update `handleCombatFinished` to clear `combatSnapshot`
7. Update template: new CombatPanel binding (remove deleted props/events, add `combatSnapshot`)

### Plan 45-02: Update CombatPanel to Accept Snapshot as Prop
1. Replace `activeCombat` prop with `combatSnapshot` prop
2. Remove `sectorName` prop -- read from `combatSnapshot.sectorName`
3. Remove internal `combatSnapshot` ref -- use prop directly
4. Remove internal `combat-panel` handler registration (moved to GameTable)
5. Add watcher on `combatSnapshot` prop to clear healthOverrides on update
6. Remove `panel-ready` emit and `onMounted` emit call
7. Remove `allocate-hit` and `allocate-wolverine-six` from defineEmits (if confirmed dead)
8. Update `combat-end` handler: keep visual animation, keep `combat-finished` emit, but do NOT clear snapshot (GameTable handles that)

**Alternative:** These could be done as a single plan since the changes are tightly coupled. Doing both at once means CombatPanel and GameTable are updated atomically, avoiding a broken intermediate state.

## Open Questions

1. **Should `allocate-wolverine-six` emit be kept?**
   - What we know: CombatPanel emits it at line 582. GameTable's handler is a no-op.
   - What's unclear: Whether CombatPanel has any downstream logic that depends on the emit happening (emits are fire-and-forget in Vue, so this is unlikely).
   - Recommendation: Remove from both sides. The Wolverine sixes allocation is tracked internally in CombatPanel and submitted via `confirm-targets`.

2. **Should `display-complete` event handling be removed?**
   - What we know: CombatPanel never emits `display-complete`. `combatDisplayContinue` action is only referenced in GameTable's dead handler.
   - Recommendation: Remove `handleDisplayComplete` and `@display-complete` from template. If `combatDisplayContinue` action exists in game rules but is unused, that's a follow-up cleanup.

3. **Can the remaining event handlers be simplified?**
   - What we know: 10 event handlers remain that each call `actionController.execute()` or `.start()` with a specific action name. They follow a pattern: check availability, then execute.
   - Recommendation: Keep as-is for now. They're each 3-4 lines and clearly named. Abstracting them would reduce readability.

## Sources

### Primary (HIGH confidence)
- `src/ui/components/GameTable.vue` -- full file read (1693 lines), all combat-related lines catalogued
- `src/ui/components/CombatPanel.vue` -- full file read, verified Phase 44 changes are complete
- `node_modules/boardsmith/src/ui/composables/useAnimationEvents.ts` -- full file read, handler-wait mechanism confirmed (3s timeout, line 117)
- `src/rules/combat.ts` -- `buildCombatPanelSnapshot` verified, `combat-panel` is first event emitted at combat start (line 2458)
- `.planning/phases/44-combatpanel-rebuild/44-VERIFICATION.md` -- Phase 44 verified complete

### Secondary (HIGH confidence)
- `.planning/phases/44-combatpanel-rebuild/44-RESEARCH.md` -- GameTable wiring documented
- `.planning/phases/44-combatpanel-rebuild/44-02-SUMMARY.md` -- CombatPanel is now self-contained

## Metadata

**Confidence breakdown:**
- Items to delete: HIGH -- exact line numbers, all refs/watchers/functions catalogued from source
- New architecture (snapshot in GameTable): HIGH -- verified handler-wait mechanism in boardsmith source, verified combat-panel is first event
- CombatPanel changes: HIGH -- verified current prop usage and emit usage from source
- Dead code identification: HIGH -- verified `display-complete` never emitted, `allocate-hit` handler is no-op, `combatDisplayContinue` only in GameTable

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (stable codebase, no external dependencies changing)
