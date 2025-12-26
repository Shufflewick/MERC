/**
 * Day One Actions
 *
 * Actions specific to Day 1 setup for both Rebel and Dictator players.
 */

import { Action, type ActionDefinition } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer } from '../game.js';
import { MercCard, Sector } from '../elements.js';
import {
  drawMercsForHiring,
  isValidLandingSector,
  equipStartingEquipment,
  placeInitialMilitia,
  hireDictatorMerc,
  applyDictatorSetupAbility,
  drawTacticsHand,
  autoPlaceExtraMilitia,
} from '../day-one.js';
import { setPrivacyPlayer } from '../ai-helpers.js';
import { capitalize, isInPlayerTeam } from './helpers.js';

// =============================================================================
// Rebel Day 1 Actions
// =============================================================================

// Module-level cache for drawn MERCs - persists between hire actions
const drawnMercsCache = new Map<string, MercCard[]>();

/**
 * Hire first MERC on Day 1.
 * Draw 3 MERCs, player picks 1 to hire, then picks their starting equipment.
 */
export function createHireFirstMercAction(game: MERCGame): ActionDefinition {
  return Action.create('hireFirstMerc')
    .prompt('Hire your first MERC')
    .notUndoable() // Involves randomness (drawing cards)
    .condition((ctx) => {
      // Only available during Day 1 setup
      if (game.currentDay !== 1) return false;
      // Not available during combat
      if (game.activeCombat) return false;
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      return player.teamSize === 0;
    })
    .chooseFrom<string>('merc', {
      prompt: 'Select your FIRST MERC to hire',
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const playerId = `${player.position}`;

        // Draw MERCs only once per player
        if (!drawnMercsCache.has(playerId)) {
          drawnMercsCache.set(playerId, drawMercsForHiring(game, 3));
        }
        const available = drawnMercsCache.get(playerId) || [];

        if (available.length === 0) {
          return ['No MERCs available'];
        }
        return available.map((m) => capitalize(m.mercName));
      },
    })
    .chooseFrom<string>('equipmentType', {
      prompt: 'Choose starting equipment type',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const playerId = `${player.position}`;
      const available = drawnMercsCache.get(playerId) || [];

      if (available.length === 0) {
        return { success: false, message: 'No MERCs available in deck' };
      }

      const mercName = args.merc as string;
      if (!mercName || mercName === 'No MERCs available') {
        return { success: false, message: 'No MERCs available in deck' };
      }

      const merc = available.find(m => capitalize(m.mercName) === mercName);
      if (!merc) {
        return { success: false, message: 'Invalid selection' };
      }

      // Hire the selected MERC
      merc.putInto(player.primarySquad);
      game.message(`${player.name} hired ${merc.mercName}`);

      // Equip starting equipment
      const equipmentType = args.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
      const equipment = equipStartingEquipment(game, merc, equipmentType);

      // Remove from cache (keep remaining for second hire)
      const remaining = available.filter(m => m !== merc);
      drawnMercsCache.set(playerId, remaining);

      return {
        success: true,
        message: equipment
          ? `Hired ${merc.mercName}, equipped ${equipment.equipmentName}`
          : `Hired ${merc.mercName}`,
        data: { hiredMerc: merc.mercName },
      };
    });
}

/**
 * Hire second MERC on Day 1.
 * Pick from remaining 2 MERCs, discard the unchosen one, then pick their starting equipment.
 */
