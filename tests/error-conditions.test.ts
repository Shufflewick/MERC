import { describe, it, expect, beforeEach } from 'vitest';
import { createTestGame } from '@boardsmith/testing';
import { MERCGame, RebelPlayer, DictatorPlayer } from '../src/rules/game.js';
import {
  CombatantModel,
  Sector,
  Squad,
  Equipment,
  TacticsCard,
} from '../src/rules/elements.js';
import {
  asRebelPlayer,
  asCombatantModel,
  asSector,
  asSquad,
  asEquipment,
  asTacticsCard,
  isRebelPlayer,
  isCombatantModel,
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

    describe('asCombatantModel', () => {
      it('should throw for non-CombatantModel element with descriptive message', () => {
        const sector = game.gameMap.getAllSectors()[0];
        expect(() => asCombatantModel(sector)).toThrow();
        expect(() => asCombatantModel(sector)).toThrowError(/Expected CombatantModel/);
        expect(() => asCombatantModel(sector)).toThrowError(/Sector/);
      });

      it('should throw for null with descriptive message', () => {
        expect(() => asCombatantModel(null)).toThrow();
        expect(() => asCombatantModel(null)).toThrowError(/Expected CombatantModel/);
      });

      it('should throw for undefined with descriptive message', () => {
        expect(() => asCombatantModel(undefined)).toThrow();
        expect(() => asCombatantModel(undefined)).toThrowError(/Expected CombatantModel/);
      });

      it('should throw for string', () => {
        expect(() => asCombatantModel('merc-123')).toThrow();
        expect(() => asCombatantModel('merc-123')).toThrowError(/Expected CombatantModel/);
        expect(() => asCombatantModel('merc-123')).toThrowError(/String/);
      });

      it('should throw for number', () => {
        expect(() => asCombatantModel(42)).toThrow();
        expect(() => asCombatantModel(42)).toThrowError(/Expected CombatantModel/);
        expect(() => asCombatantModel(42)).toThrowError(/Number/);
      });

      it('should return CombatantModel for valid merc', () => {
        const merc = game.mercDeck.first(CombatantModel, c => c.isMerc);
        expect(merc).toBeDefined();
        expect(() => asCombatantModel(merc)).not.toThrow();
        expect(asCombatantModel(merc)).toBe(merc);
      });
    });

    describe('asSector', () => {
      it('should throw for non-Sector element with descriptive message', () => {
        const merc = game.mercDeck.first(CombatantModel, c => c.isMerc);
        expect(() => asSector(merc)).toThrow();
        expect(() => asSector(merc)).toThrowError(/Expected Sector/);
        expect(() => asSector(merc)).toThrowError(/CombatantModel/);
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
        const merc = game.mercDeck.first(CombatantModel, c => c.isMerc);
        expect(() => asSquad(merc)).toThrow();
        expect(() => asSquad(merc)).toThrowError(/Expected Squad/);
        expect(() => asSquad(merc)).toThrowError(/CombatantModel/);
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
        const merc = game.mercDeck.first(CombatantModel, c => c.isMerc);
        expect(() => asEquipment(merc)).toThrow();
        expect(() => asEquipment(merc)).toThrowError(/Expected Equipment/);
        expect(() => asEquipment(merc)).toThrowError(/CombatantModel/);
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
        const merc = game.mercDeck.first(CombatantModel, c => c.isMerc);
        expect(() => asTacticsCard(merc)).toThrow();
        expect(() => asTacticsCard(merc)).toThrowError(/Expected TacticsCard/);
        expect(() => asTacticsCard(merc)).toThrowError(/CombatantModel/);
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

    describe('isCombatantModel with isDictator check', () => {
      it('should return false for merc combatant isDictator check', () => {
        const merc = game.mercDeck.first(CombatantModel, c => c.isMerc);
        expect(() => isCombatantModel(merc)).not.toThrow();
        expect(isCombatantModel(merc) && merc!.isDictator).toBe(false);
      });

      it('should return false (not throw) for null', () => {
        expect(() => isCombatantModel(null)).not.toThrow();
        expect(isCombatantModel(null)).toBe(false);
      });

      it('should return false (not throw) for undefined', () => {
        expect(() => isCombatantModel(undefined)).not.toThrow();
        expect(isCombatantModel(undefined)).toBe(false);
      });

      it('should return false (not throw) for plain object', () => {
        const fakeCard = { dictatorId: 'fake', dictatorName: 'Fake' };
        expect(() => isCombatantModel(fakeCard)).not.toThrow();
        expect(isCombatantModel(fakeCard)).toBe(false);
      });

      it('should return true for valid dictator CombatantModel', () => {
        const dictatorCard = game.dictatorPlayer?.dictator;
        if (dictatorCard) {
          expect(isCombatantModel(dictatorCard) && dictatorCard.isDictator).toBe(true);
        }
      });
    });
  });

  // =============================================================================
  // Helper Function Edge Case Tests
  // =============================================================================

  describe('Helper Function Edge Cases', () => {
    let testGame: ReturnType<typeof createTestGame>;
    let game: MERCGame;

    beforeEach(() => {
      testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'helper-edge-case-test',
      });
      game = testGame.game;
    });

    describe('canHireMercWithTeam', () => {
      it('should allow any MERC when team is empty', () => {
        const emptyTeam: CombatantModel[] = [];
        // Borris can be hired with empty team
        expect(canHireMercWithTeam('borris', emptyTeam)).toBe(true);
        // Squirrel can be hired with empty team
        expect(canHireMercWithTeam('squirrel', emptyTeam)).toBe(true);
        // Any MERC can be hired with empty team
        expect(canHireMercWithTeam('basic', emptyTeam)).toBe(true);
      });

      it('should allow unknown MERC IDs (not in incompatibilities)', () => {
        const emptyTeam: CombatantModel[] = [];
        // Unknown MERC should work (no incompatibilities defined)
        expect(canHireMercWithTeam('unknown-merc', emptyTeam)).toBe(true);
        expect(canHireMercWithTeam('totally-made-up', emptyTeam)).toBe(true);
      });

      it('should check bidirectional incompatibility (A blocks B)', () => {
        // Set up a team with Borris
        const rebel = game.rebelPlayers[0];
        const sector = game.gameMap.getAllSectors()[0];
        rebel.primarySquad.sectorId = sector.sectorId;

        // Find or create a MERC named 'borris' in the deck
        const borris = game.mercDeck.all(CombatantModel).filter(c => c.isMerc).find(m => m.combatantId === 'borris');
        if (borris) {
          borris.putInto(rebel.primarySquad);
          const team = rebel.team;

          // Borris blocks Squirrel
          expect(canHireMercWithTeam('squirrel', team)).toBe(false);
          // Squirrel blocks Borris (bidirectional in the data)
          // But we're checking if squirrel can join a team with borris
        }
      });

      it('should check bidirectional incompatibility (B blocks A)', () => {
        // Set up a team with Squirrel
        const rebel = game.rebelPlayers[0];
        const sector = game.gameMap.getAllSectors()[0];
        rebel.primarySquad.sectorId = sector.sectorId;

        const squirrel = game.mercDeck.all(CombatantModel).filter(c => c.isMerc).find(m => m.combatantId === 'squirrel');
        if (squirrel) {
          squirrel.putInto(rebel.primarySquad);
          const team = rebel.team;

          // Squirrel blocks Borris
          expect(canHireMercWithTeam('borris', team)).toBe(false);
          // Squirrel blocks Natasha
          expect(canHireMercWithTeam('natasha', team)).toBe(false);
        }
      });

      it('should handle multiple team members with different incompatibilities', () => {
        const rebel = game.rebelPlayers[0];
        const sector = game.gameMap.getAllSectors()[0];
        rebel.primarySquad.sectorId = sector.sectorId;

        // Add multiple MERCs without incompatibilities
        const mercs = game.mercDeck.all(CombatantModel).filter(c => c.isMerc);
        const merc1 = mercs.find(m => m.combatantId === 'basic');
        const merc2 = mercs.find(m => m.combatantId === 'preaction');

        if (merc1 && merc2) {
          merc1.putInto(rebel.primarySquad);
          merc2.putInto(rebel.primarySquad);
          const team = rebel.team;

          // With no conflicting MERCs, borris should be hireable
          expect(canHireMercWithTeam('borris', team)).toBe(true);
        }
      });

      it('should allow compatible MERCs even with existing team', () => {
        const rebel = game.rebelPlayers[0];
        const sector = game.gameMap.getAllSectors()[0];
        rebel.primarySquad.sectorId = sector.sectorId;

        const natasha = game.mercDeck.all(CombatantModel).filter(c => c.isMerc).find(m => m.combatantId === 'natasha');
        if (natasha) {
          natasha.putInto(rebel.primarySquad);
          const team = rebel.team;

          // Natasha doesn't block Borris (only Moose)
          expect(canHireMercWithTeam('borris', team)).toBe(true);
          // But Natasha does block Moose
          expect(canHireMercWithTeam('moose', team)).toBe(false);
        }
      });
    });

    describe('hasActionsRemaining', () => {
      it('should return false for empty team', () => {
        const rebel = game.rebelPlayers[0];
        // Team starts empty
        expect(rebel.team.length).toBe(0);
        expect(hasActionsRemaining(rebel, 1)).toBe(false);
        expect(hasActionsRemaining(rebel, 0)).toBe(false);
      });

      it('should return false when all MERCs are exhausted', () => {
        const rebel = game.rebelPlayers[0];
        const sector = game.gameMap.getAllSectors()[0];
        rebel.primarySquad.sectorId = sector.sectorId;

        const merc = game.mercDeck.first(CombatantModel, c => c.isMerc);
        if (merc) {
          merc.putInto(rebel.primarySquad);
          // sectorId inherited from squad
          merc.actionsRemaining = 0;

          expect(hasActionsRemaining(rebel, 1)).toBe(false);
        }
      });

      it('should return true when at least one MERC has enough actions', () => {
        const rebel = game.rebelPlayers[0];
        const sector = game.gameMap.getAllSectors()[0];
        rebel.primarySquad.sectorId = sector.sectorId;

        const mercs = game.mercDeck.all(CombatantModel).filter(c => c.isMerc).slice(0, 2);
        if (mercs.length >= 2) {
          // sectorId inherited from squad
          mercs[0].putInto(rebel.primarySquad);
          mercs[0].actionsRemaining = 0; // Exhausted

          mercs[1].putInto(rebel.primarySquad);
          mercs[1].actionsRemaining = 2; // Has actions

          expect(hasActionsRemaining(rebel, 1)).toBe(true);
          expect(hasActionsRemaining(rebel, 2)).toBe(true);
          expect(hasActionsRemaining(rebel, 3)).toBe(false); // Need 3, only have 2
        }
      });

      it('should handle high action costs correctly', () => {
        const rebel = game.rebelPlayers[0];
        const sector = game.gameMap.getAllSectors()[0];
        rebel.primarySquad.sectorId = sector.sectorId;

        const merc = game.mercDeck.first(CombatantModel, c => c.isMerc);
        if (merc) {
          merc.putInto(rebel.primarySquad);
          // sectorId inherited from squad
          merc.actionsRemaining = 2;

          // Hire cost is 2
          expect(hasActionsRemaining(rebel, ACTION_COSTS.HIRE_MERC)).toBe(true);
          // Move cost is 1
          expect(hasActionsRemaining(rebel, ACTION_COSTS.MOVE)).toBe(true);
          // Cost of 3 exceeds available
          expect(hasActionsRemaining(rebel, 3)).toBe(false);
        }
      });
    });

    describe('findUnitSector', () => {
      it('should return null for unit not in any sector', () => {
        const merc = game.mercDeck.first(CombatantModel, c => c.isMerc);
        const rebel = game.rebelPlayers[0];
        // MERC is in deck, not in any squad or sector
        expect(findUnitSector(merc!, rebel, game)).toBeNull();
      });

      it('should return sector for rebel squad MERCs', () => {
        const rebel = game.rebelPlayers[0];
        const sector = game.gameMap.getAllSectors()[0];
        rebel.primarySquad.sectorId = sector.sectorId;

        const merc = game.mercDeck.first(CombatantModel, c => c.isMerc);
        if (merc) {
          merc.putInto(rebel.primarySquad);
          // sectorId inherited from squad

          const foundSector = findUnitSector(merc, rebel, game);
          expect(foundSector).toBe(sector);
        }
      });

      it('should return null when rebel squad has no sectorId', () => {
        const rebel = game.rebelPlayers[0];
        // Don't set squad sectorId - squad not placed on map

        const merc = game.mercDeck.first(CombatantModel, c => c.isMerc);
        if (merc) {
          merc.putInto(rebel.primarySquad);
          // Don't set merc sectorId either

          const foundSector = findUnitSector(merc, rebel, game);
          expect(foundSector).toBeNull();
        }
      });

      it('should return null for MERC in rebel squad when passed dictator', () => {
        const rebel = game.rebelPlayers[0];
        const sector = game.gameMap.getAllSectors()[0];
        rebel.primarySquad.sectorId = sector.sectorId;

        const merc = game.mercDeck.first(CombatantModel, c => c.isMerc);
        if (merc) {
          merc.putInto(rebel.primarySquad);
          // Don't set merc.sectorId - merc is only in rebel squad

          // Pass dictator player - dictator doesn't have this merc in their squad
          const dictator = game.dictatorPlayer;
          const foundSector = findUnitSector(merc, dictator, game);
          // Should return null because merc not in dictator's squads and has no sectorId
          expect(foundSector).toBeNull();
        }
      });

      it('should return sector for dictator card', () => {
        const dictator = game.dictatorPlayer;
        const dictatorCard = dictator?.dictator;
        const sector = game.gameMap.getAllSectors()[0];

        if (dictatorCard) {
          // sectorId inherited from squad
          dictator.baseSquad.sectorId = sector.sectorId;
          dictatorCard.putInto(dictator.baseSquad);
          dictatorCard.inPlay = true;
          dictator.baseSectorId = sector.sectorId;

          const foundSector = findUnitSector(dictatorCard, dictator, game);
          expect(foundSector).toBe(sector);
        }
      });

      it('should return null for dictator card without sectorId', () => {
        const dictator = game.dictatorPlayer;
        const dictatorCard = dictator?.dictator;

        if (dictatorCard) {
          // No squad placement = undefined sectorId
          const foundSector = findUnitSector(dictatorCard, dictator, game);
          expect(foundSector).toBeNull();
        }
      });
    });

    describe('ACTION_COSTS edge cases', () => {
      it('should have zero cost for split/merge (free actions)', () => {
        expect(ACTION_COSTS.SPLIT_SQUAD).toBe(0);
        expect(ACTION_COSTS.MERGE_SQUADS).toBe(0);
      });

      it('should have correct costs for action point consuming actions', () => {
        expect(ACTION_COSTS.MOVE).toBe(1);
        expect(ACTION_COSTS.EXPLORE).toBe(1);
        expect(ACTION_COSTS.TRAIN).toBe(1);
        expect(ACTION_COSTS.HOSPITAL).toBe(1);
        expect(ACTION_COSTS.ARMS_DEALER).toBe(1);
        expect(ACTION_COSTS.RE_EQUIP).toBe(1);
        expect(ACTION_COSTS.HIRE_MERC).toBe(2);
      });
    });
  });

  // =============================================================================
  // Game State Edge Case Tests
  // =============================================================================

  describe('Game State Edge Cases', () => {
    let testGame: ReturnType<typeof createTestGame>;
    let game: MERCGame;

    beforeEach(() => {
      testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'game-state-edge-case-test',
      });
      game = testGame.game;
    });

    describe('Empty Deck Scenarios', () => {
      it('should handle empty MERC deck gracefully', () => {
        // Move all MERCs to discard
        const allMercs = game.mercDeck.all(CombatantModel).filter(c => c.isMerc);
        for (const merc of allMercs) {
          merc.putInto(game.mercDiscard);
        }

        // Deck should be empty
        expect(game.mercDeck.all(CombatantModel).filter(c => c.isMerc).length).toBe(0);

        // drawMerc should reshuffle and return a card
        const drawn = game.drawMerc();
        expect(drawn).toBeDefined();

        // Deck should still work after reshuffle
        const deckCount = game.mercDeck.all(CombatantModel).filter(c => c.isMerc).length;
        const discardCount = game.mercDiscard.all(CombatantModel).filter(c => c.isMerc).length;
        expect(deckCount + discardCount).toBeGreaterThan(0);
      });

      it('should return undefined when MERC deck and discard are both empty', () => {
        // This is an edge case - normally impossible in real gameplay
        // Move all MERCs somewhere they can't be reshuffled from
        const rebel = game.rebelPlayers[0];
        const allMercs = game.mercDeck.all(CombatantModel).filter(c => c.isMerc);
        for (const merc of allMercs) {
          merc.putInto(rebel.primarySquad);
        }

        // Ensure discard is empty too
        const discardMercs = game.mercDiscard.all(CombatantModel).filter(c => c.isMerc);
        for (const merc of discardMercs) {
          merc.putInto(rebel.primarySquad);
        }

        // Both deck and discard empty - should return undefined
        const drawn = game.drawMerc();
        expect(drawn).toBeUndefined();
      });

      it('should handle empty equipment deck gracefully', () => {
        // Move all weapons to discard
        const allWeapons = game.weaponsDeck.all(Equipment);
        for (const equip of allWeapons) {
          equip.putInto(game.weaponsDiscard);
        }

        expect(game.weaponsDeck.count(Equipment)).toBe(0);

        // drawEquipment should reshuffle and return equipment
        const drawn = game.drawEquipment('Weapon');
        expect(drawn).toBeDefined();
      });

      it('should return undefined when equipment deck and discard are both empty', () => {
        // Move all weapons to a sector stash
        const sector = game.gameMap.getAllSectors()[0];
        const allWeapons = game.weaponsDeck.all(Equipment);
        for (const equip of allWeapons) {
          sector.addToStash(equip);
        }

        // Also clear discard
        const discardWeapons = game.weaponsDiscard.all(Equipment);
        for (const equip of discardWeapons) {
          sector.addToStash(equip);
        }

        // Both deck and discard empty - should return undefined
        const drawn = game.drawEquipment('Weapon');
        expect(drawn).toBeUndefined();
      });

      it('should handle empty tactics deck for game ending', () => {
        const dictator = game.dictatorPlayer;
        if (!dictator || !dictator.tacticsDeck || !dictator.tacticsHand) return;

        // Move all tactics cards to discard
        const deckCards = dictator.tacticsDeck.all(TacticsCard);
        for (const card of deckCards) {
          card.putInto(dictator.tacticsDiscard);
        }

        const handCards = dictator.tacticsHand.all(TacticsCard);
        for (const card of handCards) {
          card.putInto(dictator.tacticsDiscard);
        }

        // Verify empty
        expect(dictator.tacticsDeck.count(TacticsCard)).toBe(0);
        expect(dictator.tacticsHand.count(TacticsCard)).toBe(0);

        // Game should be finished (empty tactics = game over)
        expect(game.isFinished()).toBe(true);
      });
    });

    describe('Day Counter Boundary Conditions', () => {
      it('should handle Day 1 (setup day) correctly', () => {
        game.currentDay = 1;
        expect(game.isSetupDay()).toBe(true);
        expect(game.currentDay).toBe(1);
      });

      it('should handle Day 6 (last day) correctly', () => {
        game.currentDay = 6;
        expect(game.isLastDay()).toBe(true);
        expect(game.getRemainingDays()).toBe(0);
      });

      it('should handle past last day (day limit reached)', () => {
        game.currentDay = 7;
        expect(game.isDayLimitReached()).toBe(true);
        expect(game.isFinished()).toBe(true);
      });

      it('should advance day and reset actions correctly', () => {
        const rebel = game.rebelPlayers[0];
        const sector = game.gameMap.getAllSectors()[0];
        rebel.primarySquad.sectorId = sector.sectorId;

        const merc = game.mercDeck.first(CombatantModel, c => c.isMerc);
        if (merc) {
          merc.putInto(rebel.primarySquad);
          // sectorId inherited from squad
          merc.actionsRemaining = 0; // Exhausted

          expect(merc.actionsRemaining).toBe(0);

          game.currentDay = 1;
          game.advanceDay();

          expect(game.currentDay).toBe(2);
          expect(merc.actionsRemaining).toBe(2); // Actions reset
        }
      });

      it('should return correct remaining days', () => {
        game.currentDay = 1;
        expect(game.getRemainingDays()).toBe(5);

        game.currentDay = 3;
        expect(game.getRemainingDays()).toBe(3);

        game.currentDay = 6;
        expect(game.getRemainingDays()).toBe(0);
      });
    });

    describe('Credits and Team Size Boundaries', () => {
      it('should handle team at maximum limit', () => {
        const rebel = game.rebelPlayers[0];
        const sector = game.gameMap.getAllSectors()[0];
        rebel.primarySquad.sectorId = sector.sectorId;

        // Team limit starts at BASE_TEAM_LIMIT (3 per constants)
        // Add MERCs up to limit
        const mercs = game.mercDeck.all(CombatantModel).filter(c => c.isMerc).slice(0, 10);
        let added = 0;
        for (const merc of mercs) {
          if (rebel.canHireMerc(game)) {
            merc.putInto(rebel.primarySquad);
            added++;
          }
        }

        // Should be at or near limit
        expect(rebel.teamSize).toBeLessThanOrEqual(rebel.getTeamLimit(game));
      });

      it('should correctly calculate team limit with controlled sectors', () => {
        const rebel = game.rebelPlayers[0];
        const sector = game.gameMap.getAllSectors()[0];
        rebel.primarySquad.sectorId = sector.sectorId;

        // Add a MERC to control the sector
        const merc = game.mercDeck.first(CombatantModel, c => c.isMerc);
        if (merc) {
          merc.putInto(rebel.primarySquad);
          // sectorId inherited from squad

          // Team limit should be BASE (1 per constants) + controlled sectors
          const teamLimit = rebel.getTeamLimit(game);
          // With 1 controlled sector, limit should be at least 2
          expect(teamLimit).toBeGreaterThanOrEqual(2);
        }
      });

      it('should not count Teresa toward team size limit', () => {
        const rebel = game.rebelPlayers[0];
        const sector = game.gameMap.getAllSectors()[0];
        rebel.primarySquad.sectorId = sector.sectorId;

        // Find Teresa if available
        const mercs = game.mercDeck.all(CombatantModel).filter(c => c.isMerc);
        const teresa = mercs.find(m => m.combatantId === 'teresa');
        const basicMerc = mercs.find(m => m.combatantId === 'basic');

        if (teresa && basicMerc) {
          basicMerc.putInto(rebel.primarySquad);
          expect(rebel.teamSize).toBe(1);

          teresa.putInto(rebel.primarySquad);
          // Teresa doesn't count toward team size
          expect(rebel.teamSize).toBe(1);
          expect(rebel.team.length).toBe(2); // But is on the team
        }
      });
    });

    describe('Null/Missing Element Handling', () => {
      it('should handle sector lookup with non-existent ID', () => {
        const sector = game.getSector('non-existent-sector-id');
        expect(sector).toBeUndefined();
      });

      it('should handle sector lookup with empty string', () => {
        const sector = game.getSector('');
        expect(sector).toBeUndefined();
      });

      it('should handle getControlledSectors with no units', () => {
        const rebel = game.rebelPlayers[0];
        // No MERCs placed - should control no sectors
        const controlled = game.getControlledSectors(rebel);
        expect(controlled).toEqual([]);
      });

      it('should handle getMercsInSector with no MERCs', () => {
        const rebel = game.rebelPlayers[0];
        const sector = game.gameMap.getAllSectors()[0];
        // Squad not at this sector
        const mercs = game.getMercsInSector(sector, rebel);
        expect(mercs).toEqual([]);
      });

      it('should handle getAdjacentSectors for corner sector', () => {
        // Get corner sector (should have only 2 neighbors)
        const cornerSector = game.gameMap.getSector(0, 0);
        if (cornerSector) {
          const adjacent = game.getAdjacentSectors(cornerSector);
          expect(adjacent.length).toBeLessThanOrEqual(2);
        }
      });

      it('should handle equipment not found in stash', () => {
        const sector = game.gameMap.getAllSectors()[0];
        // Try to take from empty stash
        const taken = sector.takeFromStash(0);
        expect(taken).toBeUndefined();

        // Try with negative index
        const takenNeg = sector.takeFromStash(-1);
        expect(takenNeg).toBeUndefined();

        // Try with large index
        const takenLarge = sector.takeFromStash(999);
        expect(takenLarge).toBeUndefined();
      });

      it('should handle findInStash with no matching equipment', () => {
        const sector = game.gameMap.getAllSectors()[0];
        // Empty stash
        const found = sector.findInStash('Weapon');
        expect(found).toBeUndefined();
      });

      it('should handle damaged equipment not added to stash', () => {
        const sector = game.gameMap.getAllSectors()[0];
        const equip = game.weaponsDeck.first(Equipment);
        if (equip) {
          equip.damage(); // Mark as damaged
          const added = sector.addToStash(equip);
          expect(added).toBe(false); // Damaged equipment cannot be stashed
        }
      });
    });

    describe('Victory Condition Edge Cases', () => {
      it('should not end game on Day 1 even with no units', () => {
        game.currentDay = 1;
        // No units placed yet - game should not be finished on Day 1
        expect(game.allDictatorUnitsEliminated()).toBe(false);
        expect(game.allRebelUnitsEliminated()).toBe(false);
      });

      it('should detect dictator defeat when base captured', () => {
        const dictator = game.dictatorPlayer;
        const rebel = game.rebelPlayers[0];
        const sector = game.gameMap.getAllSectors()[0];

        if (dictator) {
          // Set up base
          dictator.baseRevealed = true;
          dictator.baseSectorId = sector.sectorId;
          sector.dictatorMilitia = 0; // No militia defending

          // Place rebel at base
          rebel.primarySquad.sectorId = sector.sectorId;
          const merc = game.mercDeck.first(CombatantModel, c => c.isMerc);
          if (merc) {
            merc.putInto(rebel.primarySquad);
            // sectorId inherited from squad
          }

          // Make sure dictator card is dead or not in play
          if (dictator.dictator) {
            dictator.dictator.inPlay = false;
          }

          // Base should be captured
          expect(game.isBaseCaptured()).toBe(true);
        }
      });

      it('should calculate victory points correctly with controlled sectors', () => {
        const rebel = game.rebelPlayers[0];
        const sector = game.gameMap.getAllSectors()[0];

        // Place rebel at sector (to control it)
        rebel.primarySquad.sectorId = sector.sectorId;
        const merc = game.mercDeck.first(CombatantModel, c => c.isMerc);
        if (merc) {
          merc.putInto(rebel.primarySquad);
          // sectorId inherited from squad
        }

        const points = game.calculateVictoryPoints();
        // Should have some points allocated
        expect(points.rebelPoints + points.dictatorPoints).toBeGreaterThan(0);
      });

      it('should handle explosives victory flag', () => {
        expect(game.explosivesVictory).toBe(false);
        game.explosivesVictory = true;
        expect(game.isFinished()).toBe(true);
        expect(game.getWinners()).toContain(game.rebelPlayers[0]);
      });
    });
  });
});
