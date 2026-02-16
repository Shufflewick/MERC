import { describe, it, expect, beforeEach } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame, RebelPlayer } from '../src/rules/game.js';
import { CombatantModel, Equipment } from '../src/rules/elements.js';
import { ignoresInitiativePenalties, drawsEquipmentForSquad } from '../src/rules/merc-abilities.js';

/**
 * Hagness & Vulture Ability Tests
 *
 * Tests for:
 * - Hagness: Draw equipment for squad (spend 1 action to draw equipment and give to squad member)
 * - Vulture: Ignores equipment initiative penalties
 */
describe('Hagness Ability Tests', () => {
  let game: MERCGame;
  let rebel: RebelPlayer;

  beforeEach(() => {
    const testGame = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'hagness-test-seed',
    });
    game = testGame.game;
    rebel = game.rebelPlayers[0];
  });

  // Helper to get a specific MERC from deck
  function getMercFromDeck(combatantId: string): CombatantModel | undefined {
    return game.mercDeck.all(CombatantModel).filter(c => c.isMerc).find(m => m.combatantId === combatantId);
  }

  // Helper to set up Hagness with a squad mate in rebel team
  function setupHagnessSquad(): { hagness: CombatantModel; squadMate: CombatantModel } | null {
    const hagness = getMercFromDeck('hagness');
    const basic = getMercFromDeck('basic') || getMercFromDeck('sarge');

    if (!hagness || !basic) {
      console.log('Required MERCs not in deck');
      return null;
    }

    // Add to rebel team
    rebel.team.push(hagness);
    rebel.team.push(basic);

    // Put in primary squad
    hagness.putInto(rebel.primarySquad);
    basic.putInto(rebel.primarySquad);

    // Reset actions
    hagness.resetActions();
    basic.resetActions();

    return { hagness, squadMate: basic };
  }

  describe('Ability Registry', () => {
    it('Hagness should have drawsEquipmentForSquad ability', () => {
      expect(drawsEquipmentForSquad('hagness')).toBe(true);
    });

    it('Other MERCs should not have drawsEquipmentForSquad ability', () => {
      expect(drawsEquipmentForSquad('basic')).toBe(false);
      expect(drawsEquipmentForSquad('sarge')).toBe(false);
    });
  });

  describe('Equipment Drawing', () => {
    it('should draw from Weapon deck when Weapon type selected', () => {
      const initialWeaponCount = game.weaponsDeck.count(Equipment);
      const initialArmorCount = game.armorDeck.count(Equipment);
      const initialAccessoryCount = game.accessoriesDeck.count(Equipment);

      const weapon = game.drawEquipment('Weapon');

      expect(weapon).toBeDefined();
      expect(weapon?.equipmentType).toBe('Weapon');
      expect(game.weaponsDeck.count(Equipment)).toBe(initialWeaponCount - 1);
      // Other decks should be unchanged
      expect(game.armorDeck.count(Equipment)).toBe(initialArmorCount);
      expect(game.accessoriesDeck.count(Equipment)).toBe(initialAccessoryCount);
    });

    it('should draw from Armor deck when Armor type selected', () => {
      const initialWeaponCount = game.weaponsDeck.count(Equipment);
      const initialArmorCount = game.armorDeck.count(Equipment);

      const armor = game.drawEquipment('Armor');

      expect(armor).toBeDefined();
      expect(armor?.equipmentType).toBe('Armor');
      expect(game.armorDeck.count(Equipment)).toBe(initialArmorCount - 1);
      expect(game.weaponsDeck.count(Equipment)).toBe(initialWeaponCount);
    });

    it('should draw from Accessory deck when Accessory type selected', () => {
      const initialAccessoryCount = game.accessoriesDeck.count(Equipment);

      const accessory = game.drawEquipment('Accessory');

      expect(accessory).toBeDefined();
      expect(accessory?.equipmentType).toBe('Accessory');
      expect(game.accessoriesDeck.count(Equipment)).toBe(initialAccessoryCount - 1);
    });
  });

  describe('Equipment Assignment', () => {
    it('should equip weapon to MERC', () => {
      const setup = setupHagnessSquad();
      if (!setup) return;
      const { hagness } = setup;

      const weapon = game.drawEquipment('Weapon');
      expect(weapon).toBeDefined();

      const result = hagness.equip(weapon!);

      expect(result.replaced).toBeUndefined(); // No previous weapon
      expect(result.displacedBandolierItems).toEqual([]);
      expect(hagness.weaponSlot).toBe(weapon);
    });

    it('should replace existing equipment of same type', () => {
      const setup = setupHagnessSquad();
      if (!setup) return;
      const { hagness } = setup;

      const weapon1 = game.drawEquipment('Weapon');
      const weapon2 = game.drawEquipment('Weapon');
      expect(weapon1).toBeDefined();
      expect(weapon2).toBeDefined();

      hagness.equip(weapon1!);
      const result = hagness.equip(weapon2!);

      expect(result.replaced).toBe(weapon1);
      expect(result.displacedBandolierItems).toEqual([]);
      expect(hagness.weaponSlot).toBe(weapon2);
    });

    it('should equip armor to armor slot', () => {
      const setup = setupHagnessSquad();
      if (!setup) return;
      const { hagness } = setup;

      const armor = game.drawEquipment('Armor');
      expect(armor).toBeDefined();

      hagness.equip(armor!);

      expect(hagness.armorSlot).toBe(armor);
    });

    it('should equip accessory to accessory slot', () => {
      const setup = setupHagnessSquad();
      if (!setup) return;
      const { hagness } = setup;

      const accessory = game.drawEquipment('Accessory');
      expect(accessory).toBeDefined();

      hagness.equip(accessory!);

      expect(hagness.accessorySlot).toBe(accessory);
    });
  });

  describe('Action Point Consumption', () => {
    it('useAction should reduce actionsRemaining', () => {
      const setup = setupHagnessSquad();
      if (!setup) return;
      const { hagness } = setup;

      const initialActions = hagness.actionsRemaining;
      expect(initialActions).toBeGreaterThan(0);

      hagness.useAction(1);

      expect(hagness.actionsRemaining).toBe(initialActions - 1);
    });
  });

  describe('Full Hagness Action Flow (Unit Test)', () => {
    it('should draw 3 and pick 1 to equip to squad mate', () => {
      const setup = setupHagnessSquad();
      if (!setup) return;
      const { hagness, squadMate } = setup;

      const initialActions = hagness.actionsRemaining;
      const initialWeaponCount = game.weaponsDeck.count(Equipment);

      // Simulate Hagness draw-3-pick-1 flow:
      // 1. Draw 3 weapons
      const drawn: Equipment[] = [];
      for (let i = 0; i < 3; i++) {
        const eq = game.drawEquipment('Weapon');
        if (eq) drawn.push(eq);
      }
      expect(drawn.length).toBe(3);
      expect(drawn.every(e => e.equipmentType === 'Weapon')).toBe(true);

      // 2. Pick one (first drawn)
      const chosen = drawn[0];

      // 3. Unchosen 2 stay in discard (drawEquipment draws to discard as holding area)
      // No explicit action needed — they remain in weaponsDiscard

      // 4. Equip chosen to squad mate
      const result = squadMate.equip(chosen);
      expect(result.replaced).toBeUndefined();

      // 5. Consume action
      hagness.useAction(1);

      // Verify results
      expect(squadMate.weaponSlot).toBe(chosen);
      expect(hagness.actionsRemaining).toBe(initialActions - 1);
      // 3 drawn from deck
      expect(game.weaponsDeck.count(Equipment)).toBe(initialWeaponCount - 3);
    });

    it('drawing 3 reduces deck by 3, unchosen 2 remain in discard (net -1 from deck)', () => {
      const initialWeaponDeckCount = game.weaponsDeck.count(Equipment);
      const initialWeaponDiscardCount = game.weaponsDiscard?.count(Equipment) ?? 0;

      // Draw 3
      const drawn: Equipment[] = [];
      for (let i = 0; i < 3; i++) {
        const eq = game.drawEquipment('Weapon');
        if (eq) drawn.push(eq);
      }
      expect(drawn.length).toBe(3);

      // Deck reduced by 3
      expect(game.weaponsDeck.count(Equipment)).toBe(initialWeaponDeckCount - 3);
      // All 3 are in discard (drawEquipment draws to discard as holding area)
      expect(game.weaponsDiscard.count(Equipment)).toBe(initialWeaponDiscardCount + 3);

      // Simulate choosing one: move it out of discard to a MERC
      const setup = setupHagnessSquad();
      if (!setup) return;
      const { squadMate } = setup;
      squadMate.equip(drawn[0]);

      // Now discard has 2 unchosen, deck is -3
      expect(game.weaponsDiscard.count(Equipment)).toBe(initialWeaponDiscardCount + 2);
    });

    it('should handle fewer than 3 cards available in deck', () => {
      // Drain the weapon deck to only 2 cards
      const weaponCount = game.weaponsDeck.count(Equipment);
      for (let i = 0; i < weaponCount - 2; i++) {
        game.drawEquipment('Weapon');
      }
      expect(game.weaponsDeck.count(Equipment)).toBe(2);

      // Draw 3 — should get only 2
      const drawn: Equipment[] = [];
      for (let i = 0; i < 3; i++) {
        const eq = game.drawEquipment('Weapon');
        if (eq) drawn.push(eq);
      }

      // Should have drawn 2 (or possibly more if reshuffle kicked in)
      expect(drawn.length).toBeGreaterThanOrEqual(2);
      expect(drawn.every(e => e.equipmentType === 'Weapon')).toBe(true);
    });

    it('should draw from correct deck type (not cross-contaminate)', () => {
      // This tests the bug where "Weapon" selection drew an Accessory
      const initialWeaponCount = game.weaponsDeck.count(Equipment);
      const initialArmorCount = game.armorDeck.count(Equipment);
      const initialAccessoryCount = game.accessoriesDeck.count(Equipment);

      // Draw one of each type
      const weapon = game.drawEquipment('Weapon');
      const armor = game.drawEquipment('Armor');
      const accessory = game.drawEquipment('Accessory');

      // Verify types match
      expect(weapon?.equipmentType).toBe('Weapon');
      expect(armor?.equipmentType).toBe('Armor');
      expect(accessory?.equipmentType).toBe('Accessory');

      // Verify deck counts
      expect(game.weaponsDeck.count(Equipment)).toBe(initialWeaponCount - 1);
      expect(game.armorDeck.count(Equipment)).toBe(initialArmorCount - 1);
      expect(game.accessoriesDeck.count(Equipment)).toBe(initialAccessoryCount - 1);
    });

    it('should draw correct type even after drawing different type (cache isolation)', () => {
      // This tests the bug where drawing Weapon after previously drawing Accessory
      // would give the cached Accessory instead of a new Weapon
      const weapon1 = game.drawEquipment('Weapon');
      expect(weapon1?.equipmentType).toBe('Weapon');

      const accessory = game.drawEquipment('Accessory');
      expect(accessory?.equipmentType).toBe('Accessory');

      const weapon2 = game.drawEquipment('Weapon');
      expect(weapon2?.equipmentType).toBe('Weapon');

      // Each draw should be from the correct deck
      expect(weapon1?.equipmentType).toBe('Weapon');
      expect(accessory?.equipmentType).toBe('Accessory');
      expect(weapon2?.equipmentType).toBe('Weapon');
    });
  });
});

