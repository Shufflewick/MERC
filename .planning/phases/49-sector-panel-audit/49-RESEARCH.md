# Phase 49: Sector Panel Audit - Research

**Researched:** 2026-02-08
**Domain:** Vue 3 UI wiring, BoardSmith action controller, sector panel actions
**Confidence:** HIGH

## Summary

This phase audits the SectorPanel component to ensure every action launched from it works identically to its ActionPanel (BoardSmith framework) counterpart. The SectorPanel is a MERC-specific custom component that provides sector-contextual action buttons and inline selection UI. The "ActionPanel" is the BoardSmith framework's built-in generic panel inside GameShell that lists available actions as simple buttons.

The key architectural insight is that **there is no separate ActionPanel Vue component in the MERC codebase** -- it's the built-in BoardSmith `GameShell` ActionPanel. The SectorPanel manually mirrors some of the ActionPanel's behavior (starting actions, filling selections) but adds sector-specific context (pre-filling destination, auto-selecting single units, showing inline MERC/equipment selection UI).

The audit needs to verify: (1) every action the SectorPanel exposes is correctly pre-filling context (selected sector), (2) the combatant options shown match what the action definition would produce, and (3) no wiring inconsistencies exist between how SectorPanel dispatches vs how the action definitions expect input.

**Primary recommendation:** Audit each SectorPanel action against its action definition's selection signature, fix any mismatches in context pre-filling or option filtering.

## Architecture Overview

### How Actions Flow from ActionPanel (BoardSmith Built-in)

1. `GameShell` renders an internal ActionPanel with `availableActions` as buttons
2. User clicks an action button
3. BoardSmith's `actionController.start(actionName)` is called
4. `actionController.currentPick` exposes the first unfilled selection
5. UI renders selection UI (choices, elements, etc.)
6. User fills each selection via `actionController.fill(selName, value)`
7. When all selections filled, action auto-executes

**Key: ActionPanel shows ALL valid actions globally. No sector context is pre-filled.**

### How Actions Flow from SectorPanel (MERC Custom)

1. `SectorPanel` computes `inSectorActions` and `adjacentActions` based on:
   - Whether player's squad is in the sector (`hasSquadInSector`)
   - Whether player's squad is adjacent (`hasSquadAdjacent`)
   - Which actions are in `availableActions` (from game flow)
   - Sector type (city for hospital/armsDealer)
   - Special MERC flags (hasDoc, hasSquidhead, hasMortar, etc.)
2. User clicks action button in SectorPanel
3. `handleAction(actionName)` is called which:
   - Calls `actionController.start(actionName)`
   - Does action-specific auto-fills (move: fills destination, mortar: watches for targetSectorName)
   - Auto-selects unit when only one is in the sector
4. SectorPanel's `isInActionFlow` computed detects when an action is active and shows inline selection UI
5. Selections are filled via `selectMerc()`, `selectEquipment()`, `selectChoice()`

**Key: SectorPanel pre-fills sector context and auto-selects single units.**

### How SectorPanel Gets Its Sector

The `activeSector` computed in `useSectorState.ts` provides the active sector:
- **Preferred:** `selectedSector` (from user clicking on map)
- **Fallback:** `actionContextSector` (inferred from current action's args or player's squad location)

The sector's numeric BoardSmith element ID (`sector.id`) is used for `actionController.fill()` operations.

## Action Inventory: SectorPanel vs Action Definitions

### In-Sector Actions (require squad in sector)

| Action | SectorPanel Button | Action Definition Selection(s) | Context Pre-fill | Notes |
|--------|-------------------|-------------------------------|-----------------|-------|
| `explore` | "Explore" (when !explored) | `actingUnit` (chooseElement CombatantModel) | Auto-selects unit if only one | No sector selection in action def -- infers from unit location |
| `train` | "Train" | `unit` (chooseFrom string "id:name:isDictator") | Auto-selects unit if only one | Uses string format, not element ID |
| `hospital` | "Hospital" (city only) | `actingUnit` (chooseFrom string "id:name:isDictator") | Auto-selects unit if only one | City sectors only |
| `armsDealer` | "Arms Dealer" (city only) | `actingUnit` (chooseFrom string "id:name:isDictator") | Auto-selects unit if only one | City sectors only, then equipmentType + equipment |
| `reEquip` | "Equip" (when stash has items) | `actingUnit` (chooseFrom string "id:name:isDictator"), then `equipment` (chooseElement Equipment) | Auto-selects unit if only one | Only shown when stash non-empty |
| `dropEquipment` | "Unequip" | `actingMerc` (fromElements CombatantModel), then `equipment` (fromElements Equipment) | None (merc selected via modal or inline) | Also accessible from CombatantCard modal |
| `docHeal` | "Doc Heal" (when hasDoc + hasDamagedMercs) | No selections -- immediate execute | None | Heals all squad members |
| `squidheadDisarm` | "Disarm" (when hasSquidhead + hasLandMinesInStash) | No selections -- immediate execute | None | Removes mine from stash |
| `squidheadArm` | "Arm" (when hasSquidhead + squidheadHasLandMine) | No selections -- immediate execute | None | Arms mine in sector |
| `detonateExplosives` | "DETONATE!" (when isBase + hasExplosivesComponents) | `merc` (chooseElement CombatantModel) | None | Win condition action |

