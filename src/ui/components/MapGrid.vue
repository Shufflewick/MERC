<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import SectorTile from './SectorTile.vue';
import MilitiaTrainAnimation from './MilitiaTrainAnimation.vue';
import CombatantEntryAnimation from './CombatantEntryAnimation.vue';
import CombatantDeathAnimation from './CombatantDeathAnimation.vue';
import CombatantMoveAnimation from './CombatantMoveAnimation.vue';
import EquipmentDropAnimation from './EquipmentDropAnimation.vue';
// Death animation data (local to MapGrid — suppressed during combat, released by CombatPanel signals)

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
  combatActive?: boolean; // Whether combat panel is active (suppresses auto death animations)
  combatDeathSignals?: { combatantId: string }[]; // Signals from CombatPanel timeline to play death animations
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
          const player = props.players.find(p => String(p.seat) === playerId);
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

// Local death animation tracking — deaths suppressed during combat until CombatPanel signals
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

// Deaths suppressed during combat, keyed by combatantId — released by CombatPanel signals
const suppressedDeaths = new Map<string, DeathAnimationData>();

// Active combatant move animations
const activeMoveAnimations = ref<CombatantMoveAnimationData[]>([]);

// Moves suppressed during combat — released when combat ends
const suppressedMoves: CombatantMoveAnimationData[] = [];

// Track whether combat was already active before the current mercs watcher tick.
// Movement into the combat sector and combatActive becoming true arrive in the same
// reactive flush, so we use this to avoid suppressing the entry movement.
let combatWasActive = false;

// Active equipment drop animations
const activeEquipmentAnimations = ref<EquipmentAnimationData[]>([]);

// Set of combatant IDs currently animating (for hiding in SectorTile)
const animatingCombatantIds = computed(() => {
  const ids = new Set<string>();
  for (const a of activeCombatantAnimations.value) ids.add(a.combatantId);
  for (const a of activeMoveAnimations.value) ids.add(a.combatantId);
  return ids;
});

// Track previous mercs to detect new arrivals and deaths
const previousMercIds = ref<Set<string>>(new Set());
// Store previous merc data so we can animate deaths
const previousMercData = ref<Map<string, MercData>>(new Map());
// Store previous equipment per merc to detect equipment changes
// Key: combatantId, Value: Map of slotType -> equipmentId
const previousMercEquipment = ref<Map<string, Map<string, string>>>(new Map());

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

// Handle combatant entry animation complete
function handleCombatantAnimationComplete(animationId: string) {
  activeCombatantAnimations.value = activeCombatantAnimations.value.filter(a => a.id !== animationId);
}

function buildDeathData(merc: MercData): DeathAnimationData {
  return {
    id: `death-${Date.now()}-${++deathIdCounter}`,
    combatantId: merc.combatantId,
    combatantName: merc.combatantName || merc.combatantId,
    image: merc.image,
    playerColor: merc.playerColor,
    sectorId: merc.sectorId!,
  };
}

// Queue a combatant death animation — suppressed during combat until CombatPanel signals
function queueDeathAnimation(merc: MercData) {
  if (!merc.sectorId) return;

  const data = buildDeathData(merc);

  if (props.combatActive) {
    // Suppress: hold until CombatPanel's timeline emits the signal
    suppressedDeaths.set(data.combatantId, data);
    return;
  }

  nextTick(() => {
    pendingDeaths.value.push(data);
  });
}

// Handle combatant death animation complete
function handleDeathAnimationComplete(deathId: string) {
  pendingDeaths.value = pendingDeaths.value.filter(d => d.id !== deathId);
}

// Release suppressed deaths when CombatPanel signals
watch(() => props.combatDeathSignals?.length, () => {
  const signals = props.combatDeathSignals;
  if (!signals || signals.length === 0) return;

  // Process the latest signal (array grows by one each time)
  const latest = signals[signals.length - 1];
  const suppressed = suppressedDeaths.get(latest.combatantId);
  if (suppressed) {
    suppressedDeaths.delete(latest.combatantId);
    nextTick(() => {
      pendingDeaths.value.push(suppressed);
    });
  }
});

// Release all suppressed animations when combat ends
watch(() => props.combatActive, (active, wasActive) => {
  if (!wasActive || active) return;

  if (suppressedDeaths.size > 0) {
    const remainingDeaths = [...suppressedDeaths.values()];
    suppressedDeaths.clear();
    nextTick(() => {
      pendingDeaths.value.push(...remainingDeaths);
    });
  }

  if (suppressedMoves.length > 0) {
    const remainingMoves = suppressedMoves.splice(0);
    nextTick(() => {
      activeMoveAnimations.value.push(...remainingMoves);
    });
  }
});

// Queue a combatant move animation — suppressed during combat until combat ends
function queueMoveAnimation(merc: MercData, fromSectorId: string, toSectorId: string) {
  const data: CombatantMoveAnimationData = {
    id: getAnimationId('move'),
    combatantId: merc.combatantId,
    combatantName: merc.combatantName || merc.combatantId,
    image: merc.image,
    playerColor: merc.playerColor,
    fromSectorId,
    toSectorId,
  };

  if (combatWasActive) {
    suppressedMoves.push(data);
    return;
  }

  nextTick(() => {
    activeMoveAnimations.value.push(data);
  });
}

// Handle combatant move animation complete
function handleMoveAnimationComplete(animationId: string) {
  activeMoveAnimations.value = activeMoveAnimations.value.filter(a => a.id !== animationId);
}

// ============================================================================
// EQUIPMENT DROP ANIMATION
// ============================================================================

