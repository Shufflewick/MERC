import { describe, it, expect } from 'vitest';
import { enumerateLegalMoves } from 'boardsmith';
import { GameRunner } from 'boardsmith/runtime';
import { MERCGame } from '../src/rules/game.js';
import { TacticsCard } from '../src/rules/elements.js';
import { createTestGame } from 'boardsmith/testing';
import { getCurrentAction } from './helpers/auto-play.js';
import { activeCombatIn } from './helpers/combat-state.js';

/**
 * Issue #59: a combat the dictator starts stalled on its first continuation.
 * Every continuation action refused with "no player holds seat N", so the flow
 * kept offering an action nobody could complete. Driven through the real flow
 * with `enumerateLegalMoves`, because the defect was in how a continuation found
 * the combat's players, which only a submitted continuation shows.
 */
describe('dictator-initiated combat', () => {
  it('runs to the end when the dictator starts it with Fodder', () => {
    const runner = new GameRunner<MERCGame>({
      GameClass: MERCGame,
      gameType: 'merc',
      gameOptions: {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'dictator-initiated-combat',
        playerConfigs: [
          { color: '#e74c3c', isDictator: false, isBot: false },
          { color: '#95a5a6', isDictator: true, isBot: false },
        ],
      } as never,
    });
    runner.start();
    const game = runner.game;
    const rebel = game.rebelPlayers[0];

    let dictatorSeat: number | undefined;
    for (let i = 0; i < 400 && dictatorSeat === undefined; i++) {
      const current = getCurrentAction(game.getFlowState())!;
      if (current.available.includes('playTactics')) {
        dictatorSeat = current.currentPlayer;
        break;
      }
      const moves = enumerateLegalMoves(game, current.currentPlayer, { maxPerAction: 1 });
      runner.performAction(moves[0].action, current.currentPlayer, moves[0].args);
    }
    expect(dictatorSeat, 'the dictator was never offered playTactics').toBeDefined();

    const hand = game.dictatorPlayer.tacticsHand!;
    for (const held of hand.all(TacticsCard)) held.remove();
    hand.create(TacticsCard, 'fodder-under-test', {
      tacticsId: 'fodder', tacticsName: 'Fodder', story: '', description: '', revealsBase: false,
    });
    // Fodder strikes the rebel's largest militia stack; put it under their squad.
    const squadSector = game.getSector(rebel.primarySquad.sectorId!)!;
    squadSector.addRebelMilitia(`${rebel.seat}`, 6);

    const play = enumerateLegalMoves(game, dictatorSeat!, { maxPerAction: 1 })
      .find(m => m.action === 'playTactics')!;
    expect(runner.performAction('playTactics', dictatorSeat!, play.args).success).toBe(true);
    expect(game.activeCombat?.attackingPlayerIsRebel, 'Fodder did not start a dictator combat').toBe(false);

    for (let i = 0; i < 100 && game.activeCombat; i++) {
      const waiting = getCurrentAction(game.getFlowState());
      expect(waiting, 'nobody can act while the combat is running').not.toBeNull();
      const moves = enumerateLegalMoves(game, waiting!.currentPlayer, { maxPerAction: 1 });
      expect(moves.length, `${waiting!.available.join('/')} has no legal answer`).toBeGreaterThan(0);
      const outcome = runner.performAction(moves[0].action, waiting!.currentPlayer, moves[0].args);
      expect(outcome.success, outcome.error).toBe(true);
    }
    expect(game.activeCombat, 'the combat never finished').toBeNull();
  });

  it('a refused Golem choice leaves the strike pending so it can be answered again', () => {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'golem-refusal-keeps-state',
    }).game;
    const sector = game.gameMap.getAllSectors()[0];
    // Seat 99 holds nobody, so continuing the combat must refuse.
    game.activeCombat = {
      ...activeCombatIn(sector.sectorId, 99),
      pendingGolemAttack: { golemId: 'golem-1', golemName: 'Golem', validTargets: [] },
    };

    const result = game.performAction('golemSkipPreCombat', game.rebelPlayers[0], {});

    expect(result.success).toBe(false);
    expect(game.activeCombat.pendingGolemAttack, 'the refusal consumed the Golem prompt').toBeDefined();
    expect(game.activeCombat.selectedTargets?.has('golem:golem-1') ?? false).toBe(false);
  });
});
