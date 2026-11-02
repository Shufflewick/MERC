/**
 * MCTS hooks for MERC.
 *
 * Vanilla MCTS has no evaluation gradient on a board this size: playouts wander
 * and the Bot seats the presets advertise play far below what the framework can
 * deliver. These hooks give the search something to climb — objectives that
 * score the position, and a playout policy that keeps random rollouts doing
 * something a MERC player would recognise.
 */

import type { BotStrategy, BotMove, DeterminizeSampler, Objective } from 'boardsmith/bot';
import { followUpForSeat, type Game, type GameElement } from 'boardsmith';
import { MERCGame, type MERCPlayer } from './game.js';
import { CombatantModel, Equipment, EquipmentDeck, TacticsCard } from './elements.js';
import { tacticsCardAttributes } from './setup.js';
import { capitalize } from './actions/helpers.js';

/** The seat the bot is playing, or null when the game isn't a MERC game. */
function seatPlayer(game: Game, playerIndex: number): { game: MERCGame; player: MERCPlayer } | null {
  const merc = game as MERCGame;
  if (!merc.gameMap) return null;
  const player = merc.getPlayer(playerIndex) as MERCPlayer | undefined;
  if (!player) return null;
  return { game: merc, player };
}

/** Total sector value on the map, used to normalise control scores to 0..1. */
function totalSectorValue(game: MERCGame): number {
  return game.gameMap.getAllSectors().reduce((sum, s) => sum + s.value, 0) || 1;
}

/**
 * Share of the map's sector value this side holds. This is what the game is
 * actually scored on when the tactics deck runs out, so it is the backbone of
 * the evaluation for both sides.
 */
function sectorValueShare(game: MERCGame, player: MERCPlayer): number {
  const { rebelPoints, dictatorPoints } = game.calculateVictoryPoints();
  const points = player.isDictator() ? dictatorPoints : rebelPoints;
  return points / totalSectorValue(game);
}

/**
 * How far through the Dictator's tactics deck the game is, 0..1. The deck plus
 * discard is the whole supply, so what has been played is the progress.
 */
function gameProgress(game: MERCGame): number {
  const dictator = game.dictatorPlayer;
  const left = (dictator?.tacticsDeck?.count(TacticsCard) ?? 0) +
    (dictator?.tacticsHand?.count(TacticsCard) ?? 0);
  const played = dictator?.tacticsDiscard?.count(TacticsCard) ?? 0;
  const total = left + played;
  if (total === 0) return 1;
  return Math.min(1, Math.max(0, played / total));
}

/** Fighting strength of a side, normalised against a generous ceiling. */
function forceStrength(game: MERCGame, player: MERCPlayer): number {
  const mercs = player.team.length;
  const militia = game.gameMap.getAllSectors().reduce(
    (sum, s) => sum + (player.isDictator() ? s.dictatorMilitia : s.getRebelMilitia(`${player.seat}`)),
    0
  );
  const FORCE_CEILING = 40;
  return Math.min(1, (mercs * 3 + militia) / FORCE_CEILING);
}

/** 1 when the Dictator is untouched, 0 when he is dead. */
function dictatorHealthShare(game: MERCGame): number {
  const dictator = game.dictatorPlayer?.dictator;
  if (!dictator || !dictator.inPlay) return 1;
  return Math.max(0, dictator.health) / Math.max(1, dictator.maxHealth);
}

function objective(weight: number, checker: (game: MERCGame, player: MERCPlayer) => number): Objective {
  return {
    weight,
    checker: (game: Game, playerIndex: number) => {
      const seat = seatPlayer(game, playerIndex);
      if (!seat) return 0;
      return Math.min(1, Math.max(0, checker(seat.game, seat.player)));
    },
  };
}

/**
 * Actions worth more than a coin flip during a rollout. Anything not listed
 * still gets played, just less often, so the policy biases without blinding
 * the search.
 */
const PLAYOUT_WEIGHTS: Record<string, number> = {
  move: 4,
  vehicleMove: 4,
  hireMerc: 3,
  rehireMerc: 5,
  explore: 3,
  reEquip: 2,
  train: 2,
  reinforce: 3,
  playTacticsCard: 4,
  combatContinue: 3,
  combatSelectTarget: 3,
  combatAllocateHits: 3,
  endTurn: 1,
};

const DEFAULT_PLAYOUT_WEIGHT = 2;

/**
 * Whether the search may play this move. Free moves the search could repeat
 * forever keep the turn whenever ending it looks bad (#90), so it leaves out
 * viewing a stash, which changes nothing, and every squad reassignment but
 * breaking a MERC off into a new squad with others left behind: without the
 * merges and lone-squad relabels that could undo it, a split can only happen
 * until all squads are in use. It also leaves out stash picks after an explore
 * that swap out equipment, which the next pick could swap back (#103).
 */
function searchable(game: MERCGame, seat: number, move: BotMove): boolean {
  if (move.action === 'collectEquipment') {
    if (move.args.equipment === undefined) return true;
    const { combatantId } = followUpForSeat(game.getFlowState(), seat)!.args as { combatantId: number };
    const unit = game.getElementById(combatantId) as CombatantModel;
    return unit.canEquip(game.getElementById(move.args.equipment as number) as Equipment);
  }
  if (move.action !== 'assignToSquad') return move.action !== 'viewStash';
  const { combatantName, targetSquad } = move.args as { combatantName: string; targetSquad: string };
  if (!targetSquad.startsWith('Create')) return false;
  const source = (game.getPlayer(seat) as MERCPlayer).squads.find((squad) =>
    squad.all(CombatantModel).some((c) => capitalize(c.combatantName) === combatantName));
  return source !== undefined && source.all(CombatantModel).length > 1;
}

