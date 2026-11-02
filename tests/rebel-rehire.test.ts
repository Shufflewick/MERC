import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { GameRunner } from 'boardsmith/runtime';
import { enumerateLegalMoves } from 'boardsmith';
import { MERCGame, type MERCPlayer } from '../src/rules/game.js';
import { CombatantModel, Sector } from '../src/rules/elements.js';
import { autoResolveArgs, getCurrentAction } from './helpers/auto-play.js';

/**
 * Rulebook p.3 ("Teams") and p.6 ("Death"): a rebel whose MERCs have all died
 * hires again on their next turn, and the first MERC on a team costs nothing.
 * The normal hire action needs a living MERC to spend two actions, so the free
 * `rehireMerc` action stands in for it.
 */
function availableActionNames(game: MERCGame, player: Parameters<MERCGame['getAvailableActions']>[0]) {
  return game.getAvailableActions(player).map(a => a.name);
}

describe('rehiring after a wipe', () => {
  function wipedGame(seed: string) {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed,
    }).game;

    const rebel = game.rebelPlayers[0];
    game.currentDay = 3;
    for (const merc of [...rebel.primarySquad.getMercs(), ...rebel.secondarySquad.getMercs()]) {
      merc.damage = merc.maxHealth;
    }
    return { game, rebel };
  }

  it('offers the free hire to a rebel with no MERCs', () => {
    const { game, rebel } = wipedGame('rehire-available');
    expect(rebel.teamSize).toBe(0);
    // The replacement needs a friendly sector to be placed in (#96).
    game.gameMap.getAllSectors()[0].addRebelMilitia(`${rebel.seat}`, 5);

    expect(game.getAction('rehireMerc')).toBeDefined();
    expect(availableActionNames(game, rebel)).toContain('rehireMerc');
  });

  it('does not offer it while the rebel still has a MERC', () => {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'rehire-not-needed',
    }).game;
    const rebel = game.rebelPlayers[0];
    game.currentDay = 3;

    const merc = game.drawMerc();
    expect(merc).toBeDefined();
    merc!.damage = 0;
    merc!.putInto(rebel.primarySquad);

    expect(rebel.teamSize).toBeGreaterThan(0);
    expect(availableActionNames(game, rebel)).not.toContain('rehireMerc');
  });

  it('does not offer it during day 1 setup', () => {
    const { game, rebel } = wipedGame('rehire-day-one');
    game.currentDay = 1;
    expect(availableActionNames(game, rebel)).not.toContain('rehireMerc');
  });
});

/**
 * Rules 06-merc-actions.md, Hire MERCs, Placement: "If no squads on map: place in any
 * friendly sector"; 07-combat-system.md: friendly is "controlled by you or ally" (#96).
 * Designer: with no friendly sector the replacement can't be placed and isn't hired.
 */
