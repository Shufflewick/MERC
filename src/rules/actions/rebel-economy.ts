/**
 * Rebel Economy Actions
 *
 * MERC economy-related actions: hiring, exploring, training, trading, and facilities.
 */

import { Action, type ActionDefinition, type ActionContext } from 'boardsmith';
import type { MERCGame, MERCPlayer, RebelPlayer } from '../game.js';
import { Sector, Equipment, Squad, CombatantModel, isGrenadeOrMortar, type EquipmentType } from '../elements.js';
import { SectorConstants } from '../constants.js';
import { queuePendingCombat } from '../combat.js';
import { getRebelControlledSectors } from '../bot-combat-helpers.js';
import { buildMapCombatantEntry, buildMapEquipmentAnimation, emitMapCombatantDeaths, emitMapCombatantEntries, emitMapEquipmentAnimations, emitMapMilitiaTrain, getMapCombatantId, emitEquipSessionStart, emitEquipSessionEnd } from '../animation-events.js';
import {
  ACTION_COSTS,
  capitalize,
  canHireMercWithTeam,
  hasActionsRemaining,
  isInPlayerTeam,
  useAction,
  canTrainWith,
  useTrainingAction,
  asRebelPlayer,
  asCombatantModel,
  asSector,
  asEquipment,
  isCombatantModel,
  getUnitName,
  findUnitSector,
  getCachedValue,
  setCachedValue,
  clearCachedValue,
  equipNewHire,
  equipWithSpectatorEvent,
  isNotInActiveCombat,
} from './helpers.js';


// =============================================================================
// Hire MERC Action
// =============================================================================

/**
 * Hire MERCs from the deck
 * Cost: 2 actions
 * Per rules (06-merc-actions.md): Draw 3, choose 0-3 to hire (within team limit)
 * MERC-yi7: Can also fire a MERC during this action
 * Draws the 3 into the rebel's offer, then chains to hireMercFromOffer for the pick.
 */
export function createHireMercAction(game: MERCGame): ActionDefinition {
  return Action.create<MERCGame>('hireMerc')
    .prompt('Hire')
    .notUndoable() // Involves randomness (drawing MERCs)
    .condition({
      'not in combat': () => isNotInActiveCombat(game),
      'is rebel player': (ctx) => game.isRebelPlayer(ctx.player),
      'bot batch gate': (ctx) => !game.shouldGateBotAction(ctx.player as MERCPlayer),
      'can hire MERC': (ctx) => {
        if (!game.isRebelPlayer(ctx.player)) return false;
        const player = asRebelPlayer(ctx.player);
        return player.canHireMerc(game);
      },
      'has actions remaining': (ctx) => {
        if (!game.isRebelPlayer(ctx.player)) return false;
        return hasActionsRemaining(asRebelPlayer(ctx.player), ACTION_COSTS.HIRE_MERC);
      },
      'MERC deck has cards': () => game.mercDeck.count(CombatantModel) > 0,
    })
    .chooseElement('actingMerc', {
      prompt: 'Which MERC spends the actions?',
      elementClass: CombatantModel,
      display: (merc) => capitalize(merc.combatantName),
      filter: (element, ctx) => {
        // Safety check - only rebels can hire MERCs
        if (!game.isRebelPlayer(ctx.player)) return false;
        if (!isCombatantModel(element) || !element.isMerc) return false;
        const merc = asCombatantModel(element);
        const player = asRebelPlayer(ctx.player);
        return isInPlayerTeam(merc, player) && merc.actionsRemaining >= ACTION_COSTS.HIRE_MERC;
      },
    })
    // MERC-yi7: Optional fire a MERC during hire action
    .chooseFrom('fireFirst', {
      prompt: 'Fire a MERC first? (frees team slot)',
      choices: (ctx: ActionContext) => {
        const player = asRebelPlayer(ctx.player);
        const choices: string[] = ['none'];
        // Only show fire option if player has multiple MERCs
        if (player.teamSize >= 2) {
          for (const merc of player.team) {
            choices.push(merc.combatantName);
          }
        }
        return choices;
      },
      display: (value: string) => value === 'none' ? 'No, continue hiring' : `Fire ${value}`,
    })
    .execute((args, ctx) => {
      const player = asRebelPlayer(ctx.player);
      const actingMerc = args.actingMerc;
      const fireChoice = args.fireFirst;

      if (!useAction(actingMerc, ACTION_COSTS.HIRE_MERC)) {
        return { success: false, error: 'Not enough actions' };
      }

      // MERC-yi7: Fire a MERC first if requested
      if (fireChoice && fireChoice !== 'none') {
        const mercToFire = player.team.find(m => m.combatantName === fireChoice);
        if (mercToFire && mercToFire !== actingMerc) {
          // Find current sector for equipment drop
          const firedSquad = player.getSquadContaining(mercToFire);
          const sector = firedSquad?.sectorId ? game.getSector(firedSquad.sectorId) : null;

          // Drop equipment to stash
          const droppedEquipment: string[] = [];
          const dropAnimations = [];
          if (mercToFire.weaponSlot) {
            const weapon = mercToFire.unequip('Weapon');
            if (weapon && sector) {
              sector.addToStash(weapon);
              droppedEquipment.push(weapon.equipmentName);
              dropAnimations.push(
                buildMapEquipmentAnimation(weapon, sector.sectorId, 'outgoing', getMapCombatantId(mercToFire))
              );
            }
          }
          if (mercToFire.armorSlot) {
            const armor = mercToFire.unequip('Armor');
            if (armor && sector) {
              sector.addToStash(armor);
              droppedEquipment.push(armor.equipmentName);
              dropAnimations.push(
                buildMapEquipmentAnimation(armor, sector.sectorId, 'outgoing', getMapCombatantId(mercToFire))
              );
            }
          }
          if (mercToFire.accessorySlot) {
            const accessory = mercToFire.unequip('Accessory');
            if (accessory && sector) {
              sector.addToStash(accessory);
              droppedEquipment.push(accessory.equipmentName);
              dropAnimations.push(
                buildMapEquipmentAnimation(accessory, sector.sectorId, 'outgoing', getMapCombatantId(mercToFire))
              );
            }
          }

          if (dropAnimations.length > 0) {
            emitMapEquipmentAnimations(game, dropAnimations);
          }

          // Move to discard - sectorId becomes undefined automatically via computed getter
          mercToFire.putInto(game.mercDiscard);
          if (sector) {
            emitMapCombatantDeaths(game, [
              buildMapCombatantEntry(mercToFire, sector.sectorId),
            ]);
          }
          if (droppedEquipment.length > 0) {
            game.message(`Fired ${mercToFire.combatantName}, dropped ${droppedEquipment.join(', ')} to stash`);
          } else {
            game.message(`Fired ${mercToFire.combatantName}`);
          }
        }
      }

      game.offerMercs(3, player.mercOffer);

      if (game.isRebelPlayer(ctx.player) && ctx.player.isBot) {
        game.recordRebelActionForBatching(ctx.player);
      }

      // New MERCs join the acting MERC's squad, so they arrive at the hiring sector
      player.hireSquadRef = (player.getSquadContaining(actingMerc) || player.primarySquad).name;
      return { success: true, message: 'Drew 3 MERCs for hiring', followUp: { action: 'hireMercFromOffer' } };
    });
}

