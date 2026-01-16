<script setup lang="ts">
import { ref } from 'vue';
import { GameShell } from '@boardsmith/ui';
import GameBoard from './components/GameBoard.vue';
import CombatantIconSmall from './components/CombatantIconSmall.vue';
import DetailModal from './components/DetailModal.vue';
import CombatantCard from './components/CombatantCard.vue';
import { UI_COLORS } from './colors';

// Modal state for combatant details
const showCombatantModal = ref(false);
const selectedCombatant = ref<any>(null);
const selectedCombatantColor = ref<string>('');
const selectedCombatantSquadName = ref<string>('');
const selectedCombatantSectorName = ref<string>('');

function openCombatantModal(combatant: any, playerColor: string, squadName: string, sectorName: string) {
  selectedCombatant.value = combatant;
  selectedCombatantColor.value = playerColor;
  selectedCombatantSquadName.value = squadName;
  selectedCombatantSectorName.value = sectorName;
  showCombatantModal.value = true;
}

function closeCombatantModal() {
  showCombatantModal.value = false;
  selectedCombatant.value = null;
}
</script>

<template>
  <GameShell
    game-type="MERC"
    display-name="MERC"
    :player-count="2"
    :default-a-i-players="[1]"
  >
    <template #game-board="{ state, gameView, playerPosition, isMyTurn, availableActions, actionArgs, actionController, setBoardPrompt }">
      <GameBoard
        :game-view="gameView"
        :player-position="playerPosition"
        :is-my-turn="isMyTurn"
        :available-actions="availableActions"
        :action-args="actionArgs"
        :action-controller="actionController"
        :set-board-prompt="setBoardPrompt"
        :state="state"
      />
    </template>

    <template #player-stats="{ player, gameView }">
      <div class="player-stat combatants-row">
        <span class="stat-label">MERCs:</span>
        <div class="combatant-icons">
          <CombatantIconSmall
            v-for="combatant in getCombatants(player, gameView)"
            :key="combatant.combatantId"
            :combatant-id="combatant.combatantId"
            :image="combatant.image"
            :alt="combatant.combatantName"
            :player-color="getPlayerColorName(player)"
            :size="28"
            :clickable="true"
            @click="openCombatantModal(combatant.attributes, getPlayerColorName(player), combatant.squadName, combatant.sectorName)"
          />
          <span v-if="getCombatants(player, gameView).length === 0" class="stat-value">0</span>
        </div>
      </div>
      <div class="player-stat">
        <span class="stat-label">Sectors:</span>
        <span class="stat-value">{{ getControlledSectors(player, gameView) }}</span>
      </div>
    </template>
  </GameShell>

  <!-- Combatant detail modal -->
  <DetailModal :show="showCombatantModal" @close="closeCombatantModal">
    <CombatantCard
      v-if="selectedCombatant"
      :merc="selectedCombatant"
      :player-color="selectedCombatantColor"
      :squad-name="selectedCombatantSquadName"
      :sector-name="selectedCombatantSectorName"
      :show-equipment="true"
    />
  </DetailModal>
</template>

<script lang="ts">
// Helper to normalize class names for comparison
function normalizeClassName(name: string | undefined): string {
  if (!name) return '';
  return name.replace(/^_/, '');
}

interface CombatantInfo {
  combatantId: string;
  combatantName: string;
  image: string;
  // Full attributes for CombatantCard modal
  attributes: Record<string, any>;
  // Squad and sector info for modal display
  squadName: string;
  sectorName: string;
}

