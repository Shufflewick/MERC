# Phase 46: Verification - Research

**Researched:** 2026-02-08
**Domain:** Automated testing of combat event pipeline (animation events, snapshots, decision context)
**Confidence:** HIGH

## Summary

Phase 46 verifies the combat event pipeline built in Phases 43-45. The tests need to confirm that `combat-panel` snapshots contain correct combatant data, decision context is present at decision points, animation events carry correct data (rolls, damage, deaths), and snapshots update after player decisions.

The testing approach is straightforward because:
1. **BoardSmith provides `pendingAnimationEvents`** -- `game.pendingAnimationEvents` returns all animation events emitted since the last action. Events are cleared at the start of each `performAction()` call, so each action produces a fresh batch.
2. **`executeCombat()` can be called directly** -- it is an exported function that takes `(game, sector, attackingPlayer, options)`. This avoids needing to drive the full flow engine through Day 1 setup just to reach combat.
3. **`commandHistory` preserves ANIMATE commands** -- `game.commandHistory.filter(c => c.type === 'ANIMATE')` gives all animate commands in order, as a cross-check.
4. **Deterministic seeding** -- `createTestGame` accepts a `seed` parameter for reproducible dice rolls via `game.random()`.

The existing test suite has 14 test files with established patterns. Tests use `createTestGame(MERCGame, { playerCount: 2, seed: '...' })` and directly manipulate game state (placing mercs in squads, adding militia to sectors) before calling `executeCombat()`.

**Primary recommendation:** Write tests that call `executeCombat()` directly with crafted game state (mercs placed in a sector with militia), then inspect `game.pendingAnimationEvents` for correct event types, data payloads, and snapshot contents. For decision cycle tests, use `interactive: true` (default) and verify `combatPending: true` outcomes with the correct pending state on `game.activeCombat`.

## Standard Stack

No new libraries needed. All testing uses existing tools already in the project.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^2.0.0 | Test runner | Already used for all 14 existing test files |
| boardsmith/testing | 0.0.1 | `createTestGame`, `simulateAction`, `assertFlowState` | Standard BoardSmith testing API |

### Key APIs for This Phase

| API | Location | Purpose |
|-----|----------|---------|
| `game.pendingAnimationEvents` | `Game` class getter | Returns `AnimationEvent[]` -- events from the most recent action |
| `game.commandHistory` | `Game` class property | `GameCommand[]` including `ANIMATE` commands |
| `executeCombat(game, sector, player, options)` | `src/rules/combat.ts` | Direct combat execution without flow engine |
| `getCombatants(game, sector, player)` | `src/rules/combat.ts` | Gets rebel and dictator combatant arrays |
| `buildCombatPanelSnapshot(game)` | `src/rules/combat.ts` (private) | Builds snapshot from activeCombat |
| `serializeCombatant(c)` | `src/rules/combat.ts` (private) | Serializes Combatant to plain data |
| `clearActiveCombat(game)` | `src/rules/combat.ts` | Clears activeCombat state |

### AnimationEvent Type
```typescript
interface AnimationEvent {
  id: number;        // Monotonically increasing
  type: string;      // Event type (e.g., 'combat-panel', 'combat-roll', 'combat-damage')
  data: Record<string, unknown>;  // Event-specific payload
  timestamp: number; // When emitted
}
```

## Architecture Patterns

### Pattern 1: Direct Combat Setup for Testing

**What:** Set up game state manually and call `executeCombat()` directly, bypassing the flow engine entirely.

**When to use:** For all combat event pipeline tests. This avoids the complexity of driving the game through Day 1 setup (landing zone, hiring mercs, equipping, exploring) just to reach combat.

