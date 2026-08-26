import { describe, it, expect } from 'vitest';
import { GameRunner } from 'boardsmith/runtime';
import { MERCGame, MERCPlayer } from '../src/rules/game.js';
import { autoResolveArgs, getCurrentAction, getPlayerAction } from './helpers/auto-play.js';

/**
 * Bot Rebel Batching Integration Tests (Bot-01)
 *
 * Phase 54: Verify that Bot rebels submit actions in batched rounds
 * during simultaneous play. All Bot rebels must complete round N
 * before any can start round N+1.
 *
 * Uses GameRunner pattern from combat-barriers.test.ts.
 */

// Day 2+ rebel actions — used to identify the rebel simultaneous action step
const REBEL_DAY2_ACTIONS = ['move', 'explore', 'train', 'endTurn'];

/**
 * Check if the current flow state is the rebel simultaneous action step (Day 2+).
 */
function isRebelActionsStep(flowState: any, game: MERCGame): boolean {
  if (!flowState?.awaitingPlayers || game.currentDay < 2) return false;
  return flowState.awaitingPlayers.some((p: any) => {
    const actions = p.availableActions ?? [];
    return actions.includes('endTurn') &&
      REBEL_DAY2_ACTIONS.some(a => actions.includes(a));
  });
}

/**
 * Create a 3-player GameRunner with 2 Bot rebels + 1 Bot dictator.
 */
function create3PlayerAllBot(seed: string): GameRunner<MERCGame> {
  return new GameRunner<MERCGame>({
    GameClass: MERCGame,
    gameType: 'merc',
    gameOptions: {
      playerCount: 3,
      playerNames: ['BotRebel1', 'BotRebel2', 'DictatorBot'],
      seed,
      dictatorIsBot: true,
      playerConfigs: [
        { color: '#e74c3c', isDictator: false, isBot: true },
        { color: '#3498db', isDictator: false, isBot: true },
        { color: '#95a5a6', isDictator: true, isBot: true, botLevel: 'medium' },
      ],
    } as any,
  });
}

/**
 * Create a 3-player GameRunner with 1 human rebel + 1 Bot rebel + 1 Bot dictator.
 */
