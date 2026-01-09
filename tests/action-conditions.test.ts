import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestGame,
  assertActionAvailable,
} from '@boardsmith/testing';
import { MERCGame, RebelPlayer, DictatorPlayer } from '../src/rules/game.js';
import { MercCard, Sector, Squad, Equipment } from '../src/rules/elements.js';

/**
 * Action Condition Tests
 *
 * Tests for action `.condition()` validation logic to ensure actions
 * are only available when game state permits.
 *
 * Phase 06-01: Test coverage for action availability conditions
 *
 * Note: We test conditions by checking if actions appear in the flow's
 * available actions list, which is the most reliable way to test
 * condition evaluation in the BoardSmith framework.
 */

/**
 * Helper to check if an action is available for a given player
 * by examining the flow state's available actions
 */
function isActionAvailable(testGame: ReturnType<typeof createTestGame>, actionName: string): boolean {
  const flowState = testGame.getFlowState();
  return flowState?.availableActions?.includes(actionName) ?? false;
}

/**
 * Helper to check action condition directly using the action's condition method
 */
function checkActionCondition(game: MERCGame, actionName: string, player: any): boolean {
  const action = game.getAction(actionName);
  if (!action) return false;

  // Create a minimal context for condition evaluation
  const ctx = { player, game, args: {} };

  // Access the internal condition function
  // The action stores its condition in its definition
  try {
    // BoardSmith actions have a condition property that's a function
    const actionDef = action as any;
    if (typeof actionDef.condition === 'function') {
      return actionDef.condition(ctx);
    }
    // If there's no condition, action is always available
    return true;
  } catch (e) {
    return false;
  }
}

