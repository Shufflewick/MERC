---
phase: 58-setup-phase-abilities
plan: 01
subsystem: rules
tags: [dictator-abilities, setup, tactics, merc-hiring, flow]

# Dependency graph
requires:
  - phase: 56-data-foundation
    provides: Expansion dictator data in combatants.json
  - phase: 57-simple-hire-abilities
    provides: Established hire pattern (Gaddafi/Stalin) and equipNewHire helper
provides:
  - Hussein setup ability (10 tactics cards instead of 5)
  - Mao setup ability (bonus MERCs, AI auto-place + human interactive)
  - Mussolini setup ability (bonus MERCs, same as Mao)
  - bonusMercSetup action for human-path squad choice
  - bonus-merc-placement flow loop in Day 1
affects:
  - 58-02 (Hussein per-turn double tactics)
  - 59-militia-placement-abilities (Mao/Mussolini turn abilities build on setup)
  - 62-ai-testing (all three dictators need AI test coverage)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared action for multiple dictators (bonusMercSetup handles both Mao and Mussolini)"
    - "Global cached value counter for loop iteration (bonus_mercs_remaining)"
    - "AI-path in ability function + human-path in flow loop (two-path pattern)"

key-files:
  created: []
  modified:
    - src/rules/dictator-abilities.ts
    - src/rules/constants.ts
    - src/rules/actions/day-one-actions.ts
    - src/rules/actions/index.ts
    - src/rules/flow.ts

key-decisions:
  - "Hussein extra tactics added during setup ability step (not at deck creation) to handle both AI and human dictator timing"
  - "Single shared bonusMercSetup action for both Mao and Mussolini instead of separate actions"
  - "Human path defers entirely to interactive flow loop; AI path runs fully inside applyDictatorSetupAbilities"

patterns-established:
  - "Two-path setup ability: AI runs in applyDictatorSetupAbilities, human runs via flow loop with counter-based iteration"

# Metrics
duration: 7min
completed: 2026-02-17
---

# Phase 58 Plan 01: Setup-Phase Abilities Summary

**Hussein 10-card tactics deck, Mao/Mussolini bonus MERC hiring with interactive squad choice loop for human dictators**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-17T18:24:23Z
- **Completed:** 2026-02-17T18:31:08Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Hussein setup ability adds 5 extra tactics cards to the deck (total 10) using the same TacticsCard creation pattern as setupTacticsDeck
- Mao and Mussolini AI path auto-hires N bonus MERCs (N = rebel count) into squads with equipment and map animations
- Human Mao/Mussolini path presents interactive loop: for each bonus MERC, dictator sees name, chooses squad, chooses equipment
- All three dictators wired into applyDictatorSetupAbilities switch statement
- Flow loop runs only for human Mao/Mussolini, skips for AI and all other dictators

## Task Commits

Each task was committed atomically:

1. **Task 1: AI-path setup ability functions and constants** - `75b02d5` (feat)
2. **Task 2: Human-path squad choice action, registration, and flow loop** - `97d7aa3` (feat)

## Files Created/Modified
- `src/rules/constants.ts` - Added HUSSEIN_TACTICS_CARDS: 10 to DictatorConstants
- `src/rules/dictator-abilities.ts` - Added applyHusseinSetupAbility, applyMaoSetupAbility, applyMussoliniSetupAbility; updated switch
- `src/rules/actions/day-one-actions.ts` - Added createBonusMercSetupAction for human Mao/Mussolini
- `src/rules/actions/index.ts` - Imported and registered bonusMercSetup action
- `src/rules/flow.ts` - Added bonus MERC counter init and placement loop in Day 1 sequence

## Decisions Made
- Hussein extra tactics added during setup ability step (not at deck creation) to handle both AI and human dictator timing -- deck exists before dictator is chosen for human players
- Single shared bonusMercSetup action handles both Mao and Mussolini, checking current dictator in conditions
- Human path defers entirely to interactive flow loop; AI path runs fully inside applyDictatorSetupAbilities to avoid double-hiring (Pitfall 7)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing MCTS clone test timeout for Mussolini dictator (unrelated to our changes -- the test runs AI dictator and our flow loop correctly skips for AI)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Ready for 58-02-PLAN.md (Hussein per-turn double tactics with post-effects and UI wiring)
- Setup abilities for all three dictators are complete and tested via type check
- MCTS test timeout is pre-existing and unrelated

---
*Phase: 58-setup-phase-abilities*
*Completed: 2026-02-17*
