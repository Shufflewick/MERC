<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { UI_COLORS } from '../colors';
import type { UseActionControllerReturn } from '@boardsmith/ui';
import DetailModal from './DetailModal.vue';
import DrawEquipmentType from './DrawEquipmentType.vue';
import CombatantCard from './CombatantCard.vue';
import CombatantIconSmall from './CombatantIconSmall.vue';
import SectorCardChoice from './SectorCardChoice.vue';

// Helper to get attribute from node
function getAttr<T>(node: any, key: string, defaultVal: T): T {
  if (node?.attributes && node.attributes[key] !== undefined) return node.attributes[key];
  if (node && node[key] !== undefined) return node[key];
  return defaultVal;
}


// Sector type for visual sector cards
interface SectorData {
  sectorId: string;
  sectorName: string;
  sectorType: string;
  value: number;
  image?: string;
  weaponLoot?: number;
  armorLoot?: number;
  accessoryLoot?: number;
  dictatorMilitia?: number;
  explored?: boolean;
}

// Helper to get equipment name from slot data
function getEquipmentName(slot: any): string | null {
  if (!slot) return null;
  return slot.equipmentName || slot.name || null;
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
    // Equipment slots
    weaponSlot?: { equipmentName?: string; name?: string } | null;
    armorSlot?: { equipmentName?: string; name?: string } | null;
    accessorySlot?: { equipmentName?: string; name?: string } | null;
    // Stats
    baseCombat?: number;
    baseInitiative?: number;
    baseTraining?: number;
    maxHealth?: number;
    damage?: number;
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
  allSectors?: SectorData[]; // For visual sector card display
  playerColor?: string; // Dictator's lobby-selected color
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
  return `/dictators/${props.dictator.dictatorId}.png`;
});

// Actions available for dictator - only dictator-specific actions
// Basic MERC actions (move, explore, etc.) are accessed via SectorPanel or ActionPanel
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

  return actions;
});

// Check if we're currently in an action flow (dictator-specific actions only)
const isInActionFlow = computed(() => {
  const currentAction = props.actionController.currentAction.value;
  if (!currentAction) return false;

  // Only track dictator-specific actions in this panel
  const dictatorSpecificActions = ['playTactics', 'reinforce', 'castroBonusHire', 'kimBonusMilitia', 'chooseKimBase'];
  return dictatorSpecificActions.includes(currentAction);
});

// Check if we're in Castro's hire action
// Note: Castro hire now uses the main hiring phase UI in GameBoard.vue
const isCastroHiring = computed(() => {
  return props.actionController.currentAction.value === 'castroBonusHire';
});

// Check if we're selecting a MERC (Castro hire)
// Note: This is now handled by the main hiring UI
const isSelectingMerc = computed(() => {
  // Disable - using main hiring UI instead
  return false;
});

// Check if we're selecting a sector (Castro hire, Kim militia, base location, or reinforce)
const isSelectingSector = computed(() => {
  const currentAction = props.actionController.currentAction.value;
  const sel = props.actionController.currentSelection.value;
  if (!sel) return false;
  // Handle different sector selection contexts
  if (currentAction === 'castroBonusHire' || currentAction === 'kimBonusMilitia') {
    return sel.name === 'targetSector';
  }
  // Base location selection during playTactics or chooseKimBase
  if ((currentAction === 'playTactics' || currentAction === 'chooseKimBase') && sel.name === 'baseLocation') {
    return true;
  }
  // Reinforce action sector selection
  if (currentAction === 'reinforce' && sel.name === 'sector') {
    return true;
  }
  return false;
});

// Check if we're selecting equipment type for the dictator
const isSelectingEquipmentType = computed(() => {
  const currentAction = props.actionController.currentAction.value;
  const sel = props.actionController.currentSelection.value;
  if (!sel) return false;
  // Equipment selection happens in both playTactics (base reveal via tactics) and chooseKimBase (Day 1 setup)
  return (currentAction === 'playTactics' || currentAction === 'chooseKimBase') && sel.name === 'dictatorEquipment';
});

