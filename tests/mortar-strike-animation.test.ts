// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import MortarStrikeAnimation from '../src/ui/components/MortarStrikeAnimation.vue';

// jsdom has no layout, so the map's rendered boxes and portrait size are declared. The killed target has no token: the state moved on before the strike plays.
function mapWithEmptyTile() {
  document.body.innerHTML = `
    <div class="map-grid"><div data-sector-id="s1"><div class="tile-body" style="--portrait-size: 22px">
      <div class="mercs-area"></div>
    </div></div></div>`;
  const rect = (r: Partial<DOMRect>) => () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => r, ...r }) as DOMRect;
  document.querySelector<HTMLElement>('.map-grid')!.getBoundingClientRect = rect({ left: 10, top: 20 });
  document.querySelector<HTMLElement>('.mercs-area')!.getBoundingClientRect = rect({ left: 108, bottom: 295 });
}

describe('MortarStrikeAnimation (#99)', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('flashes a target the mortar killed on the tile portrait slot its death animation leaves from', async () => {
    mapWithEmptyTile();
    const wrapper = mount(MortarStrikeAnimation, {
      props: { sectorRect: { x: 0, y: 0, width: 100, height: 100 }, sectorId: 's1', hitCombatantIds: ['walter'], killedCombatantIds: ['walter'], militiaKilled: 0 },
      attachTo: document.querySelector('.map-grid')!,
    });
    await flushPromises();

    const flash = document.querySelector<HTMLElement>('.mortar-flash');
    expect(flash?.style.display).not.toBe('none');
    // Slot centre (119, 284) in the viewport, less the grid's corner (10, 20).
    expect({ left: flash?.style.left, top: flash?.style.top }).toEqual({ left: '109px', top: '264px' });
    expect(wrapper.emitted('complete')).toBeUndefined();
    wrapper.unmount();
  });
});
