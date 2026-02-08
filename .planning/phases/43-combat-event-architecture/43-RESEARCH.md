# Phase 43: Combat Event Architecture - Research

**Researched:** 2026-02-08
**Domain:** Combat system event emission, animation data, state snapshots
**Confidence:** HIGH

## Summary

This phase transforms the combat system from its current pattern -- where `game.animate()` callbacks contain mutations and the UI reads combatant data by resolving element refs from `activeCombat` -- to a fully event-driven architecture where:

1. **`combat-panel` snapshot events** emit complete combatant data at each decision cycle, eliminating the need for the UI to resolve element refs
2. **All `game.animate()` calls become pure data** (no callbacks), with mutations happening as normal code after the animate call
3. **Decision context** (target selection, hit allocation, etc.) is embedded in the snapshot event

The combat system is large (~2800 lines in `combat.ts` + ~1300 lines in `rebel-combat.ts`) but well-structured. There are exactly **13 `game.animate()` calls** across the codebase that need modification: 10 in `combat.ts` and 3 in `rebel-combat.ts`. There are **7 distinct decision cycle pause points** that need `combat-panel` snapshot emission.

**Primary recommendation:** Work through this in three sub-plans: (1) Extract mutations from animate callbacks into normal code, (2) Add combat-panel snapshot emission at each decision cycle, (3) Embed decision context in snapshots. Existing tests (76 test cases across 2 files) verify combat mechanics and should pass unchanged since we are only adding event emission, not changing combat logic.

## Standard Stack

No new libraries needed. This phase is purely a refactor of existing code patterns within the combat system.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| boardsmith | v3.0 | `game.animate()` API | Already in use -- animate(type, data, callback?) |

### Key API
```typescript
// BoardSmith v3.0 animate signature:
animate(type: string, data: Record<string, unknown>, callback?: () => void): void {
  this.execute({ type: 'ANIMATE', eventType: type, data });
  if (callback) {
    callback();
  }
}
```

The callback is called **synchronously immediately after** the ANIMATE command is executed. Making callbacks empty `() => {}` or omitting them entirely is the path to "pure data" events.

## Architecture Patterns

### Current Architecture (What Exists Today)

#### game.animate() Call Pattern
Currently, animate calls follow two patterns:

**Pattern A: Mutation inside callback** (must be refactored)
```typescript
game.animate('combat-damage', {
  attackerName, attackerId, targetName, targetId, targetImage,
  damage: expectedHealthDamage,
  healthBefore,
  healthAfter: healthBefore - expectedHealthDamage,
}, () => {
  applyDamage(target, remainingHits, game, attacker.armorPiercing);
  damageDealt.set(target.id, expectedHealthDamage);
  if (target.sourceElement?.isMerc) {
    const merc = target.sourceElement;
    merc.damage = merc.maxHealth - target.health;
  }
});
```

**Pattern B: Empty callback / pure data** (already correct)
```typescript
game.animate('combat-roll', {
  attackerName, attackerId, attackerImage,
  targetNames, targetIds, diceRolls, hits, hitThreshold,
}, () => {});
```

#### Decision Cycle Pause Points
Combat pauses at these points and saves state to `game.activeCombat`:

1. **`pendingBeforeAttackHealing`** -- Before a MERC's attack, allow healing item use
2. **`pendingAttackDogSelection`** -- MERC with Attack Dog needs to assign it
3. **`pendingTargetSelection`** -- Player needs to choose targets for attack
4. **`pendingHitAllocation`** -- Player needs to allocate hits to targets (dice rolled)
5. **`pendingWolverineSixes`** -- Wolverine's bonus 6s need target allocation
6. **`pendingEpinephrine`** -- MERC took lethal damage, epinephrine available
7. **Retreat/Continue** -- End of round, player can retreat or continue

Plus two terminal states:
- **`combatComplete: true`** -- Combat ended, UI animating final events
- **Combat start** -- `activeCombat` first set when combat begins

#### CombatPanel Data Resolution (Current)
The CombatPanel currently resolves combatant data by:
1. Receiving `activeCombat` as a prop (from theatre view)
2. Getting `rebelCombatants[]` and `dictatorCombatants[]` which contain `Combatant` objects with `sourceElement` refs
3. Using `resolveCombatant(c)` which calls `findElementById(id)` on the gameView to get the actual element
4. Extracting display data: `getAttr(resolved, 'name', '')`, `getAttr(resolved, 'health', ...)`, etc.
5. Complex fallback chain for health: displayHealth map -> serializedHealth -> fallbackHealth -> computed from damage

