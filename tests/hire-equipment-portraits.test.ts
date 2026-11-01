// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createAnimationEvents, ANIMATION_EVENTS_KEY } from 'boardsmith/ui';
import { createTestGame, tableShellContext, type TestGame } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import GameTable from '../src/ui/components/GameTable.vue';
import DictatorPanel from '../src/ui/components/DictatorPanel.vue';
import HiringPhase from '../src/ui/components/HiringPhase.vue';
import type { MercPortrait } from '../src/ui/composables/useActionState.js';
import { autoResolveArgs, getCurrentAction } from './helpers/auto-play.js';

/** A 2-player game with a human dictator, played until the dictator is offered `action`. */
function playUntilDictatorOffered(dictatorChoice: string, action: string): TestGame<MERCGame> {
  const testGame = createTestGame(MERCGame, {
    playerCount: 2, playerNames: ['Rebel1', 'Dictator'], seed: `portraits-${dictatorChoice}`,
    dictatorIsBot: false, dictatorChoice,
    playerConfigs: [
      { color: '#e74c3c', isDictator: false, isBot: false },
      { color: '#95a5a6', isDictator: true, isBot: false },
    ],
  } as never);
  const { runner, game } = testGame;
  for (let next = getCurrentAction(game.getFlowState()); !next!.available.includes(action); next = getCurrentAction(game.getFlowState())) {
    const name = next!.available[0];
    expect(runner.performAction(name, next!.currentPlayer, autoResolveArgs(game, name, next!.currentPlayer)!).success).toBe(true);
  }
  return testGame;
}

async function shellFor(testGame: TestGame<MERCGame>, seat: number) {
  const events = ref<{ id: number; type: string; data: Record<string, unknown> }[]>([]);
  return tableShellContext(testGame, seat, {
    provide: { [ANIMATION_EVENTS_KEY as symbol]: createAnimationEvents({ events: () => events.value as never }) },
  });
}

const portrait = (name: string): MercPortrait => ({ combatantId: name.toLowerCase(), combatantName: name, image: `/mercs/${name.toLowerCase()}.jpg` });

describe('Who the equipment step shows (#93)', () => {
  it('a human dictator\'s first hire shows the MERC he drew', async () => {
    const testGame = playUntilDictatorOffered('castro', 'dictatorHireFirstMerc');
    const seat = testGame.game.dictatorPlayer.seat;
    const shell = await shellFor(testGame, seat);
    const wrapper = mount(GameTable, {
      props: {
        gameView: testGame.getPlayerView(seat).state,
        playerSeat: seat,
        isMyTurn: true,
        availableActions: ['dictatorHireFirstMerc'],
        actionController: shell.actionController,
        setBoardPrompt: () => {},
      },
      global: { provide: shell.provide },
      shallow: true,
    });
    await shell.actionController.start('dictatorHireFirstMerc');
    const [drawn] = shell.actionController.getChoices(shell.actionController.currentPick.value!);
    await shell.actionController.fill('merc', drawn.value);
    await flushPromises();
    expect(shell.actionController.currentPick.value?.name).toBe('equipmentType');
    const hiringPhase = wrapper.findComponent({ name: 'HiringPhase' });
    expect(hiringPhase.props('selectedMercPortraits').map((p: MercPortrait) => p.combatantName)).toEqual([drawn.display]);
    wrapper.unmount();
    shell.stop();
  });

  it('Kim choosing his starting equipment sees himself', async () => {
    const testGame = playUntilDictatorOffered('kim', 'chooseKimBase');
    const { game } = testGame;
    const seat = game.dictatorPlayer.seat;
    const kim = game.dictatorPlayer.dictator!;
    const shell = await shellFor(testGame, seat);
    const wrapper = mount(DictatorPanel, {
      props: {
        dictator: { combatantId: kim.combatantId, combatantName: kim.combatantName, image: kim.image, ability: '' },
        tacticsHand: [],
        availableActions: ['chooseKimBase'],
        actionController: shell.actionController,
        isMyTurn: true,
      },
      global: { provide: shell.provide },
      shallow: true,
    });
    await shell.actionController.start('chooseKimBase');
    const base = shell.actionController.currentPick.value!;
    await shell.actionController.fill(base.name, shell.actionController.getChoices(base)[0].value);
    await flushPromises();
    expect(shell.actionController.currentPick.value?.name).toBe('dictatorEquipment');
    const drawEquipment = wrapper.findComponent({ name: 'DrawEquipmentType' });
    expect(drawEquipment.props('combatants').map((p: MercPortrait) => p.combatantName)).toEqual([kim.combatantName]);
    wrapper.unmount();
    shell.stop();
  });

  it('clicking a portrait at the equipment step opens that MERC\'s detail', async () => {
    const wrapper = mount(HiringPhase, {
      props: {
        isHiringMercs: true, isSelectingDictator: false, isSelectingEquipmentType: true, isCastroHiring: false, isSelectingSector: false,
        hirableMercs: [], hasSkipOption: false,
        equipmentTypeChoices: [{ value: 'Weapon', label: 'Weapon' }],
        sectorChoices: [],
        selectedMercPortraits: [portrait('Squirrel'), portrait('Snake')],
        hiringMercDetail: null,
        prompt: 'Choose equipment type for new hire', playerColor: 'red',
      },
      global: { stubs: { GameOverlay: true } },
    });
    const snake = wrapper.findAll('.draw-equipment-type .clickable').find(icon => icon.text().includes('Snake'));
    await snake!.trigger('click');
    expect(wrapper.emitted('open-detail-modal')).toEqual([[1]]);
    wrapper.unmount();
  });

  it('clicking a portrait at the sector step opens that MERC\'s detail', async () => {
    const wrapper = mount(HiringPhase, {
      props: {
        isHiringMercs: true, isSelectingDictator: false, isSelectingEquipmentType: false, isCastroHiring: true, isSelectingSector: true,
        hirableMercs: [], hasSkipOption: false,
        equipmentTypeChoices: [],
        sectorChoices: [{
          value: 'Coffee Industry', label: 'Coffee Industry', sectorName: 'Coffee Industry', sectorType: 'Industry', image: '',
          value_points: 4, weaponLoot: 0, armorLoot: 0, accessoryLoot: 0, dictatorMilitia: 1, explored: false,
        }],
        selectedMercPortraits: [portrait('Squirrel')],
        hiringMercDetail: null,
        prompt: 'Choose a sector', playerColor: 'red',
      },
      global: { stubs: { GameOverlay: true, SectorCardChoice: true } },
    });
    await wrapper.find('.sector-row .combatant-icon-small').trigger('click');
    expect(wrapper.emitted('open-detail-modal')).toEqual([[0]]);
    wrapper.unmount();
  });
});
