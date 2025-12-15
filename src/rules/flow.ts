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

          // MERC-1kq: Designate Privacy Player for AI mode
          actionStep({
            name: 'designate-privacy-player',
            actions: ['designatePrivacyPlayer'],
            prompt: 'Designate a Privacy Player for AI decisions',
            skipIf: () => !game.dictatorPlayer?.isAI,
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
              // Step 1: Hire starting MERCs (draw 3, pick 2 in single action, first 2 are free)
              actionStep({
                name: 'hire-starting-mercs',
                actions: ['hireStartingMercs'],
                prompt: 'Draw 3 MERCs and choose 2 to hire',
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
              while: (ctx) => {
                if (game.isFinished()) return false;
                // Check if current player has any MERCs with actions remaining
                const player = ctx?.player as RebelPlayer | undefined;
                if (player) {
                  const hasActionsLeft = player.team.some(m => m.actionsRemaining > 0);
                  return hasActionsLeft;
                }
                return true; // Continue if no player context (shouldn't happen)
              },
              maxIterations: 30, // Safety limit per turn
              do: actionStep({
                name: 'rebel-action',
                // Per rules (05-main-game-loop.md): Combat triggers via movement, not as separate action
                // MERC-wrq: Added coordinatedAttack for same-player multi-squad attacks
                // MERC-a2h: Added multi-player coordinated attack actions
                // MERC-ttx: splitSquad is free action, available anytime including combat
                // MERC-n1f: Combat actions for interactive retreat choice
                actions: [
                  'combatContinue', // MERC-n1f: Continue active combat (highest priority)
                  'combatRetreat', // MERC-n1f: Retreat from active combat
                  'move',
                  'coordinatedAttack', // MERC-wrq: Same player, both squads
                  'declareCoordinatedAttack', // MERC-a2h: Stage for multi-player attack
                  'joinCoordinatedAttack', // MERC-a2h: Join declared attack
                  'executeCoordinatedAttack', // MERC-a2h: Execute multi-player attack
                  'explore',
                  'train',
                  'hireMerc',
                  'reEquip',
                  'hospital',
                  'docHeal', // MERC-m4k: Doc's free heal ability
                  'feedbackDiscard', // MERC-24h: Feedback discard retrieval
                  'squidheadDisarm', // MERC-4qd: Squidhead disarm mines
                  'squidheadArm', // MERC-4qd: Squidhead arm mines
                  'hagnessDraw', // MERC-jrph: Hagness draw equipment
                  'armsDealer',
                  'splitSquad', // MERC-ttx: Free action available anytime
                  'mergeSquads',
                  'fireMerc',
                  'endTurn',
                ],
                skipIf: () => game.isFinished(),
              }),
            }),
          }),

          // Dictator turn
          // Per rules (05-main-game-loop.md):
          // Step 1: Play Tactics card OR Reinforce
          // Step 2: Each Dictator MERC takes 2 actions
          // Step 3: Use Special Ability (if applicable)
          // Step 4: Refill hand to 3 cards
          phase('dictator-turn', {
            do: sequence(
              execute(() => {
                game.message('--- Dictator Turn ---');
              }),

              // Step 1: Play a tactics card or reinforce
              actionStep({
                name: 'dictator-play-tactics',
                actions: ['playTactics', 'reinforce'],
                skipIf: () => game.isFinished(),
              }),

              // Step 2: Dictator MERC actions (if any MERCs)
              loop({
                name: 'dictator-merc-actions',
                while: () => {
                  // Continue while any dictator MERC has actions
                  const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
                  const dictator = game.dictatorPlayer?.dictator;
                  const hasActionsLeft = dictatorMercs.some(m => m.actionsRemaining > 0) ||
                    (dictator?.inPlay && dictator.actionsRemaining > 0);
                  return hasActionsLeft && !game.isFinished();
                },
                maxIterations: 20,
                do: actionStep({
                  name: 'dictator-merc-action',
                  actions: [
                    'dictatorMortar', // MERC-9m9: Mortar attack (high priority per rules 4.12)
                    'dictatorHeal', // MERC-7fy: Heal injured MERCs (priority per rules 4.8)
                    'dictatorMove',
                    'dictatorExplore',
                    'dictatorTrain',
                    'dictatorReEquip',
                    'dictatorEndMercActions',
                  ],
                  skipIf: () => game.isFinished(),
                }),
              }),

              // Move militia (free action)
              actionStep({
                name: 'dictator-militia-movement',
                actions: ['moveMilitia', 'skipMilitiaMove'],
                skipIf: () => game.isFinished(),
              }),

              // Step 3: Apply per-turn dictator special ability
              execute(() => {
                applyDictatorTurnAbilities(game);
              }),

              // Apply end-of-turn effects (Conscripts)
              execute(() => {
                applyConscriptsEffect(game);
              }),

              // Step 4: Refill hand to 3 cards
              execute(() => {
                drawTacticsHand(game);
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
