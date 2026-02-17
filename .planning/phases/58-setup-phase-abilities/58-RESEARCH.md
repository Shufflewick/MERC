# Phase 58: Setup-Phase Abilities - Research

**Researched:** 2026-02-17
**Domain:** Dictator setup-phase abilities (Hussein, Mao, Mussolini) and Hussein persistent double-tactics
**Confidence:** HIGH

## Summary

Phase 58 implements four requirements: SETUP-01 (Hussein starts with 10 tactics cards instead of 5), SETUP-02 (Mao starts with 1 random MERC per rebel), SETUP-03 (Mussolini starts with 1 random MERC per rebel), and REACT-01 (Hussein draws and plays a second tactics card each turn). These abilities modify game state during the Day 1 setup phase and, for Hussein, persist into every turn.

The codebase has well-established patterns for setup abilities via `applyDictatorSetupAbilities()` in `dictator-abilities.ts` and the `dictatorSetupAbility` action in `day-one-actions.ts`. The existing flow in `flow.ts` already has a `dictator-setup-ability` step at the right point in Day 1 for both Kim-specific and general setup abilities. For Mao/Mussolini, the setup ability draws MERCs and requires interactive squad placement (human) or auto-placement (AI). For Hussein, the setup ability doubles the tactics deck count and adds a persistent per-turn effect.

**Primary recommendation:** Implement all four requirements by extending the existing `applyDictatorSetupAbilities()` dispatch, adding new human-path setup actions for Mao/Mussolini squad choice, modifying the tactics deck count for Hussein, and adding a second play-tactics step in the per-turn flow for Hussein.

## Standard Stack

No new libraries needed. All modifications are to existing files.

### Files to Modify

| File | Purpose | Change |
|------|---------|--------|
| `src/rules/dictator-abilities.ts` | AI-path setup abilities | Add `applyHusseinSetupAbility()`, `applyMaoSetupAbility()`, `applyMussoliniSetupAbility()`, update `applyDictatorSetupAbilities()` switch |
| `src/rules/actions/day-one-actions.ts` | Human-path setup actions | Add `createMaoSetupAbilityAction()`, `createMussoliniSetupAbilityAction()` for interactive squad placement |
| `src/rules/actions/dictator-actions.ts` | Human-path per-turn action | Add `createHusseinBonusTacticsAction()` for Hussein's second tactics play |
| `src/rules/actions/index.ts` | Action registration | Import and register new actions |
| `src/rules/flow.ts` | Flow steps | Add Mao/Mussolini setup action steps in Day 1; add Hussein second tactics step in per-turn flow |
| `src/rules/setup.ts` or `src/rules/day-one.ts` | Tactics deck count override | Modify deck creation to use 10 cards when Hussein is selected |
| `src/rules/constants.ts` | Optional: add Hussein constant | Add `HUSSEIN_TACTICS_CARDS: 10` to `DictatorConstants` |
| UI files | UI routing for new actions | Add new action names to relevant arrays |

## Architecture Patterns

### Pattern 1: Hussein Setup - Double Tactics Deck (SETUP-01)

**What:** Hussein starts with 10 tactics cards in the deck instead of the default 5.

**How it works currently:**
- `setupTacticsDeck()` in `setup.ts` (line 293-365) creates the tactics deck with `activeTacticsCount` parameter (defaults to `DictatorConstants.ACTIVE_TACTICS_CARDS = 5`)
- `performSetup()` calls `setupTacticsDeck(game, options.tacticsData, options.activeTacticsCount)`
- The `activeTacticsCount` parameter flows through from `MERCGame.performSetup()` (line 1066) which accepts it as an optional param

**The timing problem:** For AI dictators, the dictator is selected during `performSetup()` -- BEFORE the tactics deck is created. So for AI Hussein, the `setupTacticsDeck` call already has access to the dictator identity. For human dictators, the dictator is selected DURING Day 1 via the `selectDictator` action -- AFTER the tactics deck has already been created (line 439-440 of setup.ts runs before Day 1 flow). This means the deck always starts with 5 cards regardless, and adjusting for Hussein must happen after dictator selection.