export function createHireSecondMercAction(game: MERCGame): ActionDefinition {
  return Action.create('hireSecondMerc')
    .prompt('Hire your second MERC')
    .notUndoable()
    .condition((ctx) => {
      // Only available during Day 1 setup
      if (game.currentDay !== 1) return false;
      // Not available during combat
      if (game.activeCombat) return false;
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      return player.teamSize === 1;
    })
    .chooseFrom<string>('merc', {
      prompt: 'Select your SECOND MERC to hire',
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const playerId = `${player.position}`;
        const available = drawnMercsCache.get(playerId) || [];

        if (available.length === 0) {
          return ['No MERCs available'];
        }
        return available.map((m) => capitalize(m.mercName));
      },
    })
    .chooseFrom<string>('equipmentType', {
      prompt: 'Choose starting equipment type',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const playerId = `${player.position}`;
      const available = drawnMercsCache.get(playerId) || [];

      if (available.length === 0) {
        return { success: false, message: 'No MERCs available in deck' };
      }

      const mercName = args.merc as string;
      if (!mercName || mercName === 'No MERCs available') {
        return { success: false, message: 'No MERCs available in deck' };
      }

      const merc = available.find(m => capitalize(m.mercName) === mercName);
      if (!merc) {
        return { success: false, message: 'Invalid selection' };
      }

      // Hire the selected MERC
      merc.putInto(player.primarySquad);
      game.message(`${player.name} hired ${merc.mercName}`);

      // Equip starting equipment
      const equipmentType = args.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
      const equipment = equipStartingEquipment(game, merc, equipmentType);

      // Discard the remaining MERC(s)
      for (const other of available) {
        if (other !== merc) {
          other.putInto(game.mercDiscard);
          game.message(`${other.mercName} was not selected and returns to the deck`);
        }
      }

      // Clean up cache
      drawnMercsCache.delete(playerId);

      return {
        success: true,
        message: equipment
          ? `Hired ${merc.mercName}, equipped ${equipment.equipmentName}`
          : `Hired ${merc.mercName}`,
        data: { hiredMerc: merc.mercName },
      };
    });
}

/**
 * Equip starting equipment on Day 1.
 * Each MERC gets 1 free equipment from any deck.
 * Auto-selects the unequipped MERC (no need to ask - we just hired them).
 */
export function createEquipStartingAction(game: MERCGame): ActionDefinition {
  return Action.create('equipStarting')
    .prompt((ctx) => {
      const player = ctx.player as RebelPlayer;
      const unequippedMerc = player.team.find(m =>
        !m.weaponSlot && !m.armorSlot && !m.accessorySlot
      );
      return `Equip ${unequippedMerc?.mercName || 'MERC'}`;
    })
    .notUndoable() // Involves randomness (drawing equipment)
    .condition((ctx) => {
      // Only rebels equip starting equipment
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      return player.team.some(merc =>
        !merc.weaponSlot && !merc.armorSlot && !merc.accessorySlot
      );
    })
    .chooseFrom<string>('equipmentType', {
      prompt: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const unequippedMerc = player.team.find(m =>
          !m.weaponSlot && !m.armorSlot && !m.accessorySlot
        );
        return `Choose equipment type for ${unequippedMerc?.mercName || 'MERC'}`;
      },
      choices: () => ['Weapon', 'Armor', 'Accessory'],
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      // Auto-select the unequipped MERC
      const merc = player.team.find(m =>
        !m.weaponSlot && !m.armorSlot && !m.accessorySlot
      );

      if (!merc) {
        return { success: false, message: 'No MERC needs equipment' };
      }

      const equipmentType = args.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
      const equipment = equipStartingEquipment(game, merc, equipmentType);

      if (equipment) {
        return {
          success: true,
          message: `${merc.mercName} equipped ${equipment.equipmentName}`,
        };
      }

      return {
        success: false,
        message: `No ${equipmentType.toLowerCase()} available`,
      };
    });
}

/**
 * Place Landing action for Day 1.
 */
export function createPlaceLandingAction(game: MERCGame): ActionDefinition {
  return Action.create('placeLanding')
    .prompt('Choose your landing zone')
    .condition((ctx) => {
      // Cannot place landing during combat
      if (game.activeCombat) return false;
      // Only available during Day 1
      if (game.currentDay !== 1) return false;
      // Only rebels place landing zones
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      // Cannot place if already landed (has a sector)
      if (player.primarySquad.sectorId) return false;
      return true;
    })
    .chooseElement<Sector>('sector', {
      prompt: 'Select an edge industry to land',
      elementClass: Sector,
      filter: (element) => {
        const sector = element as unknown as Sector;
        return isValidLandingSector(game, sector);
      },
      boardRef: (element) => ({ id: (element as unknown as Sector).id }),
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const sector = args.sector as Sector;

      player.primarySquad.sectorId = sector.sectorId;
      game.message(`${player.name} landed at ${sector.sectorName}`);

      return { success: true, message: `Landed at ${sector.sectorName}` };
    });
}

