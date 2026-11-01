// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { sectorPortraitSlot } from '../src/ui/portrait-slot.js';

// jsdom has no layout, so the tile's rendered boxes and portrait size are declared.
function tile(portraitSize: string, mercRow: { left: number; bottom: number }) {
  document.body.innerHTML = `
    <div data-sector-id="s1"><div class="tile-face"><div class="tile-body" style="--portrait-size: ${portraitSize}">
      <div class="bottom-row"><div class="mercs-area"></div></div>
    </div></div></div>`;
  const rect = (r: Partial<DOMRect>) => () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, toJSON: () => r, ...r }) as DOMRect;
  document.querySelector<HTMLElement>('[data-sector-id="s1"]')!.getBoundingClientRect = rect({ left: 100, bottom: 300 });
  document.querySelector<HTMLElement>('.mercs-area')!.getBoundingClientRect = rect(mercRow);
}

describe('sectorPortraitSlot (#95)', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('is the first portrait of a compact tile: its centre in the MERC row and the size the tile draws it', () => {
    tile('22px', { left: 108, bottom: 295 });
    expect(sectorPortraitSlot('s1')).toEqual({ x: 119, y: 284, size: 22 });
  });

  it('is nothing for a sector that is not on the map', () => {
    tile('42px', { left: 113, bottom: 289 });
    expect(sectorPortraitSlot('elsewhere')).toBeNull();
  });
});
