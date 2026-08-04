<script setup lang="ts">
import { GameShell } from 'boardsmith/ui';
import CombatantIconSmall from './components/CombatantIconSmall.vue';
import { UI_COLORS } from './colors';
import { openCombatantModal } from './combatant-modal-state';
import uis from './uis';
</script>

<template>
  <!--
    The board comes from the UI registry (src/ui/uis.ts). There is no board
    slot: one declaration, one render path, so nothing can disagree about which
    UI ships. The player panel below still opens the combatant modal that the
    board renders — that state is shared through `combatant-modal-state.ts`
    rather than through this component.
  -->
  <GameShell
    game-type="MERC"
    display-name="MERC"
    :default-a-i-players="[1]"
    :uis="uis"
  >
    <template #player-stats="{ player, gameView }">
      <div class="player-stat faction-row">
        <span class="faction-badge" :class="getPlayerRole(player)">
          {{ getPlayerRole(player) === 'dictator' ? getDictatorName(player, gameView) : 'Rebel' }}
        </span>
      </div>
      <div class="player-stat combatants-row">
        <span class="stat-label">MERCs:</span>
        <div class="combatant-icons">
          <CombatantIconSmall
            v-for="combatant in getCombatants(player, gameView)"
            :key="combatant.combatantId"
            :combatant-id="combatant.combatantId"
            :image="combatant.image"
            :alt="combatant.combatantName"
            :player-color="getPlayerColorName(player)"
            :size="28"
            :clickable="true"
            @click="openCombatantModal(combatant.attributes, getPlayerColorName(player), combatant.squadName, combatant.sectorName)"
          />
          <span v-if="getCombatants(player, gameView).length === 0" class="stat-value">0</span>
        </div>
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

interface CombatantInfo {
  combatantId: string;
  combatantName: string;
  image: string;
  // Full attributes for CombatantCard modal
  attributes: Record<string, any>;
  // Squad and sector info for modal display
  squadName: string;
  sectorName: string;
}

// Helper to check if a combatant is dead (mirrors useGameViewHelpers.ts:isMercDead)
function isMercDeadLocal(attrs: any): boolean {
  // Check isDead if serialized
  if (attrs.isDead === true) return true;

  // Check health directly
  if (attrs.health === 0) return true;

  // Check damage vs maxHealth
  const damage = attrs.damage || 0;
  const maxHealth = attrs.effectiveMaxHealth || attrs.maxHealth || 3;
  if (damage > 0 && damage >= maxHealth) return true;

  return false;
}

// Helper functions for player stats
function getCombatants(player: any, gameView: any): CombatantInfo[] {
  if (!gameView?.children) return [];

  const playerAttrs = player.attributes || player;
  const primaryRef = playerAttrs.primarySquadRef;
  const secondaryRef = playerAttrs.secondarySquadRef;
  const hiredMercsRef = playerAttrs.hiredMercsSquadRef;
  const baseSquadRef = playerAttrs.baseSquadRef;
  const dictatorRef = playerAttrs.dictatorRef;

  const combatants: CombatantInfo[] = [];
  const seenIds = new Set<string>();

  // Build a map of sectorId -> sectorName for resolving sector locations
  const sectorNames = new Map<string, string>();
  function buildSectorMap(node: any) {
    if (!node) return;
    const attrs = node.attributes || {};
    const className = normalizeClassName(node.className);
    if (className === 'Sector' && attrs.sectorId && attrs.sectorName) {
      sectorNames.set(attrs.sectorId, attrs.sectorName);
    }
    if (node.children) {
      for (const child of node.children) {
        buildSectorMap(child);
      }
    }
  }
  buildSectorMap(gameView);

  function addCombatant(attrs: any, squadName: string, sectorName: string) {
    const id = attrs.combatantId || '';
    if (id && !seenIds.has(id)) {
      // Skip dead combatants - they shouldn't appear in player stats
      if (isMercDeadLocal(attrs)) return;

      seenIds.add(id);
      combatants.push({
        combatantId: id,
        combatantName: attrs.combatantName || id,
        image: attrs.image || '',
        attributes: { ...attrs },
        squadName,
        sectorName,
      });
    }
  }

  function search(node: any) {
    if (!node) return;
    const attrs = node.attributes || {};
    const className = normalizeClassName(node.className);

    // Check if this is the player's dictator card
    if (className === 'CombatantModel' && attrs.name === dictatorRef) {
      // For dictator, resolve sector from their sectorId attribute
      const sectorName = attrs.sectorId ? (sectorNames.get(attrs.sectorId) || '') : '';
      addCombatant(attrs, '', sectorName);
    }

    // Check if this is one of the player's squads
    let squadName = '';
    if (className === 'Squad') {
      if (attrs.name === primaryRef) squadName = 'Primary';
      else if (attrs.name === secondaryRef) squadName = 'Secondary';
      else if (attrs.name === hiredMercsRef) squadName = 'Hired';
      else if (attrs.name === baseSquadRef) squadName = 'Base';
    }

    if (squadName && node.children) {
      // Resolve the squad's sector location
      const squadSectorId = attrs.sectorId || '';
      const sectorName = squadSectorId ? (sectorNames.get(squadSectorId) || '') : '';

      for (const child of node.children) {
        const childAttrs = child.attributes || {};
        if (childAttrs.combatantId) {
          addCombatant(childAttrs, squadName, sectorName);
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
  return combatants;
}

function getPlayerRole(player: any): 'rebel' | 'dictator' {
  const playerAttrs = player.attributes || player;
  return playerAttrs.role === 'dictator' ? 'dictator' : 'rebel';
}

function getDictatorName(player: any, gameView: any): string {
  if (!gameView?.children) return 'Dictator';

  const playerAttrs = player.attributes || player;

  // Strategy 1: Find via dictatorRef (element name reference)
  const dictatorRef = playerAttrs.dictatorRef;

  // Strategy 2: Find via dictator attribute (direct combatantName on player)
  if (playerAttrs.dictator?.combatantName) {
    return playerAttrs.dictator.combatantName;
  }

  function search(node: any): string | null {
    if (!node) return null;
    const attrs = node.attributes || {};
    const className = normalizeClassName(node.className);

    if (className === 'CombatantModel') {
      // Match by ref name if available
      if (dictatorRef && attrs.name === dictatorRef && attrs.combatantName) {
        return attrs.combatantName;
      }
      // Match by cardType
      if (attrs.cardType === 'dictator' && attrs.combatantName) {
        return attrs.combatantName;
      }
    }

    if (node.children) {
      for (const child of node.children) {
        const result = search(child);
        if (result) return result;
      }
    }
    return null;
  }
  return search(gameView) || 'Dictator';
}

function getPlayerColorName(player: any): string {
  const playerAttrs = player.attributes || player;
  return playerAttrs.playerColor || '';
}

function getControlledSectors(player: any, gameView: any): number {
  if (!gameView?.children) return 0;

  const playerAttrs = player.attributes || player;
  const playerId = String(playerAttrs.seat);
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
  align-items: center;
  font-size: 0.85rem;
  margin-top: 8px;
}

.player-stat.combatants-row {
  align-items: flex-start;
}

.combatant-icons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
}

.stat-label {
  color: #888;
}

.stat-value {
  font-weight: bold;
  color: v-bind('UI_COLORS.accent');
}

.faction-row {
  justify-content: center;
  margin-top: 4px;
  margin-bottom: 2px;
}

.faction-badge {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 8px;
  border-radius: 4px;
}

.faction-badge.rebel {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.faction-badge.dictator {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}
</style>
