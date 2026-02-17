# Project Milestones: MERC

## v2.0 Simultaneous Rebel Turns (Shipped: 2026-02-16)

**Delivered:** Replaced sequential rebel turns with simultaneous play — all rebels act in parallel with combat as a synchronization barrier, AI batch gating, and visual feedback.

**Phases completed:** 51-55 (6 plans total)

**Key accomplishments:**

- Extracted `combatResolutionFlow` — deduplicated 4 inline combat sites, reduced flow.ts by 934 lines
- Replaced sequential rebel turns with `loop + simultaneousActionStep` for both Day 1 and Day 2+
- Combat barrier architecture — combat/coordinated attacks pause simultaneous play, resolve sequentially, resume
- AI rebel batch gating — round-robin action batching wired into 19 rebel actions
- Combat barrier overlay — red-tinted visual transition when simultaneous play pauses
- 11 new integration tests + live multiplayer gameplay verification

**Stats:**

- 34 files changed (+5,012/-1,156 lines)
- 5 phases, 6 plans, 27 commits
- 693 tests passing (36 new)
- 1 day (2026-02-16)

**Git range:** `refactor(51-01)` → `feat(55-01)`

**What's next:** TBD — next milestone via `/gsd:new-milestone`

---

## v1.10 Grievances (Shipped: 2026-02-09)

**Delivered:** Fixed gameplay bugs, missing implementations, and UI inconsistencies — bandolier equipment slots, landmine trigger system, sector panel wiring, and all 14 dictator tactics cards audited and corrected.

**Phases completed:** 47-50 (9 plans total)

**Key accomplishments:**

- Fixed bandolier replacement — `equip()` returns compiler-enforced `EquipResult`, all 16 callers route displaced items to stash/discard
- Implemented bidirectional landmine system — `checkLandMines()` triggers on all movement, Squidhead counter-ability
- Fixed sector panel auto-fill — type-based format detection, coordinatedAttack pre-fill corrected
- Audited all 14 dictator tactics cards — removed fabricated bonuses, added animations to every card
- Rewrote Generalissimo (draw 6 MERCs, pick 1) and Lockdown (place 5x militia interactively)

**Stats:**

- 49 files changed (+6,122/-579 lines)
- 41,145 lines of TypeScript/Vue
- 4 phases, 9 plans
- 1 day (2026-02-08 → 2026-02-09)
- 657 tests passing

**Git range:** `feat(47-01)` → `docs(50)`

**What's next:** TBD — next milestone via `/gsd:new-milestone`

---

## v1.9 BoardSmith v3.0 Animation Timeline Migration (Shipped: 2026-02-08)

**Delivered:** Migrated CombatPanel from removed BoardSmith theatre view system to 100% event-driven animation player with pure data events, combat-panel snapshots, and simplified lifecycle.

**Phases completed:** 42-46 (7 plans total)

**Key accomplishments:**

- Removed all BoardSmith v2 theatre view dead code (7 API references across 5 files)
- Built pure data combat event architecture — 13 animate callbacks extracted, combat-panel snapshot emitted at all 8 decision cycle points
- Rebuilt CombatPanel as self-contained animation player — renders 100% from events, state machine deleted (-110 lines)
- Cleaned GameTable combat wiring — ~246 lines of fallback chains deleted, combat section reduced from ~150 to ~15 lines
- Verified with 21 automated tests covering snapshots, animation events, decision context, and lifecycle

**Stats:**

- 7 source files changed (+893/-733 lines)
- 38,441 lines of TypeScript/Vue
- 5 phases, 7 plans
- 2 days (2026-02-07 → 2026-02-08)
- 623 tests passing

**Git range:** `feat(42-01)` → `docs(46)`

**What's next:** TBD — next milestone via `/gsd:new-milestone`

---

## v1.8 Unified Stat Ability System (Shipped: 2026-02-03)

