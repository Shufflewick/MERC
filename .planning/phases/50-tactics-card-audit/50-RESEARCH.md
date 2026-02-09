# Phase 50: Tactics Card Audit - Research

**Researched:** 2026-02-08
**Domain:** Dictator tactics card implementations, animations, game rules compliance
**Confidence:** HIGH

## Summary

This phase audits all 14 dictator tactics cards for rules compliance and adds visible animations when each card is played. The codebase has a complete implementation framework in `src/rules/tactics-effects.ts` with all 14 cards handled, a `playTactics` action in `src/rules/actions/dictator-actions.ts`, and a `DictatorPanel.vue` for card selection UI. However, several cards have **incorrect or incomplete implementations** compared to the authoritative rules in the CSV files, and **zero tactics cards have any animation** -- `game.animate()` is never called from any tactics effect.

The three cards called out in the requirements (Generalissimo, Better Weapons, Lockdown) each have significant implementation gaps. Additionally, Block Trade is missing militia placement per the expansion CSV. The animation system is well-established (mortar strike, combat, landmines all use `game.animate()`) and the pattern is clear and well-documented in MEMORY.md.

**Primary recommendation:** Fix the three broken card implementations first (Generalissimo, Lockdown, Block Trade), then add `game.animate()` calls to each of the 14 effect functions in `tactics-effects.ts`, with corresponding handlers in `GameTable.vue`.

## Card-by-Card Audit

### Complete audit of all 14 tactics cards against authoritative rules (CSV files)

| Card | Authoritative Rule (CSV) | Current Implementation | Status |
|------|-------------------------|----------------------|--------|
| **Artillery Barrage** | Attack sectors adjacent to controlled sectors. Max sectors = rebel count. Roll d6 per sector for hits. Rebels allocate damage to MERCs or militia. | Correctly implemented with `pendingArtilleryAllocation` flow. Rebel allocation via `artilleryAllocateHits` action. | CORRECT (logic) / MISSING animation |
| **Better Weapons** | Reveal base. Militia hit on 3+. | Sets `betterWeaponsActive = true`. Combat uses this flag at line 254 of combat.ts. `countHitsForCombatant()` correctly gives 3+ threshold. | CORRECT (logic) / MISSING animation |
| **Family Threat** | Each rebel sector loses 2 militia. | Correctly iterates all sectors, removes 2 militia per rebel player. | CORRECT (logic) / MISSING animation |
| **Fodder** | Find sectors with most rebel militia per player. Send half (round up) dictator militia there. Resolve combat immediately. | Correctly finds max militia sectors, sends half, queues pending combat. | CORRECT (logic) / MISSING animation |
| **Generalissimo** | Reveal base. Draw 6 MERCs, pick 1 to add to either squad. | **WRONG**: Currently sets `generalisimoActive = true` which gives +1 combat to all base defenders. Does NOT draw MERCs or let player pick one. The "+1 combat at base" is a fabricated effect. | BROKEN -- needs complete rewrite |
| **Lockdown** | Reveal base. Get 5 extra militia PER REBEL. Place them on base or adjacent sectors. | **WRONG**: Currently sets `lockdownActive = true` which gives +1 armor to base defenders. Does NOT place any militia. The "+1 armor at base" is a fabricated effect. | BROKEN -- needs complete rewrite |
| **Reinforcements** | Add rebel-count militia to every controlled industry. | Correctly adds militia to industries with dictator militia. Triggers combat if rebels present. | CORRECT (logic) / MISSING animation |
| **Seizure** | X = rebel count. Flip X wilderness sectors to explored. Add X-1 militia to each flipped sector. | Correctly implemented. | CORRECT (logic) / MISSING animation |
| **Sentry** | Half rebel count (round up) militia to every uncontrolled sector. | Correctly implemented. | CORRECT (logic) / MISSING animation |
| **Veteran Militia** | Reveal base. Militia get +1 initiative. | Sets `veteranMilitiaActive = true`. Combat correctly uses this at line 694 of combat.ts. | CORRECT (logic) / MISSING animation |
| **Block Trade** (expansion) | Flip all cities to explored. Add half rebel count (round up) militia to each city. | **PARTIALLY WRONG**: Flips cities but does NOT add militia. Missing the militia placement half. | INCOMPLETE -- needs militia placement |
| **Conscripts** (expansion) | Half rebel count (round up) militia to each controlled sector at end of each turn. | Correctly sets flag. `applyConscriptsEffect()` called in flow.ts. | CORRECT (logic) / MISSING animation |
| **Oil Reserves** (expansion) | Controller of oil industry gets 1 free move action. | Correctly sets flag. `applyOilReservesEffect()` called at turn start. | CORRECT (logic) / no animation needed (passive) |
| **Tainted Water** (expansion) | Half rebel count (round up) militia removed from each sector. 1 damage to each rebel MERC regardless of armor. | Correctly removes militia and damages MERCs. | CORRECT (logic) / MISSING animation |

