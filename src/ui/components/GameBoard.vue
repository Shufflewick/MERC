<script setup lang="ts">
import { computed, ref } from 'vue';
import MapGrid from './MapGrid.vue';
import SquadPanel from './SquadPanel.vue';
import MercCard from './MercCard.vue';
import { UI_COLORS, getPlayerColor } from '../colors';

const props = defineProps<{
  gameView: any;
  playerPosition: number;
  isMyTurn: boolean;
  availableActions: string[];
  action: (name: string, args: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  actionArgs: Record<string, unknown>;
  executeAction: (name: string) => Promise<void>;
  setBoardPrompt: (prompt: string | null) => void;
}>();

const showDebug = ref(false);
const selectedMercs = ref<string[]>([]); // Track selected MERCs for hiring

// Copy debug info to clipboard
async function copyDebug() {
  const debugInfo = `GameView Structure:\n${gameViewSummary.value}\n\nSectors found: ${sectors.value.length}\n\nAvailable Actions:\n${JSON.stringify(props.availableActions, null, 2)}\n\nAction Args:\n${JSON.stringify(props.actionArgs, null, 2)}\n\nHirable MERCs (${hirableMercs.value.length}):\n${JSON.stringify(hirableMercs.value.slice(0, 3), null, 2)}`;
  try {
    await navigator.clipboard.writeText(debugInfo);
    alert('Copied to clipboard!');
  } catch (e) {
    console.error('Failed to copy:', e);
  }
}

// Helper to find elements by className in gameView tree
function findByClassName(className: string, root?: any): any {
  if (!root) root = props.gameView;
  if (!root) return null;

  // Check className or ref that contains the class name
  if (root.className === className || root.ref?.includes(className.toLowerCase())) {
    return root;
  }

  if (root.children) {
    for (const child of root.children) {
      const found = findByClassName(className, child);
      if (found) return found;
    }
  }
  return null;
}

// Find all elements matching a class name
function findAllByClassName(className: string, root?: any): any[] {
  if (!root) root = props.gameView;
  const results: any[] = [];

  function search(node: any) {
    if (!node) return;
    if (node.className === className || node.ref?.includes(className.toLowerCase())) {
      results.push(node);
    }
    if (node.children) {
      for (const child of node.children) {
        search(child);
      }
    }
  }

  search(root);
  return results;
}

// Find element by ref (id)
function findByRef(ref: string, root?: any): any {
  if (!root) root = props.gameView;
  if (!root) return null;

  if (root.ref === ref) return root;

  if (root.children) {
    for (const child of root.children) {
      const found = findByRef(ref, child);
      if (found) return found;
    }
  }
  return null;
}

// Extract map sectors from gameView
const sectors = computed(() => {
  // Try to find GameMap element
  const map = findByClassName('GameMap') || findByRef('game-map');
  if (!map?.children) {
    // Fallback: look for Sector elements directly
    const sectorElements = findAllByClassName('Sector');
    if (sectorElements.length > 0) {
      return sectorElements.map((s: any) => ({
        sectorId: s.ref || s.sectorId || `sector-${s.row}-${s.col}`,
        sectorName: s.sectorName || '',
        sectorType: s.sectorType || 'Wilderness',
        value: s.value || 0,
        row: s.row ?? 0,
        col: s.col ?? 0,
        image: s.image,
        explored: s.explored ?? false,
        dictatorMilitia: s.dictatorMilitia ?? 0,
        rebelMilitia: s.rebelMilitia || {},
      }));
    }
    return [];
  }

  return map.children
    .filter((c: any) => c.className === 'Sector' || c.sectorId)
    .map((c: any) => ({
      sectorId: c.ref || c.sectorId || `sector-${c.row}-${c.col}`,
      sectorName: c.sectorName || '',
      sectorType: c.sectorType || 'Wilderness',
      value: c.value || 0,
      row: c.row ?? 0,
      col: c.col ?? 0,
      image: c.image,
      explored: c.explored ?? false,
      dictatorMilitia: c.dictatorMilitia ?? 0,
      rebelMilitia: c.rebelMilitia || {},
    }));
});

// Extract all players
const players = computed(() => {
  // Find player elements - try RebelPlayer and DictatorPlayer
  const rebelPlayers = findAllByClassName('RebelPlayer');
  const dictatorPlayers = findAllByClassName('DictatorPlayer');

  const all = [...rebelPlayers, ...dictatorPlayers];
  return all.map((p: any) => ({
    position: p.position ?? 0,
    playerColor: p.playerColor,
    isDictator: p.className === 'DictatorPlayer',
  }));
});

// Current player's color
const currentPlayerColor = computed(() => {
  const player = players.value.find((p) => p.position === props.playerPosition);
  return player?.playerColor || 'red';
});

// Extract all MERCs with their locations
const allMercs = computed(() => {
  const mercs: any[] = [];

  // Find rebel squads
  const squads = findAllByClassName('Squad');
  for (const squad of squads) {
    const sectorId = squad.sectorId;
    const playerColor = squad.playerColor;

    if (squad.children) {
      for (const merc of squad.children) {
        if (merc.mercId || merc.className === 'MercCard') {
          mercs.push({
            ...merc,
            sectorId,
            playerColor,
          });
        }
      }
    }
  }

  // Find dictator MERCs
  const dictatorMercs = findAllByClassName('MercCard');
  for (const merc of dictatorMercs) {
    if (merc.mercId && merc.sectorId) {
      const exists = mercs.some((m) => m.mercId === merc.mercId);
      if (!exists) {
        mercs.push({
          ...merc,
          playerColor: 'dictator',
        });
      }
    }
  }

  return mercs;
});

// Build control map
const controlMap = computed(() => {
  const map: Record<string, string | undefined> = {};

  for (const sector of sectors.value) {
    let dictatorUnits = sector.dictatorMilitia;
    const rebelUnits: Record<string, number> = {};

    const dictatorMercsInSector = allMercs.value.filter(
      (m) => m.sectorId === sector.sectorId && m.playerColor === 'dictator'
    );
    dictatorUnits += dictatorMercsInSector.length;

    for (const [color, count] of Object.entries(sector.rebelMilitia || {})) {
      rebelUnits[color] = (rebelUnits[color] || 0) + (count as number);
    }

    const rebelMercsInSector = allMercs.value.filter(
      (m) => m.sectorId === sector.sectorId && m.playerColor !== 'dictator'
    );
    for (const merc of rebelMercsInSector) {
      const color = merc.playerColor || 'unknown';
      rebelUnits[color] = (rebelUnits[color] || 0) + 1;
    }

    let maxUnits = 0;
    let controller: string | undefined;

    if (dictatorUnits > 0) {
      maxUnits = dictatorUnits;
      controller = 'dictator';
    }

    for (const [color, units] of Object.entries(rebelUnits)) {
      if (units > maxUnits) {
        maxUnits = units;
        controller = color;
      }
    }

    if (maxUnits > 0) {
      map[sector.sectorId] = controller;
    }
  }

  return map;
});

// Get current player's squads
const primarySquad = computed(() => {
  const squads = findAllByClassName('Squad');
  const squad = squads.find(
    (s: any) =>
      s.player?.position === props.playerPosition &&
      s.isPrimary === true
  );

  if (!squad) return undefined;

  const sectorId = squad.sectorId;
  const sector = sectors.value.find((s) => s.sectorId === sectorId);

  return {
    squadId: squad.ref || 'primary',
    isPrimary: true,
    sectorId,
    sectorName: sector?.sectorName,
    mercs: (squad.children || [])
      .filter((c: any) => c.mercId || c.className === 'MercCard')
      .map((c: any) => c),
  };
});

const secondarySquad = computed(() => {
  const squads = findAllByClassName('Squad');
  const squad = squads.find(
    (s: any) =>
      s.player?.position === props.playerPosition &&
      s.isPrimary === false
  );

  if (!squad) return undefined;

  const sectorId = squad.sectorId;
  const sector = sectors.value.find((s) => s.sectorId === sectorId);

  return {
    squadId: squad.ref || 'secondary',
    isPrimary: false,
    sectorId,
    sectorName: sector?.sectorName,
    mercs: (squad.children || [])
      .filter((c: any) => c.mercId || c.className === 'MercCard')
      .map((c: any) => c),
  };
});

// ============================================================================
// ACTION HANDLING - Show appropriate UI based on available actions
// ============================================================================

// Get action choices from actionArgs
const actionChoices = computed(() => {
  return props.actionArgs || {};
});

// Check if we're in MERC hiring mode
const isHiringMercs = computed(() => {
  return props.availableActions.includes('hireStartingMercs');
});

// Check if we're in landing placement mode
const isPlacingLanding = computed(() => {
  return props.availableActions.includes('placeLanding');
});

// Check if we're equipping starting equipment
const isEquipping = computed(() => {
  return props.availableActions.includes('equipStarting');
});

// Get MERCs available for hiring from action args
const hirableMercs = computed(() => {
  const choices = actionChoices.value;
  // Look for merc choices in various possible formats
  if (choices.mercs && Array.isArray(choices.mercs)) {
    return choices.mercs;
  }
  if (choices.mercChoices && Array.isArray(choices.mercChoices)) {
    return choices.mercChoices;
  }
  // Check for drawn MERCs in deck
  const mercDeck = findByRef('merc-deck') || findByClassName('MercDeck');
  if (mercDeck?.children) {
    return mercDeck.children.slice(0, 3); // First 3 for hiring
  }
  return [];
});

// Get available landing sectors (edge sectors)
const landingSectors = computed(() => {
  if (!isPlacingLanding.value) return [];
  // Return edge sectors
  return sectors.value.filter((s) => {
    const rows = Math.max(...sectors.value.map((sec) => sec.row)) + 1;
    const cols = Math.max(...sectors.value.map((sec) => sec.col)) + 1;
    return s.row === 0 || s.row === rows - 1 || s.col === 0 || s.col === cols - 1;
  });
});

// Get MERC ID from merc object (handles different data structures)
function getMercId(merc: any): string {
  return merc.attributes?.mercId || merc.mercId || merc.id || merc.ref || '';
}

// Check if a MERC is selected
function isMercSelected(merc: any): boolean {
  const id = getMercId(merc);
  return selectedMercs.value.includes(id);
}

// Handle selecting/deselecting a MERC for hiring
function toggleMercSelection(merc: any) {
  const id = getMercId(merc);
  if (!id) return;

  const idx = selectedMercs.value.indexOf(id);
  if (idx >= 0) {
    // Deselect
    selectedMercs.value.splice(idx, 1);
  } else if (selectedMercs.value.length < 2) {
    // Select (max 2)
    selectedMercs.value.push(id);
  }
}

// Confirm hiring selected MERCs
async function confirmHire() {
  if (selectedMercs.value.length === 0) return;

  // Call the action for the first MERC
  await props.action('hireStartingMercs', { firstMerc: selectedMercs.value[0] });

  // Note: The second MERC selection will be handled by the next action step
  // Clear selection after first hire
  selectedMercs.value = [];
}

// Handle sector clicks for actions
function handleSectorClick(sectorId: string) {
  if (props.availableActions.includes('placeLanding')) {
    props.action('placeLanding', { sectorId });
  } else if (props.availableActions.includes('move')) {
    props.action('move', { sectorId });
  }
}

// Clickable sectors based on available actions
const clickableSectors = computed(() => {
  if (isPlacingLanding.value) {
    return landingSectors.value.map((s) => s.sectorId);
  }
  return [];
});

// Debug: get summary of gameView structure
const gameViewSummary = computed(() => {
  if (!props.gameView) return 'No gameView';

  function summarize(node: any, depth: number = 0): string {
    if (!node || depth > 3) return '';
    const indent = '  '.repeat(depth);
    const className = node.className || 'unknown';
    const ref = node.ref ? ` (${node.ref})` : '';
    const childCount = node.children?.length || 0;

    let result = `${indent}${className}${ref}`;
    if (childCount > 0) {
      result += ` [${childCount} children]`;
    }
    result += '\n';

    if (node.children && depth < 2) {
      for (const child of node.children.slice(0, 5)) {
        result += summarize(child, depth + 1);
      }
      if (node.children.length > 5) {
        result += `${indent}  ... and ${node.children.length - 5} more\n`;
      }
    }

    return result;
  }

  return summarize(props.gameView);
});
</script>

<template>
  <div class="game-board">
    <!-- Debug toggle -->
    <button class="debug-toggle" @click="showDebug = !showDebug">
      {{ showDebug ? 'Hide' : 'Show' }} Debug
    </button>

    <!-- Debug panel -->
    <div v-if="showDebug" class="debug-panel">
      <button class="copy-btn" @click="copyDebug">Copy to Clipboard</button>
      <h3>GameView Structure:</h3>
      <pre>{{ gameViewSummary }}</pre>
      <h3>Sectors found: {{ sectors.length }}</h3>
      <h3>Available Actions:</h3>
      <pre>{{ availableActions }}</pre>
      <h3>Action Args:</h3>
      <pre>{{ JSON.stringify(actionArgs, null, 2) }}</pre>
      <h3>Hirable MERCs ({{ hirableMercs.length }}):</h3>
      <pre>{{ JSON.stringify(hirableMercs.slice(0, 2), null, 2) }}</pre>
    </div>

    <!-- Action Panel - shown when player needs to make a choice -->
    <div v-if="isHiringMercs" class="action-panel">
      <h2 class="action-title">Choose MERCs to Hire</h2>
      <p class="action-subtitle">
        Select your MERCs ({{ selectedMercs.length }}/2 selected) - first 2 are free
      </p>
      <div class="merc-choices">
        <div
          v-for="merc in hirableMercs"
          :key="getMercId(merc)"
          class="merc-choice"
          :class="{ selected: isMercSelected(merc) }"
          @click="toggleMercSelection(merc)"
        >
          <div class="selection-indicator" v-if="isMercSelected(merc)">
            &#10003;
          </div>
          <MercCard
            :merc="merc"
            :player-color="currentPlayerColor"
            :show-equipment="false"
          />
        </div>
      </div>
      <button
        class="confirm-btn"
        :disabled="selectedMercs.length === 0"
        @click="confirmHire"
      >
        Confirm Selection ({{ selectedMercs.length }})
      </button>
    </div>

    <!-- Main content: Map + Squad Panel -->
    <div class="board-layout" v-if="sectors.length > 0 || isPlacingLanding">
      <!-- Map Section -->
      <div class="map-section">
        <h2 v-if="isPlacingLanding" class="action-title">Choose Landing Zone</h2>
        <p v-if="isPlacingLanding" class="action-subtitle">Select an edge sector for your landing</p>
        <MapGrid
          :sectors="sectors"
          :mercs="allMercs"
          :players="players"
          :control-map="controlMap"
          :clickable-sectors="clickableSectors"
          @sector-click="handleSectorClick"
        />
      </div>

      <!-- Squad Panel -->
      <div class="squad-section" v-if="primarySquad || secondarySquad">
        <SquadPanel
          :primary-squad="primarySquad"
          :secondary-squad="secondarySquad"
          :player-color="currentPlayerColor"
        />
      </div>
    </div>

    <!-- Fallback when no map data -->
    <div v-else-if="!isHiringMercs" class="no-data">
      <p>Waiting for game data...</p>
      <p class="hint">Available actions: {{ availableActions.join(', ') || 'none' }}</p>
    </div>

    <!-- Turn indicator -->
    <div v-if="isMyTurn" class="turn-indicator">
      Your Turn
    </div>
  </div>
</template>

<style scoped>
.game-board {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  min-height: 100%;
  background: v-bind('UI_COLORS.background');
  position: relative;
}

.debug-toggle {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 12px;
  background: v-bind('UI_COLORS.backgroundLight');
  color: v-bind('UI_COLORS.text');
  border: 1px solid v-bind('UI_COLORS.border');
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  z-index: 100;
}

.debug-panel {
  background: rgba(0, 0, 0, 0.8);
  color: #0f0;
  padding: 12px;
  border-radius: 8px;
  font-family: monospace;
  font-size: 0.75rem;
  max-height: 300px;
  overflow: auto;
  position: relative;
}

.debug-panel h3 {
  color: #0ff;
  margin: 8px 0 4px;
}

.debug-panel pre {
  white-space: pre-wrap;
  margin: 0;
}

.copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 10px;
  background: #0f0;
  color: #000;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: bold;
}

