import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * FLOW-05 Verification Tests
 *
 * Phase 54: Verify that the dictator turn uses combatResolutionFlow
 * at all 3 call sites (tactics combat, dictator MERC combat, Kim militia combat).
 *
 * This is structural verification -- the behavior is already covered
 * by existing flow and combat tests.
 */

describe('Dictator Combat Sub-flow (FLOW-05)', () => {

  it('dictator turn uses combatResolutionFlow at all 3 sites', () => {
    const flowSource = readFileSync('src/rules/flow.ts', 'utf-8');
    // Tactics combat
    expect(flowSource).toContain("combatResolutionFlow(game, 'tactics-combat')");
    // Dictator MERC combat
    expect(flowSource).toContain("combatResolutionFlow(game, 'dictator-combat')");
    // Kim militia combat
    expect(flowSource).toContain("combatResolutionFlow(game, 'kim-militia-combat')");
  });

});