**Delivered:** Single source of truth for 18 stat-modifying MERC abilities — define once in registry, calculate once in stat computation, display once in UI breakdown.

**Phases completed:** 37-41 (8 plans total)

**Key accomplishments:**

- Extended ability registry with statModifiers interface for all 18 stat-modifying MERCs
- Unified server-side stat calculation path (single applyAbilityStatModifiers function)
- Generated UI breakdown from activeStatModifiers, removed hardcoded ability checks
- Removed duplicate bonus functions from combat.ts
- Integration tests covering all 18 stat-modifying abilities

**Stats:**

- 5 phases, 8 plans
- 599 tests passing

**Git range:** `feat(37-01)` → `docs(41)`

**What's next:** BoardSmith v3.0 Animation Timeline Migration (v1.9)

---

## v1.7 GameBoard Component Refactor (Shipped: 2026-01-19)

**Delivered:** Refactored GameBoard.vue (3,368 lines) into focused, testable components with clean boundaries. Extracted state derivation to composables, UI flows to components, and reduced GameBoard to thin orchestrator role.

**Phases completed:** 31-36 (18 plans total)

**Key accomplishments:**

- Extracted 6 composables: useGameViewHelpers, useVictoryCalculations, usePlayerState, useSectorState, useSquadState, useActionState
- Extracted 4 UI components: GameOverOverlay, LandingZoneSelection, HagnessDrawEquipment, HiringPhase
- Reduced GameBoard.vue from 3,368 to 1,393 lines (59% reduction)
- Fixed landing zone selection flow (choice matching by display name, fill with element ID)
- Fixed hiring phase auto-start (watch both availableActions AND currentAction)
- Removed dead code and organized imports

**Stats:**

- 30+ files created/modified
- 6 phases, 18 plans
- GameBoard.vue: 3,368 → 1,393 lines
- 524 tests passing

**Git range:** `feat(31-01)` → `docs(36-03)`

**What's next:** Clean architecture ready for new features

---

## v1.6 Final ID Cleanup (Shipped: 2026-01-15)

**Delivered:** Eradicated all legacy mercId/dictatorId/mercName/dictatorName patterns, leaving only combatantId/combatantName as canonical identity.

**Phases completed:** 28-30 (5 plans total)

**Key accomplishments:**

- Removed 10 deprecated functions and all backward-compat comments from rules layer
- Updated all state types to use combatantId naming (pendingEpinephrine, pendingHitAllocation, lastExplorer)
- Renamed getCombatantMercId → getCombatantId in combat utilities
- Updated all action args to use combatantId consistently
- Cleaned all UI component interfaces to use combatantName as primary identity
- Removed all fallback chains from UI layer (mercId||combatantId patterns eliminated)

**Stats:**

- 37 files changed
- +1,470 / -505 lines changed
- 3 phases, 5 plans
- Same day execution (~3 hours)

**Git range:** `refactor(28-01)` → `test(30-01)`

**What's next:** Codebase cleanup complete - all 7 milestones shipped

---

## v1.5 Final Combatant Unification (Shipped: 2026-01-15)

**Delivered:** Single CombatantModel class with cardType discriminator, eliminated all ID aliases leaving only combatantId/combatantName.

**Phases completed:** 24-27 (7 plans total)

**Key accomplishments:**

- Made CombatantModel concrete class (eliminated need for MercCard/DictatorCard subclasses)
- Removed all ID aliases (mercId/mercName, dictatorId/dictatorName, unitId/unitName)
- Replaced 479 alias property occurrences with combatantId/combatantName across 36 files
- Removed backward-compat exports and type aliases
- Updated all type annotations to use CombatantModel directly

**Stats:**

- 59 files changed
- +2,328 / -891 lines changed
- 4 phases, 7 plans
- Same day execution

**Git range:** `refactor(24-01)` → `docs(27-01)`

**What's next:** Codebase cleanup complete - ready for new features

---

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
