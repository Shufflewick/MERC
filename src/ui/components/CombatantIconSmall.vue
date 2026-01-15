<script setup lang="ts">
import { computed } from 'vue';
import { getPlayerColor } from '../colors';

const props = withDefaults(defineProps<{
  combatantId?: string;
  image?: string;
  alt?: string;
  playerColor?: string;
  size?: number;
  clickable?: boolean;
}>(), {
  size: 40,
  clickable: false,
});

const emit = defineEmits<{
  click: [];
}>();

const imagePath = computed(() => {
  if (props.image) {
    return props.image;
  }
  // No fallback - log warning for debugging
  console.warn('[CombatantIconSmall] No image provided, props:', {
    image: props.image,
    combatantId: props.combatantId,
    alt: props.alt
  });
  return ''; // Empty src will show broken image indicator
});

const borderColor = computed(() => {
  if (!props.playerColor) return '#666';
  return getPlayerColor(props.playerColor);
});

const sizeStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
}));

function handleImageError(event: Event) {
  const img = event.target as HTMLImageElement;
  console.error('[CombatantIconSmall] Image failed to load:', img.src);
  // Don't replace with fallback - show the broken image so bug is visible
}

function handleClick() {
  if (props.clickable) {
    emit('click');
  }
}
</script>

<template>
  <div
    class="combatant-icon-small"
    :class="{ clickable }"
    :style="sizeStyle"
    @click="handleClick"
  >
    <img
      :src="imagePath"
      :alt="alt || 'Portrait'"
      :style="{ borderColor }"
      @error="handleImageError"
    />
  </div>
</template>

<style scoped>
.combatant-icon-small {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.combatant-icon-small img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 3px solid;
  object-fit: cover;
  background: #333;
  box-sizing: border-box;
}

.combatant-icon-small.clickable {
  cursor: pointer;
}

.combatant-icon-small.clickable:hover img {
  transform: scale(1.05);
  box-shadow: 0 0 8px rgba(212, 168, 75, 0.5);
}

.combatant-icon-small img {
  transition: transform 0.2s, box-shadow 0.2s;
}
</style>
