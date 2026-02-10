<script setup lang="ts">
import CombatantIcon from './CombatantIcon.vue';
import type { ArmorSoakInfo } from '../composables/useCombatSequence';

const props = defineProps<{
  // Combatant data
  combatantId: string;
  name: string;
  image?: string | null;
  playerColor?: string;
  isMerc: boolean;
  isMilitia?: boolean;
  isAttackDog?: boolean;
  health: number;
  maxHealth: number;
  armor?: number;
  maxArmor?: number;
  isDead: boolean;

  // Interaction state
  isAttacking?: boolean;
  isTargetable?: boolean;
  isSelected?: boolean;
  isTargetSelected?: boolean;
  isAnimatingAttacker?: boolean;
  isAnimatingTarget?: boolean;
  attackMissed?: boolean;
  isAnimating?: boolean;
  isHealing?: boolean;

  // Display data
  allocatedHits?: number;
  targetHits?: number;
  armorSoaks?: ArmorSoakInfo | null;
  dogTargetName?: string;
  showHitControls?: boolean;

  // Bullet hole positioning function
  getBulletHolePosition?: (combatantId: string, hitIndex: number) => { top: string; left: string };
}>();

const emit = defineEmits<{
  (e: 'click'): void;
  (e: 'add-hit'): void;
  (e: 'remove-hit'): void;
}>();

function handleClick() {
  emit('click');
}

function handleAddHit(event: Event) {
  event.stopPropagation();
  emit('add-hit');
}

function handleRemoveHit(event: Event) {
  event.stopPropagation();
  emit('remove-hit');
}

// Default bullet hole position if not provided
function getDefaultBulletHolePosition(combatantId: string, hitIndex: number): { top: string; left: string } {
  // Simple deterministic positioning
  const offset = hitIndex * 20;
  return {
    top: `${20 + (offset % 60)}%`,
    left: `${20 + ((offset * 3) % 60)}%`,
  };
}

function getBulletPosition(hitIndex: number): { top: string; left: string } {
  if (props.getBulletHolePosition) {
    return props.getBulletHolePosition(props.combatantId, hitIndex);
  }
  return getDefaultBulletHolePosition(props.combatantId, hitIndex);
}

function getArmorSoakPosition(soakIndex: number): { top: string; left: string } {
  // Offset by targetHits + 100 to avoid overlapping with health-damage bullet holes
  const offsetIndex = (props.targetHits || 0) + soakIndex + 100;
  if (props.getBulletHolePosition) {
    return props.getBulletHolePosition(props.combatantId, offsetIndex);
  }
  return getDefaultBulletHolePosition(props.combatantId, offsetIndex);
}
</script>