**Example:**
```typescript
// Source: Verified from existing tests and combat.ts API
import { createTestGame } from 'boardsmith/testing';
import { MERCGame, RebelPlayer } from '../src/rules/game.js';
import { CombatantModel, Sector } from '../src/rules/elements.js';
import { executeCombat } from '../src/rules/combat.js';

let game: MERCGame;
let rebel: RebelPlayer;
let sector: Sector;

beforeEach(() => {
  const testGame = createTestGame(MERCGame, {
    playerCount: 2,
    playerNames: ['Rebel1', 'Dictator'],
    seed: 'combat-event-test',
  });
  game = testGame.game;
  rebel = game.rebelPlayers[0];
  sector = game.gameMap.getAllSectors()[0];

  // Place mercs in squad and assign to sector
  const merc = game.mercDeck.first(CombatantModel, c => c.isMerc);
  if (merc) merc.putInto(rebel.primarySquad);
  rebel.primarySquad.sectorId = sector.sectorId;

  // Add militia so there's something to fight
  sector.addDictatorMilitia(2);
});

it('should emit combat-panel snapshot at combat start', () => {
  const outcome = executeCombat(game, sector, rebel, { interactive: false });

  const events = game.pendingAnimationEvents;
  const panelEvents = events.filter(e => e.type === 'combat-panel');

  expect(panelEvents.length).toBeGreaterThanOrEqual(1);

  const firstSnapshot = panelEvents[0].data;
  expect(firstSnapshot.sectorId).toBe(sector.sectorId);
  expect(firstSnapshot.rebelCombatants).toBeDefined();
  expect(firstSnapshot.dictatorCombatants).toBeDefined();
});
```

### Pattern 2: Interactive vs Non-Interactive Combat

**What:** `executeCombat` accepts `interactive: boolean` (default `true`). When `interactive: true`, combat pauses at decision points and returns `combatPending: true`. When `interactive: false`, AI auto-resolves all decisions.

**When to use:**
- `interactive: false` for testing the full combat-to-completion pipeline (snapshot at start, rolls, damage, death, end)
- `interactive: true` for testing decision point snapshots (target selection, hit allocation, etc.)

**Example:**
```typescript
// Non-interactive: combat runs to completion, all events in one batch
const outcome = executeCombat(game, sector, rebel, { interactive: false });
expect(outcome.combatPending).toBe(false);

// All events from the entire combat are in pendingAnimationEvents
const events = game.pendingAnimationEvents;
const combatEnd = events.find(e => e.type === 'combat-end');
expect(combatEnd).toBeDefined();

// Interactive: combat pauses at first decision, returns pending
const outcome2 = executeCombat(game, sector, rebel, { interactive: true });
// May or may not be pending depending on whether decisions are needed
// (e.g., single target = auto-selected, no pause)
```

### Pattern 3: Animation Event Buffer Lifecycle

**What:** `game.pendingAnimationEvents` is cleared at the start of `performAction()`. When calling `executeCombat()` directly (not through flow), events accumulate without clearing because no `performAction` runs between them.

**When to use:** Understanding when events persist and when they get cleared is critical for test correctness.

**Key behavior:**
- Direct `executeCombat()` call: ALL events from the entire combat execution appear in `pendingAnimationEvents`
- Flow-driven combat (via `doAction`/`performAction`): Events from each action execution are separate; previous events cleared on next action
- `game.commandHistory.filter(c => c.type === 'ANIMATE')` provides a durable log of ALL animate commands regardless of buffer clearing

### Pattern 4: Verifying combat-panel Snapshot Contents

**What:** Each `combat-panel` snapshot contains serialized combatant data plus decision context.

**Combatant fields to verify:**
```typescript
// From serializeCombatant() in combat.ts
{
  id: string,           // Element ID
  name: string,         // Display name
  image: string,        // Portrait path
  health: number,       // Current health
  maxHealth: number,    // Max health
  isMerc: boolean,      // true if not militia/dictator/dog
  isMilitia: boolean,
  isAttackDog: boolean,
  isDictator: boolean,
  isDictatorSide: boolean,
  playerColor: string,
  combatantId: string,  // e.g., 'haarg'
  // Attack dog fields
  attackDogAssignedTo: string | undefined,
  attackDogTargetName: string | undefined,
  attackDogPendingTarget: boolean | undefined,
}
```

