# Phase 56: Data Foundation - Research

**Researched:** 2026-02-17
**Domain:** Game data model, dictator selection UI, combatants.json structure
**Confidence:** HIGH

## Summary

Phase 56 adds the 9 expansion dictators (Gaddafi, Hitler, Hussein, Mao, Mussolini, Noriega, Pinochet, Pol Pot, Stalin) to `combatants.json` and updates the dictator selection UI to present all 11 dictators. This is a data-only phase -- no ability implementations.

The codebase already has complete infrastructure for this: the `combatants.json` format is well-defined with Castro and Kim as examples, all 11 dictator images already exist in `public/dictators/`, the dictator selection action (`selectDictator`) dynamically reads from `combatantData` filtered by `cardType === 'dictator'`, and the game options dropdown in `src/rules/index.ts` has a hardcoded choices array that needs updating. The expansion dictator stats and ability text are available in `data/expansion dictators.csv`.

**Primary recommendation:** Add 9 entries to `combatants.json` using the CSV data, update the `gameOptions.dictatorCharacter.choices` array in `src/rules/index.ts`, and update `DictatorAbilityType` in `dictator-abilities.ts`. The existing `default` case in ability dispatchers already handles unknown dictators gracefully (no-op).

## Standard Stack

No new libraries needed. This phase is purely data and configuration changes.

### Core Files to Modify
| File | Purpose | Change Needed |
|------|---------|---------------|
| `data/combatants.json` | All MERC and dictator data | Add 9 dictator entries |
| `src/rules/index.ts` | Game definition with lobby options | Add 9 dictators to `dictatorCharacter.choices` |
| `src/rules/dictator-abilities.ts` | `DictatorAbilityType` union type | Expand type to include all 9 new IDs |

### Files That Need NO Changes (Dynamic Already)
| File | Why No Change Needed |
|------|---------------------|
| `src/rules/setup.ts` | `setupDictator()` reads from `dictatorData` array -- works with any dictator entry |
| `src/rules/actions/day-one-actions.ts` | `selectDictator` action reads `game.combatantData.filter(d => d.cardType === 'dictator')` dynamically |
| `src/rules/game.ts` | `performSetup()` filters combatantData -- no hardcoded dictator list |
| `src/rules/flow.ts` | `skipIf` checks are for Kim specifically, not exclusive -- new dictators hit the `default` branch safely |

## Architecture Patterns

### Dictator Data Entry Format

Dictator entries in `combatants.json` follow this exact structure (from Castro/Kim examples):

```json
{
  "id": "castro",
  "cardType": "dictator",
  "name": "Castro",
  "quantity": 1,
  "training": 2,
  "combat": 2,
  "initiative": 2,
  "ability": "Once per turn, draw 3 random MERCs and hire 1.",
  "bio": "President, Cuba, 1959-2008",
  "image": "/dictators/castro.png",
  "sex": "M"
}
```

Key conventions:
- `id` is lowercase, no spaces (e.g., `polpot` not `pol-pot`)
- `image` path is `/dictators/{id}.png` (relative to public/)
- `sex` field is `"M"` for all dictators (optional field, only some MERCs have it)
- `quantity` is always `1`
- `ability` is the full text description of the dictator's special ability

### Image Naming Convention

Images in `public/dictators/` use these filenames (already present):
- `gadafi.png` (NOTE: single 'd', not 'gaddafi')
- `hitler.png`
- `hussein.png`
- `mao.png`
- `mussolini.png`
- `noriega.png`
- `pinochet.png`
- `polpot.png` (no space/hyphen)
- `stalin.png`

**CRITICAL:** The dictator `id` in JSON must match the image filename. Use `gadafi` (not `gaddafi`) and `polpot` (not `pol-pot` or `pol_pot`) to match existing images.

### Lobby Game Options Format

The `dictatorCharacter` option in `src/rules/index.ts` line 197 is:

```typescript
dictatorCharacter: {
  type: 'select',
  label: 'Dictator Character',
  description: 'Choose which dictator the rebels face',
  default: 'random',
  choices: [
    { value: 'random', label: 'Random' },
    { value: 'castro', label: 'Castro - Hire MERCs each turn' },
    { value: 'kim', label: 'Kim - Extra militia reinforcements' },
  ],
},
```

Each new dictator needs a `{ value: id, label: 'Name - Short ability summary' }` entry.

### Ability Dispatcher Default Cases

Both dispatchers in `dictator-abilities.ts` have safe `default` branches:

```typescript
// applyDictatorSetupAbilities (line 278)
default:
  game.message(`Dictator ability: ${dictator.ability}`);

// applyDictatorTurnAbilities (line 298)
default:
  // Unknown dictator - no special handling
  break;
```

This means new dictators will function as stat-only combatants with no crashes. Their ability text will be displayed but not executed, which satisfies the phase success criteria.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dictator data format | New data schema | Existing `combatants.json` format with same fields as Castro/Kim | The entire pipeline (setup, actions, UI) reads this format |
| Selection UI | Custom dictator picker | Existing `selectDictator` action + `chooseFrom` | Already dynamically reads from combatantData |
| Ability stubs | Placeholder ability functions | Existing `default` cases in dispatchers | They already no-op for unknown dictators |

## Common Pitfalls

### Pitfall 1: ID/Image Filename Mismatch
**What goes wrong:** Dictator image doesn't load on the board because `id` doesn't match the image filename.
**Why it happens:** The CSV data says "Gaddafi" but the image file is `gadafi.png` (single 'd'). Similarly "Pol Pot" maps to `polpot.png`.
**How to avoid:** Use `gadafi` as the ID (matching the image filename), not `gaddafi`.
**Warning signs:** Broken image on dictator card in game.

