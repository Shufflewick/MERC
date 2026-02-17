import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Sector, TacticsCard } from '../src/rules/elements.js';
import {
  applyGadafiTurnAbility,
  applyHitlerTurnAbility,
  applyHusseinBonusTactics,
  applyMaoTurnAbility,
  applyMussoliniTurnAbility,
  applyNoriegaTurnAbility,
  applyPinochetTurnAbility,
  applyPolpotTurnAbility,
  applyStalinTurnAbility,
} from '../src/rules/dictator-abilities.js';

/**
 * Dictator Per-Turn Ability Unit Tests
 *
 * Phase 62-01: Verify each of the 9 expansion dictator per-turn abilities
 * produces correct game state changes when called directly.
 *
 * Pattern: createTestGame -> setupDictator('id') -> set up preconditions -> call ability -> assert state
 */

/**
 * Helper: create a 2-player test game with a specific dictator and AI flag set.
 */
function createDictatorTestGame(dictatorId: string, seed: string) {
  const testGame = createTestGame(MERCGame, {
    playerCount: 2,
    playerNames: ['Rebel1', 'Dictator'],
    seed,
  });
  const game = testGame.game;
  game.setupDictator(dictatorId);
  // Most ability functions require the dictator player to be AI-controlled
  game.dictatorPlayer.isAI = true;
  return { testGame, game };
}

/**
 * Helper: set up rebel-controlled sectors by placing rebel militia.
 * Returns the sectors that were given rebel militia.
 */
function setupRebelControlledSectors(game: MERCGame, count: number): Sector[] {
  const allSectors = game.gameMap.getAllSectors();
  const rebelPlayer = game.rebelPlayers[0];
  const playerId = String(rebelPlayer.seat);
  const modified: Sector[] = [];

  for (let i = 0; i < count && i < allSectors.length; i++) {
    const sector = allSectors[i];
    // Clear any dictator militia so rebel has more units
    sector.dictatorMilitia = 0;
    // Add rebel militia to establish control
    sector.addRebelMilitia(playerId, 3);
    modified.push(sector);
  }

  return modified;
}

// =============================================================================
// Gaddafi (gadafi)
// =============================================================================

describe('Gaddafi per-turn ability', () => {
  it('should hire 1 random MERC', () => {
    const { game } = createDictatorTestGame('gadafi', 'gadafi-turn-test');

    const hiredBefore = game.dictatorPlayer.hiredMercs.length;
    const result = applyGadafiTurnAbility(game);

    expect(result.success).toBe(true);
    expect(game.dictatorPlayer.hiredMercs.length).toBe(hiredBefore + 1);
  });
});

// =============================================================================
// Hitler
// =============================================================================

describe('Hitler per-turn ability', () => {
  it('should hire 1 MERC and set initiative target to a rebel seat', () => {
    const { game } = createDictatorTestGame('hitler', 'hitler-turn-test');

    const hiredBefore = game.dictatorPlayer.hiredMercs.length;
    const result = applyHitlerTurnAbility(game);

    expect(result.success).toBe(true);
    expect(game.dictatorPlayer.hiredMercs.length).toBe(hiredBefore + 1);

    // Hitler picks a rebel for auto-initiative override
    expect(game.hitlerInitiativeTargetSeat).not.toBeNull();
    const rebelSeats = game.rebelPlayers.map(r => r.seat);
    expect(rebelSeats).toContain(game.hitlerInitiativeTargetSeat);
    expect(game.hitlerInitiativeSwitchedThisTurn).toBe(true);
  });
});

// =============================================================================
// Hussein
// =============================================================================

describe('Hussein per-turn ability (bonus tactics)', () => {
  it('should draw and play a tactics card from the deck', () => {
    const { game } = createDictatorTestGame('hussein', 'hussein-turn-test');

    const tacticsDeck = game.dictatorPlayer.tacticsDeck;
    expect(tacticsDeck).toBeDefined();

    const deckCountBefore = tacticsDeck!.count(TacticsCard);
    const discardCountBefore = game.dictatorPlayer.tacticsDiscard!.count(TacticsCard);

    const result = applyHusseinBonusTactics(game);

    expect(result.success).toBe(true);

    // A card should have moved from deck to discard
    if (deckCountBefore > 0) {
      expect(tacticsDeck!.count(TacticsCard)).toBe(deckCountBefore - 1);
      expect(game.dictatorPlayer.tacticsDiscard!.count(TacticsCard)).toBe(discardCountBefore + 1);
    }
  });
});

