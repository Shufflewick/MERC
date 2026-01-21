<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  equipmentName: string;
  equipmentType: string;
  image?: string;
  sectorId: string;
  combatantId?: string; // If provided, animate to/from combatant; otherwise animate to/from sector center
  direction?: 'incoming' | 'outgoing'; // incoming = center->target, outgoing = combatant->sector center
}>();

const emit = defineEmits<{
  complete: [];
}>();

const isAnimating = ref(false);

// Animation timing
const ANIMATION_DURATION = 500;
const HOLD_PERCENT = 0.12; // Hold at center for first 12%

// Animation state (updated via requestAnimationFrame)
const currentX = ref(0);
const currentY = ref(0);
const currentSize = ref(200);
const currentOpacity = ref(0);
const currentNameOpacity = ref(0);
const currentNameSize = ref(1.5);

// Computed styles
const animationStyle = computed(() => ({
  left: `${currentX.value}px`,
  top: `${currentY.value}px`,
  opacity: currentOpacity.value,
}));

const imageStyle = computed(() => ({
  width: `${currentSize.value}px`,
  height: `${currentSize.value}px`,
}));

const nameStyle = computed(() => ({
  opacity: currentNameOpacity.value,
  fontSize: `${currentNameSize.value}rem`,
}));

// Get combatant position within sector
function getCombatantPosition(): { x: number; y: number } | null {
  const sectorEl = document.querySelector(`[data-sector-id="${props.sectorId}"]`);
  if (!sectorEl) return null;

  if (props.combatantId) {
    const combatantIcon = sectorEl.querySelector(
      `[data-combatant-id="${props.combatantId}"]`
    );
    if (combatantIcon) {
      const rect = combatantIcon.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
  }
  return null;
}

// Get sector center position
function getSectorCenter(): { x: number; y: number } | null {
  const sectorEl = document.querySelector(`[data-sector-id="${props.sectorId}"]`);
  if (!sectorEl) return null;

  const rect = sectorEl.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

// Get start and end positions based on direction
function getAnimationPositions(): { start: { x: number; y: number }; end: { x: number; y: number } } | null {
  const isOutgoing = props.direction === 'outgoing';

  if (isOutgoing) {
    // Outgoing: combatant icon -> sector center
    const combatantPos = getCombatantPosition();
    const sectorCenter = getSectorCenter();
    if (!combatantPos || !sectorCenter) return null;
    return { start: combatantPos, end: sectorCenter };
  } else {
    // Incoming: screen center -> combatant icon (or sector center if no combatant)
    const target = getCombatantPosition() || getSectorCenter();
    if (!target) return null;
    return {
      start: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      end: target,
    };
  }
}

// Easing function (ease-out cubic)
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Animation state
let animationFrameId: number | null = null;
let startTime: number | null = null;

function animate(timestamp: number) {
  if (!startTime) startTime = timestamp;
  const elapsed = timestamp - startTime;
  const rawProgress = Math.min(elapsed / ANIMATION_DURATION, 1);

  const isOutgoing = props.direction === 'outgoing';

  // Get current positions (may have moved due to scroll)
  const positions = getAnimationPositions();
  const startX = positions?.start.x ?? window.innerWidth / 2;
  const startY = positions?.start.y ?? window.innerHeight / 2;
  const endX = positions?.end.x ?? startX;
  const endY = positions?.end.y ?? startY;

  if (isOutgoing) {
    // Outgoing animation: start small at combatant, move to sector center
    const startSize = 32;
    const peakSize = 80;
    const endSize = 48;

    const easedProgress = easeOutCubic(rawProgress);

    currentX.value = startX + (endX - startX) * easedProgress;
    currentY.value = startY + (endY - startY) * easedProgress;

    // Size: grow then shrink slightly
    if (rawProgress < 0.5) {
      const growProgress = rawProgress / 0.5;
      currentSize.value = startSize + (peakSize - startSize) * growProgress;
    } else {
      const shrinkProgress = (rawProgress - 0.5) / 0.5;
      currentSize.value = peakSize + (endSize - peakSize) * shrinkProgress;
    }

    // Fade in quickly, stay visible
    currentOpacity.value = Math.min(rawProgress * 4, 1);
    currentNameOpacity.value = rawProgress < 0.7 ? 1 : 1 - ((rawProgress - 0.7) / 0.3);
    currentNameSize.value = 0.9;
  } else {
    // Incoming animation: start large at center, move to target
    const startSize = 200;
    const peakSize = 220;
    const endSize = 32;

    if (rawProgress <= HOLD_PERCENT) {
      // Hold phase: stay at center, scale up slightly
      const holdProgress = rawProgress / HOLD_PERCENT;
      const easedHold = easeOutCubic(holdProgress);

      currentX.value = startX;
      currentY.value = startY;
      currentSize.value = startSize + (peakSize - startSize) * easedHold;
      currentOpacity.value = easedHold;
      currentNameOpacity.value = easedHold;
      currentNameSize.value = 1.5;
    } else {
      // Move phase: animate from center to destination
      const moveProgress = (rawProgress - HOLD_PERCENT) / (1 - HOLD_PERCENT);
      const easedMove = easeOutCubic(moveProgress);

      currentX.value = startX + (endX - startX) * easedMove;
      currentY.value = startY + (endY - startY) * easedMove;
      currentSize.value = peakSize + (endSize - peakSize) * easedMove;
      currentOpacity.value = 1;

      // Name fades out in last 30%
      if (moveProgress > 0.65) {
        const fadeProgress = (moveProgress - 0.65) / 0.35;
        currentNameOpacity.value = 1 - fadeProgress;
      } else {
        currentNameOpacity.value = 1;
      }
      currentNameSize.value = 1.5 + (0.6 - 1.5) * easedMove;
    }
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
  console.error('[EquipmentDropAnimation] Image failed to load:', img.src);
}

// Start animation on mount
onMounted(() => {
  // Initialize position based on direction
  const positions = getAnimationPositions();
  if (positions) {
    currentX.value = positions.start.x;
    currentY.value = positions.start.y;
  } else {
    currentX.value = window.innerWidth / 2;
    currentY.value = window.innerHeight / 2;
  }

  // For outgoing, start with smaller size
  if (props.direction === 'outgoing') {
    currentSize.value = 32;
    currentOpacity.value = 0;
  }

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
      class="equipment-drop-animation"
      :style="animationStyle"
    >
      <div class="animated-equipment" :style="imageStyle">
        <img
          v-if="image"
          :src="image"
          :alt="equipmentName"
          @error="handleImageError"
        />
        <div v-else class="equipment-placeholder">
          <span class="equipment-type-icon">
            {{ equipmentType === 'Weapon' ? '⚔️' : equipmentType === 'Armor' ? '🛡️' : '💍' }}
          </span>
        </div>
      </div>
      <div class="animated-name" :style="nameStyle">{{ equipmentName }}</div>
    </div>
  </Teleport>
</template>

<style>
/* Not scoped because we teleport to body */
.equipment-drop-animation {
  position: fixed;
  z-index: 2000;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.animated-equipment {
  border-radius: 8px;
  overflow: hidden;
  background: linear-gradient(135deg, #2a3a2a 0%, #1a2a1a 100%);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(212, 168, 75, 0.3);
  border: 2px solid rgba(212, 168, 75, 0.5);
}

.animated-equipment img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.equipment-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.equipment-type-icon {
  font-size: 4rem;
}

.animated-name {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 12px;
  color: #d4a84b;
  font-weight: 700;
  text-shadow: 0 4px 8px rgba(0, 0, 0, 0.8);
  white-space: nowrap;
}
</style>