/** The pick after hireMerc: hire any of the MERCs on offer, discard the rest. */
export function createHireMercFromOfferAction(game: MERCGame): ActionDefinition {
  return Action.create<MERCGame>('hireMercFromOffer')
    .prompt('Hire')
    .notUndoable() // Involves randomness (drawing equipment)
    .condition({
      'is rebel player': (ctx) => game.isRebelPlayer(ctx.player),
      // Not a follow-up arg: a step ended by combat drops the follow-up, and the hire must still finish
      'hire in progress': (ctx) => game.isRebelPlayer(ctx.player) && ctx.player.hireSquadRef != null &&
        ctx.player.mercOffer.count(CombatantModel) > 0,
    })
    .chooseFrom('selectedMercs', {
      prompt: 'Select MERCs to hire',
      // Rules: choose 0-3. Optional too, so a hire with every MERC disabled is still a legal move.
      optional: 'Hire no one',
      multiSelect: (ctx: ActionContext) => {
        const player = asRebelPlayer(ctx.player);
        return { min: 0, max: player.getTeamLimit(game) - player.teamSize };
      },
      choices: (ctx: ActionContext) => asRebelPlayer(ctx.player).mercOffer.all(CombatantModel)
        .map(m => capitalize(m.combatantName)),
      // MERC-s37: MERCs incompatible with the current team cannot be hired
      disabled: (value: string, ctx: ActionContext) => {
        const player = asRebelPlayer(ctx.player);
        const merc = player.mercOffer.all(CombatantModel).find(m => capitalize(m.combatantName) === value);
        return merc && !canHireMercWithTeam(merc.combatantId, player.team) ? 'Will not work with your team' : false;
      },
    })
    // Per rules: new hire draws 1 equipment from any deck (player chooses type)
    .chooseFrom('equipmentType', {
      prompt: 'Choose equipment type for new hire',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
    })
    .execute((args, ctx) => {
      const player = asRebelPlayer(ctx.player);
      const selectedNames = (args.selectedMercs as unknown as string[]) || [];
      const chosenEquipType = args.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
      const preferredSquad = player.squads.find(s => s.name === player.hireSquadRef);
      if (!preferredSquad) {
        return { success: false, error: 'No hire is in progress. Use Hire to draw MERCs first.' };
      }
      const otherSquad = preferredSquad === player.primarySquad ? player.secondarySquad : player.primarySquad;
      const teamLimit = player.getTeamLimit(game);
      const hired: string[] = [];

      for (const merc of player.mercOffer.all(CombatantModel)) {
        if (!selectedNames.includes(capitalize(merc.combatantName)) || player.teamSize >= teamLimit) continue;
        // Overflow to the other squad if the preferred one is full
        const targetSquad = !preferredSquad.isFull ? preferredSquad
          : !otherSquad.isFull ? otherSquad
          : null;
        if (!targetSquad) continue;

        // Merc inherits sectorId from squad via computed getter
        merc.putInto(targetSquad);
        if (targetSquad.sectorId) {
          emitMapCombatantEntries(game, [
            buildMapCombatantEntry(merc, targetSquad.sectorId),
          ]);
        }
        // Per rules (06-merc-actions.md): Newly hired MERCs start with 0 actions
        merc.actionsRemaining = 0;

        // Per rules (06-merc-actions.md lines 52-55): Draw 1 equipment from any deck (free)
        // Uses shared helper for Apeiron/Vrbansk ability handling
        equipNewHire(game, merc, chosenEquipType);

        hired.push(merc.combatantName);
      }
      game.discardMercOffer(player.mercOffer);
      player.hireSquadRef = undefined;

      if (hired.length > 0) {
        game.message(`${player.name} hired: ${hired.join(', ')}`);
        return { success: true, message: `Hired ${hired.length} MERC(s)`, data: { hired } };
      } else {
        game.message(`${player.name} hired no MERCs`);
        return { success: true, message: 'No MERCs hired' };
      }
    });
}

/**
 * Rebuild a wiped-out team.
 *
 * Rulebook p.3: "Your team always has at least one MERC as long as there are
 * still MERCs in the MERC deck to be hired. The first MERC in your team costs
 * you nothing." p.6: "If all your MERCs die you can hire new MERCs on your next
 * turn." A rebel with no MERCs has nobody to spend the normal hire action's two
 * actions, so this free action stands in for it — draw 3, take 1, no cost.
 */
export function createRehireMercAction(game: MERCGame): ActionDefinition {
  return Action.create<MERCGame>('rehireMerc')
    .prompt('Hire a replacement MERC (free)')
    .notUndoable() // Involves randomness (drawing MERCs)
    .condition({
      'not in combat': () => isNotInActiveCombat(game),
      'is rebel player': (ctx) => game.isRebelPlayer(ctx.player),
      // Day 1 is setup: rebels are still assembling their first team there.
      'past day one': () => game.currentDay > 1,
      'team is wiped out': (ctx) => {
        if (!game.isRebelPlayer(ctx.player)) return false;
        return asRebelPlayer(ctx.player).teamSize === 0;
      },
      'MERC deck has cards': () => game.mercDeck.count(CombatantModel) > 0,
    })
    // Rules (06-merc-actions.md, Placement): with no squad on the map, the hire goes to a sector you or an ally control
    .chooseElement('sector', {
      prompt: 'Choose a friendly sector for your replacement MERC',
      elements: () => getRebelControlledSectors(game),
      boardRef: (element) => ({ id: asSector(element).id }),
    })
    .execute((args, ctx) => {
      const player = asRebelPlayer(ctx.player);
      player.primarySquad.sectorId = asSector(args.sector).sectorId;
      game.offerMercs(3, player.mercOffer);
      return { success: true, message: 'Drew 3 MERCs for hiring', followUp: { action: 'rehireMercFromOffer' } };
    });
}

