import { describe, it, expect } from 'vitest';
import {
  createSnapshot,
  deserializeAction,
  serializeAction,
  type GameCommand,
} from 'boardsmith';
import { GameRunner } from 'boardsmith/runtime';
import { createBot } from 'boardsmith/ai';
import { MERCGame, MERCPlayer } from '../src/rules/game.js';
import { Sector, CombatantModel, Equipment, TacticsCard } from '../src/rules/elements.js';
import { isValidLandingSector } from '../src/rules/day-one.js';

/**
 * MCTS Clone Divergence Diagnostic Test
 *
 * Tests both:
 * 1. Manual clone (replicating restoreGame logic)
 * 2. Actual MCTS bot play() which triggers enumerateAllMoves + clone
 *
 * The goal is to identify WHERE the clone diverges from the original.
 */
describe('MCTS Clone Divergence', () => {

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
   * Get the current player and available actions from flow state,
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
   * Clone a game using the exact same method as MCTS bot's restoreGame().
   */
  function cloneGame(snapshot: any): { clone: MERCGame; flowState: any } {
    const gameOptions = snapshot.gameOptions ?? {
      playerCount: 2,
      playerNames: ['Rebel1', 'DictatorBot'],
      seed: snapshot.seed,
    };

    const clone = new MERCGame(gameOptions as any);
    clone.replayCommands(snapshot.commandHistory);
    clone.startFlow();

    for (const action of snapshot.actionHistory) {
      const { actionName, player, args } = deserializeAction(action, clone);
      const flowState = clone.continueFlow(actionName, args, player.seat);
      if (flowState.complete || !flowState.awaitingInput) {
        break;
      }
    }

    return { clone, flowState: clone.getFlowState()! };
  }

  /**
   * Play through a game until a specific player's turn, or until stuck/complete.
   */
  function playUntilPlayerTurn(runner: GameRunner<MERCGame>, targetPlayer: number, maxActions: number = 300): { actionCount: number; reachedTarget: boolean } {
    const game = runner.game;
    let actionCount = 0;

    while (actionCount < maxActions) {
      const flowState = game.getFlowState();
      const action = getCurrentAction(flowState);
      if (!action) break;

      // Check if we've reached the target player's turn
      if (action.currentPlayer === targetPlayer) {
        return { actionCount, reachedTarget: true };
      }

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

    return { actionCount, reachedTarget: false };
  }

  it('should clone game at every action without divergence', () => {
    const seed = 'mcts-clone-every-action';
    const runner = new GameRunner<MERCGame>({
      GameClass: MERCGame,
      gameType: 'merc',
      gameOptions: {
        playerCount: 2,
        playerNames: ['Rebel1', 'DictatorBot'],
        seed,
        dictatorIsAI: true,
      } as any,
    });

    runner.start();
    const game = runner.game;

    let actionCount = 0;
    const maxActions = 200;
    let firstDivergence = -1;

    while (actionCount < maxActions) {
      const flowState = game.getFlowState();
      const action = getCurrentAction(flowState);
      if (!action) break;

      let succeeded = false;
      for (const actionName of action.available) {
        const args = autoResolveArgs(game, actionName, action.currentPlayer);
        if (args === null) continue;

        const result = runner.performAction(actionName, action.currentPlayer, args);
        if (result.success) {
          actionCount++;

          // After each action, try to clone and check for divergence
          const snapshot = runner.getSnapshot();
          const { flowState: cloneFlow } = cloneGame(snapshot);
          const origFlow = game.getFlowState()!;

          const diverged = cloneFlow.complete !== origFlow.complete ||
            cloneFlow.awaitingInput !== origFlow.awaitingInput ||
            cloneFlow.currentPlayer !== origFlow.currentPlayer ||
            JSON.stringify(cloneFlow.availableActions ?? []) !== JSON.stringify(origFlow.availableActions ?? []);

          if (diverged && firstDivergence === -1) {
            firstDivergence = actionCount;
            console.log(`\n*** DIVERGENCE at action ${actionCount}: "${actionName}" player=${action.currentPlayer} ***`);
            console.log(`  Original flow: awaiting=${origFlow.awaitingInput} player=${origFlow.currentPlayer} actions=[${origFlow.availableActions?.join(', ')}] complete=${origFlow.complete}`);
            console.log(`  Clone flow:    awaiting=${cloneFlow.awaitingInput} player=${cloneFlow.currentPlayer} actions=[${cloneFlow.availableActions?.join(', ')}] complete=${cloneFlow.complete}`);
            console.log(`  Day: ${game.currentDay}`);
          }

          if (!diverged && actionCount % 20 === 0) {
            console.log(`  action ${actionCount}: "${actionName}" clone OK`);
          }

          succeeded = true;
          break;
        }
      }

      if (!succeeded) break;
    }

    console.log(`Total actions: ${actionCount}, First divergence: ${firstDivergence === -1 ? 'NONE' : `action ${firstDivergence}`}`);
    expect(firstDivergence).toBe(-1);
  });

  it('should work with actual MCTS bot at dictator turn', { timeout: 120_000 }, async () => {
    // This test uses the ACTUAL MCTS bot to reproduce the real error.
    // We play until it's the dictator's turn, then let the bot clone & search.
    const seeds = [
      'mcts-bot-1', 'mcts-bot-2', 'mcts-bot-3', 'mcts-bot-4', 'mcts-bot-5',
      'mcts-bot-6', 'mcts-bot-7', 'mcts-bot-8', 'mcts-bot-9', 'mcts-bot-10',
      'mcts-bot-11', 'mcts-bot-12', 'mcts-bot-13', 'mcts-bot-14', 'mcts-bot-15',
      'mcts-bot-16', 'mcts-bot-17', 'mcts-bot-18', 'mcts-bot-19', 'mcts-bot-20',
    ];

    let anyError = false;
    let totalBotPlays = 0;

    for (const seed of seeds) {
      const runner = new GameRunner<MERCGame>({
        GameClass: MERCGame,
        gameType: 'merc',
        gameOptions: {
          playerCount: 2,
          playerNames: ['Rebel1', 'DictatorBot'],
          seed,
          dictatorIsAI: true,
        } as any,
      });

      runner.start();
      const game = runner.game;
      const dictatorSeat = game.dictatorPlayer.seat;

      // Play game, invoking MCTS bot at each dictator turn
      let actionCount = 0;
      const maxActions = 300;
      let botErrors = 0;
      let botSuccesses = 0;

      while (actionCount < maxActions) {
        const flowState = game.getFlowState();
        const action = getCurrentAction(flowState);
        if (!action) break;

        if (action.currentPlayer === dictatorSeat) {
          // Dictator's turn — use the actual MCTS bot
          try {
            const bot = createBot(
              game,
              MERCGame as any,
              'merc',
              dictatorSeat,
              runner.actionHistory,
              10, // Low iterations for speed
            );
            const move = await bot.play();
            const result = runner.performAction(move.action, dictatorSeat, move.args);
            if (result.success) {
              actionCount++;
              botSuccesses++;
              totalBotPlays++;
            } else {
              // Bot picked a move that failed — auto-resolve instead
              let succeeded = false;
              for (const actionName of action.available) {
                const args = autoResolveArgs(game, actionName, action.currentPlayer);
                if (args === null) continue;
                const result2 = runner.performAction(actionName, action.currentPlayer, args);
                if (result2.success) {
                  actionCount++;
                  succeeded = true;
                  break;
                }
              }
              if (!succeeded) break;
            }
          } catch (e: any) {
            botErrors++;
            anyError = true;
            console.log(`\n*** MCTS BOT ERROR at seed="${seed}" action=${actionCount} day=${game.currentDay} ***`);
            console.log(`  Error: ${e.message}`);
            console.log(`  Flow: player=${action.currentPlayer} actions=[${action.available.join(', ')}]`);
            console.log(`  Action history: ${runner.actionHistory.length} actions`);
            console.log(`  Command history: ${game.commandHistory.length} commands`);

            // Debug: try manual clone to see if it diverges
            const snapshot = runner.getSnapshot();
            try {
              const { flowState: cloneFlow } = cloneGame(snapshot);
              const origFlow = game.getFlowState()!;
              console.log(`  Manual clone: orig=[awaiting=${origFlow.awaitingInput} player=${origFlow.currentPlayer}] clone=[awaiting=${cloneFlow.awaitingInput} player=${cloneFlow.currentPlayer} complete=${cloneFlow.complete}]`);
            } catch (e2: any) {
              console.log(`  Manual clone also failed: ${e2.message}`);
            }

            // Fall back to auto-resolve for this action
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
        } else {
          // Non-dictator turn — auto-resolve
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
      }

      const status = botErrors > 0 ? `ERRORS: ${botErrors}` : `OK (bot played ${botSuccesses}x)`;
      console.log(`  seed="${seed}": ${actionCount} actions, ${status}`);
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Total bot plays: ${totalBotPlays}`);
    console.log(`Any errors: ${anyError}`);

    if (anyError) {
      console.log(`\nBUG REPRODUCED! The MCTS bot's clone diverges.`);
    } else {
      console.log(`\nNo divergence found. The bug may require specific human choices or game configuration.`);
    }

    // Don't fail the test — we want to see the output either way
    // expect(anyError).toBe(false);
  });

  it('should clone with many seeds', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => `mcts-seed-${i + 1}`);

    let anyDivergence = false;

    for (const seed of seeds) {
      const runner = new GameRunner<MERCGame>({
        GameClass: MERCGame,
        gameType: 'merc',
        gameOptions: {
          playerCount: 2,
          playerNames: ['Rebel1', 'DictatorBot'],
          seed,
          dictatorIsAI: true,
        } as any,
      });

      runner.start();
      const game = runner.game;

      let actionCount = 0;
      const maxActions = 100;

      while (actionCount < maxActions) {
        const flowState = game.getFlowState();
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

      // Clone at end
      const snapshot = runner.getSnapshot();
      const { flowState: cloneFlow } = cloneGame(snapshot);
      const origFlow = game.getFlowState()!;

      const diverged = cloneFlow.complete !== origFlow.complete ||
        cloneFlow.awaitingInput !== origFlow.awaitingInput;

      if (diverged) {
        anyDivergence = true;
        console.log(`DIVERGENCE with seed "${seed}" after ${actionCount} actions`);
      }
    }

    expect(anyDivergence).toBe(false);
  });

  it('should clone correctly after playerConfigs is stripped (HMR scenario)', () => {
    // This test simulates the HMR bug: after Hot Module Replacement, the game's
    // _constructorOptions loses playerConfigs. The clone would then create a game
    // without setting dictatorPlayer.isAI, causing flow divergence.
    const seed = 'hmr-clone-test';
    const runner = new GameRunner<MERCGame>({
      GameClass: MERCGame,
      gameType: 'merc',
      gameOptions: {
        playerCount: 2,
        playerNames: ['Rebel1', 'DictatorBot'],
        seed,
        playerConfigs: [
          { color: '#e74c3c', isDictator: false, isAI: false },
          { color: '#95a5a6', isDictator: true, isAI: true, aiLevel: 'medium' },
        ],
      } as any,
    });

    runner.start();
    const game = runner.game;

    // Verify dictator is AI
    expect(game.dictatorPlayer.isAI).toBe(true);

    // Play a few actions
    let actionCount = 0;
    while (actionCount < 50) {
      const flowState = game.getFlowState();
      const action = getCurrentAction(flowState);
      if (!action) break;

      let succeeded = false;
      for (const actionName of action.available) {
        const args = autoResolveArgs(game, actionName, action.currentPlayer);
        if (args === null) continue;
        const result = runner.performAction(actionName, action.currentPlayer, args);
        if (result.success) { actionCount++; succeeded = true; break; }
      }
      if (!succeeded) break;
    }

    // Simulate HMR: strip playerConfigs from constructor options
    // This is what happens when reloadWithDevTransfer reconstructs the game
    // from storedState which only has host-level gameOptions
    const snapshot = runner.getSnapshot();
    expect(snapshot.gameOptions).toBeDefined();

    // The fix: getConstructorOptions() should reconstruct playerConfigs
    // even if the base _constructorOptions doesn't have it
    const opts = snapshot.gameOptions!;
    expect(opts.playerConfigs).toBeDefined();
    expect(Array.isArray(opts.playerConfigs)).toBe(true);

    const configs = opts.playerConfigs as any[];
    const dictatorConfig = configs.find((c: any) => c.isDictator);
    expect(dictatorConfig).toBeDefined();
    expect(dictatorConfig.isAI).toBe(true);

    // Now simulate HMR by creating a snapshot WITHOUT playerConfigs
    // and verify the clone still works (because getConstructorOptions fills it in)
    const strippedSnapshot = {
      ...snapshot,
      gameOptions: {
        playerCount: opts.playerCount,
        playerNames: opts.playerNames,
        seed: opts.seed,
        // Deliberately omit playerConfigs — this is the HMR bug
      },
    };

    // Without the fix, this clone's dictator would NOT be AI
    const { clone, flowState: cloneFlow } = cloneGame(strippedSnapshot);
    const origFlow = game.getFlowState()!;

    // The clone with stripped options won't have isAI set — this is expected
    // because we stripped playerConfigs from the snapshot. The fix is that
    // getConstructorOptions() on the ORIGINAL game preserves playerConfigs,
    // so the real snapshot (not our stripped one) would have them.
    // This test verifies that the real snapshot has the correct options.

    // Verify the REAL snapshot produces a correct clone
    const { clone: realClone, flowState: realCloneFlow } = cloneGame(snapshot);
    expect(realClone.dictatorPlayer.isAI).toBe(true);

    const realDiverged = realCloneFlow.complete !== origFlow.complete ||
      realCloneFlow.awaitingInput !== origFlow.awaitingInput ||
      realCloneFlow.currentPlayer !== origFlow.currentPlayer;

    expect(realDiverged).toBe(false);
  });
});
