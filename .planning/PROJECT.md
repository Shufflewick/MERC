# MERC Codebase Cleanup

## What This Is

A focused cleanup effort for the MERC board game codebase that achieved ship confidence through systematic type safety improvements, code quality standardization, and comprehensive test coverage.

## Core Value

**Ship Confidence** - tests and debug cleanup so the game can release with confidence that it won't crash or behave unexpectedly.

## Current State

**Shipped:** v1.2 Merge Dictator and Merc Cards (2026-01-11)

- 31,539 lines of TypeScript (modular structure)
- Zero `as any` casts in src/rules/
- Unified CombatUnitCard class with MercCard/DictatorCard as thin wrappers
- Property-based type guards instead of instanceof (bundler-compatible)
- Single combatants.json data file (54 entries)
- 81+ tests for error conditions and edge cases

## Requirements

### Validated

- ✓ Fix 191 type assertions - replaced unsafe `as` casts with type guards — v1.0
- ✓ Replace `any[]` types in combat state with proper `Combatant[]`, `CombatResult[]` types — v1.0
- ✓ Extract 17 duplicate helper patterns into shared utilities in `helpers.ts` — v1.0
- ✓ Standardize state persistence (cache helpers for player-scoped and global state) — v1.0
- ✓ Remove legacy `pendingLoot` property (replaced by `pendingLootMap`) — v1.0
- ✓ Remove DEBUG messages from `dictator-actions.ts` — v1.0
- ✓ Secure `DEBUG_TACTICS_ORDER` - documented as test-only feature — v1.0
- ✓ Add tests for action `.condition()` validation logic — v1.0
- ✓ Add tests for state persistence patterns — v1.0
- ✓ Add tests for error conditions and edge cases — v1.0
- ✓ Split large files: combat.ts (2,879→2,747 lines), ai-helpers.ts (1,327→899 lines) — v1.1
- ✓ Artillery Barrage player choice — rebels choose hit allocation during dictator's Artillery Barrage — v1.1
- ✓ Unified card architecture — CombatUnitCard class with MercCard/DictatorCard as thin wrappers — v1.2
- ✓ Property-based type guards — replaced 103 instanceof checks with isMerc/isDictator for bundler compatibility — v1.2
- ✓ Single data file — merged mercs.json and dictators.json into combatants.json with cardType discriminator — v1.2

<!-- Existing working functionality inferred from codebase -->

- ✓ Game logic layer with combat system, MERC abilities, equipment effects — existing
- ✓ Action layer: movement, economy, equipment, combat, dictator actions — existing
- ✓ Vue 3 UI with GameBoard, panels, cards, map components — existing
- ✓ Data layer with JSON configuration for MERCs, equipment, sectors, tactics — existing
- ✓ Test suite covering combat, abilities, equipment (3,933 lines across 8 files) — existing
- ✓ BoardSmith framework integration (engine, session, ui, runtime) — existing

### Active

(All cleanup requirements completed. Game ready for release.)

### Out of Scope

(None currently)

## Context

**Codebase State:**
- Brownfield project with working game implementation
- TypeScript 5.7.0 with strict mode enabled
- Built on @boardsmith/* monorepo packages (engine, session, ui, runtime)
- 25,687 lines of TypeScript code
- Comprehensive test coverage for combat, abilities, equipment, conditions, state persistence, and error handling

**Codebase Map:**
- `.planning/codebase/CONCERNS.md` - Full list of identified issues
- `.planning/codebase/ARCHITECTURE.md` - System design reference
- `.planning/codebase/STRUCTURE.md` - File locations reference

## Constraints

- **Framework Compatibility**: Must stay compatible with @boardsmith/* framework patterns - these are the foundation
- **No Regressions**: All existing tests must continue to pass

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Ship Confidence as core value | User wants to release with confidence, not just clean code | ✓ Good |
| All concerns fair game | No explicit exclusions except Artillery Barrage feature | ✓ Good |
| Type-only imports for combat types | Avoid runtime circular dependencies | ✓ Good |
| constructor.name for isRebelPlayer | Avoid circular dependencies with framework | ✓ Good |
| `as unknown as T` over `as any` | Safer explicit cast pattern | ✓ Good |
| Type guards accept `unknown` | Framework compatibility, proper narrowing | ✓ Good |
| CombatUnit[] for mixed arrays | Shared base class for MercCard/DictatorCard | ✓ Good |
| Global cache helpers mirror player-scoped | Consistent API, easy to use | ✓ Good |
| Keep WARNING for sector fallback | Legitimate runtime info, not debug noise | ✓ Good |
| Re-export pattern for file splits | Backwards compatibility, no import changes | ✓ Good |
| pendingArtilleryAllocation state pattern | Mirrors existing pendingHitAllocation | ✓ Good |
| Roll dice upfront for Artillery | Avoid partial state during allocation | ✓ Good |
| mercId for MERC target identification | String matching consistent with other code | ✓ Good |
| cardType discriminator over boolean | `'merc' \| 'dictator'` string union is more extensible | ✓ Good |
| CombatUnitCard unified class | Single implementation with thin subclass wrappers | ✓ Good |
| Property-based type guards | Optional chaining (`?.isMerc`) for bundler compatibility | ✓ Good |
| combatants.json single data file | One source of truth with cardType filter | ✓ Good |

---
*Last updated: 2026-01-11 after v1.2 milestone*
