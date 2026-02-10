import { computed, type ComputedRef, type Ref, unref } from 'vue';
import { useGameViewHelpers } from './useGameViewHelpers';
import type { Sector } from './useSectorState';
import type { Player } from './usePlayerState';

/**
 * Squad data as represented in the UI.
 */
export interface SquadState {
  squadId: string;
  isPrimary: boolean;
  isBase?: boolean; // Flag for dictator base squad
  sectorId: string;
  sectorName?: string;
  mercs: any[]; // CombatantModel elements, filtered for dead
}

/**
 * Merc data with location and player info for control map calculations.
 */
export interface MercWithLocation {
  combatantId: string;
  combatantName?: string;
  sectorId: string;
  sectorName: string;
  playerColor: string;
  image: string;
  isDictator?: boolean;
  isDictatorUnit?: boolean; // Belongs to dictator player (mercs + dictator character)
  [key: string]: unknown; // Allow spread of original node properties
}

/**
 * Return type from useSquadState composable.
 */
export interface SquadStateReturn {
  // Rebel player squads
  primarySquad: ComputedRef<SquadState | undefined>;
  secondarySquad: ComputedRef<SquadState | undefined>;
  // Dictator player squads
  dictatorPrimarySquad: ComputedRef<SquadState | undefined>;
  dictatorSecondarySquad: ComputedRef<SquadState | undefined>;
  dictatorBaseSquad: ComputedRef<SquadState | undefined>;
  dictatorSquad: ComputedRef<SquadState | undefined>; // Alias for dictatorPrimarySquad
  // All mercs across all squads
  allMercs: ComputedRef<MercWithLocation[]>;
}

/**
 * Composable for squad-related state derivation.
 * Extracts squad data for both rebel and dictator players.
 *
 * @param getGameView - Getter function that returns the current gameView
 * @param playerSeat - Current player's seat (ref or number)
 * @param currentPlayerIsDictator - Whether current player is the dictator
 * @param sectors - Computed sectors array for looking up sector names
 * @param players - Computed players array for color lookup
 */
