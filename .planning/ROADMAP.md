# Roadmap: MERC Codebase Cleanup

## Overview

A systematic cleanup moving from type safety foundations through code quality improvements to comprehensive test coverage, ensuring the codebase reaches ship confidence without regressions.

## Milestones

- ✅ **v1.0 Codebase Cleanup** — Phases 1-6 (shipped 2026-01-09)
- 📋 **v1.1 Polish** — Phases 7-8 (planned)

## Completed Milestones

- ✅ [v1.0 Codebase Cleanup](milestones/v1.0-ROADMAP.md) (Phases 1-6) — SHIPPED 2026-01-09

<details>
<summary>✅ v1.0 Codebase Cleanup (Phases 1-6) — SHIPPED 2026-01-09</summary>

- [x] Phase 1: Type Safety: Combat State (1/1 plans) — completed 2026-01-08
- [x] Phase 2: Type Safety: Assertions (8/8 plans) — completed 2026-01-08
- [x] Phase 3: Code Quality: Helpers (4/4 plans) — completed 2026-01-08
- [x] Phase 4: Code Quality: State & Legacy (3/3 plans) — completed 2026-01-08
- [x] Phase 5: Debug Cleanup (1/1 plan) — completed 2026-01-08
- [x] Phase 6: Test Coverage (3/3 plans) — completed 2026-01-09

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
| 7. File Organization | v1.1 | 0/2 | In progress | - |
| 8. Artillery Barrage | v1.1 | 0/TBD | Not started | - |

## Planned Phases

### Phase 7: File Organization
**Goal**: Split large files for better maintainability
**Depends on**: v1.0 complete
**Research**: Unlikely (straightforward splitting)
**Plans**: 2

Plans:
- [ ] 07-01: Split combat.ts into combat-types.ts and combat-retreat.ts
- [ ] 07-02: Split ai-helpers.ts into ai-combat-helpers.ts and ai-action-helpers.ts

Scope:
- Split `combat.ts` (2,879 lines) by combat phases or domains
- Split `ai-helpers.ts` (1,326 lines) by AI strategy type

### Phase 8: Artillery Barrage
**Goal**: Implement player choice for Artillery Barrage hit allocation
**Depends on**: Phase 7 (optional)
**Research**: Likely (requires flow interrupt architecture)
**Plans**: TBD

Scope:
- Allow rebels to choose which units take Artillery Barrage damage
- Requires interrupting dictator's turn for rebel input
- Current workaround: auto-applies damage (militia first, then MERCs)
