import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { isCheckerboardPosition } from '../src/rules/setup.js';

/**
 * Tests for the map checkerboard pattern.
 *
 * Key invariant: Industries are ALWAYS on checkerboard positions (row + col) % 2 === 0.
 * This ensures no two industries are ever orthogonally adjacent.
 */
describe('Map Checkerboard Pattern', () => {
  // Configuration data from setup.json
  const configurations = [
    { rebels: 1, mapSize: [3, 3], industries: 4, cities: 1, wilderness: 4 },
    { rebels: 2, mapSize: [3, 4], industries: 6, cities: 1, wilderness: 5 },
    { rebels: 3, mapSize: [4, 4], industries: 8, cities: 1, wilderness: 7 },
    { rebels: 4, mapSize: [4, 5], industries: 10, cities: 2, wilderness: 8 },
    { rebels: 5, mapSize: [5, 5], industries: 12, cities: 2, wilderness: 11 },
    { rebels: 6, mapSize: [5, 6], industries: 13, cities: 3, wilderness: 14 },
  ];

  describe('isCheckerboardPosition helper', () => {
    it('should return true for (0,0)', () => {
      expect(isCheckerboardPosition(0, 0)).toBe(true);
    });

    it('should return false for (0,1)', () => {
      expect(isCheckerboardPosition(0, 1)).toBe(false);
    });

    it('should return true for (1,1)', () => {
      expect(isCheckerboardPosition(1, 1)).toBe(true);
    });

    it('should return false for (1,2)', () => {
      expect(isCheckerboardPosition(1, 2)).toBe(false);
    });

    it('should follow (row + col) % 2 === 0 pattern', () => {
      for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
          const expected = (row + col) % 2 === 0;
          expect(isCheckerboardPosition(row, col)).toBe(expected);
        }
      }
    });
  });

  configurations.forEach(config => {
    const playerCount = config.rebels + 1; // rebels + dictator
    const [cols, rows] = config.mapSize;

    describe(`${playerCount}-player game (${cols}x${rows} map)`, () => {
      it('should have all industries on checkerboard positions', () => {
        const testGame = createTestGame(MERCGame, {
          playerCount,
          playerNames: Array.from({ length: playerCount }, (_, i) =>
            i < config.rebels ? `Rebel${i + 1}` : 'Dictator'
          ),
          seed: `checkerboard-test-${playerCount}`,
        });

        const sectors = testGame.game.gameMap.getAllSectors();
        const industries = sectors.filter(s => s.isIndustry);

        for (const industry of industries) {
          const isOnCheckerboard = isCheckerboardPosition(industry.row, industry.col);
          expect(isOnCheckerboard).toBe(true);
        }
      });

      it('should have no two industries orthogonally adjacent', () => {
        const testGame = createTestGame(MERCGame, {
          playerCount,
          playerNames: Array.from({ length: playerCount }, (_, i) =>
            i < config.rebels ? `Rebel${i + 1}` : 'Dictator'
          ),
          seed: `adjacency-test-${playerCount}`,
        });

        const sectors = testGame.game.gameMap.getAllSectors();
        const industries = sectors.filter(s => s.isIndustry);

        // Create a set of industry positions for quick lookup
        const industryPositions = new Set(
          industries.map(ind => `${ind.row},${ind.col}`)
        );

        // Check each industry for adjacent industries
        for (const industry of industries) {
          const adjacentPositions = [
            { row: industry.row - 1, col: industry.col },
            { row: industry.row + 1, col: industry.col },
            { row: industry.row, col: industry.col - 1 },
            { row: industry.row, col: industry.col + 1 },
          ];

          for (const adj of adjacentPositions) {
            const key = `${adj.row},${adj.col}`;
            expect(industryPositions.has(key)).toBe(false);
          }
        }
      });

      it(`should have correct map dimensions (${cols}x${rows})`, () => {
        const testGame = createTestGame(MERCGame, {
          playerCount,
          playerNames: Array.from({ length: playerCount }, (_, i) =>
            i < config.rebels ? `Rebel${i + 1}` : 'Dictator'
          ),
          seed: `dimensions-test-${playerCount}`,
        });

        expect(testGame.game.gameMap.cols).toBe(cols);
        expect(testGame.game.gameMap.rows).toBe(rows);
      });

      it(`should have ${cols * rows} total sectors`, () => {
        const testGame = createTestGame(MERCGame, {
          playerCount,
          playerNames: Array.from({ length: playerCount }, (_, i) =>
            i < config.rebels ? `Rebel${i + 1}` : 'Dictator'
          ),
          seed: `total-test-${playerCount}`,
        });

        const sectors = testGame.game.gameMap.getAllSectors();
        expect(sectors.length).toBe(cols * rows);
      });

      it(`should have correct sector counts (${config.industries} industries, ${config.cities} cities, ${config.wilderness} wilderness)`, () => {
        const testGame = createTestGame(MERCGame, {
          playerCount,
          playerNames: Array.from({ length: playerCount }, (_, i) =>
            i < config.rebels ? `Rebel${i + 1}` : 'Dictator'
          ),
          seed: `sector-counts-test-${playerCount}`,
        });

        const sectors = testGame.game.gameMap.getAllSectors();
        const industries = sectors.filter(s => s.isIndustry);
        const cities = sectors.filter(s => s.isCity);
        const wilderness = sectors.filter(s => s.isWilderness);

        expect(industries.length).toBe(config.industries);
        expect(cities.length).toBe(config.cities);
        expect(wilderness.length).toBe(config.wilderness);
      });

      it('should have wilderness only on non-checkerboard positions', () => {
        const testGame = createTestGame(MERCGame, {
          playerCount,
          playerNames: Array.from({ length: playerCount }, (_, i) =>
            i < config.rebels ? `Rebel${i + 1}` : 'Dictator'
          ),
          seed: `wilderness-test-${playerCount}`,
        });

        const sectors = testGame.game.gameMap.getAllSectors();
        const wilderness = sectors.filter(s => s.isWilderness);

        for (const wild of wilderness) {
          const isOnCheckerboard = isCheckerboardPosition(wild.row, wild.col);
          expect(isOnCheckerboard).toBe(false);
        }
      });
    });
  });

  describe('Multiple seeds produce variety', () => {
    it('should produce different layouts with different seeds', () => {
      const layouts: string[] = [];

      for (let i = 0; i < 5; i++) {
        const testGame = createTestGame(MERCGame, {
          playerCount: 2,
          playerNames: ['Rebel1', 'Dictator'],
          seed: `variety-test-${i}`,
        });

        const sectors = testGame.game.gameMap.getAllSectors();
        const layout = sectors
          .sort((a, b) => a.row * 100 + a.col - (b.row * 100 + b.col))
          .map(s => s.sectorType[0])
          .join('');
        layouts.push(layout);
      }

      // Not all layouts should be identical
      const uniqueLayouts = new Set(layouts);
      expect(uniqueLayouts.size).toBeGreaterThan(1);
    });
  });

  describe('Checkerboard math verification', () => {
    configurations.forEach(config => {
      const [cols, rows] = config.mapSize;
      const playerCount = config.rebels + 1;

      it(`${cols}x${rows} map should have enough checkerboard positions for industries`, () => {
        // Count checkerboard positions
        let checkerboardCount = 0;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            if (isCheckerboardPosition(row, col)) {
              checkerboardCount++;
            }
          }
        }

        // There should be at least as many checkerboard positions as industries
        expect(checkerboardCount).toBeGreaterThanOrEqual(config.industries);
      });

      it(`${cols}x${rows} map should have enough non-checkerboard positions for wilderness`, () => {
        // Count non-checkerboard positions
        let nonCheckerboardCount = 0;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            if (!isCheckerboardPosition(row, col)) {
              nonCheckerboardCount++;
            }
          }
        }

        // There should be at least as many non-checkerboard positions as wilderness
        expect(nonCheckerboardCount).toBeGreaterThanOrEqual(config.wilderness);
      });
    });
  });
});
