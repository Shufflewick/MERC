/**
 * Day One Actions
 *
 * Actions specific to Day 1 setup for both Rebel and Dictator players.
 */

import { Action, type ActionDefinition } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer } from '../game.js';
import { Sector, CombatantModel } from '../elements.js';
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
import { setupDictator, type DictatorData } from '../setup.js';
import { setPrivacyPlayer } from '../ai-helpers.js';
import { capitalize, isInPlayerTeam, canHireMercWithTeam, asRebelPlayer, asSector, isRebelPlayer, isCombatantModel, isMerc, getCachedValue, setCachedValue, clearCachedValue, getGlobalCachedValue, setGlobalCachedValue, clearGlobalCachedValue } from './helpers.js';

// =============================================================================
// Rebel Day 1 Actions
// =============================================================================

// Settings key for drawn MERCs cache (persists across contexts unlike module-level Map)
const DRAWN_MERCS_KEY = 'drawnMercsForHiring';

/**
 * Get merc combatants from cached IDs
 * Returns undefined if no cache exists (so callers can distinguish from empty cache)
 */
function getMercsFromCache(game: MERCGame, playerId: string): CombatantModel[] | undefined {
  const ids = getCachedValue<number[]>(game, DRAWN_MERCS_KEY, playerId);
  if (!ids) return undefined; // No cache - caller should draw
  if (ids.length === 0) return []; // Cache exists but empty (all MERCs hired)
  return ids.map(id => {
    const el = game.getElementById(id);
    return (isCombatantModel(el) && el.isMerc) ? el : null;
  }).filter((m): m is CombatantModel => m !== null);
}

/**
 * Draw and cache MERCs for a player if not already cached.
 * Uses game.settings for persistence across BoardSmith contexts.
 */
function ensureMercsDrawn(game: MERCGame, playerId: string): CombatantModel[] {
  const cachedMercs = getMercsFromCache(game, playerId);
  if (cachedMercs !== undefined) {
    // Cache exists (even if empty) - return what's there
    return cachedMercs;
  }

  // No cache - draw fresh
  const drawn = drawMercsForHiring(game, 3);
  setCachedValue(game, DRAWN_MERCS_KEY, playerId, drawn.map(m => m.id));
  game.message(`Drew ${drawn.length} MERCs for hiring: ${drawn.map(m => m.combatantName).join(', ')}`);
  return drawn;
}

/**
 * Hire first MERC on Day 1.
 * Draw 3 MERCs, player picks 1 to hire, then picks their starting equipment.
 */
