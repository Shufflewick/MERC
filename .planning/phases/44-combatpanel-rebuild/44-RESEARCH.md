# Phase 44: CombatPanel Rebuild - Research

**Researched:** 2026-02-08
**Domain:** Vue 3 component refactoring -- replacing prop/gameView-driven rendering with animation-event-driven rendering
**Confidence:** HIGH

## Summary

Phase 44 rebuilds CombatPanel.vue to render 100% from `combat-panel` snapshot events emitted by Phase 43, eliminating the current pattern where combatant data is read from `activeCombat` prop (which comes from theatre-view gameView) and health is manually tracked via `displayHealth`. The snapshot data contract from Phase 43 is already implemented and emitted at all 8 decision cycle points, containing serialized combatants with all fields CombatPanel needs (id, name, image, health, maxHealth, type flags, playerColor, combatantId, attack dog state) plus decision context (6 pending decision types + combatComplete flag).

The current CombatPanel has three major systems to remove: (1) a 4-state state machine (IDLE/ANIMATING/WAITING_FOR_INPUT/COMPLETE) with watchers driving transitions, (2) manual `displayHealth` tracking via a Map that gets initialized from activeCombat and updated by combat-damage events, and (3) `resolveCombatant()` / `findElementById()` calls that look up combatants in the gameView tree. All three become unnecessary because the combat-panel snapshot provides pre-serialized combatant data with current health values at every decision point.

**Primary recommendation:** Store the latest `combat-panel` snapshot in a local ref, register a `combat-panel` animation event handler, and rewire all template bindings and computed properties to read from the snapshot instead of `props.activeCombat`. The panel lifecycle becomes: opens when first snapshot arrives, closes when `combat-end` animation finishes and emits `combat-finished`. Decision prompts read from snapshot decision context fields. The `combat-damage` handler still updates health locally (for smooth per-hit animation between snapshots). Child components (HitAllocationPanel, TargetSelectionPanel, AttackDogAssignmentPanel, CombatPanelCombatant, DiceRollDisplay, RetreatSectorSelection) require zero changes.

## Current Architecture (What Exists Today)

### CombatPanel.vue -- 1508 lines, 889 script + 619 template/style

**Props received from GameTable:**
| Prop | Source | Used For |
|------|--------|----------|
| `gameView` | GameTable.gameView | Resolving combatant element refs via `findElementById()` |
| `activeCombat` | `activeCombatForPanel` computed (theatre view + cache) | All combatant/decision data |
| `isMyTurn` | GameTable.isMyTurn | Gating interactive decisions |
| `availableActions` | GameTable.availableActions | Showing action buttons |
| `sectorName` | `combatSectorName` computed | Header display |
| `isSelectingRetreatSector` | from useActionState | Retreat UI |
| `retreatSectorChoices` | from useActionState | Retreat sector cards |

**Key systems to delete (DELETE-03, DELETE-05):**

1. **State Machine (lines 723-810):**
   - `CombatPanelState` type: `'IDLE' | 'ANIMATING' | 'WAITING_FOR_INPUT' | 'COMPLETE'`
   - `panelState` ref
   - `sawCombatEndEvent` ref (set in combat-end handler, checked in computeNextState)
   - `computeNextState()` -- derives state from isAnimating, pendingCount, combatComplete, sawCombatEndEvent
   - `transitionState()` -- compares states, emits `combat-finished` on COMPLETE entry
   - 4 watchers driving transitions: isAnimating/pendingCount, combatComplete, activeCombat null, sectorId change

2. **displayHealth Manual Tracking (lines 154, 394-413):**
   - `displayHealth` ref: `Map<string, number>` -- maps combatant IDs to current health
   - `initializeDisplayHealth(combat)` -- reads combatants from activeCombat, populates map
   - Watcher on `activeCombat.sectorId` that calls `initializeDisplayHealth`
   - combat-damage handler updates displayHealth (lines 251-259)
   - `getCombatantDisplay()` reads displayHealth for health values (lines 597-604)

