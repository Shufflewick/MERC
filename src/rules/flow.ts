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
import { getDay1Summary, drawTacticsHand } from './day-one.js';
import { applyDictatorTurnAbilities } from './dictator-abilities.js';
import { applyConscriptsEffect } from './tactics-effects.js';
import { executeCombat } from './combat.js';

/**
 * MERC Game Flow
 *
 * The game is structured around "Days" with the following phases:
 *
 * Day 1 (The Landing):
 * - Rebel Phase:
 *   1. Each rebel chooses their landing zone (edge sector)
 *   2. Draw 3 MERCs, pick first MERC and their equipment
 *   3. Pick second MERC (from remaining 2) and their equipment
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
              // Step 1: Choose landing sector first
              actionStep({
                name: 'place-landing',
                actions: ['placeLanding'],
                prompt: 'Choose an edge sector for your landing zone',
              }),

              // Step 2: Hire first MERC (draw 3, pick 1) and equip
              actionStep({
                name: 'hire-first-merc',
                actions: ['hireFirstMerc'],
                prompt: 'Hire your first MERC',
              }),

              // Step 3: Hire second MERC (pick from remaining 2) and equip
              actionStep({
                name: 'hire-second-merc',
                actions: ['hireSecondMerc'],
                prompt: 'Hire your second MERC',
              }),

              // Step 4: Optional third MERC (if Teresa was hired - she doesn't count toward limit)
              actionStep({
                name: 'hire-third-merc',
                actions: ['hireThirdMerc'],
                prompt: 'Hire your third MERC (Teresa bonus)',
                skipIf: (ctx) => {
                  // Skip if Teresa is not on the team
                  const player = ctx.player as any;
                  if (!game.isRebelPlayer(player)) return true;
                  const hasTeresa = player.team?.some((m: any) => m.mercId === 'teresa');
                  return !hasTeresa;
                },
              }),
            ),
          }),

          // ===== DICTATOR PHASE =====
          // MERC-mtoq: Convert to action steps for human dictator support
          eachPlayer({
            name: 'dictator-landing',
            filter: (player) => game.isDictatorPlayer(player as any),
            do: sequence(
              execute(() => {
                game.message('--- Dictator Phase ---');
                game.message('=== Dictator Day 1 Phase ===');
              }),

              // Step 1: Place initial militia on unoccupied industries
              actionStep({
                name: 'dictator-place-initial-militia',
                actions: ['dictatorPlaceInitialMilitia'],
                prompt: 'Place initial militia on unoccupied industries',
              }),

              // Step 2: Hire dictator's first MERC
              actionStep({
                name: 'dictator-hire-first-merc',
                actions: ['dictatorHireFirstMerc'],
                prompt: 'Hire your first MERC',
              }),

              // Step 3: Apply dictator special ability
              actionStep({
                name: 'dictator-setup-ability',
                actions: ['dictatorSetupAbility'],
                prompt: 'Apply dictator special ability',
              }),

              // Step 4: Draw tactics hand
              actionStep({
                name: 'dictator-draw-tactics',
                actions: ['dictatorDrawTactics'],
                prompt: 'Draw tactics cards',
              }),

              // Step 5: Place extra militia
              actionStep({
                name: 'dictator-place-extra-militia',
                actions: ['dictatorPlaceExtraMilitia', 'dictatorSkipExtraMilitia'],
                prompt: 'Place extra militia',
              }),

              execute(() => {
                game.message('=== Dictator Day 1 Complete ===');
              }),
            ),
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
                // MERC-t5k: Keep player in loop while combat is active or pending
                if (game.activeCombat !== null) return true;
                if (game.pendingCombat !== null) return true; // Combat about to start
                // Check if current player has any MERCs with actions remaining
                const player = ctx?.player as RebelPlayer | undefined;
                if (player) {
                  const hasActionsLeft = player.team.some(m => m.actionsRemaining > 0);
                  return hasActionsLeft;
                }
                return true; // Continue if no player context (shouldn't happen)
              },
              maxIterations: 30, // Safety limit per turn
              do: sequence(
                // MERC-t5k: Check for pending combat (from move action) and initiate it
                // This execute step runs BEFORE the action step, ensuring UI refresh
                execute((ctx) => {
                  if (game.pendingCombat && !game.activeCombat) {
                    const sector = game.getSector(game.pendingCombat.sectorId);
                    const player = game.rebelPlayers.find(
                      p => `${p.position}` === game.pendingCombat!.playerId
                    );
                    if (sector && player) {
                      executeCombat(game, sector, player);
                    }
                    game.pendingCombat = null;
                  }
                }),

                // MERC-t5k: Combat target selection - only when targets need to be selected
                loop({
                  name: 'combat-target-selection',
                  while: () => game.activeCombat?.pendingTargetSelection != null && !game.isFinished(),
                  maxIterations: 50,
                  do: actionStep({
                    name: 'select-targets',
                    actions: ['combatSelectTarget'],
                    skipIf: () => game.isFinished() || game.activeCombat?.pendingTargetSelection == null,
                  }),
                }),

                // MERC-dice: Hit allocation loop - when player needs to allocate hits
                loop({
                  name: 'combat-hit-allocation',
                  while: () => game.activeCombat?.pendingHitAllocation != null && !game.isFinished(),
                  maxIterations: 50,
                  do: actionStep({
                    name: 'allocate-hits',
                    actions: ['combatAllocateHits', 'combatBasicReroll'],
                    skipIf: () => game.isFinished() || game.activeCombat?.pendingHitAllocation == null,
                  }),
                }),

                // MERC-dice: Wolverine 6s allocation loop
                loop({
                  name: 'combat-wolverine-sixes',
                  while: () => game.activeCombat?.pendingWolverineSixes != null && !game.isFinished(),
                  maxIterations: 50,
                  do: actionStep({
                    name: 'allocate-wolverine-sixes',
                    actions: ['combatAllocateWolverineSixes'],
                    skipIf: () => game.isFinished() || game.activeCombat?.pendingWolverineSixes == null,
                  }),
                }),

                // MERC-n1f: Combat continue/retreat - only when no target selection or hit allocation pending
                loop({
                  name: 'combat-decision',
                  while: () => game.activeCombat !== null &&
                              game.activeCombat.pendingTargetSelection == null &&
                              game.activeCombat.pendingHitAllocation == null &&
                              game.activeCombat.pendingWolverineSixes == null &&
                              !game.isFinished(),
                  maxIterations: 50,
                  do: actionStep({
                    name: 'continue-or-retreat',
                    actions: ['combatContinue', 'combatRetreat'],
                    skipIf: () => game.isFinished() || game.activeCombat === null ||
                                  game.activeCombat.pendingTargetSelection != null ||
                                  game.activeCombat.pendingHitAllocation != null ||
                                  game.activeCombat.pendingWolverineSixes != null,
                  }),
                }),

                // Regular action step - only runs when not in combat
                actionStep({
                  name: 'rebel-action',
                  // Per rules (05-main-game-loop.md): Combat triggers via movement, not as separate action
                  // MERC-wrq: Added coordinatedAttack for same-player multi-squad attacks
                  // MERC-a2h: Added multi-player coordinated attack actions
                  // MERC-ttx: splitSquad is free action, available anytime
                  actions: [
                    'move',
                    'coordinatedAttack', // MERC-wrq: Same player, both squads
                    'declareCoordinatedAttack', // MERC-a2h: Stage for multi-player attack
                    'joinCoordinatedAttack', // MERC-a2h: Join declared attack
                    'executeCoordinatedAttack', // MERC-a2h: Execute multi-player attack
                    'explore',
                    'train',
                    'hireMerc',
                    'reEquip',
                    'dropEquipment',
                    'hospital',
                    'docHeal', // MERC-m4k: Doc's free heal ability
                    'feedbackDiscard', // MERC-24h: Feedback discard retrieval
                    'squidheadDisarm', // MERC-4qd: Squidhead disarm mines
                    'squidheadArm', // MERC-4qd: Squidhead arm mines
                    'hagnessDraw', // MERC-jrph: Hagness draw equipment
                    'armsDealer',
                    'splitSquad', // MERC-ttx: Free action available anytime
                    'mergeSquads',
                    'endTurn',
                  ],
                  skipIf: () => game.isFinished() || game.activeCombat !== null,
                }),
              ),
            }),
          }),

          // Dictator turn
          // MERC-e94i: Wrap in eachPlayer to set dictator as current player
          // Per rules (05-main-game-loop.md):
          // Step 1: Play Tactics card OR Reinforce
          // Step 2: Each Dictator MERC takes 2 actions
          // Step 3: Use Special Ability (if applicable)
          // Step 4: Refill hand to 3 cards
          eachPlayer({
            name: 'dictator-turn',
            filter: (player) => game.isDictatorPlayer(player as any) && !game.isFinished(),
            do: sequence(
              execute(() => {
                // Safety: Clear any stale rebel combat state (shouldn't happen but defensive)
                if (game.activeCombat) {
                  game.message('Warning: Clearing stale combat state');
                  game.activeCombat = null;
                }
                if (game.pendingCombat) {
                  game.pendingCombat = null;
                }
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

              // Log that MERC actions phase completed
              execute(() => {
                game.message('Dictator MERC actions complete');
              }),

              // Move militia (free action)
              actionStep({
                name: 'dictator-militia-movement',
                actions: ['moveMilitia', 'skipMilitiaMove'],
                skipIf: () => game.isFinished(),
              }),

              // Log militia movement complete
              execute(() => {
                game.message('Militia movement phase complete');
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
