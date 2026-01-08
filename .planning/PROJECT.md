# MERC Codebase Cleanup

## What This Is

A focused cleanup effort for the MERC board game codebase, addressing technical debt, type safety issues, debug code, and test coverage gaps identified during codebase analysis. The goal is to reach ship confidence - a codebase you can release without worry.

## Core Value

**Ship Confidence** - tests and debug cleanup so the game can release with confidence that it won't crash or behave unexpectedly.

## Requirements

### Validated

<!-- Existing working functionality inferred from codebase -->

- ✓ Game logic layer with combat system, MERC abilities, equipment effects — existing
- ✓ Action layer: movement, economy, equipment, combat, dictator actions — existing
- ✓ Vue 3 UI with GameBoard, panels, cards, map components — existing
- ✓ Data layer with JSON configuration for MERCs, equipment, sectors, tactics — existing
- ✓ Test suite covering combat, abilities, equipment (3,933 lines across 8 files) — existing
- ✓ BoardSmith framework integration (engine, session, ui, runtime) — existing

### Active

<!-- Concerns to address from CONCERNS.md -->

**Type Safety:**
- [ ] Fix 191 type assertions - replace unsafe `as` casts with type guards or validated casts
- [ ] Replace `any[]` types in combat state with proper `Combatant[]`, `CombatResult[]` types

**Code Quality:**
- [ ] Extract 17 duplicate helper patterns into shared utilities in `helpers.ts`
- [ ] Standardize state persistence (choose one: `persistentMap()`, `game.settings`, or properties)
- [ ] Remove legacy `pendingLoot` property (replaced by `pendingLootMap`)

**Debug Cleanup:**
- [ ] Remove DEBUG messages from `dictator-actions.ts:432, 436`
- [ ] Secure `DEBUG_TACTICS_ORDER` - ensure null in production or gate properly

**Test Coverage:**
- [ ] Add tests for action `.condition()` validation logic
- [ ] Add tests for state persistence patterns (`persistentMap()`, `game.settings`)
- [ ] Add tests for error conditions and edge cases

**Code Organization (optional):**
- [ ] Consider splitting large files: `combat.ts` (2,879 lines), `ai-helpers.ts` (1,326 lines)

### Out of Scope

- Artillery Barrage player choice mechanic — requires architectural flow interrupts, too complex for cleanup scope

## Context

**Codebase State:**
- Brownfield project with working game implementation
- TypeScript 5.7.0 with strict mode enabled
- Built on @boardsmith/* monorepo packages (engine, session, ui, runtime)
- 11,981 lines of rules code across 15+ files
- Good test coverage for combat and abilities, gaps in action validation

**Technical Debt Sources:**
- Rapid development using TypeScript escape hatches (`as`, `any`)
- Copy-paste during feature development (duplicate helpers)
- Multiple state patterns introduced at different times
- Debug code left in from troubleshooting

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
| Ship Confidence as core value | User wants to release with confidence, not just clean code | — Pending |
| All concerns fair game | No explicit exclusions except Artillery Barrage feature | — Pending |

---
*Last updated: 2026-01-08 after initialization*
