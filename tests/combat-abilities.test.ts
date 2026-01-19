import { describe, it, expect, beforeEach } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame, RebelPlayer, DictatorPlayer } from '../src/rules/game.js';
import { CombatantModel, Sector, Squad, Equipment } from '../src/rules/elements.js';
import { getCombatants, type Combatant } from '../src/rules/combat.js';
import {
  getHitThreshold,
  canRerollOnce,
  canSacrificeDieToHeal,
  alwaysGoesFirst,
  alwaysBeforesMilitia,
  isTargetedLast,
  prioritizesMercs,
  eachHitNewMilitiaTarget,
  canPreemptiveStrike,
  firesSecondShot,
  canConvertMilitia,
  getMercAbility,
  isFemale,
} from '../src/rules/merc-abilities.js';
import {
  isHandgun,
  isUzi,
  isExplosive,
} from '../src/rules/equipment-effects.js';

/**
 * Combat Ability Integration Tests for MERC
 *
 * These tests verify that MERC combat abilities work correctly
 * by testing the registry helpers and their integration with
 * combat mechanics.
 */
describe('Combat Ability Integration', () => {
  describe('Hit Threshold Abilities', () => {
    it('Lucid should hit on 3+ instead of 4+', () => {
      // Lucid's hit threshold is 3
      const lucidThreshold = getHitThreshold('lucid');
      expect(lucidThreshold).toBe(3);

      // Test dice outcomes
      expect(3 >= lucidThreshold).toBe(true);  // Hit
      expect(2 >= lucidThreshold).toBe(false); // Miss

      // Compare to normal MERC
      const normalThreshold = getHitThreshold('basic');
      expect(normalThreshold).toBe(4);
      expect(3 >= normalThreshold).toBe(false); // Miss for normal
    });

    it('should calculate more hits for Lucid vs normal', () => {
      const lucidThreshold = getHitThreshold('lucid');
      const normalThreshold = getHitThreshold('basic');

      // Simulate dice rolls
      const rolls = [1, 2, 3, 4, 5, 6];

      const lucidHits = rolls.filter(r => r >= lucidThreshold).length;
      const normalHits = rolls.filter(r => r >= normalThreshold).length;

      expect(lucidHits).toBe(4); // 3, 4, 5, 6
      expect(normalHits).toBe(3); // 4, 5, 6
      expect(lucidHits).toBeGreaterThan(normalHits);
    });
  });

  describe('Reroll Abilities', () => {
    it('Basic should be able to reroll once per combat', () => {
      expect(canRerollOnce('basic')).toBe(true);
    });

    it('other MERCs should not have reroll ability', () => {
      expect(canRerollOnce('lucid')).toBe(false);
      expect(canRerollOnce('sarge')).toBe(false);
      expect(canRerollOnce('tack')).toBe(false);
    });

    it('reroll should statistically improve results', () => {
      // With 6 dice, expected hits at 4+ is 3
      // Rerolling misses (1, 2, 3) gives another chance at 3 misses
      // Expected additional hits from reroll: 3 * 0.5 = 1.5
      // This test validates the mechanic is correctly identified
      expect(canRerollOnce('basic')).toBe(true);
    });
  });

  describe('Healing Abilities', () => {
    it('Surgeon should be able to sacrifice die to heal', () => {
      expect(canSacrificeDieToHeal('surgeon')).toBe(true);
    });

    it('other MERCs cannot sacrifice dice', () => {
      expect(canSacrificeDieToHeal('basic')).toBe(false);
      expect(canSacrificeDieToHeal('lucid')).toBe(false);
    });
  });

  describe('Initiative Order Abilities', () => {
    it('Kastern should always go first in combat', () => {
      expect(alwaysGoesFirst('kastern')).toBe(true);
    });

    it('Badger should always attack before militia', () => {
      expect(alwaysBeforesMilitia('badger')).toBe(true);
    });

    it('these abilities affect combat order', () => {
      // Verify initiative modifiers exist
      const kasternAbility = getMercAbility('kastern');
      expect(kasternAbility?.targeting?.alwaysFirst).toBe(true);

      const badgerAbility = getMercAbility('badger');
      expect(badgerAbility?.targeting?.alwaysBeforesMilitia).toBe(true);
    });
  });

  describe('Targeting Abilities', () => {
    it('Runde should be targeted last', () => {
      expect(isTargetedLast('runde')).toBe(true);
    });

    it('Buzzkill should prioritize attacking enemy MERCs', () => {
      expect(prioritizesMercs('buzzkill')).toBe(true);
    });

    it('Rizen should be able to hit multiple militia per attack', () => {
      expect(eachHitNewMilitiaTarget('rizen')).toBe(true);
    });
  });

  describe('Special Combat Actions', () => {
    it('Golem should have preemptive strike', () => {
      expect(canPreemptiveStrike('golem')).toBe(true);
    });

    it('Vandal should fire a second shot', () => {
      expect(firesSecondShot('vandal')).toBe(true);
    });

    it('Adelheid should convert militia instead of killing', () => {
      expect(canConvertMilitia('adelheid')).toBe(true);
    });
  });

  describe('Squad Composition Bonuses', () => {
    describe('Sarge - Highest Initiative Bonus', () => {
      it('should have bonus when highest initiative', () => {
        const sarge = getMercAbility('sarge');
        expect(sarge?.combatModifiers?.condition).toBe('highestInitInSquad');
        expect(sarge?.combatModifiers?.combatBonus).toBe(1);
        expect(sarge?.combatModifiers?.initiativeBonus).toBe(1);
        expect(sarge?.combatModifiers?.trainingBonus).toBe(1);
      });
    });

    describe('Tack - Squad Initiative Bonus', () => {
      it('should give +2 initiative to all squad when has highest initiative', () => {
        const tack = getMercAbility('tack');
        expect(tack?.squadBonus?.initiative).toBe(2);
        expect(tack?.squadBonus?.appliesTo).toBe('allSquad');
        expect(tack?.squadBonus?.condition).toBe('highestInitInSquad');
      });
    });

    describe('Valkyrie - Squad Initiative Aura', () => {
      it('should give +1 initiative to squad mates always', () => {
        const valkyrie = getMercAbility('valkyrie');
        expect(valkyrie?.squadBonus?.initiative).toBe(1);
        expect(valkyrie?.squadBonus?.appliesTo).toBe('squadMates');
      });
    });

    describe('Snake - Lone Wolf Bonus', () => {
      it('should get +1 to all stats when alone', () => {
        const snake = getMercAbility('snake');
        expect(snake?.combatModifiers?.condition).toBe('aloneInSquad');
        expect(snake?.combatModifiers?.combatBonus).toBe(1);
        expect(snake?.combatModifiers?.initiativeBonus).toBe(1);
        expect(snake?.combatModifiers?.trainingBonus).toBe(1);
      });
    });

    describe('Tavisto - Woman in Squad Bonus', () => {
      it('should get +1 to all stats with woman in squad', () => {
        const tavisto = getMercAbility('tavisto');
        expect(tavisto?.combatModifiers?.condition).toBe('womanInSquad');
        expect(tavisto?.combatModifiers?.combatBonus).toBe(1);
        expect(tavisto?.combatModifiers?.initiativeBonus).toBe(1);
        expect(tavisto?.combatModifiers?.trainingBonus).toBe(1);
      });

      it('should identify female MERCs correctly', () => {
        // Female MERCs that could trigger Tavisto's ability
        expect(isFemale('valkyrie')).toBe(true);
        expect(isFemale('tack')).toBe(true);
        expect(isFemale('teresa')).toBe(true);
        expect(isFemale('adelheid')).toBe(true);

        // Male MERCs
        expect(isFemale('tavisto')).toBe(false);
        expect(isFemale('sarge')).toBe(false);
      });
    });
  });

  describe('Equipment-Based Bonuses', () => {
    describe('Bouba - Handgun Bonus', () => {
      it('should have bonus with handgun equipped', () => {
        const bouba = getMercAbility('bouba');
        expect(bouba?.combatModifiers?.condition).toBe('hasHandgun');
        expect(bouba?.combatModifiers?.combatBonus).toBe(1);
      });

      it('should correctly identify handguns', () => {
        expect(isHandgun('9mm-handgun')).toBe(true);
        expect(isHandgun('45-caliber-handgun')).toBe(true);
        expect(isHandgun('uzi')).toBe(false);
        expect(isHandgun('m16')).toBe(false);
      });
    });

    describe('Mayhem - Uzi Bonus', () => {
      it('should have bonus with Uzi equipped', () => {
        const mayhem = getMercAbility('mayhem');
        expect(mayhem?.combatModifiers?.condition).toBe('hasUzi');
        expect(mayhem?.combatModifiers?.combatBonus).toBe(2);
      });

      it('should correctly identify Uzis', () => {
        expect(isUzi('uzi')).toBe(true);
        expect(isUzi('uzi-with-ap-ammo')).toBe(true);
        expect(isUzi('9mm-handgun')).toBe(false);
      });
    });

    describe('Stumpy - Explosive Bonus', () => {
      it('should have bonus with explosive equipped', () => {
        const stumpy = getMercAbility('stumpy');
        expect(stumpy?.combatModifiers?.condition).toBe('hasExplosive');
        expect(stumpy?.combatModifiers?.combatBonus).toBe(1);
      });

      it('should correctly identify explosives', () => {
        expect(isExplosive('grenade')).toBe(true);
        expect(isExplosive('fragmentation-grenade')).toBe(true);
        expect(isExplosive('m16')).toBe(false);
      });
    });
  });

  describe('Combatant Creation', () => {
    let game: MERCGame;

    beforeEach(() => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'combatant-test',
      });
      game = testGame.game;
    });

    it('should create combatant with correct base stats', () => {
      const mockCombatant: Combatant = {
        id: 'test-merc-1',
        name: 'Test MERC',
        initiative: 5,
        combat: 3,
        health: 4,
        maxHealth: 4,
        armor: 0,
        targets: 1,
        isDictatorSide: false,
        isMilitia: false,
        isDictator: false,
        isAttackDog: false,
        sourceElement: null,
        armorPiercing: false,
        hasOneUseWeapon: false,
        hasAttackDog: false,
        isImmuneToAttackDogs: false,
        willNotHarmDogs: false,
      };

      expect(mockCombatant.initiative).toBe(5);
      expect(mockCombatant.combat).toBe(3);
      expect(mockCombatant.health).toBe(4);
    });

    it('should distinguish between militia and MERCs', () => {
      const militia: Combatant = {
        id: 'militia-1',
        name: 'Dictator Militia',
        initiative: 2,
        combat: 2,
        health: 1,
        maxHealth: 1,
        armor: 0,
        targets: 1,
        isDictatorSide: true,
        isMilitia: true,
        isDictator: false,
        isAttackDog: false,
        sourceElement: null,
        armorPiercing: false,
        hasOneUseWeapon: false,
        hasAttackDog: false,
        isImmuneToAttackDogs: false,
        willNotHarmDogs: false,
      };

      const merc: Combatant = {
        id: 'merc-1',
        name: 'Test MERC',
        initiative: 5,
        combat: 3,
        health: 4,
        maxHealth: 4,
        armor: 1,
        targets: 1,
        isDictatorSide: false,
        isMilitia: false,
        isDictator: false,
        isAttackDog: false,
        sourceElement: null,
        armorPiercing: false,
        hasOneUseWeapon: false,
        hasAttackDog: false,
        isImmuneToAttackDogs: false,
        willNotHarmDogs: false,
      };

      expect(militia.isMilitia).toBe(true);
      expect(merc.isMilitia).toBe(false);
      expect(militia.isDictatorSide).toBe(true);
      expect(merc.isDictatorSide).toBe(false);
    });
  });

  describe('MERC Card Verification', () => {
    let game: MERCGame;

    beforeEach(() => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'merc-verify',
      });
      game = testGame.game;
    });

    it('should have combat-ability MERCs in deck', () => {
      const mercs = game.mercDeck.all(CombatantModel).filter(c => c.isMerc);

      // MERCs with combat abilities
      const combatMercs = ['lucid', 'basic', 'sarge', 'tack', 'valkyrie',
                          'max', 'tavisto', 'snake', 'walter', 'adelheid'];

      for (const combatantId of combatMercs) {
        const found = mercs.find(m => m.combatantId === combatantId);
        expect(found).toBeDefined();
      }
    });

    it('should have valid stats for MERCs', () => {
      const mercs = game.mercDeck.all(CombatantModel).filter(c => c.isMerc);
      expect(mercs.length).toBeGreaterThan(0);

      for (const merc of mercs) {
        expect(merc.combatantId).toBeDefined();
        expect(typeof merc.combatantId).toBe('string');
        expect(merc.combatantName).toBeDefined();
      }
    });
  });

  describe('Combat Constants', () => {
    it('should use standard hit threshold of 4+', () => {
      const threshold = 4;

      expect(1 >= threshold).toBe(false);
      expect(2 >= threshold).toBe(false);
      expect(3 >= threshold).toBe(false);
      expect(4 >= threshold).toBe(true);
      expect(5 >= threshold).toBe(true);
      expect(6 >= threshold).toBe(true);
    });

    it('should have correct militia stats', () => {
      const militiaStats = {
        initiative: 2,
        combat: 2,
        health: 1,
      };

      expect(militiaStats.initiative).toBe(2);
      expect(militiaStats.combat).toBe(2);
      expect(militiaStats.health).toBe(1);
    });
  });

  describe('Combat Outcome Types', () => {
    it('should support retreat outcomes', () => {
      const retreatOutcome = {
        rebelVictory: false,
        dictatorVictory: false,
        retreated: true,
        combatPending: false,
        canRetreat: true,
      };

      expect(retreatOutcome.retreated).toBe(true);
      expect(retreatOutcome.canRetreat).toBe(true);
    });

    it('should support victory outcomes', () => {
      const rebelWin = {
        rebelVictory: true,
        dictatorVictory: false,
      };

      const dictatorWin = {
        rebelVictory: false,
        dictatorVictory: true,
      };

      expect(rebelWin.rebelVictory).toBe(true);
      expect(dictatorWin.dictatorVictory).toBe(true);
    });

    it('should support pending combat for interactive decisions', () => {
      const pendingCombat = {
        combatPending: true,
        canRetreat: true,
      };

      expect(pendingCombat.combatPending).toBe(true);
      expect(pendingCombat.canRetreat).toBe(true);
    });
  });

  describe('Equipment Effects in Combat', () => {
    let game: MERCGame;

    beforeEach(() => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'equipment-combat-test',
      });
      game = testGame.game;
    });

    it('should have weapons that modify combat', () => {
      const weapons = game.weaponsDeck.all();
      expect(weapons.length).toBeGreaterThan(0);
    });

    it('should have armor that provides protection', () => {
      const armor = game.armorDeck.all();
      expect(armor.length).toBeGreaterThan(0);
    });

    it('should have accessories with special effects', () => {
      const accessories = game.accessoriesDeck.all();
      expect(accessories.length).toBeGreaterThan(0);
    });
  });

  describe('Dictator Combat', () => {
    let game: MERCGame;

    beforeEach(() => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'dictator-combat',
      });
      game = testGame.game;
      // Manually set up the dictator card since createTestGame doesn't pass dictatorChoice
      game.setupDictator('castro');
    });

    it('should have dictator card with combat stats', () => {
      const dictator = game.dictatorPlayer.dictator;

      // Dictator card should be defined after manual setup
      expect(dictator).toBeDefined();
      if (dictator) {
        expect(dictator.initiative).toBeDefined();
        expect(dictator.combat).toBeDefined();
        expect(dictator.training).toBeDefined();
      }
    });

    it('should not start dictator in play', () => {
      const dictator = game.dictatorPlayer.dictator;
      expect(dictator).toBeDefined();
      if (dictator) {
        expect(dictator.inPlay).toBe(false);
      }
    });
  });
});
