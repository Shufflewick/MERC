import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { mercAI } from '../src/rules/ai.js';
import { gameDefinition } from '../src/rules/index';

/**
 * The presets mark AI seats, so the MCTS bot runs for them. Without these hooks
 * it searches with no evaluation gradient.
 */
describe('MCTS hooks', () => {
  function newGame(seed: string) {
    return createTestGame(MERCGame, {
      playerCount: 3,
      playerNames: ['Rebel1', 'Rebel2', 'Dictator'],
      seed,
    }).game;
  }

  it('is attached to the game definition', () => {
    expect(gameDefinition.ai).toBe(mercAI);
  });

  it('scores every objective inside 0..1 for both sides', () => {
    const game = newGame('ai-objectives');

    for (const player of game.players) {
      const objectives = mercAI.objectives!(game, player.seat);
      expect(Object.keys(objectives).length).toBeGreaterThan(0);

      for (const [name, objective] of Object.entries(objectives)) {
        const score = objective.checker(game, player.seat);
        expect(Number.isFinite(score), `${name} produced ${score}`).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    }
  });

  it('rewards the side holding more sector value', () => {
    const game = newGame('ai-sector-control');
    const rebel = game.rebelPlayers[0];
    const dictator = game.dictatorPlayer;

    for (const sector of game.gameMap.getAllSectors()) {
      sector.dictatorMilitia = 0;
      sector.addRebelMilitia(`${rebel.seat}`, 3);
    }

    const rebelScore = mercAI.objectives!(game, rebel.seat).sectorControl.checker(game, rebel.seat);
    const dictatorScore = mercAI.objectives!(game, dictator.seat)
      .sectorControl.checker(game, dictator.seat);

    expect(rebelScore).toBeGreaterThan(dictatorScore);
  });

  it('always returns one of the available moves from the playout policy', () => {
    const game = newGame('ai-playout');
    const moves = [
      { action: 'endTurn', args: {} },
      { action: 'move', args: {} },
      { action: 'hireMerc', args: {} },
    ];

    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      const chosen = mercAI.playoutPolicy!(game, 1, moves, () => roll);
      expect(moves).toContain(chosen);
    }
  });

  it('orders board-changing moves ahead of ending the turn', () => {
    const game = newGame('ai-ordering');
    const ordered = mercAI.moveOrdering!(game, 1, [
      { action: 'endTurn', args: {} },
      { action: 'move', args: {} },
    ]);
    expect(ordered[0].action).toBe('move');
  });
});
