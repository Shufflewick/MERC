import { describe, it, expect } from 'vitest';
import { searchCopyForSeat } from 'boardsmith/bot';
import type { GameElement } from 'boardsmith';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Equipment, EquipmentDeck, TacticsCard } from '../src/rules/elements.js';
import { mercBot } from '../src/rules/bot.js';
import { castroGameAtDayTwo } from './helpers/day-two.js';

/**
 * The bot searches a copy of the game rebuilt from its own seat's view, where
 * every face-down card is a placeholder with no attributes. MERC's rules read
 * those cards (drawing a MERC, dealing equipment, flipping a tactics card), so
 * without a sampler every search step that touches a deck is thrown away and
 * the bot plays at random (#82).
 */

function sampledCopy(game: MERCGame, seat: number): MERCGame {
  let state = 1;
  const rng = () => (state = (state * 48271) % 2147483647) / 2147483647;
  return searchCopyForSeat(game, seat, 'i82', mercBot.determinize && { determinize: mercBot.determinize, rng });
}

function stillHidden(copy: MERCGame): string[] {
  const hidden: string[] = [];
  const walk = (element: GameElement) => {
    if (element.redactedAttributes.length > 0) {
      hidden.push(`${element.constructor.name} in ${element.parent?.name}: ${element.redactedAttributes.join(', ')}`);
    }
    for (const child of element._t.children) walk(child);
  };
  walk(copy);
  return hidden;
}

describe('bot search world (#82)', () => {
  for (const [label, dictatorSeat, seat] of [
    ['bot dictator', 2, 2],
    ['bot rebel facing a human dictator', 1, 2],
  ] as const) {
    it(`gives the ${label} a whole card for every face-down card`, () => {
      const copy = sampledCopy(castroGameAtDayTwo(dictatorSeat, seat).game, seat);

      expect(stillHidden(copy)).toEqual([]);
    });

    it(`deals the ${label} only cards it has not seen, each into its own deck`, () => {
      const game = castroGameAtDayTwo(dictatorSeat, seat).game;
      const copy = sampledCopy(game, seat);

      const ids = (cards: { combatantId: string }[]) => cards.map((c) => c.combatantId);
      const deckMercs = ids(copy.mercDeck.all(CombatantModel));
      const seenMercs = ids(copy.all(CombatantModel).filter((m) => m.parent !== copy.mercDeck));
      expect(deckMercs).toHaveLength(game.mercDeck.count(CombatantModel));
      expect(deckMercs.filter((id) => seenMercs.includes(id))).toEqual([]);

      for (const deck of copy.all(EquipmentDeck)) {
        expect(deck.all(Equipment).map((e) => e.equipmentType)).toEqual(deck.all(Equipment).map(() => deck.equipmentType));
      }

      const tacticsLeft = copy.dictatorPlayer.tacticsDeck!.all(TacticsCard);
      expect(tacticsLeft).toHaveLength(game.dictatorPlayer.tacticsDeck!.count(TacticsCard));
      expect(tacticsLeft.every((card) => typeof card.tacticsName === 'string')).toBe(true);
    });
  }
});
