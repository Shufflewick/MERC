<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { getPlayerColor } from '../colors';

const props = defineProps<{
  combatantId: string;
  combatantName: string;
  image?: string;
  playerColor?: string;
  fromSectorId: string;
  toSectorId: string;
}>();

const emit = defineEmits<{
  complete: [];
}>();

const isAnimating = ref(false);

// Animation timing
const ANIMATION_DURATION = 400;

// Animation state (updated via requestAnimationFrame)
const currentX = ref(0);
const currentY = ref(0);
const currentOpacity = ref(1);

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
  borderColor: borderColor.value,
}));

// Get position for a sector's bottom-left area
function getSectorPosition(sectorId: string): { x: number; y: number } | null {
  const sectorEl = document.querySelector(`[data-sector-id="${sectorId}"]`);
  if (!sectorEl) return null;

  const rect = sectorEl.getBoundingClientRect();
  return {
    x: rect.left + 30,
    y: rect.bottom - 30,
  };
}

// Easing function (ease-in-out cubic)
function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Animation state
let animationFrameId: number | null = null;
let startTime: number | null = null;

function animate(timestamp: number) {
  if (!startTime) startTime = timestamp;
  const elapsed = timestamp - startTime;
  const rawProgress = Math.min(elapsed / ANIMATION_DURATION, 1);
  const easedProgress = easeInOutCubic(rawProgress);

  // Get current positions (may change if map scrolls)
  const fromPos = getSectorPosition(props.fromSectorId);
  const toPos = getSectorPosition(props.toSectorId);

  const startX = fromPos?.x ?? currentX.value;
  const startY = fromPos?.y ?? currentY.value;
  const endX = toPos?.x ?? startX;
  const endY = toPos?.y ?? startY;

  // Interpolate position
  currentX.value = startX + (endX - startX) * easedProgress;
  currentY.value = startY + (endY - startY) * easedProgress;
  currentOpacity.value = 1;

  if (rawProgress < 1) {
    animationFrameId = requestAnimationFrame(animate);
  } else {
    isAnimating.value = false;
    emit('complete');
  }
}

function handleImageError(event: Event) {
  const img = event.target as HTMLImageElement;
  console.error('[CombatantMoveAnimation] Image failed to load:', img.src);
}

// Start animation on mount
onMounted(() => {
  // Initialize position at source sector
  const fromPos = getSectorPosition(props.fromSectorId);
  currentX.value = fromPos?.x ?? window.innerWidth / 2;
  currentY.value = fromPos?.y ?? window.innerHeight / 2;
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
      class="combatant-move-animation"
      :style="animationStyle"
    >
      <div class="animated-portrait" :style="portraitStyle">
        <img
          :src="image"
          :alt="combatantName"
          @error="handleImageError"
        />
      </div>
    </div>
  </Teleport>
</template>

<style>
/* Not scoped because we teleport to body */
.combatant-move-animation {
  position: fixed;
  z-index: 2000;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.combatant-move-animation .animated-portrait {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 3px solid;
  overflow: hidden;
  background: #333;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.combatant-move-animation .animated-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
