# Roadmap: MERC Codebase Cleanup

## Overview

A systematic cleanup moving from type safety foundations through code quality improvements to comprehensive test coverage, ensuring the codebase reaches ship confidence without regressions.

## Milestones

- ✅ **v1.0 Codebase Cleanup** — Phases 1-6 (shipped 2026-01-09)
- ✅ **v1.1 Polish** — Phases 7-8 (shipped 2026-01-09)
- ✅ **v1.2 Merge Dictator and Merc Cards** — Phases 9-13 (shipped 2026-01-11)
- ✅ **v1.3 Combatant Unification** — Phases 14-19 (shipped 2026-01-13)
- ✅ **v1.4 Combatant Naming Unification** — Phases 20-23 (shipped 2026-01-14)
- 🚧 **v1.5 Final Combatant Unification** — Phases 24-27 (in progress)

## Completed Milestones

- ✅ [v1.0 Codebase Cleanup](milestones/v1.0-ROADMAP.md) (Phases 1-6) — SHIPPED 2026-01-09
- ✅ [v1.1 Polish](milestones/v1.1-ROADMAP.md) (Phases 7-8) — SHIPPED 2026-01-09
- ✅ [v1.2 Merge Dictator and Merc Cards](milestones/v1.2-ROADMAP.md) (Phases 9-13) — SHIPPED 2026-01-11
- ✅ [v1.3 Combatant Unification](milestones/v1.3-ROADMAP.md) (Phases 14-19) — SHIPPED 2026-01-13
- ✅ [v1.4 Combatant Naming Unification](milestones/v1.4-ROADMAP.md) (Phases 20-23) — SHIPPED 2026-01-14

### 🚧 v1.5 Final Combatant Unification (In Progress)

**Milestone Goal:** Eliminate MercCard/DictatorCard subclasses entirely, unifying on single CombatantModel class with cardType discriminator

#### Phase 24: Merge Classes ✅

**Goal**: Collapse MercCard/DictatorCard into CombatantModel, eliminating class hierarchy
**Depends on**: Previous milestone complete
**Research**: Unlikely (internal refactoring)
**Plans**: 1 complete

Plans:
- [x] 24-01: Make CombatantModel concrete with unified ID properties

#### Phase 25: Remove ID Aliases

**Goal**: Eliminate mercId/mercName, dictatorId/dictatorName, unitId/unitName - only combatantId/combatantName
**Depends on**: Phase 24
**Research**: Unlikely (internal refactoring)
**Plans**: 4 planned

Plans:
- [ ] 25-01: Core class changes (elements.ts, game.ts, setup.ts with backward-compat getters)
- [ ] 25-02: Rules layer updates (324 occurrences across 21 files)
- [ ] 25-03: UI and Tests updates (155 occurrences across 15 files)
- [ ] 25-04: Remove backward-compat getters and update documentation

#### Phase 26: Update References

**Goal**: Fix all imports, type annotations, instanceof checks, and tests
**Depends on**: Phase 25
**Research**: Unlikely (internal refactoring)
**Plans**: TBD

Plans:
- [ ] 26-01: TBD

#### Phase 27: Documentation

**Goal**: Update CLAUDE.md, remove dead code, verify no regressions
**Depends on**: Phase 26
**Research**: Unlikely (internal refactoring)
**Plans**: TBD

Plans:
- [ ] 27-01: TBD

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
| 20. Model Renaming | v1.4 | 3/3 | Complete | 2026-01-14 |
| 21. Vue Component Renaming | v1.4 | 1/1 | Complete | 2026-01-14 |
| 22. Reference Updates | v1.4 | 1/1 | Complete | 2026-01-14 |
| 23. Documentation | v1.4 | 1/1 | Complete | 2026-01-14 |
| 24. Merge Classes | v1.5 | 1/1 | Complete | 2026-01-15 |
| 25. Remove ID Aliases | v1.5 | 0/? | Not started | - |
| 26. Update References | v1.5 | 0/? | Not started | - |
| 27. Documentation | v1.5 | 0/? | Not started | - |

<details>
<summary>✅ v1.3 Combatant Unification (Phases 14-19) — SHIPPED 2026-01-13</summary>

- [x] Phase 14: Image Path Fixes (1/1 plan) — completed 2026-01-13
- [x] Phase 15: Rename to Combatant (1/1 plan) — completed 2026-01-13
- [x] Phase 16: Abilities for Controller (1/1 plan) — completed 2026-01-13
- [x] Phase 17: Hiring Unification (1/1 plan) — completed 2026-01-13
- [x] Phase 18: Data Consistency (1/1 plan) — completed 2026-01-13
- [x] Phase 19: Victory/Defeat Fixes (1/1 plan) — completed 2026-01-13

</details>

<details>
<summary>✅ v1.4 Combatant Naming Unification (Phases 20-23) — SHIPPED 2026-01-14</summary>

- [x] Phase 20: Model Renaming (3/3 plans) — completed 2026-01-14
- [x] Phase 21: Vue Component Renaming (1/1 plan) — completed 2026-01-14
- [x] Phase 22: Reference Updates (1/1 plan) — completed 2026-01-14
- [x] Phase 23: Documentation (1/1 plan) — completed 2026-01-14

</details>

## Status

v1.5 Final Combatant Unification in progress (Phases 24-27).

See milestone archives for completed work:
- [v1.0 Codebase Cleanup](milestones/v1.0-ROADMAP.md) — Type safety and ship confidence
- [v1.1 Polish](milestones/v1.1-ROADMAP.md) — File organization and Artillery Barrage
- [v1.2 Merge Dictator and Merc Cards](milestones/v1.2-ROADMAP.md) — Unified card architecture
- [v1.3 Combatant Unification](milestones/v1.3-ROADMAP.md) — Shared abilities and hiring
- [v1.4 Combatant Naming Unification](milestones/v1.4-ROADMAP.md) — Canonical naming and documentation
