import {
  loop,
  eachPlayer,
  actionStep as boardsmithActionStep,
  sequence,
  execute,
  phase,
  type FlowDefinition,
  type ActionStepConfig,
  type Game,
  type Player,
} from 'boardsmith';
import type { MERCGame, RebelPlayer } from './game.js';

// Extended ActionStepConfig with prompt support (MERC extension)
type MERCActionStepConfig = ActionStepConfig & {
  prompt?: string;
};

// Wrapper that accepts prompt property and strips it before passing to boardsmith
function actionStep(config: MERCActionStepConfig) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { prompt, ...rest } = config;
  return boardsmithActionStep(rest);
}
import { TacticsCard } from './elements.js';
import { getDay1Summary, drawTacticsHand } from './day-one.js';
import { applyDictatorTurnAbilities } from './dictator-abilities.js';
import { applyConscriptsEffect, applyOilReservesEffect } from './tactics-effects.js';
import { executeCombat, clearActiveCombat } from './combat.js';
import { getGlobalCachedValue } from './actions/helpers.js';

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
            filter: (player) => game.isRebelPlayer(player), // Only rebels, skip dictator
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
                  const player = ctx.player;
                  if (!player || !game.isRebelPlayer(player)) return true;
                  const hasTeresa = player.team?.some((m: { combatantId: string }) => m.combatantId === 'teresa');
                  return !hasTeresa;
                },
              }),
            ),
          }),

          // ===== DICTATOR PHASE =====
          // MERC-mtoq: Convert to action steps for human dictator support
          eachPlayer({
            name: 'dictator-landing',
            filter: (player) => game.isDictatorPlayer(player),
            do: sequence(
              execute(() => {
                game.message('--- Dictator Phase ---');
                game.message('=== Dictator Day 1 Phase ===');
              }),

              // Step 0: Human dictator chooses which dictator to play as
              actionStep({
                name: 'select-dictator',
                actions: ['selectDictator'],
                prompt: 'Choose your Dictator',
                skipIf: () => game.dictatorPlayer?.isAI === true || game.dictatorPlayer?.dictator !== undefined,
              }),

              // Step 1: Place initial militia on unoccupied industries
              actionStep({
                name: 'dictator-place-initial-militia',
                actions: ['dictatorPlaceInitialMilitia'],
                prompt: 'Place initial militia on unoccupied industries',
              }),

              // Step 1.5: Human Kim chooses base location (before hiring MERC)
              // Kim's ability reveals base immediately, so this must happen early
              actionStep({
                name: 'choose-kim-base',
                actions: ['chooseKimBase'],
                prompt: "Kim's Ability: Choose your base location",
                skipIf: () => {
                  const dictator = game.dictatorPlayer?.dictator;
                  // Skip if not Kim, or AI, or base already set
                  return dictator?.combatantId !== 'kim' ||
                         game.dictatorPlayer?.isAI === true ||
                         !!game.dictatorPlayer?.baseSectorId;
                },
              }),

              // Step 1.6: Apply Kim's setup ability immediately after base choice
              // This reveals base and places militia before hiring
              actionStep({
                name: 'dictator-kim-ability',
                actions: ['dictatorSetupAbility'],
                prompt: "Apply Kim's ability",
                skipIf: () => {
                  const dictator = game.dictatorPlayer?.dictator;
                  return dictator?.combatantId !== 'kim';
                },
              }),

              // Step 2: Hire dictator's first MERC
              actionStep({
                name: 'dictator-hire-first-merc',
                actions: ['dictatorHireFirstMerc'],
                prompt: 'Hire your first MERC',
              }),

              // Step 3: Apply dictator special ability (for non-Kim dictators)
              actionStep({
                name: 'dictator-setup-ability',
                actions: ['dictatorSetupAbility'],
                prompt: 'Apply dictator special ability',
                skipIf: () => {
                  const dictator = game.dictatorPlayer?.dictator;
                  // Skip for Kim (already applied above)
                  return dictator?.combatantId === 'kim';
                },
              }),

              // Step 4: Draw tactics hand
              actionStep({
                name: 'dictator-draw-tactics',
                actions: ['dictatorDrawTactics'],
                prompt: 'Draw tactics cards',
              }),

              // Step 5: Place extra militia (loop for human player to place multiple times)
              loop({
                name: 'extra-militia-loop',
                while: () => {
                  const extra = game.setupConfig?.dictatorStrength?.extra ?? 0;
                  if (extra === 0) return false;
                  // For AI, only run once
                  if (game.dictatorPlayer?.isAI) {
                    const remaining = getGlobalCachedValue<number>(game, '_extra_militia_remaining');
                    return remaining === undefined; // Run once, then stop
                  }
                  // For human, continue while militia remaining
                  const remaining = getGlobalCachedValue<number>(game, '_extra_militia_remaining');
                  return remaining === undefined || remaining > 0;
                },
                maxIterations: 20,
                do: actionStep({
                  name: 'dictator-place-extra-militia',
                  actions: ['dictatorPlaceExtraMilitia', 'dictatorSkipExtraMilitia'],
                  prompt: 'Place extra militia',
                }),
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
            filter: (player) => game.isRebelPlayer(player) && !game.isFinished(),
            do: sequence(
              // MERC-vqmi: Apply Oil Reserves free action at start of turn
              execute((ctx) => {
                const player = ctx?.player as RebelPlayer | undefined;
                if (player) {
                  applyOilReservesEffect(game, true, player);
                }
              }),

              loop({
                name: 'rebel-action-loop',
              while: (ctx) => {
                if (game.isFinished()) return false;
                // MERC-t5k: Keep player in loop while combat is active or pending
                // BUT exit if combatComplete is true (UI is animating, player can continue)
                if (game.activeCombat !== null && !game.activeCombat.combatComplete) return true;
                if (game.pendingCombat !== null) return true; // Combat about to start
                // Check if current player has any MERCs with actions remaining
                const player = ctx?.player as RebelPlayer | undefined;
                if (player) {
                  const hasActionsLeft = player.team.some(m => m.actionsRemaining > 0);
                  return hasActionsLeft;
                }
                return true; // Continue if no player context (shouldn't happen)
              },
              maxIterations: 50, // Safety limit per turn
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

                // MERC-l09: Attack Dog assignment - when player needs to choose dog target
                loop({
                  name: 'combat-attack-dog-selection',
                  while: () => game.activeCombat?.pendingAttackDogSelection != null && !game.isFinished(),
                  maxIterations: 50,
                  do: actionStep({
                    name: 'assign-attack-dog',
                    actions: ['combatAssignAttackDog'],
                    skipIf: () => game.isFinished() || game.activeCombat?.pendingAttackDogSelection == null,
                  }),
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

                // MERC-4.9: Epinephrine Shot choice loop
                loop({
                  name: 'combat-epinephrine',
                  while: () => game.activeCombat?.pendingEpinephrine != null && !game.isFinished(),
                  maxIterations: 10,
                  do: actionStep({
                    name: 'use-epinephrine',
                    actions: ['combatUseEpinephrine', 'combatDeclineEpinephrine'],
                    skipIf: () => game.isFinished() || game.activeCombat?.pendingEpinephrine == null,
                  }),
                }),

                // MERC-n1f: Combat continue/retreat - only when no target selection or hit allocation pending
                // Also skip when combatComplete (UI is animating)
                loop({
                  name: 'combat-decision',
                  while: () => game.activeCombat !== null &&
                              !game.activeCombat.combatComplete &&
                              game.activeCombat.pendingTargetSelection == null &&
                              game.activeCombat.pendingHitAllocation == null &&
                              game.activeCombat.pendingWolverineSixes == null &&
                              game.activeCombat.pendingEpinephrine == null &&
                              !game.isFinished(),
                  maxIterations: 50,
                  do: actionStep({
                    name: 'continue-or-retreat',
                    actions: ['combatContinue', 'combatRetreat'],
                    skipIf: () => game.isFinished() || game.activeCombat === null ||
                                  game.activeCombat.combatComplete ||
                                  game.activeCombat.pendingTargetSelection != null ||
                                  game.activeCombat.pendingHitAllocation != null ||
                                  game.activeCombat.pendingWolverineSixes != null ||
                                  game.activeCombat.pendingEpinephrine != null,
                  }),
                }),

                // Regular action step - only runs when not in combat
                actionStep({
                  name: 'rebel-action',
                  // Per rules (05-main-game-loop.md): Combat triggers via movement, not as separate action
                  // MERC-wrq: Added coordinatedAttack for same-player multi-squad attacks
                  // MERC-a2h: Added multi-player coordinated attack actions
                  // assignToSquad is free action, available anytime
                  actions: [
                    'move',
                    'coordinatedAttack', // MERC-wrq: Same player, both squads
                    'declareCoordinatedAttack', // MERC-a2h: Stage for multi-player attack
                    'joinCoordinatedAttack', // MERC-a2h: Join declared attack
                    'executeCoordinatedAttack', // MERC-a2h: Execute multi-player attack
                    'explore', // collectEquipment chains via followUp
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
                    'repairKit', // MERC-3po: Repair Kit retrieve from discard
                    'assignToSquad', // Free action available anytime
                    'endTurn',
                  ],
                  // Allow regular actions if combat is complete (UI animating)
                  skipIf: () => game.isFinished() || (game.activeCombat !== null && !game.activeCombat.combatComplete),
                }),
              ),
            }),
            ), // Close sequence wrapper for rebel turn
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
            filter: (player) => game.isDictatorPlayer(player) && !game.isFinished(),
            do: sequence(
              execute(() => {
                // Safety: Clear any stale rebel combat state (shouldn't happen but defensive)
                if (game.activeCombat) {
                  game.message('Warning: Clearing stale combat state');
                  clearActiveCombat(game);
                }
                if (game.pendingCombat) {
                  game.pendingCombat = null;
                }
                game.message('--- Dictator Turn ---');

                // Ensure human dictator has cards in hand at start of turn
                // This handles cases where Day 1 drawing may have been skipped
                if (!game.dictatorPlayer?.isAI) {
                  const handCount = game.dictatorPlayer?.tacticsHand?.count(TacticsCard) ?? 0;
                  if (handCount === 0) {
                    drawTacticsHand(game);
                  }
                }

                // MERC-vqmi: Apply Oil Reserves free action at start of turn
                applyOilReservesEffect(game, false);
              }),

              // Step 1: Play a tactics card or reinforce
              actionStep({
                name: 'dictator-play-tactics',
                actions: ['playTactics', 'reinforce'],
                skipIf: () => game.isFinished(),
              }),

              // MERC-lw9r: Artillery hit allocation - rebels choose how damage is allocated
              // This runs after playTactics in case Artillery Barrage was played
              loop({
                name: 'artillery-allocation',
                while: () => game.pendingArtilleryAllocation != null && !game.isFinished(),
                maxIterations: 50, // Safety: max sectors * max allocations per sector
                do: actionStep({
                  name: 'artillery-allocate',
                  actions: ['artilleryAllocateHits'],
                  prompt: 'Allocate artillery damage to your units',
                  skipIf: () => game.isFinished() || game.pendingArtilleryAllocation == null,
                }),
              }),

              // Combat handling after tactics card (e.g., Fodder triggers immediate combat)
              // Attack Dog assignment loop
              loop({
                name: 'tactics-combat-attack-dog-selection',
                while: () => game.activeCombat?.pendingAttackDogSelection != null && !game.isFinished(),
                maxIterations: 50,
                do: actionStep({
                  name: 'assign-attack-dog',
                  actions: ['combatAssignAttackDog'],
                  skipIf: () => game.isFinished() || game.activeCombat?.pendingAttackDogSelection == null,
                }),
              }),

              // Target selection loop
              loop({
                name: 'tactics-combat-target-selection',
                while: () => game.activeCombat?.pendingTargetSelection != null && !game.isFinished(),
                maxIterations: 50,
                do: actionStep({
                  name: 'select-targets',
                  actions: ['combatSelectTarget'],
                  skipIf: () => game.isFinished() || game.activeCombat?.pendingTargetSelection == null,
                }),
              }),

              // Hit allocation loop
              loop({
                name: 'tactics-combat-hit-allocation',
                while: () => game.activeCombat?.pendingHitAllocation != null && !game.isFinished(),
                maxIterations: 50,
                do: actionStep({
                  name: 'allocate-hits',
                  actions: ['combatAllocateHits', 'combatBasicReroll'],
                  skipIf: () => game.isFinished() || game.activeCombat?.pendingHitAllocation == null,
                }),
              }),

              // Wolverine 6s allocation loop
              loop({
                name: 'tactics-combat-wolverine-sixes',
                while: () => game.activeCombat?.pendingWolverineSixes != null && !game.isFinished(),
                maxIterations: 50,
                do: actionStep({
                  name: 'allocate-wolverine-sixes',
                  actions: ['combatAllocateWolverineSixes'],
                  skipIf: () => game.isFinished() || game.activeCombat?.pendingWolverineSixes == null,
                }),
              }),

              // MERC-4.9: Epinephrine Shot choice loop
              loop({
                name: 'tactics-combat-epinephrine',
                while: () => game.activeCombat?.pendingEpinephrine != null && !game.isFinished(),
                maxIterations: 10,
                do: actionStep({
                  name: 'use-epinephrine',
                  actions: ['combatUseEpinephrine', 'combatDeclineEpinephrine'],
                  skipIf: () => game.isFinished() || game.activeCombat?.pendingEpinephrine == null,
                }),
              }),

              // Combat continue/retreat decision
              // Skip when combatComplete (UI is animating)
              loop({
                name: 'tactics-combat-decision',
                while: () => game.activeCombat !== null &&
                            !game.activeCombat.combatComplete &&
                            game.activeCombat.pendingTargetSelection == null &&
                            game.activeCombat.pendingHitAllocation == null &&
                            game.activeCombat.pendingWolverineSixes == null &&
                            game.activeCombat.pendingEpinephrine == null &&
                            !game.isFinished(),
                maxIterations: 50,
                do: actionStep({
                  name: 'continue-or-retreat',
                  actions: ['combatContinue', 'combatRetreat'],
                  skipIf: () => game.isFinished() || game.activeCombat === null ||
                                game.activeCombat.combatComplete ||
                                game.activeCombat.pendingTargetSelection != null ||
                                game.activeCombat.pendingHitAllocation != null ||
                                game.activeCombat.pendingWolverineSixes != null ||
                                game.activeCombat.pendingEpinephrine != null,
                }),
              }),

              // Step 2: Dictator MERC actions (if any MERCs)
              // Uses unified action names (same as rebels)
              loop({
                name: 'dictator-merc-actions',
                while: () => {
                  if (game.isFinished()) return false;
                  // MERC-combat-flow: Keep loop active while combat is active or pending
                  // But exit if combatComplete (UI is animating)
                  if (game.activeCombat !== null && !game.activeCombat.combatComplete) return true;
                  if (game.pendingCombat !== null) return true;
                  // Continue while any dictator MERC has actions
                  const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
                  const dictator = game.dictatorPlayer?.dictator;
                  const hasActionsLeft = dictatorMercs.some(m => m.actionsRemaining > 0) ||
                    (dictator?.inPlay && dictator.actionsRemaining > 0);
                  return hasActionsLeft ?? false;
                },
                maxIterations: 50, // Safety limit per turn
                do: sequence(
                  // Check for pending combat (from move action) and initiate it
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

                  // Attack Dog assignment loop
                  loop({
                    name: 'dictator-combat-attack-dog-selection',
                    while: () => game.activeCombat?.pendingAttackDogSelection != null && !game.isFinished(),
                    maxIterations: 50,
                    do: actionStep({
                      name: 'assign-attack-dog',
                      actions: ['combatAssignAttackDog'],
                      skipIf: () => game.isFinished() || game.activeCombat?.pendingAttackDogSelection == null,
                    }),
                  }),

                  // Combat target selection loop
                  loop({
                    name: 'dictator-combat-target-selection',
                    while: () => game.activeCombat?.pendingTargetSelection != null && !game.isFinished(),
                    maxIterations: 50,
                    do: actionStep({
                      name: 'select-targets',
                      actions: ['combatSelectTarget'],
                      skipIf: () => game.isFinished() || game.activeCombat?.pendingTargetSelection == null,
                    }),
                  }),

                  // Hit allocation loop
                  loop({
                    name: 'dictator-combat-hit-allocation',
                    while: () => game.activeCombat?.pendingHitAllocation != null && !game.isFinished(),
                    maxIterations: 50,
                    do: actionStep({
                      name: 'allocate-hits',
                      actions: ['combatAllocateHits', 'combatBasicReroll'],
                      skipIf: () => game.isFinished() || game.activeCombat?.pendingHitAllocation == null,
                    }),
                  }),

                  // Wolverine 6s allocation loop
                  loop({
                    name: 'dictator-combat-wolverine-sixes',
                    while: () => game.activeCombat?.pendingWolverineSixes != null && !game.isFinished(),
                    maxIterations: 50,
                    do: actionStep({
                      name: 'allocate-wolverine-sixes',
                      actions: ['combatAllocateWolverineSixes'],
                      skipIf: () => game.isFinished() || game.activeCombat?.pendingWolverineSixes == null,
                    }),
                  }),

                  // MERC-4.9: Epinephrine Shot choice loop
                  loop({
                    name: 'dictator-combat-epinephrine',
                    while: () => game.activeCombat?.pendingEpinephrine != null && !game.isFinished(),
                    maxIterations: 10,
                    do: actionStep({
                      name: 'use-epinephrine',
                      actions: ['combatUseEpinephrine', 'combatDeclineEpinephrine'],
                      skipIf: () => game.isFinished() || game.activeCombat?.pendingEpinephrine == null,
                    }),
                  }),

                  // Combat continue/retreat decision
                  // Skip when combatComplete (UI is animating)
                  loop({
                    name: 'dictator-combat-decision',
                    while: () => game.activeCombat !== null &&
                                !game.activeCombat.combatComplete &&
                                game.activeCombat.pendingTargetSelection == null &&
                                game.activeCombat.pendingHitAllocation == null &&
                                game.activeCombat.pendingWolverineSixes == null &&
                                game.activeCombat.pendingEpinephrine == null &&
                                !game.isFinished(),
                    maxIterations: 50,
                    do: actionStep({
                      name: 'continue-or-retreat',
                      actions: ['combatContinue', 'combatRetreat'],
                      skipIf: () => game.isFinished() || game.activeCombat === null ||
                                    game.activeCombat.combatComplete ||
                                    game.activeCombat.pendingTargetSelection != null ||
                                    game.activeCombat.pendingHitAllocation != null ||
                                    game.activeCombat.pendingWolverineSixes != null ||
                                    game.activeCombat.pendingEpinephrine != null,
                    }),
                  }),

                  // Regular action step - only runs when not in combat
                  actionStep({
                    name: 'dictator-merc-action',
                    actions: [
                      'move',
                      'explore',
                      'train',
                      'reEquip',
                      'dropEquipment',
                      'hospital',
                      'docHeal', // MERC-m4k: Doc's free heal ability
                      'feedbackDiscard', // MERC-24h: Feedback discard retrieval
                      'squidheadDisarm', // MERC-4qd: Squidhead disarm mines
                      'squidheadArm', // MERC-4qd: Squidhead arm mines
                      'hagnessDraw', // MERC-jrph: Hagness draw equipment
                      'armsDealer',
                      'repairKit',
                      'mortar',
                      'assignToSquad',
                      'endTurn',
                    ],
                    skipIf: () => game.isFinished(),
                  }),
                ),
              }),

              // Log that MERC actions phase completed
              execute(() => {
                if (game.isFinished()) return; // Game ended during combat
                game.message('Dictator MERC actions complete');
              }),

              // Step 3: Apply per-turn dictator special ability
              // For AI: auto-apply ability; For human: let them choose
              execute(() => {
                if (game.isFinished()) return;
                if (game.dictatorPlayer?.isAI) {
                  applyDictatorTurnAbilities(game);
                }
                // Human players use the actionStep below
              }),

              // Human dictator ability choice (skipped for AI)
              actionStep({
                name: 'dictator-ability',
                actions: ['castroBonusHire', 'kimBonusMilitia'],
                skipIf: () => game.isFinished() || game.dictatorPlayer?.isAI === true,
              }),

              // Combat handling after Kim's militia placement ability
              // Attack Dog assignment loop
              loop({
                name: 'kim-militia-combat-attack-dog-selection',
                while: () => game.activeCombat?.pendingAttackDogSelection != null && !game.isFinished(),
                maxIterations: 50,
                do: actionStep({
                  name: 'assign-attack-dog',
                  actions: ['combatAssignAttackDog'],
                  skipIf: () => game.isFinished() || game.activeCombat?.pendingAttackDogSelection == null,
                }),
              }),

              // Target selection loop
              loop({
                name: 'kim-militia-combat-target-selection',
                while: () => game.activeCombat?.pendingTargetSelection != null && !game.isFinished(),
                maxIterations: 50,
                do: actionStep({
                  name: 'select-targets',
                  actions: ['combatSelectTarget'],
                  skipIf: () => game.isFinished() || game.activeCombat?.pendingTargetSelection == null,
                }),
              }),

              // Hit allocation loop
              loop({
                name: 'kim-militia-combat-hit-allocation',
                while: () => game.activeCombat?.pendingHitAllocation != null && !game.isFinished(),
                maxIterations: 50,
                do: actionStep({
                  name: 'allocate-hits',
                  actions: ['combatAllocateHits', 'combatBasicReroll'],
                  skipIf: () => game.isFinished() || game.activeCombat?.pendingHitAllocation == null,
                }),
              }),

              // Wolverine 6s allocation loop
              loop({
                name: 'kim-militia-combat-wolverine-sixes',
                while: () => game.activeCombat?.pendingWolverineSixes != null && !game.isFinished(),
                maxIterations: 50,
                do: actionStep({
                  name: 'allocate-wolverine-sixes',
                  actions: ['combatAllocateWolverineSixes'],
                  skipIf: () => game.isFinished() || game.activeCombat?.pendingWolverineSixes == null,
                }),
              }),

              // Epinephrine Shot choice loop
              loop({
                name: 'kim-militia-combat-epinephrine',
                while: () => game.activeCombat?.pendingEpinephrine != null && !game.isFinished(),
                maxIterations: 10,
                do: actionStep({
                  name: 'use-epinephrine',
                  actions: ['combatUseEpinephrine', 'combatDeclineEpinephrine'],
                  skipIf: () => game.isFinished() || game.activeCombat?.pendingEpinephrine == null,
                }),
              }),

              // Combat continue/retreat decision
              // Skip when combatComplete (UI is animating)
              loop({
                name: 'kim-militia-combat-decision',
                while: () => game.activeCombat !== null &&
                            !game.activeCombat.combatComplete &&
                            game.activeCombat.pendingTargetSelection == null &&
                            game.activeCombat.pendingHitAllocation == null &&
                            game.activeCombat.pendingWolverineSixes == null &&
                            game.activeCombat.pendingEpinephrine == null &&
                            !game.isFinished(),
                maxIterations: 50,
                do: actionStep({
                  name: 'continue-or-retreat',
                  actions: ['combatContinue', 'combatRetreat'],
                  skipIf: () => game.isFinished() || game.activeCombat === null ||
                                game.activeCombat.combatComplete ||
                                game.activeCombat.pendingTargetSelection != null ||
                                game.activeCombat.pendingHitAllocation != null ||
                                game.activeCombat.pendingWolverineSixes != null ||
                                game.activeCombat.pendingEpinephrine != null,
                }),
              }),

              // Apply end-of-turn effects (Conscripts)
              execute(() => {
                if (game.isFinished()) return;
                applyConscriptsEffect(game);
              }),

              // Step 4: Refill hand to 3 cards
              execute(() => {
                if (game.isFinished()) return;
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