### Pitfall 2: Forgetting to Update DictatorAbilityType
**What goes wrong:** TypeScript type `DictatorAbilityType = 'castro' | 'kim'` doesn't include new IDs.
**Why it happens:** The type is used in `dictator-abilities.ts` but not enforced at the dispatcher switch -- the `default` branch handles it. However, future phases that implement abilities will need the type to be correct.
**How to avoid:** Expand the type now: `'castro' | 'kim' | 'gadafi' | 'hitler' | 'hussein' | 'mao' | 'mussolini' | 'noriega' | 'pinochet' | 'polpot' | 'stalin'`
**Warning signs:** TypeScript errors in future phases when checking dictator identity.

### Pitfall 3: Lobby Dropdown Too Long Without Useful Info
**What goes wrong:** Players see 11 dictators in a dropdown with no way to distinguish them.
**Why it happens:** Each label needs a short ability description to help players choose.
**How to avoid:** Use format `'Name - Short ability summary'` like existing entries do.

### Pitfall 4: Missing sex Field
**What goes wrong:** Minor inconsistency -- Castro and Kim have `"sex": "M"` but new entries might omit it.
**Why it happens:** The `sex` field is optional in `CombatantData` interface.
**How to avoid:** Include `"sex": "M"` for all dictators for consistency, since both existing dictators have it.

### Pitfall 5: Ability Text Doesn't Match Requirements
**What goes wrong:** Ability text in JSON differs from requirements document, causing confusion when implementing ability code in later phases.
**Why it happens:** CSV has raw game-card text, requirements doc has clarified/reworded versions.
**How to avoid:** Use the CSV ability text (game-card canonical text) in `combatants.json`. Implementation details live in requirements.

## Code Examples

### Adding a Dictator Entry to combatants.json

```json
{
  "id": "gadafi",
  "cardType": "dictator",
  "name": "Gaddafi",
  "quantity": 1,
  "training": 2,
  "combat": 2,
  "initiative": 2,
  "ability": "Once per turn, hire 1 random MERC. When your forces kill a MERC you may freely equip their equipment on your MERCs in the sector rather than discarding it.",
  "bio": "Brotherly Leader, Libya, 1977-2011",
  "image": "/dictators/gadafi.png",
  "sex": "M"
}
```

### Adding a Lobby Option Entry

```typescript
{ value: 'gadafi', label: 'Gaddafi - Hire MERCs + loot equipment' },
```

### Expanded DictatorAbilityType

```typescript
export type DictatorAbilityType =
  | 'castro' | 'kim'
  | 'gadafi' | 'hitler' | 'hussein' | 'mao'
  | 'mussolini' | 'noriega' | 'pinochet' | 'polpot' | 'stalin';
```

## Expansion Dictator Data (from CSV)

Source: `data/expansion dictators.csv`

| ID | Name | Init | Combat | Training | Ability (abbreviated) |
|----|------|------|--------|----------|----------------------|
| gadafi | Gaddafi | 2 | 2 | 2 | Hire 1 MERC/turn + loot killed MERC equipment |
| hitler | Hitler | 0 | 3 | 3 | Hire 1 MERC/turn + auto-initiative vs chosen rebel |
| hussein | Hussein | 4 | 1 | 1 | Start with 10 tactics cards + play 2nd tactics/turn |
| mao | Mao | 2 | 1 | 3 | Start with 1 MERC/rebel + militia to wilderness |
| mussolini | Mussolini | 3 | 0 | 3 | Start with 1 MERC/rebel + militia + move militia |
| noriega | Noriega | 1 | 4 | 1 | Convert rebel militia + conditional MERC hire |
| pinochet | Pinochet | 1 | 3 | 2 | Hire MERC on sector loss + distribute damage |
| polpot | Pol Pot | 2 | 2 | 2 | Militia to rebel sector + hire MERC on combat loss |
| stalin | Stalin | 2 | 3 | 1 | Hire 1 MERC to primary + 1 to secondary if base revealed |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Only 2 dictators hardcoded | Dynamic dictator selection from combatantData | Already in codebase | Adding new dictators is data-driven |
| Dictator choice in game constructor | `selectDictator` action in Day 1 flow | Already in codebase | Human players choose during game, AI gets random |

## Open Questions

1. **Name display: "Gaddafi" vs "Gadafi"**
   - What we know: Image file is `gadafi.png`, CSV says "Gaddafi" as display name
   - Resolution: Use `gadafi` as the `id` (matches image), `Gaddafi` as the `name` (display text). This matches the Castro pattern where `id` and display `name` can differ.

2. **Bio text encoding**
   - What we know: CSV bio text is straightforward but the "Fuhrer" has special characters
   - Resolution: Use proper Unicode -- the CSV already has the umlaut in the actual text.

## Sources

### Primary (HIGH confidence)
- `data/combatants.json` - Existing dictator entry format (Castro, Kim)
- `data/expansion dictators.csv` - All 9 expansion dictator stats and abilities
- `src/rules/setup.ts` - `setupDictator()` function reads from data array
- `src/rules/dictator-abilities.ts` - Ability dispatchers with safe default cases
- `src/rules/actions/day-one-actions.ts` - `selectDictator` action reads combatantData dynamically
- `src/rules/index.ts` - Game definition with `dictatorCharacter` choices
- `public/dictators/` - All 11 dictator images already present

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` - DATA-01, DATA-02 requirements

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All files inspected, format verified from existing entries
- Architecture: HIGH - Existing code paths verified, dynamic reading confirmed
- Pitfalls: HIGH - Verified image filenames vs CSV names, checked all code paths

**Research date:** 2026-02-17
**Valid until:** Indefinite (data format is stable, codebase structure is established)
