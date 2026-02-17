# Phase 57: Simple Hire Abilities - Research

**Researched:** 2026-02-17
**Domain:** Dictator per-turn hire abilities (Gaddafi, Stalin)
**Confidence:** HIGH

## Summary

Phase 57 implements per-turn hire abilities for Gaddafi and Stalin, following the established Castro pattern. The codebase already has a complete two-path architecture: AI dictators use `applyDictatorTurnAbilities()` in `dictator-abilities.ts` (auto-applied via `execute()` in flow), while human dictators use registered BoardSmith actions in `dictator-actions.ts` (offered via the `dictator-ability` action step in flow).

Both paths must be implemented for each new dictator. The existing Castro hire and Kim militia patterns are well-established with clear separation of concerns. Gaddafi's hire is nearly identical to Castro's (simpler, actually -- 1 random MERC instead of pick-from-3). Stalin adds a conditional second hire based on `baseRevealed` state.

**Primary recommendation:** Follow the Castro two-path pattern exactly. Add `gadafiBonusHire` and `stalinBonusHire` action names to the flow step's actions array alongside existing `castroBonusHire` and `kimBonusMilitia`. Add corresponding AI-path functions to `applyDictatorTurnAbilities()` switch statement.

## Standard Stack

No new libraries needed. This phase modifies existing files only.

### Files to Modify

| File | Purpose | Change |
|------|---------|--------|
| `src/rules/dictator-abilities.ts` | AI-path ability functions | Add `applyGadafiTurnAbility()`, `applyStalinTurnAbility()`, update switch in `applyDictatorTurnAbilities()` |
| `src/rules/actions/dictator-actions.ts` | Human-path action definitions | Add `createGadafiBonusHireAction()`, `createStalinBonusHireAction()` |
| `src/rules/actions/index.ts` | Action registration | Import and register new actions |
| `src/rules/flow.ts` | Flow step | Add action names to dictator-ability step (line 961) |
| `src/ui/components/DictatorPanel.vue` | UI action routing | Add new action names to `dictatorSpecificActions` array (line 128) |
| `src/ui/composables/useActionState.ts` | UI state detection | Add new action names to hiring action arrays |
| `src/ui/components/GameTable.vue` | UI hiring state | Add new action names to `hiringActions` array (line 903) |

## Architecture Patterns

### Pattern 1: Two-Path Dictator Ability (Castro Reference)

The dictator ability system has two distinct code paths:

**AI Path** (in `dictator-abilities.ts`):
- Called from `applyDictatorTurnAbilities()` which is triggered by `execute()` in flow.ts line 952-954
- Runs only when `game.dictatorPlayer?.isAI === true`
- Performs the entire ability automatically (draw, select, place, equip)
- Returns `DictatorAbilityResult`

**Human Path** (in `dictator-actions.ts`):
- BoardSmith action with `.condition()`, `.chooseFrom()`, `.execute()`
- Listed in the flow's `dictator-ability` action step (flow.ts line 959-963)
- Skipped when `game.dictatorPlayer?.isAI === true`
- Presents choices to the player via UI

**Flow step (line 948-963):**
```typescript
// Step 3: Apply per-turn dictator special ability
execute(() => {
  if (game.isFinished()) return;
  if (game.dictatorPlayer?.isAI) {
    applyDictatorTurnAbilities(game);  // AI path
  }
  // Human players use the actionStep below
}),

// Human dictator ability choice (skipped for AI)
actionStep({
  name: 'dictator-ability',
  actions: ['castroBonusHire', 'kimBonusMilitia'],  // <-- ADD NEW ACTIONS HERE
  skipIf: () => game.isFinished() || game.dictatorPlayer?.isAI === true,
}),
```

### Pattern 2: Gaddafi Hire (Simpler than Castro)

Gaddafi's ability: "Once per turn, hire 1 random MERC."

This is simpler than Castro (who draws 3 and picks 1). For Gaddafi:
- AI: Draw 1 random MERC, place in first available squad, equip, done
- Human: Draw 1 random MERC (no choice on which), choose equipment type, choose sector

Key difference from Castro: No `chooseFrom` for MERC selection (only 1 is drawn). Human still chooses equipment type and deployment sector.

### Pattern 3: Stalin Hire (Conditional Second Hire)

Stalin's ability: "Once per turn, hire 1 random MERC to primary squad; if base revealed, also hire 1 to secondary squad."

Two hires per turn when base is revealed:
- First hire always goes to primary squad
- Second hire (conditional on `game.dictatorPlayer.baseRevealed`) goes to secondary squad
- Each hire needs its own equipment

**Base revealed check:** `game.dictatorPlayer.baseRevealed` (boolean on MERCPlayer, line 169 of game.ts). Set to true when base-reveal tactics card is played or Kim's setup ability runs.

### Pattern 4: Squad Placement

How MERCs are placed into squads:

