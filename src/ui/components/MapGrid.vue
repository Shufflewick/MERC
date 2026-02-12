<script setup lang="ts">
import { computed, ref, nextTick } from 'vue';
import { useAnimationEvents } from 'boardsmith/ui';
import SectorTile from './SectorTile.vue';
import MilitiaTrainAnimation from './MilitiaTrainAnimation.vue';
import CombatantEntryAnimation from './CombatantEntryAnimation.vue';
import CombatantDeathAnimation from './CombatantDeathAnimation.vue';
import CombatantMoveAnimation from './CombatantMoveAnimation.vue';
import EquipmentDropAnimation from './EquipmentDropAnimation.vue';
import MortarStrikeAnimation from './MortarStrikeAnimation.vue';
import LandmineDetonationAnimation from './LandmineDetonationAnimation.vue';

interface SectorData {
  sectorId: string;
  sectorName: string;
  sectorType: string;
  value: number;
  row: number;
  col: number;
  image?: string;
  explored: boolean;
  dictatorMilitia: number;
  rebelMilitia?: Record<string, number>;
}

interface EquipmentData {
  equipmentId?: string;
  equipmentName?: string;
  equipmentType?: string;
  image?: string;
}

interface MercData {
  combatantId: string;
  combatantName?: string;
  image?: string;
  playerColor?: string;
  sectorId?: string;
  // Equipment slots - may come from attributes or direct props
  weaponSlot?: EquipmentData;
  armorSlot?: EquipmentData;
  accessorySlot?: EquipmentData;
  // Also check attributes for equipment data
  attributes?: {
    weaponSlotData?: EquipmentData;
    armorSlotData?: EquipmentData;
    accessorySlotData?: EquipmentData;
    [key: string]: unknown;
  };
}

