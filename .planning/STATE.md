# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-03)

**Core value:** Ship Confidence - single source of truth for ability stat bonuses
**Current focus:** v1.8 Unified Stat Ability System

## Current Position

Phase: 38 of 41 (Unify Server-Side Calculation)
Plan: 02 of 02 complete
Status: Phase complete
Last activity: 2026-02-03 - Completed 38-02-PLAN.md

Progress: ████░░░░░░ 40% (2 of 5 phases complete)

## Current Milestone

**v1.8 Unified Stat Ability System** - IN PROGRESS

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 37 | Extend Ability Registry | STAT-01 | COMPLETE |
| 38 | Unify Server-Side Calculation | STAT-02 | COMPLETE |
| 39 | Unify UI Breakdown | STAT-03 | NOT STARTED |
| 40 | Unify Combat-Time Application | STAT-04 | NOT STARTED |
| 41 | Testing & Verification | STAT-05 | NOT STARTED |

**Target:** Eliminate duplicate stat calculations and display bugs for 18 stat-modifying MERCs

## Milestones Completed

- v1.0 Codebase Cleanup (Phases 1-6) - 20 plans
- v1.1 Polish (Phases 7-8) - 6 plans
- v1.2 Merge Dictator and Merc Cards (Phases 9-13) - 7 plans
- v1.3 Combatant Unification (Phases 14-19) - 6 plans
- v1.4 Combatant Naming Unification (Phases 20-23) - 6 plans
- v1.5 Final Combatant Unification (Phases 24-27) - 7 plans
- v1.6 Final ID Cleanup (Phases 28-30) - 5 plans
- v1.7 GameBoard Component Refactor (Phases 31-36) - 18 plans

Total: 37 phases, 78 plans, 8 milestones shipped

## Performance Metrics

**Velocity:**
- Total plans completed: 78
- Average duration: 10.0 min/plan

## Accumulated Context

### Decisions

All decisions captured in PROJECT.md Key Decisions table.

**v1.8 Decisions:**
- Unified stat ability system: Single source of truth for ability bonuses - define once, calculate once, display once
- Uses BASE initiative for highestInitInSquad check (Sarge/Tack check base initiative before bonuses)
- Haarg's per-stat evaluation is special-cased - can't be expressed in generic condition system
- allSquad bonuses (Tack) include the source, squadMates bonuses (Valkyrie) exclude the source
- Removed extraCombat passive lookup from updateComputedStats - now in merc-abilities registry

### Deferred Issues

- Pre-existing type compatibility issues between composable interfaces and component props
- Pre-existing `@boardsmith/session` package configuration issue blocks browser testing
- Vendor tarballs missing compiled `dist` folders - blocks build and integration tests

### Blockers/Concerns

**Active blocker:** Vendor tarballs in `vendor/` directory contain only TypeScript source files, not compiled JavaScript. This blocks:
- `npm run build` command
- 11 test files that depend on @boardsmith/testing

**Recommendation:** Regenerate vendor tarballs to include compiled `dist` folders.

### Roadmap Evolution

- v1.8 milestone initialized with 5 phases (37-41)
- Focus: Unified stat ability system for 18 MERCs
- Problem: Duplicate calculations cause double display bug and maintenance burden
- Solution: Single source of truth in merc-abilities.ts registry

## Session Continuity

Last session: 2026-02-03T19:39:15Z
Stopped at: Completed 38-02-PLAN.md (Integrate Unified Stat Calculation)
Resume file: None

### Recent Plans Completed

- 38-02: Integrate Unified Stat Calculation (3 commits, -77 lines, 3 min)
- 38-01: Add Unified Stat Modifier Infrastructure (3 commits, +196 lines, 2 min)
- 37-01: Extend Ability Registry (3 commits, +192 lines, 4 min)

### Previous Milestone Summary (v1.7)

- 36-03: Verification & Test Suite (0 commits, verification only)
- 36-02: TypeScript cast audit (1 commit, +5 lines from documentation and type guards)
- 36-01: Dead code removal and import organization (5 commits, -15 lines)
- GameBoard.vue: 3,368 -> 1,393 lines (59% reduction)
