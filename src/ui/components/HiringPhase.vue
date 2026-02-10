<script setup lang="ts">
import { UI_COLORS } from '../colors';
import { GameOverlay } from 'boardsmith/ui';
import CombatantCard from './CombatantCard.vue';
import DrawEquipmentType from './DrawEquipmentType.vue';
import SectorCardChoice from './SectorCardChoice.vue';
import type { SectorChoice } from '../composables/useActionState';
import CombatantIconSmall from './CombatantIconSmall.vue';
import ModalContent from './ModalContent.vue';

interface Props {
  // Action state flags
  isHiringMercs: boolean;
  isSelectingDictator: boolean;
  isSelectingEquipmentType: boolean;
  isCastroHiring: boolean;
  isSelectingSector: boolean;

  // Available choices
  hirableMercs: any[];
  hasSkipOption: boolean;
  equipmentTypeChoices: Array<{ value: string; label: string }>;
  sectorChoices: SectorChoice[];

  // Selected MERC state (for equipment/sector selection context)
  selectedMercForEquipment: any | null;
  selectedMercImagePath: string;
  selectedMercName: string;
  selectedMercId: string;

  // MultiSelect state (mid-game hire: draw 3, pick 1+)
  isMultiSelect?: boolean;
  isMultiSelectReady?: boolean;
  multiSelectCountDisplay?: string;
  isMultiSelected?: (choiceValue: unknown) => boolean;

  // Modal state
  showHiringMercModal: boolean;

  // Display context
  prompt: string;
  playerColor: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'select-merc': [merc: any];
  'select-equipment-type': [equipType: string];
  'select-sector': [sector: { value: string; label: string }];
  'skip-hire': [];
  'confirm-multi-select': [];
  'open-detail-modal': [];
  'close-detail-modal': [];
}>();

// Helper function to get combatant ID for v-for key
let combatantIdCounter = 0;
function getMercId(merc: any): string {
  const id = merc.attributes?.combatantId || merc.combatantId || merc.id || merc.ref;
  if (id) return id;
  const name = merc.attributes?.combatantName || merc.combatantName || '';
  return name ? `temp-${name}` : `temp-combatant-${++combatantIdCounter}`;
}

// Event handler wrappers
function handleMercSelect(merc: any) {
  emit('select-merc', merc);
}

function handleEquipmentTypeSelect(value: string) {
  emit('select-equipment-type', value);
}

function handleSectorSelect(sector: { value: string; label: string }) {
  emit('select-sector', sector);
}

function handleSkipHire() {
  emit('skip-hire');
}

function handleOpenDetailModal() {
  if (props.selectedMercForEquipment) {
    emit('open-detail-modal');
  }
}

function handleCloseDetailModal() {
  emit('close-detail-modal');
}
</script>

<template>
  <div class="hiring-phase">
    <div class="hiring-header">
      <div class="hiring-icon">👥</div>
      <div class="hiring-content">
        <h2 class="hiring-title">{{ isSelectingDictator ? 'Choose Your Dictator' : 'Hiring Phase' }}</h2>
        <p class="hiring-prompt">{{ prompt }}</p>
      </div>
    </div>

    <!-- Equipment type selection -->
    <DrawEquipmentType
      v-if="isSelectingEquipmentType && equipmentTypeChoices.length > 0"
      :choices="equipmentTypeChoices"
      :combatant-id="selectedMercId"
      :combatant-name="selectedMercName"
      :image="selectedMercImagePath"
      :player-color="playerColor"
      @select="handleEquipmentTypeSelect"
      @clickMerc="handleOpenDetailModal"
    />

    <!-- Sector selection (Castro hire placement) -->
    <div v-else-if="isSelectingSector && sectorChoices.length > 0" class="sector-selection">
      <div class="sector-row">
        <!-- MERC portrait (clickable to view details) -->
        <CombatantIconSmall
          v-if="selectedMercImagePath"
          :image="selectedMercImagePath"
          :alt="selectedMercName || 'MERC'"
          :player-color="playerColor"
          :size="80"
          clickable
          @click="handleOpenDetailModal"
        />
        <!-- Sector cards -->
        <div class="sector-card-choices">
          <SectorCardChoice
            v-for="sector in sectorChoices"
            :key="sector.sectorName"
            :sector="sector"
            @click="handleSectorSelect(sector)"
          />
        </div>
      </div>
    </div>

    <!-- MERC/Dictator selection -->
    <div class="merc-choices-container" v-else-if="hirableMercs.length > 0 || hasSkipOption">
      <div class="merc-choices">
        <div
          v-for="merc in hirableMercs"
          :key="getMercId(merc)"
          class="merc-choice"
          :class="{ 'merc-selected': isMultiSelect && isMultiSelected?.(merc._choiceValue) }"
          @click="handleMercSelect(merc)"
        >
          <CombatantCard :merc="merc" :player-color="playerColor" />
          <div v-if="isMultiSelect && isMultiSelected?.(merc._choiceValue)" class="selected-badge">HIRED</div>
        </div>
      </div>

      <!-- MultiSelect confirm button -->
      <div v-if="isMultiSelect" class="multi-select-controls">
        <span class="multi-select-count">{{ multiSelectCountDisplay }}</span>
        <button
          class="confirm-hire-button"
          :disabled="!isMultiSelectReady"
          @click="emit('confirm-multi-select')"
        >
          Confirm Hire
        </button>
      </div>

      <!-- Skip button for third hire (optional) -->
      <div v-if="hasSkipOption" class="skip-hire-section">
        <button class="skip-hire-button" @click="handleSkipHire">
          Skip Third Hire
        </button>
        <p class="skip-hint">You can hire a third MERC thanks to Teresa, or skip</p>
      </div>
    </div>

    <!-- Loading state -->
    <div v-else class="use-action-panel">
      <p class="action-panel-hint">Loading MERCs...</p>
    </div>

    <!-- MERC Detail Modal -->
    <GameOverlay :active="showHiringMercModal" @click="handleCloseDetailModal">
      <ModalContent @close="handleCloseDetailModal">
        <div class="hiring-merc-modal">
          <CombatantCard
            v-if="selectedMercForEquipment"
            :merc="selectedMercForEquipment"
            :player-color="playerColor"
          />
        </div>
      </ModalContent>
    </GameOverlay>
  </div>
