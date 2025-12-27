import { describe, it, expect } from 'vitest';
import {
  EQUIPMENT_EFFECTS,
  getEquipmentEffect,
  isWeaponCategory,
  isHandgun,
  isUzi,
  isExplosive,
  isSword,
  isSmaw,
  isLandMine,
  isAttackDog,
  isEpinephrine,
  isRepairKit,
  isHealingItem,
  getHealAmount,
  getHealingUses,
  isConsumable,
  discardAfterAttack,
  isVehicle,
  getVehicleEffect,
  hasRangedAttack,
  getRangedRange,
  getMineDamage,
  getAttackDogHealth,
  isExplosivesComponent,
  getMatchingComponent,
  getExtraAccessorySlots,
  isArmor,
} from '../src/rules/equipment-effects.js';

/**
 * Equipment Effects Registry Tests
 *
 * Tests for all helper functions in equipment-effects.ts
 * Verifies that each equipment's effects are correctly defined and accessible.
 */
describe('Equipment Effects Registry', () => {
  describe('getEquipmentEffect', () => {
    it('should return effect data for known equipment', () => {
      expect(getEquipmentEffect('9mm-handgun')).toBeDefined();
      expect(getEquipmentEffect('medical-kit')).toBeDefined();
      expect(getEquipmentEffect('grenade')).toBeDefined();
    });

    it('should return undefined for unknown equipment', () => {
      expect(getEquipmentEffect('unknown-item')).toBeUndefined();
      expect(getEquipmentEffect('')).toBeUndefined();
    });

    it('should include id in returned effect', () => {
      const effect = getEquipmentEffect('9mm-handgun');
      expect(effect?.id).toBe('9mm-handgun');
    });
  });

  describe('Weapon Categories', () => {
    describe('Handguns', () => {
      it('should identify all handgun variants', () => {
        expect(isHandgun('9mm-handgun')).toBe(true);
        expect(isHandgun('9mm-handgun-with-ap-ammo')).toBe(true);
        expect(isHandgun('9mm-handgun-with-laser-sight')).toBe(true);
        expect(isHandgun('45-caliber-handgun')).toBe(true);
        expect(isHandgun('45-caliber-handgun-with-ap-ammo')).toBe(true);
        expect(isHandgun('45-caliber-handgun-with-laser-sight')).toBe(true);
      });

      it('should not identify non-handguns as handguns', () => {
        expect(isHandgun('uzi')).toBe(false);
        expect(isHandgun('m16')).toBe(false);
        expect(isHandgun('grenade')).toBe(false);
      });
    });

    describe('Uzis', () => {
      it('should identify all Uzi variants', () => {
        expect(isUzi('uzi')).toBe(true);
        expect(isUzi('uzi-with-ap-ammo')).toBe(true);
      });

      it('should not identify non-Uzis as Uzis', () => {
        expect(isUzi('9mm-handgun')).toBe(false);
        expect(isUzi('m16')).toBe(false);
      });
    });

    describe('Explosives', () => {
      it('should identify grenades and mortar as explosives', () => {
        expect(isExplosive('grenade')).toBe(true);
        expect(isExplosive('fragmentation-grenade')).toBe(true);
        expect(isExplosive('mortar')).toBe(true);
      });

      it('should not identify non-explosives', () => {
        expect(isExplosive('m16')).toBe(false);
        expect(isExplosive('smaw')).toBe(false); // SMAW is its own category
      });
    });

    describe('SMAW', () => {
      it('should identify SMAW', () => {
        expect(isSmaw('smaw')).toBe(true);
      });

      it('should not identify other weapons as SMAW', () => {
        expect(isSmaw('m16')).toBe(false);
        expect(isSmaw('grenade')).toBe(false);
      });
    });

    describe('isWeaponCategory helper', () => {
      it('should correctly categorize weapons', () => {
        expect(isWeaponCategory('9mm-handgun', 'handgun')).toBe(true);
        expect(isWeaponCategory('uzi', 'uzi')).toBe(true);
        expect(isWeaponCategory('grenade', 'explosive')).toBe(true);
        expect(isWeaponCategory('m16', 'rifle')).toBe(true);
        expect(isWeaponCategory('smaw', 'smaw')).toBe(true);
      });

      it('should return false for incorrect categories', () => {
        expect(isWeaponCategory('9mm-handgun', 'rifle')).toBe(false);
        expect(isWeaponCategory('uzi', 'handgun')).toBe(false);
      });
    });
  });

  describe('Special Equipment', () => {
    describe('Land Mines', () => {
      it('should identify land mines', () => {
        expect(isLandMine('land-mine')).toBe(true);
      });

      it('should not identify non-mines as land mines', () => {
        expect(isLandMine('grenade')).toBe(false);
        expect(isLandMine('medical-kit')).toBe(false);
      });

      it('should return correct mine damage', () => {
        expect(getMineDamage('land-mine')).toBe(1);
        expect(getMineDamage('grenade')).toBe(0);
      });
    });

    describe('Attack Dogs', () => {
      it('should identify attack dogs', () => {
        expect(isAttackDog('attack-dog')).toBe(true);
      });

      it('should not identify non-dogs as attack dogs', () => {
        expect(isAttackDog('medical-kit')).toBe(false);
      });

      it('should return correct attack dog health', () => {
        expect(getAttackDogHealth('attack-dog')).toBe(3);
        expect(getAttackDogHealth('medical-kit')).toBe(0);
      });
    });

    describe('Epinephrine', () => {
      it('should identify epinephrine shot', () => {
        expect(isEpinephrine('epinephrine-shot')).toBe(true);
      });

      it('should not identify other items as epinephrine', () => {
        expect(isEpinephrine('medical-kit')).toBe(false);
        expect(isEpinephrine('first-aid-kit')).toBe(false);
      });
    });

    describe('Repair Kit', () => {
      it('should identify repair kit', () => {
        expect(isRepairKit('repair-kit')).toBe(true);
      });

      it('should not identify other items as repair kit', () => {
        expect(isRepairKit('medical-kit')).toBe(false);
      });
    });

    describe('Bandolier', () => {
      it('should provide extra accessory slots', () => {
        expect(getExtraAccessorySlots('bandolier')).toBe(3);
      });

      it('should return 0 for items without extra slots', () => {
        expect(getExtraAccessorySlots('medical-kit')).toBe(0);
        expect(getExtraAccessorySlots('grenade')).toBe(0);
      });
    });
  });

  describe('Healing Items', () => {
    it('should identify healing items', () => {
      expect(isHealingItem('medical-kit')).toBe(true);
      expect(isHealingItem('first-aid-kit')).toBe(true);
    });

    it('should not identify non-healing items', () => {
      expect(isHealingItem('grenade')).toBe(false);
      expect(isHealingItem('9mm-handgun')).toBe(false);
      expect(isHealingItem('epinephrine-shot')).toBe(false); // Prevents death, doesn't heal
    });

    it('should return correct heal amount', () => {
      expect(getHealAmount('medical-kit')).toBe(1);
      expect(getHealAmount('first-aid-kit')).toBe(1);
    });

    it('should return correct healing uses', () => {
      expect(getHealingUses('medical-kit')).toBe(3);
      expect(getHealingUses('first-aid-kit')).toBe(1);
    });

    it('should return 0 heal for non-healing items', () => {
      expect(getHealAmount('grenade')).toBe(0);
      expect(getHealingUses('grenade')).toBe(0);
    });
  });

  describe('Consumable Items', () => {
    it('should identify consumable items', () => {
      expect(isConsumable('medical-kit')).toBe(true);
      expect(isConsumable('first-aid-kit')).toBe(true);
      expect(isConsumable('grenade')).toBe(true);
      expect(isConsumable('land-mine')).toBe(true);
      expect(isConsumable('epinephrine-shot')).toBe(true);
      expect(isConsumable('repair-kit')).toBe(true);
    });

    it('should not identify permanent items as consumable', () => {
      expect(isConsumable('9mm-handgun')).toBe(false);
      expect(isConsumable('m16')).toBe(false);
      expect(isConsumable('bandolier')).toBe(false);
      expect(isConsumable('attack-dog')).toBe(false);
    });

    it('should identify items discarded after attack', () => {
      expect(discardAfterAttack('grenade')).toBe(true);
      expect(discardAfterAttack('fragmentation-grenade')).toBe(true);
    });

    it('should not mark non-attack items for discard', () => {
      expect(discardAfterAttack('medical-kit')).toBe(false);
      expect(discardAfterAttack('land-mine')).toBe(false);
    });
  });

  describe('Vehicles', () => {
    it('should identify all vehicles', () => {
      expect(isVehicle('chopper')).toBe(true);
      expect(isVehicle('deuce')).toBe(true);
      expect(isVehicle('humvee')).toBe(true);
      expect(isVehicle('jeep')).toBe(true);
      expect(isVehicle('tank')).toBe(true);
    });

    it('should not identify non-vehicles', () => {
      expect(isVehicle('9mm-handgun')).toBe(false);
      expect(isVehicle('medical-kit')).toBe(false);
    });

    it('should return correct vehicle effects for chopper', () => {
      const chopper = getVehicleEffect('chopper');
      expect(chopper).toBeDefined();
      expect(chopper?.movementSpaces).toBe(2);
      expect(chopper?.actionsRequired).toBe(1);
      expect(chopper?.capacity).toBe(4);
      expect(chopper?.diagonalMovement).toBe(true);
    });

    it('should return correct vehicle effects for deuce', () => {
      const deuce = getVehicleEffect('deuce');
      expect(deuce).toBeDefined();
      expect(deuce?.movementSpaces).toBe(1);
      expect(deuce?.capacity).toBe(10);
    });

    it('should return correct vehicle effects for tank', () => {
      const tank = getVehicleEffect('tank');
      expect(tank).toBeDefined();
      expect(tank?.actionsRequired).toBe(2);
    });

    it('should return undefined for non-vehicles', () => {
      expect(getVehicleEffect('9mm-handgun')).toBeUndefined();
    });
  });

  describe('Ranged Attack', () => {
    it('should identify Mortar as having ranged attack', () => {
      expect(hasRangedAttack('mortar')).toBe(true);
      expect(getRangedRange('mortar')).toBe(1);
    });

    it('should not identify regular weapons as ranged attack', () => {
      expect(hasRangedAttack('m16')).toBe(false);
      expect(hasRangedAttack('grenade')).toBe(false);
      expect(hasRangedAttack('smaw')).toBe(false);
      expect(getRangedRange('m16')).toBe(0);
    });

    it('should allow mortar to bombard adjacent sector without entering', () => {
      // Mortar description: "Spend an action to bombard an adjacent sector
      // with damage without entering the sector"
      const mortarEffect = getEquipmentEffect('mortar');
      expect(mortarEffect?.rangedAttack).toBe(true);
      expect(mortarEffect?.rangedRange).toBe(1);
      expect(mortarEffect?.consumable).toBe(true);
      expect(mortarEffect?.discardAfterAttack).toBe(true);
    });
  });

  describe('Win Condition Components (Expansion B)', () => {
    it('should identify explosives component items', () => {
      expect(isExplosivesComponent('detonator')).toBe(true);
      expect(isExplosivesComponent('explosives')).toBe(true);
    });

    it('should not identify regular items as explosives components', () => {
      expect(isExplosivesComponent('grenade')).toBe(false);
      expect(isExplosivesComponent('land-mine')).toBe(false);
    });

    it('should return matching component', () => {
      expect(getMatchingComponent('detonator')).toBe('explosives');
      expect(getMatchingComponent('explosives')).toBe('detonator');
    });

    it('should return undefined for non-component items', () => {
      expect(getMatchingComponent('grenade')).toBeUndefined();
    });
  });

  describe('Rifles', () => {
    it('should identify M16 variants as rifles', () => {
      expect(isWeaponCategory('m16', 'rifle')).toBe(true);
      expect(isWeaponCategory('m16-with-ap-ammo', 'rifle')).toBe(true);
      expect(isWeaponCategory('m16-with-burst-fire', 'rifle')).toBe(true);
      expect(isWeaponCategory('m16-with-laser-sight', 'rifle')).toBe(true);
    });

    it('should identify AK-47 variants as rifles', () => {
      expect(isWeaponCategory('ak-47', 'rifle')).toBe(true);
      expect(isWeaponCategory('ak-47-with-bipod', 'rifle')).toBe(true);
      expect(isWeaponCategory('ak-47-with-burst-fire', 'rifle')).toBe(true);
      expect(isWeaponCategory('ak-47-with-full-auto', 'rifle')).toBe(true);
    });

    it('should identify 50 caliber variants as rifles', () => {
      expect(isWeaponCategory('50-caliber-rifle', 'rifle')).toBe(true);
      expect(isWeaponCategory('50-caliber-rifle-with-flir-scope', 'rifle')).toBe(true);
    });
  });

  describe('Armor Items', () => {
    describe('Body Armor variants', () => {
      it('should identify body armor as armor', () => {
        expect(isArmor('body-armor')).toBe(true);
      });

      it('should identify body armor with ceramic plates as armor', () => {
        expect(isArmor('body-armor-with-ceramic-plates')).toBe(true);
      });

      it('should identify body armor with ceramic plates and kevlar helmet as armor', () => {
        expect(isArmor('body-armor-with-ceramic-plates-and-kevlar-helmet')).toBe(true);
      });
    });

    describe('Flak Vest variants', () => {
      it('should identify flak vest as armor', () => {
        expect(isArmor('flak-vest')).toBe(true);
      });

      it('should identify flak vest with kevlar helmet as armor', () => {
        expect(isArmor('flak-vest-with-kevlar-helmet')).toBe(true);
      });

      it('should identify flak vest with ceramic plates and kevlar helmet as armor', () => {
        expect(isArmor('flak-vest-with-ceramic-plates-and-kevlar-helmet')).toBe(true);
      });
    });

    describe('Kevlar Vest variants', () => {
      it('should identify kevlar vest as armor', () => {
        expect(isArmor('kevlar-vest')).toBe(true);
      });

      it('should identify kevlar vest with ceramic plates as armor', () => {
        expect(isArmor('kevlar-vest-with-ceramic-plates')).toBe(true);
      });

      it('should identify kevlar vest with ceramic plates and kevlar helmet as armor', () => {
        expect(isArmor('kevlar-vest-with-ceramic-plates-and-kevlar-helmet')).toBe(true);
      });
    });

    describe('Other Armor', () => {
      it('should identify full body armor as armor', () => {
        expect(isArmor('full-body-armor')).toBe(true);
      });

      it('should identify ghillie suit as armor', () => {
        expect(isArmor('ghillie-suit')).toBe(true);
      });
    });

    describe('Non-armor items', () => {
      it('should not identify weapons as armor', () => {
        expect(isArmor('9mm-handgun')).toBe(false);
        expect(isArmor('m16')).toBe(false);
        expect(isArmor('uzi')).toBe(false);
      });

      it('should not identify accessories as armor', () => {
        expect(isArmor('medical-kit')).toBe(false);
        expect(isArmor('bandolier')).toBe(false);
        expect(isArmor('grenade')).toBe(false);
      });
    });
  });

  describe('Registry Completeness', () => {
    it('should have entries for all handguns', () => {
      const handguns = Object.keys(EQUIPMENT_EFFECTS).filter(id =>
        EQUIPMENT_EFFECTS[id].weaponCategory === 'handgun'
      );
      expect(handguns.length).toBe(6);
    });

    it('should have entries for all vehicles', () => {
      const vehicles = Object.keys(EQUIPMENT_EFFECTS).filter(id =>
        EQUIPMENT_EFFECTS[id].vehicle !== undefined
      );
      expect(vehicles.length).toBe(5);
    });

    it('should have entries for healing items', () => {
      const healingItems = Object.keys(EQUIPMENT_EFFECTS).filter(id =>
        EQUIPMENT_EFFECTS[id].healing !== undefined
      );
      expect(healingItems.length).toBeGreaterThanOrEqual(2);
    });

    it('should have entries for all armor items', () => {
      const armorItems = Object.keys(EQUIPMENT_EFFECTS).filter(id =>
        EQUIPMENT_EFFECTS[id].isArmor === true
      );
      expect(armorItems.length).toBe(11);
    });

    it('should have entries for explosives including mortar', () => {
      const explosives = Object.keys(EQUIPMENT_EFFECTS).filter(id =>
        EQUIPMENT_EFFECTS[id].weaponCategory === 'explosive'
      );
      expect(explosives.length).toBe(3); // grenade, fragmentation-grenade, mortar
    });
  });
});