interface PlayerData {
  position?: number;
  seat?: number;
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

// Combatant entry/death animation queue entry
interface CombatantAnimation {
  id: string;
  combatantId: string;
  combatantName: string;
  image?: string;
  playerColor?: string;
  sectorId: string;
}

// Combatant move animation queue entry
interface CombatantMoveAnimationData {
  id: string;
  combatantId: string;
  combatantName: string;
  image?: string;
  playerColor?: string;
  fromSectorId: string;
  toSectorId: string;
}

// Equipment drop animation queue entry
interface EquipmentAnimationData {
  id: string;
  equipmentName: string;
  equipmentType: string;
  image?: string;
  sectorId: string;
  combatantId?: string; // If provided, animate to/from combatant; otherwise animate to/from sector center
  direction: 'incoming' | 'outgoing'; // incoming = center->target, outgoing = combatant->sector
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
  mortarStrike?: {
    targetSectorId: string;
    hitCombatantIds: string[];
    militiaKilled: number;
  } | null;
  landmineStrike?: {
    sectorId: string;
    targetNames: string[];
    damage: number;
  } | null;
}>();

const emit = defineEmits<{
  sectorClick: [sectorId: string];
  dropEquipment: [combatantElementId: number, equipmentId: number];
  mortarStrikeComplete: [];
  landmineStrikeComplete: [];
}>();

function handleDropEquipment(combatantElementId: number, equipmentId: number) {
  emit('dropEquipment', combatantElementId, equipmentId);
}

// ============================================================================
// MILITIA TRAINING ANIMATION
// ============================================================================

// Ref for the grid container to calculate positions
const mapGridRef = ref<HTMLElement | null>(null);

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

// Queue an animation for a sector
function queueAnimation(
  sectorId: string,
  count: number,
  playerColor?: string,
  isDictator: boolean = false,
  playerId?: string,
  startValue: number = 0
): Promise<void> {
  return new Promise((resolve) => {
    // Wait for next tick to ensure DOM is updated, then get position
    nextTick(() => {
      const rect = getSectorRect(sectorId);
      if (!rect) {
        resolve();
        return;
      }

      const id = getAnimationId();
      militiaResolvers.set(id, resolve);
      activeAnimations.value.push({
        id,
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
  });
}

// Handle animation increment - bump the display value
function handleAnimationIncrement(animationId: string) {
  const anim = activeAnimations.value.find(a => a.id === animationId);
  if (anim) {
    anim.currentDisplayValue++;
  }
}

const militiaResolvers = new Map<string, () => void>();

// Handle animation complete - remove from queue
function handleAnimationComplete(animationId: string) {
  activeAnimations.value = activeAnimations.value.filter(a => a.id !== animationId);
  const resolve = militiaResolvers.get(animationId);
  if (resolve) {
    militiaResolvers.delete(animationId);
    resolve();
  }
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

// Local death animation tracking
interface DeathAnimationData {
  id: string;
  combatantId: string;
  combatantName: string;
  image?: string;
  playerColor?: string;
  sectorId: string;
}
let deathIdCounter = 0;
const pendingDeaths = ref<DeathAnimationData[]>([]);

// Active combatant move animations
const activeMoveAnimations = ref<CombatantMoveAnimationData[]>([]);

// Active equipment drop animations
const activeEquipmentAnimations = ref<EquipmentAnimationData[]>([]);

const entryResolvers = new Map<string, () => void>();
const deathResolvers = new Map<string, () => void>();
const moveResolvers = new Map<string, () => void>();
const equipmentResolvers = new Map<string, () => void>();

// Set of combatant IDs currently animating (for hiding in SectorTile)
const animatingCombatantIds = computed(() => {
  const ids = new Set<string>();
  for (const a of activeCombatantAnimations.value) ids.add(a.combatantId);
  for (const a of activeMoveAnimations.value) ids.add(a.combatantId);
  return ids;
});

function queueCombatantAnimation(data: Omit<CombatantAnimation, 'id'>): Promise<void> {
  if (!data.sectorId) return Promise.resolve();
  return new Promise((resolve) => {
    nextTick(() => {
      const id = getAnimationId('combatant');
      entryResolvers.set(id, resolve);
      activeCombatantAnimations.value.push({
        id,
        ...data,
      });
    });
  });
}

// Handle combatant entry animation complete
function handleCombatantAnimationComplete(animationId: string) {
  activeCombatantAnimations.value = activeCombatantAnimations.value.filter(a => a.id !== animationId);
  const resolve = entryResolvers.get(animationId);
  if (resolve) {
    entryResolvers.delete(animationId);
    resolve();
  }
}

function buildDeathData(merc: Omit<DeathAnimationData, 'id'>): DeathAnimationData {
  return {
    id: `death-${Date.now()}-${++deathIdCounter}`,
    combatantId: merc.combatantId,
    combatantName: merc.combatantName || merc.combatantId,
    image: merc.image,
    playerColor: merc.playerColor,
    sectorId: merc.sectorId,
  };
}

function queueDeathAnimation(merc: Omit<DeathAnimationData, 'id'>): Promise<void> {
  if (!merc.sectorId) return Promise.resolve();
  return new Promise((resolve) => {
    nextTick(() => {
      const data = buildDeathData(merc);
      deathResolvers.set(data.id, resolve);
      pendingDeaths.value.push(data);
    });
  });
}

// Handle combatant death animation complete
function handleDeathAnimationComplete(deathId: string) {
  pendingDeaths.value = pendingDeaths.value.filter(d => d.id !== deathId);
  const resolve = deathResolvers.get(deathId);
  if (resolve) {
    deathResolvers.delete(deathId);
    resolve();
  }
}

function queueMoveAnimation(data: Omit<CombatantMoveAnimationData, 'id'>): Promise<void> {
  if (!data.fromSectorId || !data.toSectorId) return Promise.resolve();
  return new Promise((resolve) => {
    nextTick(() => {
      const id = getAnimationId('move');
      moveResolvers.set(id, resolve);
      activeMoveAnimations.value.push({
        id,
        ...data,
      });
    });
  });
}

// Handle combatant move animation complete
function handleMoveAnimationComplete(animationId: string) {
  activeMoveAnimations.value = activeMoveAnimations.value.filter(a => a.id !== animationId);
  const resolve = moveResolvers.get(animationId);
  if (resolve) {
    moveResolvers.delete(animationId);
    resolve();
  }
}

// ============================================================================
// EQUIPMENT DROP ANIMATION
// ============================================================================

function queueEquipmentAnimation(data: Omit<EquipmentAnimationData, 'id'>): Promise<void> {
  return new Promise((resolve) => {
    nextTick(() => {
      const id = getAnimationId('equipment');
      equipmentResolvers.set(id, resolve);
      activeEquipmentAnimations.value.push({
        id,
        ...data,
      });
    });
  });
}

// Handle equipment animation complete
function handleEquipmentAnimationComplete(animationId: string) {
  activeEquipmentAnimations.value = activeEquipmentAnimations.value.filter(a => a.id !== animationId);
  const resolve = equipmentResolvers.get(animationId);
  if (resolve) {
    equipmentResolvers.delete(animationId);
    resolve();
  }
}

const animationEvents = useAnimationEvents();
if (animationEvents) {
  animationEvents.registerHandler('map-combatant-enter', async (event) => {
    const data = event.data as { combatants?: Omit<CombatantAnimation, 'id'>[] } | undefined;
    const combatants = data?.combatants ?? [];
    if (combatants.length === 0) return;
    const promises = combatants.map((combatant) => queueCombatantAnimation(combatant));
    await Promise.all(promises);
  }, { skip: 'drop' });

  animationEvents.registerHandler('map-combatant-death', async (event) => {
    const data = event.data as { combatants?: Omit<DeathAnimationData, 'id'>[] } | undefined;
    const combatants = data?.combatants ?? [];
    if (combatants.length === 0) return;
    const promises = combatants.map((combatant) => queueDeathAnimation(combatant));
    await Promise.all(promises);
  }, { skip: 'drop' });

  animationEvents.registerHandler('map-combatant-move', async (event) => {
    const data = event.data as { moves?: Omit<CombatantMoveAnimationData, 'id'>[] } | undefined;
    const moves = data?.moves ?? [];
    if (moves.length === 0) return;
    const promises = moves.map((move) => queueMoveAnimation(move));
    await Promise.all(promises);
  }, { skip: 'drop' });

  animationEvents.registerHandler('map-equipment', async (event) => {
    const data = event.data as { animations?: Omit<EquipmentAnimationData, 'id'>[] } | undefined;
    const animations = data?.animations ?? [];
    if (animations.length === 0) return;
    const promises = animations.map((anim) => queueEquipmentAnimation({
      ...anim,
      direction: anim.direction ?? 'incoming',
    }));
    await Promise.all(promises);
  }, { skip: 'drop' });

  animationEvents.registerHandler('map-militia-train', async (event) => {
    const data = event.data as { animations?: { sectorId: string; count: number; isDictator: boolean; playerId?: string; startValue: number }[] } | undefined;
    const animations = data?.animations ?? [];
    if (animations.length === 0) return;
    const promises = animations.map((anim) =>
      queueAnimation(anim.sectorId, anim.count, undefined, anim.isDictator, anim.playerId, anim.startValue)
    );
    await Promise.all(promises);
  }, { skip: 'drop' });

  animationEvents.registerHandler('sector-explore', async (event) => {
    const data = event.data as { sectors?: { sectorId: string }[] } | undefined;
    const sectors = data?.sectors ?? [];
    if (sectors.length === 0) return;
    const promises = sectors.map((s) => queueSectorFlip(s.sectorId));
    await Promise.all(promises);
  }, { skip: 'drop' });

  animationEvents.registerHandler('tactic-seizure', async (event) => {
    const data = event.data as { sectors?: { sectorId: string }[] } | undefined;
    const sectors = data?.sectors ?? [];
    if (sectors.length === 0) return;
    const promises = sectors.map((s) => queueSectorFlip(s.sectorId));
    await Promise.all(promises);
  }, { skip: 'drop' });
}

// ============================================================================
// SECTOR EXPLORE FLIP ANIMATION
// ============================================================================

const flippingSectors = ref(new Set<string>());
const flipResolvers = new Map<string, () => void>();

function queueSectorFlip(sectorId: string): Promise<void> {
  return new Promise((resolve) => {
    nextTick(() => {
      flipResolvers.set(sectorId, resolve);
      flippingSectors.value = new Set([...flippingSectors.value, sectorId]);
    });
  });
}

function handleSectorFlipComplete(sectorId: string) {
  const newSet = new Set(flippingSectors.value);
  newSet.delete(sectorId);
  flippingSectors.value = newSet;
  const resolve = flipResolvers.get(sectorId);
  if (resolve) {
    flipResolvers.delete(sectorId);
    resolve();
  }
}

// ============================================================================
// MORTAR STRIKE ANIMATION
// ============================================================================

const mortarStrikeRect = computed(() => {
  if (!props.mortarStrike) return null;
  return getSectorRect(props.mortarStrike.targetSectorId);
});

function handleMortarStrikeComplete() {
  emit('mortarStrikeComplete');
}

// ============================================================================
// LANDMINE DETONATION ANIMATION
// ============================================================================

const landmineStrikeRect = computed(() => {
  if (!props.landmineStrike) return null;
  return getSectorRect(props.landmineStrike.sectorId);
});

function handleLandmineStrikeComplete() {
  emit('landmineStrikeComplete');
}

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

// Map player seats to colors (for rebel militia display)
const playerColorMap = computed(() => {
  const map: Record<string, string> = {};
  for (const player of props.players) {
    if (player.playerColor && !player.isDictator) {
      map[String(player.seat)] = player.playerColor;
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
      :flipping="flippingSectors.has(sector.sectorId)"
      @click="handleSectorClick"
      @drop-equipment="handleDropEquipment"
      @flip-complete="handleSectorFlipComplete"
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

    <!-- Combatant Death Animations (suppressed during combat, released by CombatPanel signals) -->
    <CombatantDeathAnimation
      v-for="death in pendingDeaths"
      :key="death.id"
      :combatant-id="death.combatantId"
      :combatant-name="death.combatantName"
      :image="death.image"
      :player-color="death.playerColor"
      :sector-id="death.sectorId"
      @complete="handleDeathAnimationComplete(death.id)"
    />

    <!-- Combatant Move Animations -->
    <CombatantMoveAnimation
      v-for="anim in activeMoveAnimations"
      :key="anim.id"
      :combatant-id="anim.combatantId"
      :combatant-name="anim.combatantName"
      :image="anim.image"
      :player-color="anim.playerColor"
      :from-sector-id="anim.fromSectorId"
      :to-sector-id="anim.toSectorId"
      @complete="handleMoveAnimationComplete(anim.id)"
    />

    <!-- Equipment Drop Animations -->
    <EquipmentDropAnimation
      v-for="anim in activeEquipmentAnimations"
      :key="anim.id"
      :equipment-name="anim.equipmentName"
      :equipment-type="anim.equipmentType"
      :image="anim.image"
      :sector-id="anim.sectorId"
      :combatant-id="anim.combatantId"
      :direction="anim.direction"
      @complete="handleEquipmentAnimationComplete(anim.id)"
    />

    <!-- Mortar Strike Animation -->
    <MortarStrikeAnimation
      v-if="mortarStrike && mortarStrikeRect"
      :sector-rect="mortarStrikeRect"
      :sector-id="mortarStrike.targetSectorId"
      :hit-combatant-ids="mortarStrike.hitCombatantIds"
      :militia-killed="mortarStrike.militiaKilled"
      @complete="handleMortarStrikeComplete"
    />

    <!-- Landmine Detonation Animation -->
    <LandmineDetonationAnimation
      v-if="landmineStrike && landmineStrikeRect"
      :sector-rect="landmineStrikeRect"
      :sector-id="landmineStrike.sectorId"
      :target-names="landmineStrike.targetNames"
      :damage="landmineStrike.damage"
      @complete="handleLandmineStrikeComplete"
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
