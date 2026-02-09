# Phase 48: Landmine System - Research

**Researched:** 2026-02-08
**Domain:** Landmine trigger/damage/discard + Squidhead counter-ability
**Confidence:** HIGH

## Summary

The landmine system is partially implemented. The AI-side detonation already works -- `detonateLandMines()` in `ai-combat-helpers.ts` fires before combat begins when rebels attack a dictator-controlled sector. What is **missing** is:

1. **Automatic triggering on sector entry** -- Currently, landmines only detonate inside the `executeCombat()` call path (line 2502 of `combat.ts`). They should also trigger when an enemy enters a sector that has a landmine in the stash, even before combat is queued. Per the rules, the mine detonates when enemies enter, which is the movement action itself.
2. **Bidirectional detonation** -- The existing `detonateLandMines()` only damages rebel units. When rebels have armed a mine (via Squidhead), it should also detonate against dictator units entering a rebel-controlled sector.
3. **Squidhead counter-ability** -- Per Squidhead's card text: "Disarms enemy land mines when he enters a sector." If Squidhead is in the entering squad, the mine does NOT detonate -- instead it is automatically disarmed. The existing `handlesLandMines()` check exists but is never consulted during detonation.

**Primary recommendation:** Refactor `detonateLandMines()` into a general-purpose function that works bidirectionally, call it from the move action's `execute()` handler (and coordinated attack handlers) right after `squad.sectorId = destination.sectorId` and before combat is queued, and add Squidhead prevention logic.

## Standard Stack

No new libraries needed. This phase operates entirely within existing infrastructure.

### Core (already in codebase)
| Library | Purpose | Used For |
|---------|---------|----------|
| `equipment-effects.ts` | `isLandMine()`, `getMineDamage()` | Identify mines, get damage |
| `merc-abilities.ts` | `handlesLandMines()` | Squidhead counter check |
| `ai-combat-helpers.ts` | `detonateLandMines()` | Existing AI-only implementation |
| `elements.ts` | `Sector.getStashContents()`, `Sector.takeFromStash()`, `CombatantModel.takeDamage()` | Stash operations, damage |
| `game.ts` | `game.animate()`, `game.message()`, `game.getEquipmentDiscard()` | Animation, logging, discard |

## Architecture Patterns

### Current Landmine Detonation Flow (AI only)
```
rebel moves into dictator sector
  -> move action sets squad.sectorId
  -> move action checks hasEnemies()
  -> move action sets game.pendingCombat
  -> flow picks up pendingCombat in execute step
  -> executeCombat() calls detonateLandMines() (combat.ts:2502)
  -> combat proceeds
```

### Required Landmine Detonation Flow (all cases)
```
any player moves into enemy-controlled sector
  -> move action sets squad.sectorId
  -> move action calls checkLandMines(game, destination, movingPlayer)
    -> find mines in stash
    -> check if Squidhead is present (entering squad check)
    -> if Squidhead present: auto-disarm mine, skip detonation
    -> if no Squidhead: detonate mine
      -> deal 1 damage to every enemy combatant in sector
      -> kill 1 militia per enemy faction
      -> discard mine to accessory discard pile
      -> animate explosion
  -> move action checks hasEnemies() (some may have died from mine)
  -> if enemies remain: queue combat
```

### Pattern 1: Movement-Triggered Effects
**What:** Side effects that happen when a squad enters a sector.
**When to use:** Landmine detonation, Squidhead auto-disarm.
**Where to hook:** In the move action's `execute()` handler, immediately after `squad.sectorId = destination.sectorId` and before the `hasEnemies()` check.

### Pattern 2: Bidirectional Damage Function
**What:** A unified function that determines which side gets damaged based on who moved vs. who owns the mine.
**Key insight:** The mine owner is implicit -- the mine is in the sector stash, and whoever controlled the sector placed it. When rebels enter a dictator sector, rebel units take damage. When dictator enters a rebel sector with a rebel-armed mine, dictator units take damage.
**Implementation:** The function needs to know who is entering (the attacker) and damage the attacker's units.

### Pattern 3: Squidhead Counter-Ability
**What:** Squidhead's card text says "Disarms enemy land mines when he enters a sector."
**Implementation:** Before detonation, check if any MERC in the entering squad has `handlesLandMines() === true`. If so, the mine is disarmed (removed from stash but NOT detonated). The mine goes to the discard pile or stays in stash -- per existing `squidheadDisarm` action, Squidhead takes the mine if possible.

### Recommended Project Structure (changes only)
```
src/rules/
  ai-combat-helpers.ts   # Keep existing detonateLandMines() for backwards compat
                         # OR refactor into shared function
  landmine.ts            # NEW: Shared landmine trigger logic
  actions/
    rebel-movement.ts    # Add landmine check in move, coordinatedAttack, executeCoordinatedAttack
```

