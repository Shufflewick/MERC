# Phase 59: Militia Placement Abilities - Research

**Researched:** 2026-02-17
**Domain:** Dictator per-turn militia placement abilities (Mao, Mussolini, Pol Pot)
**Confidence:** HIGH

## Summary

This phase adds per-turn militia placement abilities for three dictators: Mao, Mussolini, and Pol Pot. The codebase already has a fully working pattern for this in Kim's bonus militia ability, which has both an AI path (`applyKimTurnAbility` in `dictator-abilities.ts`) and a human path (`createKimBonusMilitiaAction` in `dictator-actions.ts`), wired into flow.ts with the standard actionStep + execute pattern.

All three new abilities follow the same dual-path architecture: AI logic in `dictator-abilities.ts` (called from `applyDictatorTurnAbilities`), and human interactive actions in `dictator-actions.ts` (registered in `actions/index.ts` and listed in the flow's dictator-ability action step). The existing infrastructure for sector filtering, militia placement, combat triggering, and DictatorPanel UI can be reused directly.

**Primary recommendation:** Follow Kim's militia pattern exactly. The main complexity is Mussolini's two-step flow (place + spread) and Pol Pot's conditional MERC hire after combat loss, which requires tracking the last combat outcome.

## Standard Stack

No new libraries needed. All work uses existing game infrastructure:

### Core APIs
| API | Location | Purpose |
|-----|----------|---------|
| `sector.addDictatorMilitia(count, bypassCap?)` | `elements.ts:1295` | Add militia to a sector (capped at 10 by default) |
| `sector.removeDictatorMilitia(count)` | `elements.ts:1316` | Remove militia from a sector |
| `sector.isWilderness` | `elements.ts:1261` | Check if sector is Wilderness type |
| `sector.dictatorMilitia` | `elements.ts:1214` | Current dictator militia count |
| `game.getControlledSectors(player)` | `game.ts:1219` | Get sectors controlled by a player |
| `game.getAdjacentSectors(sector)` | `game.ts:1212` | Get sectors adjacent to a given sector |
| `game.rebelPlayers` | `game.ts` | Array of rebel players |
| `game.rebelCount` | `game.ts:391` | Number of rebel players |
| `game.drawMerc()` | `game.ts:1192` | Draw a random MERC from deck |
| `Sector.MAX_MILITIA_PER_SIDE` | `elements.ts:1251` | Cap of 10 militia per side per sector |
| `getRebelControlledSectors(game)` | `ai-combat-helpers.ts:77` | All rebel-controlled sectors across all rebels |
| `selectMilitiaPlacementSector(game, sectors, type)` | `ai-helpers.ts:327` | AI sector selection for militia placement |
| `queuePendingCombat(game, sector, rebel, isRebelAttacker)` | `combat.ts` | Queue combat when militia placed on rebel sector |
| `equipNewHire(game, merc, equipType)` | `actions/helpers.ts` | Equip a newly hired MERC |
| `selectNewMercLocation(game)` | `ai-helpers.ts:461` | AI sector selection for new MERC placement |

## Architecture Patterns

### Pattern 1: Dual-Path Ability (AI + Human) - Kim's Militia Pattern

Every dictator per-turn ability has two implementations:

1. **AI path** in `dictator-abilities.ts` - auto-executes logic, called from `applyDictatorTurnAbilities()` dispatcher
2. **Human path** in `dictator-actions.ts` - interactive `Action.create()` with `chooseFrom`/`chooseElement` steps

**Flow integration (flow.ts lines 975-1012):**
```
// Step 3: Apply per-turn dictator special ability
execute(() => {
  if (game.dictatorPlayer?.isAI) {
    applyDictatorTurnAbilities(game);  // AI auto-executes
  }
});

// Human dictator ability choice (skipped for AI)
actionStep({
  name: 'dictator-ability',
  actions: ['castroBonusHire', 'kimBonusMilitia', 'gadafiBonusHire', 'stalinBonusHire'],
  skipIf: () => game.isFinished() || game.dictatorPlayer?.isAI === true,
});

// Process any pending combat triggered by ability
execute(() => { ... initiate pending combat ... });
combatResolutionFlow(game, 'kim-militia-combat');
```

**Key observation:** The new actions (`maoBonusMilitia`, `mussoliniBonusMilitia`, `polpotBonusMilitia`) must be added to the `actions` array in the dictator-ability action step at line 988. The combat resolution flow after the ability handles any combat triggered by militia placement.

### Pattern 2: Kim's Human Action (the template to follow)

```typescript
// Source: dictator-actions.ts:504-568
export function createKimBonusMilitiaAction(game: MERCGame): ActionDefinition {
  return Action.create('kimBonusMilitia')
    .prompt("Kim's Ability: Place bonus militia")
    .condition({
      'is dictator player': (ctx) => game.isDictatorPlayer(ctx.player),
      'is Kim': () => game.dictatorPlayer?.dictator?.combatantId === 'kim',
      'is human player': () => !game.dictatorPlayer?.isAI,
    })
    .chooseFrom<string>('targetSector', {
      prompt: '...',
      choices: () => { /* filter sectors */ },
    })
    .execute((args, ctx) => {
      // Count rebel sectors, place militia, check combat
    });
}
```

### Pattern 3: Kim's AI Path (the template to follow)

```typescript
// Source: dictator-abilities.ts:402-479
export function applyKimTurnAbility(game: MERCGame): DictatorAbilityResult {
  // 1. Count rebel-controlled sectors
  // 2. Select target sector using AI placement rules
  // 3. Place militia: sector.addDictatorMilitia(count)
  // 4. Check for combat: queuePendingCombat() if rebels present
}
```

### Pattern 4: Combat-Triggered MERC Hire (Pol Pot)

Pol Pot needs to detect "if you lose this battle" and hire a MERC. Currently, `CombatOutcome` (combat-types.ts:57) has `rebelVictory` and `dictatorVictory` fields. However, there is **no `lastCombatOutcome` tracking** on the game state. The combat outcome is computed in `executeCombat()` (combat.ts:3511-3517) but only stored transiently in `activeCombat`.

**The problem:** After combat completes and `clearActiveCombat` runs, the outcome is lost. Pol Pot's ability runs AFTER combat resolution in the flow.

**Solution approaches:**
1. **Track last combat outcome on game state** - Add a `lastDictatorAbilityCombatOutcome` field to MERCGame, set it when combat triggered by ability resolves, read it in Pol Pot's post-combat logic
2. **Detect combat loss inline** - In Pol Pot's ability, after militia placement triggers combat and combat resolves, check whether dictator still controls the sector (rebels winning means rebel victory)
3. **Use the combat resolution flow return** - The combat resolution sub-flow already runs after ability placement; add a post-combat execute step that checks the outcome

**Recommendation:** Approach 1 is cleanest. Add a simple `lastAbilityCombatOutcome: { rebelVictory: boolean; sectorId: string } | null` field to game state. Set it in the combat resolution, read it in a post-combat execute step, clear it after use.

**Alternative (simpler):** Since Pol Pot places militia on a rebel sector which triggers combat, after combat resolves we can check: did the dictator lose control of that sector? If rebels still control it, dictator lost. This avoids adding game state but is slightly less precise.

### Pattern 5: Multi-Step Militia Placement (Mussolini)

Mussolini has a two-step ability:
1. Add militia equal to rebel count to a chosen controlled sector
2. Move militia from that sector to adjacent sectors

This is similar to the **Lockdown militia placement** pattern (dictator-actions.ts:764-832) which uses `game.pendingLockdownMilitia` state and a loop in flow.ts. Mussolini will need:
- A pending state field (e.g., `game.pendingMussoliniSpread`)
- A first action that places militia and sets up the spread state
- A loop of actions to spread militia to adjacent sectors
- The spread is optional - dictator may choose to keep all militia in the original sector

### Pattern 6: Mao's Multi-Sector Wilderness Distribution

Mao distributes militia across **any wilderness sectors**. The human path needs either:
- A loop that lets the player choose sector + amount repeatedly (like Lockdown)
- A single action that places all militia on one wilderness sector (simpler, but doesn't match "distribute to any wilderness sectors as you see fit")

**From the ability text:** "distribute that many militia to any Wilderness sectors as you see fit" - this implies distributing across multiple sectors.

**Recommendation:** Use the Lockdown loop pattern. Add `game.pendingMaoMilitia` with `{ remaining: number }`. Loop with an action step that lets dictator choose wilderness sector + amount until remaining = 0.

### Project Structure (files to modify)

```
src/rules/
  dictator-abilities.ts    # Add AI paths: applyMaoTurnAbility, applyMussoliniTurnAbility, applyPolpotTurnAbility
  actions/
    dictator-actions.ts    # Add human actions: createMaoBonusMilitiaAction, createMussoliniBonusMilitiaAction, etc.
    index.ts               # Register new actions
  flow.ts                  # Add new action names to dictator-ability step + add loops for Mao/Mussolini
  game.ts                  # Add pending state fields (pendingMaoMilitia, pendingMussoliniSpread, etc.)
src/ui/components/
  DictatorPanel.vue        # Add new action names to dictatorSpecificActions list + isSelectingSector
tests/
  *.test.ts                # New tests for each ability
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sector militia cap enforcement | Manual cap checking | `sector.addDictatorMilitia(count)` | Already enforces MAX_MILITIA_PER_SIDE (10) |
| Rebel-controlled sector counting | Manual iteration | `game.getControlledSectors(rebel)` | Handles ties, multi-rebel correctly |
| AI sector selection | Random/simple selection | `selectMilitiaPlacementSector()` | Has strategic logic per AI rules 4.4 |
| Combat triggering after placement | Manual combat initiation | `queuePendingCombat()` | Integrates with flow engine's combat resolution |
| MERC hiring with equipment | Manual draw + equip | `game.drawMerc()` + `equipNewHire()` | Handles Apeiron/Vrbansk edge cases |
| Adjacent sector lookup | Manual graph traversal | `game.getAdjacentSectors(sector)` | Uses hex grid adjacency from GameMap |

## Common Pitfalls

### Pitfall 1: Forgetting to Register Actions in All Three Places
**What goes wrong:** Action exists but never appears in UI or flow
**Why it happens:** Actions need registration in (1) `actions/index.ts` registerAllActions, (2) flow.ts action step, (3) DictatorPanel.vue dictatorSpecificActions
**How to avoid:** Checklist: register in index.ts, add to flow actionStep actions array, add to DictatorPanel computed lists
**Warning signs:** Action silently skipped, no UI button appears

### Pitfall 2: Combat Not Resolving After Militia Placement
**What goes wrong:** Militia placed on rebel sector but combat never fires
**Why it happens:** `queuePendingCombat()` must be called, and the flow must have a combat resolution sub-flow AFTER the ability action step
**How to avoid:** Always queue combat (don't initiate directly), ensure `combatResolutionFlow` follows in the flow sequence
**Warning signs:** Militia appears but no combat panel

### Pitfall 3: Mussolini Spread Without Adjacency Check
**What goes wrong:** Militia can be moved to non-adjacent sectors
**Why it happens:** Spread targets must be filtered to `game.getAdjacentSectors(sourceSector)`
**How to avoid:** Filter spread choices to adjacent sectors only, store source sector ID in pending state

### Pitfall 4: Pol Pot Max 10 Per Sector Not Enforced
**What goes wrong:** Pol Pot places more than 10 militia on a sector
**Why it happens:** `addDictatorMilitia` enforces `MAX_MILITIA_PER_SIDE` (10) by default, but Pol Pot's ability explicitly states "max 10" - the standard cap handles this automatically
**How to avoid:** Use `sector.addDictatorMilitia(count)` WITHOUT `bypassCap=true` (which is only for Kim)

### Pitfall 5: DictatorPanel Not Tracking New Action for Sector Selection
**What goes wrong:** Sector selection UI doesn't appear for new abilities
**Why it happens:** `isSelectingSector` computed property in DictatorPanel.vue checks a hardcoded list of action names
**How to avoid:** Add new action names to `isSelectingSector` check at DictatorPanel.vue line 170

### Pitfall 6: Mao Wilderness Filter Missing
**What goes wrong:** Mao can place militia on any sector, not just wilderness
**Why it happens:** Sector filter doesn't check `sector.isWilderness`
**How to avoid:** Filter choices with `s.isWilderness` for both AI and human paths

### Pitfall 7: Combat Loss Detection for Pol Pot
**What goes wrong:** Pol Pot always/never hires a MERC after combat
**Why it happens:** No mechanism to track whether dictator lost the combat triggered by the ability
**How to avoid:** Track combat outcome before clearing activeCombat. See Architecture Pattern 4.

## Code Examples

### Mao AI Path
```typescript
// Based on Kim's pattern in dictator-abilities.ts:402
export function applyMaoTurnAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'mao') {
    return { success: false, message: 'Not Mao' };
  }

  // Count rebel-controlled sectors (same as Kim)
  let rebelSectorCount = 0;
  for (const rebel of game.rebelPlayers) {
    rebelSectorCount += game.getControlledSectors(rebel).length;
  }

  if (rebelSectorCount === 0) {
    game.message('Mao: Rebels control no sectors, no militia to place');
    return { success: true, message: 'No rebel sectors', data: { militiaPlaced: 0 } };
  }

  // KEY DIFFERENCE FROM KIM: Only wilderness sectors
  const wildernessSectors = game.gameMap.getAllSectors().filter(s => s.isWilderness);
  if (wildernessSectors.length === 0) {
    game.message('Mao: No wilderness sectors available');
    return { success: true, message: 'No wilderness sectors' };
  }

  // AI distributes across wilderness sectors
  let remaining = rebelSectorCount;
  // ... distribute logic using selectMilitiaPlacementSector for each placement ...
}
```

### Mao Human Action (multi-sector loop pattern)
```typescript
// Based on Lockdown pattern in dictator-actions.ts:764
export function createMaoBonusMilitiaAction(game: MERCGame): ActionDefinition {
  return Action.create('maoBonusMilitia')
    .prompt("Mao's Ability: Place militia in wilderness sectors")
    .condition({
      'is dictator player': (ctx) => game.isDictatorPlayer(ctx.player),
      'is Mao': () => game.dictatorPlayer?.dictator?.combatantId === 'mao',
      'is human player': () => !game.dictatorPlayer?.isAI,
      'has pending militia': () => game.pendingMaoMilitia != null && game.pendingMaoMilitia.remaining > 0,
    })
    .chooseFrom<string>('targetSector', {
      prompt: 'Choose wilderness sector for militia',
      choices: () => game.gameMap.getAllSectors()
        .filter(s => s.isWilderness && s.dictatorMilitia < Sector.MAX_MILITIA_PER_SIDE)
        .map(s => s.sectorName),
    })
    .chooseFrom<string>('amount', {
      prompt: 'How many militia?',
      choices: () => {
        const remaining = game.pendingMaoMilitia?.remaining ?? 0;
        const max = Math.min(remaining, 10);
        return Array.from({ length: max }, (_, i) => `${i + 1}`);
      },
    })
    .execute((args) => {
      // Place militia, decrement remaining, check combat
    });
}
```

### Mussolini Two-Step Pattern
```typescript
// Step 1: Place militia on controlled sector
// Step 2: Spread from that sector to adjacent sectors (loop)
// Uses game.pendingMussoliniSpread = { sourceSectorId, remaining }
```

### Pol Pot Combat Loss + MERC Hire
```typescript
// After combat resolution flow completes for polpot-militia-combat:
execute(() => {
  const dictator = game.dictatorPlayer?.dictator;
  if (dictator?.combatantId !== 'polpot') return;
  if (!game.lastAbilityCombatOutcome?.rebelVictory) return;

  // Hire 1 random MERC (same as Gaddafi's pattern)
  const merc = game.drawMerc();
  if (!merc) return;
  // ... squad assignment, equip, etc.
  game.lastAbilityCombatOutcome = null;
});
```

### Flow Integration
```typescript
// In flow.ts dictator-ability action step, add new action names:
actionStep({
  name: 'dictator-ability',
  actions: [
    'castroBonusHire', 'kimBonusMilitia', 'gadafiBonusHire', 'stalinBonusHire',
    'maoBonusMilitia', 'mussoliniBonusMilitia', 'polpotBonusMilitia',
  ],
  skipIf: () => game.isFinished() || game.dictatorPlayer?.isAI === true,
});