3. **gameView/activeCombat resolution (lines 39, 103, 559-563):**
   - `gameView` prop used only by `useGameViewHelpers` to get `findElementById`
   - `resolveCombatant(combatant)` -- calls `findElementById(id)` to get full element from tree
   - `getCombatantDisplay(combatant)` -- calls `resolveCombatant`, then `getAttr` on resolved node
   - All of this becomes unnecessary because snapshot combatants are pre-serialized plain data

### GameTable.vue Combat Wiring (lines 486-634)

**How CombatPanel is mounted (lines 1253-1279):**
```
v-if="hasActiveCombat"
:game-view="gameView"
:active-combat="activeCombatForPanel"
:is-my-turn="isMyTurn"
:available-actions="availableActions"
:sector-name="combatSectorName"
:is-selecting-retreat-sector="isSelectingRetreatSector"
:retreat-sector-choices="retreatSectorChoices"
```

**Key computed properties in GameTable:**
- `theatreActiveCombat` (line 520) -- reads `gameView.activeCombat`
- `activeCombat` (line 527) -- `theatreActiveCombat ?? null`
- `cachedCombat` (line 531) -- ref that caches last non-null activeCombat
- `activeCombatForPanel` (line 545) -- returns activeCombat, or cachedCombat if animations pending
- `hasActiveCombat` (line 557) -- drives v-if for CombatPanel
- `combatSectorName` (line 629) -- looks up sector name from activeCombat.sectorId

**Event handlers in GameTable (lines 619-725):**
All 14 event handlers delegate to `actionController.execute()` or `actionController.start()`. These remain unchanged -- CombatPanel emits the same events, GameTable handles them the same way.

### GameTable Changes Required

GameTable's complex `activeCombatForPanel`/`cachedCombat`/`hasActiveCombat` system is designed to keep CombatPanel mounted during animation playback. With the snapshot-driven approach, this logic still serves a purpose BUT the `gameView` prop to CombatPanel and the `activeCombat` prop's role in rendering both change:

- `gameView` prop: **Can be removed** from CombatPanel (no more `findElementById` calls)
- `activeCombat` prop: **Still needed for decision detection** in some form, but rendering reads from snapshot. The simplest migration path keeps `activeCombat` prop but only uses it for `isMyTurn`/`availableActions` gating, not for reading combatant data. Alternatively, the panel's v-if and lifecycle can be driven purely by the snapshot ref.

## Combat-Panel Snapshot Format (Phase 43)

Emitted by `buildCombatPanelSnapshot(game)` at 8 decision cycle points in `executeCombat()`:

```typescript
{
  sectorId: string,
  sectorName: string,            // Human-readable, direct from game.getSector()
  round: number,
  rebelCombatants: SerializedCombatant[],
  dictatorCombatants: SerializedCombatant[],
  rebelCasualties: SerializedCombatant[],
  dictatorCasualties: SerializedCombatant[],
  dogAssignments: Array<[string, any]>,
  combatComplete: boolean,
  // Decision context -- at most one active at a time, rest are null
  pendingTargetSelection: { attackerId, attackerName, validTargets, maxTargets } | null,
  pendingHitAllocation: PendingHitAllocation | null,
  pendingWolverineSixes: { attackerId, attackerName, sixCount, bonusTargets } | null,
  pendingAttackDogSelection: { attackerId, attackerName, validTargets } | null,
  pendingBeforeAttackHealing: { attackerId, attackerName, availableHealers, damagedAllies } | null,
  pendingEpinephrine: unknown | null,  // Not currently consumed by CombatPanel
}
```

**SerializedCombatant shape** (from `serializeCombatant()`):
```typescript
{
  id: string,               // Combatant.id (string, unique within combat)
  name: string,             // Combatant.name
  image: string | undefined,
  health: number,           // CURRENT health at snapshot time
  maxHealth: number,
  isMerc: boolean,          // !isMilitia && !isDictator && !isAttackDog
  isMilitia: boolean,
  isAttackDog: boolean,
  isDictator: boolean,
  isDictatorSide: boolean,
  playerColor: string | undefined,
  combatantId: string | undefined,  // CombatantModel.combatantId (e.g., 'haarg')
  attackDogAssignedTo: string | undefined,
  attackDogTargetName: string | undefined,
  attackDogPendingTarget: boolean | undefined,
}
```

