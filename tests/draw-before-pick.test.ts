import { describe, it, expect } from 'vitest';
import { GameRunner } from 'boardsmith/runtime';
import { enumerateLegalMoves } from 'boardsmith';
import { MERCGame, type MERCPlayer } from '../src/rules/game.js';
import { CombatantModel, Equipment } from '../src/rules/elements.js';
import { setGlobalCachedValue } from '../src/rules/actions/helpers.js';
import { autoResolveArgs, getCurrentAction, getPlayerAction } from './helpers/auto-play.js';

/**
 * Asking which moves a player has must never change the game (issue #65).
 * Nine actions drew cards inside a pick's candidate callback, so the engine's
 * own availability check, a bot's move search, or a UI asking for choices
 * pulled cards off the deck before anyone chose to act.
 */

function startRunner(dictator: string, seed: string): GameRunner<MERCGame> {
  const runner = new GameRunner<MERCGame>({
    GameClass: MERCGame,
    gameType: 'merc',
    gameOptions: {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed,
      dictatorIsBot: false,
      dictatorChoice: dictator,
      playerConfigs: [
        { color: '#e74c3c', isDictator: false, isBot: false },
        { color: '#95a5a6', isDictator: true, isBot: false },
      ],
    } as never,
  });
  runner.start();
  return runner;
}

function startGame(dictator: string, seed: string): MERCGame {
  return startRunner(dictator, seed).game;
}

/** Play first legal moves, ending turns early, until `actionName` is offered. */
function playUntilOffered(runner: GameRunner<MERCGame>, actionName: string): void {
  playUntil(runner, actionName, available => available.includes(actionName));
}

function playUntil(runner: GameRunner<MERCGame>, actionName: string, done: (available: string[]) => boolean): void {
  const game = runner.game;
  for (let moves = 0; moves < 100; moves++) {
    const current = getCurrentAction(game.getFlowState());
    if (!current) throw new Error(`The flow stopped before offering ${actionName}.`);
    if (done(current.available)) return;
    const order = current.available.includes('endTurn') ? ['endTurn', ...current.available] : current.available;
    const played = order.some(name => {
      const args = autoResolveArgs(game, name, current.currentPlayer);
      return args !== null && runner.performAction(name, current.currentPlayer, args).success;
    });
    if (!played) throw new Error(`No legal move for seat ${current.currentPlayer} among ${current.available.join(', ')}.`);
  }
  throw new Error(`${actionName} was not offered within 100 moves.`);
}

function deckCounts(game: MERCGame): number[] {
  return [game.mercDeck, game.weaponsDeck, game.armorDeck, game.accessoriesDeck].map(d => d.count());
}

/**
 * Every question a client or bot asks about a move: is it available, and what
 * may each pick be, answering the earlier picks with their first choice.
 */
function askEverything(game: MERCGame, player: MERCPlayer, actionName: string): void {
  game.getAvailableActions(player);
  enumerateLegalMoves(game, player.seat, { maxPerAction: 4 });
  const executor = game.getActionExecutor();
  const args: Record<string, unknown> = {};
  for (const selection of game.getAction(actionName)!.selections) {
    const choices = executor.getChoices(selection, player, args, actionName);
    if (choices.length === 0) return;
    args[selection.name] = choices[0].value;
  }
}

function putRebelInCity(game: MERCGame): MERCPlayer {
  return putRebelMercInCity(game).rebel;
}

function putRebelMercInCity(game: MERCGame) {
  const rebel = game.rebelPlayers[0];
  const city = game.gameMap.getAllSectors().find(s => s.isCity)!;
  const merc = game.drawMerc()!;
  merc.putInto(rebel.primarySquad);
  rebel.primarySquad.sectorId = city.sectorId;
  merc.actionsRemaining = 2;
  return { rebel, merc, city };
}

