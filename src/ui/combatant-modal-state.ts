/**
 * The header-combatant modal, shared between the player panel and the board.
 *
 * Clicking a combatant icon in GameShell's `#player-stats` slot opens a modal
 * that the BOARD renders. Those are two different components now that the board
 * is a real UI (src/ui/uis.ts) instead of slot content, so the state that joins
 * them cannot live in App.vue any more.
 *
 * Module scope is the right home for it, and it is the pattern this codebase
 * already uses for exactly this shape of problem — see `drag-drop-state.ts`.
 * The alternative, threading it back through props, would mean re-inventing the
 * board slot that was removed precisely because it let two places disagree
 * about which UI a game renders.
 */
import { ref } from 'vue';

export interface HeaderCombatantData {
  combatant: any;
  color: string;
  squadName: string;
  sectorName: string;
}

export const headerCombatantData = ref<HeaderCombatantData | null>(null);

export function openCombatantModal(
  combatant: any,
  playerColor: string,
  squadName: string,
  sectorName: string,
): void {
  headerCombatantData.value = { combatant, color: playerColor, squadName, sectorName };
}

export function closeHeaderCombatantModal(): void {
  headerCombatantData.value = null;
}
