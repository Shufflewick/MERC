import { computed, type ComputedRef } from 'vue';

/**
 * Victory display state.
 *
 * The rules layer owns control, scoring and the winner; it publishes its verdict
 * as `victoryOutcome` on the game view when the game ends (see
 * `MERCGame.evaluateOutcome`). This composable only reads those values — do not
 * re-derive them from the view tree, or the banner will drift from the engine.
 *
 * @param getGameView - Getter function that returns the current gameView
 */
export interface VictoryOutcomeView {
  winner: 'rebels' | 'dictator';
  reason: string;
  rebelPoints: number;
  dictatorPoints: number;
}

export function useVictoryCalculations(getGameView: () => any) {
  const victoryOutcome: ComputedRef<VictoryOutcomeView | null> = computed(() => {
    const gameView = getGameView();
    return gameView?.victoryOutcome ?? gameView?.attributes?.victoryOutcome ?? null;
  });

  const isGameOver: ComputedRef<boolean> = computed(() => {
    const gameView = getGameView();
    return gameView?.isFinished ?? false;
  });

  const gameWinner: ComputedRef<'rebels' | 'dictator' | null> = computed(
    () => victoryOutcome.value?.winner ?? null
  );

  const victoryReason: ComputedRef<string> = computed(
    () => victoryOutcome.value?.reason ?? ''
  );

  const rebelVictoryPoints: ComputedRef<number> = computed(
    () => victoryOutcome.value?.rebelPoints ?? 0
  );

  const dictatorVictoryPoints: ComputedRef<number> = computed(
    () => victoryOutcome.value?.dictatorPoints ?? 0
  );

  return {
    isGameOver,
    gameWinner,
    victoryReason,
    rebelVictoryPoints,
    dictatorVictoryPoints,
  };
}
