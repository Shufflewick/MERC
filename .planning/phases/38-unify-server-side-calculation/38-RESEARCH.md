# Phase 38: Unify Server-Side Calculation - Research

**Researched:** 2026-02-03
**Domain:** TypeScript refactoring, game state calculation
**Confidence:** HIGH

## Summary

This research examines the current `elements.ts` implementation to understand how to replace 20+ individual bonus fields with a unified `activeStatModifiers` computed property that reads from the registry established in Phase 37. The key insight is that Phase 37 completed the registry (`statModifiers` on all 18 MERCs and `getActiveStatModifiers()` function), so Phase 38 is purely about consuming that registry server-side.

The current implementation stores explicit bonus values (e.g., `boubaHandgunCombatBonus`, `mayhemUziCombatBonus`) on `CombatantBase`, updates them via individual `updateXBonus()` methods, and reads them in `updateComputedStats()`. The goal is to replace this with a single `updateAbilityBonuses()` method that calls `getActiveStatModifiers()` and caches the result in `activeStatModifiers`, then have `updateComputedStats()` read from that cached array.

**Primary recommendation:** Add `activeStatModifiers: StatModifier[]` property to `CombatantBase`, create unified `updateAbilityBonuses()` that builds the context and calls `getActiveStatModifiers()`, then modify `updateComputedStats()` to sum bonuses from the array. Keep existing bonus fields initially but deprecate them, removing in a later cleanup pass.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x | Type definitions | Already in use |
| boardsmith/engine | local | Game element framework | Core dependency |
| merc-abilities.ts | local | Registry with StatModifier | Phase 37 completed |

### Supporting
No additional libraries needed - this is a refactoring of existing code.

**Installation:**
```bash
# No new dependencies required
```

## Architecture Patterns

### Current Implementation (elements.ts lines 117-159)

20+ explicit bonus fields on `CombatantBase`:
```typescript
// Haarg's ability bonuses
haargTrainingBonus: number = 0;
haargInitiativeBonus: number = 0;
haargCombatBonus: number = 0;

// Sarge's ability bonuses
sargeTrainingBonus: number = 0;
sargeInitiativeBonus: number = 0;
sargeCombatBonus: number = 0;

// Equipment-conditional bonuses
boubaHandgunCombatBonus: number = 0;
mayhemUziCombatBonus: number = 0;
rozeskeArmorCombatBonus: number = 0;
// ... 10+ more fields
```

### Current Update Methods (elements.ts)

Multiple separate update methods:
- `updateHaargBonus(squadMates)` - lines 314-329
- `updateSargeBonus(squadMates)` - lines 334-357
- `updateTackSquadBonus(squadMates)` - lines 362-379
- `updateValkyrieSquadBonus(squadMates)` - lines 384-393
- `updateEquipmentBonuses()` - lines 398-434
- `updateSnakeBonus(squadMates)` - lines 439-452
- `updateTavistoBonus(squadMates)` - lines 457-470

### Current Stat Calculation (elements.ts lines 265-309)

`updateComputedStats()` manually adds each bonus field:
```typescript
// Training
let t = this.baseTraining;
t += this.getEquipValue(...); // equipment
if (this.combatantId === 'haarg') t += this.haargTrainingBonus || 0;
if (this.combatantId === 'sarge') t += this.sargeTrainingBonus || 0;
t += this.snakeSoloTrainingBonus || 0;
t += this.tavistoWomanTrainingBonus || 0;
this.effectiveTraining = t;

// Similar for combat, initiative
```

### Target Implementation Pattern

**Pattern 1: Cached Active Modifiers Property**

Add single property to store active modifiers:
```typescript
// After existing bonus fields (deprecate those later)
activeStatModifiers: StatModifier[] = [];
```

**Pattern 2: Unified Update Method**