describe('the replacement hire is placed in a friendly sector (#96)', () => {
  const name = (merc: CombatantModel) => merc.combatantName.charAt(0).toUpperCase() + merc.combatantName.slice(1);

  /** Day 2, the rebel's team dead in its secondary squad and its emptied primary squad off the map. */
  function wipedOnDayTwo({ rebelIsBot = false } = {}) {
    const runner = new GameRunner<MERCGame>({
      GameClass: MERCGame,
      gameType: 'merc',
      gameOptions: {
        playerCount: 2, playerNames: ['Rebel1', 'Dictator'], seed: 'hire-holds-the-turn',
        dictatorIsBot: false, dictatorChoice: 'castro',
        playerConfigs: [
          { color: '#e74c3c', isDictator: false, isBot: rebelIsBot },
          { color: '#95a5a6', isDictator: true, isBot: false },
        ],
      } as never,
    });
    runner.start();
    const game = runner.game;
    const rebel = game.rebelPlayers[0];
    for (let moves = 0; !getCurrentAction(game.getFlowState())!.available.includes('hireMerc'); moves++) {
      if (moves > 100) throw new Error('hireMerc was not offered within 100 moves.');
      const current = getCurrentAction(game.getFlowState())!;
      const order = current.available.includes('endTurn') ? ['endTurn', ...current.available] : current.available;
      order.some(action => {
        const args = autoResolveArgs(game, action, current.currentPlayer);
        return args !== null && runner.performAction(action, current.currentPlayer, args).success;
      });
    }
    const deathSector = game.getSector(rebel.primarySquad.sectorId!)!;
    for (const merc of rebel.team) merc.putInto(rebel.secondarySquad);
    rebel.secondarySquad.sectorId = deathSector.sectorId;
    rebel.primarySquad.sectorId = undefined;
    for (const merc of rebel.team) merc.putInto(game.mercDiscard);
    return { runner, game, rebel, deathSector };
  }

  /** A sector away from the rebel's death sector, handed to the rebel's militia. */
  function holdSector(game: MERCGame, rebel: MERCPlayer, avoid: Sector): Sector {
    const sector = game.gameMap.getAllSectors().find(s => s !== avoid && game.getTotalRebelUnitsInSector(s) === 0 &&
      game.getDictatorUnitsInSector(s) === s.dictatorMilitia)!;
    sector.removeDictatorMilitia(sector.dictatorMilitia);
    sector.addRebelMilitia(`${rebel.seat}`, 1);
    return sector;
  }

  /** End the rebel's turn and play the others' first legal moves until the rebel is asked to act or the day after next begins. */
  function endTurnUntilRebelActs(runner: GameRunner<MERCGame>, rebel: MERCPlayer): boolean {
    const game = runner.game;
    const lastDay = game.currentDay + 1;
    expect(runner.performAction('endTurn', rebel.seat, { confirm: 'Yes, end turn' }).success).toBe(true);
    for (let moves = 0; moves < 200 && game.currentDay <= lastDay; moves++) {
      const current = getCurrentAction(game.getFlowState());
      if (!current) return false;
      if (current.currentPlayer === rebel.seat) return true;
      const order = current.available.includes('endTurn') ? ['endTurn', ...current.available] : current.available;
      order.some(action => {
        const args = autoResolveArgs(game, action, current.currentPlayer);
        return args !== null && runner.performAction(action, current.currentPlayer, args).success;
      });
    }
    return false;
  }

  function sectorChoices(game: MERCGame, rebel: MERCPlayer): unknown[] {
    const action = game.getAction('rehireMerc')!;
    const selection = action.selections.find(s => s.name === 'sector');
    expect(selection, 'rehireMerc asks for a sector').toBeDefined();
    return game.getActionExecutor().getChoices(selection!, rebel, {}, 'rehireMerc').map(c => c.value);
  }

  it('asks only for friendly sectors and puts the replacement on the map there', () => {
    const { runner, game, rebel, deathSector } = wipedOnDayTwo();
    deathSector.addDictatorMilitia(5);
    const held = holdSector(game, rebel, deathSector);
    expect(endTurnUntilRebelActs(runner, rebel)).toBe(true);

    expect(sectorChoices(game, rebel)).toEqual([held]);
    expect(runner.performAction('rehireMerc', rebel.seat, { sector: held.id }).success).toBe(true);
    const [hired] = rebel.mercOffer.all(CombatantModel);
    expect(runner.performAction('rehireMercFromOffer', rebel.seat, {
      selectedMerc: name(hired), equipmentType: 'Weapon',
    }).success).toBe(true);

    expect(rebel.team).toEqual([hired]);
    expect(hired.sectorId).toBe(held.sectorId);
    expect(game.getMercsInSector(held, rebel)).toEqual([hired]);
    const drop = autoResolveArgs(game, 'dropEquipment', rebel.seat);
    expect(drop).not.toBeNull();
    expect(runner.performAction('dropEquipment', rebel.seat, drop!).success).toBe(true);
  });

  it('counts a sector an ally controls as friendly', () => {
    const game = createTestGame(MERCGame, {
      playerCount: 3, playerNames: ['Rebel1', 'Rebel2', 'Dictator'], seed: 'i96-ally',
    }).game;
    const [rebel, ally] = game.rebelPlayers;
    game.currentDay = 3;
    const allySector = game.gameMap.getAllSectors()[0];
    allySector.removeDictatorMilitia(allySector.dictatorMilitia);
    allySector.addRebelMilitia(`${ally.seat}`, 1);

    expect(sectorChoices(game, rebel)).toEqual([allySector]);
  });

  it('offers no replacement and draws no MERC when the rebel has no friendly sector', () => {
    const { game, rebel, deathSector } = wipedOnDayTwo();
    deathSector.addDictatorMilitia(5);
    const deck = game.mercDeck.count(CombatantModel);

    expect(game.getAvailableActions(rebel).map(a => a.name)).not.toContain('rehireMerc');
    expect(enumerateLegalMoves(game, rebel.seat).some(m => m.action === 'rehireMerc')).toBe(false);
    expect(game.mercDeck.count(CombatantModel)).toBe(deck);
  });

  it('skips the turn of a wiped-out rebel with no friendly sector instead of waiting on them', () => {
    const { runner, rebel, deathSector } = wipedOnDayTwo();
    deathSector.addDictatorMilitia(5);
    expect(endTurnUntilRebelActs(runner, rebel)).toBe(false);
  });

  it('a bot rebel places its replacement in a friendly sector', () => {
    const { runner, game, rebel, deathSector } = wipedOnDayTwo({ rebelIsBot: true });
    deathSector.addDictatorMilitia(5);
    const held = holdSector(game, rebel, deathSector);

    // The flow lists a seat's moves when its turn comes round, so let it come round with the team gone.
    expect(endTurnUntilRebelActs(runner, rebel)).toBe(true);
    const moves = enumerateLegalMoves(game, rebel.seat).filter(m => m.action === 'rehireMerc');
    expect(moves.map(m => m.args.sector)).toEqual([held]);
    expect(runner.performAction('rehireMerc', rebel.seat, moves[0].args).success).toBe(true);
    const pick = autoResolveArgs(game, 'rehireMercFromOffer', rebel.seat)!;
    expect(runner.performAction('rehireMercFromOffer', rebel.seat, pick).success).toBe(true);
    expect(rebel.team[0].sectorId).toBe(held.sectorId);
  });
});
