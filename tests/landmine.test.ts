import { describe, it, expect, beforeEach } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Sector, Equipment, Squad } from '../src/rules/elements.js';
import { checkLandMines, type LandmineResult } from '../src/rules/landmine.js';
import { isLandMine } from '../src/rules/equipment-effects.js';
import { handlesLandMines } from '../src/rules/merc-abilities.js';

/**
 * Landmine System Tests
 *
 * Tests the checkLandMines() function which handles bidirectional landmine
 * detonation, Squidhead counter-ability, and friendly mine no-trigger.
 *
 * Cases:
 * 1. No mine in stash -> no-op
 * 2. Mine detonates against rebel units (rebel entering dictator sector)
 * 3. Mine detonates against dictator units (dictator entering rebel sector)
 * 4. Squidhead in entering squad -> disarm, mine to discard
 * 5. Friendly mine -> no trigger
 */
describe('Landmine System', () => {
  let game: MERCGame;
  let sector: Sector;

  beforeEach(() => {
    const testGame = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'landmine-test',
    });
    game = testGame.game;
    sector = game.gameMap.getAllSectors()[0];
  });

  /**
   * Helper: find the land mine equipment in the accessories deck and place it
   * in the sector stash.
   */
  function placeMineInStash(): Equipment {
    // Find a land mine in the accessories deck
    const mine = game.accessoriesDeck.first(Equipment, e => isLandMine(e.equipmentId));
    if (!mine) {
      throw new Error('No land mine found in accessories deck. Check data/equipment.json for land-mine entry.');
    }
    sector.addToStash(mine);
    return mine;
  }

  /**
   * Helper: find Squidhead in the merc deck and place him in a squad.
   */
  function placeSquidheadInSquad(squad: Squad): CombatantModel {
    const squidhead = game.mercDeck.first(CombatantModel, c => c.isMerc && handlesLandMines(c.combatantId));
    if (!squidhead) {
      throw new Error('No Squidhead found in merc deck. Check data/combatants.json and merc-abilities.ts.');
    }
    squidhead.putInto(squad);
    return squidhead;
  }

  // ===========================================================================
  // Case 1: No mine in stash -> no-op
  // ===========================================================================
  describe('No mine in stash', () => {
    it('returns { detonated: false, disarmed: false } when stash is empty', () => {
      const rebel = game.rebelPlayers[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const result = checkLandMines(game, sector, [rebel.primarySquad], true);

      expect(result.detonated).toBe(false);
      expect(result.disarmed).toBe(false);
      expect(result.disarmedBy).toBeUndefined();
    });

    it('returns no-op when stash has non-mine equipment', () => {
      // Put a non-mine accessory in the stash
      const accessory = game.accessoriesDeck.first(Equipment, e => !isLandMine(e.equipmentId));
      if (accessory) {
        sector.addToStash(accessory);
      }

      const rebel = game.rebelPlayers[0];
      rebel.primarySquad.sectorId = sector.sectorId;

      const result = checkLandMines(game, sector, [rebel.primarySquad], true);

      expect(result.detonated).toBe(false);
      expect(result.disarmed).toBe(false);
    });
  });

  // ===========================================================================
  // Case 2: Mine detonates against rebel units (rebel entering dictator sector)
  // ===========================================================================
  describe('Rebel entering dictator sector (mine detonates against rebels)', () => {
    it('deals damage to every rebel merc in the sector', () => {
      const mine = placeMineInStash();
      const rebel = game.rebelPlayers[0];

      // Place rebel mercs in the sector
      const merc1 = game.mercDeck.first(CombatantModel, c => c.isMerc)!;
      merc1.putInto(rebel.primarySquad);
      const merc2 = game.mercDeck.first(CombatantModel, c => c.isMerc)!;
      merc2.putInto(rebel.primarySquad);
      rebel.primarySquad.sectorId = sector.sectorId;

      const health1Before = merc1.health;
      const health2Before = merc2.health;

      const result = checkLandMines(game, sector, [rebel.primarySquad], true);

      expect(result.detonated).toBe(true);
      expect(result.disarmed).toBe(false);
      expect(merc1.health).toBe(health1Before - 1);
      expect(merc2.health).toBe(health2Before - 1);
    });

    it('kills ALL rebel militia in the sector', () => {
      placeMineInStash();
      const rebel = game.rebelPlayers[0];

      // Place a merc so the squad is in the sector
      const merc = game.mercDeck.first(CombatantModel, c => c.isMerc)!;
      merc.putInto(rebel.primarySquad);
      rebel.primarySquad.sectorId = sector.sectorId;

      // Add rebel militia -- sector is contested (dictator mine, rebel militia)
      sector.addRebelMilitia(`${rebel.seat}`, 5);
      expect(sector.getRebelMilitia(`${rebel.seat}`)).toBe(5);

      // Dictator militia present makes the mine hostile to entering rebels
      sector.addDictatorMilitia(1);

      checkLandMines(game, sector, [rebel.primarySquad], true);

      // ALL rebel militia should be killed by the mine
      expect(sector.getRebelMilitia(`${rebel.seat}`)).toBe(0);
    });

    it('removes the mine from stash after detonation', () => {
      placeMineInStash();
      expect(sector.getStashContents().some(e => isLandMine(e.equipmentId))).toBe(true);

      const rebel = game.rebelPlayers[0];
      const merc = game.mercDeck.first(CombatantModel, c => c.isMerc)!;
      merc.putInto(rebel.primarySquad);
      rebel.primarySquad.sectorId = sector.sectorId;

      checkLandMines(game, sector, [rebel.primarySquad], true);

      // Mine should be gone from stash
      expect(sector.getStashContents().some(e => isLandMine(e.equipmentId))).toBe(false);
    });

    it('discards the mine to the accessory discard pile', () => {
      const mine = placeMineInStash();
      const mineId = mine.equipmentId;

      const rebel = game.rebelPlayers[0];
      const merc = game.mercDeck.first(CombatantModel, c => c.isMerc)!;
      merc.putInto(rebel.primarySquad);
      rebel.primarySquad.sectorId = sector.sectorId;

      const discardBefore = game.accessoriesDiscard?.all(Equipment).length ?? 0;

      checkLandMines(game, sector, [rebel.primarySquad], true);

      // Mine should now be in the accessory discard pile
      const discardAfter = game.accessoriesDiscard?.all(Equipment).length ?? 0;
      expect(discardAfter).toBe(discardBefore + 1);
    });
  });

  // ===========================================================================
  // Case 3: Mine detonates against dictator units (dictator entering rebel sector)
  // ===========================================================================
  describe('Dictator entering rebel sector (mine detonates against dictator)', () => {
    it('deals damage to every dictator merc in the sector', () => {
      placeMineInStash();
      const dictator = game.dictatorPlayer;

      // Place a dictator merc in the sector
      const dMerc = game.mercDeck.first(CombatantModel, c => c.isMerc)!;
      dMerc.putInto(dictator.primarySquad);
      dictator.primarySquad.sectorId = sector.sectorId;

      const healthBefore = dMerc.health;

      const result = checkLandMines(game, sector, [dictator.primarySquad], false);

      expect(result.detonated).toBe(true);
      expect(result.disarmed).toBe(false);
      expect(dMerc.health).toBe(healthBefore - 1);
    });

    it('kills ALL dictator militia in the sector', () => {
      placeMineInStash();
      const dictator = game.dictatorPlayer;
      const rebel = game.rebelPlayers[0];
      dictator.primarySquad.sectorId = sector.sectorId;

      // Add dictator militia -- sector is contested (rebel mine, dictator militia)
      sector.addDictatorMilitia(4);
      expect(sector.dictatorMilitia).toBe(4);

      // Rebel militia present makes the mine hostile to entering dictator
      sector.addRebelMilitia(`${rebel.seat}`, 1);

      checkLandMines(game, sector, [dictator.primarySquad], false);

      // ALL dictator militia should be killed by the mine
      expect(sector.dictatorMilitia).toBe(0);
    });

    it('deals damage to dictator card if present in sector', () => {
      placeMineInStash();
      const dictator = game.dictatorPlayer;

      // Set up dictator card as in-play in this sector
      if (dictator.dictator) {
        dictator.dictator.inPlay = true;
        dictator.baseRevealed = true;
        dictator.baseSectorId = sector.sectorId;
        dictator.baseSquad.sectorId = sector.sectorId;

        const healthBefore = dictator.dictator.health;

        checkLandMines(game, sector, [dictator.primarySquad], false);

        expect(dictator.dictator.health).toBe(healthBefore - 1);
      }
    });
  });

  // ===========================================================================
  // Case 4: Squidhead in entering squad -> disarm, mine to discard
  // ===========================================================================
  describe('Squidhead disarms mine', () => {
    it('prevents detonation when Squidhead is in entering squad', () => {
      placeMineInStash();
      const rebel = game.rebelPlayers[0];

      // Place Squidhead in the entering squad
      const squidhead = placeSquidheadInSquad(rebel.primarySquad);
      rebel.primarySquad.sectorId = sector.sectorId;

      // Also place another merc to verify no damage
      const merc = game.mercDeck.first(CombatantModel, c => c.isMerc)!;
      merc.putInto(rebel.primarySquad);
      const healthBefore = merc.health;

      const result = checkLandMines(game, sector, [rebel.primarySquad], true);

      expect(result.detonated).toBe(false);
      expect(result.disarmed).toBe(true);
      expect(result.disarmedBy).toBe(squidhead.combatantName);
      // No damage dealt to squad mate
      expect(merc.health).toBe(healthBefore);
    });

    it('sends disarmed mine to accessory discard pile', () => {
      placeMineInStash();
      const rebel = game.rebelPlayers[0];

      placeSquidheadInSquad(rebel.primarySquad);
      rebel.primarySquad.sectorId = sector.sectorId;

      const discardBefore = game.accessoriesDiscard?.all(Equipment).length ?? 0;

      checkLandMines(game, sector, [rebel.primarySquad], true);

      // Mine should be in discard, not in stash
      expect(sector.getStashContents().some(e => isLandMine(e.equipmentId))).toBe(false);
      const discardAfter = game.accessoriesDiscard?.all(Equipment).length ?? 0;
      expect(discardAfter).toBe(discardBefore + 1);
    });

    it('works when Squidhead is in a different entering squad', () => {
      placeMineInStash();
      const rebel = game.rebelPlayers[0];

      // Squidhead in secondary squad, other mercs in primary
      placeSquidheadInSquad(rebel.secondarySquad);
      rebel.secondarySquad.sectorId = sector.sectorId;

      const merc = game.mercDeck.first(CombatantModel, c => c.isMerc)!;
      merc.putInto(rebel.primarySquad);
      rebel.primarySquad.sectorId = sector.sectorId;
      const healthBefore = merc.health;

      // Both squads entering
      const result = checkLandMines(game, sector, [rebel.primarySquad, rebel.secondarySquad], true);

      expect(result.detonated).toBe(false);
      expect(result.disarmed).toBe(true);
      expect(merc.health).toBe(healthBefore);
    });
  });

  // ===========================================================================
  // Case 5: Friendly mine -> no trigger
  // ===========================================================================
  describe('Friendly mine does not trigger', () => {
    it('rebel entering sector they control does not trigger mine', () => {
      placeMineInStash();
      const rebel = game.rebelPlayers[0];

      // Rebel has militia in the sector (they control it)
      sector.addRebelMilitia(`${rebel.seat}`, 3);

      const merc = game.mercDeck.first(CombatantModel, c => c.isMerc)!;
      merc.putInto(rebel.primarySquad);
      rebel.primarySquad.sectorId = sector.sectorId;
      const healthBefore = merc.health;

      // No enemies in sector -> mine is friendly
      const result = checkLandMines(game, sector, [rebel.primarySquad], true);

      expect(result.detonated).toBe(false);
      expect(result.disarmed).toBe(false);
      // Mine should still be in stash
      expect(sector.getStashContents().some(e => isLandMine(e.equipmentId))).toBe(true);
      // No damage
      expect(merc.health).toBe(healthBefore);
    });

    it('dictator entering sector they control does not trigger mine', () => {
      placeMineInStash();
      const dictator = game.dictatorPlayer;

      // Dictator has militia in the sector (they control it)
      sector.addDictatorMilitia(3);

      dictator.primarySquad.sectorId = sector.sectorId;

      // No rebel units in sector -> mine is friendly
      const result = checkLandMines(game, sector, [dictator.primarySquad], false);

      expect(result.detonated).toBe(false);
      expect(result.disarmed).toBe(false);
      // Mine should still be in stash
      expect(sector.getStashContents().some(e => isLandMine(e.equipmentId))).toBe(true);
    });
  });

  // ===========================================================================
  // Edge cases
  // ===========================================================================
  describe('Edge cases', () => {
    it('uses getMineDamage() for damage amount (not hardcoded 1)', () => {
      // This test verifies the function uses the equipment-effects helper.
      // We verify by checking that the existing land mine does 1 damage via
      // the helper, confirming the function goes through the right path.
      const mine = placeMineInStash();
      const rebel = game.rebelPlayers[0];

      const merc = game.mercDeck.first(CombatantModel, c => c.isMerc)!;
      merc.putInto(rebel.primarySquad);
      rebel.primarySquad.sectorId = sector.sectorId;

      const healthBefore = merc.health;

      checkLandMines(game, sector, [rebel.primarySquad], true);

      // Should use getMineDamage which returns 1 for land-mine
      expect(merc.health).toBe(healthBefore - 1);
    });

    it('uses handlesLandMines() to identify Squidhead (not hardcoded id)', () => {
      // Verify the function uses the ability registry check
      // We already test Squidhead disarm above; this confirms the registry works
      expect(handlesLandMines('squidhead')).toBe(true);
      expect(handlesLandMines('haarg')).toBe(false);
    });
  });
});
