import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Equipment } from '../src/rules/elements.js';

/**
 * Expansion A vehicles. Chopper: "For 1 action move 2 spaces a squad of up to 4
 * MERCs/militia. Movement may be diagonal." Tank: "For 2 actions move 1 space."
 */
describe('vehicle movement', () => {
  function setup(seed: string) {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed,
      expansionModes: ['A'],
    }).game;
    const rebel = game.rebelPlayers[0];
    game.currentDay = 2;

    const driver = game.first(CombatantModel, m => m.isMerc && !m.isDead)!;
    driver.damage = 0;
    driver.putInto(rebel.primarySquad);
    driver.resetActions();

    // Park the squad away from the edge so a 2-space hop has room.
    const home = game.gameMap.getSector(1, 1) ?? game.gameMap.getAllSectors()[0];
    rebel.primarySquad.sectorId = home.sectorId;

    return { game, rebel, driver, home };
  }

  function giveVehicle(game: MERCGame, driver: CombatantModel, equipmentId: string) {
    const vehicle = game.first(Equipment, e => e.equipmentId === equipmentId);
    expect(vehicle, `${equipmentId} must load with expansion A`).toBeDefined();
    driver.equip(vehicle!);
    return vehicle!;
  }

  it('offers the action once a MERC carries a vehicle', () => {
    const { game, rebel, driver } = setup('vehicle-available');
    expect(game.getAvailableActions(rebel).map(a => a.name)).not.toContain('vehicleMove');

    giveVehicle(game, driver, 'jeep');
    expect(game.getAvailableActions(rebel).map(a => a.name)).toContain('vehicleMove');
  });

  it('moves the squad further than one sector and charges the vehicle its actions', () => {
    const { game, rebel, driver, home } = setup('vehicle-move');
    giveVehicle(game, driver, 'jeep');

    const twoAway = game.gameMap.getAllSectors().find(s =>
      Math.abs(s.row - home.row) + Math.abs(s.col - home.col) === 2
    );
    expect(twoAway, 'map must have a sector two orthogonal steps away').toBeDefined();

    const actionsBefore = driver.actionsRemaining;
    const result = game.performAction('vehicleMove', rebel, {
      vehicle: `${driver.combatantName.charAt(0).toUpperCase()}${driver.combatantName.slice(1)}'s Jeep`,
      destination: twoAway!,
      militiaCount: 0,
    });

    expect(result.success).toBe(true);
    expect(rebel.primarySquad.sectorId).toBe(twoAway!.sectorId);
    // The Jeep costs 1 action from the driver, not 1 per MERC.
    expect(driver.actionsRemaining).toBe(actionsBefore - 1);
  });

  it('lets the Chopper move diagonally, which a normal move cannot', () => {
    const { game, rebel, driver, home } = setup('vehicle-diagonal');
    giveVehicle(game, driver, 'chopper');

    const diagonal = game.gameMap.getSector(home.row + 1, home.col + 1);
    expect(diagonal, 'map must have a diagonal neighbour').toBeDefined();
    expect(game.getAdjacentSectors(home).map(s => s.sectorId)).not.toContain(diagonal!.sectorId);

    const result = game.performAction('vehicleMove', rebel, {
      vehicle: `${driver.combatantName.charAt(0).toUpperCase()}${driver.combatantName.slice(1)}'s Chopper`,
      destination: diagonal!,
      militiaCount: 0,
    });

    expect(result.success).toBe(true);
    expect(rebel.primarySquad.sectorId).toBe(diagonal!.sectorId);
  });
});