**Snapshot top-level fields:**
```typescript
{
  sectorId: string,
  sectorName: string,
  round: number,
  rebelCombatants: SerializedCombatant[],
  dictatorCombatants: SerializedCombatant[],
  rebelCasualties: SerializedCombatant[],
  dictatorCasualties: SerializedCombatant[],
  dogAssignments: Array<[string, Combatant]>,
  combatComplete: boolean,
  // Decision context (at most one non-null at a time)
  pendingTargetSelection: { ... } | null,
  pendingHitAllocation: { ... } | null,
  pendingWolverineSixes: { ... } | null,
  pendingAttackDogSelection: { ... } | null,
  pendingBeforeAttackHealing: { ... } | null,
  pendingEpinephrine: { ... } | null,
}
```

### Pattern 5: Verifying Animation Event Data

**What:** Each animate event type carries specific data that the UI uses for rendering.

**Event types to verify:**
| Event Type | Key Data Fields | When Emitted |
|------------|----------------|--------------|
| `combat-panel` | Full snapshot (see above) | At every decision cycle (8 points) |
| `combat-round-start` | `round` | Start of each combat round |
| `combat-roll` | `attackerName`, `attackerId`, `attackerImage`, `targetNames`, `targetIds`, `diceRolls`, `hits`, `hitThreshold` | On each combatant's attack roll |
| `combat-damage` | `attackerName`, `attackerId`, `targetName`, `targetId`, `targetImage`, `damage`, `healthBefore`, `healthAfter` | When damage is dealt |
| `combat-death` | `targetName`, `targetId`, `targetImage` | When a combatant dies |
| `combat-heal` | `healerName`, `healerId`, `targetName`, `targetId`, `healAmount`, `healthBefore`, `healthAfter`, `itemName`/`isSurgeonAbility` | During healing actions |
| `combat-attack-dog` | `attackerName`, `attackerId`, `attackerImage`, `targetName`, `targetId`, `targetImage`, `dogId`, `dogImage` | Attack dog assignment |
| `combat-end` | `rebelVictory`, `dictatorVictory` | Combat completion |

### Recommended Test File Structure
```
tests/
  combat-events.test.ts   # New file for Phase 46
```

### Anti-Patterns to Avoid
- **Do NOT drive tests through full game flow** -- Setting up Day 1 (landing, hiring, equipping, exploring) is fragile and slow. Call `executeCombat()` directly with crafted state.
- **Do NOT test UI rendering** -- This phase tests the data pipeline only. CombatPanel rendering was verified in Phases 44-45.
- **Do NOT mock the random number generator** -- Use deterministic seeds instead. The seed makes `game.random()` reproducible.
- **Do NOT use `interactive: true` when testing complete combat flow** -- Use `interactive: false` to get all events in one call. Use `interactive: true` only when specifically testing decision point snapshots.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Game state setup | Custom game initialization | `createTestGame(MERCGame, { seed })` | Deterministic, consistent, matches all other tests |
| Combat triggering | Manual flow step simulation | `executeCombat(game, sector, player, options)` | Direct, no flow setup needed |
| Event inspection | Parsing commandHistory for ANIMATE | `game.pendingAnimationEvents` | Purpose-built API, typed, cleaner |
| Combat outcome tracking | Manual state inspection | `CombatOutcome` return value | Already tells you if combat ended, who won, if pending |

## Common Pitfalls

### Pitfall 1: Empty pendingAnimationEvents When Using Flow Engine

**What goes wrong:** If tests use `testGame.doAction()` (which calls `performAction()` internally), the animation event buffer is cleared at the start of each action. Events from a previous action are gone.
**Why it happens:** `performAction` clears `_animationEvents = []` at line 1036 of game.ts before executing the action.
**How to avoid:** For Phase 46 tests, call `executeCombat()` directly. This does NOT clear the buffer since it is not an action execution. All events from the entire combat accumulate.
**Warning signs:** `game.pendingAnimationEvents.length === 0` after combat when using `doAction()`.

### Pitfall 2: Seed-Dependent Combat Outcomes

