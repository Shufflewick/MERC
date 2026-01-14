# Project Milestones: MERC Codebase Cleanup

## v1.4 Combatant Naming Unification (Shipped: 2026-01-14)

**Delivered:** Unified naming conventions with combatantId/combatantName as canonical identity, CombatantCard.vue component, and CLAUDE.md architecture documentation.

**Phases completed:** 20-23 (6 plans total)

**Key accomplishments:**

- Renamed CombatUnit → CombatantBase and CombatUnitCard → CombatantModel
- Established combatantId/combatantName as canonical identity properties via abstract getters
- Updated type guards (isCombatUnitCard → isCombatantModel) with backward-compat aliases
- Renamed Vue component MercCard.vue → CombatantCard.vue
- Created CLAUDE.md architecture guide with class hierarchy and conventions
- Added JSDoc documentation to key model classes

**Stats:**

- 28 files created/modified
- +1,788 / -124 lines changed
- 32,090 lines of TypeScript/Vue
- 4 phases, 6 plans, 24 commits
- Same day execution

**Git range:** `feat(20-01)` → `docs(23-01)`

**What's next:** Game ready for release with clean architecture

---

## v1.3 Combatant Unification (Shipped: 2026-01-13)

**Delivered:** Unified dictator and merc combatant handling with shared abilities, hiring logic, and victory/defeat conditions.

**Phases completed:** 14-19 (6 plans total)

**Key accomplishments:**

- Fixed dictator image paths (.png extension detection)
- Renamed MercIcon → CombatantIcon components with auto-detection
- Enabled MERC special abilities for dictator controller (Doc, Feedback, Squidhead, Hagness)
- Unified hire path logic with shared equipNewHire helper
- Added sex field to dictator data entries
- Fixed isDefeated to include base capture condition

**Stats:**

- 24 files created/modified
- 6 phases, 6 plans
- Same day execution

**Git range:** `feat(14-01)` → `docs(19-01)`

**What's next:** Naming unification (v1.4)

---

## v1.2 Merge Dictator and Merc Cards (Shipped: 2026-01-11)

**Delivered:** Unified card architecture with CombatUnitCard class, property-based type guards, and single combatants.json data file.

**Phases completed:** 9-13 (7 plans total)

**Key accomplishments:**

- Added cardType discriminator to MercCard/DictatorCard (54 entries updated)
- Created CombatUnitCard unified class with thin subclass wrappers
- Migrated 103 instanceof checks to property-based type guards
- Merged mercs.json and dictators.json into combatants.json
- Deleted legacy data files and updated all references

**Stats:**

- 37 files created/modified
- +2,562 / -306 lines changed
- 31,539 lines of TypeScript
- 5 phases, 7 plans
- ~1 hour execution time

**Git range:** `feat(09)` → `docs(13-01)`

**What's next:** Ready for release or new feature development

---

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
