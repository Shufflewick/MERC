# Phase 62: AI & Comprehensive Testing - Research

**Researched:** 2026-02-17
**Domain:** AI dictator decision-making + test coverage for 9 expansion dictators
**Confidence:** HIGH

## Summary

All 9 expansion dictator abilities have already been implemented in `src/rules/dictator-abilities.ts` with both AI and human paths. The AI decision logic is embedded directly in the ability functions (e.g., `applyGadafiTurnAbility`, `applyHitlerTurnAbility`) and uses shared AI helpers from `ai-helpers.ts`. The main dispatchers `applyDictatorSetupAbilities()` and `applyDictatorTurnAbilities()` already route to all 11 dictators (Castro, Kim + 9 expansion).

The work in this phase is primarily **verification and testing** rather than implementation. The AI paths exist but have never been exercised through integration tests. Unit tests for individual ability functions are also absent. The reactive abilities (Gaddafi loot, Pinochet hire) have AI paths wired into `flow.ts` via `processGaddafiLoot()` and `applyPinochetPendingHires()`.

**Primary recommendation:** Write unit tests for each ability function in isolation, then write integration tests using the `GameRunner` + `autoResolveArgs` pattern to play full AI games with each dictator.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | existing | Test framework | Already used across all tests |
| boardsmith/testing | existing | `createTestGame`, `simulateAction`, debug utilities | Standard test helpers |
| boardsmith/runtime | existing | `GameRunner` for fine-grained control | Used by integration tests |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ActionExecutor | existing | Get action choices programmatically | When needing to resolve selections |

**Installation:** No new dependencies needed.

## Architecture Patterns

### Test File Organization
```
tests/
  dictator-abilities.test.ts     # Unit tests for all 9 dictator ability functions
  dictator-ai-integration.test.ts  # Integration tests: AI plays full game per dictator
```

### Pattern 1: Unit Testing Ability Functions Directly
**What:** Import and call dictator ability functions directly with a game in known state.
**When to use:** Testing per-turn, setup, and reactive abilities in isolation.
**Example:**
```typescript
// Source: existing pattern from tests/smoke.test.ts
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { applyGadafiTurnAbility } from '../src/rules/dictator-abilities.js';

it('Gaddafi per-turn: hires 1 MERC', () => {
  const testGame = createTestGame(MERCGame, {
    playerCount: 2,
    playerNames: ['Rebel1', 'Dictator'],
    seed: 'gadafi-hire-test',
  });
  const game = testGame.game;
  game.setupDictator('gadafi');

  // Set up game state as needed
  const initialMercs = game.dictatorPlayer.hiredMercs.length;
  const result = applyGadafiTurnAbility(game);

  expect(result.success).toBe(true);
  expect(game.dictatorPlayer.hiredMercs.length).toBe(initialMercs + 1);
});
```

### Pattern 2: GameRunner Integration Test (AI Full Game)
**What:** Create a GameRunner with `dictatorIsAI: true` and auto-play through game.
**When to use:** Verifying AI can play a complete game without errors.
**Example:**
```typescript
// Source: existing pattern from tests/combat-barriers.test.ts, tests/mcts-clone.test.ts
import { GameRunner } from 'boardsmith/runtime';
import { MERCGame } from '../src/rules/game.js';

function createAIGame(dictator: string, seed: string): GameRunner<MERCGame> {
  return new GameRunner<MERCGame>({
    GameClass: MERCGame,
    gameType: 'merc',
    gameOptions: {
      playerCount: 2,
      playerNames: ['Rebel1', 'DictatorBot'],
      seed,
      dictatorIsAI: true,
      dictatorChoice: dictator,  // not gameOptions.dictatorCharacter
      playerConfigs: [
        { color: '#e74c3c', isDictator: false, isAI: true },
        { color: '#95a5a6', isDictator: true, isAI: true, aiLevel: 'medium' },
      ],
    } as any,
  });
}

it('AI plays full game as Gaddafi without errors', () => {
  const runner = createAIGame('gadafi', 'gadafi-full-1');
  runner.start();

  let actionCount = 0;
  const maxActions = 500;

  while (actionCount < maxActions) {
    const flowState = runner.game.getFlowState();
    if (!flowState || flowState.complete) break;

    const action = getCurrentAction(flowState);
    if (!action) break;

    const args = autoResolveArgs(runner.game, action.available[0], action.currentPlayer);
    if (!args) break;

    const result = runner.performAction(action.available[0], action.currentPlayer, args);
    if (result.success) actionCount++;
    else break;
  }

  expect(actionCount).toBeGreaterThan(10);
});
```

### Pattern 3: autoResolveArgs Helper
**What:** Auto-resolve action selections by picking first valid choice for each selection.
**When to use:** In integration tests to auto-play through game flow.
**Source:** Already implemented in `tests/combat-barriers.test.ts:26-87` and `tests/mcts-clone.test.ts`.

