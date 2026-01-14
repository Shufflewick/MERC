# Roadmap: MERC Codebase Cleanup

## Overview

A systematic cleanup moving from type safety foundations through code quality improvements to comprehensive test coverage, ensuring the codebase reaches ship confidence without regressions.

## Milestones

- ✅ **v1.0 Codebase Cleanup** — Phases 1-6 (shipped 2026-01-09)
- ✅ **v1.1 Polish** — Phases 7-8 (shipped 2026-01-09)
- ✅ **v1.2 Merge Dictator and Merc Cards** — Phases 9-13 (shipped 2026-01-11)
- ✅ **v1.3 Combatant Unification** — Phases 14-19 (shipped 2026-01-13)
- 🚧 **v1.4 Combatant Naming Unification** — Phases 20-23 (in progress)

## Completed Milestones

- ✅ [v1.0 Codebase Cleanup](milestones/v1.0-ROADMAP.md) (Phases 1-6) — SHIPPED 2026-01-09
- ✅ [v1.1 Polish](milestones/v1.1-ROADMAP.md) (Phases 7-8) — SHIPPED 2026-01-09
- ✅ [v1.2 Merge Dictator and Merc Cards](milestones/v1.2-ROADMAP.md) (Phases 9-13) — SHIPPED 2026-01-11
- ✅ [v1.3 Combatant Unification](milestones/v1.3-ROADMAP.md) (Phases 14-19) — SHIPPED 2026-01-13

<details>
<summary>✅ v1.0 Codebase Cleanup (Phases 1-6) — SHIPPED 2026-01-09</summary>

- [x] Phase 1: Type Safety: Combat State (1/1 plans) — completed 2026-01-08
- [x] Phase 2: Type Safety: Assertions (8/8 plans) — completed 2026-01-08
- [x] Phase 3: Code Quality: Helpers (4/4 plans) — completed 2026-01-08
- [x] Phase 4: Code Quality: State & Legacy (3/3 plans) — completed 2026-01-08
- [x] Phase 5: Debug Cleanup (1/1 plan) — completed 2026-01-08
- [x] Phase 6: Test Coverage (3/3 plans) — completed 2026-01-09

</details>

<details>
<summary>✅ v1.1 Polish (Phases 7-8) — SHIPPED 2026-01-09</summary>

- [x] Phase 7: File Organization (2/2 plans) — completed 2026-01-09
- [x] Phase 8: Artillery Barrage (4/4 plans) — completed 2026-01-09

</details>

<details>
<summary>✅ v1.2 Merge Dictator and Merc Cards (Phases 9-13) — SHIPPED 2026-01-11</summary>

- [x] Phase 9: Add Discriminator (1/1 plan) — completed 2026-01-11
- [x] Phase 10: Unified Class (1/1 plan) — completed 2026-01-11
- [x] Phase 11: Migrate instanceof (3/3 plans) — completed 2026-01-11
- [x] Phase 12: Merge Data Files (1/1 plan) — completed 2026-01-11
- [x] Phase 13: Remove Legacy (1/1 plan) — completed 2026-01-11

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Type Safety: Combat State | v1.0 | 1/1 | Complete | 2026-01-08 |
| 2. Type Safety: Assertions | v1.0 | 8/8 | Complete | 2026-01-08 |
| 3. Code Quality: Helpers | v1.0 | 4/4 | Complete | 2026-01-08 |
| 4. Code Quality: State & Legacy | v1.0 | 3/3 | Complete | 2026-01-08 |
| 5. Debug Cleanup | v1.0 | 1/1 | Complete | 2026-01-08 |
| 6. Test Coverage | v1.0 | 3/3 | Complete | 2026-01-09 |
| 7. File Organization | v1.1 | 2/2 | Complete | 2026-01-09 |
| 8. Artillery Barrage | v1.1 | 4/4 | Complete | 2026-01-09 |
| 9. Add Discriminator | v1.2 | 1/1 | Complete | 2026-01-11 |
| 10. Unified Class | v1.2 | 1/1 | Complete | 2026-01-11 |
| 11. Migrate instanceof | v1.2 | 3/3 | Complete | 2026-01-11 |
| 12. Merge Data Files | v1.2 | 1/1 | Complete | 2026-01-11 |
| 13. Remove Legacy | v1.2 | 1/1 | Complete | 2026-01-11 |
| 14. Image Path Fixes | v1.3 | 1/1 | Complete | 2026-01-13 |
| 15. Rename to Combatant | v1.3 | 1/1 | Complete | 2026-01-13 |
| 16. Abilities for Controller | v1.3 | 1/1 | Complete | 2026-01-13 |
| 17. Hiring Unification | v1.3 | 1/1 | Complete | 2026-01-13 |
| 18. Data Consistency | v1.3 | 1/1 | Complete | 2026-01-13 |
| 19. Victory/Defeat Fixes | v1.3 | 1/1 | Complete | 2026-01-13 |
| 20. Model Renaming | v1.4 | 1/3 | In progress | - |
| 21. Vue Component Renaming | v1.4 | 0/? | Not started | - |
| 22. Reference Updates | v1.4 | 0/? | Not started | - |
| 23. Documentation | v1.4 | 0/? | Not started | - |

