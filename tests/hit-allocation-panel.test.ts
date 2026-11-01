// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import HitAllocationPanel, { type PendingHitAllocation } from '../src/ui/components/HitAllocationPanel.vue';

// Wolverine rolled a 4 and a 6, declared the MERC, and can put the 6 on the undeclared militia.
const wolverineRoll: PendingHitAllocation = {
  attackerId: 'wolverine', attackerName: 'Wolverine', attackerCombatantId: 'wolverine',
  diceRolls: [4, 6], hits: 2, hitThreshold: 4,
  validTargets: [
    { id: 'merc', name: 'Apeiron', isMerc: true, currentHealth: 3, maxHealth: 3, armor: 0, declared: true },
    { id: 'm1', name: 'Militia', isMerc: false, currentHealth: 1, maxHealth: 1, armor: 0, declared: false },
  ],
  wolverineSixes: 1, canReroll: false, hasRerolled: false, rollCount: 1,
};

describe('HitAllocationPanel with Wolverine\'s undeclared targets', () => {
  it('puts only a 6 on an enemy he did not declare (#91)', async () => {
    const wrapper = mount(HitAllocationPanel, { props: { pendingAllocation: wolverineRoll, isMyTurn: true } });
    const panel = wrapper.vm as unknown as { addHitToTarget: (id: string) => void };

    // The 4 is selected first, but the militia can only take the 6.
    panel.addHitToTarget('m1');
    panel.addHitToTarget('m1');
    panel.addHitToTarget('merc');
    await wrapper.vm.$nextTick();
    await wrapper.get('.confirm-button').trigger('click');

    expect(wrapper.emitted('confirm-allocation')).toEqual([[['m1::0', 'merc::0']]]);
    expect(wrapper.text()).toContain("Wolverine's 6s may also hit enemies he did not target");
  });

  it('asks only for the hits the targets can take, so a wasted hit can be left unplaced (#91)', async () => {
    // 3 hits, one a 6: the declared militia takes one die, the 6 can go on Apeiron, the third hit is wasted.
    const wasteful: PendingHitAllocation = {
      ...wolverineRoll,
      diceRolls: [5, 4, 6], hits: 3,
      validTargets: [
        { id: 'm0', name: 'Militia', isMerc: false, currentHealth: 1, maxHealth: 1, armor: 0, declared: true },
        { id: 'ap', name: 'Apeiron', isMerc: true, currentHealth: 3, maxHealth: 3, armor: 0, declared: false },
      ],
    };
    const wrapper = mount(HitAllocationPanel, { props: { pendingAllocation: wasteful, isMyTurn: true } });
    const panel = wrapper.vm as unknown as { addHitToTarget: (id: string) => void };

    panel.addHitToTarget('m0');
    panel.addHitToTarget('m0');
    panel.addHitToTarget('ap');
    await wrapper.vm.$nextTick();
    await wrapper.get('.confirm-button').trigger('click');

    expect(wrapper.emitted('confirm-allocation')).toEqual([[['m0::0', 'ap::0']]]);
  });
});