**8 emission points:**
1. Combat start (initial setup)
2. Paused for target selection
3. Paused for hit allocation
4. Paused for before-attack healing
5. Paused for epinephrine decision
6. Paused for attack dog selection
7. Paused for retreat/continue decision
8. Combat complete (combatComplete: true)

## Animation Event Data Formats (Phase 43)

These events fire DURING combat between snapshots. CombatPanel already handles all of them.

| Event Type | Key Fields | Purpose |
|------------|-----------|---------|
| `combat-panel` | Full snapshot (above) | **NEW** -- CombatPanel state source |
| `combat-roll` | attackerName, attackerId, attackerImage, targetNames[], targetIds[], diceRolls[], hits, hitThreshold | Dice animation |
| `combat-damage` | attackerName, attackerId, targetName, targetId, targetImage, damage, healthBefore, healthAfter | Per-hit damage |
| `combat-death` | targetName, targetId, targetImage | Death animation |
| `combat-round-start` | round | Round transition |
| `combat-end` | rebelVictory, dictatorVictory | Combat finished |
| `combat-attack-dog` | attackerName, attackerId, attackerImage, targetName, targetId, targetImage, dogId, dogImage | Dog assignment |
| `combat-heal` | healerName, healerId, targetName, targetId, healAmount, healthBefore, healthAfter, itemName | Healing animation |

**Critical:** `combat-damage` carries `healthAfter` -- this is the same value the snapshot will have at the next decision point. Between snapshots, CombatPanel must use healthAfter from damage events to show smooth health updates.

## ActionController Integration

CombatPanel emits Vue events, GameTable handles them by calling `actionController.execute()` or `actionController.start()`. This pattern is unchanged by Phase 44.

**Emits from CombatPanel (14 events):**
```
allocate-hit, allocate-wolverine-six, reroll, confirm-allocation, confirm-targets,
continue-combat, retreat-combat, select-retreat-sector, assign-attack-dog,
combat-finished, panel-ready, use-medical-kit, use-surgeon-heal,
use-before-attack-heal, skip-before-attack-heal
```

**Mapping to GameTable handlers:**
| CombatPanel Emit | GameTable Handler | Action Executed |
|------------------|-------------------|-----------------|
| `confirm-allocation` | `handleConfirmAllocation` | `combatAllocateHits` |
| `confirm-targets` | `handleConfirmTargets` | `combatSelectTarget` |
| `continue-combat` | `handleContinueCombat` | `combatContinue` |
| `retreat-combat` | `handleRetreatCombat` | `combatRetreat` (start) |
| `assign-attack-dog` | `handleAssignAttackDog` | `combatAssignAttackDog` |
| `combat-finished` | `handleCombatFinished` | `clearCombatAnimations` |
| `use-medical-kit` | `handleUseMedicalKit` | `combatHeal` (start) |
| `use-surgeon-heal` | `handleUseSurgeonHeal` | `combatSurgeonHeal` (start) |
| `use-before-attack-heal` | `handleUseBeforeAttackHeal` | `combatBeforeAttackHeal` (start) |
| `skip-before-attack-heal` | `handleSkipBeforeAttackHeal` | `combatSkipBeforeAttackHeal` (start) |
| `reroll` | `handleReroll` | `combatBasicReroll` |

**No changes needed** to any of these -- the actions are orthogonal to rendering.

## Current displayHealth System (DELETE-05)

**What it tracks:** A `Map<string, number>` mapping combatant IDs to current health values.

**How it differs from snapshot health:**
- `displayHealth` is initialized from `activeCombat.rebelCombatants[].health` when combat starts or `sectorId` changes
- It is updated PER HIT by the `combat-damage` handler using `healthAfter` or `damage` delta
- The snapshot health reflects the state at each DECISION POINT (between rounds of attacks)
- Between decision points, multiple hits may occur -- displayHealth tracks the progressive health through each hit

**After rebuild:** The snapshot provides health at decision points. Between decision points, the `combat-damage` handler updates a local health map from `healthAfter`. When the next snapshot arrives, it overrides with authoritative values. This is functionally identical to today but the initialization comes from the snapshot instead of `activeCombat` prop.

## State Machine (DELETE-03) -- Full Catalog