<template>
  <div
    class="combatant"
    :class="{
      merc: isMerc,
      militia: !isMerc && !isAttackDog,
      'attack-dog': isAttackDog,
      attacking: isAttacking,
      targetable: isTargetable,
      selected: isSelected,
      'target-selected': isTargetSelected,
      'death-flash': isDead && isAnimating,
      'is-attacking': isAnimatingAttacker,
      'is-targeted': isAnimatingTarget,
      'attack-missed': attackMissed,
    }"
    @click="handleClick"
  >
    <CombatantIcon
      :image="image ?? undefined"
      :combatant-id="combatantId"
      :combatant-name="name"
      :player-color="playerColor"
      :is-militia="isMilitia"
      :is-attack-dog="isAttackDog"
      size="small"
    />
    <div class="health-bar">
      <div
        class="health-fill"
        :style="{ width: `${(health / maxHealth) * 100}%` }"
      ></div>
      <span class="health-text">
        {{ health }}/{{ maxHealth }}
      </span>
    </div>
    <div v-if="maxArmor && maxArmor > 0" class="armor-bar">
      <div class="armor-fill" :style="{ width: `${((armor ?? 0) / maxArmor) * 100}%` }"></div>
      <span class="armor-text">{{ armor ?? 0 }}/{{ maxArmor }}</span>
    </div>
    <!-- Attack dog target info -->
    <div v-if="isAttackDog && dogTargetName" class="dog-target-info">
      Targeting: {{ dogTargetName }}
    </div>
    <!-- Show allocated hits during allocation phase with +/- controls -->
    <div v-if="showHitControls && isTargetable" class="hit-controls">
      <button
        class="hit-btn remove-btn"
        :disabled="!allocatedHits || allocatedHits <= 0"
        @click="handleRemoveHit"
      >−</button>
      <span class="hit-count" :class="{ 'has-hits': allocatedHits && allocatedHits > 0 }">
        {{ allocatedHits || 0 }}
      </span>
      <button
        class="hit-btn add-btn"
        @click="handleAddHit"
      >+</button>
    </div>
    <!-- Show allocated hits without controls when not targetable -->
    <div v-else-if="allocatedHits && allocatedHits > 0" class="allocated-hits">
      +{{ allocatedHits }} hit(s)
    </div>
    <!-- Bullet holes for targeted combatants during animation -->
    <div v-if="targetHits && targetHits > 0" class="bullet-holes">
      <span
        v-for="n in targetHits"
        :key="n"
        class="bullet-hole"
        :style="getBulletPosition(n)"
      >◎</span>
    </div>
    <!-- Armor soak indicators — blue bullet holes with armor image backdrop -->
    <div v-if="armorSoaks && armorSoaks.count > 0" class="bullet-holes">
      <span
        v-for="n in armorSoaks.count"
        :key="'soak-' + n"
        class="armor-soak"
        :style="getArmorSoakPosition(n)"
      >
        <img
          v-if="armorSoaks.armorImage"
          :src="armorSoaks.armorImage"
          class="armor-soak-image"
        />
        <span class="deflect-symbol">◎</span>
      </span>
    </div>
    <!-- Healing animation - white + symbols floating upward -->
    <div v-if="isHealing" class="healing-particles">
      <span class="healing-plus" style="--delay: 0s; --offset: -10px">+</span>
      <span class="healing-plus" style="--delay: 0.15s; --offset: 5px">+</span>
      <span class="healing-plus" style="--delay: 0.3s; --offset: -5px">+</span>
      <span class="healing-plus" style="--delay: 0.45s; --offset: 10px">+</span>
      <span class="healing-plus" style="--delay: 0.6s; --offset: 0px">+</span>
    </div>
  </div>
</template>

<style scoped>
.combatant {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  min-width: 80px;
  transition: transform 0.3s ease-out, box-shadow 0.3s ease-out, border-color 0.3s ease-out;
  position: relative;
}

/* Allow clicks to pass through CombatantIcon to parent combatant div */
.combatant :deep(.combatant-icon) {
  pointer-events: none;
}

.combatant.merc {
  border: 2px solid rgba(100, 181, 246, 0.5);
}

.combatant.militia {
  border: 2px solid rgba(158, 158, 158, 0.3);
}

.combatant.attack-dog {
  border: 2px solid rgba(139, 90, 43, 0.5);
  background: rgba(139, 90, 43, 0.1);
}

.combatant.attacking {
  border-color: #D4A84B;
  box-shadow: 0 0 12px rgba(212, 168, 75, 0.4);
}

.combatant.targetable {
  cursor: pointer;
  border-color: #ff6b6b;
}

.combatant.targetable:hover {
  background: rgba(255, 107, 107, 0.2);
  transform: scale(1.05);
}

.combatant.selected {
  box-shadow: 0 0 12px rgba(255, 107, 107, 0.6);
}

/* Selected target in target selection mode */
.combatant.target-selected {
  border-color: #4CAF50 !important;
  box-shadow: 0 0 12px rgba(76, 175, 80, 0.6), inset 0 0 8px rgba(76, 175, 80, 0.3);
  background: rgba(76, 175, 80, 0.2);
}

.combatant.target-selected::after {
  content: '✓';
  position: absolute;
  top: -8px;
  right: -8px;
  background: #4CAF50;
  color: white;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: bold;
}

/* Attacker during animation - scaled up with gold glow */
.combatant.is-attacking {
  transform: scale(1.2);
  z-index: 10;
  box-shadow: 0 0 20px rgba(212, 168, 75, 0.8);
  border-color: #D4A84B !important;
}

/* Target during animation - scaled up with red glow */
.combatant.is-targeted {
  transform: scale(1.15);
  z-index: 9;
  box-shadow: 0 0 15px rgba(255, 107, 107, 0.8);
  border-color: #ff6b6b !important;
}

/* Death flash effect */
.combatant.death-flash {
  animation: death-flash 0.8s ease-out forwards;
}

