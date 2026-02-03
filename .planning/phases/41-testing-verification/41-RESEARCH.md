# Phase 41: Testing & Verification - Research

**Researched:** 2026-02-03
**Domain:** Integration testing for stat-modifying abilities
**Confidence:** HIGH

## Summary

Phase 41 focuses on adding comprehensive integration tests for the unified stat ability system implemented in prior phases. The codebase already has an extensive testing infrastructure using Vitest with BoardSmith's `createTestGame` helper, and an existing `merc-abilities-integration.test.ts` file that contains partial tests for stat-modifying abilities.

The key gap is that existing tests primarily verify registry data (ability definitions exist) rather than testing that stat bonuses are actually applied and displayed correctly. Tests need to verify:
1. `effectiveCombat`, `effectiveInitiative`, `effectiveTraining` reflect ability bonuses
2. `activeStatModifiers` array is populated correctly for UI display
3. Combat dice rolls match displayed effective stats

**Primary recommendation:** Extend existing `merc-abilities-integration.test.ts` with tests that verify effective stats and activeStatModifiers, plus add combat execution tests that verify dice count matches displayed combat value.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | 2.0.0 | Test runner | Already configured, native Vite support |
| boardsmith/testing | 0.0.1 | Test utilities | `createTestGame`, `simulateAction` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vue Test Utils | (not used) | Component testing | If UI tests needed (currently not in scope) |

### Existing Test Files
| File | Purpose | Line Count |
|------|---------|------------|
| `merc-abilities-integration.test.ts` | Integration tests for abilities | 957 lines |
| `merc-abilities.test.ts` | Registry tests | 439 lines |
| `combat-abilities.test.ts` | Combat ability definitions | 505 lines |
| `combat-execution.test.ts` | Combat system tests | 508 lines |

**Installation:**
No new dependencies required - all testing infrastructure exists.

## Architecture Patterns

### Recommended Test Structure
```
tests/
├── merc-abilities-integration.test.ts  # EXTEND - add effective stat verification
└── (no new files needed)
```

### Pattern 1: Equipment-Conditional Ability Testing
**What:** Test that equipping the required item activates the stat bonus
**When to use:** For abilities with conditions like hasHandgun, hasUzi, hasExplosive
**Example:**
```typescript
// Source: Existing pattern from merc-abilities-integration.test.ts
describe('Equipment-Based Ability Verification', () => {
  it('Bouba effectiveCombat increases with handgun', () => {
    const bouba = game.mercDeck.all(CombatantModel)
      .filter(c => c.isMerc)
      .find(m => m.combatantId === 'bouba');
    if (!bouba) return; // Skip if not in deck

    const baseCombat = bouba.effectiveCombat;

    const handgun = game.weaponsDeck.all(Equipment)
      .find(e => isHandgun(e.equipmentId));
    if (!handgun) return;

    bouba.equip(handgun);
    bouba.updateAbilityBonuses([]);

    expect(bouba.effectiveCombat).toBe(baseCombat + 1);
    expect(bouba.activeStatModifiers.some(
      m => m.stat === 'combat' && m.bonus === 1
    )).toBe(true);
  });
});
```

### Pattern 2: Squad-Conditional Ability Testing
**What:** Test that squad composition activates/deactivates bonuses
**When to use:** For abilities with conditions like aloneInSquad, womanInSquad, highestInitInSquad
**Example:**
```typescript
describe('Squad-Based Ability Verification', () => {
  it('Snake effectiveCombat increases when alone', () => {
    const snake = game.mercDeck.all(CombatantModel)
      .filter(c => c.isMerc)
      .find(m => m.combatantId === 'snake');
    if (!snake) return;

    // Place Snake alone in squad
    snake.putInto(rebel.primarySquad);
    snake.updateAbilityBonuses([snake]);

    expect(snake.effectiveCombat).toBe(snake.baseCombat + 1);
    expect(snake.activeStatModifiers.some(
      m => m.stat === 'combat' && m.bonus === 1
    )).toBe(true);
  });

  it('Snake loses bonus when squad mate joins', () => {
    const snake = getMerc('snake');
    const other = getMerc('basic');
    if (!snake || !other) return;

    snake.putInto(rebel.primarySquad);
    other.putInto(rebel.primarySquad);
    snake.updateAbilityBonuses([snake, other]);

    expect(snake.effectiveCombat).toBe(snake.baseCombat);
    expect(snake.activeStatModifiers.some(
      m => m.stat === 'combat' && m.condition === 'aloneInSquad'
    )).toBe(false);
  });
});
```

