<script setup lang="ts">
import { computed } from 'vue';
import type { UseActionControllerReturn } from '@boardsmith/ui';
import CombatantIconSmall from './CombatantIconSmall.vue';

interface MercData {
  combatantId?: string;
  combatantName?: string;
  image?: string;
  damage?: number;
  maxHealth?: number;
  actionsRemaining?: number;
  ref?: number;
  isDictator?: boolean;
}

interface SquadData {
  squadId: string;
  isPrimary: boolean;
  isBase?: boolean;
  sectorId?: string;
  sectorName?: string;
  mercs: MercData[];
}

const props = defineProps<{
  playerColor: string;
  primarySquad?: SquadData;
  secondarySquad?: SquadData;
  baseSquad?: SquadData;
  actionController: UseActionControllerReturn;
  actionArgs: Record<string, unknown>;
  isDictator: boolean;
}>();

// ============================================================================
// STATE DERIVED FROM ACTION CONTROLLER (not local state)
// ============================================================================

// Which combatant is selected (from action args)
const selectedCombatantName = computed(() =>
  props.actionArgs['combatantName'] as string | undefined
);

// Which selection step we're on
const currentSelectionStep = computed(() =>
  props.actionController.currentSelection.value?.name
);

const isSelectingCombatant = computed(() =>
  currentSelectionStep.value === 'combatantName'
);

const isSelectingTarget = computed(() =>
  currentSelectionStep.value === 'targetSquad'
);

// Find the selected combatant object for highlighting
const selectedCombatant = computed((): MercData | null => {
  if (!selectedCombatantName.value) return null;
  const allCombatants: MercData[] = [];
  if (props.primarySquad) allCombatants.push(...props.primarySquad.mercs);
  if (props.secondarySquad) allCombatants.push(...props.secondarySquad.mercs);
  if (props.baseSquad) allCombatants.push(...props.baseSquad.mercs);
  return allCombatants.find(m => getCombatantName(m) === selectedCombatantName.value) || null;
});

// Find which squad contains the selected combatant
const selectedCombatantSquad = computed((): SquadData | null => {
  if (!selectedCombatant.value) return null;
  return findSquadContaining(selectedCombatant.value);
});

// Get valid target squad choices from action controller
const validTargetChoices = computed(() => {
  const sel = props.actionController.currentSelection.value;
  if (sel?.name === 'targetSquad') {
    return props.actionController.getChoices(sel) || [];
  }
  return [];
});

// Helper to get attribute from merc data (handles different data structures)
function getAttr<T>(node: any, key: string, defaultVal: T): T {
  if (node?.attributes && node.attributes[key] !== undefined) return node.attributes[key];
  if (node && node[key] !== undefined) return node[key];
  return defaultVal;
}

// Get combatant ID (handles nested attributes)
function getCombatantId(merc: MercData): string {
  return getAttr(merc, 'combatantId', '') || getAttr(merc, 'id', '') || (merc as any).ref || 'unknown';
}

// Get combatant display name
function getCombatantName(merc: MercData): string {
  const rawName = getAttr(merc, 'combatantName', '') || getAttr(merc, 'name', '') || getCombatantId(merc);
  // Remove "merc-" or "dictator-" prefix if present and capitalize
  const cleanName = rawName.replace(/^(merc-|dictator-)/i, '');
  return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
}

// Get combatant image path
function getMercImagePath(merc: MercData): string {
  const image = getAttr(merc, 'image', '');
  if (image) return image;
  return '';
}

// Get combatant key for v-for
function getCombatantKey(merc: MercData): string {
  const id = getAttr(merc, 'combatantId', '') || getAttr(merc, 'ref', '');
  return id ? String(id) : Math.random().toString();
}

// Get squad label for display
function getSquadLabel(squad: SquadData): string {
  if (squad.isBase) return 'Base Squad';
  return squad.isPrimary ? 'Primary Squad' : 'Secondary Squad';
}

// Find which squad contains a combatant
function findSquadContaining(combatant: MercData): SquadData | null {
  const combatantId = getAttr(combatant, 'combatantId', '');

  for (const squad of [props.primarySquad, props.secondarySquad, props.baseSquad]) {
    if (!squad) continue;
    if (squad.mercs.some(m => getAttr(m, 'combatantId', '') === combatantId)) {
      return squad;
    }
  }
  return null;
}

// Check if a squad is a valid target (derived from action controller choices)
function isValidTarget(squad: SquadData): boolean {
  if (!isSelectingTarget.value) return false;
  const squadLabel = getSquadLabel(squad);
  return validTargetChoices.value.some((c: any) => {
    const choiceDisplay = typeof c === 'string' ? c : (c.display || c.value || '');
    return choiceDisplay.includes(squadLabel.split(' ')[0]);
  });
}

