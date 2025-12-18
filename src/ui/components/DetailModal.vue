<script setup lang="ts">
import { UI_COLORS } from '../colors';

defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

function handleBackdropClick(e: Event) {
  // Only close if clicking the backdrop, not the content
  if (e.target === e.currentTarget) {
    emit('close');
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="modal-backdrop" @click="handleBackdropClick">
        <div class="modal-content">
          <button class="close-button" @click="emit('close')">&times;</button>
          <slot></slot>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
}

.close-button {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: v-bind('UI_COLORS.cardBg');
  border: 2px solid v-bind('UI_COLORS.border');
  color: v-bind('UI_COLORS.text');
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  transition: all 0.2s ease;
}

.close-button:hover {
  background: v-bind('UI_COLORS.accent');
  color: white;
  border-color: v-bind('UI_COLORS.accent');
}

/* Transition animations */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.9);
}
</style>