/** The pick after rehireMerc: take 1 of the MERCs on offer, discard the rest. */
export function createRehireMercFromOfferAction(game: MERCGame): ActionDefinition {
  return Action.create<MERCGame>('rehireMercFromOffer')
    .prompt('Hire a replacement MERC (free)')
    .notUndoable() // Involves randomness (drawing equipment)
    .condition({
      'is rebel player': (ctx) => game.isRebelPlayer(ctx.player),
      'team is wiped out': (ctx) => game.isRebelPlayer(ctx.player) && ctx.player.teamSize === 0,
      // An offer from a paid hire (team wiped before the pick) is that hire's to finish
      'no paid hire pending': (ctx) => game.isRebelPlayer(ctx.player) && ctx.player.hireSquadRef == null,
      'MERCs on offer': (ctx) => game.isRebelPlayer(ctx.player) && ctx.player.mercOffer.count(CombatantModel) > 0,
    })
    .chooseFrom('selectedMerc', {
      prompt: 'Choose your replacement MERC',
      choices: (ctx: ActionContext) => asRebelPlayer(ctx.player).mercOffer.all(CombatantModel)
        .map(m => capitalize(m.combatantName)),
    })
    .chooseFrom('equipmentType', {
      prompt: 'Choose equipment type for new hire',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
    })
    .execute((args, ctx) => {
      const player = asRebelPlayer(ctx.player);
      const chosenName = args.selectedMerc;
      const chosenEquipType = args.equipmentType as 'Weapon' | 'Armor' | 'Accessory';

      const hired = player.mercOffer.all(CombatantModel).find(m => capitalize(m.combatantName) === chosenName);
      if (!hired) {
        return { success: false, error: `${chosenName} is not among the MERCs on offer. Choose one of them.` };
      }

      hired.putInto(player.primarySquad);
      game.discardMercOffer(player.mercOffer);
      if (player.primarySquad.sectorId) {
        emitMapCombatantEntries(game, [
          buildMapCombatantEntry(hired, player.primarySquad.sectorId),
        ]);
      }
      // The replacement arrives ready to act: he was not hired with an action.
      hired.resetActions();
      equipNewHire(game, hired, chosenEquipType);

      if (game.isRebelPlayer(ctx.player) && ctx.player.isBot) {
        game.recordRebelActionForBatching(ctx.player);
      }

      game.message(`${player.name} rebuilds their team with ${capitalize(hired.combatantName)}`);
      return {
        success: true,
        message: `Hired ${capitalize(hired.combatantName)}`,
        data: { hired: hired.combatantName },
      };
    });
}

// =============================================================================
// Explore Action (simplified - just exploration, no equipment selection)
// Works for both rebel and dictator players.
// =============================================================================

// Type for units that can explore (mercs or dictator combatant)
// Using CombatantModel as it represents both merc and dictator combatants


// Helper to check if unit belongs to player (for explore action)
function isUnitOwnedForExplore(unit: CombatantModel, player: unknown, game: MERCGame): boolean {
  if (game.isRebelPlayer(player)) {
    if (!unit.isMerc) return false;
    return isInPlayerTeam(unit as CombatantModel, asRebelPlayer(player));
  }
  if (game.isDictatorPlayer(player)) {
    // Dictator combatant always belongs to dictator
    if (unit.isDictator) {
      return unit.inPlay && !unit.isDead;
    }
    const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
    return dictatorMercs.some(m => m.id === unit.id);
  }
  return false;
}

// Helper to check if unit can explore (in unexplored sector with actions)
function canUnitExplore(unit: CombatantModel, player: unknown, game: MERCGame): boolean {
  if (unit.actionsRemaining < ACTION_COSTS.EXPLORE) return false;
  if (unit.isDictator && (!unit.inPlay || unit.isDead)) return false;
  const sector = findUnitSector(unit, player, game);
  return sector !== null && !sector.explored;
}

// Helper to get living units for any player type (for explore action)
// Returns mercs + dictator combatant if applicable
function getPlayerUnitsForExplore(player: unknown, game: MERCGame): CombatantModel[] {
  if (game.isRebelPlayer(player)) {
    return asRebelPlayer(player).team.filter(m => !m.isDead);
  }
  if (game.isDictatorPlayer(player)) {
    const units: CombatantModel[] = game.dictatorPlayer?.hiredMercs.filter(m => !m.isDead) || [];
    // Include dictator combatant if in play
    const dictatorCard = game.dictatorPlayer?.dictator;
    if (dictatorCard?.inPlay && !dictatorCard.isDead) {
      units.push(dictatorCard);
    }
    return units;
  }
  return [];
}


/**
 * Explore the current sector to discover loot.
 * Cost: 1 action
 * Works for both rebel and dictator players.
 *
 * This action only handles exploration - selecting MERC, spending action,
 * drawing equipment to stash, and marking sector explored.
 * Equipment collection is done via the separate 'collectEquipment' action
 * so the UI updates immediately after exploration.
 */
export function createExploreAction(game: MERCGame): ActionDefinition {
  return Action.create<MERCGame>('explore')
    .prompt('Explore')
    .notUndoable() // Involves randomness (drawing equipment)
    .condition({
      'not in combat': () => isNotInActiveCombat(game),
      'is rebel or dictator player': (ctx) => game.isRebelPlayer(ctx.player) || game.isDictatorPlayer(ctx.player),
      'has unit that can explore': (ctx) => {
        const livingUnits = getPlayerUnitsForExplore(ctx.player, game);
        return livingUnits.some(u => canUnitExplore(u, ctx.player, game));
      },
      'bot batch gate': (ctx) => !game.shouldGateBotAction(ctx.player as MERCPlayer),
    })
    .chooseElement('actingUnit', {
      prompt: 'Which unit explores?',
      elementClass: CombatantModel,
      display: (unit) => capitalize(getUnitName(unit)),
      filter: (element, ctx) => {
        const units = getPlayerUnitsForExplore(ctx.player, game);
        return units.some(u => u.id === element.id) && canUnitExplore(element as CombatantModel, ctx.player, game);
      },
    })
    .execute((args, ctx) => {
      // Get the unit directly from chooseElement
      const actingUnit = args.actingUnit;

      if (!actingUnit) {
        return { success: false, error: 'Unit not found' };
      }

      // Find the sector
      const sector = findUnitSector(actingUnit, ctx.player, game);
      if (!sector) {
        return { success: false, error: 'No sector found' };
      }

      // Spend action with validation (works for both merc and dictator combatants)
      if (actingUnit.actionsRemaining < ACTION_COSTS.EXPLORE) {
        return { success: false, error: 'Not enough actions to explore' };
      }
      actingUnit.actionsRemaining -= ACTION_COSTS.EXPLORE;

      if (game.isRebelPlayer(ctx.player) && ctx.player.isBot) {
        game.recordRebelActionForBatching(ctx.player);
      }

      // Draw equipment to stash
      for (let i = 0; i < sector.weaponLoot; i++) {
        const weapon = game.drawEquipment('Weapon');
        if (weapon) sector.addToStash(weapon);
      }
      for (let i = 0; i < sector.armorLoot; i++) {
        const armor = game.drawEquipment('Armor');
        if (armor) sector.addToStash(armor);
      }
      for (let i = 0; i < sector.accessoryLoot; i++) {
        const accessory = game.drawEquipment('Accessory');
        if (accessory) sector.addToStash(accessory);
      }
      // Get unit name for messages
      const unitName = getUnitName(actingUnit);

      // Animate the sector flip, then mark explored inside callback
      game.animate('sector-explore', {
        sectors: [{ sectorId: sector.sectorId, sectorName: sector.sectorName }],
      }, () => {
        sector.explore();
      });

      // Report exploration (don't reveal items - competitors can read the log)
      game.message(`${capitalize(unitName)} explored ${sector.sectorName}`);

      if (sector.stashCount > 0) {
        // Open equip spectator session immediately so other players see the panel
        // before the active player starts choosing equipment
        const playerName = (ctx.player as { name?: string }).name;
        emitEquipSessionStart(game, actingUnit, playerName);

        // Chain to collectEquipment action with pre-filled args
        // Use display option for friendly chip names while keeping IDs for lookup
        return {
          success: true,
          message: `Explored ${sector.sectorName}`,
          followUp: {
            action: 'collectEquipment',
            args: {
              combatantId: actingUnit.id,
              sectorId: sector.id,
            },
            display: {
              combatantId: capitalize(unitName),
              sectorId: sector.sectorName,
            },
          },
        };
      } else {
        // No additional message needed - exploration message already sent above
        return {
          success: true,
          message: `Explored ${sector.sectorName}`,
        };
      }
    });
}

