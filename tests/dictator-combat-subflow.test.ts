import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { createGameFlow } from '../src/rules/flow.js';

/**
 * The dictator's turn can start combat three ways — a tactics card (Fodder),
 * a dictator MERC moving in, and Kim's militia placement — and each must route
 * through combatResolutionFlow so the pause/resume steps exist. This walks the
 * built flow definition rather than grepping the source, so it survives renames
 * and fails if a call site is actually removed.
 */
describe('Dictator combat sub-flows', () => {
  function stepNames(): string[] {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'subflow-structure',
    }).game;

    const names: string[] = [];
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (typeof node.name === 'string') names.push(node.name);
      Object.values(node).forEach(walk);
    };
    walk(createGameFlow(game));
    return names;
  }

  it('builds a combat resolution sub-flow for each dictator entry point', () => {
    const names = stepNames();

    for (const prefix of ['tactics-combat', 'dictator-combat', 'kim-militia-combat']) {
      expect(names, `${prefix} sub-flow missing from the flow`).toContain(`${prefix}-continue`);
      expect(names).toContain(`${prefix}-retreat-decision`);
      expect(names).toContain(`${prefix}-target-selection`);
    }
  });
});
