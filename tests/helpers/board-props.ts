import type { GameRootView, TableBoardProps, UseActionControllerReturn } from 'boardsmith/ui';

/** A game root whose children are bare elements with the given ids. */
export function gameView(childIds: number[] = []): GameRootView {
  return {
    id: 1, className: 'MERCGame', phase: 'started', isFinished: false, settings: {},
    children: childIds.map((id) => ({ id, className: 'Sector' })),
  };
}

/** Everything GameShell binds onto a table's board (boardsmith's tableBoardProps()). */
export function boardProps(actionController: UseActionControllerReturn): TableBoardProps {
  return {
    gameView: gameView(),
    players: [],
    myPlayer: undefined,
    playerSeat: 1,
    isMyTurn: true,
    availableActions: [],
    actionController,
    disabledActions: {},
    state: null,
    isViewingHistory: false,
    canUndo: false,
    undo: async () => {},
    setBoardPrompt: () => {},
  };
}