export function createHireFirstMercAction(game: MERCGame): ActionDefinition {
  return Action.create('hireFirstMerc')
    .prompt('Hire your first MERC')
    .notUndoable() // Involves randomness (drawing cards)
    .condition({
      'is Day 1': () => game.currentDay === 1,
      'not in combat': () => !game.activeCombat,
      'is rebel player': (ctx) => isRebelPlayer(ctx.player),
      'has landed': (ctx) => {
        if (!isRebelPlayer(ctx.player)) return false;
        return !!ctx.player.primarySquad.sectorId;
      },
      'has no MERCs yet': (ctx) => {
        if (!isRebelPlayer(ctx.player)) return false;
        return ctx.player.team.length === 0;
      },
    })
    .chooseFrom<string>('merc', {
      prompt: 'Select your FIRST MERC to hire',
      defer: true, // Choices evaluated when action is started, enabling deck manipulation
      choices: (ctx) => {
        const player = asRebelPlayer(ctx.player);
        const playerId = `${player.position}`;

        // Only draw if cache exists (populated by starting the action)
        // This prevents drawing during action availability preview
        const available = getMercsFromCache(game, playerId);
        if (!available) {
          // First time accessing - draw now (defer: true means action was clicked)
          const drawn = ensureMercsDrawn(game, playerId);
          if (drawn.length === 0) {
            return ['No MERCs available'];
          }
          return drawn.map((m) => capitalize(m.combatantName));
        }

        if (available.length === 0) {
          return ['No MERCs available'];
        }
        return available.map((m) => capitalize(m.combatantName));
      },
      // AI: Pick a random available MERC
      aiSelect: (ctx) => {
        const player = asRebelPlayer(ctx.player);
        const playerId = `${player.position}`;
        const cached = getMercsFromCache(game, playerId);
        const available = cached ?? ensureMercsDrawn(game, playerId);
        if (available.length === 0) return undefined;
        const pick = available[Math.floor(game.random() * available.length)];
        return capitalize(pick.combatantName);
      },
    })
    .chooseFrom<string>('equipmentType', {
      prompt: 'Choose starting equipment type',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
      // AI: Pick random equipment type
      aiSelect: () => {
        const types = ['Weapon', 'Armor', 'Accessory'];
        return types[Math.floor(game.random() * types.length)];
      },
    })
    .execute((args, ctx) => {
      const player = asRebelPlayer(ctx.player);
      const playerId = `${player.position}`;
      const available = getMercsFromCache(game, playerId) || [];

      if (available.length === 0) {
        return { success: false, message: 'No MERCs available in deck' };
      }

      const mercName = args.merc as string;
      if (!mercName || mercName === 'No MERCs available') {
        return { success: false, message: 'No MERCs available in deck' };
      }

      const merc = available.find(m => capitalize(m.combatantName) === mercName);
      if (!merc) {
        return { success: false, message: 'Invalid selection' };
      }

      // Hire the selected MERC - sectorId is derived from squad membership
      merc.putInto(player.primarySquad);
      game.message(`${player.name} hired ${merc.combatantName}`);

      // Update Haarg's ability bonuses (in case Haarg is in the squad)
      game.updateAllHaargBonuses();
      game.updateAllSargeBonuses();

      // Equip starting equipment
      const equipmentType = args.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
      const equipment = equipStartingEquipment(game, merc, equipmentType);

      // Remove from cache (keep remaining for second hire)
      const remaining = available.filter(m => m !== merc);
      setCachedValue(game, DRAWN_MERCS_KEY, playerId, remaining.map(m => m.id));

      return {
        success: true,
        message: equipment
          ? `Hired ${merc.combatantName}, equipped ${equipment.equipmentName}`
          : `Hired ${merc.combatantName}`,
        data: { hiredMerc: merc.combatantName },
      };
    });
}

/**
 * Hire second MERC on Day 1.
 * Pick from remaining 2 MERCs, then pick their starting equipment.
 * If Teresa was hired (doesn't count toward limit), a third hire may be available.
 */
