// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import CombatantIconSmall from '../src/ui/components/CombatantIconSmall.vue';

describe('CombatantIconSmall size (#95)', () => {
  it('reads a number as pixels', () => {
    const icon = mount(CombatantIconSmall, { props: { size: 42 } }).element as HTMLElement;
    expect(icon.style.width).toBe('42px');
  });

  it('takes any CSS length as given, so a tile can size its portraits from its own CSS', () => {
    const icon = mount(CombatantIconSmall, { props: { size: 'var(--portrait-size)' } }).element as HTMLElement;
    expect(icon.style.height).toBe('var(--portrait-size)');
  });
});
