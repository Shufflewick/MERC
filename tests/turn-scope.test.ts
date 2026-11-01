import { describe, it, expect } from 'vitest';
import { buildActionArgs, enumerateLegalMoves } from 'boardsmith';
import { GameRunner } from 'boardsmith/runtime';
import { createHeadlessSession } from 'boardsmith/testing';
import { gameDefinition } from '../src/rules/index.js';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Equipment } from '../src/rules/elements.js';
import { autoResolveArgs, getCurrentAction } from './helpers/auto-play.js';

const DICTATORS = ['castro', 'kim', 'gadafi', 'hitler', 'hussein', 'mao', 'mussolini', 'noriega', 'pinochet', 'polpot', 'stalin'];

/** Seeded random legal play by human seats, returning every step that re-prompted a seat without saying whether its turn continues. */
function undeclaredStepsInRandomPlay(dictator: string, rebels: number, seed: number): string[] {
  const playerConfigs = [
    ...Array.from({ length: rebels }, () => ({ color: '#e74c3c', isDictator: false, isBot: false })),
    { color: '#95a5a6', isDictator: true, isBot: false },
  ];
  const runner = new GameRunner<MERCGame>({
    GameClass: MERCGame,
    gameType: 'merc',
    gameOptions: {
      playerCount: rebels + 1,
      playerNames: playerConfigs.map((_, i) => `P${i + 1}`),
      seed: `i109-${dictator}-${seed}`,
      dictatorIsBot: false,
      dictatorChoice: dictator,
      playerConfigs,
    } as never,
  });
  runner.start();
  let state = seed + 1;
  const pick = (n: number) => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state % n; };
  const undeclared = new Set<string>();
  for (let i = 0; i < 1500; i++) {
    const flow = runner.game.getFlowState();
    if (flow?.turnScopeUndeclared) undeclared.add(flow.turnScopeUndeclared);
    const current = getCurrentAction(flow);
    if (!current) break;
    const moves = enumerateLegalMoves(runner.game, current.currentPlayer, { maxPerAction: 3 });
    const move = moves[pick(moves.length)];
    if (!runner.performAction(move.action, current.currentPlayer, move.args).success) break;
  }
  return [...undeclared];
}

/** A two-seat table played by first legal moves to the rebel's Day 2 turn, with `arrange` applied once the rebel has landed. */
async function rebelOnDayTwo(seed: string, arrange: (game: MERCGame) => void) {
  const REBEL = 1;
  const session = createHeadlessSession(gameDefinition, {
    playerCount: 2,
    seed,
  });
  await session.start();
  const act = async (seat: number, actionName: string, chosen?: Record<string, unknown>) => {
    const game = session.readGame();
    const args = chosen ?? autoResolveArgs(game, actionName, seat);
    expect(args, `${actionName} has legal args`).not.toBeNull();
    const wire = buildActionArgs(actionName, args!, game, seat, { format: 'wire' });
    const result = await session.send(seat, { type: 'action', actionName, player: seat, args: wire });
    expect(result.success, result.error).toBe(true);
  };
  let arranged = false;
  for (;;) {
    const game = session.readGame();
    const current = getCurrentAction(game.getFlowState());
    expect(current, 'the game stopped before the rebel acted on Day 2').not.toBeNull();
    if (game.currentDay >= 2 && current!.currentPlayer === REBEL && current!.available.includes('move')) break;
    // Arranged before the rebels' step opens, since that step settles each seat's offers on entry.
    if (!arranged && current!.currentPlayer !== REBEL) {
      await session.arrange(arrange);
      arranged = true;
      continue;
    }
    const move = enumerateLegalMoves(game, current!.currentPlayer, { maxPerAction: 1 })[0];
    await act(current!.currentPlayer, move.action, move.args);
  }
  return { session, act, undo: () => session.send(REBEL, { type: 'undo', player: REBEL }), REBEL };
}

describe('turnScope', () => {
  it.each(DICTATORS)('declares every step that re-prompts a seat in random play against %s', (dictator) => {
    const undeclared = new Set([1, 2, 3].flatMap(rebels => undeclaredStepsInRandomPlay(dictator, rebels, rebels)));
    expect([...undeclared]).toEqual([]);
  });
});

