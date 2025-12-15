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
  >
    <template #game-board="{ state, gameView, playerPosition, isMyTurn, availableActions, action, actionArgs, executeAction, setBoardPrompt }">
      <GameBoard
        :game-view="gameView"
        :player-position="playerPosition"
        :is-my-turn="isMyTurn"
        :available-actions="availableActions"
        :action="action"
        :action-args="actionArgs"
        :execute-action="executeAction"
        :set-board-prompt="setBoardPrompt"
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
// Helper functions for player stats
function getMercCount(player: any, gameView: any): number {
  if (!gameView?.children) return 0;

  // Find squads belonging to this player
  let count = 0;
  function search(node: any) {
    if (!node) return;
    if (node.attributes?.$type === 'squad' &&
        node.attributes?.player?.position === player.position) {
      count += (node.children?.filter((c: any) => c.attributes?.mercId) || []).length;
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

  // Find map and count sectors controlled by this player
  // This is a simplified version - actual control logic is more complex
  let count = 0;
  function search(node: any) {
    if (!node) return;
    if (node.attributes?.$type === 'map' && node.children) {
      for (const sector of node.children) {
        // Check if player has units in sector
        const playerColor = player.playerColor;
        const rebelMilitia = sector.attributes?.rebelMilitia || {};
        if (rebelMilitia[playerColor] > 0) {
          count++;
        }
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
