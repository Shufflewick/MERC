import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { Sector } from '../src/rules/elements.js';
import { getValidLandingSectors, isValidLandingSector } from '../src/rules/day-one.js';

/**
 * Test landing zone availability for all player counts (2-7 players).
 *
 * Validates that:
 * 1. Each player count generates enough valid landing sectors for all rebels
 * 2. Landing sectors decrease correctly as rebels land
 * 3. game.all(Sector) matches gameMap.getAllSectors()
 * 4. isValidLandingSector filter works correctly
 */

function makePlayerNames(playerCount: number): string[] {
  const rebels = Array.from({ length: playerCount - 1 }, (_, i) => `Rebel${i + 1}`);
  return [...rebels, 'Dictator'];
}

// Player counts: 2 (1 rebel) through 7 (6 rebels)
const playerCounts = [2, 3, 4, 5, 6, 7];

// Expected map sizes from setup.json: rebels → [cols, rows]
const expectedMapSizes: Record<number, [number, number]> = {
  1: [3, 3],
  2: [3, 4],
  3: [4, 4],
  4: [4, 5],
  5: [5, 5],
  6: [5, 6],
};

describe('Landing Zone Multi-Player', () => {
  describe.each(playerCounts)('%i-player game (%i rebels)', (playerCount) => {
    const rebelCount = playerCount - 1;

    it('should have correct map size and player count', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount,
        playerNames: makePlayerNames(playerCount),
        seed: `landing-mapsize-${playerCount}p`,
      });

      const game = testGame.game;
      const [expectedCols, expectedRows] = expectedMapSizes[rebelCount];

      expect(game.rebelPlayers.length).toBe(rebelCount);
      expect(game.dictatorPlayer).toBeDefined();
      expect(game.gameMap.cols).toBe(expectedCols);
      expect(game.gameMap.rows).toBe(expectedRows);
    });

    it('should have enough valid landing sectors for all rebels', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount,
        playerNames: makePlayerNames(playerCount),
        seed: `landing-valid-${playerCount}p`,
      });

      const game = testGame.game;
      const validLanding = getValidLandingSectors(game);

      // Must have at least as many landing sectors as rebels
      expect(validLanding.length).toBeGreaterThanOrEqual(rebelCount);
    });

    it('should find all Sectors with game.all(Sector)', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount,
        playerNames: makePlayerNames(playerCount),
        seed: `landing-allsector-${playerCount}p`,
      });

      const game = testGame.game;
      const allElements = [...game.all(Sector)];
      const mapSectors = game.gameMap.getAllSectors();

      expect(allElements.length).toBe(mapSectors.length);

      // Filter should match getValidLandingSectors
      const filtered = allElements.filter(
        el => el instanceof Sector && isValidLandingSector(game, el)
      );
      expect(filtered.length).toBe(getValidLandingSectors(game).length);
    });

    it('should reduce valid sectors as rebels land sequentially', () => {
      const testGame = createTestGame(MERCGame, {
        playerCount,
        playerNames: makePlayerNames(playerCount),
        seed: `landing-sequential-${playerCount}p`,
      });

      const game = testGame.game;
      const initialValid = getValidLandingSectors(game);

      for (let i = 0; i < rebelCount; i++) {
        const rebel = game.rebelPlayers[i];
        const currentValid = getValidLandingSectors(game);

        // Should still have landing sectors available for this rebel
        expect(currentValid.length).toBeGreaterThan(
          0,
          `Rebel ${i + 1} of ${rebelCount} should have valid landing sectors`
        );

        // Land this rebel at the first valid sector
        const sector = currentValid[0];
        rebel.primarySquad.sectorId = sector.sectorId;

        // Verify the taken sector is no longer valid
        const afterLanding = getValidLandingSectors(game);
        expect(afterLanding.find(s => s.sectorId === sector.sectorId)).toBeUndefined();
        expect(afterLanding.length).toBe(currentValid.length - 1);
      }

      // After all rebels land, valid count should be initial minus rebel count
      const finalValid = getValidLandingSectors(game);
      expect(finalValid.length).toBe(initialValid.length - rebelCount);
    });
  });
});