describe('undo across hidden draws and dice', () => {
  it('does not let a rebel undo a Hagness draw', async () => {
    const { act, undo, REBEL } = await rebelOnDayTwo('i109-hagness', game => {
      const hagness = game.mercDeck.all(CombatantModel).find(m => m.combatantId === 'hagness')!;
      hagness.putInto(game.rebelPlayers[0].primarySquad);
      hagness.resetActions();
    });

    await act(REBEL, 'hagnessDrawType', { equipmentType: 'Weapon' });

    const result = await undo();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Cannot undo: hagnessDrawType is marked notUndoable.');
  });

  it('does not let a rebel undo a mortar shot that missed, which leaves the rebel in the same step', async () => {
    // Teresa has no combat of her own, so her mortar rolls few dice; this seed makes them all miss.
    const { session, act, undo, REBEL } = await rebelOnDayTwo('i109-mortar-80', game => {
      const rebel = game.rebelPlayers[0];
      const teresa = game.mercDeck.all(CombatantModel).find(m => m.combatantId === 'teresa')!;
      teresa.putInto(rebel.primarySquad);
      teresa.resetActions();
      teresa.equip(game.accessoriesDeck.all(Equipment).find(e => e.equipmentId === 'mortar')!);
      game.getAdjacentSectors(game.getSector(rebel.primarySquad.sectorId!)!)[0].addDictatorMilitia(1);
    });
    const target = autoResolveArgs(session.readGame(), 'mortar', REBEL);

    await act(REBEL, 'mortar', { ...target, unitId: 'Teresa' });
    expect(session.readGame().pendingMortarAttack ?? null, 'the seed\'s dice all miss, leaving nothing to allocate').toBeNull();

    const result = await undo();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Cannot undo: mortar is marked notUndoable.');
  });
});

/** A two-seat table in seeded random play, with `dictator` chosen, until the dictator is offered `offers` straight after taking `after`. */
async function dictatorReprompted(dictator: string, seed: string, after: string, offers: string) {
  const DICTATOR = 2;
  const session = createHeadlessSession(gameDefinition, { playerCount: 2, seed });
  await session.start();
  let state = 1;
  const pick = (n: number) => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state % n; };
  let last: string | undefined;
  for (;;) {
    const game = session.readGame();
    const current = getCurrentAction(game.getFlowState());
    expect(current, `the game stopped before ${dictator} was offered ${offers} after ${after}`).not.toBeNull();
    if (current!.available.includes(offers) && last === after) break;
    const moves = enumerateLegalMoves(game, current!.currentPlayer, { maxPerAction: 3 });
    const move = current!.available.includes('selectDictator')
      ? { action: 'selectDictator', args: { dictatorChoice: dictator } }
      : moves[pick(moves.length)];
    const wire = buildActionArgs(move.action, move.args, game, current!.currentPlayer, { format: 'wire' });
    const result = await session.send(current!.currentPlayer,
      { type: 'action', actionName: move.action, player: current!.currentPlayer, args: wire });
    expect(result.success, result.error).toBe(true);
    last = move.action;
  }
  return { session, undo: () => session.send(DICTATOR, { type: 'undo', player: DICTATOR }) };
}

describe('dictator ability undo', () => {
  it("undoes Noriega's converted militia placement back to the conversion, which hides and rolls nothing", async () => {
    const { session, undo } = await dictatorReprompted('Noriega', 'i109-noriega-a', 'noriegaConvertMilitia', 'noriegaPlaceMilitia');
    const result = await undo();
    expect(result.success, result.error).toBe(true);
    expect(session.readGame().getFlowState()?.availableActions).toContain('noriegaConvertMilitia');
  });

  it("undoes Mao's militia placement, which hides and rolls nothing", async () => {
    const { session, undo } = await dictatorReprompted('Mao', 'i109-mao-a', 'maoBonusMilitia', 'maoBonusMilitia');
    const before = session.readGame().pendingMaoMilitia?.remaining;
    const result = await undo();
    expect(result.success, result.error).toBe(true);
    expect(session.readGame().pendingMaoMilitia?.remaining).toBeGreaterThan(before!);
  });

  it("undoes Mussolini's militia spread back to his placement, which hides and rolls nothing", async () => {
    const { session, undo } = await dictatorReprompted('Mussolini', 'i109-mussolini-a', 'mussoliniBonusMilitia', 'mussoliniSpreadMilitia');
    const result = await undo();
    expect(result.success, result.error).toBe(true);
    expect(session.readGame().getFlowState()?.availableActions).toContain('mussoliniBonusMilitia');
  });
});
