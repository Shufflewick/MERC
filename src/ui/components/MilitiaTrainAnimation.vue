<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import { getPlayerColor } from '../colors';

const props = defineProps<{
  // Position and size of the sector element (in pixels)
  sectorRect: { x: number; y: number; width: number; height: number };
  // Number of militia trained (animation repeats this many times)
  count: number;
  // Player color for the shield
  playerColor?: string;
  // Whether this is dictator militia (affects color fallback)
  isDictator?: boolean;
}>();

const emit = defineEmits<{
  complete: [];
  increment: [index: number]; // Emitted after each shield animation completes
}>();

// Track current animation iteration
const currentIteration = ref(0);
const isAnimating = ref(false);
const showShield = ref(false);

// Shield color based on player
const shieldColor = computed(() => {
  return getPlayerColor(props.playerColor) || (props.isDictator ? '#8b0000' : '#2d5a2d');
});

// Animation duration per shield (ms)
const ANIMATION_DURATION = 400;
const DELAY_BETWEEN = 150;

// Start the animation sequence
function startAnimation() {
  if (props.count <= 0) {
    emit('complete');
    return;
  }

  isAnimating.value = true;
  currentIteration.value = 0;
  playNextShield();
}

// Play a single shield animation
function playNextShield() {
  if (currentIteration.value >= props.count) {
    // All done
    isAnimating.value = false;
    emit('complete');
    return;
  }

  showShield.value = true;

  // After animation completes, emit increment and start next
  setTimeout(() => {
    showShield.value = false;
    emit('increment', currentIteration.value);
    currentIteration.value++;

    // Small delay before next shield
    setTimeout(() => {
      playNextShield();
    }, DELAY_BETWEEN);
  }, ANIMATION_DURATION);
}

// Start animation when component mounts
onMounted(() => {
  startAnimation();
});

// Restart if count changes while mounted
watch(() => props.count, (newCount) => {
  if (newCount > 0 && !isAnimating.value) {
    startAnimation();
  }
});
</script>

<template>
  <div
    v-if="isAnimating"
    class="militia-train-animation-container"
    :style="{
      left: `${sectorRect.x}px`,
      top: `${sectorRect.y}px`,
      width: `${sectorRect.width}px`,
      height: `${sectorRect.height}px`,
    }"
  >
    <div
      v-if="showShield"
      class="animated-shield"
      :style="{
        '--shield-color': shieldColor,
        '--animation-duration': `${ANIMATION_DURATION}ms`,
      }"
    >
      <span class="shield-icon">🛡️</span>
    </div>
  </div>
</template>

<style scoped>
.militia-train-animation-container {
  position: absolute;
  pointer-events: none;
  z-index: 1000;
  overflow: visible;
}

.animated-shield {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Start at full sector size */
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  background: radial-gradient(
    circle,
    var(--shield-color) 0%,
    transparent 70%
  );
  opacity: 0.8;
  border-radius: 8px;
  animation: shrink-to-corner var(--animation-duration) ease-in forwards;
}

.shield-icon {
  font-size: 3rem;
  filter: drop-shadow(0 0 8px var(--shield-color));
  animation: shrink-icon var(--animation-duration) ease-in forwards;
}

@keyframes shrink-to-corner {
  0% {
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    opacity: 0.9;
  }
  50% {
    opacity: 1;
  }
  100% {
    width: 20%;
    height: 40%;
    top: 60%;
    left: 80%;
    opacity: 0;
  }
}

@keyframes shrink-icon {
  0% {
    font-size: 3rem;
    opacity: 1;
  }
  100% {
    font-size: 0.8rem;
    opacity: 0;
  }
}
</style>
