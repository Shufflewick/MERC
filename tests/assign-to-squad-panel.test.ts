// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import { BOARD_INTERACTION_KEY, createBoardInteraction, type UseActionControllerReturn } from 'boardsmith/ui';
import AssignToSquadPanel from '../src/ui/components/AssignToSquadPanel.vue';

// assignToSquad open on its first pick, as GameTable shows the panel; fill advances it the way the server does.
function assignToSquadController() {
  const fills: Array<[string, unknown]> = [];
  const currentPick = ref<{ name: string; type: string } | null>({ name: 'combatantName', type: 'choice' });
  const controller = {
    currentArgs: ref({}),
    currentPick,
    getChoices: () => [{ value: 'Secondary Squad', display: 'Secondary Squad' }],
    fill: async (name: string, value: unknown) => {
      fills.push([name, value]);
      currentPick.value = name === 'combatantName' ? { name: 'targetSquad', type: 'choice' } : null;
    },
    start: async () => {},
  } as unknown as UseActionControllerReturn;
  return { controller, fills, currentPick };
}

// jsdom has no DataTransfer; a drag event only needs somewhere to put its data.
function dataTransfer() {
  return { setData: () => {}, setDragImage: () => {}, effectAllowed: 'all', dropEffect: 'none' };
}

function mountPanel(controller: UseActionControllerReturn) {
  const board = createBoardInteraction();
  const wrapper = mount(AssignToSquadPanel, {
    props: {
      playerColor: 'red',
      primarySquad: { squadId: 'p', isPrimary: true, sectorName: 'Alpha', mercs: [{ combatantId: 'valkyrie', combatantName: 'Valkyrie', image: '/mercs/valkyrie.webp' }] },
      secondarySquad: { squadId: 's', isPrimary: false, mercs: [] },
      actionController: controller,
      isDictator: false,
    },
    global: { provide: { [BOARD_INTERACTION_KEY]: board } },
  });
  return { wrapper, board };
}

describe('AssignToSquadPanel drag', () => {
  it('drops a MERC on another squad without asking BoardSmith for drop targets', async () => {
    const { controller, fills } = assignToSquadController();
    const { wrapper, board } = mountPanel(controller);
    const valkyrie = wrapper.find('.combatant-item[data-combatant="Valkyrie"]');

    await valkyrie.trigger('dragstart', { dataTransfer: dataTransfer() });
    // A BoardSmith drag derives targets from the open pick; this pick's choices carry no board refs.
    expect(board.isDragging).toBe(false);

    await wrapper.find('.squad-panel[data-squad="Secondary"]').trigger('drop');
    await flushPromises();
    expect(fills).toEqual([['combatantName', 'Valkyrie'], ['targetSquad', 'Secondary Squad']]);
  });

  it('does not drag a MERC once its target squad is being chosen', async () => {
    const { controller, fills, currentPick } = assignToSquadController();
    currentPick.value = { name: 'targetSquad', type: 'choice' };
    const { wrapper } = mountPanel(controller);

    // The portrait inside the row is a natively draggable image.
    await wrapper.find('.combatant-item[data-combatant="Valkyrie"] img').trigger('dragstart', { dataTransfer: dataTransfer() });
    await wrapper.find('.squad-panel[data-squad="Secondary"]').trigger('drop');
    await flushPromises();
    expect(fills).toEqual([]);
  });
});
