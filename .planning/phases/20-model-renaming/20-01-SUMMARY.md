---
phase: 20-model-renaming
plan: 01
subsystem: rules
tags: [typescript, class-hierarchy, model, naming]

# Dependency graph
requires:
  - phase: 15-icon-renaming
    provides: CombatantIcon component naming established
provides:
  - CombatantBase abstract base class with combatantId/combatantName
  - CombatantModel abstract model class for MERCs and Dictators
  - Backward-compat aliases for CombatUnit and CombatUnitCard
  - Abstract getter pattern for identity properties
affects: [21-model-renaming, UI components that reference combatant classes]

# Tech tracking
tech-stack:
  added: []
  patterns: [abstract getter for polymorphic identity]

key-files:
  created: []
  modified:
    - src/rules/elements.ts
    - src/rules/ai-helpers.ts

key-decisions:
  - "Used abstract getters for combatantId/combatantName to allow subclass implementations"
  - "Made CombatantModel abstract since it cannot be instantiated directly"
  - "Added CombatUnitCard export alias for backward compatibility"

patterns-established:
  - "Identity inheritance: CombatantBase (abstract) -> CombatantModel (abstract) -> MercCard/DictatorCard"
  - "Subclasses provide combatantId via getters that return their specific ID property (mercId, dictatorId)"
  - "Backward-compat getters in parent classes call canonical properties"

issues-created: []

# Metrics
duration: 23min
completed: 2026-01-14
---

# Phase 20-01: Model Renaming Summary

**Renamed CombatUnit to CombatantBase and CombatUnitCard to CombatantModel with unified combatantId/combatantName identity properties**

## Performance

- **Duration:** 23 min
- **Started:** 2026-01-14T17:23:26Z
- **Completed:** 2026-01-14T17:46:14Z
- **Tasks:** 3 + 1 fix
- **Files modified:** 2

## Accomplishments

- Renamed CombatUnit abstract base class to CombatantBase
- Established combatantId/combatantName as canonical identity properties via abstract getters
- Renamed CombatUnitCard to CombatantModel with backward-compat export alias
- Updated MercCard/DictatorCard to implement combatantId/combatantName getters
- Maintained all backward-compat getters (unitId, unitName, mercId, mercName, dictatorId, dictatorName)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename CombatUnit to CombatantBase** - `3d80ea3` (feat)
2. **Task 2: Rename CombatUnitCard to CombatantModel** - `1ff488f` (feat)
3. **Task 3: Update MercCard and DictatorCard subclasses** - `3937f45` (feat)
4. **Fix: Remove incompatible backward-compat getters** - `535c87a` (fix)

## Files Created/Modified

- `src/rules/elements.ts` - Renamed classes, updated identity properties, added abstract getters
- `src/rules/ai-helpers.ts` - Updated CombatUnit import to CombatUnitCard

## Decisions Made

1. **Abstract getters for identity**: Made combatantId/combatantName abstract getters in CombatantBase so subclasses can provide implementations via their specific properties (mercId, dictatorId).

2. **Made CombatantModel abstract**: Since CombatantModel inherits abstract members and cannot be instantiated directly, made it abstract. Only MercCard and DictatorCard can be instantiated.

3. **Export alias for backward compat**: Added `export { CombatantModel as CombatUnitCard }` to maintain API compatibility with existing code that imports CombatUnitCard.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used abstract getters instead of declare properties**
- **Found during:** Task 3 (updating subclasses)
- **Issue:** TypeScript TS2611 error - cannot override declared property with getter
- **Fix:** Changed combatantId/combatantName from `declare` properties to `abstract get` accessors in CombatantBase
- **Files modified:** src/rules/elements.ts
- **Verification:** TypeScript compiles (same pre-existing errors as before)
- **Committed in:** 3937f45 (Task 3 commit)

**2. [Rule 3 - Blocking] Made CombatantModel abstract**
- **Found during:** Task 3 (updating subclasses)
- **Issue:** CombatantModel inherits abstract members but was declared as concrete class
- **Fix:** Added `abstract` keyword to CombatantModel class declaration
- **Files modified:** src/rules/elements.ts
- **Verification:** TypeScript compiles correctly
- **Committed in:** 3937f45 (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking TypeScript issues, 1 bug)
**Impact on plan:** All auto-fixes necessary for TypeScript compilation. Architecture improved with abstract getter pattern.

## Issues Encountered

**3. [Rule 1 - Bug] TypeScript accessor/property conflict (TS2610)**
- **Found during:** Post-execution verification
- **Issue:** CombatantModel had backward-compat getters (mercId/mercName/dictatorId/dictatorName) that conflicted with MercCard/DictatorCard properties
- **Fix:** Removed redundant getters from CombatantModel - subclasses provide these properties directly from JSON
- **Files modified:** src/rules/elements.ts
- **Verification:** TypeScript compiles without accessor/property errors in elements.ts
- **Committed in:** `535c87a` (fix commit)

Test failures are pre-existing (48 failures with changes vs 52 failures before plan execution - improved by 4).

## Next Phase Readiness

- Class hierarchy established: CombatantBase -> CombatantModel -> MercCard/DictatorCard
- combatantId/combatantName are the canonical identity properties
- All backward-compat getters maintained
- Ready for next phase (21) to update remaining references throughout codebase

---
*Phase: 20-model-renaming*
*Completed: 2026-01-14*