// Helper to extract equipment from merc data (handles both direct props and attributes)
function getMercEquipment(merc: MercData): Map<string, EquipmentData | undefined> {
  const equipment = new Map<string, EquipmentData | undefined>();

  // Check direct props first, then fall back to attributes
  const weapon = merc.weaponSlot || merc.attributes?.weaponSlotData;
  const armor = merc.armorSlot || merc.attributes?.armorSlotData;
  const accessory = merc.accessorySlot || merc.attributes?.accessorySlotData;

  if (weapon) equipment.set('weapon', weapon);
  if (armor) equipment.set('armor', armor);
  if (accessory) equipment.set('accessory', accessory);

  return equipment;
}

// Queue an equipment drop animation
function queueEquipmentAnimation(
  equipment: EquipmentData,
  sectorId: string,
  combatantId?: string,
  direction: 'incoming' | 'outgoing' = 'incoming'
) {
  nextTick(() => {
    activeEquipmentAnimations.value.push({
      id: getAnimationId('equipment'),
      equipmentName: equipment.equipmentName || 'Equipment',
      equipmentType: equipment.equipmentType || 'Accessory',
      image: equipment.image,
      sectorId,
      combatantId,
      direction,
    });
  });
}

// Handle equipment animation complete
function handleEquipmentAnimationComplete(animationId: string) {
  activeEquipmentAnimations.value = activeEquipmentAnimations.value.filter(a => a.id !== animationId);
}

// Helper to build equipment ID map for a merc
function buildEquipmentIdMap(merc: MercData): Map<string, string> {
  const idMap = new Map<string, string>();
  const equipment = getMercEquipment(merc);

  for (const [slot, equip] of equipment) {
    if (equip?.equipmentId) {
      idMap.set(slot, equip.equipmentId);
    } else if (equip?.equipmentName) {
      // Fall back to name if no ID
      idMap.set(slot, equip.equipmentName);
    }
  }

  return idMap;
}

// Watch for new mercs appearing in sectors, deaths, moves, and equipment changes
watch(
  () => props.mercs,
  (newMercs, oldMercs) => {
    // Skip on first load (oldMercs is undefined)
    if (!oldMercs) {
      // Initialize tracking
      previousMercIds.value = new Set(newMercs.map(m => m.combatantId));
      for (const merc of newMercs) {
        previousMercData.value.set(merc.combatantId, merc);
        // Initialize equipment tracking
        previousMercEquipment.value.set(merc.combatantId, buildEquipmentIdMap(merc));
      }
      return;
    }

    const newMercIds = new Set(newMercs.map(m => m.combatantId));

    // Find mercs that are new (not in previous set) and have a sectorId
    for (const merc of newMercs) {
      if (merc.sectorId && !previousMercIds.value.has(merc.combatantId)) {
        queueCombatantAnimation(merc);
      }
    }

    // Find mercs that moved sectors (exist in both but different sectorId)
    for (const merc of newMercs) {
      if (!merc.sectorId) continue;
      const prevMerc = previousMercData.value.get(merc.combatantId);
      if (prevMerc && prevMerc.sectorId && prevMerc.sectorId !== merc.sectorId) {
        queueMoveAnimation(merc, prevMerc.sectorId, merc.sectorId);
      }
    }

    // Find mercs that were removed (in previous set but not in new set)
    for (const prevId of previousMercIds.value) {
      if (!newMercIds.has(prevId)) {
        const prevMerc = previousMercData.value.get(prevId);
        if (prevMerc) {
          queueDeathAnimation(prevMerc);
        }
      }
    }

    // Check for equipment changes on existing mercs (skip newly added mercs)
    for (const merc of newMercs) {
      if (!merc.sectorId) continue;
      // Skip mercs that just entered - they already have entry animation
      if (!previousMercIds.value.has(merc.combatantId)) continue;

      const prevEquipment = previousMercEquipment.value.get(merc.combatantId);
      if (!prevEquipment) continue; // No previous data to compare

      const currentEquipment = getMercEquipment(merc);
      const currentEquipmentIds = buildEquipmentIdMap(merc);
      const prevMerc = previousMercData.value.get(merc.combatantId);
      const prevMercEquipmentData = prevMerc ? getMercEquipment(prevMerc) : new Map();

      // Check each slot for newly added equipment
      for (const [slot, equip] of currentEquipment) {
        if (!equip) continue;

        const equipId = equip.equipmentId || equip.equipmentName || '';
        const prevEquipId = prevEquipment.get(slot);

        // Equipment was added to this slot (wasn't there before, or different item)
        if (equipId && equipId !== prevEquipId) {
          queueEquipmentAnimation(equip, merc.sectorId, merc.combatantId, 'incoming');
        }
      }

      // Check for removed or replaced equipment (was in prev but gone or different in current)
      for (const [slot, prevEquipId] of prevEquipment) {
        const currentEquipId = currentEquipmentIds.get(slot);

        // Equipment was removed or replaced in this slot
        if (prevEquipId && prevEquipId !== currentEquipId) {
          // Get the equipment data from previous merc data
          const removedEquip = prevMercEquipmentData.get(slot);
          if (removedEquip) {
            queueEquipmentAnimation(removedEquip, merc.sectorId, merc.combatantId, 'outgoing');
          }
        }
      }
    }

    // Update tracking
    previousMercIds.value = newMercIds;
    previousMercData.value.clear();
    previousMercEquipment.value.clear();
    for (const merc of newMercs) {
      previousMercData.value.set(merc.combatantId, merc);
      previousMercEquipment.value.set(merc.combatantId, buildEquipmentIdMap(merc));
    }

    // Snapshot combat state so the next tick knows whether combat was already active
    combatWasActive = props.combatActive ?? false;
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