// Handle combatant click - uses fill() for bidirectional sync with action panel
async function handleCombatantClick(merc: MercData) {
  const sel = props.actionController.currentSelection.value;
  if (sel?.name !== 'combatantName') return;

  const combatantName = getCombatantName(merc);
  await props.actionController.fill('combatantName', combatantName);
}

// Handle squad click (for transfer) - uses fill() for bidirectional sync
async function handleSquadClick(targetSquad: SquadData) {
  if (!isSelectingTarget.value) return;
  if (!isValidTarget(targetSquad)) return;
  if (!selectedCombatant.value) return;

  const targetLabel = getSquadLabel(targetSquad);
  const choices = validTargetChoices.value;
  const match = choices.find((c: any) => {
    const choiceDisplay = typeof c === 'string' ? c : (c.display || c.value || '');
    return choiceDisplay.includes(targetLabel.split(' ')[0]);
  });

  if (match) {
    const choiceValue = typeof match === 'string' ? match : (match.value ?? match.display);
    await props.actionController.fill('targetSquad', choiceValue);
  }
}

// Cancel selection (go back to combatant selection step)
function handleCancelSelection() {
  props.actionController.cancel();
  props.actionController.start('assignToSquad', {});
}

// Check if combatant is selected (derived from action args)
function isCombatantSelected(merc: MercData): boolean {
  if (!selectedCombatantName.value) return false;
  return getCombatantName(merc) === selectedCombatantName.value;
}
</script>

<template>
  <div class="assign-to-squad">
    <div class="header">
      <h3 class="title">Assign to Squad</h3>
      <p v-if="isSelectingCombatant" class="subtitle">
        Select a combatant to reassign
      </p>
      <p v-else-if="isSelectingTarget && selectedCombatant" class="subtitle highlight">
        Select target squad for {{ getCombatantName(selectedCombatant) }}
      </p>
    </div>

    <div class="squads-container">
      <!-- Primary Squad -->
      <div
        v-if="primarySquad"
        class="squad-panel"
        data-squad="Primary"
        :class="{
          'valid-target': isSelectingTarget && isValidTarget(primarySquad),
          'source-squad': selectedCombatantSquad?.squadId === primarySquad.squadId
        }"
                @click="handleSquadClick(primarySquad)"
      >
        <div class="squad-header">
          <span class="squad-label">Primary</span>
          <span v-if="primarySquad.sectorName" class="squad-location">
            {{ primarySquad.sectorName }}
          </span>
        </div>

        <div class="combatants-list" v-if="primarySquad.mercs.length > 0">
          <div
            v-for="merc in primarySquad.mercs"
            :key="getCombatantKey(merc)"
                        :data-combatant="getCombatantName(merc)"
            class="combatant-item"
            :class="{ 'selected': isCombatantSelected(merc) }"
            @click.stop="handleCombatantClick(merc)"
          >
            <CombatantIconSmall
              :image="getMercImagePath(merc)"
              :combatant-id="getCombatantId(merc)"
              :alt="getCombatantName(merc)"
              :player-color="playerColor"
              :size="40"
            />
            <span class="combatant-name">{{ getCombatantName(merc) }}</span>
          </div>
        </div>
        <div v-else class="empty-squad">Empty</div>
      </div>

      <!-- Secondary Squad -->
      <div
        v-if="secondarySquad"
        class="squad-panel"
        data-squad="Secondary"
        :class="{
          'valid-target': isSelectingTarget && isValidTarget(secondarySquad),
          'source-squad': selectedCombatantSquad?.squadId === secondarySquad.squadId
        }"
                @click="handleSquadClick(secondarySquad)"
      >
        <div class="squad-header">
          <span class="squad-label">Secondary</span>
          <span v-if="secondarySquad.sectorName" class="squad-location">
            {{ secondarySquad.sectorName }}
          </span>
        </div>

        <div class="combatants-list" v-if="secondarySquad.mercs.length > 0">
          <div
            v-for="merc in secondarySquad.mercs"
            :key="getCombatantKey(merc)"
                        :data-combatant="getCombatantName(merc)"
            class="combatant-item"
            :class="{ 'selected': isCombatantSelected(merc) }"
            @click.stop="handleCombatantClick(merc)"
          >
            <CombatantIconSmall
              :image="getMercImagePath(merc)"
              :combatant-id="getCombatantId(merc)"
              :alt="getCombatantName(merc)"
              :player-color="playerColor"
              :size="40"
            />
            <span class="combatant-name">{{ getCombatantName(merc) }}</span>
          </div>
        </div>
        <div v-else class="empty-squad">Empty</div>
      </div>

      <!-- Base Squad (Dictator only) -->
      <div
        v-if="baseSquad && isDictator"
        class="squad-panel"
        data-squad="Base"
        :class="{
          'valid-target': isSelectingTarget && isValidTarget(baseSquad),
          'source-squad': selectedCombatantSquad?.squadId === baseSquad.squadId
        }"
                @click="handleSquadClick(baseSquad)"
      >
        <div class="squad-header">
          <span class="squad-label">Base</span>
          <span v-if="baseSquad.sectorName" class="squad-location">
            {{ baseSquad.sectorName }}
          </span>
        </div>

        <div class="combatants-list" v-if="baseSquad.mercs.length > 0">
          <div
            v-for="merc in baseSquad.mercs"
            :key="getCombatantKey(merc)"
                        :data-combatant="getCombatantName(merc)"
            class="combatant-item"
            :class="{ 'selected': isCombatantSelected(merc) }"
            @click.stop="handleCombatantClick(merc)"
          >
            <CombatantIconSmall
              :image="getMercImagePath(merc)"
              :combatant-id="getCombatantId(merc)"
              :alt="getCombatantName(merc)"
              :player-color="playerColor"
              :size="40"
            />
            <span class="combatant-name">{{ getCombatantName(merc) }}</span>
          </div>
        </div>
        <div v-else class="empty-squad">Empty</div>
      </div>
    </div>

    <!-- Cancel selection button -->
    <div v-if="isSelectingTarget" class="actions">
      <button class="cancel-btn" @click="handleCancelSelection">
        Back
      </button>
    </div>
  </div>
