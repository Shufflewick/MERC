<script setup lang="ts">
import { GameShell } from '@boardsmith/ui';
import GameBoard from './components/GameBoard.vue';
import { UI_COLORS } from './colors';
</script>

<template>
  <GameShell
    game-type="MERC"
    display-name="MERC"
    :player-count="2"
    :default-a-i-players="[1]"
  >
    <template #game-board="{ state, gameView, playerPosition, isMyTurn, availableActions, actionArgs, actionController, setBoardPrompt }">
      <GameBoard
        :game-view="gameView"
        :player-position="playerPosition"
        :is-my-turn="isMyTurn"
        :available-actions="availableActions"
        :action-args="actionArgs"
        :action-controller="actionController"
        :set-board-prompt="setBoardPrompt"
        :state="state"
      />
    </template>

    <template #player-stats="{ player, gameView }">
      <div class="player-stat">
        <span class="stat-label">MERCs:</span>
        <span class="stat-value">
          {{ getMercCount(player, gameView) }}
        </span>
      </div>
      <div class="player-stat">
        <span class="stat-label">Sectors:</span>
        <span class="stat-value">{{ getControlledSectors(player, gameView) }}</span>
      </div>
    </template>
  </GameShell>
</template>

<script lang="ts">
// Helper to normalize class names for comparison
function normalizeClassName(name: string | undefined): string {
  if (!name) return '';
  return name.replace(/^_/, '');
}

// Helper functions for player stats
function getMercCount(player: any, gameView: any): number {
  if (!gameView?.children) return 0;

  // For rebel players, count MERCs in their squads (identified by squadRef names)
  const playerAttrs = player.attributes || player;
  const primaryRef = playerAttrs.primarySquadRef;
  const secondaryRef = playerAttrs.secondarySquadRef;

  let count = 0;
  function search(node: any) {
    if (!node) return;
    const attrs = node.attributes || {};
    const className = normalizeClassName(node.className);

    // Check if this is one of the player's squads
    if (className === 'Squad' && (attrs.name === primaryRef || attrs.name === secondaryRef)) {
      // Count MERCs in this squad (children with mercId)
      if (node.children) {
        count += node.children.filter((c: any) =>
          c.attributes?.mercId || normalizeClassName(c.className) === 'MercCard'
        ).length;
      }
    }

    // Also check for dictator's hired mercs squad
    if (className === 'Squad' && attrs.name === playerAttrs.hiredMercsSquadRef) {
      if (node.children) {
        count += node.children.filter((c: any) =>
          c.attributes?.mercId || normalizeClassName(c.className) === 'MercCard'
        ).length;
      }
    }

    if (node.children) {
      for (const child of node.children) {
        search(child);
      }
    }
  }
  search(gameView);
  return count;
}

function getControlledSectors(player: any, gameView: any): number {
  if (!gameView?.children) return 0;

  const playerAttrs = player.attributes || player;
  const playerId = String(playerAttrs.position);
  const primaryRef = playerAttrs.primarySquadRef;
  const secondaryRef = playerAttrs.secondarySquadRef;

  // First, find sector IDs where player's squads are located
  const squadSectorIds = new Set<string>();
  function findSquadSectors(node: any) {
    if (!node) return;
    const attrs = node.attributes || {};
    const className = normalizeClassName(node.className);

    if (className === 'Squad' && (attrs.name === primaryRef || attrs.name === secondaryRef)) {
      if (attrs.sectorId) {
        squadSectorIds.add(attrs.sectorId);
      }
    }
    if (node.children) {
      for (const child of node.children) {
        findSquadSectors(child);
      }
    }
  }
  findSquadSectors(gameView);

  // Count sectors where player has presence (militia or squad)
  let count = 0;
  const countedSectors = new Set<string>();
  function countSectors(node: any) {
    if (!node) return;
    const attrs = node.attributes || {};
    const className = normalizeClassName(node.className);

    if (className === 'Sector' && attrs.sectorId) {
      const sectorId = attrs.sectorId;
      if (!countedSectors.has(sectorId)) {
        // Check if player has militia in this sector
        const rebelMilitia = attrs.rebelMilitia || {};
        const hasMilitia = rebelMilitia[playerId] > 0;
        // Check if player's squad is in this sector
        const hasSquad = squadSectorIds.has(sectorId);

        if (hasMilitia || hasSquad) {
          count++;
          countedSectors.add(sectorId);
        }
      }
    }
    if (node.children) {
      for (const child of node.children) {
        countSectors(child);
      }
    }
  }
  countSectors(gameView);
  return count;
}
</script>

<style scoped>
.player-stat {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  margin-top: 8px;
}

.stat-label {
  color: #888;
}

.stat-value {
  font-weight: bold;
  color: v-bind('UI_COLORS.accent');
}
</style>
