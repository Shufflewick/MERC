import { describe, it, expect } from 'vitest';
import { GameRunner } from 'boardsmith/runtime';
import type { GameRandom } from 'boardsmith';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Equipment, Sector } from '../src/rules/elements.js';
import { isLandMine } from '../src/rules/equipment-effects.js';
import { autoResolveArgs, getCurrentAction } from './helpers/auto-play.js';

/**
 * Pol Pot's card: "If you lose this battle hire 1 random MERC."
 * Militia wiped out by a land mine on arrival never fight, so there is no battle to lose (#131).
 * A fight that breaks off with nobody winning is not a lost battle, whoever holds the sector after (#134).
 */

const DICTATOR = 2;

function polpotGame(isBot: boolean): GameRunner<MERCGame> {
  const runner = new GameRunner<MERCGame>({
    GameClass: MERCGame,
    gameType: 'merc',
    gameOptions: {
      playerCount: 2,
      playerNames: ['Rebel', 'Dictator'],
      seed: 'i131-polpot-mine',
      dictatorChoice: 'polpot',
      playerConfigs: [{ isBot: false }, { isBot }],
    } as never,
  });
  runner.start();
  return runner;
}

function rebelSectors(game: MERCGame): Sector[] {
  return game.getControlledSectors(game.rebelPlayers[0]);
}

/** Mines every rebel sector that has no dictator units, so wherever Pol Pot places militia they die before any fight. */
function mineRebelSectors(game: MERCGame): void {
  for (const sector of rebelSectors(game)) {
    if (game.getDictatorUnitsInSector(sector) > 0) continue;
    if (sector.getStashContents().some(e => isLandMine(e.equipmentId))) continue;
    const mine = game.accessoriesDeck.first(Equipment, e => isLandMine(e.equipmentId));
    if (!mine) throw new Error('No land mine left in the accessories deck to plant.');
    sector.addToStash(mine);
  }
}

function dictatorMercCount(game: MERCGame): number {
  return game.all(CombatantModel, m => m.isMerc && game.dictatorPlayer.team.includes(m)).length;
}

/** Plays first-legal moves until `stop` says so, ending turns as soon as allowed only when `hurry` is set. */
function playUntil(runner: GameRunner<MERCGame>, stop: (turn: { currentPlayer: number; available: string[] }) => boolean, hurry = false): void {
  const game = runner.game;
  for (let i = 0; i < 2000; i++) {
    const turn = getCurrentAction(game.getFlowState());
    if (!turn) throw new Error(`The game stopped on Day ${game.currentDay} before the test reached its position.`);
    if (stop(turn)) return;
    const ends = turn.available.filter(a => a === 'endTurn');
    const others = turn.available.filter(a => a !== 'endTurn');
    const ordered = hurry ? [...ends, ...others] : [...others, ...ends];
    const played = ordered.some((action) => {
      const args = autoResolveArgs(game, action, turn.currentPlayer);
      return args !== null && runner.performAction(action, turn.currentPlayer, args).success;
    });
    if (!played) throw new Error(`Seat ${turn.currentPlayer} had no legal move on Day ${game.currentDay}.`);
  }
  throw new Error('The test never reached its position.');
}

function logged(game: MERCGame, text: string): boolean {
  return (game.messages as { text: string }[]).some(m => m.text.includes(text));
}

/** A `GameRandom` that always answers 0, so every die shows 1 and nothing can hit. */
function noHitRandom(): GameRandom {
  const random = (() => 0) as GameRandom;
  random.getState = () => '';
  random.setState = () => {};
  return random;
}

/**
 * Sets up a fight at the rebel sector that breaks off with nobody winning: no die can hit, the
 * neighbours are dictator-held so the rebels cannot withdraw, and extra rebel militia keep the
 * rebels in control of the sector once the fighting stops.
 */
function stalemateAt(game: MERCGame, sector: Sector): void {
  for (const neighbour of game.getAdjacentSectors(sector)) neighbour.addDictatorMilitia(Sector.MAX_MILITIA_PER_SIDE);
  sector.addRebelMilitia(`${game.rebelPlayers[0].seat}`, 2);
  game.random = noHitRandom();
}