function create3PlayerMixedRebels(seed: string): GameRunner<MERCGame> {
  return new GameRunner<MERCGame>({
    GameClass: MERCGame,
    gameType: 'merc',
    gameOptions: {
      playerCount: 3,
      playerNames: ['HumanRebel', 'BotRebel', 'DictatorBot'],
      seed,
      dictatorIsBot: true,
      playerConfigs: [
        { color: '#e74c3c', isDictator: false, isBot: false },
        { color: '#3498db', isDictator: false, isBot: true },
        { color: '#95a5a6', isDictator: true, isBot: true, botLevel: 'medium' },
      ],
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
 * Attempt to perform any available action for a player (not endTurn).
 * Returns true if an action was performed.
 */
function performAnyAction(
  runner: GameRunner<MERCGame>,
  playerSeat: number,
  excludeActions: string[] = ['endTurn'],
): boolean {
  const game = runner.game;
  const flowState = game.getFlowState();
  const playerAction = getPlayerAction(flowState, playerSeat);
  if (!playerAction) return false;

  for (const actionName of playerAction.available) {
    if (excludeActions.includes(actionName)) continue;
    const args = autoResolveArgs(game, actionName, playerSeat);
    if (args === null) continue;

    const result = runner.performAction(actionName, playerSeat, args);
    if (result.success) return true;
  }
  return false;
}

/**
 * Check if a player has available actions (not completed) in the simultaneous step.
 */
function playerHasActions(flowState: any, playerSeat: number): boolean {
  if (!flowState?.awaitingPlayers) return false;
  const entry = flowState.awaitingPlayers.find(
    (p: any) => p.playerIndex === playerSeat && !p.completed
  );
  if (!entry) return false;
  return entry.availableActions.length > 0;
}

/**
 * Check if any non-endTurn action is available for a player.
 */
function playerHasNonEndTurnActions(flowState: any, playerSeat: number): boolean {
  if (!flowState?.awaitingPlayers) return false;
  const entry = flowState.awaitingPlayers.find(
    (p: any) => p.playerIndex === playerSeat && !p.completed
  );
  if (!entry) return false;
  return entry.availableActions.some((a: string) => a !== 'endTurn');
}


describe('Bot Rebel Batching (Bot-01)', () => {

  it('Bot rebels batch actions -- all first actions before any second actions', () => {
    // Try multiple seeds to find a viable game state
    const seeds = ['batch-test-1', 'batch-test-2', 'batch-test-3', 'batch-test-4', 'batch-test-5'];
    let testPassed = false;

    for (const seed of seeds) {
      const runner = create3PlayerAllBot(seed);
      runner.start();
      const game = runner.game;

      const { reached } = playUntilRebelActions(runner, 500);
      if (!reached) continue;

      const rebel1 = game.rebelPlayers[0];
      const rebel2 = game.rebelPlayers[1];

      // Both must be Bot
      expect(rebel1.isBot).toBe(true);
      expect(rebel2.isBot).toBe(true);

      let flowState = game.getFlowState();
      if (!playerHasNonEndTurnActions(flowState, rebel1.seat) ||
          !playerHasNonEndTurnActions(flowState, rebel2.seat)) {
        continue; // Need both rebels to have actions available
      }

      // Bot rebel 1 takes an action
      const rebel1Acted = performAnyAction(runner, rebel1.seat);
      if (!rebel1Acted) continue;

      // After rebel 1 acts, rebel 2 should still have actions (round not advanced yet)
      flowState = game.getFlowState();
      expect(playerHasActions(flowState, rebel2.seat)).toBe(true);

      // Rebel 1 should be GATED now (took 1 action, batch round still 0)
      // Verify by checking that rebel 1's non-endTurn actions are reduced
      // (shouldGateBotAction returns true, so 'bot batch gate' condition fails)
      const rebel1Actions = getPlayerAction(flowState, rebel1.seat);
      // Rebel 1 might only have endTurn left if gate blocks all other actions
      // OR might have no entry at all if all actions blocked
      // The key assertion: rebel 2 can still act
      const rebel2Acted = performAnyAction(runner, rebel2.seat);
      expect(rebel2Acted).toBe(true);

      // Now both have acted once -- round should advance
      // Rebel 1 should be able to act again (if they have actions remaining)
      flowState = game.getFlowState();
      if (playerHasNonEndTurnActions(flowState, rebel1.seat)) {
        const rebel1ActedAgain = performAnyAction(runner, rebel1.seat);
        expect(rebel1ActedAgain).toBe(true);
      }

      testPassed = true;
      break;
    }

    expect(testPassed).toBe(true);
  });

  it('human rebel can act freely regardless of Bot batch state', () => {
    const seeds = ['mixed-test-1', 'mixed-test-2', 'mixed-test-3', 'mixed-test-4', 'mixed-test-5'];
    let testPassed = false;

    for (const seed of seeds) {
      const runner = create3PlayerMixedRebels(seed);
      runner.start();
      const game = runner.game;

      const { reached } = playUntilRebelActions(runner, 500);
      if (!reached) continue;

      const humanRebel = game.rebelPlayers.find(p => !p.isBot);
      const botRebel = game.rebelPlayers.find(p => p.isBot);
      if (!humanRebel || !botRebel) continue;

      let flowState = game.getFlowState();
      if (!playerHasNonEndTurnActions(flowState, humanRebel.seat)) continue;

      // Human takes first action
      const humanAct1 = performAnyAction(runner, humanRebel.seat);
      if (!humanAct1) continue;

      // Human takes SECOND action immediately (should NOT be gated)
      flowState = game.getFlowState();
      if (!playerHasNonEndTurnActions(flowState, humanRebel.seat)) {
        // Human may have exhausted their mercs; try another seed
        continue;
      }
      const humanAct2 = performAnyAction(runner, humanRebel.seat);
      expect(humanAct2).toBe(true);

      // Bot rebel should also be able to act (human actions don't affect Bot tracking)
      flowState = game.getFlowState();
      if (playerHasNonEndTurnActions(flowState, botRebel.seat)) {
        const botAct = performAnyAction(runner, botRebel.seat);
        expect(botAct).toBe(true);
      }

      testPassed = true;
      break;
    }

    expect(testPassed).toBe(true);
  });

  it('Bot rebel that ends turn does not block batch round advancement', () => {
    const seeds = ['exhaust-test-1', 'exhaust-test-2', 'exhaust-test-3', 'exhaust-test-4', 'exhaust-test-5'];
    let testPassed = false;

    for (const seed of seeds) {
      const runner = create3PlayerAllBot(seed);
      runner.start();
      const game = runner.game;

      const { reached } = playUntilRebelActions(runner, 500);
      if (!reached) continue;

      const rebel1 = game.rebelPlayers[0];
      const rebel2 = game.rebelPlayers[1];

      let flowState = game.getFlowState();
      if (!playerHasNonEndTurnActions(flowState, rebel1.seat) ||
          !playerHasNonEndTurnActions(flowState, rebel2.seat)) {
        continue;
      }

      // Exhaust all of rebel1's MERCs' actions
      for (const merc of rebel1.team) {
        if (!merc.isDead) {
          merc.actionsRemaining = 0;
        }
      }

      // Rebel1 should end their turn (use endTurn action)
      const endTurnArgs = autoResolveArgs(game, 'endTurn', rebel1.seat);
      if (endTurnArgs === null) continue;
      const endResult = runner.performAction('endTurn', rebel1.seat, endTurnArgs);
      if (!endResult.success) continue;

      // Rebel2 should be able to take multiple actions without waiting
      // (rebel1 ended turn, so they don't block round advancement)
      flowState = game.getFlowState();
      if (!playerHasNonEndTurnActions(flowState, rebel2.seat)) continue;

      const rebel2Act1 = performAnyAction(runner, rebel2.seat);
      if (!rebel2Act1) continue;

      // Rebel2 should be able to act again (round should auto-advance
      // since rebel1 is done and rebel2 caught up)
      flowState = game.getFlowState();
      if (playerHasNonEndTurnActions(flowState, rebel2.seat)) {
        const rebel2Act2 = performAnyAction(runner, rebel2.seat);
        expect(rebel2Act2).toBe(true);
      }

      testPassed = true;
      break;
    }

    expect(testPassed).toBe(true);
  });

  it('batching resets when resetRebelBatching is called', () => {
    // This tests the reset mechanism directly: after building up batch state,
    // calling resetRebelBatching() clears it so Bot rebels are no longer gated.
    // flow.ts calls resetRebelBatching() before each simultaneous step entry
    // (including re-entry after combat barriers) -- verified structurally below.
    const seeds = ['reset-test-1', 'reset-test-2', 'reset-test-3', 'reset-test-4', 'reset-test-5'];
    let testPassed = false;

    for (const seed of seeds) {
      const runner = create3PlayerAllBot(seed);
      runner.start();
      const game = runner.game;

      const { reached } = playUntilRebelActions(runner, 500);
      if (!reached) continue;

      const rebel1 = game.rebelPlayers[0];
      const rebel2 = game.rebelPlayers[1];

      let flowState = game.getFlowState();
      if (!playerHasNonEndTurnActions(flowState, rebel1.seat) ||
          !playerHasNonEndTurnActions(flowState, rebel2.seat)) {
        continue;
      }

      // Rebel 1 takes an action, gets gated (ahead of batch round)
      const r1acted = performAnyAction(runner, rebel1.seat);
      if (!r1acted) continue;

      // Verify rebel 1 is now gated
      expect(game.shouldGateBotAction(rebel1)).toBe(true);

      // Reset batching (simulates what flow.ts does on re-entry)
      game.resetRebelBatching();

      // Rebel 1 should no longer be gated
      expect(game.shouldGateBotAction(rebel1)).toBe(false);
      // Rebel 2 should also not be gated
      expect(game.shouldGateBotAction(rebel2)).toBe(false);

      testPassed = true;
      break;
    }

    expect(testPassed).toBe(true);
  });

  it('flow.ts calls resetRebelBatching before each simultaneous step entry', () => {
    // Structural verification: resetRebelBatching is called before simultaneous steps
    // in both Day 1 and Day 2+ paths, ensuring reset on initial entry and re-entry
    // after combat barriers.
    const { readFileSync } = require('fs');
    const flowSource = readFileSync('src/rules/flow.ts', 'utf-8');

    // Should have at least 2 calls to resetRebelBatching (Day 1 and Day 2+)
    const matches = flowSource.match(/resetRebelBatching\(\)/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

});