### Adjacent-Sector Actions (require squad adjacent)

| Action | SectorPanel Button | Action Definition Selection(s) | Context Pre-fill | Notes |
|--------|-------------------|-------------------------------|-----------------|-------|
| `move` | "Move Here" | `destination` (chooseElement Sector), then `squad` (chooseElement Squad) | **Fills destination immediately** with `sector.id` | Most critical pre-fill -- avoids user re-selecting sector |
| `mortar` | "Mortar" (when hasEnemyForces) | `unitId` (chooseFrom string name), then `targetSectorName` (chooseFrom string) | Watches for targetSectorName selection, auto-fills from sector name | Uses watch() pattern to handle async choice loading |
| `coordinatedAttack` | "Coord. Attack" (when both squads adjacent) | `destination` (chooseElement Sector), then `primarySquad`/`secondarySquad` | None visible -- button only shown when both squads adjacent | Checks adjacency in SectorPanel |

## Specific Inconsistencies Identified

### HIGH Priority Issues

#### 1. Unit Auto-Selection Mismatch
**Location:** `SectorPanel.handleAction()` lines 1191-1212
**Problem:** The auto-select logic checks for `sel.name === 'actingUnit' || sel.name === 'actingMerc' || sel.name === 'unit'` but:
- `train` uses `unit` (chooseFrom with string format "id:name:isDictator")
- `explore` uses `actingUnit` (chooseElement with element ID)
- `hospital` uses `actingUnit` (chooseFrom with string format)
- `armsDealer` uses `actingUnit` (chooseFrom with string format)
- `reEquip` uses `actingUnit` (chooseFrom with string format)
- `dropEquipment` uses `actingMerc` (fromElements with element ID)

The auto-fill logic attempts to detect the selection type and fill with the correct format, but the two formats (element ID vs. "id:name:isDictator" string) need careful handling. Currently:
- `sel.name === 'unit'` correctly builds the "id:name:isDictator" string format
- Everything else uses element ID via `merc.ref || merc.id`

**Risk:** If a chooseFrom action expecting "id:name:isDictator" gets filled with a bare element ID, it will fail to parse.

#### 2. Actions Missing from SectorPanel
**Location:** `SectorPanel.inSectorActions` computed
**Actions not exposed but available:**
- `hireMerc` -- handled by HiringPhase, not SectorPanel (intentional)
- `assignToSquad` -- handled by AssignToSquadPanel (intentional)
- `hagnessDraw` -- handled by HagnessDrawEquipment (intentional)
- `feedbackDiscard` -- NOT exposed anywhere from SectorPanel (potential gap)
- `repairKit` -- NOT exposed from SectorPanel (potential gap)
- `endTurn` -- handled by ActionPanel (intentional)

#### 3. Mortar Action Context Flow
**Location:** `SectorPanel.handleAction()` for mortar, lines 1151-1185
**Observation:** Mortar uses a `watch()` to auto-fill `targetSectorName` after the unit selection completes. This is because:
1. User clicks "Mortar" on an adjacent sector with enemies
2. SectorPanel starts the `mortar` action
3. First selection is `unitId` (which unit fires the mortar)
4. After unit is selected, `targetSectorName` choices become available
5. The watch waits for `targetSectorName` choices to load, then auto-fills

This is a correct but fragile pattern -- if choices don't load (or choice format changes), the watch never resolves.

### MEDIUM Priority Issues

#### 4. Selection Filtering to Sector
**Location:** `SectorPanel.selectableItems` computed, lines 994-1004
**Observation:** When showing MERC selections for in-sector actions, SectorPanel filters `validElements` to only show MERCs in the current sector:
```ts
const mercsInSectorIds = new Set(
  allAvailableMercs.value.map((m: any) => m.ref || m.id)
);
const filteredEls = validEls.filter((ve: any) => {
  const elementId = ve.id || ve.ref?.id;
  return mercsInSectorIds.has(elementId);
});
```
**Risk:** If the action definition already filters to the correct sector (which it does -- e.g., `explore` only shows units that can explore in their sector), this double-filter should be safe. But if there are edge cases where the sector panel's sector differs from the action's context, options could be incorrectly filtered out.