// Get equipment type choices
const equipmentTypeChoices = computed(() => {
  if (!isSelectingEquipmentType.value) return [];
  const sel = props.actionController.currentSelection.value;
  if (!sel) return [];
  const choices = props.actionController.getChoices(sel) || [];
  return choices.map((c: any) => ({
    value: typeof c === 'string' ? c : c.value,
    label: typeof c === 'string' ? c : c.label || c.value,
  }));
});

// Note: Castro's hire is now handled by the main hiring UI in GameBoard.vue
// This panel only handles Kim's militia placement
const selectableMercs = computed(() => {
  // Castro's hire uses the main hiring UI - return empty
  return [];
});

// Get fallback image for sector type
function getSectorImageFallback(sectorType: string): string {
  const type = (sectorType || 'industry').toLowerCase();
  if (type === 'wilderness') return '/sectors/wilderness.jpg';
  if (type === 'city') return '/sectors/town---a.jpg';
  return '/sectors/industry---coal.jpg';
}

// Get selectable sectors for placement - includes full sector data
const selectableSectors = computed(() => {
  if (!isSelectingSector.value) return [];
  const sel = props.actionController.currentSelection.value;
  if (!sel) return [];

  // Use validElements for element-based selections (like reinforce sector)
  const validEls = props.actionController.validElements.value || [];

  if (validEls.length > 0) {
    return validEls.map((ve: any) => {
      const elementId = ve.id || ve.ref?.id;
      const attrs = ve.element?.attributes || {};

      // Extract sector data from element attributes
      const sectorId = attrs.sectorId || ve.sectorId || '';
      const sectorName = attrs.sectorName || ve.display || '';
      const sectorType = attrs.sectorType || 'Industry';

      // Also try to find in allSectors for additional data
      const sectorData = props.allSectors?.find(s =>
        s.sectorId === sectorId || s.sectorName === sectorName
      );

      return {
        _choiceValue: elementId, // For selection
        sectorId: sectorData?.sectorId || sectorId,
        sectorName: sectorData?.sectorName || sectorName || `Sector ${elementId}`,
        sectorType: sectorData?.sectorType || sectorType,
        image: sectorData?.image || attrs.image || getSectorImageFallback(sectorType),
        value: sectorData?.value ?? attrs.value ?? 0,
        weaponLoot: sectorData?.weaponLoot ?? attrs.weaponLoot ?? 0,
        armorLoot: sectorData?.armorLoot ?? attrs.armorLoot ?? 0,
        accessoryLoot: sectorData?.accessoryLoot ?? attrs.accessoryLoot ?? 0,
        dictatorMilitia: sectorData?.dictatorMilitia ?? attrs.dictatorMilitia ?? 0,
      };
    });
  }

  // Fallback to getChoices for simple selections (Kim's ability uses this path)
  const choices = props.actionController.getChoices(sel) || [];
  return choices.map((c: any) => {
    // Parse JSON string if choices were serialized
    let choice = c;
    if (typeof c === 'string' && c.startsWith('{')) {
      try {
        choice = JSON.parse(c);
      } catch {
        // Not valid JSON, use as-is
      }
    }

    // Extract label and value from choice
    const rawLabel = choice?.label;
    const rawValue = choice?.value;
    const hasLabelOrValue = rawLabel !== undefined || rawValue !== undefined;

    const choiceValue = hasLabelOrValue ? (rawValue ?? rawLabel) : String(choice);
    const displayName = hasLabelOrValue ? (rawLabel ?? rawValue) : String(choice);

    // Look up sector data by ID or name
    const sectorData = props.allSectors?.find(s =>
      s.sectorId === choiceValue || s.sectorName === displayName || s.sectorName === choiceValue
    );

    return {
      _choiceValue: choiceValue,
      sectorId: sectorData?.sectorId || choiceValue,
      sectorName: sectorData?.sectorName || displayName,
      sectorType: sectorData?.sectorType || 'Industry',
      image: sectorData?.image || getSectorImageFallback(sectorData?.sectorType || 'Industry'),
      value: sectorData?.value || 0,
      weaponLoot: sectorData?.weaponLoot || 0,
      armorLoot: sectorData?.armorLoot || 0,
      accessoryLoot: sectorData?.accessoryLoot || 0,
      dictatorMilitia: sectorData?.dictatorMilitia || 0,
    };
  });
});

