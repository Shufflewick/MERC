# Phase 60: Complex Interactive Abilities - Research

**Researched:** 2026-02-17
**Domain:** Multi-step dictator abilities (Hitler auto-initiative + hire, Noriega militia conversion + conditional hire)
**Confidence:** HIGH

## Summary

This phase adds two multi-step dictator per-turn abilities: Hitler (hire + pick initiative target) and Noriega (convert militia + move + conditional hire). Both require multiple sequential flow steps for human players while keeping clean AI auto-paths.

The codebase has strong established patterns for both hire abilities (Gaddafi/Stalin from Phase 57) and multi-step interactive flows (Mussolini's place-then-spread pattern from Phase 59). Hitler's initiative override is the only truly novel mechanic -- it requires persistent game state and a hook in the combat initiative sorting function.

**Primary recommendation:** Follow the Gaddafi hire pattern for both dictators' hire steps, the Mussolini multi-step pattern for Noriega's militia conversion flow, and add a new `hitlerInitiativeTargetSeat` property on MERCGame for the persistent initiative override.

## Standard Stack

No new libraries needed. All implementation uses existing patterns within the codebase.

### Core Files to Modify

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `src/rules/dictator-abilities.ts` | AI ability implementations | Add `applyHitlerTurnAbility`, `applyNoriegaTurnAbility` |
| `src/rules/actions/dictator-actions.ts` | Human player actions | Add Hitler and Noriega action creators |
| `src/rules/actions/index.ts` | Action registration | Register new actions |
| `src/rules/flow.ts` | Game flow | Add flow steps for Hitler/Noriega abilities |
| `src/rules/game.ts` | Game state | Add `hitlerInitiativeTargetSeat` and Noriega pending state |
| `src/rules/combat.ts` | Initiative sorting | Add Hitler auto-initiative override in `sortByInitiative` |

## Architecture Patterns

### Pattern 1: Simple Hire (Gaddafi Pattern)
**What:** Draw 1 random MERC, auto-equip, place in squad
**When to use:** Hitler's hire step, Noriega's conditional hire
**AI path:** `applyGadafiTurnAbility` in dictator-abilities.ts (lines 741-780)
**Human path:** `createGadafiBonusHireAction` in dictator-actions.ts (lines 1297-1449)
**Flow entry:** Single action step in `dictator-ability` action list (flow.ts line 1001)

```typescript
// AI: Direct function call in applyDictatorTurnAbilities switch
case 'hitler':
  applyHitlerTurnAbility(game);
  break;

// Human: Action registered and listed in flow step
game.registerAction(createHitlerBonusHireAction(game));
// Flow: actionStep with actions: ['hitlerBonusHire', 'hitlerPickTarget', ...]
```

### Pattern 2: Multi-Step Flow (Mussolini Pattern)
**What:** First action step triggers state setup, subsequent loop handles additional steps
**When to use:** Noriega's multi-step flow (convert, choose sector, conditional hire)
**Reference:** Mussolini place + spread in flow.ts (lines 999-1029) with `pendingMussoliniSpread` state

```typescript
// Step 1: Initial action (mussoliniBonusMilitia) sets up pending state
// Step 2: Loop on pending state (mussolini-spread) with its own action step
// This pattern allows each step to yield to the UI for human interaction
```

### Pattern 3: Persistent Cross-Turn State
**What:** Game state that persists across turns
**When to use:** Hitler's initiative target (persists until switched)
**Reference:** `_polpotTargetSectorId` (transient, per-turn), `betterWeaponsActive` (persistent)
**Key insight:** Properties on MERCGame that are not prefixed with `_` are serialized to clients. Hitler's target MUST be visible to the affected rebel player.

```typescript
// On MERCGame class:
hitlerInitiativeTargetSeat: number | null = null;
// Serialized to all clients so the affected rebel can see the indicator
```

### Pattern 4: Combat Initiative Override
**What:** Modify initiative sorting to give automatic initiative
**When to use:** Hitler's "auto-initiative over a rebel's forces"
**Reference:** `sortByInitiative` in combat.ts (lines 670-700), `alwaysGoesFirst` check

```typescript
// In sortByInitiative, after alwaysGoesFirst checks but before numeric comparison:
// Check if Hitler's auto-initiative applies
// If dictator-side combatant vs rebel combatant owned by targeted rebel:
//   dictator-side combatant wins initiative regardless of numeric value
```

### Anti-Patterns to Avoid
- **Don't create separate combat.ts for initiative override:** The hook belongs directly in `sortByInitiative`, not as a separate module
- **Don't store initiative target as player name string:** Use seat number (stable, serializable)
- **Don't make Noriega's conversion atomic:** Each sector conversion should be visible in messages for transparency

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MERC hiring | Custom hire logic | Follow `applyGadafiTurnAbility` pattern exactly | Equipment, squad placement, sarge bonuses, map entry animations all handled |
| Sector control counting | Manual sector iteration | `game.getControlledSectors(player)` | Already handles dictator-wins-ties and rebel-vs-rebel tiebreaking |
| Militia manipulation | Direct property mutation | `sector.addDictatorMilitia()`, `sector.removeRebelMilitia()`, `sector.removeDictatorMilitia()` | These handle caps and return actual amounts |
| Combat triggering | Manual combat setup | `queuePendingCombat(game, sector, rebel, false)` | Proper queuing for flow-based resolution |
| Cached action state | Settings manipulation | `getGlobalCachedValue/setGlobalCachedValue/clearGlobalCachedValue` | Standard pattern for state that persists across action choices |

## Common Pitfalls

### Pitfall 1: Initiative Override Must Affect All Dictator Forces vs All Targeted Rebel Forces
**What goes wrong:** Only applying auto-initiative to MERCs, forgetting militia
**Why it happens:** The Combatant interface has `isDictatorSide` but militia don't have `ownerId` on dictator side
**How to avoid:** The override applies when: combatant A is `isDictatorSide=true` AND combatant B has `ownerId` matching the targeted rebel's seat. For dictator militia (no ownerId), they already get dictator-wins-ties in `sortByInitiative`. The override needs to ensure dictator-side units go BEFORE the targeted rebel's units regardless of initiative values.
**Warning signs:** Dictator militia still loses initiative to targeted rebel MERCs with high initiative

### Pitfall 2: Noriega Converting From Rebel Sectors Must Check Per-Rebel
**What goes wrong:** Converting militia from "rebel sectors" without tracking which rebel owns each militia
**Why it happens:** `sector.rebelMilitia` is a `Record<string, number>` keyed by player seat
**How to avoid:** Iterate through each rebel player's controlled sectors, convert 1 militia from each. Use `sector.removeRebelMilitia(playerId, 1)` and track total converted for later placement.

### Pitfall 3: Hitler's Target Must Be Switchable Once Per Turn
**What goes wrong:** Allowing multiple switches per turn, or no switches at all
**Why it happens:** No tracking of whether switch was used this turn
**How to avoid:** Add `hitlerInitiativeSwitchedThisTurn: boolean` state, reset in `advanceDay()`, check in action condition

### Pitfall 4: Noriega's Conditional Hire Depends on Sector Count Comparison
**What goes wrong:** Comparing wrong counts or at wrong time
**Why it happens:** Sector control changes after militia conversion
**How to avoid:** Calculate sector comparison AFTER militia conversion is complete (control may have changed). Use `game.getControlledSectors(game.dictatorPlayer).length` vs sum of all rebels' controlled sectors.

### Pitfall 5: Flow Step Ordering for Multi-Step Abilities
**What goes wrong:** Human player doesn't see prompts for subsequent steps
**Why it happens:** All steps crammed into one action instead of sequential flow steps
**How to avoid:** Follow the Mussolini pattern: first action step does initial work, sets pending state, then a loop with its own action step handles subsequent choices

### Pitfall 6: Human vs AI Path Split
**What goes wrong:** Forgetting to handle one path
**Why it happens:** Each dictator ability needs both an AI auto-path (in dictator-abilities.ts) and a human interactive path (actions + flow steps)
**How to avoid:** Always implement AI path first (simpler), then create corresponding human actions and flow steps. The flow.ts `execute()` block at line 979 handles the split: AI calls `applyDictatorTurnAbilities`, human uses action steps.

## Code Examples

### Hitler AI Ability (dictator-abilities.ts)
```typescript
export function applyHitlerTurnAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'hitler') {
    return { success: false, message: 'Not Hitler' };
  }

  // Step 1: Hire 1 random MERC (reuse Gaddafi pattern)
  const merc = game.drawMerc();
  if (merc) {
    const primarySquad = game.dictatorPlayer.primarySquad;
    const secondarySquad = game.dictatorPlayer.secondarySquad;
    const targetSquad = !primarySquad.isFull ? primarySquad
      : !secondarySquad.isFull ? secondarySquad : null;

    if (targetSquad) {
      merc.putInto(targetSquad);
      const targetSector = selectNewMercLocation(game);
      if (targetSector) targetSquad.sectorId = targetSector.sectorId;
      let equipType: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
      if (merc.weaponSlot) equipType = merc.armorSlot ? 'Accessory' : 'Armor';
      equipNewHire(game, merc, equipType);
      game.updateAllSargeBonuses();
      game.message(`Hitler hired ${merc.combatantName}`);
    } else {
      merc.putInto(game.mercDiscard);
    }
  }

  // Step 2: Pick initiative target (AI picks weakest rebel)
  const rebels = game.rebelPlayers;
  if (rebels.length > 0) {
    // AI strategy: target rebel with most controlled sectors (biggest threat)
    const target = rebels.reduce((best, r) =>
      game.getControlledSectors(r).length > game.getControlledSectors(best).length ? r : best
    );
    game.hitlerInitiativeTargetSeat = target.seat;
    game.hitlerInitiativeSwitchedThisTurn = true;
    game.message(`Hitler targets ${target.name || `Rebel ${target.seat}`} for auto-initiative`);
  }

  return { success: true, message: 'Hitler ability complete' };
}
```

### Noriega AI Ability (dictator-abilities.ts)
```typescript
export function applyNoriegaTurnAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'noriega') {
    return { success: false, message: 'Not Noriega' };
  }

  // Step 1: Convert 1 militia from each rebel-controlled sector
  let totalConverted = 0;
  for (const rebel of game.rebelPlayers) {
    for (const sector of game.getControlledSectors(rebel)) {
      const removed = sector.removeRebelMilitia(`${rebel.seat}`, 1);
      if (removed > 0) totalConverted += removed;
    }
  }

  // Step 2: Move all converted militia to one chosen non-rebel sector
  if (totalConverted > 0) {
    const allSectors = game.gameMap.getAllSectors();
    // Find non-rebel-controlled sectors
    const nonRebelSectors = allSectors.filter(s => {
      for (const rebel of game.rebelPlayers) {
        if (game.getControlledSectors(rebel).some(cs => cs.sectorId === s.sectorId)) return false;
      }
      return true;
    });
    const targetSector = selectMilitiaPlacementSector(game, nonRebelSectors, 'dictator')
      || nonRebelSectors[0];
    if (targetSector) {
      const placed = targetSector.addDictatorMilitia(totalConverted);
      game.message(`Noriega converted ${totalConverted} militia to ${targetSector.sectorName}`);
      // Check for combat
      for (const rebel of game.rebelPlayers) {
        if (hasEnemies(game, targetSector, rebel)) {
          queuePendingCombat(game, targetSector, rebel, false);
        }
      }
    }
  }

  // Step 3: Conditional hire if dictator controls fewer sectors than rebels
  const dictatorSectors = game.getControlledSectors(game.dictatorPlayer).length;
  let rebelSectors = 0;
  for (const rebel of game.rebelPlayers) {
    rebelSectors += game.getControlledSectors(rebel).length;
  }

  if (dictatorSectors < rebelSectors) {
    // Hire using Gaddafi pattern
    const merc = game.drawMerc();
    if (merc) {
      // ... same hire pattern as Gaddafi
    }
  }

  return { success: true, message: 'Noriega ability complete' };
}
```

### Initiative Override Hook (combat.ts sortByInitiative)
```typescript
function sortByInitiative(combatants: Combatant[], game?: MERCGame): Combatant[] {
  return [...combatants].sort((a, b) => {
    // ... existing alwaysGoesFirst and alwaysBeforesMilitia checks ...

    // Hitler's auto-initiative: dictator forces always go before targeted rebel's forces
    if (game?.hitlerInitiativeTargetSeat != null) {
      const aIsTargetedRebel = !a.isDictatorSide && a.ownerId === `${game.hitlerInitiativeTargetSeat}`;
      const bIsTargetedRebel = !b.isDictatorSide && b.ownerId === `${game.hitlerInitiativeTargetSeat}`;
      // For MERCs, check sourceElement's player ownership
      if (!a.isMilitia && a.sourceElement) {
        // Check if sourceElement belongs to targeted rebel
      }
      if (a.isDictatorSide && bIsTargetedRebel) return -1;
      if (b.isDictatorSide && aIsTargetedRebel) return 1;
    }

    // ... existing numeric initiative comparison ...
  });
}
```

### Human Flow Steps (flow.ts)
```typescript
// Hitler: Two-step ability (hire + pick target)
actionStep({
  name: 'hitler-bonus-hire',
  actions: ['hitlerBonusHire'],
  prompt: "Hitler's Ability: Hire a MERC",
  skipIf: () => game.isFinished() ||
    game.dictatorPlayer?.dictator?.combatantId !== 'hitler' ||
    game.dictatorPlayer?.isAI === true,
}),
actionStep({
  name: 'hitler-pick-target',
  actions: ['hitlerPickInitiativeTarget'],
  prompt: "Hitler's Ability: Choose a rebel for auto-initiative",
  skipIf: () => game.isFinished() ||
    game.dictatorPlayer?.dictator?.combatantId !== 'hitler' ||
    game.dictatorPlayer?.isAI === true,
}),

// Noriega: Multi-step (conversion happens in execute, then choose sector, then conditional hire)
```

### Game State Additions (game.ts)
```typescript
// Hitler: Persistent initiative target (survives across turns)
hitlerInitiativeTargetSeat: number | null = null;
hitlerInitiativeSwitchedThisTurn: boolean = false;
// Reset in advanceDay(): this.hitlerInitiativeSwitchedThisTurn = false;

// Noriega: Pending conversion state for human interactive flow
pendingNoriegaConversion: {
  convertedCount: number;  // Total militia converted from rebel sectors
} | null = null;
```

## Key Technical Details

### Initiative Override Approach
The `sortByInitiative` function in combat.ts (line 670) receives an array of `Combatant` objects and sorts them. The Combatant interface has:
- `isDictatorSide: boolean` -- which side
- `ownerId?: string` -- for rebel militia, the player seat as string
- `sourceElement: CombatantModel | null` -- for MERCs, the actual game element

To determine if a rebel combatant belongs to the targeted player:
- **Militia:** Check `ownerId === String(targetSeat)`
- **MERCs:** Check `sourceElement` and trace back to owning player via `game.rebelPlayers.find(p => p.team.some(m => m.id === sourceElement.id))`

**Critical:** `sortByInitiative` currently does NOT receive the game reference. It must be modified to accept `game?: MERCGame` parameter. This is a function-level change, not a class change.

### Noriega Militia Conversion
The `Sector` class stores rebel militia as `rebelMilitia: Record<string, number>` (keyed by player seat string). To convert 1 militia from each rebel sector:
1. For each rebel player, get `game.getControlledSectors(rebel)`
2. For each sector, call `sector.removeRebelMilitia(String(rebel.seat), 1)`
3. Track total removed
4. Place total on one chosen non-rebel sector via `sector.addDictatorMilitia(totalConverted)`

### Registration Checklist
Following the established pattern in `src/rules/actions/index.ts`:
1. Import new action creators from dictator-actions.ts
2. Add to `registerAllActions` function
3. Add action names to flow.ts action step arrays
4. Add to `applyDictatorTurnAbilities` switch in dictator-abilities.ts

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-dictator function exports | Switch in `applyDictatorTurnAbilities` | Phase 57 | All turn abilities routed through single dispatcher |
| AI-only abilities | AI + human action pairs | Phase 57-59 | Every ability needs both paths |
| Single-step abilities | Multi-step with pending state | Phase 59 (Mussolini) | Complex abilities use loops + pending state |

## Open Questions

1. **Hitler initiative target visibility:** Should all rebels see who is targeted, or only the affected rebel? The requirement says "visible to the affected rebel" but game balance might benefit from all players knowing. **Recommendation:** Make it visible to all players (simpler, more transparent).

2. **Noriega conversion edge case -- sector with 0 rebel militia:** What happens if a rebel "controls" a sector via MERCs only (no militia)? `removeRebelMilitia` would return 0. This is correct behavior -- conversion only affects militia. **Recommendation:** No special handling needed, just log that no militia was available.

3. **Hitler initiative -- does it affect the dictator card itself?** The ability says "your forces" which includes the dictator card, hired MERCs, and militia. **Recommendation:** Yes, all dictator-side combatants get auto-initiative over the targeted rebel's forces.

4. **sortByInitiative game parameter threading:** Currently `sortByInitiative` is called from many places. Adding a `game` parameter means updating all call sites. **Recommendation:** Since the function is module-private, this is safe. The `game` parameter could also be passed via `executeCombat` which already has the game reference and calls `sortByInitiative` internally.

## Sources

### Primary (HIGH confidence)
- `src/rules/dictator-abilities.ts` -- All existing ability implementations, dispatcher pattern
- `src/rules/actions/dictator-actions.ts` -- All existing human player action implementations
- `src/rules/flow.ts` -- Flow step patterns for abilities, multi-step loops
- `src/rules/game.ts` -- Game state patterns, MERCPlayer class
- `src/rules/combat.ts` -- `sortByInitiative`, `mercToCombatant`, combatant building
- `src/rules/combat-types.ts` -- Combatant interface
- `src/rules/elements.ts` -- Sector militia methods (`addDictatorMilitia`, `removeRebelMilitia`)
- `data/combatants.json` -- Hitler and Noriega ability text and stats

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all patterns exist in codebase
- Architecture: HIGH -- directly reusing Gaddafi/Mussolini patterns
- Pitfalls: HIGH -- identified from real code analysis
- Initiative override: MEDIUM -- novel mechanic, but sortByInitiative is well-understood

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (stable codebase patterns)
