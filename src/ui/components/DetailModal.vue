<script setup lang="ts">
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
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  /* Default background and text styling - can be overridden by slot content */
  background: #1e231e;
  color: #e8e6e3;
  border: 1px solid #3a3f3a;
  border-radius: 12px;
  padding: 20px;
  min-width: 300px;
}

.close-button {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #d4a84b;
  border: 2px solid #d4a84b;
  color: #1a1a1a;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.close-button:hover {
  background: #fff;
  color: #1a1a1a;
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
