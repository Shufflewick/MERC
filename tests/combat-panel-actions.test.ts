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

function panel(combatSnapshot: Record<string, unknown>, availableActions = ['combatContinue', 'combatRetreat']) {
  return mount(CombatPanel, {
    props: { combatSnapshot, isMyTurn: true, availableActions },
    // The 3D dice need WebGL, which jsdom lacks.
    global: { stubs: { HitAllocationPanel: true } },
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

function button(wrapper: ReturnType<typeof panel>, text: string) {
  const match = wrapper.findAll('button').find(b => b.text() === text);
  if (!match) throw new Error(`No "${text}" button. Buttons: ${wrapper.findAll('button').map(b => b.text()).join(', ')}`);
  return match;
}

const golemActions = ['golemPreCombatAttack', 'golemSkipPreCombat'];
const epinephrineActions = ['combatUseEpinephrine', 'combatDeclineEpinephrine'];

const golemStrike = {
  pendingGolemAttack: {
    golemId: 'golem', golemName: 'Golem',
    validTargets: [
      { id: 'm1', name: 'Militia', isMerc: false, currentHealth: 1, maxHealth: 1 },
      { id: 'lucid', name: 'Lucid', isMerc: true, currentHealth: 2, maxHealth: 3 },
    ],
  },
};

describe('CombatPanel during Golem\'s pre-combat strike (#105)', () => {
  it('offers each target and strikes the one picked', async () => {
    const wrapper = panel(golemStrike, golemActions);
    expect(wrapper.text()).toContain('Golem may strike before combat begins');

    await button(wrapper, 'Lucid').trigger('click');

    expect(wrapper.emitted('golem-strike')).toEqual([['Lucid::lucid']]);
  });

  it('lets Golem hold fire', async () => {
    const wrapper = panel(golemStrike, golemActions);
    await button(wrapper, 'Hold fire').trigger('click');
    expect(wrapper.emitted('golem-hold')).toEqual([[]]);
  });
});

const dying = {
  pendingEpinephrine: {
    dyingCombatantId: 7, dyingCombatantName: 'Basic', dyingCombatantSide: 'rebel',
    availableSavers: [{ combatantId: 9, combatantName: 'Lucid' }, { combatantId: 7, combatantName: 'Basic' }],
  },
};

describe('CombatPanel during an Epinephrine Shot decision (#105)', () => {
  it('saves the dying MERC with the chosen MERC\'s shot', async () => {
    const wrapper = panel(dying, epinephrineActions);
    expect(wrapper.text()).toContain('Basic is dying');

    await button(wrapper, "Use Lucid's shot").trigger('click');

    expect(wrapper.emitted('use-epinephrine')).toEqual([[9]]);
  });

  it('lets the dying MERC die', async () => {
    const wrapper = panel(dying, epinephrineActions);
    await button(wrapper, 'Let Basic die').trigger('click');
    expect(wrapper.emitted('decline-epinephrine')).toEqual([[]]);
  });
});

describe('CombatPanel after a Golem or Epinephrine choice is made (#105 review F1, F2)', () => {
  // The snapshot still carries the decision until the next one is sent; the actions say it is over.
  it.each([['Golem strike', golemStrike], ['Epinephrine', dying]])('offers Continue, not the stale %s choice', (_, snapshot) => {
    const wrapper = panel(snapshot);
    expect(wrapper.find('.choice-panel').exists()).toBe(false);
    expect(wrapper.find('.combat-continue-btn').exists()).toBe(true);
  });
});
