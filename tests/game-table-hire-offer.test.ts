// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createAnimationEvents, ANIMATION_EVENTS_KEY } from 'boardsmith/ui';
import { createTestGame, tableShellContext } from 'boardsmith/testing';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel } from '../src/rules/elements.js';
import GameTable from '../src/ui/components/GameTable.vue';
import { autoResolveArgs, getCurrentAction } from './helpers/auto-play.js';

describe('GameTable hiring from a rebel\'s offer (#80)', () => {
  it('does not show a MERC who will not work with the team as hireable', async () => {
    const testGame = createTestGame(MERCGame, {
      playerCount: 2, playerNames: ['Rebel1', 'Dictator'], seed: 'hire-holds-the-turn',
      dictatorIsBot: false, dictatorChoice: 'castro',
      playerConfigs: [
        { color: '#e74c3c', isDictator: false, isBot: false },
        { color: '#95a5a6', isDictator: true, isBot: false },
      ],
    } as never);
    const { runner, game } = testGame;
    for (let moves = 0; !getCurrentAction(game.getFlowState())!.available.includes('hireMerc'); moves++) {
      if (moves > 100) throw new Error('hireMerc was not offered within 100 moves.');
      const current = getCurrentAction(game.getFlowState())!;
      const order = current.available.includes('endTurn') ? ['endTurn', ...current.available] : current.available;
      order.some(name => {
        const args = autoResolveArgs(game, name, current.currentPlayer);
        return args !== null && runner.performAction(name, current.currentPlayer, args).success;
      });
    }
    const rebel = game.rebelPlayers[0];
    runner.performAction('hireMerc', rebel.seat, autoResolveArgs(game, 'hireMerc', rebel.seat)!);
    game.discardMercOffer(rebel.mercOffer);
    const [member] = rebel.team;
    const squad = rebel.getSquadContaining(member)!;
    member.putInto(game.mercDiscard);
    game.first(CombatantModel, m => m.combatantId === 'borris')!.putInto(squad);
    game.first(CombatantModel, m => m.combatantId === 'squirrel')!.putInto(rebel.mercOffer);
    game.first(CombatantModel, m => m.combatantId === 'snake')!.putInto(rebel.mercOffer);

    const events = ref<{ id: number; type: string; data: Record<string, unknown> }[]>([]);
    const shell = await tableShellContext(testGame, rebel.seat, {
      provide: { [ANIMATION_EVENTS_KEY as symbol]: createAnimationEvents({ events: () => events.value as never }) },
    });
    const wrapper = mount(GameTable, {
      props: {
        gameView: testGame.getPlayerView(rebel.seat),
        playerSeat: rebel.seat,
        isMyTurn: true,
        availableActions: ['hireMercFromOffer'],
        actionController: shell.actionController,
        setBoardPrompt: () => {},
      },
      global: { provide: shell.provide },
      shallow: true,
    });
    await shell.actionController.start('hireMercFromOffer');
    await flushPromises();

    const shown = wrapper.findComponent({ name: 'HiringPhase' }).props('hirableMercs').map((m: { combatantName: string }) => m.combatantName);
    expect(shown).toEqual(['Snake']);
    wrapper.unmount();
    shell.stop();
  });
});
