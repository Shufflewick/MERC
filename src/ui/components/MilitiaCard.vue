<script setup lang="ts">
import { computed, ref } from 'vue';
import { UI_COLORS, getPlayerColor } from '../colors';

const props = defineProps<{
  count: number;
  isDictator?: boolean;
  playerColor?: string;
  // Dictator militia bonuses from tactics cards
  betterWeapons?: boolean;   // Militia hit on 3+ instead of 4+
  veteranMilitia?: boolean;  // Militia have +1 initiative
}>();

const militiaColor = computed(() => {
  if (props.playerColor) return getPlayerColor(props.playerColor);
  return '#888';
});

const sideName = computed(() => {
  return props.isDictator ? 'Dictator' : 'Rebels';
});

const militiaDescription = computed(() => {
  return props.isDictator
    ? 'Loyal soldiers defending territory for the regime.'
    : 'Freedom fighters trained by rebel MERCs to hold captured territory.';
});

// Tooltip state
const activeTooltip = ref<string | null>(null);

function showTooltip(stat: string) {
  activeTooltip.value = stat;
}

function hideTooltip() {
  activeTooltip.value = null;
}

function toggleTooltip(stat: string) {
  activeTooltip.value = activeTooltip.value === stat ? null : stat;
}

// Combat breakdown for tooltip
const combatBreakdown = computed(() => {
  const breakdown = [{ label: 'Base', value: '1 die (4+)' }];
  if (props.betterWeapons) {
    breakdown.push({ label: 'Better Weapons', value: 'hit on 3+' });
  }
  return breakdown;
});

// Combat display string
const combatDisplay = computed(() => {
  return props.betterWeapons ? '1 die (3+)' : '1 die (4+)';
});

// Initiative breakdown for tooltip
const initiativeBreakdown = computed(() => {
  const breakdown = [{ label: 'Base', value: 1 }];
  if (props.veteranMilitia) {
    breakdown.push({ label: 'Veteran Militia', value: 1 });
  }
  return breakdown;
});

// Initiative display value
const initiativeDisplay = computed(() => {
  return props.veteranMilitia ? 2 : 1;
});
</script>

<template>
  <div class="militia-card">
    <div class="militia-header" :style="{ borderColor: militiaColor }">
      <div class="militia-icon">🎖️</div>
      <div class="militia-title">Militia</div>
    </div>

    <div class="militia-body">
      <div class="militia-side-display">
        <span class="side-label">Side</span>
        <span class="side-value" :style="{ color: militiaColor }">{{ sideName }}</span>
      </div>

      <div class="militia-count-display">
        <span class="count-label">Count</span>
        <span class="count-value" :style="{ color: militiaColor }">{{ count }}</span>
      </div>

      <div class="militia-stats">
        <!-- Combat stat with tooltip -->
        <div
          class="stat-row"
          :class="{ 'stat-clickable': betterWeapons }"
          @mouseenter="betterWeapons && showTooltip('combat')"
          @mouseleave="hideTooltip"
          @click="betterWeapons && toggleTooltip('combat')"
        >
          <span class="stat-label">Combat</span>
          <span class="stat-value" :class="{ modified: betterWeapons }">{{ combatDisplay }}</span>
          <div class="stat-tooltip" v-if="activeTooltip === 'combat' && betterWeapons">
            <div v-for="(item, idx) in combatBreakdown" :key="idx" class="tooltip-row">
              <span class="tooltip-label">{{ item.label }}</span>
              <span class="tooltip-value" :class="{ positive: idx > 0 }">{{ item.value }}</span>
            </div>
          </div>
        </div>

        <!-- Initiative stat with tooltip -->
        <div
          class="stat-row"
          :class="{ 'stat-clickable': veteranMilitia }"
          @mouseenter="veteranMilitia && showTooltip('initiative')"
          @mouseleave="hideTooltip"
          @click="veteranMilitia && toggleTooltip('initiative')"
        >
          <span class="stat-label">Initiative</span>
          <span class="stat-value" :class="{ modified: veteranMilitia }">{{ initiativeDisplay }}</span>
          <div class="stat-tooltip" v-if="activeTooltip === 'initiative' && veteranMilitia">
            <div v-for="(item, idx) in initiativeBreakdown" :key="idx" class="tooltip-row">
              <span class="tooltip-label">{{ item.label }}</span>
              <span class="tooltip-value" :class="{ positive: idx > 0 }">
                {{ idx === 0 ? item.value : `+${item.value}` }}
              </span>
            </div>
            <div class="tooltip-row tooltip-total">
              <span class="tooltip-label">Total</span>
              <span class="tooltip-value">{{ initiativeDisplay }}</span>
            </div>
          </div>
        </div>

        <div class="stat-row">
          <span class="stat-label">Health</span>
          <span class="stat-value">1 each</span>
        </div>
      </div>

      <div class="militia-description">
        {{ militiaDescription }}
      </div>

      <div class="militia-notes">
        <div class="note">• Roll 1 die per militia in combat</div>
        <div class="note">• Each hit kills 1 militia</div>
        <div class="note" v-if="!isDictator">• Trained by MERCs (1 action = 1 militia)</div>
        <div class="note" v-else>• Max 10 per sector (Kim: 20 at base)</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.militia-card {
  background: v-bind('UI_COLORS.surface');
  border: 1px solid v-bind('UI_COLORS.border');
  border-radius: 12px;
  overflow: hidden;
  width: 280px;
}