// =============================================================================
// Mao
// =============================================================================

describe('Mao per-turn ability', () => {
  it('should place militia in wilderness sectors when rebels control sectors', () => {
    const { game } = createDictatorTestGame('mao', 'mao-turn-test');

    // Set up rebel-controlled sectors (needed for the ability to have effect)
    setupRebelControlledSectors(game, 2);

    // Count total dictator militia across wilderness sectors before
    const wildernessSectors = game.gameMap.getAllSectors().filter(s => s.isWilderness);
    const militiaBefore = wildernessSectors.reduce((sum, s) => sum + s.dictatorMilitia, 0);

    const result = applyMaoTurnAbility(game);

    expect(result.success).toBe(true);
    expect(result.data?.militiaPlaced).toBeGreaterThan(0);

    // Militia should have increased in wilderness sectors
    const militiaAfter = wildernessSectors.reduce((sum, s) => sum + s.dictatorMilitia, 0);
    expect(militiaAfter).toBeGreaterThan(militiaBefore);
  });

  it('should do nothing when rebels control no sectors', () => {
    const { game } = createDictatorTestGame('mao', 'mao-no-rebels');

    // Clear all rebel militia to ensure rebels control nothing
    for (const sector of game.gameMap.getAllSectors()) {
      for (const rebel of game.rebelPlayers) {
        const playerId = String(rebel.seat);
        const current = sector.getRebelMilitia(playerId);
        if (current > 0) sector.removeRebelMilitia(playerId, current);
      }
    }

    const result = applyMaoTurnAbility(game);

    expect(result.success).toBe(true);
    expect(result.data?.militiaPlaced).toBe(0);
  });
});

// =============================================================================
// Mussolini
// =============================================================================

describe('Mussolini per-turn ability', () => {
  it('should add militia to a controlled sector and spread to adjacent', () => {
    const { game } = createDictatorTestGame('mussolini', 'mussolini-turn-test');

    // Give dictator a controlled sector (add dictator militia)
    const allSectors = game.gameMap.getAllSectors();
    const baseSector = allSectors[0];
    baseSector.addDictatorMilitia(3);

    // Count total dictator militia before
    const totalMilitiaBefore = allSectors.reduce((sum, s) => sum + s.dictatorMilitia, 0);

    const result = applyMussoliniTurnAbility(game);

    expect(result.success).toBe(true);
    expect(result.data?.militiaPlaced).toBeGreaterThan(0);

    // Total dictator militia should have increased (new militia were added)
    const totalMilitiaAfter = allSectors.reduce((sum, s) => sum + s.dictatorMilitia, 0);
    expect(totalMilitiaAfter).toBeGreaterThan(totalMilitiaBefore);
  });
});

// =============================================================================
// Noriega
// =============================================================================

describe('Noriega per-turn ability', () => {
  it('should convert rebel militia and place as dictator militia', () => {
    const { game } = createDictatorTestGame('noriega', 'noriega-turn-test');

    // Set up rebel-controlled sectors with rebel militia
    const rebelSectors = setupRebelControlledSectors(game, 2);
    const rebelPlayer = game.rebelPlayers[0];
    const playerId = String(rebelPlayer.seat);

    // Record rebel militia before
    const rebelMilitiaBefore = rebelSectors.reduce(
      (sum, s) => sum + s.getRebelMilitia(playerId), 0
    );

    const result = applyNoriegaTurnAbility(game);

    expect(result.success).toBe(true);
    expect(result.data?.totalConverted).toBeGreaterThan(0);

    // Rebel militia should have decreased
    const rebelMilitiaAfter = rebelSectors.reduce(
      (sum, s) => sum + s.getRebelMilitia(playerId), 0
    );
    expect(rebelMilitiaAfter).toBeLessThan(rebelMilitiaBefore);

    // Dictator militia should exist somewhere (converted militia placed)
    const totalDictatorMilitia = game.gameMap.getAllSectors()
      .reduce((sum, s) => sum + s.dictatorMilitia, 0);
    expect(totalDictatorMilitia).toBeGreaterThan(0);
  });
});

