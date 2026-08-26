import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel } from '../src/rules/elements.js';

function newGame(seed: string) {
  return createTestGame(MERCGame, {
    playerCount: 2,
    playerNames: ['Rebel1', 'Dictator'],
    seed,
  }).game;
}

function findMerc(game: MERCGame, combatantId: string): CombatantModel {
  const merc = game.first(CombatantModel, m => m.isMerc && m.combatantId === combatantId);
  if (!merc) throw new Error(`${combatantId} is not in the deck`);
  return merc;
}

/**
 * Designer ruling (issue #43): a MERC alone in his squad is trivially the
 * highest initiative in it; a tie on base initiative is not "highest".
 */
describe('Sarge - "highest initiative in the squad"', () => {
  it('gives a solo Sarge +1 to all skills', () => {
    const game = newGame('sarge-solo');
    const rebel = game.rebelPlayers[0];
    const sarge = findMerc(game, 'sarge');
    sarge.putInto(rebel.primarySquad);

    game.updateSquadBonuses(rebel.primarySquad);

    expect(sarge.combat).toBe(sarge.baseCombat + 1);
    expect(sarge.initiative).toBe(sarge.baseInitiative + 1);
    expect(sarge.training).toBe(sarge.baseTraining + 1);
  });

  it('gives Sarge nothing when a squadmate ties his base initiative', () => {
    const game = newGame('sarge-tie');
    const rebel = game.rebelPlayers[0];
    const sarge = findMerc(game, 'sarge');
    const tie = game.all(CombatantModel).find(m =>
      m.isMerc && m.combatantId !== 'sarge' && m.baseInitiative === sarge.baseInitiative);
    expect(tie, 'no MERC ties Sarge on base initiative').toBeDefined();

    sarge.putInto(rebel.primarySquad);
    tie!.putInto(rebel.primarySquad);

    game.updateSquadBonuses(rebel.primarySquad);

    expect(sarge.combat).toBe(sarge.baseCombat);
    expect(sarge.initiative).toBe(sarge.baseInitiative);
    expect(sarge.training).toBe(sarge.baseTraining);
  });
});

describe('Tack - "+2 initiative to her squad"', () => {
  it('buffs herself when she is alone in the squad', () => {
    const game = newGame('tack-solo');
    const rebel = game.rebelPlayers[0];
    const tack = findMerc(game, 'tack');
    tack.putInto(rebel.primarySquad);

    game.updateSquadBonuses(rebel.primarySquad);

    expect(tack.initiative).toBe(tack.baseInitiative + 2);
  });

  it('buffs nobody when a squadmate ties her base initiative', () => {
    const game = newGame('tack-tie');
    const rebel = game.rebelPlayers[0];
    const tack = findMerc(game, 'tack');
    const tie = game.all(CombatantModel).find(m =>
      m.isMerc && m.combatantId !== 'tack' && m.baseInitiative === tack.baseInitiative);
    expect(tie, 'no MERC ties Tack on base initiative').toBeDefined();

    tack.putInto(rebel.primarySquad);
    tie!.putInto(rebel.primarySquad);

    game.updateSquadBonuses(rebel.primarySquad);

    expect(tack.initiative).toBe(tack.baseInitiative);
    expect(tie!.initiative).toBe(tie!.baseInitiative);
  });
});

/**
 * Designer ruling (issue #11): Haarg compares against his own squad only, and
 * the Dictator counts as a squadmate once he is in play with that squad.
 */
describe("Haarg's comparison group", () => {
  /** A dictator who out-stats Haarg on every skill. */
  function makeDictator(game: MERCGame, inPlay: boolean): CombatantModel {
    const dictator = game.create(CombatantModel, 'dictator-test', {
      cardType: 'dictator',
      inPlay,
      combatantId: 'stalin',
      combatantName: 'Stalin',
      baseInitiative: 5,
      baseTraining: 5,
      baseCombat: 5,
      damage: 0,
    });
    game.dictatorPlayer.dictator = dictator;
    return dictator;
  }

  it('counts an in-play Dictator sharing his squad as a squadmate', () => {
    const game = newGame('haarg-dictator');
    const haarg = findMerc(game, 'haarg');
    const squad = game.dictatorPlayer.baseSquad ?? game.dictatorPlayer.primarySquad;
    const dictator = makeDictator(game, true);

    haarg.putInto(squad);
    dictator.putInto(squad);

    game.updateSquadBonuses(squad);

    expect(haarg.initiative).toBe(haarg.baseInitiative + 1);
    expect(haarg.combat).toBe(haarg.baseCombat + 1);
    expect(haarg.training).toBe(haarg.baseTraining + 1);
  });

  it('ignores a Dictator who is not yet in play', () => {
    const game = newGame('haarg-hidden-dictator');
    const haarg = findMerc(game, 'haarg');
    const squad = game.dictatorPlayer.baseSquad ?? game.dictatorPlayer.primarySquad;
    const dictator = makeDictator(game, false);

    haarg.putInto(squad);
    dictator.putInto(squad);

    game.updateSquadBonuses(squad);

    expect(haarg.initiative).toBe(haarg.baseInitiative);
    expect(haarg.combat).toBe(haarg.baseCombat);
    expect(haarg.training).toBe(haarg.baseTraining);
  });
});
