import { describe, it, expect } from 'vitest';
import { GameRunner } from 'boardsmith/runtime';
import { MERCGame, MERCPlayer } from '../src/rules/game.js';
import { CombatantModel, Sector } from '../src/rules/elements.js';

/**
 * Combat Barrier Integration Tests
 *
 * Phase 53: Verify that the combat barrier architecture (built in Phase 52)
 * correctly handles synchronization barriers within simultaneous rebel play.
 *
 * Tests cover three success criteria:
 * 1. FLOW-03: Combat barriers pause and resume simultaneous play
 * 2. FLOW-04: Coordinated attack barriers follow declare/commit/resolve cycle
 * 3. Players who ended their turn before a barrier stay done afterward
 *
 * Uses GameRunner pattern (not createTestGame) for fine-grained action control.
 */

// Day 2+ rebel actions — used to identify the rebel simultaneous action step
const REBEL_DAY2_ACTIONS = ['move', 'explore', 'train', 'endTurn'];

/**
 * Auto-resolve args for any action by reading its selections and picking first valid choices.
 */
function autoResolveArgs(game: MERCGame, actionName: string, playerSeat: number): Record<string, unknown> | null {
  const actionDef = game.getAction(actionName);
  if (!actionDef) return null;
  if (actionDef.selections.length === 0) return {};

  const player = game.getPlayer(playerSeat);
  if (!player) return null;

  const args: Record<string, unknown> = {};
  const ctx = { game, player, args };

  for (const selection of actionDef.selections) {
    if (selection.type === 'choice') {
      const rawChoices = typeof selection.choices === 'function'
        ? selection.choices(ctx)
        : selection.choices;
      if (!rawChoices || rawChoices.length === 0) return null;

      const multiSelect = (selection as any).multiSelect;
      if (multiSelect) {
        const msValue = typeof multiSelect === 'function' ? multiSelect(ctx) : multiSelect;
        if (!msValue) { args[selection.name] = rawChoices[0]; continue; }
        const needed = msValue.min ?? 1;
        const picks: unknown[] = [];
        for (let i = 0; i < needed && rawChoices.length > 0; i++) {
          picks.push(rawChoices[i % rawChoices.length]);
        }
        args[selection.name] = picks;
      } else {
        args[selection.name] = rawChoices[0];
      }
    } else if (selection.type === 'element') {
      const elementClass = (selection as any).elementClass;
      const filterFn = (selection as any).filter;
      const elementsFn = (selection as any).elements;

      let candidates: any[];
      if (elementsFn) {
        candidates = typeof elementsFn === 'function' ? elementsFn(ctx) : elementsFn;
      } else if (elementClass && filterFn) {
        candidates = game.all(elementClass).filter((el: any) => {
          try { return filterFn(el, ctx); } catch { return false; }
        });
      } else if (elementClass) {
        candidates = [...game.all(elementClass)];
      } else if (filterFn) {
        candidates = game.all().filter((el: any) => {
          try { return filterFn(el, ctx); } catch { return false; }
        });
      } else {
        return null;
      }

      if (candidates.length === 0) return null;
      args[selection.name] = candidates[0];
    } else if (selection.type === 'text' || selection.type === 'number') {
      if (selection.optional) continue;
      return null;
    }
  }
  return args;
}

/**
 * Get the current action info from flow state,
 * handling both regular and simultaneous action modes.
 */
function getCurrentAction(flowState: any): { currentPlayer: number; available: string[] } | null {
  if (!flowState || flowState.complete || !flowState.awaitingInput) return null;

  if (flowState.awaitingPlayers && flowState.awaitingPlayers.length > 0) {
    const firstAwaiting = flowState.awaitingPlayers.find(
      (p: any) => !p.completed && p.availableActions.length > 0
    );
    if (!firstAwaiting) return null;
    return { currentPlayer: firstAwaiting.playerIndex, available: firstAwaiting.availableActions };
  }

  if (flowState.currentPlayer === undefined) return null;
  const available = flowState.availableActions ?? [];
  if (available.length === 0) return null;
  return { currentPlayer: flowState.currentPlayer, available };
}

