<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';

const props = defineProps<{
  sectorRect: { x: number; y: number; width: number; height: number };
  sectorId: string;
  hitCombatantIds: string[];
  militiaKilled: number;
}>();

const emit = defineEmits<{
  complete: [];
}>();

interface FlashPosition {
  x: number;
  y: number;
  size: number;
}

// Phase tracking
const flashPositions = ref<FlashPosition[]>([]);
const showFlashes = ref(false);
const currentFallingIndex = ref(-1);
const fallingActive = ref(false);

// Timing constants
const FLASH_DURATION = 500;
const FALL_DURATION = 300;
const FALL_GAP = 100;

// Find each hit combatant's icon position relative to the MapGrid
function computeFlashPositions() {
  const mapGrid = document.querySelector('.map-grid');
  if (!mapGrid) return;

  const gridRect = mapGrid.getBoundingClientRect();
  const positions: FlashPosition[] = [];

  for (const id of props.hitCombatantIds) {
    const el = mapGrid.querySelector(`[data-combatant-id="${id}"]`);
    if (!el) continue;

    const iconRect = el.getBoundingClientRect();
    const size = Math.max(iconRect.width, iconRect.height);
    positions.push({
      x: iconRect.left - gridRect.left + iconRect.width / 2,
      y: iconRect.top - gridRect.top + iconRect.height / 2,
      size: size * 1.6,
    });
  }

  flashPositions.value = positions;
}

function startAnimation() {
  computeFlashPositions();

  if (flashPositions.value.length === 0 && props.militiaKilled === 0) {
    emit('complete');
    return;
  }

  // Phase 1: flash on each hit icon
  if (flashPositions.value.length > 0) {
    showFlashes.value = true;
    setTimeout(() => {
      showFlashes.value = false;
      startFallPhase();
    }, FLASH_DURATION);
  } else {
    startFallPhase();
  }
}

function startFallPhase() {
  if (props.militiaKilled > 0) {
    currentFallingIndex.value = 0;
    fallingActive.value = true;
    playNextFall();
  } else {
    emit('complete');
  }
}

function playNextFall() {
  if (currentFallingIndex.value >= props.militiaKilled) {
    fallingActive.value = false;
    emit('complete');
    return;
  }

  setTimeout(() => {
    currentFallingIndex.value++;
    setTimeout(() => {
      playNextFall();
    }, FALL_GAP);
  }, FALL_DURATION);
}

onMounted(() => {
  nextTick(() => startAnimation());
});
</script>

<template>
  <!-- Phase 1: Red flash on each hit combatant icon -->
  <div
    v-for="(pos, index) in flashPositions"
    :key="`flash-${index}`"
    v-show="showFlashes"
    class="mortar-flash"
    :style="{
      left: `${pos.x}px`,
      top: `${pos.y}px`,
      width: `${pos.size}px`,
      height: `${pos.size}px`,
      '--flash-duration': `${FLASH_DURATION}ms`,
    }"
  />

  <!-- Phase 2: Militia shields falling out of sector -->
  <div
    v-if="militiaKilled > 0"
    class="mortar-fall-container"
    :style="{
      left: `${sectorRect.x}px`,
      top: `${sectorRect.y}px`,
      width: `${sectorRect.width}px`,
      height: `${sectorRect.height}px`,
    }"
  >
    <div
      v-for="i in militiaKilled"
      :key="`fall-${i}`"
      v-show="fallingActive && currentFallingIndex >= (i - 1)"
      class="falling-shield"
      :style="{
        '--fall-duration': `${FALL_DURATION}ms`,
        '--fall-offset': `${((i - 1) % 3 - 1) * 20}px`,
      }"
    >
      <span class="shield-icon">🛡️</span>
    </div>
  </div>
</template>

<style scoped>
/* Phase 1: Red flash centered on each combatant icon */
.mortar-flash {
  position: absolute;
  pointer-events: none;
  z-index: 1000;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    circle,
    rgba(255, 60, 20, 0.9) 0%,
    rgba(255, 120, 40, 0.6) 40%,
    rgba(200, 30, 0, 0.3) 70%,
    transparent 100%
  );
  animation: mortar-pulse var(--flash-duration) ease-out forwards;
}

/* Phase 2: Container positioned over sector */
.mortar-fall-container {
  position: absolute;
  pointer-events: none;
  z-index: 1000;
  overflow: visible;
}

.falling-shield {
  position: absolute;
  bottom: 10%;
  right: 10%;
  animation: shield-fall var(--fall-duration) ease-in forwards;
}

.shield-icon {
  font-size: 1.5rem;
  display: block;
}

@keyframes mortar-pulse {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.3);
  }
  20% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.1);
  }
  60% {
    opacity: 0.8;
    transform: translate(-50%, -50%) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.2);
  }
}

@keyframes shield-fall {
  0% {
    transform: translateY(0) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translate(var(--fall-offset), 80px) rotate(120deg);
    opacity: 0;
  }
}
</style>
