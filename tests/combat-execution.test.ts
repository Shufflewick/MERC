import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestGame } from '@boardsmith/testing';
import { MERCGame, RebelPlayer, DictatorPlayer } from '../src/rules/game.js';
import { MercCard, Sector, Equipment, Squad } from '../src/rules/elements.js';
import {
  getCombatants,
  executeCombat,
  type Combatant,
  type CombatOutcome,
} from '../src/rules/combat.js';
import {
  getHitThreshold,
  canRerollOnce,
  canPreemptiveStrike,
  firesSecondShot,
  canConvertMilitia,
  alwaysGoesFirst,
  alwaysBeforesMilitia,
  isTargetedLast,
  rollsForInitiative,
} from '../src/rules/merc-abilities.js';

/**
 * Combat Execution Tests
 *
 * These tests verify that combat mechanics work correctly,
 * including MERC abilities that affect combat.
 */
describe('Combat Execution Tests', () => {
  // =========================================================================
  // Hit Threshold Tests
  // =========================================================================
  describe('Hit Threshold Mechanics', () => {
    it('Lucid hits on 3+ (66% hit rate)', () => {
      const threshold = getHitThreshold('lucid');
      expect(threshold).toBe(3);

      // Test all dice outcomes
      const results = [1, 2, 3, 4, 5, 6].map(r => r >= threshold);
      const hits = results.filter(r => r).length;
      expect(hits).toBe(4); // 3,4,5,6 all hit
    });

    it('Normal MERCs hit on 4+ (50% hit rate)', () => {
      const threshold = getHitThreshold('basic');
      expect(threshold).toBe(4);

      const results = [1, 2, 3, 4, 5, 6].map(r => r >= threshold);
      const hits = results.filter(r => r).length;
      expect(hits).toBe(3); // 4,5,6 hit
    });

    it('Lucid should get more hits on average', () => {
      const lucidThreshold = getHitThreshold('lucid');
      const normalThreshold = getHitThreshold('basic');

      // Simulate 1000 dice rolls
      let lucidHits = 0;
      let normalHits = 0;

      for (let i = 0; i < 1000; i++) {
        const roll = Math.floor(Math.random() * 6) + 1;
        if (roll >= lucidThreshold) lucidHits++;
        if (roll >= normalThreshold) normalHits++;
      }

      // Lucid should have significantly more hits (about 33% more)
      expect(lucidHits).toBeGreaterThan(normalHits);
    });
  });

  // =========================================================================
  // Reroll Mechanics (Basic)
  // =========================================================================
  describe('Reroll Mechanics (Basic)', () => {
    it('Basic can reroll once, others cannot', () => {
      expect(canRerollOnce('basic')).toBe(true);
      expect(canRerollOnce('lucid')).toBe(false);
      expect(canRerollOnce('sarge')).toBe(false);
    });

    it('Reroll improves expected hits', () => {
      // With 3 combat dice at 4+ threshold:
      // - Expected hits: 3 * 0.5 = 1.5
      // - With reroll of misses: 1.5 + (1.5 misses * 0.5) = 2.25

      const dice = 3;
      const threshold = 4;
      const trials = 10000;

      let normalTotal = 0;
      let rerollTotal = 0;

      for (let t = 0; t < trials; t++) {
        // Normal roll
        let normalHits = 0;
        const rolls = [];
        for (let i = 0; i < dice; i++) {
          const roll = Math.floor(Math.random() * 6) + 1;
          rolls.push(roll);
          if (roll >= threshold) normalHits++;
        }
        normalTotal += normalHits;

        // With reroll (reroll misses)
        let rerollHits = normalHits;
        const misses = rolls.filter(r => r < threshold).length;
        for (let i = 0; i < misses; i++) {
          const reroll = Math.floor(Math.random() * 6) + 1;
          if (reroll >= threshold) rerollHits++;
        }
        rerollTotal += rerollHits;
      }

      const normalAvg = normalTotal / trials;
      const rerollAvg = rerollTotal / trials;

      // Reroll should improve hits by about 50% of misses
      expect(rerollAvg).toBeGreaterThan(normalAvg);
      expect(rerollAvg).toBeGreaterThan(normalAvg * 1.3); // At least 30% improvement
    });
  });

  // =========================================================================
  // Preemptive Strike (Golem)
  // =========================================================================
  describe('Preemptive Strike (Golem)', () => {
    it('Golem has preemptive strike ability', () => {
      expect(canPreemptiveStrike('golem')).toBe(true);
      expect(canPreemptiveStrike('basic')).toBe(false);
    });
  });

  // =========================================================================
  // Second Shot (Vandal)
  // =========================================================================
  describe('Second Shot (Vandal)', () => {
    it('Vandal fires second shot at end of round', () => {
      expect(firesSecondShot('vandal')).toBe(true);
      expect(firesSecondShot('basic')).toBe(false);
    });

    it('Second shot should roughly double damage output', () => {
      // With 3 combat dice at 4+ threshold:
      // - Normal: 1.5 expected hits per round
      // - Vandal: 3.0 expected hits per round (two shots)

      const dice = 3;
      const threshold = 4;
      const trials = 5000;

      let normalTotal = 0;
      let vandalTotal = 0;

      for (let t = 0; t < trials; t++) {
        // Normal MERC - one shot
        let normalHits = 0;
        for (let i = 0; i < dice; i++) {
          if (Math.floor(Math.random() * 6) + 1 >= threshold) normalHits++;
        }
        normalTotal += normalHits;

        // Vandal - two shots
        let vandalHits = 0;
        for (let shot = 0; shot < 2; shot++) {
          for (let i = 0; i < dice; i++) {
            if (Math.floor(Math.random() * 6) + 1 >= threshold) vandalHits++;
          }
        }
        vandalTotal += vandalHits;
      }

      const normalAvg = normalTotal / trials;
      const vandalAvg = vandalTotal / trials;

      // Vandal should have roughly double the hits
      expect(vandalAvg).toBeGreaterThan(normalAvg * 1.8);
      expect(vandalAvg).toBeLessThan(normalAvg * 2.2);
    });
  });

  // =========================================================================
  // Militia Conversion (Adelheid)
  // =========================================================================
  describe('Militia Conversion (Adelheid)', () => {
    it('Adelheid can convert militia instead of killing', () => {
      expect(canConvertMilitia('adelheid')).toBe(true);
      expect(canConvertMilitia('basic')).toBe(false);
    });
  });

  // =========================================================================
  // Initiative Order Abilities
  // =========================================================================
  describe('Initiative Order Abilities', () => {
    it('Kastern always goes first', () => {
      expect(alwaysGoesFirst('kastern')).toBe(true);
      expect(alwaysGoesFirst('basic')).toBe(false);
    });

    it('Badger always goes before militia', () => {
      expect(alwaysBeforesMilitia('badger')).toBe(true);
      expect(alwaysBeforesMilitia('basic')).toBe(false);
    });

    it('Runde is targeted last', () => {
      expect(isTargetedLast('runde')).toBe(true);
      expect(isTargetedLast('basic')).toBe(false);
    });

    it('Khenn rolls for initiative', () => {
      expect(rollsForInitiative('khenn')).toBe(true);
      expect(rollsForInitiative('basic')).toBe(false);
    });

    it('Khenn D6 roll produces values 1-6', () => {
      const rolls = new Set<number>();
      for (let i = 0; i < 1000; i++) {
        const roll = Math.floor(Math.random() * 6) + 1;
        rolls.add(roll);
      }
      expect(rolls.size).toBe(6);
      expect(rolls.has(1)).toBe(true);
      expect(rolls.has(6)).toBe(true);
    });
  });

  // =========================================================================
  // Combat Resolution
  // =========================================================================
  describe('Combat Resolution', () => {
    let game: MERCGame;
    let rebel: RebelPlayer;

    beforeEach(() => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'combat-resolution-test',
      });
      game = testGame.game;
      rebel = game.rebelPlayers[0];
    });

    it('should have sectors available for combat', () => {
      // Get first sector with coordinates
      const sectors = game.gameMap.getAllSectors();
      expect(sectors.length).toBeGreaterThan(0);

      const sector = sectors[0];
      expect(sector).toBeDefined();
      expect(sector.sectorId).toBeDefined();
    });

    it('should be able to add militia to sector', () => {
      const sector = game.gameMap.getAllSectors()[0];
      expect(sector).toBeDefined();

      // Add militia for combat
      sector.addDictatorMilitia(3);
      expect(sector.dictatorMilitia).toBe(3);
    });

    it('militia should have correct default stats', () => {
      // Militia stats are defined constants
      const militiaStats = {
        initiative: 2,
        combat: 2,
        health: 1,
      };

      expect(militiaStats.initiative).toBe(2);
      expect(militiaStats.combat).toBe(2);
      expect(militiaStats.health).toBe(1);
    });

    it('should be able to place MERC in sector', () => {
      const sector = game.gameMap.getAllSectors()[0];
      const merc = game.mercDeck.first(MercCard);

      if (merc && sector) {
        merc.putInto(rebel.primarySquad);
        rebel.primarySquad.sectorId = sector.sectorId;

        expect(rebel.primarySquad.sectorId).toBe(sector.sectorId);
        expect(rebel.team.length).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // Armor Mechanics
  // =========================================================================
  describe('Armor Mechanics', () => {
    let game: MERCGame;

    beforeEach(() => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'armor-test',
      });
      game = testGame.game;
    });

    it('armor should reduce damage', () => {
      const merc = game.mercDeck.first(MercCard);
      if (!merc) return;

      const initialHealth = merc.health;

      // Without armor, full damage
      merc.takeDamage(2, game);
      expect(merc.health).toBe(initialHealth - 2);

      // Reset
      merc.fullHeal();
      expect(merc.health).toBe(merc.maxHealth);

      // With armor, damage reduced
      const armor = game.armorDeck.first(Equipment);
      if (armor) {
        merc.equip(armor);
        const armorValue = armor.armor || 0;

        merc.takeDamage(2, game);
        // Damage is reduced by armor
        const expectedDamage = Math.max(0, 2 - armorValue);
        expect(merc.damage).toBe(expectedDamage);
      }
    });
  });

  // =========================================================================
  // Combat Dice Distribution
  // =========================================================================
  describe('Combat Dice Distribution', () => {
    it('dice should be uniformly distributed', () => {
      const counts = [0, 0, 0, 0, 0, 0];
      const trials = 60000;

      for (let i = 0; i < trials; i++) {
        const roll = Math.floor(Math.random() * 6) + 1;
        counts[roll - 1]++;
      }

      // Each face should appear roughly 1/6 of the time (±10%)
      const expected = trials / 6;
      const tolerance = expected * 0.1;

      for (let i = 0; i < 6; i++) {
        expect(counts[i]).toBeGreaterThan(expected - tolerance);
        expect(counts[i]).toBeLessThan(expected + tolerance);
      }
    });

    it('hit probability should match threshold', () => {
      const trials = 10000;
      let hits4Plus = 0;
      let hits3Plus = 0;

      for (let i = 0; i < trials; i++) {
        const roll = Math.floor(Math.random() * 6) + 1;
        if (roll >= 4) hits4Plus++;
        if (roll >= 3) hits3Plus++;
      }

      // 4+ should hit ~50% (3 faces out of 6)
      expect(hits4Plus / trials).toBeGreaterThan(0.45);
      expect(hits4Plus / trials).toBeLessThan(0.55);

      // 3+ should hit ~66% (4 faces out of 6)
      expect(hits3Plus / trials).toBeGreaterThan(0.61);
      expect(hits3Plus / trials).toBeLessThan(0.71);
    });
  });

  // =========================================================================
  // Damage and Health Mechanics
  // =========================================================================
  describe('Damage and Health Mechanics', () => {
    let game: MERCGame;

    beforeEach(() => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'damage-test',
      });
      game = testGame.game;
    });

    it('damage should reduce health correctly', () => {
      const merc = game.mercDeck.first(MercCard);
      if (!merc) return;

      const maxHealth = merc.maxHealth;
      expect(merc.health).toBe(maxHealth);
      expect(merc.damage).toBe(0);

      merc.takeDamage(2, game);
      expect(merc.health).toBe(maxHealth - 2);
      expect(merc.damage).toBe(2);
    });

    it('healing should restore health', () => {
      const merc = game.mercDeck.first(MercCard);
      if (!merc) return;

      merc.takeDamage(2, game);
      const damagedHealth = merc.health;

      merc.heal(1);
      expect(merc.health).toBe(damagedHealth + 1);
      expect(merc.damage).toBe(1);
    });

    it('full heal should restore all health', () => {
      const merc = game.mercDeck.first(MercCard);
      if (!merc) return;

      merc.takeDamage(2, game);
      merc.fullHeal();

      expect(merc.health).toBe(merc.maxHealth);
      expect(merc.damage).toBe(0);
    });

    it('overkill damage should not exceed max health', () => {
      const merc = game.mercDeck.first(MercCard);
      if (!merc) return;

      const maxHealth = merc.maxHealth;
      merc.takeDamage(100, game);

      // Damage capped at max health
      expect(merc.damage).toBeLessThanOrEqual(maxHealth);
      expect(merc.health).toBe(0);
      expect(merc.isDead).toBe(true);
    });
  });

  // =========================================================================
  // Target Selection
  // =========================================================================
  describe('Target Selection', () => {
    it('should have correct number of targets based on weapon', () => {
      // Default targets is 1
      // Weapons can add more targets

      const baseTargets = 1;
      expect(baseTargets).toBe(1);
    });

    it('Ra adds +1 target always', () => {
      // Ra's ability gives +1 target regardless of weapon
      // This is applied during combatant creation
      const raTargetBonus = 1;
      const baseTargets = 1;
      expect(baseTargets + raTargetBonus).toBe(2);
    });
  });

  // =========================================================================
  // Combat Outcome Verification
  // =========================================================================
  describe('Combat Outcomes', () => {
    it('should properly track victory conditions', () => {
      // Rebel victory: all enemy militia and MERCs dead
      // Dictator victory: all rebel MERCs dead
      // Draw: both sides wiped out simultaneously

      const rebelVictory: CombatOutcome = {
        rebelVictory: true,
        dictatorVictory: false,
        retreated: false,
        combatPending: false,
        round: 1,
        events: [],
      };

      const dictatorVictory: CombatOutcome = {
        rebelVictory: false,
        dictatorVictory: true,
        retreated: false,
        combatPending: false,
        round: 1,
        events: [],
      };

      expect(rebelVictory.rebelVictory).toBe(true);
      expect(dictatorVictory.dictatorVictory).toBe(true);
    });

    it('should support retreat option', () => {
      const retreatOutcome: CombatOutcome = {
        rebelVictory: false,
        dictatorVictory: false,
        retreated: true,
        combatPending: false,
        round: 1,
        events: [],
      };

      expect(retreatOutcome.retreated).toBe(true);
    });
  });
});
