<script setup lang="ts">
/**
 * ModalContent - Wrapper for content displayed inside GameOverlay
 *
 * Provides consistent modal styling: close button, dark background, and click.stop
 * to prevent backdrop clicks from closing the modal when clicking content.
 *
 * ## Usage
 *
 * ```vue
 * <GameOverlay :active="showModal" @click="closeModal">
 *   <ModalContent @close="closeModal">
 *     <!-- Your content here -->
 *   </ModalContent>
 * </GameOverlay>
 * ```
 */

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <div class="modal-content" @click.stop>
    <button class="close-button" @click="emit('close')">&times;</button>
    <slot></slot>
  </div>
</template>

<style scoped>
.modal-content {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 90vw;
  max-height: calc(100vh - 150px);
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
</style>
