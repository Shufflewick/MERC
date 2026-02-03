# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-03)

**Core value:** Ship Confidence - single source of truth for ability stat bonuses
**Current focus:** v1.8 Unified Stat Ability System

## Current Position

Phase: 41 of 41 (Testing & Verification)
Plan: 02 of 02 complete
Status: Phase complete - MILESTONE COMPLETE
Last activity: 2026-02-03 - Completed 41-02-PLAN.md

Progress: ██████████ 100% (5 of 5 phases complete)

## Current Milestone

**v1.8 Unified Stat Ability System** - COMPLETE

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 37 | Extend Ability Registry | STAT-01 | COMPLETE |
| 38 | Unify Server-Side Calculation | STAT-02 | COMPLETE |
| 39 | Unify UI Breakdown | STAT-03 | COMPLETE |
| 40 | Unify Combat-Time Application | STAT-04 | COMPLETE |
| 41 | Testing & Verification | STAT-05 | COMPLETE |

**Target:** Eliminate duplicate stat calculations and display bugs for 18 stat-modifying MERCs - ACHIEVED

## Milestones Completed

- v1.0 Codebase Cleanup (Phases 1-6) - 20 plans
- v1.1 Polish (Phases 7-8) - 6 plans
- v1.2 Merge Dictator and Merc Cards (Phases 9-13) - 7 plans
- v1.3 Combatant Unification (Phases 14-19) - 6 plans
- v1.4 Combatant Naming Unification (Phases 20-23) - 6 plans
- v1.5 Final Combatant Unification (Phases 24-27) - 7 plans
- v1.6 Final ID Cleanup (Phases 28-30) - 5 plans
- v1.7 GameBoard Component Refactor (Phases 31-36) - 18 plans
- v1.8 Unified Stat Ability System (Phases 37-41) - 7 plans

Total: 41 phases, 82 plans, 9 milestones shipped

## Performance Metrics

**Velocity:**
- Total plans completed: 82
- Average duration: 9.6 min/plan

## Accumulated Context

### Decisions

All decisions captured in PROJECT.md Key Decisions table.

**v1.8 Decisions:**
- Unified stat ability system: Single source of truth for ability bonuses - define once, calculate once, display once
- Uses BASE initiative for highestInitInSquad check (Sarge/Tack check base initiative before bonuses)
- Haarg's per-stat evaluation is special-cased - can't be expressed in generic condition system
- allSquad bonuses (Tack) include the source, squadMates bonuses (Valkyrie) exclude the source
- Removed extraCombat passive lookup from updateComputedStats - now in merc-abilities registry
- Vulture's penalty negation preserved as UI-calculated exception (not in activeStatModifiers)
- Self-modifier labels follow same pattern as squad-modifier labels: `${name}'s Ability`
- Combat-time-only effects (Haarg all-combatants, Max debuff, Walter militia, Khenn roll, Golem) preserved in combat.ts
- hasExplosive condition checks weapon slot AND accessory/bandolier slots (for Stumpy)

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
- Result: 11 abilities tested, all 599 tests pass (added 10 more in 41-02)

## Session Continuity

Last session: 2026-02-03T15:16:00Z
Stopped at: Completed 41-02-PLAN.md (Testing & Verification) - MILESTONE COMPLETE
Resume file: None

### Recent Plans Completed

- 41-02: Squad-Conditional & Combat-Only Tests (1 commit, +315 lines, 6 min) - MILESTONE COMPLETE
- 41-01: Testing & Verification (2 commits, +220 lines, 4 min)
- 40-01: Unify Combat-Time Application (2 commits, -610 lines, 5 min)
- 39-02: Self-Modifier Labels (1 commit, +5 lines, 1 min) - gap closure
- 39-01: Unify UI Breakdown (2 commits, -108 lines, 3 min)
- 38-02: Integrate Unified Stat Calculation (3 commits, -77 lines, 3 min)
- 38-01: Add Unified Stat Modifier Infrastructure (3 commits, +196 lines, 2 min)

### Previous Milestone Summary (v1.7)

- 36-03: Verification & Test Suite (0 commits, verification only)
- 36-02: TypeScript cast audit (1 commit, +5 lines from documentation and type guards)
- 36-01: Dead code removal and import organization (5 commits, -15 lines)
- GameBoard.vue: 3,368 -> 1,393 lines (59% reduction)
