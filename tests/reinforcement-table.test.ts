import { describe, it, expect } from 'vitest';
import { ReinforcementTable, getReinforcementAmount } from '../src/rules/constants.js';

/**
 * Rulebook p.5, "Reinforce": "a number of militia ... equal to half the number
 * of Rebel players in the game (round up), plus one."
 */
describe('reinforcement amounts', () => {
  it('rounds up, then adds one', () => {
    expect([1, 2, 3, 4, 5, 6].map(getReinforcementAmount)).toEqual([2, 2, 3, 3, 4, 4]);
  });

  it('keeps the reference table in step with the live formula', () => {
    expect(ReinforcementTable).toEqual({ 1: 2, 2: 2, 3: 3, 4: 3, 5: 4, 6: 4 });
  });
});
