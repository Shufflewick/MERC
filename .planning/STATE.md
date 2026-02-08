# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-07)

**Core value:** Ship Confidence - deterministic combat animation via event-driven CombatPanel
**Current focus:** v1.9 BoardSmith v3.0 Animation Timeline Migration

## Current Position

Phase: 44 of 46 (CombatPanel Rebuild)
Plan: 2 of 2 in current phase
Status: Phase complete
Last activity: 2026-02-08 -- Completed 44-02-PLAN.md (Decision Prompts from Snapshot + State Machine Removal)

Progress: [██████░░░░] 83% (5 of 6 plans complete)

## Current Milestone

**v1.9 BoardSmith v3.0 Animation Timeline Migration** - IN PROGRESS

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 42 | Remove Dead APIs | DELETE-01, DELETE-02 | Complete |
| 43 | Combat Event Architecture | SRV-01, SRV-02, SRV-03 | Complete |
| 44 | CombatPanel Rebuild | UI-01, UI-02, UI-03, DELETE-03, DELETE-05 | Complete |
| 45 | GameTable Clean Wiring | UI-04, DELETE-04 | Not started |
| 46 | Verification | TEST-01 | Not started |

**Target:** CombatPanel renders 100% from animation events, zero vestigial theatre view code

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

Total: 41 phases, 83 plans, 9 milestones shipped

## Performance Metrics

**Velocity:**
- Total plans completed: 87
- Average duration: 9.1 min/plan

## Accumulated Context

### Decisions

All decisions captured in PROJECT.md Key Decisions table.

**v1.9 Decisions (pending):**
- CombatPanel 100% event-driven -- animation events carry all data, no gameView/truth reads
- Full snapshot per decision cycle -- handles refresh/late-join without history
- Mutations out of animate callbacks -- pure data events + normal mutations after
- ActionController stays for player decisions -- decisions submitted through existing action system

**v1.9 Decisions (confirmed by execution):**
- activeCombat sourced from theatre view only, no truth view fallback (42-01)
- Animation events are fire-and-forget, no acknowledgment protocol needed (42-01)
- All 13 combat animate calls are pure data -- mutations after call, not in callback (43-01)
- combat-heal events carry healthBefore/healthAfter/healAmount for CombatPanel (43-01)
- combat-panel snapshot emitted at all 8 decision cycle points with full combatant data and decision context (43-02)
- Epinephrine decision cycle has dedicated handler in executeCombat with state save (43-02)
- getCombatantDisplay reads plain snapshot fields directly, no resolveCombatant/getAttr indirection (44-01)
- healthOverrides cleared on each combat-panel snapshot -- snapshot health is authoritative at decision points (44-01)
- Decision prompts accessed via 5 snapshot computed helpers, not inline template casts (44-02)
- combat-end handler is sole lifecycle exit: clears state and emits combat-finished, replacing state machine (44-02)

### Deferred Issues

- Vendor tarballs missing compiled `dist` folders - blocks build and integration tests

### Blockers/Concerns

None for v1.9.

## Session Continuity

Last session: 2026-02-08
Stopped at: Completed 44-02-PLAN.md (Decision Prompts from Snapshot + State Machine Removal)
Resume file: None