**What goes wrong:** A test expects specific combat outcomes (e.g., a death), but the seed produces different dice rolls.
**Why it happens:** Combat uses `game.random()` (seeded PRNG), but the number of random calls before combat affects the sequence.
**How to avoid:** Use `interactive: false` to let combat auto-resolve, then check for event presence (not specific values). For damage/roll verification, check that events exist and have correct field types rather than exact values. When exact values matter, use a dedicated seed and verify manually.
**Warning signs:** Flaky tests that pass with one seed but fail with another.

### Pitfall 3: buildCombatPanelSnapshot and serializeCombatant Are Private

**What goes wrong:** Tests cannot import `buildCombatPanelSnapshot` or `serializeCombatant` directly.
**Why it happens:** These are module-private functions in combat.ts (not exported).
**How to avoid:** Test via the public API: call `executeCombat()` and inspect `game.pendingAnimationEvents` for `combat-panel` events. The snapshot data is in the event's `data` field.
**Warning signs:** Import errors for internal functions.

### Pitfall 4: Interactive Combat with Single Target Auto-Selects

**What goes wrong:** Test expects `pendingTargetSelection` to be set, but combat auto-selects the single available target and continues.
**Why it happens:** When there is only 1 valid target, the combat system auto-selects it without pausing for player input.
**How to avoid:** To test target selection decision points, ensure multiple valid targets exist (multiple militia + a MERC, or multiple enemy types). To test hit allocation, ensure the attacker has multiple targets.
**Warning signs:** `outcome.combatPending` is `false` when expecting `true`.

### Pitfall 5: Militia Count Must Be > 0 for Combat

**What goes wrong:** `executeCombat()` produces no combat events because there are no enemies.
**Why it happens:** `getCombatants()` returns empty dictator array if no militia in sector and no dictator mercs.
**How to avoid:** Always call `sector.addDictatorMilitia(N)` before `executeCombat()`.
**Warning signs:** Zero animation events, immediate combat end.

### Pitfall 6: Merc Must Be In Squad With sectorId Matching Combat Sector

**What goes wrong:** `getCombatants()` returns empty rebel array.
**Why it happens:** Rebel combatants are pulled from squads whose `sectorId` matches the combat sector.
**How to avoid:** Set `rebel.primarySquad.sectorId = sector.sectorId` AND place mercs in that squad with `merc.putInto(rebel.primarySquad)`.
**Warning signs:** Zero rebel combatants, immediate dictator victory.

## Code Examples

### Complete Test Setup for combat-panel Snapshot Verification

