---
phase: 57-simple-hire-abilities
plan: 01
subsystem: dictator-abilities
tags: [gaddafi, stalin, hire, dictator-ability, ai-path, human-path]
depends_on: [56]
provides:
  - AI-path Gaddafi turn ability (applyGadafiTurnAbility)
  - AI-path Stalin turn ability (applyStalinTurnAbility)
  - Human-path Gaddafi hire action (gadafiBonusHire)
  - Human-path Stalin hire action (stalinBonusHire)
  - Action registration for both new actions
affects: [57-02]
tech-stack:
  added: []
  patterns: [two-path-dictator-ability, cached-value-action-state]
key-files:
  created: []
  modified:
    - src/rules/dictator-abilities.ts
    - src/rules/actions/dictator-actions.ts
    - src/rules/actions/index.ts
decisions: []
metrics:
  duration: 3m
  completed: 2026-02-17
---

# Phase 57 Plan 01: AI and Human Path Hire Abilities Summary

Gaddafi and Stalin per-turn hire abilities following the established Castro two-path pattern -- AI auto-applies, human gets equipment/sector choices.

## What Was Done

### Task 1: AI-path functions and switch cases
- Added `applyGadafiTurnAbility()`: draws 1 MERC, places in first non-full squad (primary preferred), auto-equips (Weapon > Armor > Accessory), selects sector via AI rules, updates squad bonuses
- Added `applyStalinTurnAbility()`: first hire always to primary squad; conditional second hire to secondary squad when `baseRevealed === true`; each hire independently handled (draw, place, equip, message)
- Added `case 'gadafi'` and `case 'stalin'` to `applyDictatorTurnAbilities` switch
- Zero animation imports/calls in AI path (no UI listener during execute)

### Task 2: Human-path actions and registration
- Added `createGadafiBonusHireAction()`: single drawn MERC shown as read-only choice, then equipment type and sector selection; uses `_gadafi_drawn_merc` cached value key
- Added `createStalinBonusHireAction()`: human chooses equipment/sector for primary hire only; secondary hire auto-placed in execute when base revealed (BoardSmith `chooseFrom` lacks `skipIf`)
- Both actions follow Castro's sector choice logic: check squad occupancy, filter to dictator-controlled sectors, fallback to industries
- Both actions use cached value pattern to persist drawn MERC ID across selection steps
- Added `selectNewMercLocation` import to dictator-actions.ts for Stalin's auto-placed secondary hire
- Registered both actions in `registerAllActions` in index.ts

## Decisions Made

None -- all implementation decisions were pre-made in the plan based on Castro pattern analysis.

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 64b7f36 | feat | AI-path Gaddafi and Stalin turn abilities |
| ead21d9 | feat | Human-path Gaddafi and Stalin hire actions with registration |

## Next Phase Readiness

Plan 57-02 can proceed. It needs to:
1. Add `gadafiBonusHire` and `stalinBonusHire` to the flow.ts `dictator-ability` action step
2. Add both action names to UI routing files (DictatorPanel.vue, useActionState.ts, GameTable.vue)
