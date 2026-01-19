<script setup lang="ts">
import { ref, watch } from 'vue';
import { GameShell, useActionAnimations, FlyingCardsOverlay } from 'boardsmith/ui';
import type { UseActionControllerReturn } from 'boardsmith/ui';
import GameBoard from './components/GameBoard.vue';
import CombatantIconSmall from './components/CombatantIconSmall.vue';
import DetailModal from './components/DetailModal.vue';
import CombatantCard from './components/CombatantCard.vue';
import { UI_COLORS } from './colors';
import { lastActionWasDragDrop } from './drag-drop-state';

// Modal state for combatant details
const showCombatantModal = ref(false);
const selectedCombatant = ref<any>(null);
const selectedCombatantColor = ref<string>('');
const selectedCombatantSquadName = ref<string>('');
const selectedCombatantSectorName = ref<string>('');

// Action animations setup
const gameViewRef = ref<any>(null);
const animationsRegistered = ref(false);

const actionAnimations = useActionAnimations({
  gameView: gameViewRef,
  animations: [
    {
      action: 'assignToSquad',
      elementSelection: 'combatantName',
      elementSelector: '[data-combatant="{combatantName}"]',
      // Use function-based selector because targetSquad values are like "Create Primary Squad" or "Primary Squad at X"
      destinationSelector: (args) => {
        const targetSquad = args.targetSquad as string;
        if (!targetSquad) return null;
        // Match the logic in rebel-movement.ts
        if (targetSquad.includes('Primary')) {
          return document.querySelector('[data-squad="Primary"]');
        } else if (targetSquad.includes('Secondary')) {
          return document.querySelector('[data-squad="Secondary"]');
        } else if (targetSquad.includes('Base')) {
          return document.querySelector('[data-squad="Base"]');
        }
        return null;
      },
      getElementData: (el) => ({
        innerHTML: el.innerHTML,
        className: el.className,
      }),
      duration: 500,
      elementSize: { width: 180, height: 52 },
    },
  ],
});

// Register animations when actionController becomes available
function setupAnimations(actionController: UseActionControllerReturn, gameView: any) {
  if (animationsRegistered.value) return;
  gameViewRef.value = gameView;
  actionController.registerBeforeAutoExecute(async (actionName, args) => {
    // Skip animation if this action was triggered via drag-and-drop
    // (the user already moved the element visually)
    if (lastActionWasDragDrop.value) {
      lastActionWasDragDrop.value = false;
      return;
    }

    await actionAnimations.onBeforeAutoExecute(actionName, args);
  });
  animationsRegistered.value = true;
}

// Keep gameViewRef in sync with slot prop
function syncGameView(gameView: any) {
  gameViewRef.value = gameView;
}

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
        @vue:mounted="setupAnimations(actionController, gameView)"
        @vue:updated="syncGameView(gameView)"
      />
      <FlyingCardsOverlay :flying-cards="actionAnimations.flyingElements.value">
        <template #card="{ card }">
          <div
            v-if="card.cardData?.innerHTML"
            v-html="card.cardData.innerHTML"
            :class="card.cardData.className"
            style="display: flex; align-items: center; gap: 8px; padding: 6px; background: rgba(60, 75, 60, 0.95); border: 2px solid #d4a84b; border-radius: 8px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);"
          />
        </template>
      </FlyingCardsOverlay>
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
