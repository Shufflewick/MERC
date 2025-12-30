<script setup lang="ts">
import { computed, ref } from 'vue';
import { getPlayerColor } from '../colors';
import MilitiaIndicator from './MilitiaIndicator.vue';
import DetailModal from './DetailModal.vue';
import MercCard from './MercCard.vue';

interface SectorData {
  sectorId: string;
  sectorName: string;
  sectorType: 'Wilderness' | 'City' | 'Industry';
  value: number;
  image?: string;
  explored: boolean;
  dictatorMilitia: number;
  rebelMilitia?: Record<string, number>;
}

// Extended interface to include full MERC data for card display
interface MercInSector {
  mercId: string;
  mercName?: string;
  image?: string;
  playerColor?: string;
  // Full MERC data (from gameView)
  attributes?: Record<string, any>;
  // Optional additional fields
  training?: number;
  combat?: number;
  initiative?: number;
  health?: number;
  maxHealth?: number;
  damage?: number;
  actionsRemaining?: number;
  ability?: string;
  weaponSlot?: any;
  armorSlot?: any;
  accessorySlot?: any;
}

const props = defineProps<{
  sector: SectorData;
  controllingPlayerColor?: string;
  mercsInSector: MercInSector[];
  playerColorMap?: Record<string, string>; // Maps player ID to color name
  isClickable?: boolean;
  canDropEquipment?: boolean;
}>();

const emit = defineEmits<{
  click: [sectorId: string];
  dropEquipment: [mercId: string, slotType: 'Weapon' | 'Armor' | 'Accessory'];
}>();

function handleDropEquipment(mercId: string, slotType: 'Weapon' | 'Armor' | 'Accessory') {
  emit('dropEquipment', mercId, slotType);
  // Close the MERC modal so it refreshes with updated data when reopened
  closeMercModal();
}

// Get unique key for merc - never returns empty to prevent Vue warnings
function getMercKey(merc: MercInSector, index: number): string {
  return merc.mercId || merc.mercName || `merc-${index}`;
}

const showTooltip = ref(false);

const borderColor = computed(() => {
  if (!props.controllingPlayerColor) return 'transparent';
  return getPlayerColor(props.controllingPlayerColor);
});

const displayName = computed(() => {
  const { sectorName, sectorType } = props.sector;
  // sectorName already includes the type (e.g., "Silver Industry", "Maplewood City")
  // Just use sectorName directly unless it's missing
  if (sectorName) {
    return sectorName;
  }
  // Fallback to just showing the type
  return sectorType;
});

const imagePath = computed(() => {
  if (props.sector.image) return props.sector.image;
  // Fallback based on type
  const type = props.sector.sectorType.toLowerCase();
  if (type === 'wilderness') return '/sectors/wilderness.jpg';
  if (type === 'city') return '/sectors/town---a.jpg';
  return '/sectors/industry---coal.jpg';
});

// Group MERCs by player color for display
const mercsByPlayer = computed(() => {
  const grouped: Record<string, MercInSector[]> = {};
  for (const merc of props.mercsInSector) {
    const color = merc.playerColor || 'unknown';
    if (!grouped[color]) grouped[color] = [];
    grouped[color].push(merc);
  }
  return grouped;
});

// Rebel militia entries with color mapping (filter out zeros)
const rebelMilitiaEntries = computed(() => {
  const rm = props.sector.rebelMilitia || {};
  const colorMap = props.playerColorMap || {};
  return Object.entries(rm)
    .filter(([, count]) => count > 0)
    .map(([playerId, count]) => ({
      playerId,
      count,
      color: colorMap[playerId] || 'unknown', // Map player ID to color name
    }));
});

function handleClick() {
  // Always emit click - let parent decide what to do
  emit('click', props.sector.sectorId);
}

function getMercImagePath(merc: MercInSector) {
  if (merc.image) return merc.image;
  return `/mercs/${merc.mercId}.jpg`;
}

// Modal state for viewing MERC details
const showMercModal = ref(false);
const selectedMerc = ref<MercInSector | null>(null);

function showMercDetails(merc: MercInSector, event: Event) {
  event.stopPropagation(); // Don't trigger sector click
  selectedMerc.value = merc;
  showMercModal.value = true;
}

function closeMercModal() {
  showMercModal.value = false;
  selectedMerc.value = null;
}
</script>