const dictatorHires: Array<{ action: string; dictator: string; arrange?: (game: MERCGame) => void }> = [
  { action: 'castroBonusHire', dictator: 'castro' },
  { action: 'gadafiBonusHire', dictator: 'gadafi' },
  { action: 'stalinBonusHire', dictator: 'stalin' },
  { action: 'hitlerBonusHire', dictator: 'hitler' },
  {
    action: 'polpotBonusHire', dictator: 'polpot',
    arrange: (game) => { game.lastAbilityCombatOutcome = { rebelVictory: true, sectorId: game.gameMap.getAllSectors()[0].sectorId }; },
  },
  {
    action: 'noriegaBonusHire', dictator: 'noriega',
    arrange: (game) => { game.gameMap.getAllSectors()[0].addRebelMilitia(`${game.rebelPlayers[0].seat}`, 2); },
  },
  {
    action: 'pinochetBonusHire', dictator: 'pinochet',
    arrange: (game) => { game._pinochetPendingHires = 1; },
  },
  {
    action: 'bonusMercSetup', dictator: 'mao',
    arrange: (game) => { setGlobalCachedValue(game, '_bonus_mercs_remaining', 1); },
  },
];

describe('asking for moves draws no cards (#65)', () => {
  it.each(dictatorHires)('$action: the dictator asking for moves leaves every deck as it was', ({ action, dictator, arrange }) => {
    const game = startGame(dictator, `ask-draws-nothing-${action}`);
    arrange?.(game);

    const before = deckCounts(game);
    askEverything(game, game.dictatorPlayer, action);

    expect(deckCounts(game)).toEqual(before);
  });

  it('armsDealer: a rebel in a city asking for moves leaves every deck as it was', () => {
    const game = startGame('castro', 'ask-draws-nothing-armsDealer');
    const rebel = putRebelInCity(game);

    const before = deckCounts(game);
    askEverything(game, rebel, 'armsDealer');

    expect(deckCounts(game)).toEqual(before);
  });
});

describe('a hire offers the MERCs the flow drew (#65)', () => {
  it('Castro picks one of three MERCs drawn before the pick, and the other two are discarded', () => {
    const runner = startRunner('castro', 'castro-offer');
    const game = runner.game;
    playUntilOffered(runner, 'castroBonusHire');

    const offered = game.mercOffer.all(CombatantModel);
    expect(offered).toHaveLength(3);

    const before = deckCounts(game);
    const pick = game.getAction('castroBonusHire')!.selections[0];
    const executor = game.getActionExecutor();
    const ask = () => executor.getChoices(pick, game.dictatorPlayer, {}, 'castroBonusHire').map(c => (c.value as CombatantModel).id).sort();
    const choices = ask();
    expect(choices).toEqual(offered.map(m => m.id).sort());
    expect(ask()).toEqual(choices);
    expect(deckCounts(game)).toEqual(before);

    const [hired, ...rest] = offered;
    const targetSector = executor.getChoices(game.getAction('castroBonusHire')!.selections[2], game.dictatorPlayer, {}, 'castroBonusHire')[0].value;
    const result = runner.performAction('castroBonusHire', game.dictatorPlayer.seat, {
      selectedMerc: hired.id, equipmentType: 'Weapon', targetSector,
    });

    expect(result.success).toBe(true);
    expect(game.dictatorPlayer.team).toContain(hired);
    expect(game.mercOffer.all(CombatantModel)).toHaveLength(0);
    for (const merc of rest) expect(game.mercDiscard.all(CombatantModel)).toContain(merc);
  });

  it('Mao places each bonus MERC drawn before the pick', () => {
    const runner = startRunner('mao', 'mao-offer');
    const game = runner.game;
    playUntilOffered(runner, 'bonusMercSetup');

    const [offered] = game.mercOffer.all(CombatantModel);
    expect(game.mercOffer.all(CombatantModel)).toHaveLength(1);

    const result = runner.performAction('bonusMercSetup', game.dictatorPlayer.seat, {
      selectedMerc: offered.id, targetSquad: 'Primary Squad', equipmentType: 'Weapon',
    });

    expect(result.success).toBe(true);
    expect(game.dictatorPlayer.team).toContain(offered);
    expect(game.mercOffer.all(CombatantModel)).toHaveLength(0);
  });
});

