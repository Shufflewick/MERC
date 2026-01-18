<script setup lang="ts">
defineProps<{
  isVisible: boolean;
  winner: 'rebels' | 'dictator' | null;
}>();
</script>

<template>
  <Teleport to="body">
    <Transition name="game-over">
      <div v-if="isVisible" class="game-over-overlay">
        <div class="game-over-content">
          <h1 class="game-over-title">Game Over</h1>
          <div v-if="winner === 'rebels'" class="game-over-winner rebels">
            <h2>Rebels Victory!</h2>
            <p>The dictator has been eliminated. Freedom prevails!</p>
          </div>
          <div v-else class="game-over-winner dictator">
            <h2>Dictator Victory!</h2>
            <p>The rebellion has been crushed. Order is restored.</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.game-over-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 100px;
  z-index: 9999;
}

.game-over-content {
  background: linear-gradient(135deg, #1a1a2e 0%, #2d2d4a 100%);
  border: 3px solid #d4a84b;
  border-radius: 20px;
  padding: 48px 64px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.game-over-title {
  font-size: 3rem;
  color: #d4a84b;
  margin: 0 0 24px 0;
  text-transform: uppercase;
  letter-spacing: 4px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.game-over-winner h2 {
  font-size: 2rem;
  margin: 0 0 16px 0;
}

.game-over-winner p {
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
}

.game-over-winner.rebels h2 {
  color: #4CAF50;
}

.game-over-winner.dictator h2 {
  color: #f44336;
}

/* Transition animations */
.game-over-enter-active {
  animation: fadeIn 0.5s ease-out;
}

.game-over-enter-active .game-over-content {
  animation: slideUp 0.5s ease-out;
}

.game-over-leave-active {
  animation: fadeIn 0.3s ease-out reverse;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(50px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
