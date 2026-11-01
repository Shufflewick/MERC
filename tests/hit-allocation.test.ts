import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import type { GameRandom } from 'boardsmith';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Equipment, Sector } from '../src/rules/elements.js';
import { activeCombatIn } from './helpers/combat-state.js';
import { allocateHits, executeCombat } from '../src/rules/combat.js';
import type { Combatant } from '../src/rules/combat-types.js';

function makeCombatant(id: string, health: number, armor: number): Combatant {
  return {
    id,
    name: id,
    initiative: 1,
    combat: 1,
    health,
    maxHealth: health,
    armor,
    maxArmor: armor,
    targets: 1,
    isDictatorSide: true,
    isMilitia: false,
    isDictator: false,
    isAttackDog: false,
    sourceElement: null,
    armorPiercing: false,
    hasAttackDog: false,
    isImmuneToAttackDogs: false,
    willNotHarmDogs: false,
  };
}

describe('allocateHits', () => {
  it('honours the attacker\'s per-target allocation exactly', () => {
    const a = makeCombatant('a', 3, 0);
    const b = makeCombatant('b', 3, 0);
    // Player allocated 1 hit to A and 2 to B (one entry per hit).
    const plan = allocateHits([a, b, b], 3, false, true);
    expect(plan).toEqual([
      { target: a, hits: 1 },
      { target: b, hits: 2 },
    ]);
  });

  it('never allocates more hits than were rolled', () => {
    const a = makeCombatant('a', 3, 0);
    const b = makeCombatant('b', 3, 0);
    const plan = allocateHits([a, a, b, b], 2, false, true);
    expect(plan.reduce((sum, p) => sum + p.hits, 0)).toBe(2);
  });

  it('spends hits on armour before spilling to the next target', () => {
    const armoured = makeCombatant('armoured', 3, 2);
    const soft = makeCombatant('soft', 3, 0);
    // 6 hits: 2 soak armour + 3 kill health = 5 on the first target, 1 spills.
    const plan = allocateHits([armoured, soft], 6, false, false);
    expect(plan).toEqual([
      { target: armoured, hits: 5 },
      { target: soft, hits: 1 },
    ]);
  });

  it('does not re-spend armour-absorbed hits on later targets', () => {
    const armoured = makeCombatant('armoured', 1, 3);
    const soft = makeCombatant('soft', 3, 0);
    const plan = allocateHits([armoured, soft], 4, false, false);
    expect(plan.reduce((sum, p) => sum + p.hits, 0)).toBe(4);
    expect(plan[0].hits).toBe(4);
    expect(plan.length).toBe(1);
  });

  it('ignores armour for armour-piercing attacks', () => {
    const armoured = makeCombatant('armoured', 1, 3);
    const soft = makeCombatant('soft', 3, 0);
    const plan = allocateHits([armoured, soft], 4, true, false);
    expect(plan).toEqual([
      { target: armoured, hits: 1 },
      { target: soft, hits: 3 },
    ]);
  });

  it('gives a 1-health militia exactly one hit', () => {
    const m1 = makeCombatant('m1', 1, 0);
    const m2 = makeCombatant('m2', 1, 0);
    const m3 = makeCombatant('m3', 1, 0);
    const plan = allocateHits([m1, m2, m3], 3, false, false);
    expect(plan.every(p => p.hits === 1)).toBe(true);
    expect(plan.length).toBe(3);
  });
});