Single method replaces all `updateXBonus()` methods:
```typescript
/**
 * Update ability bonuses from registry.
 * Call this when equipment changes or squad composition changes.
 */
updateAbilityBonuses(squadMates: CombatantBase[] = []): void {
  const context = this.buildStatModifierContext(squadMates);
  this.activeStatModifiers = getActiveStatModifiers(this.combatantId, context);
  this.updateComputedStats();
}

/**
 * Build the context object for getActiveStatModifiers.
 */
private buildStatModifierContext(squadMates: CombatantBase[]): StatModifierContext {
  return {
    equipment: {
      weapon: this.weaponSlot ? {
        name: this.weaponSlot.equipmentName,
        type: this.getWeaponCategory(),
        targets: this.weaponSlot.targets || 0,
      } : undefined,
      armor: this.armorSlot ? { name: this.armorSlot.equipmentName } : undefined,
      accessory: this.accessorySlot ? { name: this.accessorySlot.equipmentName } : undefined,
    },
    squadMates: squadMates.filter(m => m.combatantId !== this.combatantId && !m.isDead).map(m => ({
      combatantId: m.combatantId,
      baseCombat: m.baseCombat,
      baseInitiative: m.baseInitiative,
      baseTraining: m.baseTraining,
    })),
    isAlone: squadMates.filter(m => m.combatantId !== this.combatantId && !m.isDead).length === 0,
    hasWomanInSquad: squadMates.some(m => !m.isDead && FEMALE_MERCS.includes(m.combatantId)),
    isHighestInitInSquad: this.isHighestInitiativeInSquad(squadMates),
  };
}
```

**Pattern 3: Unified Stat Calculation**

`updateComputedStats()` reads from `activeStatModifiers`:
```typescript
updateComputedStats(): void {
  this.updateEquipmentData();

  // Get ability bonuses
  const combatBonus = this.getAbilityBonus('combat');
  const trainingBonus = this.getAbilityBonus('training');
  const initiativeBonus = this.getAbilityBonus('initiative');

  // Training
  let t = this.baseTraining;
  t += this.getEquipValue(...); // equipment bonuses
  t += trainingBonus;
  this.effectiveTraining = t;

  // Similar for combat, initiative
}

/**
 * Get total ability bonus for a stat from activeStatModifiers.
 */
private getAbilityBonus(stat: StatModifier['stat']): number {
  return this.activeStatModifiers
    .filter(m => m.stat === stat && (!m.target || m.target === 'self'))
    .reduce((sum, m) => sum + m.bonus, 0);
}
```

### Game.ts Integration Pattern

Current game.ts has `updateSquadBonuses(squad)` that calls individual update methods (lines 1207-1240). Replace with unified call:

```typescript
updateSquadBonuses(squad: Squad): void {
  if (!squad) return;
  const mercs = squad.getMercs();
  for (const merc of mercs) {
    merc.updateAbilityBonuses(mercs);
  }
}
```

### Anti-Patterns to Avoid

- **Breaking existing tests:** Keep existing bonus field assignments temporarily for backward compatibility
- **Circular updates:** `updateAbilityBonuses` should not call itself recursively through squad mate updates
- **Missing context fields:** The `StatModifierContext` must provide all fields needed for condition evaluation
- **Removing Haarg special case too early:** Haarg's `squadMateHigherBase` condition needs per-stat evaluation, not just "is condition met"

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Condition evaluation | Custom switch statements | `getActiveStatModifiers()` | Already implemented in Phase 37 |
| Equipment category checks | String matching | `equipment-effects.ts` helpers | `isHandgun()`, `isUzi()`, etc. already exist |
| Female MERC list | Hardcoded array | `FEMALE_MERCS` export | Already in merc-abilities.ts |
| Squad mate filtering | Manual loops | `squad.getMercs()` | Returns CombatantModel[] |

**Key insight:** Phase 37 did the hard work. Phase 38 just needs to call `getActiveStatModifiers()` and sum the results.

## Common Pitfalls

### Pitfall 1: Haarg's Per-Stat Condition