// Handle equipment type selection (receives value string from DrawEquipmentType)
async function selectEquipmentType(value: string) {
  const sel = props.actionController.currentSelection.value;
  if (!sel) return;
  await props.actionController.fill(sel.name, value);
}

// Handle MERC selection for Castro hire
async function selectMercToHire(merc: any) {
  const sel = props.actionController.currentSelection.value;
  if (!sel) return;
  // Use _choiceValue if available (from our processing), otherwise fall back
  const value = merc._choiceValue ?? merc.mercId ?? merc.value;
  await props.actionController.fill(sel.name, value);
}

// Handle sector selection for placement
async function selectSector(sector: any) {
  const sel = props.actionController.currentSelection.value;
  if (!sel) return;
  // Use _choiceValue if available (element ID), then fallback to sectorName for base location, sectorId for others
  const value = sector._choiceValue ?? (sel.name === 'baseLocation' ? sector.sectorName : sector.sectorId);
  await props.actionController.fill(sel.name, value);
}

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

// Determine if panel-content has anything to show
const hasContentToShow = computed(() => {
  return (isInActionFlow.value && currentSelection.value) ||
         dictatorActions.value.length > 0 ||
         !props.isMyTurn;
});
</script>

<template>
  <div class="dictator-panel">
    <!-- Header with dictator info and tactics hand -->
    <div class="panel-header">
      <div class="dictator-info">
        <CombatantIconSmall
          :merc-id="dictator.dictatorId"
          :image="dictatorImagePath"
          :alt="dictator.dictatorName"
          :player-color="playerColor"
          :size="50"
          is-dictator
          clickable
          @click="showDictatorModal = true"
        />
        <div class="dictator-details">
          <span class="dictator-name">{{ dictator.dictatorName }}</span>
          <span class="dictator-ability">{{ dictator.ability }}</span>
        </div>
      </div>
      <!-- Tactics Hand in header -->
      <div v-if="tacticsHand.length > 0" class="header-tactics">
        <div
          v-for="card in tacticsHand"
          :key="card.tacticsId"
          class="header-tactics-card"
          @click="openTacticsCard(card)"
          :title="card.tacticsName"
        >
          {{ card.tacticsName }}
        </div>
      </div>
    </div>

    <!-- Main content area (hidden when empty) -->
    <div v-if="hasContentToShow" class="panel-content">
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

          <!-- Castro MERC Hiring Selection -->
          <div v-else-if="isSelectingMerc" class="merc-hiring-section">
            <div class="hiring-header">
              <span class="hiring-title">Castro's Ability: Hire a MERC</span>
            </div>
            <div class="merc-choices">
              <div
                v-for="merc in selectableMercs"
                :key="merc.mercId"
                class="merc-choice"
                @click="selectMercToHire(merc)"
              >
                <CombatantCard :merc="merc" :player-color="playerColor" />
              </div>
            </div>
          </div>

          <!-- Sector Selection (for Castro hire placement, Kim militia, or base location) -->
          <div v-else-if="isSelectingSector" class="sector-selection">
            <div class="sector-card-choices">
              <SectorCardChoice
                v-for="sector in selectableSectors"
                :key="sector.sectorId"
                :sector="sector"
                size="compact"
                @click="selectSector(sector)"
              />
            </div>
          </div>

          <!-- Equipment Type Selection (for dictator entering play) -->
          <DrawEquipmentType
            v-else-if="isSelectingEquipmentType"
            :choices="equipmentTypeChoices"
            :merc-id="dictator?.dictatorId"
            :merc-name="dictator?.dictatorName"
            player-color="dictator"
            is-dictator
            @select="selectEquipmentType"
          />
        </div>
      </template>

      <!-- Normal View: Actions -->
      <template v-else>
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
        <CombatantIconSmall
          :merc-id="dictator.dictatorId"
          :image="dictatorImagePath"
          :alt="dictator.dictatorName"
          :player-color="playerColor"
          :size="120"
          is-dictator
        />
        <div class="dictator-modal-info">
          <h2>{{ dictator.dictatorName }}</h2>
          <p class="ability-text">{{ dictator.ability }}</p>
          <p v-if="dictator.bio" class="bio-text">{{ dictator.bio }}</p>

          <!-- Equipment Slots -->
          <div class="equipment-section" v-if="dictator.inPlay">
            <div class="section-title">Equipment</div>
            <div class="equipment-slots">
              <div class="equipment-slot">
                <span class="slot-icon">⚔️</span>
                <span class="slot-name">{{ getEquipmentName(dictator.weaponSlot) || 'No weapon' }}</span>
              </div>
              <div class="equipment-slot">
                <span class="slot-icon">🛡️</span>
                <span class="slot-name">{{ getEquipmentName(dictator.armorSlot) || 'No armor' }}</span>
              </div>
              <div class="equipment-slot">
                <span class="slot-icon">💍</span>
                <span class="slot-name">{{ getEquipmentName(dictator.accessorySlot) || 'No accessory' }}</span>
              </div>
            </div>
          </div>

          <!-- Stats -->
          <div class="stats-section" v-if="dictator.inPlay">
            <div class="section-title">Stats</div>
            <div class="stats-row">
              <span class="stat">Actions: {{ dictator.actionsRemaining ?? 0 }}</span>
              <span class="stat">Health: {{ (dictator.maxHealth ?? 10) - (dictator.damage ?? 0) }}/{{ dictator.maxHealth ?? 10 }}</span>
            </div>
          </div>
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
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(139, 0, 0, 0.3);
  border-bottom: 1px solid v-bind('UI_COLORS.border');
}