**Approach:** The cleanest approach is to handle Hussein's extra cards in the setup ability step. Instead of changing the initial deck count (which has the timing problem), add 5 more cards to the deck during `applyHusseinSetupAbility()`. Draw 5 more random tactics from `game.tacticsData`, create TacticsCard elements, and add them to the existing `tacticsDeck`. This approach:
- Works for both AI (dictator known at setup) and human (dictator chosen during Day 1)
- Uses the same setup ability hook as Kim/Castro
- Avoids modifying the setup flow ordering

**Key code:**
```typescript
// In dictator-abilities.ts
export function applyHusseinSetupAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'hussein') {
    return { success: false, message: 'Not Hussein' };
  }

  // Add 5 more tactics cards to the deck (bringing total from 5 to 10)
  const tacticsDeck = game.dictatorPlayer.tacticsDeck;
  if (!tacticsDeck) {
    return { success: false, message: 'No tactics deck' };
  }

  const currentCount = tacticsDeck.count(TacticsCard);
  const targetCount = 10; // HUSSEIN_TACTICS_CARDS
  const additionalNeeded = targetCount - currentCount;

  if (additionalNeeded > 0) {
    // Select additional random tactics and add to deck
    // Use game.tacticsData for available tactics pool
    // Create new TacticsCard elements in the deck
    // Shuffle the deck after adding
  }

  game.message(`Hussein starts with ${tacticsDeck.count(TacticsCard)} tactics cards!`);
  return { success: true, message: `Deck expanded to ${targetCount} cards` };
}
```

**Important constants:**
- `DictatorConstants.ACTIVE_TACTICS_CARDS = 5` (current default deck size)
- `DictatorConstants.HAND_SIZE = 3` (hand refill target -- unchanged for Hussein)
- `TacticsHand.MAX_SIZE = DictatorConstants.HAND_SIZE` (static, informational only)

### Pattern 2: Hussein Per-Turn Double Tactics (REACT-01)

**What:** Hussein draws and plays a second tactics card at the end of each turn, every turn.

**How tactics play works currently:**
- Flow step `dictator-play-tactics` (line 810-813) offers `['playTactics', 'reinforce']`
- AI auto-selects top card from deck; human chooses from hand
- After playing, hand refills to 3 at end of turn (line 993-997)

**Where to add the second play:**
The second tactics play should go AFTER the normal dictator ability step and BEFORE the refill step. Looking at the dictator turn flow (lines 776-999):

1. Step 1: Play tactics card or reinforce (line 810)
2. Artillery allocation, Generalissimo, Lockdown (post-tactics effects)
3. Step 2: Dictator MERC actions (line 862)
4. Step 3: Apply per-turn ability (line 949-963)
5. Conscripts effect (line 988)
6. **NEW: Hussein second tactics play (here)**
7. Step 4: Refill hand to 3 (line 994)

The ability text says "Draw and play a second Dictator Tactics card at the end of each of your turns." This means:
- Draw 1 card from deck to hand (if not already at hand limit)
- Then play or reinforce (same choices as Step 1)

**AI path:** In `applyDictatorTurnAbilities()` for Hussein, auto-play the top card from the deck.

**Human path:** Add a `husseinBonusTactics` action that works like `playTactics`/`reinforce` but is Hussein-specific. Add it to the flow as a new action step after the ability step.

**Flow structure:**
```typescript
// After dictator ability step, before conscripts/refill:

// Hussein second tactics draw (ensure card is available)
execute(() => {
  if (game.isFinished()) return;
  if (game.dictatorPlayer?.dictator?.combatantId !== 'hussein') return;
  // For human: draw 1 card from deck to hand if possible
  if (!game.dictatorPlayer?.isAI) {
    const deck = game.dictatorPlayer.tacticsDeck;
    const hand = game.dictatorPlayer.tacticsHand;
    if (deck && hand) {
      const card = deck.first(TacticsCard);
      if (card) card.putInto(hand);
    }
  }
}),

// Hussein second tactics play
actionStep({
  name: 'hussein-bonus-tactics',
  actions: ['husseinBonusTactics', 'husseinBonusReinforce'],
  skipIf: () => game.isFinished() ||
    game.dictatorPlayer?.dictator?.combatantId !== 'hussein' ||
    game.dictatorPlayer?.isAI === true,
}),

// Also needs artillery allocation after this second play
// (copy the artillery allocation loop pattern)
```

