---
phase: 61-reactive-abilities
plan: 02
subsystem: dictator-abilities
tags: [gaddafi, equipment-loot, reactive-ability, post-combat]
dependency-graph:
  requires: [61-01-reactive-abilities]
  provides: [gaddafi-equipment-loot, gaddafi-loot-ai, gaddafi-loot-human]
  affects: []
tech-stack:
  added: []
  patterns: [equipment-staging-and-reclaim, closure-onselect-filter-chain]
key-files:
  created: []
  modified:
    - src/rules/game.ts
    - src/rules/combat.ts
    - src/rules/dictator-abilities.ts
    - src/rules/flow.ts
    - src/rules/actions/dictator-actions.ts
    - src/rules/actions/index.ts
    - src/ui/components/DictatorPanel.vue
decisions:
  - "Equipment staged by BoardSmith element ID (not equipment string ID) for reliable discard pile lookup"
  - "onSelect closure pattern bridges chooseFrom selection to chooseElement filter (BoardSmith filter callback has no args access)"
metrics:
  duration: ~6 minutes
  completed: 2026-02-17
---

# Phase 61 Plan 02: Gaddafi Equipment Loot Summary

Implemented Gaddafi's reactive equipment loot ability: when dictator forces kill a rebel MERC in combat, their equipment is staged for looting by dictator MERCs in the same sector.

## What Was Built

### Task 1: Gaddafi Loot Staging, Combat Hooks, and AI Processing
- Added `_gaddafiLootableEquipment` staging field to MERCGame (array of `{ equipmentId, sectorId }` or null)
- Hooked all 3 equipment discard points in combat.ts to stage rebel MERC equipment for Gaddafi loot:
  - Location 1: `applyMilitiaBatchDamage` (militia kills rebel MERC)
  - Location 2: Individual attacker kills MERC (per-attacker combat resolution)
  - Location 3: `applyCombatResults` fallback (batch combat results)
- Each hook guards with `!merc.isDictator` to only stage rebel equipment
- Created `findEquipmentInDiscards` helper: searches Weapon/Armor/Accessory discard piles by element ID
- Created `processGaddafiLoot` function for AI auto-equip: finds first dictator MERC in sector with open slot of matching type

### Task 2: Flow Integration, Human Action, and UI Wiring
- Added AI auto-loot execute block in combatResolutionFlow (after retreat decisions, before clearActiveCombat)
- Added human interactive loot loop in combatResolutionFlow with `gaddafiLootEquipment` and `gaddafiDiscardLoot` actions
- Created `gaddafiLootEquipment` action: chooseFrom (equipment list) -> chooseElement (recipient MERC) -> execute (equip)
- Created `gaddafiDiscardLoot` action: immediately clears staging, skipping all remaining loot
- Registered both actions in index.ts
- Added both action names to DictatorPanel.vue dictatorSpecificActions array
- Used onSelect closure pattern to pass equipment selection from chooseFrom to chooseElement filter (BoardSmith filter callback only receives element and context, not previous args)

## Design Decisions

- **Equipment ID is BoardSmith element ID (number)**: Uses `equip.id` not `equip.equipmentId` (string). Element IDs are unique per game element, making discard pile lookup reliable even with duplicate equipment types.
- **onSelect + closure variable pattern**: The chooseElement `filter` callback does not receive previous selection args. Used `onSelect` on the chooseFrom step to capture the selected index in a closure variable, then the chooseElement filter reads it.
- **Loot triggers in combatResolutionFlow**: Placed inside the shared resolution flow so it fires after every combat type (rebel-phase, dictator-phase, ability-triggered) without duplicating logic.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- TypeScript compilation: zero errors
- All grep verification checks pass for all function names, state fields, and action registrations across all specified files
- `_gaddafiLootableEquipment` in game.ts: 1 occurrence (field declaration)
- `_gaddafiLootableEquipment` in combat.ts: 6 occurrences (2 per discard point: null init + push)
- `processGaddafiLoot` in flow.ts: 2 occurrences (import + call)
- `gaddafi-loot` loop name in flow.ts: 2 occurrences (loop name + action step name)
- Both actions registered in index.ts and routed through DictatorPanel.vue
