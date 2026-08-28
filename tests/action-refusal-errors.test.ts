import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Equipment } from '../src/rules/elements.js';

/**
 * An action that refuses must say why, in `error`.
 *
 * BoardSmith's `ActionResult` carries two adjacent string fields and only one
 * of them decides anything. `error` is the refusal — it is what `FlowEngine`
 * and `GameRunner.performAction` read. `message` is a log line and stops
 * nothing. Every refusal in this game was written with `message`, so before
 * engine r28 each one reported a SUCCESS that happened to carry a sentence:
 * the flow advanced, the turn was consumed, and the thing the rules refused to
 * do simply did not happen. Random play reaches these in `dropEquipment`,
 * `combatSelectTarget`, `combatAllocateHits` and the Golem pre-combat steps.
 *
 * r28 refuses an errorless `{ success: false }` at the engine boundary, which
 * turns the silent bug into a loud one — but it replaces the author's sentence
 * with a generic "they did not say why". So the fix is not the engine's
 * fallback; it is naming the reason in the field that carries it.
 */
describe('a refused action tells the player why', () => {
  it('dropEquipment names the reason instead of refusing anonymously', () => {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'drop-equipment-refusal',
      expansionModes: ['A'],
    }).game;
    const rebel = game.rebelPlayers[0];
    game.currentDay = 2;

    const merc = game.first(CombatantModel, m => m.isMerc && !m.isDead)!;
    merc.damage = 0;
    merc.putInto(rebel.primarySquad);
    merc.resetActions();
    const weapon = game.first(Equipment, e => e.equipmentType === 'Weapon')!;
    merc.equip(weapon);

    // The squad is not on the map, so `dropEquipment` has nowhere to drop to.
    rebel.primarySquad.sectorId = undefined;

    const result = game.performAction('dropEquipment', rebel, {
      actingMerc: merc,
      equipment: weapon,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error).not.toMatch(/did not say why/);
    expect(result.error).toMatch(/sector/i);
  });
});

/**
 * The behavioural test above proves one path. This proves the whole class, and
 * is the part that keeps it fixed: a new action written with `message` on a
 * refusal fails here rather than shipping as a move that silently does nothing.
 *
 * The whole file is scanned, not just the `.execute()` bodies. `ActionResult`
 * is also built by helpers the callbacks return directly — that is exactly how
 * the two Golem refusals in `resumeAfterGolemChoice` escaped the first sweep —
 * and every `{ success: false }` written in this directory is an ActionResult.
 */
describe('no action refuses without naming an error', () => {
  const actionsDir = join(import.meta.dirname, '..', 'src', 'rules', 'actions');

  function refusalsMissingError(source: string, file: string): string[] {
    const lines = source.split('\n');
    const found: string[] = [];
    lines.forEach((line, index) => {
      if (!/success:\s*false/.test(line)) return;
      // A refusal may be written on one line or spread over several, so read
      // the object literal as a whole rather than the one line that names it.
      const literal = lines.slice(index, index + 6).join(' ');
      if (/\berror\s*:/.test(literal)) return;
      found.push(`${file}:${index + 1}  ${line.trim()}`);
    });
    return found;
  }

  it('every { success: false } an action can return carries an error', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(actionsDir).filter(f => f.endsWith('.ts'))) {
      offenders.push(...refusalsMissingError(readFileSync(join(actionsDir, file), 'utf-8'), file));
    }
    expect(
      offenders,
      `A refusal is reported with { success: false, error: 'why' }. 'message' is only a log line — ` +
        `the engine turns an errorless refusal into a generic "they did not say why".\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