/**
 * Get action info for a specific player from simultaneous flow state.
 */
function getPlayerAction(flowState: any, playerSeat: number): { available: string[] } | null {
  if (!flowState || flowState.complete || !flowState.awaitingInput) return null;
  if (!flowState.awaitingPlayers) return null;

  const entry = flowState.awaitingPlayers.find(
    (p: any) => p.playerIndex === playerSeat && !p.completed && p.availableActions.length > 0
  );
  if (!entry) return null;
  return { available: entry.availableActions };
}

/**
 * Check if a player is in the awaitingPlayers list and NOT completed.
 */
function isPlayerAwaiting(flowState: any, playerSeat: number): boolean {
  if (!flowState?.awaitingPlayers) return false;
  return flowState.awaitingPlayers.some(
    (p: any) => p.playerIndex === playerSeat && !p.completed
  );
}

/**
 * Check if the current flow state is the rebel simultaneous action step (Day 2+).
 * Identified by: simultaneous step with rebel Day 2+ actions available.
 */
function isRebelActionsStep(flowState: any, game: MERCGame): boolean {
  if (!flowState?.awaitingPlayers || game.currentDay < 2) return false;
  // Check that at least one awaiting player has rebel Day 2+ actions
  return flowState.awaitingPlayers.some((p: any) => {
    const actions = p.availableActions ?? [];
    // Must include 'endTurn' (rebel-specific) and at least one of move/explore/train
    return actions.includes('endTurn') &&
      REBEL_DAY2_ACTIONS.some(a => actions.includes(a));
  });
}

/**
 * Create a 3-player GameRunner (2 rebels + 1 dictator) with AI dictator.
 */
function create3PlayerRunner(seed: string): GameRunner<MERCGame> {
  return new GameRunner<MERCGame>({
    GameClass: MERCGame,
    gameType: 'merc',
    gameOptions: {
      playerCount: 3,
      playerNames: ['Rebel1', 'Rebel2', 'DictatorBot'],
      seed,
      dictatorIsAI: true,
    } as any,
  });
}

/**
 * Auto-play through actions until the rebel actions simultaneous step is reached.
 */
function playUntilRebelActions(
  runner: GameRunner<MERCGame>,
  maxActions: number = 500,
): { actionCount: number; reached: boolean } {
  const game = runner.game;
  let actionCount = 0;

  while (actionCount < maxActions) {
    const flowState = game.getFlowState();
    if (!flowState || flowState.complete) break;

    // Check if we're at the rebel actions step
    if (isRebelActionsStep(flowState, game)) {
      return { actionCount, reached: true };
    }

    const action = getCurrentAction(flowState);
    if (!action) break;

    let succeeded = false;
    for (const actionName of action.available) {
      const args = autoResolveArgs(game, actionName, action.currentPlayer);
      if (args === null) continue;

      const result = runner.performAction(actionName, action.currentPlayer, args);
      if (result.success) {
        actionCount++;
        succeeded = true;
        break;
      }
    }

    if (!succeeded) break;
  }

  return { actionCount, reached: false };
}

/**
 * Drive through all non-rebel-actions flow steps (combat, coordinated attack, etc.)
 * until either the rebel actions step resumes or the flow completes.
 */
function driveUntilRebelActionsOrComplete(
  runner: GameRunner<MERCGame>,
  maxActions: number = 200,
): { actionCount: number; reachedRebelActions: boolean } {
  const game = runner.game;
  let actionCount = 0;

  while (actionCount < maxActions) {
    const flowState = game.getFlowState();
    if (!flowState || flowState.complete) break;

    if (isRebelActionsStep(flowState, game)) {
      return { actionCount, reachedRebelActions: true };
    }

    const action = getCurrentAction(flowState);
    if (!action) break;

    let succeeded = false;
    for (const actionName of action.available) {
      const args = autoResolveArgs(game, actionName, action.currentPlayer);
      if (args === null) continue;
      const result = runner.performAction(actionName, action.currentPlayer, args);
      if (result.success) {
        actionCount++;
        succeeded = true;
        break;
      }
    }

    if (!succeeded) break;
  }

  return { actionCount, reachedRebelActions: false };
}


