# Coding Conventions

**Analysis Date:** 2026-01-08

## Naming Patterns

**Files:**
- kebab-case for utility modules: `merc-abilities.ts`, `equipment-effects.ts`, `ai-helpers.ts`
- kebab-case for action files: `rebel-movement.ts`, `rebel-economy.ts`, `dictator-actions.ts`
- lowercase for core files: `game.ts`, `flow.ts`, `elements.ts`, `combat.ts`
- PascalCase for Vue components: `GameBoard.vue`, `MercCard.vue`, `SectorPanel.vue`
- *.test.ts suffix for tests: `merc-abilities.test.ts`, `combat-execution.test.ts`

**Functions:**
- `is*` prefix for boolean checks: `isFemale()`, `isHandgun()`, `isExplosive()`, `isSmaw()`
- `get*` prefix for getters: `getMercAbility()`, `getEquipmentEffect()`, `getHitThreshold()`
- `has*` prefix for existence checks: `hasCombatCondition()`, `hasActionsRemaining()`
- `can*` prefix for possibility checks: `canRerollOnce()`, `canHireMercWithTeam()`
- `create*Action` suffix for action factories: `createHireMercAction()`, `createMoveAction()`
- camelCase for general functions: `handleAction()`, `showTooltip()`, `toggleTooltip()`

**Variables:**
- camelCase for variables: `targetSector`, `actingMerc`, `pendingLoot`
- UPPER_SNAKE_CASE for constants: `ACTION_COSTS`, `HIT_THRESHOLD`, `MILITIA_HEALTH`
- PascalCase for constant objects: `CombatConstants`, `MercConstants`, `SectorConstants`

**Types:**
- PascalCase for interfaces: `Combatant`, `CombatResult`, `MercAbility`
- PascalCase for type aliases: `AbilityCondition`, `BonusTarget`, `EquipmentType`
- No I prefix for interfaces

## Code Style

**Formatting:**
- 2-space indentation (TypeScript standard)
- Semicolons required
- Single quotes for strings in TypeScript
- Double quotes in Vue templates

**Linting:**
- TypeScript strict mode enabled (`strict: true` in tsconfig.json)
- No ESLint or Prettier config (uses TypeScript defaults)

## Import Organization

**Order:**
1. Type imports: `import type { ... } from '...'`
2. External packages: `@boardsmith/engine`, `vue`
3. Relative imports: `./elements.js`, `../rules/game.js`

**Grouping:**
- Type imports separated from value imports
- Package imports before relative imports
- File extension required for ESM: `.js` extension

**Example:**
```typescript
import type { MERCGame, RebelPlayer } from './game.js';
import { Action, type ActionDefinition } from '@boardsmith/engine';
import { MercCard, Equipment, Sector } from './elements.js';
```

## Error Handling

**Patterns:**
- Action validation via `.condition()` returns boolean
- Throw errors with descriptive messages in execute blocks
- Try/catch at action boundaries
- User-facing messages via `game.message()`

**Error Types:**
- Return false from conditions for invalid actions
- Return `{ error: string }` from execute for runtime failures
- Throw for unexpected states (bugs)

## Logging

**Framework:**
- `game.message()` for user-visible game messages
- `console.log` for debug (should be removed for production)

**Patterns:**
- Messages include context: `game.message(\`${merc.name} moved to ${sector.sectorName}\`)`
- Debug messages prefixed: `DEBUG:`

## Comments

**When to Comment:**
- File-level JSDoc headers explaining purpose
- Section separators for logical groupings: `// ===== SECTION =====`
- References to game rules: `// Per rules (06-merc-actions.md)`
- References to feature IDs: `// MERC-yi7:`, `// MERC-s37:`
- Explain why, not what

**JSDoc:**
- Used for exported functions and interfaces
- `@param`, `@returns` tags for public APIs

**Section Markers:**
```typescript
// =============================================================================
// MERC Ability Registry
// =============================================================================
```

**TODO Comments:**
- Format: `// TODO - description`
- Include context: `// MERC-lw9r: TODO - Rebels should ideally choose...`

## Function Design

**Size:**
- Keep functions focused
- Extract helpers for complex logic
- Large files acceptable for cohesive domains (combat.ts: 2879 lines)

**Parameters:**
- Use object destructuring for multiple parameters
- Type parameters explicitly

**Return Values:**
- Explicit return types on exports
- Return early for guard clauses
- Return `{ error: string }` for handled failures

## Module Design

**Exports:**
- Named exports preferred
- Barrel exports via `index.ts`
- Type exports separated: `export type { ... }`

**Registry Pattern:**
```typescript
export const MERC_ABILITIES: Record<string, MercAbility> = { ... };
export function getMercAbility(mercId: string): MercAbility | undefined {
  return MERC_ABILITIES[mercId];
}
```

**Action Pattern:**
```typescript
export function createXAction(game: MERCGame): ActionDefinition {
  return Action.create('actionName')
    .prompt('User prompt')
    .condition((ctx) => { /* validation */ })
    .chooseElement(/* ... */)
    .execute((ctx) => { /* mutation */ });
}
```

---

*Convention analysis: 2026-01-08*
*Update when patterns change*