#### 5. docHeal and squidheadDisarm/squidheadArm Execute Immediately
**Location:** `SectorPanel.handleAction()` line 1188-1189
**Observation:** These actions have no selections, so `actionController.start()` immediately executes them. The SectorPanel correctly starts them, and they execute without needing any selection UI. However, the SectorPanel dispatches them via `start()` while the ActionPanel (or GameTable for doc) uses `execute()` directly.

The `docHeal` is also triggered via `handleActivateAbility` in GameTable:
```ts
} else if (combatantId === 'doc' && props.availableActions.includes('docHeal')) {
  await props.actionController.execute('docHeal', {});
}
```
This uses `execute()` directly, while SectorPanel uses `start()`. Both should work since the action has no selections, but `start()` enters wizard mode while `execute()` is a direct call.

#### 6. Stash-Based Action Visibility
**Location:** `SectorPanel.inSectorActions`, line 522-524
**Observation:** `reEquip` is only shown when `stashContents?.length > 0`, which is computed by `useSectorState.selectedSectorStash`. This correctly matches the action condition. However, the stash visibility is perspective-dependent -- only shown if the player has a unit in the sector.

### LOW Priority Issues

#### 7. coordinatedAttack Adjacency Check
**Location:** `SectorPanel.adjacentActions`, lines 569-576
**Observation:** The coordinated attack button only appears when both primarySquad and secondarySquad are adjacent to the clicked sector. This is a UI convenience check that matches the action's condition, but the action itself does its own validation. The SectorPanel check is a UI-only optimization.

#### 8. Debug Logging
**Location:** `SectorPanel.adjacentActions`, lines 555-563; `useSectorState.ts` lines 416-423
**Observation:** There is debug console.log/console.warn for mortar button visibility and mortar detection. These should be reviewed and potentially removed during the audit.

## Action Selection Signatures Reference

A complete reference of how each sector-panel-accessible action expects its selections:

### `move`
```
.chooseElement('destination', Sector)  -- boardRef: { id: sector.id }
.chooseElement('squad', Squad)         -- display: 'Primary Squad' | 'Secondary Squad'
```

### `explore`
```
.chooseElement('actingUnit', CombatantModel)  -- filter: in player's team, can explore
```

### `train`
```
.chooseFrom('unit', string)  -- format: "id:name:isDictator", display: capitalize(name)
```

### `hospital`
```
.chooseFrom('actingUnit', string)  -- format: "id:name:isDictator", display: capitalize(name)
```

### `armsDealer`
```
.chooseFrom('actingUnit', string)   -- format: "id:name:isDictator"
.chooseFrom('equipmentType', string)  -- choices: ['Weapon', 'Armor', 'Accessory']
```

### `reEquip`
```
.chooseFrom('actingUnit', string)   -- format: "id:name:isDictator"
.chooseElement('equipment', Equipment)  -- dependsOn: actingUnit, filter: in sector stash
```

### `dropEquipment`
```
.fromElements('actingMerc', CombatantModel)  -- elements: player's combatants with equipment
.fromElements('equipment', Equipment)         -- dependsOn: actingMerc, elements: merc's equipment
```

### `docHeal`
```
(no selections -- immediate execute)
```

### `squidheadDisarm`
```
(no selections -- immediate execute)
```

### `squidheadArm`
```
(no selections -- immediate execute)
```

### `mortar`
```
.chooseFrom('unitId', string)               -- choices: capitalize(name) of mortar-equipped units
.chooseFrom('targetSectorName', string)      -- dependsOn: unitId, choices: "SectorName (N targets)"
```

### `detonateExplosives`
```
.chooseElement('merc', CombatantModel)  -- filter: in player's team, in base sector, has both explosives components
```