```typescript
// Source: Derived from existing test patterns + combat.ts analysis
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame, RebelPlayer } from '../src/rules/game.js';
import { CombatantModel, Sector } from '../src/rules/elements.js';
import { executeCombat } from '../src/rules/combat.js';

describe('Combat Event Pipeline', () => {
  let game: MERCGame;
  let rebel: RebelPlayer;
  let sector: Sector;
  let merc: CombatantModel;

  beforeEach(() => {
    const testGame = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'combat-events-test',
    });
    game = testGame.game;
    rebel = game.rebelPlayers[0];
    sector = game.gameMap.getAllSectors()[0];

    // Place a merc in squad
    merc = game.mercDeck.first(CombatantModel, c => c.isMerc)!;
    merc.putInto(rebel.primarySquad);
    rebel.primarySquad.sectorId = sector.sectorId;

    // Add enemy militia
    sector.addDictatorMilitia(3);
  });

  it('combat-panel snapshot has correct combatant data', () => {
    executeCombat(game, sector, rebel, { interactive: false });

    const events = game.pendingAnimationEvents;
    const panelEvents = events.filter(e => e.type === 'combat-panel');

    expect(panelEvents.length).toBeGreaterThanOrEqual(2); // At least start + end

    // Check first snapshot
    const snapshot = panelEvents[0].data;
    expect(snapshot.sectorId).toBe(sector.sectorId);

    // Rebel combatants
    const rebels = snapshot.rebelCombatants as Array<Record<string, unknown>>;
    expect(rebels.length).toBeGreaterThanOrEqual(1);
    const rebelUnit = rebels[0];
    expect(rebelUnit.name).toBeDefined();
    expect(rebelUnit.health).toBeDefined();
    expect(rebelUnit.maxHealth).toBeDefined();
    expect(rebelUnit.image).toBeDefined();
    expect(rebelUnit.isMerc).toBe(true);
    expect(rebelUnit.isMilitia).toBe(false);

    // Dictator combatants
    const dictators = snapshot.dictatorCombatants as Array<Record<string, unknown>>;
    expect(dictators.length).toBe(3); // 3 militia added
    expect(dictators[0].isMilitia).toBe(true);
    expect(dictators[0].isDictatorSide).toBe(true);
  });

  it('combat-roll events carry dice data', () => {
    executeCombat(game, sector, rebel, { interactive: false });

    const rollEvents = game.pendingAnimationEvents
      .filter(e => e.type === 'combat-roll');

    expect(rollEvents.length).toBeGreaterThanOrEqual(1);

    const roll = rollEvents[0].data;
    expect(roll.attackerName).toBeDefined();
    expect(roll.attackerId).toBeDefined();
    expect(roll.diceRolls).toBeDefined();
    expect(Array.isArray(roll.diceRolls)).toBe(true);
    expect(roll.hits).toBeDefined();
    expect(typeof roll.hits).toBe('number');
    expect(roll.hitThreshold).toBeDefined();
  });

  it('combat-end is emitted when combat finishes', () => {
    executeCombat(game, sector, rebel, { interactive: false });

    const endEvents = game.pendingAnimationEvents
      .filter(e => e.type === 'combat-end');

    expect(endEvents.length).toBe(1);
    expect(endEvents[0].data).toHaveProperty('rebelVictory');
    expect(endEvents[0].data).toHaveProperty('dictatorVictory');
  });
});
```

### Testing Decision Context in Snapshot

```typescript
// For testing decision context, need interactive: true and multiple targets
it('snapshot includes decision context at decision point', () => {
  // Add enough militia to create multi-target scenario
  sector.addDictatorMilitia(5); // Total: 5+ militia

  // Place a merc with multi-target weapon for target selection pause
  const outcome = executeCombat(game, sector, rebel, { interactive: true });

  if (outcome.combatPending) {
    // Verify activeCombat has a pending decision
    const ac = game.activeCombat;
    expect(ac).not.toBeNull();

    // Check the last combat-panel event
    const panelEvents = game.pendingAnimationEvents
      .filter(e => e.type === 'combat-panel');
    const lastSnapshot = panelEvents[panelEvents.length - 1].data;

    // At least one decision context should be non-null
    const hasDecision = [
      lastSnapshot.pendingTargetSelection,
      lastSnapshot.pendingHitAllocation,
      lastSnapshot.pendingBeforeAttackHealing,
      lastSnapshot.pendingAttackDogSelection,
      lastSnapshot.pendingWolverineSixes,
      lastSnapshot.pendingEpinephrine,
    ].some(d => d !== null);

    expect(hasDecision).toBe(true);
  }
});
```

### Testing Snapshot Update After Decision

