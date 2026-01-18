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

  // Extract all players from game view tree
  const players = computed(() => {
    // Try various player element names
    const rebelPlayers = findAllByClassName('RebelPlayer');
    const dictatorPlayers = findAllByClassName('DictatorPlayer');
    const playerAreas = findAllByClassName('PlayerArea');

    const all = [...rebelPlayers, ...dictatorPlayers, ...playerAreas];

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

      return {
        position: position as number,
        playerColor,
        isDictator: normalizeClassName(p.className) === 'DictatorPlayer',
      };
    });

    // Check if dictator exists in result
    const hasDictator = result.some(p => p.isDictator);

    // If no dictator found but dictator squads exist, add synthetic dictator entry
    if (!hasDictator) {
      const squads = findAllByClassName('Squad');
      const hasDictatorSquad = squads.some((s: any) => {
        const name = getAttr<string>(s, 'name', '') || s.ref || '';
        return name.includes('dictator');
      });

      if (hasDictatorSquad) {
        // Dictator position is the last player (position not in playerAreas)
        // In 2-player game: position 1 is rebel, position 2 is dictator
        const rebelPositions = result.map(p => p.position).filter(p => p !== undefined);
        const maxRebelPos = Math.max(...rebelPositions, 0);
        const dictatorPosition = maxRebelPos + 1;

        result.push({
          position: dictatorPosition,
          playerColor: 'black', // Dictator uses 'black' which maps to grey
          isDictator: true,
        });
      }
    }

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
  // Players aren't in game view tree, so check if this player has rebel squads or dictator squad
  const currentPlayerIsDictator = computed(() => {
    const pos = unref(playerPosition);
    // If player has rebel squads (primary/secondary), they're a rebel
    const squads = findAllByClassName('Squad');
    const hasRebelSquad = squads.some((s: any) => {
      const name = getAttr<string>(s, 'name', '') || s.ref || '';
      // Rebel squads are named "squad-{position}-primary" or "squad-{position}-secondary"
      return name.includes(`squad-${pos}-`);
    });

    if (hasRebelSquad) return false;

    // If no rebel squads but dictator squad exists, assume this is the dictator
    const hasDictatorSquad = squads.some((s: any) => {
      const name = getAttr<string>(s, 'name', '') || s.ref || '';
      return name.includes('dictator');
    });

    return hasDictatorSquad;
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
