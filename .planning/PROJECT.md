# MERC

## What This Is

A strategic combat board game built on the @boardsmith/engine framework. Players control mercenary squads fighting against (or as) a dictator on a hex grid map. The codebase has been through 11 milestones of systematic cleanup, bug fixing, and feature completion.

## Core Value

**Ship Confidence** — the game should behave correctly, consistently, and visibly. Every game mechanic works as designed, every UI action is properly wired, and every significant game event has a visible animation.

## Current State

**Shipped:** v1.10 Grievances (2026-02-09)

- 41,145 lines of TypeScript/Vue (modular structure)
- Zero `as any` casts in src/rules/
- Unified class hierarchy: CombatantBase → CombatantModel (concrete class)
- Canonical identity: combatantId/combatantName (no legacy aliases)
- Property-based type guards (isCombatantModel)
- Single combatants.json data file (54 entries)
- CombatantCard.vue component for rendering any combatant
- CombatPanel is 100% event-driven animation player (no theatre view, no state machine)
- Combat events: pure data animate calls + combat-panel snapshots at all 8 decision cycles
- GameTable combat section: ~15 lines (snapshot-driven visibility)
- All 14 dictator tactics cards audited, corrected, and animated
- Bidirectional landmine system with Squidhead counter-ability
- Compiler-enforced bandolier equipment handling (EquipResult)
- Sector panel actions fully wired with correct auto-fill
- CLAUDE.md architecture guide for AI navigation
- 657 tests passing
- 11 milestones shipped, 50 phases, 100 plans

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
- ✓ Unified stat ability system — single source of truth for 18 stat-modifying abilities — v1.8
- ✓ Remove all theatre view / acknowledgment protocol code — v1.9
- ✓ combat-panel snapshot events with full combatant data per decision cycle — v1.9
- ✓ Pure data game.animate() calls — mutations after call, not in callbacks — v1.9
- ✓ CombatPanel reads 100% from animation events — no gameView/truth/activeCombat prop reads — v1.9
- ✓ Decision context embedded in combat-panel events — v1.9
- ✓ Simplified panel lifecycle — event-driven open/close, no state machine — v1.9
- ✓ GameTable combat wiring — snapshot-driven visibility, no fallback chains — v1.9
- ✓ Combat animation flow tests — 21 tests verifying snapshot + event pipeline — v1.9
- ✓ Bandolier replacement drops contents to sector stash — compiler-enforced EquipResult — v1.10
- ✓ Sector panel action audit — all actions prepopulate from selected sector, correct auto-fill — v1.10
- ✓ Landmine system — bidirectional trigger on movement, damage, discard, Squidhead counter — v1.10
- ✓ Full dictator tactics card audit — all 14 cards verified, fabricated bonuses removed — v1.10
- ✓ Every dictator tactics card has a meaningful animation — v1.10
- ✓ Generalissimo — draw 6 mercs, pick 1, interactive flow with action + flow step — v1.10
- ✓ Better Weapons — militia hit on 3+ going forward (persistent buff) — v1.10
- ✓ Lockdown — 5×rebelCount militia placed on base/adjacent sectors, interactive placement — v1.10

### Active

(None — next milestone not yet planned)

### Out of Scope

(None currently)

## Context

**Codebase State:**
- Brownfield project with working game implementation
- TypeScript 5.7.0 with strict mode enabled
- BoardSmith v3.0 fully integrated (animation timeline, no theatre view)
- 41,145 lines of TypeScript/Vue code
- 657 tests (combat, abilities, equipment, conditions, state persistence, error handling, combat events, landmines)
- Clean class hierarchy: CombatantBase → CombatantModel (concrete)
- CombatPanel is event-driven animation player (combat-panel snapshots + pure data animate events)
- Architecture documented in CLAUDE.md
- Zero legacy ID patterns (mercId/mercName/dictatorId/dictatorName eradicated)
- 11 milestones shipped (v1.0-v1.10)

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
| CombatPanel 100% event-driven | Animation events carry all data — no gameView/truth reads for combat | ✓ Good |
| Full snapshot per decision cycle | Handles refresh/late-join — no history needed | ✓ Good |
| Mutations out of animate callbacks | Pure data events + normal mutations after — cleaner separation | ✓ Good |
| ActionController stays for player decisions | Decisions submitted through existing action system | ✓ Good |
| Parent-owned snapshot (GameTable) | Always-mounted parent registers handler, eliminates mount-race | ✓ Good |
| Snapshot + healthOverrides pattern | Snapshot authoritative at decision points, overrides for per-hit updates | ✓ Good |
| EquipResult return type for equip() | Compiler-enforced handling of displaced bandolier items | ✓ Good |
| Bidirectional checkLandMines | Single function handles both rebel and dictator movement | ✓ Good |
| Friendly mine heuristic | Mine is friendly when entering player has militia AND no enemies | ✓ Good |
| SectorPanel sel.type detection | Type-based format detection for chooseFrom vs chooseElement | ✓ Good |
| Remove fabricated tactics bonuses | generalisimoActive/lockdownActive had no basis in CSV rules | ✓ Good |
| Loop-based animation registration | Single activeTacticEvent ref shared across all 14 event types | ✓ Good |

---
*Last updated: 2026-02-09 after v1.10 milestone complete*
