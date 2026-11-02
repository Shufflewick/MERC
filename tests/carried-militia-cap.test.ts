import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame, MERCPlayer } from '../src/rules/game.js';
import { CombatantModel, Equipment, Sector, Squad } from '../src/rules/elements.js';

/**
 * A vehicle ride or Sonia is only offered as many militia as the destination
 * has room for, so no carried militia vanish at the 10-militia cap (#133).
 */

function newGame(seed: string) {
  const game = createTestGame(MERCGame, {
    playerCount: 2,
    playerNames: ['Rebel1', 'Dictator'],
    seed,
    expansionModes: ['A'],
  }).game;
  game.currentDay = 2;
  const rebel = game.rebelPlayers[0];
  const rebelId = `${rebel.seat}`;
  for (const s of game.gameMap.getAllSectors()) {
    s.dictatorMilitia = 0;
    s.removeRebelMilitia(rebelId, s.getRebelMilitia(rebelId));
  }
  const home = game.gameMap.getSector(1, 1)!;
  const destination = game.gameMap.getSector(1, 2)!;
  return { game, rebel, rebelId, home, destination };
}

function enlist(game: MERCGame, squad: Squad, sector: Sector, combatantId?: string): CombatantModel {
  const merc = game.first(CombatantModel, m =>
    m.isMerc && !m.isDead && (combatantId ? m.combatantId === combatantId : m.combatantId !== 'squidhead'))!;
  merc.damage = 0;
  merc.putInto(squad);
  merc.resetActions();
  squad.sectorId = sector.sectorId;
  return merc;
}

function giveJeep(game: MERCGame, driver: CombatantModel): string {
  driver.equip(game.first(Equipment, e => e.equipmentId === 'jeep')!);
  return `${driver.combatantName.charAt(0).toUpperCase()}${driver.combatantName.slice(1)}'s Jeep`;
}

function offered(game: MERCGame, action: string, player: MERCPlayer, args: Record<string, unknown>): unknown[] {
  return game.getSelectionChoices(action, 'militiaCount', player, args).map(c => c.value);
}

describe('rebel vehicle ride into a sector near the cap', () => {
  it('offers only as many militia as fit and loses none', () => {
    const { game, rebel, rebelId, home, destination } = newGame('carry-cap-rebel-ride');
    const vehicle = giveJeep(game, enlist(game, rebel.primarySquad, home));
    home.addRebelMilitia(rebelId, 3);
    destination.addRebelMilitia(rebelId, 9);

    expect(offered(game, 'vehicleMove', rebel, { vehicle, destination })).toEqual([0, 1]);

    const result = game.performAction('vehicleMove', rebel, { vehicle, destination, militiaCount: 2 });

    expect(result.success).toBe(false);
    expect(home.getRebelMilitia(rebelId) + destination.getRebelMilitia(rebelId)).toBe(12);
  });
});

describe('Sonia moving into a sector near the cap', () => {
  it('offers only as many militia as fit and loses none', () => {
    const { game, rebel, rebelId, home, destination } = newGame('carry-cap-sonia');
    enlist(game, rebel.primarySquad, home, 'sonia');
    home.addRebelMilitia(rebelId, 2);
    destination.addRebelMilitia(rebelId, 9);
    const squad = rebel.primarySquad;

    expect(offered(game, 'move', rebel, { destination, squad })).toEqual([0, 1]);

    const result = game.performAction('move', rebel, { destination, squad, militiaCount: 2 });

    expect(result.success).toBe(false);
    expect(home.getRebelMilitia(rebelId) + destination.getRebelMilitia(rebelId)).toBe(11);
  });
});

describe('dictator vehicle ride', () => {
  it('offers only as many militia as fit at the destination and loses none', () => {
    const { game, home, destination } = newGame('carry-cap-dictator-ride');
    const dictator = game.dictatorPlayer;
    const vehicle = giveJeep(game, enlist(game, dictator.primarySquad, home));
    home.dictatorMilitia = 3;
    destination.dictatorMilitia = 9;

    expect(offered(game, 'vehicleMove', dictator, { vehicle, destination })).toEqual([0, 1]);

    const result = game.performAction('vehicleMove', dictator, { vehicle, destination, militiaCount: 2 });

    expect(result.success).toBe(false);
    expect(home.dictatorMilitia + destination.dictatorMilitia).toBe(12);
  });

  it('cannot carry more militia than the source has', () => {
    const { game, home, destination } = newGame('carry-cap-dictator-source');
    const dictator = game.dictatorPlayer;
    const vehicle = giveJeep(game, enlist(game, dictator.primarySquad, home));
    home.dictatorMilitia = 1;

    const result = game.performAction('vehicleMove', dictator, { vehicle, destination, militiaCount: 2 });

    expect(result.success).toBe(false);
    expect(home.dictatorMilitia).toBe(1);
    expect(destination.dictatorMilitia).toBe(0);
  });

  it("can carry militia into Kim's base past 10", () => {
    const { game, home, destination } = newGame('carry-cap-kim-base');
    game.setupDictator('kim');
    game.dictatorPlayer.baseSectorId = destination.sectorId;
    const dictator = game.dictatorPlayer;
    const vehicle = giveJeep(game, enlist(game, dictator.primarySquad, home));
    home.dictatorMilitia = 3;
    destination.dictatorMilitia = 10;

    expect(offered(game, 'vehicleMove', dictator, { vehicle, destination })).toEqual([0, 1, 2, 3]);
  });
});