**What goes wrong:** Haarg's `squadMateHigherBase` condition returns true/false, but Haarg needs +1 per stat where a squad mate is higher, not a blanket +1/+1/+1.

**Why it happens:** Phase 37's `evaluateCondition()` for `squadMateHigherBase` just checks if squad mates exist.

**How to avoid:** For Haarg specifically, evaluate each stat's condition individually in `buildStatModifierContext()` or handle in `getAbilityBonus()` with special logic.

**Current Haarg handling (elements.ts lines 314-329):**
```typescript
updateHaargBonus(squadMates: CombatantBase[]): void {
  if (this.combatantId !== 'haarg') return;
  this.haargTrainingBonus = 0;
  this.haargInitiativeBonus = 0;
  this.haargCombatBonus = 0;

  for (const mate of squadMates) {
    if (mate.combatantId === 'haarg' || mate.isDead) continue;
    if (mate.baseTraining > this.baseTraining) this.haargTrainingBonus = 1;
    if (mate.baseInitiative > this.baseInitiative) this.haargInitiativeBonus = 1;
    if (mate.baseCombat > this.baseCombat) this.haargCombatBonus = 1;
  }
  this.updateComputedStats();
}
```

**Solution:** Keep Haarg's special case or add `hasHigherBaseTraining`, `hasHigherBaseCombat`, `hasHigherBaseInitiative` to context.

### Pitfall 2: Target Scope Not Filtered

**What goes wrong:** Squad-wide bonuses (Tack, Valkyrie) counted for self when they shouldn't be.

**Why it happens:** `getAbilityBonus()` doesn't filter by target correctly.

**How to avoid:** Filter by `target === 'self' || !target` for self-bonuses. Handle squad-wide bonuses separately.

**Valkyrie example:** Valkyrie gives +1 initiative to squad mates, NOT herself. The modifier has `target: 'squadMates'`.

### Pitfall 3: Equipment Context Not Correctly Built

**What goes wrong:** `hasUzi` condition fails because weapon type/name not correctly extracted.

**Why it happens:** Context expects `weapon.type` but equipment uses `weaponCategory` from equipment-effects.ts.

**How to avoid:** Use equipment-effects.ts helpers to determine weapon category:
```typescript
private getWeaponCategory(): string | undefined {
  const weaponId = this.weaponSlot?.equipmentId;
  if (!weaponId) return undefined;
  if (isHandgun(weaponId)) return 'handgun';
  if (isUzi(weaponId)) return 'uzi';
  if (isExplosive(weaponId)) return 'explosive';
  if (isSmaw(weaponId)) return 'smaw';
  // ... etc
}
```

### Pitfall 4: Double Updates on Equipment Change

**What goes wrong:** Equipping item triggers both `updateComputedStats()` (from equip()) and `updateAbilityBonuses()` (from squad update), causing stale data.

**Why it happens:** Order of operations not clear.

**How to avoid:** `equip()` should call `updateAbilityBonuses()` which internally calls `updateComputedStats()`.

Current flow (elements.ts line 720-721):
```typescript
this.syncEquipmentData();
this.updateComputedStats();
```

New flow:
```typescript
this.syncEquipmentData();
this.updateAbilityBonuses(/* get squad mates somehow */);  // This calls updateComputedStats internally
```

**Issue:** `equip()` doesn't have access to squad mates. Need to either:
1. Pass squad mates to equip, or
2. Get squad from parent, or
3. Call `updateAbilityBonuses` from game.ts after equip

### Pitfall 5: Explosive Check Location Mismatch

**What goes wrong:** Stumpy's explosive bonus not triggered because explosives are in accessory slot, not weapon slot.

**Current check (elements.ts lines 417-426):**
```typescript
if (this.combatantId === 'stumpy') {
  const accessoryId = this.accessorySlot?.equipmentId || this.accessorySlotData?.equipmentId;
  const hasExplosiveInAccessory = accessoryId && isExplosive(accessoryId);
  const hasExplosiveInBandolier = this.bandolierSlots.some(...);
  if (hasExplosiveInAccessory || hasExplosiveInBandolier) {
    this.stumpyExplosiveCombatBonus = 1;
  }
}
```