```typescript
// Put MERC into squad
selectedMerc.putInto(targetSquad);

// Set squad location
targetSquad.sectorId = targetSector.sectorId;

// Equip the MERC (shared helper handles Apeiron/Vrbansk abilities)
equipNewHire(game, selectedMerc, equipType);

// Emit animation event for map
emitMapCombatantEntries(game, [
  buildMapCombatantEntry(selectedMerc, targetSector.sectorId),
]);

// Update squad ability bonuses (Sarge, Tack, Valkyrie, etc.)
game.updateAllSargeBonuses();
```

### Pattern 5: Drawing a Random MERC

```typescript
const merc = game.drawMerc();  // Returns CombatantModel | undefined
// Drawn MERC lands in mercDiscard as holding area
// Caller must putInto() the final destination (squad or discard)
```

### Anti-Patterns to Avoid

- **Don't create a new action step in flow.ts:** All dictator per-turn abilities share the SAME action step. Add the new action names to the existing `actions` array.
- **Don't skip the human path:** Even if AI is the primary use case, human dictator support is required (the action step skips for AI automatically).
- **Don't forget UI registration:** New action names must be added to `DictatorPanel.vue`, `useActionState.ts`, and `GameTable.vue` arrays or the UI won't route them correctly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MERC drawing | Custom deck logic | `game.drawMerc()` | Handles empty deck reshuffling automatically |
| Equipment for new hire | Manual equip logic | `equipNewHire(game, merc, type)` | Handles Apeiron/Vrbansk ability interactions |
| Sector placement (AI) | Custom placement | `selectNewMercLocation(game)` | Follows AI rules 4.3.2 for optimal placement |
| Map animation | Custom events | `emitMapCombatantEntries()` + `buildMapCombatantEntry()` | Standard pattern for MERC appearing on map |
| Squad bonus updates | Manual recalc | `game.updateAllSargeBonuses()` | Handles all squad-based ability bonuses |
| Cached values | Custom state | `getGlobalCachedValue` / `setGlobalCachedValue` / `clearGlobalCachedValue` | For persisting drawn MERC IDs across action selections |

## Common Pitfalls

### Pitfall 1: Forgetting to discard unused MERCs
**What goes wrong:** If Castro draws 3 and hires 1, the other 2 must be discarded to `game.mercDiscard`. Gaddafi only draws 1, so no discard needed. But Stalin draws 1 or 2 -- all hired, none discarded (unless squads are full).
**How to avoid:** Always handle the "squads full" case by discarding drawn MERCs.

### Pitfall 2: Stale squad sectorIds
**What goes wrong:** Dead squads retain stale `sectorId` values. Checking `primarySquad.sectorId` without checking for living mercs leads to phantom squad locations.
**How to avoid:** Check `squad.getLivingMercs().length > 0` before trusting `squad.sectorId`. The Castro action already demonstrates this pattern (line 354-355 of dictator-actions.ts).

### Pitfall 3: Not updating squad sectorId on placement
**What goes wrong:** A MERC is put into a squad via `putInto()` but the squad's `sectorId` isn't updated to the target sector. The MERC appears in limbo.
**How to avoid:** Always set `targetSquad.sectorId = targetSector.sectorId` after `putInto()`.

### Pitfall 4: Missing UI action routing
**What goes wrong:** Action works in tests but UI doesn't show the choices or shows wrong panel.
**How to avoid:** Add action name to ALL three UI files:
1. `DictatorPanel.vue` line 128: `dictatorSpecificActions` array
2. `useActionState.ts` line 246: `hiringActions` array
3. `GameTable.vue` line 903: `hiringActions` array
4. `DictatorPanel.vue` line 152: conditional for showing dictator-specific action UI

### Pitfall 5: Stalin's second hire when secondary squad is full
**What goes wrong:** Base is revealed, Stalin tries to hire to secondary squad, but it's full. Need to handle gracefully.
**How to avoid:** Check `!secondarySquad.isFull` before the second hire. If full, skip or discard.

## Code Examples

### AI-Path: Gaddafi Turn Ability (based on Castro pattern)

```typescript
export function applyGadafiTurnAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'gadafi') {
    return { success: false, message: 'Not Gaddafi' };
  }

  const merc = game.drawMerc();
  if (!merc) {
    game.message('Gaddafi: No MERCs available to hire');
    return { success: false, message: 'No MERCs available' };
  }

  const primarySquad = game.dictatorPlayer.primarySquad;
  const secondarySquad = game.dictatorPlayer.secondarySquad;
  const targetSquad = !primarySquad.isFull ? primarySquad
    : !secondarySquad.isFull ? secondarySquad
    : null;

  if (!targetSquad) {
    merc.putInto(game.mercDiscard);
    game.message('Gaddafi: All squads full, cannot hire');
    return { success: false, message: 'All squads full' };
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

  game.message(`Gaddafi hired ${merc.combatantName}`);
  return { success: true, message: `Hired ${merc.combatantName}` };
}
```

### AI-Path: Stalin Turn Ability

