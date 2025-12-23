import { describe, it, expect } from 'vitest';
import {
  getMercAbility,
  hasCombatCondition,
  getHitThreshold,
  isFemale,
  canRerollOnce,
  canSacrificeDieToHeal,
  alwaysGoesFirst,
  alwaysBeforesMilitia,
  rollsForInitiative,
  isTargetedLast,
  ignoresInitiativePenalties,
  prioritizesMercs,
  eachHitNewMilitiaTarget,
  canRetargetSixes,
  canPreemptiveStrike,
  firesSecondShot,
  canConvertMilitia,
  isImmuneToAttackDogs,
  willNotHarmDogs,
  wontUseExplosives,
  requiresAccessory,
  doesntCountTowardLimit,
  getAutoHealPerDay,
  getExtraActions,
  getExtraTrainingActions,
  getExtraHealth,
  canWeaponInAccessorySlot,
  allSlotsAccessories,
  getsFreeAccessoryOnHire,
  getMilitiaBringCount,
  healsSquadOutsideCombat,
  canRetrieveFromDiscard,
  handlesLandMines,
  drawsEquipmentForSquad,
  getMilitiaInitiativeBonus,
  getEnemyCombatDebuff,
  areIncompatible,
  getIncompatibleMercs,
  FEMALE_MERCS,
} from '../src/rules/merc-abilities.js';

/**
 * MERC Ability Registry Tests
 *
 * Tests for all helper functions in merc-abilities.ts
 * Verifies that each MERC's abilities are correctly defined and accessible.
 */
