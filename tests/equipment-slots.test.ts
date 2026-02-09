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
   * Helper to get non-bandolier accessories from the deck.
   * Returns a fresh snapshot each time (items move out of deck when equipped).
   */
  function getNonBandolierAccessories(): Equipment[] {
    return game.accessoriesDeck.all(Equipment)
      .filter(e => e.equipmentId !== 'bandolier');
  }

  describe('Non-bandolier equip operations', () => {
    it('equip weapon returns EquipResult with empty displacedBandolierItems', () => {
      const merc = findMerc('basic');
      if (!merc) return;

      const weapon = game.weaponsDeck.first(Equipment);
      if (!weapon) return;

      const result = merc.equip(weapon);
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

      const accessory = getNonBandolierAccessories()[0];
      if (!accessory) return;

      const result = merc.equip(accessory);
      expect(result).toHaveProperty('displacedBandolierItems');
      expect(result.displacedBandolierItems).toEqual([]);
      expect(result.replaced).toBeUndefined();
    });

    it('equip accessory into bandolier slot returns empty displacedBandolierItems', () => {
      const merc = findMerc('basic');
      if (!merc) return;

      const bandolier = game.accessoriesDeck.all(Equipment)
        .find(e => e.equipmentId === 'bandolier');
      if (!bandolier) return;

      // First equip the bandolier
      merc.equip(bandolier);
      expect(merc.accessorySlot?.equipmentId).toBe('bandolier');
      expect(merc.getMaxBandolierSlots()).toBe(3);

      // Now equip a non-bandolier accessory - should go into bandolier slot
      const accessory = getNonBandolierAccessories()[0];
      if (!accessory) return;

      const result = merc.equip(accessory);
      expect(result.displacedBandolierItems).toEqual([]);
      expect(result.replaced).toBeUndefined();
    });

    it('replace non-bandolier accessory returns empty displacedBandolierItems', () => {
      const merc = findMerc('basic');
      if (!merc) return;

      const acc1 = getNonBandolierAccessories()[0];
      if (!acc1) return;
      merc.equip(acc1);

      const acc2 = getNonBandolierAccessories()[0];
      if (!acc2) return;
      const result = merc.equip(acc2);

      expect(result.replaced).toBe(acc1);
      expect(result.displacedBandolierItems).toEqual([]);
    });
  });

  describe('Bandolier replacement', () => {
    it('replacing bandolier with items returns displaced bandolier contents', () => {
      const merc = findMerc('basic');
      if (!merc) return;

      const bandolier = game.accessoriesDeck.all(Equipment)
        .find(e => e.equipmentId === 'bandolier');
      if (!bandolier) return;

      // Equip the bandolier
      merc.equip(bandolier);

      // Fill ALL 3 bandolier slots with accessories
      const item1 = getNonBandolierAccessories()[0];
      if (!item1) return;
      merc.equip(item1);

      const item2 = getNonBandolierAccessories()[0];
      if (!item2) return;
      merc.equip(item2);

      const item3 = getNonBandolierAccessories()[0];
      if (!item3) return;
      merc.equip(item3);

      expect(merc.bandolierSlots.length).toBe(3);

      // Now find one more accessory to replace the bandolier
      const replacementAccessory = getNonBandolierAccessories()[0];
      if (!replacementAccessory) return;

      // Replace the bandolier - should return displaced items
      const result = merc.equip(replacementAccessory);

      expect(result.replaced).toBe(bandolier);
      expect(result.displacedBandolierItems).toHaveLength(3);
      expect(result.displacedBandolierItems).toContain(item1);
      expect(result.displacedBandolierItems).toContain(item2);
      expect(result.displacedBandolierItems).toContain(item3);
    });

    it('after replacing bandolier, bandolierSlots is empty', () => {
      const merc = findMerc('basic');
      if (!merc) return;

      const bandolier = game.accessoriesDeck.all(Equipment)
        .find(e => e.equipmentId === 'bandolier');
      if (!bandolier) return;

      merc.equip(bandolier);

      // Fill all 3 bandolier slots
      const item1 = getNonBandolierAccessories()[0];
      if (!item1) return;
      merc.equip(item1);

      const item2 = getNonBandolierAccessories()[0];
      if (!item2) return;
      merc.equip(item2);

      const item3 = getNonBandolierAccessories()[0];
      if (!item3) return;
      merc.equip(item3);

      expect(merc.bandolierSlots.length).toBe(3);

      // Replace with a non-bandolier accessory
      const replacement = getNonBandolierAccessories()[0];
      if (!replacement) return;

      merc.equip(replacement);

      expect(merc.bandolierSlots).toEqual([]);
    });

    it('after replacing bandolier, getMaxBandolierSlots() is 0', () => {
      const merc = findMerc('basic');
      if (!merc) return;

      const bandolier = game.accessoriesDeck.all(Equipment)
        .find(e => e.equipmentId === 'bandolier');
      if (!bandolier) return;

      merc.equip(bandolier);
      expect(merc.getMaxBandolierSlots()).toBe(3);

      // Fill all 3 bandolier slots
      const item1 = getNonBandolierAccessories()[0];
      if (!item1) return;
      merc.equip(item1);

      const item2 = getNonBandolierAccessories()[0];
      if (!item2) return;
      merc.equip(item2);

      const item3 = getNonBandolierAccessories()[0];
      if (!item3) return;
      merc.equip(item3);

      // Replace bandolier
      const replacement = getNonBandolierAccessories()[0];
      if (!replacement) return;

      merc.equip(replacement);

      expect(merc.getMaxBandolierSlots()).toBe(0);
    });

    it('equip armor returns EquipResult with empty displacedBandolierItems', () => {
      const merc = findMerc('basic');
      if (!merc) return;

      const armor = game.armorDeck.first(Equipment);
      if (!armor) return;

      const result = merc.equip(armor);
      expect(result).toHaveProperty('displacedBandolierItems');
      expect(result.displacedBandolierItems).toEqual([]);
      expect(result.replaced).toBeUndefined();
    });
  });

  describe('Gunther bandolier replacement', () => {
    it('Gunther replacing bandolier in accessory slot returns displaced items', () => {
      const gunther = findMerc('gunther');
      if (!gunther) return;

      const bandolier = game.accessoriesDeck.all(Equipment)
        .find(e => e.equipmentId === 'bandolier');
      if (!bandolier) return;

      // Equip bandolier to accessory slot
      gunther.equip(bandolier);
      expect(gunther.accessorySlot?.equipmentId).toBe('bandolier');

      // Fill all 3 bandolier slots
      const item1 = getNonBandolierAccessories()[0];
      if (!item1) return;
      gunther.equip(item1);

      const item2 = getNonBandolierAccessories()[0];
      if (!item2) return;
      gunther.equip(item2);

      const item3 = getNonBandolierAccessories()[0];
      if (!item3) return;
      gunther.equip(item3);

      expect(gunther.bandolierSlots.length).toBe(3);

      // Fill weapon and armor slots with accessories (Gunther can do this)
      const weaponSlotAccessory = getNonBandolierAccessories()[0];
      if (!weaponSlotAccessory) return;
      gunther.equip(weaponSlotAccessory); // goes to weapon slot

      const armorSlotAccessory = getNonBandolierAccessories()[0];
      if (!armorSlotAccessory) return;
      gunther.equip(armorSlotAccessory); // goes to armor slot

      // Now all slots are full. Next accessory should replace accessory slot (bandolier)
      const finalAccessory = getNonBandolierAccessories()[0];
      if (!finalAccessory) return;

      const result = gunther.equip(finalAccessory);

      expect(result.replaced).toBe(bandolier);
      expect(result.displacedBandolierItems).toHaveLength(3);
      expect(result.displacedBandolierItems).toContain(item1);
      expect(result.displacedBandolierItems).toContain(item2);
      expect(result.displacedBandolierItems).toContain(item3);
    });
  });
});
