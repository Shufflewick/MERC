import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel } from '../src/rules/elements.js';

/**
 * Doc: "Heals all MERCs in his squad as a free action outside of combat."
 * Damage from land mines, Tainted Water, artillery and Pinochet's spread never
 * leads to a fight, so the post-combat auto-heal alone never reaches it.
 */
describe('Doc out-of-combat heal', () => {
  function setup(seed: string) {
    const game = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed,
    }).game;
    const rebel = game.rebelPlayers[0];
    const doc = game.first(CombatantModel, m => m.isMerc && m.combatantId === 'doc');
    return { game, rebel, doc };
  }

  it('is offered when a squadmate is wounded, and heals the squad', () => {
    const { game, rebel, doc } = setup('doc-heal');
    if (!doc) {
      console.log('Doc not in deck, skipping');
      return;
    }

    doc.putInto(rebel.primarySquad);
    doc.damage = 0;

    const patient = game.first(CombatantModel, m => m.isMerc && m.combatantId !== 'doc' && !m.isDead)!;
    patient.putInto(rebel.primarySquad);
    patient.damage = 1;

    const names = game.getAvailableActions(rebel).map(a => a.name);
    expect(names).toContain('docHeal');

    const result = game.performAction('docHeal', rebel, {});
    expect(result.success).toBe(true);

    expect(patient.damage).toBe(0);
  });

  it('is not offered when nobody in the squad is wounded', () => {
    const { game, rebel, doc } = setup('doc-heal-idle');
    if (!doc) return;

    doc.putInto(rebel.primarySquad);
    doc.damage = 0;

    expect(game.getAvailableActions(rebel).map(a => a.name)).not.toContain('docHeal');
  });
});