describe('combatAllocateHits prompt', () => {
  it('can be answered when the roll has more hits than the targets have health', () => {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'allocate-overkill',
    }).game;
    const rebel = game.rebelPlayers[0];
    const militia = (id: string) => ({ id, name: 'militia', isMerc: false, currentHealth: 1, maxHealth: 1, armor: 0, declared: true });
    // A reroll-capable attacker pauses even on overkill: 3 hits, 2 health to take them.
    game.activeCombat = {
      ...activeCombatIn(game.gameMap.getAllSectors()[0].sectorId, rebel.seat),
      pendingHitAllocation: {
        attackerId: 'basic', attackerName: 'Basic', attackerCombatantId: 'basic',
        diceRolls: [6, 6, 6], hits: 3, hitThreshold: 4,
        validTargets: [militia('m1'), militia('m2')],
        wolverineSixes: 0, canReroll: true, hasRerolled: false, rollCount: 1,
      },
    };

    // Both militia, one hit each: everything the targets can take.
    const result = game.performAction('combatAllocateHits', rebel, { allocations: ['m1::0', 'm2::0'] });
    expect(result.success, result.error).toBe(true);
    expect(game.activeCombat?.pendingHitAllocation, 'the allocation was refused').toBeUndefined();
  });

  it('lets the attacker spend hits on armour, so an armoured target can still be killed', () => {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'allocate-through-armour',
    }).game;
    const rebel = game.rebelPlayers[0];
    // 3 hits: one soaks the MERC's armour, one kills it, one kills the militia.
    game.activeCombat = {
      ...activeCombatIn(game.gameMap.getAllSectors()[0].sectorId, rebel.seat),
      pendingHitAllocation: {
        attackerId: 'basic', attackerName: 'Basic', attackerCombatantId: 'basic',
        diceRolls: [6, 6, 6], hits: 3, hitThreshold: 4,
        validTargets: [
          { id: 'merc', name: 'merc', isMerc: true, currentHealth: 1, maxHealth: 3, armor: 1, declared: true },
          { id: 'm1', name: 'militia', isMerc: false, currentHealth: 1, maxHealth: 1, armor: 0, declared: true },
        ],
        wolverineSixes: 0, canReroll: true, hasRerolled: false, rollCount: 1,
      },
    };

    const result = game.performAction('combatAllocateHits', rebel, { allocations: ['merc::0', 'merc::1', 'm1::0'] });
    expect(result.success, result.error).toBe(true);
  });

  it('lets undeclared targets take only as many hits as Wolverine rolled 6s (#91)', () => {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'allocate-wolverine-cap',
    }).game;
    const rebel = game.rebelPlayers[0];
    // One 6 and one 4: the 4 must hit the declared MERC.
    game.activeCombat = {
      ...activeCombatIn(game.gameMap.getAllSectors()[0].sectorId, rebel.seat),
      pendingHitAllocation: {
        attackerId: 'wolverine', attackerName: 'Wolverine', attackerCombatantId: 'wolverine',
        diceRolls: [6, 4], hits: 2, hitThreshold: 4,
        validTargets: [
          { id: 'merc', name: 'merc', isMerc: true, currentHealth: 3, maxHealth: 3, armor: 0, declared: true },
          { id: 'm1', name: 'militia', isMerc: false, currentHealth: 1, maxHealth: 1, armor: 0, declared: false },
          { id: 'm2', name: 'militia', isMerc: false, currentHealth: 1, maxHealth: 1, armor: 0, declared: false },
        ],
        wolverineSixes: 1, canReroll: false, hasRerolled: false, rollCount: 1,
      },
    };

    const refused = game.performAction('combatAllocateHits', rebel, { allocations: ['m1::0', 'm2::0'] });
    expect(refused.success).toBe(false);
    expect(refused.error).toBe('Only 1 hit(s) can go to targets Wolverine did not declare, one per 6 rolled (allocated 2)');

    const result = game.performAction('combatAllocateHits', rebel, { allocations: ['merc::0', 'm1::0'] });
    expect(result.success, result.error).toBe(true);
  });

  it('asks for only the hits the targets can take when the undeclared ones are limited to the 6s (#91)', () => {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'allocate-wolverine-capacity',
    }).game;
    const rebel = game.rebelPlayers[0];
    // Three hits, one a 6: the declared militia takes one, the 6 can add one more on Apeiron, the third is wasted.
    game.activeCombat = {
      ...activeCombatIn(game.gameMap.getAllSectors()[0].sectorId, rebel.seat),
      pendingHitAllocation: {
        attackerId: 'wolverine', attackerName: 'Wolverine', attackerCombatantId: 'wolverine',
        diceRolls: [6, 5, 4], hits: 3, hitThreshold: 4,
        validTargets: [
          { id: 'm1', name: 'militia', isMerc: false, currentHealth: 1, maxHealth: 1, armor: 0, declared: true },
          { id: 'merc', name: 'merc', isMerc: true, currentHealth: 3, maxHealth: 3, armor: 0, declared: false },
        ],
        wolverineSixes: 1, canReroll: false, hasRerolled: false, rollCount: 1,
      },
    };

    const result = game.performAction('combatAllocateHits', rebel, { allocations: ['m1::0', 'merc::0'] });
    expect(result.success, result.error).toBe(true);
  });
});

