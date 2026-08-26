import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel } from '../src/rules/elements.js';
import { executeCombat } from '../src/rules/combat.js';

/**
 * The Surgeon heals with his own ability rather than a Medical Kit, so he never
 * appears among the before-attack healers. Until issue #54 that meant a
 * human-controlled Surgeon got no pause at all and combatSurgeonHeal, which is
 * only reachable from that pause, could never be offered.
 */
function setup(seed: string) {
  const game = createTestGame(MERCGame, {
    playerCount: 2,
    playerNames: ['Rebel1', 'Dictator'],
    seed,
  }).game;
  const rebel = game.rebelPlayers[0];
  const sector = game.gameMap.getAllSectors()[0];
  rebel.primarySquad.sectorId = sector.sectorId;
  return { game, rebel, sector };
}

function findMerc(game: MERCGame, combatantId: string): CombatantModel {
  const merc = game.first(CombatantModel, m => m.isMerc && m.combatantId === combatantId);
  if (!merc) throw new Error(`${combatantId} is not in the deck`);
  return merc;
}

describe('Surgeon before-attack healing pause', () => {
  it('pauses for a human Surgeon carrying no healing item', () => {
    const { game, rebel, sector } = setup('surgeon-pause');
    const surgeon = findMerc(game, 'surgeon');
    surgeon.putInto(rebel.primarySquad);
    // Act before the militia, so the pause under test is the one reached first.
    surgeon.baseInitiative = 6;

    // A wounded squadmate for the Surgeon to heal.
    const ally = game.all(CombatantModel)
      .find(m => m.isMerc && m.combatantId !== 'surgeon' && !m.isDead)!;
    ally.putInto(rebel.primarySquad);
    game.updateSquadBonuses(rebel.primarySquad);
    ally.damage = 1;

    expect(surgeon.combat).toBeGreaterThanOrEqual(2);
    sector.addDictatorMilitia(3);

    executeCombat(game, sector, rebel, { interactive: true });

    const pending = game.activeCombat?.pendingBeforeAttackHealing;
    expect(pending, 'combat did not pause for the healing decision').toBeDefined();
    // Nobody carries a kit, so the pause exists purely for the Surgeon.
    expect(pending!.availableHealers).toEqual([]);
    expect(pending!.damagedAllies.map(a => a.name.toLowerCase()))
      .toContain(ally.combatantName.toLowerCase());
  });

  it('does not pause when the Surgeon has nobody to heal', () => {
    const { game, rebel, sector } = setup('surgeon-no-target');
    const surgeon = findMerc(game, 'surgeon');
    surgeon.putInto(rebel.primarySquad);
    surgeon.baseInitiative = 6;
    game.updateSquadBonuses(rebel.primarySquad);

    sector.addDictatorMilitia(3);

    executeCombat(game, sector, rebel, { interactive: true });

    expect(game.activeCombat?.pendingBeforeAttackHealing ?? null).toBeNull();
  });
});
