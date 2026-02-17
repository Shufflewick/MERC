import {
  loop,
  eachPlayer,
  actionStep as boardsmithActionStep,
  simultaneousActionStep,
  sequence,
  execute,
  phase,
  type FlowDefinition,
  type ActionStepConfig,
  type Game,
  type Player,
} from 'boardsmith';
import type { MERCGame, RebelPlayer, DictatorPlayer } from './game.js';

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
import { TacticsCard, Sector } from './elements.js';
import { getDay1Summary, drawTacticsHand } from './day-one.js';
import { applyDictatorTurnAbilities, applyHusseinBonusTactics } from './dictator-abilities.js';
import { applyConscriptsEffect, applyOilReservesEffect } from './tactics-effects.js';
import { executeCombat, executeCombatRetreat, clearActiveCombat, hasEnemies, queuePendingCombat, canRetreat } from './combat.js';
import type { Combatant } from './combat-types.js';
import { checkLandMines } from './landmine.js';
import { getGlobalCachedValue, setGlobalCachedValue } from './actions/helpers.js';
import { drawDictatorFirstMerc } from './actions/day-one-actions.js';

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

/** Resolve the player who controls the given combatant for combat decisions */
function getCombatDecisionPlayer(game: MERCGame, attackerId: string, fallback: Player): Player {
  const attacker = game.activeCombat?.rebelCombatants?.find(c => c.id === attackerId) ||
                   game.activeCombat?.dictatorCombatants?.find(c => c.id === attackerId);
  if (!attacker) return fallback;

  if (attacker.isDictatorSide) {
    return game.dictatorPlayer ?? fallback;
  }

  // Rebel unit — find owning player via sourceElement or ownerId
  if (attacker.sourceElement) {
    const owner = game.rebelPlayers.find(p =>
      p.team.some(m => m.id === attacker.sourceElement!.id)
    );
    if (owner) return owner;
  }
  if (attacker.ownerId) {
    const owner = game.rebelPlayers.find(p => `${p.seat}` === attacker.ownerId);
    if (owner) return owner;
  }
  return fallback;
}

/** Resolve the human players participating in active combat. */
function getCombatDecisionParticipants(game: MERCGame): Player[] {
  if (!game.activeCombat) return [];
  const participants: Player[] = [];

  const rebelCombatants = (game.activeCombat.rebelCombatants ?? []) as Combatant[];
  const dictatorCombatants = (game.activeCombat.dictatorCombatants ?? []) as Combatant[];

  for (const rebel of game.rebelPlayers) {
    if (rebel.isAI) continue;
    const hasUnit = rebelCombatants.some(c => c.health > 0 && !c.isDictatorSide && (
      (c.sourceElement && rebel.team.some(m => m.id === c.sourceElement!.id)) ||
      (c.isMilitia && c.ownerId === `${rebel.seat}`)
    ));
    if (hasUnit) participants.push(rebel);
  }

  const dictator = game.dictatorPlayer;
  if (dictator && !dictator.isAI) {
    const hasUnit = dictatorCombatants.some(c => c.health > 0 && c.isDictatorSide);
    if (hasUnit) participants.push(dictator);
  }

  return participants;
}

function getPlayerBySeat(game: MERCGame, seat: string): Player | undefined {
  const rebel = game.rebelPlayers.find(p => `${p.seat}` === seat);
  if (rebel) return rebel;
  const dictator = game.dictatorPlayer;
  if (dictator && `${dictator.seat}` === seat) return dictator;
  return undefined;
}

/** Resolve the player who should decide epinephrine use (owner of the dying MERC) */
function getEpinephrineDecisionPlayer(game: MERCGame, fallback: Player): Player {
  const pending = game.activeCombat?.pendingEpinephrine;
  if (!pending) return fallback;

  if (pending.dyingCombatantSide === 'dictator') {
    return game.dictatorPlayer ?? fallback;
  }

  // Rebel side — find the rebel player who owns the dying MERC
  const dyingId = pending.dyingCombatantId;
  for (const rebel of game.rebelPlayers) {
    const allMercs = [...rebel.primarySquad.getMercs(), ...rebel.secondarySquad.getMercs()];
    if (allMercs.some(m => m.id === dyingId)) {
      return rebel;
    }
  }
  return fallback;
}

/**
 * Combat Resolution Sub-Flow
 *
 * Encapsulates the 10-block combat resolution pipeline that was previously
 * duplicated at 4 call sites (rebel, tactics, dictator, Kim militia).
 * Each block handles one phase of combat decision-making:
 *
 * 1. Before-attack healing
 * 2. Attack dog selection
 * 3. Target selection
 * 4. Hit allocation
 * 5. Wolverine 6s allocation
 * 6. Epinephrine decision
 * 7. Combat continue (non-retreat rounds)
 * 8. Retreat decision (simultaneous)
 * 9. Auto-clear for all-AI games
 * 10. Animation wait for human games
 *
 * @param game - The game instance
 * @param prefix - Loop name prefix for uniqueness (e.g., 'combat', 'tactics-combat')
 */