.militia-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 3px solid;
}

.militia-icon {
  font-size: 2rem;
}

.militia-title {
  font-size: 1.2rem;
  font-weight: bold;
  color: v-bind('UI_COLORS.textPrimary');
}

.militia-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.militia-side-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.side-label {
  font-size: 0.9rem;
  color: v-bind('UI_COLORS.textSecondary');
  font-weight: 500;
}

.side-value {
  font-size: 1.1rem;
  font-weight: bold;
}

.militia-count-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.count-label {
  font-size: 0.9rem;
  color: v-bind('UI_COLORS.textSecondary');
  font-weight: 500;
}

.count-value {
  font-size: 2rem;
  font-weight: bold;
}

.militia-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.stat-row:last-child {
  border-bottom: none;
}

.stat-label {
  font-size: 0.85rem;
  color: v-bind('UI_COLORS.textSecondary');
}

.stat-value {
  font-size: 0.9rem;
  font-weight: 600;
  color: v-bind('UI_COLORS.textPrimary');
}

.stat-value.modified {
  color: #4caf50;
}

.stat-row.stat-clickable {
  cursor: pointer;
  position: relative;
}

.stat-row.stat-clickable:hover {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

/* Tooltip styles */
.stat-tooltip {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: v-bind('UI_COLORS.surfaceAlt');
  border: 1px solid v-bind('UI_COLORS.border');
  border-radius: 6px;
  padding: 8px 12px;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.tooltip-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  font-size: 0.8rem;
}

.tooltip-row:first-child {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 6px;
  margin-bottom: 4px;
}

.tooltip-label {
  color: v-bind('UI_COLORS.textSecondary');
}

.tooltip-row:first-child .tooltip-label {
  color: v-bind('UI_COLORS.textPrimary');
  font-weight: 500;
}

.tooltip-value {
  font-weight: 600;
  color: v-bind('UI_COLORS.textPrimary');
}

.tooltip-value.positive {
  color: #4caf50;
}

.tooltip-total {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 6px;
  margin-top: 4px;
}

.tooltip-total .tooltip-label {
  font-weight: 600;
  color: v-bind('UI_COLORS.textPrimary');
}

.tooltip-total .tooltip-value {
  color: v-bind('UI_COLORS.accent');
}

.militia-description {
  font-size: 0.85rem;
  color: v-bind('UI_COLORS.textSecondary');
  line-height: 1.4;
  font-style: italic;
}

.militia-notes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.note {
  font-size: 0.8rem;
  color: v-bind('UI_COLORS.textSecondary');
}
</style>
