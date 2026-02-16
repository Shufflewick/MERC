<script setup lang="ts">
import { UI_COLORS } from '../colors';
import DrawEquipmentType from './DrawEquipmentType.vue';
import EquipmentCard from './EquipmentCard.vue';
import CombatantIcon from './CombatantIcon.vue';

export interface HagnessSquadMate {
  displayName: string;
  combatantId: string;
  image: string;
  choice: { value: string };
}

interface Props {
  isSelectingType: boolean;
  isSelectingFromDrawn: boolean;
  isSelectingRecipient: boolean;
  equipmentTypeChoices: Array<{ value: string; label: string }>;
  drawnChoices: any[];
  drawnEquipment: any | null;
  squadMates: HagnessSquadMate[];
  playerColor: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'equipment-type-selected': [value: string];
  'equipment-selected': [name: string];
  'recipient-selected': [choice: { value: string }];
}>();

function handleEquipmentTypeSelect(value: string) {
  emit('equipment-type-selected', value);
}

function handleEquipmentSelect(name: string) {
  emit('equipment-selected', name);
}

function handleRecipientSelect(choice: { value: string }) {
  emit('recipient-selected', choice);
}
</script>

<template>
  <div class="hagness-phase">
    <div class="hagness-header">
      <div class="hagness-icon">🎒</div>
      <div class="hagness-content">
        <h2 class="hagness-title">Hagness: Draw Equipment</h2>
        <p class="hagness-prompt">
          {{ isSelectingType ? 'Choose equipment type to draw' : isSelectingFromDrawn ? 'Choose 1 of 3 drawn equipment' : isSelectingRecipient ? 'Choose who receives the equipment' : 'Drawing equipment...' }}
        </p>
      </div>
    </div>

    <!-- Step 1a: Equipment type selection -->
    <DrawEquipmentType
      v-if="isSelectingType && equipmentTypeChoices.length > 0"
      :choices="equipmentTypeChoices"
      prompt="Choose equipment type:"
      @select="handleEquipmentTypeSelect"
    />

    <!-- Step 1b: Pick 1 from 3 drawn equipment -->
    <div class="hagness-drawn-choices" v-else-if="isSelectingFromDrawn && drawnChoices.length > 0">
      <div
        v-for="(equip, index) in drawnChoices"
        :key="index"
        class="hagness-choice-card"
        @click="handleEquipmentSelect(equip.equipmentName)"
      >
        <EquipmentCard :equipment="equip" />
      </div>
    </div>

    <!-- Step 2: Show drawn equipment and recipient selection -->
    <div class="hagness-equipment-display" v-else-if="isSelectingRecipient">
      <!-- Show drawn equipment card -->
      <div class="hagness-drawn-section" v-if="drawnEquipment">
        <EquipmentCard :equipment="drawnEquipment" />
      </div>
      <div v-else class="no-equipment">
        <p>No equipment was drawn from the deck.</p>
      </div>

      <!-- Recipient selection -->
      <div class="hagness-recipient-section" v-if="squadMates.length > 0">
        <p class="recipient-label">Give to:</p>
        <div class="recipient-icons">
          <CombatantIcon
            v-for="mate in squadMates"
            :key="mate.displayName"
            :combatant-id="mate.combatantId"
            :combatant-name="mate.displayName"
            :image="mate.image"
            :player-color="playerColor"
            size="large"
            clickable
            @click="handleRecipientSelect(mate.choice)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Hagness Draw Equipment UI */
.hagness-phase {
  background: v-bind('UI_COLORS.cardBg');
  border: 2px solid #81d4a8; /* mint green for Hagness */
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 20px;
}

.hagness-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.hagness-icon {
  font-size: 2.5rem;
}

.hagness-content {
  flex: 1;
}

.hagness-title {
  color: #81d4a8; /* mint green */
  font-size: 1.4rem;
  margin: 0 0 4px;
  font-weight: 700;
}

.hagness-prompt {
  color: v-bind('UI_COLORS.text');
  margin: 0;
  font-size: 1rem;
}

/* Draw 3 choices layout */
.hagness-drawn-choices {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
  padding: 16px;
}

.hagness-choice-card {
  cursor: pointer;
  border-radius: 8px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.hagness-choice-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 16px rgba(129, 212, 168, 0.4);
}

.hagness-equipment-display {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
  padding: 16px;
}

.hagness-drawn-section {
  display: flex;
  justify-content: center;
  flex: 1 1 auto;
  min-width: 280px;
}

.hagness-recipient-section {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-left: auto;
  text-align: right;
}

.recipient-label {
  color: v-bind('UI_COLORS.text');
  font-size: 1rem;
  margin: 0 0 12px;
  font-weight: 600;
}

.recipient-icons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.no-equipment {
  text-align: center;
  padding: 20px;
  color: v-bind('UI_COLORS.textMuted');
  font-style: italic;
}

/* On narrow screens, stack vertically and center */
@media (max-width: 600px) {
  .hagness-drawn-choices {
    flex-direction: column;
    align-items: center;
  }

  .hagness-equipment-display {
    flex-direction: column;
  }

  .hagness-recipient-section {
    align-items: center;
    margin-left: 0;
    text-align: center;
    width: 100%;
  }

  .recipient-icons {
    justify-content: center;
  }
}
</style>
