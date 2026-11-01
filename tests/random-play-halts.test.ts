import { describe, it, expect } from 'vitest';
import { GameRunner } from 'boardsmith/runtime';
import { enumerateLegalMoves } from 'boardsmith';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Sector } from '../src/rules/elements.js';
import { autoResolveArgs, getCurrentAction } from './helpers/auto-play.js';

/**
 * Random play must never halt outside combat (issue #74): every move the
 * engine offers must be accepted, and no flow loop may spin to its cap.
 */

function startRunner(rebels: number, seed: string, dictator = 'castro'): GameRunner<MERCGame> {
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
      seed,
      dictatorIsBot: false,
      dictatorChoice: dictator,
      playerConfigs,
    } as never,
  });
  runner.start();
  return runner;
}

/** Play first legal moves until `actionName` is offered. */
function playUntilOffered(runner: GameRunner<MERCGame>, actionName: string): number {
  const game = runner.game;
  for (let moves = 0; moves < 200; moves++) {
    const current = getCurrentAction(game.getFlowState());
    if (!current) throw new Error(`The flow stopped before offering ${actionName}.`);
    if (current.available.includes(actionName)) return current.currentPlayer;
    const played = current.available.some(name => {
      const args = autoResolveArgs(game, name, current.currentPlayer);
      return args !== null && runner.performAction(name, current.currentPlayer, args).success;
    });
    if (!played) throw new Error(`No legal move for seat ${current.currentPlayer} among ${current.available.join(', ')}.`);
  }
  throw new Error(`${actionName} was not offered within 200 moves.`);
}

describe('dictator extra militia (#74)', () => {
  it('filling one sector leaves the rest of the extra militia placeable elsewhere', () => {
    const runner = startRunner(3, 'extra-militia-fill');
    const game = runner.game;
    const seat = playUntilOffered(runner, 'dictatorPlaceExtraMilitia');

    const sector = game.gameMap.getAllSectors().find(s => s.dictatorMilitia > 0)!;
    const capacity = Sector.MAX_MILITIA_PER_SIDE - sector.dictatorMilitia;
    expect(capacity).toBeLessThan(game.setupConfig.dictatorStrength.extra);

    const filled = runner.performAction('dictatorPlaceExtraMilitia', seat, {
      targetSector: sector.sectorName, amount: `${capacity}`,
    });

    expect(filled.success).toBe(true);
    expect(sector.dictatorMilitia).toBe(Sector.MAX_MILITIA_PER_SIDE);
    expect(enumerateLegalMoves(game, seat).some(m => m.action === 'dictatorPlaceExtraMilitia')).toBe(true);
  });
});

describe('rebel landing with Teresa (#74)', () => {
  it('a rebel who hires Teresa may skip the third hire, and the landing ends', () => {
    const runner = startRunner(1, 'teresa-skip-third');
    const game = runner.game;
    const rebel = game.rebelPlayers[0];
    const seat = playUntilOffered(runner, 'placeLanding');

    const teresa = game.first(CombatantModel, m => m.combatantId === 'teresa')!;
    if (!rebel.mercOffer.all(CombatantModel).includes(teresa)) {
      rebel.mercOffer.first(CombatantModel)!.putInto(game.mercDeck);
      teresa.putInto(rebel.mercOffer);
    }
    const [other] = rebel.mercOffer.all(CombatantModel).filter(m => m !== teresa);

    const play = (action: string, args: Record<string, unknown>) => runner.performAction(action, seat, args);
    expect(play('placeLanding', autoResolveArgs(game, 'placeLanding', seat)!).success).toBe(true);
    expect(play('hireFirstMerc', { merc: 'Teresa', equipmentType: 'Weapon' }).success).toBe(true);
    expect(play('hireSecondMerc', { merc: other.combatantName, equipmentType: 'Weapon' }).success).toBe(true);
    const skipped = play('hireThirdMerc', { merc: 'Skip (no third hire)', equipmentType: 'N/A' });

    expect(skipped.success).toBe(true);
    expect(rebel.team).toHaveLength(2);
    expect(getCurrentAction(game.getFlowState())?.currentPlayer).toBe(game.dictatorPlayer.seat);
  });
});

describe("Hagness's draw, pick and give (#74)", () => {
  function rebelWithHagnessOnDayTwo() {
    const runner = startRunner(1, 'hagness-chain');
    const game = runner.game;
    const rebel = game.rebelPlayers[0];
    for (let moves = 0; ; moves++) {
      const current = getCurrentAction(game.getFlowState());
      if (game.currentDay >= 2 && current?.currentPlayer === rebel.seat) break;
      if (!current || moves > 200) throw new Error('The rebel never got a Day 2 turn.');
      current.available.some(name => {
        const args = autoResolveArgs(game, name, current.currentPlayer);
        return args !== null && runner.performAction(name, current.currentPlayer, args).success;
      });
    }
    const hagness = game.first(CombatantModel, m => m.combatantId === 'hagness')!;
    hagness.putInto(rebel.primarySquad);
    for (const merc of rebel.team) merc.actionsRemaining = 0;
    hagness.actionsRemaining = 1;
    game.refreshAwaitingActions();
    const offered = () => [...new Set(enumerateLegalMoves(game, rebel.seat).map(m => m.action))];
    return { runner, game, rebel, offered };
  }

  it('after drawing, the rebel picks before doing anything else, and gives even with no actions left', () => {
    const { runner, rebel, offered } = rebelWithHagnessOnDayTwo();

    expect(runner.performAction('hagnessDrawType', rebel.seat, { equipmentType: 'Weapon' }).success).toBe(true);
    expect(offered()).toEqual(['hagnessSelectFromDrawn']);

    const [pick] = enumerateLegalMoves(runner.game, rebel.seat).filter(m => m.action === 'hagnessSelectFromDrawn');
    expect(runner.performAction('hagnessSelectFromDrawn', rebel.seat, pick.args).success).toBe(true);
    expect(offered()).toEqual(['hagnessGiveEquipment']);
  });
});
