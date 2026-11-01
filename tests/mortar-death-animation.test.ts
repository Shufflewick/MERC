import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel } from '../src/rules/elements.js';
import { buildMortarTargets } from '../src/rules/actions/rebel-equipment.js';

describe('a mortar kill', () => {
  it('plays the map death animation after the mortar strike', () => {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'mortar-death-animation',
    }).game;
    const rebel = game.rebelPlayers[0];
    const sector = game.gameMap.getAllSectors()[0];

    const victim = game.mercDeck.first(CombatantModel, c => c.isMerc)!;
    victim.putInto(game.dictatorPlayer.primarySquad);
    game.dictatorPlayer.primarySquad.sectorId = sector.sectorId;
    victim.damage = victim.maxHealth - 1;

    game.pendingMortarAttack = {
      attackerName: 'Attacker',
      attackerCombatantId: 'attacker',
      targetSectorId: sector.sectorId,
      targetSectorName: sector.sectorName,
      diceRolls: [6],
      hits: 1,
      hitThreshold: 4,
      attackingPlayerId: `${rebel.seat}`,
      validTargets: buildMortarTargets(game, sector, true),
    };

    const result = game.performAction('mortarAllocateHits', rebel, {
      allocations: [`${victim.combatantId}::0`],
    });

    expect(result.success).toBe(true);
    expect(victim.isDead).toBe(true);
    const types = game.pendingAnimationEvents.map(e => e.type);
    const death = game.pendingAnimationEvents.find(e => e.type === 'map-combatant-death');
    expect(death?.data).toEqual({
      combatants: [expect.objectContaining({
        combatantId: victim.combatantId,
        combatantName: victim.combatantName,
        sectorId: sector.sectorId,
      })],
    });
    expect(types.indexOf('map-combatant-death')).toBeGreaterThan(types.indexOf('mortar-strike'));
  });
});
