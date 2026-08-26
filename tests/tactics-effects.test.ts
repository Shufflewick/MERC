import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Sector, TacticsCard } from '../src/rules/elements.js';
import { executeTacticsEffect, applyConscriptsEffect, applyOilReservesEffect } from '../src/rules/tactics-effects.js';

/**
 * Coverage for src/rules/tactics-effects.ts, which implements all 14 dictator
 * tactics cards and previously had no tests at all.
 */
function newGame(seed: string, rebelCount = 2) {
  return createTestGame(MERCGame, {
    playerCount: rebelCount + 1,
    playerNames: [...Array.from({ length: rebelCount }, (_, i) => `Rebel${i + 1}`), 'Dictator'],
    seed,
    expansionModes: ['A', 'B'],
  }).game;
}

/** Build a loose TacticsCard so an effect can be run without dealing a hand. */
function card(game: MERCGame, tacticsId: string, name: string): TacticsCard {
  return game.dictatorPlayer.tacticsDeck.create(TacticsCard, `test-${tacticsId}`, {
    tacticsId,
    tacticsName: name,
    story: '',
    description: '',
    revealsBase: false,
  });
}

describe('Family Threat', () => {
  it('removes 2 militia per sector, not 2 per rebel per sector', () => {
    const game = newGame('family-threat-split');
    const [a, b] = game.rebelPlayers;
    const sector = game.gameMap.getAllSectors()[0];
    sector.addRebelMilitia(`${a.seat}`, 3);
    sector.addRebelMilitia(`${b.seat}`, 3);

    executeTacticsEffect(game, card(game, 'family-threat', 'Family Threat'));

    // The card scales per sector: 6 militia present, 2 flee.
    expect(sector.getTotalRebelMilitia()).toBe(4);
  });

  it('takes the loss off the largest stack first', () => {
    const game = newGame('family-threat-largest');
    const [a, b] = game.rebelPlayers;
    const sector = game.gameMap.getAllSectors()[0];
    sector.addRebelMilitia(`${a.seat}`, 5);
    sector.addRebelMilitia(`${b.seat}`, 1);

    executeTacticsEffect(game, card(game, 'family-threat', 'Family Threat'));

    expect(sector.getRebelMilitia(`${a.seat}`)).toBe(3);
    expect(sector.getRebelMilitia(`${b.seat}`)).toBe(1);
  });

  it('takes only what is there when a sector is nearly empty', () => {
    const game = newGame('family-threat-short');
    const rebel = game.rebelPlayers[0];
    const sector = game.gameMap.getAllSectors()[0];
    sector.addRebelMilitia(`${rebel.seat}`, 1);

    executeTacticsEffect(game, card(game, 'family-threat', 'Family Threat'));

    expect(sector.getRebelMilitia(`${rebel.seat}`)).toBe(0);
  });
});

describe('sector control for tactics cards', () => {
  it('counts a sector held only by dictator MERCs as controlled', () => {
    const game = newGame('control-by-mercs');
    const sector = game.gameMap.getAllSectors().find(s => s.isIndustry)!;
    sector.dictatorMilitia = 0;

    expect(game.dictatorControls(sector)).toBe(false);

    const merc = game.first(CombatantModel, m => m.isMerc && !m.isDead)!;
    merc.damage = 0;
    merc.putInto(game.dictatorPlayer.primarySquad);
    game.dictatorPlayer.primarySquad.sectorId = sector.sectorId;

    expect(game.dictatorControls(sector)).toBe(true);
  });

  it('does not treat a dictator-occupied sector as uncontrolled', () => {
    const game = newGame('sentry-control');
    const sector = game.gameMap.getAllSectors()[0];
    sector.dictatorMilitia = 1;
    expect(game.isSectorUncontrolled(sector)).toBe(false);
  });
});

describe('Reinforcements', () => {
  it('adds militia to industries the dictator controls', () => {
    const game = newGame('reinforcements');
    const industry = game.gameMap.getAllSectors().find(s => s.isIndustry)!;
    industry.dictatorMilitia = 1;
    const before = industry.dictatorMilitia;

    executeTacticsEffect(game, card(game, 'reinforcements', 'Reinforcements'));

    expect(industry.dictatorMilitia).toBeGreaterThan(before);
  });
});

describe('Seizure', () => {
  it('asks a human dictator which wilderness sectors to flip', () => {
    const game = newGame('seizure-human');
    game.dictatorPlayer.isBot = false;

    const result = executeTacticsEffect(game, card(game, 'seizure', 'Seizure'));

    expect(result.success).toBe(true);
    expect(game.pendingSeizureFlips).not.toBeNull();
    expect(game.pendingSeizureFlips!.remaining).toBeGreaterThan(0);
  });

  it('flips them itself for an Bot dictator', () => {
    const game = newGame('seizure-bot');
    game.dictatorPlayer.isBot = true;
    const unexploredBefore = game.gameMap.getAllSectors()
      .filter(s => s.isWilderness && !s.explored).length;

    executeTacticsEffect(game, card(game, 'seizure', 'Seizure'));

    expect(game.pendingSeizureFlips).toBeNull();
    const unexploredAfter = game.gameMap.getAllSectors()
      .filter(s => s.isWilderness && !s.explored).length;
    expect(unexploredAfter).toBeLessThan(unexploredBefore);
  });
});

describe('Tainted Water', () => {
  it('damages every rebel MERC through armour and runs the death pipeline', () => {
    const game = newGame('tainted-water');
    const rebel = game.rebelPlayers[0];
    const merc = game.first(CombatantModel, m => m.isMerc && !m.isDead)!;
    merc.putInto(rebel.primarySquad);
    merc.damage = merc.maxHealth - 1; // one hit from death

    executeTacticsEffect(game, card(game, 'tainted-water', 'Tainted Water'));

    expect(merc.isDead).toBe(true);
    // The card must not be left sitting in the squad.
    expect(merc.parent).toBe(game.mercDiscard);
  });
});

describe('Oil Reserves', () => {
  it('grants a move-only credit to the controlling player, not a generic action', () => {
    const game = newGame('oil-reserves', 5);
    const rebel = game.rebelPlayers[0];
    const oil = game.gameMap.getAllSectors().find(s => s.sectorId === 'industry---oil');
    if (!oil) {
      console.log('No oil industry on this map, skipping');
      return;
    }

    game.oilReservesActive = true;
    oil.dictatorMilitia = 0;
    rebel.primarySquad.sectorId = oil.sectorId;
    oil.addRebelMilitia(`${rebel.seat}`, 1);

    applyOilReservesEffect(game, true, rebel);

    expect(rebel.freeMoveActions).toBe(1);
  });
});

describe('Conscripts', () => {
  it('adds militia only to sectors the dictator controls', () => {
    const game = newGame('conscripts');
    const [held, empty] = game.gameMap.getAllSectors();
    held.dictatorMilitia = 1;
    empty.dictatorMilitia = 0;

    game.conscriptsActive = true;
    game.conscriptsAmount = 1;
    applyConscriptsEffect(game);

    expect(held.dictatorMilitia).toBe(2);
    expect(empty.dictatorMilitia).toBe(0);
  });
});
