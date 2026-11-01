// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
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
      '<div class="squad-section" data-squad="Secondary"><div class="combatant-card" data-combatant="Haarg"><span class="merc-name">Haarg</span></div></div>' +
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
      expect.objectContaining({ kind: 'action', element: 'Haarg', from: '.squad-section .combatant-card[data-combatant="Haarg"]' }),
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

// Stands in for SquadPanel: it collapses the flying combatant's card with .merc-flying.
const SquadStub = defineComponent({
  name: 'GameTable',
  props: { flyingCombatantName: { type: String, default: null } },
  setup(props) {
    return () => h('div', { class: 'squad-section', 'data-squad': 'Primary' }, [
      h('div', { class: { 'merc-flying': props.flyingCombatantName === 'Haarg' } }, [
        h('div', { class: 'combatant-card', 'data-combatant': 'Haarg' }, [
          h('div', { class: 'combatant-icon-small' }, [h('img', { src: '/mercs/haarg.webp' })]),
          h('span', { class: 'merc-name' }, 'Haarg'),
          h('div', { class: 'stats-grid' }, [
            h('div', { class: 'stat' }, [h('span', { class: 'stat-value' }, '3')]),
            h('div', { class: 'stat' }, [h('span', { class: 'stat-value' }, '4')]),
          ]),
        ]),
      ]),
    ]);
  },
});

describe('MercBoard assignToSquad flying card', () => {
  let wrapper: ReturnType<typeof mount>;
  let autoExecute: ReturnType<typeof controllerThatRunsHooks>['autoExecute'];

  // The Assign to Squad panel row comes first in the page, as it does while the panel is open.
  beforeEach(async () => {
    document.body.innerHTML =
      '<div class="combatant-item" data-combatant="Haarg"><div class="combatant-icon-small"><img src="/mercs/haarg.webp"></div></div>' +
      '<div id="board"></div>' +
      '<div class="squad-section" data-squad="Secondary"></div>';
    // jsdom has no layout; a collapsed card measures as nothing, a laid-out one as its box.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.closest('.merc-flying') ? new DOMRect(0, 0, 0, 0) : new DOMRect(100, 200, 280, 340);
    });
    const harness = controllerThatRunsHooks();
    autoExecute = harness.autoExecute;
    wrapper = mount(MercBoard, {
      attachTo: '#board',
      props: {
        state: {},
        gameView: { id: 1, children: [] },
        playerSeat: 1,
        isMyTurn: true,
        availableActions: [],
        actionController: harness.controller,
        setBoardPrompt: () => {},
      },
      global: { stubs: { GameTable: SquadStub } },
    });
    await flushPromises();
  });
  afterEach(() => {
    wrapper.unmount();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  async function assign(run: number) {
    await autoExecute('assignToSquad', { combatantName: 'Haarg', targetSquad: 'Secondary Squad' }, run, true);
    await wrapper.setProps({ gameView: { id: 1, children: [{ id: run + 1 }] } });
    await flushPromises();
  }

  it("flies the squad's card with its name, stats and portrait", async () => {
    const portrait = document.querySelector('.combatant-card img') as HTMLImageElement;
    await assign(1);

    expect(document.querySelector('.flying-card-name')?.textContent).toBe('Haarg');
    expect([...document.querySelectorAll('.flying-stat-value')].slice(0, 2).map((s) => s.textContent)).toEqual(['3', '4']);
    expect((document.querySelector('.flying-card-icon') as HTMLImageElement).src).toBe(portrait.src);
  });

  it('starts a quick second flight of the same MERC from its laid-out card', async () => {
    await assign(1);
    await assign(2);

    const flights = document.querySelectorAll<HTMLElement>('.flying-card');
    const second = flights[flights.length - 1];
    expect([second.style.left, second.style.top]).toEqual(['100px', '200px']);
  });
});
