import { describe, it, expect } from 'vitest';
import { GameRunner } from 'boardsmith/runtime';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Equipment, Sector } from '../src/rules/elements.js';
import { isLandMine } from '../src/rules/equipment-effects.js';
import { autoResolveArgs, getCurrentAction } from './helpers/auto-play.js';

/**
 * Pol Pot's card: "If you lose this battle hire 1 random MERC."
 * Militia wiped out by a land mine on arrival never fight, so there is no battle to lose (#131).
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
      playerConfigs: [{ isBot: false }, { role: true, isBot }],
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

describe('Pol Pot militia killed by a land mine before any fight', () => {
  it('human Pol Pot is not offered a MERC', () => {
    const runner = polpotGame(false);
    const game = runner.game;
    playUntil(runner, t => t.currentPlayer === DICTATOR && t.available.includes('polpotBonusMilitia'));
    mineRebelSectors(game);
    const [sector] = rebelSectors(game);

    const result = runner.performAction('polpotBonusMilitia', DICTATOR, { targetSector: sector.sectorName });
    expect(result.success, result.error).toBe(true);

    expect(sector.dictatorMilitia, 'the mine should kill the militia that arrived').toBe(0);
    const next = getCurrentAction(game.getFlowState());
    expect(next?.available ?? []).not.toContain('polpotBonusHire');
  });

  it('bot Pol Pot does not hire a MERC', () => {
    const runner = polpotGame(true);
    const game = runner.game;
    playUntil(runner, t => game.currentDay >= 2 && t.currentPlayer !== DICTATOR && t.available.includes('endTurn'));
    mineRebelSectors(game);
    const mercsBefore = dictatorMercCount(game);
    const placedCount = () => (game.messages as { text: string }[]).filter(m => m.text.startsWith('Pol Pot placed')).length;
    const placedBefore = placedCount();

    playUntil(runner, () => placedCount() > placedBefore, true);

    expect(rebelSectors(game).every(s => s.dictatorMilitia === 0), 'the mines should kill the militia that arrived').toBe(true);
    expect(dictatorMercCount(game)).toBe(mercsBefore);
  });
});