This is the resolution chain Phase 43 eliminates -- after this phase, CombatPanel gets all data directly from `combat-panel` snapshot events.

### Target Architecture (What We're Building)

#### Pattern 1: Pure Data Animate Calls
```typescript
// Pre-compute all values needed for event data
const healthBefore = target.health;
const armorAbsorb = (!attacker.armorPiercing && target.armor > 0)
  ? Math.min(target.armor, remainingHits) : 0;
const expectedHealthDamage = Math.min(remainingHits - armorAbsorb, target.health);

// Emit pure data event (no callback)
game.animate('combat-damage', {
  attackerName: capitalize(attacker.name),
  attackerId: attacker.id,
  targetName: capitalize(target.name),
  targetId: target.id,
  targetImage: target.image,
  damage: expectedHealthDamage,
  healthBefore,
  healthAfter: healthBefore - expectedHealthDamage,
});

// Mutations happen as normal code AFTER animate
applyDamage(target, remainingHits, game, attacker.armorPiercing);
damageDealt.set(target.id, expectedHealthDamage);
if (target.sourceElement?.isMerc) {
  target.sourceElement.damage = target.sourceElement.maxHealth - target.health;
}
```

#### Pattern 2: combat-panel Snapshot Event
```typescript
// Emitted at each decision cycle
game.animate('combat-panel', buildCombatPanelSnapshot(game));

function buildCombatPanelSnapshot(game: MERCGame): Record<string, unknown> {
  const ac = game.activeCombat!;
  return {
    sectorId: ac.sectorId,
    sectorName: game.getSector(ac.sectorId)?.sectorName,
    round: ac.round,
    rebelCombatants: ac.rebelCombatants.map(c => serializeCombatant(c)),
    dictatorCombatants: ac.dictatorCombatants.map(c => serializeCombatant(c)),
    rebelCasualties: ac.rebelCasualties.map(c => serializeCombatant(c)),
    dictatorCasualties: ac.dictatorCasualties.map(c => serializeCombatant(c)),
    dogAssignments: ac.dogAssignments,
    combatComplete: ac.combatComplete ?? false,
    // Decision context (only one active at a time)
    pendingTargetSelection: ac.pendingTargetSelection ? { ... } : undefined,
    pendingHitAllocation: ac.pendingHitAllocation ? { ... } : undefined,
    pendingWolverineSixes: ac.pendingWolverineSixes ? { ... } : undefined,
    pendingAttackDogSelection: ac.pendingAttackDogSelection ? { ... } : undefined,
    pendingBeforeAttackHealing: ac.pendingBeforeAttackHealing ? { ... } : undefined,
    pendingEpinephrine: ac.pendingEpinephrine ? { ... } : undefined,
  };
}

function serializeCombatant(c: Combatant): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    image: c.image,
    health: c.health,
    maxHealth: c.maxHealth,
    isMerc: !c.isMilitia && !c.isDictator && !c.isAttackDog,
    isMilitia: c.isMilitia,
    isAttackDog: c.isAttackDog,
    isDictator: c.isDictator,
    playerColor: c.playerColor,
    combatantId: c.combatantId,
    isDictatorSide: c.isDictatorSide,
    // Attack dog specific
    attackDogAssignedTo: c.attackDogAssignedTo,
    attackDogTargetName: c.attackDogTargetName,
    attackDogPendingTarget: c.attackDogPendingTarget,
  };
}
```

### Anti-Patterns to Avoid
- **Do NOT change combat mechanics** -- this phase only adds event emission and extracts mutations from callbacks. Combat logic (target selection, damage, abilities) must remain identical.
- **Do NOT make the snapshot builder depend on UI concerns** -- it should be a pure function of game state.
- **Do NOT try to make CombatPanel consume combat-panel events yet** -- that is Phase 44. This phase only ensures the events are emitted correctly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Combatant serialization | Custom per-call-site serialization | Single `serializeCombatant()` helper | 7+ call sites need same data shape |
| Snapshot assembly | Inline snapshot building at each pause | Single `buildCombatPanelSnapshot()` function | Consistency across all 9 emission points |
| Health pre-computation | Re-derive health from damage | Use existing pre-computation pattern already in combat.ts | Lines 1790-1793 already do this correctly |