/** Dice that show whatever face the test sets, so a second roll would be visible. */
function riggedDice(): { random: GameRandom; show: (face: number) => void } {
  let face = 6;
  const random = (() => (face - 0.5) / 6) as GameRandom;
  random.getState = () => '';
  random.setState = () => {};
  return { random, show: (f: number) => { face = f; } };
}

describe('resuming combat after the player allocates hits', () => {
  /** Human Basic in a sector, on dice showing 6. Basic pauses for allocation on any hit, because the reroll is on offer. */
  function basicAttacks(seed: string) {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed,
    }).game;
    const rebel = game.rebelPlayers[0];
    const sector = game.gameMap.getAllSectors()[0];
    const basic = game.mercDeck.first(CombatantModel, c => c.combatantId === 'basic')!;
    basic.putInto(rebel.primarySquad);
    rebel.primarySquad.sectorId = sector.sectorId;
    const dice = riggedDice();
    game.random = dice.random;
    return { game, rebel, sector, dice };
  }

  function basicRollLines(game: MERCGame): string[] {
    return (game.messages as unknown[])
      .map(m => typeof m === 'string' ? m : String((m as { text?: unknown }).text ?? ''))
      .filter(line => /^Basic (rolls|rerolls|uses reroll)/.test(line));
  }

  it('applies the roll the player allocated, without rolling again (#83)', () => {
    const { game, rebel, sector, dice } = basicAttacks('allocate-then-resume');
    sector.addDictatorMilitia(1);

    executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true });
    const pending = game.activeCombat?.pendingHitAllocation;
    expect(pending?.attackerName, 'Basic should be allocating hits').toBe('Basic');
    expect(pending!.diceRolls).toEqual([6, 6]);

    // Any roll after the allocation would now miss.
    dice.show(1);
    const result = game.performAction('combatAllocateHits', rebel, {
      allocations: [`${pending!.validTargets[0].id}::0`],
    });
    expect(result.success, result.error).toBe(true);

    expect(basicRollLines(game)).toEqual(['Basic rolls [6, 6] - 2 hit(s)']);
    expect(sector.dictatorMilitia, 'the allocated hit should kill the militia').toBe(0);
  });

  /** A dictator MERC alongside a dictator militia in Basic's sector. */
  function apeironAndMilitia(game: MERCGame, sector: Sector): CombatantModel {
    const apeiron = game.mercDeck.first(CombatantModel, c => c.combatantId === 'apeiron')!;
    apeiron.putInto(game.dictatorPlayer.primarySquad);
    game.dictatorPlayer.primarySquad.sectorId = sector.sectorId;
    sector.addDictatorMilitia(1);
    return apeiron;
  }

  it('splits the hits as the player allocated them (#83)', () => {
    const { game, rebel, sector, dice } = basicAttacks('allocate-split');
    // The Uzi's extra target lets Basic declare both the MERC and the militia.
    const basic = rebel.primarySquad.first(CombatantModel, c => c.combatantId === 'basic')!;
    basic.equip(game.first(Equipment, e => e.equipmentId === 'uzi')!);
    const apeiron = apeironAndMilitia(game, sector);

    executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true });
    const pending = game.activeCombat?.pendingHitAllocation;
    expect(pending?.validTargets.map(t => t.name).sort()).toEqual(['Apeiron', 'Militia']);
    const mercId = pending!.validTargets.find(t => t.isMerc)!.id;
    const militiaId = pending!.validTargets.find(t => !t.isMerc)!.id;

    dice.show(1);
    // One hit each, MERC first: spending hits greedily in that order would put both on the MERC.
    const result = game.performAction('combatAllocateHits', rebel, {
      allocations: [`${mercId}::0`, `${militiaId}::0`],
    });
    expect(result.success, result.error).toBe(true);

    expect(apeiron.damage).toBe(1);
    expect(sector.dictatorMilitia).toBe(0);
  });

  it('spends a grenade used in the allocated attack (#83)', () => {
    const { game, rebel, sector } = basicAttacks('allocate-grenade');
    const basic = rebel.primarySquad.first(CombatantModel, c => c.combatantId === 'basic')!;
    basic.equip(game.first(Equipment, e => e.equipmentId === 'grenade')!);
    // The grenade makes Basic act last; the vest keeps him alive until then.
    basic.equip(game.first(Equipment, e => e.equipmentId === 'kevlar-vest')!);
    apeironAndMilitia(game, sector);

    executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true });
    const pending = game.activeCombat?.pendingHitAllocation;
    expect(pending?.attackerName).toBe('Basic');
    const allocations = pending!.validTargets.flatMap(t =>
      Array.from({ length: t.armor + t.currentHealth }, (_, i) => `${t.id}::${i}`));
    const result = game.performAction('combatAllocateHits', rebel, { allocations });
    expect(result.success, result.error).toBe(true);

    expect(basic.accessorySlot, 'the grenade is used up by the attack').toBeUndefined();
  });

  it('counts a wounding allocated attack as progress, so the stalemate count stays at zero (#83)', () => {
    const { game, rebel, sector, dice } = basicAttacks('allocate-wound');
    const apeiron = game.mercDeck.first(CombatantModel, c => c.combatantId === 'apeiron')!;
    apeiron.putInto(game.dictatorPlayer.primarySquad);
    game.dictatorPlayer.primarySquad.sectorId = sector.sectorId;

    executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true });
    const target = game.activeCombat!.pendingHitAllocation!.validTargets[0];
    dice.show(1);
    // Two hits on a 3-health MERC: a wound, no kill, and Apeiron's reply misses.
    const result = game.performAction('combatAllocateHits', rebel, {
      allocations: [`${target.id}::0`, `${target.id}::1`],
    });
    expect(result.success, result.error).toBe(true);

    expect(apeiron.damage).toBe(2);
    expect(game.activeCombat?.awaitingRetreatDecisions, 'the round should end at the retreat decision').toBe(true);
    expect(game.activeCombat?.stalemateRounds).toBe(0);
  });

  it('ends the attack when a reroll leaves nothing to allocate (#83)', () => {
    const { game, rebel, sector, dice } = basicAttacks('reroll-to-nothing');
    sector.addDictatorMilitia(1);

    executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true });
    expect(game.activeCombat?.pendingHitAllocation?.attackerName).toBe('Basic');

    // The reroll misses, and so would anything after it.
    dice.show(1);
    expect(game.performAction('combatBasicReroll', rebel, {}).success).toBe(true);
    const result = game.performAction('combatAllocateHits', rebel, { allocations: [] });
    expect(result.success, result.error).toBe(true);

    expect(basicRollLines(game)).toEqual([
      'Basic rolls [6, 6] - 2 hit(s)',
      'Basic uses reroll ability! [1, 1] - 0 hit(s)',
    ]);
    expect(game.activeCombat?.pendingHitAllocation, 'Basic should not be asked to allocate again').toBeUndefined();
    expect(sector.dictatorMilitia).toBe(1);
  });

  it('offers Basic\'s reroll only once per combat (#91)', () => {
    const { game, rebel, sector, dice } = basicAttacks('reroll-once-per-combat');
    const apeiron = game.mercDeck.first(CombatantModel, c => c.combatantId === 'apeiron')!;
    apeiron.putInto(game.dictatorPlayer.primarySquad);
    game.dictatorPlayer.primarySquad.sectorId = sector.sectorId;

    executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true });
    expect(game.activeCombat?.pendingHitAllocation?.canReroll).toBe(true);
    expect(game.performAction('combatBasicReroll', rebel, {}).success).toBe(true);
    const target = game.activeCombat!.pendingHitAllocation!.validTargets[0];
    // Two hits wound Apeiron and his reply misses, so the fight goes to a second round.
    dice.show(1);
    const allocated = game.performAction('combatAllocateHits', rebel, {
      allocations: [`${target.id}::0`, `${target.id}::1`],
    });
    expect(allocated.success, allocated.error).toBe(true);
    expect(game.activeCombat?.awaitingRetreatDecisions, 'round 1 should end at the retreat decision').toBe(true);

    dice.show(6);
    // The flow starts the next round once the player chooses to continue.
    executeCombat(game, sector, rebel);

    expect(basicRollLines(game).filter(line => line.startsWith('Basic rolls'))).toHaveLength(2);
    expect(game.activeCombat?.pendingHitAllocation?.canReroll ?? false, 'the reroll was already used').toBe(false);
  });

  /** Dictator-side Basic kills a rebel Apeiron on 1 health who carries a shot; combat pauses for it. */
  function basicKillsApeironWithShot(seed: string) {
    const { game, rebel, sector, dice } = basicAttacks(seed);
    // Basic on the dictator's side, so the rebel MERC it kills can be offered the shot.
    const dictator = game.dictatorPlayer;
    const basic = rebel.primarySquad.first(CombatantModel, c => c.combatantId === 'basic')!;
    basic.putInto(dictator.primarySquad);
    dictator.primarySquad.sectorId = sector.sectorId;
    // A rebel MERC on its last health point, carrying the shot that pauses combat when it dies.
    const apeiron = game.mercDeck.first(CombatantModel, c => c.combatantId === 'apeiron')!;
    apeiron.putInto(rebel.primarySquad);
    apeiron.equip(game.first(Equipment, e => e.equipmentId === 'epinephrine-shot')!);
    apeiron.damage = apeiron.maxHealth - 1;

    executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true });
    const pending = game.activeCombat?.pendingHitAllocation;
    expect(pending?.attackerName).toBe('Basic');
    dice.show(1);
    const result = game.performAction('combatAllocateHits', dictator, {
      allocations: [`${pending!.validTargets[0].id}::0`],
    });
    expect(result.success, result.error).toBe(true);
    return { game, rebel, sector, dice, apeiron };
  }

  it('does not keep a spent allocation in the state saved at the next pause (#83)', () => {
    const { game } = basicKillsApeironWithShot('allocate-then-epinephrine');

    expect(game.activeCombat?.pendingEpinephrine, 'the kill should pause for the shot').toBeDefined();
    const saved = [...(game.activeCombat!.selectedTargets?.keys() ?? [])];
    expect(saved.filter(key => key.startsWith('allocation:'))).toEqual([]);
  });

  it('keeps a MERC saved by a human\'s Epinephrine Shot alive when combat resumes (#92)', () => {
    const { game, rebel, sector, apeiron } = basicKillsApeironWithShot('epinephrine-save-sticks');

    const saved = game.performAction('combatUseEpinephrine', rebel, { saverMerc: apeiron });
    expect(saved.success, saved.error).toBe(true);
    executeCombat(game, sector, rebel);

    const lines = (game.messages as unknown[]).map(m => typeof m === 'string' ? m : String((m as { text?: unknown }).text ?? ''));
    expect(lines).not.toContain('Apeiron has been killed in combat!');
    expect(apeiron.isDead).toBe(false);
    expect(apeiron.health).toBe(1);
  });

  it('lets the owner decline the shot, and the MERC dies (#92)', () => {
    const { game, rebel, apeiron } = basicKillsApeironWithShot('epinephrine-declined');

    const declined = game.performAction('combatDeclineEpinephrine', rebel, {});
    expect(declined.success, declined.error).toBe(true);

    expect(apeiron.parent).toBe(game.mercDiscard);
  });

  it('lands the rest of the attack before asking for the shot, and does not replay the round (#92)', () => {
    const { game, rebel, sector, dice } = basicAttacks('epinephrine-after-whole-attack');
    const dictator = game.dictatorPlayer;
    const basic = rebel.primarySquad.first(CombatantModel, c => c.combatantId === 'basic')!;
    basic.putInto(dictator.primarySquad);
    dictator.primarySquad.sectorId = sector.sectorId;
    // The Uzi's extra target lets Basic declare both the MERC and the militia.
    basic.equip(game.first(Equipment, e => e.equipmentId === 'uzi')!);
    const apeiron = game.first(CombatantModel, c => c.combatantId === 'apeiron')!;
    apeiron.putInto(rebel.primarySquad);
    apeiron.equip(game.first(Equipment, e => e.equipmentId === 'epinephrine-shot')!);
    apeiron.damage = apeiron.maxHealth - 1;
    sector.addRebelMilitia(`${rebel.seat}`, 1);

    executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true });
    const pending = game.activeCombat?.pendingHitAllocation;
    expect(pending?.attackerName).toBe('Basic');
    const mercId = pending!.validTargets.find(t => t.isMerc)!.id;
    const militiaId = pending!.validTargets.find(t => !t.isMerc)!.id;
    dice.show(1);
    // MERC first, so the kill that asks for the shot comes before the militia's hit.
    const allocated = game.performAction('combatAllocateHits', dictator, {
      allocations: [`${mercId}::0`, `${militiaId}::0`],
    });
    expect(allocated.success, allocated.error).toBe(true);

    expect(game.activeCombat?.pendingEpinephrine?.dyingCombatantName).toBe('Apeiron');
    expect(sector.getRebelMilitia(`${rebel.seat}`), 'the militia\'s hit lands before the pause').toBe(0);

    expect(game.performAction('combatUseEpinephrine', rebel, { saverMerc: apeiron }).success).toBe(true);
    executeCombat(game, sector, rebel);

    expect(basicRollLines(game), 'Basic already attacked this round').toEqual(['Basic rolls [6, 6] - 2 hit(s)']);
    expect(apeiron.health).toBe(1);
  });

  it('lets a human dictator save his MERC with an Epinephrine Shot in combat (#92)', () => {
    const { game, rebel, sector, dice } = basicAttacks('dictator-epinephrine');
    const dictator = game.dictatorPlayer;
    const apeiron = game.mercDeck.first(CombatantModel, c => c.combatantId === 'apeiron')!;
    apeiron.putInto(dictator.primarySquad);
    dictator.primarySquad.sectorId = sector.sectorId;
    apeiron.equip(game.first(Equipment, e => e.equipmentId === 'epinephrine-shot')!);
    apeiron.damage = apeiron.maxHealth - 1;

    executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true });
    const pending = game.activeCombat?.pendingHitAllocation;
    expect(pending?.attackerName).toBe('Basic');
    dice.show(1);
    const allocated = game.performAction('combatAllocateHits', rebel, {
      allocations: [`${pending!.validTargets[0].id}::0`],
    });
    expect(allocated.success, allocated.error).toBe(true);

    expect(game.activeCombat?.pendingEpinephrine?.dyingCombatantName, 'the dictator is offered the shot').toBe('Apeiron');
    const saved = game.performAction('combatUseEpinephrine', dictator, { saverMerc: apeiron });
    expect(saved.success, saved.error).toBe(true);
    executeCombat(game, sector, rebel);

    expect(apeiron.isDead).toBe(false);
    expect(apeiron.health).toBe(1);
  });

  it('does not hand the rebels the base while the dictator decides on his last MERC\'s shot (#92)', () => {
    const { game, rebel, sector, dice } = basicAttacks('dictator-epinephrine-at-base');
    const dictator = game.dictatorPlayer;
    // The base is revealed and the Dictator is away, so this MERC is all that holds it.
    dictator.baseRevealed = true;
    dictator.baseSectorId = sector.sectorId;
    const apeiron = game.mercDeck.first(CombatantModel, c => c.combatantId === 'apeiron')!;
    apeiron.putInto(dictator.primarySquad);
    dictator.primarySquad.sectorId = sector.sectorId;
    apeiron.equip(game.first(Equipment, e => e.equipmentId === 'epinephrine-shot')!);
    apeiron.damage = apeiron.maxHealth - 1;

    executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true });
    const pending = game.activeCombat?.pendingHitAllocation;
    expect(pending?.attackerName).toBe('Basic');
    dice.show(1);
    const allocated = game.performAction('combatAllocateHits', rebel, {
      allocations: [`${pending!.validTargets[0].id}::0`],
    });
    expect(allocated.success, allocated.error).toBe(true);

    expect(game.activeCombat?.pendingEpinephrine?.dyingCombatantName).toBe('Apeiron');
    expect(game.isFinished(), 'the base falls only if the dictator lets Apeiron die').toBe(false);
  });
});

