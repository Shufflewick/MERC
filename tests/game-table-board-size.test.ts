// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createAnimationEvents, ANIMATION_EVENTS_KEY } from 'boardsmith/ui';
import { createTestGame, tableShellContext } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import GameTable from '../src/ui/components/GameTable.vue';

describe('GameTable board sizing (#84)', () => {
  it('pins the board to the width it is given, so the shell scrolls it instead of shrinking it to fit its height', async () => {
    const testGame = createTestGame(MERCGame, { playerCount: 2, playerNames: ['Rebel1', 'Dictator'], seed: 'board-size' });
    const events = ref<{ id: number; type: string; data: Record<string, unknown> }[]>([]);
    const shell = await tableShellContext(testGame, 1, {
      provide: { [ANIMATION_EVENTS_KEY as symbol]: createAnimationEvents({ events: () => events.value as never }) },
    });
    const wrapper = mount(GameTable, {
      props: {
        gameView: testGame.getPlayerView(1),
        playerSeat: 1,
        isMyTurn: true,
        availableActions: [],
        actionController: shell.actionController,
        setBoardPrompt: () => {},
      },
      global: { provide: shell.provide },
      shallow: true,
      attachTo: document.body,
    });
    await flushPromises();
    const board = wrapper.find('.game-board').element as HTMLElement;
    // jsdom has no layout, so the width the board is given is declared on its parent, then the window resizes.
    Object.defineProperty(board.parentElement!, 'clientWidth', { value: 1123 });
    window.dispatchEvent(new Event('resize'));
    await flushPromises();

    expect(board.style.width).toBe('1123px');
    wrapper.unmount();
    shell.stop();
  });
});
