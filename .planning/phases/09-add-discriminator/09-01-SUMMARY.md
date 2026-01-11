# Phase 9 Plan 01: Add Discriminator Summary

**Added cardType discriminator to MercCard and DictatorCard - foundation for card unification**

## Accomplishments

- Added `cardType: 'merc' | 'dictator'` field to all entries in data/mercs.json (52 entries)
- Added `cardType: 'merc' | 'dictator'` field to all entries in data/dictators.json (2 entries)
- Added `cardType` property to MercCard class (default: 'merc')
- Added `cardType` property to DictatorCard class (default: 'dictator')
- Added `isMerc` and `isDictator` getter methods to both classes
- Updated `MercData` interface in game.ts with cardType field
- Updated `DictatorData` interface in game.ts and setup.ts with cardType field

## Files Created/Modified

- `data/mercs.json` - Added cardType field to all 52 entries
- `data/dictators.json` - Added cardType field to both entries
- `src/rules/elements.ts` - Added cardType property and getters to MercCard and DictatorCard
- `src/rules/game.ts` - Updated MercData and DictatorData interfaces
- `src/rules/setup.ts` - Updated DictatorData interface

## Decisions Made

- Used `'merc' | 'dictator'` string literal union (more extensible than boolean)
- Added convenience getters `isMerc`/`isDictator` for cleaner conditionals
- Default values in class match JSON data (no need to set explicitly)

## Issues Encountered

- Initially missed DictatorData interface in setup.ts - caused tests to fail until fixed
- 56 pre-existing test failures in index.ts changes are unrelated to this work

## Next Step

Ready for Phase 10: Create unified CombatUnitCard class
