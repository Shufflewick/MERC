# Testing Patterns

**Analysis Date:** 2026-01-08

## Test Framework

**Runner:**
- Vitest 2.0.0
- Config: Uses Vitest defaults (no vitest.config.ts)

**Assertion Library:**
- Vitest built-in expect (Chai under the hood)
- Matchers: toBe, toEqual, toBeDefined, toBeNull, toThrow

**Run Commands:**
```bash
npm test                              # Run all tests
npm test -- --watch                   # Watch mode
npm test -- tests/game.test.ts        # Single file
```

## Test File Organization

**Location:**
- All tests in `tests/` directory at project root
- Not co-located with source files

**Naming:**
- `*.test.ts` suffix for all test files
- kebab-case: `merc-abilities.test.ts`, `combat-execution.test.ts`

**Structure:**
```
tests/
├── game.test.ts                    # Game setup tests (206 lines)
├── smoke.test.ts                   # Core flow smoke tests (461 lines)
├── merc-abilities.test.ts          # Ability registry tests (439 lines)
├── merc-abilities-integration.test.ts # Ability integration (955 lines)
├── combat-abilities.test.ts        # Combat ability tests (495 lines)
├── combat-execution.test.ts        # Combat execution tests (508 lines)
├── equipment-effects.test.ts       # Equipment registry tests (459 lines)
└── hagness-vulture.test.ts         # Specific character tests (410 lines)
```

**Total:** 3,933 lines across 8 test files

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestGame, simulateAction } from '@boardsmith/testing';

describe('Feature Name', () => {
  describe('functionName', () => {
    it('should handle valid input', () => {
      // arrange
      const game = createTestGame({ /* options */ });

      // act
      const result = functionName(game);

      // assert
      expect(result).toBeDefined();
    });

    it('should handle error case', () => {
      expect(() => functionName(null)).toThrow();
    });
  });
});
```

**Patterns:**
- Use `describe` for grouping related tests
- Use `it` for individual test cases
- Arrange/Act/Assert structure
- One assertion focus per test

## Test Helpers from @boardsmith/testing

**Game Creation:**
```typescript
const game = createTestGame({
  playerCount: 2,
  skipSetup: false,
  // other options
});
```

**Action Simulation:**
```typescript
simulateAction(game, 'actionName', {
  playerId: 'player1',
  params: { /* action parameters */ }
});
```

**Assertions:**
```typescript
assertFlowState(game, 'expectedPhase');
assertActionAvailable(game, 'actionName');
```

**Debug Helpers:**
```typescript
traceAction(game, actionName);           // Trace execution
logAvailableActions(game);               // Log available actions
toDebugString(game);                     // Serialize state
diffSnapshots(snapshot1, snapshot2);     // Compare states
```

## Mocking

**Framework:**
- Vitest built-in mocking (vi)

**Patterns:**
```typescript
import { vi } from 'vitest';

// Mock module
vi.mock('./external-module', () => ({
  externalFunction: vi.fn()
}));

// Mock in test
const mockFn = vi.mocked(externalFunction);
mockFn.mockReturnValue('mocked result');
```

**What to Mock:**
- Random number generation (dice rolls)
- External API calls (if any)

**What NOT to Mock:**
- Game state and logic
- Internal business rules
- BoardSmith engine internals

## Fixtures and Factories

**Test Data:**
- Use `createTestGame()` with configuration options
- Inline data for simple cases
- No separate fixtures directory

**Example:**
```typescript
// Factory via test helper
const game = createTestGame({ playerCount: 2 });

// Direct setup
const team = [{ mercId: 'squirrel' }] as MercCard[];
expect(canHireMercWithTeam('borris', team)).toBe(false);
```

## Coverage

**Requirements:**
- No enforced coverage target
- Coverage tracked for awareness

**Configuration:**
- Vitest built-in coverage via c8

**View Coverage:**
```bash
npm run test:coverage
```

## Test Types

**Unit Tests:**
- Test registry functions and helpers
- Examples: `merc-abilities.test.ts`, `equipment-effects.test.ts`
- Mock dependencies when needed
- Fast execution

**Integration Tests:**
- Test actual gameplay scenarios
- Examples: `merc-abilities-integration.test.ts`, `smoke.test.ts`
- Use `createTestGame()` and `simulateAction()`
- Test full action flows

**Combat Tests:**
- Test combat mechanics and ability interactions
- Examples: `combat-abilities.test.ts`, `combat-execution.test.ts`
- Complex state management

## Common Patterns

**Async Testing:**
```typescript
it('should handle async operation', async () => {
  const result = await asyncFunction();
  expect(result).toBe('expected');
});
```

**Error Testing:**
```typescript
it('should throw on invalid input', () => {
  expect(() => functionCall(null)).toThrow('error message');
});
```

**Registry Testing:**
```typescript
describe('MERC Ability Registry', () => {
  it('should return ability data for known MERCs', () => {
    expect(getMercAbility('lucid')).toBeDefined();
  });

  it('should return undefined for unknown MERCs', () => {
    expect(getMercAbility('nonexistent')).toBeUndefined();
  });
});
```

**Integration Testing:**
```typescript
describe('Combat Integration', () => {
  it('Borris cannot be hired with Squirrel on team', () => {
    const team = [{ mercId: 'squirrel' }] as MercCard[];
    expect(canHireMercWithTeam('borris', team)).toBe(false);
  });
});
```

**Snapshot Testing:**
- Not currently used in this codebase
- Prefer explicit assertions

---

*Testing analysis: 2026-01-08*
*Update when test patterns change*
