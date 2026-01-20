<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import SectorTile from './SectorTile.vue';
import MilitiaTrainAnimation from './MilitiaTrainAnimation.vue';
import CombatantEntryAnimation from './CombatantEntryAnimation.vue';

interface SectorData {
  sectorId: string;
  sectorName: string;
  sectorType: 'Wilderness' | 'City' | 'Industry';
  value: number;
  row: number;
  col: number;
  image?: string;
  explored: boolean;
  dictatorMilitia: number;
  rebelMilitia?: Record<string, number>;
}

interface MercData {
  combatantId: string;
  combatantName?: string;
  image?: string;
  playerColor?: string;
  sectorId?: string;
}

interface PlayerData {
  position: number;
  playerColor?: string;
  isDictator?: boolean;
}

// Animation queue entry
interface MilitiaAnimation {
  id: string;
  sectorId: string;
  count: number; // Total militia being trained
  playerColor?: string;
  isDictator: boolean;
  playerId?: string; // For rebel militia, tracks which player
  rect: { x: number; y: number; width: number; height: number };
  startValue: number; // The count BEFORE training
  currentDisplayValue: number; // Increments with each animation cycle
}

// Combatant entry animation queue entry
interface CombatantAnimation {
  id: string;
  combatantId: string;
  combatantName: string;
  image?: string;
  playerColor?: string;
  sectorId: string;
}

const props = defineProps<{
  sectors: SectorData[];
  mercs: MercData[];
  players: PlayerData[];
  controlMap: Record<string, string | undefined>; // sectorId -> playerColor
  clickableSectors?: string[];
  canDropEquipment?: boolean;
  dictatorBaseSectorId?: string; // Sector where dictator's base is (if revealed)
  dictatorColor?: string; // Dictator player color for base icon styling
}>();

const emit = defineEmits<{
  sectorClick: [sectorId: string];
  dropEquipment: [combatantElementId: number, equipmentId: number];
}>();

function handleDropEquipment(combatantElementId: number, equipmentId: number) {
  emit('dropEquipment', combatantElementId, equipmentId);
}

// ============================================================================
// MILITIA TRAINING ANIMATION
// ============================================================================

// Ref for the grid container to calculate positions
const mapGridRef = ref<HTMLElement | null>(null);

// Track previous militia counts to detect changes
const previousMilitia = ref<Record<string, { dictator: number; rebel: Record<string, number> }>>({});

// Active animations queue
const activeAnimations = ref<MilitiaAnimation[]>([]);

// Get a unique ID for animations
let animationIdCounter = 0;
function getAnimationId(prefix: string = 'anim'): string {
  return `${prefix}-${++animationIdCounter}`;
}

// Get the bounding rect of a sector element relative to the grid
function getSectorRect(sectorId: string): { x: number; y: number; width: number; height: number } | null {
  if (!mapGridRef.value) return null;

  const sectorEl = mapGridRef.value.querySelector(`[data-sector-id="${sectorId}"]`);
  if (!sectorEl) return null;

  const gridRect = mapGridRef.value.getBoundingClientRect();
  const sectorRect = sectorEl.getBoundingClientRect();

  return {
    x: sectorRect.left - gridRect.left,
    y: sectorRect.top - gridRect.top,
    width: sectorRect.width,
    height: sectorRect.height,
  };
}

// Watch for militia changes and trigger animations
watch(
  () => props.sectors.map(s => ({
    id: s.sectorId,
    dictator: s.dictatorMilitia,
    rebel: { ...s.rebelMilitia },
  })),
  (newSectors, oldSectors) => {
    // Skip on first load (oldSectors is undefined)
    if (!oldSectors) {
      // Initialize previous militia tracking
      for (const sector of newSectors) {
        previousMilitia.value[sector.id] = {
          dictator: sector.dictator,
          rebel: { ...sector.rebel },
        };
      }
      return;
    }

    // Build lookup for old values
    const oldLookup: Record<string, { dictator: number; rebel: Record<string, number> }> = {};
    for (const sector of oldSectors) {
      oldLookup[sector.id] = {
        dictator: sector.dictator,
        rebel: sector.rebel || {},
      };
    }

    // Check each sector for militia increases
    for (const sector of newSectors) {
      const old = oldLookup[sector.id];
      if (!old) continue;

      // Check dictator militia increase
      const dictatorIncrease = sector.dictator - old.dictator;
      if (dictatorIncrease > 0) {
        queueAnimation(sector.id, dictatorIncrease, props.dictatorColor, true, undefined, old.dictator);
      }

      // Check rebel militia increases (per player)
      for (const [playerId, count] of Object.entries(sector.rebel || {})) {
        const oldCount = old.rebel[playerId] || 0;
        const increase = count - oldCount;
        if (increase > 0) {
          // Find player color
          const player = props.players.find(p => String(p.position) === playerId);
          queueAnimation(sector.id, increase, player?.playerColor, false, playerId, oldCount);
        }
      }
    }

    // Update previous values
    for (const sector of newSectors) {
      previousMilitia.value[sector.id] = {
        dictator: sector.dictator,
        rebel: { ...sector.rebel },
      };
    }
  },
  { deep: true }
);

