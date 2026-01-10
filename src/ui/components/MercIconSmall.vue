<script setup lang="ts">
import { computed } from 'vue';
import { getPlayerColor } from '../colors';

const props = withDefaults(defineProps<{
  mercId?: string;
  image?: string;
  alt?: string;
  playerColor?: string;
  size?: number;
  clickable?: boolean;
  isDictator?: boolean;
}>(), {
  size: 40,
  clickable: false,
  isDictator: false,
});

const emit = defineEmits<{
  click: [];
}>();

const imagePath = computed(() => {
  // Direct image path takes precedence
  if (props.image) {
    return props.image;
  }
  // Build path from mercId
  if (props.mercId) {
    const folder = props.isDictator ? 'dictators' : 'mercs';
    return `/${folder}/${props.mercId.toLowerCase()}.jpg`;
  }
  // Fallback
  return props.isDictator ? '/dictators/unknown.jpg' : '/mercs/unknown.jpg';
});

const fallbackPath = computed(() => {
  return props.isDictator ? '/dictators/unknown.jpg' : '/mercs/unknown.jpg';
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
  (event.target as HTMLImageElement).src = fallbackPath.value;
}

function handleClick() {
  if (props.clickable) {
    emit('click');
  }
}
</script>

<template>
  <div
    class="merc-icon-small"
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
.merc-icon-small {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.merc-icon-small img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 3px solid;
  object-fit: cover;
  background: #333;
  box-sizing: border-box;
}

.merc-icon-small.clickable {
  cursor: pointer;
}

.merc-icon-small.clickable:hover img {
  transform: scale(1.05);
  box-shadow: 0 0 8px rgba(212, 168, 75, 0.5);
}

.merc-icon-small img {
  transition: transform 0.2s, box-shadow 0.2s;
}
</style>
