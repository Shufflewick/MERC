import { describe, it, expect } from 'vitest';
import { buildActionArgs } from 'boardsmith';
import { createHeadlessSession } from 'boardsmith/testing';
import { gameDefinition } from '../src/rules/index.js';
import { autoResolveArgs, getCurrentAction } from './helpers/auto-play.js';

// Two rebels, so the dictator has extra militia to place; the last seat is the dictator.
const DICTATOR = 3;

/** A 3-player table played up to the human dictator's first Day 1 step, where they pick Castro. */
async function tableAtDictatorSetup() {
  const session = createHeadlessSession(gameDefinition, {
    playerCount: 3,
    seed: 'i78-setup-undo',
  });
  await session.start();

  const act = async (seat: number, actionName: string, chosen?: Record<string, unknown>) => {
    const game = session.readGame();
    const args = chosen ?? autoResolveArgs(game, actionName, seat);
    expect(args, `${actionName} has legal args`).not.toBeNull();
    const wire = buildActionArgs(actionName, args!, game, seat, { format: 'wire' });
    const result = await session.send(seat, { type: 'action', actionName, player: seat, args: wire });
    expect(result.success, result.error).toBe(true);
  };
  const undo = () => session.send(DICTATOR, { type: 'undo', player: DICTATOR });
  const available = () => session.readGame().getFlowState()?.availableActions;

  for (let next = getCurrentAction(session.readGame().getFlowState()); next && next.currentPlayer !== DICTATOR;
    next = getCurrentAction(session.readGame().getFlowState())) {
    await act(next.currentPlayer, next.available[0]);
  }
  await act(DICTATOR, 'selectDictator', { dictatorChoice: 'Castro' });
  return { session, act, undo, available };
}

describe('dictator Day 1 setup undo', () => {
  it('lets a human dictator take back the MERC hire from the next setup step', async () => {
    const { session, act, undo, available } = await tableAtDictatorSetup();
    const mercCount = () => session.readGame().dictatorPlayer.team.filter(m => m.isMerc).length;

    await act(DICTATOR, 'dictatorPlaceInitialMilitia');
    await act(DICTATOR, 'dictatorHireFirstMerc');
    expect(mercCount()).toBe(1);
    expect(available()).toContain('dictatorSetupAbility');

    const result = await undo();
    expect(result.success, result.error).toBe(true);
    expect(mercCount()).toBe(0);
    expect(available()).toContain('dictatorHireFirstMerc');
  });

  it('undoes extra militia back to the tactics draw, but not behind it', async () => {
    const { session, act, undo, available } = await tableAtDictatorSetup();
    const militia = () => session.readGame().gameMap.getAllSectors().reduce((n, s) => n + s.dictatorMilitia, 0);

    await act(DICTATOR, 'dictatorPlaceInitialMilitia');
    await act(DICTATOR, 'dictatorHireFirstMerc');
    await act(DICTATOR, 'dictatorSetupAbility');
    await act(DICTATOR, 'dictatorDrawTactics');
    const militiaBefore = militia();
    await act(DICTATOR, 'dictatorPlaceExtraMilitia');
    expect(militia()).toBeGreaterThan(militiaBefore);

    const result = await undo();
    expect(result.success, result.error).toBe(true);
    expect(militia()).toBe(militiaBefore);
    expect(available()).toContain('dictatorDrawTactics');

    expect((await undo()).success).toBe(false);
  });
});
