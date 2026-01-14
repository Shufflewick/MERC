/**
 * Rebel Economy Actions
 *
 * MERC economy-related actions: hiring, exploring, training, trading, and facilities.
 */

import { Action, type ActionDefinition } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer } from '../game.js';
import { MercCard, Sector, Equipment, Squad, DictatorCard, CombatantModel } from '../elements.js';
import { SectorConstants } from '../constants.js';
import { drawMercsForHiring } from '../day-one.js';
import { executeCombat } from '../combat.js';
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
  asMercCard,
  asSector,
  asEquipment,
  isDictatorCard,
  isMercCard,
  isCombatantModel,
  getUnitName,
  findUnitSector,
  getCachedValue,
  setCachedValue,
  clearCachedValue,
  equipNewHire,
} from './helpers.js';


// =============================================================================
// Hire MERC Action
// =============================================================================

// Settings key for drawn MERCs cache (persists across BoardSmith contexts)
const HIRE_DRAWN_MERCS_KEY = 'hireDrawnMercs';

// Helper to get MercCard elements from cached IDs
function getHireDrawnMercs(game: MERCGame, playerId: string): MercCard[] | undefined {
  const ids = getCachedValue<number[]>(game, HIRE_DRAWN_MERCS_KEY, playerId);
  if (!ids) return undefined; // No cache - caller should draw
  if (ids.length === 0) return []; // Cache exists but empty
  return ids.map(id => game.getElementById(id)).filter((e): e is MercCard => isMercCard(e));
}

/**
 * Hire MERCs from the deck
 * Cost: 2 actions
 * Per rules (06-merc-actions.md): Draw 3, choose 0-3 to hire (within team limit)
 * MERC-yi7: Can also fire a MERC during this action
 * MERC-l1q: New MERCs join existing squad
 */
