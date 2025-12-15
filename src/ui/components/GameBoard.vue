<script setup lang="ts">
import { computed } from 'vue';
import MapGrid from './MapGrid.vue';
import SquadPanel from './SquadPanel.vue';
import { UI_COLORS } from '../colors';

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

// Helper to find elements by $type in gameView tree
function findByType(type: string, root?: any): any {
  if (!root) root = props.gameView;
  if (!root) return null;

  if (root.attributes?.$type === type) return root;

  if (root.children) {
    for (const child of root.children) {
      const found = findByType(type, child);
      if (found) return found;
    }
  }
  return null;
}

// Find all elements of a type
function findAllByType(type: string, root?: any): any[] {
  if (!root) root = props.gameView;
  const results: any[] = [];

  function search(node: any) {
    if (!node) return;
    if (node.attributes?.$type === type) {
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

// Extract map sectors from gameView
const sectors = computed(() => {
  const map = findByType('map');
  if (!map?.children) return [];

  return map.children
    .filter((c: any) => c.attributes?.sectorId)
    .map((c: any) => ({
      sectorId: c.attributes.sectorId,
      sectorName: c.attributes.sectorName || '',
      sectorType: c.attributes.sectorType || 'Wilderness',
      value: c.attributes.value || 0,
      row: c.attributes.row ?? 0,
      col: c.attributes.col ?? 0,
      image: c.attributes.image,
      explored: c.attributes.explored ?? false,
      dictatorMilitia: c.attributes.dictatorMilitia ?? 0,
      rebelMilitia: c.attributes.rebelMilitia || {},
    }));
});

// Extract all players
const players = computed(() => {
  const playerElements = findAllByType('player');
  return playerElements.map((p: any) => ({
    position: p.attributes?.position ?? 0,
    playerColor: p.attributes?.playerColor,
    isDictator: p.attributes?.isDictator ?? false,
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
  const squads = findAllByType('squad');
  for (const squad of squads) {
    const sectorId = squad.attributes?.sectorId;
    const playerColor = squad.attributes?.playerColor;

    if (squad.children) {
      for (const merc of squad.children) {
        if (merc.attributes?.mercId) {
          mercs.push({
            ...merc.attributes,
            sectorId,
            playerColor,
          });
        }
      }
    }
  }

  // Find dictator MERCs (they have sectorId directly)
  const dictatorMercs = findAllByType('merc');
  for (const merc of dictatorMercs) {
    if (merc.attributes?.mercId && merc.attributes?.sectorId) {
      // Check if not already added from a squad
      const exists = mercs.some((m) => m.mercId === merc.attributes.mercId);
      if (!exists) {
        mercs.push({
          ...merc.attributes,
          playerColor: 'dictator',
        });
      }
    }
  }

  return mercs;
});

// Build control map (sectorId -> playerColor who controls it)
const controlMap = computed(() => {
  const map: Record<string, string | undefined> = {};

  for (const sector of sectors.value) {
    // Simple control check: whoever has more units controls
    // MERCs count + militia count
    let dictatorUnits = sector.dictatorMilitia;
    const rebelUnits: Record<string, number> = {};

    // Count dictator MERCs in sector
    const dictatorMercsInSector = allMercs.value.filter(
      (m) => m.sectorId === sector.sectorId && m.playerColor === 'dictator'
    );
    dictatorUnits += dictatorMercsInSector.length;

    // Count rebel militia
    for (const [color, count] of Object.entries(sector.rebelMilitia || {})) {
      rebelUnits[color] = (rebelUnits[color] || 0) + (count as number);
    }

    // Count rebel MERCs
    const rebelMercsInSector = allMercs.value.filter(
      (m) => m.sectorId === sector.sectorId && m.playerColor !== 'dictator'
    );
    for (const merc of rebelMercsInSector) {
      const color = merc.playerColor || 'unknown';
      rebelUnits[color] = (rebelUnits[color] || 0) + 1;
    }

    // Determine controller
    let maxUnits = 0;
    let controller: string | undefined;

    // Check dictator first (wins ties)
    if (dictatorUnits > 0) {
      maxUnits = dictatorUnits;
      controller = 'dictator';
    }

    // Check rebels
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
  const squads = findAllByType('squad');
  const squad = squads.find(
    (s: any) =>
      s.attributes?.player?.position === props.playerPosition &&
      s.attributes?.isPrimary === true
  );

  if (!squad) return undefined;

  const sectorId = squad.attributes?.sectorId;
  const sector = sectors.value.find((s) => s.sectorId === sectorId);

  return {
    squadId: squad.attributes?.squadId || 'primary',
    isPrimary: true,
    sectorId,
    sectorName: sector?.sectorName,
    mercs: (squad.children || [])
      .filter((c: any) => c.attributes?.mercId)
      .map((c: any) => c.attributes),
  };
});

const secondarySquad = computed(() => {
  const squads = findAllByType('squad');
  const squad = squads.find(
    (s: any) =>
      s.attributes?.player?.position === props.playerPosition &&
      s.attributes?.isPrimary === false
  );

  if (!squad) return undefined;

  const sectorId = squad.attributes?.sectorId;
  const sector = sectors.value.find((s) => s.sectorId === sectorId);

  return {
    squadId: squad.attributes?.squadId || 'secondary',
    isPrimary: false,
    sectorId,
    sectorName: sector?.sectorName,
    mercs: (squad.children || [])
      .filter((c: any) => c.attributes?.mercId)
      .map((c: any) => c.attributes),
  };
});

// Handle sector clicks for actions
function handleSectorClick(sectorId: string) {
  // Check if we have an action that needs a sector
  if (props.availableActions.includes('move')) {
    props.action('move', { sectorId });
  } else if (props.availableActions.includes('placeLanding')) {
    props.action('placeLanding', { sectorId });
  }
}

// Clickable sectors based on available actions
const clickableSectors = computed(() => {
  // This would ideally come from actionArgs or game state
  // For now, return empty array - sectors become clickable based on action context
  return [];
});
</script>

<template>
  <div class="game-board">
    <!-- Main content: Map + Squad Panel -->
    <div class="board-layout">
      <!-- Map Section -->
      <div class="map-section">
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
      <div class="squad-section">
        <SquadPanel
          :primary-squad="primarySquad"
          :secondary-squad="secondarySquad"
          :player-color="currentPlayerColor"
        />
      </div>
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

/* Responsive: stack on smaller screens */
@media (max-width: 900px) {
  .board-layout {
    flex-direction: column;
  }

  .squad-section {
    width: 100%;
  }
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