### Anti-Patterns to Avoid
- **Hooking only in combat.ts:** The existing pattern hooks detonation inside `executeCombat()`, which means mines only fire after combat is decided to start. Mines should fire before combat queuing -- they may kill all enemies, making combat unnecessary.
- **Separate rebel/dictator paths:** Don't create two different detonation functions. Use one bidirectional function.
- **Forgetting coordinated attacks:** There are 3 move-like actions (`move`, `coordinatedAttack`, `executeCoordinatedAttack`) that all need the landmine check.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mine identification | Custom string checks | `isLandMine(equipmentId)` from equipment-effects.ts | Already handles all edge cases |
| Mine damage amount | Hardcoded `1` | `getMineDamage(equipmentId)` from equipment-effects.ts | Future-proofed for different mine types |
| Squidhead check | `combatantId === 'squidhead'` | `handlesLandMines(combatantId)` from merc-abilities.ts | Ability registry pattern |
| Equipment discard | Manual removal | `game.getEquipmentDiscard('Accessory')` + `mine.putInto(discard)` | Standard discard pattern |
| Stash operations | Direct array manipulation | `sector.getStashContents()` / `sector.takeFromStash(idx)` | Proper BoardSmith element operations |

## Common Pitfalls

### Pitfall 1: Mine detonates AFTER combat starts
**What goes wrong:** If detonation happens inside `executeCombat()` (current pattern), the mine damage is applied after combat combatants are already gathered. This means dead MERCs still appear in combat arrays.
**Why it happens:** The existing code calls `detonateLandMines()` at line 2502 of combat.ts, after `getCombatants()` has already built the rebel/dictator arrays.
**How to avoid:** Move detonation to the move action, before `hasEnemies()` check and before `pendingCombat` is set. Remove the call from combat.ts line 2502.
**Warning signs:** Dead MERCs appearing in combat panels, combat starting with 0-health combatants.

### Pitfall 2: Detonation kills everyone, but combat still starts
**What goes wrong:** If the mine kills all enemies and we still queue combat, `executeCombat()` runs with empty arrays.
**Why it happens:** `hasEnemies()` is checked after movement but before mine detonation in current flow.
**How to avoid:** Detonate mine FIRST, then check `hasEnemies()`. The existing move action already has the `hasEnemies()` check at lines 260-266 -- just insert mine detonation before it.

### Pitfall 3: Squidhead auto-disarm happens for ALL mines, not just enemy mines
**What goes wrong:** If Squidhead's own team armed a mine in the sector, moving Squidhead there could inadvertently disarm the friendly mine.
**Why it happens:** Not checking mine ownership/controller.
**How to avoid:** Only trigger landmine effects against enemy squads entering. If the entering player controls the sector, no mines fire. The ownership check is: who has units in the sector BEFORE the entering squad arrived?

### Pitfall 4: Multiple movement actions not all covered
**What goes wrong:** Mines trigger on `move` but not on `coordinatedAttack` or `executeCoordinatedAttack`.
**Why it happens:** Copy-paste omission.
**How to avoid:** Extract landmine logic into a shared function called from all 3 movement actions.

### Pitfall 5: Animation not captured in theatre view
**What goes wrong:** Mine detonation happens but UI shows no visual feedback.
**Why it happens:** Not using `game.animate()` with mutations inside the callback.
**How to avoid:** Use `game.animate('landmine-detonate', data, () => { /* mutations here */ })` pattern. Pre-compute damage targets before the animate call so the animation data is accurate.

### Pitfall 6: Existing AI detonation in combat.ts still fires
**What goes wrong:** Mine detonates twice -- once in the move action and once in `executeCombat()`.
**Why it happens:** The call at combat.ts:2502 is not removed.
**How to avoid:** Remove the `detonateLandMines()` call from combat.ts line 2502. All detonation should happen in the move action before combat is queued.

## Code Examples