// Queue an animation for a sector
function queueAnimation(
  sectorId: string,
  count: number,
  playerColor?: string,
  isDictator: boolean = false,
  playerId?: string,
  startValue: number = 0
) {
  // Wait for next tick to ensure DOM is updated, then get position
  nextTick(() => {
    const rect = getSectorRect(sectorId);
    if (!rect) return;

    activeAnimations.value.push({
      id: getAnimationId(),
      sectorId,
      count,
      playerColor,
      isDictator,
      playerId,
      rect,
      startValue,
      currentDisplayValue: startValue, // Start at old value
    });
  });
}

// Handle animation increment - bump the display value
function handleAnimationIncrement(animationId: string) {
  const anim = activeAnimations.value.find(a => a.id === animationId);
  if (anim) {
    anim.currentDisplayValue++;
  }
}

// Handle animation complete - remove from queue
function handleAnimationComplete(animationId: string) {
  activeAnimations.value = activeAnimations.value.filter(a => a.id !== animationId);
}

// Compute display overrides for sectors with active animations
// Returns: { sectorId: { dictator?: number, rebel?: { playerId: number } } }
const militiaDisplayOverrides = computed(() => {
  const overrides: Record<string, { dictator?: number; rebel?: Record<string, number> }> = {};

  for (const anim of activeAnimations.value) {
    if (!overrides[anim.sectorId]) {
      overrides[anim.sectorId] = {};
    }

    if (anim.isDictator) {
      overrides[anim.sectorId].dictator = anim.currentDisplayValue;
    } else if (anim.playerId) {
      if (!overrides[anim.sectorId].rebel) {
        overrides[anim.sectorId].rebel = {};
      }
      overrides[anim.sectorId].rebel![anim.playerId] = anim.currentDisplayValue;
    }
  }

  return overrides;
});

// Get the display militia counts for a sector (applying any animation overrides)
function getDisplayMilitia(sector: SectorData): { dictatorMilitia: number; rebelMilitia?: Record<string, number> } {
  const override = militiaDisplayOverrides.value[sector.sectorId];
  if (!override) {
    return {
      dictatorMilitia: sector.dictatorMilitia,
      rebelMilitia: sector.rebelMilitia,
    };
  }

  // Apply overrides
  const result: { dictatorMilitia: number; rebelMilitia?: Record<string, number> } = {
    dictatorMilitia: override.dictator !== undefined ? override.dictator : sector.dictatorMilitia,
    rebelMilitia: sector.rebelMilitia ? { ...sector.rebelMilitia } : undefined,
  };

  // Apply rebel militia overrides
  if (override.rebel && result.rebelMilitia) {
    for (const [playerId, count] of Object.entries(override.rebel)) {
      result.rebelMilitia[playerId] = count;
    }
  }

  return result;
}

// Get a sector with display militia values (for template binding)
function getSectorWithDisplayMilitia(sector: SectorData): SectorData {
  const displayMilitia = getDisplayMilitia(sector);
  return {
    ...sector,
    dictatorMilitia: displayMilitia.dictatorMilitia,
    rebelMilitia: displayMilitia.rebelMilitia,
  };
}

// ============================================================================
// COMBATANT ENTRY ANIMATION
// ============================================================================

// Active combatant entry animations
const activeCombatantAnimations = ref<CombatantAnimation[]>([]);

// Set of combatant IDs currently animating (for hiding in SectorTile)
const animatingCombatantIds = computed(() =>
  new Set(activeCombatantAnimations.value.map(a => a.combatantId))
);

// Track previous mercs to detect new arrivals
const previousMercIds = ref<Set<string>>(new Set());