describe('the arms dealer sells, then offers the free re-equip (#65)', () => {
  it('buying puts the item in the city stash, and the follow-up equips it', () => {
    const game = startGame('castro', 'arms-dealer-buy');
    const { rebel, merc, city } = putRebelMercInCity(game);
    const executor = game.getActionExecutor();
    const unitChoice = `${merc.id}:${merc.combatantName}:false`;
    const weaponsBefore = game.weaponsDeck.count();

    const bought = executor.executeAction(game.getAction('armsDealer')!, rebel, {
      actingUnit: unitChoice, equipmentType: 'Weapon',
    });

    expect(bought.success).toBe(true);
    expect(game.weaponsDeck.count()).toBe(weaponsBefore - 1);
    expect(merc.actionsRemaining).toBe(1);
    expect(bought.followUp?.action).toBe('armsDealerEquip');
    const item = game.getElementById(bought.followUp!.args!.equipmentId as number) as Equipment;
    expect(city.stash).toContain(item);

    // The seat holds the follow-up; its args come from it, never from the client (BoardSmith #662).
    const equipped = executor.executeAction(game.getAction('armsDealerEquip')!, rebel, {
      equipUnit: unitChoice,
    }, { followUp: bought.followUp });

    expect(equipped.success).toBe(true);
    expect(merc.weaponSlot).toBe(item);
    expect(city.stash).not.toContain(item);
  });

  it('the free re-equip refuses any item other than the one just bought', () => {
    const game = startGame('castro', 'arms-dealer-other-item');
    const { rebel, merc } = putRebelMercInCity(game);
    const executor = game.getActionExecutor();
    const unitChoice = `${merc.id}:${merc.combatantName}:false`;
    executor.executeAction(game.getAction('armsDealer')!, rebel, { actingUnit: unitChoice, equipmentType: 'Weapon' });
    const notBought = game.weaponsDeck.first(Equipment)!;

    const result = executor.executeAction(game.getAction('armsDealerEquip')!, rebel, {
      equipmentId: notBought.id, equipUnit: unitChoice,
    });

    expect(result.success).toBe(false);
    expect(merc.weaponSlot).not.toBe(notBought);
  });
});

describe('the arms dealer offers only types it can sell (#117)', () => {
  function emptyPile(game: MERCGame, type: 'Weapon' | 'Armor' | 'Accessory'): void {
    for (const pile of [game.getEquipmentDeck(type)!, game.getEquipmentDiscard(type)!]) {
      for (const eq of pile.all(Equipment)) eq.putInto(game.drawnCards);
    }
  }

  it('leaves out a type whose deck and discard are both empty', () => {
    const game = startGame('castro', 'arms-dealer-empty-type');
    const { rebel, merc } = putRebelMercInCity(game);
    emptyPile(game, 'Accessory');
    const executor = game.getActionExecutor();
    const action = game.getAction('armsDealer')!;

    const types = executor.getChoices(action.selections[1], rebel, { actingUnit: `${merc.id}:${merc.combatantName}:false` }, 'armsDealer')
      .map(c => c.value);

    expect(types).toEqual(['Weapon', 'Armor']);
  });

  it('is not offered when every deck and discard is empty', () => {
    const game = startGame('castro', 'arms-dealer-all-empty');
    const { rebel } = putRebelMercInCity(game);
    for (const type of ['Weapon', 'Armor', 'Accessory'] as const) emptyPile(game, type);

    expect(game.getActionExecutor().isActionAvailable(game.getAction('armsDealer')!, rebel)).toBe(false);
  });
});

describe('a hire with no squad room draws nothing and lets the turn go on (#65)', () => {
  it('Castro with both squads full skips the hire', () => {
    const runner = startRunner('castro', 'castro-full-squads');
    const game = runner.game;
    playUntilOffered(runner, 'endTurn');
    for (const squad of [game.dictatorPlayer.primarySquad, game.dictatorPlayer.secondarySquad]) {
      while (!squad.isFull) game.drawMerc()!.putInto(squad);
    }

    playUntil(runner, 'the rebel turn after the dictator', () => game.currentDay === 3);

    expect(game.mercOffer.all(CombatantModel)).toHaveLength(0);
  });
});


describe('asking for a rebel hire\'s moves changes nothing (#80)', () => {
  function expectAskingChangesNothing(game: MERCGame, player: MERCPlayer, actionName: string): void {
    const decks = deckCounts(game);
    const version = game._ctx._stateVersion;

    askEverything(game, player, actionName);

    expect(deckCounts(game)).toEqual(decks);
    expect(game._ctx._stateVersion).toBe(version);
  }

  it('hireFirstMerc', () => {
    const game = startGame('castro', 'ask-changes-nothing-hireFirstMerc');
    expectAskingChangesNothing(game, game.rebelPlayers[0], 'hireFirstMerc');
  });

  it('hireMerc', () => {
    const game = startGame('castro', 'ask-changes-nothing-hireMerc');
    const rebel = putRebelInCity(game);
    expectAskingChangesNothing(game, rebel, 'hireMerc');
  });

  it('rehireMerc', () => {
    const game = startGame('castro', 'ask-changes-nothing-rehireMerc');
    game.currentDay = 2;
    game.gameMap.getAllSectors()[0].addRebelMilitia(`${game.rebelPlayers[0].seat}`, 5);
    expectAskingChangesNothing(game, game.rebelPlayers[0], 'rehireMerc');
  });
});

