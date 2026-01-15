---
phase: 25-remove-id-aliases
plan: 04
status: complete
started: 2026-01-15
completed: 2026-01-15
duration: 15 min
---

# Summary: Remove Backward-Compat Getters

## What Changed

Removed all backward-compatibility alias getters from combatant classes, completing the Phase 25 cleanup:

- Removed `mercId`/`mercName` getters from MercCard
- Removed `dictatorId`/`dictatorName` getters from DictatorCard
- Removed `unitId`/`unitName` getters from CombatantBase
- Updated CLAUDE.md to reflect simplified class hierarchy

## Commits

- `cf6a24e` - refactor(25-04): remove backward-compat getters from MercCard and DictatorCard
- `d12d055` - refactor(25-04): remove unitId/unitName aliases from CombatantBase
- `993d7f0` - docs(25-04): update CLAUDE.md to reflect unified combatantId/combatantName

## Key Files Modified

**Elements:**
- `src/rules/elements.ts`: MercCard and DictatorCard are now thin subclasses with no ID aliases; CombatantBase has no unitId/unitName aliases

**Documentation:**
- `CLAUDE.md`: Updated Class Hierarchy, Identity Properties, and Common Tasks sections

## Final Class Structure

```
CombatantBase (abstract)
├── combatantId/combatantName - abstract getters

CombatantModel extends CombatantBase
├── _combatantId/_combatantName - stored properties
├── combatantId/combatantName - getters/setters

MercCard extends CombatantModel
└── Sets cardType = 'merc'

DictatorCard extends CombatantModel
└── Sets cardType = 'dictator', inPlay = false
```

## Verification

- Build: Passes
- Tests: 524 passed, 1 skipped
- Grep verification: No `mercId|mercName|dictatorId|dictatorName|unitId|unitName` in elements.ts

## Phase 25 Complete

ID aliases have been eliminated from the codebase. The combatant identity model is now unified:

- **combatantId** / **combatantName** are the only identity properties
- No backward-compat aliases remain
- Documentation updated to reflect clean class hierarchy
