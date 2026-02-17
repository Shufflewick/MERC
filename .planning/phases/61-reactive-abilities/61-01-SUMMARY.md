---
phase: 61-reactive-abilities
plan: 01
subsystem: dictator-abilities
tags: [pinochet, damage-spread, reactive-hire, sector-snapshot]
dependency-graph:
  requires: [60-complex-interactive-abilities]
  provides: [pinochet-damage-spread, pinochet-sector-loss-hire, pinochet-ai-dispatcher]
  affects: [61-02-reactive-abilities]
tech-stack:
  added: []
  patterns: [sector-snapshot-compare, reactive-hire-loop, auto-apply-damage]
key-files:
  created: []
  modified:
    - src/rules/game.ts
    - src/rules/dictator-abilities.ts
    - src/rules/flow.ts
    - src/rules/actions/dictator-actions.ts
    - src/rules/actions/index.ts
    - src/ui/components/DictatorPanel.vue
    - src/ui/composables/useActionState.ts
decisions: []
metrics:
  duration: ~5 minutes
  completed: 2026-02-17
---

# Phase 61 Plan 01: Pinochet Abilities Summary

Implemented both Pinochet abilities: per-turn damage spread across rebel forces proportional to rebel-controlled sectors, and reactive MERC hire triggered by sector control losses during rebel turns.

## What Was Built

### Task 1: Game State and Ability Functions
- Added `_pinochetControlledSnapshot` (Set<string>) and `_pinochetPendingHires` (number) state fields to MERCGame
- Created `applyPinochetPendingHires`: processes queued hires from sector losses (AI auto-hire path with equipment, squad placement, map entry animation)
- Created `applyPinochetDamageSpread`: distributes damage equal to rebel-controlled sector count evenly across all living rebel MERCs and militia, with remainder going to first N targets (MERCs before militia). Dead MERCs from damage spread have equipment discarded to proper discard piles.
- Created `applyPinochetTurnAbility`: top-level AI dispatcher calling hires then damage
- Registered `case 'pinochet'` in applyDictatorTurnAbilities switch

### Task 2: Flow Integration and UI Wiring
- Sector snapshot taken before rebel-phase loop (captures dictator-controlled sector IDs)
- Sector comparison after rebel-phase loop (detects losses, increments pending hires counter)
- Human Pinochet: damage auto-applies in the existing dictator turn execute block (no choices needed)
- Human Pinochet: pinochetBonusHire loop processes pending hires interactively (equipment choice, sector choice)
- Created `pinochetBonusHire` action following Gaddafi/Pol Pot hire pattern exactly
- Registered action in index.ts
- Added to DictatorPanel.vue dictatorSpecificActions array and sector selection conditionals
- Added `isPinochetHiring` computed to both DictatorPanel.vue and useActionState.ts

## Design Decisions

- **Damage distribution order**: MERCs first, then militia. This determines who gets remainder damage points. MERCs are higher-value targets so receiving +1 remainder damage is more impactful.
- **Militia damage**: Each individual militia counts as a separate target in the damage spread. The allocated damage per militia target is passed to `removeRebelMilitia()` in full (not hardcoded 1), which handles the actual removal.
- **No Gaddafi loot trigger**: Pinochet damage spread explicitly does NOT trigger Gaddafi's post-kill loot mechanic. This is direct damage from an ability, not "forces kill" from combat.
- **Hire before damage**: AI dispatcher processes pending hires first, then applies damage spread. This is more generous to Pinochet (more MERCs to damage).

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- TypeScript compilation: zero errors
- All grep verification checks pass for all function names, state fields, and action registrations across all specified files