.dictator-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Header Tactics */
.header-tactics {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  margin-left: auto;
}

.header-tactics-card {
  padding: 6px 10px;
  background: rgba(139, 0, 0, 0.4);
  border: 1px solid rgba(139, 0, 0, 0.6);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  color: #ff6b6b;
  transition: all 0.2s;
  white-space: nowrap;
}

.header-tactics-card:hover {
  background: rgba(139, 0, 0, 0.6);
  border-color: #8b0000;
  transform: translateY(-1px);
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

/* Castro MERC Hiring */
.merc-hiring-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hiring-header {
  text-align: center;
}

.hiring-title {
  font-size: 1rem;
  font-weight: 600;
  color: #ff6b6b;
}

.merc-choices {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.merc-choice {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  border-radius: 8px;
}

.merc-choice:hover {
  transform: scale(1.02);
  box-shadow: 0 0 12px rgba(139, 0, 0, 0.6);
}

/* Sector Selection - Container */
.sector-selection {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sector-card-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}

/* Normal View */
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

/* Equipment and Stats sections in modal */
.equipment-section,
.stats-section {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.section-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: v-bind('UI_COLORS.textSecondary');
  margin-bottom: 8px;
}

.equipment-slots {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.equipment-slot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
}

.slot-icon {
  font-size: 1rem;
}

.slot-name {
  font-size: 0.9rem;
  color: v-bind('UI_COLORS.textPrimary');
}

.stats-row {
  display: flex;
  gap: 16px;
}

.stat {
  font-size: 0.9rem;
  color: v-bind('UI_COLORS.textPrimary');
}
</style>
