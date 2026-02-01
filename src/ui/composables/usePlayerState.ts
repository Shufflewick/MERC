import { computed, type ComputedRef, type Ref, unref } from 'vue';
import { useGameViewHelpers, normalizeClassName } from './useGameViewHelpers';

export interface Player {
  seat: number;
  playerColor: string;
  isDictator: boolean;
}

export interface PlayerState {
  players: ComputedRef<Player[]>;
  currentPlayerColor: ComputedRef<string>;
  playerColorMap: ComputedRef<Record<string, string>>;
  dictatorPlayerColor: ComputedRef<string>;
  currentPlayerIsDictator: ComputedRef<boolean>;
  seatToColor: (seat: string | number) => string;
}

/**
 * Composable for player-related state derivation.
 * Extracts player colors, seat mapping, and dictator detection from the game view.
 *
 * @param getGameView - Getter function that returns the current gameView
 * @param playerSeat - Current player's seat (ref or number)
 */
export function usePlayerState(
  getGameView: () => any,
  playerSeat: Ref<number> | number
): PlayerState {
  const { findAllByClassName, getAttr } = useGameViewHelpers(getGameView);

  // Extract all players from game view tree
  const players = computed(() => {
    const mercPlayers = findAllByClassName('MERCPlayer');
    const rebelPlayers = findAllByClassName('RebelPlayer');
    const dictatorPlayers = findAllByClassName('DictatorPlayer');
    const playerAreas = findAllByClassName('PlayerArea');

    const all = [...mercPlayers, ...rebelPlayers, ...dictatorPlayers, ...playerAreas];

    const result = all.map((p: any) => {
      // Get seat from attribute, or parse from name (e.g., "area-2" -> 2)
      let seat = getAttr<number | undefined>(p, 'seat', undefined);
      if (seat === undefined) {
        const name = getAttr<string>(p, 'name', '') || p.name || '';
        const match = name.match(/area-(\d+)/);
        if (match) {
          seat = parseInt(match[1], 10);
        }
      }

      const playerColor = getAttr<string>(p, 'playerColor', '') || getAttr<string>(p, 'color', '');

      // Read role directly from player object
      const role = getAttr<string>(p, 'role', '');
      const isDictator = role === 'dictator';

      return {
        seat: seat as number,
        playerColor,
        isDictator,
      };
    });

    return result;
  });

  // Current player's color
  const currentPlayerColor = computed(() => {
    const pos = unref(playerSeat);
    const player = players.value.find((p) => p.seat === pos);
    if (!player) {
      console.warn('[currentPlayerColor] No player found for seat', pos, 'in', players.value);
      return '';
    }
    if (!player.playerColor) {
      console.warn('[currentPlayerColor] Player has no color:', player);
      return '';
    }
    return player.playerColor;
  });

  // Map player seats to colors (for militia display in SectorPanel)
  const playerColorMap = computed(() => {
    const map: Record<string, string> = {};
    for (const player of players.value) {
      if (player.playerColor) {
        map[String(player.seat)] = player.playerColor;
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
  const currentPlayerIsDictator = computed(() => {
    const pos = unref(playerSeat);
    const player = players.value.find(p => p.seat === pos);
    return player?.isDictator ?? false;
  });

  // Helper to convert player seat to color name
  function seatToColor(seat: string | number): string {
    const pos = typeof seat === 'string' ? parseInt(seat, 10) : seat;
    const player = players.value.find(p => p.seat === pos);
    if (player?.playerColor) return player.playerColor;
    // Fallback to default colors by seat
    const defaultColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
    return defaultColors[pos] || 'unknown';
  }

  return {
    players,
    currentPlayerColor,
    playerColorMap,
    dictatorPlayerColor,
    currentPlayerIsDictator,
    seatToColor,
  };
}