describe('Vulture Ability Tests', () => {
  let game: MERCGame;
  let rebel: RebelPlayer;

  beforeEach(() => {
    const testGame = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'vulture-test-seed',
    });
    game = testGame.game;
    rebel = game.rebelPlayers[0];
  });

  // Helper to get a specific MERC from deck
  function getMercFromDeck(combatantId: string): CombatantModel | undefined {
    return game.mercDeck.all(CombatantModel).filter(c => c.isMerc).find(m => m.combatantId === combatantId);
  }

  // Helper to find equipment with initiative penalty
  function findEquipmentWithInitiativePenalty(): Equipment | undefined {
    // Look for equipment with negative initiative (penalty)
    const allEquipment = [
      ...game.weaponsDeck.all(Equipment),
      ...game.armorDeck.all(Equipment),
      ...game.accessoriesDeck.all(Equipment),
    ];
    return allEquipment.find(e => e.initiative < 0);
  }

  // Helper to find equipment with initiative bonus
  function findEquipmentWithInitiativeBonus(): Equipment | undefined {
    const allEquipment = [
      ...game.weaponsDeck.all(Equipment),
      ...game.armorDeck.all(Equipment),
      ...game.accessoriesDeck.all(Equipment),
    ];
    return allEquipment.find(e => e.initiative > 0);
  }

  describe('Ability Registry', () => {
    it('Vulture should have ignoresInitiativePenalties ability', () => {
      expect(ignoresInitiativePenalties('vulture')).toBe(true);
    });

    it('Other MERCs should not ignore initiative penalties', () => {
      expect(ignoresInitiativePenalties('basic')).toBe(false);
      expect(ignoresInitiativePenalties('hagness')).toBe(false);
    });
  });

  describe('Initiative Calculation', () => {
    it('regular MERC should have initiative reduced by equipment penalty', () => {
      const basic = getMercFromDeck('basic');
      if (!basic) {
        console.log('Basic not in deck, skipping test');
        return;
      }

      const equipWithPenalty = findEquipmentWithInitiativePenalty();
      if (!equipWithPenalty) {
        console.log('No equipment with initiative penalty found, skipping test');
        return;
      }

      const baseInit = basic.baseInitiative;
      const penalty = equipWithPenalty.initiative; // negative number
      console.log(`Basic base init: ${baseInit}, Equipment penalty: ${penalty}`);

      basic.equip(equipWithPenalty);

      // For regular MERC, effective initiative should include penalty
      const effectiveInit = basic.getEffectiveInitiative();
      expect(effectiveInit).toBe(baseInit + penalty); // penalty is negative
    });

    it('Vulture should NOT have initiative reduced by equipment penalty', () => {
      const vulture = getMercFromDeck('vulture');
      if (!vulture) {
        console.log('Vulture not in deck, skipping test');
        return;
      }

      const equipWithPenalty = findEquipmentWithInitiativePenalty();
      if (!equipWithPenalty) {
        console.log('No equipment with initiative penalty found, skipping test');
        return;
      }

      const baseInit = vulture.baseInitiative;
      const penalty = equipWithPenalty.initiative; // negative number
      console.log(`Vulture base init: ${baseInit}, Equipment penalty: ${penalty}`);

      vulture.equip(equipWithPenalty);

      // Vulture should ignore negative initiative
      const effectiveInit = vulture.getEffectiveInitiative();
      expect(effectiveInit).toBe(baseInit); // Should NOT include penalty
    });

    it('Vulture should still get initiative BONUS from equipment', () => {
      const vulture = getMercFromDeck('vulture');
      if (!vulture) {
        console.log('Vulture not in deck, skipping test');
        return;
      }

      const equipWithBonus = findEquipmentWithInitiativeBonus();
      if (!equipWithBonus) {
        console.log('No equipment with initiative bonus found, skipping test');
        return;
      }

      const baseInit = vulture.baseInitiative;
      const bonus = equipWithBonus.initiative; // positive number
      console.log(`Vulture base init: ${baseInit}, Equipment bonus: ${bonus}`);

      vulture.equip(equipWithBonus);

      // Vulture SHOULD get positive bonuses
      const effectiveInit = vulture.getEffectiveInitiative();
      expect(effectiveInit).toBe(baseInit + bonus);
    });

    it('Vulture with mixed equipment should ignore only penalties', () => {
      const vulture = getMercFromDeck('vulture');
      if (!vulture) {
        console.log('Vulture not in deck, skipping test');
        return;
      }

      const equipWithBonus = findEquipmentWithInitiativeBonus();
      const equipWithPenalty = findEquipmentWithInitiativePenalty();

      if (!equipWithBonus || !equipWithPenalty) {
        console.log('Could not find equipment with both bonus and penalty, skipping test');
        return;
      }

      // Make sure they're different slot types
      if (equipWithBonus.equipmentType === equipWithPenalty.equipmentType) {
        console.log('Bonus and penalty equipment are same type, skipping test');
        return;
      }

      const baseInit = vulture.baseInitiative;
      const bonus = equipWithBonus.initiative;
      const penalty = equipWithPenalty.initiative;
      console.log(`Vulture base: ${baseInit}, bonus: ${bonus}, penalty: ${penalty}`);

      vulture.equip(equipWithBonus);
      vulture.equip(equipWithPenalty);

      // Vulture: base + bonus + 0 (penalty ignored)
      const effectiveInit = vulture.getEffectiveInitiative();
      expect(effectiveInit).toBe(baseInit + bonus);
    });
  });
});
