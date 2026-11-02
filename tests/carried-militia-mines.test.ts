import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame, MERCPlayer } from '../src/rules/game.js';
import { CombatantModel, Equipment, Sector, Squad } from '../src/rules/elements.js';
import { isLandMine } from '../src/rules/equipment-effects.js';

/**
 * Militia carried into a sector by a move are arriving, not already there, so
 * they cannot make a hostile land mine look friendly (#129).
 */

function newGame(seed: string) {
  const game = createTestGame(MERCGame, {
    playerCount: 2,
    playerNames: ['Rebel1', 'Dictator'],
    seed,
    expansionModes: ['A'],
  }).game;
  game.currentDay = 2;
  const rebelId = `${game.rebelPlayers[0].seat}`;
  for (const s of game.gameMap.getAllSectors()) {
    s.dictatorMilitia = 0;
    s.removeRebelMilitia(rebelId, s.getRebelMilitia(rebelId));
  }
  const home = game.gameMap.getSector(1, 1)!;
  const destination = game.gameMap.getSector(1, 2)!;
  return { game, rebelId, home, destination };
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

function plantMine(game: MERCGame, sector: Sector): void {
  sector.addToStash(game.accessoriesDeck.first(Equipment, e => isLandMine(e.equipmentId))!);
}

function hasMine(sector: Sector): boolean {
  return sector.getStashContents().some(e => isLandMine(e.equipmentId));
}

function run(game: MERCGame, player: MERCPlayer, name: string, args: Record<string, unknown>) {
  return game.getAction(name)!.execute(args, { player, game, args } as never);
}

describe('militia carried into an empty mined sector set off the mine', () => {
  it('dictator vehicle ride carrying militia', () => {
    const { game, home, destination } = newGame('carried-mine-dictator-ride');
    const driver = enlist(game, game.dictatorPlayer.primarySquad, home);
    const vehicle = giveJeep(game, driver);
    home.dictatorMilitia = 2;
    plantMine(game, destination);

    const result = run(game, game.dictatorPlayer, 'vehicleMove', { vehicle, destination, militiaCount: 2 });

    expect(result).toMatchObject({ success: true });
    expect(hasMine(destination)).toBe(false);
    expect(destination.dictatorMilitia).toBe(0);
  });

  it('rebel vehicle ride carrying militia', () => {
    const { game, rebelId, home, destination } = newGame('carried-mine-rebel-ride');
    const rebel = game.rebelPlayers[0];
    const driver = enlist(game, rebel.primarySquad, home);
    const vehicle = giveJeep(game, driver);
    home.addRebelMilitia(rebelId, 2);
    plantMine(game, destination);

    const result = run(game, rebel, 'vehicleMove', { vehicle, destination, militiaCount: 2 });

    expect(result).toMatchObject({ success: true });
    expect(hasMine(destination)).toBe(false);
    expect(destination.getRebelMilitia(rebelId)).toBe(0);
  });

  it('Sonia bringing rebel militia', () => {
    const { game, rebelId, home, destination } = newGame('carried-mine-sonia');
    const rebel = game.rebelPlayers[0];
    enlist(game, rebel.primarySquad, home, 'sonia');
    home.addRebelMilitia(rebelId, 2);
    plantMine(game, destination);

    const result = run(game, rebel, 'move', { squad: rebel.primarySquad, destination, militiaCount: 2 });

    expect(result).toMatchObject({ success: true });
    expect(hasMine(destination)).toBe(false);
    expect(destination.getRebelMilitia(rebelId)).toBe(0);
  });
});

describe('militia already holding the sector keep their own mine friendly', () => {
  it('rebel militia already there plus carried militia', () => {
    const { game, rebelId, home, destination } = newGame('carried-mine-rebel-held');
    const rebel = game.rebelPlayers[0];
    enlist(game, rebel.primarySquad, home, 'sonia');
    home.addRebelMilitia(rebelId, 2);
    destination.addRebelMilitia(rebelId, 1);
    plantMine(game, destination);

    run(game, rebel, 'move', { squad: rebel.primarySquad, destination, militiaCount: 2 });

    expect(hasMine(destination)).toBe(true);
    expect(destination.getRebelMilitia(rebelId)).toBe(3);
  });
});
