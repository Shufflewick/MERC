---
phase: 56
plan: 01
subsystem: game-data
tags: [dictators, combatants, lobby, data-foundation]

dependency-graph:
  requires: []
  provides:
    - "9 expansion dictator entries in combatants.json"
    - "11 dictator choices in lobby dropdown"
    - "Expanded DictatorAbilityType for all 11 dictators"
  affects:
    - "Phase 57: Simple Hire Abilities"
    - "Phase 58: Setup Abilities"
    - "Phase 59: Complex Per-Turn Abilities"
    - "Phase 60: Reactive Abilities"
    - "Phase 61: Interactive Abilities"
    - "Phase 62: AI Integration"

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - data/combatants.json
    - src/rules/index.ts
    - src/rules/dictator-abilities.ts

decisions:
  - id: "gadafi-id"
    description: "Use 'gadafi' (single d) as ID to match existing image filename gadafi.png"
  - id: "csv-ability-text"
    description: "Use CSV ability text verbatim as canonical game-card text in combatants.json"

metrics:
  duration: "6 minutes"
  completed: "2026-02-17"
---

# Phase 56 Plan 01: Add Expansion Dictators to Game Data Summary

**One-liner:** 9 expansion dictators added to combatants.json with CSV stats, lobby dropdown expanded to 12 choices, DictatorAbilityType covers all 11 IDs.

## What Was Done

### Task 1: Add 9 expansion dictators to game data (60ddb5a)

Added 9 dictator entries to `data/combatants.json` using exact stats and ability text from `data/expansion dictators.csv`:

| ID | Name | Init | Combat | Training |
|----|------|------|--------|----------|
| gadafi | Gaddafi | 2 | 2 | 2 |
| hitler | Hitler | 0 | 3 | 3 |
| hussein | Hussein | 4 | 1 | 1 |
| mao | Mao | 2 | 1 | 3 |
| mussolini | Mussolini | 3 | 0 | 3 |
| noriega | Noriega | 1 | 4 | 1 |
| pinochet | Pinochet | 1 | 3 | 2 |
| polpot | Pol Pot | 2 | 2 | 2 |
| stalin | Stalin | 2 | 3 | 1 |

Updated `src/rules/index.ts` lobby dropdown with 9 new choices (12 total: Random + 11 dictators), each with a short ability summary label.

Expanded `DictatorAbilityType` in `src/rules/dictator-abilities.ts` from `'castro' | 'kim'` to include all 9 new IDs.

### Task 2: Verify expansion dictators work in-game (verification only)

- All 693 tests pass (1 pre-existing timeout in mcts-clone.test.ts unrelated to changes)
- All 9 expansion dictator image files confirmed in `public/dictators/`
- TypeScript compiles cleanly (`npx tsc --noEmit`)
- JSON validated successfully
- 11 dictator entries confirmed in combatants.json

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Use `gadafi` as ID (not `gaddafi`) | Matches existing image filename `public/dictators/gadafi.png` |
| Use CSV ability text verbatim | CSV contains canonical game-card text; implementation details belong in requirements |
| Include `"sex": "M"` on all dictators | Consistency with existing Castro and Kim entries |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

1. TypeScript compiles: PASS
2. Tests pass: 693/693 (1 pre-existing timeout excluded)
3. JSON valid: PASS
4. Dictator count: 11 entries with cardType "dictator"
5. Lobby choices: 12 entries (Random + 11 dictators)
6. Image files: all 9 confirmed in public/dictators/

## Next Phase Readiness

Phase 56 is complete. All 9 expansion dictators exist as stat-only combatants. The existing `default` cases in ability dispatchers handle them gracefully (no-op). Phase 57 (Simple Hire Abilities) can begin implementing Gaddafi, Hitler, and Stalin ability logic against the data foundation established here.
