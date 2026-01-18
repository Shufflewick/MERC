/**
 * Shared state to track when an action was triggered via drag-and-drop.
 * Used to skip redundant animations in onBeforeAutoExecute.
 */
import { ref } from 'vue';

export const lastActionWasDragDrop = ref(false);
