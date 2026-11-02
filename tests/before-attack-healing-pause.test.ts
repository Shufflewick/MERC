import { describe, it, expect } from 'vitest';
import { GameRunner } from 'boardsmith/runtime';
import { gameDefinition } from '../src/rules/index';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Equipment } from '../src/rules/elements.js';
import { executeCombat } from '../src/rules/combat.js';

/** A lone rebel MERC with a Medical Kit and 1 damage, against 4 militia, human rebel. */
function woundedMercAgainstMilitia(seed: string) {
  const runner = new GameRunner({
    GameClass: gameDefinition.gameClass,
    gameType: gameDefinition.gameType,
    gameOptions: {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed,
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
  return { runner, game, rebel, sector };
}

/**
 * #113 review F1: a MERC answers the before-attack healing prompt once per turn.
 * His target selection pauses combat right after, and that pause must not
 * forget the answer and ask again.
 */
describe('before-attack healing across a target-selection pause', () => {
  it('is not offered again to the same attacker in the same round', () => {
    const { game, rebel, sector } = woundedMercAgainstMilitia('heal-once-per-turn');

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

  it('resumes the same round at the first attacker when he skips healing (#120)', () => {
    const { runner, game: started, rebel, sector } = woundedMercAgainstMilitia('heal-once-per-turn');

    executeCombat(started, sector, rebel, { attackingPlayerIsRebel: true });
    const paused = started.activeCombat!;
    expect(paused.currentAttackerIndex, 'the MERC should be the round\'s first attacker').toBe(0);
    const attackerId = paused.pendingBeforeAttackHealing?.attackerId;
    const order = paused.roundInitiativeOrder;
    expect(started.performAction('combatSkipBeforeAttackHeal', rebel, {}).success).toBe(true);

    // A real host runs every action on a game restored from a JSON snapshot.
    const snapshot = JSON.parse(JSON.stringify(runner.getSnapshot()));
    const game = GameRunner.fromSnapshot<MERCGame>(snapshot, gameDefinition.gameClass).game;
    executeCombat(game, game.getSector(sector.sectorId)!, game.rebelPlayers[0]);

    const combat = game.activeCombat!;
    expect(combat.round).toBe(1);
    expect(combat.pendingTargetSelection?.attackerId, 'the same MERC should now pick his target').toBe(attackerId);
    expect(combat.roundInitiativeOrder).toEqual(order);
    const roundHeaders = (game.messages as { text: string }[]).filter(m => m.text.startsWith('--- Round'));
    expect(roundHeaders.map(m => m.text), 'round setup should run once').toEqual(['--- Round 1 ---']);
  });
});

describe('before-attack healing from a bandolier (#121)', () => {
  it('discards a spent Medical Kit from the second bandolier slot after the first was emptied', () => {
    const { game, rebel, sector } = woundedMercAgainstMilitia('heal-bandolier-gap');
    const merc = rebel.primarySquad.getMercs()[0];
    const kit = merc.unequip('Accessory')!;
    merc.equip(game.first(Equipment, e => e.equipmentId === 'bandolier')!);
    const filler = game.first(Equipment, e => e.equipmentId === 'field-radio')!;
    merc.equip(filler);
    merc.equip(kit);
    expect(kit.equippedSlot).toBe('bandolier:1');
    expect(game.performAction('dropEquipment', rebel, { actingMerc: merc, equipment: filler }).success).toBe(true);
    kit.usesRemaining = 1;

    executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true });
    const pending = game.activeCombat!.pendingBeforeAttackHealing!;
    const healer = pending.availableHealers[0];
    const target = pending.damagedAllies[0];
    const result = game.performAction('combatBeforeAttackHeal', rebel, {
      healer: `${healer.healerName} (${healer.itemName})`,
      target: `${target.name} (${target.damage} damage)`,
    });

    expect(result.success, result.error).toBe(true);
    expect(kit.equippedSlot).toBeUndefined();
    expect(kit.parent).toBe(game.accessoriesDiscard);
  });
});