// =============================================================================
// Collect Equipment Action (chained from explore via followUp)
// =============================================================================

/**
 * Collect equipment from a sector stash.
 * Cost: 0 actions (free)
 *
 * This action is chained from explore via followUp. It receives pre-filled
 * combatant and sector args so the player doesn't need to re-select the merc.
 * The UI updates after exploration completes (showing stash contents) before
 * this action starts.
 *
 * Note: No condition() - this action is only triggered via followUp from explore.
 * The followUp mechanism handles when it runs.
 */
/**
 * Collect equipment from the sector stash (one item at a time).
 * Chains via followUp if more items remain in stash.
 * This is simpler than using repeat which has issues with followUp actions.
 */
// Type for units that can collect equipment (mercs or dictator combatant)
// Using CombatantModel as it represents both merc and dictator combatants

export function createCollectEquipmentAction(game: MERCGame): ActionDefinition {
  // Helper to resolve sector from ctx.args (sectorId is numeric element ID)
  function getSector(ctx: { args?: Record<string, unknown> }): Sector | undefined {
    const sectorArg = ctx.args?.sectorId;
    let element: ReturnType<typeof game.getElementById> | undefined;
    if (typeof sectorArg === 'number') {
      element = game.getElementById(sectorArg);
    } else if (sectorArg && typeof sectorArg === 'object' && 'id' in sectorArg) {
      element = game.getElementById((sectorArg as { id: number }).id);
    }
    return element instanceof Sector ? element : undefined;
  }

  // Helper to resolve unit from ctx.args (combatantId is numeric element ID)
  // Handles both merc and dictator combatants
  function getUnit(ctx: { args?: Record<string, unknown> }): CombatantModel | undefined {
    const combatantArg = ctx.args?.combatantId;
    let id: number | undefined;
    if (typeof combatantArg === 'number') {
      id = combatantArg;
    } else if (combatantArg && typeof combatantArg === 'object' && 'id' in combatantArg) {
      id = (combatantArg as { id: number }).id;
    }
    if (id === undefined) return undefined;

    const element = game.getElementById(id);
    if (isCombatantModel(element)) {
      return element;
    }
    return undefined;
  }

  return Action.create<MERCGame>('collectEquipment')
    .followUpArgs<{ combatantId?: number; sectorId?: number }>()
    .prompt('Take from stash')
    .condition({
      'triggered via followUp from explore': (ctx) => ctx.args?.sectorId != null,
    })
    .chooseElement('equipment', {
      prompt: 'Select equipment to take (or skip)',
      display: (equip) => `${equip.equipmentName} (${equip.equipmentType})`,
      optional: true,
      elementClass: Equipment,
      filter: (element, ctx) => {
        if (!(element instanceof Equipment)) return false;
        const sector = getSector(ctx);
        if (!sector) return false;
        return sector.stash.some(e => e.id === element.id);
      },
      // MERC-70a: Show grenades/mortars as disabled for Apeiron
      disabled: (element, ctx) => {
        const unit = getUnit(ctx);
        if (unit?.isMerc && unit.combatantId === 'apeiron' && isGrenadeOrMortar(element as Equipment)) {
          return 'Apeiron cannot use explosives';
        }
        return false;
      },
    })
    .execute((args, ctx) => {
      const unit = getUnit(ctx);
      const sector = getSector(ctx);
      const equipment = args.equipment instanceof Equipment ? args.equipment : null;

      if (!unit || !sector) {
        return { success: false, error: 'Invalid unit or sector' };
      }

      const unitName = getUnitName(unit);

      // User chose "Done collecting"
      if (!equipment) {
        emitEquipSessionEnd(game, unit.combatantId);
        if (sector.stashCount > 0) {
          const remaining = sector.stash.map(e => e.equipmentName).join(', ');
          game.message(`Left in stash: ${remaining}`);
        }
        return { success: true, message: 'Done collecting equipment' };
      }

      // Refresh equip spectator session (idempotent — already opened by explore)
      const playerName = (ctx.player as { name?: string }).name;
      emitEquipSessionStart(game, unit, playerName);

      // Equip the item
      const { replaced, displacedBandolierItems } = equipWithSpectatorEvent(game, unit, equipment);
      const equipmentAnimations = [
        buildMapEquipmentAnimation(equipment, sector.sectorId, 'incoming', getMapCombatantId(unit)),
      ];

      if (replaced) {
        sector.addToStash(replaced);
        equipmentAnimations.push(
          buildMapEquipmentAnimation(replaced, sector.sectorId, 'outgoing', getMapCombatantId(unit))
        );
        game.message(`${capitalize(unitName)} equipped ${equipment.equipmentName}`);
      } else {
        game.message(`${capitalize(unitName)} equipped ${equipment.equipmentName}`);
      }
      for (const item of displacedBandolierItems) {
        if (sector.addToStash(item)) {
          equipmentAnimations.push(
            buildMapEquipmentAnimation(item, sector.sectorId, 'outgoing', getMapCombatantId(unit))
          );
        } else {
          const discard = game.getEquipmentDiscard(item.equipmentType);
          if (discard) item.putInto(discard);
        }
      }

      emitMapEquipmentAnimations(game, equipmentAnimations);

      // Chain back to collectEquipment if stash still has items — session stays open
      if (sector.stashCount > 0) {
        return {
          success: true,
          message: `Equipped ${equipment.equipmentName}`,
          followUp: {
            action: 'collectEquipment',
            // Pass PLAIN numeric element IDs (not ctx.args, which the engine has
            // resolved into full CombatantModel/Sector objects by execute time).
            // On the platform/iframe path these followUp args are sent to the host
            // via postMessage, whose structured clone CANNOT serialize game-element
            // objects (DataCloneError) — which silently broke the chained pick and
            // collapsed the collect flow. Mirrors how explore seeds these args.
            args: {
              combatantId: unit.id,
              sectorId: sector.id,
            },
            display: {
              combatantId: capitalize(unitName),
              sectorId: sector.sectorName,
            },
          },
        };
      }

      // No more items — close session
      emitEquipSessionEnd(game, unit.combatantId);
      return { success: true, message: `Equipped ${equipment.equipmentName}` };
    });
}

