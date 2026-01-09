import { describe, it, expect, beforeEach } from 'vitest';
import { createTestGame } from '@boardsmith/testing';
import { MERCGame, RebelPlayer, DictatorPlayer } from '../src/rules/game.js';
import {
  MercCard,
  Sector,
  Squad,
  Equipment,
  TacticsCard,
  DictatorCard,
} from '../src/rules/elements.js';
import {
  asRebelPlayer,
  asMercCard,
  asSector,
  asSquad,
  asEquipment,
  asTacticsCard,
  isRebelPlayer,
  isDictatorCard,
  canHireMercWithTeam,
  hasActionsRemaining,
  findUnitSector,
  ACTION_COSTS,
} from '../src/rules/actions/helpers.js';

/**
 * Error Conditions and Edge Case Tests
 *
 * Tests for error handling, type assertion failures, and edge cases
 * to ensure graceful handling of unexpected states.
 *
 * Phase 06-03: Test coverage for error conditions
 */

describe('Error Conditions', () => {
  // =============================================================================
  // Type Assertion Error Tests
  // =============================================================================

  describe('Type Assertion Helpers - Throwing Behavior', () => {
    let testGame: ReturnType<typeof createTestGame>;
    let game: MERCGame;

    beforeEach(() => {
      testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'type-assertion-test',
      });
      game = testGame.game;
    });

    describe('asRebelPlayer', () => {
      it('should throw for DictatorPlayer with descriptive message', () => {
        const dictator = game.dictatorPlayer;
        expect(() => asRebelPlayer(dictator)).toThrow();
        expect(() => asRebelPlayer(dictator)).toThrowError(/Expected RebelPlayer/);
        expect(() => asRebelPlayer(dictator)).toThrowError(/DictatorPlayer/);
      });

      it('should throw for null with descriptive message', () => {
        expect(() => asRebelPlayer(null)).toThrow();
        expect(() => asRebelPlayer(null)).toThrowError(/Expected RebelPlayer/);
      });

      it('should throw for undefined with descriptive message', () => {
        expect(() => asRebelPlayer(undefined)).toThrow();
        expect(() => asRebelPlayer(undefined)).toThrowError(/Expected RebelPlayer/);
      });

      it('should throw for plain object', () => {
        const fakePlayer = { name: 'Fake', position: 1 };
        expect(() => asRebelPlayer(fakePlayer)).toThrow();
        expect(() => asRebelPlayer(fakePlayer)).toThrowError(/Expected RebelPlayer/);
      });

      it('should return RebelPlayer for valid rebel', () => {
        const rebel = game.rebelPlayers[0];
        expect(() => asRebelPlayer(rebel)).not.toThrow();
        expect(asRebelPlayer(rebel)).toBe(rebel);
      });
    });

    describe('asMercCard', () => {
      it('should throw for non-MercCard element with descriptive message', () => {
        const sector = game.gameMap.getAllSectors()[0];
        expect(() => asMercCard(sector)).toThrow();
        expect(() => asMercCard(sector)).toThrowError(/Expected MercCard/);
        expect(() => asMercCard(sector)).toThrowError(/Sector/);
      });

      it('should throw for null with descriptive message', () => {
        expect(() => asMercCard(null)).toThrow();
        expect(() => asMercCard(null)).toThrowError(/Expected MercCard/);
      });

      it('should throw for undefined with descriptive message', () => {
        expect(() => asMercCard(undefined)).toThrow();
        expect(() => asMercCard(undefined)).toThrowError(/Expected MercCard/);
      });

      it('should throw for string', () => {
        expect(() => asMercCard('merc-123')).toThrow();
        expect(() => asMercCard('merc-123')).toThrowError(/Expected MercCard/);
        expect(() => asMercCard('merc-123')).toThrowError(/String/);
      });

      it('should throw for number', () => {
        expect(() => asMercCard(42)).toThrow();
        expect(() => asMercCard(42)).toThrowError(/Expected MercCard/);
        expect(() => asMercCard(42)).toThrowError(/Number/);
      });

      it('should return MercCard for valid merc', () => {
        const merc = game.mercDeck.first(MercCard);
        expect(merc).toBeDefined();
        expect(() => asMercCard(merc)).not.toThrow();
        expect(asMercCard(merc)).toBe(merc);
      });
    });

    describe('asSector', () => {
      it('should throw for non-Sector element with descriptive message', () => {
        const merc = game.mercDeck.first(MercCard);
        expect(() => asSector(merc)).toThrow();
        expect(() => asSector(merc)).toThrowError(/Expected Sector/);
        expect(() => asSector(merc)).toThrowError(/MercCard/);
      });

      it('should throw for null with descriptive message', () => {
        expect(() => asSector(null)).toThrow();
        expect(() => asSector(null)).toThrowError(/Expected Sector/);
      });

      it('should throw for undefined with descriptive message', () => {
        expect(() => asSector(undefined)).toThrow();
        expect(() => asSector(undefined)).toThrowError(/Expected Sector/);
      });

      it('should throw for plain object', () => {
        const fakeSector = { sectorId: 'fake', sectorName: 'Fake' };
        expect(() => asSector(fakeSector)).toThrow();
        expect(() => asSector(fakeSector)).toThrowError(/Expected Sector/);
      });

      it('should return Sector for valid sector', () => {
        const sector = game.gameMap.getAllSectors()[0];
        expect(() => asSector(sector)).not.toThrow();
        expect(asSector(sector)).toBe(sector);
      });
    });

    describe('asSquad', () => {
      it('should throw for non-Squad element with descriptive message', () => {
        const merc = game.mercDeck.first(MercCard);
        expect(() => asSquad(merc)).toThrow();
        expect(() => asSquad(merc)).toThrowError(/Expected Squad/);
        expect(() => asSquad(merc)).toThrowError(/MercCard/);
      });

      it('should throw for null with descriptive message', () => {
        expect(() => asSquad(null)).toThrow();
        expect(() => asSquad(null)).toThrowError(/Expected Squad/);
      });

      it('should throw for undefined with descriptive message', () => {
        expect(() => asSquad(undefined)).toThrow();
        expect(() => asSquad(undefined)).toThrowError(/Expected Squad/);
      });

      it('should return Squad for valid squad', () => {
        const rebel = game.rebelPlayers[0];
        const squad = rebel.primarySquad;
        expect(() => asSquad(squad)).not.toThrow();
        expect(asSquad(squad)).toBe(squad);
      });
    });

    describe('asEquipment', () => {
      it('should throw for non-Equipment element with descriptive message', () => {
        const merc = game.mercDeck.first(MercCard);
        expect(() => asEquipment(merc)).toThrow();
        expect(() => asEquipment(merc)).toThrowError(/Expected Equipment/);
        expect(() => asEquipment(merc)).toThrowError(/MercCard/);
      });

      it('should throw for null with descriptive message', () => {
        expect(() => asEquipment(null)).toThrow();
        expect(() => asEquipment(null)).toThrowError(/Expected Equipment/);
      });

      it('should throw for undefined with descriptive message', () => {
        expect(() => asEquipment(undefined)).toThrow();
        expect(() => asEquipment(undefined)).toThrowError(/Expected Equipment/);
      });

      it('should return Equipment for valid equipment', () => {
        const equipment = game.weaponsDeck.first(Equipment);
        expect(equipment).toBeDefined();
        expect(() => asEquipment(equipment)).not.toThrow();
        expect(asEquipment(equipment)).toBe(equipment);
      });
    });

    describe('asTacticsCard', () => {
      it('should throw for non-TacticsCard element with descriptive message', () => {
        const merc = game.mercDeck.first(MercCard);
        expect(() => asTacticsCard(merc)).toThrow();
        expect(() => asTacticsCard(merc)).toThrowError(/Expected TacticsCard/);
        expect(() => asTacticsCard(merc)).toThrowError(/MercCard/);
      });

      it('should throw for null with descriptive message', () => {
        expect(() => asTacticsCard(null)).toThrow();
        expect(() => asTacticsCard(null)).toThrowError(/Expected TacticsCard/);
      });

      it('should throw for undefined with descriptive message', () => {
        expect(() => asTacticsCard(undefined)).toThrow();
        expect(() => asTacticsCard(undefined)).toThrowError(/Expected TacticsCard/);
      });

      it('should return TacticsCard for valid tactics card', () => {
        const tacticsCard = game.dictatorPlayer?.tacticsDeck?.first(TacticsCard);
        if (tacticsCard) {
          expect(() => asTacticsCard(tacticsCard)).not.toThrow();
          expect(asTacticsCard(tacticsCard)).toBe(tacticsCard);
        }
      });
    });
  });

  describe('Type Guards - Non-Throwing Behavior', () => {
    let testGame: ReturnType<typeof createTestGame>;
    let game: MERCGame;

    beforeEach(() => {
      testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'type-guard-test',
      });
      game = testGame.game;
    });

    describe('isRebelPlayer', () => {
      it('should return false (not throw) for DictatorPlayer', () => {
        const dictator = game.dictatorPlayer;
        expect(() => isRebelPlayer(dictator)).not.toThrow();
        expect(isRebelPlayer(dictator)).toBe(false);
      });

      it('should return false (not throw) for null', () => {
        expect(() => isRebelPlayer(null)).not.toThrow();
        expect(isRebelPlayer(null)).toBe(false);
      });

      it('should return false (not throw) for undefined', () => {
        expect(() => isRebelPlayer(undefined)).not.toThrow();
        expect(isRebelPlayer(undefined)).toBe(false);
      });

      it('should return false (not throw) for plain object', () => {
        const fakePlayer = { name: 'Fake', position: 1 };
        expect(() => isRebelPlayer(fakePlayer)).not.toThrow();
        expect(isRebelPlayer(fakePlayer)).toBe(false);
      });

      it('should return true for valid RebelPlayer', () => {
        const rebel = game.rebelPlayers[0];
        expect(isRebelPlayer(rebel)).toBe(true);
      });
    });

    describe('isDictatorCard', () => {
      it('should return false (not throw) for MercCard', () => {
        const merc = game.mercDeck.first(MercCard);
        expect(() => isDictatorCard(merc)).not.toThrow();
        expect(isDictatorCard(merc)).toBe(false);
      });

      it('should return false (not throw) for null', () => {
        expect(() => isDictatorCard(null)).not.toThrow();
        expect(isDictatorCard(null)).toBe(false);
      });

      it('should return false (not throw) for undefined', () => {
        expect(() => isDictatorCard(undefined)).not.toThrow();
        expect(isDictatorCard(undefined)).toBe(false);
      });

      it('should return false (not throw) for plain object', () => {
        const fakeCard = { dictatorId: 'fake', dictatorName: 'Fake' };
        expect(() => isDictatorCard(fakeCard)).not.toThrow();
        expect(isDictatorCard(fakeCard)).toBe(false);
      });

      it('should return true for valid DictatorCard', () => {
        const dictatorCard = game.dictatorPlayer?.dictator;
        if (dictatorCard) {
          expect(isDictatorCard(dictatorCard)).toBe(true);
        }
      });
    });
  });
});
