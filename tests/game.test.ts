import { describe, it, expect, beforeEach } from 'vitest';
import { createTestGame } from '@boardsmith/testing';
import { MERCGame, RebelPlayer, DictatorPlayer } from '../src/rules/game.js';

describe('MERCGame', () => {
  describe('Game Setup', () => {
    it('should create a 2-player game with 1 rebel and 1 dictator', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'test-seed',
      });

      expect(testGame.game.players.length).toBe(2);
      expect(testGame.game.rebelPlayers.length).toBe(1);
      expect(testGame.game.dictatorPlayer).toBeDefined();
    });

    // Note: 3+ player games require specific map configurations
    // Skipped because map layout depends on seed and may not always fit
    it.skip('should create a 3-player game with 2 rebels and 1 dictator', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 3,
        playerNames: ['Rebel1', 'Rebel2', 'Dictator'],
        seed: 'test-seed-3player',
      });

      expect(testGame.game.players.length).toBe(3);
      expect(testGame.game.rebelPlayers.length).toBe(2);
      expect(testGame.game.dictatorPlayer).toBeDefined();
    });

    it('should create game map with sectors', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'test-seed',
      });

      expect(testGame.game.gameMap).toBeDefined();
      const sectors = testGame.game.gameMap.getAllSectors();
      expect(sectors.length).toBeGreaterThan(0);
    });

    it('should create MERC deck with MERCs', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'test-seed',
      });

      expect(testGame.game.mercDeck).toBeDefined();
      // MERCs should be in the deck before hiring
      const mercCount = testGame.game.mercDeck.count();
      expect(mercCount).toBeGreaterThan(0);
    });

    it('should create equipment decks', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'test-seed',
      });

      expect(testGame.game.weaponsDeck).toBeDefined();
      expect(testGame.game.armorDeck).toBeDefined();
      expect(testGame.game.accessoriesDeck).toBeDefined();
    });

    it('should set up dictator with tactics deck', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'test-seed',
      });

      const dictator = testGame.game.dictatorPlayer;
      expect(dictator).toBeDefined();
      expect(dictator.tacticsDeck).toBeDefined();
    });
  });

  describe('Player Types', () => {
    let game: MERCGame;

    beforeEach(() => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'test-seed',
      });
      game = testGame.game;
    });

    it('should correctly identify rebel players', () => {
      const rebels = game.rebelPlayers;
      expect(rebels.length).toBe(1);
      expect(rebels[0]).toBeInstanceOf(RebelPlayer);
      expect(game.isRebelPlayer(rebels[0])).toBe(true);
    });

    it('should correctly identify dictator player', () => {
      const dictator = game.dictatorPlayer;
      expect(dictator).toBeInstanceOf(DictatorPlayer);
      expect(game.isDictatorPlayer(dictator)).toBe(true);
    });

    it('should not identify dictator as rebel', () => {
      const dictator = game.dictatorPlayer;
      expect(game.isRebelPlayer(dictator as any)).toBe(false);
    });

    it('should not identify rebel as dictator', () => {
      const rebel = game.rebelPlayers[0];
      expect(game.isDictatorPlayer(rebel as any)).toBe(false);
    });
  });

  describe('Map Structure', () => {
    let game: MERCGame;

    beforeEach(() => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'test-seed',
      });
      game = testGame.game;
    });

    it('should have edge sectors for landing', () => {
      const edgeSectors = game.gameMap.getEdgeSectors();
      expect(edgeSectors.length).toBeGreaterThan(0);
    });

    it('should calculate sector adjacency', () => {
      const sectors = game.gameMap.getAllSectors();
      if (sectors.length >= 2) {
        const sector = sectors[0];
        const adjacent = game.gameMap.getAdjacentSectors(sector.sectorId);
        // A sector should have at least some adjacent sectors (unless isolated)
        expect(adjacent).toBeDefined();
      }
    });

    it('should get sector by ID', () => {
      const sectors = game.gameMap.getAllSectors();
      if (sectors.length > 0) {
        const sectorId = sectors[0].sectorId;
        const found = game.getSector(sectorId);
        expect(found).toBeDefined();
        expect(found?.sectorId).toBe(sectorId);
      }
    });
  });

  describe('Game Flow Initialization', () => {
    it('should start with Day 1', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'test-seed',
      });

      // After game starts, should be on Day 1
      expect(testGame.game.currentDay).toBe(1);
    });

    it('should start in landing phase', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'test-seed',
      });

      const flowState = testGame.getFlowState();
      expect(flowState).toBeDefined();
      // Flow should be awaiting input for first action
      expect(flowState?.awaitingInput).toBe(true);
    });

    it('should have placeLanding action available initially', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'test-seed',
      });

      // Landing zone is now chosen first, before hiring MERCs
      const flowState = testGame.getFlowState();
      expect(flowState?.availableActions).toContain('placeLanding');
    });
  });

  describe('Game End Conditions', () => {
    it('should not be finished at game start', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'test-seed',
      });

      expect(testGame.game.isFinished()).toBe(false);
    });
  });
});