</template>

<style scoped>
.hiring-phase {
  background: v-bind('UI_COLORS.cardBg');
  border: 2px solid v-bind('UI_COLORS.accent');
  border-radius: 12px;
  padding: 20px 24px;
}

.hiring-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.hiring-icon {
  font-size: 2.5rem;
}

.hiring-content {
  flex: 1;
}

.hiring-title {
  color: v-bind('UI_COLORS.accent');
  font-size: 1.4rem;
  margin: 0 0 4px;
  font-weight: 700;
}

.hiring-prompt {
  color: v-bind('UI_COLORS.text');
  margin: 0;
  font-size: 1rem;
}

.merc-choices-container {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.merc-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: center;
}

.merc-choice {
  position: relative;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  border-radius: 12px;
}

.merc-choice:hover {
  transform: translateY(-4px);
  box-shadow: 0 0 0 3px v-bind('UI_COLORS.accent'), 0 8px 24px rgba(212, 168, 75, 0.4);
}

/* Disable pointer events on all nested elements so clicks reach the wrapper div */
.merc-choice :deep(*) {
  pointer-events: none;
}

/* Sector selection for Castro hire */
.sector-selection {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 20px;
}

.sector-row {
  display: flex;
  gap: 16px;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
}

/* Sector Card Selection Container */
.sector-card-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: center;
  max-width: 800px;
}

.merc-selected {
  box-shadow: 0 0 0 3px v-bind('UI_COLORS.accent'), 0 8px 24px rgba(212, 168, 75, 0.4);
}

.selected-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: v-bind('UI_COLORS.accent');
  color: #000;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.05em;
  pointer-events: none;
}

.multi-select-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.multi-select-count {
  color: v-bind('UI_COLORS.textMuted');
  font-size: 0.9rem;
}

.confirm-hire-button {
  background: v-bind('UI_COLORS.accent');
  color: #000;
  border: none;
  padding: 12px 32px;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.confirm-hire-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(212, 168, 75, 0.5);
}

.confirm-hire-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.skip-hire-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.skip-hire-button {
  background: v-bind('UI_COLORS.backgroundLight');
  color: v-bind('UI_COLORS.text');
  border: 2px solid v-bind('UI_COLORS.textMuted');
  padding: 12px 32px;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.skip-hire-button:hover {
  border-color: v-bind('UI_COLORS.accent');
  background: v-bind('UI_COLORS.cardBg');
}

.skip-hint {
  color: v-bind('UI_COLORS.textMuted');
  font-size: 0.85rem;
  margin: 0;
  font-style: italic;
}

.use-action-panel {
  text-align: center;
  padding: 20px;
}

.action-panel-hint {
  color: v-bind('UI_COLORS.textMuted');
  margin: 0;
}

.hiring-merc-modal {
  display: flex;
  justify-content: center;
  padding: 10px;
}
</style>
