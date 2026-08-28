import { describe, it, expect } from 'vitest';
import { createTestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Sector } from '../src/rules/elements.js';
import { executeCombat } from '../src/rules/combat.js';
import type { RebelPlayer } from '../src/rules/game.js';

/**
 * Issue #58: `Combat at <sector> ran 500 rounds without resolving`.
 *
 * The rulebook has no round limit -- combat runs "until one side is either dead
 * or has retreated" (p.6) -- so MERC resolves a fight neither side can win by
 * pulling the attackers out after ten rounds without a hit. Two holes let a
 * fight run past that and hit the absolute backstop instead:
 *
 * - the deadlock counter lived in a local variable, so every pause and resume
 *   reset it to zero and an interactive fight never reached ten;
 * - when nobody could withdraw, the counter was reset and the fight went on,
 *   deliberately leaving the backstop to catch it.
 *
 * Both tests freeze the dice on 1, the one roll that can never hit, so the
 * deadlock is the state under test rather than a run of bad luck.
 */

/** A rebel MERC facing dictator militia in one sector, with no die able to hit. */
function deadlockedFight(seed: string): { game: MERCGame; sector: Sector; rebel: RebelPlayer } {
  const game = createTestGame(MERCGame, {
    playerCount: 2,
    playerNames: ['Rebel1', 'Dictator'],
    seed,
  }).game;

  const rebel = game.rebelPlayers[0];
  const sector = game.gameMap.getAllSectors()[0];
  const merc = game.mercDeck.first(CombatantModel, c => c.isMerc)!;
  merc.putInto(rebel.primarySquad);
  rebel.primarySquad.sectorId = sector.sectorId;
  sector.addDictatorMilitia(1);

  // Every die shows 1. Nothing hits on a 1, so no round can ever have an effect.
  game.random = () => 0;

  return { game, sector, rebel };
}

/** The game log as plain strings, whatever shape the engine records entries in. */
function gameMessages(game: MERCGame): string[] {
  return (game.messages as unknown[]).map(m =>
    typeof m === 'string' ? m : String((m as { text?: unknown }).text ?? '')
  );
}

describe('combat that cannot be won', () => {
  it('keeps counting deadlocked rounds across a pause and resume', () => {
    const { game, sector, rebel } = deadlockedFight('stalemate-across-resume');

    // Interactive combat stops after each round to offer the retreat decision,
    // so each call resolves exactly one round. The deadlock must survive those
    // boundaries or it can never be reached.
    let outcome = executeCombat(game, sector, rebel);
    let resumes = 1;
    while (outcome.combatPending && resumes < 40) {
      outcome = executeCombat(game, sector, rebel);
      resumes++;
    }

    expect(outcome.combatPending, 'the fight never resolved').toBe(false);
    expect(outcome.retreated, 'the deadlock should end with the attackers pulling out').toBe(true);
    expect(resumes, 'the deadlock took far longer than ten rounds to notice')
      .toBeLessThanOrEqual(12);
  });

  it('breaks off a deadlock that nobody can withdraw from', () => {
    const { game, sector, rebel } = deadlockedFight('stalemate-no-retreat');

    // Ring the sector with dictator militia: militia never retreat, and the
    // rebel squad now has no adjacent sector it may fall back to.
    for (const adjacent of game.getAdjacentSectors(sector)) {
      adjacent.addDictatorMilitia(5);
    }

    const outcome = executeCombat(game, sector, rebel, { interactive: false });

    expect(outcome.combatPending).toBe(false);
    expect(outcome.rebelVictory).toBe(false);
    expect(outcome.dictatorVictory).toBe(false);
    expect(outcome.retreated).toBe(false);
    expect(outcome.rounds.length, 'the fight ran well past the deadlock threshold')
      .toBeLessThanOrEqual(12);
    expect(
      gameMessages(game).some(m => m.includes('The fighting breaks off.')),
      'the players were never told why the fight ended',
    ).toBe(true);
  });
});