**States:**
| State | Meaning | Entry Actions |
|-------|---------|---------------|
| `IDLE` | No combat active | (none) |
| `ANIMATING` | Animation events playing | (none) |
| `WAITING_FOR_INPUT` | Animations done, awaiting player action | (none) |
| `COMPLETE` | Combat ended | Clear healing, reset animations, emit `combat-finished` |

**Transitions:**
| From | To | Condition |
|------|-----|-----------|
| IDLE | ANIMATING | animationsPlaying OR hasPendingEvents |
| ANIMATING | WAITING_FOR_INPUT | !animationsPlaying AND !hasPendingEvents AND !combatComplete AND !sawCombatEndEvent |
| ANIMATING | COMPLETE | !animationsPlaying AND !hasPendingEvents AND (combatComplete OR sawCombatEndEvent) |
| WAITING_FOR_INPUT | ANIMATING | animationsPlaying OR hasPendingEvents |

**Replacement:** The state machine exists to determine when to emit `combat-finished`. In the new model:
- Panel opens = first `combat-panel` snapshot received (snapshot ref becomes non-null)
- Panel closes = `combat-end` handler finishes, then emits `combat-finished`
- No intermediate states needed -- the snapshot presence/absence IS the state

## Decision Prompt Components

All 5 decision prompts currently read from `props.activeCombat.pendingXxx`. In the new model they read from the snapshot's identical fields.

### 1. Target Selection (lines 1099-1105)
- **Shows when:** `activeCombat?.pendingTargetSelection && isMyTurn && !isAnimating`
- **Data needed:** `attackerName`, `maxTargets`, `selectedCount`
- **Component:** `TargetSelectionPanel` -- receives attackerName, maxTargets, selectedCount; emits `confirm-targets`
- **Click handling:** `selectTarget()` toggles in `selectedTargets` Set, validates against `pendingTargetSelection.validTargets`
- **Change:** Read from `snapshot.pendingTargetSelection` instead of `activeCombat.pendingTargetSelection`

### 2. Hit Allocation (lines 985-993)
- **Shows when:** `activeCombat?.pendingHitAllocation && !isAnimating`
- **Data needed:** `PendingHitAllocation` object (attackerId, attackerName, diceRolls, hits, hitThreshold, validTargets, wolverineSixes, canReroll, hasRerolled, rollCount)
- **Component:** `HitAllocationPanel` -- manages dice-target allocation internally, emits `confirm-allocation`
- **Change:** Read from `snapshot.pendingHitAllocation`

### 3. Wolverine Sixes (lines 1046-1054)
- **Shows when:** `activeCombat?.pendingWolverineSixes && !isAnimating`
- **Data needed:** `attackerName`, `sixCount`
- **Inline template** (not separate component)
- **Click handling:** `selectTarget()` emits `allocate-wolverine-six` per click
- **Change:** Read from `snapshot.pendingWolverineSixes`

### 4. Attack Dog Assignment (lines 1057-1062)
- **Shows when:** `isAssigningAttackDog && !isAnimating`
- **Data needed:** `attackerName`, `validTargets[]`
- **Component:** `AttackDogAssignmentPanel` -- shows target buttons, emits `assign`
- **Change:** Read from `snapshot.pendingAttackDogSelection`

### 5. Before-Attack Healing (lines 1065-1096)
- **Shows when:** `isHealingBeforeAttack && !isAnimating`
- **Data needed:** `attackerName`, `availableHealers[]`, `damagedAllies[]`
- **Inline template** with Use/Skip buttons
- **Change:** Read from `snapshot.pendingBeforeAttackHealing`

## Fast-Forward Mechanism

**How it works (lines 316-318):**
```typescript
function fastForward(): void {
  isFastForward.value = true;
}
```

Once set, `getTiming()` returns faster durations (e.g., 50ms instead of 400ms). The flag persists until `resetAnimations()` is called.

**What it touches:**
- `isFastForward` ref -- toggled by clicking >> button in animation display
- `getTiming()` function -- returns FAST_* or normal timing based on flag
- All animation handlers use `getTiming()` for `sleep()` durations
- `resetAnimations()` clears the flag

