import { describe, it, expect, beforeEach } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import {
  getCachedValue,
  setCachedValue,
  clearCachedValue,
  getGlobalCachedValue,
  setGlobalCachedValue,
  clearGlobalCachedValue,
} from '../src/rules/actions/helpers.js';

describe('State Persistence', () => {
  let game: MERCGame;
  // Use player names as unique identifiers since framework may assign same IDs
  const player1Id = 'rebel-player-1';
  const player2Id = 'dictator-player';

  beforeEach(() => {
    const testGame = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'cache-test',
    });
    game = testGame.game;
  });

  describe('Player-Scoped Cache Helpers', () => {
    describe('setCachedValue', () => {
      it('stores value at correct key pattern prefix:playerId', () => {
        setCachedValue(game, 'selectedMerc', player1Id, 'merc-123');

        // Verify the underlying storage uses prefix:playerId format
        const expectedKey = `selectedMerc:${player1Id}`;
        expect(game.settings[expectedKey]).toBe('merc-123');
      });

      it('stores typed values (string)', () => {
        setCachedValue<string>(game, 'test', player1Id, 'hello');
        expect(getCachedValue<string>(game, 'test', player1Id)).toBe('hello');
      });

      it('stores typed values (number)', () => {
        setCachedValue<number>(game, 'count', player1Id, 42);
        expect(getCachedValue<number>(game, 'count', player1Id)).toBe(42);
      });

      it('stores typed values (array)', () => {
        const items = ['a', 'b', 'c'];
        setCachedValue<string[]>(game, 'items', player1Id, items);
        expect(getCachedValue<string[]>(game, 'items', player1Id)).toEqual(items);
      });

      it('stores typed values (object)', () => {
        const obj = { id: 1, name: 'test' };
        setCachedValue<typeof obj>(game, 'data', player1Id, obj);
        expect(getCachedValue<typeof obj>(game, 'data', player1Id)).toEqual(obj);
      });

      it('overwrites existing value', () => {
        setCachedValue(game, 'key', player1Id, 'first');
        setCachedValue(game, 'key', player1Id, 'second');
        expect(getCachedValue(game, 'key', player1Id)).toBe('second');
      });
    });

    describe('getCachedValue', () => {
      it('retrieves stored value', () => {
        setCachedValue(game, 'testKey', player1Id, 'testValue');
        expect(getCachedValue(game, 'testKey', player1Id)).toBe('testValue');
      });

      it('returns undefined for missing key', () => {
        expect(getCachedValue(game, 'nonexistent', player1Id)).toBeUndefined();
      });

      it('returns undefined for wrong player', () => {
        setCachedValue(game, 'key', player1Id, 'value');
        expect(getCachedValue(game, 'key', 'wrong-player-id')).toBeUndefined();
      });
    });

    describe('clearCachedValue', () => {
      it('removes the value', () => {
        setCachedValue(game, 'toDelete', player1Id, 'value');
        expect(getCachedValue(game, 'toDelete', player1Id)).toBe('value');

        clearCachedValue(game, 'toDelete', player1Id);
        expect(getCachedValue(game, 'toDelete', player1Id)).toBeUndefined();
      });

      it('does not throw when clearing non-existent key', () => {
        expect(() => clearCachedValue(game, 'nonexistent', player1Id)).not.toThrow();
      });

      it('only clears specified key', () => {
        setCachedValue(game, 'key1', player1Id, 'value1');
        setCachedValue(game, 'key2', player1Id, 'value2');

        clearCachedValue(game, 'key1', player1Id);

        expect(getCachedValue(game, 'key1', player1Id)).toBeUndefined();
        expect(getCachedValue(game, 'key2', player1Id)).toBe('value2');
      });
    });

    describe('Player Isolation', () => {
      it('different players have independent caches', () => {
        setCachedValue(game, 'shared', player1Id, 'player1-value');
        setCachedValue(game, 'shared', player2Id, 'player2-value');

        expect(getCachedValue(game, 'shared', player1Id)).toBe('player1-value');
        expect(getCachedValue(game, 'shared', player2Id)).toBe('player2-value');
      });

      it('clearing one player does not affect other', () => {
        setCachedValue(game, 'key', player1Id, 'p1');
        setCachedValue(game, 'key', player2Id, 'p2');

        clearCachedValue(game, 'key', player1Id);

        expect(getCachedValue(game, 'key', player1Id)).toBeUndefined();
        expect(getCachedValue(game, 'key', player2Id)).toBe('p2');
      });

      it('multiple prefixes per player work independently', () => {
        setCachedValue(game, 'prefixA', player1Id, 'A');
        setCachedValue(game, 'prefixB', player1Id, 'B');

        expect(getCachedValue(game, 'prefixA', player1Id)).toBe('A');
        expect(getCachedValue(game, 'prefixB', player1Id)).toBe('B');

        clearCachedValue(game, 'prefixA', player1Id);
        expect(getCachedValue(game, 'prefixA', player1Id)).toBeUndefined();
        expect(getCachedValue(game, 'prefixB', player1Id)).toBe('B');
      });
    });
  });

  describe('Global Cache Helpers', () => {
    describe('setGlobalCachedValue', () => {
      it('stores value at key directly (no player prefix)', () => {
        setGlobalCachedValue(game, 'globalKey', 'globalValue');

        // Verify the key is used directly, not prefixed
        expect(game.settings['globalKey']).toBe('globalValue');
      });

      it('stores typed values', () => {
        setGlobalCachedValue<number[]>(game, 'numbers', [1, 2, 3]);
        expect(getGlobalCachedValue<number[]>(game, 'numbers')).toEqual([1, 2, 3]);
      });

      it('overwrites existing value', () => {
        setGlobalCachedValue(game, 'key', 'first');
        setGlobalCachedValue(game, 'key', 'second');
        expect(getGlobalCachedValue(game, 'key')).toBe('second');
      });
    });

    describe('getGlobalCachedValue', () => {
      it('retrieves stored value', () => {
        setGlobalCachedValue(game, 'testGlobal', 'testValue');
        expect(getGlobalCachedValue(game, 'testGlobal')).toBe('testValue');
      });

      it('returns undefined for missing key', () => {
        expect(getGlobalCachedValue(game, 'nonexistent')).toBeUndefined();
      });
    });

    describe('clearGlobalCachedValue', () => {
      it('removes the value', () => {
        setGlobalCachedValue(game, 'toDelete', 'value');
        expect(getGlobalCachedValue(game, 'toDelete')).toBe('value');

        clearGlobalCachedValue(game, 'toDelete');
        expect(getGlobalCachedValue(game, 'toDelete')).toBeUndefined();
      });

      it('does not throw when clearing non-existent key', () => {
        expect(() => clearGlobalCachedValue(game, 'nonexistent')).not.toThrow();
      });

      it('only clears specified key', () => {
        setGlobalCachedValue(game, 'key1', 'value1');
        setGlobalCachedValue(game, 'key2', 'value2');

        clearGlobalCachedValue(game, 'key1');

        expect(getGlobalCachedValue(game, 'key1')).toBeUndefined();
        expect(getGlobalCachedValue(game, 'key2')).toBe('value2');
      });
    });

    describe('Global vs Player-Scoped Isolation', () => {
      it('global and player-scoped keys do not collide', () => {
        // Use same key name but different scopes
        setGlobalCachedValue(game, 'shared', 'global');
        setCachedValue(game, 'shared', player1Id, 'player1');

        expect(getGlobalCachedValue(game, 'shared')).toBe('global');
        expect(getCachedValue(game, 'shared', player1Id)).toBe('player1');
      });

      it('clearing global does not affect player-scoped', () => {
        setGlobalCachedValue(game, 'key', 'global');
        setCachedValue(game, 'key', player1Id, 'player');

        clearGlobalCachedValue(game, 'key');

        expect(getGlobalCachedValue(game, 'key')).toBeUndefined();
        expect(getCachedValue(game, 'key', player1Id)).toBe('player');
      });
    });
  });

  describe('game.settings Underlying Behavior', () => {
    describe('Basic storage semantics', () => {
      it('setting a key stores the value', () => {
        game.settings['testKey'] = 'testValue';
        expect(game.settings['testKey']).toBe('testValue');
      });

      it('getting a key retrieves the value', () => {
        game.settings['myKey'] = 42;
        const retrieved = game.settings['myKey'];
        expect(retrieved).toBe(42);
      });

      it('deleting a key removes it', () => {
        game.settings['toDelete'] = 'exists';
        expect(game.settings['toDelete']).toBe('exists');

        delete game.settings['toDelete'];
        expect(game.settings['toDelete']).toBeUndefined();
      });

      it('multiple keys coexist independently', () => {
        game.settings['key1'] = 'value1';
        game.settings['key2'] = 'value2';
        game.settings['key3'] = 'value3';

        expect(game.settings['key1']).toBe('value1');
        expect(game.settings['key2']).toBe('value2');
        expect(game.settings['key3']).toBe('value3');

        delete game.settings['key2'];
        expect(game.settings['key1']).toBe('value1');
        expect(game.settings['key2']).toBeUndefined();
        expect(game.settings['key3']).toBe('value3');
      });
    });

    describe('Edge cases', () => {
      it('setting undefined vs deleting key', () => {
        game.settings['key'] = 'value';

        // Setting to undefined doesn't delete the key, but makes it undefined
        game.settings['key'] = undefined;
        expect('key' in game.settings).toBe(true);
        expect(game.settings['key']).toBeUndefined();

        // Deleting actually removes the key
        game.settings['key2'] = 'value';
        delete game.settings['key2'];
        expect('key2' in game.settings).toBe(false);
      });

      it('setting null value', () => {
        game.settings['nullKey'] = null;
        expect(game.settings['nullKey']).toBeNull();

        // Null is a valid value, different from undefined/missing
        expect('nullKey' in game.settings).toBe(true);
      });

      it('overwriting existing value', () => {
        game.settings['overwrite'] = 'first';
        expect(game.settings['overwrite']).toBe('first');

        game.settings['overwrite'] = 'second';
        expect(game.settings['overwrite']).toBe('second');

        game.settings['overwrite'] = 123;
        expect(game.settings['overwrite']).toBe(123);
      });

      it('storing complex objects', () => {
        const complex = {
          nested: { data: [1, 2, 3] },
          fn: () => 'test', // Functions may not serialize, but can be stored
        };
        game.settings['complex'] = complex;
        expect(game.settings['complex']).toBe(complex);
        expect(game.settings['complex'].nested.data).toEqual([1, 2, 3]);
      });
    });
  });

  describe('Real Caching Scenarios from Codebase', () => {
    // These tests validate the actual patterns used in rebel-economy.ts and day-one-actions.ts

    describe('Arms dealer drawn equipment caching pattern', () => {
      it('caches equipment ID and retrieves it across function calls', () => {
        // Simulate: chooseFrom draws equipment, stores ID
        const equipmentId = 123; // In real code this would be equipment.id
        const playerId = 'rebel-1';
        const ARMS_DEALER_DRAWN_KEY = 'armsDealer_drawnEquipment';

        setCachedValue<number>(game, ARMS_DEALER_DRAWN_KEY, playerId, equipmentId);

        // Simulate: execute retrieves the cached ID
        const cachedId = getCachedValue<number>(game, ARMS_DEALER_DRAWN_KEY, playerId);
        expect(cachedId).toBe(equipmentId);

        // Simulate: cleanup after use
        clearCachedValue(game, ARMS_DEALER_DRAWN_KEY, playerId);
        expect(getCachedValue(game, ARMS_DEALER_DRAWN_KEY, playerId)).toBeUndefined();
      });

      it('prevents re-drawing when equipment already cached', () => {
        const playerId = 'rebel-1';
        const DRAWN_KEY = 'drawnEquipment';

        // First access - no cached value
        expect(getCachedValue<number>(game, DRAWN_KEY, playerId)).toBeUndefined();

        // Cache the equipment
        setCachedValue(game, DRAWN_KEY, playerId, 456);

        // Second access - cached value exists, prevent re-draw
        const cached = getCachedValue<number>(game, DRAWN_KEY, playerId);
        expect(cached).toBe(456); // Would skip drawing in real code
      });
    });

    describe('Selected MERC caching during hire flow', () => {
      it('caches array of drawn MERC IDs for hire selection', () => {
        const playerId = 'rebel-1';
        const HIRE_DRAWN_MERCS_KEY = 'hire_drawnMercs';
        const drawnMercIds = [101, 102, 103];

        // Draw phase: cache IDs
        setCachedValue<number[]>(game, HIRE_DRAWN_MERCS_KEY, playerId, drawnMercIds);

        // Selection phase: retrieve cached IDs
        const cached = getCachedValue<number[]>(game, HIRE_DRAWN_MERCS_KEY, playerId);
        expect(cached).toEqual(drawnMercIds);

        // After hiring: remaining MERCs go back
        const remaining = [102, 103]; // Player hired merc 101
        setCachedValue(game, HIRE_DRAWN_MERCS_KEY, playerId, remaining);

        // Later: cleanup
        clearCachedValue(game, HIRE_DRAWN_MERCS_KEY, playerId);
        expect(getCachedValue(game, HIRE_DRAWN_MERCS_KEY, playerId)).toBeUndefined();
      });
    });

    describe('Dictator global state caching', () => {
      it('uses global cache for dictator-only state', () => {
        const DRAWN_MERCS_KEY = 'dictator_drawnMercs';
        const combatantElementIds = [201, 202];

        // Dictator draws MERCs - no player scoping needed
        setGlobalCachedValue<number[]>(game, DRAWN_MERCS_KEY, combatantElementIds);

        // Retrieve for hiring
        const cached = getGlobalCachedValue<number[]>(game, DRAWN_MERCS_KEY);
        expect(cached).toEqual(combatantElementIds);

        // Cleanup
        clearGlobalCachedValue(game, DRAWN_MERCS_KEY);
        expect(getGlobalCachedValue(game, DRAWN_MERCS_KEY)).toBeUndefined();
      });

      it('global and player-scoped caches work for multi-player scenarios', () => {
        // Rebel player 1 has their cache
        setCachedValue(game, 'selection', player1Id, 'rebel1-choice');
        // Rebel player 2 would have their cache
        setCachedValue(game, 'selection', player2Id, 'rebel2-choice');
        // Dictator has global cache
        setGlobalCachedValue(game, 'dictatorSelection', 'dictator-choice');

        // All coexist
        expect(getCachedValue(game, 'selection', player1Id)).toBe('rebel1-choice');
        expect(getCachedValue(game, 'selection', player2Id)).toBe('rebel2-choice');
        expect(getGlobalCachedValue(game, 'dictatorSelection')).toBe('dictator-choice');
      });
    });

    describe('Cache cleared at expected points', () => {
      it('clearing cache after action completion', () => {
        const playerId = 'rebel-1';
        const CACHE_KEY = 'actionState';

        // Action starts - cache state
        setCachedValue(game, CACHE_KEY, playerId, { step: 1, data: 'in-progress' });
        expect(getCachedValue(game, CACHE_KEY, playerId)).toBeDefined();

        // Action completes - cleanup
        clearCachedValue(game, CACHE_KEY, playerId);
        expect(getCachedValue(game, CACHE_KEY, playerId)).toBeUndefined();
      });

      it('clearing cache on action failure', () => {
        const playerId = 'rebel-1';
        const DRAWN_KEY = 'drawnMercs';

        // Draw MERCs for hiring
        setCachedValue(game, DRAWN_KEY, playerId, [101, 102, 103]);

        // Action fails (not enough actions) - still need to cleanup
        clearCachedValue(game, DRAWN_KEY, playerId);
        expect(getCachedValue(game, DRAWN_KEY, playerId)).toBeUndefined();
      });
    });
  });
});
