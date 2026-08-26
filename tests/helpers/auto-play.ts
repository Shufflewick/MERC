/**
 * Shared test helpers for auto-playing MERC games.
 *
 * Selection resolution is the engine's own `enumerateLegalMoves`, not a
 * hand-rolled copy: a test harness that enumerates moves differently from the
 * engine (and from MCTS) tests something the game never does.
 */

import { enumerateLegalMoves } from 'boardsmith';
import { GameRunner } from 'boardsmith/runtime';
import type { MERCGame } from '../../src/rules/game.js';

/**
 * First legal argument set for `actionName` at `playerSeat`, or null when the
 * action has no legal arguments right now.
 */
export function autoResolveArgs(
  game: MERCGame,
  actionName: string,
  playerSeat: number
): Record<string, unknown> | null {
  const move = enumerateLegalMoves(game, playerSeat, { maxPerAction: 1 })
    .find(m => m.action === actionName);
  return move ? move.args : null;
}

/**
 * Get the current action info from flow state,
 * handling both regular and simultaneous action modes.
 */
export function getCurrentAction(flowState: any): { currentPlayer: number; available: string[] } | null {
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
export function getPlayerAction(flowState: any, playerSeat: number): { available: string[] } | null {
  if (!flowState || flowState.complete || !flowState.awaitingInput) return null;
  if (!flowState.awaitingPlayers) return null;

  const entry = flowState.awaitingPlayers.find(
    (p: any) => p.playerIndex === playerSeat && !p.completed && p.availableActions.length > 0
  );
  if (!entry) return null;
  return { available: entry.available ?? entry.availableActions };
}

/**
 * Auto-play through all actions until the game completes or maxActions is hit.
 *
 * @returns actionCount and whether the game completed naturally
 */
export function playUntilComplete(
  runner: GameRunner<MERCGame>,
  maxActions: number = 2000,
): { actionCount: number; completed: boolean } {
  const game = runner.game;
  let actionCount = 0;

  while (actionCount < maxActions) {
    const flowState = game.getFlowState();
    if (!flowState || flowState.complete) {
      return { actionCount, completed: true };
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

  const flowState = game.getFlowState();
  return { actionCount, completed: flowState?.complete ?? false };
}
