import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Sector, TacticsCard } from '../src/rules/elements.js';
import { executeTacticsEffect, applyConscriptsEffect, applyOilReservesEffect } from '../src/rules/tactics-effects.js';
import { executeCombat, getCombatants, countHitsForCombatant } from '../src/rules/combat.js';

/**
 * Coverage for src/rules/tactics-effects.ts, which implements all 14 dictator
 * tactics cards and previously had no tests at all.
 */
function newGame(seed: string, rebelCount = 2) {
  return createTestGame(MERCGame, {
    playerCount: rebelCount + 1,
    playerNames: [...Array.from({ length: rebelCount }, (_, i) => `Rebel${i + 1}`), 'Dictator'],
    seed,
    expansionModes: ['A'],
  }).game;
}

/** Build a loose TacticsCard so an effect can be run without dealing a hand. */
function card(game: MERCGame, tacticsId: string, name: string, revealsBase = false): TacticsCard {
  return game.dictatorPlayer.tacticsDeck.create(TacticsCard, `test-${tacticsId}`, {
    tacticsId,
    tacticsName: name,
    story: '',
    description: '',
    revealsBase,
  });
}

/** Give the dictator a base so the base-revealing cards have somewhere to reveal. */
function withBase(game: MERCGame): Sector {
  const base = game.gameMap.getAllSectors().find(s => s.isIndustry)!;
  game.dictatorPlayer.baseSectorId = base.sectorId;
  return base;
}

/** The game log as plain strings, whatever shape the engine records entries in. */
function gameMessages(game: MERCGame): string[] {
  return (game.messages as unknown[]).map(m =>
    typeof m === 'string' ? m : String((m as { text?: unknown }).text ?? '')
  );
}