describe('resuming combat after a militia batch allocates hits', () => {
  it('does not keep the spent allocation in the state saved at the next pause (#91)', () => {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'militia-allocate-then-pause',
    }).game;
    const rebel = game.rebelPlayers[0];
    const dictator = game.dictatorPlayer;
    const sector = game.gameMap.getAllSectors()[0];
    game.random = riggedDice().random;
    // Teresa acts last (initiative 0) and has no ability that changes the order.
    game.mercDeck.first(CombatantModel, c => c.combatantId === 'teresa')!.putInto(rebel.primarySquad);
    rebel.primarySquad.sectorId = sector.sectorId;
    sector.addRebelMilitia(`${rebel.seat}`, 3);
    game.mercDeck.first(CombatantModel, c => c.combatantId === 'apeiron')!.putInto(dictator.primarySquad);
    dictator.primarySquad.sectorId = sector.sectorId;
    sector.addDictatorMilitia(1);

    executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true });
    // The dictator's militia kills a rebel militia, leaving two to split their hits over Apeiron and the militia.
    const militiaTarget = game.activeCombat!.pendingTargetSelection!.validTargets.find(t => t.isMilitia)!;
    expect(game.performAction('combatSelectTarget', dictator, { targets: [militiaTarget.id] }).success).toBe(true);
    const pending = game.activeCombat?.pendingHitAllocation;
    expect(pending?.attackerName).toBe('Militia x2');
    const result = game.performAction('combatAllocateHits', rebel, {
      allocations: pending!.validTargets.map(t => `${t.id}::0`),
    });
    expect(result.success, result.error).toBe(true);

    expect(game.activeCombat?.pendingTargetSelection?.attackerName, 'Apeiron should pause to pick a target').toBe('Apeiron');
    const saved = [...(game.activeCombat!.selectedTargets?.keys() ?? [])];
    expect(saved.filter(key => key.startsWith('allocation:'))).toEqual([]);
  });
});