<details>
<summary>✅ v1.3 Combatant Unification (Phases 14-19) — SHIPPED 2026-01-13</summary>

- [x] Phase 14: Image Path Fixes (1/1 plan) — completed 2026-01-13
- [x] Phase 15: Rename to Combatant (1/1 plan) — completed 2026-01-13
- [x] Phase 16: Abilities for Controller (1/1 plan) — completed 2026-01-13
- [x] Phase 17: Hiring Unification (1/1 plan) — completed 2026-01-13
- [x] Phase 18: Data Consistency (1/1 plan) — completed 2026-01-13
- [x] Phase 19: Victory/Defeat Fixes (1/1 plan) — completed 2026-01-13

</details>

### 🚧 v1.4 Combatant Naming Unification (In Progress)

**Milestone Goal:** Eliminate naming confusion between model classes and Vue components, unify combatant identity properties

#### Phase 20: Model Renaming

**Goal**: Rename `CombatUnitCard` → `CombatantModel`, unify `combatantId`/`combatantName` properties, maintain backward-compat with `MercCard`/`DictatorCard` subclasses
**Depends on**: Previous milestone complete
**Research**: Unlikely (internal refactoring)
**Plans**: 3

Plans:
- [x] 20-01: Core model renaming (CombatUnit → CombatantBase, CombatUnitCard → CombatantModel)
- [ ] 20-02: Update imports/exports in rules layer
- [ ] 20-03: Update AI helpers, remaining files, and tests

#### Phase 21: Vue Component Renaming

**Goal**: Rename `MercCard.vue` → `CombatantCard.vue`, update all imports and usages
**Depends on**: Phase 20
**Research**: Unlikely (internal refactoring)
**Plans**: TBD

Plans:
- [ ] 21-01: TBD

#### Phase 22: Reference Updates

**Goal**: Update JSON data files, type guards, and any remaining references
**Depends on**: Phase 21
**Research**: Unlikely (internal refactoring)
**Plans**: TBD

Plans:
- [ ] 22-01: TBD

#### Phase 23: Documentation

**Goal**: Add CLAUDE.md architecture section and JSDoc comments to key classes
**Depends on**: Phase 22
**Research**: Unlikely (documentation)
**Plans**: TBD

Plans:
- [ ] 23-01: TBD

## Status

v1.0, v1.1, v1.2, and v1.3 complete. v1.4 in progress.

See milestone archives for completed work:
- [v1.0 Codebase Cleanup](milestones/v1.0-ROADMAP.md)
- [v1.1 Polish](milestones/v1.1-ROADMAP.md)
- [v1.2 Merge Dictator and Merc Cards](milestones/v1.2-ROADMAP.md)
- [v1.3 Combatant Unification](milestones/v1.3-ROADMAP.md)
