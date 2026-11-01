import { describe, it, expect } from 'vitest';
import { createTestGame, traceAction } from 'boardsmith/testing';
import { GameRunner } from 'boardsmith/runtime';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel } from '../src/rules/elements.js';
import { setGlobalCachedValue } from '../src/rules/actions/helpers.js';
import { autoResolveArgs, getCurrentAction } from './helpers/auto-play.js';

function playToHumanDictatorFirstHire(seed: string): GameRunner<MERCGame> {
  const runner = new GameRunner<MERCGame>({
    GameClass: MERCGame,
    gameType: 'merc',
    gameOptions: {
      playerCount: 2,
      playerNames: ['Rebel', 'Dictator'],
      seed,
      dictatorIsBot: false,
      playerConfigs: [{ color: '#e74c3c' }, { color: '#95a5a6', role: true, isBot: false }],
    } as never,
  });
  runner.start();
  const game = runner.game;
  for (let next = getCurrentAction(game.getFlowState()); next && !next.available.includes('dictatorHireFirstMerc');
    next = getCurrentAction(game.getFlowState())) {
    const actionName = next.available[0];
    expect(runner.performAction(actionName, next.currentPlayer, autoResolveArgs(game, actionName, next.currentPlayer)!).success).toBe(true);
  }
  return runner;
}

/**
 * Test: Human dictator should get equipment + sector choices when hiring first MERC on Day 1
 */