function combatResolutionFlow(game: MERCGame, prefix: string) {
  return sequence(
    // 1. Before-attack healing - "On your initiative, before your attack, discard dice to heal"
    loop({
      name: `${prefix}-before-attack-healing`,
      while: () => game.activeCombat?.pendingBeforeAttackHealing != null && !game.isFinished(),
      maxIterations: 50,
      do: actionStep({
        name: 'before-attack-heal',
        player: (ctx) => {
          const pending = game.activeCombat?.pendingBeforeAttackHealing;
          if (!pending) return ctx.player!;
          return getCombatDecisionPlayer(game, pending.attackerId, ctx.player!);
        },
        actions: ['combatBeforeAttackHeal', 'combatSkipBeforeAttackHeal'],
        skipIf: () => game.isFinished() || game.activeCombat?.pendingBeforeAttackHealing == null,
      }),
    }),

    // 2. Attack Dog assignment - when player needs to choose dog target
    loop({
      name: `${prefix}-attack-dog-selection`,
      while: () => game.activeCombat?.pendingAttackDogSelection != null && !game.isFinished(),
      maxIterations: 50,
      do: actionStep({
        name: 'assign-attack-dog',
        player: (ctx) => {
          const pending = game.activeCombat?.pendingAttackDogSelection;
          if (!pending) return ctx.player!;
          return getCombatDecisionPlayer(game, pending.attackerId, ctx.player!);
        },
        actions: ['combatAssignAttackDog'],
        skipIf: () => game.isFinished() || game.activeCombat?.pendingAttackDogSelection == null,
      }),
    }),

    // 3. Combat target selection - only when targets need to be selected
    loop({
      name: `${prefix}-target-selection`,
      while: () => game.activeCombat?.pendingTargetSelection != null && !game.isFinished(),
      maxIterations: 50,
      do: actionStep({
        name: 'select-targets',
        player: (ctx) => {
          const pending = game.activeCombat?.pendingTargetSelection;
          if (!pending) return ctx.player!;
          return getCombatDecisionPlayer(game, pending.attackerId, ctx.player!);
        },
        actions: ['combatSelectTarget'],
        skipIf: () => game.isFinished() || game.activeCombat?.pendingTargetSelection == null,
      }),
    }),

    // 4. Hit allocation loop - when player needs to allocate hits
    loop({
      name: `${prefix}-hit-allocation`,
      while: () => game.activeCombat?.pendingHitAllocation != null && !game.isFinished(),
      maxIterations: 50,
      do: actionStep({
        name: 'allocate-hits',
        player: (ctx) => {
          const pending = game.activeCombat?.pendingHitAllocation;
          if (!pending) return ctx.player!;
          return getCombatDecisionPlayer(game, pending.attackerId, ctx.player!);
        },
        actions: ['combatAllocateHits', 'combatBasicReroll'],
        skipIf: () => game.isFinished() || game.activeCombat?.pendingHitAllocation == null,
      }),
    }),

    // 5. Wolverine 6s allocation loop
    loop({
      name: `${prefix}-wolverine-sixes`,
      while: () => game.activeCombat?.pendingWolverineSixes != null && !game.isFinished(),
      maxIterations: 50,
      do: actionStep({
        name: 'allocate-wolverine-sixes',
        actions: ['combatAllocateWolverineSixes'],
        skipIf: () => game.isFinished() || game.activeCombat?.pendingWolverineSixes == null,
      }),
    }),

    // 6. Epinephrine Shot choice loop
    loop({
      name: `${prefix}-epinephrine`,
      while: () => game.activeCombat?.pendingEpinephrine != null && !game.isFinished(),
      maxIterations: 10,
      do: actionStep({
        name: 'use-epinephrine',
        player: (ctx) => getEpinephrineDecisionPlayer(game, ctx.player!),
        actions: ['combatUseEpinephrine', 'combatDeclineEpinephrine'],
        skipIf: () => game.isFinished() || game.activeCombat?.pendingEpinephrine == null,
      }),
    }),

    // 7. Combat continue/retreat - only when no pending decisions
    // Also skip when combatComplete (UI is animating)
    loop({
      name: `${prefix}-continue`,
      while: () => game.activeCombat !== null &&
                  !game.activeCombat.combatComplete &&
                  !game.activeCombat.awaitingRetreatDecisions &&
                  game.activeCombat.pendingBeforeAttackHealing == null &&
                  game.activeCombat.pendingAttackDogSelection == null &&
                  game.activeCombat.pendingTargetSelection == null &&
                  game.activeCombat.pendingHitAllocation == null &&
                  game.activeCombat.pendingWolverineSixes == null &&
                  game.activeCombat.pendingEpinephrine == null &&
                  !game.isFinished(),
      maxIterations: 50,
      do: actionStep({
        name: 'combat-continue',
        actions: ['combatContinue'],
        skipIf: () => game.isFinished() || game.activeCombat === null ||
                      game.activeCombat.combatComplete ||
                      game.activeCombat.awaitingRetreatDecisions ||
                      game.activeCombat.pendingBeforeAttackHealing != null ||
                      game.activeCombat.pendingAttackDogSelection != null ||
                      game.activeCombat.pendingTargetSelection != null ||
                      game.activeCombat.pendingHitAllocation != null ||
                      game.activeCombat.pendingWolverineSixes != null ||
                      game.activeCombat.pendingEpinephrine != null,
      }),
    }),

    // 8. Retreat decision (simultaneous action step + execute for retreat processing)
    loop({
      name: `${prefix}-retreat-decision`,
      while: () => game.activeCombat !== null &&
                  !game.activeCombat.combatComplete &&
                  game.activeCombat.awaitingRetreatDecisions === true &&
                  game.activeCombat.pendingBeforeAttackHealing == null &&
                  game.activeCombat.pendingAttackDogSelection == null &&
                  game.activeCombat.pendingTargetSelection == null &&
                  game.activeCombat.pendingHitAllocation == null &&
                  game.activeCombat.pendingWolverineSixes == null &&
                  game.activeCombat.pendingEpinephrine == null &&
                  !game.isFinished(),
      maxIterations: 50,
      do: sequence(
        execute(() => {
          if (!game.activeCombat) return;
          if (!game.activeCombat.retreatDecisions) {
            game.activeCombat.retreatDecisions = new Map();
          } else {
            game.activeCombat.retreatDecisions.clear();
          }
        }),
        simultaneousActionStep({
          name: 'continue-or-retreat',
          players: () => getCombatDecisionParticipants(game),
          actions: ['combatContinue', 'combatRetreat'],
          playerDone: (_ctx, player) => {
            return game.activeCombat?.retreatDecisions?.has(`${player.seat}`) ?? false;
          },
          allDone: () => game.isFinished() || game.activeCombat === null ||
                        game.activeCombat.combatComplete ||
                        game.activeCombat.awaitingRetreatDecisions !== true ||
                        game.activeCombat.pendingBeforeAttackHealing != null ||
                        game.activeCombat.pendingAttackDogSelection != null ||
                        game.activeCombat.pendingTargetSelection != null ||
                        game.activeCombat.pendingHitAllocation != null ||
                        game.activeCombat.pendingWolverineSixes != null ||
                        game.activeCombat.pendingEpinephrine != null ||
                        getCombatDecisionParticipants(game).every(p =>
                          game.activeCombat?.retreatDecisions?.has(`${p.seat}`) ?? false),
        }),
        execute(() => {
          if (!game.activeCombat || game.activeCombat.combatComplete) return;

          const decisions = game.activeCombat.retreatDecisions;
          const continueChosen = decisions
            ? Array.from(decisions.values()).some(d => d.action === 'continue')
            : false;
          const retreatEntries = decisions
            ? Array.from(decisions.entries())
              .filter(([, d]) => d.action === 'retreat' && d.retreatSectorId)
            : [];

          retreatEntries.sort((a, b) => Number(a[0]) - Number(b[0]));

          for (const [seat, decision] of retreatEntries) {
            if (!game.activeCombat || game.activeCombat.combatComplete) break;
            const player = getPlayerBySeat(game, seat);
            if (!player) continue;
            if (!game.isRebelPlayer(player) && !game.isDictatorPlayer(player)) continue;
            const combatSector = game.getSector(game.activeCombat.sectorId);
            const retreatSector = decision.retreatSectorId
              ? game.getSector(decision.retreatSectorId)
              : null;
            if (!combatSector || !retreatSector) continue;
            if (!canRetreat(game, combatSector, player as RebelPlayer | DictatorPlayer)) continue;
            executeCombatRetreat(game, retreatSector, player as RebelPlayer | DictatorPlayer);
          }

          if (game.activeCombat && !game.activeCombat.combatComplete) {
            const remainingHumans = getCombatDecisionParticipants(game);
            if (continueChosen || remainingHumans.length === 0) {
              const sector = game.getSector(game.activeCombat.sectorId);
              const attackingPlayer = game.rebelPlayers.find(
                p => `${p.seat}` === game.activeCombat!.attackingPlayerId
              );
              if (sector && attackingPlayer) {
                executeCombat(game, sector, attackingPlayer);
              }
            }
          }

          if (game.activeCombat) {
            // Clear processed decisions but DO NOT override awaitingRetreatDecisions.
            // executeCombat sets it correctly — forcing it to false caused the flow
            // to skip the simultaneous retreat-decision step, leaving the non-context
            // player stuck with no buttons in two-human-player games.
            game.activeCombat.retreatDecisions?.clear();
          }
        }),
      ),
    }),

    // 9. Auto-clear in fully AI games
    execute(() => {
      if (game.activeCombat?.combatComplete &&
          game.dictatorPlayer?.isAI &&
          game.rebelPlayers.every(p => p.isAI)) {
        clearActiveCombat(game);
      }
    }),

    // 10. Animation wait loop — CombatPanel triggers clear for human games
    loop({
      name: `${prefix}-animation-wait`,
      while: () => game.activeCombat?.combatComplete === true &&
        !(game.dictatorPlayer?.isAI && game.rebelPlayers.every(p => p.isAI)),
      maxIterations: 5,
      do: actionStep({
        name: 'wait-for-combat-animations',
        actions: ['clearCombatAnimations'],
        skipIf: () => !game.activeCombat?.combatComplete,
      }),
    }),
  );
}

