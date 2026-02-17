<script setup lang="ts">
import type { UseActionControllerReturn } from 'boardsmith/ui';
import CombatantIconSmall from './CombatantIconSmall.vue';
import { getPlayerColor } from '../colors';

interface MercData {
  combatantId?: string;
  combatantName?: string;
  image?: string;
  ref?: number;
}

interface EligibleSquad {
  squadType: 'primary' | 'secondary';
  label: string;
  mercs: MercData[];
}

const props = defineProps<{
  targetSector: { sectorName: string; sectorType: string; image?: string } | null;
  declaringPlayerColor: string;
  eligibleSquads: EligibleSquad[];
  playerColor: string;
  actionController: UseActionControllerReturn;
}>();

function getAttr<T>(node: any, key: string, defaultVal: T): T {
  if (node?.attributes && node.attributes[key] !== undefined) return node.attributes[key];
  if (node && node[key] !== undefined) return node[key];
  return defaultVal;
}

function getCombatantId(merc: MercData): string {
  return getAttr(merc, 'combatantId', '') || String(merc.ref ?? 'unknown');
}

function getCombatantName(merc: MercData): string {
  const rawName = getAttr(merc, 'combatantName', '') || getCombatantId(merc);
  const cleanName = rawName.replace(/^(merc-|dictator-)/i, '');
  return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
}

function getMercImagePath(merc: MercData): string {
  return getAttr(merc, 'image', '');
}

import { computed } from 'vue';

const accentColor = getPlayerColor(props.declaringPlayerColor);

const sectorImagePath = computed(() => {
  if (props.targetSector?.image) return props.targetSector.image;
  if (!props.targetSector) return '/sectors/industry---coal.jpg';
  const type = props.targetSector.sectorType.toLowerCase();
  if (type === 'wilderness') return '/sectors/wilderness.jpg';
  if (type === 'city') return '/sectors/town---a.jpg';
  return '/sectors/industry---coal.jpg';
});

async function joinWithSquad(squadType: 'primary' | 'secondary') {
  await props.actionController.start('commitSquadToCoordinatedAttack');
  await props.actionController.fill('squadType', squadType);
}

async function decline() {
  await props.actionController.execute('declineCoordinatedAttack', {});
}
</script>

<template>
  <div class="coordinated-attack-panel" :style="{ borderColor: accentColor }">
    <div class="header">
      <div class="header-label" :style="{ color: accentColor }">Coordinated Attack</div>
      <div v-if="targetSector" class="target-sector">
        <div
          class="sector-tile-preview"
          :style="{ backgroundImage: `url(${sectorImagePath})` }"
        >
          <div class="sector-tile-overlay">
            <span class="sector-tile-name">{{ targetSector.sectorName }}</span>
            <span class="sector-tile-type">{{ targetSector.sectorType }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="squads-section">
      <div
        v-for="squad in eligibleSquads"
        :key="squad.squadType"
        class="squad-row"
      >
        <div class="squad-label">{{ squad.label }}</div>
        <div class="squad-mercs">
          <div
            v-for="merc in squad.mercs"
            :key="getCombatantId(merc)"
            class="merc-item"
          >
            <CombatantIconSmall
              :image="getMercImagePath(merc)"
              :combatant-id="getCombatantId(merc)"
              :alt="getCombatantName(merc)"
              :player-color="playerColor"
              :size="36"
            />
            <span class="merc-name">{{ getCombatantName(merc) }}</span>
          </div>
        </div>
        <button class="join-btn" @click="joinWithSquad(squad.squadType)">
          Join
        </button>
      </div>
    </div>

    <div class="actions">
      <button class="decline-btn" @click="decline">
        Decline
      </button>
    </div>
  </div>
</template>

<style scoped>
.coordinated-attack-panel {
  background: rgba(30, 35, 30, 0.95);
  border: 2px solid #d4a84b;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.header {
  text-align: center;
  margin-bottom: 12px;
}

.header-label {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 8px;
}

.target-sector {
  display: flex;
  justify-content: center;
}

.sector-tile-preview {
  position: relative;
  width: 200px;
  aspect-ratio: 2 / 1;
  background-size: cover;
  background-position: center;
  border-radius: 8px;
  border: 2px solid #5a6a5a;
  overflow: hidden;
}

.sector-tile-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.1) 60%);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  padding: 6px 8px;
}

.sector-tile-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: #f0f0f0;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.sector-tile-type {
  font-size: 0.7rem;
  color: #c0c0c0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.squads-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.squad-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(60, 75, 60, 0.95);
  border: 1px solid #5a6a5a;
  border-radius: 8px;
  padding: 10px 12px;
}

.squad-label {
  font-weight: 600;
  font-size: 0.85rem;
  color: #a0a0a0;
  min-width: 80px;
  flex-shrink: 0;
}

.squad-mercs {
  display: flex;
  gap: 8px;
  flex: 1;
  flex-wrap: wrap;
}

.merc-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.merc-name {
  font-size: 0.8rem;
  color: #f0f0f0;
}

.join-btn {
  padding: 6px 16px;
  background: rgba(212, 168, 75, 0.2);
  border: 1px solid #d4a84b;
  border-radius: 6px;
  color: #d4a84b;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.join-btn:hover {
  background: rgba(212, 168, 75, 0.4);
  box-shadow: 0 0 8px rgba(212, 168, 75, 0.3);
}

.actions {
  display: flex;
  justify-content: center;
}

.decline-btn {
  padding: 6px 20px;
  background: rgba(30, 35, 30, 0.9);
  border: 1px solid #5a6a5a;
  border-radius: 6px;
  color: #a0a0a0;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.decline-btn:hover {
  background: rgba(60, 60, 60, 0.9);
  color: #f0f0f0;
  border-color: #e74c3c;
}
</style>
