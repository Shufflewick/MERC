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

/**
 * Hire starting MERCs on Day 1.
 * Draw 3 MERCs, player picks 2 to hire in a single action (first 2 are free).
 * Per rules (04-day-one-the-landing.md): "Draw 3 cards, choose which to hire"
 */
export function createHireStartingMercsAction(game: MERCGame): ActionDefinition {
  // Store drawn MERCs per player for consistency across the action
  const drawnMercsCache = new Map<string, MercCard[]>();

  return Action.create('hireStartingMercs')
    .prompt('Hire your starting MERCs')
    .notUndoable() // Involves randomness (drawing cards) - disables undo for rest of Day 1
    .condition((ctx) => {
      // Only rebels hire starting MERCs
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      return player.teamSize === 0; // Only show if player hasn't hired yet
    })
    .chooseFrom<string>('firstMerc', {
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
    .chooseFrom<string>('secondMerc', {
      prompt: 'Select your SECOND MERC to hire',
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const playerId = `${player.position}`;
        const available = drawnMercsCache.get(playerId) || [];

        if (available.length === 0) {
          return ['No MERCs available'];
        }
        // Show all choices - validation happens in execute
        return available.map((m) => capitalize(m.mercName));
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const playerId = `${player.position}`;
      const available = drawnMercsCache.get(playerId) || [];

      if (available.length === 0) {
        return { success: false, message: 'No MERCs available in deck' };
      }

      const firstName = args.firstMerc as string;
      const secondName = args.secondMerc as string;

      if (!firstName || !secondName || firstName === 'No MERCs available' || secondName === 'No MERCs available') {
        return { success: false, message: 'No MERCs available in deck' };
      }

      // Validate different MERCs selected
      if (firstName === secondName) {
        return { success: false, message: 'Please select two different MERCs' };
      }

      // Find MERCs by capitalized name
      const firstMerc = available.find(m => capitalize(m.mercName) === firstName);
      const secondMerc = available.find(m => capitalize(m.mercName) === secondName);

      if (!firstMerc || !secondMerc) {
        return { success: false, message: 'Invalid selection' };
      }

      // Hire both selected MERCs
      firstMerc.putInto(player.primarySquad);
      secondMerc.putInto(player.primarySquad);
      game.message(`${player.name} hired ${firstMerc.mercName} and ${secondMerc.mercName}`);

      // Discard the unselected MERC
      for (const merc of available) {
        if (merc !== firstMerc && merc !== secondMerc) {
          merc.putInto(game.mercDiscard);
          game.message(`${merc.mercName} was not selected and returns to the deck`);
        }
      }

      // Clean up cache for this player
      drawnMercsCache.delete(playerId);

      return {
        success: true,
        message: `Hired ${firstMerc.mercName} and ${secondMerc.mercName}`,
        data: { hiredMercs: [firstMerc.mercName, secondMerc.mercName] },
      };
    });
}

/**
 * Equip starting equipment on Day 1.
 * Each MERC gets 1 free equipment from any deck.
 */
export function createEquipStartingAction(game: MERCGame): ActionDefinition {
  return Action.create('equipStarting')
    .prompt('Equip starting equipment')
    .notUndoable() // Involves randomness (drawing equipment)
    .condition((ctx) => {
      // Only rebels equip starting equipment
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      return player.team.some(merc =>
        !merc.weaponSlot && !merc.armorSlot && !merc.accessorySlot
      );
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to equip',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        // Safety check - only rebels equip starting equipment
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return isInPlayerTeam(merc, player) &&
          !merc.weaponSlot && !merc.armorSlot && !merc.accessorySlot;
      },
    })
    .chooseFrom<string>('equipmentType', {
      prompt: 'Choose equipment type to draw',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
    })
    .execute((args, ctx) => {
      const merc = args.merc as MercCard;
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
      // Only rebels place landing zones
      return game.isRebelPlayer(ctx.player as any);
    })
    .chooseElement<Sector>('sector', {
      prompt: 'Select an edge sector to land',
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
