import { describe, it, expect, beforeEach } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame, MERCPlayer } from '../src/rules/game.js';
import { TeamConstants, DictatorConstants } from '../src/rules/constants.js';
import { CombatantModel, Sector } from '../src/rules/elements.js';

describe('Team Limit', () => {
  describe('Team Limit Formula', () => {
    let game: MERCGame;
    let rebel: MERCPlayer;

    beforeEach(() => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'team-limit-test',
      });
      game = testGame.game;
      rebel = game.rebelPlayers[0];
    });

    it('should have BASE_TEAM_LIMIT of 1', () => {
      // Verify the constant is set correctly
      expect(TeamConstants.BASE_TEAM_LIMIT).toBe(1);
    });

    it('should return team limit of 1 with 0 controlled sectors', () => {
      // At game start, rebel controls 0 sectors
      // Team limit should be BASE_TEAM_LIMIT (1) + 0 = 1
      const controlledSectors = game.getControlledSectors(rebel);
      expect(controlledSectors.length).toBe(0);
      expect(rebel.getTeamLimit(game)).toBe(1);
    });

    it('should increase team limit with controlled sectors', () => {
      // Manually place rebel units to control sectors
      // First, find a sector and add rebel militia to control it
      const sectors = game.gameMap.getAllSectors();
      const sector1 = sectors[0];
      const sector2 = sectors[1];

      // Clear any existing dictator militia and add rebel militia
      sector1.dictatorMilitia = 0;
      sector1.addRebelMilitia(`${rebel.position}`, 3);

      // Verify rebel now controls 1 sector
      const controlled1 = game.getControlledSectors(rebel);
      expect(controlled1.length).toBe(1);
      expect(rebel.getTeamLimit(game)).toBe(2); // 1 + 1

      // Control a second sector
      sector2.dictatorMilitia = 0;
      sector2.addRebelMilitia(`${rebel.position}`, 3);

      // Verify rebel now controls 2 sectors
      const controlled2 = game.getControlledSectors(rebel);
      expect(controlled2.length).toBe(2);
      expect(rebel.getTeamLimit(game)).toBe(3); // 1 + 2
    });

    it('should exclude Teresa from teamSize calculation', () => {
      // Create Teresa and add to rebel's squad
      const teresa = game.mercDeck.first(CombatantModel, c => c.isMerc && c.combatantId === 'teresa');
      expect(teresa).toBeDefined();

      // Move Teresa to rebel's primary squad
      teresa!.putInto(rebel.primarySquad);

      // Teresa should not count toward team size
      expect(rebel.teamSize).toBe(0);
      expect(rebel.team.length).toBe(1); // Teresa is in team
      expect(rebel.team[0].combatantId).toBe('teresa');
    });

    it('should count non-Teresa MERCs in teamSize', () => {
      // Get a regular MERC
      const merc = game.mercDeck.first(CombatantModel, c => c.isMerc && c.combatantId !== 'teresa');
      expect(merc).toBeDefined();

      // Move to rebel's primary squad
      merc!.putInto(rebel.primarySquad);

      // MERC should count toward team size
      expect(rebel.teamSize).toBe(1);
    });

    it('should return Infinity for dictator team limit', () => {
      const dictator = game.dictatorPlayer;

      // Verify dictator constant
      expect(DictatorConstants.TEAM_LIMIT).toBe(Infinity);

      // Verify getTeamLimit returns Infinity for dictator
      expect(dictator.getTeamLimit(game)).toBe(Infinity);
    });
  });

  describe('canHireMerc', () => {
    let game: MERCGame;
    let rebel: MERCPlayer;

    beforeEach(() => {
      const testGame = createTestGame(MERCGame, {
        playerCount: 2,
        playerNames: ['Rebel1', 'Dictator'],
        seed: 'hire-limit-test',
      });
      game = testGame.game;
      rebel = game.rebelPlayers[0];
    });

    it('should allow hiring when teamSize is below limit', () => {
      // With 0 controlled sectors, limit is 1
      // With 0 team size, can hire
      expect(rebel.teamSize).toBe(0);
      expect(rebel.getTeamLimit(game)).toBe(1);
      expect(rebel.canHireMerc(game)).toBe(true);
    });

    it('should prevent hiring when at team limit', () => {
      // Add a MERC to reach team limit
      const merc = game.mercDeck.first(CombatantModel, c => c.isMerc && c.combatantId !== 'teresa');
      expect(merc).toBeDefined();
      merc!.putInto(rebel.primarySquad);

      // At team limit (1), cannot hire more
      expect(rebel.teamSize).toBe(1);
      expect(rebel.getTeamLimit(game)).toBe(1);
      expect(rebel.canHireMerc(game)).toBe(false);
    });

    it('should allow Teresa to be hired even at team limit', () => {
      // Add a MERC to reach team limit
      const merc = game.mercDeck.first(CombatantModel, c => c.isMerc && c.combatantId !== 'teresa');
      expect(merc).toBeDefined();
      merc!.putInto(rebel.primarySquad);

      // At team limit
      expect(rebel.teamSize).toBe(1);
      expect(rebel.getTeamLimit(game)).toBe(1);
      expect(rebel.canHireMerc(game)).toBe(false);

      // Now add Teresa - she doesn't count toward team size
      const teresa = game.mercDeck.first(CombatantModel, c => c.isMerc && c.combatantId === 'teresa');
      expect(teresa).toBeDefined();
      teresa!.putInto(rebel.primarySquad);

      // Team size should still be 1 (Teresa excluded)
      expect(rebel.teamSize).toBe(1);
      expect(rebel.team.length).toBe(2); // Both MERCs in team
    });

    it('should always allow dictator to hire', () => {
      const dictator = game.dictatorPlayer;

      // Dictator should always be able to hire (Infinity limit)
      expect(dictator.canHireMerc(game)).toBe(true);

      // Even after hiring many MERCs
      const mercs = [...game.mercDeck.all(CombatantModel)].filter(c => c.isMerc).slice(0, 5);
      for (const merc of mercs) {
        merc.putInto(dictator.primarySquad);
      }

      expect(dictator.canHireMerc(game)).toBe(true);
    });
  });
});
