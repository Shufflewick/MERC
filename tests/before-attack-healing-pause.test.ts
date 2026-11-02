import { describe, it, expect } from 'vitest';
import { GameRunner } from 'boardsmith/runtime';
import { gameDefinition } from '../src/rules/index';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Equipment } from '../src/rules/elements.js';
import { executeCombat } from '../src/rules/combat.js';

/**
 * #113 review F1: a MERC answers the before-attack healing prompt once per turn.
 * His target selection pauses combat right after, and that pause must not
 * forget the answer and ask again.
 */
describe('before-attack healing across a target-selection pause', () => {
  it('is not offered again to the same attacker in the same round', () => {
    const runner = new GameRunner({
      GameClass: gameDefinition.gameClass,
      gameType: gameDefinition.gameType,
      gameOptions: {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'heal-once-per-turn',
        playerIsBot: [false, true],
      },
    }) as GameRunner<MERCGame>;
    runner.start();
    const game = runner.game;
    const rebel = game.rebelPlayers[0];
    const sector = game.gameMap.getAllSectors()[0];

    const merc = game.first(CombatantModel, m => m.isMerc && !m.isDead
      && !['golem', 'surgeon'].includes(m.combatantId))!;
    merc.damage = 1;
    merc.equip(game.first(Equipment, e => e.equipmentId === 'medical-kit')!);
    merc.putInto(rebel.primarySquad);
    rebel.primarySquad.sectorId = sector.sectorId;
    sector.dictatorMilitia = 4;

    executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true });
    const attackerId = game.activeCombat!.pendingBeforeAttackHealing?.attackerId;
    expect(attackerId, 'the MERC should be offered healing before his attack').toBeDefined();
    expect(game.performAction('combatSkipBeforeAttackHeal', rebel, {}).success).toBe(true);
    executeCombat(game, sector, rebel);

    const selection = game.activeCombat!.pendingTargetSelection;
    const selectionRound = game.activeCombat!.round;
    expect(selection?.attackerId, 'the MERC should then pick his target').toBe(attackerId);
    expect(game.performAction('combatSelectTarget', rebel, { targets: [selection!.validTargets[0].id] }).success)
      .toBe(true);

    const combat = game.activeCombat!;
    const askedAgainThisRound = combat.round === selectionRound && combat.pendingBeforeAttackHealing?.attackerId === attackerId;
    expect(askedAgainThisRound).toBe(false);
  });
});