@keyframes death-flash {
  0% {
    filter: brightness(1);
  }
  20% {
    filter: brightness(2) sepia(1) hue-rotate(-30deg);
    background: rgba(255, 50, 50, 0.4);
  }
  100% {
    filter: brightness(0.5) sepia(0.5) hue-rotate(-30deg);
    background: rgba(139, 0, 0, 0.3);
  }
}

/* Shake animation for misses */
.combatant.attack-missed {
  animation: shake 0.5s ease-in-out;
}

@keyframes shake {
  0%, 100% { transform: scale(1.2) translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: scale(1.2) translateX(-4px); }
  20%, 40%, 60%, 80% { transform: scale(1.2) translateX(4px); }
}

.health-bar {
  width: 100%;
  height: 8px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 4px;
  margin-top: 4px;
  position: relative;
  overflow: hidden;
}

.health-fill {
  height: 100%;
  background: linear-gradient(90deg, #4CAF50, #8BC34A);
  border-radius: 4px;
  transition: width 0.5s ease-out;
}

.health-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.armor-bar {
  width: 100%;
  height: 8px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 4px;
  margin-top: 2px;
  position: relative;
  overflow: hidden;
}

.armor-fill {
  height: 100%;
  background: linear-gradient(90deg, #42a5f5, #90caf9);
  border-radius: 4px;
  transition: width 0.5s ease-out;
}

.armor-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.allocated-hits {
  font-size: 0.7rem;
  color: #ff6b6b;
  font-weight: bold;
  margin-top: 4px;
}

.hit-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 4px;
}

.hit-btn {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  padding: 0;
  line-height: 1;
}

.hit-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.add-btn {
  background: #4CAF50;
  color: white;
}

.add-btn:hover:not(:disabled) {
  background: #66BB6A;
  transform: scale(1.1);
}

.remove-btn {
  background: #f44336;
  color: white;
}

.remove-btn:hover:not(:disabled) {
  background: #ef5350;
  transform: scale(1.1);
}

.hit-count {
  min-width: 20px;
  font-size: 0.8rem;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
}

.hit-count.has-hits {
  color: #ff6b6b;
}

.dog-target-info {
  font-size: 0.65rem;
  color: #D2691E;
  font-weight: bold;
  margin-top: 2px;
  background: rgba(139, 69, 19, 0.2);
  padding: 2px 4px;
  border-radius: 3px;
  width: 100%;
  text-align: center;
}

.bullet-holes {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.bullet-hole {
  position: absolute;
  font-size: 20px;
  color: #ff3333;
  text-shadow:
    0 0 4px rgba(255, 0, 0, 0.8),
    0 0 8px rgba(255, 0, 0, 0.5);
  animation: bullet-impact 0.3s ease-out;
  transform: translate(-50%, -50%);
}

@keyframes bullet-impact {
  0% {
    transform: translate(-50%, -50%) scale(2);
    opacity: 0;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.2);
  }
  100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
}

/* Armor soak styles — blue bullet holes with armor image */
.armor-soak {
  position: absolute;
  width: 28px;
  height: 28px;
  transform: translate(-50%, -50%);
  animation: armor-deflect 0.4s ease-out;
}

.armor-soak-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  opacity: 0.7;
  filter: drop-shadow(0 0 4px rgba(100, 181, 246, 0.8));
}

.deflect-symbol {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #64B5F6;
  text-shadow: 0 0 4px rgba(100, 181, 246, 0.8);
}

@keyframes armor-deflect {
  0% {
    transform: translate(-50%, -50%) scale(2);
    opacity: 0;
  }
  40% {
    transform: translate(-50%, -50%) scale(1.3);
  }
  100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
}

/* Healing animation styles */
.healing-particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.healing-plus {
  position: absolute;
  bottom: 10%;
  left: calc(50% + var(--offset, 0px));
  font-size: 24px;
  font-weight: bold;
  color: #ffffff;
  text-shadow:
    0 0 8px rgba(76, 175, 80, 0.9),
    0 0 16px rgba(76, 175, 80, 0.6),
    0 0 24px rgba(76, 175, 80, 0.4);
  animation: heal-float 1.2s ease-out forwards;
  animation-delay: var(--delay, 0s);
  opacity: 0;
}

@keyframes heal-float {
  0% {
    transform: translateY(0) scale(0.5);
    opacity: 0;
  }
  20% {
    opacity: 1;
    transform: translateY(-10px) scale(1);
  }
  100% {
    transform: translateY(-80px) scale(0.8);
    opacity: 0;
  }
}
</style>