describe('Wolverine\'s sixes when hits are allocated automatically', () => {
  it('spend each six on a living enemy he did not declare', () => {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'wolverine-sixes',
    }).game;
    const rebel = game.rebelPlayers[0];
    const sector = game.gameMap.getAllSectors()[0];
    const wolverine = game.mercDeck.first(CombatantModel, c => c.combatantId === 'wolverine')!;
    wolverine.putInto(rebel.primarySquad);
    rebel.primarySquad.sectorId = sector.sectorId;
    sector.addDictatorMilitia(4);
    game.random = riggedDice().random;

    // Two dice, both 6, one declared target: each round the second six must find a living
    // militia, skipping the dead, or the survivors shoot Wolverine down.
    executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true, interactive: false });

    expect(sector.dictatorMilitia).toBe(0);
    expect(wolverine.isDead).toBe(false);
  });

  it('spend only his sixes on enemies he did not declare (#104)', () => {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'wolverine-bot-sixes-cap',
    }).game;
    const rebel = game.rebelPlayers[0];
    const sector = game.gameMap.getAllSectors()[0];
    const wolverine = game.mercDeck.first(CombatantModel, c => c.combatantId === 'wolverine')!;
    wolverine.putInto(rebel.primarySquad);
    wolverine.equip(game.first(Equipment, e => e.equipmentId === '9mm-handgun')!);
    rebel.primarySquad.sectorId = sector.sectorId;
    const apeiron = game.mercDeck.first(CombatantModel, c => c.combatantId === 'apeiron')!;
    apeiron.putInto(game.dictatorPlayer.primarySquad);
    game.dictatorPlayer.primarySquad.sectorId = sector.sectorId;
    sector.addDictatorMilitia(1);
    // Wolverine acts first and rolls [6, 5, 4]; every later die misses.
    const faces = [6, 5, 4];
    const random = (() => ((faces.shift() ?? 1) - 0.5) / 6) as GameRandom;
    random.getState = () => '';
    random.setState = () => {};
    game.random = random;

    executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true, interactive: false });

    expect(sector.dictatorMilitia, 'the declared militia takes the first hit').toBe(0);
    expect(apeiron.damage, 'Apeiron takes only the six').toBe(1);
  });
});

