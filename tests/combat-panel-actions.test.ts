// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import CombatPanel from '../src/ui/components/CombatPanel.vue';

const allocating = {
  pendingHitAllocation: {
    attackerId: 'wolverine', attackerName: 'Wolverine', attackerCombatantId: 'wolverine',
    diceRolls: [4, 6], hits: 2, hitThreshold: 4,
    validTargets: [
      { id: 'merc', name: 'Apeiron', isMerc: true, currentHealth: 3, maxHealth: 3, armor: 0, declared: true },
      { id: 'm1', name: 'Militia', isMerc: false, currentHealth: 1, maxHealth: 1, armor: 0, declared: false },
    ],
    wolverineSixes: 1, canReroll: false, hasRerolled: false, rollCount: 1,
  },
};

function panel(combatSnapshot: Record<string, unknown>) {
  return mount(CombatPanel, {
    props: { combatSnapshot, isMyTurn: true, availableActions: ['combatContinue', 'combatRetreat'] },
  });
}

describe('CombatPanel continue and retreat buttons', () => {
  it('are offered when no decision is pending', () => {
    expect(panel({}).find('.combat-continue-btn').exists()).toBe(true);
  });

  it('are hidden while hits are being allocated (#91)', () => {
    expect(panel(allocating).find('.combat-continue-btn').exists()).toBe(false);
  });
});
