// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createAnimationEvents, ANIMATION_EVENTS_KEY, type UseActionControllerReturn } from 'boardsmith/ui';
import { createTestGame, tableShellContext } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import GameTable from '../src/ui/components/GameTable.vue';

describe('GameTable confirming combat targets', () => {
  it('sends a one-target pick as a list of one', async () => {
    const testGame = createTestGame(MERCGame, { playerCount: 2, playerNames: ['Rebel1', 'Dictator'], seed: 'table-targets' });
    const events = ref<{ id: number; type: string; data: Record<string, unknown> }[]>([]);
    const shell = await tableShellContext(testGame, 1, {
      provide: { [ANIMATION_EVENTS_KEY as symbol]: createAnimationEvents({ events: () => events.value as never }) },
    });
    const sent: [string, Record<string, unknown>][] = [];
    // The shell's own controller, recording what the board sends instead of sending it.
    const actionController: UseActionControllerReturn = {
      ...shell.actionController,
      execute: async (action, args) => { sent.push([action, args ?? {}]); return { success: true }; },
    };

    const wrapper = mount(GameTable, {
      props: {
        gameView: testGame.getPlayerView(1),
        playerSeat: 1,
        isMyTurn: true,
        availableActions: ['combatSelectTarget'],
        actionController,
        setBoardPrompt: () => {},
      },
      global: { provide: shell.provide },
      shallow: true,
    });
    events.value = [{ id: 1, type: 'combat-panel', data: {} }];
    await flushPromises();

    wrapper.findComponent({ name: 'CombatPanel' }).vm.$emit('confirm-targets', ['militia-dictator-0']);
    await flushPromises();

    expect(sent).toEqual([['combatSelectTarget', { targets: ['militia-dictator-0'] }]]);
    wrapper.unmount();
    shell.stop();
  });
});

describe('GameTable sending Golem and Epinephrine choices from the combat panel (#105)', () => {
  async function tableWith(availableActions: string[]) {
    const testGame = createTestGame(MERCGame, { playerCount: 2, playerNames: ['Rebel1', 'Dictator'], seed: 'table-choices' });
    const events = ref<{ id: number; type: string; data: Record<string, unknown> }[]>([]);
    const shell = await tableShellContext(testGame, 1, {
      provide: { [ANIMATION_EVENTS_KEY as symbol]: createAnimationEvents({ events: () => events.value as never }) },
    });
    const sent: [string, Record<string, unknown>][] = [];
    const actionController: UseActionControllerReturn = {
      ...shell.actionController,
      execute: async (action, args) => { sent.push([action, args ?? {}]); return { success: true }; },
    };
    const wrapper = mount(GameTable, {
      props: { gameView: testGame.getPlayerView(1), playerSeat: 1, isMyTurn: true, availableActions, actionController, setBoardPrompt: () => {} },
      global: { provide: shell.provide },
      shallow: true,
    });
    events.value = [{ id: 1, type: 'combat-panel', data: {} }];
    await flushPromises();
    return { wrapper, sent, stop: () => { wrapper.unmount(); shell.stop(); } };
  }

  const choices: [string, unknown[], string, Record<string, unknown>][] = [
    ['golem-strike', ['Lucid::lucid'], 'golemPreCombatAttack', { target: 'Lucid::lucid' }],
    ['golem-hold', [], 'golemSkipPreCombat', {}],
    ['use-epinephrine', [9], 'combatUseEpinephrine', { saverMerc: 9 }],
    ['decline-epinephrine', [], 'combatDeclineEpinephrine', {}],
  ];

  it.each(choices)('sends %s as its action', async (event, payload, action, args) => {
    const table = await tableWith([action]);
    table.wrapper.findComponent({ name: 'CombatPanel' }).vm.$emit(event, ...payload);
    await flushPromises();
    expect(table.sent).toEqual([[action, args]]);
    table.stop();
  });

  it.each(choices)('sends nothing for %s once its action is closed', async (event, payload) => {
    const table = await tableWith(['combatContinue']);
    table.wrapper.findComponent({ name: 'CombatPanel' }).vm.$emit(event, ...payload);
    await flushPromises();
    expect(table.sent).toEqual([]);
    table.stop();
  });
});
