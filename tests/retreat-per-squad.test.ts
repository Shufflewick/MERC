import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel } from '../src/rules/elements.js';
import { executeRetreat, getRetreatableSquads } from '../src/rules/combat-retreat.js';

function newGame(seed: string) {
  return createTestGame(MERCGame, {
    playerCount: 2,
    playerNames: ['Rebel1', 'Dictator'],
    seed,
  }).game;
}

/** Put one living MERC from the deck into `squad`. */
function garrison(game: MERCGame, squad: { name?: string } & any) {
  const merc = game.first(CombatantModel, m => m.isMerc && !m.isDead && m.parent === game.mercDeck)!;
  merc.damage = 0;
  merc.putInto(squad);
  return merc;
}

describe('retreat is per squad', () => {
  it('pulls out only the named squad, leaving the other fighting', () => {
    const game = newGame('retreat-one-squad');
    const rebel = game.rebelPlayers[0];
    const [from, to] = game.gameMap.getAllSectors();

    rebel.primarySquad.sectorId = from.sectorId;
    rebel.secondarySquad.sectorId = from.sectorId;
    garrison(game, rebel.primarySquad);
    garrison(game, rebel.secondarySquad);

    expect(getRetreatableSquads(game, from, rebel).map(s => s.name))
      .toEqual([rebel.primarySquad.name, rebel.secondarySquad.name]);

    executeRetreat(game, from, to, rebel, rebel.secondarySquad.name!);

    expect(rebel.primarySquad.sectorId).toBe(from.sectorId);
    expect(rebel.secondarySquad.sectorId).toBe(to.sectorId);
  });

  it('pulls out every squad when no squad is named', () => {
    const game = newGame('retreat-all-squads');
    const rebel = game.rebelPlayers[0];
    const [from, to] = game.gameMap.getAllSectors();

    rebel.primarySquad.sectorId = from.sectorId;
    rebel.secondarySquad.sectorId = from.sectorId;
    garrison(game, rebel.primarySquad);
    garrison(game, rebel.secondarySquad);

    executeRetreat(game, from, to, rebel);

    expect(rebel.primarySquad.sectorId).toBe(to.sectorId);
    expect(rebel.secondarySquad.sectorId).toBe(to.sectorId);
  });

  it('never retreats the Dictator base squad off his base', () => {
    const game = newGame('retreat-base-squad');
    const dictator = game.dictatorPlayer;
    const [base, to] = game.gameMap.getAllSectors();

    dictator.baseSectorId = base.sectorId;
    dictator.baseRevealed = true;
    const baseSquad = dictator.baseSquadOrNull!;
    baseSquad.sectorId = base.sectorId;
    garrison(game, baseSquad);

    // The base squad holds the base; it is not a retreat unit (rulebook p.5).
    expect(getRetreatableSquads(game, base, dictator)).toEqual([]);

    executeRetreat(game, base, to, dictator);
    expect(baseSquad.sectorId).toBe(base.sectorId);
  });
});
