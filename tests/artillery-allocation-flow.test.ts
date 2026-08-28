import { describe, it, expect } from 'vitest';
import { enumerateLegalMoves } from 'boardsmith';
import { GameRunner } from 'boardsmith/runtime';
import { MERCGame } from '../src/rules/game.js';
import { TacticsCard, Sector } from '../src/rules/elements.js';
import { advanceArtilleryAllocation } from '../src/rules/tactics-effects.js';
import { getCurrentAction } from './helpers/auto-play.js';

/**
 * Issue #57: playing Artillery Barrage halted the flow with
 * `Loop "artillery-allocation" hit its maxIterations (50)`.
 *
 * The allocation step inherited the dictator's turn player, and
 * `artilleryAllocateHits` is a rebel action, so the step had nothing to offer,
 * completed instantly, and the loop went round until it tripped its safety cap.
 * These drive the real flow through `enumerateLegalMoves` — what MCTS uses —
 * rather than calling the effect directly, because the defect was in who the
 * flow asked, which only the flow can show.
 */

function runnerWithHumanDictator(seed: string): GameRunner<MERCGame> {
  return new GameRunner<MERCGame>({
    GameClass: MERCGame,
    gameType: 'merc',
    gameOptions: {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed,
      playerConfigs: [
        { color: '#e74c3c', isDictator: false, isBot: false },
        { color: '#95a5a6', isDictator: true, isBot: false },
      ],
    } as never,
  });
}

/**
 * Play legal moves until the dictator is offered `playTactics`, then hand them a
 * hand containing only Artillery Barrage.
 */
function reachArtilleryPlay(runner: GameRunner<MERCGame>): { seat: number } {
  const game = runner.game;
  for (let i = 0; i < 400; i++) {
    const current = getCurrentAction(game.getFlowState());
    if (!current) break;
    if (current.available.includes('playTactics')) {
      const hand = game.dictatorPlayer.tacticsHand!;
      for (const held of hand.all(TacticsCard)) held.remove();
      hand.create(TacticsCard, 'artillery-under-test', {
        tacticsId: 'artillery-barrage',
        tacticsName: 'Artillery Barrage',
        story: '',
        description: '',
        revealsBase: false,
      });
      return { seat: current.currentPlayer };
    }
    const moves = enumerateLegalMoves(game, current.currentPlayer, { maxPerAction: 1 });
    if (!moves.length) break;
    runner.performAction(moves[0].action, current.currentPlayer, moves[0].args);
  }
  throw new Error('the dictator was never offered playTactics');
}

/** Put `count` rebel militia in a sector the dictator can shell. */
function garrisonAdjacentSector(game: MERCGame, count: number): Sector {
  const rebelId = `${game.rebelPlayers[0].seat}`;
  for (const held of game.gameMap.getAllSectors().filter(s => game.dictatorControls(s))) {
    for (const adjacent of game.getAdjacentSectors(held)) {
      if (game.dictatorControls(adjacent)) continue;
      adjacent.addRebelMilitia(rebelId, count);
      return adjacent;
    }
  }
  throw new Error('no sector adjacent to a dictator-held sector to garrison');
}