// Add loops for multi-step abilities (Mao distribution, Mussolini spread)
// AFTER the main ability step, BEFORE combat resolution
loop({
  name: 'mao-militia-distribution',
  while: () => game.pendingMaoMilitia != null && game.pendingMaoMilitia.remaining > 0,
  maxIterations: 50,
  do: actionStep({
    name: 'mao-place-militia',
    actions: ['maoBonusMilitia'],
    skipIf: () => ...,
  }),
});
```

### DictatorPanel Registration
```typescript
// In DictatorPanel.vue, add to dictatorSpecificActions (line 136):
const dictatorSpecificActions = [
  'playTactics', 'reinforce', 'castroBonusHire', 'kimBonusMilitia',
  'chooseKimBase', 'generalissimoPick', 'lockdownPlaceMilitia',
  'gadafiBonusHire', 'stalinBonusHire', 'husseinBonusTactics', 'husseinBonusReinforce',
  'maoBonusMilitia', 'mussoliniBonusMilitia', 'mussoliniSpreadMilitia', 'polpotBonusMilitia',
];

// In isSelectingSector (line 170), add new action names:
if (currentAction === '...' || currentAction === 'maoBonusMilitia' ||
    currentAction === 'mussoliniBonusMilitia' || currentAction === 'mussoliniSpreadMilitia' ||
    currentAction === 'polpotBonusMilitia') {
  return sel.name === 'targetSector';
}
```

## Detailed Ability Specifications

### Mao (TURN-03)
- **Trigger:** Once per turn, during dictator ability phase
- **Count:** Number of rebel-controlled sectors (across all rebels)
- **Target:** ANY wilderness sectors (player distributes freely)
- **Cap:** Standard 10 per sector (no bypass)
- **Combat:** Triggers if rebels present in target wilderness sector
- **Multi-step:** Yes, distributes across multiple wilderness sectors

### Mussolini (TURN-04)
- **Trigger:** Once per turn, during dictator ability phase
- **Count:** Number of rebel players (`game.rebelCount`)
- **Step 1:** Add militia to ONE sector dictator controls
- **Step 2:** Move militia FROM that sector to adjacent sectors
- **Cap:** Standard 10 per sector
- **Combat:** Triggers if rebels present in target sector(s)
- **Multi-step:** Yes, place then spread. Spread is optional (can skip).

### Pol Pot (TURN-07)
- **Trigger:** Once per turn, during dictator ability phase
- **Count:** Number of rebel-controlled sectors (across all rebels)
- **Target:** ANY ONE rebel-controlled sector
- **Cap:** Max 10 per sector (explicit in ability text, matches standard cap)
- **Combat:** Triggers when militia placed on rebel sector (always, since target is rebel sector)
- **Conditional hire:** If dictator LOSES the combat, hire 1 random MERC
- **MERC hire:** Same pattern as Gaddafi's hire (draw, equip, place in squad)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct executeCombat in ability | queuePendingCombat + flow resolution | Phase 57+ | All combat must go through flow engine |
| Single action per ability | Dual-path (AI auto + Human interactive) | Phase 57 | Every ability needs both paths |
| Inline hiring | equipNewHire helper | Phase 57 | Handles Apeiron/Vrbansk edge cases |

## Open Questions

1. **Mao: Can militia be placed on wilderness sectors with rebels?**
   - The ability says "any Wilderness sectors" - this should include rebel-occupied wilderness
   - Placing militia there would trigger combat (same as Kim)
   - **Recommendation:** Allow it, trigger combat

2. **Mussolini: Can militia be moved to enemy-occupied adjacent sectors?**
   - The ability says "move militia from that sector into adjacent sectors"
   - Moving to rebel-occupied sector should trigger combat
   - **Recommendation:** Allow it, trigger combat for each affected sector

3. **Mussolini: Is the spread mandatory?**
   - After placing militia, must the dictator spread some to adjacent sectors?
   - **Recommendation:** Make it optional. Add a "Done spreading" / skip action.

4. **Pol Pot: What if combat is a draw (mutual retreat)?**
   - The ability says "if you lose this battle"
   - A retreat is not a loss. Only `rebelVictory === true` should count.
   - **Recommendation:** Only hire MERC on `rebelVictory === true`

5. **Pol Pot: What if no combat occurs (sector already at max militia)?**
   - If sector already has 10 militia, no new militia are placed, no combat
   - **Recommendation:** Skip the hire since no battle happened

6. **Pol Pot MERC hire: AI vs Human path?**
   - For AI: auto-hire like Gaddafi AI path
   - For human: needs interactive action (choose equipment + sector)
   - **Recommendation:** For simplicity, the conditional hire can be auto-placed (AI-style) for both AI and human, similar to Stalin's secondary hire. The MERC hire is a bonus, not a strategic choice.

## Sources

### Primary (HIGH confidence)
- `src/rules/dictator-abilities.ts` - Existing AI ability implementations (Kim, Castro, Gaddafi, Stalin, Hussein)
- `src/rules/actions/dictator-actions.ts` - Existing human ability actions (Kim militia, Castro hire, Lockdown, etc.)
- `src/rules/flow.ts` - Flow integration pattern for abilities
- `src/rules/elements.ts` - Sector class with militia API, isWilderness, adjacency
- `src/rules/game.ts` - Game state, getControlledSectors, getAdjacentSectors
- `src/rules/combat.ts` - Combat outcome tracking, queuePendingCombat, clearActiveCombat
- `src/ui/components/DictatorPanel.vue` - UI action registration patterns
- `data/combatants.json` - Dictator ability text (Mao line 707, Mussolini line 720, Pol Pot line 759)

### Secondary (MEDIUM confidence)
- `src/rules/ai-helpers.ts` - AI placement logic (selectMilitiaPlacementSector, getRebelControlledSectors)
- `src/rules/actions/index.ts` - Action registration pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All APIs verified in codebase, exact line numbers documented
- Architecture: HIGH - Kim's pattern is fully implemented and working, directly replicable
- Pitfalls: HIGH - Based on actual codebase patterns and registration requirements
- Pol Pot combat loss: MEDIUM - No existing pattern for tracking combat outcome post-clear; needs new game state field

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (stable codebase, patterns well established)