### Summary of Issues

| Severity | Card | Issue |
|----------|------|-------|
| **CRITICAL** | Generalissimo | Completely wrong implementation. Should draw 6 MERCs, let dictator pick 1. Currently gives fabricated +1 combat bonus at base. |
| **CRITICAL** | Lockdown | Completely wrong implementation. Should place 5*rebelCount militia on base/adjacent. Currently gives fabricated +1 armor bonus at base. |
| **MEDIUM** | Block Trade | Missing militia placement on flipped cities. |
| **LOW** | All 14 cards | No animations for any tactics card. |

## Architecture Patterns

### Animation Pattern (from MEMORY.md and codebase)

The animation system uses BoardSmith's `game.animate(type, data, callback)`:

```typescript
// Pattern 1: Animation WITH state mutations (mutations captured for theatre view)
game.animate('tactic-family-threat', {
  sectorsAffected: affectedSectorIds,
  totalMilitiaRemoved: count,
}, () => {
  // State mutations happen here - captured for theatre view
  for (const sector of sectors) {
    sector.removeRebelMilitia(playerId, 2);
  }
});

// Pattern 2: Pure UI signal (no state mutations)
game.animate('tactic-played', {
  cardName: card.tacticsName,
  cardId: card.tacticsId,
}, () => {});
```

**Key rules from MEMORY.md:**
- Callback runs synchronously; mutations inside are captured for theatre view
- Theatre view = frozen pre-animation state shown to UI by default
- For event data that depends on mutation results (e.g. damage amount), pre-compute values BEFORE `game.animate()` call
- Pure UI signals (no state mutations) use empty callback: `game.animate('type', data, () => {})`

### Animation Event Handler Pattern (from GameTable.vue)

```typescript
// In GameTable.vue setup
if (animationEvents) {
  animationEvents.registerHandler('mortar-strike', async (event) => {
    const data = event.data as { targetSectorId: string; /* ... */ };
    activeMortarStrike.value = data;
    await new Promise<void>((resolve) => {
      mortarStrikeResolve = resolve;
    });
  });
}
```

### Tactics Effect Function Pattern

Each effect in `tactics-effects.ts` follows this structure:
```typescript
function effectName(game: MERCGame): TacticsEffectResult {
  // 1. Compute what will happen
  // 2. game.animate() with data and mutations in callback
  // 3. Return result
  return { success: true, message: '...', data: { ... } };
}
```

### Generalissimo Fix Pattern (draw 6, pick 1)

This requires a multi-step action similar to Castro's bonus hire (`createCastroBonusHireAction`). The pattern is:

1. `executeTacticsEffect` sets a pending state on the game (e.g., `game.pendingGeneralissimoHire`)
2. A new action step in flow.ts yields to the player for MERC selection
3. A new action `generalissimoPick` handles the selection
4. This follows the existing `castroBonusHire` pattern exactly

The `castroBonusHire` action at lines 345-523 of `dictator-actions.ts` is the template:
- Uses `chooseFrom<string>('selectedMerc', ...)` to draw and display MERCs
- Uses `chooseFrom<string>('targetSector', ...)` for placement
- Uses `chooseFrom<string>('equipmentType', ...)` for starting equipment

### Lockdown Fix Pattern (place militia)

Lockdown needs to become an interactive placement action, similar to Kim's militia placement. The total militia is `5 * rebelCount`. The dictator must place them on base or adjacent sectors, respecting the 10-per-sector cap.

