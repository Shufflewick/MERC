<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { UI_COLORS } from '../colors';
import type { UseActionControllerReturn } from '@boardsmith/ui';
import DetailModal from './DetailModal.vue';

// Helper to get attribute from node
function getAttr<T>(node: any, key: string, defaultVal: T): T {
  if (node?.attributes && node.attributes[key] !== undefined) return node.attributes[key];
  if (node && node[key] !== undefined) return node[key];
  return defaultVal;
}

// Props
const props = defineProps<{
  dictator: {
    id?: number;
    dictatorId: string;
    dictatorName: string;
    ability: string;
    bio?: string;
    image?: string;
    inPlay?: boolean;
    actionsRemaining?: number;
  };
  tacticsHand: Array<{
    id?: number;
    tacticsId: string;
    tacticsName: string;
    story?: string;
    description?: string;
  }>;
  availableActions: string[];
  actionController: UseActionControllerReturn;
  isMyTurn: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

// Track which action we started from this panel
const activeActionFromPanel = ref<string | null>(null);

// Dictator detail modal state
const showDictatorModal = ref(false);

// Selected tactics card for detail view
const selectedTacticsCard = ref<any>(null);
const showTacticsModal = ref(false);

function openTacticsCard(card: any) {
  selectedTacticsCard.value = card;
  showTacticsModal.value = true;
}

function closeTacticsModal() {
  showTacticsModal.value = false;
  selectedTacticsCard.value = null;
}

// Get dictator portrait path
const dictatorImagePath = computed(() => {
  if (props.dictator.image) return props.dictator.image;
  return `/dictators/${props.dictator.dictatorId}.jpg`;
});

// Actions available for dictator
const dictatorActions = computed(() => {
  if (!props.isMyTurn) return [];

  const actions: Array<{ name: string; label: string; icon: string }> = [];

  // Tactics actions (require cards in hand)
  if (props.availableActions.includes('playTactics') && props.tacticsHand.length > 0) {
    actions.push({ name: 'playTactics', label: 'Play Tactics', icon: '🎴' });
  }
  if (props.availableActions.includes('reinforce') && props.tacticsHand.length > 0) {
    actions.push({ name: 'reinforce', label: 'Reinforce', icon: '🛡️' });
  }

  // Basic MERC actions (same as rebels)
  if (props.availableActions.includes('move')) {
    actions.push({ name: 'move', label: 'Move', icon: '🚶' });
  }
  if (props.availableActions.includes('explore')) {
    actions.push({ name: 'explore', label: 'Explore', icon: '🔍' });
  }
  if (props.availableActions.includes('train')) {
    actions.push({ name: 'train', label: 'Train', icon: '🎯' });
  }
  if (props.availableActions.includes('dropEquipment')) {
    actions.push({ name: 'dropEquipment', label: 'Unequip', icon: '📤' });
  }
  if (props.availableActions.includes('reEquip')) {
    actions.push({ name: 'reEquip', label: 'Re-Equip', icon: '🎒' });
  }
  if (props.availableActions.includes('mortar')) {
    actions.push({ name: 'mortar', label: 'Fire Mortar', icon: '💥' });
  }
  if (props.availableActions.includes('endTurn')) {
    actions.push({ name: 'endTurn', label: 'End Turn', icon: '⏭️' });
  }

  return actions;
});

// Check if we're currently in an action flow
const isInActionFlow = computed(() => {
  const currentAction = props.actionController.currentAction.value;
  if (!currentAction) return false;

  // Dictator-relevant actions
  const dictatorRelevantActions = [
    'playTactics', 'reinforce',
    'move', 'explore', 'train', 'dropEquipment', 'reEquip', 'mortar', 'endTurn'
  ];
  return dictatorRelevantActions.includes(currentAction);
});

// Get current selection from action controller
const currentSelection = computed(() => {
  if (!isInActionFlow.value) return null;
  return props.actionController.currentSelection.value;
});

// Check if current selection is for tactics card
const isSelectingTacticsCard = computed(() => {
  const sel = currentSelection.value;
  if (!sel) return false;
  const selName = (sel.name || '').toLowerCase();
  const selPrompt = (sel.prompt || '').toLowerCase();
  return selName === 'card' || selPrompt.includes('tactics');
});

// Get selectable tactics cards
const selectableTacticsCards = computed(() => {
  if (!isSelectingTacticsCard.value) return [];

  // Use validElements from action controller
  const validEls = props.actionController.validElements.value || [];

  if (validEls.length > 0) {
    return validEls.map((ve: any) => {
      const elementId = ve.id || ve.ref?.id;
      const attrs = ve.element?.attributes || {};

      // Try to find full card data from tacticsHand (has complete descriptions)
      const handCard = props.tacticsHand.find(c =>
        c.id === elementId ||
        c.tacticsId === attrs.tacticsId ||
        c.tacticsName === (attrs.tacticsName || ve.display)
      );

      // Prefer hand card data if available
      const tacticsName = handCard?.tacticsName || attrs.tacticsName || ve.display || 'Unknown';
      const description = handCard?.description || attrs.description || '';
      const story = handCard?.story || attrs.story || '';

      return {
        ...attrs,
        tacticsId: handCard?.tacticsId || attrs.tacticsId || ve.tacticsId,
        tacticsName,
        description,
        story,
        _choiceValue: elementId,
        _choiceDisplay: ve.display,
      };
    });
  }

  // Fallback to hand cards
  return props.tacticsHand.map(card => ({
    ...card,
    _choiceValue: card.id,
    _choiceDisplay: card.tacticsName,
  }));
});

// Handle action click
async function handleAction(actionName: string) {
  activeActionFromPanel.value = actionName;
  props.actionController.start(actionName);
}

// Handle tactics card selection
async function selectTacticsCard(card: any) {
  const sel = props.actionController.currentSelection.value;
  if (!sel) return;

  const value = card._choiceValue !== undefined ? card._choiceValue : card.id;
  if (value !== null) {
    await props.actionController.fill(sel.name, value);
  }
}

// Cancel current action
function cancelAction() {
  props.actionController.cancel();
  activeActionFromPanel.value = null;
}

// Watch for action completion
watch(() => props.actionController.currentAction.value, (newAction) => {
  if (newAction === null && activeActionFromPanel.value !== null) {
    activeActionFromPanel.value = null;
  }
});
</script>

<template>
  <div class="dictator-panel">
    <!-- Header with dictator info -->
    <div class="panel-header">
      <div class="dictator-info">
        <div
          class="dictator-portrait"
          @click="showDictatorModal = true"
          :title="dictator.dictatorName"
        >
          <img
            :src="dictatorImagePath"
            :alt="dictator.dictatorName"
            @error="($event.target as HTMLImageElement).src = '/dictators/unknown.jpg'"
          />
        </div>
        <div class="dictator-details">
          <span class="dictator-name">{{ dictator.dictatorName }}</span>
          <span class="dictator-ability">{{ dictator.ability }}</span>
        </div>
      </div>
      <button class="close-btn" @click="emit('close')">×</button>
    </div>

    <!-- Main content area -->
    <div class="panel-content">
      <!-- Action Flow: Show selection UI when in action -->
      <template v-if="isInActionFlow && currentSelection">
        <div class="action-flow">
          <div class="action-flow-header">
            <span class="action-flow-title">{{ currentSelection.prompt || 'Select' }}</span>
            <button class="cancel-btn" @click="cancelAction">Cancel</button>
          </div>

          <!-- Tactics Card Selection -->
          <div v-if="isSelectingTacticsCard" class="tactics-selection">
            <div
              v-for="(card, index) in selectableTacticsCards"
              :key="card._choiceValue || index"
              class="selectable-tactics"
              @click="selectTacticsCard(card)"
            >
              <div class="tactics-card-preview">
                <span class="tactics-name">{{ card.tacticsName }}</span>
                <span class="tactics-description" v-if="card.description">
                  {{ card.description }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Normal View: Tactics Hand and Actions -->
      <template v-else>
        <!-- Tactics Cards in Hand -->
        <div v-if="tacticsHand.length > 0" class="tactics-section">
          <div class="section-label">Tactics Hand</div>
          <div class="tactics-cards">
            <div
              v-for="card in tacticsHand"
              :key="card.tacticsId"
              class="tactics-card"
              @click="openTacticsCard(card)"
              :title="card.tacticsName"
            >
              <span class="tactics-card-name">{{ card.tacticsName }}</span>
            </div>
          </div>
        </div>

        <!-- No cards message -->
        <div v-else class="no-cards">
          <span>No tactics cards in hand</span>
        </div>

        <!-- Actions -->
        <div class="actions-area" v-if="dictatorActions.length > 0">
          <button
            v-for="action in dictatorActions"
            :key="action.name"
            class="action-btn"
            @click="handleAction(action.name)"
          >
            <span class="action-icon">{{ action.icon }}</span>
            <span class="action-label">{{ action.label }}</span>
          </button>
        </div>

        <!-- Not your turn message -->
        <div v-else-if="!isMyTurn" class="not-turn">
          <span>Waiting for rebels...</span>
        </div>
      </template>
    </div>

    <!-- Dictator Details Modal -->
    <DetailModal :show="showDictatorModal" @close="showDictatorModal = false">
      <div class="dictator-modal">
        <div class="dictator-modal-portrait">
          <img
            :src="dictatorImagePath"
            :alt="dictator.dictatorName"
            @error="($event.target as HTMLImageElement).src = '/dictators/unknown.jpg'"
          />
        </div>
        <div class="dictator-modal-info">
          <h2>{{ dictator.dictatorName }}</h2>
          <p class="ability-text">{{ dictator.ability }}</p>
          <p v-if="dictator.bio" class="bio-text">{{ dictator.bio }}</p>
        </div>
      </div>
    </DetailModal>

    <!-- Tactics Card Detail Modal -->
    <DetailModal :show="showTacticsModal" @close="closeTacticsModal">
      <div v-if="selectedTacticsCard" class="tactics-modal">
        <h2>{{ selectedTacticsCard.tacticsName }}</h2>
        <p v-if="selectedTacticsCard.story" class="tactics-story">
          "{{ selectedTacticsCard.story }}"
        </p>
        <p class="tactics-effect">{{ selectedTacticsCard.description }}</p>
      </div>
    </DetailModal>
  </div>
</template>

<style scoped>
.dictator-panel {
  background: v-bind('UI_COLORS.surface');
  border: 1px solid v-bind('UI_COLORS.border');
  border-radius: 8px;
  overflow: hidden;
  min-width: 350px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(139, 0, 0, 0.3);
  border-bottom: 1px solid v-bind('UI_COLORS.border');
}

.dictator-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dictator-portrait {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: 3px solid #8b0000;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  background: #333;
}

.dictator-portrait:hover {
  transform: scale(1.1);
  box-shadow: 0 0 8px rgba(139, 0, 0, 0.8);
}

.dictator-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dictator-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dictator-name {
  font-size: 1.1rem;
  font-weight: bold;
  color: #ff6b6b;
}

.dictator-ability {
  font-size: 0.8rem;
  color: v-bind('UI_COLORS.textSecondary');
  max-width: 300px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: v-bind('UI_COLORS.textSecondary');
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.close-btn:hover {
  color: v-bind('UI_COLORS.textPrimary');
}

.panel-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px 16px;
}

/* Action Flow */
.action-flow {
  width: 100%;
}

.action-flow-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.action-flow-title {
  font-weight: 600;
  color: v-bind('UI_COLORS.textPrimary');
}

.cancel-btn {
  background: none;
  border: 1px solid v-bind('UI_COLORS.border');
  color: v-bind('UI_COLORS.textSecondary');
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* Tactics Selection */
.tactics-selection {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.selectable-tactics {
  cursor: pointer;
  padding: 12px;
  background: rgba(139, 0, 0, 0.2);
  border: 1px solid rgba(139, 0, 0, 0.4);
  border-radius: 8px;
  transition: all 0.2s;
}

.selectable-tactics:hover {
  background: rgba(139, 0, 0, 0.4);
  border-color: #8b0000;
}

.tactics-card-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tactics-card-preview .tactics-name {
  font-weight: 600;
  color: #fff;
}

.tactics-card-preview .tactics-description {
  font-size: 0.85rem;
  color: v-bind('UI_COLORS.textSecondary');
}

/* Normal View */
.tactics-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: v-bind('UI_COLORS.textSecondary');
}

.tactics-cards {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tactics-card {
  padding: 8px 12px;
  background: rgba(139, 0, 0, 0.2);
  border: 1px solid rgba(139, 0, 0, 0.4);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.tactics-card:hover {
  background: rgba(139, 0, 0, 0.4);
  border-color: #8b0000;
  transform: translateY(-2px);
}

.tactics-card-name {
  font-size: 0.9rem;
  font-weight: 500;
  color: #ff6b6b;
}

.no-cards {
  color: v-bind('UI_COLORS.textSecondary');
  font-style: italic;
  padding: 8px 0;
}

.actions-area {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: auto;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(139, 0, 0, 0.3);
  border: 1px solid rgba(139, 0, 0, 0.6);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.action-btn:hover {
  background: #8b0000;
  border-color: #8b0000;
}

.action-icon {
  font-size: 1rem;
}

.action-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #fff;
}

.not-turn {
  color: v-bind('UI_COLORS.textSecondary');
  font-style: italic;
  padding: 8px 0;
}

/* Modals */
.dictator-modal {
  display: flex;
  gap: 20px;
  padding: 20px;
  background: v-bind('UI_COLORS.surface');
  border: 1px solid v-bind('UI_COLORS.border');
  border-radius: 12px;
  max-width: 500px;
}

.dictator-modal-portrait {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
  border: 4px solid #8b0000;
  flex-shrink: 0;
}

.dictator-modal-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dictator-modal-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dictator-modal-info h2 {
  margin: 0;
  color: #ff6b6b;
}

.ability-text {
  color: v-bind('UI_COLORS.accent');
  font-weight: 500;
  margin: 0;
}

.bio-text {
  color: v-bind('UI_COLORS.textSecondary');
  font-size: 0.9rem;
  margin: 0;
}

.tactics-modal {
  padding: 20px;
  background: v-bind('UI_COLORS.surface');
  border: 1px solid v-bind('UI_COLORS.border');
  border-radius: 12px;
  max-width: 400px;
}

.tactics-modal h2 {
  margin: 0 0 12px 0;
  color: #ff6b6b;
}

.tactics-story {
  font-style: italic;
  color: v-bind('UI_COLORS.textSecondary');
  margin: 0 0 12px 0;
}

.tactics-effect {
  color: v-bind('UI_COLORS.textPrimary');
  margin: 0;
}
</style>