### Pattern 3: Combat Verification Testing
**What:** Test that combat dice count matches effectiveCombat
**When to use:** For combat-time abilities where displayed value must equal dice rolled
**Example:**
```typescript
describe('Combat Dice Match Displayed Value', () => {
  it('Mayhem+Uzi combat dice equals effectiveCombat', () => {
    // Setup: Place Mayhem with Uzi in combat sector
    const mayhem = getMerc('mayhem');
    const uzi = getWeapon('uzi');
    if (!mayhem || !uzi) return;

    mayhem.equip(uzi);
    mayhem.updateAbilityBonuses([]);

    // Create combatant for combat
    const combatant = mercToCombatant(mayhem, false, 'red');

    // Verify dice count matches effective stat
    expect(combatant.combat).toBe(mayhem.effectiveCombat);
    expect(combatant.combat).toBe(mayhem.baseCombat + uzi.combatBonus + 2); // +2 from ability
  });
});
```

### Anti-Patterns to Avoid
- **Testing registry data only:** Don't just verify `getMercAbility('bouba')?.combatModifiers?.combatBonus === 1` - test that `effectiveCombat` actually changes
- **Skipping updateAbilityBonuses:** Must call `updateAbilityBonuses()` after equipment/squad changes
- **Ignoring activeStatModifiers:** UI reads from this array - test it's populated correctly
- **Hardcoding stat values:** Use `baseCombat + bonus` not magic numbers

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Game setup | Manual state construction | `createTestGame()` | Handles deck shuffling, player setup, random seeding |
| Finding MERCs | Manual deck iteration | `game.mercDeck.all(CombatantModel).filter(c => c.isMerc).find()` | Type-safe, handles deck structure |
| Equipment lookup | String matching | `isHandgun()`, `isUzi()`, `isExplosive()` | Registry-based, handles variants |
| Combat creation | Manual Combatant object | `mercToCombatant()` | Applies all ability bonuses correctly |

**Key insight:** The unified stat system centralizes bonus calculation - tests should verify that centralized system, not duplicate the logic.

## Common Pitfalls

### Pitfall 1: Not calling updateAbilityBonuses
**What goes wrong:** Equipment is equipped but effectiveCombat doesn't change
**Why it happens:** Stats are cached, not computed on access
**How to avoid:** Always call `merc.updateAbilityBonuses(squadMates)` after equipment/squad changes
**Warning signs:** Tests pass with old values, fail when expecting bonus

### Pitfall 2: Empty squad context
**What goes wrong:** Squad-conditional abilities (Tack, Valkyrie) don't activate
**Why it happens:** `updateAbilityBonuses([])` provides no squad context
**How to avoid:** Pass actual squad members: `merc.updateAbilityBonuses(squad.getMercs())`
**Warning signs:** Self-bonuses work but squad bonuses don't

### Pitfall 3: Testing in deck (not in squad)
**What goes wrong:** Abilities that check squad context fail unpredictably
**Why it happens:** MERCs in deck have no parent squad
**How to avoid:** Use `merc.putInto(rebel.primarySquad)` before testing squad abilities
**Warning signs:** Works in game but fails in tests

### Pitfall 4: Race condition with equipment data
**What goes wrong:** Equipment slot data not available after `equip()`
**Why it happens:** `weaponSlotData` is updated lazily for UI serialization
**How to avoid:** Check `weaponSlot` (live) not `weaponSlotData` (serialized)
**Warning signs:** Slot shows equipped but bonus not applied

### Pitfall 5: Vulture initiative penalty negation
**What goes wrong:** Vulture's initiative test fails due to penalty handling
**Why it happens:** Vulture's ability negates equipment penalties, stored in UI-specific logic
**How to avoid:** Test `effectiveInitiative` directly, not raw calculation
**Warning signs:** Breakdown shows penalty, then negation as separate line

## Code Examples

Verified patterns from existing test files:

