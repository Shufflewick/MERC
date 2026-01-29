<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { GameShell, useActionAnimations, FlyingCardsOverlay, createAnimationEvents, provideAnimationEvents } from 'boardsmith/ui';
import type { UseActionControllerReturn } from 'boardsmith/ui';
import GameTable from './components/GameTable.vue';
import CombatantIconSmall from './components/CombatantIconSmall.vue';
import { UI_COLORS } from './colors';
import { lastActionWasDragDrop, quickReassignInProgress } from './drag-drop-state';

// =============================================================================
// Animation Events Setup (must be provided before GameShell renders ActionPanel)
// =============================================================================

// Store refs from slot for animation events - these get updated when GameTable mounts
const slotState = ref<any>(null);
const slotActionController = ref<UseActionControllerReturn | null>(null);

// Computed getter for animation events from state
const animationEventsFromState = computed(() => {
  const state = slotState.value;
  if (!state) return [];
  return state.state?.animationEvents || state.animationEvents || [];
});

// Create animation events context - uses the reactive refs
const animationEvents = createAnimationEvents({
  events: () => animationEventsFromState.value,
  acknowledge: (upToId) => {
    // Execute the acknowledgeAnimations action to tell the server we've processed events
    const controller = slotActionController.value;
    if (controller) {
      controller.execute('acknowledgeAnimations', { upToId }).catch(() => {
        // Ignore errors - action may fail if already acknowledged or not available
      });
    }
  },
});

// Provide animation events so ActionPanel and child components can access them
provideAnimationEvents(animationEvents);

// Combatant modal data - passed to GameTable which renders the modal inside GameShell
const headerCombatantData = ref<{
  combatant: any;
  color: string;
  squadName: string;
  sectorName: string;
} | null>(null);

// Track which combatant is currently animating (to hide at destination)
const flyingCombatantName = ref<string | null>(null);

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
        let squadType = '';
        if (targetSquad.includes('Primary')) {
          squadType = 'Primary';
        } else if (targetSquad.includes('Secondary')) {
          squadType = 'Secondary';
        } else if (targetSquad.includes('Base')) {
          squadType = 'Base';
        }

        // Prefer SquadPanel's .squad-section over AssignToSquadPanel's .squad-panel
        // This ensures animation targets the visible squad in the main UI
        const squadPanelSelector = `.squad-section[data-squad="${squadType}"]`;
        let result = document.querySelector(squadPanelSelector);

        if (!result) {
          result = document.querySelector(`[data-squad="${squadType}"]`);
        }

        return result;
      },
      getElementData: (el) => {
        // Extract full data from the CombatantCard element
        const nameEl = el.querySelector('.merc-name');
        const iconEl = el.querySelector('.combatant-icon-small img') as HTMLImageElement;
        const badgeEl = el.querySelector('.squad-badge') as HTMLElement;
        const locationEl = el.querySelector('.sector-location');

        // Extract player color from the icon's border
        const iconBorderColor = iconEl?.style.borderColor || '#d4a84b';

        // Extract stats from the stats grid
        const statValues = el.querySelectorAll('.stats-grid .stat .stat-value');
        const training = statValues[0]?.textContent || '0';
        const combat = statValues[1]?.textContent || '0';
        const initiative = statValues[2]?.textContent || '0';
        const health = statValues[3]?.textContent || '3/3';
        const targets = statValues[4]?.textContent || '1';
        const actions = statValues[5]?.textContent || '2/2';

        // Extract ability text
        const abilityEl = el.querySelector('.ability-text');
        const ability = abilityEl?.textContent || '';

        // Extract equipment
        const equipSlots = el.querySelectorAll('.equipment-slot .slot-label');
        const weapon = equipSlots[0]?.textContent || '';
        const armor = equipSlots[1]?.textContent || '';
        const accessory = equipSlots[2]?.textContent || '';

        return {
          name: nameEl?.textContent || 'Unknown',
          image: iconEl?.src || '',
          iconBorderColor,
          squadBadge: badgeEl?.textContent || '',
          badgeColor: badgeEl?.style.backgroundColor || '#2d5a2d',
          location: locationEl?.textContent || '',
          training,
          combat,
          initiative,
          health,
          targets,
          actions,
          ability,
          weapon,
          armor,
          accessory,
        };
      },
      onStart: (args) => {
        flyingCombatantName.value = args.combatantName as string;
      },
      onComplete: () => {
        // Delay clearing to allow Vue to re-render the card with merc-flying class first
        setTimeout(() => {
          flyingCombatantName.value = null;
        }, 100);
      },
      duration: 500,
      elementSize: { width: 280, height: 340 },
    },
  ],
});