**Alternative (simpler):** Instead of creating separate `husseinBonusTactics`/`husseinBonusReinforce` actions, reuse the existing `playTactics`/`reinforce` actions in a second action step. They should still work -- their conditions check for available cards. However, this creates a flow where the dictator sees the same `playTactics`/`reinforce` choice twice. The drawback is no way to distinguish "this is Hussein's bonus" in the UI. Consider which is better for UX.

**Recommended approach:** Create a distinct `husseinBonusTactics` action so the UI can show "Hussein's Ability: Play a second tactics card" as the prompt. The execute logic will be identical to `playTactics` (select card, resolve effect, discard to pile). This also handles the artillery allocation + generalissimo + lockdown post-effects cleanly -- they need to run after both the first and second tactics plays.

### Pattern 3: Mao/Mussolini Setup - Bonus Starting MERCs (SETUP-02, SETUP-03)

**What:** Both Mao and Mussolini start with 1 random MERC per rebel player, with the dictator choosing which squad (primary or secondary) each MERC goes to.

**How many MERCs:** `game.rebelCount` (stored on MERCGame, line 391 of game.ts). For 1-4 rebel players, that's 1-4 bonus MERCs.

**When it happens:** During the Day 1 dictator setup ability step. In the flow, this is after initial militia placement and the first MERC hire:
1. Place initial militia
2. (Kim base choice if applicable)
3. (Kim setup ability if applicable)
4. Draw first MERC
5. Hire first MERC
6. **Setup ability step** <-- Mao/Mussolini bonus MERCs here
7. Draw tactics hand
8. Place extra militia

**AI path:** Draw N MERCs (where N = rebel count), auto-place into squads (primary first until full, then secondary). Use standard hire pattern: `putInto(squad)`, `selectNewMercLocation(game)`, `equipNewHire()`.

**Human path:** This is the interactive part. For each drawn MERC, the dictator chooses which squad (primary or secondary) to place them in. This requires a **loop** of interactive selections in the flow.

**Challenge: Multiple interactive selections.** The `dictatorSetupAbility` action step currently fires once. For Mao/Mussolini, we need N selections (one per drawn MERC). Two approaches:

**Approach A: Single action with multiple chooseFrom steps.** BoardSmith actions can chain multiple `chooseFrom` selections. For a fixed number of rebels (known at action time), we could chain N squad-choice steps. But the number varies (1-4 rebels), and `chooseFrom` does not support `skipIf`. This makes dynamic-count selections impossible in a single action.

**Approach B: Loop of actions.** Use a `loop` in the flow that runs once per bonus MERC. Each iteration offers a `maoSquadChoice` (or `mussoliniSquadChoice`) action that draws 1 MERC, shows their name, and asks which squad. The loop continues while there are still bonus MERCs to place.

**Approach B is the right choice.** It naturally handles variable rebel counts and matches the existing loop patterns in flow.ts (e.g., extra militia loop at line 552).

**State tracking:** Use a cached value (like `_mao_bonus_mercs_remaining`) to track how many bonus MERCs still need placement. Initialize to `game.rebelCount` in an `execute()` step before the loop. Decrement in each action's `execute()`.

**Human-path action:**
```typescript
export function createMaoSquadChoiceAction(game: MERCGame): ActionDefinition {
  const REMAINING_KEY = '_mao_bonus_mercs_remaining';
  const DRAWN_MERC_KEY = '_mao_drawn_merc_id';

  return Action.create('maoSquadChoice')
    .prompt("Mao's Ability: Choose squad for bonus MERC")
    .condition({
      'is dictator player': (ctx) => game.isDictatorPlayer(ctx.player),
      'is Mao': () => game.dictatorPlayer?.dictator?.combatantId === 'mao',
      'is human player': () => !game.dictatorPlayer?.isAI,
      'has mercs to place': () => {
        const remaining = getGlobalCachedValue<number>(game, REMAINING_KEY);
        return remaining !== undefined && remaining > 0;
      },
    })
    .chooseFrom<string>('selectedMerc', {
      prompt: 'Bonus MERC drawn',
      choices: () => {
        // Draw a MERC and cache it
        let mercId = getGlobalCachedValue<string>(game, DRAWN_MERC_KEY);
        if (!mercId) {
          const merc = game.drawMerc();
          if (merc) {
            setGlobalCachedValue(game, DRAWN_MERC_KEY, merc.id);
            return [merc.combatantName];
          }
          return ['No MERCs available'];
        }
        // Already drawn -- find by cached ID
        const merc = game.first(CombatantModel, m => m.id === mercId);
        return merc ? [merc.combatantName] : ['No MERCs available'];
      },
    })
    .chooseFrom<string>('targetSquad', {
      prompt: 'Assign to which squad?',
      choices: () => {
        const choices: string[] = [];
        if (!game.dictatorPlayer.primarySquad.isFull) choices.push('Primary Squad');
        if (!game.dictatorPlayer.secondarySquad.isFull) choices.push('Secondary Squad');
        if (choices.length === 0) choices.push('No room (will be discarded)');
        return choices;
      },
    })
    .chooseFrom<string>('equipmentType', {
      prompt: 'Choose starting equipment type',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
    })
    .execute((args) => {
      // Find the cached MERC, place in chosen squad, equip, decrement counter
      // Clear cached MERC ID
      // Return result
    });
}
```