### Game and MERC Setup
```typescript
// Source: tests/merc-abilities-integration.test.ts
import { createTestGame } from 'boardsmith/testing';
import { MERCGame, RebelPlayer } from '../src/rules/game.js';
import { CombatantModel, Equipment } from '../src/rules/elements.js';

let game: MERCGame;
let rebel: RebelPlayer;

beforeEach(() => {
  const testGame = createTestGame(MERCGame, {
    playerCount: 2,
    playerNames: ['Rebel1', 'Dictator'],
    seed: 'test-seed', // Deterministic for reproducibility
  });
  game = testGame.game;
  rebel = game.rebelPlayers[0];
});
```

### Finding MERC by ID
```typescript
// Source: tests/merc-abilities-integration.test.ts
const getMerc = (id: string): CombatantModel | undefined => {
  return game.mercDeck.all(CombatantModel)
    .filter(c => c.isMerc)
    .find(m => m.combatantId === id);
};

// Usage with skip if not found
it('test case', () => {
  const bouba = getMerc('bouba');
  if (!bouba) {
    console.log('Bouba not in deck, skipping test');
    return;
  }
  // ... test continues
});
```

### Equipment Lookup
```typescript
// Source: tests/combat-abilities.test.ts
import { isHandgun, isUzi, isExplosive } from '../src/rules/equipment-effects.js';

const getHandgun = (): Equipment | undefined => {
  return game.weaponsDeck.all(Equipment)
    .find(e => isHandgun(e.equipmentId));
};

const getUzi = (): Equipment | undefined => {
  return game.weaponsDeck.all(Equipment)
    .find(e => isUzi(e.equipmentId));
};

const getExplosive = (): Equipment | undefined => {
  return game.weaponsDeck.all(Equipment)
    .find(e => isExplosive(e.equipmentId)) ||
    game.accessoriesDeck.all(Equipment)
    .find(e => isExplosive(e.equipmentId));
};
```

### Verifying activeStatModifiers
```typescript
// Pattern for UI display verification
it('should populate activeStatModifiers for UI', () => {
  const bouba = getMerc('bouba');
  const handgun = getHandgun();
  if (!bouba || !handgun) return;

  bouba.equip(handgun);
  bouba.updateAbilityBonuses([]);

  // Verify modifier exists with correct label
  const combatMod = bouba.activeStatModifiers.find(
    m => m.stat === 'combat' && m.condition === 'hasHandgun'
  );
  expect(combatMod).toBeDefined();
  expect(combatMod?.bonus).toBe(1);
  expect(combatMod?.label).toContain('Ability');
});
```

