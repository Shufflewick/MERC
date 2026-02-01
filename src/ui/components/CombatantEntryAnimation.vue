<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { easeOutCubic } from 'boardsmith/utils';
import { getPlayerColor } from '../colors';

const props = defineProps<{
  combatantId: string;
  combatantName: string;
  image?: string;
  playerColor?: string;
  sectorId: string; // Used to query the destination element dynamically
}>();

const emit = defineEmits<{
  complete: [];
}>();

const isAnimating = ref(false);

// Animation timing
const ANIMATION_DURATION = 600;
const HOLD_PERCENT = 0.15; // Hold at center for first 15%

// Animation state (updated via requestAnimationFrame)
const currentX = ref(0);
const currentY = ref(0);
const currentSize = ref(500);
const currentBorderWidth = ref(8);
const currentOpacity = ref(0);
const currentNameOpacity = ref(0);
const currentNameSize = ref(2.5);

// Computed styles
const borderColor = computed(() => {
  if (!props.playerColor) return '#666';
  return getPlayerColor(props.playerColor);
});

const animationStyle = computed(() => ({
  left: `${currentX.value}px`,
  top: `${currentY.value}px`,
  opacity: currentOpacity.value,
}));

const portraitStyle = computed(() => ({
  width: `${currentSize.value}px`,
  height: `${currentSize.value}px`,
  borderWidth: `${currentBorderWidth.value}px`,
  borderColor: borderColor.value,
}));

const nameStyle = computed(() => ({
  opacity: currentNameOpacity.value,
  fontSize: `${currentNameSize.value}rem`,
}));

// Get current destination by querying the DOM
// We query the sector tile itself and calculate the bottom-left position
// (where mercs appear) since the mercs-area may be collapsed when empty
function getDestination(): { x: number; y: number } | null {
  const sectorEl = document.querySelector(`[data-sector-id="${props.sectorId}"]`);
  if (!sectorEl) return null;

  const rect = sectorEl.getBoundingClientRect();
  // Target the bottom-left area where mercs appear
  // Offset from left edge by ~30px (padding + half icon width)
  // Offset from bottom by ~30px (padding + half icon height)
  return {
    x: rect.left + 30,
    y: rect.bottom - 30,
  };
}

// Animation state
let animationFrameId: number | null = null;
let startTime: number | null = null;

function animate(timestamp: number) {
  if (!startTime) startTime = timestamp;
  const elapsed = timestamp - startTime;
  const rawProgress = Math.min(elapsed / ANIMATION_DURATION, 1);

  // Get current destination (may have moved due to scroll)
  const dest = getDestination();
  const startX = window.innerWidth / 2;
  const startY = window.innerHeight / 2;
  const endX = dest?.x ?? startX;
  const endY = dest?.y ?? startY;

  // Size animation values
  const startSize = 500;
  const peakSize = 520; // Slight scale-up during hold
  const endSize = 42;
  const startBorder = 8;
  const endBorder = 3;

  if (rawProgress <= HOLD_PERCENT) {
    // Hold phase: stay at center, scale up slightly
    const holdProgress = rawProgress / HOLD_PERCENT;
    const easedHold = easeOutCubic(holdProgress);

    currentX.value = startX;
    currentY.value = startY;
    currentSize.value = startSize + (peakSize - startSize) * easedHold;
    currentBorderWidth.value = startBorder;
    currentOpacity.value = easedHold; // Fade in
    currentNameOpacity.value = easedHold;
    currentNameSize.value = 2.5;
  } else {
    // Move phase: animate from center to destination
    const moveProgress = (rawProgress - HOLD_PERCENT) / (1 - HOLD_PERCENT);
    const easedMove = easeOutCubic(moveProgress);

    currentX.value = peakSize > startSize
      ? startX + (endX - startX) * easedMove
      : startX + (endX - startX) * easedMove;
    currentY.value = startY + (endY - startY) * easedMove;
    currentSize.value = peakSize + (endSize - peakSize) * easedMove;
    currentBorderWidth.value = startBorder + (endBorder - startBorder) * easedMove;
    currentOpacity.value = 1;

    // Name fades out in last 30%
    if (moveProgress > 0.65) {
      const fadeProgress = (moveProgress - 0.65) / 0.35;
      currentNameOpacity.value = 1 - fadeProgress;
    } else {
      currentNameOpacity.value = 1;
    }
    currentNameSize.value = 2.5 + (0.8 - 2.5) * easedMove;
  }

  if (rawProgress < 1) {
    animationFrameId = requestAnimationFrame(animate);
  } else {
    isAnimating.value = false;
    emit('complete');
  }
}

function handleImageError(event: Event) {
  const img = event.target as HTMLImageElement;
  console.error('[CombatantEntryAnimation] Image failed to load:', img.src);
}

// Start animation on mount
onMounted(() => {
  // Initialize position at center
  currentX.value = window.innerWidth / 2;
  currentY.value = window.innerHeight / 2;
  isAnimating.value = true;
  animationFrameId = requestAnimationFrame(animate);
});

onUnmounted(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
});
</script>

<template>
  <!-- Teleport to body to avoid transform context issues with position: fixed -->
  <Teleport to="body">
    <div
      v-if="isAnimating"
      class="combatant-entry-animation"
      :style="animationStyle"
    >
      <div class="animated-portrait" :style="portraitStyle">
        <img
          :src="image"
          :alt="combatantName"
          @error="handleImageError"
        />
      </div>
      <div class="animated-name" :style="nameStyle">{{ combatantName }}</div>
    </div>
  </Teleport>
</template>

<style>
/* Not scoped because we teleport to body */
.combatant-entry-animation {
  position: fixed;
  z-index: 2000;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.animated-portrait {
  border-radius: 50%;
  border-style: solid;
  overflow: hidden;
  background: #333;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
}

.animated-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.animated-name {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 16px;
  color: white;
  font-weight: 700;
  text-shadow: 0 4px 8px rgba(0, 0, 0, 0.8);
  white-space: nowrap;
}
</style>
