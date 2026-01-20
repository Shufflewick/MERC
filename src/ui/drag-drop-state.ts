/**
 * Shared state to track when an action was triggered via drag-and-drop.
 * Used to skip redundant animations in onBeforeAutoExecute.
 */
import { ref } from 'vue';

export const lastActionWasDragDrop = ref(false);

/**
 * Track when a squad reassign was initiated from clicking the squad badge.
 * When true, skip showing AssignToSquadPanel (animation will still play from SquadPanel).
 */
export const quickReassignInProgress = ref(false);
