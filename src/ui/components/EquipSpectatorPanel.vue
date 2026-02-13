<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import CombatantCard from './CombatantCard.vue';
import { getPlayerColor } from '../colors';

export interface EquipFlyItem {
  name: string;
  type: string;
  image?: string;
  direction: 'in' | 'out';
  id: number; // unique key for transition
}

export interface EquipSessionCombatant {
  combatantId: string;
  combatantName: string;
  image?: string;
  baseCombat: number;
  baseInitiative: number;
  baseTraining: number;
  combat: number;
  initiative: number;
  training: number;
  targets: number;
  health: number;
  maxHealth: number;
  damage: number;
  actionsRemaining: number;
  ability?: string;
  weaponSlotData: any;
  armorSlotData: any;
  accessorySlotData: any;
  bandolierSlotsData: any[];
}

const props = defineProps<{
  combatant: EquipSessionCombatant;
  playerColor: string;
  playerName: string;
  flyItems: EquipFlyItem[];
}>();

const emit = defineEmits<{
  'fly-complete': [];
}>();

const borderColor = computed(() => getPlayerColor(props.playerColor));

// Convert serialized combatant to CombatantCard-compatible format
const mercData = computed(() => {
  const c = props.combatant;
  return {
    combatantName: c.combatantName,
    combatantId: c.combatantId,
    image: c.image,
    baseCombat: c.baseCombat,
    baseInitiative: c.baseInitiative,
    baseTraining: c.baseTraining,
    combat: c.combat,
    initiative: c.initiative,
    training: c.training,
    targets: c.targets,
    health: c.health,
    maxHealth: c.maxHealth,
    damage: c.damage,
    actionsRemaining: c.actionsRemaining,
    ability: c.ability,
    weaponSlotData: c.weaponSlotData,
    armorSlotData: c.armorSlotData,
    accessorySlotData: c.accessorySlotData,
    bandolierSlotsData: c.bandolierSlotsData,
  };
});

// Track active fly items with animation state
const activeFlyItems = ref<Array<EquipFlyItem & { animating: boolean }>>([]);

watch(() => props.flyItems, (items) => {
  if (!items || items.length === 0) return;

  // Add new items — start un-animated
  const newItems = items.map(item => ({ ...item, animating: false }));
  activeFlyItems.value = newItems;

  // Trigger animation on next frame
  requestAnimationFrame(() => {
    activeFlyItems.value = activeFlyItems.value.map(item => ({ ...item, animating: true }));
  });

  // Clear after animation completes and notify parent
  setTimeout(() => {
    activeFlyItems.value = [];
    emit('fly-complete');
  }, 800);
}, { deep: true });
</script>

<template>
  <div class="equip-spectator-wrapper">
    <div
      class="equip-spectator-panel"
      :style="{ '--border-color': borderColor }"
    >
      <div class="panel-label" :style="{ color: borderColor }">
        {{ playerName }} equipping:
      </div>

      <div class="card-container">
        <CombatantCard
          :merc="mercData"
          :player-color="playerColor"
          :show-equipment="true"
        />

        <!-- Flying equipment layer — clipped at card edges -->
        <div
          v-for="item in activeFlyItems"
          :key="item.id"
          class="fly-item"
          :class="[
            item.direction === 'out' ? 'fly-out' : 'fly-in',
            { animating: item.animating },
          ]"
        >
          <img v-if="item.image" :src="item.image" :alt="item.name" class="fly-image" />
          <span v-else class="fly-badge">{{ item.type.charAt(0) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.equip-spectator-wrapper {
  display: flex;
  justify-content: center;
  margin-bottom: 8px;
}

.equip-spectator-panel {
  padding: 8px 12px 12px;
  border: 2px solid var(--border-color, #666);
  border-radius: 10px;
  background: rgba(26, 26, 46, 0.95);
  width: 100%;
}

.panel-label {
  font-size: 0.75em;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-bottom: 6px;
  font-weight: 700;
}

.card-container {
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: center;
}

/* Flying equipment — large image, clipped at card edges */
.fly-item {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  pointer-events: none;
  transition: left 0.4s ease, right 0.4s ease, opacity 0.4s ease;
}

/* Fly-in: starts off-screen left, slides to center-left */
.fly-item.fly-in {
  left: -80px;
  opacity: 0;
}
.fly-item.fly-in.animating {
  left: 8px;
  opacity: 1;
}

/* Fly-out: starts at center-right, slides off-screen right */
.fly-item.fly-out {
  right: 8px;
  opacity: 1;
}
.fly-item.fly-out.animating {
  right: -80px;
  opacity: 0;
}

.fly-image {
  width: 64px;
  height: 64px;
  object-fit: contain;
  border-radius: 6px;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.7));
}

.fly-badge {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  background: #333;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.5em;
  color: #aaa;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
}
</style>
