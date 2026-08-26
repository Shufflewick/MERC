import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { applyKimSetupAbility } from '../src/rules/dictator-abilities.js';
import { executeTacticsEffect } from '../src/rules/tactics-effects.js';
import { TacticsCard } from '../src/rules/elements.js';

/**
 * Designer ruling (issue #46, recorded in data/rules/09-the-dictator.md): the
 * Dictator entering the battlefield is treated exactly like a newly hired MERC,
 * which includes one free equipment card. Every reveal path must grant it.
 */
function dictatorGame(dictatorId: string, seed: string) {
  const game = createTestGame(MERCGame, {
    playerCount: 2,
    playerNames: ['Rebel1', 'Dictator'],
    seed,
  }).game;
  game.setupDictator(dictatorId);
  game.dictatorPlayer.isBot = true;
  return game;
}

function equippedCount(game: MERCGame): number {
  const d = game.dictatorPlayer.dictator!;
  return [d.weaponSlot, d.armorSlot, d.accessorySlot].filter(Boolean).length;
}

describe('Dictator free equipment on entering play', () => {
  it('grants one item when a tactics card reveals the base', () => {
    const game = dictatorGame('stalin', 'entry-equip-tactics');
    const sector = game.gameMap.getAllSectors()[0];
    game.dictatorPlayer.baseSectorId = sector.sectorId;

    const revealCard = game.dictatorPlayer.tacticsDeck.create(TacticsCard, 'test-veteran-militia', {
      tacticsId: 'veteran-militia',
      tacticsName: 'Veteran Militia',
      story: '',
      description: '',
      revealsBase: true,
    });

    expect(equippedCount(game)).toBe(0);
    executeTacticsEffect(game, revealCard);

    expect(game.dictatorPlayer.dictator!.inPlay).toBe(true);
    expect(equippedCount(game)).toBe(1);
  });

  it("grants one item on Kim's day-1 pre-revealed base", () => {
    const game = dictatorGame('kim', 'entry-equip-kim');
    const sector = game.gameMap.getAllSectors()[0];
    game.dictatorPlayer.baseSectorId = sector.sectorId;

    expect(equippedCount(game)).toBe(0);
    const result = applyKimSetupAbility(game);

    expect(result.success).toBe(true);
    expect(equippedCount(game)).toBe(1);
  });
});
