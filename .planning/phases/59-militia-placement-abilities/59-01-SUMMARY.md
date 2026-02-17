---
phase: 59-militia-placement-abilities
plan: 01
subsystem: rules
tags: [dictator-abilities, militia, mao, wilderness, flow, actions]

# Dependency graph
requires:
  - phase: 58-setup-phase-abilities
    provides: "Dictator ability infrastructure, Kim/Hussein per-turn patterns"
provides:
  - "Mao AI militia placement on wilderness sectors"
  - "Mao human interactive militia distribution with loop"
  - "pendingMaoMilitia game state field"
  - "maoBonusMilitia action registration"
affects: [59-02 (Mussolini militia placement), 59-03 (Amin militia placement)]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Mao wilderness militia loop follows Lockdown multi-sector pattern"]

key-files:
  created: []
  modified:
    - src/rules/game.ts
    - src/rules/dictator-abilities.ts
    - src/rules/actions/dictator-actions.ts
    - src/rules/actions/index.ts
    - src/rules/flow.ts
    - src/ui/components/DictatorPanel.vue

key-decisions:
  - "AI distributes militia one-at-a-time to spread across wilderness sectors"
  - "Human path uses Lockdown loop pattern: first placement in dictator-ability step, loop for rest"

patterns-established:
  - "Wilderness-only militia placement: filter sectors with isWilderness and cap check"

# Metrics
duration: 2min
completed: 2026-02-17
---

# Phase 59 Plan 01: Mao Militia Placement Summary

**Mao per-turn ability placing militia equal to rebel-controlled sectors across wilderness sectors, with AI auto-distribution and human interactive loop**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T19:05:10Z
- **Completed:** 2026-02-17T19:07:38Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Mao AI path distributes militia one-at-a-time across wilderness sectors using selectMilitiaPlacementSector
- Mao human path presents interactive sector + amount choices in a loop until all militia placed
- Combat queued when militia placed on rebel-occupied wilderness sectors
- Standard 10-per-sector cap enforced via Sector.MAX_MILITIA_PER_SIDE

## Task Commits

Each task was committed atomically:

1. **Task 1: Mao AI path and game state** - `1b1a11f` (feat)
2. **Task 2: Mao human action, flow loop, and registration** - `a317f82` (feat)

## Files Created/Modified
- `src/rules/game.ts` - Added pendingMaoMilitia state field and hasMaoMilitiaPending getter
- `src/rules/dictator-abilities.ts` - Added applyMaoTurnAbility AI function and dispatcher case
- `src/rules/actions/dictator-actions.ts` - Added createMaoBonusMilitiaAction for human players
- `src/rules/actions/index.ts` - Import and registration of maoBonusMilitia action
- `src/rules/flow.ts` - Human Mao initialization, actionStep entry, and mao-militia-distribution loop
- `src/ui/components/DictatorPanel.vue` - Added maoBonusMilitia to dictatorSpecificActions and isSelectingSector

## Decisions Made
- AI distributes militia one-at-a-time (spreading across sectors) rather than dumping all on one sector, matching the wilderness theme
- Human path reuses Lockdown loop pattern: first placement in the main dictator-ability actionStep, subsequent placements via dedicated loop

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Mao militia placement complete, ready for Plan 02 (Mussolini) or Plan 03 (Amin)
- Pattern established for wilderness-only militia filtering that other dictators can reference

---
*Phase: 59-militia-placement-abilities*
*Completed: 2026-02-17*