Options:
1. **Auto-place for AI, interactive for human**: Set `game.pendingLockdownMilitia` with the count, add flow step for human placement
2. **Simple auto-distribute**: Spread evenly across base + adjacent sectors (simpler, but less strategic for human players)

Since Lockdown reveals the base (base location is chosen during card play), the adjacent sectors are knowable at execution time.

### Recommended Project Structure for Changes

```
src/rules/tactics-effects.ts     # Fix Generalissimo, Lockdown, Block Trade logic + add animations
src/rules/actions/dictator-actions.ts  # Add generalissimoPickMerc, lockdownPlaceMilitia actions
src/rules/flow.ts                # Add action steps after playTactics for Generalissimo/Lockdown
src/rules/game.ts                # Add pendingGeneralissimoHire, pendingLockdownMilitia state
src/ui/components/GameTable.vue  # Register animation handlers for tactics events
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MERC drawing/selection | Custom draw logic | Follow `castroBonusHire` pattern in dictator-actions.ts | Already handles draw-N-pick-1 with squad placement and equipment |
| Militia placement UI | New placement component | Follow `kimBonusMilitia` pattern with sector selection | Already handles "pick a sector, place militia" with combat triggering |
| Animation event system | Custom event bus | `game.animate()` + `useAnimationEvents()` in Vue | BoardSmith's built-in theatre view system handles everything |
| Sector-based explosions | Custom animation | Follow `MortarStrikeAnimation.vue` pattern | Already has explosion flash + falling militia shield animations |

## Common Pitfalls

### Pitfall 1: Theatre View Mutations
**What goes wrong:** Placing mutations outside `game.animate()` callback means theatre view shows the post-mutation state during animation
**Why it happens:** Developer puts state changes directly in the effect function instead of inside the animate callback
**How to avoid:** All state mutations that should be visible AFTER the animation must go inside `game.animate()`'s callback
**Warning signs:** UI shows final state immediately instead of showing animation first

### Pitfall 2: Generalissimo Flow Blocking
**What goes wrong:** Generalissimo needs player interaction (pick a MERC) but `executeTacticsEffect` returns synchronously
**Why it happens:** The effect function can't pause for user input
**How to avoid:** Set pending state, return from effect, add flow step for interaction. Same pattern as artillery barrage (`pendingArtilleryAllocation` + flow loop)
**Warning signs:** Effect tries to do everything in one function call

### Pitfall 3: Lockdown Adjacent Calculation Timing
**What goes wrong:** Lockdown needs to place militia on base-adjacent sectors, but base may have just been revealed in the same action
**Why it happens:** `revealBase()` is called inside `lockdown()`, so base location is set during the same execution
**How to avoid:** Call `revealBase()` first, THEN compute adjacent sectors using `game.getAdjacentSectors()` on the base sector
**Warning signs:** Base sector is undefined when trying to get adjacent sectors

### Pitfall 4: Generalissimo State Flags
**What goes wrong:** Removing `generalisimoActive` and `lockdownActive` breaks existing combat tests
**Why it happens:** `combat-execution.test.ts` tests these flags at lines 691-758
**How to avoid:** Either keep the flags with corrected purposes, or update the tests. The flags ARE used in `applyBaseDefenseBonuses()` at combat.ts line 836-878.
**Warning signs:** Test failures in combat-execution.test.ts after removing flags

**Decision required:** The current `generalisimoActive` (+1 combat at base) and `lockdownActive` (+1 armor at base) effects are fabricated -- they don't match the CSV rules. The question is whether to keep these as ADDITIONAL bonus effects or remove them entirely. The CSV descriptions say nothing about combat/armor bonuses. The planner should make this call.

### Pitfall 5: Missing Flow Steps After Tactics
**What goes wrong:** Generalissimo and Lockdown need interactive steps AFTER the tactics card is played, but flow only has `artilleryAllocateHits` loop after playTactics
**Why it happens:** Currently only Artillery Barrage has a post-play interaction
**How to avoid:** Add new loop steps in flow.ts after the existing artillery allocation loop
**Warning signs:** Card plays but no interaction prompt appears

## Code Examples

### Adding Animation to a Simple Tactics Effect (Family Threat)

```typescript
// Source: Current pattern from landmine.ts:98 and rebel-equipment.ts:1558
function familyThreat(game: MERCGame): TacticsEffectResult {
  // Pre-compute what will happen
  const affectedSectors: Array<{ sectorId: string; sectorName: string; removed: number }> = [];

  for (const sector of game.gameMap.getAllSectors()) {
    for (const rebel of game.rebelPlayers) {
      const available = sector.getRebelMilitia(`${rebel.seat}`);
      const toRemove = Math.min(2, available);
      if (toRemove > 0) {
        affectedSectors.push({
          sectorId: sector.sectorId,
          sectorName: sector.sectorName,
          removed: toRemove,
        });
      }
    }
  }

  let totalRemoved = 0;

  game.animate('tactic-family-threat', {
    affectedSectors,
  }, () => {
    // Mutations inside callback -- captured for theatre view
    for (const sector of game.gameMap.getAllSectors()) {
      for (const rebel of game.rebelPlayers) {
        const removed = sector.removeRebelMilitia(`${rebel.seat}`, 2);
        if (removed > 0) {
          totalRemoved += removed;
          game.message(`${removed} militia fled from ${sector.sectorName}`);
        }
      }
    }
  });

  return {
    success: true,
    message: `Family threat: ${totalRemoved} militia fled`,
    data: { militiaRemoved: totalRemoved },
  };
}
```

### Adding a Flow Step for Generalissimo MERC Selection

```typescript
// Source: Pattern from artillery-allocation loop in flow.ts:569
// Add after the existing artillery-allocation loop in the dictator turn sequence

