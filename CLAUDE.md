# MERC Codebase Guide

Quick reference for navigating the MERC board game codebase.

## Hard Rules
- Do not ever start a server unless I tell you to. And if you do start a server, kill it before coming back to me. Don't leave it running for me, I do not want it.

## Overview

MERC is a strategic combat board game built on the @boardsmith/engine framework. Players control mercenary squads fighting against (or as) a dictator on a hex grid map.

## Architecture

```
UI Layer (Vue 3)     → src/ui/components/*.vue
    ↓
Action Layer         → src/rules/actions/*.ts
    ↓
Rules Layer          → src/rules/*.ts (game.ts, combat.ts, flow.ts)
    ↓
Data Layer           → data/*.json (combatants, equipment, sectors)
```

**Key patterns:**
- Action-based state mutations via `Action.create()` builders
- Turn-based flow with phases: landing → daily turns → combat
- Configuration-driven: game entities in JSON, rules in TypeScript

## Class Hierarchy

### Combatants (MERCs and Dictators)

```
CombatantBase (abstract)
├── combatantId/combatantName - canonical identity
├── baseInitiative/baseTraining/baseCombat - stats from JSON
├── damage, actionsRemaining - runtime state
├── Equipment slots (weapon, armor, accessory, bandolier[])
└── effectiveStats computed from base + equipment + abilities

CombatantModel extends CombatantBase  ← USE THIS FOR ALL COMBATANTS
├── _combatantId/_combatantName - stored identity
├── cardType: 'merc' | 'dictator' - discriminator
├── isMerc/isDictator - type checks (use these for filtering)
├── inPlay - dictators start false, enter play when base revealed
└── Special equip rules (Gunther accessories, Genesis weapons)
```

**Important:** Use `CombatantModel` for all type annotations and element queries. Filter with `.isMerc` or `.isDictator` properties.

### Game Structure

```
MERCGame extends Game
├── gameMap: GameMap (Grid of Sectors)
├── mercDeck, weaponsDeck, armorDeck, accessoriesDeck
├── dictatorPlayer: MERCPlayer (role='dictator')
├── rebelPlayers: MERCPlayer[] (role='rebel')
└── Combat state (activeCombat, pendingCombat)

MERCPlayer extends Player
├── role: 'rebel' | 'dictator'
├── primarySquad, secondarySquad (both roles)
├── baseSquad (dictator only)
├── dictator: CombatantModel (dictator only)
└── team: CombatantModel[] (living MERCs)
```

## Key File Locations

| Purpose | Location |
|---------|----------|
| Game class, player class | `src/rules/game.ts` |
| Combatant classes | `src/rules/elements.ts` |
| Combat system | `src/rules/combat.ts` |
| Game flow/phases | `src/rules/flow.ts` |
| MERC abilities | `src/rules/merc-abilities.ts` |
| Equipment effects | `src/rules/equipment-effects.ts` |
| Player actions | `src/rules/actions/*.ts` |
| Vue components | `src/ui/components/*.vue` |
| Entity data | `data/*.json` |
| Tests | `tests/*.test.ts` |

## Important Conventions

### Type Guards

```typescript
// Check combatant type (CombatantModel has these properties)
if (combatant.isMerc) { /* merc combatant */ }
if (combatant.isDictator) { /* dictator combatant */ }

// Check player role
if (player.isRebel()) { /* rebel player */ }
if (player.isDictator()) { /* dictator player */ }

// Helper functions (from helpers.ts)
isCombatantModel(unit)  // Type guard for CombatantModel
isMerc(unit)            // Returns true if CombatantModel with isMerc
isDictatorUnit(unit)    // Returns true if CombatantModel with isDictator
```

### Identity Properties

- Use `combatantId`/`combatantName` for all combatant identity
- These are the only identity properties (no aliases)

### Equipment Slots

```typescript
merc.weaponSlot    // Equipment | undefined
merc.armorSlot     // Equipment | undefined
merc.accessorySlot // Equipment | undefined
merc.bandolierSlots // Equipment[] (from Bandolier accessory)
```

### Stats

```typescript
merc.baseCombat      // From JSON
merc.effectiveCombat // Base + equipment + ability bonuses (cached)
merc.combat          // Computed getter (real-time)
```

## Common Tasks

**Find a MERC by ID:**
```typescript
// Use CombatantModel with filter for element queries
game.first(CombatantModel, m => m.isMerc && m.combatantId === 'haarg')
```

**Get all MERCs in a sector:**
```typescript
game.getMercsInSector(sector, player)    // Returns CombatantModel[]
game.getDictatorMercsInSector(sector)    // Returns CombatantModel[]
```

**Check sector control:**
```typescript
game.getControlledSectors(player)
game.getDictatorUnitsInSector(sector)
```

**Draw equipment:**
```typescript
game.drawEquipment('Weapon') // Returns Equipment | undefined
```
