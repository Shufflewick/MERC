import { describe, it, expect, beforeEach } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { enumerateLegalMoves } from 'boardsmith';
import { MERCGame, type MERCPlayer } from '../src/rules/game.js';
import { CombatantModel, Equipment, Sector } from '../src/rules/elements.js';
import { buildMortarTargets } from '../src/rules/actions/rebel-equipment.js';
import { getCurrentAction } from './helpers/auto-play.js';
import { randomPlay, RANDOM_PLAY_TIMEOUT } from './helpers/random-play.js';

describe('a mortar hit on a unit with 1 health left', () => {
  let game: MERCGame;
  let sector: Sector;
  let victim: CombatantModel;

  beforeEach(() => {
    game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'mortar-death-animation',
    }).game;
    sector = game.gameMap.getAllSectors()[0];
    victim = game.mercDeck.first(CombatantModel, c => c.isMerc)!;
    victim.putInto(game.dictatorPlayer.primarySquad);
    game.dictatorPlayer.primarySquad.sectorId = sector.sectorId;
    victim.damage = victim.maxHealth - 1;
  });

  function fireOneHit(attacker: MERCPlayer = game.rebelPlayers[0]) {
    game.pendingMortarAttack = {
      attackerName: 'Attacker',
      attackerCombatantId: 'attacker',
      targetSectorId: sector.sectorId,
      targetSectorName: sector.sectorName,
      diceRolls: [6],
      hits: 1,
      hitThreshold: 4,
      attackingPlayerId: `${attacker.seat}`,
      validTargets: buildMortarTargets(game, sector, attacker.isRebel()),
    };
    const result = game.performAction('mortarAllocateHits', attacker, {
      allocations: [victim.combatantId],
    });
    expect(result.success).toBe(true);
    return game.pendingAnimationEvents.map(e => e.type);
  }

  it('on a MERC kills him: his gear is discarded, his card goes to the MERC discard, and the map death plays after the strike', () => {
    const weapon = game.weaponsDeck.first(Equipment)!;
    victim.equip(weapon);

    const types = fireOneHit();

    expect(victim.parent).toBe(game.mercDiscard);
    expect(weapon.parent).toBe(game.weaponsDiscard);
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

  it('tells the strike which hit targets it killed, since their tokens are gone before it plays (#99)', () => {
    fireOneHit();

    const strike = game.pendingAnimationEvents.find(e => e.type === 'mortar-strike');
    expect(strike?.data).toMatchObject({ hitCombatantIds: [victim.combatantId], killedCombatantIds: [victim.combatantId] });
  });

  it('on the Dictator plays his map death and strike flash, under his dictator token id', () => {
    victim.putInto(game.mercDiscard);
    game.setupDictator();
    victim = game.dictatorPlayer.dictator!;
    victim.inPlay = true;
    victim.putInto(game.dictatorPlayer.primarySquad);
    victim.damage = victim.maxHealth - 1;

    fireOneHit();

    const death = game.pendingAnimationEvents.find(e => e.type === 'map-combatant-death');
    expect(death?.data).toEqual({
      combatants: [expect.objectContaining({ combatantId: `dictator-${victim.combatantId}`, sectorId: sector.sectorId })],
    });
    const strike = game.pendingAnimationEvents.find(e => e.type === 'mortar-strike');
    expect(strike?.data).toMatchObject({ hitCombatantIds: [`dictator-${victim.combatantId}`], killedCombatantIds: [`dictator-${victim.combatantId}`] });
  });

  it('on a MERC is stopped by his own Epinephrine Shot, and no death plays', () => {
    const rebel = game.rebelPlayers[0];
    victim.putInto(rebel.primarySquad);
    rebel.primarySquad.sectorId = sector.sectorId;
    victim.equip(game.accessoriesDeck.first(Equipment, e => e.equipmentId === 'epinephrine-shot')!);

    const types = fireOneHit(game.dictatorPlayer);

    expect(victim.isDead).toBe(false);
    expect(victim.accessorySlot).toBeUndefined();
    expect(types).toContain('mortar-strike');
    expect(types).not.toContain('map-combatant-death');
    expect(game.pendingAnimationEvents.find(e => e.type === 'mortar-strike')?.data).toMatchObject({ killedCombatantIds: [] });
  });

  it('on a dictator MERC is stopped by his own Epinephrine Shot (#92)', () => {
    victim.equip(game.accessoriesDeck.first(Equipment, e => e.equipmentId === 'epinephrine-shot')!);

    fireOneHit();

    expect(victim.isDead).toBe(false);
    expect(victim.accessorySlot).toBeUndefined();
  });
});

describe('listing the moves of a big mortar roll (#122)', () => {
  it('lists each way to split the hits among the targets once', () => {
    let moves: number | undefined;
    // This seed's game reaches a mortar allocation in the real flow, where move enumeration reads the pending roll.
    randomPlay('scan36', 'kim', 2, game => {
      const current = getCurrentAction(game.getFlowState());
      if (!current?.available.includes('mortarAllocateHits')) return false;
      game.pendingMortarAttack = {
        ...game.pendingMortarAttack!,
        diceRolls: [6, 6, 6, 6, 6], hits: 5, hitThreshold: 4,
        validTargets: Array.from({ length: 10 }, (_, i) => (
          { id: `t${i}`, name: 'Militia', type: 'militia' as const, currentHealth: 3, maxHealth: 3 })),
      };
      moves = enumerateLegalMoves(game, current.currentPlayer).filter(m => m.action === 'mortarAllocateHits').length;
      return true;
    });
    // 5 hits over 10 targets taking at most 3 each: C(14,5) - 10 * C(10,9).
    expect(moves).toBe(1902);
  }, RANDOM_PLAY_TIMEOUT);
});
