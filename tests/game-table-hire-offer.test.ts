// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createAnimationEvents, ANIMATION_EVENTS_KEY } from 'boardsmith/ui';
import { createTestGame, tableShellContext } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel } from '../src/rules/elements.js';
import GameTable from '../src/ui/components/GameTable.vue';
import type { MercPortrait } from '../src/ui/composables/useActionState.js';
import { autoResolveArgs, getCurrentAction } from './helpers/auto-play.js';

/**
 * A rebel with Squirrel and Snake on offer, GameTable mounted on the given pick. A paid hire swaps the
 * team's MERC for Borris (who will not work with Squirrel) unless told otherwise; a rehire has no team.
 * Each sector given to the rebel's militia raises the team limit by one.
 */
async function mountOnOffer(action: 'hireMercFromOffer' | 'rehireMercFromOffer', { borrisOnTeam = true, militiaSectors = 0 } = {}) {
  const testGame = createTestGame(MERCGame, {
    playerCount: 2, playerNames: ['Rebel1', 'Dictator'], seed: 'hire-holds-the-turn',
    dictatorIsBot: false, dictatorChoice: 'castro',
    playerConfigs: [
      { color: '#e74c3c', isDictator: false, isBot: false },
      { color: '#95a5a6', isDictator: true, isBot: false },
    ],
  } as never);
  const { runner, game } = testGame;
  const playUntilOffered = (action: string) => {
    for (let moves = 0; !getCurrentAction(game.getFlowState())!.available.includes(action); moves++) {
      if (moves > 100) throw new Error(`${action} was not offered within 100 moves.`);
      const current = getCurrentAction(game.getFlowState())!;
      const order = current.available.includes('endTurn') ? ['endTurn', ...current.available] : current.available;
      order.some(name => {
        const args = autoResolveArgs(game, name, current.currentPlayer);
        return args !== null && runner.performAction(name, current.currentPlayer, args).success;
      });
    }
  };
  playUntilOffered('hireMerc');
  const rebel = game.rebelPlayers[0];
  if (action === 'rehireMercFromOffer') {
    // A wiped-out team is offered the free rehire from its next turn on.
    for (const m of rebel.team) m.putInto(game.mercDiscard);
    playUntilOffered('rehireMerc');
  }
  const drew = action === 'rehireMercFromOffer'
    ? runner.performAction('rehireMerc', rebel.seat, {})
    : runner.performAction('hireMerc', rebel.seat, autoResolveArgs(game, 'hireMerc', rebel.seat)!);
  expect(drew.success).toBe(true);
  game.discardMercOffer(rebel.mercOffer);
  if (action === 'hireMercFromOffer' && borrisOnTeam) {
    const [member] = rebel.team;
    const squad = rebel.getSquadContaining(member)!;
    member.putInto(game.mercDiscard);
    game.first(CombatantModel, m => m.combatantId === 'borris')!.putInto(squad);
  }
  const held = game.gameMap.getAllSectors().filter(sector => game.getTotalRebelUnitsInSector(sector) === 0 &&
    game.getDictatorUnitsInSector(sector) === sector.dictatorMilitia).slice(0, militiaSectors);
  for (const sector of held) {
    sector.removeDictatorMilitia(sector.dictatorMilitia);
    sector.addRebelMilitia(`${rebel.seat}`, 1);
  }
  game.first(CombatantModel, m => m.combatantId === 'squirrel')!.putInto(rebel.mercOffer);
  game.first(CombatantModel, m => m.combatantId === 'snake')!.putInto(rebel.mercOffer);

  const events = ref<{ id: number; type: string; data: Record<string, unknown> }[]>([]);
  const shell = await tableShellContext(testGame, rebel.seat, {
    provide: { [ANIMATION_EVENTS_KEY as symbol]: createAnimationEvents({ events: () => events.value as never }) },
  });
  const wrapper = mount(GameTable, {
    props: {
      gameView: testGame.getPlayerView(rebel.seat).state,
      playerSeat: rebel.seat,
      isMyTurn: true,
      availableActions: [action],
      actionController: shell.actionController,
      setBoardPrompt: () => {},
    },
    global: { provide: shell.provide },
    shallow: true,
  });
  await shell.actionController.start(action);
  await flushPromises();
  const hiringPhase = () => wrapper.findComponent({ name: 'HiringPhase' });
  const hirable = (name: string) => hiringPhase().props('hirableMercs').find((m: { attributes: { combatantName: string } }) => m.attributes.combatantName === name);
  return { shell, wrapper, hiringPhase, hirable, done: () => { wrapper.unmount(); shell.stop(); } };
}

