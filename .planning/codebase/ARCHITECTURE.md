# Architecture

**Analysis Date:** 2026-01-08

## Pattern Overview

**Overall:** Modular Layered Architecture with BoardSmith Framework

**Key Characteristics:**
- Framework-based: Built on @boardsmith/engine base classes
- Action-based state mutations: Players interact via registered Action objects
- Turn-based flow system: Explicit phase/step definitions
- Configuration-driven: Game data externalized to JSON files

## Layers

**Rules/Game Logic Layer:**
- Purpose: Core game state and rule implementation
- Contains: Game classes, flow definition, combat system, ability systems
- Location: `src/rules/*.ts`
- Depends on: @boardsmith/engine, data/*.json
- Used by: UI layer, actions layer

**Action Layer:**
- Purpose: Player action definitions with validation and execution
- Contains: Action creators organized by domain (movement, economy, combat, equipment)
- Location: `src/rules/actions/*.ts`
- Depends on: Rules layer (game.ts, elements.ts)
- Used by: BoardSmith engine (registered actions)

**UI/Presentation Layer:**
- Purpose: Vue 3 components for game visualization and interaction
- Contains: GameBoard, panels, cards, map components
- Location: `src/ui/`, `src/ui/components/*.vue`
- Depends on: Rules layer, @boardsmith/ui (GameShell)
- Used by: Browser runtime

**Data Layer:**
- Purpose: Game entity definitions (cards, sectors, abilities)
- Contains: JSON configuration files
- Location: `data/*.json`
- Depends on: None
- Used by: Rules layer (loaded at initialization)

## Data Flow

**Game State Flow:**

1. Initialization: `setup.ts` builds game board, decks, players from data/*.json
2. Flow Engine: `flow.ts` defines phases (landing, daily turns, combat)
3. Player Turn: `GameBoard.vue` displays available actions via BoardSmith engine
4. Action Selection: Player selects action with parameters
5. Action Execution: `Action.execute()` mutates game state
6. State Update: BoardSmith framework serializes and broadcasts state
7. UI Render: Vue components re-render based on new state

**Combat Execution Flow:**

1. Movement triggers potential combat via `createMoveAction`
2. `executeCombat()` initializes combat with sector combatants
3. Initiative calculated from MERC abilities and equipment bonuses
4. Combat rounds execute in initiative order with damage resolution
5. `executeCombatRetreat()` allows conditional retreat
6. Combat result triggers cascading effects (equipment, abilities)

**State Management:**
- File-based: Game data lives in `data/*.json`
- In-memory: Game state managed by BoardSmith engine
- Persistent maps: Special state via `persistentMap()` and `game.settings`

## Key Abstractions

**Game:**
- Purpose: Root game container extending BoardSmith Game
- Examples: `MERCGame` in `src/rules/game.ts`
- Pattern: Singleton per game session

**Player:**
- Purpose: Player types with distinct capabilities
- Examples: `RebelPlayer`, `DictatorPlayer` in `src/rules/game.ts`
- Pattern: Polymorphism for role-specific behavior

**CombatUnit:**
- Purpose: Combat participants with stats and abilities
- Examples: `MercCard`, `DictatorCard`, `Militia` in `src/rules/elements.ts`
- Pattern: Abstract base with specialized subclasses

**Card/Deck:**
- Purpose: Card types and collections
- Examples: `Equipment`, `TacticsCard`, `MercDeck`, `TacticsDeck`
- Pattern: BoardSmith Card/Deck base classes

**Action:**
- Purpose: Player action definitions with validation
- Examples: `createHireMercAction()`, `createMoveAction()`
- Pattern: Action.create() builder with condition/execute

**Ability System:**
- Purpose: Special rules tied to game elements
- Examples: `MERC_ABILITIES` registry, `EQUIPMENT_EFFECTS` registry
- Pattern: Registry pattern with helper functions

## Entry Points

**Application Entry:**
- Location: `src/main.ts`
- Triggers: Browser loads index.html
- Responsibilities: Create Vue app, mount GameShell

**Game Entry:**
- Location: `src/rules/index.ts`
- Triggers: BoardSmith runtime initializes game
- Responsibilities: Export gameDefinition, register actions

**Flow Entry:**
- Location: `src/rules/flow.ts`
- Triggers: Game start
- Responsibilities: Define phases (landing, daily, combat), step conditions

## Error Handling

**Strategy:** Throw errors, catch at action boundaries, log and report to user

**Patterns:**
- Action validation via `.condition()` prevents invalid actions
- Combat errors caught and logged with context
- UI displays error messages via `game.message()`
- 17 try/catch blocks in combat.ts for error isolation

## Cross-Cutting Concerns

**Logging:**
- `game.message()` for user-visible messages
- Console logging for debug (DEBUG_TACTICS_ORDER)

**Validation:**
- Action conditions validate before execution
- Type assertions with manual null checks
- TSC strict mode for compile-time checking

**State Persistence:**
- `persistentMap()` for coordinated attacks, pending loot
- `game.settings` for drawn cards, extra militia
- Survives HMR during development

---

*Architecture analysis: 2026-01-08*
*Update when major patterns change*
