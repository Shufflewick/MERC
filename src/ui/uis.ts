import { defineGameUIs, defaultUI, devUI } from 'boardsmith/ui';
import MercBoard from './MercBoard.vue';

/**
 * MERC ships one UI: the board.
 *
 * The auto-UI stays available in `boardsmith dev` for comparing what the engine
 * exposes against what the board draws, and costs nothing in production — a
 * devUI() entry is stripped from the bundle entirely, JS, CSS, and assets.
 */
export default defineGameUIs({
  MercBoard: defaultUI(MercBoard),
  Auto: devUI(() => import('boardsmith/ui/auto-ui')),
});