**Phase 37 context expects:** `equipment.weapon.type === 'grenade' || equipment.weapon.type === 'mortar'`

**How to avoid:** Extend context to include accessory explosive check or adjust `evaluateCondition()` for `hasExplosive`.

## Code Examples

Verified patterns from the existing codebase:

### Phase 37 getActiveStatModifiers (merc-abilities.ts lines 1018-1028)
```typescript
// Source: src/rules/merc-abilities.ts
export function getActiveStatModifiers(
  combatantId: string,
  context: StatModifierContext = {}
): StatModifier[] {
  const ability = MERC_ABILITIES[combatantId];
  if (!ability?.statModifiers) return [];

  return ability.statModifiers.filter(mod =>
    evaluateCondition(mod.condition, context)
  );
}
```

### Phase 37 StatModifier Interface (merc-abilities.ts lines 86-97)
```typescript
// Source: src/rules/merc-abilities.ts
export interface StatModifier {
  stat: 'combat' | 'training' | 'initiative' | 'health' | 'targets' | 'actions';
  bonus: number;
  condition?: AbilityCondition;
  label?: string;
  target?: BonusTarget;
}
```

### Phase 37 StatModifierContext (merc-abilities.ts lines 944-964)
```typescript
// Source: src/rules/merc-abilities.ts
export interface StatModifierContext {
  equipment?: {
    weapon?: { name: string; type?: string; targets?: number };
    armor?: { name: string };
    accessory?: { name: string };
  };
  squadMates?: Array<{
    combatantId: string;
    baseCombat: number;
    baseInitiative: number;
    baseTraining: number;
  }>;
  isAlone?: boolean;
  hasWomanInSquad?: boolean;
  isHighestInitInSquad?: boolean;
}
```

### Equipment Effect Helpers (equipment-effects.ts)
```typescript
// Source: src/rules/equipment-effects.ts
export function isHandgun(equipmentId: string): boolean;
export function isUzi(equipmentId: string): boolean;
export function isExplosive(equipmentId: string): boolean;
export function isSmaw(equipmentId: string): boolean;
export function isArmor(equipmentId: string): boolean;
```