export function createHireSecondMercAction(game: MERCGame): ActionDefinition {
  return Action.create('hireSecondMerc')
    .prompt('Hire your second MERC')
    .notUndoable()
    .condition({
      'is Day 1': () => game.currentDay === 1,
      'not in combat': () => !game.activeCombat,
      'is rebel player': (ctx) => isRebelPlayer(ctx.player),
      'has 1 MERC and 2+ remaining to hire': (ctx) => {
        if (!isRebelPlayer(ctx.player)) return false;
        const player = ctx.player;
        const playerId = `${player.position}`;
        const remaining = getMercsFromCache(game, playerId) || [];
        return player.team.length === 1 && remaining.length >= 2;
      },
    })
    .chooseFrom<string>('merc', {
      prompt: 'Select your SECOND MERC to hire',
      choices: (ctx) => {
        const player = asRebelPlayer(ctx.player);
        const playerId = `${player.position}`;
        const available = getMercsFromCache(game, playerId) || [];

        if (available.length === 0) {
          return ['No MERCs available'];
        }

        // Filter out MERCs incompatible with current team
        const compatible = available.filter(m =>
          canHireMercWithTeam(m.combatantId, player.team)
        );

        if (compatible.length === 0) {
          return ['No compatible MERCs available'];
        }
        return compatible.map((m) => capitalize(m.combatantName));
      },
      // AI: Pick a random compatible MERC
      aiSelect: (ctx) => {
        const player = asRebelPlayer(ctx.player);
        const playerId = `${player.position}`;
        const available = getMercsFromCache(game, playerId) || [];
        const compatible = available.filter(m => canHireMercWithTeam(m.combatantId, player.team));
        if (compatible.length === 0) return undefined;
        const pick = compatible[Math.floor(game.random() * compatible.length)];
        return capitalize(pick.combatantName);
      },
    })
    .chooseFrom<string>('equipmentType', {
      prompt: 'Choose starting equipment type',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
      // AI: Pick random equipment type
      aiSelect: () => {
        const types = ['Weapon', 'Armor', 'Accessory'];
        return types[Math.floor(game.random() * types.length)];
      },
    })
    .execute((args, ctx) => {
      const player = asRebelPlayer(ctx.player);
      const playerId = `${player.position}`;
      const available = getMercsFromCache(game, playerId) || [];

      if (available.length === 0) {
        return { success: false, message: 'No MERCs available in deck' };
      }

      const mercName = args.merc as string;
      if (!mercName || mercName === 'No MERCs available' || mercName === 'No compatible MERCs available') {
        return { success: false, message: 'No compatible MERCs available' };
      }

      const merc = available.find(m => capitalize(m.combatantName) === mercName);
      if (!merc) {
        return { success: false, message: 'Invalid selection' };
      }

      // Double-check compatibility (safety check)
      if (!canHireMercWithTeam(merc.combatantId, player.team)) {
        return { success: false, message: `${merc.combatantName} is incompatible with your current team` };
      }

      // Hire the selected MERC - sectorId is derived from squad membership
      merc.putInto(player.primarySquad);
      game.message(`${player.name} hired ${merc.combatantName}`);

      // Update Haarg's ability bonuses (in case Haarg is in the squad)
      game.updateAllHaargBonuses();
      game.updateAllSargeBonuses();

      // Equip starting equipment
      const equipmentType = args.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
      const equipment = equipStartingEquipment(game, merc, equipmentType);

      // Update cache with remaining MERCs
      const remaining = available.filter(m => m !== merc);
      setCachedValue(game, DRAWN_MERCS_KEY, playerId, remaining.map(m => m.id));

      const hasTeresa = player.team.some(m => m.combatantId === 'teresa');

      // Only discard remaining if Teresa is NOT on the team
      // Teresa doesn't count toward limit, so player can hire a 3rd MERC
      if (!hasTeresa) {
        for (const other of remaining) {
          other.putInto(game.mercDiscard);
          game.message(`${other.combatantName} was not selected and is discarded`);
        }
        clearCachedValue(game, DRAWN_MERCS_KEY, playerId);
      } else {
        game.message(`Teresa bonus: ${remaining.length} MERC(s) available for third hire!`);
      }

      return {
        success: true,
        message: equipment
          ? `Hired ${merc.combatantName}, equipped ${equipment.equipmentName}`
          : `Hired ${merc.combatantName}`,
        data: { hiredMerc: merc.combatantName },
      };
    });
}

/**
 * Hire third MERC on Day 1 (only available if Teresa was hired).
 * Teresa doesn't count toward team limit, so you can hire an extra MERC.
 */
