import { describe, it, expect } from 'vitest';
import { GameRunner } from 'boardsmith/runtime';
import { gameDefinition } from '../src/rules/index';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel } from '../src/rules/elements.js';
import { executeCombat } from '../src/rules/combat.js';

/** A rebel MERC that hits one enemy, paused on picking it against dictator militia. */
function pausedOnSingleTargetPick() {
  const runner = new GameRunner({
    GameClass: gameDefinition.gameClass,
    gameType: gameDefinition.gameType,
    // Two humans, so combat pauses for the rebel's pick instead of auto-resolving.
    gameOptions: { playerCount: 2, playerNames: ['Rebel1', 'Dictator'], seed: 'single-target-pick', playerIsBot: [false, false] },
  }) as GameRunner<MERCGame>;
  runner.start();
  const game = runner.game;
  const rebel = game.rebelPlayers[0];
  const sector = game.gameMap.getAllSectors()[0];
  const merc = game.first(CombatantModel, m => m.isMerc && !m.isDead && m.combatantId === 'basic')!;
  merc.putInto(rebel.primarySquad);
  rebel.primarySquad.sectorId = sector.sectorId;
  sector.dictatorMilitia = 3;
  executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true });
  return { game, rebel };
}

describe('combatSelectTarget for a MERC with one target', () => {
  it('takes the pick as a list of one, as every multi-select pick is sent', () => {
    const { game, rebel } = pausedOnSingleTargetPick();
    const pending = game.activeCombat?.pendingTargetSelection;
    expect(pending, 'combat did not pause for the rebel to pick a target').toBeTruthy();
    expect(pending!.maxTargets).toBe(1);

    const target = pending!.validTargets[0];
    const result = game.performAction('combatSelectTarget', rebel, { targets: [target.id] });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(game.activeCombat?.pendingTargetSelection?.attackerId).not.toBe(pending!.attackerId);
  });

  it('refuses a second target', () => {
    const { game, rebel } = pausedOnSingleTargetPick();
    const [first, second] = game.activeCombat!.pendingTargetSelection!.validTargets;

    const result = game.performAction('combatSelectTarget', rebel, { targets: [first.id, second.id] });

    expect(result.success).toBe(false);
  });
});
