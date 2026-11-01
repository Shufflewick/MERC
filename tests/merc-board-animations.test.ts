// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import type { UseActionControllerReturn } from 'boardsmith/ui';
import { enableAnimationTestMode, disableAnimationTestMode, getAnimationTrace, clearAnimationTrace } from 'boardsmith/testing';
import MercBoard from '../src/ui/MercBoard.vue';

type Hook = (actionName: string, args: Record<string, unknown>, run: number) => void | Promise<void>;
type Listener = (result: { success: boolean }, run: number) => void | Promise<void>;

// The controller is the board's input from GameShell; this one runs hooks the way it does.
function controllerThatRunsHooks() {
  const hooks: Hook[] = [];
  const listeners: Listener[] = [];
  const controller = {
    onBeforeAutoExecute: (hook: Hook) => { hooks.push(hook); return () => {}; },
    onAfterAutoExecute: (listener: Listener) => { listeners.push(listener); return () => {}; },
  } as unknown as UseActionControllerReturn;
  async function autoExecute(actionName: string, args: Record<string, unknown>, run: number, success: boolean) {
    for (const hook of hooks) await hook(actionName, args, run);
    for (const listener of listeners) await listener({ success }, run);
  }
  return { controller, autoExecute };
}

function mountBoard(actionController: UseActionControllerReturn) {
  return mount(MercBoard, {
    props: {
      state: {},
      gameView: { id: 1, children: [] },
      playerSeat: 1,
      isMyTurn: true,
      availableActions: [],
      actionController,
      setBoardPrompt: () => {},
    },
    global: { stubs: { GameTable: true } },
  });
}

describe('MercBoard assignToSquad flight', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div data-combatant="Haarg"><span class="merc-name">Haarg</span></div>' +
      '<div class="squad-section" data-squad="Primary"></div>';
    enableAnimationTestMode();
  });
  afterEach(() => {
    disableAnimationTestMode();
    clearAnimationTrace();
    document.body.innerHTML = '';
  });

  const args = { combatantName: 'Haarg', targetSquad: 'Primary Squad' };

  it('plays once the action is accepted and its state renders', async () => {
    const { controller, autoExecute } = controllerThatRunsHooks();
    const wrapper = mountBoard(controller);
    await autoExecute('assignToSquad', args, 1, true);
    await wrapper.setProps({ gameView: { id: 1, children: [{ id: 2 }] } });
    await flushPromises();

    expect(getAnimationTrace()).toContainEqual(
      expect.objectContaining({ kind: 'action', element: 'Haarg', from: '[data-combatant="Haarg"]' }),
    );
  });

  it('plays nothing when the action is refused', async () => {
    const { controller, autoExecute } = controllerThatRunsHooks();
    const wrapper = mountBoard(controller);
    await autoExecute('assignToSquad', args, 1, false);
    await wrapper.setProps({ gameView: { id: 1, children: [{ id: 2 }] } });
    await flushPromises();

    expect(getAnimationTrace()).toEqual([]);
  });

  it('shows the MERC card again when the action is refused', async () => {
    const { controller, autoExecute } = controllerThatRunsHooks();
    const wrapper = mountBoard(controller);
    await autoExecute('assignToSquad', args, 1, false);

    expect(wrapper.findComponent({ name: 'GameTable' }).props('flyingCombatantName')).toBeNull();
  });
});