// Helper functions for player stats
function getCombatants(player: any, gameView: any): CombatantInfo[] {
  if (!gameView?.children) return [];

  const playerAttrs = player.attributes || player;
  const primaryRef = playerAttrs.primarySquadRef;
  const secondaryRef = playerAttrs.secondarySquadRef;
  const hiredMercsRef = playerAttrs.hiredMercsSquadRef;
  const baseSquadRef = playerAttrs.baseSquadRef;
  const dictatorRef = playerAttrs.dictatorRef;

  const combatants: CombatantInfo[] = [];
  const seenIds = new Set<string>();

  // Build a map of sectorId -> sectorName for resolving sector locations
  const sectorNames = new Map<string, string>();
  function buildSectorMap(node: any) {
    if (!node) return;
    const attrs = node.attributes || {};
    const className = normalizeClassName(node.className);
    if (className === 'Sector' && attrs.sectorId && attrs.sectorName) {
      sectorNames.set(attrs.sectorId, attrs.sectorName);
    }
    if (node.children) {
      for (const child of node.children) {
        buildSectorMap(child);
      }
    }
  }
  buildSectorMap(gameView);

  function addCombatant(attrs: any, squadName: string, sectorName: string) {
    const id = attrs.combatantId || '';
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      combatants.push({
        combatantId: id,
        combatantName: attrs.combatantName || id,
        image: attrs.image || '',
        attributes: { ...attrs },
        squadName,
        sectorName,
      });
    }
  }

  function search(node: any) {
    if (!node) return;
    const attrs = node.attributes || {};
    const className = normalizeClassName(node.className);

    // Check if this is the player's dictator card
    if (className === 'CombatantModel' && attrs.name === dictatorRef) {
      // For dictator, resolve sector from their sectorId attribute
      const sectorName = attrs.sectorId ? (sectorNames.get(attrs.sectorId) || '') : '';
      addCombatant(attrs, '', sectorName);
    }

    // Check if this is one of the player's squads
    let squadName = '';
    if (className === 'Squad') {
      if (attrs.name === primaryRef) squadName = 'Primary';
      else if (attrs.name === secondaryRef) squadName = 'Secondary';
      else if (attrs.name === hiredMercsRef) squadName = 'Hired';
      else if (attrs.name === baseSquadRef) squadName = 'Base';
    }

    if (squadName && node.children) {
      // Resolve the squad's sector location
      const squadSectorId = attrs.sectorId || '';
      const sectorName = squadSectorId ? (sectorNames.get(squadSectorId) || '') : '';

      for (const child of node.children) {
        const childAttrs = child.attributes || {};
        if (childAttrs.combatantId) {
          addCombatant(childAttrs, squadName, sectorName);
        }
      }
    }

    if (node.children) {
      for (const child of node.children) {
        search(child);
      }
    }
  }
  search(gameView);
  return combatants;
}

function getPlayerColorName(player: any): string {
  const playerAttrs = player.attributes || player;
  return playerAttrs.playerColor || '';
}

function getControlledSectors(player: any, gameView: any): number {
  if (!gameView?.children) return 0;

  const playerAttrs = player.attributes || player;
  const playerId = String(playerAttrs.position);
  const primaryRef = playerAttrs.primarySquadRef;
  const secondaryRef = playerAttrs.secondarySquadRef;

  // First, find sector IDs where player's squads are located
  const squadSectorIds = new Set<string>();
  function findSquadSectors(node: any) {
    if (!node) return;
    const attrs = node.attributes || {};
    const className = normalizeClassName(node.className);

    if (className === 'Squad' && (attrs.name === primaryRef || attrs.name === secondaryRef)) {
      if (attrs.sectorId) {
        squadSectorIds.add(attrs.sectorId);
      }
    }
    if (node.children) {
      for (const child of node.children) {
        findSquadSectors(child);
      }
    }
  }
  findSquadSectors(gameView);

  // Count sectors where player has presence (militia or squad)
  let count = 0;
  const countedSectors = new Set<string>();
  function countSectors(node: any) {
    if (!node) return;
    const attrs = node.attributes || {};
    const className = normalizeClassName(node.className);

    if (className === 'Sector' && attrs.sectorId) {
      const sectorId = attrs.sectorId;
      if (!countedSectors.has(sectorId)) {
        // Check if player has militia in this sector
        const rebelMilitia = attrs.rebelMilitia || {};
        const hasMilitia = rebelMilitia[playerId] > 0;
        // Check if player's squad is in this sector
        const hasSquad = squadSectorIds.has(sectorId);

        if (hasMilitia || hasSquad) {
          count++;
          countedSectors.add(sectorId);
        }
      }
    }
    if (node.children) {
      for (const child of node.children) {
        countSectors(child);
      }
    }
  }
  countSectors(gameView);
  return count;
}
</script>

<style scoped>
.player-stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  margin-top: 8px;
}

.player-stat.combatants-row {
  align-items: flex-start;
}

.combatant-icons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
}

.stat-label {
  color: #888;
}

.stat-value {
  font-weight: bold;
  color: v-bind('UI_COLORS.accent');
}
</style>