## Common Pitfalls

### Pitfall 1: Mutation Order with Pure Data Events
**What goes wrong:** Moving mutations out of callbacks can change the order of operations. The callback was called synchronously after the ANIMATE command, so mutations happened at a specific point.
**Why it happens:** The callback in `game.animate()` runs **immediately synchronously** after `this.execute({ type: 'ANIMATE', ... })`. Moving code after the `game.animate()` call has the same timing. The risk is if there's code BETWEEN the animate and the mutations that reads the pre-mutation state.
**How to avoid:** Keep mutations immediately after the animate call. Don't insert unrelated code between them.
**Warning signs:** Test failures related to combat state ordering.

### Pitfall 2: combat-death Has Mutation AND Side Effects
**What goes wrong:** The `combat-death` animate callback does `casualties.push(target)` AND `game.message(...)`. The `casualties` array is a local variable used by the combat round tracking. Moving this out of the callback is safe because the callback runs synchronously anyway, but must happen immediately after.
**Why it happens:** The current pattern puts logically-grouped operations inside the callback.
**How to avoid:** Extract ALL operations from the callback, keeping them in the same order immediately after `game.animate()`.

### Pitfall 3: combat-attack-dog Has Complex State Updates
**What goes wrong:** The attack dog callbacks update multiple objects: `dog.attackDogAssignedTo`, `dogState.assignments`, `attacker.hasAttackDog`, and potentially combatant arrays. These are 3 separate call sites with similar but not identical code.
**Why it happens:** Attack dog assignment evolved with multiple code paths (AI auto-assign, human selection pre-made, human selection new dog).
**How to avoid:** Extract the mutation block wholesale without trying to simplify or merge the three code paths. Merging can be done in a later cleanup phase.

### Pitfall 4: combat-damage Callback Uses `remainingHits` Not `expectedHealthDamage`
**What goes wrong:** The callback calls `applyDamage(target, remainingHits, game, attacker.armorPiercing)` using the loop variable `remainingHits`, but the event data pre-computes `expectedHealthDamage`. The values differ because `applyDamage` handles armor internally.
**Why it happens:** `applyDamage` is the canonical damage function that handles armor absorption. The pre-computation duplicates that logic to get the event data right.
**How to avoid:** When extracting, keep the `applyDamage(target, remainingHits, ...)` call exactly as-is. Don't try to "simplify" by passing `expectedHealthDamage` instead.

### Pitfall 5: combat-end Callback Sets activeCombat Again
**What goes wrong:** The combat-end callback does `game.activeCombat = combatEndState` which is identical to line 2770 (before the animate call). This is currently redundant.
**Why it happens:** Historical artifact -- the callback was originally the only place that set the state.
**How to avoid:** When removing the callback, verify that `game.activeCombat = combatEndState` on line 2770 already runs before the animate. It does. The callback can simply be removed.

### Pitfall 6: combat-round-start Callback Clears healingDiceUsed
**What goes wrong:** The callback resets `game.activeCombat.healingDiceUsed.clear()`. This must still happen.
**Why it happens:** Healing dice tracking resets each round.
**How to avoid:** Move the `.clear()` call immediately after the `game.animate('combat-round-start', ...)` call.

### Pitfall 7: Where to Emit combat-panel Snapshots
**What goes wrong:** Emitting snapshots at the wrong points leads to stale or missing data.
**Why it happens:** There are 9 distinct points where `activeCombat` is set/updated in `executeCombat()`:
1. Initial combat start (line 2395)
2. Paused for target selection (line 2472)
3. Paused for hit allocation (line 2525)
4. Paused for before-attack healing (line 2566)
5. Paused for attack dog selection (line 2607)
6. Paused for retreat/continue (line 2695)
7. Combat complete (line 2770)
Plus in `executeCombatRound()`:
8. `pendingHitAllocation` set (line 1724)
9. `pendingBeforeAttackHealing` set (line 1436)
**How to avoid:** Emit `combat-panel` snapshot after every `game.activeCombat = { ... }` assignment in `executeCombat()`. For states set inside `executeCombatRound()` (hit allocation, before-attack healing), the snapshot should be emitted back in `executeCombat()` after the round returns with a pause.

## Code Examples