// =============================================================================
// Train Action
// Works for both rebel and dictator players.
// =============================================================================

// Type for units that can train (mercs or dictator combatant)
// Using CombatantModel as it represents both merc and dictator combatants

// Helper to check if unit can train (training > 0, has actions, sector not at max militia)
function canUnitTrain(unit: CombatantModel, player: unknown, game: MERCGame): boolean {
  if (unit.training <= 0) return false;
  if (unit.actionsRemaining < ACTION_COSTS.TRAIN) return false;
  if (unit.isDictator && (!unit.inPlay || unit.isDead)) return false;

  const sector = findUnitSector(unit, player, game);
  if (!sector) return false;

  // Check max militia for this side
  if (game.isRebelPlayer(player)) {
    return sector.getTotalRebelMilitia() < SectorConstants.MAX_MILITIA_PER_SIDE;
  }
  if (game.isDictatorPlayer(player)) {
    // Kim's base allows 20 militia instead of 10
    const isKimBase = game.dictatorPlayer?.dictator?.combatantId === 'kim' &&
                      sector.sectorId === game.dictatorPlayer?.baseSectorId;
    const maxMilitia = isKimBase
      ? SectorConstants.KIM_BASE_MAX_MILITIA
      : SectorConstants.MAX_MILITIA_PER_SIDE;
    return sector.dictatorMilitia < maxMilitia;
  }
  return false;
}

// Helper to get living units for any player type (for train action)
// Returns mercs + dictator combatant if applicable
function getPlayerUnitsForTrain(player: unknown, game: MERCGame): CombatantModel[] {
  if (game.isRebelPlayer(player)) {
    return asRebelPlayer(player).team.filter(m => !m.isDead);
  }
  if (game.isDictatorPlayer(player)) {
    const units: CombatantModel[] = game.dictatorPlayer?.hiredMercs.filter(m => !m.isDead) || [];
    // Include dictator combatant if in play
    const dictatorCard = game.dictatorPlayer?.dictator;
    if (dictatorCard?.inPlay && !dictatorCard.isDead) {
      units.push(dictatorCard);
    }
    return units;
  }
  return [];
}


/**
 * Train militia in the current sector
 * Cost: 1 action, trains militia equal to MERC's training stat
 * Works for both rebel and dictator players.
 */
export function createTrainAction(game: MERCGame): ActionDefinition {
  return Action.create<MERCGame>('train')
    .prompt('Train')
    .condition({
      'not in combat': () => isNotInActiveCombat(game),
      'is rebel or dictator player': (ctx) => game.isRebelPlayer(ctx.player) || game.isDictatorPlayer(ctx.player),
      'has unit that can train': (ctx) => {
        const livingUnits = getPlayerUnitsForTrain(ctx.player, game);
        return livingUnits.some(u => canUnitTrain(u, ctx.player, game));
      },
      'bot batch gate': (ctx) => !game.shouldGateBotAction(ctx.player as MERCPlayer),
    })
    .chooseFrom('unit', {
      prompt: 'Select unit to train militia',
      choices: (ctx: ActionContext) => {
        const units = getPlayerUnitsForTrain(ctx.player, game);
        return units
          .filter(u => canUnitTrain(u, ctx.player, game))
          .map(u => `${u.id}:${getUnitName(u)}:${u.isDictator}`);
      },
      display: (value: string) => {
        const [, name] = value.split(':');
        return capitalize(name);
      },
    })
    .execute((args, ctx) => {
      const unitChoiceStr = args.unit;

      // Parse string format: "id:name:isDictator"
      const [idStr, , isDictatorStr] = unitChoiceStr.split(':');
      const unitId = parseInt(idStr, 10);
      const isUnitDictator = isDictatorStr === 'true';

      // Find the actual unit (same pattern as explore action)
      let actingUnit: CombatantModel | null = null;
      if (isUnitDictator) {
        actingUnit = game.dictatorPlayer?.dictator || null;
      } else {
        actingUnit = game.all(CombatantModel).filter(c => c.isMerc).find(m => m.id === unitId) || null;
      }

      if (!actingUnit) {
        game.message('Error: Unit not found for train action');
        return { success: false, error: 'Unit not found' };
      }

      const sector = findUnitSector(actingUnit, ctx.player, game);
      if (!sector) {
        game.message('Error: No sector found for train action');
        return { success: false, error: 'No sector found' };
      }

      // Spend action - MERC-bd4: Faustina uses training action first (only for merc combatants)
      if (actingUnit.isDictator) {
        actingUnit.actionsRemaining -= ACTION_COSTS.TRAIN;
      } else {
        useTrainingAction(actingUnit as CombatantModel, ACTION_COSTS.TRAIN);
      }

      if (game.isRebelPlayer(ctx.player) && ctx.player.isBot) {
        game.recordRebelActionForBatching(ctx.player);
      }

      // Get unit name for messages
      const unitName = getUnitName(actingUnit);

      // Train militia - amount depends on player type
      let trained: number;
      const isDictator = game.isDictatorPlayer(ctx.player);
      if (game.isRebelPlayer(ctx.player)) {
        const player = asRebelPlayer(ctx.player);
        const startValue = sector.getRebelMilitia(`${player.seat}`);
        trained = sector.addRebelMilitia(`${player.seat}`, actingUnit.training);
        game.message(`${unitName} trained ${trained} militia at ${sector.sectorName}`);

        if (trained > 0) {
          emitMapMilitiaTrain(game, [{ sectorId: sector.sectorId, count: trained, isDictator: false, playerId: `${player.seat}`, startValue }]);
        }

        // Check if dictator has units at this sector and trigger combat
        if (sector.dictatorMilitia > 0) {
          game.message(`Dictator militia detected at ${sector.sectorName} - combat begins!`);
          queuePendingCombat(game, sector, player, true);
          return {
            success: true,
            message: `Trained ${trained} militia and engaged in combat`,
            data: {
              combatTriggered: true,
              combatQueued: true,
            },
          };
        }
      } else if (isDictator) {
        // Kim's base allows 20 militia instead of 10
        const isKimBase = game.dictatorPlayer?.dictator?.combatantId === 'kim' &&
                          sector.sectorId === game.dictatorPlayer?.baseSectorId;
        const startValue = sector.dictatorMilitia;
        trained = sector.addDictatorMilitia(actingUnit.training, isKimBase);
        game.message(`${unitName} trained ${trained} militia at ${sector.sectorName}`);

        if (trained > 0) {
          emitMapMilitiaTrain(game, [{ sectorId: sector.sectorId, count: trained, isDictator: true, startValue }]);
        }

        // Check if any rebel has units at this sector and trigger combat
        for (const rebel of game.rebelPlayers) {
          const hasSquad = rebel.primarySquad.sectorId === sector.sectorId ||
            rebel.secondarySquad.sectorId === sector.sectorId;
          const hasMilitia = sector.getRebelMilitia(`${rebel.seat}`) > 0;

          if (hasSquad || hasMilitia) {
            game.message(`Rebels detected at ${sector.sectorName} - combat begins!`);
            queuePendingCombat(game, sector, rebel, false);
            return {
              success: true,
              message: `Trained ${trained} militia and engaged in combat`,
              data: {
                combatTriggered: true,
                combatQueued: true,
              },
            };
          }
        }
      } else {
        return { success: false, error: 'Unknown player type' };
      }

      return { success: true, message: `Trained ${trained} militia` };
    });
}

