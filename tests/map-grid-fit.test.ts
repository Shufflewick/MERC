// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createAnimationEvents, ANIMATION_EVENTS_KEY } from 'boardsmith/ui';
import MapGrid from '../src/ui/components/MapGrid.vue';

const sectors = [0, 1, 2].flatMap(row => [0, 1, 2].map(col => ({
  sectorId: `s${row}${col}`, sectorName: `S${row}${col}`, sectorType: 'Wilderness', value: 1, row, col,
  explored: false, weaponLoot: 0, armorLoot: 0, accessoryLoot: 0, dictatorMilitia: 0,
})));

async function mountMap(extraProps: Record<string, unknown> = {}) {
  const events = ref<{ id: number; type: string; data: Record<string, unknown> }[]>([]);
  const wrapper = mount(MapGrid, {
    props: { sectors, mercs: [], players: [], controlMap: {}, ...extraProps },
    global: { provide: { [ANIMATION_EVENTS_KEY as symbol]: createAnimationEvents({ events: () => events.value as never }) } },
    shallow: true,
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

describe('MapGrid fits any width (#95)', () => {
  let unmount = () => {};
  afterEach(() => unmount());

  it('shares the width equally between columns with no minimum, so a phone shows the whole map', async () => {
    const wrapper = await mountMap();
    unmount = () => wrapper.unmount();
    const grid = wrapper.find('.map-grid').element as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
  });

  it('has no scroll box around the map, so overlays can draw past its edges', async () => {
    const wrapper = await mountMap();
    unmount = () => wrapper.unmount();
    expect(wrapper.element.classList.contains('map-grid')).toBe(true);
  });

  it('plays no mortar strike on a sector that is not on the map', async () => {
    const wrapper = await mountMap({ mortarStrike: { targetSectorId: 'not-on-map', hitCombatantIds: [], militiaKilled: 0 } });
    unmount = () => wrapper.unmount();
    expect(wrapper.findComponent({ name: 'MortarStrikeAnimation' }).exists()).toBe(false);
  });
});