```typescript
export function applyStalinTurnAbility(game: MERCGame): DictatorAbilityResult {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.combatantId !== 'stalin') {
    return { success: false, message: 'Not Stalin' };
  }

  // First hire: always to primary squad
  const merc1 = game.drawMerc();
  if (merc1) {
    const primarySquad = game.dictatorPlayer.primarySquad;
    if (!primarySquad.isFull) {
      merc1.putInto(primarySquad);
      const targetSector = selectNewMercLocation(game);
      if (targetSector) primarySquad.sectorId = targetSector.sectorId;
      let equipType: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
      if (merc1.weaponSlot) equipType = merc1.armorSlot ? 'Accessory' : 'Armor';
      equipNewHire(game, merc1, equipType);
      game.message(`Stalin hired ${merc1.combatantName} to primary squad`);
    } else {
      merc1.putInto(game.mercDiscard);
      game.message('Stalin: Primary squad full, cannot hire');
    }
  }

  // Second hire: only if base is revealed, to secondary squad
  if (game.dictatorPlayer.baseRevealed) {
    const merc2 = game.drawMerc();
    if (merc2) {
      const secondarySquad = game.dictatorPlayer.secondarySquad;
      if (!secondarySquad.isFull) {
        merc2.putInto(secondarySquad);
        const targetSector = selectNewMercLocation(game);
        if (targetSector) secondarySquad.sectorId = targetSector.sectorId;
        let equipType: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
        if (merc2.weaponSlot) equipType = merc2.armorSlot ? 'Accessory' : 'Armor';
        equipNewHire(game, merc2, equipType);
        game.message(`Stalin hired ${merc2.combatantName} to secondary squad`);
      } else {
        merc2.putInto(game.mercDiscard);
        game.message('Stalin: Secondary squad full, cannot hire');
      }
    }
  }

  return { success: true, message: 'Stalin hire complete' };
}
```

### Human-Path: Action Registration Pattern

```typescript
// In dictator-actions.ts
export function createGadafiBonusHireAction(game: MERCGame): ActionDefinition {
  return Action.create('gadafiBonusHire')
    .prompt("Gaddafi's Ability: Hire a MERC")
    .condition({
      'is dictator player': (ctx) => game.isDictatorPlayer(ctx.player),
      'is Gaddafi': () => game.dictatorPlayer?.dictator?.combatantId === 'gadafi',
      'is human player': () => !game.dictatorPlayer?.isAI,
    })
    // ... chooseFrom for equipmentType, targetSector (follow Castro pattern)
    .execute((args) => { /* ... */ });
}

// In index.ts registration
game.registerAction(createGadafiBonusHireAction(game));
game.registerAction(createStalinBonusHireAction(game));

// In flow.ts action step
actionStep({
  name: 'dictator-ability',
  actions: ['castroBonusHire', 'kimBonusMilitia', 'gadafiBonusHire', 'stalinBonusHire'],
  skipIf: () => game.isFinished() || game.dictatorPlayer?.isAI === true,
}),
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Dictator-specific MERC actions | Unified actions for both roles | Phase 17 | move, explore, train, etc. work for both rebel and dictator |
| Manual equipment assignment | `equipNewHire()` helper | Recent | Handles Apeiron/Vrbansk ability edge cases |

## Open Questions

1. **Gaddafi's human action: Should the drawn MERC name be shown?**
   - Since Gaddafi draws only 1 random MERC (no choice), the human player still sees who was drawn but only chooses equipment and sector
   - Recommendation: Show the MERC name as a read-only info field or single-choice `chooseFrom` (like Castro with only 1 option), then proceed to equipment/sector choices

2. **Stalin's human action: One action or two sequential?**
   - Stalin hires up to 2 MERCs. Could be one complex action with conditional second set of choices, or two separate actions
   - Recommendation: Single action `stalinBonusHire` that handles both hires. If base is not revealed, the second hire choices are skipped (use `(skipped)` pattern from playTactics action). This keeps the flow step simple.

3. **Note on Gaddafi's reactive ability (equipment looting)**
   - Phase 57 only covers the per-turn hire. The reactive "loot killed MERC equipment" part is Phase 60 (REACT-02). Do NOT implement it here.

## Sources

### Primary (HIGH confidence)
- `src/rules/dictator-abilities.ts` - Full AI-path implementation for Castro and Kim
- `src/rules/actions/dictator-actions.ts` - Full human-path implementation for Castro and Kim
- `src/rules/flow.ts` lines 948-985 - Flow step for dictator abilities
- `src/rules/actions/index.ts` - Action registration pattern
- `src/rules/game.ts` line 169 - `baseRevealed` property on MERCPlayer
- `data/combatants.json` lines 661-776 - Gaddafi and Stalin ability text

### Secondary (HIGH confidence)
- `src/ui/components/DictatorPanel.vue` line 128, 152 - UI routing for dictator actions
- `src/ui/composables/useActionState.ts` lines 172, 229, 246, 323 - Action state detection
- `src/ui/components/GameTable.vue` line 903 - Hiring action UI state

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All patterns directly observable in existing code
- Architecture: HIGH - Two-path system (AI + human) is well-established with Castro/Kim
- Pitfalls: HIGH - Derived from actual bugs and patterns in existing code

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (stable codebase, no external dependencies)