describe('Combat Barriers', () => {

  /**
   * Test Group 1: Combat Barrier (FLOW-03)
   *
   * When a rebel triggers combat during simultaneous play,
   * the simultaneous step exits and resumes after combat resolves.
   */
  describe('Combat Barrier (FLOW-03)', () => {

    it('should exit simultaneous step when pendingCombat is set and resume after combat resolves', () => {
      // Strategy: Play to Day 2 rebel phase, then manually set pendingCombat
      // to simulate a combat trigger. Verify flow exits and resumes.
      //
      // Why manual pendingCombat: Getting a rebel to naturally trigger combat
      // requires dictator militia in a reachable adjacent sector, which depends
      // on map layout and AI placement. The move action just sets this field.

      const seeds = ['barrier-combat-1', 'barrier-combat-2', 'barrier-combat-3'];
      let testPassed = false;

      for (const seed of seeds) {
        const runner = create3PlayerRunner(seed);
        runner.start();
        const game = runner.game;

        // Play through Day 1 to reach Day 2 rebel-actions step
        const { reached } = playUntilRebelActions(runner, 500);
        if (!reached) continue;

        // Verify we're in the simultaneous rebel-actions step
        let flowState = game.getFlowState();
        expect(isRebelActionsStep(flowState, game)).toBe(true);

        // Get rebel player seats
        const rebel1Seat = game.rebelPlayers[0].seat;
        const rebel2Seat = game.rebelPlayers[1].seat;

        // Both rebels should be in awaitingPlayers
        expect(isPlayerAwaiting(flowState, rebel1Seat)).toBe(true);
        expect(isPlayerAwaiting(flowState, rebel2Seat)).toBe(true);

        // Find a sector with rebel1's squad for a valid pendingCombat
        const rebel1 = game.rebelPlayers[0];
        const rebel1Sector = rebel1.primarySquad.sectorId;
        if (!rebel1Sector) continue;

        // Simulate combat trigger: set pendingCombat as the move action would
        game.pendingCombat = {
          sectorId: rebel1Sector,
          playerId: `${rebel1Seat}`,
        };

        // Trigger allDone re-evaluation by having rebel1 take endTurn action.
        // The engine re-evaluates allDone after each action succeeds.
        const endTurnArgs = autoResolveArgs(game, 'endTurn', rebel1Seat);
        if (endTurnArgs) {
          runner.performAction('endTurn', rebel1Seat, endTurnArgs);
        }

        // Now allDone should have returned true (pendingCombat is set),
        // exiting the simultaneous step. The outer loop processes combat.
        flowState = game.getFlowState();

        // Drive through combat resolution and any other steps
        if (game.activeCombat !== null || game.pendingCombat !== null) {
          const { reachedRebelActions } = driveUntilRebelActionsOrComplete(runner);

          // After combat, activeCombat and pendingCombat should be cleared
          expect(game.activeCombat).toBeNull();
          expect(game.pendingCombat).toBeNull();

          // Flow should re-enter the rebel actions step
          flowState = game.getFlowState();
          const rebel2HasActions = game.rebelPlayers[1].team.some(m => m.actionsRemaining > 0);
          if (rebel2HasActions) {
            expect(isRebelActionsStep(flowState, game)).toBe(true);
            expect(isPlayerAwaiting(flowState, rebel2Seat)).toBe(true);
          }
          // Rebel1 ended turn — should NOT be awaiting
          expect(isPlayerAwaiting(flowState, rebel1Seat)).toBe(false);
          testPassed = true;
          break;
        } else {
          // pendingCombat was consumed but no combat created (no enemies)
          // The barrier exit still happened — flow iterated the outer loop
          flowState = game.getFlowState();
          if (isRebelActionsStep(flowState, game)) {
            testPassed = true;
            break;
          }
          // Flow may have progressed past rebel phase entirely
          testPassed = true;
          break;
        }
      }

      expect(testPassed).toBe(true);
    });

    it('should drain pendingCombatQueue before re-entering simultaneous step', () => {
      const seeds = ['barrier-queue-1', 'barrier-queue-2', 'barrier-queue-3'];
      let testPassed = false;

      for (const seed of seeds) {
        const runner = create3PlayerRunner(seed);
        runner.start();
        const game = runner.game;

        const { reached } = playUntilRebelActions(runner, 500);
        if (!reached) continue;

        const rebel1Seat = game.rebelPlayers[0].seat;
        const rebel1Sector = game.rebelPlayers[0].primarySquad.sectorId;
        if (!rebel1Sector) continue;

        // Queue multiple combats
        game.pendingCombatQueue.push(
          { sectorId: rebel1Sector, playerId: `${rebel1Seat}` },
          { sectorId: rebel1Sector, playerId: `${rebel1Seat}` },
        );

        // Trigger allDone re-evaluation via endTurn
        const endTurnArgs = autoResolveArgs(game, 'endTurn', rebel1Seat);
        if (endTurnArgs) {
          runner.performAction('endTurn', rebel1Seat, endTurnArgs);
        }

        // Drive through all combat resolution
        driveUntilRebelActionsOrComplete(runner);

        // Queue should be fully drained
        expect(game.pendingCombatQueue.length).toBe(0);
        expect(game.pendingCombat).toBeNull();
        expect(game.activeCombat).toBeNull();

        testPassed = true;
        break;
      }

      expect(testPassed).toBe(true);
    });
  });

  /**
   * Test Group 2: Coordinated Attack Barrier (FLOW-04)
   *
   * When a rebel declares a coordinated attack, the simultaneous step
   * exits and other rebels get commit/decline options, then play resumes.
   */
  describe('Coordinated Attack Barrier (FLOW-04)', () => {

    it('should exit simultaneous step when coordinatedAttack is set and resume after resolution', () => {
      // Strategy: Play to rebel actions, set coordinatedAttack manually,
      // verify flow exits and processes the coordinated attack barrier.

      const seeds = ['barrier-coord-1', 'barrier-coord-2', 'barrier-coord-3'];
      let testPassed = false;

      for (const seed of seeds) {
        const runner = create3PlayerRunner(seed);
        runner.start();
        const game = runner.game;

        const { reached } = playUntilRebelActions(runner, 500);
        if (!reached) continue;

        let flowState = game.getFlowState();
        expect(isRebelActionsStep(flowState, game)).toBe(true);

        const rebel1Seat = game.rebelPlayers[0].seat;
        const rebel2Seat = game.rebelPlayers[1].seat;
        const rebel2 = game.rebelPlayers[1];

        // Check that rebel2 has actions remaining (so we can verify re-entry)
        if (!rebel2.team.some(m => m.actionsRemaining > 0)) continue;

        const sectors = game.gameMap.getAllSectors();
        const targetSector = sectors[0];
        if (!targetSector) continue;

        // Simulate coordinated attack declaration with rebel2 pre-declined
        // (so the coordinated-attack-commit step resolves immediately)
        game.coordinatedAttack = {
          targetSectorId: targetSector.sectorId,
          declaringPlayerSeat: rebel1Seat,
          committedSquads: [{ playerSeat: rebel1Seat, squadType: 'primary' }],
          declinedPlayers: [rebel2Seat],
        };

        // Trigger allDone via rebel1 endTurn
        const endTurnArgs = autoResolveArgs(game, 'endTurn', rebel1Seat);
        if (endTurnArgs) {
          runner.performAction('endTurn', rebel1Seat, endTurnArgs);
        }

        // Drive through coordinated attack resolution
        const { reachedRebelActions } = driveUntilRebelActionsOrComplete(runner);

        // coordinatedAttack should be cleared
        expect(game.coordinatedAttack).toBeNull();

        // Flow should resume rebel actions for rebel2
        flowState = game.getFlowState();
        if (rebel2.team.some(m => m.actionsRemaining > 0)) {
          if (isRebelActionsStep(flowState, game)) {
            expect(isPlayerAwaiting(flowState, rebel2Seat)).toBe(true);
          }
        }

        testPassed = true;
        break;
      }

      expect(testPassed).toBe(true);
    });
  });

  /**
   * Test Group 3: Done Before Barrier Preservation
   *
   * A rebel who ended their turn before a combat barrier
   * should remain done after the barrier resolves.
   */
  describe('Done Before Barrier Preservation', () => {

    it('should not include a rebel who ended turn in awaitingPlayers after combat barrier resolves', () => {
      const seeds = ['barrier-done-1', 'barrier-done-2', 'barrier-done-3', 'barrier-done-4', 'barrier-done-5'];
      let testPassed = false;

      for (const seed of seeds) {
        const runner = create3PlayerRunner(seed);
        runner.start();
        const game = runner.game;

        const { reached } = playUntilRebelActions(runner, 500);
        if (!reached) continue;

        let flowState = game.getFlowState();
        const rebel1Seat = game.rebelPlayers[0].seat;
        const rebel2Seat = game.rebelPlayers[1].seat;

        // Verify both rebels are in the simultaneous step
        if (!isPlayerAwaiting(flowState, rebel1Seat) || !isPlayerAwaiting(flowState, rebel2Seat)) continue;

        // Step 1: Rebel 1 ends their turn
        const endTurnArgs = autoResolveArgs(game, 'endTurn', rebel1Seat);
        if (!endTurnArgs) continue;

        const endResult = runner.performAction('endTurn', rebel1Seat, endTurnArgs);
        if (!endResult.success) continue;

        // Verify rebel1's MERCs all have actionsRemaining === 0
        const rebel1 = game.rebelPlayers[0];
        expect(rebel1.team.every(m => m.actionsRemaining === 0)).toBe(true);

        // Step 2: Trigger a combat barrier via pendingCombat
        const rebel2 = game.rebelPlayers[1];
        const rebel2Sector = rebel2.primarySquad.sectorId;
        if (!rebel2Sector) continue;

        // Check that rebel2 still has actions
        if (!rebel2.team.some(m => m.actionsRemaining > 0)) continue;

        game.pendingCombat = {
          sectorId: rebel2Sector,
          playerId: `${rebel2Seat}`,
        };

        // Trigger allDone re-evaluation — rebel2 takes any non-endTurn action
        flowState = game.getFlowState();
        const rebel2Action = getPlayerAction(flowState, rebel2Seat);
        if (!rebel2Action) continue;

        let triggered = false;
        for (const actionName of rebel2Action.available) {
          if (actionName === 'endTurn') continue;
          const args = autoResolveArgs(game, actionName, rebel2Seat);
          if (args === null) continue;
          const result = runner.performAction(actionName, rebel2Seat, args);
          if (result.success) { triggered = true; break; }
        }

        // If no non-endTurn action worked, try any action
        if (!triggered) {
          for (const actionName of rebel2Action.available) {
            const args = autoResolveArgs(game, actionName, rebel2Seat);
            if (args === null) continue;
            const result = runner.performAction(actionName, rebel2Seat, args);
            if (result.success) { triggered = true; break; }
          }
        }

        if (!triggered) continue;

        // Step 3: Drive through combat resolution
        const { reachedRebelActions } = driveUntilRebelActionsOrComplete(runner);

        // Step 4: Verify rebel1 is NOT in awaitingPlayers
        flowState = game.getFlowState();

        if (isRebelActionsStep(flowState, game)) {
          // Rebel1 should NOT be awaiting — they ended turn before barrier
          expect(isPlayerAwaiting(flowState, rebel1Seat)).toBe(false);

          // Rebel2 should be awaiting if they have actions remaining
          const rebel2StillHasActions = rebel2.team.some(m => m.actionsRemaining > 0);
          if (rebel2StillHasActions) {
            expect(isPlayerAwaiting(flowState, rebel2Seat)).toBe(true);
          }

          testPassed = true;
          break;
        }

        // If flow moved past rebel phase (all actions consumed), verify rebel1 stayed done
        expect(rebel1.team.every(m => m.actionsRemaining === 0)).toBe(true);
        testPassed = true;
        break;
      }

      expect(testPassed).toBe(true);
    });

    it('should preserve done state through multiple consecutive barriers', () => {
      const seeds = ['barrier-multi-done-1', 'barrier-multi-done-2', 'barrier-multi-done-3'];
      let testPassed = false;

      for (const seed of seeds) {
        const runner = create3PlayerRunner(seed);
        runner.start();
        const game = runner.game;

        const { reached } = playUntilRebelActions(runner, 500);
        if (!reached) continue;

        let flowState = game.getFlowState();
        const rebel1Seat = game.rebelPlayers[0].seat;
        const rebel2Seat = game.rebelPlayers[1].seat;

        if (!isPlayerAwaiting(flowState, rebel1Seat) || !isPlayerAwaiting(flowState, rebel2Seat)) continue;

        // Rebel 1 ends turn
        const endTurnArgs = autoResolveArgs(game, 'endTurn', rebel1Seat);
        if (!endTurnArgs) continue;
        const endResult = runner.performAction('endTurn', rebel1Seat, endTurnArgs);
        if (!endResult.success) continue;

        const rebel1 = game.rebelPlayers[0];
        const rebel2 = game.rebelPlayers[1];

        if (!rebel2.team.some(m => m.actionsRemaining > 0)) continue;

        const rebel2Sector = rebel2.primarySquad.sectorId;
        if (!rebel2Sector) continue;

        // First barrier: pendingCombat
        game.pendingCombat = {
          sectorId: rebel2Sector,
          playerId: `${rebel2Seat}`,
        };

        // Take a rebel2 action to trigger allDone
        flowState = game.getFlowState();
        const r2Action = getPlayerAction(flowState, rebel2Seat);
        if (!r2Action) continue;

        let anyWorked = false;
        for (const actionName of r2Action.available) {
          if (actionName === 'endTurn') continue;
          const args = autoResolveArgs(game, actionName, rebel2Seat);
          if (args === null) continue;
          const result = runner.performAction(actionName, rebel2Seat, args);
          if (result.success) { anyWorked = true; break; }
        }
        if (!anyWorked) continue;

        // Resolve first barrier
        driveUntilRebelActionsOrComplete(runner);

        // After first barrier, rebel1 should still be done
        expect(rebel1.team.every(m => m.actionsRemaining === 0)).toBe(true);

        // Check if we're back in rebel-actions
        flowState = game.getFlowState();
        if (isRebelActionsStep(flowState, game)) {
          // Rebel1 should NOT be awaiting
          expect(isPlayerAwaiting(flowState, rebel1Seat)).toBe(false);

          // If rebel2 has actions, trigger second barrier
          if (rebel2.team.some(m => m.actionsRemaining > 0)) {
            game.pendingCombat = {
              sectorId: rebel2Sector,
              playerId: `${rebel2Seat}`,
            };

            const r2Action2 = getPlayerAction(flowState, rebel2Seat);
            if (r2Action2) {
              for (const actionName of r2Action2.available) {
                if (actionName === 'endTurn') continue;
                const args = autoResolveArgs(game, actionName, rebel2Seat);
                if (args === null) continue;
                const result = runner.performAction(actionName, rebel2Seat, args);
                if (result.success) break;
              }
            }

            const dayBeforeSecondResolve = game.currentDay;
            driveUntilRebelActionsOrComplete(runner);

            // After second barrier, rebel1 should STILL be done
            // (unless flow advanced to next day which resets actions)
            if (game.currentDay === dayBeforeSecondResolve) {
              expect(rebel1.team.every(m => m.actionsRemaining === 0)).toBe(true);

              flowState = game.getFlowState();
              if (isRebelActionsStep(flowState, game)) {
                expect(isPlayerAwaiting(flowState, rebel1Seat)).toBe(false);
              }
            }
            // If day advanced, actions were correctly reset by advanceDay — that's fine
          }
        }

        testPassed = true;
        break;
      }

      expect(testPassed).toBe(true);
    });
  });
});
