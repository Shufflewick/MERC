# Codebase Structure

**Analysis Date:** 2026-01-08

## Directory Layout

```
MERC/
├── src/                          # Application source code
│   ├── main.ts                   # Vue app entry point
│   ├── rules/                    # Game logic (core system)
│   │   ├── index.ts              # Main exports and game definition
│   │   ├── game.ts               # MERCGame, RebelPlayer, DictatorPlayer
│   │   ├── elements.ts           # Cards, pieces, board entities
│   │   ├── flow.ts               # Game phases and turn structure
│   │   ├── setup.ts              # Initial game setup
│   │   ├── day-one.ts            # Day 1 landing phase
│   │   ├── combat.ts             # Combat system (largest file)
│   │   ├── constants.ts          # Game constants
│   │   ├── merc-abilities.ts     # MERC special abilities registry
│   │   ├── dictator-abilities.ts # Dictator abilities
│   │   ├── equipment-effects.ts  # Equipment bonuses/effects
│   │   ├── tactics-effects.ts    # Tactics card effects
│   │   ├── ai-executor.ts        # AI decision execution
│   │   ├── ai-helpers.ts         # AI evaluation functions
│   │   ├── debug-config.ts       # Debug configuration
│   │   └── actions/              # Player action definitions
│   │       ├── index.ts          # Action registration
│   │       ├── helpers.ts        # Shared utilities
│   │       ├── rebel-movement.ts # Movement, coordinated attacks
│   │       ├── rebel-combat.ts   # Combat continue/retreat
│   │       ├── rebel-economy.ts  # Hiring, exploring, training
│   │       ├── rebel-equipment.ts# Equipment management
│   │       ├── dictator-actions.ts
│   │       └── day-one-actions.ts
│   └── ui/                       # Vue 3 UI layer
│       ├── index.ts              # UI exports
│       ├── App.vue               # Root component
│       ├── colors.ts             # UI color palette
│       └── components/           # Vue components
│           ├── GameBoard.vue     # Main game interface
│           ├── SectorPanel.vue   # Sector details
│           ├── MercCard.vue      # MERC display
│           ├── CombatPanel.vue   # Combat with 3D dice
│           ├── DictatorPanel.vue # Dictator UI
│           ├── EquipmentCard.vue # Equipment display
│           ├── SectorTile.vue    # Map tile
│           └── MapGrid.vue       # Map grid
├── data/                         # Game entity definitions
│   ├── mercs.json                # MERC unit data
│   ├── equipment.json            # Equipment data
│   ├── sectors.json              # Map sector definitions
│   ├── dictators.json            # Dictator characters
│   ├── dictator-tactics.json     # Tactics cards
│   ├── setup.json                # Setup configuration
│   └── rules/                    # Rules documentation (*.md)
├── tests/                        # Test files (Vitest)
│   ├── game.test.ts              # Game setup tests
│   ├── smoke.test.ts             # Core flow smoke tests
│   ├── combat-*.test.ts          # Combat system tests
│   ├── merc-abilities*.test.ts   # Ability tests
│   └── equipment-effects.test.ts # Equipment tests
├── dist/                         # Build output
├── public/                       # Static assets
├── .planning/                    # Project planning
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
├── vite.config.ts                # Vite config
└── boardsmith.json               # Game metadata
```

## Directory Purposes

**src/rules/**
- Purpose: Core game logic and rule implementation
- Contains: Game state, flow, combat, abilities, AI
- Key files: `game.ts` (1631 lines), `combat.ts` (2879 lines), `elements.ts` (1278 lines)
- Subdirectories: `actions/` for player action definitions

**src/rules/actions/**
- Purpose: Player action definitions with validation
- Contains: Action creators organized by domain
- Key files: `rebel-economy.ts`, `rebel-equipment.ts`, `dictator-actions.ts`
- Pattern: `create*Action()` factory functions

**src/ui/**
- Purpose: Vue 3 presentation layer
- Contains: Root app, components, utilities
- Key files: `App.vue` (GameShell integration), `GameBoard.vue` (main interface)
- Subdirectories: `components/` for Vue components

**data/**
- Purpose: Game entity data (cards, sectors, abilities)
- Contains: JSON files loaded at game initialization
- Key files: `mercs.json`, `equipment.json`, `sectors.json`
- Subdirectories: `rules/` for game rules documentation

**tests/**
- Purpose: Vitest test suites
- Contains: Unit and integration tests
- Pattern: `*.test.ts` files, ~3933 lines total

## Key File Locations

**Entry Points:**
- `src/main.ts` - Vue app bootstrap
- `src/rules/index.ts` - Game definition export
- `index.html` - HTML entry

**Configuration:**
- `boardsmith.json` - Game metadata (name, player count, duration)
- `tsconfig.json` - TypeScript: ES2022, strict, bundler resolution
- `vite.config.ts` - Vite bundler settings

**Core Logic:**
- `src/rules/game.ts` - MERCGame class, player classes
- `src/rules/combat.ts` - Combat system (most complex)
- `src/rules/flow.ts` - Phase definitions
- `src/rules/setup.ts` - Game initialization

**Ability Systems:**
- `src/rules/merc-abilities.ts` - MERC_ABILITIES registry
- `src/rules/equipment-effects.ts` - EQUIPMENT_EFFECTS registry
- `src/rules/dictator-abilities.ts` - Dictator abilities
- `src/rules/tactics-effects.ts` - Tactics card effects

**Testing:**
- `tests/smoke.test.ts` - Core flow tests
- `tests/merc-abilities-integration.test.ts` - Largest test file (955 lines)

## Naming Conventions

**Files:**
- kebab-case for modules: `merc-abilities.ts`, `equipment-effects.ts`
- PascalCase for Vue components: `GameBoard.vue`, `MercCard.vue`
- *.test.ts suffix for tests: `combat-execution.test.ts`

**Directories:**
- Lowercase: `rules/`, `actions/`, `components/`
- Plural for collections: `tests/`

**Special Patterns:**
- `index.ts` for barrel exports
- `helpers.ts` for shared utilities

## Where to Add New Code

**New MERC Ability:**
- Add to `MERC_ABILITIES` in `src/rules/merc-abilities.ts`
- Add helper function if needed
- Add tests to `tests/merc-abilities.test.ts`

**New Equipment Effect:**
- Add to `EQUIPMENT_EFFECTS` in `src/rules/equipment-effects.ts`
- Add data to `data/equipment.json`
- Add tests to `tests/equipment-effects.test.ts`

**New Player Action:**
- Create action in appropriate `src/rules/actions/*.ts`
- Register in `src/rules/actions/index.ts`
- Add tests

**New UI Component:**
- Create in `src/ui/components/`
- Use PascalCase naming
- Import in parent component

**New Game Entity:**
- Define class in `src/rules/elements.ts`
- Add data to `data/*.json`

## Special Directories

**dist/**
- Purpose: Compiled JavaScript output
- Source: TypeScript compilation via Vite
- Committed: No (.gitignore)

**.planning/**
- Purpose: Project planning documents
- Source: Manual documentation
- Committed: Yes

---

*Structure analysis: 2026-01-08*
*Update when directory structure changes*