loop({
  name: 'generalissimo-merc-selection',
  while: () => game.pendingGeneralissimoHire != null && !game.isFinished(),
  maxIterations: 5,
  do: actionStep({
    name: 'generalissimo-pick-merc',
    actions: ['generalissimoPick'],
    prompt: 'Generalissimo: Choose a MERC to hire',
    skipIf: () => game.isFinished() || game.pendingGeneralissimoHire == null,
  }),
}),
```

### Registering Animation Handler in GameTable.vue

```typescript
// Source: Pattern from mortar-strike handler in GameTable.vue:526
animationEvents.registerHandler('tactic-family-threat', async (event) => {
  const data = event.data as {
    affectedSectors: Array<{ sectorId: string; sectorName: string; removed: number }>;
  };
  activeTacticAnimation.value = { type: 'family-threat', data };
  await new Promise<void>((resolve) => {
    tacticAnimationResolve = resolve;
  });
});
```

## State of the Art

| Current Implementation | Correct Implementation | Impact |
|------------------------|----------------------|--------|
| Generalissimo: +1 combat at base | Draw 6 MERCs, pick 1, add to squad | Complete rewrite of effect + new action/flow step |
| Lockdown: +1 armor at base | Place 5*rebelCount militia on base/adjacent | Complete rewrite of effect + new action/flow step |
| Block Trade: flip cities only | Flip cities + add militia to each | Add militia placement to existing effect |
| No animations on any card | Each card plays visible animation | Add `game.animate()` calls to all 14 effects |
| `generalisimoActive` flag | May need removal or repurposing | Tests depend on this flag |
| `lockdownActive` flag | May need removal or repurposing | Tests depend on this flag |

## Existing Test Coverage

| Test File | What It Tests | Relevance |
|-----------|--------------|-----------|
| `combat-execution.test.ts:691-758` | `generalisimoActive` and `lockdownActive` flags in combat | Will break if flags are removed |
| `action-conditions.test.ts:1284-1370` | `playTactics` and `reinforce` action conditions | Should still pass after changes |
| `smoke.test.ts:210-280` | Tactics deck initialization | Should still pass |
| `error-conditions.test.ts:205-227` | `asTacticsCard` type guard | Should still pass |

**No test files exist for individual tactics card effects.** The effects in `tactics-effects.ts` are untested.

## Inventory of Files to Modify

| File | Changes Needed |
|------|---------------|
| `src/rules/tactics-effects.ts` | Fix Generalissimo, Lockdown, Block Trade. Add `game.animate()` to all 14 effects. |
| `src/rules/actions/dictator-actions.ts` | Add `generalissimoPick` action (draw 6, pick 1). Add `lockdownPlaceMilitia` action. |
| `src/rules/flow.ts` | Add flow steps after playTactics for Generalissimo and Lockdown interaction. |
| `src/rules/game.ts` | Add `pendingGeneralissimoHire` and `pendingLockdownMilitia` state. Remove or repurpose `generalisimoActive`/`lockdownActive`. |
| `src/ui/components/GameTable.vue` | Register animation handlers for all tactics animation events. |
| `src/rules/combat.ts` | Update `applyBaseDefenseBonuses` if removing Generalissimo/Lockdown flags. |
| `tests/combat-execution.test.ts` | Update tests if Generalissimo/Lockdown flags change. |
| New test file | Add tactics effects tests. |

## Open Questions

1. **Should Generalissimo/Lockdown keep their current bonus effects IN ADDITION to the correct effects?**
   - The CSV rules say nothing about +1 combat or +1 armor
   - These are fabricated bonuses not in any rules document
   - But tests exist for them and they're already integrated into combat
   - Recommendation: Remove them -- they're not in the rules, and keeping fabricated effects alongside correct ones is confusing

2. **Should Lockdown militia placement be interactive for human players?**
   - Kim's militia ability is interactive (player picks sector)
   - But Lockdown places 5*rebelCount militia which could be many placements
   - Could auto-distribute evenly or let player pick sector-by-sector
   - Recommendation: Loop like `dictatorPlaceExtraMilitia` -- player picks sector and quantity each iteration

3. **What animation style should each card use?**
   - Some cards affect single sectors (Artillery Barrage) -- use sector-targeted animation
   - Some affect all sectors (Family Threat, Sentry) -- use map-wide animation
   - Some have no visible board effect (Better Weapons) -- use card reveal/banner animation
   - Recommendation: Group animations by type, create 3-4 reusable animation components

4. **Should Oil Reserves get an animation?**
   - It's a passive effect that triggers at turn start, not during card play
   - The card play itself just sets a flag
   - Recommendation: Animate the card play with a banner, but not the per-turn effect

## Sources

### Primary (HIGH confidence)
- `data/dictator tactics.csv` -- Authoritative rules for base game tactics cards
- `data/expansion dictator tactics.csv` -- Authoritative rules for expansion tactics cards
- `data/dictator-tactics.json` -- Card data used by game engine
- `src/rules/tactics-effects.ts` -- All 14 card effect implementations (read in full)
- `src/rules/actions/dictator-actions.ts` -- playTactics, reinforce, castroBonusHire, kimBonusMilitia actions (read in full)
- `src/rules/flow.ts` -- Complete game flow including dictator turn and post-tactics loops (read in full)
- `src/rules/game.ts` -- Game state including tactics flags and pending state types (read relevant sections)
- `src/rules/combat.ts` -- `betterWeaponsActive`, `veteranMilitiaActive`, `generalisimoActive`, `lockdownActive` usage (read relevant sections)
- `src/ui/components/GameTable.vue` -- Animation handler registration pattern (read relevant sections)
- `src/ui/components/DictatorPanel.vue` -- Tactics card selection UI (read in full)
- `src/ui/components/MortarStrikeAnimation.vue` -- Reference animation component (read in full)
- `src/ui/components/MortarAttackPanel.vue` -- Reference allocation panel (read in full)
- `tests/combat-execution.test.ts` -- Generalissimo/Lockdown flag tests (read relevant sections)

### Secondary (MEDIUM confidence)
- MEMORY.md -- Animation system patterns (from previous implementation work)
- `.planning/REQUIREMENTS.md` -- TACT-01 through TACT-08 requirement definitions

## Metadata

**Confidence breakdown:**
- Card audit results: HIGH -- Compared CSV rules directly against implementation code
- Animation patterns: HIGH -- Multiple examples in codebase, documented in MEMORY.md
- Fix approaches: HIGH -- Based on existing patterns (castroBonusHire, kimBonusMilitia, mortarAttack)
- Test impact: HIGH -- Read test files directly

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (stable codebase, no external dependencies)