describe('MERC Ability Registry', () => {
  describe('getMercAbility', () => {
    it('should return ability data for known MERCs', () => {
      expect(getMercAbility('lucid')).toBeDefined();
      expect(getMercAbility('basic')).toBeDefined();
      expect(getMercAbility('sarge')).toBeDefined();
    });

    it('should return undefined for unknown MERCs', () => {
      expect(getMercAbility('unknown-merc')).toBeUndefined();
      expect(getMercAbility('')).toBeUndefined();
    });

    it('should include id in returned ability', () => {
      const lucid = getMercAbility('lucid');
      expect(lucid?.id).toBe('lucid');
    });
  });

  describe('Hit Threshold (Lucid)', () => {
    it('should return 3 for Lucid (hits on 3+)', () => {
      expect(getHitThreshold('lucid')).toBe(3);
    });

    it('should return 4 (default) for regular MERCs', () => {
      expect(getHitThreshold('basic')).toBe(4);
      expect(getHitThreshold('sarge')).toBe(4);
    });

    it('should return 4 for unknown MERCs', () => {
      expect(getHitThreshold('unknown')).toBe(4);
    });
  });

  describe('Female MERCs', () => {
    it('should correctly identify female MERCs', () => {
      expect(isFemale('valkyrie')).toBe(true);
      expect(isFemale('tack')).toBe(true);
      expect(isFemale('teresa')).toBe(true);
      expect(isFemale('adelheid')).toBe(true);
      expect(isFemale('ewok')).toBe(true);
      expect(isFemale('faustina')).toBe(true);
      expect(isFemale('natasha')).toBe(true);
      expect(isFemale('sonia')).toBe(true);
    });

    it('should correctly identify male MERCs', () => {
      expect(isFemale('sarge')).toBe(false);
      expect(isFemale('basic')).toBe(false);
      expect(isFemale('lucid')).toBe(false);
      expect(isFemale('snake')).toBe(false);
    });

    it('should have FEMALE_MERCS constant with all female MERCs', () => {
      expect(FEMALE_MERCS).toContain('valkyrie');
      expect(FEMALE_MERCS).toContain('tack');
      expect(FEMALE_MERCS).toContain('teresa');
      expect(FEMALE_MERCS.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('Reroll Abilities (Basic)', () => {
    it('should allow Basic to reroll once', () => {
      expect(canRerollOnce('basic')).toBe(true);
    });

    it('should not allow other MERCs to reroll', () => {
      expect(canRerollOnce('lucid')).toBe(false);
      expect(canRerollOnce('sarge')).toBe(false);
    });
  });

  describe('Sacrifice Die to Heal (Surgeon)', () => {
    it('should allow Surgeon to sacrifice die to heal', () => {
      expect(canSacrificeDieToHeal('surgeon')).toBe(true);
    });

    it('should not allow other MERCs to sacrifice die', () => {
      expect(canSacrificeDieToHeal('lucid')).toBe(false);
      expect(canSacrificeDieToHeal('basic')).toBe(false);
    });
  });

  describe('Initiative Order Abilities', () => {
    it('should identify Kastern as always going first', () => {
      expect(alwaysGoesFirst('kastern')).toBe(true);
    });

    it('should identify Badger as always going before militia', () => {
      expect(alwaysBeforesMilitia('badger')).toBe(true);
    });

    it('should identify Khenn as rolling for initiative', () => {
      expect(rollsForInitiative('khenn')).toBe(true);
    });

    it('should not give special initiative to regular MERCs', () => {
      expect(alwaysGoesFirst('basic')).toBe(false);
      expect(alwaysBeforesMilitia('basic')).toBe(false);
      expect(rollsForInitiative('basic')).toBe(false);
    });
  });

  describe('Targeting Abilities', () => {
    it('should identify Runde as targeted last', () => {
      expect(isTargetedLast('runde')).toBe(true);
    });

    it('should identify Vulture as ignoring initiative penalties', () => {
      expect(ignoresInitiativePenalties('vulture')).toBe(true);
    });

    it('should identify Buzzkill as prioritizing MERCs', () => {
      expect(prioritizesMercs('buzzkill')).toBe(true);
    });

    it('should identify Rizen as each hit targeting new militia', () => {
      expect(eachHitNewMilitiaTarget('rizen')).toBe(true);
    });

    it('should identify Wolverine as able to retarget sixes', () => {
      expect(canRetargetSixes('wolverine')).toBe(true);
    });
  });

  describe('Combat Action Abilities', () => {
    it('should identify Golem as having preemptive strike', () => {
      expect(canPreemptiveStrike('golem')).toBe(true);
    });

    it('should identify Vandal as firing second shot', () => {
      expect(firesSecondShot('vandal')).toBe(true);
    });

    it('should identify Adelheid as converting militia', () => {
      expect(canConvertMilitia('adelheid')).toBe(true);
    });

    it('should not give combat actions to regular MERCs', () => {
      expect(canPreemptiveStrike('basic')).toBe(false);
      expect(firesSecondShot('basic')).toBe(false);
      expect(canConvertMilitia('basic')).toBe(false);
    });
  });

  describe('Attack Dog Interactions', () => {
    it('should identify Shadkaam as immune to attack dogs', () => {
      expect(isImmuneToAttackDogs('shadkaam')).toBe(true);
    });

    it('should identify Tao as not harming dogs', () => {
      expect(willNotHarmDogs('tao')).toBe(true);
    });

    it('should not give dog abilities to regular MERCs', () => {
      expect(isImmuneToAttackDogs('basic')).toBe(false);
      expect(willNotHarmDogs('basic')).toBe(false);
    });
  });

  describe('Equipment Restrictions', () => {
    it('should identify Apeiron as not using explosives', () => {
      expect(wontUseExplosives('apeiron')).toBe(true);
    });

    it('should identify Meatbop as requiring accessory', () => {
      expect(requiresAccessory('meatbop')).toBe(true);
    });

    it('should not restrict regular MERCs', () => {
      expect(wontUseExplosives('basic')).toBe(false);
      expect(requiresAccessory('basic')).toBe(false);
    });
  });

  describe('Team Limit Exceptions', () => {
    it('should identify Teresa as not counting toward limit', () => {
      expect(doesntCountTowardLimit('teresa')).toBe(true);
    });

    it('should count regular MERCs toward limit', () => {
      expect(doesntCountTowardLimit('basic')).toBe(false);
      expect(doesntCountTowardLimit('sarge')).toBe(false);
    });
  });

  describe('Extra Actions', () => {
    it('should give Ewok 1 extra action', () => {
      expect(getExtraActions('ewok')).toBe(1);
    });

    it('should give Faustina 1 extra training action', () => {
      expect(getExtraTrainingActions('faustina')).toBe(1);
    });

    it('should give no extra actions to regular MERCs', () => {
      expect(getExtraActions('basic')).toBe(0);
      expect(getExtraTrainingActions('basic')).toBe(0);
    });
  });

  describe('Health Modifiers', () => {
    it('should give Juicer 2 extra health', () => {
      expect(getExtraHealth('juicer')).toBe(2);
    });

    it('should give Preaction 1 auto-heal per day', () => {
      expect(getAutoHealPerDay('preaction')).toBe(1);
    });

    it('should give no extra health to regular MERCs', () => {
      expect(getExtraHealth('basic')).toBe(0);
      expect(getAutoHealPerDay('basic')).toBe(0);
    });
  });

  describe('Equipment Slot Abilities', () => {
    it('should allow Genesis to use weapon in accessory slot', () => {
      expect(canWeaponInAccessorySlot('genesis')).toBe(true);
    });

    it('should give Gunther all accessory slots', () => {
      expect(allSlotsAccessories('gunther')).toBe(true);
    });

    it('should give Vrbansk free accessory on hire', () => {
      expect(getsFreeAccessoryOnHire('vrbansk')).toBe(true);
    });

    it('should not give slot abilities to regular MERCs', () => {
      expect(canWeaponInAccessorySlot('basic')).toBe(false);
      expect(allSlotsAccessories('basic')).toBe(false);
      expect(getsFreeAccessoryOnHire('basic')).toBe(false);
    });
  });

  describe('Militia Abilities', () => {
    it('should let Sonia bring 2 militia when moving', () => {
      expect(getMilitiaBringCount('sonia')).toBe(2);
    });

    it('should give Walter militia initiative bonus', () => {
      expect(getMilitiaInitiativeBonus('walter')).toBe(2);
    });

    it('should not give militia bonuses to regular MERCs', () => {
      expect(getMilitiaBringCount('basic')).toBe(0);
      expect(getMilitiaInitiativeBonus('basic')).toBe(0);
    });
  });

  describe('Enemy Debuffs', () => {
    it('should give Max enemy combat debuff of -1', () => {
      expect(getEnemyCombatDebuff('max')).toBe(-1);
    });

    it('should not give debuffs for regular MERCs', () => {
      expect(getEnemyCombatDebuff('basic')).toBe(0);
    });
  });

  describe('Special Abilities', () => {
    it('should identify Doc as healing squad outside combat', () => {
      expect(healsSquadOutsideCombat('doc')).toBe(true);
    });

    it('should identify Feedback as retrieving from discard', () => {
      expect(canRetrieveFromDiscard('feedback')).toBe(true);
    });

    it('should identify Squidhead as handling land mines', () => {
      expect(handlesLandMines('squidhead')).toBe(true);
    });

    it('should identify Hagness as drawing equipment for squad', () => {
      expect(drawsEquipmentForSquad('hagness')).toBe(true);
    });

    it('should not give special abilities to regular MERCs', () => {
      expect(healsSquadOutsideCombat('basic')).toBe(false);
      expect(canRetrieveFromDiscard('basic')).toBe(false);
      expect(handlesLandMines('basic')).toBe(false);
      expect(drawsEquipmentForSquad('basic')).toBe(false);
    });
  });

  describe('MERC Incompatibilities', () => {
    it('should identify incompatible MERCs', () => {
      // Borris won't work with Squirrel
      expect(areIncompatible('borris', 'squirrel')).toBe(true);
      expect(areIncompatible('squirrel', 'borris')).toBe(true);

      // Moose won't work with Borris
      expect(areIncompatible('moose', 'borris')).toBe(true);
      expect(areIncompatible('borris', 'moose')).toBe(true);

      // Natasha won't work with Moose
      expect(areIncompatible('natasha', 'moose')).toBe(true);

      // Squirrel won't work with Natasha
      expect(areIncompatible('squirrel', 'natasha')).toBe(true);
    });

    it('should not mark compatible MERCs as incompatible', () => {
      expect(areIncompatible('basic', 'sarge')).toBe(false);
      expect(areIncompatible('lucid', 'basic')).toBe(false);
    });

    it('should get list of incompatible MERCs', () => {
      const borrisIncompat = getIncompatibleMercs('borris');
      expect(borrisIncompat).toContain('squirrel');
    });

    it('should return empty array for MERCs with no incompatibilities', () => {
      const basicIncompat = getIncompatibleMercs('basic');
      expect(basicIncompat).toEqual([]);
    });
  });

  describe('Combat Conditions', () => {
    it('should identify Sarge as having highestInitInSquad condition', () => {
      expect(hasCombatCondition('sarge', 'highestInitInSquad')).toBe(true);
    });

    it('should identify Bouba as having hasHandgun condition', () => {
      expect(hasCombatCondition('bouba', 'hasHandgun')).toBe(true);
    });

    it('should identify Mayhem as having hasUzi condition', () => {
      expect(hasCombatCondition('mayhem', 'hasUzi')).toBe(true);
    });

    it('should identify Stumpy as having hasExplosive condition', () => {
      expect(hasCombatCondition('stumpy', 'hasExplosive')).toBe(true);
    });

    it('should identify Tavisto as having womanInSquad condition', () => {
      expect(hasCombatCondition('tavisto', 'womanInSquad')).toBe(true);
    });

    it('should identify Snake as having aloneInSquad condition', () => {
      expect(hasCombatCondition('snake', 'aloneInSquad')).toBe(true);
    });
  });

  describe('Stat Bonuses', () => {
    it('should return correct Sarge ability data (combatModifiers)', () => {
      const sarge = getMercAbility('sarge');
      expect(sarge).toBeDefined();
      expect(sarge?.combatModifiers?.combatBonus).toBe(1);
      expect(sarge?.combatModifiers?.initiativeBonus).toBe(1);
      expect(sarge?.combatModifiers?.trainingBonus).toBe(1);
      expect(sarge?.combatModifiers?.condition).toBe('highestInitInSquad');
    });

    it('should return correct Tack ability data', () => {
      const tack = getMercAbility('tack');
      expect(tack).toBeDefined();
      expect(tack?.squadBonus?.initiative).toBe(2);
      expect(tack?.squadBonus?.appliesTo).toBe('allSquad');
      expect(tack?.squadBonus?.condition).toBe('highestInitInSquad');
    });

    it('should return correct Valkyrie ability data', () => {
      const valkyrie = getMercAbility('valkyrie');
      expect(valkyrie).toBeDefined();
      expect(valkyrie?.squadBonus?.initiative).toBe(1);
      expect(valkyrie?.squadBonus?.appliesTo).toBe('squadMates');
      expect(valkyrie?.squadBonus?.condition).toBe('always');
    });

    it('should return correct Snake ability data (combatModifiers)', () => {
      const snake = getMercAbility('snake');
      expect(snake).toBeDefined();
      expect(snake?.combatModifiers?.combatBonus).toBe(1);
      expect(snake?.combatModifiers?.initiativeBonus).toBe(1);
      expect(snake?.combatModifiers?.trainingBonus).toBe(1);
      expect(snake?.combatModifiers?.condition).toBe('aloneInSquad');
    });

    it('should return correct Tavisto ability data (combatModifiers)', () => {
      const tavisto = getMercAbility('tavisto');
      expect(tavisto).toBeDefined();
      expect(tavisto?.combatModifiers?.combatBonus).toBe(1);
      expect(tavisto?.combatModifiers?.initiativeBonus).toBe(1);
      expect(tavisto?.combatModifiers?.trainingBonus).toBe(1);
      expect(tavisto?.combatModifiers?.condition).toBe('womanInSquad');
    });
  });
});