### Current updateComputedStats Pattern (elements.ts lines 265-309)
```typescript
// Source: src/rules/elements.ts
updateComputedStats(): void {
  this.updateEquipmentBonuses();

  const ability = getMercAbility(this.combatantId);
  const extraHealth = ability?.passive?.extraHealth || 0;
  this.effectiveMaxHealth = CombatantBase.BASE_HEALTH + extraHealth;

  // Training
  let t = this.baseTraining;
  t += this.getEquipValue(this.weaponSlot, this.weaponSlotData, 'training');
  // ... add equipment
  if (this.combatantId === 'haarg') t += this.haargTrainingBonus || 0;
  if (this.combatantId === 'sarge') t += this.sargeTrainingBonus || 0;
  t += this.snakeSoloTrainingBonus || 0;
  t += this.tavistoWomanTrainingBonus || 0;
  this.effectiveTraining = t;

  // Initiative, Combat similar...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-MERC if statements | MERC_ABILITIES registry | v1.0 | Centralized ability data |
| Separate bonus fields | Still in use | Phase 38 target | Single activeStatModifiers property |
| Multiple updateXBonus methods | Still in use | Phase 38 target | Single updateAbilityBonuses method |

**Pattern to preserve:**
- `getMercAbility()` lookup
- `getActiveStatModifiers(merc, context)` from Phase 37
- Equipment slot getters (`weaponSlot`, `armorSlot`, etc.)

**Pattern to replace:**
- 20+ explicit bonus fields -> `activeStatModifiers: StatModifier[]`
- 7 `updateXBonus()` methods -> `updateAbilityBonuses(squadMates)`
- Hardcoded bonus additions in `updateComputedStats()` -> `getAbilityBonus(stat)` helper

## Implementation Strategy

### Step 1: Add New Properties and Methods

1. Import `StatModifier`, `getActiveStatModifiers`, `StatModifierContext`, `FEMALE_MERCS` from merc-abilities.ts
2. Add `activeStatModifiers: StatModifier[] = []` property
3. Add `updateAbilityBonuses(squadMates)` method
4. Add `buildStatModifierContext(squadMates)` private helper
5. Add `getAbilityBonus(stat)` private helper

### Step 2: Modify updateComputedStats

1. Replace hardcoded bonus additions with `getAbilityBonus()` calls
2. Keep calling `updateEquipmentBonuses()` temporarily for backward compatibility
3. Special handling for Haarg (per-stat condition) and squad-wide targets

### Step 3: Modify Game.ts

1. Replace individual update method calls with single `updateAbilityBonuses()` call
2. Ensure squad bonus updates happen after equipment changes

### Step 4: Deprecate Old Fields/Methods

1. Keep existing bonus fields temporarily (allows rollback)
2. Add JSDoc deprecation comments
3. Remove in Phase 41 cleanup after tests verify everything works

## Open Questions

Things that require decisions during planning:

1. **Haarg Per-Stat Handling**
   - What we know: Haarg needs +1 per stat where squad mate is higher, evaluated independently
   - Options:
     A) Add `hasHigherBaseCombat`, `hasHigherBaseTraining`, `hasHigherBaseInitiative` to context
     B) Keep special Haarg handling in `getAbilityBonus()`
     C) Modify `evaluateCondition()` in merc-abilities.ts to accept the stat being checked
   - Recommendation: Option B (least invasive, Haarg is unique)

2. **Stumpy Explosive Location**
   - What we know: Explosives are accessories, not weapons. Context expects weapon type.
   - Options:
     A) Extend context with `hasExplosiveEquipped` boolean
     B) Modify `evaluateCondition()` to check accessory/bandolier
     C) Keep special Stumpy handling in `updateEquipmentBonuses()`
   - Recommendation: Option A (cleanest, keeps Phase 37 changes minimal)

3. **Squad Access from equip()**
   - What we know: `equip()` needs to trigger bonus recalculation but doesn't have squad
   - Options:
     A) Get squad from parent: `const squad = this.parent instanceof Squad ? this.parent : undefined`
     B) Defer to game.ts: equip() just updates stats, game.ts calls updateAbilityBonuses after
     C) Pass squad to equip()
   - Recommendation: Option A (simplest, parent is already used for sectorId)

4. **Target Filtering**
   - What we know: Some modifiers have `target: 'squadMates'` (Valkyrie), `target: 'allSquad'` (Tack)
   - Question: Should `activeStatModifiers` include all modifiers or just self-affecting ones?
   - Recommendation: Include all, filter in `getAbilityBonus()` - UI needs full list for Phase 39

## Sources

### Primary (HIGH confidence)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/rules/elements.ts` - CombatantBase class (lines 86-769)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/rules/merc-abilities.ts` - Phase 37 work (StatModifier, getActiveStatModifiers)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/rules/game.ts` - updateSquadBonuses (lines 1207-1240)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/.planning/REQUIREMENTS.md` - STAT-02 acceptance criteria
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/.planning/ROADMAP.md` - Phase 38 deliverables

### Secondary (MEDIUM confidence)
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/src/rules/equipment-effects.ts` - Weapon category helpers
- `/Users/jtsmith/Dropbox/MERC/BoardSmith/MERC/tests/merc-abilities-integration.test.ts` - Existing test patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Pure TypeScript refactoring, no new dependencies
- Architecture: HIGH - Clear extension of Phase 37 patterns
- Pitfalls: HIGH - Based on direct code analysis of current implementation

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (stable codebase, internal refactoring)
