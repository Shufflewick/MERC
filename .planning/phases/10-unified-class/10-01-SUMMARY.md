---
phase: 10-unified-class
plan: 01
subsystem: core
tags: [typescript, class-hierarchy, refactoring]

# Dependency graph
requires:
  - phase: 09-add-discriminator
    provides: cardType discriminator on MercCard/DictatorCard
provides:
  - CombatUnitCard unified class
  - MercCard/DictatorCard as thin wrappers
affects: [11-migrate-instanceof, 12-merge-data-files]

# Tech tracking
tech-stack:
  added: []
  patterns: [class-hierarchy-unification, backward-compat-wrappers]

key-files:
  created: []
  modified: [src/rules/elements.ts]

key-decisions:
  - "CombatUnitCard placed between CombatUnit and MercCard/DictatorCard"
  - "inPlay defaults to true (mercs), overridden to false in DictatorCard"
  - "Equipment overrides (Apeiron/Gunther/Genesis) moved to CombatUnitCard using unitId checks"

patterns-established:
  - "Unified class with thin subclass wrappers for backward compatibility"

issues-created: []

# Metrics
duration: 3min
completed: 2026-01-11
---

# Phase 10 Plan 01: Unified Class Summary

**Created CombatUnitCard class combining MercCard and DictatorCard functionality with thin subclass wrappers**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-11T21:42:00Z
- **Completed:** 2026-01-11T21:45:55Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Created `CombatUnitCard` class extending `CombatUnit` with all unified functionality
- Moved cardType discriminator, isMerc/isDictator getters to CombatUnitCard
- Moved dictator-specific state (inPlay, baseSectorId, enterPlay()) to CombatUnitCard
- Moved merc-specific equipment overrides (Apeiron, Gunther, Genesis) to CombatUnitCard
- Added backward-compat getters (mercId, mercName, dictatorId, dictatorName)
- Made MercCard and DictatorCard thin wrappers extending CombatUnitCard

## Task Commits

1. **Tasks 1-2: Create CombatUnitCard and make subclasses extend it** - `e381cb1` (feat)

**Plan metadata:** pending

## Files Created/Modified

- `src/rules/elements.ts` - Added CombatUnitCard class, refactored MercCard and DictatorCard to extend it

## Decisions Made

- CombatUnitCard placed in inheritance chain between CombatUnit (abstract) and MercCard/DictatorCard
- `inPlay` defaults to `true` in CombatUnitCard (mercs always in play), overridden to `false` in DictatorCard
- Equipment overrides use `unitId` checks so they work regardless of subclass

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- CombatUnitCard class ready for use
- MercCard/DictatorCard maintain full backward compatibility
- Existing `instanceof MercCard`/`instanceof DictatorCard` checks still work
- Ready for Phase 10 Plan 02 (if exists) or Phase 11: Migrate instanceof

---
*Phase: 10-unified-class*
*Completed: 2026-01-11*
