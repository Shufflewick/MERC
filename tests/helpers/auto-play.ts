/**
 * Shared Test Helpers for Auto-Playing MERC Games
 *
 * Extracted from combat-barriers.test.ts, ai-rebel-batching.test.ts, and mcts-clone.test.ts
 * to eliminate triple-duplication of autoResolveArgs/getCurrentAction/getPlayerAction.
 */

import { GameRunner } from 'boardsmith/runtime';
import type { MERCGame } from '../../src/rules/game.js';

/**
 * Auto-resolve args for any action by reading its selections and picking first valid choices.
 */
export function autoResolveArgs(game: MERCGame, actionName: string, playerSeat: number): Record<string, unknown> | null {
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
  return { available: entry.availableActions };
}

/**
 * Auto-play through all actions until game completes or maxActions reached.
 * Uses autoResolveArgs to pick the first valid choice for each action.
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
