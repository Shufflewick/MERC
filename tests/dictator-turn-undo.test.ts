import { describe, it, expect } from 'vitest';
import { buildActionArgs, enumerateLegalMoves } from 'boardsmith';
import { createHeadlessSession } from 'boardsmith/testing';
import { gameDefinition } from '../src/rules/index.js';
import { getCurrentAction } from './helpers/auto-play.js';

// Two rebels; the last seat is the dictator.
const DICTATOR = 3;

/**
 * Plays a 3-player table, always taking the first legal move other than endTurn,
 * until the dictator is prompted at `step`, known by the actions it offers, straight after its own action.
 */
async function dictatorReprompted(step: string, offers: string) {
  const session = createHeadlessSession(gameDefinition, { playerCount: 3, seed: 'i100-dictator-turn' });
  await session.start();
  let lastSeat: number | undefined;
  for (let i = 0; i < 400; i++) {
    const game = session.readGame();
    const flow = game.getFlowState()!;
    const current = getCurrentAction(flow);
    expect(current, `the game stopped before reaching ${step}`).not.toBeNull();
    if (current!.available.includes(offers) && current!.currentPlayer === DICTATOR && lastSeat === DICTATOR) {
      return { session, undo: () => session.send(DICTATOR, { type: 'undo', player: DICTATOR }) };
    }
    const moves = enumerateLegalMoves(game, current!.currentPlayer, { maxPerAction: 1 });
    const move = moves.find(m => m.action !== 'endTurn') ?? moves[0];
    const wire = buildActionArgs(move.action, move.args, game, current!.currentPlayer, { format: 'wire' });
    const result = await session.send(current!.currentPlayer,
      { type: 'action', actionName: move.action, player: current!.currentPlayer, args: wire });
    expect(result.success, result.error).toBe(true);
    lastSeat = current!.currentPlayer;
  }
  throw new Error(`The dictator was never prompted at ${step} straight after acting`);
}

describe('dictator turn undo', () => {
  it('starts a new undo run at each dictator MERC action, so undo cannot take back a revealed tactics card or combat', async () => {
    const { undo } = await dictatorReprompted('dictator-merc-action', 'endTurn');
    const result = await undo();
    expect(result.success).toBe(false);
    expect(result.error).toBe('No actions to undo');
  });

  it('starts a new undo run once combat is over, so undo cannot reach back into it', async () => {
    const { undo } = await dictatorReprompted('wait-for-combat-animations', 'clearCombatAnimations');
    const result = await undo();
    expect(result.success).toBe(false);
    expect(result.error).toBe('No actions to undo');
  });
});