**Flow structure for Mao/Mussolini:**
```typescript
// Inside dictator-landing sequence, after dictator-setup-ability step:

// Mao/Mussolini bonus MERCs initialization
execute(() => {
  const dictator = game.dictatorPlayer?.dictator;
  if (dictator?.combatantId === 'mao' || dictator?.combatantId === 'mussolini') {
    if (!game.dictatorPlayer?.isAI) {
      setGlobalCachedValue(game, '_bonus_mercs_remaining', game.rebelCount);
    }
  }
}),

// Mao/Mussolini bonus MERC placement loop
loop({
  name: 'bonus-merc-placement',
  while: () => {
    const dictator = game.dictatorPlayer?.dictator;
    if (dictator?.combatantId !== 'mao' && dictator?.combatantId !== 'mussolini') return false;
    if (game.dictatorPlayer?.isAI) return false;
    const remaining = getGlobalCachedValue<number>(game, '_bonus_mercs_remaining');
    return remaining !== undefined && remaining > 0;
  },
  maxIterations: 10,
  do: actionStep({
    name: 'bonus-merc-squad-choice',
    actions: ['maoSquadChoice', 'mussoliniSquadChoice'],
    prompt: 'Choose squad placement for bonus MERC',
  }),
}),
```

### Pattern 4: Reusing the dictatorSetupAbility Step vs. New Steps

The existing flow has TWO setup ability steps:
1. **Kim-specific** (line 508-518): `dictator-kim-ability` with `dictatorSetupAbility`, runs before MERC hire, skips for non-Kim
2. **General** (line 532-538): `dictator-setup-ability` with `dictatorSetupAbility`, runs after MERC hire, skips for Kim

For Hussein (AI), the general step can handle adding extra tactics cards. For Mao/Mussolini (AI), the general step can handle auto-drawing and placing bonus MERCs.

For Mao/Mussolini (human), the general step runs the AI-path via `dictatorSetupAbility` action (which calls `applyDictatorSetupAbilities`). But human players need interactive squad choices. So the general step should ONLY handle the AI path for Mao/Mussolini, and a NEW loop of action steps should handle the human path for squad choices.

**Recommended flow placement:** Add the Mao/Mussolini human-path loop AFTER the general `dictator-setup-ability` step and BEFORE the tactics draw step. The general step will handle AI, and the loop will handle human.

### Anti-Patterns to Avoid

- **Don't modify `setupTacticsDeck()` to be dictator-aware.** The tactics deck is created before the dictator is known (for human players). Handle Hussein's extra cards in the setup ability step instead.
- **Don't use a single action with 4+ chained `chooseFrom` for variable-count MERC placement.** Use a loop instead.
- **Don't create `playTactics` duplicates.** Hussein's second tactics play should be a distinct action name so the UI can show the correct prompt.
- **Don't put Hussein's second tactics play before the MERC actions step.** The ability text says "end of each of your turns."

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MERC drawing | Custom deck logic | `game.drawMerc()` | Handles empty deck reshuffling |
| Equipment for new hire | Manual equip logic | `equipNewHire(game, merc, type)` | Handles Apeiron/Vrbansk |
| Sector placement (AI) | Custom placement | `selectNewMercLocation(game)` | AI rules 4.3.2 |
| Squad bonus updates | Manual recalc | `game.updateAllSargeBonuses()` | All squad-based abilities |
| Cached values | Custom state | `getGlobalCachedValue` / `setGlobalCachedValue` / `clearGlobalCachedValue` | Persist state across selections |
| Tactics card creation | Manual element creation | Follow `setupTacticsDeck` pattern for creating `TacticsCard` in deck | Consistent element setup |
| Map animations | Custom events | `emitMapCombatantEntries()` + `buildMapCombatantEntry()` | Standard MERC-on-map pattern |

