# Project Milestones: MERC Codebase Cleanup

## v1.1 Polish (Shipped: 2026-01-09)

**Delivered:** Code organization improvements and Artillery Barrage player choice mechanism.

**Phases completed:** 7-8 (6 plans total)

**Key accomplishments:**

- Split combat.ts into combat-types.ts and combat-retreat.ts (reduced 132 lines)
- Split ai-helpers.ts into ai-combat-helpers.ts and ai-action-helpers.ts (reduced 428 lines)
- Implemented Artillery Barrage player choice — rebels allocate hits during dictator's turn
- Added pendingArtilleryAllocation state with multi-sector queue
- Created artilleryAllocateHits action following combat allocation pattern

**Stats:**

- 22 files created/modified
- +2,154 / -643 lines changed
- 2 phases, 6 plans
- 52 minutes execution time

**Git range:** `feat(07-01)` → `feat(08-04)`

**What's next:** Game ready for release

---

## v1.0 Codebase Cleanup (Shipped: 2026-01-09)

**Delivered:** Ship-ready codebase with full type safety, standardized patterns, and comprehensive test coverage.

**Phases completed:** 1-6 (20 plans total)

**Key accomplishments:**

- Replaced 13 `any[]` usages with proper `Combatant[]`, `CombatResult[]`, `Equipment[]` types
- Eliminated all 191 `as any` casts across src/rules/ with type guards
- Extracted 17 duplicate helper patterns into shared helpers.ts (~166 lines removed)
- Standardized state persistence with cache helpers (player-scoped and global)
- Cleaned up debug messages and documented DEBUG_TACTICS_ORDER as test-only
- Added 81+ new tests for error conditions, edge cases, and action conditions

**Stats:**

- 57 files created/modified
- +8,113 / -714 lines changed
- 25,687 lines of TypeScript
- 6 phases, 20 plans
- 7 hours from start to ship

**Git range:** `docs(01)` → `docs(06-03)`

**What's next:** Release with confidence

---
