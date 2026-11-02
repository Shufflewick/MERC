import { enumerateLegalMoves } from 'boardsmith';
import { GameRunner } from 'boardsmith/runtime';
import { MERCGame } from '../../src/rules/game.js';
import { getCurrentAction } from './auto-play.js';

export const DICTATORS = ['castro', 'kim', 'gadafi', 'hitler', 'hussein', 'mao', 'mussolini', 'noriega', 'pinochet', 'polpot', 'stalin'];

/** Seeded random legal play by an all-human table of `rebels` rebels against `dictator`, calling `visit` before every move. */
export function randomPlay(seed: string, dictator: string, rebels: number, visit: (game: MERCGame) => void): void {
  const playerConfigs = [
    ...Array.from({ length: rebels }, () => ({ color: '#e74c3c', isDictator: false, isBot: false })),
    { color: '#95a5a6', isDictator: true, isBot: false },
  ];
  const runner = new GameRunner<MERCGame>({
    GameClass: MERCGame,
    gameType: 'merc',
    gameOptions: {
      playerCount: rebels + 1,
      playerNames: playerConfigs.map((_, i) => `P${i + 1}`),
      seed: `${seed}-${dictator}-${rebels}`,
      dictatorIsBot: false,
      dictatorChoice: dictator,
      playerConfigs,
    } as never,
  });
  runner.start();
  let state = rebels + 1;
  const pick = (n: number) => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state % n; };
  for (let i = 0; i < 1500; i++) {
    visit(runner.game);
    const current = getCurrentAction(runner.game.getFlowState());
    if (!current) break;
    const moves = enumerateLegalMoves(runner.game, current.currentPlayer, { maxPerAction: 3 });
    const move = moves[pick(moves.length)];
    if (!runner.performAction(move.action, current.currentPlayer, move.args).success) break;
  }
}