/** Check if a rebel has completed Day 1 setup (landed + hired MERCs) */
function isDay1Complete(game: MERCGame, player: Player): boolean {
  if (!game.isRebelPlayer(player)) return true;
  const rebel = player as RebelPlayer;
  // Must have landed
  if (!rebel.primarySquad.sectorId) return false;
  // Must have at least 2 MERCs (conservative: if Teresa is on team with only 2,
  // hireThirdMerc action may still be available. The engine auto-completes players
  // with no available actions, so returning false here is safe.)
  const hasTeresa = rebel.team.some(m => m.combatantId === 'teresa');
  const requiredSize = hasTeresa ? 3 : 2;
  return rebel.team.length >= requiredSize;
}

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

          // Each rebel performs their Day 1 setup simultaneously
          loop({
            name: 'rebel-landing',
            while: () => !game.isFinished() && game.rebelPlayers.some(p => !isDay1Complete(game, p)),
            maxIterations: 50,
            do: sequence(
              execute(() => {
                game.resetRebelBatching();
              }),
              simultaneousActionStep({
                name: 'rebel-landing-actions',
                players: () => game.rebelPlayers,
                actions: ['placeLanding', 'hireFirstMerc', 'hireSecondMerc', 'hireThirdMerc'],
                skipPlayer: (_ctx, player) => isDay1Complete(game, player),
                playerDone: (_ctx, player) => isDay1Complete(game, player),
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

              // Step 2: Draw MERC for dictator hiring (human only — AI draws in execute handler)
              execute(() => {
                drawDictatorFirstMerc(game);
              }),

              // Step 2b: Hire dictator's first MERC
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

              // Mao/Mussolini: Initialize bonus MERC counter for human path
              execute(() => {
                const dictator = game.dictatorPlayer?.dictator;
                if (!dictator) return;
                if (dictator.combatantId !== 'mao' && dictator.combatantId !== 'mussolini') return;
                if (game.dictatorPlayer?.isAI) return; // AI handled in applyDictatorSetupAbilities
                setGlobalCachedValue(game, '_bonus_mercs_remaining', game.rebelCount);
              }),

              // Mao/Mussolini: Bonus MERC squad placement loop (human only)
              loop({
                name: 'bonus-merc-placement',
                while: () => {
                  const dictator = game.dictatorPlayer?.dictator;
                  if (dictator?.combatantId !== 'mao' && dictator?.combatantId !== 'mussolini') return false;
                  if (game.dictatorPlayer?.isAI) return false;
                  const remaining = getGlobalCachedValue<number>(game, '_bonus_mercs_remaining');
                  return remaining !== undefined && remaining > 0;
                },
                maxIterations: 10,
                do: actionStep({
                  name: 'bonus-merc-squad-choice',
                  actions: ['bonusMercSetup'],
                  prompt: "Dictator Ability: Choose squad for bonus MERC",
                }),
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
                  // For human, continue while militia remaining AND sectors have capacity
                  const remaining = getGlobalCachedValue<number>(game, '_extra_militia_remaining');
                  if (remaining !== undefined && remaining <= 0) return false;
                  const hasCapacity = game.gameMap.getAllSectors().some(
                    s => s.dictatorMilitia > 0 && s.dictatorMilitia < Sector.MAX_MILITIA_PER_SIDE
                  );
                  return hasCapacity;
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

          // MERC-vqmi: Apply Oil Reserves free action for all rebels at start of rebel phase
          execute(() => {
            for (const player of game.rebelPlayers) {
              applyOilReservesEffect(game, true, player);
            }
          }),

          // Rebel phase — all rebels act simultaneously
          loop({
            name: 'rebel-phase',
            while: () => {
              if (game.isFinished()) return false;
              // Keep going while combat is active or pending
              if (game.activeCombat !== null && !game.activeCombat.combatComplete) return true;
              if (game.pendingCombat !== null || game.pendingCombatQueue.length > 0) return true;
              if (game.coordinatedAttack !== null) return true;
              if (game.pendingMortarAttack != null) return true;
              // Continue while any rebel has actions remaining
              return game.rebelPlayers.some(p => p.team.some(m => m.actionsRemaining > 0));
            },
            maxIterations: 200,
            do: sequence(
              // Fire combat-barrier UI signal when re-entering due to combat/mortar/coordinated attack
              execute(() => {
                const hasCombatBarrier =
                  (game.pendingCombat !== null || game.pendingCombatQueue.length > 0) ||
                  (game.activeCombat !== null && !game.activeCombat.combatComplete) ||
                  game.coordinatedAttack !== null ||
                  game.pendingMortarAttack != null;
                if (hasCombatBarrier) {
                  game.animate('combat-barrier', {}, () => {});
                }
              }),

              // Initiate pending combat (from move action or queue)
              execute(() => {
                if (!game.pendingCombat && game.pendingCombatQueue.length > 0) {
                  game.pendingCombat = game.pendingCombatQueue.shift() || null;
                }
                if (game.pendingCombat && !game.activeCombat) {
                  const sector = game.getSector(game.pendingCombat.sectorId);
                  const player = game.rebelPlayers.find(
                    p => `${p.seat}` === game.pendingCombat!.playerId
                  );
                  if (sector && player) {
                    executeCombat(game, sector, player, {
                      attackingPlayerIsRebel: game.pendingCombat.attackingPlayerIsRebel ?? true,
                    });
                  }
                  game.pendingCombat = null;
                }
              }),

              // Combat resolution sub-flow (rebel)
              combatResolutionFlow(game, 'combat'),

              // Mortar hit allocation — player: override resolves firing player from pendingMortarAttack
              loop({
                name: 'rebel-mortar-allocation',
                while: () => game.pendingMortarAttack != null && !game.isFinished(),
                maxIterations: 10,
                do: actionStep({
                  name: 'rebel-mortar-allocate',
                  player: () => {
                    const pending = game.pendingMortarAttack;
                    if (!pending) return game.rebelPlayers[0];
                    const firingPlayer = game.rebelPlayers.find(p => `${p.seat}` === pending.attackingPlayerId);
                    return firingPlayer ?? game.rebelPlayers[0];
                  },
                  actions: ['mortarAllocateHits'],
                  prompt: 'Allocate mortar hits to targets',
                  skipIf: () => game.isFinished() || game.pendingMortarAttack == null,
                }),
              }),

              // MERC-a2h: Multi-player coordinated attack — simultaneous response from other rebels
              loop({
                name: 'coordinated-attack-response',
                while: () => game.coordinatedAttack !== null,
                maxIterations: 1,
                do: sequence(
                  simultaneousActionStep({
                    name: 'coordinated-attack-commit',
                    players: () => {
                      const attack = game.coordinatedAttack;
                      if (!attack) return [];
                      return game.rebelPlayers.filter(p => {
                        // Include declaring player only if they have a second eligible squad
                        if (p.seat === attack.declaringPlayerSeat) {
                          return game.getEligibleSquadsForCoordinatedAttack(p).length > 0;
                        }
                        return game.getEligibleSquadsForCoordinatedAttack(p).length > 0
                          || !game.hasPlayerRespondedToCoordinatedAttack(p.seat);
                      });
                    },
                    actions: ['commitSquadToCoordinatedAttack', 'declineCoordinatedAttack'],
                    playerDone: (_ctx, player) => {
                      return game.hasPlayerRespondedToCoordinatedAttack(player.seat);
                    },
                  }),
                  execute(() => {
                    const result = game.executeCoordinatedAttack();
                    if (!result) return;
                    const { targetSector, enteringSquads, firstRebel } = result;
                    checkLandMines(game, targetSector, enteringSquads, true);
                    if (firstRebel && hasEnemies(game, targetSector, firstRebel as RebelPlayer)) {
                      queuePendingCombat(game, targetSector, firstRebel as RebelPlayer, true);
                    }
                  }),
                ),
              }),

              // Reset AI rebel batching state before entering the simultaneous step
              // (including re-entry after combat barrier resolution)
              execute(() => {
                game.resetRebelBatching();
              }),

              // Main simultaneous action step — all rebels act in parallel
              simultaneousActionStep({
                name: 'rebel-actions',
                players: () => game.rebelPlayers,
                actions: [
                  'move',
                  'coordinatedAttack',
                  'declareMultiPlayerAttack',
                  'explore',
                  'train',
                  'hireMerc',
                  'reEquip',
                  'dropEquipment',
                  'hospital',
                  'feedbackDiscard',
                  'squidheadDisarm',
                  'squidheadArm',
                  'hagnessDrawType',
                  'hagnessGiveEquipment',
                  'armsDealer',
                  'repairKit',
                  'mortar',
                  'assignToSquad',
                  'endTurn',
                ],
                skipPlayer: (_ctx, player) => {
                  if (game.isFinished()) return true;
                  const rebel = player as RebelPlayer;
                  return !rebel.team.some(m => m.actionsRemaining > 0);
                },
                playerDone: (_ctx, player) => {
                  const rebel = player as RebelPlayer;
                  return !rebel.team.some(m => m.actionsRemaining > 0);
                },
                allDone: () => {
                  if (game.isFinished()) return true;
                  // Break out for combat resolution
                  if (game.activeCombat !== null && !game.activeCombat.combatComplete) return true;
                  if (game.pendingCombat !== null || game.pendingCombatQueue.length > 0) return true;
                  if (game.coordinatedAttack !== null) return true;
                  if (game.pendingMortarAttack != null) return true;
                  // All rebels done
                  return game.rebelPlayers.every(p => !p.team.some(m => m.actionsRemaining > 0));
                },
              }),
            ),
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
                // Safety: Clear any stale combat state from rebel turn
                if (game.activeCombat) {
                  if (!game.activeCombat.combatComplete) {
                    game.message('Warning: Clearing stale combat state');
                  }
                  clearActiveCombat(game);
                }
                if (game.pendingCombat) {
                  game.pendingCombat = null;
                }
                if (game.pendingCombatQueue.length > 0) {
                  game.pendingCombatQueue = [];
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

              // Generalissimo MERC selection — dictator picks 1 of 6 drawn MERCs
              loop({
                name: 'generalissimo-hire',
                while: () => game.pendingGeneralissimoHire != null && !game.isFinished(),
                maxIterations: 5,
                do: actionStep({
                  name: 'generalissimo-pick-merc',
                  actions: ['generalissimoPick'],
                  prompt: 'Generalissimo: Choose a MERC to hire',
                  skipIf: () => game.isFinished() || game.pendingGeneralissimoHire == null,
                }),
              }),

              // Lockdown militia placement — dictator places militia on base/adjacent sectors
              loop({
                name: 'lockdown-militia-placement',
                while: () => game.pendingLockdownMilitia != null && game.pendingLockdownMilitia.remaining > 0 && !game.isFinished(),
                maxIterations: 50, // Safety: could be many placements
                do: actionStep({
                  name: 'lockdown-place-militia',
                  actions: ['lockdownPlaceMilitia'],
                  prompt: 'Lockdown: Place militia on base or adjacent sectors',
                  skipIf: () => game.isFinished() || game.pendingLockdownMilitia == null || game.pendingLockdownMilitia.remaining <= 0,
                }),
              }),

              // Combat resolution sub-flow (tactics card combat, e.g. Fodder)
              combatResolutionFlow(game, 'tactics-combat'),

              // Step 2: Dictator MERC actions (if any MERCs)
              // Uses unified action names (same as rebels)
              loop({
                name: 'dictator-merc-actions',
                while: () => {
                  if (game.isFinished()) { console.log('[DEBUG dictator-merc-actions] exiting: game finished'); return false; }
                  // MERC-combat-flow: Keep loop active while combat is active or pending
                  // But exit if combatComplete (UI is animating)
                  if (game.activeCombat !== null && !game.activeCombat.combatComplete) return true;
                  if (game.pendingCombat !== null || game.pendingCombatQueue.length > 0) return true;
                  // Continue while any dictator MERC has actions
                  const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
                  const dictator = game.dictatorPlayer?.dictator;
                  const hasActionsLeft = dictatorMercs.some(m => m.actionsRemaining > 0) ||
                    (dictator?.inPlay && dictator.actionsRemaining > 0);
                  console.log(`[DEBUG dictator-merc-actions] hiredMercs=${dictatorMercs.length}, mercsWithActions=${dictatorMercs.filter(m => m.actionsRemaining > 0).map(m => `${m.combatantName}(${m.actionsRemaining})`).join(',')}, dictator=${dictator?.combatantName}, inPlay=${dictator?.inPlay}, dictatorActions=${dictator?.actionsRemaining}, result=${hasActionsLeft}`);
                  return hasActionsLeft ?? false;
                },
                maxIterations: 50, // Safety limit per turn
                do: sequence(
                  // Check for pending combat (from move action) and initiate it
                  execute((ctx) => {
                    if (!game.pendingCombat && game.pendingCombatQueue.length > 0) {
                      game.pendingCombat = game.pendingCombatQueue.shift() || null;
                    }
                    if (game.pendingCombat && !game.activeCombat) {
                      const sector = game.getSector(game.pendingCombat.sectorId);
                      const player = game.rebelPlayers.find(
                        p => `${p.seat}` === game.pendingCombat!.playerId
                      );
                      if (sector && player) {
                        executeCombat(game, sector, player, {
                          attackingPlayerIsRebel: game.pendingCombat.attackingPlayerIsRebel ?? true,
                        });
                      }
                      game.pendingCombat = null;
                    }
                  }),

                  // Combat resolution sub-flow (dictator MERC combat)
                  combatResolutionFlow(game, 'dictator-combat'),

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
                      'feedbackDiscard', // MERC-24h: Feedback discard retrieval
                      'squidheadDisarm', // MERC-4qd: Squidhead disarm mines
                      'squidheadArm', // MERC-4qd: Squidhead arm mines
                      'hagnessDrawType', // MERC-jrph: Hagness draw equipment (step 1)
                      'hagnessGiveEquipment', // MERC-jrph: Hagness give equipment (step 2, via followUp)
                      'armsDealer',
                      'repairKit',
                      'mortar',
                      'assignToSquad',
                      'endTurn',
                    ],
                    skipIf: () => game.isFinished() || (game.activeCombat !== null && !game.activeCombat.combatComplete),
                  }),

                  // Mortar hit allocation — yields so human dictator can allocate hits
                  loop({
                    name: 'dictator-mortar-allocation',
                    while: () => game.pendingMortarAttack != null && !game.isFinished(),
                    maxIterations: 10,
                    do: actionStep({
                      name: 'dictator-mortar-allocate',
                      actions: ['mortarAllocateHits'],
                      prompt: 'Allocate mortar hits to targets',
                      skipIf: () => game.isFinished() || game.pendingMortarAttack == null,
                    }),
                  }),
                ),
              }),

              // Log that MERC actions phase completed
              execute(() => {
                if (game.isFinished()) return; // Game ended during combat
                const dictator = game.dictatorPlayer?.dictator;
                console.log(`[DEBUG] Dictator MERC actions complete. dictator=${dictator?.combatantName}, inPlay=${dictator?.inPlay}, actionsRemaining=${dictator?.actionsRemaining}, activeCombat=${game.activeCombat !== null}`);
                game.message('Dictator MERC actions complete');
              }),

              // Step 3: Apply per-turn dictator special ability
              // For AI: auto-apply ability; For human: let them choose
              execute(() => {
                if (game.isFinished()) return;
                if (game.dictatorPlayer?.isAI) {
                  applyDictatorTurnAbilities(game);
                } else if (game.dictatorPlayer?.dictator?.combatantId === 'mao') {
                  // Human Mao: initialize pending militia for interactive placement
                  let rebelSectorCount = 0;
                  for (const rebel of game.rebelPlayers) {
                    rebelSectorCount += game.getControlledSectors(rebel).length;
                  }
                  if (rebelSectorCount > 0) {
                    const hasWilderness = game.gameMap.getAllSectors().some(s => s.isWilderness && s.dictatorMilitia < Sector.MAX_MILITIA_PER_SIDE);
                    if (hasWilderness) {
                      game.pendingMaoMilitia = { remaining: rebelSectorCount };
                    }
                  }
                }
                // Human players use the actionStep below
              }),

              // Human dictator ability choice (skipped for AI)
              actionStep({
                name: 'dictator-ability',
                actions: ['castroBonusHire', 'kimBonusMilitia', 'maoBonusMilitia', 'mussoliniBonusMilitia', 'gadafiBonusHire', 'stalinBonusHire'],
                skipIf: () => game.isFinished() || game.dictatorPlayer?.isAI === true,
              }),

              // Mao militia distribution loop (human only, subsequent placements after first)
              loop({
                name: 'mao-militia-distribution',
                while: () => game.pendingMaoMilitia != null && game.pendingMaoMilitia.remaining > 0 && !game.isFinished(),
                maxIterations: 50,
                do: actionStep({
                  name: 'mao-place-militia',
                  actions: ['maoBonusMilitia'],
                  prompt: "Mao's Ability: Distribute militia to wilderness sectors",
                  skipIf: () => game.isFinished() || game.pendingMaoMilitia == null || game.pendingMaoMilitia.remaining <= 0,
                }),
              }),

              // Mussolini spread loop (human only - spread militia from source to adjacent)
              loop({
                name: 'mussolini-spread',
                while: () => game.pendingMussoliniSpread != null && game.pendingMussoliniSpread.remaining > 0 && !game.isFinished(),
                maxIterations: 50,
                do: actionStep({
                  name: 'mussolini-spread-militia',
                  actions: ['mussoliniSpreadMilitia'],
                  prompt: "Mussolini: Move militia to adjacent sectors (or done)",
                  skipIf: () => game.isFinished() || game.pendingMussoliniSpread == null || game.pendingMussoliniSpread.remaining <= 0,
                }),
              }),

              // MERC-combat-flow: Process any pending combat triggered by dictator abilities
              execute(() => {
                if (!game.pendingCombat && game.pendingCombatQueue.length > 0) {
                  game.pendingCombat = game.pendingCombatQueue.shift() || null;
                }
                if (game.pendingCombat && !game.activeCombat) {
                  const sector = game.getSector(game.pendingCombat.sectorId);
                  const player = game.rebelPlayers.find(
                    p => `${p.seat}` === game.pendingCombat!.playerId
                  );
                  if (sector && player) {
                    executeCombat(game, sector, player, {
                      attackingPlayerIsRebel: game.pendingCombat.attackingPlayerIsRebel ?? true,
                    });
                  }
                  game.pendingCombat = null;
                }
              }),

              // Combat resolution sub-flow (Kim militia combat)
              combatResolutionFlow(game, 'kim-militia-combat'),

              // Apply end-of-turn effects (Conscripts)
              execute(() => {
                if (game.isFinished()) return;
                applyConscriptsEffect(game);
              }),

              // Hussein: Draw bonus card and play second tactics (persistent per-turn ability)
              execute(() => {
                if (game.isFinished()) return;
                const dictator = game.dictatorPlayer?.dictator;
                if (dictator?.combatantId !== 'hussein') return;

                if (game.dictatorPlayer?.isAI) {
                  // AI: Auto-play second card
                  applyHusseinBonusTactics(game);
                } else {
                  // Human: Draw 1 card from deck to hand for the bonus play
                  const deck = game.dictatorPlayer.tacticsDeck;
                  const hand = game.dictatorPlayer.tacticsHand;
                  if (deck && hand) {
                    const card = deck.first(TacticsCard);
                    if (card) {
                      card.putInto(hand);
                      game.message('Hussein draws a bonus tactics card');
                    }
                  }
                }
              }),

              // Hussein second tactics play (human only)
              actionStep({
                name: 'hussein-bonus-tactics',
                actions: ['husseinBonusTactics', 'husseinBonusReinforce'],
                prompt: "Hussein's Ability: Play a second tactics card",
                skipIf: () => game.isFinished() ||
                  game.dictatorPlayer?.dictator?.combatantId !== 'hussein' ||
                  game.dictatorPlayer?.isAI === true,
              }),

              // Post-effects for Hussein's second tactics play
              // These duplicate the post-first-tactics-play effects because
              // the second card can trigger artillery, generalissimo, lockdown, or combat

              // Artillery allocation after Hussein bonus tactics
              loop({
                name: 'hussein-bonus-artillery',
                while: () => game.pendingArtilleryAllocation != null && !game.isFinished(),
                maxIterations: 50,
                do: actionStep({
                  name: 'hussein-artillery-allocate',
                  actions: ['artilleryAllocateHits'],
                  prompt: 'Allocate artillery damage to your units',
                  skipIf: () => game.isFinished() || game.pendingArtilleryAllocation == null,
                }),
              }),

              // Generalissimo hire after Hussein bonus tactics
              loop({
                name: 'hussein-bonus-generalissimo',
                while: () => game.pendingGeneralissimoHire != null && !game.isFinished(),
                maxIterations: 5,
                do: actionStep({
                  name: 'hussein-generalissimo-pick',
                  actions: ['generalissimoPick'],
                  prompt: 'Generalissimo: Choose a MERC to hire',
                  skipIf: () => game.isFinished() || game.pendingGeneralissimoHire == null,
                }),
              }),

              // Lockdown militia placement after Hussein bonus tactics
              loop({
                name: 'hussein-bonus-lockdown',
                while: () => game.pendingLockdownMilitia != null && game.pendingLockdownMilitia.remaining > 0 && !game.isFinished(),
                maxIterations: 50,
                do: actionStep({
                  name: 'hussein-lockdown-place',
                  actions: ['lockdownPlaceMilitia'],
                  prompt: 'Lockdown: Place militia on base or adjacent sectors',
                  skipIf: () => game.isFinished() || game.pendingLockdownMilitia == null || game.pendingLockdownMilitia.remaining <= 0,
                }),
              }),

              // Combat resolution after Hussein bonus tactics
              combatResolutionFlow(game, 'hussein-bonus-combat'),

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