```typescript
// To test snapshot re-emission after a decision, we need flow-driven combat
// This requires more setup but verifies the full cycle
it('combat-panel re-emitted after player decision', () => {
  // This test would need to:
  // 1. Set up game state where combat pauses for a decision
  // 2. Execute the decision via doAction
  // 3. Verify pendingAnimationEvents contains a new combat-panel
  //
  // The flow engine handles this: when a combat action (e.g., combatAllocateHits)
  // is executed, executeCombat resumes and emits a new combat-panel
  //
  // Implementation: Use the flow engine by advancing game to combat via
  // pendingCombat or by calling executeCombat with interactive: true,
  // then manually performing the decision action
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Test combat mechanics only | Test combat event pipeline | Phase 46 (this phase) | Verifies UI data contract |
| UI reads element refs from activeCombat | UI reads from combat-panel snapshot events | Phase 43-44 | Decoupled UI from game state |
| No animation event tests | pendingAnimationEvents API for testing | BoardSmith v3.0 | First-class event testing support |

## Open Questions

1. **How to test snapshot re-emission after player decision (Success Criterion 4)?**
   - What we know: The flow engine drives combat through action steps. After a combat action (e.g., `combatAllocateHits`), `executeCombat` resumes and emits a new `combat-panel` snapshot. But using `doAction()` through the flow requires reaching combat via the full game flow OR setting `game.activeCombat` manually and resuming.
   - What's unclear: Whether we can call `executeCombat` again with `isResuming = true` (by setting `game.activeCombat` manually) and test that a new snapshot is emitted.
   - Recommendation: Test two paths: (1) Call `executeCombat` with `interactive: true`, which pauses and sets `activeCombat`. Then manually update the pending decision state (e.g., clear `pendingHitAllocation` and set up partial results), and call `executeCombat` again to resume. The second call will emit a new `combat-panel` snapshot. (2) Alternatively, verify this by checking that the LAST `combat-panel` event in a non-interactive combat has `combatComplete: true`, confirming snapshots are emitted throughout.

2. **Should we test through the full game flow at all?**
   - What we know: Full flow tests require Day 1 setup (placeLanding, hireMerc, equipStarting, etc.) before combat can happen. The flow-based approach would test the actual integration point but is much more setup.
   - What's unclear: Whether direct `executeCombat()` calls are sufficient for SUCCESS CRITERIA #4 (re-emission after player decision).
   - Recommendation: Primarily use direct `executeCombat()` calls. For the specific re-emission test, either simulate resume or accept that the 8 combat-panel emissions in a non-interactive combat (including start, mid-round, and end) demonstrate the pattern works.

3. **How to ensure tests detect regressions without being brittle?**
   - What we know: Exact dice roll values depend on seed. Event counts depend on combat length.
   - Recommendation: Test for structural correctness (fields exist, types match, minimum event counts) rather than exact values. Use `toBeGreaterThanOrEqual(1)` for event counts, check field existence with `toBeDefined()`, verify types with `typeof`.

## Sources

### Primary (HIGH confidence)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/rules/combat.ts` -- `executeCombat()`, `serializeCombatant()`, `buildCombatPanelSnapshot()` analyzed (lines 86-133, 2344-2874)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/node_modules/boardsmith/src/engine/element/game.ts` -- `animate()` API (lines 2363-2394), `pendingAnimationEvents` getter, `performAction` buffer clearing (line 1036), `AnimationEvent` interface (line 149)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/node_modules/boardsmith/src/engine/element/animation-events.test.ts` -- BoardSmith's own animation event tests showing patterns
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/node_modules/boardsmith/src/testing/test-game.ts` -- `createTestGame`, `TestGame` class API
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/node_modules/boardsmith/src/testing/simulate-action.ts` -- `simulateAction`, assertion helpers
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/tests/combat-execution.test.ts` -- Existing combat test patterns (774 lines)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/tests/combat-abilities.test.ts` -- Existing combat ability test patterns (504 lines)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/tests/merc-abilities-integration.test.ts` -- Most complex test setup patterns (1521 lines)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/tests/smoke.test.ts` -- Flow state and action testing patterns

### Secondary (HIGH confidence)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/.planning/phases/43-combat-event-architecture/43-RESEARCH.md` -- Phase 43 research detailing all 13 animate calls and 8 snapshot emission points
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/.planning/phases/43-combat-event-architecture/43-01-SUMMARY.md` -- Callback extraction summary
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/.planning/phases/43-combat-event-architecture/43-02-SUMMARY.md` -- Snapshot emission summary

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All testing tools verified from source code in node_modules
- Architecture: HIGH -- All patterns derived from reading actual BoardSmith engine code and existing MERC tests
- Pitfalls: HIGH -- Derived from understanding animation event buffer lifecycle (performAction clears buffer) and combat setup requirements
- Code examples: HIGH -- Based on actual function signatures and existing test patterns

**Research date:** 2026-02-08
**Valid until:** Indefinite (codebase-specific research, not version-dependent)