<template>
  <div
    class="sector-tile"
    :class="{ clickable: isClickable, controlled: controllingPlayerColor }"
    :style="{
      backgroundImage: `url(${imagePath})`,
      borderColor,
    }"
    @click="handleClick"
    @mouseenter="showTooltip = true"
    @mouseleave="showTooltip = false"
  >
    <!-- Dark overlay for readability -->
    <div class="overlay"></div>

    <!-- Top row: Name and Value -->
    <div class="top-row">
      <span class="sector-name">{{ displayName }}</span>
      <span class="sector-value">Value: {{ sector.value }}</span>
    </div>

    <!-- Center: Unexplored or loot -->
    <div class="center-area">
      <template v-if="!sector.explored">
        <div class="unexplored">
          <span class="question-mark">?</span>
          <span class="unexplored-text">Unexplored</span>
        </div>
      </template>
    </div>

    <!-- Bottom row: MERCs and Militia -->
    <div class="bottom-row">
      <!-- MERC portraits (clickable) -->
      <div class="mercs-area">
        <div
          v-for="(merc, index) in mercsInSector.slice(0, 4)"
          :key="getMercKey(merc, index)"
          class="merc-portrait clickable"
          :style="{ borderColor: getPlayerColor(merc.playerColor) }"
          @click="showMercDetails(merc, $event)"
          :title="`Click to view ${merc.mercName || merc.mercId}`"
        >
          <img :src="getMercImagePath(merc)" :alt="merc.mercName || merc.mercId" />
        </div>
        <div v-if="mercsInSector.length > 4" class="more-mercs">
          +{{ mercsInSector.length - 4 }}
        </div>
      </div>

      <!-- Militia indicators -->
      <div class="militia-area">
        <MilitiaIndicator
          v-if="sector.dictatorMilitia > 0"
          :count="sector.dictatorMilitia"
          :is-dictator="true"
        />
        <MilitiaIndicator
          v-for="entry in rebelMilitiaEntries"
          :key="entry.playerId"
          :count="entry.count"
          :player-color="entry.color"
        />
      </div>
    </div>

    <!-- Tooltip for MERCs -->
    <div v-if="showTooltip && mercsInSector.length > 0" class="merc-tooltip">
      <div
        v-for="(merc, index) in mercsInSector"
        :key="getMercKey(merc, 100 + index)"
        class="tooltip-merc clickable"
        @click="showMercDetails(merc, $event)"
      >
        <div
          class="tooltip-portrait"
          :style="{ borderColor: getPlayerColor(merc.playerColor) }"
        >
          <img :src="getMercImagePath(merc)" :alt="merc.mercName || merc.mercId" />
        </div>
        <span class="tooltip-name">{{ merc.mercName || merc.mercId }}</span>
        <span class="tooltip-hint">ℹ</span>
      </div>
    </div>

    <!-- MERC Details Modal -->
    <DetailModal :show="showMercModal" @close="closeMercModal">
      <MercCard
        v-if="selectedMerc"
        :merc="selectedMerc"
        :player-color="selectedMerc.playerColor"
        :show-equipment="true"
        :can-drop-equipment="canDropEquipment"
        @drop-equipment="handleDropEquipment"
      />
    </DetailModal>
  </div>
</template>

<style scoped>
.sector-tile {
  position: relative;
  aspect-ratio: 2 / 1;
  background-size: cover;
  background-position: center;
  border-radius: 8px;
  border: 3px solid transparent;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
}

.sector-tile.controlled {
  border-style: solid;
}

.sector-tile.clickable {
  cursor: pointer;
}

.sector-tile.clickable:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.6) 0%,
    rgba(0, 0, 0, 0.2) 40%,
    rgba(0, 0, 0, 0.4) 100%
  );
}

.top-row,
.center-area,
.bottom-row {
  position: relative;
  z-index: 1;
}

.top-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 10px;
}

.sector-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: white;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.sector-value {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.center-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
}

.unexplored {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.question-mark {
  font-size: 2rem;
  color: rgba(255, 255, 255, 0.7);
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.unexplored-text {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.8);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.bottom-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 8px 10px;
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
}

.mercs-area {
  display: flex;
  gap: 4px;
}

.merc-portrait {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid;
  overflow: hidden;
  background: #333;
}

.merc-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.merc-portrait.clickable {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.merc-portrait.clickable:hover {
  transform: scale(1.15);
  box-shadow: 0 0 8px rgba(212, 168, 75, 0.8);
  z-index: 10;
}

.more-mercs {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 0.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.militia-area {
  display: flex;
  gap: 4px;
}

/* Tooltip */
.merc-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(30, 40, 30, 0.95);
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 150px;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.tooltip-merc {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tooltip-portrait {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid;
  overflow: hidden;
}

.tooltip-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tooltip-name {
  font-size: 0.85rem;
  color: white;
  flex: 1;
}

.tooltip-merc.clickable {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
}

.tooltip-merc.clickable:hover {
  background: rgba(212, 168, 75, 0.2);
}

.tooltip-hint {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.8rem;
  opacity: 0;
  transition: opacity 0.2s;
}

.tooltip-merc.clickable:hover .tooltip-hint {
  opacity: 1;
}
</style>
