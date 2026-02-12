import { describe, it, expect } from 'vitest';
import { createTestGame, traceAction } from 'boardsmith/testing';
import { ActionExecutor } from 'boardsmith';
import { MERCGame } from '../src/rules/game.js';

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
    const executor = new ActionExecutor(game);
    console.log('Dictator isAI:', game.dictatorPlayer.isAI);

    // Find a valid landing sector
    const validSectors = game.gameMap.getAllSectors()
      .filter(s => s.isIndustry && game.gameMap.isEdgeSector(s) && !s.isBase);
    expect(validSectors.length).toBeGreaterThan(0);

    // Step 1: Place landing (1-indexed player)
    let result = testGame.doAction(1, 'placeLanding', { sector: validSectors[0].id });
    console.log('placeLanding:', result.success);
    expect(result.success).toBe(true);

    // Step 2: Get merc choices via action executor
    const rebelPlayer = game.rebelPlayers[0];
    const hireAction = game.getAction('hireFirstMerc') as any;
    const mercSelection = hireAction.selections[0]; // 'merc' selection
    const mercChoices = executor.getChoices(mercSelection, rebelPlayer, {});
    console.log('Merc choices:', mercChoices.map((c: any) => c.value || c.display || c));

    const firstMerc = mercChoices[0]?.value ?? mercChoices[0];
    result = testGame.doAction(1, 'hireFirstMerc', { merc: firstMerc, equipmentType: 'Weapon' });
    console.log('hireFirstMerc:', result.success, (result as any).error);
    expect(result.success).toBe(true);

    // Step 3: Second hire
    let flowState = testGame.getFlowState();
    console.log('After hire1:', flowState?.currentPlayer, flowState?.availableActions);

    const hire2Action = game.getAction('hireSecondMerc') as any;
    const merc2Selection = hire2Action.selections[0];
    const merc2Choices = executor.getChoices(merc2Selection, rebelPlayer, {});
    console.log('Second merc choices:', merc2Choices.map((c: any) => c.value || c.display || c));

    const secondMerc = merc2Choices[0]?.value ?? merc2Choices[0];
    result = testGame.doAction(1, 'hireSecondMerc', { merc: secondMerc, equipmentType: 'Armor' });
    console.log('hireSecondMerc:', result.success, (result as any).error);
    expect(result.success).toBe(true);

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
          const choices = executor.getChoices(sel, game.dictatorPlayer, {});
          console.log(`  "${sel.name}":`, choices.map((c: any) => c.value || c.display || c));
        }

        // Verify there are equipment and sector choices
        const equipSel = dictHireAction.selections?.find((s: any) => s.name === 'equipmentType');
        const sectorSel = dictHireAction.selections?.find((s: any) => s.name === 'targetSector');

        if (equipSel) {
          const equipChoices = executor.getChoices(equipSel, game.dictatorPlayer, {});
          expect(equipChoices.length).toBe(3); // Weapon, Armor, Accessory
        }
        if (sectorSel) {
          const sectorChoices = executor.getChoices(sectorSel, game.dictatorPlayer, {});
          expect(sectorChoices.length).toBeGreaterThan(0);
        }

        // Now actually execute the action with chosen values
        const mercChoices2 = executor.getChoices(dictHireAction.selections[0], game.dictatorPlayer, {});
        const mercName = mercChoices2[0]?.value ?? mercChoices2[0];
        result = testGame.doAction(2, 'dictatorHireFirstMerc', {
          merc: mercName,
          equipmentType: 'Weapon',
          targetSector: 'Fishing Industry',
        });
        console.log('dictatorHireFirstMerc:', result.success, (result as any).error);
        expect(result.success).toBe(true);

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
        const dictChoices = executor.getChoices(dictSel, game.dictatorPlayer, {});
        console.log('  Dictator choices:', dictChoices.map((c: any) => c.value || c.display || c));
        const castro = dictChoices.find((c: any) => String(c.value || c).toLowerCase().includes('castro'));
        result = testGame.doAction(player, actionName, {
          dictatorChoice: castro?.value ?? castro ?? dictChoices[0]?.value ?? dictChoices[0],
        });
      } else {
        result = testGame.doAction(player, actionName, {});
      }
      console.log(`  -> ${result.success} ${(result as any).error || ''}`);
    }

    // Should have found dictatorHireFirstMerc
    flowState = testGame.getFlowState();
    console.log('FINAL:', flowState?.currentPlayer, flowState?.availableActions);
    expect(flowState?.availableActions).toContain('dictatorHireFirstMerc');
  });
});
