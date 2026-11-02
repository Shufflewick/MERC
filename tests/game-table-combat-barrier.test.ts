// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createAnimationEvents, ANIMATION_EVENTS_KEY } from 'boardsmith/ui';
import { createTestGame, tableShellContext } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import GameTable from '../src/ui/components/GameTable.vue';

describe('GameTable combat barrier (#108)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('starts the next animation only once the barrier overlay has faded out', async () => {
    const testGame = createTestGame(MERCGame, { playerCount: 2, playerNames: ['Rebel1', 'Dictator'], seed: 'table-barrier' });
    const events = ref<{ id: number; type: string; data: Record<string, unknown> }[]>([]);
    const shell = await tableShellContext(testGame, 1, {
      provide: { [ANIMATION_EVENTS_KEY as symbol]: createAnimationEvents({ events: () => events.value as never }) },
    });
    const wrapper = mount(GameTable, {
      props: { gameView: testGame.getPlayerView(1).state, playerSeat: 1, isMyTurn: true, availableActions: [], actionController: shell.actionController, setBoardPrompt: () => {} },
      global: { provide: shell.provide, renderStubDefaultSlot: true },
      shallow: true,
    });
    const barrier = () => wrapper.findAllComponents({ name: 'GameOverlay' }).find((o) => o.find('.combat-barrier-content').exists())!;
    const mortar = () => wrapper.findComponent({ name: 'MapGrid' }).props('mortarStrike');

    vi.useFakeTimers();
    events.value = [
      { id: 1, type: 'combat-barrier', data: {} },
      { id: 2, type: 'mortar-strike', data: { targetSectorId: 's1', hitCombatantIds: [], killedCombatantIds: [], militiaKilled: 0 } },
    ];
    await flushPromises();
    expect(barrier().props('active')).toBe(true);

    await vi.runAllTimersAsync();
    expect(barrier().props('active')).toBe(false);
    expect(mortar()).toBeNull();

    barrier().vm.$emit('closed');
    await flushPromises();
    expect(mortar()).toMatchObject({ targetSectorId: 's1' });

    wrapper.unmount();
    shell.stop();
  });
});