**Impact of Phase 44:** None. Fast-forward is purely about timing durations in animation handlers. It does not interact with the snapshot or state machine. It stays as-is.

## Child Components -- Change Assessment

| Component | Props Source | Changes Needed |
|-----------|-------------|----------------|
| `CombatPanelCombatant` | `getCombatantDisplay()` output | **None** -- receives same shaped data |
| `HitAllocationPanel` | `activeCombat.pendingHitAllocation` | **None** -- will receive snapshot field instead (same shape) |
| `TargetSelectionPanel` | attackerName, maxTargets, selectedCount | **None** -- all from computed values |
| `AttackDogAssignmentPanel` | `activeCombat.pendingAttackDogSelection` | **None** -- same shape |
| `DiceRollDisplay` | diceRolls, hitThreshold, rollCount | **None** |
| `RetreatSectorSelection` | `retreatSectorChoices` from GameTable | **None** -- comes from GameTable, not activeCombat |
| `CombatantIcon` | image, combatantId, playerColor | **None** -- receives same data |

**All child components are pure presentational -- they receive props and emit events. The data shapes are unchanged because the snapshot was designed to match the existing prop shapes.**

## Architecture Patterns

### Pattern 1: Snapshot-as-State
**What:** Store latest `combat-panel` snapshot in a local ref. All rendering reads from this ref.
**When:** Every template binding, every computed property that currently reads `activeCombat`.

```typescript
// New local state
const combatSnapshot = ref<Record<string, unknown> | null>(null);

// Register handler (synchronously in setup, alongside existing handlers)
animationEvents.registerHandler('combat-panel', async (event) => {
  combatSnapshot.value = event.data as Record<string, unknown>;
});
```

### Pattern 2: Health Bridging Between Snapshots
**What:** Snapshot health is authoritative at decision points. Between decision points, `combat-damage` events update health locally.
**When:** During animation playback between decision snapshots.

```typescript
// Local health overrides (for smooth per-hit animation)
const healthOverrides = ref<Map<string, number>>(new Map());

// combat-damage handler updates local health
animationEvents.registerHandler('combat-damage', async (event) => {
  const data = event.data as Record<string, unknown>;
  const targetId = data.targetId as string;
  const healthAfter = data.healthAfter as number;
  if (targetId && typeof healthAfter === 'number') {
    healthOverrides.value.set(targetId, healthAfter);
  }
  // ... existing animation display logic
});

// combat-panel handler resets overrides (snapshot is authoritative)
animationEvents.registerHandler('combat-panel', async (event) => {
  combatSnapshot.value = event.data as Record<string, unknown>;
  healthOverrides.value.clear(); // Snapshot health takes over
});
```

### Pattern 3: Event-Driven Lifecycle
**What:** Panel opens on first snapshot, closes after combat-end handler.
**When:** Replaces the state machine.

```typescript
// Panel visible when snapshot exists
const isPanelVisible = computed(() => combatSnapshot.value !== null);

// combat-end handler closes panel
animationEvents.registerHandler('combat-end', async (event) => {
  // ... existing display logic
  await sleep(getTiming('combat-end'));
  // After animation finishes, close panel
  combatSnapshot.value = null;
  emit('combat-finished');
});
```

### Anti-Patterns to Avoid
- **Reading activeCombat for rendering:** The whole point is to stop doing this. Only read activeCombat for things NOT in the snapshot (none currently).
- **Re-introducing resolveCombatant():** Snapshot combatants are pre-serialized plain objects. No element ref resolution needed.
- **Keeping displayHealth initialization from activeCombat:** Health comes from snapshot. Only combat-damage events provide inter-snapshot updates.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Combatant data shape | Custom serializer in UI | `serializeCombatant()` output from snapshot | Already serialized by combat.ts |
| Panel lifecycle state | State machine with transitions | Snapshot ref presence + combat-end handler | 4 states, 5 watchers reduced to 0 |
| Health tracking | Manual Map with initialization | Snapshot health + damage event overrides | Snapshot is authoritative at decision points |
| Element resolution | `findElementById` + `resolveCombatant` | Direct property access on snapshot data | Snapshot data is pre-serialized, no refs |

## Common Pitfalls

