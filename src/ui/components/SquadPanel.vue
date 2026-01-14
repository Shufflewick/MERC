<script setup lang="ts">
import { computed } from 'vue';
import CombatantCard from './CombatantCard.vue';
import { UI_COLORS, getPlayerColor } from '../colors';

interface MercData {
  mercId: string;
  mercName: string;
  image?: string;
  baseTraining?: number;
  baseCombat?: number;
  baseInitiative?: number;
  training?: number;
  combat?: number;
  initiative?: number;
  health?: number;
  maxHealth?: number;
  damage?: number;
  actionsRemaining?: number;
  ability?: string;
  weaponSlot?: { equipmentName?: string } | null;
  armorSlot?: { equipmentName?: string } | null;
  accessorySlot?: { equipmentName?: string } | null;
}

interface SquadData {
  squadId: string;
  isPrimary: boolean;
  sectorId?: string;
  sectorName?: string;
  mercs: MercData[];
}

const props = defineProps<{
  primarySquad?: SquadData;
  secondarySquad?: SquadData;
  baseSquad?: SquadData; // Dictator's base squad (third squad when at home)
  playerColor: string;
  canDropEquipment?: boolean;
  mercAbilitiesAvailable?: string[]; // List of mercIds that have abilities available
}>();

const emit = defineEmits<{
  dropEquipment: [mercId: number, equipmentId: number];
  activateAbility: [mercId: string];
}>();

function handleDropEquipment(mercId: number, equipmentId: number) {
  emit('dropEquipment', mercId, equipmentId);
}

function handleActivateAbility(mercId: string) {
  emit('activateAbility', mercId);
}

// Check if a MERC has their ability available
function isMercAbilityAvailable(merc: MercData): boolean {
  const mercId = merc.mercId || (merc as any).attributes?.mercId;
  return props.mercAbilitiesAvailable?.includes(mercId) || false;
}

// Get unique key for merc - never returns empty to prevent Vue warnings
let mercKeyCounter = 0;
function getMercKey(merc: MercData, index: number): string {
  return merc.mercId || merc.mercName || `merc-${index}-${++mercKeyCounter}`;
}

const borderColor = computed(() => getPlayerColor(props.playerColor));

const hasPrimaryMercs = computed(() => (props.primarySquad?.mercs?.length || 0) > 0);
const hasSecondaryMercs = computed(() => (props.secondarySquad?.mercs?.length || 0) > 0);
const hasBaseMercs = computed(() => (props.baseSquad?.mercs?.length || 0) > 0);
</script>

<template>
  <div class="squad-panel" :style="{ '--player-color': borderColor }">
    <div class="panel-header">
      <span class="header-icon">&#128101;</span>
      <span class="header-title">Your Squad</span>
    </div>

    <!-- Primary Squad -->
    <div class="squad-section" v-if="primarySquad">
      <div class="squad-header">
        <span class="squad-label">Primary Squad</span>
        <span class="squad-location" v-if="primarySquad.sectorName">
          @ {{ primarySquad.sectorName }}
        </span>
      </div>
      <div class="mercs-list" v-if="hasPrimaryMercs">
        <CombatantCard
          v-for="(merc, index) in primarySquad.mercs"
          :key="getMercKey(merc, index)"
          :merc="merc"
          :player-color="playerColor"
          :squad-name="'Primary'"
          :show-equipment="true"
          :can-drop-equipment="canDropEquipment"
          :ability-available="isMercAbilityAvailable(merc)"
          @drop-equipment="handleDropEquipment"
          @activate-ability="handleActivateAbility"
        />
      </div>
      <div class="empty-squad" v-else>
        No MERCs in primary squad
      </div>
    </div>

    <!-- Secondary Squad -->
    <div class="squad-section secondary" v-if="secondarySquad">
      <div class="squad-header">
        <span class="squad-label">Secondary Squad</span>
        <span class="squad-location" v-if="secondarySquad.sectorName">
          @ {{ secondarySquad.sectorName }}
        </span>
      </div>
      <div class="mercs-list" v-if="hasSecondaryMercs">
        <CombatantCard
          v-for="(merc, index) in secondarySquad.mercs"
          :key="getMercKey(merc, 100 + index)"
          :merc="merc"
          :player-color="playerColor"
          :squad-name="'Secondary'"
          :show-equipment="true"
          :can-drop-equipment="canDropEquipment"
          :ability-available="isMercAbilityAvailable(merc)"
          @drop-equipment="handleDropEquipment"
          @activate-ability="handleActivateAbility"
        />
      </div>
      <div class="empty-squad" v-else>
        No MERCs in secondary squad
      </div>
    </div>

    <!-- Base Squad (Dictator's home location) -->
    <div class="squad-section base" v-if="baseSquad">
      <div class="squad-header">
        <span class="squad-label">🏠 Base</span>
        <span class="squad-location" v-if="baseSquad.sectorName">
          @ {{ baseSquad.sectorName }}
        </span>
      </div>
      <div class="mercs-list" v-if="hasBaseMercs">
        <CombatantCard
          v-for="(merc, index) in baseSquad.mercs"
          :key="getMercKey(merc, 200 + index)"
          :merc="merc"
          :player-color="playerColor"
          :squad-name="'Base'"
          :show-equipment="true"
          :can-drop-equipment="canDropEquipment"
          :ability-available="isMercAbilityAvailable(merc)"
          @drop-equipment="handleDropEquipment"
          @activate-ability="handleActivateAbility"
        />
      </div>
      <div class="empty-squad" v-else>
        Dictator is away from base
      </div>
    </div>

    <!-- No squads message -->
    <div class="no-squads" v-if="!primarySquad && !secondarySquad && !baseSquad">
      No squads available
    </div>
  </div>
</template>

<style scoped>
.squad-panel {
  background: v-bind('UI_COLORS.cardBg');
  border-radius: 12px;
  padding: 16px;
  color: v-bind('UI_COLORS.text');
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--player-color);
}

.header-icon {
  font-size: 1.2rem;
}

.header-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: v-bind('UI_COLORS.accent');
}

.squad-section {
  margin-bottom: 20px;
}

.squad-section.secondary {
  padding-top: 16px;
  border-top: 1px solid v-bind('UI_COLORS.border');
}

.squad-section.base {
  padding-top: 16px;
  border-top: 1px solid v-bind('UI_COLORS.border');
}

.squad-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.squad-label {
  font-weight: 600;
  font-size: 0.95rem;
}

.squad-location {
  font-size: 0.8rem;
  color: v-bind('UI_COLORS.textMuted');
  font-style: italic;
}

.mercs-list {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 12px;
}

.empty-squad {
  color: v-bind('UI_COLORS.textMuted');
  font-style: italic;
  font-size: 0.9rem;
  padding: 12px;
  text-align: center;
  background: v-bind('UI_COLORS.backgroundLight');
  border-radius: 8px;
}

.no-squads {
  color: v-bind('UI_COLORS.textMuted');
  font-style: italic;
  text-align: center;
  padding: 20px;
}

/* Scrollbar styling */
.squad-panel::-webkit-scrollbar {
  width: 6px;
}

.squad-panel::-webkit-scrollbar-track {
  background: v-bind('UI_COLORS.backgroundLight');
  border-radius: 3px;
}

.squad-panel::-webkit-scrollbar-thumb {
  background: v-bind('UI_COLORS.border');
  border-radius: 3px;
}
</style>