### Anti-Patterns to Avoid
- **Testing AI through the UI layer:** Test AI decision functions directly or via GameRunner, not through Vue components.
- **Duplicating autoResolveArgs:** Extract to shared test helper if not already shared; currently duplicated in combat-barriers.test.ts and mcts-clone.test.ts.
- **Testing with fixed seeds only:** Use multiple seeds per dictator to catch seed-dependent edge cases.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Game state setup | Manual state construction | `createTestGame` + `game.setupDictator()` | Ensures valid game state |
| Action execution | Direct function calls | `GameRunner.performAction()` | Handles flow transitions correctly |
| Selection resolution | Manual arg building | `autoResolveArgs()` pattern | Handles all selection types |
| Flow state inspection | Custom state readers | `game.getFlowState()` | Standard API |

## Common Pitfalls

### Pitfall 1: dictatorChoice vs dictatorCharacter
**What goes wrong:** Using `gameOptions.dictatorCharacter` when you need `dictatorChoice` in test setup.
**Why it happens:** Two different paths exist. `dictatorCharacter` goes through `gameOptions` while `dictatorChoice` is a direct option.
**How to avoid:** Use `dictatorChoice` in test options for direct dictator selection. The game constructor checks both paths (game.ts lines 916-920).
**Warning signs:** Dictator is random instead of the expected one.

### Pitfall 2: isAI Not Set on Dictator Player
**What goes wrong:** AI ability paths are skipped because `game.dictatorPlayer?.isAI` returns false.
**Why it happens:** `dictatorIsAI: true` must be set in game options AND player configs need `isAI: true` on the dictator player config.
**How to avoid:** Always set both `dictatorIsAI: true` in options and `isAI: true` in the dictator's playerConfig.
**Warning signs:** `applyDictatorTurnAbilities` is called but human action step is shown instead.

### Pitfall 3: Dictator IDs Use Internal Spelling
**What goes wrong:** Tests use 'gaddafi' but the internal ID is 'gadafi' (one d).
**Why it happens:** The combatant data uses `"id": "gadafi"` while the display name is "Gaddafi".
**How to avoid:** Always use the combatant data IDs: `castro`, `kim`, `gadafi`, `hitler`, `hussein`, `mao`, `mussolini`, `noriega`, `pinochet`, `polpot`, `stalin`.
**Warning signs:** `setupDictator` fails or picks random dictator.

### Pitfall 4: Setup Abilities Need Game State
**What goes wrong:** Testing setup abilities (Mao, Mussolini bonus MERCs) without proper game initialization.
**Why it happens:** Setup abilities depend on rebel count, MERC deck, equipment decks being populated.
**How to avoid:** Use `createTestGame` which runs full initialization, then call `game.setupDictator()`.
**Warning signs:** `game.drawMerc()` returns null, rebel count is 0.

### Pitfall 5: Reactive Abilities Need Combat Context
**What goes wrong:** Testing Gaddafi loot or Pinochet hire without combat having occurred.
**Why it happens:** These abilities trigger from combat outcomes or sector control changes.
**How to avoid:** For unit tests, manually set `game._gaddafiLootableEquipment` or `game._pinochetPendingHires`. For integration tests, play through actual combat.
**Warning signs:** Reactive ability functions return early with no effect.

### Pitfall 6: Pol Pot Conditional Hire Depends on Combat Outcome
**What goes wrong:** Pol Pot's post-combat hire never triggers in tests.
**Why it happens:** The flow checks `game.lastAbilityCombatOutcome?.rebelVictory` which is set in flow.ts after combat resolves.
**How to avoid:** In unit tests, manually set `game.lastAbilityCombatOutcome = { rebelVictory: true, sectorId: '...' }`. In integration tests, ensure rebels win the combat Pol Pot initiates.

## Code Examples

### Dictator Ability Categorization (for test planning)

**Per-Turn Abilities (AI-01):**
| Dictator | Function | AI Decision Points |
|----------|----------|-------------------|
| Gaddafi | `applyGadafiTurnAbility` | Squad selection for hired MERC |
| Hitler | `applyHitlerTurnAbility` | Squad selection + initiative target pick |
| Hussein | `applyHusseinBonusTactics` | Auto-play top tactics card |
| Mao | `applyMaoTurnAbility` | Wilderness sector selection for militia |
| Mussolini | `applyMussoliniTurnAbility` | Controlled sector + spread to adjacent |
| Noriega | `applyNoriegaTurnAbility` | Non-rebel sector selection, conditional hire |
| Pinochet | `applyPinochetTurnAbility` | Damage spread (no choices) + pending hires |
| Pol Pot | `applyPolpotTurnAbility` | Rebel sector selection for militia |
| Stalin | `applyStalinTurnAbility` | Primary + conditional secondary squad hire |