// Register animations when actionController becomes available
function setupAnimations(actionController: UseActionControllerReturn, gameView: any) {
  if (animationsRegistered.value) return;
  gameViewRef.value = gameView;
  actionController.registerBeforeAutoExecute(async (actionName, args) => {
    // Skip animation if this action was triggered via drag-and-drop
    if (lastActionWasDragDrop.value) {
      lastActionWasDragDrop.value = false;
      quickReassignInProgress.value = false;
      return;
    }

    // Set flyingCombatantName BEFORE animation starts to hide destination card immediately
    // (game state may update before the animation plays)
    if (actionName === 'assignToSquad' && args.combatantName) {
      flyingCombatantName.value = args.combatantName as string;
    }

    await actionAnimations.onBeforeAutoExecute(actionName, args);

    // Clear flyingCombatantName after animation duration + buffer (fallback)
    if (flyingCombatantName.value) {
      setTimeout(() => {
        flyingCombatantName.value = null;
      }, 600);
    }

    if (quickReassignInProgress.value) {
      quickReassignInProgress.value = false;
    }
  });
  animationsRegistered.value = true;
}

// Keep gameViewRef in sync with slot prop
function syncGameView(gameView: any) {
  gameViewRef.value = gameView;
}

function openCombatantModal(combatant: any, playerColor: string, squadName: string, sectorName: string) {
  headerCombatantData.value = {
    combatant,
    color: playerColor,
    squadName,
    sectorName,
  };
}

function closeHeaderCombatantModal() {
  headerCombatantData.value = null;
}
</script>

<template>
  <GameShell
    game-type="MERC"
    display-name="MERC"
    :player-count="2"
    :default-a-i-players="[1]"
  >
    <template #game-board="{ state, gameView, playerSeat, isMyTurn, availableActions, actionArgs, actionController, setBoardPrompt }">
      <GameTable
        :game-view="gameView"
        :player-seat="playerSeat"
        :is-my-turn="isMyTurn"
        :available-actions="availableActions"
        :action-args="actionArgs"
        :action-controller="actionController"
        :set-board-prompt="setBoardPrompt"
        :state="state"
        :flying-combatant-name="flyingCombatantName"
        :header-combatant-data="headerCombatantData"
        @animation-context-ready="(s, ac) => { slotState = s; slotActionController = ac; }"
        @vue:mounted="setupAnimations(actionController, gameView)"
        @vue:updated="syncGameView(gameView)"
        @close-header-combatant-modal="closeHeaderCombatantModal"
      />
      <FlyingCardsOverlay :flying-cards="actionAnimations.flyingElements.value">
        <template #card="{ card }">
          <div
            v-if="card.cardData?.name"
            class="flying-combatant-card"
          >
            <!-- Header: Portrait + Name + Squad Label -->
            <div class="flying-card-header">
              <div class="flying-card-icon-wrapper">
                <img
                  v-if="card.cardData.image"
                  :src="card.cardData.image"
                  :alt="card.cardData.name"
                  class="flying-card-icon"
                  :style="{ borderColor: card.cardData.iconBorderColor }"
                />
              </div>
              <div class="flying-card-name-section">
                <div class="flying-card-name-row">
                  <span class="flying-card-name">{{ card.cardData.name }}</span>
                  <span v-if="card.cardData.location" class="flying-card-location">{{ card.cardData.location }}</span>
                </div>
                <span
                  v-if="card.cardData.squadBadge"
                  class="flying-card-badge"
                  :style="{ backgroundColor: card.cardData.badgeColor }"
                >
                  {{ card.cardData.squadBadge }}
                </span>
              </div>
            </div>

            <!-- Stats Grid -->
            <div class="flying-stats-grid">
              <div class="flying-stat">
                <span class="flying-stat-icon">♡</span>
                <span class="flying-stat-label">Training:</span>
                <span class="flying-stat-value">{{ card.cardData.training }}</span>
              </div>
              <div class="flying-stat">
                <span class="flying-stat-icon">⚡</span>
                <span class="flying-stat-label">Combat:</span>
                <span class="flying-stat-value">{{ card.cardData.combat }}</span>
              </div>
              <div class="flying-stat">
                <span class="flying-stat-icon">»</span>
                <span class="flying-stat-label">Initiative:</span>
                <span class="flying-stat-value">{{ card.cardData.initiative }}</span>
              </div>
              <div class="flying-stat">
                <span class="flying-stat-icon">♥</span>
                <span class="flying-stat-label">Health:</span>
                <span class="flying-stat-value">{{ card.cardData.health }}</span>
              </div>
              <div class="flying-stat">
                <span class="flying-stat-icon">⌖</span>
                <span class="flying-stat-label">Targets:</span>
                <span class="flying-stat-value">{{ card.cardData.targets }}</span>
              </div>
              <div class="flying-stat">
                <span class="flying-stat-icon">★</span>
                <span class="flying-stat-label">Actions:</span>
                <span class="flying-stat-value">{{ card.cardData.actions }}</span>
              </div>
            </div>

            <!-- Ability Section -->
            <div class="flying-ability-section" v-if="card.cardData.ability">
              <div class="flying-ability-header">Ability:</div>
              <div class="flying-ability-text">{{ card.cardData.ability }}</div>
            </div>

            <!-- Equipment Section -->
            <div class="flying-equipment-section">
              <div class="flying-equipment-slot">
                <span class="flying-slot-icon">⚙</span>
                <span class="flying-slot-label" :class="{ empty: card.cardData.weapon === 'No weapon' }">
                  {{ card.cardData.weapon }}
                </span>
              </div>
              <div class="flying-equipment-slot">
                <span class="flying-slot-icon">◆</span>
                <span class="flying-slot-label" :class="{ empty: card.cardData.armor === 'No armor' }">
                  {{ card.cardData.armor }}
                </span>
              </div>
              <div class="flying-equipment-slot">
                <span class="flying-slot-icon">■</span>
                <span class="flying-slot-label" :class="{ empty: card.cardData.accessory === 'No accessory' }">
                  {{ card.cardData.accessory }}
                </span>
              </div>
            </div>
          </div>
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
  const playerId = String(playerAttrs.seat);
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

