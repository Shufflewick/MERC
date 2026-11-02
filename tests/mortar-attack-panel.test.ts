// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MortarAttackPanel, { type MortarAttackData } from '../src/ui/components/MortarAttackPanel.vue';
import CombatPanelCombatant from '../src/ui/components/CombatPanelCombatant.vue';

const twoHits: MortarAttackData = {
  attackerName: 'Moe', attackerCombatantId: 'moe', targetSectorId: 's1', targetSectorName: 'Town',
  diceRolls: [5, 6], hits: 2, hitThreshold: 4,
  validTargets: [
    { id: 'ap', name: 'Apeiron', type: 'merc', currentHealth: 3, maxHealth: 3 },
    { id: 'm1', name: 'Militia', type: 'militia', currentHealth: 1, maxHealth: 1 },
  ],
};

// The 3D dice need WebGL, which jsdom lacks.
const noDice = { DiceRollDisplay: true };

describe('MortarAttackPanel', () => {
  it('submits a target once per hit it takes (#122)', async () => {
    const wrapper = mount(MortarAttackPanel, { props: { mortarData: twoHits, isMyTurn: true }, global: { stubs: noDice } });
    const apeiron = wrapper.findAllComponents(CombatPanelCombatant)[0];

    apeiron.vm.$emit('click');
    apeiron.vm.$emit('click');
    await wrapper.vm.$nextTick();
    await wrapper.get('.confirm-button').trigger('click');

    expect(wrapper.emitted('confirm-allocation')).toEqual([[['ap', 'ap']]]);
  });
});
