import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Sector } from '../src/rules/elements.js';
import { applyKimTurnAbility } from '../src/rules/dictator-abilities.js';

/** Kim's base holds up to 20 dictator militia; every other sector keeps the normal cap of 10 (#130). */

function newKimGame(isBot: boolean) {
  const game = createTestGame(MERCGame, {
    playerCount: 2,
    playerNames: ['Rebel1', 'Kim'],
    seed: `kim-militia-cap-${isBot}`,
  }).game;
  game.setupDictator('kim');
  game.dictatorPlayer.isBot = isBot;
  const rebelId = `${game.rebelPlayers[0].seat}`;
  for (const s of game.gameMap.getAllSectors()) {
    s.dictatorMilitia = 0;
    s.removeRebelMilitia(rebelId, s.getRebelMilitia(rebelId));
  }
  const [base, other] = game.gameMap.getAllSectors().filter(s => s.isIndustry);
  game.dictatorPlayer.baseSectorId = base.sectorId;
  return { game, base, other, rebelId };
}

/** The rebels outnumber a full stack of dictator militia, so the sector is the only one they control. */
function rebelsTakeFullSector(game: MERCGame, sector: Sector, rebelId: string): void {
  sector.dictatorMilitia = Sector.MAX_MILITIA_PER_SIDE;
  sector.addRebelMilitia(rebelId, Sector.MAX_MILITIA_PER_SIDE);
  const rebel = game.rebelPlayers[0];
  game.mercDeck.first(CombatantModel, c => c.isMerc)!.putInto(rebel.primarySquad);
  rebel.primarySquad.sectorId = sector.sectorId;
  expect(game.getControlledSectors(rebel).map(s => s.sectorId)).toEqual([sector.sectorId]);
}

function runKimBonus(game: MERCGame, sector: Sector) {
  const action = game.getAction('kimBonusMilitia');
  if (!action) throw new Error('action kimBonusMilitia is not registered');
  const args = { targetSector: sector.sectorName };
  return action.execute(args, { player: game.dictatorPlayer, game, args } as never);
}

describe('human Kim bonus militia', () => {
  it('can fill her base past 10', () => {
    const { game, base, other, rebelId } = newKimGame(false);
    rebelsTakeFullSector(game, other, rebelId);
    base.dictatorMilitia = Sector.MAX_MILITIA_PER_SIDE;

    runKimBonus(game, base);

    expect(base.dictatorMilitia).toBe(11);
  });

  it('stops at 10 away from her base', () => {
    const { game, base, other, rebelId } = newKimGame(false);
    rebelsTakeFullSector(game, base, rebelId);
    other.dictatorMilitia = Sector.MAX_MILITIA_PER_SIDE;

    runKimBonus(game, other);

    expect(other.dictatorMilitia).toBe(10);
  });

  it('is only offered sectors with room for more militia', () => {
    const { game, base, other } = newKimGame(false);
    base.dictatorMilitia = Sector.MAX_MILITIA_PER_SIDE;
    other.dictatorMilitia = Sector.MAX_MILITIA_PER_SIDE;
    const offered = () => game.getSelectionChoices('kimBonusMilitia', 'targetSector', game.dictatorPlayer)
      .map(c => c.value);

    expect(offered()).toContain(base.sectorName);
    expect(offered()).not.toContain(other.sectorName);
    base.dictatorMilitia = 20;
    expect(offered()).not.toContain(base.sectorName);
  });

  it('is not offered an empty sector that is not an industry', () => {
    const { game } = newKimGame(false);
    const empty = game.gameMap.getAllSectors().find(s => !s.isIndustry)!;

    const offered = game.getSelectionChoices('kimBonusMilitia', 'targetSector', game.dictatorPlayer).map(c => c.value);

    expect(offered).not.toContain(empty.sectorName);
  });
});

describe('bot Kim bonus militia', () => {
  it('can fill her base past 10', () => {
    const { game, base, rebelId } = newKimGame(true);
    rebelsTakeFullSector(game, base, rebelId);

    applyKimTurnAbility(game);

    expect(base.dictatorMilitia).toBe(11);
  });

  it('stops at 10 away from her base', () => {
    const { game, other, rebelId } = newKimGame(true);
    rebelsTakeFullSector(game, other, rebelId);

    applyKimTurnAbility(game);

    expect(other.dictatorMilitia).toBe(10);
  });
});
