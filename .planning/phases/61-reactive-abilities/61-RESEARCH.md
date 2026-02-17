# Phase 61: Reactive Abilities - Research

**Researched:** 2026-02-17
**Domain:** Dictator reactive abilities (Gaddafi equipment loot, Pinochet sector-loss hire + damage spread)
**Confidence:** HIGH

## Summary

This phase implements three distinct reactive abilities for two dictators: Gaddafi's equipment loot on MERC kill (REACT-02), Pinochet's free hire when losing sector control (REACT-03), and Pinochet's per-turn damage distribution (TURN-06). Each requires a different integration pattern.

Gaddafi's equipment loot is a **combat-time reactive** that intercepts the normal equipment discard flow when a dictator-side combatant kills a rebel MERC. The current code discards equipment in two places: inline during combat rounds (lines ~2682-2692 of combat.ts) and in the fallback `applyCombatResults` function (lines ~2936-2944). Both paths follow the same pattern: unequip from all three slots, put into discard pile. For Gaddafi, instead of discarding, the equipment should be offered to dictator MERCs in the same sector.

Pinochet's sector-loss hire is an **event-reactive** that must detect when the dictator loses control of a sector during rebel turns. There is no existing event system for sector control changes - control is computed dynamically from unit counts via `getControlledSectors()`. This means we need to snapshot controlled sectors before rebel actions and compare after to detect losses.

Pinochet's damage spread is a straightforward **per-turn ability** that follows the existing `applyDictatorTurnAbilities` pattern.

**Primary recommendation:** Implement Pinochet per-turn damage first (simplest, follows existing pattern), then Pinochet sector-loss hire (needs snapshot mechanism), then Gaddafi equipment loot (most complex, modifies combat internals).

## Standard Stack

No new libraries needed. All implementations use existing codebase patterns.

### Core Files to Modify
| File | Purpose | Changes Needed |
|------|---------|----------------|
| `src/rules/combat.ts` | Equipment discard on MERC death | Add Gaddafi loot hook at discard points |
| `src/rules/dictator-abilities.ts` | Per-turn ability implementations | Add Pinochet damage spread, Pinochet case in switch |
| `src/rules/flow.ts` | Game flow steps | Add Pinochet hire step, sector snapshot, equipment loot step |
| `src/rules/actions/dictator-actions.ts` | Human player actions | Add Pinochet hire action, Gaddafi equipment assignment action |
| `src/rules/actions/index.ts` | Action registration | Register new actions |
| `src/rules/game.ts` | Game state | Add Pinochet/Gaddafi state fields |

## Architecture Patterns

### Pattern 1: Per-Turn Ability (Pinochet Damage Spread - TURN-06)
**What:** Count rebel-controlled sectors, distribute that much damage across all rebel forces.
**Where it fits:** In `applyDictatorTurnAbilities()` switch statement in `dictator-abilities.ts`, with a new `applyPinochetTurnAbility()` function.
**Existing pattern to follow:** `applyMaoTurnAbility` or `applyMussoliniTurnAbility` - both count sectors and do something based on the count.

```typescript
// Pattern from existing code (dictator-abilities.ts line 1120+)
export function applyDictatorTurnAbilities(game: MERCGame): void {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator) return;
  switch (dictator.combatantId) {
    // ... existing cases ...
    case 'pinochet':
      applyPinochetTurnAbility(game);  // NEW
      break;
  }
}
```

**For human dictator:** Pinochet's damage spread has no choices (damage is distributed "as evenly as possible"), so it should auto-apply for both AI and human. No action step needed - just call in the `execute()` block before the action step (same as AI path). The only question is whether there's a UI feedback need (animation).

**Flow location:** The per-turn ability execute block at line ~978 of flow.ts. Since damage spread has no player choice, it should run in this execute block for BOTH AI and human players (unlike abilities that need an actionStep for human choice).

### Pattern 2: Sector-Loss Reactive (Pinochet Hire - REACT-03)
**What:** When Pinochet loses control of a sector, queue a free MERC hire for start of next turn.
**Key challenge:** There is NO event system for sector control changes. Control is computed dynamically.

**Approach:** Snapshot dictator-controlled sectors at the start of each rebel turn, compare after rebel actions complete. If any sector was lost, queue the hire.

