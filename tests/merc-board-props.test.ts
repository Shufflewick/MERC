// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import type { UseActionControllerReturn } from 'boardsmith/ui';
import MercBoard from '../src/ui/MercBoard.vue';
import { boardProps } from './helpers/board-props';

const controller = {
  onBeforeAutoExecute: () => () => {},
  onAfterAutoExecute: () => () => {},
} as unknown as UseActionControllerReturn;

describe('MercBoard as GameShell mounts it', () => {
  afterEach(() => vi.restoreAllMocks());

  it('accepts every board prop GameShell passes without a Vue warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(MercBoard, { props: boardProps(controller), global: { stubs: { GameTable: true } } });
    const attrWarnings = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('Extraneous non-props attributes'));
    expect(attrWarnings).toEqual([]);
  });
});