describe('GameTable hiring from a rebel\'s offer (#80)', () => {
  it('does not show a MERC who will not work with the team as hireable', async () => {
    const { hiringPhase, done } = await mountOnOffer('hireMercFromOffer');
    const shown = hiringPhase().props('hirableMercs').map((m: { attributes: { combatantName: string } }) => m.attributes.combatantName);
    expect(shown).toEqual(['Snake']);
    done();
  });
});

const portraitNames = (portraits: MercPortrait[]) => portraits.map(p => p.combatantName);

describe('GameTable mid-game hire panel (#93)', () => {
  it('a MERC picked in the panel is the action bar\'s selection too', async () => {
    const { shell, hiringPhase, hirable, done } = await mountOnOffer('hireMercFromOffer');
    hiringPhase().vm.$emit('select-merc', hirable('Snake'));
    await flushPromises();
    expect(shell.actionController.isMultiSelectSelected('selectedMercs', 'Snake')).toBe(true);
    done();
  });

  it('a MERC picked in the action bar shows as picked in the panel', async () => {
    const { shell, hiringPhase, done } = await mountOnOffer('hireMercFromOffer');
    await shell.actionController.toggleMultiSelect('selectedMercs', 'Snake');
    await flushPromises();
    expect(hiringPhase().props('isMultiSelected')('Snake')).toBe(true);
    expect(hiringPhase().props('multiSelectCountDisplay')).toMatch(/^Selected: 1\//);
    expect(hiringPhase().props('isMultiSelectReady')).toBe(true);
    done();
  });

  it('the equipment step shows the MERC being hired', async () => {
    const { hiringPhase, hirable, done } = await mountOnOffer('hireMercFromOffer');
    hiringPhase().vm.$emit('select-merc', hirable('Snake'));
    await flushPromises();
    hiringPhase().vm.$emit('confirm-multi-select');
    await flushPromises();
    expect(hiringPhase().props('isSelectingEquipmentType')).toBe(true);
    expect(portraitNames(hiringPhase().props('selectedMercPortraits'))).toEqual(['Snake']);
    done();
  });

  it('the equipment step shows every MERC being hired', async () => {
    const { shell, hiringPhase, done } = await mountOnOffer('hireMercFromOffer', { borrisOnTeam: false, militiaSectors: 1 });
    await shell.actionController.toggleMultiSelect('selectedMercs', 'Squirrel');
    await shell.actionController.toggleMultiSelect('selectedMercs', 'Snake');
    await shell.actionController.confirmMultiSelect();
    await flushPromises();
    expect(hiringPhase().props('isSelectingEquipmentType')).toBe(true);
    expect(portraitNames(hiringPhase().props('selectedMercPortraits'))).toEqual(['Squirrel', 'Snake']);
    done();
  });

  it('the free rehire offers the MERCs as cards and shows the pick at the equipment step', async () => {
    const { hiringPhase, hirable, done } = await mountOnOffer('rehireMercFromOffer');
    expect(hiringPhase().exists()).toBe(true);
    hiringPhase().vm.$emit('select-merc', hirable('Squirrel'));
    await flushPromises();
    expect(hiringPhase().props('isSelectingEquipmentType')).toBe(true);
    expect(portraitNames(hiringPhase().props('selectedMercPortraits'))).toEqual(['Squirrel']);
    done();
  });
});
