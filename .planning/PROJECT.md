# MERC Codebase Cleanup

## What This Is

A focused cleanup effort for the MERC board game codebase that achieved ship confidence through systematic type safety improvements, code quality standardization, and comprehensive test coverage. Now refactoring the UI layer for maintainability.

## Core Value

**Ship Confidence** - tests and debug cleanup so the game can release with confidence that it won't crash or behave unexpectedly.

## Current Milestone: v1.9 BoardSmith v3.0 Animation Timeline Migration

**Goal:** Migrate MERC's combat UI from BoardSmith's removed theatre view system to the new v3.0 animation timeline, making CombatPanel a 100% event-driven animation player.

**Target features:**
- CombatPanel driven entirely by animation events (no gameView/truth reads)
- Full combatant snapshot emitted per decision cycle (refresh-safe)
- Pure data `game.animate()` calls — mutations moved out of callbacks
- Remove all theatre view / acknowledgment protocol code
- Simplified panel lifecycle (no state machine)
- Interactive decisions (target selection, hit allocation, continue/retreat) embedded in animation event data
- Player actions still submitted via actionController

## Current State

**Current:** v1.9 BoardSmith v3.0 Animation Timeline Migration (In Progress)
**Shipped:** v1.8 Unified Stat Ability System (2026-02-03)

- 32,090 lines of TypeScript/Vue (modular structure)
- Zero `as any` casts in src/rules/
- Unified class hierarchy: CombatantBase → CombatantModel (concrete class)
- Canonical identity: combatantId/combatantName (no legacy aliases)
- Property-based type guards (isCombatantModel)
- Single combatants.json data file (54 entries)
- CombatantCard.vue component for rendering any combatant
- CLAUDE.md architecture guide for AI navigation
- 599 tests passing

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
- ✓ Dictator image paths — fixed .png extension detection for dictator combatants — v1.3
- ✓ Unified icon components — CombatantIcon/CombatantIconSmall with auto-detect dictator — v1.3
- ✓ MERC abilities for any controller — Doc, Feedback, Squidhead, Hagness work when dictator controls merc — v1.3
- ✓ Unified hiring logic — equipNewHire helper applies Apeiron/Vrbansk to all hire paths — v1.3
- ✓ Victory/defeat conditions — isDefeated includes base capture, rebel elimination guards Day 1 — v1.3
- ✓ Canonical identity properties — combatantId/combatantName via abstract getters in CombatantBase — v1.4
- ✓ Model class renaming — CombatUnit → CombatantBase, CombatUnitCard → CombatantModel — v1.4
- ✓ Type guard renaming — isCombatUnitCard → isCombatantModel with backward-compat alias — v1.4
- ✓ Vue component renaming — MercCard.vue → CombatantCard.vue — v1.4
- ✓ Architecture documentation — CLAUDE.md guide with class hierarchy and conventions — v1.4
- ✓ CombatantModel concrete class — single unified class with cardType discriminator — v1.5
- ✓ Removed ID aliases — only combatantId/combatantName identity properties — v1.5
- ✓ Removed backward-compat exports — clean CombatantModel-based types — v1.5
- ✓ Final ID cleanup — eradicated all mercId/mercName/dictatorId/dictatorName patterns — v1.6
- ✓ Extract GameBoard.vue UI flows into focused components (HiringPhase, HagnessDrawEquipment, LandingZoneSelection, GameOverOverlay) — v1.7
- ✓ Extract helper functions to composables (useGameViewHelpers, useVictoryCalculations) — v1.7
- ✓ Extract state derivation to composables (usePlayerState, useSectorState, useSquadState, useActionState) — v1.7
- ✓ GameBoard.vue reduced to thin orchestrator (3,368 → 1,393 lines, 59% reduction) — v1.7

### v1.9 BoardSmith v3.0 Animation Timeline Migration (In Progress)

