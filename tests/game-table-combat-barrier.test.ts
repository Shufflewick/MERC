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

  type Event = { id: number; type: string; data: Record<string, unknown> };
  const mortarStrike = (id: number): Event => ({ id, type: 'mortar-strike', data: { targetSectorId: 's1', hitCombatantIds: [], killedCombatantIds: [], militiaKilled: 0 } });

  async function mountTable() {
    const testGame = createTestGame(MERCGame, { playerCount: 2, playerNames: ['Rebel1', 'Dictator'], seed: 'table-barrier' });
    const events = ref<Event[]>([]);
    const animations = createAnimationEvents({ events: () => events.value as never });
    const shell = await tableShellContext(testGame, 1, { provide: { [ANIMATION_EVENTS_KEY as symbol]: animations } });
    const wrapper = mount(GameTable, {
      props: { gameView: testGame.getPlayerView(1).state, playerSeat: 1, isMyTurn: true, availableActions: [], actionController: shell.actionController, setBoardPrompt: () => {} },
      global: { provide: shell.provide, renderStubDefaultSlot: true },
      shallow: true,
    });
    const barrier = () => wrapper.findAllComponents({ name: 'GameOverlay' }).find((o) => o.find('.combat-barrier-content').exists())!;
    const mortar = () => wrapper.findComponent({ name: 'MapGrid' }).props('mortarStrike');
    vi.useFakeTimers();
    return { events, animations, shell, wrapper, barrier, mortar };
  }

  it('starts the next animation only once the barrier overlay has faded out', async () => {
    const { events, shell, wrapper, barrier, mortar } = await mountTable();
    events.value = [{ id: 1, type: 'combat-barrier', data: {} }, mortarStrike(2)];
    await flushPromises();
    // Half dimmed, so the board stays readable behind the banner.
    expect(barrier().props()).toMatchObject({ active: true, backdropOpacity: 0.5 });

    await vi.runAllTimersAsync();
    expect(barrier().props('active')).toBe(false);
    expect(mortar()).toBeNull();

    barrier().vm.$emit('closed');
    await flushPromises();
    expect(mortar()).toMatchObject({ targetSectorId: 's1' });

    wrapper.unmount();
    shell.stop();
  });

  it('hides a skipped barrier at once, so it cannot cut short the next barrier', async () => {
    const { events, animations, shell, wrapper, barrier, mortar } = await mountTable();
    events.value = [{ id: 1, type: 'combat-barrier', data: {} }];
    await flushPromises();
    animations.skipAll();
    await flushPromises();
    expect(barrier().props('active')).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    events.value = [...events.value, { id: 2, type: 'combat-barrier', data: {} }, mortarStrike(3)];
    await flushPromises();
    expect(barrier().props('active')).toBe(true);
    // The skipped barrier's fade-out ends while the new one shows.
    barrier().vm.$emit('closed');

    // The skipped barrier's 2 s would have run out here.
    await vi.advanceTimersByTimeAsync(1500);
    expect(barrier().props('active')).toBe(true);

    await vi.runAllTimersAsync();
    expect(mortar()).toBeNull();
    barrier().vm.$emit('closed');
    await flushPromises();
    expect(mortar()).toMatchObject({ targetSectorId: 's1' });

    wrapper.unmount();
    shell.stop();
  });

  it('finishes when the table unmounts while the barrier shows', async () => {
    const { events, animations, shell, wrapper } = await mountTable();
    events.value = [{ id: 1, type: 'combat-barrier', data: {} }];
    await flushPromises();
    wrapper.unmount();

    await vi.runAllTimersAsync();
    expect(animations.isAnimating.value).toBe(false);
    shell.stop();
  });
});
