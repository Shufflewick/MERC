<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { easeInCubic } from 'boardsmith/utils';
import { getPlayerColor } from '../colors';

const props = defineProps<{
  combatantId: string;
  combatantName: string;
  image?: string;
  playerColor?: string;
  sectorId: string;
}>();

const emit = defineEmits<{
  complete: [];
}>();

const isAnimating = ref(false);
const showBloodOverlay = ref(false);

// Animation timing
const ANIMATION_DURATION = 600;
const BLOOD_OVERLAY_DURATION = 800; // Extra time to show the blood overlay
const HOLD_PERCENT = 0.15; // Hold at start for first 15%

// Animation state (updated via requestAnimationFrame)
const currentX = ref(0);
const currentY = ref(0);
const currentSize = ref(42);
const currentBorderWidth = ref(3);
const currentOpacity = ref(1);
const currentNameOpacity = ref(0);
const currentNameSize = ref(0.8);

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

// Get starting position by querying the DOM
function getStartPosition(): { x: number; y: number } | null {
  const sectorEl = document.querySelector(`[data-sector-id="${props.sectorId}"]`);
  if (!sectorEl) return null;

  const rect = sectorEl.getBoundingClientRect();
  // Start from bottom-left area where mercs appear
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

  // Get starting position (sector) and end position (center)
  const start = getStartPosition();
  const startX = start?.x ?? window.innerWidth / 2;
  const startY = start?.y ?? window.innerHeight / 2;
  const endX = window.innerWidth / 2;
  const endY = window.innerHeight / 2;

  // Size animation values (reverse of entry)
  const startSize = 42;
  const endSize = 500;
  const peakSize = 520;
  const startBorder = 3;
  const endBorder = 8;

  if (rawProgress <= HOLD_PERCENT) {
    // Hold phase: stay at sector position briefly
    currentX.value = startX;
    currentY.value = startY;
    currentSize.value = startSize;
    currentBorderWidth.value = startBorder;
    currentOpacity.value = 1;
    currentNameOpacity.value = 0;
    currentNameSize.value = 0.8;
  } else {
    // Move phase: animate from sector to center
    const moveProgress = (rawProgress - HOLD_PERCENT) / (1 - HOLD_PERCENT);
    const easedMove = easeInCubic(moveProgress);

    currentX.value = startX + (endX - startX) * easedMove;
    currentY.value = startY + (endY - startY) * easedMove;
    currentSize.value = startSize + (endSize - startSize) * easedMove;
    currentBorderWidth.value = startBorder + (endBorder - startBorder) * easedMove;
    currentOpacity.value = 1;

    // Name fades in during last 50%
    if (moveProgress > 0.5) {
      const fadeProgress = (moveProgress - 0.5) / 0.5;
      currentNameOpacity.value = fadeProgress;
    }
    currentNameSize.value = 0.8 + (2.5 - 0.8) * easedMove;
  }

  if (rawProgress < 1) {
    animationFrameId = requestAnimationFrame(animate);
  } else {
    // Animation complete - show blood overlay
    currentSize.value = peakSize;
    showBloodOverlay.value = true;

    // Hold with blood overlay, then complete
    setTimeout(() => {
      isAnimating.value = false;
      emit('complete');
    }, BLOOD_OVERLAY_DURATION);
  }
}

function handleImageError(event: Event) {
  const img = event.target as HTMLImageElement;
  console.error('[CombatantDeathAnimation] Image failed to load:', img.src);
}

// Start animation on mount
onMounted(() => {
  // Initialize position at sector
  const start = getStartPosition();
  currentX.value = start?.x ?? window.innerWidth / 2;
  currentY.value = start?.y ?? window.innerHeight / 2;
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
      class="combatant-death-animation"
      :style="animationStyle"
    >
      <div class="animated-portrait" :style="portraitStyle">
        <img
          :src="image"
          :alt="combatantName"
          @error="handleImageError"
        />
        <!-- Blood overlay -->
        <div v-if="showBloodOverlay" class="blood-overlay"></div>
      </div>
      <div class="animated-name" :style="nameStyle">{{ combatantName }}</div>
    </div>
  </Teleport>
</template>

<style>
/* Not scoped because we teleport to body */
.combatant-death-animation {
  position: fixed;
  z-index: 2000;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.combatant-death-animation .animated-portrait {
  position: relative;
  border-radius: 50%;
  border-style: solid;
  overflow: hidden;
  background: #333;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
}

.combatant-death-animation .animated-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.combatant-death-animation .blood-overlay {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle,
    rgba(139, 0, 0, 0.85) 0%,
    rgba(80, 0, 0, 0.9) 100%
  );
  animation: blood-pulse 0.8s ease-out forwards;
}

@keyframes blood-pulse {
  0% {
    opacity: 0;
    transform: scale(0.8);
  }
  30% {
    opacity: 1;
    transform: scale(1.05);
  }
  100% {
    opacity: 0.9;
    transform: scale(1);
  }
}

.combatant-death-animation .animated-name {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 16px;
  color: #ff4444;
  font-weight: 700;
  text-shadow: 0 4px 8px rgba(0, 0, 0, 0.8);
  white-space: nowrap;
}
</style>
