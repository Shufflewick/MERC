// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createAnimationEvents, ANIMATION_EVENTS_KEY } from 'boardsmith/ui';
import MapGrid from '../src/ui/components/MapGrid.vue';

// jsdom has no layout or ResizeObserver, so the width the map is given is declared and the resize is reported by hand.
const observed: { callback: ResizeObserverCallback; target?: Element }[] = [];
globalThis.ResizeObserver = class {
  constructor(private callback: ResizeObserverCallback) {}
  observe(target: Element) { observed.push({ callback: this.callback, target }); }
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const sectors = [0, 1, 2].flatMap(row => [0, 1, 2].map(col => ({
  sectorId: `s${row}${col}`, sectorName: `S${row}${col}`, sectorType: 'Wilderness', value: 1, row, col,
  explored: false, weaponLoot: 0, armorLoot: 0, accessoryLoot: 0, dictatorMilitia: 0,
})));

async function mapGivenWidth(width: number, extraProps: Record<string, unknown> = {}) {
  const events = ref<{ id: number; type: string; data: Record<string, unknown> }[]>([]);
  const wrapper = mount(MapGrid, {
    props: { sectors, mercs: [], players: [], controlMap: {}, ...extraProps },
    global: { provide: { [ANIMATION_EVENTS_KEY as symbol]: createAnimationEvents({ events: () => events.value as never }) } },
    shallow: true,
    attachTo: document.body,
  });
  await flushPromises();
  const box = wrapper.find('.map-scroll').element as HTMLElement;
  Object.defineProperty(box, 'clientWidth', { value: width });
  for (const o of observed.filter(o => o.target === box)) o.callback([], {} as ResizeObserver);
  return { wrapper, box };
}

describe('MapGrid on a narrow screen (#84)', () => {
  let unmount = () => {};
  afterEach(() => { unmount(); observed.length = 0; });

  it('pans sideways when three 240px tiles do not fit', async () => {
    const { wrapper, box } = await mapGivenWidth(335);
    unmount = () => wrapper.unmount();
    await flushPromises();
    expect(getComputedStyle(box).overflowX).toBe('auto');
  });

  it('does not clip anything when the tiles just fit, so overlays can draw past the map', async () => {
    // Three 240px tiles and two 8px gaps.
    const { wrapper, box } = await mapGivenWidth(736);
    unmount = () => wrapper.unmount();
    await flushPromises();
    expect(getComputedStyle(box).overflowX).toBe('visible');
  });

  it('plays no mortar strike on a sector that is not on the map', async () => {
    const { wrapper } = await mapGivenWidth(736, { mortarStrike: { targetSectorId: 'not-on-map', hitCombatantIds: [], militiaKilled: 0 } });
    unmount = () => wrapper.unmount();
    expect(wrapper.findComponent({ name: 'MortarStrikeAnimation' }).exists()).toBe(false);
  });
});
