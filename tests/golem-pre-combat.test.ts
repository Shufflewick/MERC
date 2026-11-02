import { describe, it, expect } from 'vitest';
import { GameRunner } from 'boardsmith/runtime';
import { gameDefinition } from '../src/rules/index';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel } from '../src/rules/elements.js';
import { executeCombat } from '../src/rules/combat.js';

/**
 * Issue #113: Golem "may attack any 1 target before the first round of combat",
 * so once per combat. His own target selection and the end-of-round retreat
 * decision both pause combat, and neither may bring the strike back.
 */
describe('Golem pre-combat strike (#113)', () => {
  it('lands once and is not offered again across pauses and rounds', () => {
    const runner = new GameRunner({
      GameClass: gameDefinition.gameClass,
      gameType: gameDefinition.gameType,
      gameOptions: {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'golem-strikes-once',
        playerIsBot: [false, true],
      },
    }) as GameRunner<MERCGame>;
    runner.start();
    const game = runner.game;
    const rebel = game.rebelPlayers[0];
    const sector = game.gameMap.getAllSectors()[0];

    const golem = game.first(CombatantModel, m => m.isMerc && m.combatantId === 'golem')!;
    golem.damage = 0;
    golem.putInto(rebel.primarySquad);
    rebel.primarySquad.sectorId = sector.sectorId;
    sector.dictatorMilitia = 4;

    const messagesBefore = game.messages.length;
    let offers = 0;
    let rounds = 1;
    executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true });
    for (let step = 0; step < 50 && game.activeCombat && !game.activeCombat.combatComplete; step++) {
      const combat = game.activeCombat;
      combat.selectedTargets ??= new Map();
      if (combat.pendingGolemAttack) {
        offers++;
        const pending = combat.pendingGolemAttack;
        combat.selectedTargets.set(`golem:${pending.golemId}`, [pending.validTargets[0].id]);
        combat.pendingGolemAttack = undefined;
      } else if (combat.pendingTargetSelection) {
        const pending = combat.pendingTargetSelection;
        combat.selectedTargets.set(pending.attackerId, [pending.validTargets[0].id]);
        combat.pendingTargetSelection = undefined;
      } else if (combat.awaitingRetreatDecisions) {
        rounds++;
      } else {
        throw new Error(`Unexpected combat pause: ${JSON.stringify(Object.keys(combat))}`);
      }
      executeCombat(game, sector, rebel);
    }

    // Each resolution of the strike logs either the strike or the hold.
    const resolutions = game.messages.slice(messagesBefore)
      .filter(m => /strikes before combat begins|holds his pre-combat strike/.test(m.text)).length;
    expect(rounds, 'combat ended before round 2, so the test proves nothing').toBeGreaterThanOrEqual(2);
    expect(offers).toBe(1);
    expect(resolutions).toBe(1);
  });
});
