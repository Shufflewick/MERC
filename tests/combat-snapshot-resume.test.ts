import { describe, it, expect } from 'vitest';
import { GameRunner } from 'boardsmith/runtime';
import { gameDefinition } from '../src/rules/index';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Sector } from '../src/rules/elements.js';
import { executeCombat } from '../src/rules/combat.js';

/**
 * activeCombat is the riskiest state in the game: pending decision contexts,
 * Maps keyed by combatant id, and mirror objects holding element references.
 * A save/reload (or a platform snapshot restore) mid-combat must bring all of it
 * back and let combat resume, which no test covered before.
 */
function startRunner(seed: string): GameRunner<MERCGame> {
  const runner = new GameRunner({
    GameClass: gameDefinition.gameClass,
    gameType: gameDefinition.gameType,
    gameOptions: {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed,
      // Two humans, so combat pauses for decisions instead of auto-resolving.
      playerIsAI: [false, false],
      dictatorCharacter: 'random',
    },
  }) as GameRunner<MERCGame>;
  runner.start();
  return runner;
}

/** Stage a rebel MERC against dictator militia in one sector and start combat. */
function stageCombat(game: MERCGame): Sector {
  const rebel = game.rebelPlayers[0];
  const sector = game.gameMap.getAllSectors()[0];

  const merc = game.first(CombatantModel, m => m.isMerc && !m.isDead)!;
  merc.damage = 0;
  merc.putInto(rebel.primarySquad);
  rebel.primarySquad.sectorId = sector.sectorId;

  sector.dictatorMilitia = 3;

  executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true });
  return sector;
}

describe('mid-combat snapshot / restore / resume', () => {
  it('brings a paused combat back intact and lets it finish', () => {
    const runner = startRunner('combat-snapshot');
    const sector = stageCombat(runner.game);

    const before = runner.game.activeCombat;
    expect(before, 'combat should have paused for a player decision').not.toBeNull();
    // Confirm it really is a pause, not a finished combat left lying around.
    const pendingKinds = [
      before!.pendingTargetSelection, before!.pendingHitAllocation,
      before!.pendingAttackDogSelection, before!.pendingWolverineSixes,
      before!.pendingEpinephrine, before!.pendingBeforeAttackHealing,
      before!.pendingGolemAttack,
    ].filter(v => v != null);
    expect(
      pendingKinds.length > 0 || before!.awaitingRetreatDecisions === true,
      'expected a pending decision or a retreat decision'
    ).toBe(true);

    // Round-trip through JSON, as a real save/reload does.
    const snapshot = JSON.parse(JSON.stringify(runner.getSnapshot()));
    const restored = GameRunner.fromSnapshot<MERCGame>(snapshot, gameDefinition.gameClass);

    const after = restored.game.activeCombat;
    expect(after).not.toBeNull();
    expect(after!.sectorId).toBe(before!.sectorId);
    expect(after!.attackingPlayerId).toBe(before!.attackingPlayerId);
    expect(after!.round).toBe(before!.round);
    expect(after!.rebelCombatants.length).toBe(before!.rebelCombatants.length);
    expect(after!.dictatorCombatants.length).toBe(before!.dictatorCombatants.length);

    // The keyed fields must come back as real Maps/Sets, not plain objects —
    // combat calls .get/.has/.clear on them every round.
    for (const field of ['selectedTargets', 'selectedDogTargets', 'healingDiceUsed'] as const) {
      const value = after![field];
      if (value !== undefined) expect(value).toBeInstanceOf(Map);
    }
    if (after!.beforeAttackHealingProcessed !== undefined) {
      expect(after!.beforeAttackHealingProcessed).toBeInstanceOf(Set);
    }
    if (after!.retreatDecisions !== undefined) {
      expect(after!.retreatDecisions).toBeInstanceOf(Map);
    }

    // And combat must be resumable in the restored game.
    const restoredSector = restored.game.getSector(sector.sectorId)!;
    const rebel = restored.game.rebelPlayers[0];
    expect(() => executeCombat(restored.game, restoredSector, rebel)).not.toThrow();
  });

  it('preserves stored target selections across a restore', () => {
    const runner = startRunner('combat-snapshot-targets');
    stageCombat(runner.game);

    const combat = runner.game.activeCombat!;
    combat.selectedTargets = new Map([['attacker-1', ['target-a', 'target-b']]]);
    combat.healingDiceUsed = new Map([['attacker-1', 2]]);
    combat.beforeAttackHealingProcessed = new Set(['attacker-1']);

    const snapshot = JSON.parse(JSON.stringify(runner.getSnapshot()));
    const restored = GameRunner.fromSnapshot<MERCGame>(snapshot, gameDefinition.gameClass);

    const after = restored.game.activeCombat!;
    expect(after.selectedTargets?.get('attacker-1')).toEqual(['target-a', 'target-b']);
    expect(after.healingDiceUsed?.get('attacker-1')).toBe(2);
    expect(after.beforeAttackHealingProcessed?.has('attacker-1')).toBe(true);
  });
});
