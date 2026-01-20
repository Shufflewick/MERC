<script setup lang="ts">
import { computed } from 'vue';
import CombatantCard from './CombatantCard.vue';
import { UI_COLORS, getPlayerColor } from '../colors';

interface MercData {
  combatantId?: string;
  combatantName?: string;
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
  mercAbilitiesAvailable?: string[]; // List of combatantIds that have abilities available
  canAssignToSquad?: boolean; // Whether the assignToSquad action is available
  flyingCombatantName?: string | null; // Name of combatant currently animating (hide during animation)
}>();

// Check if a merc should be hidden (currently animating)
function isMercFlying(merc: MercData): boolean {
  if (!props.flyingCombatantName) return false;
  const mercName = merc.combatantName || (merc as any).attributes?.combatantName || '';
  // Compare case-insensitively since displayName is capitalized but combatantName may not be
  return mercName.toLowerCase() === props.flyingCombatantName.toLowerCase();
}

const emit = defineEmits<{
  dropEquipment: [combatantElementId: number, equipmentId: number];
  activateAbility: [combatantId: string];
  assignToSquad: [];
  reassignCombatant: [combatantName: string];
}>();

function handleDropEquipment(combatantElementId: number, equipmentId: number) {
  emit('dropEquipment', combatantElementId, equipmentId);
}

function handleActivateAbility(combatantId: string) {
  emit('activateAbility', combatantId);
}

function handleAssignToSquad() {
  emit('assignToSquad');
}

function handleReassignCombatant(combatantName: string) {
  emit('reassignCombatant', combatantName);
}

// Check if a MERC has their ability available
function isMercAbilityAvailable(merc: MercData): boolean {
  const id = merc.combatantId || (merc as any).attributes?.combatantId;
  return props.mercAbilitiesAvailable?.includes(id) || false;
}

// Get unique key for combatant - never returns empty to prevent Vue warnings
let mercKeyCounter = 0;
function getMercKey(merc: MercData, index: number): string {
  return merc.combatantId || merc.combatantName || `merc-${index}-${++mercKeyCounter}`;
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
      <button
        v-if="canAssignToSquad"
        class="transfer-btn"
        @click="handleAssignToSquad"
        title="Transfer combatants between squads"
      >
        <span class="transfer-icon">&#8644;</span>
        <span class="transfer-label">Transfer</span>
      </button>
    </div>

    <!-- Primary Squad -->
    <div class="squad-section" v-if="primarySquad" data-squad="Primary">
      <div class="squad-header">
        <span class="squad-label">Primary Squad</span>
        <span class="squad-location" v-if="primarySquad.sectorName">
          @ {{ primarySquad.sectorName }}
        </span>
      </div>
      <div class="mercs-list" v-if="hasPrimaryMercs">
        <div
          v-for="(merc, index) in primarySquad.mercs"
          :key="getMercKey(merc, index)"
          :class="{ 'merc-flying': isMercFlying(merc) }"
        >
          <CombatantCard
            :merc="merc"
            :player-color="playerColor"
            :squad-name="'Primary'"
            :sector-name="primarySquad.sectorName"
            :show-equipment="true"
            :can-drop-equipment="canDropEquipment"
            :ability-available="isMercAbilityAvailable(merc)"
            :can-reassign="canAssignToSquad"
            @drop-equipment="handleDropEquipment"
            @activate-ability="handleActivateAbility"
            @reassign-combatant="handleReassignCombatant"
          />
        </div>
      </div>
      <div class="empty-squad" v-else>
        No MERCs in primary squad
      </div>
    </div>

    <!-- Secondary Squad -->
    <div class="squad-section secondary" v-if="secondarySquad" data-squad="Secondary">
      <div class="squad-header">
        <span class="squad-label">Secondary Squad</span>
        <span class="squad-location" v-if="secondarySquad.sectorName">
          @ {{ secondarySquad.sectorName }}
        </span>
      </div>
      <div class="mercs-list" v-if="hasSecondaryMercs">
        <div
          v-for="(merc, index) in secondarySquad.mercs"
          :key="getMercKey(merc, 100 + index)"
          :class="{ 'merc-flying': isMercFlying(merc) }"
        >
          <CombatantCard
            :merc="merc"
            :player-color="playerColor"
            :squad-name="'Secondary'"
            :sector-name="secondarySquad.sectorName"
            :show-equipment="true"
            :can-drop-equipment="canDropEquipment"
            :ability-available="isMercAbilityAvailable(merc)"
            :can-reassign="canAssignToSquad"
            @drop-equipment="handleDropEquipment"
            @activate-ability="handleActivateAbility"
            @reassign-combatant="handleReassignCombatant"
          />
        </div>
      </div>
      <div class="empty-squad" v-else>
        No MERCs in secondary squad
      </div>
    </div>

    <!-- Base Squad (Dictator's home location) -->
    <div class="squad-section base" v-if="baseSquad" data-squad="Base">
      <div class="squad-header">
        <span class="squad-label">🏠 Base</span>
        <span class="squad-location" v-if="baseSquad.sectorName">
          @ {{ baseSquad.sectorName }}
        </span>
      </div>
      <div class="mercs-list" v-if="hasBaseMercs">
        <div
          v-for="(merc, index) in baseSquad.mercs"
          :key="getMercKey(merc, 200 + index)"
          :class="{ 'merc-flying': isMercFlying(merc) }"
        >
          <CombatantCard
            :merc="merc"
            :player-color="playerColor"
            :squad-name="'Base'"
            :sector-name="baseSquad.sectorName"
            :show-equipment="true"
            :can-drop-equipment="canDropEquipment"
            :ability-available="isMercAbilityAvailable(merc)"
            :can-reassign="canAssignToSquad"
            @drop-equipment="handleDropEquipment"
            @activate-ability="handleActivateAbility"
            @reassign-combatant="handleReassignCombatant"
          />
        </div>
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
/* Hide merc card while it's being animated */
.merc-flying {
  visibility: hidden;
  height: 0;
  overflow: hidden;
  margin: 0;
  padding: 0;
}

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

/* Transfer button in header */
.transfer-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(30, 35, 30, 0.9);
  border: 1px solid v-bind('UI_COLORS.border');
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: v-bind('UI_COLORS.text');
}

.transfer-btn:hover {
  background: v-bind('UI_COLORS.accent');
  border-color: v-bind('UI_COLORS.accent');
  color: #1a1a1a;
}

.transfer-icon {
  font-size: 1.1rem;
}

.transfer-label {
  font-size: 0.85rem;
  font-weight: 600;
}
</style>
