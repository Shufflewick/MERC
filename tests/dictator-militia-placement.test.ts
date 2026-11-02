import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Equipment, Sector, TacticsCard } from '../src/rules/elements.js';
import { isLandMine } from '../src/rules/equipment-effects.js';
import {
  applyKimTurnAbility,
  applyMaoTurnAbility,
  applyMussoliniTurnAbility,
  applyNoriegaTurnAbility,
  applyPolpotTurnAbility,
} from '../src/rules/dictator-abilities.js';
import { placeDictatorMilitia } from '../src/rules/dictator-militia.js';
import { tacticsDeckOf } from './helpers/dictator.js';

/**
 * Every way the dictator puts militia on the map is a unit entering the sector,
 * so a rebel land mine in that sector's stash must go off (#127).
 */

function newGame(dictatorId: string, isBot: boolean) {
  const game = createTestGame(MERCGame, {
    playerCount: 2,
    playerNames: ['Rebel1', 'Dictator'],
    seed: `militia-mine-${dictatorId}-${isBot}`,
  }).game;
  game.setupDictator(dictatorId);
  game.dictatorPlayer.isBot = isBot;
  for (const s of game.gameMap.getAllSectors()) {
    s.dictatorMilitia = 0;
    s.removeRebelMilitia(rebelId(game), s.getRebelMilitia(rebelId(game)));
  }
  return game;
}

function rebelId(game: MERCGame): string {
  return `${game.rebelPlayers[0].seat}`;
}

function plantMine(game: MERCGame, sector: Sector): void {
  const mine = game.accessoriesDeck.first(Equipment, e => isLandMine(e.equipmentId));
  if (!mine) throw new Error('No land mine left in the accessories deck to plant.');
  sector.addToStash(mine);
}

function hasMine(sector: Sector): boolean {
  return sector.getStashContents().some(e => isLandMine(e.equipmentId));
}

function combatQueuedAt(game: MERCGame, sector: Sector): boolean {
  return game.pendingCombat?.sectorId === sector.sectorId ||
    game.pendingCombatQueue.some(c => c.sectorId === sector.sectorId);
}

/** Rebels hold the sector with militia and have mined it. */
function rebelSector(game: MERCGame, sector: Sector): Sector {
  sector.addRebelMilitia(rebelId(game), 2);
  plantMine(game, sector);
  return sector;
}

/** The dictator holds the sector, a rebel militia is still there, and the rebels mined it. */
function contestedDictatorSector(game: MERCGame, sector: Sector): Sector {
  sector.dictatorMilitia = 3;
  sector.addRebelMilitia(rebelId(game), 1);
  plantMine(game, sector);
  return sector;
}

function runAction(game: MERCGame, name: string, args: Record<string, unknown>) {
  const action = game.getAction(name);
  if (!action) throw new Error(`action ${name} is not registered`);
  return action.execute(args, { player: game.dictatorPlayer, game, args } as never);
}

function tacticsCard(game: MERCGame): TacticsCard {
  return tacticsDeckOf(game).create(TacticsCard, 'test-reinforce', {
    tacticsId: 'test', tacticsName: 'Test', story: '', description: '', revealsBase: false,
  });
}

function wilderness(game: MERCGame): Sector[] {
  return game.gameMap.getAllSectors().filter(s => s.isWilderness);
}

function industry(game: MERCGame): Sector {
  return game.gameMap.getAllSectors().find(s => s.isIndustry)!;
}

