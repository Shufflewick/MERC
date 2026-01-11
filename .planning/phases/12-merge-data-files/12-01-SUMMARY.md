# Phase 12 Plan 01: Merge Data Files Summary

**Unified combatants.json created, replacing separate merc/dictator data files with single CombatantData interface.**

## Accomplishments

- Created `data/combatants.json` with all 54 entries (52 mercs + 2 dictators)
- Replaced `MercData` and `DictatorData` interfaces with unified `CombatantData` in game.ts
- Replaced `loadMercData` and `loadDictatorData` with single `loadCombatantData` method
- Updated `performSetup` and `setupDictator` to filter combatantData for dictators
- Updated DictatorData interface in setup.ts to match unified structure

## Files Created/Modified

- `data/combatants.json` - New unified data file with all combatants
- `src/rules/game.ts` - CombatantData interface, loadCombatantData method, updated setup methods
- `src/rules/setup.ts` - Updated DictatorData interface to match CombatantData structure

## Decisions Made

- Field order normalized to: id, cardType, name, quantity, training, combat, initiative, ability, bio, image, sex (optional)
- Dictator entries placed at end of combatants.json array (after all mercs)
- Old mercs.json and dictators.json preserved for Phase 13 cleanup

## Issues Encountered

None

## Next Phase Readiness

Ready for Phase 13: Remove Legacy - will delete mercs.json, dictators.json, and any remaining legacy code