export function createHireMercAction(game: MERCGame): ActionDefinition {
  return Action.create('hireMerc')
    .prompt('Hire mercenaries')
    .condition({
      'not in combat': () => !game.activeCombat,
      'is rebel player': (ctx) => game.isRebelPlayer(ctx.player),
      'can hire MERC': (ctx) => {
        if (!game.isRebelPlayer(ctx.player)) return false;
        const player = asRebelPlayer(ctx.player);
        return player.canHireMerc(game);
      },
      'has actions remaining': (ctx) => {
        if (!game.isRebelPlayer(ctx.player)) return false;
        return hasActionsRemaining(asRebelPlayer(ctx.player), ACTION_COSTS.HIRE_MERC);
      },
      'MERC deck has cards': () => game.mercDeck.count(MercCard) > 0,
    })
    .chooseElement<MercCard>('actingMerc', {
      prompt: 'Which MERC spends the actions?',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        // Safety check - only rebels can hire MERCs
        if (!game.isRebelPlayer(ctx.player)) return false;
        const merc = asMercCard(element);
        const player = asRebelPlayer(ctx.player);
        return isInPlayerTeam(merc, player) && merc.actionsRemaining >= ACTION_COSTS.HIRE_MERC;
      },
    })
    // MERC-yi7: Optional fire a MERC during hire action
    .chooseFrom<string>('fireFirst', {
      prompt: 'Fire a MERC first? (frees team slot)',
      choices: (ctx) => {
        const player = asRebelPlayer(ctx.player);
        const choices: { label: string; value: string }[] = [
          { label: 'No, continue hiring', value: 'none' },
        ];
        // Only show fire option if player has multiple MERCs
        if (player.teamSize >= 2) {
          for (const merc of player.team) {
            choices.push({ label: `Fire ${merc.mercName}`, value: merc.mercName });
          }
        }
        return choices;
      },
    })
    // Draw 3 MERCs and let player select which to hire
    .chooseFrom<string>('selectedMercs', {
      prompt: (ctx) => {
        const player = asRebelPlayer(ctx.player);
        const fireChoice = ctx.data?.fireFirst as string;
        const willFire = fireChoice && fireChoice !== 'none';
        const teamLimit = player.getTeamLimit(game);
        const currentSize = player.teamSize - (willFire ? 1 : 0);
        const canHire = Math.max(0, teamLimit - currentSize);
        return `Select MERCs to hire (up to ${canHire})`;
      },
      multiSelect: (ctx) => {
        const player = asRebelPlayer(ctx.player);
        const fireChoice = ctx.data?.fireFirst as string;
        const willFire = fireChoice && fireChoice !== 'none';
        const teamLimit = player.getTeamLimit(game);
        const currentSize = player.teamSize - (willFire ? 1 : 0);
        const canHire = Math.max(1, teamLimit - currentSize);
        return { min: 1, max: canHire };
      },
      choices: (ctx) => {
        const player = asRebelPlayer(ctx.player);
        const playerId = `${player.position}`;

        // Draw 3 MERCs if not already cached
        let drawnMercs = getHireDrawnMercs(game, playerId);
        if (!drawnMercs) {
          const drawn = drawMercsForHiring(game, 3);
          setCachedValue(game, HIRE_DRAWN_MERCS_KEY, playerId, drawn.map(m => m.id));
          drawnMercs = drawn;
        }

        // MERC-s37: Filter out MERCs incompatible with current team
        const compatibleMercs = drawnMercs.filter(m =>
          canHireMercWithTeam(m.mercId, player.team)
        );
        return compatibleMercs.map(m => capitalize(m.mercName));
      },
    })
    .execute((args, ctx) => {
      const player = asRebelPlayer(ctx.player);
      const actingMerc = asMercCard(args.actingMerc);
      const playerId = `${player.position}`;
      const drawnMercs = getHireDrawnMercs(game, playerId) || [];
      const selectedNames = (args.selectedMercs as string[]) || [];
      const fireChoice = args.fireFirst as string;

      // Spend action
      if (!useAction(actingMerc, ACTION_COSTS.HIRE_MERC)) {
        // Discard mercs if action failed
        for (const merc of drawnMercs) {
          merc.putInto(game.mercDiscard);
        }
        clearCachedValue(game, HIRE_DRAWN_MERCS_KEY, playerId);
        return { success: false, message: 'Not enough actions' };
      }

      // MERC-yi7: Fire a MERC first if requested
      if (fireChoice && fireChoice !== 'none') {
        const mercToFire = player.team.find(m => m.mercName === fireChoice);
        if (mercToFire && mercToFire !== actingMerc) {
          // Find current sector for equipment drop
          const firedSquad = player.getSquadContaining(mercToFire);
          const sector = firedSquad?.sectorId ? game.getSector(firedSquad.sectorId) : null;

          // Drop equipment to stash
          const droppedEquipment: string[] = [];
          if (mercToFire.weaponSlot) {
            const weapon = mercToFire.unequip('Weapon');
            if (weapon && sector) {
              sector.addToStash(weapon);
              droppedEquipment.push(weapon.equipmentName);
            }
          }
          if (mercToFire.armorSlot) {
            const armor = mercToFire.unequip('Armor');
            if (armor && sector) {
              sector.addToStash(armor);
              droppedEquipment.push(armor.equipmentName);
            }
          }
          if (mercToFire.accessorySlot) {
            const accessory = mercToFire.unequip('Accessory');
            if (accessory && sector) {
              sector.addToStash(accessory);
              droppedEquipment.push(accessory.equipmentName);
            }
          }

          // Clear sectorId so fired MERC doesn't show on map
          mercToFire.sectorId = undefined;
          mercToFire.putInto(game.mercDiscard);
          if (droppedEquipment.length > 0) {
            game.message(`Fired ${mercToFire.mercName}, dropped ${droppedEquipment.join(', ')} to stash`);
          } else {
            game.message(`Fired ${mercToFire.mercName}`);
          }
        }
      }

      // Calculate how many can be hired (team limit)
      const teamLimit = player.getTeamLimit(game);
      let currentSize = player.teamSize;
      const hired: string[] = [];

      // Auto-join: new MERCs join the squad of the acting merc (the one who spent actions to hire)
      // This ensures new hires join the squad at the hiring sector
      let targetSquad = player.getSquadContaining(actingMerc) || player.primarySquad;

      for (const merc of drawnMercs) {
        if (selectedNames.includes(capitalize(merc.mercName)) && currentSize < teamLimit) {
          merc.putInto(targetSquad);
          // Sync merc's sectorId with the squad they joined
          merc.sectorId = targetSquad.sectorId;
          // Per rules (06-merc-actions.md): Newly hired MERCs start with 0 actions
          merc.actionsRemaining = 0;

          // Per rules (06-merc-actions.md lines 52-55): Draw 1 equipment from any deck (free)
          // Auto-select equipment type based on what MERC is missing
          let equipType: 'Weapon' | 'Armor' | 'Accessory';
          if (!merc.weaponSlot) {
            equipType = 'Weapon';
          } else if (!merc.armorSlot) {
            equipType = 'Armor';
          } else if (!merc.accessorySlot) {
            equipType = 'Accessory';
          } else {
            // All slots filled, draw random using seeded random
            const types: ('Weapon' | 'Armor' | 'Accessory')[] = ['Weapon', 'Armor', 'Accessory'];
            equipType = types[Math.floor(game.random() * types.length)];
          }

          // Uses shared helper for Apeiron/Vrbansk ability handling
          equipNewHire(game, merc, equipType);

          hired.push(merc.mercName);
          currentSize++;
        } else {
          // Discard unhired MERCs
          merc.putInto(game.mercDiscard);
        }
      }

      clearCachedValue(game, HIRE_DRAWN_MERCS_KEY, playerId);

      if (hired.length > 0) {
        game.message(`${player.name} hired: ${hired.join(', ')}`);
        return { success: true, message: `Hired ${hired.length} MERC(s)`, data: { hired } };
      } else {
        game.message(`${player.name} hired no MERCs`);
        return { success: true, message: 'No MERCs hired' };
      }
    });
}

// =============================================================================
// Explore Action (simplified - just exploration, no equipment selection)
// Works for both rebel and dictator players.
// =============================================================================

// Type for units that can explore (MERCs or DictatorCard)
type ExplorableUnit = MercCard | DictatorCard;


// Helper to check if unit belongs to player (for explore action)
function isUnitOwnedForExplore(unit: ExplorableUnit, player: unknown, game: MERCGame): boolean {
  if (game.isRebelPlayer(player)) {
    if (!unit.isMerc) return false;
    return isInPlayerTeam(unit as MercCard, asRebelPlayer(player));
  }
  if (game.isDictatorPlayer(player)) {
    // DictatorCard always belongs to dictator
    if (unit.isDictator) {
      return unit.inPlay && !unit.isDead;
    }
    const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
    return dictatorMercs.some(m => m.id === unit.id);
  }
  return false;
}

// Helper to check if unit can explore (in unexplored sector with actions)
function canUnitExplore(unit: ExplorableUnit, player: unknown, game: MERCGame): boolean {
  if (unit.actionsRemaining < ACTION_COSTS.EXPLORE) return false;
  if (isDictatorCard(unit) && (!unit.inPlay || unit.isDead)) return false;
  const sector = findUnitSector(unit, player, game);
  return sector !== null && !sector.explored;
}

