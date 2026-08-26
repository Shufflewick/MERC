/**
 * MCTS hooks for MERC.
 *
 * Vanilla MCTS has no evaluation gradient on a board this size: playouts wander
 * and the Bot seats the presets advertise play far below what the framework can
 * deliver. These hooks give the search something to climb — objectives that
 * score the position, and a playout policy that keeps random rollouts doing
 * something a MERC player would recognise.
 */

import type { BotStrategy, BotMove, Objective } from 'boardsmith/bot';
import type { Game } from 'boardsmith';
import { MERCGame, type MERCPlayer } from './game.js';
import { TacticsCard } from './elements.js';

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

export const mercBot: BotStrategy = {
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
