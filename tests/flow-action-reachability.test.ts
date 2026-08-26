import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';

/**
 * The engine warns when an action is registered but named by no actionStep(),
 * because the flow's allow-list then refuses it and no UI control can ever
 * invoke it. Six actions had drifted into that state (issue #54), taking the
 * sector stash, combat healing and the Surgeon's ability offline. This asserts
 * the warning stays silent so the same drift cannot happen quietly again.
 */
describe('flow action reachability', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers no action that the flow never offers', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'action-reachability',
    });

    const orphaned = warn.mock.calls
      .map(args => String(args[0]))
      .filter(message => message.includes('registered but referenced by no actionStep'));

    expect(orphaned, orphaned.join('\n')).toEqual([]);
  });
});
