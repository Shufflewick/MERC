import { describe, it, expect } from 'vitest';
import { GameRunner } from 'boardsmith/runtime';
import { gameDefinition } from '../src/rules/index';

/**
 * The platform decides which seat sees the dictator UI from the `role` attribute
 * on each player in the serialized view. If that attribute stops serializing,
 * every seat renders as a rebel, so this asserts it rather than logging it.
 */
describe('Platform dictator view', () => {
  function startRunner() {
    const runner = new GameRunner({
      GameClass: gameDefinition.gameClass,
      gameType: gameDefinition.gameType,
      gameOptions: {
        playerCount: 2,
        seed: '12345',
        exclusiveSeats: { role: 1 },
        playerOptions: [{ role: 'dictator' }, {}],
        playerIsAI: [false, true],
        dictatorCharacter: 'random',
      },
    });
    runner.start();
    return runner;
  }

  /** The attributes of every MERCPlayer element in a serialized tree, by id. */
  function playerAttributes(root: unknown): Array<Record<string, any>> {
    const byId = new Map<unknown, Record<string, any>>();
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (node.className === 'MERCPlayer' && node.attributes) {
        byId.set(node.id, node.attributes);
      }
      Object.values(node).forEach(walk);
    };
    walk(root);
    return [...byId.values()];
  }

  it('exposes exactly one dictator seat and one rebel seat', () => {
    const runner = startRunner();
    const roles = playerAttributes(runner.getSnapshot()).map(p => p.role);

    expect(roles.filter(r => r === 'dictator')).toHaveLength(1);
    expect(roles.filter(r => r === 'rebel')).toHaveLength(1);
  });

  it('serializes role into every player view', () => {
    const runner = startRunner();

    for (const view of runner.getAllPlayerViews()) {
      const roles = playerAttributes(view).map(p => p.role);
      expect(roles).toContain('dictator');
      expect(roles).toContain('rebel');
    }
  });
});