### `coordinatedAttack`
```
.chooseElement('destination', Sector)       -- boardRef
.chooseElement('primarySquad', Squad)       -- (no user selection, resolved automatically)
.chooseElement('secondarySquad', Squad)     -- (no user selection, resolved automatically)
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Action dispatching | Custom action dispatch logic | `actionController.start()` + `actionController.fill()` | BoardSmith handles validation, execution, and state management |
| Selection option filtering | Custom filter logic in SectorPanel | Action definition's `filter`/`choices` functions via `actionController.validElements`/`getChoices()` | Action definitions already encode the correct business rules |
| Sector context inference | Manual sector lookup from squad locations | `useSectorState.actionContextSectorId` | Already handles all edge cases including dictator squads |

## Common Pitfalls

### Pitfall 1: chooseFrom vs chooseElement Format Mismatch
**What goes wrong:** SectorPanel fills a `chooseFrom` selection with an element ID when it expects "id:name:isDictator" string format, or vice versa.
**Why it happens:** Different actions use different selection types for similar concepts (unit selection).
**How to avoid:** Check `sel.type` and `sel.name` before filling. `chooseElement` wants element IDs. `chooseFrom` wants the exact string from the choices array.
**Warning signs:** Action silently fails or returns "invalid choice" errors.

### Pitfall 2: Auto-Fill Racing with Async Choice Loading
**What goes wrong:** SectorPanel auto-fills a selection before choices are loaded (especially for dependent selections like mortar's targetSectorName).
**Why it happens:** `dependsOn` choices load asynchronously after the dependency is filled.
**How to avoid:** Use the watch pattern (like mortar does) or check that choices are available before filling.
**Warning signs:** Fill call silently ignored, action stuck in wizard mode.

### Pitfall 3: Filtering Options to Wrong Sector
**What goes wrong:** SectorPanel's `selectableItems` filters MERC options using `allAvailableMercs` which uses the panel's sector, but the action was started from a different sector (e.g., via ActionPanel).
**Why it happens:** `isInActionFlow` can be true for actions started from ActionPanel if squad is in the sector.
**How to avoid:** When `activeActionFromPanel` is null (action started elsewhere), don't filter to sector.
**Warning signs:** Some MERCs not showing up in selection even though the action allows them.

### Pitfall 4: Confusing ActionPanel start vs SectorPanel start
**What goes wrong:** An action started from ActionPanel doesn't get sector context, then SectorPanel tries to show its inline UI without proper context.
**Why it happens:** `isInActionFlow` returns true for sector-relevant actions regardless of where they were started.
**How to avoid:** The `activeActionFromPanel` ref tracks whether SectorPanel initiated the action. Use this to distinguish behavior.
**Warning signs:** Action works from SectorPanel but not from ActionPanel, or vice versa.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct action execution | Wizard mode via `actionController.start()` | Already in place | All sector panel actions use start() |
| Manual element lookup | `actionController.validElements` computed | Already in place | Auto-enriched element data |
| Hard-coded merc lists | `actionController.getChoices(selection)` | Already in place | Server-provided choices |

## Open Questions

1. **feedbackDiscard and repairKit actions**
   - What we know: These actions exist in rebel-equipment.ts but are not exposed in SectorPanel
   - What's unclear: Should they be? They seem like they could be sector-contextual
   - Recommendation: Check if these actions are relevant from sector context, add buttons if so

2. **Dictator perspective actions**
   - What we know: Most actions work for both rebel and dictator players. DictatorPanel handles dictator-specific actions (playTactics, reinforce)
   - What's unclear: Does the SectorPanel correctly show dictator MERC actions (move, explore, etc.) from dictator perspective?
   - Recommendation: Test each SectorPanel action as dictator player

3. **Debug logging cleanup**
   - What we know: Several debug console.log/warn statements exist in SectorPanel and useSectorState
   - What's unclear: Which were left from active debugging vs permanent diagnostics
   - Recommendation: Review each and remove debug-only logging after confirming fixes

## Sources

### Primary (HIGH confidence)
- `src/ui/components/SectorPanel.vue` -- Complete SectorPanel implementation (2184 lines)
- `src/ui/composables/useSectorState.ts` -- Sector state composable (482 lines)
- `src/ui/components/GameTable.vue` -- GameTable wiring all components (1620 lines)
- `src/rules/actions/index.ts` -- Action registration (212 lines)
- `src/rules/actions/rebel-economy.ts` -- explore, train, hospital, armsDealer action definitions
- `src/rules/actions/rebel-equipment.ts` -- reEquip, dropEquipment, docHeal, squidhead*, mortar, detonateExplosives
- `src/rules/actions/rebel-movement.ts` -- move, coordinatedAttack action definitions
- `src/ui/composables/useActionState.ts` -- Action state composable (687 lines)

### Secondary (MEDIUM confidence)
- `src/ui/components/DictatorPanel.vue` -- Reference for how another panel dispatches actions
- `src/ui/App.vue` -- GameShell integration pattern

## Metadata

**Confidence breakdown:**
- Action inventory: HIGH - read all action definitions and SectorPanel source directly
- Inconsistency identification: HIGH - compared action signatures against SectorPanel dispatch code
- Pitfall analysis: HIGH - based on actual code patterns found in codebase

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (stable -- no external dependencies, internal codebase audit)
