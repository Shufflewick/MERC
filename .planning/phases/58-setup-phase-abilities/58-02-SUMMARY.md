---
phase: 58-setup-phase-abilities
plan: 02
subsystem: rules
tags: [dictator-abilities, hussein, tactics, flow, vue-ui, per-turn]

# Dependency graph
requires:
  - phase: 58-01
    provides: Hussein setup ability (10-card deck), established two-path ability pattern
  - phase: 57-simple-hire-abilities
    provides: Per-turn ability flow step pattern (gadafiBonusHire, stalinBonusHire)
provides:
  - applyHusseinBonusTactics AI-path function for auto-playing second card
  - husseinBonusTactics and husseinBonusReinforce human-path actions
  - Full post-effects (artillery, generalissimo, lockdown, combat) after second tactics play
  - DictatorPanel UI routing for Hussein bonus actions
affects:
  - 62-ai-testing (Hussein AI path needs test coverage)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Duplicated post-effects block for second tactics play (intentional -- each play needs its own artillery/generalissimo/lockdown/combat resolution)"
    - "Near-copy actions with distinct names for clear UX prompting (husseinBonusTactics vs playTactics)"

key-files:
  created: []
  modified:
    - src/rules/dictator-abilities.ts
    - src/rules/actions/dictator-actions.ts
    - src/rules/actions/index.ts
    - src/rules/flow.ts
    - src/ui/components/DictatorPanel.vue

key-decisions:
  - "Near-copy of playTactics/reinforce as husseinBonusTactics/husseinBonusReinforce instead of sharing code -- keeps actions independent and avoids coupling"
  - "Hussein bonus steps placed after Conscripts but before hand refill per ability text ('at the end of each of your turns')"
  - "AI draws from deck and auto-plays; human gets card drawn to hand then chooses via action step"

patterns-established:
  - "Post-effects duplication: when a second card play can trigger the same effects, duplicate the full post-effect block (artillery, generalissimo, lockdown, combat)"

# Metrics
duration: 8min
completed: 2026-02-17
---

# Phase 58 Plan 02: Hussein Per-Turn Double Tactics Summary

**Hussein draws and plays a second tactics card each turn with full post-effects (artillery, generalissimo, lockdown, combat) and DictatorPanel UI routing**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-17T18:33:05Z
- **Completed:** 2026-02-17T18:41:14Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- AI Hussein auto-plays top card from deck as bonus tactics each turn via applyHusseinBonusTactics
- Human Hussein sees "Hussein's Ability: Play a second tactics card" prompt with full card/base/equipment selections
- Post-effects (artillery allocation, generalissimo hire, lockdown placement, combat resolution) run after the second play
- DictatorPanel routes husseinBonusTactics/husseinBonusReinforce through sector, base location, and equipment selection UIs

## Task Commits

Each task was committed atomically:

1. **Task 1: AI-path function and human-path actions** - `7a0a1f2` (feat)
2. **Task 2: Flow wiring with post-effects and UI routing** - `fd58713` (feat)

## Files Created/Modified
- `src/rules/dictator-abilities.ts` - Added applyHusseinBonusTactics, imported executeTacticsEffect
- `src/rules/actions/dictator-actions.ts` - Added createHusseinBonusTacticsAction and createHusseinBonusReinforceAction
- `src/rules/actions/index.ts` - Imported and registered both new actions
- `src/rules/flow.ts` - Added Hussein bonus draw/play execute step, action step, and full post-effects block (artillery, generalissimo, lockdown, combat)
- `src/ui/components/DictatorPanel.vue` - Added to dictatorSpecificActions, sector/equipment routing, and action buttons

## Decisions Made
- Near-copy of playTactics/reinforce as husseinBonusTactics/husseinBonusReinforce instead of sharing code -- keeps actions independent and avoids coupling between the normal play and the bonus play
- Hussein bonus steps placed after Conscripts but before hand refill per ability text ("at the end of each of your turns")
- AI draws from deck and auto-plays; human gets card drawn to hand first, then chooses via interactive action step

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing MCTS clone test timeout (Mussolini dictator, 120s limit) -- unrelated to Hussein changes since the new flow steps skip via skipIf for non-Hussein dictators

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 58 complete: all setup-phase abilities implemented (Hussein setup + per-turn, Mao setup, Mussolini setup)
- Ready for Phase 59 (Militia Placement Abilities) which builds on Mao/Mussolini for their per-turn militia placement
- MCTS test timeout is pre-existing and unrelated

---
*Phase: 58-setup-phase-abilities*
*Completed: 2026-02-17*