### All Current game.animate() Calls - Complete Inventory

#### combat.ts - 10 calls

**1. combat-attack-dog (AI auto-assign)** -- Line 1076
- Data: attackerName, attackerId, attackerImage, targetName, targetId, targetImage, dogId, dogImage
- Callback: assigns dog to target, updates dogState, clears attacker.hasAttackDog, game.message x2
- Complexity: MEDIUM

**2. combat-attack-dog (human pre-selected)** -- Line 1127
- Data: same as #1
- Callback: same pattern as #1
- Complexity: MEDIUM

**3. combat-attack-dog (human pre-selected, existing dog)** -- Line 1485
- Data: same as #1
- Callback: same pattern + updates combatant arrays
- Complexity: HIGH (most complex callback)

**4. combat-roll (initial roll)** -- Line 1644
- Data: attackerName, attackerId, attackerImage, targetNames, targetIds, diceRolls, hits, hitThreshold
- Callback: `() => {}` (ALREADY PURE DATA)
- Complexity: NONE (already done)

**5. combat-roll (reroll)** -- Line 1664
- Data: same as #4
- Callback: `() => {}` (ALREADY PURE DATA)
- Complexity: NONE (already done)

**6. combat-damage** -- Line 1797
- Data: attackerName, attackerId, targetName, targetId, targetImage, damage, healthBefore, healthAfter
- Callback: applyDamage, damageDealt.set, sync sourceElement damage
- Complexity: HIGH (armor handling, source sync)

**7. combat-death (Adelheid fallback)** -- Line 1844
- Data: targetName, targetId, targetImage
- Callback: casualties.push, game.message
- Complexity: LOW

**8. combat-death (normal)** -- Line 1854
- Data: targetName, targetId, targetImage
- Callback: casualties.push, game.message
- Complexity: LOW

**9. combat-round-start** -- Line 2445
- Data: round
- Callback: clears healingDiceUsed map
- Complexity: LOW

**10. combat-end** -- Line 2773
- Data: rebelVictory, dictatorVictory
- Callback: sets game.activeCombat = combatEndState (redundant with line 2770)
- Complexity: LOW (callback is redundant)

#### rebel-combat.ts - 3 calls

**11. combat-heal (medical kit heal action)** -- Line 811
- Data: healerName, healerId, targetName, targetId, healAmount, healthAfter, itemName
- Callback: tracks dice discarded, heals target + source merc, manages item uses/discard
- Complexity: HIGH (multi-step mutation)

**12. combat-heal (before-attack heal action)** -- Line 966
- Data: same as #11
- Callback: same pattern as #11
- Complexity: HIGH

**13. combat-heal (surgeon ability)** -- Line 1245
- Data: healerName, healerId, targetName, targetId, healAmount, healthAfter, isSurgeonAbility
- Callback: tracks dice, reduces surgeon combat, heals target + source merc
- Complexity: HIGH

### Combatant Data Available at Combat Time

The `Combatant` interface (combat-types.ts) provides this data for snapshot serialization:
```typescript
interface Combatant {
  id: string;              // Element ID (number as string)
  name: string;            // Display name
  initiative: number;
  combat: number;
  health: number;
  maxHealth: number;
  armor: number;
  targets: number;
  isDictatorSide: boolean;
  isMilitia: boolean;
  isDictator: boolean;
  isAttackDog: boolean;
  sourceElement: CombatantModel | null;  // Live reference to game element
  ownerId?: string;        // For rebel militia
  armorPiercing: boolean;
  hasAttackDog: boolean;
  attackDogAssignedTo?: string;
  attackDogTargetName?: string;
  attackDogPendingTarget?: boolean;
  isImmuneToAttackDogs: boolean;
  willNotHarmDogs: boolean;
  hasUsedReroll?: boolean;
  image?: string;          // Portrait path from JSON
  combatantId?: string;    // Combatant ID (e.g., 'haarg')
  playerColor?: string;    // Player color for UI
}
```

The CombatPanel's `getCombatantDisplay()` function (line 565-626) extracts these fields for each combatant:
- id, name, isMerc, isAttackDog, isMilitia, health, maxHealth, combatantId, image, isDead, playerColor, attackDogTargetName, attackDogPendingTarget

This is exactly the data the `combat-panel` snapshot should include per combatant per SRV-01.

### activeCombat Structure (Full Shape)

