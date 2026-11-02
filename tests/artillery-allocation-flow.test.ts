import { describe, it, expect } from 'vitest';
import { enumerateLegalMoves } from 'boardsmith';
import { GameRunner } from 'boardsmith/runtime';
import { MERCGame } from '../src/rules/game.js';
import { TacticsCard, Sector } from '../src/rules/elements.js';
import { advanceArtilleryAllocation } from '../src/rules/tactics-effects.js';
import { getCurrentAction } from './helpers/auto-play.js';
import { mcts } from 'boardsmith/sim';
import { gameDefinition } from '../src/rules/index.js';

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
        { color: '#e74c3c', isBot: false },
        { color: '#95a5a6', isBot: false },
      ],
    } as never,
  });
}

function runnerWithTwoRebels(seed: string): GameRunner<MERCGame> {
  return new GameRunner<MERCGame>({
    GameClass: MERCGame,
    gameType: 'merc',
    gameOptions: {
      playerCount: 3,
      playerNames: ['Rebel1', 'Rebel2', 'Dictator'],
      seed,
      playerConfigs: [
        { color: '#e74c3c', isBot: false },
        { color: '#3498db', isBot: false },
        { color: '#95a5a6', isBot: false },
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

/** Put `count` militia of each given rebel (the first rebel by default) in a sector the dictator can shell. */
function garrisonAdjacentSector(game: MERCGame, count: number, rebels = [game.rebelPlayers[0]]): Sector {
  for (const held of game.gameMap.getAllSectors().filter(s => game.dictatorControls(s))) {
    for (const adjacent of game.getAdjacentSectors(held)) {
      if (game.dictatorControls(adjacent)) continue;
      for (const rebel of rebels) adjacent.addRebelMilitia(`${rebel.seat}`, count);
      return adjacent;
    }
  }
  throw new Error('no sector adjacent to a dictator-held sector to garrison');
}

/** Play the Artillery Barrage the dictator holds and fix the pending sector's hits at `hits`. */
function shell(runner: GameRunner<MERCGame>, dictatorSeat: number, hits: number) {
  const game = runner.game;
  const play = enumerateLegalMoves(game, dictatorSeat, { maxPerAction: 1 })
    .find(m => m.action === 'playTactics')!;
  const result = runner.performAction('playTactics', dictatorSeat, play.args);
  expect(result.success, result.error).toBe(true);
  const pending = game.pendingArtilleryAllocation!;
  expect(pending, 'the barrage did not pause for allocation').not.toBeNull();
  pending.hits = hits;
  return pending;
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

  // Issue #81: the designer ruled that the dictator places the hits when the
  // shelled sector holds more than one rebel's units. The card text lets rebels
  // choose, so a sector holding one rebel's units stays theirs to allocate.
  it('asks the dictator to allocate when two rebels share the shelled sector', () => {
    const runner = runnerWithTwoRebels('artillery-two-rebels-human');
    runner.start();
    const game = runner.game;
    const [first, second] = game.rebelPlayers;

    const { seat: dictatorSeat } = reachArtilleryPlay(runner);
    const sector = garrisonAdjacentSector(game, 3, [first, second]);
    // Only this sector is shelled, so the barrage ends with this allocation.
    shell(runner, dictatorSeat, 2).sectorsRemaining.length = 0;

    const waiting = getCurrentAction(game.getFlowState());
    expect(waiting?.available).toContain('artilleryAllocateHits');
    expect(waiting?.currentPlayer, 'a rebel was asked to allocate a shared sector').toBe(dictatorSeat);
    for (const rebel of [first, second]) {
      expect(enumerateLegalMoves(game, rebel.seat).some(m => m.action === 'artilleryAllocateHits'),
        `${rebel.name} may still allocate`).toBe(false);
    }

    const result = runner.performAction('artilleryAllocateHits', dictatorSeat, {
      allocations: [
        `militia-${first.seat}-${sector.sectorId}::0`,
        `militia-${second.seat}-${sector.sectorId}::0`,
      ],
    });

    expect(result.success, result.error).toBe(true);
    expect(sector.getRebelMilitia(`${first.seat}`)).toBe(2);
    expect(sector.getRebelMilitia(`${second.seat}`)).toBe(2);
    expect(game.pendingArtilleryAllocation, 'artillery never finished allocating').toBeNull();
  });

  it('lets a bot dictator place every hit across both rebels', { timeout: 120_000 }, async () => {
    const runner = runnerWithTwoRebels('artillery-two-rebels-bot');
    runner.start();
    const game = runner.game;
    const [first, second] = game.rebelPlayers;

    const { seat: dictatorSeat } = reachArtilleryPlay(runner);
    // Two militia each and three hits, so the bot has several ways to place them.
    const sector = garrisonAdjacentSector(game, 2, [first, second]);
    shell(runner, dictatorSeat, 3).sectorsRemaining.length = 0;

    let draws = 0;
    const move = await mcts(30).choose({
      game, seat: dictatorSeat, random: { next: () => ++draws }, definition: gameDefinition,
    } as never);
    if ('noMove' in move) throw new Error(move.noMove);
    if ('waitUntil' in move) throw new Error(`The bot waited for the step clock (until ${move.waitUntil}) instead of moving, but MERC has no timed steps.`);
    expect(move.action).toBe('artilleryAllocateHits');

    const result = runner.performAction(move.action, dictatorSeat, move.args);
    expect(result.success, result.error).toBe(true);
    expect(sector.getRebelMilitia(`${first.seat}`) + sector.getRebelMilitia(`${second.seat}`),
      'the bot did not place all three hits').toBe(1);
    expect(game.pendingArtilleryAllocation).toBeNull();
  });

  it('offers a wounded MERC every hit it can still take and kills it when they all land', () => {
    const runner = runnerWithTwoRebels('artillery-two-rebels-merc');
    runner.start();
    const game = runner.game;
    const [first, second] = game.rebelPlayers;

    const { seat: dictatorSeat } = reachArtilleryPlay(runner);
    const sector = garrisonAdjacentSector(game, 1, [second]);
    first.primarySquad.sectorId = sector.sectorId;
    const [merc] = game.getMercsInSector(sector, first);
    // No Epinephrine Shot to spend, so the last hit kills.
    for (const squadmate of first.team) {
      if (squadmate.accessorySlot) squadmate.unequip('Accessory');
      for (const item of [...squadmate.bandolierSlots]) squadmate.unequipBandolierItem(item);
    }
    merc.takeDamage(1);
    const left = merc.health;
    expect(left, 'the wounded MERC has no health to test with').toBeGreaterThan(0);

    const pending = shell(runner, dictatorSeat, left + 1);
    pending.sectorsRemaining.length = 0;
    const offered = pending.validTargets.find(t => t.id === merc.combatantId);
    expect(offered?.currentHealth, 'the MERC is offered fewer hits than its health').toBe(left);

    const result = runner.performAction('artilleryAllocateHits', dictatorSeat, {
      allocations: [
        ...Array.from({ length: left }, (_, i) => `${merc.combatantId}::${i}`),
        `militia-${second.seat}-${sector.sectorId}::0`,
      ],
    });

    expect(result.success, result.error).toBe(true);
    expect(first.team, 'a MERC killed by artillery stayed on the team').not.toContain(merc);
    expect(merc.parent, 'a MERC killed by artillery was not discarded').toBe(game.mercDiscard);
  });
});