### Pitfall 1: combat-panel Handler Registration Timing
**What goes wrong:** Handler registered in `onMounted()` misses the first event.
**Why it happens:** BoardSmith's `useAnimationEvents` watcher has `{ immediate: true }`. Events may be processed before `onMounted` runs.
**How to avoid:** Register `combat-panel` handler synchronously in setup scope (same as existing handlers on lines 229-309).
**Warning signs:** Panel stays blank despite combat starting.

### Pitfall 2: Health Flicker Between Snapshot and Damage Events
**What goes wrong:** Snapshot arrives with health=3, then damage events show 3->2->1, then next snapshot arrives with health=1. If healthOverrides are not cleared on snapshot arrival, stale values persist.
**Why it happens:** Two sources of truth (snapshot + damage events) without clear precedence.
**How to avoid:** Clear healthOverrides when a new snapshot arrives. Snapshot health is authoritative at that moment. Only use damage event healthAfter for inter-snapshot animation.
**Warning signs:** Health values jump or show wrong values after decision points.

### Pitfall 3: Removing activeCombat Prop Before GameTable Is Updated
**What goes wrong:** CombatPanel stops getting mounted because `hasActiveCombat` in GameTable depends on `activeCombatForPanel`.
**Why it happens:** If CombatPanel no longer needs activeCombat, the temptation is to remove it. But GameTable uses it for the v-if.
**How to avoid:** Keep GameTable's mounting logic (hasActiveCombat/cachedCombat) intact for now. It ensures CombatPanel is mounted BEFORE snapshot events arrive. Only simplify GameTable after CombatPanel is working.
**Warning signs:** CombatPanel flickers or never mounts.

### Pitfall 4: combat-end Handler Must Emit combat-finished
**What goes wrong:** Combat gets stuck -- game never clears activeCombat.
**Why it happens:** The state machine currently emits `combat-finished` on COMPLETE entry. If we remove the state machine but forget to emit from the combat-end handler, `handleCombatFinished` in GameTable never fires, `clearCombatAnimations` never executes.
**How to avoid:** The `combat-end` handler MUST emit `combat-finished` after its animation sleep. This is the sole trigger for GameTable to call `clearCombatAnimations`.
**Warning signs:** Combat panel stays visible after combat ends.

### Pitfall 5: getCombatantDisplay() Complexity
**What goes wrong:** The massive `getCombatantDisplay()` function (lines 565-626) has complex resolution logic, multiple fallback chains, and intermixed concerns. Trying to incrementally refactor it leads to bugs.
**Why it happens:** The function was designed to handle theatre-view elements that might be partial (element refs, missing attributes). Snapshot data is complete.
**How to avoid:** Replace the body of `getCombatantDisplay()` with direct reads from the snapshot combatant object. The snapshot's `serializeCombatant()` output already has id, name, image, health, maxHealth, isMerc, isMilitia, isAttackDog, combatantId, playerColor. The only addition needed is healthOverrides lookup.
**Warning signs:** Health shows wrong, names show wrong, images missing.

### Pitfall 6: Panel Mounting Race with Event Processing
**What goes wrong:** GameTable pauses animation processing while CombatPanel mounts (lines 562-595). If the combat-panel handler is what triggers mounting, there is a chicken-and-egg problem.
**Why it happens:** CombatPanel is mounted via `v-if="hasActiveCombat"` which depends on `activeCombatForPanel`. If we try to change v-if to depend on snapshot, the snapshot handler is not registered until the component mounts.
**How to avoid:** Keep GameTable's existing mounting trigger (hasActiveCombat based on activeCombat prop). CombatPanel still gets mounted when theatre-view shows activeCombat. Once mounted, it registers the combat-panel handler and starts receiving snapshots. The activeCombat prop becomes a "mount trigger" only, not a rendering data source.
**Warning signs:** Events arrive before handler registered, panel never opens.

## Code Examples