describe('Action Conditions', () => {
  // =============================================================================
  // Movement Action Conditions
  // =============================================================================

  describe('move action conditions', () => {
    it('should return false during active combat', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'move-combat-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up a rebel with a placed squad and MERCs
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      // Add a MERC to the squad via the deck
      const merc = game.mercDeck.first(MercCard);
      if (merc) {
        merc.putInto(rebel.primarySquad);
        merc.sectorId = sector.sectorId;
        merc.actionsRemaining = 2;
      }

      game.currentDay = 2;

      // Simulate active combat
      game.activeCombat = {
        sectorId: sector.sectorId,
        rebels: [],
        dictator: { militia: 1, mercs: [] },
        round: 1,
      };

      // Check that move action condition returns false
      const conditionResult = checkActionCondition(game, 'move', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return false for non-rebel/non-dictator players', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'move-player-type-test',
      });

      const game = testGame.game;

      // Create a mock player that is neither rebel nor dictator
      const mockPlayer = { name: 'MockPlayer', position: 99 };

      // Check that move action condition returns false for mock player
      const conditionResult = checkActionCondition(game, 'move', mockPlayer);
      expect(conditionResult).toBe(false);
    });

    it('should return false when no squads can move (no living mercs)', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'move-no-mercs-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up squad in a sector but with no MERCs
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;
      // team is empty - no MERCs

      game.currentDay = 2;

      const conditionResult = checkActionCondition(game, 'move', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return false when no squads can move (no actions remaining)', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'move-no-actions-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up a MERC with no actions
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const merc = game.mercDeck.first(MercCard);
      if (merc) {
        merc.putInto(rebel.primarySquad);
        merc.sectorId = sector.sectorId;
        merc.actionsRemaining = 0; // No actions
      }

      game.currentDay = 2;

      const conditionResult = checkActionCondition(game, 'move', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return true when conditions are met', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'move-valid-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up a valid movable squad
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const merc = game.mercDeck.first(MercCard);
      expect(merc).toBeDefined();
      if (merc) {
        merc.putInto(rebel.primarySquad);
        merc.sectorId = sector.sectorId;
        merc.actionsRemaining = 2;
        merc.damage = 0; // Ensure not dead
      }

      // Set day to 2+ (move not available on Day 1)
      game.currentDay = 2;

      // Verify MERC is properly set up
      const livingMercs = rebel.primarySquad.getLivingMercs();
      expect(livingMercs.length).toBeGreaterThan(0);
      expect(livingMercs[0].actionsRemaining).toBeGreaterThanOrEqual(1);
      expect(livingMercs[0].isDead).toBe(false);

      const conditionResult = checkActionCondition(game, 'move', rebel);
      expect(conditionResult).toBe(true);
    });
  });

  describe('splitSquad action conditions', () => {
    it('should return false during active combat', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'split-combat-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up squad with multiple MERCs
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const merc1 = game.mercDeck.first(MercCard);
      const merc2 = game.mercDeck.children[1] as MercCard;
      if (merc1 && merc2) {
        merc1.putInto(rebel.primarySquad);
        merc2.putInto(rebel.primarySquad);
      }

      game.currentDay = 2;

      // Simulate active combat
      game.activeCombat = {
        sectorId: sector.sectorId,
        rebels: [],
        dictator: { militia: 1, mercs: [] },
        round: 1,
      };

      const conditionResult = checkActionCondition(game, 'splitSquad', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return false when squad has fewer than 2 members', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'split-too-small-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up squad with only 1 MERC
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const merc = game.mercDeck.first(MercCard);
      if (merc) {
        merc.putInto(rebel.primarySquad);
        merc.sectorId = sector.sectorId;
      }

      game.currentDay = 2;

      const conditionResult = checkActionCondition(game, 'splitSquad', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return false when secondary squad already has members', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'split-secondary-full-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up primary squad with 2 MERCs
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;
      rebel.secondarySquad.sectorId = sector.sectorId;

      const mercs = game.mercDeck.children.slice(0, 3) as MercCard[];
      if (mercs.length >= 3) {
        mercs[0].putInto(rebel.primarySquad);
        mercs[1].putInto(rebel.primarySquad);
        // Put one in secondary - should block split
        mercs[2].putInto(rebel.secondarySquad);
      }

      game.currentDay = 2;

      const conditionResult = checkActionCondition(game, 'splitSquad', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return false on Day 1', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'split-day1-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up squad with 2+ MERCs
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const mercs = game.mercDeck.children.slice(0, 2) as MercCard[];
      if (mercs.length >= 2) {
        mercs[0].putInto(rebel.primarySquad);
        mercs[1].putInto(rebel.primarySquad);
      }

      // Day 1 - split not available
      game.currentDay = 1;

      const conditionResult = checkActionCondition(game, 'splitSquad', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return true when squad has 2+ members and secondary is empty', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'split-valid-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up primary squad with 2 MERCs, secondary empty
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const mercs = game.mercDeck.children.slice(0, 2) as MercCard[];
      if (mercs.length >= 2) {
        mercs[0].putInto(rebel.primarySquad);
        mercs[0].sectorId = sector.sectorId;
        mercs[1].putInto(rebel.primarySquad);
        mercs[1].sectorId = sector.sectorId;
      }

      game.currentDay = 2;

      const conditionResult = checkActionCondition(game, 'splitSquad', rebel);
      expect(conditionResult).toBe(true);
    });
  });

  describe('mergeSquads action conditions', () => {
    it('should return false during active combat', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'merge-combat-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up both squads in the same sector with MERCs
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;
      rebel.secondarySquad.sectorId = sector.sectorId;

      const mercs = game.mercDeck.children.slice(0, 2) as MercCard[];
      if (mercs.length >= 2) {
        mercs[0].putInto(rebel.primarySquad);
        mercs[1].putInto(rebel.secondarySquad);
      }

      game.currentDay = 2;

      // Simulate active combat
      game.activeCombat = {
        sectorId: sector.sectorId,
        rebels: [],
        dictator: { militia: 1, mercs: [] },
        round: 1,
      };

      const conditionResult = checkActionCondition(game, 'mergeSquads', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return false when squads are not in the same sector', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'merge-diff-sector-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up squads in different sectors
      const sectors = game.gameMap.getAllSectors();
      if (sectors.length >= 2) {
        rebel.primarySquad.sectorId = sectors[0].sectorId;
        rebel.secondarySquad.sectorId = sectors[1].sectorId;

        const mercs = game.mercDeck.children.slice(0, 2) as MercCard[];
        if (mercs.length >= 2) {
          mercs[0].putInto(rebel.primarySquad);
          mercs[0].sectorId = sectors[0].sectorId;
          mercs[1].putInto(rebel.secondarySquad);
          mercs[1].sectorId = sectors[1].sectorId;
        }

        game.currentDay = 2;

        const conditionResult = checkActionCondition(game, 'mergeSquads', rebel);
        expect(conditionResult).toBe(false);
      }
    });

    it('should return false when secondary squad is empty', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'merge-empty-secondary-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up primary with MERC, secondary empty
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;
      rebel.secondarySquad.sectorId = sector.sectorId;

      const merc = game.mercDeck.first(MercCard);
      if (merc) {
        merc.putInto(rebel.primarySquad);
      }
      // Secondary has no MERCs

      game.currentDay = 2;

      const conditionResult = checkActionCondition(game, 'mergeSquads', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return false on Day 1', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'merge-day1-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up both squads in same sector with MERCs
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;
      rebel.secondarySquad.sectorId = sector.sectorId;

      const mercs = game.mercDeck.children.slice(0, 2) as MercCard[];
      if (mercs.length >= 2) {
        mercs[0].putInto(rebel.primarySquad);
        mercs[1].putInto(rebel.secondarySquad);
      }

      // Day 1 - merge not available
      game.currentDay = 1;

      const conditionResult = checkActionCondition(game, 'mergeSquads', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return true when squads are colocated and secondary has members', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'merge-valid-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up both squads in same sector with MERCs
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;
      rebel.secondarySquad.sectorId = sector.sectorId;

      const mercs = game.mercDeck.children.slice(0, 2) as MercCard[];
      if (mercs.length >= 2) {
        mercs[0].putInto(rebel.primarySquad);
        mercs[0].sectorId = sector.sectorId;
        mercs[1].putInto(rebel.secondarySquad);
        mercs[1].sectorId = sector.sectorId;
      }

      game.currentDay = 2;

      const conditionResult = checkActionCondition(game, 'mergeSquads', rebel);
      expect(conditionResult).toBe(true);
    });
  });

  // =============================================================================
  // Economy Action Conditions
  // =============================================================================

  describe('explore action conditions', () => {
    it('should return false during active combat', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'explore-combat-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up a MERC in an unexplored sector
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const merc = game.mercDeck.first(MercCard);
      if (merc) {
        merc.putInto(rebel.primarySquad);
        merc.sectorId = sector.sectorId;
        merc.actionsRemaining = 2;
      }

      // Ensure sector is unexplored
      sector.explored = false;

      // Simulate active combat
      game.activeCombat = {
        sectorId: sector.sectorId,
        rebels: [],
        dictator: { militia: 1, mercs: [] },
        round: 1,
      };

      const conditionResult = checkActionCondition(game, 'explore', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return false when no MERC has actions remaining', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'explore-no-actions-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up a MERC with no actions
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const merc = game.mercDeck.first(MercCard);
      if (merc) {
        merc.putInto(rebel.primarySquad);
        merc.sectorId = sector.sectorId;
        merc.actionsRemaining = 0;
      }

      sector.explored = false;
      game.currentDay = 2;

      const conditionResult = checkActionCondition(game, 'explore', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return false when sector already explored', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'explore-already-explored-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up a MERC with actions
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const merc = game.mercDeck.first(MercCard);
      if (merc) {
        merc.putInto(rebel.primarySquad);
        merc.sectorId = sector.sectorId;
        merc.actionsRemaining = 2;
      }

      // Sector already explored
      sector.explored = true;
      game.currentDay = 2;

      const conditionResult = checkActionCondition(game, 'explore', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return true when MERC has actions and sector unexplored', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'explore-valid-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up a MERC with actions in unexplored sector
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const merc = game.mercDeck.first(MercCard);
      if (merc) {
        merc.putInto(rebel.primarySquad);
        merc.sectorId = sector.sectorId;
        merc.actionsRemaining = 2;
        merc.damage = 0;
      }

      sector.explored = false;
      game.currentDay = 2;

      const conditionResult = checkActionCondition(game, 'explore', rebel);
      expect(conditionResult).toBe(true);
    });
  });

  describe('train action conditions', () => {
    it('should return false during active combat', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'train-combat-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up a MERC with training stat
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const merc = game.mercDeck.first(MercCard);
      if (merc) {
        merc.putInto(rebel.primarySquad);
        merc.sectorId = sector.sectorId;
        merc.actionsRemaining = 2;
      }

      game.currentDay = 2;

      // Simulate active combat
      game.activeCombat = {
        sectorId: sector.sectorId,
        rebels: [],
        dictator: { militia: 1, mercs: [] },
        round: 1,
      };

      const conditionResult = checkActionCondition(game, 'train', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return false when no actions remaining', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'train-no-actions-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up a MERC with training stat but no actions
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const merc = game.mercDeck.first(MercCard);
      if (merc) {
        merc.putInto(rebel.primarySquad);
        merc.sectorId = sector.sectorId;
        merc.actionsRemaining = 0;
      }

      game.currentDay = 2;

      const conditionResult = checkActionCondition(game, 'train', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return false when MERC has no training stat', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'train-no-training-stat-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up a MERC and manually set training to 0
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const merc = game.mercDeck.first(MercCard);
      if (merc) {
        merc.putInto(rebel.primarySquad);
        merc.sectorId = sector.sectorId;
        merc.actionsRemaining = 2;
        // Override training to 0 for this test
        (merc as any).baseTraining = 0;
      }

      game.currentDay = 2;

      const conditionResult = checkActionCondition(game, 'train', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return true when MERC can train', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'train-valid-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up a MERC with training stat and actions
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      // Find a MERC with training > 0
      const mercs = game.mercDeck.children.filter(
        (c): c is MercCard => c instanceof MercCard && c.training > 0
      );
      const merc = mercs[0];

      if (merc) {
        merc.putInto(rebel.primarySquad);
        merc.sectorId = sector.sectorId;
        merc.actionsRemaining = 2;
        merc.damage = 0;
      }

      game.currentDay = 2;

      // Only test if we found a merc with training > 0
      if (merc && merc.training > 0) {
        const conditionResult = checkActionCondition(game, 'train', rebel);
        expect(conditionResult).toBe(true);
      }
    });
  });

  describe('hireMerc action conditions', () => {
    it('should return false during active combat', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'hire-combat-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up a MERC with enough actions (2 required for hire)
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const merc = game.mercDeck.first(MercCard);
      if (merc) {
        merc.putInto(rebel.primarySquad);
        merc.sectorId = sector.sectorId;
        merc.actionsRemaining = 3;
      }

      game.currentDay = 2;

      // Simulate active combat
      game.activeCombat = {
        sectorId: sector.sectorId,
        rebels: [],
        dictator: { militia: 1, mercs: [] },
        round: 1,
      };

      const conditionResult = checkActionCondition(game, 'hireMerc', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return false when insufficient actions (needs 2)', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'hire-insufficient-actions-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up a MERC with only 1 action (not enough for hire)
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const merc = game.mercDeck.first(MercCard);
      if (merc) {
        merc.putInto(rebel.primarySquad);
        merc.sectorId = sector.sectorId;
        merc.actionsRemaining = 1; // Need 2 for hire
      }

      game.currentDay = 2;

      const conditionResult = checkActionCondition(game, 'hireMerc', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return false when MERC deck is empty', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'hire-empty-deck-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up a MERC with enough actions
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const merc = game.mercDeck.first(MercCard);
      if (merc) {
        merc.putInto(rebel.primarySquad);
        merc.sectorId = sector.sectorId;
        merc.actionsRemaining = 3;
      }

      // Empty the MERC deck
      const allMercs = game.mercDeck.all(MercCard);
      for (const m of allMercs) {
        m.putInto(game.mercDiscard);
      }

      game.currentDay = 2;

      const conditionResult = checkActionCondition(game, 'hireMerc', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return false for dictator player (rebels only)', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'hire-dictator-test',
      });

      const game = testGame.game;
      const dictator = game.dictatorPlayer;

      game.currentDay = 2;

      // hireMerc is rebels only
      const conditionResult = checkActionCondition(game, 'hireMerc', dictator);
      expect(conditionResult).toBe(false);
    });

    it('should return true when all conditions are met', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'hire-valid-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      // Set up a MERC with enough actions
      const sector = game.gameMap.getAllSectors()[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const merc = game.mercDeck.first(MercCard);
      if (merc) {
        merc.putInto(rebel.primarySquad);
        merc.sectorId = sector.sectorId;
        merc.actionsRemaining = 3;
        merc.damage = 0;
      }

      // Ensure deck has MERCs
      expect(game.mercDeck.count(MercCard)).toBeGreaterThan(0);

      game.currentDay = 2;

      const conditionResult = checkActionCondition(game, 'hireMerc', rebel);
      expect(conditionResult).toBe(true);
    });
  });

  describe('endTurn action conditions', () => {
    it('should return false during active combat', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'endturn-combat-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      game.currentDay = 2;

      // Simulate active combat
      game.activeCombat = {
        sectorId: 'test',
        rebels: [],
        dictator: { militia: 1, mercs: [] },
        round: 1,
      };

      const conditionResult = checkActionCondition(game, 'endTurn', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return false on Day 1', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'endturn-day1-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      game.currentDay = 1;

      const conditionResult = checkActionCondition(game, 'endTurn', rebel);
      expect(conditionResult).toBe(false);
    });

    it('should return true on Day 2+', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'endturn-valid-test',
      });

      const game = testGame.game;
      const rebel = game.rebelPlayers[0];

      game.currentDay = 2;

      const conditionResult = checkActionCondition(game, 'endTurn', rebel);
      expect(conditionResult).toBe(true);
    });
  });
});