// Helper to get living units for any player type (for explore action)
// Returns MERCs + DictatorCard if applicable
function getPlayerUnitsForExplore(player: unknown, game: MERCGame): ExplorableUnit[] {
  if (game.isRebelPlayer(player)) {
    return asRebelPlayer(player).team.filter(m => !m.isDead);
  }
  if (game.isDictatorPlayer(player)) {
    const units: ExplorableUnit[] = game.dictatorPlayer?.hiredMercs.filter(m => !m.isDead) || [];
    // Include DictatorCard if in play
    const dictatorCard = game.dictatorPlayer?.dictator;
    if (dictatorCard?.inPlay && !dictatorCard.isDead) {
      units.push(dictatorCard);
    }
    return units;
  }
  return [];
}

// Legacy helpers for backward compatibility
function findMercSectorForExplore(merc: MercCard, player: unknown, game: MERCGame): Sector | null {
  return findUnitSector(merc, player, game);
}

function isMercOwnedForExplore(merc: MercCard, player: unknown, game: MERCGame): boolean {
  return isUnitOwnedForExplore(merc, player, game);
}

function canMercExplore(merc: MercCard, player: unknown, game: MERCGame): boolean {
  return canUnitExplore(merc, player, game);
}

function getPlayerMercsForExplore(player: unknown, game: MERCGame): MercCard[] {
  if (game.isRebelPlayer(player)) {
    return asRebelPlayer(player).team.filter(m => !m.isDead);
  }
  if (game.isDictatorPlayer(player)) {
    return game.dictatorPlayer?.hiredMercs.filter(m => !m.isDead) || [];
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
  return Action.create('explore')
    .prompt('Explore')
    .notUndoable() // Involves randomness (drawing equipment)
    .condition({
      'not in combat': () => !game.activeCombat,
      'is rebel or dictator player': (ctx) => game.isRebelPlayer(ctx.player) || game.isDictatorPlayer(ctx.player),
      'has unit that can explore': (ctx) => {
        const livingUnits = getPlayerUnitsForExplore(ctx.player, game);
        return livingUnits.some(u => canUnitExplore(u, ctx.player, game));
      },
    })
    .chooseElement<CombatantModel>('actingUnit', {
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
      const actingUnit = args.actingUnit as CombatantModel;

      if (!actingUnit) {
        return { success: false, message: 'Unit not found' };
      }

      // Find the sector
      const sector = findUnitSector(actingUnit, ctx.player, game);
      if (!sector) {
        return { success: false, message: 'No sector found' };
      }

      // Spend action with validation (works for both MercCard and DictatorCard)
      if (actingUnit.actionsRemaining < ACTION_COSTS.EXPLORE) {
        return { success: false, message: 'Not enough actions to explore' };
      }
      actingUnit.actionsRemaining -= ACTION_COSTS.EXPLORE;

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
      // Industry bonus
      if (sector.isIndustry) {
        const types: ('Weapon' | 'Armor' | 'Accessory')[] = ['Weapon', 'Armor', 'Accessory'];
        const randomType = types[Math.floor(game.random() * types.length)];
        const bonusEquipment = game.drawEquipment(randomType);
        if (bonusEquipment) sector.addToStash(bonusEquipment);
      }

      // Mark explored
      sector.explore();

      // Get unit name for messages
      const unitName = getUnitName(actingUnit);

      // Report what was found
      if (sector.stashCount > 0) {
        const equipmentList = sector.stash.map(e => e.equipmentName).join(', ');
        game.message(`${capitalize(unitName)} explored ${sector.sectorName} and found: ${equipmentList}`);

        // Chain to collectEquipment action with pre-filled args
        // Use display option for friendly chip names while keeping IDs for lookup
        return {
          success: true,
          message: `Explored ${sector.sectorName}`,
          followUp: {
            action: 'collectEquipment',
            args: {
              mercId: actingUnit.id,
              sectorId: sector.id,
            },
            display: {
              mercId: capitalize(unitName),
              sectorId: sector.sectorName,
            },
          },
        };
      } else {
        game.message(`${capitalize(unitName)} explored ${sector.sectorName} and found nothing`);
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
 * mercId and sectorId args so the player doesn't need to re-select the merc.
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
// Type for units that can collect equipment (MERCs or DictatorCard)
type CollectableUnit = MercCard | DictatorCard;

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

  // Helper to resolve unit from ctx.args (mercId is numeric element ID)
  // Handles both MercCard and DictatorCard
  function getUnit(ctx: { args?: Record<string, unknown> }): CollectableUnit | undefined {
    const mercArg = ctx.args?.mercId;
    let id: number | undefined;
    if (typeof mercArg === 'number') {
      id = mercArg;
    } else if (mercArg && typeof mercArg === 'object' && 'id' in mercArg) {
      id = (mercArg as { id: number }).id;
    }
    if (id === undefined) return undefined;

    const element = game.getElementById(id);
    if (isCombatantModel(element)) {
      return element;
    }
    return undefined;
  }

  return Action.create('collectEquipment')
    .prompt('Take from stash')
    .condition({
      'triggered via followUp from explore': (ctx) => ctx.args?.sectorId != null,
    })
    .chooseElement<Equipment>('equipment', {
      prompt: (ctx) => {
        const unit = getUnit(ctx);
        const sector = getSector(ctx);
        const remaining = sector?.stashCount || 0;
        return unit
          ? `What should ${capitalize(getUnitName(unit))} take? (${remaining} item${remaining !== 1 ? 's' : ''} left, or skip)`
          : 'Select equipment';
      },
      display: (equip) => `${equip.equipmentName} (${equip.equipmentType})`,
      optional: 'Done collecting',
      elementClass: Equipment,
      filter: (element, ctx) => {
        if (!(element instanceof Equipment)) return false;
        const sector = getSector(ctx);
        if (!sector) return false;
        const inStash = sector.stash.some(e => e.id === element.id);
        if (!inStash) return false;

        // MERC-70a: Filter out grenades/mortars if Apeiron
        const unit = getUnit(ctx);
        if (unit?.isMerc && (unit as MercCard).mercId === 'apeiron' && isGrenadeOrMortar(element)) {
          return false;
        }
        return true;
      },
    })
    .execute((args, ctx) => {
      const unit = getUnit(ctx);
      const sector = getSector(ctx);
      const equipment = args.equipment instanceof Equipment ? args.equipment : null;

      if (!unit || !sector) {
        return { success: false, message: 'Invalid unit or sector' };
      }

      const unitName = getUnitName(unit);

      // User chose "Done collecting"
      if (!equipment) {
        if (sector.stashCount > 0) {
          const remaining = sector.stash.map(e => e.equipmentName).join(', ');
          game.message(`Left in stash: ${remaining}`);
        }
        return { success: true, message: 'Done collecting equipment' };
      }

      // Equip the item
      const replaced = unit.equip(equipment);

      if (replaced) {
        sector.addToStash(replaced);
        game.message(`${capitalize(unitName)} equipped ${equipment.equipmentName}, returned ${replaced.equipmentName}`);
      } else {
        game.message(`${capitalize(unitName)} equipped ${equipment.equipmentName}`);
      }

      // Chain back to collectEquipment if stash still has items
      if (sector.stashCount > 0) {
        return {
          success: true,
          message: `Equipped ${equipment.equipmentName}`,
          followUp: {
            action: 'collectEquipment',
            args: {
              mercId: ctx.args?.mercId,
              sectorId: ctx.args?.sectorId,
            },
            display: {
              mercId: capitalize(unitName),
              sectorId: sector.sectorName,
            },
          },
        };
      }

      return { success: true, message: `Equipped ${equipment.equipmentName}` };
    });
}

// =============================================================================
// Take From Stash Action
// =============================================================================

/**
 * Take equipment from the sector stash.
 * Cost: 0 actions (free)
 * Available when a unit just explored the sector.
 * Works for both rebel and dictator players.
 */
export function createTakeFromStashAction(game: MERCGame): ActionDefinition {
  // Helper to find the unit that explored
  function findExplorerUnit(ctx: { player: unknown }): MercCard | DictatorCard | null {
    if (!game.lastExplorer) return null;
    const unitId = game.lastExplorer.mercId;

    if (game.isRebelPlayer(ctx.player)) {
      const player = asRebelPlayer(ctx.player);
      return player.team.find(m => String(m.id) === unitId) || null;
    }

    if (game.isDictatorPlayer(ctx.player) && game.dictatorPlayer) {
      // Check if it's the dictator card
      const dictator = game.dictatorPlayer.dictator;
      if (dictator && String(dictator.id) === unitId) {
        return dictator;
      }
      // Check hired mercs
      return game.dictatorPlayer.hiredMercs.find(m => String(m.id) === unitId) || null;
    }

    return null;
  }

  return Action.create('takeFromStash')
    .prompt('Take equipment from stash')
    .condition({
      'unit just explored': () => !!game.lastExplorer,
      'is rebel or dictator player': (ctx) => game.isRebelPlayer(ctx.player) || game.isDictatorPlayer(ctx.player),
      'explorer belongs to player': (ctx) => !!findExplorerUnit(ctx),
      'sector has stash items': () => {
        if (!game.lastExplorer) return false;
        const sector = game.getSector(game.lastExplorer.sectorId);
        return !!(sector && sector.stash.length > 0);
      },
    })
    .chooseFrom<string>('equipment', {
      prompt: (ctx) => {
        // Find the explorer's name
        const unit = findExplorerUnit(ctx);
        return unit ? `What should ${capitalize(getUnitName(unit))} take?` : 'Select equipment to take';
      },
      choices: (ctx) => {
        if (!game.lastExplorer) return ['Done'];
        const sector = game.getSector(game.lastExplorer.sectorId);
        if (!sector || sector.stash.length === 0) return ['Done'];

        // MERC-70a: Filter out grenades/mortars if Apeiron
        const unit = findExplorerUnit(ctx);
        const isApeiron = unit?.isMerc && (unit as MercCard).mercId === 'apeiron';

        const equipmentChoices = sector.stash
          .filter(e => !isApeiron || !isGrenadeOrMortar(e))
          .map(e => `${e.equipmentName} (${e.equipmentType})`);
        return [...equipmentChoices, 'Done'];
      },
    })
    .execute((args, ctx) => {
      const equipmentChoice = args.equipment as string;

      // Always clear lastExplorer when this action completes
      const explorer = game.lastExplorer;
      game.lastExplorer = null;

      if (!explorer) {
        return { success: false, message: 'No explorer tracked' };
      }

      if (equipmentChoice === 'Done') {
        return { success: true, message: 'Finished taking equipment' };
      }

      const targetUnit = findExplorerUnit(ctx);
      if (!targetUnit) {
        return { success: false, message: 'Explorer unit not found' };
      }

      const sector = game.getSector(explorer.sectorId);
      if (!sector) {
        return { success: false, message: 'Explored sector not found' };
      }

      // Parse equipment name from choice (format: "EquipName (Type)")
      const equipName = equipmentChoice.replace(/ \((?:Weapon|Armor|Accessory)\)$/, '');
      const equipment = sector.stash.find(e => e.equipmentName === equipName);

      if (!equipment) {
        return { success: false, message: 'Equipment not found in stash' };
      }

      const unitName = getUnitName(targetUnit);

      // Equip to unit - equip() uses putInto() which moves equipment from stash
      const replaced = targetUnit.equip(equipment);
      if (replaced) {
        sector.addToStash(replaced);
        game.message(`${unitName} equipped ${equipment.equipmentName}, returned ${replaced.equipmentName} to stash`);
        // Allow taking more since there's still stash (reset explorer)
        game.lastExplorer = { mercId: String(targetUnit.id), sectorId: sector.sectorId };
      } else {
        game.message(`${unitName} equipped ${equipment.equipmentName}`);
        // Allow taking more if stash still has items
        if (sector.stash.length > 0) {
          game.lastExplorer = { mercId: String(targetUnit.id), sectorId: sector.sectorId };
        }
      }

      return {
        success: true,
        message: `${unitName} took ${equipment.equipmentName}`,
      };
    });
}

// =============================================================================
// Train Action
// Works for both rebel and dictator players.
// =============================================================================

// Type for units that can train (MERCs or DictatorCard)
type TrainableUnit = MercCard | DictatorCard;

// Helper to check if unit can train (training > 0, has actions, sector not at max militia)
function canUnitTrain(unit: TrainableUnit, player: unknown, game: MERCGame): boolean {
  if (unit.training <= 0) return false;
  if (unit.actionsRemaining < ACTION_COSTS.TRAIN) return false;
  if (isDictatorCard(unit) && (!unit.inPlay || unit.isDead)) return false;

  const sector = findUnitSector(unit, player, game);
  if (!sector) return false;

  // Check max militia for this side
  if (game.isRebelPlayer(player)) {
    return sector.getTotalRebelMilitia() < SectorConstants.MAX_MILITIA_PER_SIDE;
  }
  if (game.isDictatorPlayer(player)) {
    // Kim's base allows 20 militia instead of 10
    const isKimBase = game.dictatorPlayer?.dictator?.dictatorId === 'kim' &&
                      sector.sectorId === game.dictatorPlayer?.baseSectorId;
    const maxMilitia = isKimBase
      ? SectorConstants.KIM_BASE_MAX_MILITIA
      : SectorConstants.MAX_MILITIA_PER_SIDE;
    return sector.dictatorMilitia < maxMilitia;
  }
  return false;
}

// Helper to get living units for any player type (for train action)
// Returns MERCs + DictatorCard if applicable
function getPlayerUnitsForTrain(player: unknown, game: MERCGame): TrainableUnit[] {
  if (game.isRebelPlayer(player)) {
    return asRebelPlayer(player).team.filter(m => !m.isDead);
  }
  if (game.isDictatorPlayer(player)) {
    const units: TrainableUnit[] = game.dictatorPlayer?.hiredMercs.filter(m => !m.isDead) || [];
    // Include DictatorCard if in play
    const dictatorCard = game.dictatorPlayer?.dictator;
    if (dictatorCard?.inPlay && !dictatorCard.isDead) {
      units.push(dictatorCard);
    }
    return units;
  }
  return [];
}

// Legacy helpers for backward compatibility
function findMercSectorForTrain(merc: MercCard, player: unknown, game: MERCGame): Sector | null {
  return findUnitSector(merc, player, game);
}

function canMercTrain(merc: MercCard, player: unknown, game: MERCGame): boolean {
  return canUnitTrain(merc, player, game);
}

function isMercOwnedForTrain(merc: MercCard, player: unknown, game: MERCGame): boolean {
  if (game.isRebelPlayer(player)) {
    return isInPlayerTeam(merc, asRebelPlayer(player));
  }
  if (game.isDictatorPlayer(player)) {
    const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
    return dictatorMercs.some(m => m.id === merc.id);
  }
  return false;
}

function getPlayerMercsForTrain(player: unknown, game: MERCGame): MercCard[] {
  if (game.isRebelPlayer(player)) {
    return asRebelPlayer(player).team.filter(m => !m.isDead);
  }
  if (game.isDictatorPlayer(player)) {
    return game.dictatorPlayer?.hiredMercs.filter(m => !m.isDead) || [];
  }
  return [];
}

/**
 * Train militia in the current sector
 * Cost: 1 action, trains militia equal to MERC's training stat
 * Works for both rebel and dictator players.
 */
export function createTrainAction(game: MERCGame): ActionDefinition {
  return Action.create('train')
    .prompt('Train')
    .condition({
      'not in combat': () => !game.activeCombat,
      'is rebel or dictator player': (ctx) => game.isRebelPlayer(ctx.player) || game.isDictatorPlayer(ctx.player),
      'has unit that can train': (ctx) => {
        const livingUnits = getPlayerUnitsForTrain(ctx.player, game);
        return livingUnits.some(u => canUnitTrain(u, ctx.player, game));
      },
    })
    .chooseFrom<string>('unit', {
      prompt: 'Select unit to train militia',
      choices: (ctx) => {
        const units = getPlayerUnitsForTrain(ctx.player, game);
        return units
          .filter(u => canUnitTrain(u, ctx.player, game))
          .map(u => {
            const isDictator = isDictatorCard(u);
            return {
              value: `${u.id}:${getUnitName(u)}:${isDictator}`,
              label: capitalize(getUnitName(u)),
            };
          });
      },
    })
    .execute((args, ctx) => {
      const unitChoiceStr = args.unit as string;

      // Parse string format: "id:name:isDictatorCard"
      const [idStr, , isDictatorStr] = unitChoiceStr.split(':');
      const unitId = parseInt(idStr, 10);
      const isUnitDictatorCard = isDictatorStr === 'true';

      // Find the actual unit (same pattern as explore action)
      let actingUnit: TrainableUnit | null = null;
      if (isUnitDictatorCard) {
        actingUnit = game.dictatorPlayer?.dictator || null;
      } else {
        actingUnit = game.all(MercCard).find(m => m.id === unitId) || null;
      }

      if (!actingUnit) {
        game.message('Error: Unit not found for train action');
        return { success: false, message: 'Unit not found' };
      }

      const sector = findUnitSector(actingUnit, ctx.player, game);
      if (!sector) {
        game.message('Error: No sector found for train action');
        return { success: false, message: 'No sector found' };
      }

      // Spend action - MERC-bd4: Faustina uses training action first (only for MercCard)
      if (isDictatorCard(actingUnit)) {
        actingUnit.actionsRemaining -= ACTION_COSTS.TRAIN;
      } else {
        useTrainingAction(actingUnit as MercCard, ACTION_COSTS.TRAIN);
      }

      // Get unit name for messages
      const unitName = getUnitName(actingUnit);

      // Train militia - amount depends on player type
      let trained: number;
      if (game.isRebelPlayer(ctx.player)) {
        const player = asRebelPlayer(ctx.player);
        trained = sector.addRebelMilitia(`${player.position}`, actingUnit.training);
        game.message(`${unitName} trained ${trained} militia at ${sector.sectorName}`);

        // Check if dictator has units at this sector and trigger combat
        if (sector.dictatorMilitia > 0) {
          game.message(`Dictator militia detected at ${sector.sectorName} - combat begins!`);
          const outcome = executeCombat(game, sector, player);
          return {
            success: true,
            message: `Trained ${trained} militia and engaged in combat`,
            data: {
              combatTriggered: true,
              rebelVictory: outcome.rebelVictory,
              dictatorVictory: outcome.dictatorVictory,
            },
          };
        }
      } else if (game.isDictatorPlayer(ctx.player)) {
        // Kim's base allows 20 militia instead of 10
        const isKimBase = game.dictatorPlayer?.dictator?.dictatorId === 'kim' &&
                          sector.sectorId === game.dictatorPlayer?.baseSectorId;
        trained = sector.addDictatorMilitia(actingUnit.training, isKimBase);
        game.message(`${unitName} trained ${trained} militia at ${sector.sectorName}`);

        // Check if any rebel has units at this sector and trigger combat
        for (const rebel of game.rebelPlayers) {
          const hasSquad = rebel.primarySquad.sectorId === sector.sectorId ||
            rebel.secondarySquad.sectorId === sector.sectorId;
          const hasMilitia = sector.getRebelMilitia(`${rebel.position}`) > 0;

          if (hasSquad || hasMilitia) {
            game.message(`Rebels detected at ${sector.sectorName} - combat begins!`);
            const outcome = executeCombat(game, sector, rebel);
            return {
              success: true,
              message: `Trained ${trained} militia and engaged in combat`,
              data: {
                combatTriggered: true,
                rebelVictory: outcome.rebelVictory,
                dictatorVictory: outcome.dictatorVictory,
              },
            };
          }
        }
      } else {
        return { success: false, message: 'Unknown player type' };
      }

      return { success: true, message: `Trained ${trained} militia` };
    });
}

// =============================================================================
// Hospital Action
// Works for both rebel and dictator players.
// =============================================================================

// Type for units that can use city facilities (MERCs or DictatorCard)
type CityUnit = MercCard | DictatorCard;

// Helper to get living units for any player type (for hospital/armsDealer)
// Returns MERCs + DictatorCard if applicable
function getPlayerUnitsForCity(player: unknown, game: MERCGame): CityUnit[] {
  if (game.isRebelPlayer(player)) {
    return asRebelPlayer(player).team.filter(m => !m.isDead);
  }
  if (game.isDictatorPlayer(player)) {
    const units: CityUnit[] = game.dictatorPlayer?.hiredMercs.filter(m => !m.isDead) || [];
    // Include DictatorCard if in play
    const dictatorCard = game.dictatorPlayer?.dictator;
    if (dictatorCard?.inPlay && !dictatorCard.isDead) {
      units.push(dictatorCard);
    }
    return units;
  }
  return [];
}

// Legacy helper for backward compatibility (only MERCs)
function getPlayerMercsForCity(player: unknown, game: MERCGame): MercCard[] {
  if (game.isRebelPlayer(player)) {
    return asRebelPlayer(player).team.filter(m => !m.isDead);
  }
  if (game.isDictatorPlayer(player)) {
    return game.dictatorPlayer?.hiredMercs.filter(m => !m.isDead) || [];
  }
  return [];
}

// Helper to check if merc belongs to player (for hospital/armsDealer)
function isMercOwnedForCity(merc: MercCard, player: unknown, game: MERCGame): boolean {
  if (game.isRebelPlayer(player)) {
    return isInPlayerTeam(merc, asRebelPlayer(player));
  }
  if (game.isDictatorPlayer(player)) {
    const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
    return dictatorMercs.some(m => m.id === merc.id);
  }
  return false;
}

// Helper to find sector where player's MERC is located (for hospital/armsDealer)
function findMercSectorForCity(player: unknown, game: MERCGame): Sector | null {
  if (game.isRebelPlayer(player)) {
    const rebelPlayer = asRebelPlayer(player);
    const squad = rebelPlayer.primarySquad;
    if (squad?.sectorId) {
      return game.getSector(squad.sectorId) || null;
    }
  }
  if (game.isDictatorPlayer(player) && game.dictatorPlayer) {
    // Find first hired merc's sector
    const mercs = game.dictatorPlayer.hiredMercs.filter(m => !m.isDead);
    for (const merc of mercs) {
      const squad = game.dictatorPlayer.getSquadContaining(merc);
      if (squad?.sectorId) {
        return game.getSector(squad.sectorId) || null;
      }
    }
  }
  return null;
}

/**
 * Use hospital in a city sector
 * Cost: 1 action, fully heals unit
 * Works for both MERCs and DictatorCard.
 */
export function createHospitalAction(game: MERCGame): ActionDefinition {
  return Action.create('hospital')
    .prompt('Visit hospital')
    .condition({
      'not in combat': () => !game.activeCombat,
      'is rebel or dictator player': (ctx) => game.isRebelPlayer(ctx.player) || game.isDictatorPlayer(ctx.player),
      'in sector with hospital': (ctx) => {
        const sector = findMercSectorForCity(ctx.player, game);
        return !!sector?.hasHospital;
      },
      'has damaged unit with actions': (ctx) => {
        const units = getPlayerUnitsForCity(ctx.player, game);
        return units.some(u => u.damage > 0 && u.actionsRemaining >= ACTION_COSTS.HOSPITAL);
      },
    })
    .chooseFrom<string>('actingUnit', {
      prompt: 'Select unit to heal',
      choices: (ctx) => {
        const units = getPlayerUnitsForCity(ctx.player, game);
        return units
          .filter(u => u.damage > 0 && u.actionsRemaining >= ACTION_COSTS.HOSPITAL)
          .map(u => ({
            value: `${u.id}:${getUnitName(u)}:${isDictatorCard(u)}`,
            label: capitalize(getUnitName(u)),
          }));
      },
    })
    .execute((args) => {
      const unitChoiceStr = args.actingUnit as string;

      // Parse string format: "id:name:isDictatorCard"
      const parts = unitChoiceStr.split(':');
      const unitId = parseInt(parts[0], 10);
      const isUnitDictatorCard = parts[parts.length - 1] === 'true';

      // Find the actual unit
      let actingUnit: CityUnit | null = null;
      if (isUnitDictatorCard) {
        actingUnit = game.dictatorPlayer?.dictator || null;
      } else {
        actingUnit = game.all(MercCard).find(m => m.id === unitId) || null;
      }

      if (!actingUnit) {
        return { success: false, message: 'Unit not found' };
      }

      // Spend action
      if (actingUnit.actionsRemaining < ACTION_COSTS.HOSPITAL) {
        return { success: false, message: 'Not enough actions' };
      }
      actingUnit.actionsRemaining -= ACTION_COSTS.HOSPITAL;

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

// Settings key for arms dealer drawn equipment cache
const ARMS_DEALER_DRAWN_KEY = 'armsDealerDrawn';

// Helper to get player ID for arms dealer cache (distinguishes rebels by position, dictator)
function getArmsDealerPlayerId(player: unknown, game: MERCGame): string {
  if (game.isRebelPlayer(player)) {
    return `${asRebelPlayer(player).position}`;
  }
  return 'dictator';
}

/**
 * Use arms dealer in a city sector
 * Cost: 1 action, draw equipment
 * MERC-dh5: Includes free re-equip option per rules
 * Works for both MERCs and DictatorCard.
 */
export function createArmsDealerAction(game: MERCGame): ActionDefinition {

  return Action.create('armsDealer')
    .prompt('Visit arms dealer')
    .condition({
      'not in combat': () => !game.activeCombat,
      'is rebel or dictator player': (ctx) => game.isRebelPlayer(ctx.player) || game.isDictatorPlayer(ctx.player),
      'in sector with arms dealer': (ctx) => {
        const sector = findMercSectorForCity(ctx.player, game);
        return !!sector?.hasArmsDealer;
      },
      'has unit with actions': (ctx) => {
        const units = getPlayerUnitsForCity(ctx.player, game);
        return units.some(u => u.actionsRemaining >= ACTION_COSTS.ARMS_DEALER);
      },
    })
    .chooseFrom<string>('actingUnit', {
      prompt: 'Which unit visits the dealer?',
      choices: (ctx) => {
        const units = getPlayerUnitsForCity(ctx.player, game);
        return units
          .filter(u => u.actionsRemaining >= ACTION_COSTS.ARMS_DEALER)
          .map(u => ({
            value: `${u.id}:${getUnitName(u)}:${isDictatorCard(u)}`,
            label: capitalize(getUnitName(u)),
          }));
      },
    })
    .chooseFrom<string>('equipmentType', {
      prompt: 'What type of equipment?',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
    })
    // MERC-dh5: Free re-equip - choose unit to equip the purchased item
    .chooseFrom<string>('equipUnit', {
      prompt: 'Free Re-Equip: Which unit should equip this item? (or skip)',
      choices: (ctx) => {
        const equipmentType = ctx.args?.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
        const playerId = getArmsDealerPlayerId(ctx.player, game);

        // Draw equipment now so we can show what was bought
        // Store in cache to persist across choices/execute contexts
        if (getCachedValue<number>(game, ARMS_DEALER_DRAWN_KEY, playerId) === undefined) {
          const equipment = game.drawEquipment(equipmentType);
          if (equipment) {
            setCachedValue(game, ARMS_DEALER_DRAWN_KEY, playerId, equipment.id);
            game.message(`Drew ${equipment.equipmentName} from ${equipmentType} deck`);
          }
        }

        const equipmentId = getCachedValue<number>(game, ARMS_DEALER_DRAWN_KEY, playerId);
        const drawnElement = equipmentId ? game.getElementById(equipmentId) : undefined;
        const drawnEquip = drawnElement instanceof Equipment ? drawnElement : undefined;

        // Get all units for this player type (MERCs + DictatorCard)
        const playerUnits = getPlayerUnitsForCity(ctx.player, game);

        // MERC-70a: Filter out Apeiron if equipment is a grenade/mortar
        const eligibleUnits = playerUnits.filter(u => {
          if (isMercCard(u) && u.mercId === 'apeiron' && drawnEquip && isGrenadeOrMortar(drawnEquip)) {
            return false;
          }
          return true;
        });

        const choices = eligibleUnits.map(u => ({
          label: capitalize(getUnitName(u)),
          value: `${u.id}:${getUnitName(u)}:${isDictatorCard(u)}`,
        }));
        choices.push({ label: 'Skip (add to stash)', value: 'skip' });
        return choices;
      },
    })
    .execute((args, ctx) => {
      const actingUnitStr = args.actingUnit as string;
      const playerId = getArmsDealerPlayerId(ctx.player, game);
      const sector = findMercSectorForCity(ctx.player, game);

      // Parse acting unit string format: "id:name:isDictatorCard"
      const actingParts = actingUnitStr.split(':');
      const actingUnitId = parseInt(actingParts[0], 10);
      const isActingDictatorCard = actingParts[actingParts.length - 1] === 'true';

      // Find the acting unit
      let actingUnit: CityUnit | null = null;
      if (isActingDictatorCard) {
        actingUnit = game.dictatorPlayer?.dictator || null;
      } else {
        actingUnit = game.all(MercCard).find(m => m.id === actingUnitId) || null;
      }

      if (!actingUnit) {
        clearCachedValue(game, ARMS_DEALER_DRAWN_KEY, playerId);
        return { success: false, message: 'Unit not found' };
      }

      // Spend action
      if (actingUnit.actionsRemaining < ACTION_COSTS.ARMS_DEALER) {
        clearCachedValue(game, ARMS_DEALER_DRAWN_KEY, playerId);
        return { success: false, message: 'Not enough actions' };
      }
      actingUnit.actionsRemaining -= ACTION_COSTS.ARMS_DEALER;

      const actingUnitName = getUnitName(actingUnit);

      // Get equipment from cache (stored by choices function)
      const equipmentId = getCachedValue<number>(game, ARMS_DEALER_DRAWN_KEY, playerId);
      const equipElement = equipmentId ? game.getElementById(equipmentId) : undefined;
      const equipment = equipElement instanceof Equipment ? equipElement : undefined;
      clearCachedValue(game, ARMS_DEALER_DRAWN_KEY, playerId); // Clean up

      if (equipment && sector) {
        const equipUnitStr = args.equipUnit as string;

        if (equipUnitStr && equipUnitStr !== 'skip') {
          // Parse equip target unit string
          const equipParts = equipUnitStr.split(':');
          const equipUnitId = parseInt(equipParts[0], 10);
          const isEquipDictatorCard = equipParts[equipParts.length - 1] === 'true';

          // Find the target unit
          let targetUnit: CityUnit | null = null;
          if (isEquipDictatorCard) {
            targetUnit = game.dictatorPlayer?.dictator || null;
          } else {
            targetUnit = game.all(MercCard).find(m => m.id === equipUnitId) || null;
          }

          if (targetUnit) {
            const replaced = targetUnit.equip(equipment);
            const targetUnitName = getUnitName(targetUnit);
            if (replaced) {
              sector.addToStash(replaced);
              game.message(`${targetUnitName} equipped ${equipment.equipmentName}, ${replaced.equipmentName} added to stash`);
            } else {
              game.message(`${targetUnitName} equipped ${equipment.equipmentName}`);
            }
            return { success: true, message: `Bought and equipped ${equipment.equipmentName}` };
          }
        }

        // Add to sector stash if not equipped
        const added = sector.addToStash(equipment);
        if (added) {
          game.message(`${actingUnitName} bought ${equipment.equipmentName} (added to ${sector.sectorName} stash)`);
        } else {
          game.message(`${actingUnitName} bought ${equipment.equipmentName} but couldn't stash it (damaged?)`);
        }
        return { success: true, message: `Bought ${equipment.equipmentName}` };
      }

      return { success: false, message: 'No equipment available' };
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
  return Action.create('endTurn')
    .prompt('End turn')
    .condition({
      'not in combat': () => !game.activeCombat,
      'day 2 or later': () => game.currentDay >= 2,
      'is rebel or dictator player': (ctx) => game.isRebelPlayer(ctx.player) || game.isDictatorPlayer(ctx.player),
    })
    .chooseFrom<string>('confirm', {
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
      // Also check DictatorCard location
      const dictator = game.dictatorPlayer.dictator;
      if (dictator?.inPlay && dictator.sectorId) {
        addIfHasStash(dictator.sectorId);
      }
    }

    return choices;
  };

  return Action.create('viewStash')
    .prompt('View sector stash')
    .condition({
      'is rebel or dictator player': (ctx) => game.isRebelPlayer(ctx.player) || game.isDictatorPlayer(ctx.player),
      'has accessible stash': (ctx) => getSectorsWithStash(ctx).length > 0,
    })
    .chooseFrom<string>('sector', {
      prompt: 'Which sector stash to view?',
      choices: (ctx) => getSectorsWithStash(ctx),
      display: (sectorId) => {
        const sector = game.getSector(sectorId);
        return sector ? `${sector.sectorName} (${sector.stash.length} items)` : sectorId;
      },
    })
    .execute((args) => {
      const sectorId = args.sector as string;
      const sector = game.getSector(sectorId);

      if (!sector) {
        return { success: false, message: 'Sector not found' };
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