</template>

<style scoped>
.assign-to-squad {
  background: rgba(30, 35, 30, 0.95);
  border: 2px solid #5a6a5a;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.header {
  text-align: center;
  margin-bottom: 12px;
}

.title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #d4a84b;
  margin: 0 0 4px 0;
}

.subtitle {
  font-size: 0.85rem;
  color: #a0a0a0;
  margin: 0;
}

.subtitle.highlight {
  color: #d4a84b;
  font-weight: 500;
}

.squads-container {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.squad-panel {
  background: rgba(60, 75, 60, 0.95);
  border: 2px solid #5a6a5a;
  border-radius: 8px;
  padding: 12px;
  min-width: 160px;
  max-width: 220px;
  flex: 1;
  transition: all 0.2s ease;
  cursor: default;
}

.squad-panel.valid-target {
  border-color: #d4a84b;
  cursor: pointer;
  animation: pulse-border 1.5s infinite;
}

.squad-panel.valid-target:hover {
  background: rgba(212, 168, 75, 0.15);
  box-shadow: 0 0 12px rgba(212, 168, 75, 0.4);
}

.squad-panel.source-squad {
  border-color: #5a6a5a;
  opacity: 0.6;
}

@keyframes pulse-border {
  0%, 100% {
    border-color: #d4a84b;
    box-shadow: 0 0 6px rgba(212, 168, 75, 0.3);
  }
  50% {
    border-color: #e8c77b;
    box-shadow: 0 0 12px rgba(212, 168, 75, 0.5);
  }
}

.squad-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #5a6a5a;
}

.squad-label {
  font-weight: 600;
  font-size: 0.9rem;
  color: #f0f0f0;
}

.squad-location {
  font-size: 0.75rem;
  color: #a0a0a0;
  font-style: italic;
}

.combatants-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.combatant-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: rgba(30, 35, 30, 0.5);
  border: 2px solid transparent;
}

.combatant-item:hover {
  background: rgba(212, 168, 75, 0.15);
}

.combatant-item.selected {
  border-color: #d4a84b;
  background: rgba(212, 168, 75, 0.25);
  box-shadow: 0 0 8px rgba(212, 168, 75, 0.4);
}

.combatant-name {
  font-size: 0.85rem;
  font-weight: 500;
  color: #f0f0f0;
}

.empty-squad {
  color: #707070;
  font-style: italic;
  font-size: 0.8rem;
  text-align: center;
  padding: 12px;
  background: rgba(30, 35, 30, 0.3);
  border-radius: 6px;
}

.actions {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}

.cancel-btn {
  padding: 6px 16px;
  background: rgba(30, 35, 30, 0.9);
  border: 1px solid #5a6a5a;
  border-radius: 4px;
  color: #a0a0a0;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s ease;
}

.cancel-btn:hover {
  background: rgba(60, 60, 60, 0.9);
  color: #f0f0f0;
  border-color: #d4a84b;
}
</style>