// =============================================================================
// Hospital Action
// Works for both rebel and dictator players.
// =============================================================================

// Type for units that can use city facilities (mercs or dictator combatant)
// Using CombatantModel as it represents both merc and dictator combatants

// Helper to get living units that are in the given city sector
// Only returns units physically present in the sector
function getPlayerUnitsInSector(player: unknown, game: MERCGame, sector: Sector): CombatantModel[] {
  if (game.isRebelPlayer(player)) {
    return game.getMercsInSector(sector, asRebelPlayer(player)).filter(m => !m.isDead);
  }
  if (game.isDictatorPlayer(player)) {
    const units: CombatantModel[] = game.getDictatorMercsInSector(sector);
    // Include dictator combatant if in play and at this sector
    const dictatorCard = game.dictatorPlayer?.dictator;
    if (dictatorCard?.inPlay && !dictatorCard.isDead &&
        game.dictatorPlayer?.baseSectorId === sector.sectorId) {
      units.push(dictatorCard);
    }
    return units;
  }
  return [];
}


// Helper to find a city sector where the player has units
// Checks all squads, returns the first city sector found
function findCitySectorForPlayer(player: unknown, game: MERCGame): Sector | null {
  if (game.isRebelPlayer(player)) {
    const rebelPlayer = asRebelPlayer(player);
    for (const squad of [rebelPlayer.primarySquad, rebelPlayer.secondarySquad]) {
      if (squad?.sectorId) {
        const sector = game.getSector(squad.sectorId);
        if (sector?.isCity) return sector;
      }
    }
  }
  if (game.isDictatorPlayer(player) && game.dictatorPlayer) {
    const mercs = game.dictatorPlayer.hiredMercs.filter(m => !m.isDead);
    for (const merc of mercs) {
      const squad = game.dictatorPlayer.getSquadContaining(merc);
      if (squad?.sectorId) {
        const sector = game.getSector(squad.sectorId);
        if (sector?.isCity) return sector;
      }
    }
    // Check dictator combatant's base sector
    const dictatorCard = game.dictatorPlayer.dictator;
    if (dictatorCard?.inPlay && !dictatorCard.isDead && game.dictatorPlayer.baseSectorId) {
      const sector = game.getSector(game.dictatorPlayer.baseSectorId);
      if (sector?.isCity) return sector;
    }
  }
  return null;
}

/**
 * Use hospital in a city sector
 * Cost: 1 action, fully heals unit
 * Works for both mercs and dictator combatants.
 */
export function createHospitalAction(game: MERCGame): ActionDefinition {
  return Action.create<MERCGame>('hospital')
    .prompt('Visit hospital')
    .condition({
      'not in combat': () => isNotInActiveCombat(game),
      'is rebel or dictator player': (ctx) => game.isRebelPlayer(ctx.player) || game.isDictatorPlayer(ctx.player),
      'in sector with hospital': (ctx) => {
        const sector = findCitySectorForPlayer(ctx.player, game);
        return !!sector?.hasHospital;
      },
      'bot batch gate': (ctx) => !game.shouldGateBotAction(ctx.player as MERCPlayer),
      'has damaged unit with actions': (ctx) => {
        const sector = findCitySectorForPlayer(ctx.player, game);
        if (!sector) return false;
        const units = getPlayerUnitsInSector(ctx.player, game, sector);
        return units.some(u => u.damage > 0 && u.actionsRemaining >= ACTION_COSTS.HOSPITAL);
      },
    })
    .chooseFrom('actingUnit', {
      prompt: 'Select unit to heal',
      choices: (ctx: ActionContext) => {
        const sector = findCitySectorForPlayer(ctx.player, game);
        if (!sector) return [];
        const units = getPlayerUnitsInSector(ctx.player, game, sector);
        return units
          .filter(u => u.damage > 0 && u.actionsRemaining >= ACTION_COSTS.HOSPITAL)
          .map(u => `${u.id}:${getUnitName(u)}:${u.isDictator}`);
      },
      display: (value: string) => {
        const [, name] = value.split(':');
        return capitalize(name);
      },
    })
    .execute((args, ctx) => {
      const unitChoiceStr = args.actingUnit;

      // Parse string format: "id:name:isDictator"
      const parts = unitChoiceStr.split(':');
      const unitId = parseInt(parts[0], 10);
      const isUnitDictator = parts[parts.length - 1] === 'true';

      // Find the actual unit
      let actingUnit: CombatantModel | null = null;
      if (isUnitDictator) {
        actingUnit = game.dictatorPlayer?.dictator || null;
      } else {
        actingUnit = game.all(CombatantModel).filter(c => c.isMerc).find(m => m.id === unitId) || null;
      }

      if (!actingUnit) {
        return { success: false, error: 'Unit not found' };
      }

      // Spend action
      if (actingUnit.actionsRemaining < ACTION_COSTS.HOSPITAL) {
        return { success: false, error: 'Not enough actions' };
      }
      actingUnit.actionsRemaining -= ACTION_COSTS.HOSPITAL;

      if (game.isRebelPlayer(ctx.player) && ctx.player.isBot) {
        game.recordRebelActionForBatching(ctx.player);
      }

      const healedAmount = actingUnit.damage;
      actingUnit.fullHeal();
      const unitName = getUnitName(actingUnit);
      game.message(`${unitName} was fully healed at the hospital (restored ${healedAmount} health)`);

      return { success: true, message: `Healed ${unitName}` };
    });
}