### Simplified getCombatantDisplay (replacing lines 565-626)
```typescript
// Source: Snapshot data from buildCombatPanelSnapshot -> serializeCombatant
function getCombatantDisplay(combatant: Record<string, unknown>) {
  const id = combatant.id as string;
  const health = healthOverrides.value.get(id) ?? (combatant.health as number);
  const maxHealth = combatant.maxHealth as number;

  return {
    id,
    name: combatant.name as string,
    isMerc: combatant.isMerc as boolean,
    isAttackDog: combatant.isAttackDog as boolean,
    isMilitia: combatant.isMilitia as boolean,
    health,
    maxHealth,
    combatantId: combatant.combatantId as string,
    image: combatant.image as string | undefined,
    isDead: health <= 0,
    playerColor: combatant.playerColor as string | undefined,
    attackDogTargetName: combatant.attackDogTargetName as string | undefined,
    attackDogPendingTarget: combatant.attackDogPendingTarget as boolean | undefined,
  };
}
```

### Snapshot-Driven Computed Properties (replacing lines 432-495)
```typescript
// Rebels to display -- from snapshot, not from activeCombat prop
const livingRebels = computed(() => {
  const snapshot = combatSnapshot.value;
  if (!snapshot) return [];
  const combatants = (snapshot.rebelCombatants as any[]) || [];
  const casualties = (snapshot.rebelCasualties as any[]) || [];
  // Dedup by id
  const seen = new Set<string>();
  const combined: any[] = [];
  for (const c of [...combatants, ...casualties]) {
    const id = c.id as string;
    if (id && !seen.has(id)) {
      seen.add(id);
      combined.push(c);
    }
  }
  return combined;
});

// Decision mode checks -- from snapshot, not from activeCombat prop
const isSelectingTargets = computed(() => {
  return !!combatSnapshot.value?.pendingTargetSelection && props.isMyTurn;
});
```

### Panel Lifecycle (replacing state machine)
```typescript
// Register combat-panel handler (synchronously in setup)
animationEvents.registerHandler('combat-panel', async (event) => {
  combatSnapshot.value = event.data as Record<string, unknown>;
  healthOverrides.value.clear();
  // No sleep -- snapshot is instantaneous, not animated
});

// Modify combat-end handler to close panel
animationEvents.registerHandler('combat-end', async (event) => {
  currentEvent.value = mapEventToDisplayState(event);
  await sleep(getTiming('combat-end'));
  // Close panel and signal GameTable
  combatSnapshot.value = null;
  healingCombatants.value.clear();
  resetAnimations();
  emit('combat-finished');
});
```

## GameTable Changes Required

### Minimal Changes (Recommended)
1. **Remove `gameView` prop** from CombatPanel binding (line 1256) -- CombatPanel no longer uses it
2. **Keep activeCombat prop and hasActiveCombat** -- still needed to mount CombatPanel before events arrive
3. **Keep all event handlers** -- unchanged

### Props to Remove from CombatPanel
| Prop | Reason |
|------|--------|
| `gameView` | No more `findElementById` / `resolveCombatant` calls |

### Props to Keep
| Prop | Reason |
|------|--------|
| `activeCombat` | Mounting trigger (v-if in GameTable). Could be simplified to boolean later. |
| `isMyTurn` | Decision gating |
| `availableActions` | Action button visibility |
| `sectorName` | Can come from snapshot instead, but low priority |
| `isSelectingRetreatSector` | From GameTable's useActionState |
| `retreatSectorChoices` | From GameTable's useActionState |

**Note:** `sectorName` is in the snapshot as `sectorName`. Could replace the prop. But it is low-risk to keep the prop and a separate concern from this phase's goals.

## Sequencing Recommendation

Given the interrelated concerns, recommended sub-plan order:

1. **Plan 44-01: Register combat-panel handler and add snapshot state**
   - Add `combatSnapshot` ref and `healthOverrides` ref
   - Register `combat-panel` event handler
   - Add `combat-heal` healthOverrides update
   - No template changes yet -- just establishing the data source

2. **Plan 44-02: Rewire rendering to snapshot (UI-01)**
   - Replace `livingRebels`/`livingDictator` computed to read from snapshot
   - Replace `getCombatantDisplay()` to read from snapshot + healthOverrides
   - Replace `displayCombat` (header round display)
   - Remove `gameView` prop, `findElementById`, `resolveCombatant`
   - Remove `displayHealth`, `initializeDisplayHealth`, sectorId watcher (DELETE-05)