```typescript
// Game state additions needed:
_pinochetControlledSnapshot: Set<string> | null = null;  // sector IDs before rebel turn
_pinochetPendingHires: number = 0;  // queued hires from sector losses
```

**Snapshot timing in flow.ts:**
1. Before rebel action loop: snapshot `getControlledSectors(dictatorPlayer)` sector IDs
2. After rebel action loop (or after each rebel's turn): compare current controlled sectors
3. Count lost sectors, add to `_pinochetPendingHires`
4. At start of dictator turn: process pending hires (place MERCs)

**Critical detail from CSV:** "place them at the start of your turn" - hires are queued during rebel turns but placed at dictator turn start.

**Flow integration point:** The dictator turn already has ability steps. Add a Pinochet hire step BEFORE the per-turn ability step (line ~976). The per-turn damage spread runs in the existing ability step.

**Pol Pot pattern reference:** Pol Pot's combat-loss hire (flow.ts lines 1092-1154) is the closest existing pattern - it detects an outcome, queues a state flag, then has both an AI auto-execute path and a human actionStep.

### Pattern 3: Combat-Time Equipment Loot (Gaddafi - REACT-02)
**What:** When dictator forces kill a rebel MERC, offer equipment to dictator MERCs in the sector instead of discarding.
**Key challenge:** Equipment is discarded inline during combat resolution, at multiple code locations. Must intercept without breaking combat flow.

**Equipment discard locations in combat.ts (verified):**
1. **Line ~937-947:** Militia kills MERC - `applyMilitiaBatchDamage()` inline discard
2. **Line ~2682-2692:** Individual attacker kills MERC - inline discard after epinephrine check
3. **Line ~2936-2944:** `applyCombatResults()` fallback discard

**Approach:** Instead of intercepting at every discard point (fragile, high risk), collect killed MERC equipment into a staging area and offer it AFTER combat completes.

```typescript
// Game state:
_gaddafiPendingLoot: Array<{
  equipmentId: number;
  equipmentType: EquipmentType;
  sectorId: string;
}> | null = null;
```

**Two options for when to offer equipment:**

**Option A (Recommended): Post-combat flow step.**
After combat resolution but before clearing activeCombat, check if Gaddafi is the dictator and if rebel MERCs died. The equipment is ALREADY discarded at this point, so pull it from discard piles and offer to dictator MERCs in the sector. This avoids modifying combat internals.

Advantage: No changes to combat.ts death handling code. Equipment follows normal discard flow, then gets "reclaimed" from discard.
Disadvantage: Equipment briefly hits discard pile then gets pulled back.

**Option B: Intercept at discard points.**
Replace the discard logic with a Gaddafi check. If Gaddafi is dictator and the killer is dictator-side, stage equipment instead of discarding.

Advantage: Cleaner conceptually.
Disadvantage: Must modify 3 code locations in combat.ts, risk of missing a path.

**Recommendation: Option A.** After combat ends (in flow.ts, after combatResolutionFlow), check casualties. For each rebel MERC casualty, check if their equipment ended up in discard piles. Pull it out and offer to dictator MERCs. This is safer and follows the Pol Pot post-combat pattern.

**Human vs AI:**
- AI: Auto-equip using existing `equipNewHire`-style logic (find best recipient)
- Human: Action step to choose which dictator MERC gets which piece of equipment

**Equipment assignment choices for human players:** Use `chooseFrom` steps for each piece of looted equipment. Show available dictator MERCs in the sector and let player assign or discard.

### Anti-Patterns to Avoid
- **Modifying combat.ts death handling for Gaddafi:** Too many code paths handle MERC death. Post-combat reclaim from discard is safer.
- **Trying to detect sector control changes with an event system:** Overkill. Simple before/after snapshot is sufficient.
- **Putting Pinochet damage in an actionStep:** It has no player choices ("as evenly as possible"), so it should auto-execute.
- **Forgetting bandolier slots:** When looting equipment from dead MERCs, bandolier items are NOT auto-unequipped by the existing death code (only Weapon/Armor/Accessory slots). Verify this edge case.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Damage distribution | Custom even-split algorithm | `Math.floor(total / unitCount)` with remainder to first units | Simple math, edge cases in ordering |
| Equipment reclaim from discard | New staging system | Pull from existing discard piles by ID | Equipment already has putInto/moveTo |
| MERC hire flow | Custom hire logic | Follow `applyGadafiTurnAbility` pattern | Already handles squad selection, equipment, sector, animation |
| Sector control tracking | Event system | Before/after snapshot comparison | Much simpler, no framework changes |

## Common Pitfalls

### Pitfall 1: Equipment Slot Coverage
**What goes wrong:** Forgetting that MERCs can have equipment in bandolier slots (from the Bandolier accessory).
**Why it happens:** The standard death code only unequips Weapon/Armor/Accessory slots (3 iterations). Bandolier slots are separate.
**How to avoid:** Check the existing death code at line 2685 - it only iterates `['Weapon', 'Armor', 'Accessory']`. Bandolier items stay with the dead MERC (they go to mercDiscard with the MERC). For Gaddafi loot, only the 3 main equipment types matter (bandolier items are accessories in bandolier slots - they DO get unequipped if they're in the accessory slot, but bandolier slots are skipped).
**Warning signs:** Dead MERC still has bandolier items after death.

### Pitfall 2: Multiple Equipment Discard Paths
**What goes wrong:** Equipment is discarded in 3+ places in combat.ts. Missing one path means Gaddafi sometimes doesn't get loot.
**Why it happens:** Combat death handling was built up incrementally with inline handling, epinephrine saves, and a fallback in applyCombatResults.
**How to avoid:** Use the post-combat approach (Option A) - check discard piles after combat, don't try to intercept every inline discard.

### Pitfall 3: Pinochet Sector Snapshot Timing
**What goes wrong:** Snapshot taken at wrong time misses sector control changes from combat or militia training.
**Why it happens:** Rebel actions can trigger combat (which kills units, changing control) and train militia (also changing control).
**How to avoid:** Take snapshot BEFORE rebel action loop starts. Compare AFTER all rebel actions complete (including combat resolution). The flow structure already processes rebel turns sequentially.

### Pitfall 4: Pinochet Damage Distribution - Unit Ordering
**What goes wrong:** "As evenly as possible" requires clear rules for remainder distribution.
**Why it happens:** If 7 damage across 3 units, each gets 2 with 1 remainder. Who gets the extra?
**How to avoid:** Define ordering: MERCs first (alphabetical by name), then militia. Apply `floor(total/count)` to all, then distribute remainder 1 per unit from the top. All militia in a sector count as one "unit group" for damage application but damage removes militia 1:1 (1 damage = 1 militia removed).

### Pitfall 5: Pinochet Hire Queue Accumulation
**What goes wrong:** Multiple sector losses in one rebel turn should queue multiple hires.
**Why it happens:** If rebels take 3 sectors in one turn, Pinochet should get 3 hires.
**How to avoid:** Use a counter (`_pinochetPendingHires`) not a boolean flag. Increment for each lost sector.

### Pitfall 6: Dead MERCs and Militia for Damage Spread
**What goes wrong:** Applying damage to already-dead units or to militia counts that are zero.
**Why it happens:** Need to gather ALL rebel forces across ALL sectors.
**How to avoid:** Only target living MERCs (`!isDead`) and sectors with rebel militia > 0. Militia "damage" means removing militia from sectors (1 damage = 1 militia removed). MERC damage uses `takeDamage()`.

## Code Examples

### Pinochet Damage Spread (TURN-06)
```typescript
// In dictator-abilities.ts
export function applyPinochetTurnAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'pinochet') {
    return { success: false, message: 'Not Pinochet' };
  }

  // Count rebel-controlled sectors
  let rebelSectorCount = 0;
  for (const rebel of game.rebelPlayers) {
    rebelSectorCount += game.getControlledSectors(rebel).length;
  }
  if (rebelSectorCount === 0) {
    game.message('Pinochet: No rebel-controlled sectors, no damage to spread');
    return { success: true, message: 'No rebel sectors' };
  }

  // Gather all rebel forces: living MERCs + militia across all sectors
  const targets: Array<{ type: 'merc'; merc: CombatantModel } | { type: 'militia'; sector: Sector; playerId: string }> = [];

  for (const rebel of game.rebelPlayers) {
    // Living MERCs
    for (const merc of rebel.team) {
      if (!merc.isDead) {
        targets.push({ type: 'merc', merc });
      }
    }
    // Militia in each sector
    for (const sector of game.gameMap.getAllSectors()) {
      const militia = sector.getRebelMilitia(`${rebel.seat}`);
      for (let i = 0; i < militia; i++) {
        targets.push({ type: 'militia', sector, playerId: `${rebel.seat}` });
      }
    }
  }

  if (targets.length === 0) {
    game.message('Pinochet: No rebel forces to damage');
    return { success: true, message: 'No rebel forces' };
  }

  // Distribute damage as evenly as possible
  const totalDamage = rebelSectorCount;
  const perUnit = Math.floor(totalDamage / targets.length);
  const remainder = totalDamage % targets.length;

  let damageApplied = 0;
  for (let i = 0; i < targets.length && damageApplied < totalDamage; i++) {
    const dmg = perUnit + (i < remainder ? 1 : 0);
    if (dmg === 0) continue;

    const target = targets[i];
    if (target.type === 'merc') {
      target.merc.takeDamage(dmg);
      damageApplied += dmg;
      // Check for death - if MERC dies, handle equipment discard
    } else {
      target.sector.removeRebelMilitia(target.playerId, dmg);
      damageApplied += dmg;
    }
  }

  game.message(`Pinochet distributed ${damageApplied} damage across rebel forces`);
  return { success: true, message: `Dealt ${damageApplied} damage` };
}
```

### Pinochet Sector Snapshot Pattern
```typescript
// In flow.ts, before rebel action loop:
execute(() => {
  if (game.dictatorPlayer?.dictator?.combatantId !== 'pinochet') return;
  game._pinochetControlledSnapshot = new Set(
    game.getControlledSectors(game.dictatorPlayer).map(s => s.sectorId)
  );
}),

// After rebel action loop:
execute(() => {
  if (!game._pinochetControlledSnapshot) return;
  const currentControlled = new Set(
    game.getControlledSectors(game.dictatorPlayer).map(s => s.sectorId)
  );
  // Sectors that were controlled before but not now
  for (const sectorId of game._pinochetControlledSnapshot) {
    if (!currentControlled.has(sectorId)) {
      game._pinochetPendingHires = (game._pinochetPendingHires || 0) + 1;
      game.message(`Pinochet lost control of a sector - MERC hire queued`);
    }
  }
  game._pinochetControlledSnapshot = null;
}),
```

### Gaddafi Equipment Reclaim from Discard (Post-Combat)
```typescript
// After combatResolutionFlow in flow.ts:
execute(() => {
  if (game.dictatorPlayer?.dictator?.combatantId !== 'gadafi') return;
  if (!game.activeCombat) return;

  // Check rebel casualties for equipment
  const rebelCasualties = (game.activeCombat.rebelCasualties || []) as Combatant[];
  const sectorId = game.activeCombat.sectorId;
  const dictatorMercs = game.getDictatorMercsInSector(game.getSector(sectorId)!);

  if (dictatorMercs.length === 0) return;  // No dictator MERCs to equip

  // For each dead rebel MERC, check if equipment was recently discarded
  // Track which equipment pieces to offer
  const lootableEquipment: Equipment[] = [];
  for (const casualty of rebelCasualties) {
    if (!casualty.sourceElement?.isMerc) continue;
    // Equipment was already discarded to piles - find recently discarded pieces
    // (Need to track IDs or use a staging approach)
  }
});
```

**Note on Gaddafi implementation detail:** The exact mechanism for tracking which equipment came from killed MERCs needs careful design. Options:
1. Before combat, note which equipment each rebel MERC has. After combat, check casualties and pull matching equipment from discard piles.
2. Add a `_gaddafiLootableEquipment` staging field that combat code populates when discarding equipment (requires minor combat.ts change but very targeted).

Option 2 is cleaner despite requiring a small combat.ts change. Instead of modifying the discard logic, add a single hook: after the `equip.putInto(discardPile)` line, if Gaddafi is dictator and victim was rebel, also record the equipment ID.

## State of the Art

| Aspect | Current State | What Phase 61 Adds |
|--------|--------------|-------------------|
| Gaddafi | Per-turn hire only (Phase 57) | Equipment loot on MERC kill (REACT-02) |
| Pinochet | Label exists but NO implementation | Sector-loss hire (REACT-03) + damage spread (TURN-06) |
| Sector control detection | Computed on-demand, no change tracking | Snapshot-based before/after comparison |
| Equipment reclaim | Not a concept in codebase | New pattern for pulling from discard |

## Open Questions

1. **Gaddafi equipment staging vs reclaim:**
   - What we know: Equipment gets discarded during combat at 3+ code points.
   - What's unclear: Best mechanism to track which equipment came from killed rebel MERCs. Recording IDs during discard (tiny combat.ts touch) vs pulling from discard piles post-combat (no combat.ts changes but fragile if discard pile order changes).
   - Recommendation: Use a lightweight staging field populated at discard time. Only requires adding `if (game.dictatorPlayer?.dictator?.combatantId === 'gadafi') { game._gaddafiPendingLoot.push(equip.id); }` at the 3 discard points.

2. **Pinochet damage spread - MERC death handling:**
   - What we know: `takeDamage()` increments `damage` field, `isDead` is computed from `health <= 0`.
   - What's unclear: If a MERC dies from Pinochet's damage spread, should their equipment be discarded? Should Gaddafi get to loot it? This is damage-spread death, not combat death.
   - Recommendation: Yes, discard equipment on death. No, Gaddafi loot only applies to combat kills per the ability text ("when your forces kill a MERC"). Pinochet's spread is not a "kill" by forces.

3. **Pinochet sector snapshot - rebel turn boundaries:**
   - What we know: Flow has a rebel turn loop that processes each rebel player.
   - What's unclear: Should snapshot be taken once before ALL rebel turns, or before EACH rebel's turn? A sector lost to rebel 1 shouldn't trigger a hire if rebel 2 takes it back.
   - Recommendation: Snapshot once before all rebel turns, compare once after all rebel turns. This matches "lose control" semantics - if control is lost by the end of all rebel actions, it triggers.

4. **Pinochet hire queue - what if no MERCs in deck?**
   - Recommendation: Queue the hire, but if `game.drawMerc()` returns null at hire time, skip with a message. Follow the existing Gaddafi/Pol Pot pattern.

5. **Gaddafi loot - does dictator MERC need an open slot?**
   - The ability text says "freely equip their equipment on your MERCs in the sector."
   - Recommendation: Offer equipment only to MERCs with an open slot of the matching type. If no one has a matching open slot, equipment gets discarded normally. For human player: show available choices. For AI: auto-assign using best-fit logic.

## Sources

### Primary (HIGH confidence)
- `src/rules/combat.ts` lines 937-947, 2682-2692, 2936-2944 - Equipment discard on MERC death (3 code paths)
- `src/rules/combat.ts` lines 2841-2998 - `applyCombatResults()` function
- `src/rules/dictator-abilities.ts` lines 1120-1156 - `applyDictatorTurnAbilities()` switch
- `src/rules/flow.ts` lines 976-1054 - Per-turn ability flow steps
- `src/rules/flow.ts` lines 1092-1154 - Pol Pot combat-loss hire pattern
- `src/rules/game.ts` lines 1257-1290 - `getControlledSectors()` implementation
- `src/rules/elements.ts` lines 1214-1327 - Militia management on Sector
- `src/rules/elements.ts` lines 824-828 - `takeDamage()` on CombatantModel
- `src/rules/actions/dictator-actions.ts` lines 1174-1287 - Pol Pot bonus hire action (reactive pattern)
- `src/rules/actions/dictator-actions.ts` lines 1510-1630 - Gaddafi bonus hire action (human flow)
- `data/expansion dictators.csv` lines 2, 8 - Canonical ability text for Gaddafi and Pinochet

### Secondary (MEDIUM confidence)
- Pinochet damage distribution "as evenly as possible" interpretation: floor-divide with remainder to first N units. No official ruling found beyond the card text.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All existing codebase patterns, no new libraries
- Architecture: HIGH - Patterns clearly established by 10+ existing dictator abilities
- Pitfalls: HIGH - Directly identified from reading code paths and understanding equipment flow
- Pinochet damage semantics: MEDIUM - "as evenly as possible" needs interpretation for edge cases

**Research date:** 2026-02-17
**Valid until:** Stable - 90 days (internal codebase, no external dependencies)