// =============================================================================
// Arms Dealer Action
// Works for both rebel and dictator players.
// =============================================================================

/**
 * Use arms dealer in a city sector
 * Cost: 1 action, draw equipment into the sector stash
 * MERC-dh5: Chains to armsDealerEquip for the free re-equip per rules
 * Works for both mercs and dictator combatants.
 */
// Settings key for the item each player just bought, so only it gets the free re-equip
const ARMS_DEALER_BOUGHT_KEY = 'armsDealerBought';

export function createArmsDealerAction(game: MERCGame): ActionDefinition {

  return Action.create<MERCGame>('armsDealer')
    .prompt('Visit arms dealer')
    .notUndoable() // Involves randomness (drawing equipment)
    .condition({
      'not in combat': () => isNotInActiveCombat(game),
      'is rebel or dictator player': (ctx) => game.isRebelPlayer(ctx.player) || game.isDictatorPlayer(ctx.player),
      'in sector with arms dealer': (ctx) => {
        const sector = findCitySectorForPlayer(ctx.player, game);
        return !!sector?.hasArmsDealer;
      },
      'bot batch gate': (ctx) => !game.shouldGateBotAction(ctx.player as MERCPlayer),
      'has unit with actions': (ctx) => {
        const sector = findCitySectorForPlayer(ctx.player, game);
        if (!sector) return false;
        const units = getPlayerUnitsInSector(ctx.player, game, sector);
        return units.some(u => u.actionsRemaining >= ACTION_COSTS.ARMS_DEALER);
      },
      'dealer has equipment to sell': () => dealerTypesInStock(game).length > 0,
    })
    .chooseFrom('actingUnit', {
      prompt: 'Which unit visits the dealer?',
      choices: (ctx: ActionContext) => {
        const sector = findCitySectorForPlayer(ctx.player, game);
        if (!sector) return [];
        const units = getPlayerUnitsInSector(ctx.player, game, sector);
        return units
          .filter(u => u.actionsRemaining >= ACTION_COSTS.ARMS_DEALER)
          .map(u => `${u.id}:${getUnitName(u)}:${u.isDictator}`);
      },
      display: (value: string) => {
        const [, name] = value.split(':');
        return capitalize(name);
      },
    })
    .chooseFrom('equipmentType', {
      prompt: 'What type of equipment?',
      choices: () => dealerTypesInStock(game),
    })
    .execute((args, ctx) => {
      const sector = findCitySectorForPlayer(ctx.player, game);
      const actingUnit = findArmsDealerUnit(game, args.actingUnit);

      if (!actingUnit || !sector) {
        return { success: false, error: 'Unit not found' };
      }

      // Spend action
      if (actingUnit.actionsRemaining < ACTION_COSTS.ARMS_DEALER) {
        return { success: false, error: 'Not enough actions' };
      }

      const equipmentType = args.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
      const equipment = game.drawEquipment(equipmentType);
      if (!equipment) {
        return { success: false, error: `The ${equipmentType} deck and discard are empty, so the dealer has nothing to sell. Choose another type.` };
      }

      actingUnit.actionsRemaining -= ACTION_COSTS.ARMS_DEALER;

      if (game.isRebelPlayer(ctx.player) && ctx.player.isBot) {
        game.recordRebelActionForBatching(ctx.player);
      }

      const actingUnitName = getUnitName(actingUnit);
      if (sector.addToStash(equipment)) {
        emitMapEquipmentAnimations(game, [
          buildMapEquipmentAnimation(equipment, sector.sectorId, 'incoming'),
        ]);
        game.message(`${actingUnitName} bought ${equipment.equipmentName} (added to ${sector.sectorName} stash)`);
      } else {
        game.message(`${actingUnitName} bought ${equipment.equipmentName} but couldn't stash it (damaged?)`);
      }

      setCachedValue(game, ARMS_DEALER_BOUGHT_KEY, `${(ctx.player as MERCPlayer).seat}`, equipment.id);

      return {
        success: true,
        message: `Bought ${equipment.equipmentName}`,
        followUp: {
          action: 'armsDealerEquip',
          args: { equipmentId: equipment.id },
          display: { equipmentId: equipment.equipmentName },
        },
      };
    });
}

/** The equipment types the dealer can sell: a draw reshuffles the discard, so either pile counts. */
function dealerTypesInStock(game: MERCGame): EquipmentType[] {
  return (['Weapon', 'Armor', 'Accessory'] as const).filter(type =>
    game.getEquipmentDeck(type)!.count(Equipment) + game.getEquipmentDiscard(type)!.count(Equipment) > 0);
}

/** Parse an arms dealer unit choice ("id:name:isDictator") back to its unit. */
function findArmsDealerUnit(game: MERCGame, choice: string): CombatantModel | null {
  const parts = choice.split(':');
  if (parts[parts.length - 1] === 'true') {
    return game.dictatorPlayer?.dictator || null;
  }
  const unitId = parseInt(parts[0], 10);
  return game.all(CombatantModel).filter(c => c.isMerc).find(m => m.id === unitId) || null;
}

/**
 * MERC-dh5: Free re-equip of the item just bought (chained from armsDealer via followUp).
 * Skipping leaves it in the sector stash.
 */