type Battle = 'mined' | 'lost' | 'stalemate';

/** Human Pol Pot places militia on a rebel sector and the battle goes as asked; returns whether he is then offered a MERC. */
function humanPolpotOfferedMerc(battle: Battle): boolean {
  const mined = battle === 'mined';
  const runner = polpotGame(false);
  const game = runner.game;
  playUntil(runner, t => t.currentPlayer === DICTATOR && t.available.includes('polpotBonusMilitia'));
  if (mined) mineRebelSectors(game);
  const [sector] = rebelSectors(game);
  if (battle === 'stalemate') stalemateAt(game, sector);
  const day = game.currentDay;

  const result = runner.performAction('polpotBonusMilitia', DICTATOR, { targetSector: sector.sectorName });
  expect(result.success, result.error).toBe(true);
  if (mined) expect(sector.dictatorMilitia, 'the mine should kill the militia that arrived').toBe(0);

  let offered = false;
  playUntil(runner, t => (offered = t.available.includes('polpotBonusHire')) || game.currentDay > day);
  if (battle === 'stalemate') {
    expect(logged(game, 'The fighting breaks off'), 'the fight should break off with nobody winning').toBe(true);
    expect(rebelSectors(game), 'the rebels should still hold the sector').toContain(sector);
  }
  return offered;
}

/** Bot Pol Pot takes his Day 2 turn and the battle goes as asked; returns how many MERCs he gained. */
function botPolpotMercsGained(battle: Battle): number {
  const mined = battle === 'mined';
  const runner = polpotGame(true);
  const game = runner.game;
  playUntil(runner, t => game.currentDay >= 2 && t.currentPlayer !== DICTATOR && t.available.includes('endTurn'));
  if (mined) mineRebelSectors(game);
  const [sector] = rebelSectors(game);
  if (battle === 'stalemate') {
    expect(rebelSectors(game), 'the bot can only target the one rebel sector set up to stalemate').toHaveLength(1);
    stalemateAt(game, sector);
  }
  const mercsBefore = dictatorMercCount(game);
  const day = game.currentDay;
  const placedCount = () => (game.messages as { text: string }[]).filter(m => m.text.startsWith('Pol Pot placed')).length;
  const placedBefore = placedCount();

  playUntil(runner, () => game.currentDay > day, true);
  expect(placedCount(), 'Pol Pot should place militia on his turn').toBe(placedBefore + 1);

  if (mined) expect(rebelSectors(game).every(s => s.dictatorMilitia === 0), 'the mines should kill the militia that arrived').toBe(true);
  if (battle === 'stalemate') {
    expect(logged(game, 'The fighting breaks off'), 'the fight should break off with nobody winning').toBe(true);
    expect(rebelSectors(game), 'the rebels should still hold the sector').toContain(sector);
  }
  return dictatorMercCount(game) - mercsBefore;
}

describe('Pol Pot militia killed by a land mine before any fight', () => {
  it('human Pol Pot is not offered a MERC', () => {
    expect(humanPolpotOfferedMerc('mined')).toBe(false);
  });

  it('bot Pol Pot does not hire a MERC', () => {
    expect(botPolpotMercsGained('mined')).toBe(0);
  });
});

describe('Pol Pot militia that lose the fight they start', () => {
  it('human Pol Pot is offered a MERC', () => {
    expect(humanPolpotOfferedMerc('lost')).toBe(true);
  });

  it('bot Pol Pot hires a MERC', () => {
    expect(botPolpotMercsGained('lost')).toBe(1);
  });
});

describe('Pol Pot militia whose fight breaks off with nobody winning', () => {
  it('human Pol Pot is not offered a MERC though the rebels keep the sector', () => {
    expect(humanPolpotOfferedMerc('stalemate')).toBe(false);
  });

  it('bot Pol Pot does not hire a MERC though the rebels keep the sector', () => {
    expect(botPolpotMercsGained('stalemate')).toBe(0);
  });
});