3. **Plan 44-03: Rewire decision prompts to snapshot (UI-02)**
   - Replace all `activeCombat?.pendingXxx` reads with `combatSnapshot?.pendingXxx`
   - Replace mode checks (isSelectingTargets, isAllocating, etc.)
   - Replace `findCombatantIdByName` to search snapshot combatants
   - Replace `isValidTarget` to read from snapshot decision context

4. **Plan 44-04: Replace state machine with event-driven lifecycle (UI-03, DELETE-03)**
   - Modify `combat-end` handler to emit `combat-finished` and clear snapshot
   - Delete `CombatPanelState`, `panelState`, `sawCombatEndEvent`
   - Delete `computeNextState()`, `transitionState()`
   - Delete all state machine watchers
   - Keep fast-forward untouched

## Open Questions

1. **Should `activeCombat` prop be removed entirely from CombatPanel?**
   - What we know: GameTable still needs `hasActiveCombat` for the v-if. CombatPanel currently uses activeCombat for isMyTurn gating on decision context, but this comes from snapshot now.
   - What's unclear: Whether GameTable should change its v-if to depend on a signal from CombatPanel (e.g., a defineExpose bool), or keep using activeCombat.
   - Recommendation: Keep `activeCombat` as a mount trigger prop for now. Removing it from GameTable is a follow-up concern. The success criteria says "no activeCombat prop for rendering" -- it can still exist for mounting.

2. **Should the combat-panel handler have any sleep/animation?**
   - What we know: The handler processes instantaneously (no visual animation for state updates). Other handlers sleep for animation durations.
   - Recommendation: No sleep. Snapshot updates should be immediate. The handler just stores data.

3. **dogTargetNames computed needs snapshot data**
   - What we know: Currently reads `activeCombat.dogAssignments` and `activeCombat.dogs`. Snapshot includes `dogAssignments` but not `dogs` array.
   - What's unclear: Whether `dogs` array is needed or if snapshot combatant data (which includes attackDogTargetName) is sufficient.
   - Recommendation: Snapshot combatants have `attackDogTargetName` and `attackDogPendingTarget`. The `dogTargetNames` computed can be simplified to read these directly from snapshot combatants. The `dogAssignments` and `dogs` fallback chains can be removed.

## Sources

### Primary (HIGH confidence)
- `src/ui/components/CombatPanel.vue` -- 1508 lines, read in full
- `src/ui/components/GameTable.vue` -- 1693 lines, read in full
- `src/rules/combat.ts` -- serializeCombatant and buildCombatPanelSnapshot verified (lines 86-133)
- `src/rules/combat-types.ts` -- Combatant interface (lines 14-40)
- `.planning/phases/43-combat-event-architecture/43-02-PLAN.md` -- snapshot spec
- `.planning/phases/43-combat-event-architecture/43-02-SUMMARY.md` -- confirmed 8 emission points

### Secondary (HIGH confidence)
- `src/ui/components/CombatPanelCombatant.vue` -- child component props (453 lines)
- `src/ui/components/HitAllocationPanel.vue` -- PendingHitAllocation type, allocation logic (310 lines)
- `src/ui/components/TargetSelectionPanel.vue` -- minimal component (78 lines)
- `src/ui/components/AttackDogAssignmentPanel.vue` -- minimal component (86 lines)
- `src/ui/components/RetreatSectorSelection.vue` -- minimal component (69 lines)
- `src/ui/composables/useCombatSequence.ts` -- attack sequence tracking (251 lines)
- `src/rules/actions/rebel-combat.ts` -- combat-heal event format (3 emission sites)

## Metadata

**Confidence breakdown:**
- Current architecture: HIGH -- read all source files in full
- Snapshot format: HIGH -- verified actual implementation in combat.ts
- Animation events: HIGH -- verified all 7 event types in combat.ts and rebel-combat.ts
- Delete targets: HIGH -- exact line numbers, function names, ref names catalogued
- Child component impact: HIGH -- all 6 child components read, none need changes
- GameTable changes: HIGH -- full wiring understanding, minimal changes needed
- Sequencing: MEDIUM -- recommended order based on dependency analysis, may need adjustment

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (stable codebase, no external dependencies)
