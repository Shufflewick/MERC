<script setup lang="ts">
/**
 * MERC's board — the game's one shipped UI (see src/ui/uis.ts).
 *
 * This is everything the old `#game-board` slot in App.vue used to hold: the
 * table itself, the flying-combatant animation layer, and the animation
 * registration that used to have to reach out of the slot for its props. It
 * lives in one component now because GameShell renders a board component, not
 * slot content — so the board and the state it needs are in the same place.
 */
import { onMounted, ref, watch } from 'vue';
import { useActionAnimations, FlyingCardsOverlay } from 'boardsmith/ui';
import type { UseActionControllerReturn } from 'boardsmith/ui';
import GameTable from './components/GameTable.vue';
import { assetUrl } from './composables/useAssetUrl';
import { lastActionWasDragDrop, quickReassignInProgress } from './drag-drop-state';
import { headerCombatantData, closeHeaderCombatantModal } from './combatant-modal-state';

/**
 * The board prop set GameShell passes to every registry UI. Identical for every
 * game — there is no longer a separate slot-props shape that can drift from it.
 */
const props = defineProps<{
  state: any;
  gameView: any;
  playerSeat: number;
  isMyTurn: boolean;
  availableActions: any;
  actionController: UseActionControllerReturn;
  setBoardPrompt: (prompt: string | null) => void;
}>();



// Track which combatant is currently animating (to hide at destination)
const flyingCombatantName = ref<string | null>(null);

// Action animations setup
const gameViewRef = ref<any>(null);
const animationsRegistered = ref(false);

const actionAnimations = useActionAnimations({
  gameView: gameViewRef,
  animations: [
    ({
      action: 'assignToSquad',
      elementSelection: 'combatantName',
      elementSelector: '[data-combatant="{combatantName}"]',
      // Use function-based selector because targetSquad values are like "Create Primary Squad" or "Primary Squad at X"
      destinationSelector: (args: Record<string, unknown>) => {
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
      getElementData: (el: Element) => {
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
      onStart: (args: Record<string, unknown>) => {
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
    }) as any,
  ],
});

// Register animations once the component is alive. This used to run from a
// `@vue:mounted` hook on GameTable inside the board slot, reaching back out for
// slot props — a workaround for the board not being a component. It is one now,
// so this is just onMounted, which is what it always wanted to be.
function setupAnimations(actionController: UseActionControllerReturn, gameView: any) {
  if (animationsRegistered.value) return;
  gameViewRef.value = gameView;
  actionController.setBeforeAutoExecute(async (actionName, args) => {
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




onMounted(() => {
  gameViewRef.value = props.gameView;
  setupAnimations(props.actionController, props.gameView);
});

// gameViewRef feeds the animation system's element lookups; keep it current.
watch(() => props.gameView, (v) => { gameViewRef.value = v; });
</script>

<template>

    <GameTable
      :game-view="props.gameView"
      :player-seat="props.playerSeat"
      :is-my-turn="props.isMyTurn"
      :available-actions="props.availableActions"
      :action-controller="props.actionController"
      :set-board-prompt="props.setBoardPrompt"
      :state="props.state"
      :flying-combatant-name="flyingCombatantName"
      :header-combatant-data="headerCombatantData"
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
                :src="assetUrl(card.cardData.image as string)"
                :alt="(card.cardData.name as string)"
                class="flying-card-icon"
                :style="{ borderColor: (card.cardData.iconBorderColor as string) }"
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
                :style="{ backgroundColor: (card.cardData.badgeColor as string) }"
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