/** Each case sets the board, places militia by one path, and returns the mined sector it placed on. */
const paths: Array<{ name: string; run: () => { game: MERCGame; sector: Sector } }> = [
  {
    name: 'human reinforce',
    run: () => {
      const game = newGame('castro', false);
      const sector = contestedDictatorSector(game, industry(game));
      runAction(game, 'reinforce', { card: tacticsCard(game), sector });
      return { game, sector };
    },
  },
  {
    name: 'human Hussein reinforce',
    run: () => {
      const game = newGame('hussein', false);
      const sector = contestedDictatorSector(game, industry(game));
      runAction(game, 'husseinBonusReinforce', { card: tacticsCard(game), sector });
      return { game, sector };
    },
  },
  {
    name: 'human Kim bonus militia',
    run: () => {
      const game = newGame('kim', false);
      const sector = rebelSector(game, industry(game));
      runAction(game, 'kimBonusMilitia', { targetSector: sector.sectorName });
      return { game, sector };
    },
  },
  {
    name: 'human Mao bonus militia',
    run: () => {
      const game = newGame('mao', false);
      const sector = rebelSector(game, wilderness(game)[0]);
      game.pendingMaoMilitia = { remaining: 1 };
      runAction(game, 'maoBonusMilitia', { targetSector: sector.sectorName, amount: '1' });
      return { game, sector };
    },
  },
  {
    name: 'human Mussolini bonus militia',
    run: () => {
      const game = newGame('mussolini', false);
      const sector = contestedDictatorSector(game, industry(game));
      runAction(game, 'mussoliniBonusMilitia', { targetSector: sector.sectorName });
      return { game, sector };
    },
  },
  {
    name: 'human Mussolini spread',
    run: () => {
      const game = newGame('mussolini', false);
      const source = industry(game);
      source.dictatorMilitia = 4;
      const sector = rebelSector(game, game.getAdjacentSectors(source)[0]);
      game.pendingMussoliniSpread = { sourceSectorId: source.sectorId, remaining: 4 };
      runAction(game, 'mussoliniSpreadMilitia', { targetSector: sector.sectorName, amount: '2' });
      return { game, sector };
    },
  },
  {
    name: 'human Pol Pot bonus militia',
    run: () => {
      const game = newGame('polpot', false);
      const sector = rebelSector(game, industry(game));
      runAction(game, 'polpotBonusMilitia', { targetSector: sector.sectorName });
      return { game, sector };
    },
  },
  {
    name: 'human Noriega place militia',
    run: () => {
      const game = newGame('noriega', false);
      const sector = contestedDictatorSector(game, industry(game));
      game.pendingNoriegaConversion = { convertedCount: 2 };
      runAction(game, 'noriegaPlaceMilitia', { targetSector: sector.sectorName });
      return { game, sector };
    },
  },
  {
    name: 'bot Kim bonus militia',
    run: () => {
      const game = newGame('kim', true);
      const sector = rebelSector(game, industry(game));
      applyKimTurnAbility(game);
      return { game, sector };
    },
  },
  {
    name: 'bot Mao bonus militia',
    run: () => {
      const game = newGame('mao', true);
      const [sector, ...others] = wilderness(game);
      for (const s of others) s.dictatorMilitia = Sector.MAX_MILITIA_PER_SIDE;
      rebelSector(game, sector);
      applyMaoTurnAbility(game);
      return { game, sector };
    },
  },
  {
    name: 'bot Mussolini bonus militia',
    run: () => {
      const game = newGame('mussolini', true);
      const sector = contestedDictatorSector(game, industry(game));
      applyMussoliniTurnAbility(game);
      return { game, sector };
    },
  },
  {
    name: 'bot Mussolini spread',
    run: () => {
      const game = newGame('mussolini', true);
      const source = industry(game);
      source.dictatorMilitia = 4;
      const sector = rebelSector(game, game.getAdjacentSectors(source)[0]);
      applyMussoliniTurnAbility(game);
      return { game, sector };
    },
  },
  {
    name: 'bot Pol Pot bonus militia',
    run: () => {
      const game = newGame('polpot', true);
      const sector = rebelSector(game, industry(game));
      applyPolpotTurnAbility(game);
      return { game, sector };
    },
  },
];

describe('dictator militia placement sets off rebel land mines', () => {
  for (const path of paths) {
    it(path.name, () => {
      const { game, sector } = path.run();

      expect(sector.dictatorMilitia, 'the mine should kill the militia that entered').toBe(0);
      expect(hasMine(sector), 'the mine should be spent').toBe(false);
      expect(combatQueuedAt(game, sector), 'no fight once the mine killed every dictator unit there').toBe(false);
    });
  }

  it('bot Noriega place militia', () => {
    const game = newGame('noriega', true);
    const [corner] = game.gameMap.getAllSectors();
    corner.addRebelMilitia(rebelId(game), 3);
    const neighbours = game.getAdjacentSectors(corner);
    expect(neighbours.length, 'the corner needs one mine per neighbour').toBeLessThanOrEqual(2);
    for (const n of neighbours) contestedDictatorSector(game, n);

    applyNoriegaTurnAbility(game);

    const hit = neighbours.filter(n => n.dictatorMilitia === 0 && !hasMine(n));
    expect(hit, 'the converted militia should walk onto a mine').toHaveLength(1);
    expect(combatQueuedAt(game, hit[0])).toBe(false);
  });
});

describe('placeDictatorMilitia', () => {
  it('treats a mine left in an empty sector as hostile to the militia arriving there', () => {
    const game = newGame('castro', false);
    const sector = industry(game);
    plantMine(game, sector);

    const result = placeDictatorMilitia(game, sector, 3);

    expect(result.placed).toBe(3);
    expect(sector.dictatorMilitia).toBe(0);
    expect(hasMine(sector)).toBe(false);
  });

  it('leaves a mine alone where the dictator already holds the sector unopposed', () => {
    const game = newGame('castro', false);
    const sector = industry(game);
    sector.dictatorMilitia = 2;
    plantMine(game, sector);

    placeDictatorMilitia(game, sector, 3);

    expect(sector.dictatorMilitia).toBe(5);
    expect(hasMine(sector)).toBe(true);
  });

  it('leaves a mine alone where only dictator MERCs hold the sector', () => {
    const game = newGame('castro', false);
    const sector = industry(game);
    const merc = game.mercDeck.first(CombatantModel, c => c.isMerc)!;
    merc.putInto(game.dictatorPlayer.primarySquad);
    game.dictatorPlayer.primarySquad.sectorId = sector.sectorId;
    plantMine(game, sector);

    placeDictatorMilitia(game, sector, 3);

    expect(sector.dictatorMilitia).toBe(3);
    expect(hasMine(sector)).toBe(true);
  });

  it('queues one fight per sector however many times militia arrive', () => {
    const game = newGame('castro', false);
    const sector = industry(game);
    sector.addRebelMilitia(rebelId(game), 2);

    placeDictatorMilitia(game, sector, 1);
    placeDictatorMilitia(game, sector, 1);

    const fights = [game.pendingCombat, ...game.pendingCombatQueue].filter(c => c?.sectorId === sector.sectorId);
    expect(fights).toHaveLength(1);
  });

  it('starts a fight when militia survive alongside rebels', () => {
    const game = newGame('castro', false);
    const sector = industry(game);
    sector.addRebelMilitia(rebelId(game), 2);

    const result = placeDictatorMilitia(game, sector, 3);

    expect(result.combatQueued).toBe(true);
    expect(combatQueuedAt(game, sector)).toBe(true);
  });
});