### Existing: detonateLandMines (ai-combat-helpers.ts:143-198)
```typescript
// Source: src/rules/ai-combat-helpers.ts
export function detonateLandMines(
  game: MERCGame,
  sector: Sector,
  attackingPlayer: { name: string }
): { detonated: number; damageDealt: number } {
  // Check if sector has dictator forces (mine must be "planted" by dictator)
  if (sector.dictatorMilitia === 0 && !game.dictatorPlayer.hiredMercs.some(...)) {
    return { detonated: 0, damageDealt: 0 };
  }

  const stash = sector.getStashContents();
  const landMines = stash.filter(e => isLandMine(e.equipmentId));
  if (landMines.length === 0) return { detonated: 0, damageDealt: 0 };

  // Detonate first mine (rules say singular)
  const mine = landMines[0];
  const idx = stash.indexOf(mine);
  sector.takeFromStash(idx);

  // Deal 1 damage to every rebel unit
  for (const rebel of game.rebelPlayers) {
    const mercsInSector = game.getMercsInSector(sector, rebel);
    for (const merc of mercsInSector) {
      merc.takeDamage(1);
      game.message(`Land mine deals 1 damage to ${merc.combatantName}`);
    }
  }

  // Damage rebel militia (kills 1 per rebel player)
  for (const rebel of game.rebelPlayers) {
    const militia = sector.getRebelMilitia(`${rebel.seat}`);
    if (militia > 0) {
      sector.removeRebelMilitia(`${rebel.seat}`, 1);
    }
  }

  // Discard the mine
  const discard = game.getEquipmentDiscard('Accessory');
  if (discard) mine.putInto(discard);

  return { detonated: 1, damageDealt };
}
```

### Existing: Move action combat trigger (rebel-movement.ts:257-288)
```typescript
// Source: src/rules/actions/rebel-movement.ts
// Per rules: "Combat triggers when: A squad moves into an enemy-occupied sector"
if (isRebel) {
  const player = asRebelPlayer(ctx.player);
  if (hasEnemies(game, destination, player)) {
    game.message(`Enemies detected at ${destination.sectorName} - combat begins!`);
    game.pendingCombat = {
      sectorId: destination.sectorId,
      playerId: `${player.seat}`,
    };
  }
} else {
  // Dictator moving into rebel territory
  for (const rebel of game.rebelPlayers) {
    // ... check for rebel squads/militia
    if (hasSquad || hasMilitia) {
      queuePendingCombat(game, destination, rebel, false);
      return { ... };
    }
  }
}
```

### Existing: Squidhead ability check (merc-abilities.ts:878-881)
```typescript
// Source: src/rules/merc-abilities.ts
export function handlesLandMines(combatantId: string): boolean {
  const ability = MERC_ABILITIES[combatantId];
  return ability?.passive?.handlesLandMines ?? false;
}
```

### Existing: Stash operations (elements.ts)
```typescript
// Source: src/rules/elements.ts
sector.getStashContents()          // Returns Equipment[]
sector.takeFromStash(index)        // Returns Equipment | undefined
sector.addToStash(equipment)       // Returns boolean
```

### Existing: Damage pattern (elements.ts:809-813)
```typescript
// Source: src/rules/elements.ts
takeDamage(amount: number): number {
  const actualDamage = amount;
  this.damage = Math.min(this.damage + actualDamage, this.maxHealth);
  return actualDamage;
}
```

### Proposed: New checkLandMines function signature
```typescript
// New function to create in landmine.ts (or ai-combat-helpers.ts)
interface LandmineResult {
  detonated: boolean;
  disarmed: boolean;
  disarmedBy?: string;  // combatantName of Squidhead
  damageDealt: number;
  casualties: string[]; // names of killed units
}

export function checkLandMines(
  game: MERCGame,
  sector: Sector,
  enteringPlayerIsRebel: boolean,
  enteringSquad: Squad,
): LandmineResult
```

### Proposed: Animation pattern
```typescript
// Pre-compute damage targets
const targets = getEnemyCombatantsInSector(game, sector, enteringPlayerIsRebel);
const mineFound = sector.getStashContents().find(e => isLandMine(e.equipmentId));

// Check Squidhead
const squidhead = enteringSquad.getLivingMercs().find(m => handlesLandMines(m.combatantId));
if (squidhead) {
  // Disarm path
  game.animate('landmine-disarm', {
    sectorId: sector.sectorId,
    disarmedBy: squidhead.combatantName,
  }, () => {
    // Remove mine from stash
    const idx = sector.getStashContents().indexOf(mineFound);
    sector.takeFromStash(idx);
    // Squidhead gets it or it stays in stash
  });
} else {
  // Detonate path
  game.animate('landmine-detonate', {
    sectorId: sector.sectorId,
    targetNames: targets.map(t => t.combatantName),
  }, () => {
    // Apply damage to all enemies
    for (const target of targets) {
      target.takeDamage(1);
    }
    // Remove mine and discard
    const idx = sector.getStashContents().indexOf(mineFound);
    const mine = sector.takeFromStash(idx);
    if (mine) {
      const discard = game.getEquipmentDiscard('Accessory');
      if (discard) mine.putInto(discard);
    }
  });
}
```

## Critical Analysis: Movement Entry Points

All places where a squad enters a new sector (landmine check needed at each):