describe('Dictator Day 1 Hire', () => {
  it('should advance through rebel day 1 to reach dictator hire step', () => {
    const testGame = createTestGame(MERCGame, {
      playerCount: 2,
      playerNames: ['Rebel1', 'Dictator'],
      seed: 'dictator-hire-test',
    });

    const game = testGame.game;
    console.log('Dictator isBot:', game.dictatorPlayer.isBot);

    // Find a valid landing sector
    const validSectors = game.gameMap.getAllSectors()
      .filter(s => s.isIndustry && game.gameMap.isEdgeSector(s) && !s.isBase);
    expect(validSectors.length).toBeGreaterThan(0);

    // Step 1: Place landing (1-indexed player)
    testGame.doAction(1, 'placeLanding', { sector: validSectors[0].id });

    // Step 2: Get merc choices
    const rebelPlayer = game.rebelPlayers[0];
    const hireAction = game.getAction('hireFirstMerc') as any;
    const mercSelection = hireAction.selections[0]; // 'merc' selection
    const mercChoices = game.getSelectionChoices('hireFirstMerc', mercSelection.name, rebelPlayer);
    console.log('Merc choices:', mercChoices.map((c: any) => c.value || c.display || c));

    const firstMerc = mercChoices[0]?.value ?? mercChoices[0];
    testGame.doAction(1, 'hireFirstMerc', { merc: firstMerc, equipmentType: 'Weapon' });

    // Step 3: Second hire
    let flowState = testGame.getFlowState();
    console.log('After hire1:', flowState?.currentPlayer, flowState?.availableActions);

    const hire2Action = game.getAction('hireSecondMerc') as any;
    const merc2Selection = hire2Action.selections[0];
    const merc2Choices = game.getSelectionChoices('hireSecondMerc', merc2Selection.name, rebelPlayer);
    console.log('Second merc choices:', merc2Choices.map((c: any) => c.value || c.display || c));

    const secondMerc = merc2Choices[0]?.value ?? merc2Choices[0];
    testGame.doAction(1, 'hireSecondMerc', { merc: secondMerc, equipmentType: 'Armor' });

    // Now the dictator's turn should start
    flowState = testGame.getFlowState();
    console.log('After rebel done:', flowState?.currentPlayer, flowState?.availableActions);

    // Walk through dictator steps until we find dictatorHireFirstMerc
    let maxSteps = 20;
    while (maxSteps-- > 0) {
      flowState = testGame.getFlowState();
      const actions = flowState?.availableActions || [];
      const player = flowState?.currentPlayer;

      if (actions.includes('dictatorHireFirstMerc')) {
        console.log('=== FOUND dictatorHireFirstMerc! ===');

        // Get the selections for this action
        const dictHireAction = game.getAction('dictatorHireFirstMerc') as any;
        console.log('Action selections:', dictHireAction.selections?.map((s: any) => s.name));

        // Get choices for each selection
        for (const sel of dictHireAction.selections || []) {
          const choices = game.getSelectionChoices('dictatorHireFirstMerc', sel.name, game.dictatorPlayer);
          console.log(`  "${sel.name}":`, choices.map((c: any) => c.value || c.display || c));
        }

        // Verify there are equipment and sector choices
        const equipSel = dictHireAction.selections?.find((s: any) => s.name === 'equipmentType');
        const sectorSel = dictHireAction.selections?.find((s: any) => s.name === 'targetSector');

        if (equipSel) {
          const equipChoices = game.getSelectionChoices('dictatorHireFirstMerc', equipSel.name, game.dictatorPlayer);
          expect(equipChoices.length).toBe(3); // Weapon, Armor, Accessory
        }
        if (sectorSel) {
          const sectorChoices = game.getSelectionChoices('dictatorHireFirstMerc', sectorSel.name, game.dictatorPlayer);
          expect(sectorChoices.length).toBeGreaterThan(0);
        }

        // Now actually execute the action with chosen values
        const mercChoices2 = game.getSelectionChoices('dictatorHireFirstMerc', dictHireAction.selections[0].name, game.dictatorPlayer);
        const mercName = mercChoices2[0]?.value ?? mercChoices2[0];
        const [targetSector] = game.getSelectionChoices('dictatorHireFirstMerc', 'targetSector', game.dictatorPlayer, {
          merc: mercName,
          equipmentType: 'Weapon',
        });
        testGame.doAction(2, 'dictatorHireFirstMerc', {
          merc: mercName,
          equipmentType: 'Weapon',
          targetSector: targetSector.value,
        });

        // Verify the merc was hired
        const dictatorTeam = game.dictatorPlayer.hiredMercs;
        console.log('Dictator team:', dictatorTeam.map(m => m.combatantName));
        expect(dictatorTeam.length).toBeGreaterThan(0);

        return; // Test passed!
      }

      if (actions.length === 0 || player === undefined) {
        console.log('Flow stuck');
        break;
      }

      const actionName = actions[0];
      console.log(`  Advancing: ${actionName} for player ${player}`);

      if (actionName === 'selectDictator') {
        const dictAction = game.getAction('selectDictator') as any;
        const dictSel = dictAction.selections[0];
        const dictChoices = game.getSelectionChoices('selectDictator', dictSel.name, game.dictatorPlayer);
        console.log('  Dictator choices:', dictChoices.map((c: any) => c.value || c.display || c));
        const castro = dictChoices.find((c: any) => String(c.value || c).toLowerCase().includes('castro'));
        testGame.doAction(player, actionName, {
          dictatorChoice: castro?.value ?? castro ?? dictChoices[0]?.value ?? dictChoices[0],
        });
      } else {
        testGame.doAction(player, actionName, {});
      }
    }

    // Should have found dictatorHireFirstMerc
    flowState = testGame.getFlowState();
    console.log('FINAL:', flowState?.currentPlayer, flowState?.availableActions);
    expect(flowState?.availableActions).toContain('dictatorHireFirstMerc');
  });

  it('runs a Bot Dictator\'s Day 1 hire and extra militia by Bot rules, offering no picks they would ignore', () => {
    // Two rebels, so the Dictator has extra militia to place.
    const runner = new GameRunner<MERCGame>({
      GameClass: MERCGame,
      gameType: 'merc',
      gameOptions: {
        playerCount: 3,
        playerNames: ['Rebel1', 'Rebel2', 'Dictator'],
        seed: 'bot-dictator-day-one',
        dictatorIsBot: true,
        playerConfigs: [{ color: '#e74c3c' }, { color: '#3498db' }, { color: '#95a5a6', role: true, isBot: true }],
      } as never,
    });
    runner.start();
    const game = runner.game;
    const extra = game.setupConfig.dictatorStrength.extra;
    expect(extra, 'this table gives the Dictator extra militia').toBeGreaterThan(0);
    const dictatorMilitia = () => game.gameMap.getAllSectors().reduce((sum, s) => sum + s.dictatorMilitia, 0);

    const offered = new Set<string>();
    let militiaBeforeExtra: number | undefined;
    for (let next = getCurrentAction(game.getFlowState()); next && game.currentDay === 1;
      next = getCurrentAction(game.getFlowState())) {
      next.available.forEach((a) => offered.add(a));
      const actionName = next.available[0];
      if (actionName === 'dictatorDrawTactics') militiaBeforeExtra = dictatorMilitia();
      expect(runner.performAction(actionName, next.currentPlayer, autoResolveArgs(game, actionName, next.currentPlayer)!).success).toBe(true);
    }

    expect(game.currentDay, 'Day 1 finished').toBe(2);
    expect(offered).not.toContain('dictatorHireFirstMerc');
    expect(offered).not.toContain('dictatorPlaceExtraMilitia');
    expect(game.dictatorPlayer.team.filter((m) => m.isMerc)).toHaveLength(1);
    expect(dictatorMilitia() - militiaBeforeExtra!).toBe(extra);
  });

  it("gives a human Dictator's first MERC his hire ability: Vrbansk's bonus accessory", () => {
    const runner = playToHumanDictatorFirstHire('human-dictator-first-hire');
    const game = runner.game;
    const vrbansk = game.first(CombatantModel, (c) => c.combatantId === 'vrbansk')!;
    // Stand Vrbansk in for whatever MERC the draw step put up for hire.
    setGlobalCachedValue(game, 'dictatorFirstMercId', vrbansk.id);

    const seat = game.dictatorPlayer.seat;
    const [targetSector] = game.getSelectionChoices('dictatorHireFirstMerc', 'targetSector', game.dictatorPlayer, { merc: 'Vrbansk', equipmentType: 'Weapon' });
    const result = runner.performAction('dictatorHireFirstMerc', seat, { merc: 'Vrbansk', equipmentType: 'Weapon', targetSector: targetSector.value });
    expect(result.success, result.error).toBe(true);

    expect(vrbansk.weaponSlot).toBeDefined();
    expect(vrbansk.accessorySlot, 'Vrbansk gets a bonus accessory on hire').toBeDefined();
  });
});
