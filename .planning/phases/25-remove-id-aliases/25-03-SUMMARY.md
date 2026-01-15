---
phase: 25-remove-id-aliases
plan: 03
status: complete
started: 2026-01-15
completed: 2026-01-15
duration: 25 min
---

# Summary: Replace alias properties in UI and Tests

## What Changed

Replaced all `.mercId/.mercName/.dictatorId/.dictatorName` property accesses with `.combatantId/.combatantName` across 11 Vue component files and 6 test files (~160 occurrences total).

## Commits

- `64202fd` - refactor(25-03): replace alias properties in Vue components
- `a9a5578` - refactor(25-03): replace alias properties in test files
- `43b1720` - refactor(25-03): add combatantId fallback patterns in templates

## Key Files Modified

**Vue Components:**
- CombatantIcon.vue: Update prop names and internal references
- CombatantIconSmall.vue: Update prop names and internal references
- DrawEquipmentType.vue: Update prop names
- GameBoard.vue: Update computed arrays, helper functions, template bindings
- SectorPanel.vue: Update getAttr calls, template bindings, computed logic
- SectorTile.vue: Update interface, helper functions, template bindings
- DictatorPanel.vue: Update template bindings with fallback patterns
- CombatPanel.vue: Update getCombatantDisplay function and template bindings
- SquadPanel.vue: Update interface and helper functions
- App.vue: Update attribute checks

**Test Files:**
- merc-abilities-integration.test.ts: 75+ property accesses + mock objects
- error-conditions.test.ts: 7 occurrences
- team-limit.test.ts: 6 occurrences
- combat-abilities.test.ts: 4 occurrences
- hagness-vulture.test.ts: 2 occurrences
- smoke.test.ts: 1 occurrence

## Approach

1. Updated Vue component props from mercId/mercName to combatantId/combatantName
2. Updated all getAttr() calls with new property names
3. Updated template bindings to use combatantId || mercId fallback pattern
4. Updated computed properties that produce merc data objects
5. Updated test files with sed replace, then fixed mock object properties
6. Added backward-compat fallbacks where data might come from either source

## Verification

- Build: Passes
- Tests: 524 passed, 1 skipped
- Remaining usages: All are `combatantId || mercId` fallback patterns (intentional for backward compat)

## Notes

The remaining alias property usages in UI are all fallback patterns like `combatantId || mercId` or `combatantName || mercName`. These are intentional to support backward compatibility during the migration period.

Plan 25-04 will remove the backward-compat getters from the model classes, at which point these fallbacks can be simplified.
