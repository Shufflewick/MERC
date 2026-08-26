import { describe, it, expect } from 'vitest';
import { GameRunner } from 'boardsmith/runtime';
import { gameDefinition } from '../src/rules/index';

/**
 * Regression test for audit F32 (BoardSmith secure-by-default deck/hand visibility).
 *
 * BoardSmith flipped Hand contents to owner-only and Deck contents to hidden in
 * per-player snapshots. MERC's TacticsHand must therefore be OWNED by the
 * dictator so the dictator's own snapshot still exposes the hand's card
 * identities (DictatorPanel needs tacticsId/tacticsName/etc.), while the rebel's
 * snapshot only ever sees the count — never the dictator's secret cards.
 */
function findAll(node: any, className: string, out: any[] = []): any[] {
  if (!node) return out;
  const cn = (node.className || '').replace(/^_/, '');
  if (cn === className) out.push(node);
  for (const c of node.children || []) findAll(c, className, out);
  return out;
}

function realAttrKeys(node: any): string[] {
  const attrs = node?.attributes || {};
  return Object.keys(attrs).filter((k) => !k.startsWith('$') && k !== '__hidden');
}

describe('Audit F32: tactics hand / deck per-player snapshot visibility', () => {
  it('dictator sees own tactics hand cards; rebel sees only the count', () => {
    const runner = new GameRunner({
      GameClass: gameDefinition.gameClass,
      gameType: gameDefinition.gameType,
      gameOptions: {
        playerCount: 2,
        seed: '12345',
        exclusiveSeats: { role: 1 },
        playerOptions: [{ role: 'dictator' }, {}],
        playerIsBot: [false, false],
        dictatorCharacter: 'random',
      },
    });
    runner.start();

    const game = (runner as any).game;
    const dictator = game.dictatorPlayer;
    // Hand must be owned by the dictator for owner-only visibility to work.
    expect(dictator.tacticsHand.player?.seat).toBe(dictator.seat);

    // Deal a few tactics cards into the dictator's hand.
    const drawn = dictator.tacticsDeck.drawTo(dictator.tacticsHand, 3);
    expect(drawn.length).toBe(3);

    const views = runner.getAllPlayerViews() as any[];
    const dictatorView = views.find((v) => v.player === dictator.seat)!.state;
    const rebelView = views.find((v) => v.player !== dictator.seat)!.state;

    // Dictator: full card identities present (full visibility keeps real children).
    const dHand = findAll(dictatorView, 'TacticsHand')[0];
    expect(dHand.children.length).toBe(3);
    expect(realAttrKeys(dHand.children[0])).toEqual(
      expect.arrayContaining(['tacticsId', 'tacticsName'])
    );

    // Rebel: count preserved (placeholder per card), but no card identities leak.
    const rHand = findAll(rebelView, 'TacticsHand')[0];
    expect(rHand.children.length).toBe(3);
    for (const child of rHand.children) {
      expect(child.attributes?.__hidden).toBe(true);
      expect(realAttrKeys(child)).toEqual([]);
    }
  });

  it('draw decks stay hidden but expose their count to both players', () => {
    const runner = new GameRunner({
      GameClass: gameDefinition.gameClass,
      gameType: gameDefinition.gameType,
      gameOptions: {
        playerCount: 2,
        seed: '12345',
        exclusiveSeats: { role: 1 },
        playerOptions: [{ role: 'dictator' }, {}],
        playerIsBot: [false, false],
        dictatorCharacter: 'random',
      },
    });
    runner.start();
    const game = (runner as any).game;
    const dictatorSeat = game.dictatorPlayer.seat;

    const views = runner.getAllPlayerViews() as any[];
    for (const cls of ['TacticsDeck', 'MercDeck', 'EquipmentDeck']) {
      for (const view of views) {
        const isDictator = view.player === dictatorSeat;
        const nodes = findAll(view.state, cls);
        expect(nodes.length).toBeGreaterThan(0);
        for (const n of nodes) {
          // Count is always available (needed e.g. by useVictoryCalculations).
          expect(n.childCount).toBeGreaterThan(0);
          // ...but identities are never exposed, to either player.
          for (const child of n.children || []) {
            expect(child.attributes?.__hidden).toBe(true);
            expect(realAttrKeys(child)).toEqual([]);
          }
        }
        void isDictator;
      }
    }
  });
});