/**
 * Alias for place landing (Day 1 version)
 */
export function createPlaceLandingDay1Action(game: MERCGame): ActionDefinition {
  return createPlaceLandingAction(game);
}

// =============================================================================
// Dictator Day 1 Actions (MERC-mtoq)
// =============================================================================

/**
 * MERC-f6m6: Place initial militia on unoccupied industries
 * For human dictator: Shows where militia will be placed and confirms
 * For AI dictator: Auto-executes
 */
export function createDictatorPlaceInitialMilitiaAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorPlaceInitialMilitia')
    .prompt('Place initial militia on unoccupied industries')
    .condition(() => {
      // Only available during Day 1 setup
      return game.currentDay === 1;
    })
    .execute(() => {
      placeInitialMilitia(game);
      return { success: true, message: 'Initial militia placed' };
    });
}

/**
 * MERC-i4g5: Hire dictator's first MERC
 * Per rules: Dictator draws 1 random MERC (Castro can draw 3 and pick 1)
 */
export function createDictatorHireFirstMercAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorHireFirstMerc')
    .prompt('Hire your first MERC')
    .condition(() => {
      // Only available during Day 1 setup
      return game.currentDay === 1;
    })
    .execute(() => {
      hireDictatorMerc(game);
      return { success: true, message: 'Dictator MERC hired' };
    });
}

/**
 * Apply dictator's special setup ability
 * This is automatic based on which dictator is selected
 */
export function createDictatorSetupAbilityAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorSetupAbility')
    .prompt('Apply dictator special ability')
    .condition(() => {
      return game.currentDay === 1;
    })
    .execute(() => {
      applyDictatorSetupAbility(game);
      return { success: true, message: 'Dictator ability applied' };
    });
}

/**
 * Draw tactics cards for dictator
 * AI plays from deck top, human gets a hand
 */
export function createDictatorDrawTacticsAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorDrawTactics')
    .prompt('Draw tactics cards')
    .condition(() => {
      return game.currentDay === 1;
    })
    .execute(() => {
      drawTacticsHand(game);
      return { success: true, message: 'Tactics cards drawn' };
    });
}

/**
 * MERC-l2nb: Place extra militia
 * For AI: Distributes evenly among controlled sectors
 * For human: Could allow choice of distribution (future enhancement)
 */
export function createDictatorPlaceExtraMilitiaAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorPlaceExtraMilitia')
    .prompt('Place extra militia')
    .condition(() => {
      return game.currentDay === 1 && game.setupConfig.dictatorStrength.extra > 0;
    })
    .execute(() => {
      autoPlaceExtraMilitia(game);
      return { success: true, message: 'Extra militia placed' };
    });
}

/**
 * Skip extra militia placement (when none to place)
 */
export function createDictatorSkipExtraMilitiaAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorSkipExtraMilitia')
    .prompt('No extra militia to place')
    .condition(() => {
      return game.currentDay === 1 && game.setupConfig.dictatorStrength.extra === 0;
    })
    .execute(() => {
      return { success: true, message: 'No extra militia' };
    });
}

// =============================================================================
// MERC-xj2: Privacy Player Designation
// =============================================================================

/**
 * Action to designate the privacy player for AI games.
 * MERC-xj2: Per AI rules, one Rebel player handles all Dictator actions.
 */
export function createDesignatePrivacyPlayerAction(game: MERCGame): ActionDefinition {
  return Action.create('designatePrivacyPlayer')
    .prompt('Designate Privacy Player')
    .condition(() => {
      // Only available during setup when AI is enabled
      return game.dictatorPlayer?.isAI && !game.dictatorPlayer.privacyPlayerId;
    })
    .chooseElement<RebelPlayer>('player', {
      prompt: 'Choose which player will handle AI decisions',
      filter: (element) => {
        return game.rebelPlayers.includes(element as unknown as RebelPlayer);
      },
      display: (player) => (player as unknown as RebelPlayer).name,
    })
    .execute((args) => {
      const player = args.player as unknown as RebelPlayer;
      setPrivacyPlayer(game, `${player.position}`);
      return {
        success: true,
        message: `${player.name} designated as Privacy Player`,
      };
    });
}
