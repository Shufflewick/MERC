import { describe, it, expect, beforeEach } from 'vitest';
import { createTestGame } from '@boardsmith/testing';
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
});
