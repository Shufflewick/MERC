<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';

const props = defineProps<{
  sectorRect: { x: number; y: number; width: number; height: number };
  sectorId: string;
  targetNames: string[];
  damage: number;
}>();

const emit = defineEmits<{
  complete: [];
}>();

const showExplosion = ref(false);
const showLabel = ref(false);

// Explosion displays for 1600ms total
const EXPLOSION_DURATION = 1600;
const LABEL_DELAY = 200;

onMounted(() => {
  nextTick(() => {
    showExplosion.value = true;
    setTimeout(() => {
      showLabel.value = true;
    }, LABEL_DELAY);
    setTimeout(() => {
      emit('complete');
    }, EXPLOSION_DURATION);
  });
});
</script>

<template>
  <!-- Explosion GIF centered on sector -->
  <div
    v-if="showExplosion"
    class="landmine-container"
    :style="{
      left: `${sectorRect.x + sectorRect.width / 2}px`,
      top: `${sectorRect.y + sectorRect.height / 2}px`,
    }"
  >
    <img
      src="/effects/landmine-explosion.gif"
      class="landmine-gif"
      alt=""
    />
    <div v-if="showLabel" class="landmine-label">
      LAND MINE!
    </div>
  </div>
</template>

<style scoped>
.landmine-container {
  position: absolute;
  pointer-events: none;
  z-index: 1000;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.landmine-gif {
  width: 120px;
  height: 120px;
  animation: landmine-scale-in 200ms ease-out forwards;
}

.landmine-label {
  margin-top: 4px;
  background: rgba(139, 0, 0, 0.9);
  color: #ff4444;
  font-weight: bold;
  font-size: 0.85rem;
  padding: 2px 10px;
  border-radius: 4px;
  white-space: nowrap;
  letter-spacing: 1px;
  animation: landmine-label-in 300ms ease-out forwards;
}

@keyframes landmine-scale-in {
  0% {
    transform: scale(0.3);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes landmine-label-in {
  0% {
    opacity: 0;
    transform: translateY(-4px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