## Common Pitfalls

### Pitfall 1: Tactics deck created before dictator selection (human players)
**What goes wrong:** Trying to change `activeTacticsCount` for Hussein at deck creation time fails because for human dictators, the deck is created in `performSetup()` (line 439-440 of setup.ts) before the dictator is chosen during Day 1.
**How to avoid:** Add extra cards to the existing deck during the setup ability step, not during initial deck creation.

### Pitfall 2: Hussein's second tactics play needs post-effects
**What goes wrong:** Tactics cards can trigger artillery barrage, generalissimo hire, lockdown, and combat. If Hussein's second play is added without the corresponding post-effect handling, these effects won't process.
**How to avoid:** After the second tactics play action step, include the same post-effect steps (artillery allocation loop, generalissimo hire loop, lockdown placement loop, combat resolution sub-flow). These can be factored into a shared helper or duplicated.

### Pitfall 3: Mao/Mussolini loop not decrementing counter
**What goes wrong:** The loop condition checks a counter, but if the action's execute doesn't decrement it, the loop runs forever (hitting maxIterations).
**How to avoid:** Always decrement the counter in the action's `execute()` and clear the drawn MERC cache.

### Pitfall 4: Both squads full for Mao/Mussolini bonus MERCs
**What goes wrong:** The dictator already has a hired MERC in primary squad. With 4 rebels, that's 5 total MERCs. `MAX_SQUAD_SIZE` might limit each squad. If both squads fill up, remaining bonus MERCs must be discarded.
**How to avoid:** Check `squad.isFull` before offering squad choices. If both are full, auto-discard remaining MERCs.

### Pitfall 5: Hussein refill after second play
**What goes wrong:** The hand refill step at the end of the dictator turn fills hand to 3 cards. If Hussein played 2 cards this turn (first play + bonus play), hand might be down to 1, and refill draws 2. This is correct behavior -- but verify the refill step still has cards to draw from the (larger) deck.
**How to avoid:** No special handling needed. `drawTacticsHand()` already handles drawing until hand is full or deck is empty.

### Pitfall 6: TacticsCard element ID collisions
**What goes wrong:** When adding extra tactics cards for Hussein, the element IDs must not collide with existing cards. `setupTacticsDeck` uses format `tactics-${tactics.id}-${i}`.
**How to avoid:** Use a different prefix or offset for Hussein's additional cards, e.g., `tactics-hussein-${tactics.id}-${i}`.

### Pitfall 7: Mao/Mussolini ability runs for both AI and human via dictatorSetupAbility
**What goes wrong:** The `dictatorSetupAbility` action calls `applyDictatorSetupAbilities()` which dispatches for ALL dictators. If Mao's AI-path auto-places MERCs but the human path ALSO runs via the action step, MERCs get double-placed.
**How to avoid:** In `applyDictatorSetupAbilities()`, for Mao/Mussolini only run the AI path when `isAI`. The human path should be handled entirely by the dedicated squad-choice actions. Alternatively, have the AI-path function check `isAI` internally.

## Code Examples

### Hussein Setup Ability (Adding Extra Tactics Cards)