### Combat Verification
```typescript
// Pattern for verifying combat dice match display
import { getCombatants } from '../src/rules/combat.js';

it('combat dice should match effectiveCombat', () => {
  const mayhem = getMerc('mayhem');
  const uzi = getUzi();
  if (!mayhem || !uzi) return;

  mayhem.equip(uzi);
  mayhem.putInto(rebel.primarySquad);
  mayhem.updateAbilityBonuses([mayhem]);

  // Get the sector where Mayhem is located
  const sector = game.getSector(mayhem.sectorId!);
  if (!sector) return;

  // Get combatant representation
  const { rebels } = getCombatants(game, sector, rebel);
  const mayhemCombatant = rebels.find(c => c.name.toLowerCase().includes('mayhem'));

  if (!mayhemCombatant) return;

  // Combat dice should equal effectiveCombat
  expect(mayhemCombatant.combat).toBe(mayhem.effectiveCombat);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-MERC if checks | Unified registry (merc-abilities.ts) | Phase 36-40 | Single source of truth |
| Legacy bonus fields (sargeBonus, etc) | activeStatModifiers array | Phase 38-39 | UI reads from unified source |
| Scattered combat calculations | getAbilityBonus() helper | Phase 40 | No duplicate bonus application |
| Implicit stat updates | Explicit updateAbilityBonuses() | Phase 38 | Predictable state management |

**Deprecated/outdated:**
- Direct bonus field access (haargTrainingBonus, etc): Still exists for Haarg compatibility but prefer activeStatModifiers
- Checking getMercAbility().combatModifiers directly: Test effectiveStats instead

## Open Questions

Things that couldn't be fully resolved:

1. **Visual verification approach**
   - What we know: UI displays from activeStatModifiers, breakdown tooltips show labeled bonuses
   - What's unclear: How to automate visual verification without Puppeteer component tests
   - Recommendation: Manual visual verification documented, plus unit tests for activeStatModifiers data

2. **Combat-only abilities (Max, Walter, Khenn, Golem)**
   - What we know: These are applied in combat.ts, not in activeStatModifiers
   - What's unclear: Whether to test these through combat execution or separate unit tests
   - Recommendation: Test via combat execution (existing pattern in combat-execution.test.ts)

3. **Vulture penalty negation**
   - What we know: Special-cased in UI (CombatantCard.vue), not in activeStatModifiers
   - What's unclear: Whether to add to activeStatModifiers or keep UI-only
   - Recommendation: Test effectiveInitiative directly, accept UI has special display logic

## MERCs to Test

### Equipment-Conditional (8 MERCs)
| MERC | Condition | Stat | Bonus | How to Test |
|------|-----------|------|-------|-------------|
| Bouba | hasHandgun | combat | +1 | Equip handgun, verify effectiveCombat |
| Mayhem | hasUzi | combat | +2 | Equip Uzi, verify effectiveCombat |
| Rozeske | hasArmor | combat | +1 | Equip armor, verify effectiveCombat |
| Stumpy | hasExplosive | combat | +1 | Equip grenade/mortar, verify effectiveCombat |
| Vandradi | hasMultiTargetWeapon | combat | +1 | Equip weapon with targets>0, verify effectiveCombat |
| Dutch | hasSwordOrUnarmed | combat, initiative | +1, +1 | No weapon or sword, verify both stats |
| Moe | hasSmaw | targets | +1 | Equip SMAW, verify targets (not in effectiveStats) |
| Ra | hasWeapon | targets | +1 | Equip any weapon, verify targets |

### Squad-Conditional (6 MERCs)
| MERC | Condition | Stat | Bonus | How to Test |
|------|-----------|------|-------|-------------|
| Haarg | squadMateHigherBase | all | +1 each | Add squad mate with higher base stat |
| Sarge | highestInitInSquad | all | +1 each | Ensure highest baseInitiative in squad |
| Tack | highestInitInSquad | initiative (allSquad) | +2 | Ensure highest base, check all squad members |
| Valkyrie | always | initiative (squadMates) | +1 | Check squad mates, not self |
| Snake | aloneInSquad | all | +1 each | Alone vs with squad mate |
| Tavisto | womanInSquad | all | +1 each | Add female MERC to squad |

### Passive (3 MERCs)
| MERC | Ability | Stat | Bonus | How to Test |
|------|---------|------|-------|-------------|
| Shooter | always | combat | +3 | Verify effectiveCombat = baseCombat + 3 |
| Juicer | always | health | +2 | Verify maxHealth = 5 |
| Ewok | always | actions | +1 | Verify actionsRemaining after reset = 3 |

### Combat-Only (3 MERCs)
| MERC | Ability | Effect | How to Test |
|------|---------|--------|-------------|
| Max | enemyDebuff | -1 combat to enemy MERCs | Test via combat execution |
| Walter | militiaBonus | +2 initiative to militia | Test via combat getCombatants |
| Vulture | ignoresPenalties | No initiative penalty | Test effectiveInitiative with heavy weapon |

## Sources

### Primary (HIGH confidence)
- `/tests/merc-abilities-integration.test.ts` - Existing test patterns
- `/tests/combat-abilities.test.ts` - Combat ability testing patterns
- `/src/rules/merc-abilities.ts` - Ability registry and getActiveStatModifiers
- `/src/rules/elements.ts` - CombatantBase.updateAbilityBonuses implementation
- `/.planning/codebase/TESTING.md` - Testing patterns documentation

### Secondary (MEDIUM confidence)
- `/src/ui/components/CombatantCard.vue` - UI display of activeStatModifiers

### Tertiary (LOW confidence)
- Prior phase context (STATE.md v1.8 referenced in prompt)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All infrastructure exists and is well documented
- Architecture: HIGH - Clear patterns in existing integration tests
- Pitfalls: HIGH - Identified from existing test file analysis

**Research date:** 2026-02-03
**Valid until:** 60 days (stable domain, no external dependencies)