export function createHireThirdMercAction(game: MERCGame): ActionDefinition {
  return Action.create('hireThirdMerc')
    .prompt('Hire your third MERC (Teresa bonus)')
    .notUndoable()
    .condition({
      'is Day 1': () => game.currentDay === 1,
      'not in combat': () => !game.activeCombat,
      'is rebel player': (ctx) => isRebelPlayer(ctx.player),
      'Teresa bonus: can hire third MERC': (ctx) => {
        if (!isRebelPlayer(ctx.player)) return false;
        const player = ctx.player;
        const playerId = `${player.position}`;
        const remaining = getMercsFromCache(game, playerId) || [];
        const hasTeresa = player.team.some(m => m.combatantId === 'teresa');
        return player.team.length === 2 && hasTeresa && remaining.length > 0;
      },
    })
    .chooseFrom<string>('merc', {
      prompt: 'Teresa doesn\'t count toward team limit! Hire your THIRD MERC or skip',
      choices: (ctx) => {
        const player = asRebelPlayer(ctx.player);
        const playerId = `${player.position}`;
        const available = getMercsFromCache(game, playerId) || [];

        // Filter out MERCs incompatible with current team
        const compatible = available.filter(m =>
          canHireMercWithTeam(m.combatantId, player.team)
        );

        const choices = compatible.map((m) => capitalize(m.combatantName));
        choices.push('Skip (no third hire)');
        return choices;
      },
      // AI: Pick a random compatible MERC (don't skip)
      aiSelect: (ctx) => {
        const player = asRebelPlayer(ctx.player);
        const playerId = `${player.position}`;
        const available = getMercsFromCache(game, playerId) || [];
        const compatible = available.filter(m => canHireMercWithTeam(m.combatantId, player.team));
        if (compatible.length === 0) return 'Skip (no third hire)';
        const pick = compatible[Math.floor(game.random() * compatible.length)];
        return capitalize(pick.combatantName);
      },
    })
    .chooseFrom<string>('equipmentType', {
      prompt: 'Choose starting equipment type',
      choices: (ctx) => {
        const mercChoice = ctx.args?.merc as string;
        // Skip equipment selection if skipping third hire
        if (mercChoice === 'Skip (no third hire)') {
          return ['N/A'];
        }
        return ['Weapon', 'Armor', 'Accessory'];
      },
      // AI: Pick random equipment type (or N/A if skipping)
      aiSelect: (ctx) => {
        const mercChoice = ctx.args?.merc as string;
        if (mercChoice === 'Skip (no third hire)') return 'N/A';
        const types = ['Weapon', 'Armor', 'Accessory'];
        return types[Math.floor(game.random() * types.length)];
      },
    })
    .execute((args, ctx) => {
      const player = asRebelPlayer(ctx.player);
      const playerId = `${player.position}`;
      const available = getMercsFromCache(game, playerId) || [];
      const mercName = args.merc as string;

      // Handle skip option
      if (mercName === 'Skip (no third hire)') {
        // Discard remaining MERCs
        for (const other of available) {
          other.putInto(game.mercDiscard);
        }
        clearCachedValue(game, DRAWN_MERCS_KEY, playerId);
        game.message(`${player.name} skipped third hire`);
        return { success: true, message: 'Skipped third hire' };
      }

      if (available.length === 0) {
        return { success: false, message: 'No MERCs available in deck' };
      }

      if (!mercName) {
        return { success: false, message: 'No MERC selected' };
      }

      const merc = available.find(m => capitalize(m.combatantName) === mercName);
      if (!merc) {
        return { success: false, message: 'Invalid selection' };
      }

      // Double-check compatibility (safety check)
      if (!canHireMercWithTeam(merc.combatantId, player.team)) {
        return { success: false, message: `${merc.combatantName} is incompatible with your current team` };
      }

      // Hire the selected MERC - sectorId is derived from squad membership
      merc.putInto(player.primarySquad);
      game.message(`${player.name} hired ${merc.combatantName} (Teresa bonus)`);

      // Update Haarg's ability bonuses (in case Haarg is in the squad)
      game.updateAllHaargBonuses();
      game.updateAllSargeBonuses();

      // Equip starting equipment
      const equipmentType = args.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
      const equipment = equipStartingEquipment(game, merc, equipmentType);

      // Clean up cache - no more hiring available
      clearCachedValue(game, DRAWN_MERCS_KEY, playerId);

      return {
        success: true,
        message: equipment
          ? `Hired ${merc.combatantName}, equipped ${equipment.equipmentName}`
          : `Hired ${merc.combatantName}`,
        data: { hiredMerc: merc.combatantName },
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
      const player = asRebelPlayer(ctx.player);
      const unequippedMerc = player.team.find(m =>
        !m.weaponSlot && !m.armorSlot && !m.accessorySlot
      );
      return `Equip ${unequippedMerc?.combatantName || 'MERC'}`;
    })
    .notUndoable() // Involves randomness (drawing equipment)
    .condition({
      'is rebel player': (ctx) => isRebelPlayer(ctx.player),
      'has MERC without equipment': (ctx) => {
        if (!isRebelPlayer(ctx.player)) return false;
        return ctx.player.team.some(merc =>
          !merc.weaponSlot && !merc.armorSlot && !merc.accessorySlot
        );
      },
    })
    .chooseFrom<string>('equipmentType', {
      prompt: (ctx) => {
        const player = asRebelPlayer(ctx.player);
        const unequippedMerc = player.team.find(m =>
          !m.weaponSlot && !m.armorSlot && !m.accessorySlot
        );
        return `Choose equipment type for ${unequippedMerc?.combatantName || 'MERC'}`;
      },
      choices: () => ['Weapon', 'Armor', 'Accessory'],
      // AI: Pick random equipment type
      aiSelect: () => {
        const types = ['Weapon', 'Armor', 'Accessory'];
        return types[Math.floor(game.random() * types.length)];
      },
    })
    .execute((args, ctx) => {
      const player = asRebelPlayer(ctx.player);
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
          message: `${merc.combatantName} equipped ${equipment.equipmentName}`,
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
    .condition({
      'not in combat': () => !game.activeCombat,
      'is Day 1': () => game.currentDay === 1,
      'is rebel player': (ctx) => isRebelPlayer(ctx.player),
      'has not landed yet': (ctx) => {
        if (!isRebelPlayer(ctx.player)) return false;
        return !ctx.player.primarySquad.sectorId;
      },
    })
    .chooseElement<Sector>('sector', {
      prompt: 'Select an edge industry to land',
      elementClass: Sector,
      filter: (element) => {
        if (!(element instanceof Sector)) return false;
        return isValidLandingSector(game, element);
      },
      boardRef: (element) => ({ id: asSector(element).id }),
      // AI: Pick a random valid landing sector
      aiSelect: () => {
        const validSectors = game.gameMap.getAllSectors()
          .filter(s => isValidLandingSector(game, s));
        if (validSectors.length === 0) return undefined;
        return validSectors[Math.floor(game.random() * validSectors.length)];
      },
    })
    .execute((args, ctx) => {
      const player = asRebelPlayer(ctx.player);
      const sector = asSector(args.sector);

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
 * Select Dictator - Human dictator players choose which dictator to play as
 * AI dictators get a random selection during setup, so this is skipped for them.
 * Uses defer: true to trigger the hiring-style UI with dictator cards.
 */
export function createSelectDictatorAction(game: MERCGame): ActionDefinition {
  return Action.create('selectDictator')
    .prompt('Choose your Dictator')
    .condition({
      'is Day 1': () => game.currentDay === 1,
      'dictator not yet selected': () => !game.dictatorPlayer?.dictator,
      'is human dictator player': () => !game.dictatorPlayer?.isAI,
    })
    .chooseFrom<string>('dictatorChoice', {
      prompt: 'Select your Dictator',
      defer: true, // Triggers hiring-style UI
      choices: () => {
        // Get available dictators from combatantData - filter for dictator entries
        const dictators = game.combatantData.filter(d => d.cardType === 'dictator');
        return dictators.map(d => d.name);
      },
    })
    .execute((args) => {
      const dictatorName = args.dictatorChoice as string;

      // Find the dictator by name and set up - filter combatantData for dictator entries
      const dictatorData = game.combatantData.filter(d => d.cardType === 'dictator');
      const dictator = dictatorData.find(d => d.name === dictatorName);
      if (!dictator) {
        return { success: false, message: `Unknown dictator: ${dictatorName}` };
      }

      const dictatorCard = setupDictator(game, dictatorData, dictator.id);

      game.message(`You have chosen to play as ${dictatorCard.combatantName}!`);

      return {
        success: true,
        message: `Selected ${dictatorCard.combatantName}`,
      };
    });
}

/**
 * MERC-f6m6: Place initial militia on unoccupied industries
 * For human dictator: Shows where militia will be placed and confirms
 * For AI dictator: Auto-executes
 */
export function createDictatorPlaceInitialMilitiaAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorPlaceInitialMilitia')
    .prompt('Place initial militia on unoccupied industries')
    .condition({
      'is Day 1': () => game.currentDay === 1,
    })
    .execute(() => {
      placeInitialMilitia(game);
      return { success: true, message: 'Initial militia placed' };
    });
}

/**
 * MERC-i4g5: Hire dictator's first MERC
 * Per rules: Dictator draws 1 random MERC (Castro can draw 3 and pick 1)
 * Human players get to choose equipment type and placement sector
 */
export function createDictatorHireFirstMercAction(game: MERCGame): ActionDefinition {
  // Key for storing drawn MERC ID
  const DRAWN_MERC_KEY = 'dictatorFirstMercId';

  // Helper to get the drawn MERC
  const getDrawnMerc = (): CombatantModel | null => {
    // Draw the MERC if not already drawn
    if (!getGlobalCachedValue<number>(game, DRAWN_MERC_KEY)) {
      const merc = game.drawMerc();
      if (merc) {
        setGlobalCachedValue(game, DRAWN_MERC_KEY, merc.id);
        game.message(`Dictator drew ${merc.combatantName}`);
      }
    }
    const combatantId = getGlobalCachedValue<number>(game, DRAWN_MERC_KEY);
    if (!combatantId) return null;
    const el = game.getElementById(combatantId);
    return (isCombatantModel(el) && el.isMerc) ? el : null;
  };

  return Action.create('dictatorHireFirstMerc')
    .prompt('Hire your first MERC')
    .condition({
      'is Day 1': () => game.currentDay === 1,
    })
    // Auto-filled selection to pass MERC name forward (shows in action panel)
    .chooseFrom<string>('merc', {
      prompt: 'Hiring MERC',
      choices: () => {
        const merc = getDrawnMerc();
        return merc ? [merc.combatantName] : ['Unknown'];
      },
      // Auto-select the only choice
      aiSelect: () => {
        const merc = getDrawnMerc();
        return merc?.combatantName || 'Unknown';
      },
      skipIf: () => game.dictatorPlayer?.isAI === true,
    })
    .chooseFrom<string>('equipmentType', {
      prompt: 'Choose starting equipment',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
      skipIf: () => game.dictatorPlayer?.isAI === true,
    })
    .chooseFrom<string>('targetSector', {
      prompt: 'Choose deployment sector',
      choices: () => {
        // Get dictator-controlled sectors (industries with militia)
        const sectors = game.gameMap.getAllSectors()
          .filter(s => s.dictatorMilitia > 0);
        if (sectors.length === 0) {
          // Fallback to any industry
          return game.gameMap.getAllSectors()
            .filter(s => s.sectorType === 'Industry')
            .map(s => s.sectorName);
        }
        return sectors.map(s => s.sectorName);
      },
      skipIf: () => game.dictatorPlayer?.isAI === true,
    })
    .execute((args) => {
      // AI path - use auto hire
      if (game.dictatorPlayer?.isAI) {
        hireDictatorMerc(game);
        return { success: true, message: 'Dictator MERC hired' };
      }

      // Human path - use selected equipment and sector
      const combatantId = getGlobalCachedValue<number>(game, DRAWN_MERC_KEY);
      const mercEl = combatantId ? game.getElementById(combatantId) : null;
      const merc = (isCombatantModel(mercEl) && mercEl.isMerc) ? mercEl : null;

      if (!merc) {
        clearGlobalCachedValue(game, DRAWN_MERC_KEY);
        return { success: false, message: 'No MERC drawn' };
      }

      // Put MERC in primary squad
      merc.putInto(game.dictatorPlayer.primarySquad);

      // Find target sector and set squad location (merc inherits via computed getter)
      const sectorName = args.targetSector as string;
      const targetSector = game.gameMap.getAllSectors().find(s => s.sectorName === sectorName);

      if (targetSector) {
        game.dictatorPlayer.primarySquad.sectorId = targetSector.sectorId;
        game.dictatorPlayer.stationedSectorId = targetSector.sectorId;
        game.message(`Dictator deployed ${merc.combatantName} to ${targetSector.sectorName}`);
      }

      // Give equipment of chosen type
      const equipType = args.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
      const freeEquipment = game.drawEquipment(equipType);
      if (freeEquipment) {
        merc.equip(freeEquipment);
        game.message(`${merc.combatantName} equipped ${freeEquipment.equipmentName}`);
      }

      clearGlobalCachedValue(game, DRAWN_MERC_KEY);
      return { success: true, message: `Hired ${merc.combatantName}` };
    });
}

/**
 * Choose base location for human Kim player
 * Kim's ability requires a base location to be set before applying
 */
export function createChooseKimBaseAction(game: MERCGame): ActionDefinition {
  return Action.create('chooseKimBase')
    .prompt("Kim's Ability: Choose your base location")
    .condition({
      'is Day 1': () => game.currentDay === 1,
      'is Kim': () => game.dictatorPlayer?.dictator?.combatantId === 'kim',
      'is human dictator player': () => !game.dictatorPlayer?.isAI,
      'base not yet set': () => !game.dictatorPlayer?.baseSectorId,
    })
    .chooseElement<Sector>('baseLocation', {
      prompt: 'Choose where to establish your revealed base',
      elementClass: Sector,
      filter: (element) => {
        if (!(element instanceof Sector)) return false;
        // Only industries with dictator militia
        return element.isIndustry && element.dictatorMilitia > 0;
      },
      display: (sector) => sector.sectorName,
      boardRef: (element) => ({ id: asSector(element).id }),
    })
    // Human Kim chooses starting equipment (just like MERCs when hired)
    .chooseFrom<string>('dictatorEquipment', {
      prompt: 'Choose starting equipment for Kim',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
    })
    .execute((args) => {
      const baseSector = asSector(args.baseLocation);

      if (!baseSector) {
        return { success: false, message: 'Invalid base location' };
      }

      game.dictatorPlayer.baseSectorId = baseSector.sectorId;
      if (game.dictatorPlayer.dictator) {
        game.dictatorPlayer.dictator.baseSectorId = baseSector.sectorId;
      }
      game.message(`Kim established base at ${baseSector.sectorName}`);

      // Equip Kim with chosen equipment (same as MERCs get when hired)
      const dictator = game.dictatorPlayer?.dictator;
      if (dictator && args.dictatorEquipment) {
        const equipType = args.dictatorEquipment as 'Weapon' | 'Armor' | 'Accessory';
        const equipment = game.drawEquipment(equipType);
        if (equipment) {
          dictator.equip(equipment);
          game.message(`${dictator.combatantName} equipped ${equipment.equipmentName}`);
        }
      }

      return { success: true, message: `Base set at ${baseSector.sectorName}` };
    });
}

/**
 * Apply dictator's special setup ability
 * This is automatic based on which dictator is selected
 */
export function createDictatorSetupAbilityAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorSetupAbility')
    .prompt('Apply dictator special ability')
    .condition({
      'is Day 1': () => game.currentDay === 1,
      'Kim base set if needed': () => {
        const dictator = game.dictatorPlayer?.dictator;
        if (dictator?.combatantId === 'kim' && !game.dictatorPlayer?.isAI && !game.dictatorPlayer?.baseSectorId) {
          return false;
        }
        return true;
      },
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
    .condition({
      'is Day 1': () => game.currentDay === 1,
    })
    .execute(() => {
      drawTacticsHand(game);
      return { success: true, message: 'Tactics cards drawn' };
    });
}

/**
 * MERC-l2nb: Place extra militia
 * For AI: Distributes evenly among controlled sectors
 * For human: Choose where to place each militia
 */
export function createDictatorPlaceExtraMilitiaAction(game: MERCGame): ActionDefinition {
  // Key for tracking remaining militia to place
  const REMAINING_MILITIA_KEY = '_extra_militia_remaining';

  return Action.create('dictatorPlaceExtraMilitia')
    .prompt(() => {
      const remaining = getGlobalCachedValue<number>(game, REMAINING_MILITIA_KEY);
      const total = game.setupConfig?.dictatorStrength?.extra ?? 0;
      if (remaining !== undefined) {
        return `Place extra militia (${remaining} remaining)`;
      }
      return `Place ${total} extra militia`;
    })
    .condition({
      'is Day 1 with extra militia': () => {
        const extra = game.setupConfig?.dictatorStrength?.extra ?? 0;
        return game.currentDay === 1 && extra > 0;
      },
      'has militia remaining to place': () => {
        const remaining = getGlobalCachedValue<number>(game, REMAINING_MILITIA_KEY);
        return remaining === undefined || remaining > 0;
      },
    })
    .chooseFrom<string>('targetSector', {
      prompt: () => {
        const remaining = getGlobalCachedValue<number>(game, REMAINING_MILITIA_KEY);
        const total = game.setupConfig?.dictatorStrength?.extra ?? 0;
        const toPlace = remaining ?? total;
        return `Choose sector to place militia (${toPlace} remaining)`;
      },
      skipIf: () => game.dictatorPlayer?.isAI === true,
      choices: () => {
        // Get dictator-controlled sectors
        const sectors = game.gameMap.getAllSectors()
          .filter(s => s.dictatorMilitia > 0);
        if (sectors.length === 0) {
          // Fallback to any industry
          return game.gameMap.getAllSectors()
            .filter(s => s.isIndustry)
            .map(s => `${s.sectorName} (${s.dictatorMilitia} militia)`);
        }
        return sectors.map(s => `${s.sectorName} (${s.dictatorMilitia} militia)`);
      },
    })
    .chooseFrom<string>('amount', {
      prompt: 'How many militia to place here?',
      skipIf: () => game.dictatorPlayer?.isAI === true,
      dependsOn: 'targetSector',
      choices: () => {
        const remaining = getGlobalCachedValue<number>(game, REMAINING_MILITIA_KEY);
        const total = game.setupConfig?.dictatorStrength?.extra ?? 0;
        const toPlace = remaining ?? total;
        // Offer 1 to remaining amount
        const options: string[] = [];
        for (let i = 1; i <= Math.min(toPlace, 10); i++) {
          options.push(`${i}`);
        }
        if (toPlace > 10) {
          options.push(`${toPlace} (all)`);
        }
        return options;
      },
    })
    .execute((args) => {
      // AI path - use auto placement
      if (game.dictatorPlayer?.isAI) {
        autoPlaceExtraMilitia(game);
        clearGlobalCachedValue(game, REMAINING_MILITIA_KEY);
        return { success: true, message: 'Extra militia placed' };
      }

      // Human path - place specified amount at chosen sector
      const total = game.setupConfig?.dictatorStrength?.extra ?? 0;
      let remaining = getGlobalCachedValue<number>(game, REMAINING_MILITIA_KEY) ?? total;

      const targetChoice = args.targetSector as string;
      const amountChoice = args.amount as string;

      // Parse amount
      let amount = parseInt(amountChoice, 10);
      if (amountChoice.includes('all')) {
        amount = remaining;
      }
      amount = Math.min(amount, remaining);

      // Extract sector name (remove militia count suffix)
      const sectorName = targetChoice.replace(/\s*\(\d+\s*militia\)$/, '').trim();
      const targetSector = game.gameMap.getAllSectors().find(s => s.sectorName === sectorName);

      if (!targetSector) {
        return { success: false, message: 'Invalid sector' };
      }

      const placed = targetSector.addDictatorMilitia(amount);
      remaining -= placed;

      game.message(`Placed ${placed} extra militia at ${targetSector.sectorName}`);

      if (remaining > 0) {
        // More militia to place - store remaining count
        setGlobalCachedValue(game, REMAINING_MILITIA_KEY, remaining);
        return {
          success: true,
          message: `Placed ${placed} militia, ${remaining} remaining`,
          followUp: 'dictatorPlaceExtraMilitia', // Continue placing
        };
      }

      // Done placing
      clearGlobalCachedValue(game, REMAINING_MILITIA_KEY);
      game.message(`All extra militia placed`);
      return { success: true, message: 'All extra militia placed' };
    });
}

/**
 * Skip extra militia placement (when none to place)
 */
export function createDictatorSkipExtraMilitiaAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorSkipExtraMilitia')
    .prompt('No extra militia to place')
    .condition({
      'is Day 1 with no extra militia': () => game.currentDay === 1 && game.setupConfig.dictatorStrength.extra === 0,
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
    .condition({
      'AI dictator needs privacy player': () => game.dictatorPlayer?.isAI && !game.dictatorPlayer.privacyPlayerId,
    })
    .chooseElement<RebelPlayer>('player', {
      prompt: 'Choose which player will handle AI decisions',
      filter: (element) => {
        if (!isRebelPlayer(element)) return false;
        return game.rebelPlayers.includes(element);
      },
      display: (player) => player.name,
    })
    .execute((args) => {
      const player = asRebelPlayer(args.player);
      setPrivacyPlayer(game, `${player.position}`);
      return {
        success: true,
        message: `${player.name} designated as Privacy Player`,
      };
    });
}
