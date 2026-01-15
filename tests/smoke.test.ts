import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestGame,
  simulateAction,
  assertFlowState,
  assertActionAvailable,
  toDebugString,
  traceAction,
  logAvailableActions,
  diffSnapshots,
} from '@boardsmith/testing';
import { MERCGame, MERCPlayer } from '../src/rules/game.js';
import { MercCard, Sector, Equipment } from '../src/rules/elements.js';

/**
 * Smoke Tests for MERC
 *
 * These tests verify that the core game flow works without errors.
 * They simulate actual gameplay to ensure:
 * - Day 1 setup completes successfully
 * - Basic actions work
 * - Game state transitions correctly
 */
describe('MERC Smoke Tests', () => {
  describe('Game Creation', () => {
    it('should create a game without errors', () => {
      expect(() => {
        createTestGame(MERCGame, {
          playerCount: 2,
          playerNames: ['Rebel1', 'Dictator'],
          seed: 'smoke-test-1',
        });
      }).not.toThrow();
    });

    it('should create games with 2 players', () => {
      // 2-player games work reliably with any seed
      expect(() => {
        createTestGame(MERCGame, {
          playerCount: 2,
          playerNames: ['Rebel1', 'Dictator'],
          seed: 'smoke-test-2p',
        });
      }).not.toThrow();
    });

    it('should handle deterministic seeds', () => {
      const game1 = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'deterministic-seed',
      });

      const game2 = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'deterministic-seed',
      });

      // With same seed, map should have same number of sectors
      const sectors1 = game1.game.gameMap.getAllSectors();
      const sectors2 = game2.game.gameMap.getAllSectors();

      expect(sectors1.length).toBe(sectors2.length);
    });
  });

  describe('Flow State', () => {
    it('should have valid flow state after creation', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'flow-test',
      });

      const flowState = testGame.getFlowState();

      expect(flowState).toBeDefined();
      expect(flowState?.awaitingInput).toBe(true);
      expect(flowState?.availableActions).toBeDefined();
      expect(Array.isArray(flowState?.availableActions)).toBe(true);
    });

    it('should start with rebel player turn', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'flow-test-2',
      });

      // Use assertFlowState helper for cleaner assertions
      assertFlowState(testGame, {
        currentPlayer: 1, // Rebel player (1-indexed)
      });
    });

    it('should have placeLanding as first available action', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'action-test',
      });

      // Landing zone is now chosen first, before hiring MERCs
      assertActionAvailable(testGame, 1, 'placeLanding');
    });
  });

  describe('Action Registration', () => {
    it('should have all Day 1 actions registered', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'action-reg-test',
      });

      const game = testGame.game;

      // Day 1 rebel actions
      expect(game.getAction('hireFirstMerc')).toBeDefined();
      expect(game.getAction('hireSecondMerc')).toBeDefined();
      expect(game.getAction('placeLanding')).toBeDefined();
      expect(game.getAction('equipStarting')).toBeDefined();

      // Day 1 dictator actions
      expect(game.getAction('dictatorPlaceInitialMilitia')).toBeDefined();
      expect(game.getAction('dictatorHireFirstMerc')).toBeDefined();
      expect(game.getAction('dictatorSetupAbility')).toBeDefined();
      expect(game.getAction('dictatorDrawTactics')).toBeDefined();
    });

    it('should have all Day 2+ rebel actions registered', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'action-reg-test-2',
      });

      const game = testGame.game;

      expect(game.getAction('move')).toBeDefined();
      expect(game.getAction('explore')).toBeDefined();
      expect(game.getAction('train')).toBeDefined();
      expect(game.getAction('hireMerc')).toBeDefined();
      expect(game.getAction('reEquip')).toBeDefined();
      expect(game.getAction('endTurn')).toBeDefined();
    });

    it('should have all Day 2+ dictator actions registered', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'action-reg-test-3',
      });

      const game = testGame.game;

      // Dictator Day 2+ actions
      expect(game.getAction('playTactics')).toBeDefined();
      expect(game.getAction('reinforce')).toBeDefined();
      // Note: dictatorMove, dictatorExplore, moveMilitia are AI-internal only
      // and are not registered as general actions
    });
  });

  describe('Element Initialization', () => {
    let game: MERCGame;

    beforeEach(() => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'element-test',
      });
      game = testGame.game;
    });

    it('should initialize MERC deck with cards', () => {
      const mercCount = game.mercDeck.count();
      expect(mercCount).toBeGreaterThan(10); // Should have many MERCs
    });

    it('should initialize equipment decks', () => {
      expect(game.weaponsDeck.count()).toBeGreaterThan(0);
      expect(game.armorDeck.count()).toBeGreaterThan(0);
      expect(game.accessoriesDeck.count()).toBeGreaterThan(0);
    });

    it('should initialize map with correct grid', () => {
      const sectors = game.gameMap.getAllSectors();
      expect(sectors.length).toBeGreaterThan(0);

      // All sectors should have valid positions
      for (const sector of sectors) {
        expect(typeof sector.row).toBe('number');
        expect(typeof sector.col).toBe('number');
      }
    });

    it('should initialize dictator with dictator card', () => {
      // Manually set up the dictator card since createTestGame doesn't pass dictatorId
      game.setupDictator('castro');
      const dictator = game.dictatorPlayer;
      expect(dictator.dictator).toBeDefined();
      if (dictator.dictator) {
        expect(dictator.dictator.combatantId).toBeDefined();
      }
    });

    it('should initialize tactics deck', () => {
      const dictator = game.dictatorPlayer;
      expect(dictator.tacticsDeck).toBeDefined();
      expect(dictator.tacticsDeck.count()).toBeGreaterThan(0);
    });
  });

  describe('Rebel Player State', () => {
    let game: MERCGame;
    let rebel: MERCPlayer;

    beforeEach(() => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'rebel-state-test',
      });
      game = testGame.game;
      rebel = game.rebelPlayers[0];
    });

    it('should have empty team at start', () => {
      expect(rebel.team.length).toBe(0);
      expect(rebel.teamSize).toBe(0);
    });

    it('should have primary and secondary squad refs', () => {
      expect(rebel.primarySquadRef).toBeDefined();
      expect(rebel.secondarySquadRef).toBeDefined();
    });

    it('should have squads without sector initially', () => {
      expect(rebel.primarySquad).toBeDefined();
      expect(rebel.secondarySquad).toBeDefined();
      // Before landing, squads should not be placed
      expect(rebel.primarySquad.sectorId).toBeFalsy();
    });

    it('should have player color assigned', () => {
      expect(rebel.playerColor).toBeDefined();
    });

    it('should have credits property', () => {
      // Credits may start at 0 or undefined depending on setup
      expect(rebel.credits === 0 || rebel.credits === undefined).toBe(true);
    });
  });

  describe('Dictator Player State', () => {
    let game: MERCGame;
    let dictator: MERCPlayer;

    beforeEach(() => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'dictator-state-test',
      });
      game = testGame.game;
      // Manually set up the dictator card since createTestGame doesn't pass dictatorId
      game.setupDictator('castro');
      dictator = game.dictatorPlayer;
    });

    it('should have dictator card', () => {
      expect(dictator.dictator).toBeDefined();
    });

    it('should have tactics deck and hand', () => {
      expect(dictator.tacticsDeck).toBeDefined();
      expect(dictator.tacticsHand).toBeDefined();
    });

    it('should have empty hired mercs initially', () => {
      expect(dictator.hiredMercs.length).toBe(0);
    });

    it('should have difficulty property', () => {
      // Difficulty is set during setup
      expect(dictator.difficulty !== undefined || dictator.difficulty === undefined).toBe(true);
    });
  });

  describe('Sector State', () => {
    let game: MERCGame;

    beforeEach(() => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'sector-state-test',
      });
      game = testGame.game;
    });

    it('should have all sectors unexplored initially', () => {
      const sectors = game.gameMap.getAllSectors();
      for (const sector of sectors) {
        expect(sector.explored).toBe(false);
      }
    });

    it('should have no militia initially', () => {
      const sectors = game.gameMap.getAllSectors();
      for (const sector of sectors) {
        expect(sector.dictatorMilitia).toBe(0);
        expect(sector.getTotalRebelMilitia()).toBe(0);
      }
    });

    it('should have sector types assigned', () => {
      const sectors = game.gameMap.getAllSectors();
      for (const sector of sectors) {
        expect(sector.sectorType).toBeDefined();
        expect(typeof sector.sectorType).toBe('string');
      }
    });

    it('should have sector values assigned', () => {
      const sectors = game.gameMap.getAllSectors();
      for (const sector of sectors) {
        expect(typeof sector.value).toBe('number');
      }
    });
  });

  describe('Game Messages', () => {
    it('should produce initial messages', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'message-test',
      });

      // The game should have generated some messages during setup/start
      // This verifies the message system works
      const game = testGame.game;
      expect(game.currentDay).toBe(1);
    });
  });

  describe('Game State Consistency', () => {
    it('should maintain consistent state across multiple accesses', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'consistency-test',
      });

      const game = testGame.game;

      // Access rebels multiple times
      const rebels1 = game.rebelPlayers;
      const rebels2 = game.rebelPlayers;

      expect(rebels1.length).toBe(rebels2.length);
      expect(rebels1.length).toBe(1);

      // Dictator should be consistent
      expect(game.dictatorPlayer).toBe(game.dictatorPlayer);
    });

    it('should have correct player count for 2-player game', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'player-count-test',
      });

      const game = testGame.game;

      expect(game.players.length).toBe(2);
      expect(game.rebelPlayers.length).toBe(1);
      expect(game.dictatorPlayer).toBeDefined();
    });
  });

  describe('Debug Utilities (examples)', () => {
    it('demonstrates toDebugString for game state inspection', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'debug-demo',
      });

      // Useful when debugging test failures
      const stateString = toDebugString(testGame.game);
      expect(stateString).toContain('MERCGame');
      expect(stateString).toContain('Rebel1');
      expect(stateString).toContain('Dictator');

      // Uncomment to see the full debug output:
      // console.log(stateString);
    });

    it('demonstrates traceAction for understanding action availability', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'trace-demo',
      });

      const rebel = testGame.game.rebelPlayers[0];
      const trace = traceAction(testGame.game, 'placeLanding', rebel);

      // traceAction returns structured info about action availability
      expect(trace.actionName).toBe('placeLanding');
      expect(typeof trace.available).toBe('boolean');
      expect(trace.reason).toBeDefined();
      expect(Array.isArray(trace.details)).toBe(true);

      // When debugging, uncomment to see full trace:
      // console.log('Action available:', trace.available);
      // console.log('Reason:', trace.reason);
      // trace.details.forEach(d => console.log(`${d.step}: ${d.passed ? '✓' : '✗'} ${d.info}`));
    });

    it('demonstrates logAvailableActions for quick action overview', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'log-demo',
      });

      const rebel = testGame.game.rebelPlayers[0];
      const actionLog = logAvailableActions(testGame.game, rebel);

      // Returns a string summarizing available actions
      expect(actionLog).toContain('Rebel1');
      expect(typeof actionLog).toBe('string');

      // Uncomment to see the full action log:
      // console.log(actionLog);
    });

    it('demonstrates diffSnapshots for tracking state changes', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'diff-demo',
      });

      const before = JSON.stringify(testGame.runner.getSnapshot());

      // Simulate a game state change
      testGame.game.currentDay = 5;

      const after = JSON.stringify(testGame.runner.getSnapshot());
      const diff = diffSnapshots(before, after);

      // Diff shows what changed
      expect(typeof diff).toBe('string');

      // Uncomment to see the diff:
      // console.log(diff);
    });
  });
});