describe('a rebel hire picks from the MERCs drawn before the pick (#80)', () => {
  const name = (merc: CombatantModel) => merc.combatantName.charAt(0).toUpperCase() + merc.combatantName.slice(1);

  it('hireFirstMerc hires one of the three MERCs the flow drew', () => {
    const game = startGame('castro', 'hire-first-from-offer');
    const rebel = game.rebelPlayers[0];
    rebel.primarySquad.sectorId = game.gameMap.getAllSectors()[0].sectorId;
    const [hired, ...rest] = rebel.mercOffer.all(CombatantModel);
    expect(rest).toHaveLength(2);

    const result = game.getActionExecutor().executeAction(game.getAction('hireFirstMerc')!, rebel, {
      merc: name(hired), equipmentType: 'Weapon',
    });

    expect(result.success).toBe(true);
    expect(rebel.team).toEqual([hired]);
    expect(rebel.mercOffer.all(CombatantModel)).toEqual(rest);
  });

  // The picks run without the held follow-up: combat ending the step drops it, and the hire must still finish.
  it('hireMerc spends the actions and draws three; the pick hires into the acting MERC\'s squad', () => {
    const game = startGame('castro', 'hire-merc-from-offer');
    const { rebel, merc } = putRebelMercInCity(game);
    game.discardMercOffer(rebel.mercOffer);
    const executor = game.getActionExecutor();

    const drew = executor.executeAction(game.getAction('hireMerc')!, rebel, { actingMerc: merc, fireFirst: 'none' });

    expect(drew.success).toBe(true);
    expect(merc.actionsRemaining).toBe(0);
    expect(drew.followUp?.action).toBe('hireMercFromOffer');
    const [hired, ...rest] = rebel.mercOffer.all(CombatantModel);
    expect(rest).toHaveLength(2);

    const picked = executor.executeAction(game.getAction('hireMercFromOffer')!, rebel, {
      selectedMercs: [name(hired)], equipmentType: 'Armor',
    });

    expect(picked.success).toBe(true);
    expect(rebel.primarySquad.all(CombatantModel)).toContain(hired);
    expect(hired.actionsRemaining).toBe(0);
    expect(rebel.mercOffer.all(CombatantModel)).toHaveLength(0);
    for (const other of rest) expect(game.mercDiscard.all(CombatantModel)).toContain(other);
  });

  it('a bot rebel\'s hireMerc counts as its action in the bot batch', () => {
    const runner = new GameRunner<MERCGame>({
      GameClass: MERCGame,
      gameType: 'merc',
      gameOptions: {
        playerCount: 3, playerNames: ['Rebel1', 'Rebel2', 'Dictator'], seed: 'hire-bot-batch', dictatorChoice: 'castro',
        playerConfigs: [
          { color: '#e74c3c', isDictator: false, isBot: true },
          { color: '#3498db', isDictator: false, isBot: true },
          { color: '#95a5a6', isDictator: true, isBot: false },
        ],
      } as never,
    });
    runner.start();
    const game = runner.game;
    const city = game.gameMap.getAllSectors().find(s => s.isCity)!;
    const [hirer, other] = game.rebelPlayers;
    const actingMerc = game.drawMerc()!;
    for (const [rebel, merc] of [[hirer, actingMerc], [other, game.drawMerc()!]] as const) {
      game.discardMercOffer(rebel.mercOffer);
      merc.putInto(rebel.primarySquad);
      rebel.primarySquad.sectorId = city.sectorId;
      merc.actionsRemaining = 2;
    }
    game.resetRebelBatching();

    game.getActionExecutor().executeAction(game.getAction('hireMerc')!, hirer, { actingMerc, fireFirst: 'none' });

    expect(game.shouldGateBotAction(hirer)).toBe(true);
  });

  it('a rebel wiped out while a paid hire is pending finishes that hire, not a free rehire', () => {
    const game = startGame('castro', 'hire-pending-team-wiped');
    const { rebel, merc } = putRebelMercInCity(game);
    game.discardMercOffer(rebel.mercOffer);
    const executor = game.getActionExecutor();
    executor.executeAction(game.getAction('hireMerc')!, rebel, { actingMerc: merc, fireFirst: 'none' });
    merc.putInto(game.mercDiscard);

    expect(executor.isActionAvailable(game.getAction('rehireMercFromOffer')!, rebel)).toBe(false);
    expect(executor.isActionAvailable(game.getAction('hireMercFromOffer')!, rebel)).toBe(true);
    const [hired] = rebel.mercOffer.all(CombatantModel);
    executor.executeAction(game.getAction('hireMercFromOffer')!, rebel, { selectedMercs: [name(hired)], equipmentType: 'Weapon' });

    expect(rebel.team).toEqual([hired]);
    expect(rebel.hireSquadRef).toBeUndefined();
  });

  it('a hire whose MERCs on offer are all incompatible can finish by hiring none', () => {
    const runner = startRunner('castro', 'hire-holds-the-turn');
    const game = runner.game;
    playUntilOffered(runner, 'hireMerc');
    const seat = getCurrentAction(game.getFlowState())!.currentPlayer;
    const rebel = game.rebelPlayers.find(r => r.seat === seat)!;
    runner.performAction('hireMerc', seat, autoResolveArgs(game, 'hireMerc', seat)!);
    game.discardMercOffer(rebel.mercOffer);
    for (const member of rebel.team) member.putInto(game.mercDiscard);
    game.first(CombatantModel, m => m.combatantId === 'borris')!.putInto(rebel.primarySquad);
    const squirrel = game.first(CombatantModel, m => m.combatantId === 'squirrel')!;
    squirrel.putInto(rebel.mercOffer);

    const move = enumerateLegalMoves(game, seat).find(m => m.action === 'hireMercFromOffer');
    expect(move?.args.selectedMercs ?? []).toEqual([]);
    expect(runner.performAction('hireMercFromOffer', seat, move!.args).success).toBe(true);

    expect(rebel.team).not.toContain(squirrel);
    expect(game.mercDiscard.all(CombatantModel)).toContain(squirrel);
  });

  it('rehireMerc draws three; the pick hires one, ready to act, and discards the rest', () => {
    const game = startGame('castro', 'rehire-from-offer');
    game.currentDay = 2;
    const rebel = game.rebelPlayers[0];
    const friendly = game.gameMap.getAllSectors()[0];
    friendly.addRebelMilitia(`${rebel.seat}`, 5);
    game.discardMercOffer(rebel.mercOffer);
    const executor = game.getActionExecutor();

    const drew = executor.executeAction(game.getAction('rehireMerc')!, rebel, { sector: friendly });

    expect(drew.success).toBe(true);
    expect(drew.followUp?.action).toBe('rehireMercFromOffer');
    const [hired, ...rest] = rebel.mercOffer.all(CombatantModel);
    expect(rest).toHaveLength(2);

    const picked = executor.executeAction(game.getAction('rehireMercFromOffer')!, rebel, {
      selectedMerc: name(hired), equipmentType: 'Weapon',
    });

    expect(picked.success).toBe(true);
    expect(rebel.team).toEqual([hired]);
    expect(hired.actionsRemaining).toBeGreaterThan(0);
    expect(rebel.mercOffer.all(CombatantModel)).toHaveLength(0);
    for (const other of rest) expect(game.mercDiscard.all(CombatantModel)).toContain(other);
  });

  it('during the rebel turn, a rebel with MERCs on offer may only finish the hire', () => {
    const runner = startRunner('castro', 'hire-holds-the-turn');
    const game = runner.game;
    playUntilOffered(runner, 'hireMerc');
    const seat = getCurrentAction(game.getFlowState())!.currentPlayer;

    expect(runner.performAction('hireMerc', seat, autoResolveArgs(game, 'hireMerc', seat)!).success).toBe(true);

    expect(getPlayerAction(game.getFlowState(), seat)?.available ?? []).not.toContain('endTurn');
    const moves = enumerateLegalMoves(game, seat);
    expect(moves.length).toBeGreaterThan(0);
    expect(new Set(moves.map(m => m.action))).toEqual(new Set(['hireMercFromOffer']));

    expect(runner.performAction('hireMercFromOffer', seat, moves[0].args).success).toBe(true);
    expect(game.rebelPlayers.find(r => r.seat === seat)!.mercOffer.all(CombatantModel)).toHaveLength(0);
  });
});