// Get the viewport rect of a sector's mercs-area element
function getSectorMercsAreaRect(sectorId: string): { x: number; y: number; width: number; height: number } | null {
  if (!mapGridRef.value) return null;

  const sectorEl = mapGridRef.value.querySelector(`[data-sector-id="${sectorId}"]`);
  if (!sectorEl) return null;

  const mercsArea = sectorEl.querySelector('.mercs-area');
  if (!mercsArea) return null;

  const rect = mercsArea.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

// Queue a combatant entry animation
function queueCombatantAnimation(merc: MercData) {
  if (!merc.sectorId) return;

  nextTick(() => {
    activeCombatantAnimations.value.push({
      id: getAnimationId('combatant'),
      combatantId: merc.combatantId,
      combatantName: merc.combatantName || merc.combatantId,
      image: merc.image,
      playerColor: merc.playerColor,
      sectorId: merc.sectorId!,
    });
  });
}

// Handle combatant animation complete
function handleCombatantAnimationComplete(animationId: string) {
  activeCombatantAnimations.value = activeCombatantAnimations.value.filter(a => a.id !== animationId);
}

// Watch for new mercs appearing in sectors
watch(
  () => props.mercs,
  (newMercs, oldMercs) => {
    // Skip on first load (oldMercs is undefined)
    if (!oldMercs) {
      // Initialize tracking
      previousMercIds.value = new Set(newMercs.map(m => m.combatantId));
      return;
    }

    // Find mercs that are new (not in previous set) and have a sectorId
    for (const merc of newMercs) {
      if (merc.sectorId && !previousMercIds.value.has(merc.combatantId)) {
        queueCombatantAnimation(merc);
      }
    }

    // Update tracking
    previousMercIds.value = new Set(newMercs.map(m => m.combatantId));
  },
  { deep: true }
);

// Calculate grid dimensions
const gridDimensions = computed(() => {
  let maxRow = 0;
  let maxCol = 0;
  for (const sector of props.sectors) {
    if (sector.row > maxRow) maxRow = sector.row;
    if (sector.col > maxCol) maxCol = sector.col;
  }
  return { rows: maxRow + 1, cols: maxCol + 1 };
});

// Sort sectors by position (row, col) for grid layout
const sortedSectors = computed(() => {
  return [...props.sectors].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });
});

// Get MERCs for a given sector
function getMercsInSector(sectorId: string) {
  return props.mercs.filter((m) => m.sectorId === sectorId);
}

// Map player positions to colors (for rebel militia display)
const playerColorMap = computed(() => {
  const map: Record<string, string> = {};
  for (const player of props.players) {
    if (player.playerColor && !player.isDictator) {
      map[String(player.position)] = player.playerColor;
    }
  }
  return map;
});

// Check if sector is clickable
function isClickable(sectorId: string) {
  if (!props.clickableSectors) return false;
  return props.clickableSectors.includes(sectorId);
}

function handleSectorClick(sectorId: string) {
  emit('sectorClick', sectorId);
}
</script>

<template>
  <div
    ref="mapGridRef"
    class="map-grid"
    :style="{
      gridTemplateColumns: `repeat(${gridDimensions.cols}, 1fr)`,
      gridTemplateRows: `repeat(${gridDimensions.rows}, 1fr)`,
    }"
  >
    <SectorTile
      v-for="sector in sortedSectors"
      :key="sector.sectorId"
      :data-sector-id="sector.sectorId"
      :sector="getSectorWithDisplayMilitia(sector)"
      :controlling-player-color="controlMap[sector.sectorId]"
      :mercs-in-sector="getMercsInSector(sector.sectorId)"
      :player-color-map="playerColorMap"
      :is-clickable="isClickable(sector.sectorId)"
      :can-drop-equipment="canDropEquipment"
      :is-dictator-base="sector.sectorId === dictatorBaseSectorId"
      :dictator-color="dictatorColor"
      :hidden-combatant-ids="animatingCombatantIds"
      @click="handleSectorClick"
      @drop-equipment="handleDropEquipment"
    />

    <!-- Militia Training Animations -->
    <MilitiaTrainAnimation
      v-for="anim in activeAnimations"
      :key="anim.id"
      :sector-rect="anim.rect"
      :count="anim.count"
      :player-color="anim.playerColor"
      :is-dictator="anim.isDictator"
      @increment="handleAnimationIncrement(anim.id)"
      @complete="handleAnimationComplete(anim.id)"
    />

    <!-- Combatant Entry Animations -->
    <CombatantEntryAnimation
      v-for="anim in activeCombatantAnimations"
      :key="anim.id"
      :combatant-id="anim.combatantId"
      :combatant-name="anim.combatantName"
      :image="anim.image"
      :player-color="anim.playerColor"
      :sector-id="anim.sectorId"
      @complete="handleCombatantAnimationComplete(anim.id)"
    />
  </div>
</template>

<style scoped>
.map-grid {
  display: grid;
  gap: 8px;
  width: 100%;
  position: relative; /* Positioning context for animation overlays */
}
</style>