export function useSquadState(
  getGameView: () => any,
  playerSeat: Ref<number> | number,
  currentPlayerIsDictator: ComputedRef<boolean>,
  sectors: ComputedRef<Sector[]>,
  players: ComputedRef<Player[]>
): SquadStateReturn {
  const { findAllByClassName, getAttr, isMercDead } =
    useGameViewHelpers(getGameView);

  /**
   * Helper to get player seat from squad.
   * Tries various ways to extract the seat.
   */
  function getSquadPlayerSeat(squad: any): number {
    // Try various ways to get player seat
    const player = getAttr<{ seat?: number } | null>(squad, 'player', null);
    if (player?.seat !== undefined) return player.seat;
    if (squad.player?.seat !== undefined) return squad.player.seat;
    const playerSeatVal = getAttr<number | undefined>(squad, 'playerSeat', undefined);
    if (playerSeatVal !== undefined) return playerSeatVal;
    // Try checking ref for player number
    const ref = squad.ref || '';
    let match = ref.match(/player-?(\d+)/i);
    if (match) return parseInt(match[1], 10);
    // Try parsing from name attribute like "squad-0-primary"
    const name = getAttr<string>(squad, 'name', '');
    match = name.match(/squad-(\d+)/i);
    if (match) return parseInt(match[1], 10);
    return -1;
  }

  /**
   * Helper to build a dictator squad with dictator combatant included when present.
   */
  function buildDictatorSquad(squad: any, isPrimary: boolean): SquadState {
    const sectorId = getAttr<string>(squad, 'sectorId', '');
    const sector = sectors.value.find((s) => s.sectorId === sectorId);

    // Get all combatants from squad (MERCs and dictator combatant)
    const combatants = (squad.children || [])
      .filter((c: any) => {
        const cardType = getAttr<string>(c, 'cardType', '');
        if (cardType === 'dictator') {
          // Include dictator if alive and in play
          const isDead = getAttr<number>(c, 'damage', 0) >= 10;
          const inPlay = getAttr<boolean>(c, 'inPlay', false);
          return inPlay && !isDead;
        }
        if (cardType === 'merc') {
          return !isMercDead(c);
        }
        // Also check by combatantId for serialized cards
        return getAttr<string>(c, 'combatantId', '');
      })
      .map((c: any) => {
        const cardType = getAttr<string>(c, 'cardType', '');
        if (cardType === 'dictator') {
          // Map dictator to merc-like format for SquadPanel
          return {
            ...c,
            combatantId: `dictator-${getAttr<string>(c, 'combatantId', '')}`,
            combatantName: getAttr<string>(c, 'combatantName', 'The Dictator'),
            isDictator: true,
          };
        }
        return c;
      });

    return {
      squadId: squad.ref || `dictator-squad-${isPrimary ? 'primary' : 'secondary'}`,
      isPrimary,
      sectorId,
      sectorName: sector?.sectorName,
      mercs: combatants,
    };
  }

  // Get current player's primary squad (rebel)
  const primarySquad = computed<SquadState | undefined>(() => {
    const pos = unref(playerSeat);
    const squads = findAllByClassName('Squad');
    const squad = squads.find((s: any) => {
      const squadSeat = getSquadPlayerSeat(s);
      const isPrimary = getAttr<boolean>(s, 'isPrimary', false);
      return squadSeat === pos && isPrimary === true;
    });

    if (!squad) return undefined;

    const sectorId = getAttr<string>(squad, 'sectorId', '');
    const sector = sectors.value.find((s) => s.sectorId === sectorId);

    return {
      squadId: squad.ref || 'primary',
      isPrimary: true,
      sectorId,
      sectorName: sector?.sectorName,
      mercs: (squad.children || [])
        .filter((c: any) => {
          // Skip dead MERCs
          if (isMercDead(c)) return false;
          return (
            getAttr<string>(c, 'combatantId', '') ||
            getAttr<string>(c, 'cardType', '') === 'merc'
          );
        })
        .map((c: any) => c),
    };
  });

  // Get current player's secondary squad (rebel)
  const secondarySquad = computed<SquadState | undefined>(() => {
    const pos = unref(playerSeat);
    const squads = findAllByClassName('Squad');
    const squad = squads.find((s: any) => {
      const squadSeat = getSquadPlayerSeat(s);
      // Default true so we exclude unless explicitly false
      const isPrimary = getAttr<boolean>(s, 'isPrimary', true);
      return squadSeat === pos && isPrimary === false;
    });

    if (!squad) return undefined;

    const sectorId = getAttr<string>(squad, 'sectorId', '');
    const sector = sectors.value.find((s) => s.sectorId === sectorId);

    return {
      squadId: squad.ref || 'secondary',
      isPrimary: false,
      sectorId,
      sectorName: sector?.sectorName,
      mercs: (squad.children || [])
        .filter((c: any) => {
          // Skip dead MERCs
          if (isMercDead(c)) return false;
          return (
            getAttr<string>(c, 'combatantId', '') ||
            getAttr<string>(c, 'cardType', '') === 'merc'
          );
        })
        .map((c: any) => c),
    };
  });

  // Get dictator's primary squad (includes dictator card when at this location)
  const dictatorPrimarySquad = computed<SquadState | undefined>(() => {
    if (!currentPlayerIsDictator.value) return undefined;

    const squads = findAllByClassName('Squad');
    const squad = squads.find((s: any) => {
      const name = getAttr<string>(s, 'name', '') || s.ref || '';
      return name === 'squad-dictator-primary' || name.includes('dictator-primary');
    });

    if (!squad) return undefined;

    return buildDictatorSquad(squad, true);
  });

  // Get dictator's secondary squad
  const dictatorSecondarySquad = computed<SquadState | undefined>(() => {
    if (!currentPlayerIsDictator.value) return undefined;

    const squads = findAllByClassName('Squad');
    const squad = squads.find((s: any) => {
      const name = getAttr<string>(s, 'name', '') || s.ref || '';
      return name === 'squad-dictator-secondary' || name.includes('dictator-secondary');
    });

    if (!squad) return undefined;

    return buildDictatorSquad(squad, false);
  });

  // Get dictator's base squad (third squad) - shows all combatants stationed at base
  // This is a TRUE squad in the game model, not just a UI display helper
  const dictatorBaseSquad = computed<SquadState | undefined>(() => {
    if (!currentPlayerIsDictator.value) return undefined;

    // Find the actual base squad from the game state
    const squads = findAllByClassName('Squad');
    const baseSquad = squads.find((s: any) => {
      const name = getAttr<string>(s, 'name', '') || s.ref || '';
      return name === 'squad-dictator-base' || name.includes('dictator-base');
    });

    if (!baseSquad) return undefined;

    const sectorId = getAttr<string>(baseSquad, 'sectorId', '');
    if (!sectorId) return undefined; // Base squad not yet positioned

    const sector = sectors.value.find((s) => s.sectorId === sectorId);

    // Get all combatants in the base squad (MERCs and dictator combatant)
    const combatants = (baseSquad.children || [])
      .filter((c: any) => {
        const cardType = getAttr<string>(c, 'cardType', '');
        if (cardType === 'dictator') {
          // Include dictator if alive and in play
          const isDead = getAttr<number>(c, 'damage', 0) >= 10;
          const inPlay = getAttr<boolean>(c, 'inPlay', false);
          return inPlay && !isDead;
        }
        if (cardType === 'merc') {
          // Include MERCs if not dead
          return !isMercDead(c);
        }
        return false;
      })
      .map((c: any) => {
        const cardType = getAttr<string>(c, 'cardType', '');
        if (cardType === 'dictator') {
          return {
            ...c,
            combatantId: `dictator-${getAttr<string>(c, 'combatantId', '')}`,
            combatantName: getAttr<string>(c, 'combatantName', 'The Dictator'),
            isDictator: true,
          };
        }
        return c;
      });

    // Always show base squad if it has a sector (even if empty - can transfer into it)
    return {
      squadId: 'squad-dictator-base',
      isPrimary: false,
      isBase: true, // Flag to indicate this is the base squad
      sectorId,
      sectorName: sector?.sectorName || 'Base',
      mercs: combatants,
    };
  });

  // Alias for simpler access
  const dictatorSquad = dictatorPrimarySquad;

  // Extract all MERCs with their locations (for control map and sector mercs)
  const allMercs = computed<MercWithLocation[]>(() => {
    const mercs: MercWithLocation[] = [];

    // Find all squads
    const squads = findAllByClassName('Squad');

    for (const squad of squads) {
      const sectorId = getAttr<string>(squad, 'sectorId', '');

      // Get player color from squad's player seat
      const squadSeat = getSquadPlayerSeat(squad);
      const squadName = getAttr<string>(squad, 'name', '') || squad.ref || '';
      const isDictatorSquad = squadName.includes('dictator');

      let playerColor = '';
      let isDictatorUnit = false;
      if (isDictatorSquad) {
        const dictatorPlayer = players.value.find((p) => p.isDictator);
        playerColor = dictatorPlayer?.playerColor || '';
        isDictatorUnit = true;
      } else if (squadSeat >= 0) {
        const player = players.value.find((p) => p.seat === squadSeat);
        if (!player) {
          console.warn(
            '[allMercs] No player found for squad seat',
            squadSeat,
            'squad:',
            squadName
          );
        } else if (!player.playerColor) {
          console.warn('[allMercs] Player has no color for seat', squadSeat);
        }
        playerColor = player?.playerColor || '';
      }

      if (squad.children) {
        for (const merc of squad.children) {
          const id = getAttr<string>(merc, 'combatantId', '');
          // Skip dead MERCs
          if (isMercDead(merc)) continue;

          const cardType = getAttr<string>(merc, 'cardType', '');
          if ((id || cardType === 'merc') && cardType !== 'dictator') {
            // Use squad's sectorId (sectorId is now a computed getter on combatants)
            const mercSectorId = getAttr<string>(merc, 'sectorId', '') || sectorId;
            const mercSector = sectors.value.find((s) => s.sectorId === mercSectorId);
            const combatantId = id || merc.ref;
            mercs.push({
              ...merc,
              combatantId,
              sectorId: mercSectorId,
              sectorName: mercSector?.sectorName || '',
              playerColor,
              isDictatorUnit,
              image: getAttr<string>(merc, 'image', ''),
            });
          }
        }
      }
    }

    // Find dictator combatants by iterating through dictator squads
    // This approach gets sectorId from the squad (where it's stored) rather than
    // trying to backtrack from combatants (sectorId is now a computed getter on combatants)
    const dictatorSquads = squads.filter((s: any) => {
      const name = getAttr<string>(s, 'name', '') || s.ref || '';
      return name.includes('dictator');
    });

    const dictatorPlayer = players.value.find((p) => p.isDictator);
    const dictatorColor = dictatorPlayer?.playerColor || '';

    for (const squad of dictatorSquads) {
      const squadSectorId = getAttr<string>(squad, 'sectorId', '');
      if (!squadSectorId) continue;

      for (const child of squad.children || []) {
        const cardType = getAttr<string>(child, 'cardType', '');

        if (cardType === 'merc') {
          if (isMercDead(child)) continue;
          const combatantId = getAttr<string>(child, 'combatantId', '') || child.ref;
          const exists = mercs.some((m) => m.combatantId === combatantId);
          if (!exists) {
            const dictatorMercSector = sectors.value.find(
              (s) => s.sectorId === squadSectorId
            );
            mercs.push({
              ...child,
              combatantId,
              sectorId: squadSectorId,
              sectorName: dictatorMercSector?.sectorName || '',
              playerColor: dictatorColor,
              isDictatorUnit: true,
              image: getAttr<string>(child, 'image', ''),
            });
          }
        }

        if (cardType === 'dictator') {
          const inPlay = getAttr<boolean>(child, 'inPlay', false);
          const isDead = getAttr<number>(child, 'damage', 0) >= 10;
          if (!inPlay || isDead) continue;

          const charId = getAttr<string>(child, 'combatantId', '');
          const combatantDisplayId = `dictator-${charId}`;
          const exists = mercs.some((m) => m.combatantId === combatantDisplayId);
          if (!exists) {
            const dictatorSector = sectors.value.find(
              (s) => s.sectorId === squadSectorId
            );
            mercs.push({
              ...child,
              combatantId: combatantDisplayId,
              combatantName: getAttr<string>(child, 'combatantName', 'The Dictator'),
              sectorId: squadSectorId,
              sectorName: dictatorSector?.sectorName || '',
              playerColor: dictatorColor,
              isDictatorUnit: true,
              image: getAttr<string>(child, 'image', ''),
              isDictator: true,
            });
          }
        }
      }
    }

    return mercs;
  });

  return {
    primarySquad,
    secondarySquad,
    dictatorPrimarySquad,
    dictatorSecondarySquad,
    dictatorBaseSquad,
    dictatorSquad,
    allMercs,
  };
}