// =============================================================================
// Pinochet
// =============================================================================

describe('Pinochet per-turn ability', () => {
  it('should spread damage across rebel forces when rebels control sectors', () => {
    const { game } = createDictatorTestGame('pinochet', 'pinochet-turn-test');

    // Set up rebel-controlled sectors
    const rebelSectors = setupRebelControlledSectors(game, 2);
    const rebelPlayer = game.rebelPlayers[0];
    const playerId = String(rebelPlayer.seat);

    // Record total rebel militia before
    const rebelMilitiaBefore = rebelSectors.reduce(
      (sum, s) => sum + s.getRebelMilitia(playerId), 0
    );

    // applyPinochetTurnAbility calls applyPinochetPendingHires + applyPinochetDamageSpread
    applyPinochetTurnAbility(game);

    // Rebel forces should have taken damage (militia reduced or MERCs damaged)
    const rebelMilitiaAfter = rebelSectors.reduce(
      (sum, s) => sum + s.getRebelMilitia(playerId), 0
    );
    expect(rebelMilitiaAfter).toBeLessThan(rebelMilitiaBefore);
  });

  it('should process pending hires if any exist', () => {
    const { game } = createDictatorTestGame('pinochet', 'pinochet-hire-test');

    // Queue pending hires
    game._pinochetPendingHires = 1;
    const hiredBefore = game.dictatorPlayer.hiredMercs.length;

    applyPinochetTurnAbility(game);

    // Should have hired the pending MERC
    expect(game.dictatorPlayer.hiredMercs.length).toBe(hiredBefore + 1);
    expect(game._pinochetPendingHires).toBe(0);
  });
});

// =============================================================================
// Pol Pot (polpot)
// =============================================================================

describe('Pol Pot per-turn ability', () => {
  it('should place militia in a rebel-controlled sector', () => {
    const { game } = createDictatorTestGame('polpot', 'polpot-turn-test');

    // Set up rebel-controlled sectors
    const rebelSectors = setupRebelControlledSectors(game, 2);

    // Count dictator militia in rebel sectors before
    const dictatorMilitiaBefore = rebelSectors.reduce(
      (sum, s) => sum + s.dictatorMilitia, 0
    );

    const result = applyPolpotTurnAbility(game);

    expect(result.success).toBe(true);
    expect(result.data?.militiaPlaced).toBeGreaterThan(0);

    // Dictator militia should have increased in the rebel sectors
    const dictatorMilitiaAfter = rebelSectors.reduce(
      (sum, s) => sum + s.dictatorMilitia, 0
    );
    expect(dictatorMilitiaAfter).toBeGreaterThan(dictatorMilitiaBefore);
  });
});

// =============================================================================
// Stalin
// =============================================================================

describe('Stalin per-turn ability', () => {
  it('should hire 1 MERC to primary squad', () => {
    const { game } = createDictatorTestGame('stalin', 'stalin-turn-test');

    const hiredBefore = game.dictatorPlayer.hiredMercs.length;
    const result = applyStalinTurnAbility(game);

    expect(result.success).toBe(true);
    expect(game.dictatorPlayer.hiredMercs.length).toBeGreaterThanOrEqual(hiredBefore + 1);
  });

  it('should hire 2 MERCs when base is revealed', () => {
    const { game } = createDictatorTestGame('stalin', 'stalin-revealed-test');

    // Reveal the base to enable second hire
    game.dictatorPlayer.baseRevealed = true;

    const hiredBefore = game.dictatorPlayer.hiredMercs.length;
    const result = applyStalinTurnAbility(game);

    expect(result.success).toBe(true);
    expect(game.dictatorPlayer.hiredMercs.length).toBeGreaterThanOrEqual(hiredBefore + 2);
  });
});