describe('artillery allocation flow', () => {
  it('asks the shelled rebel to allocate, not the dictator whose turn it is', () => {
    const runner = runnerWithHumanDictator('artillery-flow-asks-rebel');
    runner.start();
    const game = runner.game;

    const { seat: dictatorSeat } = reachArtilleryPlay(runner);
    garrisonAdjacentSector(game, 6);

    const play = enumerateLegalMoves(game, dictatorSeat, { maxPerAction: 1 })
      .find(m => m.action === 'playTactics')!;
    const result = runner.performAction('playTactics', dictatorSeat, play.args);

    expect(result.success, result.error).toBe(true);
    expect(game.pendingArtilleryAllocation, 'the barrage did not pause for allocation').not.toBeNull();

    const waiting = getCurrentAction(game.getFlowState());
    expect(waiting?.available).toContain('artilleryAllocateHits');
    expect(waiting?.currentPlayer, 'the dictator cannot allocate a rebel hit')
      .toBe(game.rebelPlayers[0].seat);
  });

  it('finishes the allocation instead of halting the flow', () => {
    const runner = runnerWithHumanDictator('artillery-flow-finishes');
    runner.start();
    const game = runner.game;

    const { seat: dictatorSeat } = reachArtilleryPlay(runner);
    garrisonAdjacentSector(game, 6);

    const play = enumerateLegalMoves(game, dictatorSeat, { maxPerAction: 1 })
      .find(m => m.action === 'playTactics')!;
    expect(runner.performAction('playTactics', dictatorSeat, play.args).success).toBe(true);

    for (let i = 0; i < 30 && game.pendingArtilleryAllocation; i++) {
      const waiting = getCurrentAction(game.getFlowState());
      expect(waiting, 'nobody can act while artillery is still pending').not.toBeNull();
      const moves = enumerateLegalMoves(game, waiting!.currentPlayer, { maxPerAction: 1 });
      expect(moves.length, 'the allocation prompt has no legal answer').toBeGreaterThan(0);
      const outcome = runner.performAction(moves[0].action, waiting!.currentPlayer, moves[0].args);
      expect(outcome.success, outcome.error).toBe(true);
    }

    expect(game.pendingArtilleryAllocation, 'artillery never finished allocating').toBeNull();
  });

  it('never asks a rebel for more hits than their units can take', () => {
    const runner = runnerWithHumanDictator('artillery-flow-overshoot');
    runner.start();
    const game = runner.game;
    const rebel = game.rebelPlayers[0];

    const { seat: dictatorSeat } = reachArtilleryPlay(runner);
    garrisonAdjacentSector(game, 1);
    const play = enumerateLegalMoves(game, dictatorSeat, { maxPerAction: 1 })
      .find(m => m.action === 'playTactics')!;
    expect(runner.performAction('playTactics', dictatorSeat, play.args).success).toBe(true);

    const pending = game.pendingArtilleryAllocation!;
    expect(pending, 'the barrage did not pause for allocation').not.toBeNull();

    // Four more hits than the sector has anywhere to put them. The rules waste
    // the surplus; the prompt must not insist on placing it.
    const capacity = pending.validTargets
      .filter(t => t.ownerId === `${rebel.seat}`)
      .reduce((sum, t) => sum + t.currentHealth, 0);
    pending.hits = capacity + 4;

    const moves = enumerateLegalMoves(game, rebel.seat, { maxPerAction: 1 })
      .filter(m => m.action === 'artilleryAllocateHits');
    expect(moves.length, 'more hits than targets left the prompt unanswerable').toBeGreaterThan(0);

    expect(runner.performAction('artilleryAllocateHits', rebel.seat, moves[0].args).success).toBe(true);
    expect(game.pendingArtilleryAllocation, 'surplus hits kept the barrage pending').toBeNull();
  });

  it('skips a queued sector whose rebels are already gone', () => {
    const runner = runnerWithHumanDictator('artillery-flow-empty-sector');
    runner.start();
    const game = runner.game;

    reachArtilleryPlay(runner);
    const emptySector = game.gameMap.getAllSectors().find(s =>
      s.getTotalRebelMilitia() === 0 &&
      !game.dictatorControls(s) &&
      game.rebelPlayers.every(r => game.getMercsInSector(s, r).length === 0)
    )!;

    const set = advanceArtilleryAllocation(game, [
      { sectorId: emptySector.sectorId, sectorName: emptySector.sectorName, hits: 3 },
    ]);

    expect(set, 'a sector with no rebels must not become the pending allocation').toBe(false);
    expect(game.pendingArtilleryAllocation).toBeNull();
  });
});
