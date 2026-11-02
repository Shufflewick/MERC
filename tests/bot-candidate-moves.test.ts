import { describe, it, expect } from 'vitest';
import { enumerateLegalMoves } from 'boardsmith';
import { mercBot } from '../src/rules/bot.js';
import { castroGameAtDayTwo } from './helpers/day-two.js';
import { Equipment } from '../src/rules/elements.js';

/**
 * Free moves the bot searches (#90): it may break a MERC off into a new squad,
 * but never merge squads back or view a stash, which would let it keep the
 * turn forever.
 */
describe('bot free moves (#90)', () => {
  const searched = (runner: ReturnType<typeof castroGameAtDayTwo>, seat: number) =>
    mercBot.candidateMoves!(runner.game, seat, () => enumerateLegalMoves(runner.game, seat))
      .filter((move) => move.action === 'assignToSquad')
      .map((move) => `${move.args.combatantName} -> ${move.args.targetSquad}`);

  it('lets the bot rebel break a MERC off into a new squad', () => {
    const runner = castroGameAtDayTwo(1, 2);

    expect(searched(runner, 2)).toEqual(['Basic -> Create Secondary Squad', 'Haarg -> Create Secondary Squad']);
  });

  it('does not let the bot rebel merge the squads back', () => {
    const runner = castroGameAtDayTwo(1, 2);
    expect(runner.performAction('assignToSquad', 2, { combatantName: 'Basic', targetSquad: 'Create Secondary Squad' }).success).toBe(true);
    expect(enumerateLegalMoves(runner.game, 2).some((move) => move.action === 'assignToSquad')).toBe(true);

    expect(searched(runner, 2)).toEqual([]);
  });

  it('does not let the bot Dictator move a lone MERC into a new squad, which the next move could undo', () => {
    const runner = castroGameAtDayTwo(2, 2);
    // Tack is the Dictator's only MERC, alone in the primary squad; the Dictator's rules offer this move in his MERC actions.
    const relabel = { action: 'assignToSquad', args: { combatantName: 'Tack', targetSquad: 'Create Secondary Squad' } };

    expect(mercBot.candidateMoves!(runner.game, 2, () => [relabel])).toEqual([]);
  });

  it('searches every move but viewing a stash, which changes nothing', () => {
    const runner = castroGameAtDayTwo(1, 2);
    const explore = enumerateLegalMoves(runner.game, 2).find((move) => move.action === 'explore')!;
    expect(runner.performAction('explore', 2, explore.args).success).toBe(true);
    expect(runner.performAction('collectEquipment', 2, {}).success).toBe(true);
    expect(enumerateLegalMoves(runner.game, 2).some((move) => move.action === 'viewStash')).toBe(true);

    const moves = enumerateLegalMoves(runner.game, 2);
    expect(mercBot.candidateMoves!(runner.game, 2, () => moves)).toEqual(moves.filter((move) => move.action !== 'viewStash'));
  });

  it('searches stash picks into an empty slot but not ones that swap out equipment (#103)', () => {
    const runner = castroGameAtDayTwo(1, 2);
    const explore = enumerateLegalMoves(runner.game, 2).find((move) => move.action === 'explore')!;
    expect(runner.performAction('explore', 2, explore.args).success).toBe(true);
    // The bot sees an element arg as its id; Basic carries only a weapon.
    const picks = enumerateLegalMoves(runner.game, 2)
      .filter((move) => move.action === 'collectEquipment')
      .map((move) => ({ action: move.action, args: { equipment: (move.args.equipment as Equipment).id } }));
    const name = (id: unknown) => (runner.game.getElementById(id as number) as Equipment).equipmentName;
    expect(picks.map((move) => name(move.args.equipment))).toEqual(
      ['M16', '50 Caliber Rifle with FLIR Scope', 'Full Body Armor', 'Repair Kit', 'Mortar', 'Grenade']);

    expect(mercBot.candidateMoves!(runner.game, 2, () => picks).map((move) => name(move.args.equipment)))
      .toEqual(['Full Body Armor', 'Repair Kit', 'Mortar', 'Grenade']);
  });
});