/**
 * Give each face-down card the attributes of a card drawn at random from
 * `pool`, the cards of its kind the seat has not seen.
 */
function deal(cards: GameElement[], pool: Record<string, unknown>[], rng: () => number, seat: number, kind: string): void {
  if (pool.length < cards.length) {
    throw new Error(
      `Cannot suppose a world for seat ${seat}: it holds ${cards.length} face-down ${kind} cards but only ` +
        `${pool.length} are unaccounted for, so its view and the card list disagree.`,
    );
  }
  for (const card of cards) {
    const [template] = pool.splice(Math.floor(rng() * pool.length), 1);
    for (const key of card.redactedAttributes) {
      if (!(key in template)) {
        throw new Error(`Cannot suppose a ${kind} card for seat ${seat}: a fresh card has no "${key}" to copy.`);
      }
      (card as unknown as Record<string, unknown>)[key] = template[key];
    }
  }
}

/**
 * The bot searches a copy of the game made from its seat's view, where every
 * face-down card has no attributes, and MERC's rules read those cards when
 * they draw them. This fills each one with a card the seat has not seen (#82).
 */
export const mercDeterminize: DeterminizeSampler = (sandbox, seat, rng) => {
  const game = sandbox as MERCGame;
  const fresh = [...game._freshCards];

  const [hiddenMercs, seenMercs] = partition(game.all(CombatantModel), (m) => m.isAttributeRedacted('combatantId'));
  const seenMercNames = new Set(seenMercs.map((m) => m.name));
  deal(hiddenMercs, fresh.filter(([name, card]) => card.cardType === 'merc' && !seenMercNames.has(name)).map(([, card]) => card), rng, seat, 'MERC');

  const [hiddenEquipment, seenEquipment] = partition(game.all(Equipment), (e) => e.isAttributeRedacted('equipmentId'));
  const seenEquipmentNames = new Set(seenEquipment.map((e) => e.name));
  for (const deck of game.all(EquipmentDeck)) {
    const pool = fresh.filter(([name, card]) => card.equipmentType === deck.equipmentType && !seenEquipmentNames.has(name)).map(([, card]) => card);
    deal(hiddenEquipment.filter((e) => e.parent === deck), pool, rng, seat, deck.equipmentType);
  }
  const strayEquipment = hiddenEquipment.find((e) => !(e.parent instanceof EquipmentDeck));
  if (strayEquipment) {
    throw new Error(`Cannot suppose a world for seat ${seat}: a face-down equipment card sits in "${strayEquipment.parent?.name}", outside the equipment decks.`);
  }

  // Which tactics setup dealt is hidden too, so the pool is every tactics card in the data.
  const [hiddenTactics, seenTactics] = partition(game.all(TacticsCard), (t) => t.isAttributeRedacted('tacticsId'));
  const tacticsPool = game.tacticsData.flatMap((t) => Array.from({ length: t.quantity }, () => t));
  for (const card of seenTactics) {
    const at = tacticsPool.findIndex((t) => t.id === card.tacticsId);
    if (at === -1) {
      throw new Error(`Cannot suppose a world for seat ${seat}: it sees more "${card.tacticsId}" tactics cards than the tactics data holds.`);
    }
    tacticsPool.splice(at, 1);
  }
  // faceUp is Card's default: nothing in MERC flips a tactics card.
  deal(hiddenTactics, tacticsPool.map((t) => ({ faceUp: true, ...tacticsCardAttributes(t) })), rng, seat, 'tactics');
};

function partition<T>(items: T[], test: (item: T) => boolean): [T[], T[]] {
  return [items.filter(test), items.filter((item) => !test(item))];
}

export const mercBot: BotStrategy = {
  determinize: mercDeterminize,

  candidateMoves: (game: Game, seat: number, listMoves: () => BotMove[]): BotMove[] =>
    listMoves().filter((move) => searchable(game as MERCGame, seat, move)),

  objectives: (game: Game, _playerIndex: number): Record<string, Objective> => ({
    // The printed win condition: more sector value than the other side.
    sectorControl: objective(1.0, (g, p) => sectorValueShare(g, p)),

    // Units on the board are what take and hold sectors.
    forces: objective(0.4, (g, p) => forceStrength(g, p)),

    // Rebels want the Dictator dead; the Dictator wants to stay alive.
    dictatorSurvival: objective(0.6, (g, p) =>
      p.isDictator() ? dictatorHealthShare(g) : 1 - dictatorHealthShare(g)
    ),

    // Holding a lead matters more the closer the deck is to running out.
    closingLead: objective(0.5, (g, p) => sectorValueShare(g, p) * gameProgress(g)),
  }),

  /**
   * Weighted-random rollout: keep the bot doing things that change the board
   * instead of ending its turn immediately, which vanilla random selection does
   * roughly once in every N moves.
   */
  playoutPolicy: (
    _game: Game,
    _playerIndex: number,
    availableMoves: BotMove[],
    rng: () => number
  ): BotMove => {
    const weights = availableMoves.map(m => PLAYOUT_WEIGHTS[m.action] ?? DEFAULT_PLAYOUT_WEIGHT);
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = rng() * total;
    for (let i = 0; i < availableMoves.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return availableMoves[i];
    }
    return availableMoves[availableMoves.length - 1];
  },

  /** Explore board-changing moves before turn-ending ones. */
  moveOrdering: (_game: Game, _playerIndex: number, moves: BotMove[]): BotMove[] =>
    [...moves].sort(
      (a, b) =>
        (PLAYOUT_WEIGHTS[b.action] ?? DEFAULT_PLAYOUT_WEIGHT) -
        (PLAYOUT_WEIGHTS[a.action] ?? DEFAULT_PLAYOUT_WEIGHT)
    ),
};