describe('Wolverine\'s sixes when a human allocates the hits', () => {
  /** Human Wolverine with an Uzi (two targets) against Apeiron and two militia, on dice showing 6. */
  function wolverineAttacks(seed: string) {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed,
    }).game;
    const rebel = game.rebelPlayers[0];
    const sector = game.gameMap.getAllSectors()[0];
    const wolverine = game.mercDeck.first(CombatantModel, c => c.combatantId === 'wolverine')!;
    wolverine.putInto(rebel.primarySquad);
    wolverine.equip(game.first(Equipment, e => e.equipmentId === 'uzi')!);
    rebel.primarySquad.sectorId = sector.sectorId;
    const apeiron = game.mercDeck.first(CombatantModel, c => c.combatantId === 'apeiron')!;
    apeiron.putInto(game.dictatorPlayer.primarySquad);
    game.dictatorPlayer.primarySquad.sectorId = sector.sectorId;
    sector.addDictatorMilitia(2);
    game.random = riggedDice().random;
    return { game, rebel, sector, apeiron };
  }

  it('may spend a six on an enemy he did not declare (#91)', () => {
    const { game, rebel, sector, apeiron } = wolverineAttacks('wolverine-human-sixes');

    executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true });
    const selection = game.activeCombat?.pendingTargetSelection;
    expect(selection?.attackerName).toBe('Wolverine');
    const declaredMilitia = selection!.validTargets.find(t => t.isMilitia)!;
    expect(game.performAction('combatSelectTarget', rebel, { targets: [apeiron.id, declaredMilitia.id].map(String) }).success).toBe(true);

    const pending = game.activeCombat?.pendingHitAllocation;
    expect(pending?.attackerName).toBe('Wolverine');
    expect(pending!.validTargets.map(t => t.name).sort(), 'the undeclared militia should be offered for the sixes')
      .toEqual(['Apeiron', 'Militia', 'Militia']);
    const bonus = pending!.validTargets.filter(t => !t.declared);
    expect(bonus.map(t => t.name)).toEqual(['Militia']);

    // One six on the undeclared militia, one on the declared one, the rest on Apeiron.
    const apeironId = pending!.validTargets.find(t => t.isMerc)!.id;
    const allocations = [`${bonus[0].id}::0`, `${declaredMilitia.id}::0`];
    for (let i = 0; i < pending!.hits - 2; i++) allocations.push(`${apeironId}::${i}`);
    const result = game.performAction('combatAllocateHits', rebel, { allocations });
    expect(result.success, result.error).toBe(true);

    expect(sector.dictatorMilitia, 'both militia should be dead').toBe(0);
  });

  it('offers his sixes only enemies he could have declared, so Runde stays targeted last (#91)', () => {
    const { game, rebel, sector, apeiron } = wolverineAttacks('wolverine-human-sixes-runde');
    const runde = game.mercDeck.first(CombatantModel, c => c.combatantId === 'runde')!;
    runde.putInto(game.dictatorPlayer.primarySquad);

    executeCombat(game, sector, rebel, { attackingPlayerIsRebel: true });
    const selection = game.activeCombat!.pendingTargetSelection!;
    const declaredMilitia = selection.validTargets.find(t => t.isMilitia)!;
    expect(game.performAction('combatSelectTarget', rebel, { targets: [apeiron.id, declaredMilitia.id].map(String) }).success).toBe(true);

    const pending = game.activeCombat?.pendingHitAllocation;
    expect(pending?.attackerName).toBe('Wolverine');
    expect(pending!.validTargets.filter(t => !t.declared).map(t => t.name)).toEqual(['Militia']);
  });
});
