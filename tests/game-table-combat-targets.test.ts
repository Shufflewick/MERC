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
