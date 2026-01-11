# Roadmap: MERC Codebase Cleanup

## Overview

A systematic cleanup moving from type safety foundations through code quality improvements to comprehensive test coverage, ensuring the codebase reaches ship confidence without regressions.

## Milestones

- ✅ **v1.0 Codebase Cleanup** — Phases 1-6 (shipped 2026-01-09)
- ✅ **v1.1 Polish** — Phases 7-8 (shipped 2026-01-09)
- 🚧 **v1.2 Merge Dictator and Merc Cards** — Phases 9-13 (in progress)

## Completed Milestones

- ✅ [v1.0 Codebase Cleanup](milestones/v1.0-ROADMAP.md) (Phases 1-6) — SHIPPED 2026-01-09
- ✅ [v1.1 Polish](milestones/v1.1-ROADMAP.md) (Phases 7-8) — SHIPPED 2026-01-09

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

### 🚧 v1.2 Merge Dictator and Merc Cards (In Progress)

**Milestone Goal:** Unify MercCard and DictatorCard into a single CombatUnitCard class with discriminator-based logic, eliminating duplicate class definitions and replacing 130+ instanceof checks with property-based type guards.

#### Phase 9: Add Discriminator

**Goal**: Add cardType property to existing classes without breaking anything
**Depends on**: Previous milestone complete
**Research**: Unlikely (internal patterns)
**Plans**: TBD

Plans:
- [ ] 09-01: TBD (run /gsd:plan-phase 9 to break down)

#### Phase 10: Unified Class

**Goal**: Create CombatUnitCard class and make old classes thin aliases
**Depends on**: Phase 9
**Research**: Unlikely (internal refactoring)
**Plans**: TBD

Plans:
- [ ] 10-01: TBD

#### Phase 11: Migrate instanceof

**Goal**: Replace 130+ instanceof checks with property-based type guards
**Depends on**: Phase 10
**Research**: Unlikely (mechanical refactoring)
**Plans**: TBD

Plans:
- [ ] 11-01: TBD

#### Phase 12: Merge Data Files

**Goal**: Combine mercs.json and dictators.json into combatants.json
**Depends on**: Phase 11
**Research**: Unlikely (data migration)
**Plans**: TBD

Plans:
- [ ] 12-01: TBD

#### Phase 13: Remove Legacy

**Goal**: Remove MercCard/DictatorCard classes and backward-compat code
**Depends on**: Phase 12
**Research**: Unlikely (cleanup)
**Plans**: TBD

Plans:
- [ ] 13-01: TBD

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
| 9. Add Discriminator | v1.2 | 0/? | Not started | - |
| 10. Unified Class | v1.2 | 0/? | Not started | - |
| 11. Migrate instanceof | v1.2 | 0/? | Not started | - |
| 12. Merge Data Files | v1.2 | 0/? | Not started | - |
| 13. Remove Legacy | v1.2 | 0/? | Not started | - |

## Status

v1.0 and v1.1 complete. v1.2 in progress.

See milestone archives for completed work:
- [v1.0 Codebase Cleanup](milestones/v1.0-ROADMAP.md)
- [v1.1 Polish](milestones/v1.1-ROADMAP.md)