```typescript
activeCombat: {
  sectorId: string;
  attackingPlayerId: string;
  attackingPlayerIsRebel?: boolean;
  round: number;
  rebelCombatants: Combatant[];
  dictatorCombatants: Combatant[];
  rebelCasualties: Combatant[];
  dictatorCasualties: Combatant[];
  // Attack Dog state
  dogAssignments?: Array<[string, Combatant]>;
  dogs?: Combatant[];
  // Decision cycle state (at most one active at a time)
  currentAttackerIndex?: number;
  roundResults?: CombatResult[];
  roundCasualties?: Combatant[];
  pendingTargetSelection?: { attackerId, attackerName, validTargets[], maxTargets };
  pendingAttackDogSelection?: { attackerId, attackerName, validTargets[] };
  selectedTargets?: Map<string, string[]>;
  selectedDogTargets?: Map<string, string>;
  healingDiceUsed?: Map<string, number>;
  beforeAttackHealingProcessed?: Set<string>;
  pendingHitAllocation?: { attackerId, attackerName, attackerCombatantId, diceRolls[], hits, hitThreshold, validTargets[], wolverineSixes, canReroll, hasRerolled, rollCount };
  pendingWolverineSixes?: { attackerId, attackerName, sixCount, bonusTargets[] };
  pendingEpinephrine?: { dyingCombatantId, dyingCombatantName, dyingCombatantSide, availableSavers[] };
  pendingBeforeAttackHealing?: { attackerId, attackerName, availableHealers[], damagedAllies[] };
  combatComplete?: boolean;
} | null;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mutations inside animate callbacks | Mutations after animate calls | Phase 43 (this phase) | Pure data events, easier to reason about |
| UI resolves combatants via findElementById | Snapshot events carry all data | Phase 43 (this phase) | No element ref resolution needed |
| Acknowledgment protocol for events | Fire-and-forget events | Phase 42 (just completed) | Simpler event handling |
| useCurrentView for truth access | Theatre view only | Phase 42 (just completed) | Single source of truth for UI |

## Open Questions

1. **Should combat-panel be emitted at combat START before any rounds?**
   - What we know: `activeCombat` is first set at line 2395 before the round loop begins. The CombatPanel needs data to render.
   - What's unclear: Whether the UI needs a combat-panel event at this point or if the initial `activeCombat` set is sufficient
   - Recommendation: Yes, emit at combat start. This gives the UI its initial snapshot including all combatants.

2. **Should the snapshot include the healingDiceUsed map?**
   - What we know: The UI needs to know about dice availability for healing decisions
   - What's unclear: Whether this is UI-only state or needs to be in the snapshot
   - Recommendation: Include it for completeness since `pendingBeforeAttackHealing` references dice availability

3. **How do we handle the `combat-damage` path where `expectedHealthDamage === 0`?**
   - What we know: Lines 1815-1822 have a code path where no animate is emitted but damage is still applied (all absorbed by armor)
   - What's unclear: Whether this should emit a combat-damage event with damage: 0
   - Recommendation: Leave as-is -- if damage is 0, no animation event is needed (armor fully absorbed the hit)

## Sources

### Primary (HIGH confidence)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/rules/combat.ts` -- All 10 animate calls analyzed line by line
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/rules/actions/rebel-combat.ts` -- All 3 heal animate calls analyzed
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/rules/combat-types.ts` -- Combatant interface (full shape)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/rules/game.ts` -- activeCombat type definition (lines 460-564)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/ui/components/CombatPanel.vue` -- Current data resolution pattern (lines 559-626)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/ui/components/CombatPanelCombatant.vue` -- Required combatant props
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/node_modules/boardsmith/src/engine/element/game.ts` -- `animate()` API (line 2363)

### Secondary (HIGH confidence)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/rules/flow.ts` -- Combat flow decision cycle loops
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/tests/combat-execution.test.ts` -- 34 test cases
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/tests/combat-abilities.test.ts` -- 42 test cases

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- BoardSmith API verified from source
- Architecture: HIGH -- All code paths read and documented from actual source files
- Pitfalls: HIGH -- Derived from reading actual callback implementations line by line
- Animate call inventory: HIGH -- Grep-verified exhaustive list across entire rules directory

**Research date:** 2026-02-08
**Valid until:** Indefinite (this is codebase-specific research, not library version dependent)