<!-- Non-scoped styles for flying card (rendered in overlay/portal) -->
<style>
.flying-combatant-card {
  background: rgba(45, 55, 45, 0.98);
  border-radius: 12px;
  padding: 12px;
  min-width: 240px;
  max-width: 280px;
  color: #f0f0f0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  border: 2px solid #d4a84b;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(212, 168, 75, 0.3);
}

/* Header */
.flying-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.flying-card-icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 56px;
  height: 56px;
}

.flying-card-icon {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 3px solid;
  object-fit: cover;
  background: #333;
  box-sizing: border-box;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.flying-card-name-section {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.flying-card-name-row {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.flying-card-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: #d4a84b;
}

.flying-card-location {
  font-size: 0.75rem;
  color: #888;
  margin-top: 2px;
}

.flying-card-badge {
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  white-space: nowrap;
}

/* Stats Grid */
.flying-stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 10px;
  background: rgba(30, 35, 30, 0.6);
  border-radius: 8px;
  margin-bottom: 12px;
}

.flying-stat {
  display: flex;
  align-items: center;
  gap: 4px;
}

.flying-stat-icon {
  color: #d4a84b;
  font-size: 1rem;
  width: 16px;
}

.flying-stat-label {
  color: #888;
  font-size: 0.85rem;
}

.flying-stat-value {
  color: #d4a84b;
  font-weight: 600;
  margin-left: auto;
}

/* Ability Section */
.flying-ability-section {
  border-left: 3px solid #d4a84b;
  padding-left: 10px;
  margin-bottom: 12px;
}

.flying-ability-header {
  font-size: 0.85rem;
  font-weight: 600;
  color: #d4a84b;
  margin-bottom: 4px;
}

.flying-ability-text {
  font-size: 0.85rem;
  line-height: 1.4;
  color: #f0f0f0;
}

/* Equipment Section */
.flying-equipment-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.flying-equipment-slot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(30, 35, 30, 0.6);
  border-radius: 6px;
}

.flying-slot-icon {
  color: #d4a84b;
  font-size: 1rem;
}

.flying-slot-label {
  font-size: 0.9rem;
}

.flying-slot-label.empty {
  color: #666;
  font-style: italic;
}
</style>
