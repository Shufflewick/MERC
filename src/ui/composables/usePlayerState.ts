import { computed, type ComputedRef, type Ref, unref } from 'vue';
import { useGameViewHelpers, normalizeClassName } from './useGameViewHelpers';

export interface Player {
  position: number;
  playerColor: string;
  isDictator: boolean;
}

export interface PlayerState {
  players: ComputedRef<Player[]>;
  currentPlayerColor: ComputedRef<string>;
  playerColorMap: ComputedRef<Record<string, string>>;
  dictatorPlayerColor: ComputedRef<string>;
  currentPlayerIsDictator: ComputedRef<boolean>;
  positionToColor: (position: string | number) => string;
}

/**
 * Composable for player-related state derivation.
 * Extracts player colors, position mapping, and dictator detection from the game view.
 *
 * @param getGameView - Getter function that returns the current gameView
 * @param playerPosition - Current player's position (ref or number)
 */
export function usePlayerState(
  getGameView: () => any,
  playerPosition: Ref<number> | number
): PlayerState {
  const { findAllByClassName, getAttr } = useGameViewHelpers(getGameView);

  // Get dictator position from game settings (set from lobby configuration)
  // This is the authoritative source for who is the dictator
  const dictatorPosition = computed(() => {
    const gameView = getGameView();
    const settings = gameView?.attributes?.settings || gameView?.settings || {};
    const playerConfigs: any[] = settings.playerConfigs || [];

    // Check playerConfigs for isDictator flag (from exclusive player option in lobby)
    const dictatorConfigIndex = playerConfigs.findIndex(
      (config: any) => config.isDictator === true
    );

    if (dictatorConfigIndex >= 0) {
      // playerConfigs is 0-indexed, but player positions are 1-indexed
      return dictatorConfigIndex + 1;
    }

    // Fallback: dictatorPlayerPosition from settings (legacy)
    if (settings.dictatorPlayerPosition !== undefined) {
      // dictatorPlayerPosition is 0-indexed, convert to 1-indexed
      return settings.dictatorPlayerPosition + 1;
    }

    // Default: last player (position = playerCount)
    const playerCount = settings.playerCount || playerConfigs.length || 2;
    return playerCount;
  });

  // Extract all players from game view tree
  const players = computed(() => {
    const mercPlayers = findAllByClassName('MERCPlayer');
    const rebelPlayers = findAllByClassName('RebelPlayer');
    const dictatorPlayers = findAllByClassName('DictatorPlayer');
    const playerAreas = findAllByClassName('PlayerArea');

    const all = [...mercPlayers, ...rebelPlayers, ...dictatorPlayers, ...playerAreas];

    const result = all.map((p: any) => {
      // Get position from attribute, or parse from name (e.g., "area-2" -> 2)
      let position = getAttr<number | undefined>(p, 'position', undefined);
      if (position === undefined) {
        const name = getAttr<string>(p, 'name', '') || p.name || '';
        const match = name.match(/area-(\d+)/);
        if (match) {
          position = parseInt(match[1], 10);
        }
      }

      const playerColor = getAttr<string>(p, 'playerColor', '') || getAttr<string>(p, 'color', '');

      // Check if this player is the dictator based on lobby configuration
      const isDictator = position === dictatorPosition.value;

      return {
        position: position as number,
        playerColor,
        isDictator,
      };
    });

    return result;
  });

  // Current player's color
  const currentPlayerColor = computed(() => {
    const pos = unref(playerPosition);
    const player = players.value.find((p) => p.position === pos);
    if (!player) {
      console.warn('[currentPlayerColor] No player found for position', pos, 'in', players.value);
      return '';
    }
    if (!player.playerColor) {
      console.warn('[currentPlayerColor] Player has no color:', player);
      return '';
    }
    return player.playerColor;
  });

  // Map player positions to colors (for militia display in SectorPanel)
  const playerColorMap = computed(() => {
    const map: Record<string, string> = {};
    for (const player of players.value) {
      if (player.playerColor) {
        map[String(player.position)] = player.playerColor;
      }
    }
    return map;
  });

  // Get dictator player's actual color from lobby selection
  const dictatorPlayerColor = computed(() => {
    const dictator = players.value.find(p => p.isDictator);
    return dictator?.playerColor || '';
  });

  // Check if current player is the dictator
  // Uses dictatorPosition from game settings (set from lobby configuration)
  const currentPlayerIsDictator = computed(() => {
    const pos = unref(playerPosition);
    return pos === dictatorPosition.value;
  });

  // Helper to convert player position to color name
  function positionToColor(position: string | number): string {
    const pos = typeof position === 'string' ? parseInt(position, 10) : position;
    const player = players.value.find(p => p.position === pos);
    if (player?.playerColor) return player.playerColor;
    // Fallback to default colors by position
    const defaultColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
    return defaultColors[pos] || 'unknown';
  }

  return {
    players,
    currentPlayerColor,
    playerColorMap,
    dictatorPlayerColor,
    currentPlayerIsDictator,
    positionToColor,
  };
}
