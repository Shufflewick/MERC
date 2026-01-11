<script setup lang="ts">
import { computed } from 'vue';
import { getPlayerColor } from '../colors';

const props = defineProps<{
  mercId?: string;
  mercName: string;
  image?: string;
  playerColor?: string;
  size?: 'small' | 'medium' | 'large';
  clickable?: boolean;
  isDictator?: boolean;
  isMilitia?: boolean;
  isAttackDog?: boolean;
}>();

const emit = defineEmits<{
  click: [];
}>();

const sizeClass = computed(() => props.size || 'medium');

const imagePath = computed(() => {
  // Use provided image path first (from JSON data)
  if (props.image) {
    return props.image;
  }
  // Build path from mercId
  if (props.mercId) {
    const folder = props.isDictator ? 'dictators' : 'mercs';
    return `/${folder}/${props.mercId.toLowerCase()}.jpg`;
  }
  // Derive from name if no mercId
  return `/mercs/${props.mercName.toLowerCase()}.jpg`;
});


const borderColor = computed(() => {
  if (!props.playerColor) return '#666';
  return getPlayerColor(props.playerColor);
});

function handleImageError(event: Event) {
  (event.target as HTMLImageElement).src = '/mercs/unknown.jpg';
}

function handleClick() {
  if (props.clickable) {
    emit('click');
  }
}
</script>

<template>
  <div
    class="merc-icon"
    :class="[sizeClass, { clickable }]"
    @click="handleClick"
  >
    <div class="portrait" :style="{ borderColor }">
      <!-- Militia: show emoji shield -->
      <span v-if="isMilitia" class="militia-emoji">🛡️</span>
      <!-- MERC/Dictator: show image -->
      <img
        v-else
        :src="imagePath"
        :alt="mercName"
        @error="handleImageError"
      />
    </div>
    <span class="name">{{ mercName }}</span>
  </div>
</template>

<style scoped>
.merc-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border-radius: 8px;
  transition: background 0.2s, transform 0.2s;
}

.merc-icon.clickable {
  cursor: pointer;
}

.merc-icon.clickable:hover {
  background: rgba(212, 168, 75, 0.2);
  transform: scale(1.05);
}

.portrait {
  border-radius: 50%;
  border: 3px solid;
  overflow: hidden;
  background: #333;
  display: flex;
  align-items: center;
  justify-content: center;
}

.portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.militia-emoji {
  font-size: 1.5rem;
}

.merc-icon.small .militia-emoji {
  font-size: 1.2rem;
}

.merc-icon.large .militia-emoji {
  font-size: 2rem;
}

/* Size variants */
.merc-icon.small .portrait {
  width: 40px;
  height: 40px;
}

.merc-icon.medium .portrait {
  width: 60px;
  height: 60px;
}

.merc-icon.large .portrait {
  width: 80px;
  height: 80px;
}

.merc-icon.small .name {
  font-size: 0.75rem;
}

.merc-icon.medium .name {
  font-size: 0.85rem;
}

.merc-icon.large .name {
  font-size: 1rem;
}

.name {
  color: #e8e6e3;
  font-weight: 500;
  text-align: center;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