export function createArmsDealerEquipAction(game: MERCGame): ActionDefinition {
  function getBought(ctx: { args?: Record<string, unknown> }): Equipment | undefined {
    const element = game.getElementById(ctx.args?.equipmentId as number);
    return element instanceof Equipment ? element : undefined;
  }

  return Action.create<MERCGame>('armsDealerEquip')
    .followUpArgs<{ equipmentId?: number }>()
    .prompt('Free Re-Equip')
    .condition({
      'equipment just bought': (ctx) => ctx.args?.equipmentId != null &&
        ctx.args.equipmentId === getCachedValue<number>(game, ARMS_DEALER_BOUGHT_KEY, `${(ctx.player as MERCPlayer).seat}`),
    })
    .chooseFrom('equipUnit', {
      prompt: 'Free Re-Equip: Which unit should equip this item? (or skip)',
      choices: (ctx: ActionContext) => {
        // Only units in the city sector can receive equipment
        const sector = findCitySectorForPlayer(ctx.player, game);
        const playerUnits = sector ? getPlayerUnitsInSector(ctx.player, game, sector) : [];

        const choices = playerUnits.map(u => `${u.id}:${getUnitName(u)}:${u.isDictator}`);
        choices.push('skip');
        return choices;
      },
      display: (value: string) => {
        if (value === 'skip') return 'Skip (add to stash)';
        const [, name] = value.split(':');
        return capitalize(name);
      },
      // MERC-70a: Show Apeiron as disabled when equipment is a grenade/mortar
      disabled: (value, ctx) => {
        if (value === 'skip') return false;
        const unit = findArmsDealerUnit(game, value);
        // Only check Apeiron (who is always a merc, not dictator)
        if (!unit?.isMerc || unit.combatantId !== 'apeiron') return false;

        const bought = getBought(ctx);
        if (bought && isGrenadeOrMortar(bought)) {
          return 'Apeiron cannot use explosives';
        }
        return false;
      },
    })
    .execute((args, ctx) => {
      const equipment = getBought(ctx);
      const sector = findCitySectorForPlayer(ctx.player, game);
      if (!equipment || !sector) {
        return { success: false, error: 'The bought equipment or the city sector could not be found.' };
      }
      clearCachedValue(game, ARMS_DEALER_BOUGHT_KEY, `${(ctx.player as MERCPlayer).seat}`);

      const targetUnit = args.equipUnit === 'skip' ? null : findArmsDealerUnit(game, args.equipUnit);
      if (!targetUnit) {
        return { success: true, message: `Kept ${equipment.equipmentName} in the stash` };
      }

      const { replaced, displacedBandolierItems } = targetUnit.equip(equipment);
      const equipmentAnimations = [
        buildMapEquipmentAnimation(equipment, sector.sectorId, 'incoming', getMapCombatantId(targetUnit)),
      ];
      if (replaced) {
        sector.addToStash(replaced);
        equipmentAnimations.push(
          buildMapEquipmentAnimation(replaced, sector.sectorId, 'outgoing', getMapCombatantId(targetUnit))
        );
      }
      game.message(`${getUnitName(targetUnit)} equipped ${equipment.equipmentName}`);
      for (const item of displacedBandolierItems) {
        if (sector.addToStash(item)) {
          equipmentAnimations.push(
            buildMapEquipmentAnimation(item, sector.sectorId, 'outgoing', getMapCombatantId(targetUnit))
          );
        } else {
          const discard = game.getEquipmentDiscard(item.equipmentType);
          if (discard) item.putInto(discard);
        }
      }
      emitMapEquipmentAnimations(game, equipmentAnimations);
      return { success: true, message: `Bought and equipped ${equipment.equipmentName}` };
    });
}

// =============================================================================
// End Turn Action
// =============================================================================

/**
 * End the current turn
 * Clears all remaining actions from player's MERCs
 * Works for both rebel and dictator players.
 */
export function createEndTurnAction(game: MERCGame): ActionDefinition {
  return Action.create<MERCGame>('endTurn')
    .prompt('End turn')
    .condition({
      'not in combat': () => isNotInActiveCombat(game),
      'day 2 or later': () => game.currentDay >= 2,
      'is rebel or dictator player': (ctx) => game.isRebelPlayer(ctx.player) || game.isDictatorPlayer(ctx.player),
      'bot batch gate': (ctx) => !game.shouldGateBotAction(ctx.player as MERCPlayer),
    })
    .chooseFrom('confirm', {
      prompt: 'End your turn?',
      choices: ['Yes, end turn'],
    })
    .execute((args, ctx) => {
      if (game.isRebelPlayer(ctx.player)) {
        const player = asRebelPlayer(ctx.player);
        // Clear all remaining actions from player's MERCs
        for (const merc of player.team) {
          merc.actionsRemaining = 0;
        }
        game.message(`${player.name} ends their turn`);

        if (game.isRebelPlayer(ctx.player) && ctx.player.isBot) {
          game.recordRebelActionForBatching(ctx.player);
        }
      } else if (game.isDictatorPlayer(ctx.player)) {
        // Clear all remaining actions from dictator MERCs
        const mercs = game.dictatorPlayer?.hiredMercs || [];
        for (const merc of mercs) {
          merc.actionsRemaining = 0;
        }
        if (game.dictatorPlayer?.dictator?.inPlay) {
          game.dictatorPlayer.dictator.actionsRemaining = 0;
        }
        game.message('Dictator ends their turn');
      }

      return { success: true, message: 'Turn ended', data: { endTurn: true } };
    });
}

// =============================================================================
// View Stash Action
// =============================================================================

/**
 * View equipment in a sector's stash.
 * Cost: 0 actions (free, information only)
 * Available when player has a squad/unit in an explored sector with stash contents.
 * Works for both rebel and dictator players.
 */
export function createViewStashAction(game: MERCGame): ActionDefinition {
  // Helper to check if a sector has viewable stash
  const canViewSector = (sectorId: string | undefined): boolean => {
    if (!sectorId) return false;
    const sector = game.getSector(sectorId);
    return !!(sector && sector.explored && sector.stash.length > 0);
  };

  // Helper to get sectors with stash for a player
  const getSectorsWithStash = (ctx: { player: unknown }): string[] => {
    const choices: string[] = [];
    const addIfHasStash = (sectorId: string | undefined) => {
      if (sectorId && canViewSector(sectorId) && !choices.includes(sectorId)) {
        choices.push(sectorId);
      }
    };

    if (game.isRebelPlayer(ctx.player)) {
      const player = asRebelPlayer(ctx.player);
      addIfHasStash(player.primarySquad?.sectorId);
      addIfHasStash(player.secondarySquad?.sectorId);
    }

    if (game.isDictatorPlayer(ctx.player) && game.dictatorPlayer) {
      addIfHasStash(game.dictatorPlayer.primarySquad?.sectorId);
      addIfHasStash(game.dictatorPlayer.secondarySquad?.sectorId);
      // Also check dictator combatant location
      const dictator = game.dictatorPlayer.dictator;
      if (dictator?.inPlay && dictator.sectorId) {
        addIfHasStash(dictator.sectorId);
      }
    }

    return choices;
  };

  return Action.create<MERCGame>('viewStash')
    .prompt('View sector stash')
    .condition({
      'is rebel or dictator player': (ctx) => game.isRebelPlayer(ctx.player) || game.isDictatorPlayer(ctx.player),
      'has accessible stash': (ctx) => getSectorsWithStash(ctx).length > 0,
    })
    .chooseFrom('sector', {
      prompt: 'Which sector stash to view?',
      choices: (ctx) => getSectorsWithStash(ctx),
      display: (sectorId) => {
        const sector = game.getSector(sectorId);
        return sector ? `${sector.sectorName} (${sector.stash.length} items)` : sectorId;
      },
    })
    .execute((args) => {
      const sectorId = args.sector;
      const sector = game.getSector(sectorId);

      if (!sector) {
        return { success: false, error: 'Sector not found' };
      }

      // Return the stash contents as data for the UI to display
      const stashItems = sector.stash.map(e => ({
        equipmentName: e.equipmentName,
        equipmentType: e.equipmentType,
        id: e.id,
      }));

      return {
        success: true,
        message: `Viewing stash in ${sector.sectorName}`,
        data: {
          sectorId: sector.sectorId,
          sectorName: sector.sectorName,
          stash: stashItems,
        },
      };
    });
}