```typescript
// In dictator-abilities.ts
export function applyHusseinSetupAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'hussein') {
    return { success: false, message: 'Not Hussein' };
  }

  const tacticsDeck = game.dictatorPlayer.tacticsDeck;
  if (!tacticsDeck) {
    return { success: false, message: 'No tactics deck' };
  }

  // Current deck has 5 cards; add 5 more for Hussein's 10 total
  const HUSSEIN_TARGET = 10;
  const currentCount = tacticsDeck.count(TacticsCard);
  const additionalNeeded = HUSSEIN_TARGET - currentCount;

  if (additionalNeeded <= 0) {
    return { success: true, message: 'Deck already at target size' };
  }

  // Build pool of all available tactics (expanded by quantity)
  const allTactics: TacticsData[] = [];
  for (const t of game.tacticsData) {
    for (let i = 0; i < t.quantity; i++) {
      allTactics.push(t);
    }
  }

  // Select additional random tactics
  // Use selectRandom from setup.ts pattern (or manual random selection)
  const selected: TacticsData[] = [];
  const pool = [...allTactics];
  for (let i = 0; i < additionalNeeded && pool.length > 0; i++) {
    const idx = Math.floor(game.random() * pool.length);
    selected.push(pool.splice(idx, 1)[0]);
  }

  // Create new TacticsCard elements in the deck
  const existingCount = currentCount;
  for (let i = 0; i < selected.length; i++) {
    const t = selected[i];
    tacticsDeck.create(TacticsCard, `tactics-hussein-${t.id}-${existingCount + i}`, {
      tacticsId: t.id,
      tacticsName: t.name,
      story: t.story,
      description: t.description,
      revealsBase: t.revealsBase ?? false,
    });
  }

  // Shuffle the expanded deck
  tacticsDeck.shuffle();

  game.message(`Hussein starts with ${tacticsDeck.count(TacticsCard)} tactics cards!`);
  return {
    success: true,
    message: `Deck expanded to ${tacticsDeck.count(TacticsCard)} cards`,
    data: { deckSize: tacticsDeck.count(TacticsCard) },
  };
}
```

### Mao/Mussolini AI-Path Setup Ability

```typescript
// In dictator-abilities.ts
export function applyMaoSetupAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'mao') {
    return { success: false, message: 'Not Mao' };
  }

  const bonusCount = game.rebelCount;
  let hired = 0;

  for (let i = 0; i < bonusCount; i++) {
    const merc = game.drawMerc();
    if (!merc) {
      game.message('Mao: No more MERCs available');
      break;
    }

    const primarySquad = game.dictatorPlayer.primarySquad;
    const secondarySquad = game.dictatorPlayer.secondarySquad;
    const targetSquad = !primarySquad.isFull ? primarySquad
      : !secondarySquad.isFull ? secondarySquad
      : null;

    if (!targetSquad) {
      merc.putInto(game.mercDiscard);
      game.message('Mao: All squads full, discarding MERC');
      continue;
    }

    merc.putInto(targetSquad);
    const targetSector = selectNewMercLocation(game);
    if (targetSector) {
      targetSquad.sectorId = targetSector.sectorId;
    }

    let equipType: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
    if (merc.weaponSlot) {
      equipType = merc.armorSlot ? 'Accessory' : 'Armor';
    }
    equipNewHire(game, merc, equipType);
    game.updateAllSargeBonuses();
    game.message(`Mao hired bonus MERC: ${merc.combatantName}`);
    hired++;
  }

  return {
    success: true,
    message: `Mao hired ${hired} bonus MERCs`,
    data: { hired },
  };
}
// Mussolini uses the same pattern -- identical logic, different dictator ID check
```

### Hussein Per-Turn Flow Placement

