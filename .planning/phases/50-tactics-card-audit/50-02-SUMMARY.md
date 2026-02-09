---
phase: 50-tactics-card-audit
plan: 02
subsystem: tactics, ui
tags: [tactics-cards, animation, game-animate, theatre-view, vue-components]

# Dependency graph
requires:
  - phase: 50-01
    provides: clean tactics-effects.ts with correct Block Trade implementation
provides:
  - game.animate() calls in all 12 working tactics effect functions
  - Animation handler registrations in GameTable.vue for 12 event types
  - Visible banner overlay when any tactics card is played
affects: [50-03 (Generalissimo rewrite — will need its own animation), 50-04 (Lockdown rewrite — will need its own animation)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tactics animation: game.animate('tactic-{name}', { cardName, ...data }, () => { mutations })"
    - "Loop-based handler registration for related event types"

key-files:
  created: []
  modified:
    - src/rules/tactics-effects.ts
    - src/ui/components/GameTable.vue

key-decisions:
  - "Artillery Barrage uses pure UI signal (empty callback) since mutations happen through allocation flow"
  - "Sector-targeted events auto-dismiss after 2000ms, banner/flag events after 2500ms"
  - "Single activeTacticEvent ref shared across all 12 event types (no per-card state needed)"
  - "Loop-based handler registration avoids 12 nearly-identical handler blocks"

patterns-established:
  - "Tactics animation pattern: pre-compute data, game.animate with mutations in callback"
  - "Shared banner overlay for all tactics cards (can be upgraded to per-card animations later)"

# Metrics
duration: 4min
completed: 2026-02-08
---

# Phase 50 Plan 02: Tactics Card Audit - Animations Summary

**Added game.animate() calls to all 12 working tactics effects and registered banner animation handlers in GameTable.vue**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-09T02:41:37Z
- **Completed:** 2026-02-09T02:45:42Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- All 8 sector-targeted tactics effects now wrap state mutations inside game.animate() callbacks for correct theatre view behavior
- All 4 banner/flag tactics effects set their persistent flags inside game.animate() callbacks
- GameTable.vue registers animation handlers for all 12 event types with auto-dismissing banner overlay
- Theatre view correctly shows pre-animation state while tactics banner is displayed

## Task Commits

Each task was committed atomically:

1. **Task 1: Add game.animate() to sector-targeted tactics effects (8 cards)** - `b157d07` (feat)
2. **Task 2: Add game.animate() to banner/flag tactics effects (4 cards)** - `1efab27` (feat)
3. **Task 3: Register animation handlers in GameTable.vue for all 12 tactics events** - `4f92269` (feat)

## Files Created/Modified
- `src/rules/tactics-effects.ts` - Added game.animate() calls to all 12 working effect functions with pre-computed data and mutations in callbacks
- `src/ui/components/GameTable.vue` - Added activeTacticEvent ref, registered 12 animation handlers, added banner overlay template

## Decisions Made
- **Artillery Barrage uses pure UI signal:** Since mutations happen through the allocation flow (pendingArtilleryAllocation), the animation uses an empty callback. The data includes sector/hit information for future map highlight animations.
- **Single shared banner overlay:** All 12 tactics cards show the same red banner with card name. Per-card animation components (explosions for artillery, fleeing icons for family threat, etc.) can be added later as polish.
- **Sector events 2000ms, banner events 2500ms:** Banner/flag effects get slightly longer display since they announce permanent changes. Both auto-dismiss without user interaction.
- **Loop-based handler registration:** Rather than 12 individual handler registrations, two loops iterate over const arrays of event types. This keeps the code DRY and makes adding new events trivial.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 12 working tactics cards now fire visible animations when played
- Generalissimo and Lockdown were deliberately not touched (they will be completely rewritten in plans 03 and 04, and will need their own animations added at that time)
- All 650 tests pass with no regressions
- The banner overlay pattern can be extended with per-card animation components when visual polish is desired

---
*Phase: 50-tactics-card-audit*
*Completed: 2026-02-08*