- [ ] ANIM-01: Remove all theatre view / acknowledgment protocol code (useCurrentView, acknowledgeAnimations action, acknowledge callback)
- [ ] ANIM-02: Restructure combat.ts to emit `combat-panel` snapshot events with full combatant data per decision cycle
- [ ] ANIM-03: Move mutations out of game.animate() callbacks — pure data events followed by normal mutations
- [ ] ANIM-04: CombatPanel reads 100% from animation events — no gameView/truth/activeCombat prop reads
- [ ] ANIM-05: Decision context (pendingTargetSelection, pendingHitAllocation, etc.) embedded in combat-panel events
- [ ] ANIM-06: Simplified panel lifecycle — opens on combat events, closes after combat-end, no state machine
- [ ] ANIM-07: GameTable combat wiring updated — no theatre/truth view fallback logic
- [ ] ANIM-08: Test coverage — combat animation flow tests verifying snapshot + event sequences

<!-- Existing working functionality inferred from codebase -->

- ✓ Unified stat ability system — single source of truth for 18 stat-modifying abilities — v1.8
- ✓ Game logic layer with combat system, MERC abilities, equipment effects — existing
- ✓ Action layer: movement, economy, equipment, combat, dictator actions — existing
- ✓ Vue 3 UI with GameBoard, panels, cards, map components — existing
- ✓ Data layer with JSON configuration for MERCs, equipment, sectors, tactics — existing
- ✓ Test suite covering combat, abilities, equipment — existing
- ✓ BoardSmith framework integration (engine, session, ui, runtime) — existing

### Out of Scope

(None currently)

## Context

**Codebase State:**
- Brownfield project with working game implementation
- TypeScript 5.7.0 with strict mode enabled
- BoardSmith v3.0 installed (animation timeline replaces theatre view)
- 32,090 lines of TypeScript/Vue code
- Comprehensive test coverage for combat, abilities, equipment, conditions, state persistence, and error handling
- Clean class hierarchy: CombatantBase → CombatantModel (concrete)
- Architecture documented in CLAUDE.md
- Zero legacy ID patterns (mercId/mercName/dictatorId/dictatorName eradicated)

**BoardSmith v3.0 Breaking Changes:**
- Theatre view system removed (no more frozen snapshots, mutation capture, or view split)
- `useCurrentView()` composable removed — single truth view via `gameView`
- `acknowledgeAnimationEvents()` removed — no server-side animation tracking
- `game.animate(type, data, callback?)` still works but callback is just normal code (no mutation capture)
- Animation playback is 100% client-owned — server broadcasts truth immediately

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
| Check dictatorId before mercId | Reliable combatant type detection in Vue components | ✓ Good |
| OR check for ability actions | isRebelPlayer OR isDictatorPlayer enables any controller | ✓ Good |
| Shared equipNewHire helper | Single function for all 4 hire paths | ✓ Good |
| isDefeated includes base capture | Dictator loses when dead OR base captured | ✓ Good |
| Abstract getters for identity | combatantId/combatantName via abstract getters allows subclass implementations | ✓ Good |
| CombatantModel concrete class | Single class with cardType discriminator; MercCard/DictatorCard as subclasses | ✓ Good |
| No backward-compat aliases | Clean exports only - migration complete | ✓ Good |
| className strings preserved | MercCard/DictatorCard classRegistry keys must match TypeScript class names | ✓ Good |
| Shared composables for action state | Reduce prop drilling, components import state directly | ✓ Good |
| Watch both availableActions AND currentAction | Auto-start watcher needs to fire when previous action completes | ✓ Good |
| Match choices by display name, fill with element ID | ActionPanel pattern - choices have display/value structure | ✓ Good |
| Unified stat ability system | Single source of truth for ability bonuses - define once, calculate once, display once | ✓ Good |
| CombatPanel 100% event-driven | Animation events carry all data — no gameView/truth reads for combat | — Pending |
| Full snapshot per decision cycle | Handles refresh/late-join — no history needed | — Pending |
| Mutations out of animate callbacks | Pure data events + normal mutations after — cleaner separation | — Pending |
| ActionController stays for player decisions | Decisions submitted through existing action system | — Pending |

---
*Last updated: 2026-02-07 v1.9 milestone initialized*