/** Run an action's handler directly, bypassing the flow's turn plumbing. */
function runAction(game: MERCGame, name: string, player: unknown, args: Record<string, unknown>) {
  const action = game.getAction(name);
  if (!action) throw new Error(`action ${name} is not registered`);
  return action.execute(args, { player, game, args } as never);
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

// ===========================================================================
// The rest of the deck (issue #56). The three human pending flows -- Artillery
// allocation, Generalissimo and Lockdown -- are the paths where a card can
// strand the flow, so each is driven through its action here.
// ===========================================================================

describe('Artillery Barrage', () => {
  /** A rebel-held sector adjacent to a dictator-held one, which is what the card looks for. */
  function targetableSector(game: MERCGame, rebelSeat: number) {
    for (const dictatorSector of game.gameMap.getAllSectors()) {
      const adjacent = game.getAdjacentSectors(dictatorSector);
      if (adjacent.length === 0) continue;
      dictatorSector.dictatorMilitia = 3;
      const target = adjacent.find(s => s.sectorId !== dictatorSector.sectorId);
      if (!target) continue;
      target.dictatorMilitia = 0;
      target.addRebelMilitia(`${rebelSeat}`, 4);
      return { dictatorSector, target };
    }
    throw new Error('no adjacent sector pair on this map');
  }

  it('pauses for the rebel to allocate its own hits', () => {
    const game = newGame('artillery-pending', 1);
    const rebel = game.rebelPlayers[0];
    const { target } = targetableSector(game, rebel.seat);

    executeTacticsEffect(game, card(game, 'artillery-barrage', 'Artillery Barrage'));

    const pending = game.pendingArtilleryAllocation;
    expect(pending, 'artillery did not pause for allocation').not.toBeNull();
    expect(pending!.hits).toBeGreaterThan(0);
    // Only the owning rebel's units are offered to that rebel.
    expect(pending!.validTargets.every(t => t.ownerId === `${rebel.seat}`)).toBe(true);
    expect(pending!.sectorId).toBe(target.sectorId);
  });

  it('kills the militia the rebel allocates hits to', () => {
    const game = newGame('artillery-allocate', 1);
    const rebel = game.rebelPlayers[0];
    const { target } = targetableSector(game, rebel.seat);

    executeTacticsEffect(game, card(game, 'artillery-barrage', 'Artillery Barrage'));
    const pending = game.pendingArtilleryAllocation!;
    const militiaTarget = pending.validTargets.find(t => t.type === 'militia')!;
    const before = target.getRebelMilitia(`${rebel.seat}`);
    const hits = Math.min(pending.hits, militiaTarget.currentHealth);

    const result = runAction(game, 'artilleryAllocateHits', rebel, {
      allocations: Array.from({ length: hits }, (_, i) => `${militiaTarget.id}::${i}`),
    });

    expect(result).toMatchObject({ success: true });
    expect(target.getRebelMilitia(`${rebel.seat}`)).toBe(before - hits);
  });

  it('attacks no more sectors than there are rebels', () => {
    const game = newGame('artillery-slice', 1);
    const rebel = game.rebelPlayers[0];
    // Rebel militia everywhere, so the card has far more than rebelCount candidates.
    for (const sector of game.gameMap.getAllSectors()) {
      sector.dictatorMilitia = 2;
      sector.addRebelMilitia(`${rebel.seat}`, 2);
    }

    executeTacticsEffect(game, card(game, 'artillery-barrage', 'Artillery Barrage'));

    const pending = game.pendingArtilleryAllocation;
    expect(pending, 'no sector was targeted, so the cap is untested').not.toBeNull();
    // One sector in hand plus the queue must not exceed the rebel count.
    expect(1 + pending!.sectorsRemaining.length).toBeLessThanOrEqual(game.rebelCount);
  });
});

describe('Better Weapons', () => {
  it('reveals the base and arms the militia', () => {
    const game = newGame('better-weapons');
    withBase(game);
    expect(game.betterWeaponsActive ?? false).toBe(false);

    executeTacticsEffect(game, card(game, 'better-weapons', 'Better Weapons', true));

    expect(game.dictatorPlayer.baseRevealed).toBe(true);
    expect(game.betterWeaponsActive).toBe(true);
  });

  it('drops the dictator militia hit threshold to 3+ in the batch path', () => {
    const game = newGame('better-weapons-batch');
    const rebel = game.rebelPlayers[0];
    const sector = game.gameMap.getAllSectors()[0];
    const merc = game.first(CombatantModel, m => m.isMerc && !m.isDead)!;
    merc.putInto(rebel.primarySquad);
    rebel.primarySquad.sectorId = sector.sectorId;
    sector.addDictatorMilitia(4);

    game.betterWeaponsActive = true;
    executeCombat(game, sector, rebel, { interactive: false });

    const rollMessages = gameMessages(game).filter(m => m.includes('Militia x') && m.includes('need'));
    expect(rollMessages.length, 'militia never rolled as a batch').toBeGreaterThan(0);
    expect(rollMessages.every(m => m.includes('need 3+'))).toBe(true);
  });

  it('leaves militia on the default 4+ threshold when it has not been played', () => {
    const game = newGame('better-weapons-off');
    const rebel = game.rebelPlayers[0];
    const sector = game.gameMap.getAllSectors()[0];
    const merc = game.first(CombatantModel, m => m.isMerc && !m.isDead)!;
    merc.putInto(rebel.primarySquad);
    rebel.primarySquad.sectorId = sector.sectorId;
    sector.addDictatorMilitia(4);

    executeCombat(game, sector, rebel, { interactive: false });

    const rollMessages = gameMessages(game).filter(m => m.includes('Militia x') && m.includes('need'));
    expect(rollMessages.length).toBeGreaterThan(0);
    expect(rollMessages.every(m => m.includes('need 4+'))).toBe(true);
  });

  it('counts a 3 as a hit for dictator militia and not for rebel militia', () => {
    const game = newGame('better-weapons-threshold');
    game.betterWeaponsActive = true;
    const rolls = [1, 2, 3, 4, 5, 6];

    const dictatorMilitia = { isMilitia: true, isDictatorSide: true } as never;
    const rebelMilitia = { isMilitia: true, isDictatorSide: false } as never;

    expect(countHitsForCombatant(rolls, dictatorMilitia, game)).toBe(4); // 3,4,5,6
    expect(countHitsForCombatant(rolls, rebelMilitia, game)).toBe(3);    // 4,5,6
  });
});

describe('Veteran Militia', () => {
  it('reveals the base and sets the permanent initiative flag', () => {
    const game = newGame('veteran-militia');
    withBase(game);
    expect(game.veteranMilitiaActive ?? false).toBe(false);

    executeTacticsEffect(game, card(game, 'veteran-militia', 'Veteran Militia', true));

    expect(game.dictatorPlayer.baseRevealed).toBe(true);
    expect(game.veteranMilitiaActive).toBe(true);
  });

  it('gives dictator militia +1 initiative and leaves rebel militia alone', () => {
    const game = newGame('veteran-militia-initiative');
    const rebel = game.rebelPlayers[0];
    const sector = game.gameMap.getAllSectors()[0];
    sector.addDictatorMilitia(2);
    sector.addRebelMilitia(`${rebel.seat}`, 2);

    const before = getCombatants(game, sector);
    const baseline = before.dictator.find(c => c.isMilitia)!.initiative;
    const rebelBaseline = before.rebels.find(c => c.isMilitia)!.initiative;

    game.veteranMilitiaActive = true;
    const after = getCombatants(game, sector);

    expect(after.dictator.find(c => c.isMilitia)!.initiative).toBe(baseline + 1);
    expect(after.rebels.find(c => c.isMilitia)!.initiative).toBe(rebelBaseline);
  });
});

describe('Fodder', () => {
  it('sends half the largest rebel stack, rounded up, per rebel', () => {
    const game = newGame('fodder-split');
    const [a, b] = game.rebelPlayers;
    const sectors = game.gameMap.getAllSectors();
    const big = sectors[0];
    const small = sectors[1];
    const other = sectors[2];
    for (const s of sectors) s.dictatorMilitia = 0;

    big.addRebelMilitia(`${a.seat}`, 5);   // largest for A -> 3 militia sent
    small.addRebelMilitia(`${a.seat}`, 1); // ignored, not the largest
    other.addRebelMilitia(`${b.seat}`, 4); // largest for B -> 2 militia sent

    executeTacticsEffect(game, card(game, 'fodder', 'Fodder'));

    expect(big.dictatorMilitia).toBe(3);
    expect(other.dictatorMilitia).toBe(2);
    expect(small.dictatorMilitia).toBe(0);
  });

  it('queues combat where it drops militia', () => {
    const game = newGame('fodder-combat', 1);
    const rebel = game.rebelPlayers[0];
    const sector = game.gameMap.getAllSectors()[0];
    sector.dictatorMilitia = 0;
    sector.addRebelMilitia(`${rebel.seat}`, 4);

    executeTacticsEffect(game, card(game, 'fodder', 'Fodder'));

    const queued = [
      ...(game.pendingCombat ? [game.pendingCombat] : []),
      ...game.pendingCombatQueue,
    ];
    expect(queued.some(c => c.sectorId === sector.sectorId)).toBe(true);
  });

  it('does nothing to a rebel with no militia on the map', () => {
    const game = newGame('fodder-empty', 1);
    for (const s of game.gameMap.getAllSectors()) s.dictatorMilitia = 0;

    const result = executeTacticsEffect(game, card(game, 'fodder', 'Fodder'));

    expect(result.success).toBe(true);
    expect(game.gameMap.getAllSectors().every(s => s.dictatorMilitia === 0)).toBe(true);
  });
});

describe('Generalisimo', () => {
  it('reveals the base and hires one of six for a Bot dictator', () => {
    const game = newGame('generalisimo-bot');
    withBase(game);
    game.dictatorPlayer.isBot = true;
    const deckBefore = game.mercDeck.count(CombatantModel);
    const discardBefore = game.mercDiscard.count(CombatantModel);

    const result = executeTacticsEffect(game, card(game, 'generalisimo', 'Generalisimo', true));

    expect(game.dictatorPlayer.baseRevealed).toBe(true);
    expect(result.data?.mercHired).toBeDefined();
    expect(game.mercDeck.count(CombatantModel)).toBe(deckBefore - 6);
    // Five of the six drawn go to the discard; one is hired.
    expect(game.mercDiscard.count(CombatantModel)).toBe(discardBefore + 5);
    expect(game.dictatorPlayer.hiredMercs.length).toBe(1);
  });

  it('hands a human dictator six MERCs to choose from, and the pick hires one', () => {
    const game = newGame('generalisimo-human');
    const base = withBase(game);
    game.dictatorPlayer.isBot = false;
    base.dictatorMilitia = 3;

    executeTacticsEffect(game, card(game, 'generalisimo', 'Generalisimo', true));

    const pending = game.pendingGeneralissimoHire;
    expect(pending, 'no pending Generalissimo choice for the human dictator').not.toBeNull();
    expect(pending!.drawnMercIds).toHaveLength(6);

    const chosen = game.getElementById(pending!.drawnMercIds[0]) as CombatantModel;
    const result = runAction(game, 'generalissimoPick', game.dictatorPlayer, {
      selectedMerc: chosen.combatantName.charAt(0).toUpperCase() + chosen.combatantName.slice(1),
      equipmentType: 'Weapon',
      targetSector: base.sectorName,
    });

    expect(result).toMatchObject({ success: true });
    expect(game.pendingGeneralissimoHire).toBeNull();
    expect(game.dictatorPlayer.hiredMercs.map(m => m.id)).toContain(chosen.id);
  });
});

describe('Lockdown', () => {
  it('places 5 militia per rebel on the base and its neighbours, respecting the 10 cap', () => {
    const game = newGame('lockdown-bot', 2);
    const base = withBase(game);
    game.dictatorPlayer.isBot = true;
    for (const s of game.gameMap.getAllSectors()) s.dictatorMilitia = 0;

    executeTacticsEffect(game, card(game, 'lockdown', 'Lockdown', true));

    const valid = [base, ...game.getAdjacentSectors(base)];
    const placed = valid.reduce((sum, s) => sum + s.dictatorMilitia, 0);
    expect(placed).toBe(5 * game.rebelCount);
    expect(valid.every(s => s.dictatorMilitia <= 10)).toBe(true);

    const validIds = new Set(valid.map(s => s.sectorId));
    const strays = game.gameMap.getAllSectors()
      .filter(s => !validIds.has(s.sectorId) && s.dictatorMilitia > 0);
    expect(strays).toEqual([]);
  });

  it('lets a human dictator place the militia a sector at a time', () => {
    const game = newGame('lockdown-human', 1);
    const base = withBase(game);
    game.dictatorPlayer.isBot = false;
    for (const s of game.gameMap.getAllSectors()) s.dictatorMilitia = 0;

    executeTacticsEffect(game, card(game, 'lockdown', 'Lockdown', true));

    const pending = game.pendingLockdownMilitia;
    expect(pending, 'no pending Lockdown placement for the human dictator').not.toBeNull();
    expect(pending!.remaining).toBe(5 * game.rebelCount);
    expect(pending!.validSectorIds).toContain(base.sectorId);

    runAction(game, 'lockdownPlaceMilitia', game.dictatorPlayer, {
      targetSector: base.sectorName,
      amount: '3',
    });

    expect(base.dictatorMilitia).toBe(3);
    expect(game.pendingLockdownMilitia!.remaining).toBe(5 * game.rebelCount - 3);
  });

  it('refuses to overfill a sector already at the 10 cap', () => {
    const game = newGame('lockdown-cap', 1);
    const base = withBase(game);
    game.dictatorPlayer.isBot = false;
    base.dictatorMilitia = 10;

    executeTacticsEffect(game, card(game, 'lockdown', 'Lockdown', true));

    const result = runAction(game, 'lockdownPlaceMilitia', game.dictatorPlayer, {
      targetSector: base.sectorName,
      amount: '5',
    });

    expect(result).toMatchObject({ success: false });
    expect(base.dictatorMilitia).toBe(10);
  });
});

describe('Block Trade', () => {
  it('explores every city and garrisons each one', () => {
    const game = newGame('block-trade', 3);
    const cities = game.gameMap.getAllSectors().filter(s => s.isCity);
    expect(cities.length).toBeGreaterThan(0);
    for (const city of cities) city.dictatorMilitia = 0;

    executeTacticsEffect(game, card(game, 'block-trade', 'Block Trade'));

    const perCity = Math.ceil(game.rebelCount / 2);
    expect(cities.every(c => c.explored)).toBe(true);
    expect(cities.every(c => c.dictatorMilitia === perCity)).toBe(true);
  });

  it('garrisons cities that were already explored too', () => {
    const game = newGame('block-trade-explored', 2);
    const cities = game.gameMap.getAllSectors().filter(s => s.isCity);
    const first = cities[0];
    first.explore();
    for (const city of cities) city.dictatorMilitia = 0;

    executeTacticsEffect(game, card(game, 'block-trade', 'Block Trade'));

    expect(first.dictatorMilitia).toBe(Math.ceil(game.rebelCount / 2));
  });
});

describe('Sentry', () => {
  it('garrisons only genuinely uncontrolled sectors', () => {
    const game = newGame('sentry-placement', 2);
    const sectors = game.gameMap.getAllSectors();
    for (const s of sectors) s.dictatorMilitia = 0;

    const rebelHeld = sectors[0];
    rebelHeld.addRebelMilitia(`${game.rebelPlayers[0].seat}`, 2);
    const dictatorHeld = sectors[1];
    dictatorHeld.dictatorMilitia = 2;
    const empty = sectors.filter(s => game.isSectorUncontrolled(s));
    expect(empty.length).toBeGreaterThan(0);

    executeTacticsEffect(game, card(game, 'sentry', 'Sentry'));

    const perSector = Math.ceil(game.rebelCount / 2);
    expect(empty.every(s => s.dictatorMilitia === perSector)).toBe(true);
    expect(rebelHeld.dictatorMilitia).toBe(0);
    // An already-held sector is not uncontrolled, so it gets no sentry.
    expect(dictatorHeld.dictatorMilitia).toBe(2);
  });
});

describe('Conscripts (initial play)', () => {
  it('arms the permanent effect with half the rebel count, rounded up', () => {
    const game = newGame('conscripts-play', 3);
    expect(game.conscriptsActive ?? false).toBe(false);

    executeTacticsEffect(game, card(game, 'conscripts', 'Conscripts'));

    expect(game.conscriptsActive).toBe(true);
    expect(game.conscriptsAmount).toBe(2);
  });
});

describe('Oil Reserves (initial play)', () => {
  it('arms the permanent effect', () => {
    const game = newGame('oil-reserves-play');
    expect(game.oilReservesActive ?? false).toBe(false);

    executeTacticsEffect(game, card(game, 'oil-reserves', 'Oil Reserves'));

    expect(game.oilReservesActive).toBe(true);
  });

  it('credits the dictator when he holds the oil and no rebel does', () => {
    const game = newGame('oil-reserves-dictator', 5);
    const oil = game.gameMap.getAllSectors().find(s => s.sectorId === 'industry---oil')!;
    expect(oil, 'this map has no oil industry').toBeDefined();

    game.oilReservesActive = true;
    oil.dictatorMilitia = 3;
    for (const rebel of game.rebelPlayers) {
      rebel.primarySquad.sectorId = undefined;
      rebel.secondarySquad.sectorId = undefined;
    }

    applyOilReservesEffect(game, false);

    expect(game.dictatorPlayer.freeMoveActions).toBe(1);
  });

  it('credits nobody when both sides stand on the oil', () => {
    const game = newGame('oil-reserves-contested', 5);
    const rebel = game.rebelPlayers[0];
    const oil = game.gameMap.getAllSectors().find(s => s.sectorId === 'industry---oil')!;
    expect(oil, 'this map has no oil industry').toBeDefined();

    game.oilReservesActive = true;
    oil.dictatorMilitia = 3;
    oil.addRebelMilitia(`${rebel.seat}`, 2);

    applyOilReservesEffect(game, false);
    applyOilReservesEffect(game, true, rebel);

    expect(game.dictatorPlayer.freeMoveActions).toBe(0);
    expect(rebel.freeMoveActions).toBe(0);
  });
});
