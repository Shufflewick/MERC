import { describe, it, expect, beforeEach } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Equipment } from '../src/rules/elements.js';

/**
 * Equipment Slot Tests — Bandolier Replacement
 *
 * Tests that equip() returns an EquipResult with both the replaced item
 * and any displaced bandolier contents, ensuring no phantom slots remain.
 */
describe('Equipment Slots - Bandolier Replacement', () => {
  let game: MERCGame;

  beforeEach(() => {
    const testGame = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'equipment-slot-test',
    });
    game = testGame.game;
  });

  /**
   * Helper to find a specific MERC from the deck.
   */
  function findMerc(mercId: string): CombatantModel | undefined {
    return game.mercDeck.all(CombatantModel)
      .filter(c => c.isMerc)
      .find(m => m.combatantId === mercId);
  }

  /**
   * Helper to find equipment by id from the accessories deck.
   */
  function findAccessory(equipmentId: string): Equipment | undefined {
    return game.accessoriesDeck.all(Equipment)
      .find(e => e.equipmentId === equipmentId);
  }

  /**
   * Helper to find a weapon from the weapons deck.
   */
  function findWeapon(): Equipment | undefined {
    return game.weaponsDeck.first(Equipment);
  }

  /**
   * Helper to find an armor from the armor deck.
   */
  function findArmor(): Equipment | undefined {
    return game.armorDeck.first(Equipment);
  }

  /**
   * Helper to find any non-bandolier accessory.
   */
  function findNonBandolierAccessory(): Equipment | undefined {
    return game.accessoriesDeck.all(Equipment)
      .find(e => e.equipmentId !== 'bandolier');
  }

  /**
   * Helper to find multiple non-bandolier accessories.
   */
  function findNonBandolierAccessories(count: number): Equipment[] {
    return game.accessoriesDeck.all(Equipment)
      .filter(e => e.equipmentId !== 'bandolier')
      .slice(0, count);
  }

  describe('Non-bandolier equip operations', () => {
    it('equip weapon returns EquipResult with empty displacedBandolierItems', () => {
      const merc = findMerc('basic');
      if (!merc) return;

      const weapon = findWeapon();
      if (!weapon) return;

      const result = merc.equip(weapon);
      // Result should be an object with replaced and displacedBandolierItems
      expect(result).toHaveProperty('displacedBandolierItems');
      expect(result.displacedBandolierItems).toEqual([]);
      expect(result.replaced).toBeUndefined();
    });

    it('equip weapon replaces existing weapon and returns it in replaced', () => {
      const merc = findMerc('basic');
      if (!merc) return;

      const weapons = game.weaponsDeck.all(Equipment).slice(0, 2);
      if (weapons.length < 2) return;

      merc.equip(weapons[0]);
      const result = merc.equip(weapons[1]);

      expect(result.replaced).toBe(weapons[0]);
      expect(result.displacedBandolierItems).toEqual([]);
    });

    it('equip accessory when no accessory slot returns empty displacedBandolierItems', () => {
      const merc = findMerc('basic');
      if (!merc) return;

      const accessory = findNonBandolierAccessory();
      if (!accessory) return;

      const result = merc.equip(accessory);
      expect(result).toHaveProperty('displacedBandolierItems');
      expect(result.displacedBandolierItems).toEqual([]);
      expect(result.replaced).toBeUndefined();
    });

    it('equip accessory into bandolier slot returns empty displacedBandolierItems', () => {
      const merc = findMerc('basic');
      if (!merc) return;

      const bandolier = findAccessory('bandolier');
      if (!bandolier) return;

      // First equip the bandolier
      merc.equip(bandolier);
      expect(merc.accessorySlot?.equipmentId).toBe('bandolier');
      expect(merc.getMaxBandolierSlots()).toBe(3);

      // Now equip a non-bandolier accessory - should go into bandolier slot
      const accessory = findNonBandolierAccessory();
      if (!accessory) return;

      const result = merc.equip(accessory);
      expect(result.displacedBandolierItems).toEqual([]);
      expect(result.replaced).toBeUndefined();
    });

    it('replace non-bandolier accessory returns empty displacedBandolierItems', () => {
      const merc = findMerc('basic');
      if (!merc) return;

      const accessories = findNonBandolierAccessories(2);
      if (accessories.length < 2) return;

      merc.equip(accessories[0]);
      const result = merc.equip(accessories[1]);

      expect(result.replaced).toBe(accessories[0]);
      expect(result.displacedBandolierItems).toEqual([]);
    });
  });

  describe('Bandolier replacement', () => {
    it('replacing bandolier with items returns displaced bandolier contents', () => {
      const merc = findMerc('basic');
      if (!merc) return;

      const bandolier = findAccessory('bandolier');
      if (!bandolier) return;

      // Equip the bandolier
      merc.equip(bandolier);

      // Fill bandolier slots with accessories
      const bandolierItems = findNonBandolierAccessories(2);
      if (bandolierItems.length < 2) return;

      for (const item of bandolierItems) {
        merc.equip(item);
      }

      expect(merc.bandolierSlots.length).toBe(2);

      // Now find one more accessory to replace the bandolier
      const replacementAccessory = game.accessoriesDeck.all(Equipment)
        .find(e => e.equipmentId !== 'bandolier' && !bandolierItems.includes(e));
      if (!replacementAccessory) return;

      // Replace the bandolier - should return displaced items
      const result = merc.equip(replacementAccessory);

      expect(result.replaced).toBe(bandolier);
      expect(result.displacedBandolierItems).toHaveLength(2);
      expect(result.displacedBandolierItems).toContain(bandolierItems[0]);
      expect(result.displacedBandolierItems).toContain(bandolierItems[1]);
    });

    it('after replacing bandolier, bandolierSlots is empty', () => {
      const merc = findMerc('basic');
      if (!merc) return;

      const bandolier = findAccessory('bandolier');
      if (!bandolier) return;

      merc.equip(bandolier);

      // Fill one bandolier slot
      const bandolierItem = findNonBandolierAccessory();
      if (!bandolierItem) return;

      merc.equip(bandolierItem);
      expect(merc.bandolierSlots.length).toBe(1);

      // Replace with a non-bandolier accessory
      const replacement = game.accessoriesDeck.all(Equipment)
        .find(e => e.equipmentId !== 'bandolier' && e !== bandolierItem);
      if (!replacement) return;

      merc.equip(replacement);

      expect(merc.bandolierSlots).toEqual([]);
    });

    it('after replacing bandolier, getMaxBandolierSlots() is 0', () => {
      const merc = findMerc('basic');
      if (!merc) return;

      const bandolier = findAccessory('bandolier');
      if (!bandolier) return;

      merc.equip(bandolier);
      expect(merc.getMaxBandolierSlots()).toBe(3);

      // Fill a bandolier slot
      const bandolierItem = findNonBandolierAccessory();
      if (!bandolierItem) return;
      merc.equip(bandolierItem);

      // Replace bandolier
      const replacement = game.accessoriesDeck.all(Equipment)
        .find(e => e.equipmentId !== 'bandolier' && e !== bandolierItem);
      if (!replacement) return;

      merc.equip(replacement);

      expect(merc.getMaxBandolierSlots()).toBe(0);
    });

    it('replacing empty bandolier returns empty displacedBandolierItems', () => {
      const merc = findMerc('basic');
      if (!merc) return;

      const bandolier = findAccessory('bandolier');
      if (!bandolier) return;

      // Equip bandolier but don't fill any slots
      merc.equip(bandolier);
      expect(merc.bandolierSlots.length).toBe(0);

      // Replace it
      const replacement = findNonBandolierAccessory();
      if (!replacement) return;

      const result = merc.equip(replacement);

      expect(result.replaced).toBe(bandolier);
      expect(result.displacedBandolierItems).toEqual([]);
    });
  });

  describe('Gunther bandolier replacement', () => {
    it('Gunther replacing bandolier in accessory slot returns displaced items', () => {
      const gunther = findMerc('gunther');
      if (!gunther) return;

      const bandolier = findAccessory('bandolier');
      if (!bandolier) return;

      // Equip bandolier to accessory slot
      gunther.equip(bandolier);
      expect(gunther.accessorySlot?.equipmentId).toBe('bandolier');

      // Fill bandolier slots
      const bandolierItems = findNonBandolierAccessories(2);
      if (bandolierItems.length < 2) return;

      for (const item of bandolierItems) {
        gunther.equip(item);
      }
      expect(gunther.bandolierSlots.length).toBe(2);

      // Fill weapon and armor slots with accessories (Gunther can do this)
      const extraAccessories = game.accessoriesDeck.all(Equipment)
        .filter(e => e.equipmentId !== 'bandolier' && !bandolierItems.includes(e))
        .slice(0, 2);
      if (extraAccessories.length < 2) return;

      // Put accessories in weapon and armor slots
      gunther.equip(extraAccessories[0]); // goes to weapon slot
      gunther.equip(extraAccessories[1]); // goes to armor slot

      // Now all slots are full. Next accessory should replace accessory slot (bandolier)
      const finalAccessory = game.accessoriesDeck.all(Equipment)
        .find(e =>
          e.equipmentId !== 'bandolier' &&
          !bandolierItems.includes(e) &&
          !extraAccessories.includes(e)
        );
      if (!finalAccessory) return;

      const result = gunther.equip(finalAccessory);

      expect(result.replaced).toBe(bandolier);
      expect(result.displacedBandolierItems).toHaveLength(2);
      expect(result.displacedBandolierItems).toContain(bandolierItems[0]);
      expect(result.displacedBandolierItems).toContain(bandolierItems[1]);
    });
  });
});