**Setup Abilities (AI-02):**
| Dictator | Function | AI Decision Points |
|----------|----------|-------------------|
| Mao | `applyMaoSetupAbility` | Squad placement for bonus MERCs |
| Mussolini | `applyMussoliniSetupAbility` | Squad placement for bonus MERCs |
| Hussein | `applyHusseinSetupAbility` | No choices (auto-expand deck) |
| Kim | `applyKimSetupAbility` | No choices (auto-reveal base) |

**Reactive Abilities (AI-03):**
| Dictator | Function | Trigger |
|----------|----------|---------|
| Gaddafi | `processGaddafiLoot` | After combat kills rebel MERC |
| Pinochet | `applyPinochetPendingHires` | When dictator loses sector control |
| Pol Pot | post-combat hire in flow.ts | When rebels win Pol Pot-initiated combat |

### Shared AI Helper Functions Used by Abilities
```typescript
// From ai-helpers.ts - used by multiple dictator abilities
selectNewMercLocation(game)           // Where to place hired MERCs
selectMilitiaPlacementSector(game, sectors, type) // Where to place militia
getRebelControlledSectors(game)       // Count rebel sectors
equipNewHire(game, merc, equipType)   // Auto-equip new hires
```

### Game State Properties for Reactive Abilities
```typescript
// These are set/read by flow.ts and dictator-abilities.ts
game._gaddafiLootableEquipment: Array<{ equipmentId: number; sectorId: string }> | null
game._pinochetPendingHires: number
game._pinochetControlledSnapshot: Set<string> | null
game._polpotTargetSectorId: string | null
game.lastAbilityCombatOutcome: { rebelVictory: boolean; sectorId: string } | null
game.hitlerInitiativeTargetSeat: number
game.hitlerInitiativeSwitchedThisTurn: boolean
```

### Integration Test: autoResolveArgs + getCurrentAction (reusable)
```typescript
// Source: tests/combat-barriers.test.ts:26-108
// These two functions should be extracted to a shared test helper

function autoResolveArgs(game: MERCGame, actionName: string, playerSeat: number): Record<string, unknown> | null {
  // ... (see combat-barriers.test.ts lines 26-87)
}

function getCurrentAction(flowState: any): { currentPlayer: number; available: string[] } | null {
  // ... (see combat-barriers.test.ts lines 93-108)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate AI ability functions | Inline AI logic in ability functions | Phases 57-61 | AI paths already exist in ability functions |
| Manual test setup | `GameRunner` + `autoResolveArgs` | Phase 53 | Standard integration test pattern |
| Only Castro/Kim tested | All 11 dictators implemented | Phases 57-61 | Need test coverage for 9 new dictators |

## Open Questions

1. **Shared test helpers for autoResolveArgs and getCurrentAction**
   - What we know: Both `combat-barriers.test.ts` and `mcts-clone.test.ts` have their own copies
   - What's unclear: Whether to extract to a shared file or continue duplicating
   - Recommendation: Extract to `tests/helpers/auto-play.ts` to avoid 3rd copy

2. **dictatorChoice in GameRunner vs createTestGame**
   - What we know: `createTestGame` doesn't pass `dictatorChoice` through (see smoke.test.ts line 204 comment). Direct `GameRunner` creation with `dictatorChoice` in gameOptions may work (game.ts line 916-920 handles it).
   - What's unclear: Whether `dictatorChoice` propagates correctly through `GameRunner`
   - Recommendation: Verify in first test, fall back to `game.setupDictator()` if needed

3. **How many seeds per dictator for integration tests**
   - What we know: Different seeds create different map layouts and MERC draws
   - What's unclear: How many seeds are needed for adequate coverage
   - Recommendation: 2-3 seeds per dictator (one that exercises the ability, one edge case)

## Sources

### Primary (HIGH confidence)
- `src/rules/dictator-abilities.ts` - All 9 expansion ability implementations reviewed
- `src/rules/ai-helpers.ts` - AI helper functions reviewed
- `src/rules/ai-executor.ts` - AI action selection logic reviewed
- `src/rules/flow.ts` - Flow integration points for AI abilities confirmed
- `data/combatants.json` - All dictator IDs and abilities confirmed
- `tests/combat-barriers.test.ts` - GameRunner + autoResolveArgs pattern
- `tests/mcts-clone.test.ts` - AI game creation pattern with dictatorIsAI
- `tests/smoke.test.ts` - createTestGame + setupDictator pattern

### Secondary (MEDIUM confidence)
- `tests/ai-rebel-batching.test.ts` - playerConfigs pattern for AI players

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all tools/patterns already exist in codebase
- Architecture: HIGH - patterns observed in multiple existing test files
- Pitfalls: HIGH - discovered from direct code reading of game.ts, flow.ts, dictator-abilities.ts
- Ability inventory: HIGH - all functions and flow integration points verified in source

**Research date:** 2026-02-17
**Valid until:** indefinite (internal codebase patterns, not external dependencies)