```typescript
// In flow.ts dictator turn sequence, after ability step, before conscripts/refill:

// Hussein: Draw a card before second play (human only)
execute(() => {
  if (game.isFinished()) return;
  const dictator = game.dictatorPlayer?.dictator;
  if (dictator?.combatantId !== 'hussein') return;

  if (game.dictatorPlayer?.isAI) {
    // AI: Auto-play second card (top of deck)
    applyHusseinBonusTactics(game);
  } else {
    // Human: Draw 1 card from deck to hand
    const deck = game.dictatorPlayer.tacticsDeck;
    const hand = game.dictatorPlayer.tacticsHand;
    if (deck && hand) {
      const card = deck.first(TacticsCard);
      if (card) {
        card.putInto(hand);
        game.message('Hussein draws a bonus tactics card');
      }
    }
  }
}),

// Hussein second tactics play (human only)
actionStep({
  name: 'hussein-bonus-tactics',
  actions: ['husseinBonusTactics', 'husseinBonusReinforce'],
  skipIf: () => game.isFinished() ||
    game.dictatorPlayer?.dictator?.combatantId !== 'hussein' ||
    game.dictatorPlayer?.isAI === true,
}),

// Post-effects for Hussein's second tactics play
// (artillery allocation, generalissimo, lockdown, combat resolution)
// These need to run after BOTH the first and second tactics plays
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All dictators get 5 tactics cards | Configurable via `activeTacticsCount` param | Phase 50 (tactics audit) | Setup already supports variable count, but only at init time |
| Setup abilities are auto-applied | Two-path system (AI auto + human interactive) | Phase 54 | Kim has human-path `chooseKimBase` for setup |

## Open Questions

1. **Hussein second tactics: Create new actions or reuse playTactics/reinforce?**
   - Creating new `husseinBonusTactics` / `husseinBonusReinforce` actions provides clearer UX ("Hussein's Ability: Play a second card") but duplicates logic
   - Reusing `playTactics` / `reinforce` is simpler code but has no way to show a distinct prompt
   - Recommendation: Create new actions. The extra clarity is worth the duplication, and the actions are thin wrappers.

2. **Mao vs Mussolini: Share an action or separate?**
   - Both Mao and Mussolini have identical setup abilities (1 MERC per rebel, choose squad). They could share a single `bonusMercSquadChoice` action that checks the current dictator.
   - Recommendation: Use a single shared action (`bonusMercSetup`) with a condition that checks for either dictator. This avoids duplicating identical logic.

3. **Post-effect duplication for Hussein's second tactics play**
   - The artillery, generalissimo, lockdown, and combat resolution steps after the first tactics play need to also run after the second. This is ~50 lines of flow code.
   - Recommendation: Factor these post-tactics-effects into a helper function (like `combatResolutionFlow`) and call it twice. Or use a sequence helper function.

4. **Mao/Mussolini squad choice: What about sector assignment?**
   - When bonus MERCs are placed into squads during Day 1, the squads may not have a sector yet (dictator has not necessarily been placed). The first MERC hire sets the squad location via `selectNewMercLocation()`.
   - Recommendation: After placing a bonus MERC into a squad, if the squad has no sector, use `selectNewMercLocation(game)` to assign one. If it already has a sector, leave it.

5. **Does TacticsData have the structure needed for creating new cards?**
   - The `game.tacticsData` array stores the raw data. Need to verify it has `id`, `name`, `story`, `description`, `quantity`, `revealsBase` fields.
   - Confidence: HIGH -- `setupTacticsDeck()` already uses this exact data to create cards.

## Sources

### Primary (HIGH confidence)
- `src/rules/dictator-abilities.ts` - Full AI-path implementation for existing dictators (Castro, Kim)
- `src/rules/flow.ts` lines 467-588 (Day 1 flow), 776-999 (dictator turn flow)
- `src/rules/setup.ts` lines 293-365 (`setupTacticsDeck`), 237-278 (`setupDictator`), 426-462 (`performSetup`)
- `src/rules/day-one.ts` lines 348-376 (`drawTacticsHand`), 339-342 (`applyDictatorSetupAbility`)
- `src/rules/actions/day-one-actions.ts` lines 490-527 (`createSelectDictatorAction`), 732-765 (`createDictatorSetupAbilityAction`, `createDictatorDrawTacticsAction`)
- `src/rules/actions/dictator-actions.ts` lines 74-253 (`createPlayTacticsAction`, `createReinforceAction`)
- `src/rules/constants.ts` lines 99-111 (`DictatorConstants`)
- `src/rules/elements.ts` lines 1483-1490 (`TacticsDeck`, `TacticsHand`)
- `src/rules/game.ts` lines 391, 1066-1100, 1129-1134 (setup methods)
- `data/combatants.json` lines 687-724 (Hussein, Mao, Mussolini ability text)

### Secondary (HIGH confidence)
- Phase 57 plan files (57-01-PLAN.md, 57-02-PLAN.md) - Established patterns for action creation, UI wiring

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All patterns directly observable in existing code
- Architecture: HIGH - Setup ability dispatch, flow steps, and two-path system are well-established
- Pitfalls: HIGH - Timing of tactics deck creation vs dictator selection verified in code
- Hussein per-turn: MEDIUM - Post-effect duplication approach needs validation during planning

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (stable codebase, no external dependencies)
