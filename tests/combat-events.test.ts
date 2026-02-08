import { describe, it, expect, beforeEach } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame, RebelPlayer } from '../src/rules/game.js';
import { CombatantModel, Sector } from '../src/rules/elements.js';
import { executeCombat, getCombatants, type Combatant } from '../src/rules/combat.js';

/**
 * Combat Event Pipeline Tests
 *
 * Verifies the combat event pipeline built in Phases 43-45 works end-to-end.
 * Tests confirm that combat-panel snapshots, animation events, and decision
 * context work correctly so the CombatPanel UI contract is guaranteed by tests.
 *
 * All tests call executeCombat() directly with crafted game state, then inspect
 * game.pendingAnimationEvents for correct event types, data payloads, and
 * snapshot contents.
 */
describe('Combat Event Pipeline', () => {
  let game: MERCGame;
  let rebel: RebelPlayer;
  let sector: Sector;
  let merc: CombatantModel;

  beforeEach(() => {
    const testGame = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'combat-events-test',
    });
    game = testGame.game;
    rebel = game.rebelPlayers[0];
    sector = game.gameMap.getAllSectors()[0];

    // Place a merc in rebel's primary squad
    merc = game.mercDeck.first(CombatantModel, c => c.isMerc)!;
    merc.putInto(rebel.primarySquad);
    rebel.primarySquad.sectorId = sector.sectorId;

    // Add militia so there's something to fight
    sector.addDictatorMilitia(3);
  });

  // ===========================================================================
  // Test Group 1: Combat-Panel Snapshot Contents (Success Criteria 1)
  // ===========================================================================
  describe('Combat-Panel Snapshot Contents', () => {
    it('emits combat-panel snapshot at combat start', () => {
      executeCombat(game, sector, rebel, { interactive: false });

      const events = game.pendingAnimationEvents;
      const panelEvents = events.filter(e => e.type === 'combat-panel');

      // At least start snapshot + end snapshot
      expect(panelEvents.length).toBeGreaterThanOrEqual(2);

      // First snapshot should have all required top-level fields
      const firstSnapshot = panelEvents[0].data as Record<string, unknown>;
      expect(firstSnapshot.sectorId).toBe(sector.sectorId);
      expect(firstSnapshot.sectorName).toBeDefined();
      expect(firstSnapshot.round).toBeDefined();
      expect(typeof firstSnapshot.round).toBe('number');
      expect(firstSnapshot.rebelCombatants).toBeDefined();
      expect(Array.isArray(firstSnapshot.rebelCombatants)).toBe(true);
      expect(firstSnapshot.dictatorCombatants).toBeDefined();
      expect(Array.isArray(firstSnapshot.dictatorCombatants)).toBe(true);
    });

    it('snapshot rebel combatants have correct fields', () => {
      executeCombat(game, sector, rebel, { interactive: false });

      const panelEvents = game.pendingAnimationEvents.filter(e => e.type === 'combat-panel');
      const firstSnapshot = panelEvents[0].data as Record<string, unknown>;
      const rebelCombatants = firstSnapshot.rebelCombatants as Array<Record<string, unknown>>;

      expect(rebelCombatants.length).toBeGreaterThanOrEqual(1);

      const rebelUnit = rebelCombatants[0];
      expect(typeof rebelUnit.id).toBe('string');
      expect(typeof rebelUnit.name).toBe('string');
      expect(typeof rebelUnit.image).toBe('string');
      expect(typeof rebelUnit.health).toBe('number');
      expect(typeof rebelUnit.maxHealth).toBe('number');
      expect(rebelUnit.isMerc).toBe(true);
      expect(rebelUnit.isMilitia).toBe(false);
      expect(rebelUnit.isAttackDog).toBe(false);
      expect(rebelUnit.isDictator).toBe(false);
      expect(typeof rebelUnit.combatantId).toBe('string');
      expect(typeof rebelUnit.playerColor).toBe('string');
    });

    it('snapshot dictator combatants have correct fields', () => {
      executeCombat(game, sector, rebel, { interactive: false });

      const panelEvents = game.pendingAnimationEvents.filter(e => e.type === 'combat-panel');
      const firstSnapshot = panelEvents[0].data as Record<string, unknown>;
      const dictatorCombatants = firstSnapshot.dictatorCombatants as Array<Record<string, unknown>>;

      // Should match militia count
      expect(dictatorCombatants.length).toBe(3);

      const militia = dictatorCombatants[0];
      expect(militia.isMilitia).toBe(true);
      expect(militia.isDictatorSide).toBe(true);
      expect(militia.isMerc).toBe(false);
      expect(militia.isDictator).toBe(false);
      expect(militia.isAttackDog).toBe(false);
      expect(typeof militia.health).toBe('number');
      expect(typeof militia.maxHealth).toBe('number');
    });

    it('snapshot casualties populated during combat', () => {
      executeCombat(game, sector, rebel, { interactive: false });

      const panelEvents = game.pendingAnimationEvents.filter(e => e.type === 'combat-panel');
      // Last combat-panel should have combatComplete: true
      const lastSnapshot = panelEvents[panelEvents.length - 1].data as Record<string, unknown>;
      expect(lastSnapshot.combatComplete).toBe(true);

      // Non-interactive combat runs to completion -- someone dies
      const rebelCasualties = lastSnapshot.rebelCasualties as Array<Record<string, unknown>>;
      const dictatorCasualties = lastSnapshot.dictatorCasualties as Array<Record<string, unknown>>;

      // At least one side must have casualties
      expect(rebelCasualties.length + dictatorCasualties.length).toBeGreaterThan(0);
    });

    it('multiple combat-panel events emitted throughout combat', () => {
      executeCombat(game, sector, rebel, { interactive: false });

      const panelEvents = game.pendingAnimationEvents.filter(e => e.type === 'combat-panel');

      // At least start snapshot + end snapshot
      expect(panelEvents.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ===========================================================================
  // Test Group 2: Animation Event Data (Success Criteria 3)
  // ===========================================================================
  describe('Animation Event Data', () => {
    it('combat-roll events carry dice data', () => {
      executeCombat(game, sector, rebel, { interactive: false });

      const rollEvents = game.pendingAnimationEvents.filter(e => e.type === 'combat-roll');

      expect(rollEvents.length).toBeGreaterThanOrEqual(1);

      // Verify all roll events have required fields
      for (const rollEvent of rollEvents) {
        const roll = rollEvent.data as Record<string, unknown>;
        expect(typeof roll.attackerName).toBe('string');
        expect(typeof roll.attackerId).toBe('string');
        expect('attackerImage' in roll).toBe(true);
        expect(Array.isArray(roll.diceRolls)).toBe(true);
        expect(typeof roll.hits).toBe('number');
        expect(typeof roll.hitThreshold).toBe('number');
        expect(Array.isArray(roll.targetNames)).toBe(true);
        expect(Array.isArray(roll.targetIds)).toBe(true);
      }
    });

    it('combat-damage events carry health data', () => {
      executeCombat(game, sector, rebel, { interactive: false });

      const damageEvents = game.pendingAnimationEvents.filter(e => e.type === 'combat-damage');

      // Damage events should exist -- 1 merc vs 3 militia with seed produces hits
      expect(damageEvents.length).toBeGreaterThanOrEqual(1);

      const damage = damageEvents[0].data as Record<string, unknown>;
      expect(typeof damage.attackerName).toBe('string');
      expect(typeof damage.attackerId).toBe('string');
      expect(typeof damage.targetName).toBe('string');
      expect(typeof damage.targetId).toBe('string');
      expect(typeof damage.targetImage).toBe('string');
      expect(typeof damage.damage).toBe('number');
      expect(typeof damage.healthBefore).toBe('number');
      expect(typeof damage.healthAfter).toBe('number');

      // Health math invariant: healthAfter <= healthBefore, damage = diff
      expect(damage.healthAfter as number).toBeLessThanOrEqual(damage.healthBefore as number);
      expect(damage.damage).toBe((damage.healthBefore as number) - (damage.healthAfter as number));
    });

    it('combat-death events carry target data', () => {
      executeCombat(game, sector, rebel, { interactive: false });

      const deathEvents = game.pendingAnimationEvents.filter(e => e.type === 'combat-death');

      // Non-interactive combat to completion -- at least one side wiped out
      expect(deathEvents.length).toBeGreaterThanOrEqual(1);

      const death = deathEvents[0].data as Record<string, unknown>;
      expect(typeof death.targetName).toBe('string');
      expect(typeof death.targetId).toBe('string');
      expect(typeof death.targetImage).toBe('string');
    });

    it('combat-end event emitted when combat finishes', () => {
      executeCombat(game, sector, rebel, { interactive: false });

      const endEvents = game.pendingAnimationEvents.filter(e => e.type === 'combat-end');

      expect(endEvents.length).toBe(1);

      const endData = endEvents[0].data as Record<string, unknown>;
      expect(typeof endData.rebelVictory).toBe('boolean');
      expect(typeof endData.dictatorVictory).toBe('boolean');

      // Exactly one side wins in non-interactive combat (XOR)
      expect(endData.rebelVictory !== endData.dictatorVictory).toBe(true);
    });

    it('combat-round-start events carry round number', () => {
      executeCombat(game, sector, rebel, { interactive: false });

      const roundStartEvents = game.pendingAnimationEvents.filter(e => e.type === 'combat-round-start');

      expect(roundStartEvents.length).toBeGreaterThanOrEqual(1);

      const firstRoundStart = roundStartEvents[0].data as Record<string, unknown>;
      expect(typeof firstRoundStart.round).toBe('number');
      expect(firstRoundStart.round as number).toBeGreaterThanOrEqual(1);
    });

    it('events are emitted in logical order', () => {
      executeCombat(game, sector, rebel, { interactive: false });

      const events = game.pendingAnimationEvents;

      // First event should be combat-panel (initial snapshot)
      expect(events[0].type).toBe('combat-panel');

      // Last event should be combat-end
      expect(events[events.length - 1].type).toBe('combat-end');

      // Second-to-last should be combat-panel (final snapshot with combatComplete: true)
      expect(events[events.length - 2].type).toBe('combat-panel');
    });
  });

  // ===========================================================================
  // Test Group 3: Combat Lifecycle (Success Criteria 5)
  // ===========================================================================
  describe('Combat Lifecycle', () => {
    it('combat-end event matches outcome', () => {
      const outcome = executeCombat(game, sector, rebel, { interactive: false });

      const endEvent = game.pendingAnimationEvents.find(e => e.type === 'combat-end');
      expect(endEvent).toBeDefined();

      const endData = endEvent!.data as Record<string, unknown>;
      expect(endData.rebelVictory).toBe(outcome.rebelVictory);
      expect(endData.dictatorVictory).toBe(outcome.dictatorVictory);
    });

    it('final combat-panel snapshot has combatComplete: true', () => {
      executeCombat(game, sector, rebel, { interactive: false });

      const panelEvents = game.pendingAnimationEvents.filter(e => e.type === 'combat-panel');
      const lastPanel = panelEvents[panelEvents.length - 1].data as Record<string, unknown>;

      expect(lastPanel.combatComplete).toBe(true);
    });

    it('non-interactive combat does not leave activeCombat pending', () => {
      const outcome = executeCombat(game, sector, rebel, { interactive: false });

      expect(outcome.combatPending).toBe(false);
    });
  });
});
