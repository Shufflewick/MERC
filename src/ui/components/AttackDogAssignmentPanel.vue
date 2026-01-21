<script setup lang="ts">

export interface AttackDogTarget {
  id: string;
  name: string;
  isMerc: boolean;
  health: number;
  maxHealth: number;
}

const props = defineProps<{
  attackerName: string;
  validTargets: AttackDogTarget[];
}>();

const emit = defineEmits<{
  (e: 'assign', targetId: string): void;
}>();
</script>

<template>
  <div class="attack-dog-panel">
    <div class="attack-dog-info">
      <strong>{{ attackerName }}</strong> - Attack Dog!
      <span class="dog-hint">Assign the dog to an enemy MERC</span>
    </div>
    <div class="attack-dog-targets">
      <button
        v-for="target in validTargets"
        :key="target.id"
        class="attack-dog-target-btn"
        @click="emit('assign', target.id)"
      >
        {{ target.name }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.attack-dog-panel {
  background: rgba(139, 69, 19, 0.2);
  border: 2px solid #8B4513;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  margin-top: 12px;
}

.attack-dog-info {
  color: #D2691E;
  margin-bottom: 12px;
}

.dog-hint {
  margin-left: 8px;
  font-size: 0.9rem;
  opacity: 0.8;
}

.attack-dog-targets {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}

.attack-dog-target-btn {
  padding: 12px 20px;
  background: linear-gradient(135deg, #8B4513 0%, #A0522D 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 100px;
}

.attack-dog-target-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(139, 69, 19, 0.4);
}
</style>