| Entry Point | File | Line | Who Moves | Notes |
|-------------|------|------|-----------|-------|
| `move` action | rebel-movement.ts | 242 | Rebel or Dictator squad | Main movement action, works for both |
| `coordinatedAttack` action | rebel-movement.ts | 369-370 | Both rebel squads | Rebel only, both squads move |
| `executeCoordinatedAttack` action | rebel-movement.ts | 615 | Multi-player rebel squads | Multiple squads from different players |
| `executeCombat()` AI detonation | combat.ts | 2502 | N/A (already at sector) | Existing AI-only hook, should be REMOVED |

**Not movement (don't need landmine check):**
- `reinforceMilitia` (dictator-actions.ts) -- places militia at dictator-controlled sector, not entering enemy sector
- `placeMilitia` (dictator-actions.ts) -- places militia from tactics card
- `assignToSquad` -- reshuffles within same sector or creates squad at same location
- Tactics card effects (Fodder, etc.) -- place militia but at dictator-controlled sectors

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Detonation inside `executeCombat()` | Detonation on sector entry (move action) | Mines fire before combat is queued; killed units don't appear in combat |
| AI-only detonation | Bidirectional (rebel mines fire against dictator too) | Squidhead's arm ability becomes useful for rebels |
| No Squidhead prevention | Squidhead auto-disarms on entry | Squidhead's card text is implemented |

## Open Questions

1. **Does the mine damage militia proportionally or 1 per player?**
   - What we know: The existing `detonateLandMines()` kills 1 militia per rebel player, not 1 per militia unit. The card text says "1 damage to every target."
   - What's unclear: Should militia count as one group target (kill 1) or should ALL militia die?
   - Recommendation: Stick with existing behavior (1 per player faction). The card says "every target" but militia are a group, and the existing implementation treats them as one target per faction.

2. **When Squidhead auto-disarms, where does the mine go?**
   - What we know: Squidhead's ability says "Disarms enemy land mines when he enters a sector. May re-arm them for himself." The existing `squidheadDisarm` action tries to equip the mine on Squidhead, and if that fails, leaves it in stash.
   - What's unclear: On auto-disarm during movement, should the mine go to Squidhead, to stash, or to discard?
   - Recommendation: Auto-disarm should try to equip on Squidhead (same as the manual action). If Squidhead can't equip it, leave it in stash (defused, not discarded). This matches the card text "may re-arm them for himself."

3. **Should the existing `detonateLandMines()` call in combat.ts:2502 be removed entirely or kept as a fallback?**
   - What we know: If we add detonation at the move action level, the mine will already be gone from stash before `executeCombat()` runs. The combat.ts call would be a no-op.
   - Recommendation: Remove it. Leaving it creates confusion and a potential double-detonation bug if someone adds mines to stash between movement and combat resolution.

4. **What animation event names to use?**
   - What we know: The codebase uses descriptive strings like `'combat-roll'`, `'combat-damage'`, `'mortar-strike'`, `'combat-panel'`.
   - Recommendation: Use `'landmine-detonate'` and `'landmine-disarm'`. The UI layer can listen for these to show appropriate effects. Initially, these will be pure UI signals (the UI may not have panels for them yet, which is fine -- the game.message() calls provide text feedback).

## Sources

### Primary (HIGH confidence)
- `src/rules/ai-combat-helpers.ts:143-198` -- Existing `detonateLandMines()` implementation
- `src/rules/actions/rebel-movement.ts:113-292` -- Move action with combat trigger
- `src/rules/actions/rebel-movement.ts:299-386` -- Coordinated attack action
- `src/rules/actions/rebel-movement.ts:566-639` -- Execute coordinated attack action
- `src/rules/combat.ts:2500-2502` -- AI mine detonation call site in executeCombat
- `src/rules/equipment-effects.ts:255-260` -- Land mine equipment effect definition
- `src/rules/merc-abilities.ts:565-568` -- Squidhead ability definition
- `src/rules/merc-abilities.ts:876-881` -- `handlesLandMines()` function
- `data/equipment.json:368-376` -- Land mine data (id: "land-mine", type: "Accessory")
- `data/combatants.json:391-401` -- Squidhead data with ability text
- `data/rules/13-clarifications-and-edge-cases.md:84-94` -- Land mine timing rules
- `data/rules/10-dictator-ai.md:92-97` -- AI mine detonation rules
- `src/rules/actions/rebel-equipment.ts:758-891` -- Squidhead disarm/arm actions

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md:19-24` -- MINE-01 through MINE-04 requirements

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All tools already exist in codebase, no new dependencies
- Architecture: HIGH -- Clear insertion points identified, existing patterns to follow
- Pitfalls: HIGH -- Examined actual code paths, identified concrete line numbers
- Squidhead counter: MEDIUM -- Card text interpretation for auto-disarm behavior during movement (vs. manual action) needs confirmation

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (stable codebase, no expected upstream changes)