.copy-btn:hover {
  background: #0a0;
}

.action-panel {
  background: v-bind('UI_COLORS.cardBg');
  border-radius: 12px;
  padding: 20px;
}

.action-title {
  color: v-bind('UI_COLORS.accent');
  font-size: 1.3rem;
  margin: 0 0 8px;
}

.action-subtitle {
  color: v-bind('UI_COLORS.textMuted');
  margin: 0 0 16px;
}

.merc-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: center;
}

.merc-choice {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  position: relative;
  border-radius: 12px;
}

.merc-choice:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(212, 168, 75, 0.3);
}

.merc-choice.selected {
  box-shadow: 0 0 0 3px v-bind('UI_COLORS.accent'), 0 8px 24px rgba(212, 168, 75, 0.4);
}

.selection-indicator {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 28px;
  height: 28px;
  background: v-bind('UI_COLORS.accent');
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  font-weight: bold;
  color: #1a1a2e;
  z-index: 10;
}

.confirm-btn {
  display: block;
  margin: 20px auto 0;
  padding: 12px 32px;
  background: linear-gradient(90deg, v-bind('UI_COLORS.accent'), v-bind('UI_COLORS.accentLight'));
  color: #1a1a2e;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: transform 0.2s, opacity 0.2s;
}

.confirm-btn:hover:not(:disabled) {
  transform: scale(1.05);
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.board-layout {
  display: flex;
  gap: 20px;
  flex: 1;
  min-height: 0;
}

.map-section {
  flex: 1;
  min-width: 0;
}

.squad-section {
  flex-shrink: 0;
}

@media (max-width: 900px) {
  .board-layout {
    flex-direction: column;
  }

  .squad-section {
    width: 100%;
  }
}

.no-data {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: v-bind('UI_COLORS.textMuted');
}

.no-data .hint {
  font-size: 0.85rem;
  margin-top: 8px;
}

.turn-indicator {
  background: linear-gradient(90deg, #d4a84b, #e8c77b);
  color: #1a1a2e;
  padding: 8px 24px;
  border-radius: 20px;
  font-weight: bold;
  text-align: center;
  width: fit-content;
  margin: 0 auto;
}
</style>
