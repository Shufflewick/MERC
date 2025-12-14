import {
  loop,
  eachPlayer,
  actionStep,
  sequence,
  execute,
  phase,
  type FlowDefinition,
} from '@boardsmith/engine';
import type { MERCGame, RebelPlayer } from './game.js';
import { executeDictatorDay1, getDay1Summary, drawTacticsHand } from './day-one.js';
import { applyDictatorTurnAbilities } from './dictator-abilities.js';
import { applyConscriptsEffect } from './tactics-effects.js';

/**
 * MERC Game Flow
 *
 * The game is structured around "Days" with the following phases:
 *
 * Day 1 (The Landing):
 * - Rebel Phase:
 *   1. Each rebel draws 3 MERCs, chooses 1-3 to hire (first 2 are free)
 *   2. Each rebel places primary squad on an edge sector
 *   3. Each MERC gets 1 free starting equipment
 *   4. Each rebel now controls their landing sector
 *
 * - Dictator Phase:
 *   1. Place initial militia on unoccupied industries (Difficulty count each)
 *   2. Hire 1 random MERC
 *   3. Check dictator special ability
 *   4. Draw 3 tactics cards
 *   5. Place extra militia
 *
 * Day 2+:
 * 1. Rebels take turns (can move, explore, hire, train, attack, etc.)
 * 2. Dictator takes turn
 * 3. Advance to next day
 *
 * Game ends when:
 * - Dictator is killed (rebels win)
 * - Dictator tactics deck empty (rebels win if they control enough points)
 * - All rebels eliminated (dictator wins)
 */

export function createGameFlow(game: MERCGame): FlowDefinition {
  return {
    root: sequence(
      // Day 1: The Landing
      phase('landing', {
        do: sequence(
          // Setup message
          execute(() => {
            game.message('=== Day 1: The Landing ===');
            game.currentDay = 1;
          }),

          // ===== REBEL PHASE =====
          execute(() => {
            game.message('--- Rebel Phase ---');
          }),

          // Each rebel performs their Day 1 setup
          eachPlayer({
            name: 'rebel-landing',
            filter: (player) => game.isRebelPlayer(player as any), // Only rebels, skip dictator
            do: sequence(
              // Step 1: Hire starting MERCs (draw 3, pick 1-3, first 2 free)
              actionStep({
                name: 'hire-first-merc',
                actions: ['hireStartingMercs'],
                prompt: 'Draw 3 MERCs and choose which to hire (first 2 are free)',
              }),

              // Step 2: Choose landing sector
              actionStep({
                name: 'place-landing',
                actions: ['placeLanding'],
                prompt: 'Choose an edge sector for your landing zone',
              }),

              // Step 3: Equip starting equipment for each MERC
              actionStep({
                name: 'equip-first-merc',
                actions: ['equipStarting'],
                prompt: 'Choose starting equipment for your first MERC',
              }),
              actionStep({
                name: 'equip-second-merc',
                actions: ['equipStarting'],
                prompt: 'Choose starting equipment for your second MERC',
                skipIf: (ctx) => {
                  const player = ctx.player as any;
                  return player.teamSize < 2;
                },
              }),
            ),
          }),

          // ===== DICTATOR PHASE =====
          execute(() => {
            game.message('--- Dictator Phase ---');
            executeDictatorDay1(game);
          }),

          // Day 1 Complete
          execute(() => {
            game.message(getDay1Summary(game));
          }),
        ),
      }),

      // Main game loop (Day 2+)
      loop({
        name: 'game-loop',
        while: () => !game.isFinished(),
        maxIterations: 1000,
        do: sequence(
          // Advance the day
          execute(() => {
            game.advanceDay();
            game.message(`Day ${game.currentDay} begins`);
          }),

          // Rebel turns
          eachPlayer({
            name: 'rebel-turns',
            filter: (player) => game.isRebelPlayer(player as any) && !game.isFinished(),
            do: loop({
              name: 'rebel-action-loop',
              while: () => !game.isFinished(),
              maxIterations: 30, // Safety limit per turn
              do: actionStep({
                name: 'rebel-action',
                actions: [
                  'move',
                  'explore',
                  'attack',
                  'train',
                  'hireMerc',
                  'reEquip',
                  'hospital',
                  'armsDealer',
                  'splitSquad',
                  'mergeSquads',
                  'giftMilitia',
                  'endTurn',
                ],
                skipIf: () => game.isFinished(),
              }),
            }),
          }),

          // Dictator turn
          phase('dictator-turn', {
            do: sequence(
              // Draw tactics cards to fill hand
              execute(() => {
                game.message('--- Dictator Turn ---');
                drawTacticsHand(game);
              }),

              // Apply per-turn dictator ability (Castro draws MERCs, Kim places militia)
              execute(() => {
                applyDictatorTurnAbilities(game);
              }),

              // Play a tactics card or reinforce
              actionStep({
                name: 'dictator-play-tactics',
                actions: ['playTactics', 'reinforce'],
                skipIf: () => game.isFinished(),
              }),

              // Move militia
              actionStep({
                name: 'dictator-militia-movement',
                actions: ['moveMilitia', 'skipMilitiaMove'],
                skipIf: () => game.isFinished(),
              }),

              // Apply end-of-turn effects (Conscripts)
              execute(() => {
                applyConscriptsEffect(game);
              }),
            ),
          }),
        ),
      }),
    ),

    isComplete: () => game.isFinished(),
    getWinners: () => game.getWinners(),
  };
}
