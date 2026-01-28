<script setup lang="ts">
defineProps<{
  isVisible: boolean;
  winner: 'rebels' | 'dictator' | null;
}>();
</script>

<template>
  <Transition name="game-over">
    <div v-if="isVisible" class="game-over-banner">
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
</template>

<style scoped>
.game-over-banner {
  background: linear-gradient(135deg, #1a1a2e 0%, #2d2d4a 100%);
  border: 3px solid #d4a84b;
  border-radius: 16px;
  padding: 32px 48px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(212, 168, 75, 0.2);
  margin-bottom: 20px;
}

.game-over-title {
  font-size: 2.5rem;
  color: #d4a84b;
  margin: 0 0 16px 0;
  text-transform: uppercase;
  letter-spacing: 4px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.game-over-winner h2 {
  font-size: 1.75rem;
  margin: 0 0 12px 0;
}

.game-over-winner p {
  font-size: 1rem;
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
  animation: fadeSlideIn 0.5s ease-out;
}

.game-over-leave-active {
  animation: fadeSlideIn 0.3s ease-out reverse;
}

@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
