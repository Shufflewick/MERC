/**
 * Rebel Equipment Actions
 *
 * Equipment management and MERC special abilities related to equipment.
 */

import { Action, type ActionDefinition, type ActionContext } from 'boardsmith';
import type { MERCGame, RebelPlayer, MERCPlayer } from '../game.js';
import { Sector, Equipment, isGrenadeOrMortar, CombatantModel } from '../elements.js';
import {
  ACTION_COSTS,
  capitalize,
  hasActionsRemaining,
  isInPlayerTeam,
  useAction,
  isMerc,
  isDictatorUnit,
  isCombatantModel,
  getUnitName,
  findUnitSector,
  getCachedValue,
  setCachedValue,
  clearCachedValue,
  isNotInActiveCombat,
} from './helpers.js';
import { isLandMine, isRepairKit, hasRangedAttack, getRangedRange, isExplosivesComponent, getMatchingComponent } from '../equipment-effects.js';
import { hasMortar } from '../ai-helpers.js';
import { rollDice } from '../combat.js';
import { getHitThreshold } from '../merc-abilities.js';
import { CombatConstants } from '../constants.js';

// =============================================================================
// Re-Equip Action
// Works for both rebel and dictator players.
// =============================================================================

/**
 * Re-equip from sector stash.
 * Cost: 1 action (per rules: "Re-Equip (1 action)")
 * Uses element selection for proper UI display of equipment.
 * Chains via followUp if more items remain in stash.
 * Works for both rebel and dictator players.
 */
// Type for units that can equip (MERCs or dictator combatant)
// Using CombatantModel as it represents both merc and dictator combatants

// Helper to get living units with actions for any player type
// Returns MERCs + dictator combatant if applicable
function getPlayerUnitsWithActions(player: unknown, game: MERCGame): CombatantModel[] {
  if (game.isRebelPlayer(player)) {
    return player.team.filter(m => !m.isDead && m.actionsRemaining >= ACTION_COSTS.RE_EQUIP);
  }
  if (game.isDictatorPlayer(player)) {
    const units: CombatantModel[] = game.dictatorPlayer?.hiredMercs.filter(m => !m.isDead && m.actionsRemaining >= ACTION_COSTS.RE_EQUIP) || [];
    // Include dictator combatant if in play with enough actions
    const dictatorCard = game.dictatorPlayer?.dictator;
    if (dictatorCard?.inPlay && !dictatorCard.isDead && dictatorCard.actionsRemaining >= ACTION_COSTS.RE_EQUIP) {
      units.push(dictatorCard);
    }
    return units;
  }
  return [];
}

// Helper to check if unit can re-equip (in a sector with stash and has actions)
function canUnitReEquip(unit: CombatantModel, player: unknown, game: MERCGame): boolean {
  if (unit.actionsRemaining < ACTION_COSTS.RE_EQUIP) return false;
  if (unit.isDictator && (!unit.inPlay || unit.isDead)) return false;
  const sector = findUnitSector(unit, player, game);
  return sector !== null && sector.stash.length > 0;
}

// Helper to check if any unit can re-equip (in a sector with stash and has actions)
function canAnyUnitReEquip(player: unknown, game: MERCGame): boolean {
  const units = getPlayerUnitsWithActions(player, game);
  for (const unit of units) {
    if (canUnitReEquip(unit, player, game)) return true;
  }
  return false;
}

export function createReEquipAction(game: MERCGame): ActionDefinition {
  // Helper to resolve unit from ctx.args (parses composite string "id:name:isDictator")
  function getUnit(ctx: { args?: Record<string, unknown> }): CombatantModel | undefined {
    const unitArg = ctx.args?.actingUnit;

    // Handle string format: "id:name:isDictator"
    if (typeof unitArg === 'string') {
      const parts = unitArg.split(':');
      if (parts.length < 3) return undefined;

      const idStr = parts[0];
      const isDictatorStr = parts[parts.length - 1]; // Last part is always isDictator
      const unitId = parseInt(idStr, 10);
      const isUnitDictator = isDictatorStr === 'true';

      if (isUnitDictator) {
        return game.dictatorPlayer?.dictator;
      }
      return game.all(CombatantModel).filter(c => c.isMerc).find(m => m.id === unitId);
    }

    // Handle object format (in case BoardSmith passes the choice object)
    if (unitArg && typeof unitArg === 'object' && 'value' in unitArg) {
      const valueStr = (unitArg as { value: string }).value;
      if (typeof valueStr === 'string') {
        const parts = valueStr.split(':');
        if (parts.length < 3) return undefined;

        const idStr = parts[0];
        const isDictatorStr = parts[parts.length - 1];
        const unitId = parseInt(idStr, 10);
        const isUnitDictator = isDictatorStr === 'true';

        if (isUnitDictator) {
          return game.dictatorPlayer?.dictator;
        }
        return game.all(CombatantModel).filter(c => c.isMerc).find(m => m.id === unitId);
      }
    }

    return undefined;
  }

  // Helper to resolve sector from ctx.args
  function getSector(ctx: { args?: Record<string, unknown> }): Sector | undefined {
    const sectorArg = ctx.args?.sectorId;
    if (typeof sectorArg === 'number') {
      const el = game.getElementById(sectorArg);
      return (el && el instanceof Sector) ? el : undefined;
    } else if (sectorArg && typeof sectorArg === 'object' && 'id' in sectorArg) {
      if (sectorArg instanceof Sector) return sectorArg;
      const sectorObj = sectorArg as { id: number };
      const el = game.getElementById(sectorObj.id);
      return (el && el instanceof Sector) ? el : undefined;
    }
    return undefined;
  }

  return Action.create('reEquip')
    .prompt('Equip')
    .condition({
      'not in combat': () => isNotInActiveCombat(game),
      'is rebel or dictator player': (ctx) => game.isRebelPlayer(ctx.player) || game.isDictatorPlayer(ctx.player),
      'has unit that can re-equip': (ctx) => canAnyUnitReEquip(ctx.player, game),
    })
    .chooseFrom<string>('actingUnit', {
      prompt: 'Which unit equips?',
      choices: (ctx) => {
        const units = getPlayerUnitsWithActions(ctx.player, game);
        return units
          .filter(u => canUnitReEquip(u, ctx.player, game))
          .map(u => `${u.id}:${getUnitName(u)}:${u.isDictator}`);
      },
      display: (value) => {
        // Parse "id:name:isDictator" format to extract name
        const parts = value.split(':');
        if (parts.length >= 2) {
          // Name is everything between id and isDictator (handles names with colons)
          const name = parts.slice(1, -1).join(':');
          return capitalize(name);
        }
        return value;
      },
    })
    .chooseElement<Equipment>('equipment', {
      dependsOn: 'actingUnit', // Equipment selection depends on unit selection
      prompt: 'Select equipment to equip (or skip to finish)',
      display: (equip) => `${equip.equipmentName} (${equip.equipmentType})`,
      optional: true,
      elementClass: Equipment,
      filter: (element, ctx: ActionContext) => {
        const unit = getUnit(ctx);
        if (!unit) return false;

        const sector = findUnitSector(unit, ctx.player, game);
        if (!sector) return false;

        // Check if this equipment is in the sector's stash
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
      const equipment = args.equipment instanceof Equipment ? args.equipment : null;

      if (!unit) {
        return { success: false, message: 'Invalid unit' };
      }

      const sector = findUnitSector(unit, ctx.player, game);
      if (!sector) {
        return { success: false, message: 'Invalid sector' };
      }

      const unitName = getUnitName(unit);

      // Spend action upfront when first starting re-equip
      unit.actionsRemaining -= ACTION_COSTS.RE_EQUIP;

      // User chose "Done equipping" without picking anything
      if (!equipment) {
        if (sector.stashCount > 0) {
          const remaining = sector.stash.map(e => e.equipmentName).join(', ');
          game.message(`Left in stash: ${remaining}`);
        }
        return { success: true, message: 'Done equipping' };
      }

      // Equip the item
      const { replaced, displacedBandolierItems } = unit.equip(equipment);

      if (replaced) {
        sector.addToStash(replaced);
        game.message(`${capitalize(unitName)} equipped ${equipment.equipmentName}, returned ${replaced.equipmentName}`);
      } else {
        game.message(`${capitalize(unitName)} equipped ${equipment.equipmentName}`);
      }
      for (const item of displacedBandolierItems) {
        if (!sector.addToStash(item)) {
          const discard = game.getEquipmentDiscard(item.equipmentType);
          if (discard) item.putInto(discard);
        }
      }
      if (displacedBandolierItems.length > 0) {
        const names = displacedBandolierItems.map(e => e.equipmentName).join(', ');
        game.message(`Bandolier contents returned: ${names}`);
      }

      // If there are more items in stash, chain another reEquip selection (no action cost - already spent)
      if (sector.stashCount > 0) {
        return {
          success: true,
          message: `Equipped ${equipment.equipmentName}`,
          followUp: {
            action: 'reEquipContinue',
            args: {
              combatantId: unit.id,
              sectorId: sector.id,
              // Pass the replaced item's ID to prevent ping-pong loop
              lastReplacedId: replaced?.id,
            },
            display: {
              combatantId: capitalize(unitName),
              sectorId: sector.sectorName,
              lastReplacedId: replaced?.equipmentName ?? '',
            },
          },
        };
      }

      return { success: true, message: `Equipped ${equipment.equipmentName}` };
    });
}

// =============================================================================
// Re-Equip Continue Action (chained from reEquip via followUp)
// =============================================================================

/**
 * Continue re-equipping from sector stash (no action cost - action already spent).
 * This is chained from reEquip via followUp to allow picking multiple items.
 * Works for both rebel MERCs and dictator units (MERCs and dictator combatant).
 */
export function createReEquipContinueAction(game: MERCGame): ActionDefinition {
  // Helper to resolve unit from ctx.args (combatantId is numeric element ID)
  // Handles both merc and dictator combatants
  function getUnit(ctx: { args?: Record<string, unknown> }): CombatantModel | undefined {
    const combatantArg = ctx.args?.combatantId;
    if (typeof combatantArg === 'number') {
      const el = game.getElementById(combatantArg);
      if (isCombatantModel(el)) return el;
      return undefined;
    } else if (combatantArg && typeof combatantArg === 'object' && 'id' in combatantArg) {
      const combatantObj = combatantArg as { id: number };
      const el = game.getElementById(combatantObj.id);
      if (isCombatantModel(el)) return el;
      return undefined;
    }
    return undefined;
  }

  // Helper to get unit name for display
  function getUnitDisplayName(unit: CombatantModel): string {
    return capitalize(getUnitName(unit));
  }

  // Helper to resolve sector from ctx.args (sectorId is numeric element ID)
  function getSector(ctx: { args?: Record<string, unknown> }): Sector | undefined {
    const sectorArg = ctx.args?.sectorId;
    if (typeof sectorArg === 'number') {
      const el = game.getElementById(sectorArg);
      return (el && el instanceof Sector) ? el : undefined;
    } else if (sectorArg && typeof sectorArg === 'object' && 'id' in sectorArg) {
      const sectorObj = sectorArg as { id: number };
      const el = game.getElementById(sectorObj.id);
      return (el && el instanceof Sector) ? el : undefined;
    }
    return undefined;
  }

  return Action.create('reEquipContinue')
    .prompt('Continue equipping')
    .condition({
      'has combatant and sector from followUp': (ctx) => {
        if (ctx.args?.combatantId == null || ctx.args?.sectorId == null) return false;
        const unit = getUnit(ctx);
        const sector = getSector(ctx);
        return unit != null && sector != null;
      },
    })
    .chooseElement<Equipment>('equipment', {
      prompt: 'Select equipment to equip (or skip to finish)',
      display: (equip) => `${equip.equipmentName} (${equip.equipmentType})`,
      optional: true,
      elementClass: Equipment,
      filter: (element, ctx: ActionContext) => {
        const sector = getSector(ctx);
        if (!sector) return false;
        const inStash = sector.stash.some(e => e.id === element.id);
        if (!inStash) return false;

        // Prevent ping-pong loop: exclude the item that was just returned
        const lastReplacedId = ctx.args?.lastReplacedId;
        if (lastReplacedId && element.id === lastReplacedId) {
          return false;
        }
        return true;
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
        return { success: false, message: 'Invalid unit or sector' };
      }

      const unitName = getUnitDisplayName(unit);

      // User chose "Done equipping"
      if (!equipment) {
        if (sector.stashCount > 0) {
          const remaining = sector.stash.map(e => e.equipmentName).join(', ');
          game.message(`Left in stash: ${remaining}`);
        }
        return { success: true, message: 'Done equipping' };
      }

      // Equip the item
      const { replaced, displacedBandolierItems } = unit.equip(equipment);

      if (replaced) {
        sector.addToStash(replaced);
        game.message(`${unitName} equipped ${equipment.equipmentName}, returned ${replaced.equipmentName}`);
      } else {
        game.message(`${unitName} equipped ${equipment.equipmentName}`);
      }
      for (const item of displacedBandolierItems) {
        if (!sector.addToStash(item)) {
          const discard = game.getEquipmentDiscard(item.equipmentType);
          if (discard) item.putInto(discard);
        }
      }
      if (displacedBandolierItems.length > 0) {
        const names = displacedBandolierItems.map(e => e.equipmentName).join(', ');
        game.message(`Bandolier contents returned: ${names}`);
      }

      // Chain another if more items remain
      if (sector.stashCount > 0) {
        return {
          success: true,
          message: `Equipped ${equipment.equipmentName}`,
          followUp: {
            action: 'reEquipContinue',
            args: {
              combatantId: unit.id,
              sectorId: sector.id,
              // Pass the replaced item's ID to prevent ping-pong loop
              lastReplacedId: replaced?.id,
            },
            display: {
              combatantId: unitName,
              sectorId: sector.sectorName,
              lastReplacedId: replaced?.equipmentName ?? '',
            },
          },
        };
      }

      return { success: true, message: `Equipped ${equipment.equipmentName}` };
    });
}

// =============================================================================
// Drop Equipment Action
// =============================================================================

/**
 * Drop equipment into the sector stash.
 * Cost: 0 actions (free)
 * Allows MERCs to drop equipment they're carrying into the current sector.
 * Works for both rebel and dictator players.
 */
export function createDropEquipmentAction(game: MERCGame): ActionDefinition {
  // Helper to get all equipment a MERC has equipped (uses passed game reference)
  function getMercEquipment(merc: CombatantModel): Equipment[] {
    const equipment: Equipment[] = [];
    if (merc.weaponSlot) equipment.push(merc.weaponSlot);
    if (merc.armorSlot) equipment.push(merc.armorSlot);
    if (merc.accessorySlot) equipment.push(merc.accessorySlot);
    for (const item of merc.bandolierSlots) {
      if (item) equipment.push(item);
    }
    return equipment;
  }

  // Helper to get living combatants for any player type (uses ctx.game to avoid stale refs)
  // Returns MERCs for rebels, hired mercs + dictator combatant for dictator player
  function getPlayerCombatantsFromCtx(ctx: { game: unknown; player: unknown }): CombatantModel[] {
    const g = ctx.game as MERCGame;
    if (g.isRebelPlayer(ctx.player)) {
      return ctx.player.team.filter((m: CombatantModel) => !m.isDead);
    }
    if (g.isDictatorPlayer(ctx.player)) {
      const units: CombatantModel[] = g.dictatorPlayer?.hiredMercs.filter((m: CombatantModel) => !m.isDead) || [];
      // Include dictator combatant if in play
      const dictatorCard = g.dictatorPlayer?.dictator;
      if (dictatorCard?.inPlay && !dictatorCard.isDead) {
        units.push(dictatorCard);
      }
      return units;
    }
    return [];
  }

  // Helper to resolve combatant from ctx.args using ctx.game
  // Works for both mercs and dictator combatant
  function getCombatantFromCtx(ctx: { game: unknown; args?: Record<string, unknown> }): CombatantModel | undefined {
    const g = ctx.game as MERCGame;
    const combatantArg = ctx.args?.actingMerc;
    let combatantElementId: number | undefined;

    if (typeof combatantArg === 'number') {
      combatantElementId = combatantArg;
    } else if (combatantArg && typeof combatantArg === 'object' && 'id' in combatantArg) {
      const combatantObj = combatantArg as { id: number };
      combatantElementId = combatantObj.id;
    }

    if (combatantElementId !== undefined) {
      const el = g.getElementById(combatantElementId);
      return isCombatantModel(el) ? el : undefined;
    }
    return undefined;
  }

  // Helper to find merc's sector using ctx.game
  // Uses merc.sectorId getter directly - more reliable than iterating through ctx.player squads
  // which may not be properly hydrated when passed through the action system
  function findMercSectorFromCtx(merc: CombatantModel, ctx: { game: unknown; player: unknown }): Sector | null {
    const g = ctx.game as MERCGame;
    // CombatantBase has a sectorId getter that returns squad.sectorId
    const sectorId = merc.sectorId;
    if (!sectorId) return null;
    return g.getSector(sectorId) || null;
  }

  return Action.create('dropEquipment')
    .prompt('Unequip')
    .condition({
      'not in combat': (ctx) => isNotInActiveCombat(ctx.game as MERCGame),
      'is rebel or dictator player': (ctx) => {
        const g = ctx.game as MERCGame;
        return g.isRebelPlayer(ctx.player) || g.isDictatorPlayer(ctx.player);
      },
      'has combatant with equipment': (ctx) => {
        const combatants = getPlayerCombatantsFromCtx(ctx);
        return combatants.some(m => getMercEquipment(m).length > 0);
      },
    })
    .fromElements<CombatantModel>('actingMerc', {
      prompt: 'Select combatant to drop equipment from',
      display: (combatant) => capitalize(combatant.combatantName),
      elements: (ctx) => {
        const combatants = getPlayerCombatantsFromCtx(ctx);
        return combatants.filter(m => getMercEquipment(m).length > 0);
      },
    })
    .fromElements<Equipment>('equipment', {
      dependsOn: 'actingMerc',
      prompt: 'Select equipment to drop',
      display: (equip) => `${equip.equipmentName} (${equip.equipmentType})`,
      // Use ctx.game throughout to avoid stale closures
      elements: (ctx) => {
        const g = ctx.game as MERCGame;
        const combatantArg = ctx.args?.actingMerc;

        if (!combatantArg) {
          // Availability check - return ALL equipment from ALL player combatants
          const combatants = getPlayerCombatantsFromCtx(ctx);
          const allEquipment: Equipment[] = [];
          for (const m of combatants) {
            allEquipment.push(...getMercEquipment(m));
          }
          return allEquipment;
        }

        // Combatant is selected - look up by ID to get proper element with getters
        let combatantElementId: number | undefined;
        if (typeof combatantArg === 'number') {
          combatantElementId = combatantArg;
        } else if (combatantArg && typeof combatantArg === 'object' && 'id' in combatantArg) {
          const combatantObj = combatantArg as { id: number };
          combatantElementId = combatantObj.id;
        }
        if (combatantElementId !== undefined) {
          const el = g.getElementById(combatantElementId);
          if (isCombatantModel(el)) {
            return getMercEquipment(el);
          }
        }

        return [];
      },
    })
    .execute((args, ctx) => {
      const g = ctx.game as MERCGame;

      // Always resolve by ID to get full element with all properties
      const combatantArg = args.actingMerc;
      let combatantElementId: number | undefined;
      if (typeof combatantArg === 'number') {
        combatantElementId = combatantArg;
      } else if (combatantArg && typeof combatantArg === 'object' && 'id' in combatantArg) {
        const combatantObj = combatantArg as { id: number };
        combatantElementId = combatantObj.id;
      }
      const combatantEl = combatantElementId !== undefined ? g.getElementById(combatantElementId) : undefined;
      const actingCombatant = isCombatantModel(combatantEl) ? combatantEl : undefined;

      const equipArg = args.equipment;
      let equipId: number | undefined;
      if (typeof equipArg === 'number') {
        equipId = equipArg;
      } else if (equipArg && typeof equipArg === 'object' && 'id' in equipArg) {
        const equipObj = equipArg as { id: number };
        equipId = equipObj.id;
      }
      const equipEl = equipId !== undefined ? g.getElementById(equipId) : undefined;
      const equipment = equipEl instanceof Equipment ? equipEl : undefined;

      if (!actingCombatant || !equipment) {
        return { success: false, message: 'Could not resolve combatant or equipment' };
      }

      const sector = findMercSectorFromCtx(actingCombatant, ctx);
      if (!sector) {
        return { success: false, message: 'Combatant is not in a valid sector' };
      }

      // Unequip the equipment based on which slot it's in
      let droppedItem: Equipment | undefined;
      if (actingCombatant.weaponSlot?.id === equipment.id) {
        droppedItem = actingCombatant.unequip('Weapon');
      } else if (actingCombatant.armorSlot?.id === equipment.id) {
        droppedItem = actingCombatant.unequip('Armor');
      } else if (actingCombatant.accessorySlot?.id === equipment.id) {
        droppedItem = actingCombatant.unequip('Accessory');
        // If dropping a bandolier, also detach all accessories in bandolier slots
        if (droppedItem?.equipmentId === 'bandolier') {
          const bandolierItems = actingCombatant.clearBandolierSlots();
          for (const item of bandolierItems) {
            sector.addToStash(item);
          }
        }
      } else {
        // Check bandolier slots
        for (let i = 0; i < actingCombatant.bandolierSlots.length; i++) {
          if (actingCombatant.bandolierSlots[i]?.id === equipment.id) {
            droppedItem = actingCombatant.unequipBandolierSlot(i);
            break;
          }
        }
      }

      if (!droppedItem) {
        return { success: false, message: 'Equipment not found' };
      }

      // Add to sector stash
      sector.addToStash(droppedItem);

      g.message(`${capitalize(actingCombatant.combatantName)} dropped a piece of equipment in ${sector.sectorName}`);
      return { success: true, message: `Dropped equipment` };
    });
}

// =============================================================================
// Doc Heal Action
// =============================================================================

/**
 * MERC-m4k: Doc's free heal ability
 * Cost: 0 (free action), heals ALL MERCs in Doc's squad
 * Per rules 13-clarifications-and-edge-cases.md:
 * "Heals all MERCs in his squad as a free action outside of combat"
 */
export function createDocHealAction(game: MERCGame): ActionDefinition {
  return Action.create('docHeal')
    .prompt('Doc: Heal squad (free)')
    .condition({
      'not in combat': () => isNotInActiveCombat(game),
      'has living Doc with damaged squad members': (ctx) => {
        // Works for both rebel and dictator players
        if (!game.isRebelPlayer(ctx.player) && !game.isDictatorPlayer(ctx.player)) return false;
        const player = ctx.player as MERCPlayer;
        const doc = player.team.find(m => m.combatantId === 'doc' && !m.isDead);
        if (!doc) return false;
        const docSquad = player.getSquadContaining(doc);
        if (!docSquad) return false;
        const squadMates = docSquad.getMercs().filter(m => m.id !== doc.id && !m.isDead);
        return squadMates.some(m => m.damage > 0) || doc.damage > 0;
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as MERCPlayer;
      const doc = player.team.find(m => m.combatantId === 'doc' && !m.isDead)!;

      // Find Doc's squad using helper method
      const docSquad = player.getSquadContaining(doc);
      const squadMercs = docSquad?.getLivingMercs() || [];

      // Heal all MERCs in squad (including Doc himself)
      let healed = 0;
      for (const merc of squadMercs) {
        if (merc.damage > 0) {
          const healAmount = merc.damage;
          merc.fullHeal();
          game.message(`Doc healed ${merc.combatantName} for ${healAmount} damage`);
          healed++;
        }
      }

      if (healed === 0) {
        return { success: false, message: 'No one to heal' };
      }

      game.message(`Doc healed ${healed} MERC(s) in his squad`);
      return { success: true, message: `Healed ${healed} MERC(s)` };
    });
}

// =============================================================================
// Feedback Discard Action
// =============================================================================

/**
 * MERC-24h: Feedback can take equipment from discard pile
 * Cost: 1 action
 * Per rules: "May take equipment from discard pile"
 */
export function createFeedbackDiscardAction(game: MERCGame): ActionDefinition {
  return Action.create('feedbackDiscard')
    .prompt('Feedback: Take from discard')
    .condition({
      'has living Feedback with actions': (ctx) => {
        // Works for both rebel and dictator players
        if (!game.isRebelPlayer(ctx.player) && !game.isDictatorPlayer(ctx.player)) return false;
        const player = ctx.player as MERCPlayer;
        const feedback = player.team.find(m => m.combatantId === 'feedback' && !m.isDead);
        return feedback != null && feedback.actionsRemaining >= ACTION_COSTS.RE_EQUIP;
      },
      'has equipment in discard piles': () => {
        const weaponDiscard = game.getEquipmentDiscard('Weapon');
        const armorDiscard = game.getEquipmentDiscard('Armor');
        const accessoryDiscard = game.getEquipmentDiscard('Accessory');
        const hasWeapons = weaponDiscard && weaponDiscard.count(Equipment) > 0;
        const hasArmor = armorDiscard && armorDiscard.count(Equipment) > 0;
        const hasAccessories = accessoryDiscard && accessoryDiscard.count(Equipment) > 0;
        return (hasWeapons || hasArmor || hasAccessories) ?? false;
      },
    })
    .chooseElement<Equipment>('equipment', {
      prompt: 'Select equipment from discard pile',
      elementClass: Equipment,
      display: (eq) => `${eq.equipmentName} (${eq.equipmentType})`,
      filter: (element) => {
        // Only show equipment that's actually in a discard pile
        const inWeaponDiscard = game.weaponsDiscard?.all(Equipment).some(e => e.id === element.id) ?? false;
        const inArmorDiscard = game.armorDiscard?.all(Equipment).some(e => e.id === element.id) ?? false;
        const inAccessoryDiscard = game.accessoriesDiscard?.all(Equipment).some(e => e.id === element.id) ?? false;
        return inWeaponDiscard || inArmorDiscard || inAccessoryDiscard;
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as MERCPlayer;
      const feedback = player.team.find(m => m.combatantId === 'feedback' && !m.isDead)!;
      const selectedEquipment = args.equipment as Equipment;

      if (!selectedEquipment) {
        return { success: false, message: 'No equipment selected' };
      }

      // Remove from discard pile
      const discard = game.getEquipmentDiscard(selectedEquipment.equipmentType);
      if (!discard) {
        return { success: false, message: 'Discard pile not found' };
      }

      // Equip to Feedback (or replace existing)
      const { replaced, displacedBandolierItems } = feedback.equip(selectedEquipment);
      if (replaced) {
        // Put replaced equipment back to discard
        const replaceDiscard = game.getEquipmentDiscard(replaced.equipmentType);
        if (replaceDiscard) replaced.putInto(replaceDiscard);
        game.message(`${feedback.combatantName} swapped ${replaced.equipmentName} for ${selectedEquipment.equipmentName}`);
      } else {
        game.message(`${feedback.combatantName} retrieved ${selectedEquipment.equipmentName} from discard`);
      }
      for (const item of displacedBandolierItems) {
        const itemDiscard = game.getEquipmentDiscard(item.equipmentType);
        if (itemDiscard) item.putInto(itemDiscard);
      }
      if (displacedBandolierItems.length > 0) {
        const names = displacedBandolierItems.map(e => e.equipmentName).join(', ');
        game.message(`Bandolier contents discarded: ${names}`);
      }

      feedback.useAction(ACTION_COSTS.RE_EQUIP);
      return { success: true, message: `Retrieved ${selectedEquipment.equipmentName}` };
    });
}

// =============================================================================
// Squidhead Disarm Action
// =============================================================================

/**
 * MERC-4qd: Squidhead can disarm land mines
 * Cost: 0 (free action)
 * Takes a land mine from sector stash and equips it to Squidhead
 */
export function createSquidheadDisarmAction(game: MERCGame): ActionDefinition {
  return Action.create('squidheadDisarm')
    .prompt('Squidhead: Disarm mine')
    .condition({
      'has living Squidhead in sector with land mine': (ctx) => {
        // Works for both rebel and dictator players
        if (!game.isRebelPlayer(ctx.player) && !game.isDictatorPlayer(ctx.player)) return false;
        const player = ctx.player as MERCPlayer;
        const squidhead = player.team.find(m => m.combatantId === 'squidhead' && !m.isDead);
        if (!squidhead) return false;
        const squad = player.getSquadContaining(squidhead);
        if (!squad?.sectorId) return false;
        const sector = game.getSector(squad.sectorId);
        if (!sector) return false;
        const stash = sector.getStashContents();
        return stash.some(e => isLandMine(e.equipmentId));
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as MERCPlayer;
      const squidhead = player.team.find(m => m.combatantId === 'squidhead' && !m.isDead)!;

      // Get Squidhead's sector
      const squad = player.getSquadContaining(squidhead)!;
      const sector = game.getSector(squad.sectorId!)!;

      // Find and remove the land mine
      const stash = sector.getStashContents();
      const mineIndex = stash.findIndex(e => isLandMine(e.equipmentId));
      if (mineIndex === -1) {
        return { success: false, message: 'No land mines to disarm' };
      }

      const mine = sector.takeFromStash(mineIndex)!;

      // Equip to Squidhead if possible, otherwise put in player's inventory
      if (squidhead.canEquip(mine)) {
        const { replaced, displacedBandolierItems } = squidhead.equip(mine);
        if (replaced) {
          sector.addToStash(replaced);
        }
        for (const item of displacedBandolierItems) {
          if (!sector.addToStash(item)) {
            const discard = game.getEquipmentDiscard(item.equipmentType);
            if (discard) item.putInto(discard);
          }
        }
        if (displacedBandolierItems.length > 0) {
          const names = displacedBandolierItems.map(e => e.equipmentName).join(', ');
          game.message(`Bandolier contents returned: ${names}`);
        }
        game.message(`${squidhead.combatantName} disarms and collects the land mine`);
      } else {
        // Put it back in stash but mark as "disarmed" by removing from dictator's control
        sector.addToStash(mine);
        game.message(`${squidhead.combatantName} disarms the land mine (left in stash)`);
      }

      return { success: true, message: 'Disarmed land mine' };
    });
}

// =============================================================================
// Squidhead Arm Action
// =============================================================================

/**
 * MERC-4qd: Squidhead can re-arm land mines
 * Cost: 0 (free action)
 * Places a land mine from Squidhead's equipment into sector stash
 */
export function createSquidheadArmAction(game: MERCGame): ActionDefinition {
  return Action.create('squidheadArm')
    .prompt('Squidhead: Arm mine')
    .condition({
      'Squidhead has land mine equipped': (ctx) => {
        // Works for both rebel and dictator players
        if (!game.isRebelPlayer(ctx.player) && !game.isDictatorPlayer(ctx.player)) return false;
        const player = ctx.player as MERCPlayer;
        const squidhead = player.team.find(m => m.combatantId === 'squidhead' && !m.isDead);
        if (!squidhead) return false;
        const hasLandMineInSlots = [squidhead.weaponSlot, squidhead.armorSlot, squidhead.accessorySlot].some(
          slot => slot && isLandMine(slot.equipmentId)
        );
        const hasLandMineInBandolier = squidhead.bandolierSlots.some(e => isLandMine(e.equipmentId));
        return hasLandMineInSlots || hasLandMineInBandolier;
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as MERCPlayer;
      const squidhead = player.team.find(m => m.combatantId === 'squidhead' && !m.isDead)!;

      // Get Squidhead's sector
      const squad = player.getSquadContaining(squidhead);
      if (!squad?.sectorId) {
        return { success: false, message: 'Squidhead must be on the board' };
      }
      const sector = game.getSector(squad.sectorId);
      if (!sector) {
        return { success: false, message: 'Sector not found' };
      }

      // Find and unequip the land mine
      let mine: Equipment | undefined;
      if (squidhead.accessorySlot && isLandMine(squidhead.accessorySlot.equipmentId)) {
        mine = squidhead.unequip('Accessory');
      } else if (squidhead.weaponSlot && isLandMine(squidhead.weaponSlot.equipmentId)) {
        mine = squidhead.unequip('Weapon');
      } else if (squidhead.armorSlot && isLandMine(squidhead.armorSlot.equipmentId)) {
        mine = squidhead.unequip('Armor');
      } else {
        // Check bandolier slots
        const mineInBandolier = squidhead.bandolierSlots.find(e => isLandMine(e.equipmentId));
        if (mineInBandolier) {
          const slotMatch = mineInBandolier.equippedSlot?.match(/^bandolier:(\d+)$/);
          if (slotMatch) {
            const index = parseInt(slotMatch[1], 10);
            mine = squidhead.unequipBandolierSlot(index);
          }
        }
      }

      if (!mine) {
        return { success: false, message: 'No land mine to arm' };
      }

      sector.addToStash(mine);
      game.message(`${squidhead.combatantName} arms a land mine at ${sector.sectorName}`);

      return { success: true, message: 'Armed land mine' };
    });
}

// =============================================================================
// Hagness Draw Actions (Two-Step Flow)
// =============================================================================

// Settings key for Hagness equipment cache: `hagnessDrawn:${playerId}`
// Stores: { equipmentId, equipmentType, equipmentData (for UI) }
const HAGNESS_CACHE_PREFIX = 'hagnessDrawn';

/**
 * Get the cache key for a player's pending Hagness equipment.
 */
function getHagnessCacheKey(playerId: string): string {
  return `${HAGNESS_CACHE_PREFIX}:${playerId}`;
}

/**
 * Type for cached Hagness equipment data.
 */
interface HagnessEquipmentCache {
  equipmentId: number;
  equipmentType: string;
  equipmentData: {
    equipmentId: number;
    equipmentName: string;
    equipmentType: string;
    description: string;
    combatBonus: number;
    initiative: number;
    training: number;
    targets: number;
    armorBonus: number;
    negatesArmor: boolean;
    serial: number;
    image: string;
  };
}

/**
 * Get cached Hagness equipment for a player.
 */
function getHagnessCache(game: MERCGame, playerId: string): HagnessEquipmentCache | undefined {
  const cacheKey = getHagnessCacheKey(playerId);
  return (game.settings as Record<string, unknown>)[cacheKey] as HagnessEquipmentCache | undefined;
}

/**
 * Set cached Hagness equipment for a player.
 */
function setHagnessCache(game: MERCGame, playerId: string, cache: HagnessEquipmentCache): void {
  const cacheKey = getHagnessCacheKey(playerId);
  (game.settings as Record<string, unknown>)[cacheKey] = cache;
  // Also store in hagnessDrawnEquipmentData for UI to access
  game.hagnessDrawnEquipmentData[playerId] = cache.equipmentData;
}

/**
 * Clear cached Hagness equipment for a player.
 */
function clearHagnessCache(game: MERCGame, playerId: string): void {
  const cacheKey = getHagnessCacheKey(playerId);
  delete (game.settings as Record<string, unknown>)[cacheKey];
  delete game.hagnessDrawnEquipmentData[playerId];
}

/**
 * MERC-jrph: Hagness Draw Type Action (Step 1)
 *
 * First action in the Hagness draw flow:
 * 1. Choose equipment type (Weapon, Armor, or Accessory)
 * 2. Draw 1 equipment of that type
 * 3. Subtract 1 action from Hagness
 * 4. Store equipment in settings for the give action
 * 5. Chain to hagnessGiveEquipment via followUp
 *
 * This separation ensures equipment is drawn and synced to clients BEFORE
 * the recipient selection UI appears.
 */
export function createHagnessDrawTypeAction(game: MERCGame): ActionDefinition {
  return Action.create('hagnessDrawType')
    .prompt('Hagness: Draw equipment for squad')
    .condition({
      'has living Hagness with actions': (ctx) => {
        if (!game.isRebelPlayer(ctx.player) && !game.isDictatorPlayer(ctx.player)) return false;
        const player = ctx.player as MERCPlayer;
        const hagness = player.team.find(m => m.combatantId === 'hagness' && !m.isDead);
        return hagness != null && hagness.actionsRemaining >= 1;
      },
    })
    .chooseFrom<string>('equipmentType', {
      prompt: 'Choose equipment type to draw',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
    })
    .execute((args, ctx) => {
      const player = ctx.player as MERCPlayer;
      const playerId = `${player.seat}`;
      const equipmentType = args.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
      const hagness = player.team.find(m => m.combatantId === 'hagness' && !m.isDead)!;

      // Draw equipment
      const equipment = game.drawEquipment(equipmentType);
      if (!equipment) {
        return { success: false, message: `No ${equipmentType} cards in deck` };
      }

      // Store equipment in settings for the give action and UI
      const cache: HagnessEquipmentCache = {
        equipmentId: equipment.id,
        equipmentType,
        equipmentData: {
          equipmentId: equipment.id,
          equipmentName: equipment.equipmentName,
          equipmentType: equipment.equipmentType,
          description: equipment.description || '',
          combatBonus: equipment.combatBonus || 0,
          initiative: equipment.initiative || 0,
          training: equipment.training || 0,
          targets: equipment.targets || 0,
          armorBonus: equipment.armorBonus || 0,
          negatesArmor: equipment.negatesArmor || false,
          serial: equipment.serial || 0,
          image: equipment.image || '',
        },
      };
      setHagnessCache(game, playerId, cache);

      // Subtract action from Hagness
      hagness.useAction(1);

      // Chain to the give action
      return {
        success: true,
        message: `Drew ${equipment.equipmentName}`,
        followUp: {
          action: 'hagnessGiveEquipment',
          args: { equipmentId: equipment.id },
          display: { equipmentId: equipment.equipmentName },
        },
      };
    });
}

/**
 * MERC-jrph: Hagness Give Equipment Action (Step 2)
 *
 * Second action in the Hagness draw flow (chained via followUp):
 * 1. Retrieve drawn equipment from settings
 * 2. Show equipment card and recipient choices
 * 3. Equip to selected recipient
 *
 * If cancelled (no recipient selected), equipment drops in Hagness's sector.
 */
export function createHagnessGiveEquipmentAction(game: MERCGame): ActionDefinition {
  return Action.create('hagnessGiveEquipment')
    .prompt('Give equipment to squad member')
    .condition({
      'has pending equipment': (ctx) => {
        if (!game.isRebelPlayer(ctx.player) && !game.isDictatorPlayer(ctx.player)) return false;
        const player = ctx.player as MERCPlayer;
        const playerId = `${player.seat}`;
        return getHagnessCache(game, playerId) != null;
      },
    })
    .chooseFrom<string>('recipient', {
      prompt: 'Give to which squad member?',
      optional: true, // Allow cancel to drop in sector
      choices: (ctx) => {
        if (!game.isRebelPlayer(ctx.player) && !game.isDictatorPlayer(ctx.player)) {
          return [];
        }
        const player = ctx.player as MERCPlayer;
        const hagness = player.team.find(m => m.combatantId === 'hagness' && !m.isDead);
        if (!hagness) return [];

        const hagnessSquad = player.getSquadContaining(hagness);
        if (!hagnessSquad) return [];

        const squadMates = hagnessSquad.getLivingMercs();
        return squadMates.map(m => capitalize(m.combatantName));
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as MERCPlayer;
      const playerId = `${player.seat}`;
      const cache = getHagnessCache(game, playerId);

      if (!cache) {
        return { success: false, message: 'No pending equipment' };
      }

      const equipment = game.getElementById(cache.equipmentId) as Equipment | undefined;
      if (!equipment) {
        clearHagnessCache(game, playerId);
        return { success: false, message: 'Equipment not found' };
      }

      const hagness = player.team.find(m => m.combatantId === 'hagness' && !m.isDead);
      if (!hagness) {
        clearHagnessCache(game, playerId);
        return { success: false, message: 'Hagness not found' };
      }

      // Handle cancel - drop equipment in sector
      const recipientArg = args.recipient;
      if (!recipientArg) {
        const hagnessSquad = player.getSquadContaining(hagness);
        if (hagnessSquad?.sectorId) {
          const sector = game.getSector(hagnessSquad.sectorId);
          if (sector) {
            sector.addToStash(equipment);
            game.message(`${equipment.equipmentName} dropped in ${sector.sectorName}`);
          }
        }
        clearHagnessCache(game, playerId);
        return { success: true, message: 'Equipment dropped in sector' };
      }

      // Find recipient MERC
      const hagnessSquad = player.getSquadContaining(hagness);
      if (!hagnessSquad) {
        clearHagnessCache(game, playerId);
        return { success: false, message: 'Hagness squad not found' };
      }

      // Handle recipient - might be string or object
      let recipientName: string;
      if (typeof recipientArg === 'string') {
        recipientName = recipientArg;
      } else if (recipientArg && typeof recipientArg === 'object') {
        const recipientObj = recipientArg as { value?: string; display?: string };
        recipientName = recipientObj.value || recipientObj.display || String(recipientArg);
      } else {
        recipientName = String(recipientArg || '');
      }

      const recipient = hagnessSquad.getLivingMercs().find(m =>
        capitalize(m.combatantName) === recipientName
      );

      if (!recipient) {
        clearHagnessCache(game, playerId);
        return { success: false, message: 'Recipient not found' };
      }

      // Equip
      const { replaced, displacedBandolierItems } = recipient.equip(equipment);
      if (replaced) {
        const discard = game.getEquipmentDiscard(replaced.equipmentType);
        if (discard) replaced.putInto(discard);
      }
      for (const item of displacedBandolierItems) {
        const itemDiscard = game.getEquipmentDiscard(item.equipmentType);
        if (itemDiscard) item.putInto(itemDiscard);
      }
      if (displacedBandolierItems.length > 0) {
        const names = displacedBandolierItems.map(e => e.equipmentName).join(', ');
        game.message(`Bandolier contents discarded: ${names}`);
      }

      // Clear cache
      clearHagnessCache(game, playerId);

      game.message(`Hagness gives ${equipment.equipmentName} to ${recipient.combatantName}`);
      return { success: true, message: `Gave ${equipment.equipmentName} to ${recipient.combatantName}` };
    });
}

/**
 * Legacy action name for backwards compatibility.
 * Redirects to hagnessDrawType.
 */
export function createHagnessDrawAction(game: MERCGame): ActionDefinition {
  return createHagnessDrawTypeAction(game);
}

// =============================================================================
// Repair Kit Action
// =============================================================================

/**
 * Helper to check if a combatant has Repair Kit equipped
 */
function combatantHasRepairKit(combatant: CombatantModel): boolean {
  if (combatant.isDead) return false;
  // Check accessory slot
  if (combatant.accessorySlot && isRepairKit(combatant.accessorySlot.equipmentId)) return true;
  // Check bandolier slots
  return combatant.bandolierSlots.some(e => isRepairKit(e.equipmentId));
}

/**
 * Helper to find combatants with Repair Kit equipped - works for both rebel and dictator
 * Returns MERCs for rebels, hired mercs + dictator combatant for dictator player
 */
function getCombatantsWithRepairKit(player: unknown, game: MERCGame): CombatantModel[] {
  if (game.isRebelPlayer(player)) {
    return player.team.filter(combatantHasRepairKit);
  }
  if (game.isDictatorPlayer(player)) {
    const units: CombatantModel[] = game.dictatorPlayer?.hiredMercs.filter(combatantHasRepairKit) || [];
    // Include dictator combatant if in play and has repair kit
    const dictatorCard = game.dictatorPlayer?.dictator;
    if (dictatorCard?.inPlay && combatantHasRepairKit(dictatorCard)) {
      units.push(dictatorCard);
    }
    return units;
  }
  return [];
}

/**
 * Helper to get available equipment from discard piles
 */
function getDiscardPileEquipment(game: MERCGame): Array<{ equipment: Equipment; pileType: 'Weapon' | 'Armor' | 'Accessory' }> {
  const result: Array<{ equipment: Equipment; pileType: 'Weapon' | 'Armor' | 'Accessory' }> = [];

  const weaponDiscard = game.weaponsDiscard?.children as unknown as Equipment[] | undefined;
  const armorDiscard = game.armorDiscard?.children as unknown as Equipment[] | undefined;
  const accessoryDiscard = game.accessoriesDiscard?.children as unknown as Equipment[] | undefined;

  if (weaponDiscard) {
    for (const e of weaponDiscard) {
      result.push({ equipment: e, pileType: 'Weapon' });
    }
  }
  if (armorDiscard) {
    for (const e of armorDiscard) {
      result.push({ equipment: e, pileType: 'Armor' });
    }
  }
  if (accessoryDiscard) {
    for (const e of accessoryDiscard) {
      result.push({ equipment: e, pileType: 'Accessory' });
    }
  }

  return result;
}

/**
 * Use a Repair Kit to retrieve equipment from any discard pile.
 * Cost: 0 (free action)
 * Per rules: "Discard this card to take 1 card from any equipment discard pile."
 */
export function createRepairKitAction(game: MERCGame): ActionDefinition {
  return Action.create('repairKit')
    .prompt('Use Repair Kit')
    .condition({
      'not in combat': () => isNotInActiveCombat(game),
      'has combatant with repair kit': (ctx) => getCombatantsWithRepairKit(ctx.player, game).length > 0,
      'has equipment in discard piles': () => getDiscardPileEquipment(game).length > 0,
    })
    .chooseElement<CombatantModel>('combatant', {
      prompt: 'Select combatant to use Repair Kit',
      elementClass: CombatantModel,
      display: (combatant) => capitalize(combatant.combatantName),
      filter: (element, ctx) => {
        if (!isCombatantModel(element)) return false;
        // Use unified helper - checks ownership, living status, and repair kit
        const combatantsWithKit = getCombatantsWithRepairKit(ctx.player, game);
        return combatantsWithKit.some(m => m.id === element.id);
      },
    })
    .chooseFrom<string>('equipment', {
      prompt: 'Select equipment to retrieve from discard',
      choices: () => {
        const discardEquip = getDiscardPileEquipment(game);
        return discardEquip.map(({ equipment, pileType }) =>
          `${equipment.equipmentName} (${pileType})`
        );
      },
    })
    .execute((args, ctx) => {
      const combatant = args.combatant as CombatantModel;
      const equipmentChoice = args.equipment as string;

      // Find the Repair Kit on the combatant
      let repairKit: Equipment | undefined;
      let repairKitSlot: 'Accessory' | 'bandolier' = 'Accessory';
      let bandolierIndex = -1;

      if (combatant.accessorySlot && isRepairKit(combatant.accessorySlot.equipmentId)) {
        repairKit = combatant.accessorySlot;
        repairKitSlot = 'Accessory';
      } else {
        const idx = combatant.bandolierSlots.findIndex(e => isRepairKit(e.equipmentId));
        if (idx >= 0) {
          repairKit = combatant.bandolierSlots[idx];
          repairKitSlot = 'bandolier';
          bandolierIndex = idx;
        }
      }

      if (!repairKit) {
        return { success: false, message: 'No Repair Kit found on combatant' };
      }

      // Find the selected equipment in discard
      const discardEquip = getDiscardPileEquipment(game);
      const selected = discardEquip.find(({ equipment, pileType }) =>
        `${equipment.equipmentName} (${pileType})` === equipmentChoice
      );

      if (!selected) {
        return { success: false, message: 'Equipment not found in discard' };
      }

      // Remove repair kit from combatant and discard it
      if (repairKitSlot === 'Accessory') {
        combatant.unequip('Accessory');
      } else {
        combatant.unequipBandolierSlot(bandolierIndex);
      }
      const accessoryDiscard = game.getEquipmentDiscard('Accessory');
      if (accessoryDiscard) {
        repairKit.putInto(accessoryDiscard);
      }

      // Take the equipment from discard
      const retrievedEquip = selected.equipment;
      const pileType = selected.pileType;

      // Find the combatant's sector to put equipment in stash (works for both player types)
      const sector = findUnitSector(combatant, ctx.player, game);
      if (!sector) {
        return { success: false, message: 'Combatant not in a valid sector' };
      }

      // Remove from discard pile and add to sector stash
      const discardPile = game.getEquipmentDiscard(pileType);
      if (discardPile) {
        // Repair the equipment (reset isDamaged + armorDamage) before stashing
        retrievedEquip.repair();
        // Move from discard to stash
        sector.addToStash(retrievedEquip);
      }

      game.message(`${combatant.combatantName} uses Repair Kit to retrieve ${retrievedEquip.equipmentName} from discard`);

      return {
        success: true,
        message: `Retrieved ${retrievedEquip.equipmentName} from ${pileType} discard`,
        data: { retrievedEquipment: retrievedEquip.equipmentName },
      };
    });
}

// =============================================================================
// Mortar Action (Ranged Attack)
// =============================================================================

// =============================================================================
// Mortar Action Helpers (work for both player types)
// =============================================================================

/**
 * Get valid mortar targets based on player type.
 * Rebels target dictator forces, dictator targets rebel forces.
 */
function getMortarTargets(game: MERCGame, fromSector: Sector, player: any): Sector[] {
  const adjacent = game.getAdjacentSectors(fromSector);

  if (game.isRebelPlayer(player)) {
    // Rebels target dictator forces
    return adjacent.filter(sector => {
      const hasDictatorMercs = game.dictatorPlayer?.hiredMercs.some(m =>
        m.sectorId === sector.sectorId && !m.isDead
      ) ?? false;
      const hasDictator = game.dictatorPlayer?.dictator?.sectorId === sector.sectorId &&
                          game.dictatorPlayer?.dictator?.inPlay;
      const hasDictatorMilitia = sector.dictatorMilitia > 0;
      return hasDictatorMercs || hasDictator || hasDictatorMilitia;
    });
  } else if (game.isDictatorPlayer(player)) {
    // Dictator targets rebel forces
    return adjacent.filter(sector => {
      // Check for rebel MERCs
      const hasRebelMercs = game.rebelPlayers.some(rebel =>
        rebel.team.some(m => m.sectorId === sector.sectorId && !m.isDead)
      );
      // Check for rebel militia
      const hasRebelMilitia = game.rebelPlayers.some(rebel =>
        sector.getRebelMilitia(`${rebel.seat}`) > 0
      );
      return hasRebelMercs || hasRebelMilitia;
    });
  }
  return [];
}

/**
 * Count enemy targets in a sector based on player type.
 */
function countEnemyTargetsInSector(game: MERCGame, sector: Sector, player: any): number {
  let count = 0;

  if (game.isRebelPlayer(player)) {
    // Count dictator targets
    const dictatorMercs = game.dictatorPlayer?.hiredMercs.filter(m =>
      m.sectorId === sector.sectorId && !m.isDead
    ) ?? [];
    count += dictatorMercs.length;

    if (game.dictatorPlayer?.dictator?.sectorId === sector.sectorId &&
        game.dictatorPlayer?.dictator?.inPlay) {
      count += 1;
    }
    count += sector.dictatorMilitia;
  } else if (game.isDictatorPlayer(player)) {
    // Count rebel targets
    for (const rebel of game.rebelPlayers) {
      count += rebel.team.filter(m => m.sectorId === sector.sectorId && !m.isDead).length;
      count += sector.getRebelMilitia(`${rebel.seat}`);
    }
  }

  return count;
}

/**
 * Get units with mortars for any player type.
 * Includes both MERCs and dictator combatant for dictator player.
 */
function getMercsWithMortars(game: MERCGame, player: any): CombatantModel[] {
  if (game.isRebelPlayer(player)) {
    const team = (player as RebelPlayer).team;
    return team.filter(m =>
      !m.isDead && m.actionsRemaining >= 1 && hasMortar(m)
    );
  }
  if (game.isDictatorPlayer(player)) {
    const units: CombatantModel[] = [];
    // Add hired MERCs with mortars
    const hiredMercs = game.dictatorPlayer?.hiredMercs.filter(m =>
      !m.isDead && m.actionsRemaining >= 1 && hasMortar(m)
    ) || [];
    units.push(...hiredMercs);
    // Add dictator combatant if it has mortar and is in play
    const dictator = game.dictatorPlayer?.dictator;
    if (dictator?.inPlay && !dictator.isDead && dictator.actionsRemaining >= 1 && hasMortar(dictator)) {
      units.push(dictator);
    }
    return units;
  }
  return [];
}

/**
 * Check if unit belongs to player (for mortar action).
 * Handles both merc and dictator combatants.
 */
function isUnitOwnedForMortar(unit: CombatantModel, player: any, game: MERCGame): boolean {
  if (game.isRebelPlayer(player)) {
    return unit.isMerc && isInPlayerTeam(unit as CombatantModel, player as RebelPlayer);
  }
  if (game.isDictatorPlayer(player)) {
    if (unit.isDictator) {
      return unit.id === game.dictatorPlayer?.dictator?.id;
    }
    const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
    return dictatorMercs.some(m => m.id === unit.id);
  }
  return false;
}

/**
 * Fire mortar at an adjacent sector.
 * Cost: 1 action
 * Per rules: Mortars attack adjacent sectors without entering them.
 * Deals 1 damage to all enemies in the target sector.
 * Works for both rebel and dictator players.
 */
export function createMortarAction(game: MERCGame): ActionDefinition {
  return Action.create('mortar')
    .prompt('Fire Mortar')
    .condition({
      'not in combat': () => isNotInActiveCombat(game),
      'is rebel or dictator player': (ctx) => game.isRebelPlayer(ctx.player) || game.isDictatorPlayer(ctx.player),
      'has unit with mortar and valid targets': (ctx) => {
        const mercsWithMortars = getMercsWithMortars(game, ctx.player);
        for (const merc of mercsWithMortars) {
          const sector = findUnitSector(merc, ctx.player, game);
          if (!sector) continue;
          const targets = getMortarTargets(game, sector, ctx.player);
          if (targets.length > 0) {
            return true;
          }
        }
        return false;
      },
    })
    .chooseFrom<string>('unitId', {
      prompt: 'Select unit to fire mortar',
      choices: (ctx) => {
        const units = getMercsWithMortars(game, ctx.player);
        return units.filter(unit => {
          const sector = findUnitSector(unit, ctx.player, game);
          if (!sector) return false;
          const targets = getMortarTargets(game, sector, ctx.player);
          return targets.length > 0;
        }).map(unit => {
          const name = (unit as CombatantModel).combatantName;
          return capitalize(name);
        });
      },
    })
    .chooseFrom<string>('targetSectorName', {
      dependsOn: 'unitId', // Target selection depends on which unit is firing
      prompt: 'Select sector to bombard',
      choices: (ctx) => {
        // Find the selected unit
        const unitName = ctx.args?.unitId as string;
        const units = getMercsWithMortars(game, ctx.player);
        const unit = units.find(u => {
          const name = (u as CombatantModel).combatantName;
          return capitalize(name) === unitName;
        });
        if (!unit) return [];

        const sector = findUnitSector(unit, ctx.player, game);
        if (!sector) return [];

        const validTargets = getMortarTargets(game, sector, ctx.player);
        return validTargets.map(t => `${t.sectorName} (${countEnemyTargetsInSector(game, t, ctx.player)} targets)`);
      },
    })
    .execute((args, ctx) => {
      // Find the unit by name
      const unitName = args.unitId as string;
      const units = getMercsWithMortars(game, ctx.player);
      const unit = units.find(u => {
        const name = (u as CombatantModel).combatantName;
        return capitalize(name) === unitName;
      });

      // Find the target sector (extract name from display format)
      const targetSectorDisplay = args.targetSectorName as string;
      const targetSectorName = targetSectorDisplay.replace(/ \(\d+ targets?\)$/, '');
      const targetSector = game.gameMap.getAllSectors().find(s => s.sectorName === targetSectorName);

      if (!unit || !targetSector) {
        return { success: false, message: 'Invalid unit or target sector' };
      }
      const isRebel = game.isRebelPlayer(ctx.player);

      // Use action
      unit.useAction(1);

      const unitDisplayName = (unit as CombatantModel).combatantName;

      // Roll dice: attacker's effectiveCombat dice, with their hit threshold
      const diceCount = unit.effectiveCombat;
      const hitThreshold = getHitThreshold(unit.combatantId);
      const diceRolls = rollDice(diceCount, game);
      const hits = diceRolls.filter(r => r >= hitThreshold).length;

      game.message(`${unitDisplayName} fires mortar at ${targetSector.sectorName}! Rolls [${diceRolls.join(', ')}] - ${hits} hit(s)`);

      // Discard the mortar after use (mortars are one-use) — fired regardless of hits
      discardMortar(unit, unitDisplayName, game);

      // Build valid targets list
      const validTargets = buildMortarTargets(game, targetSector, isRebel);

      // 0 hits — just animate the miss and return
      if (hits === 0) {
        game.animate('mortar-strike', {
          targetSectorId: targetSector.sectorId,
          hitCombatantIds: [] as string[],
          militiaKilled: 0,
          diceRolls,
          hits: 0,
          hitThreshold,
          attackerName: capitalize(unitDisplayName),
        });

        game.message(`All mortar shots miss!`);
        return {
          success: true,
          message: 'Mortar attack missed',
          data: { totalDamage: 0 },
        };
      }

      // AI player: auto-allocate hits and apply damage immediately
      if ((ctx.player as MERCPlayer).isAI) {
        const { totalDamage, hitCombatantIds, militiaKilled } = autoAllocateAndApplyMortarHits(
          game, targetSector, validTargets, hits, isRebel,
        );

        game.animate('mortar-strike', {
          targetSectorId: targetSector.sectorId,
          hitCombatantIds,
          militiaKilled,
          diceRolls,
          hits,
          hitThreshold,
          attackerName: capitalize(unitDisplayName),
        });

        return {
          success: true,
          message: `Mortar attack dealt ${totalDamage} damage`,
          data: { totalDamage },
        };
      }

      // Human player: set pending state for allocation panel
      game.pendingMortarAttack = {
        attackerName: capitalize(unitDisplayName),
        attackerCombatantId: unit.combatantId,
        attackerImage: unit.image,
        targetSectorId: targetSector.sectorId,
        targetSectorName: targetSector.sectorName,
        diceRolls,
        hits,
        hitThreshold,
        attackingPlayerId: `${ctx.player.seat}`,
        validTargets,
      };

      // Pure UI signal so the panel mounts
      game.animate('mortar-attack-panel', {
        attackerName: capitalize(unitDisplayName),
        attackerCombatantId: unit.combatantId,
        attackerImage: unit.image,
        targetSectorId: targetSector.sectorId,
        targetSectorName: targetSector.sectorName,
        diceRolls,
        hits,
        hitThreshold,
        validTargets,
      }, () => {});

      return {
        success: true,
        message: `Mortar attack: ${hits} hits to allocate`,
        data: { hits },
      };
    });
}

// =============================================================================
// Mortar Helpers
// =============================================================================

/**
 * Discard the mortar from the unit after firing.
 */
function discardMortar(unit: CombatantModel, unitDisplayName: string, game: MERCGame): void {
  const accessoryDiscard = game.getEquipmentDiscard('Accessory');
  if (unit.accessorySlot && hasRangedAttack(unit.accessorySlot.equipmentId)) {
    const mortar = unit.unequip('Accessory');
    if (mortar && accessoryDiscard) {
      mortar.putInto(accessoryDiscard);
    }
    game.message(`${unitDisplayName}'s mortar is used up!`);
  } else {
    // Check bandolier slots
    const mortarInBandolier = unit.bandolierSlots.find(e => hasRangedAttack(e.equipmentId));
    if (mortarInBandolier) {
      const slotMatch = mortarInBandolier.equippedSlot?.match(/^bandolier:(\d+)$/);
      if (slotMatch) {
        const index = parseInt(slotMatch[1], 10);
        unit.unequipBandolierSlot(index);
        if (accessoryDiscard) {
          mortarInBandolier.putInto(accessoryDiscard);
        }
        game.message(`${unitDisplayName}'s mortar is used up!`);
      }
    }
  }
}

/**
 * Build the valid target list for a mortar attack into a sector.
 * Each militia unit is a separate target entry with 1 HP.
 */
export function buildMortarTargets(
  game: MERCGame,
  targetSector: Sector,
  isRebel: boolean,
): Array<{
  id: string;
  name: string;
  type: 'merc' | 'dictator' | 'militia';
  ownerId?: string;
  currentHealth: number;
  maxHealth: number;
  image?: string;
  playerColor?: string;
}> {
  const targets: Array<{
    id: string;
    name: string;
    type: 'merc' | 'dictator' | 'militia';
    ownerId?: string;
    currentHealth: number;
    maxHealth: number;
    image?: string;
    playerColor?: string;
  }> = [];

  if (isRebel) {
    // Target dictator MERCs
    const dictatorMercs = game.dictatorPlayer?.hiredMercs.filter(m =>
      m.sectorId === targetSector.sectorId && !m.isDead
    ) ?? [];
    for (const m of dictatorMercs) {
      targets.push({
        id: m.combatantId,
        name: capitalize(m.combatantName),
        type: 'merc',
        currentHealth: m.health,
        maxHealth: m.maxHealth,
        image: m.image,
      });
    }

    // Target the Dictator
    const dictator = game.dictatorPlayer?.dictator;
    if (dictator && dictator.sectorId === targetSector.sectorId && dictator.inPlay && !dictator.isDead) {
      targets.push({
        id: dictator.combatantId,
        name: capitalize(dictator.combatantName),
        type: 'dictator',
        currentHealth: dictator.health,
        maxHealth: dictator.maxHealth,
        image: dictator.image,
      });
    }

    // Target dictator militia (each is a separate target with 1 HP)
    for (let i = 0; i < targetSector.dictatorMilitia; i++) {
      targets.push({
        id: `militia-dictator-${i}`,
        name: `Dictator Militia`,
        type: 'militia',
        currentHealth: 1,
        maxHealth: 1,
      });
    }
  } else {
    // Dictator targeting rebels
    for (const rebel of game.rebelPlayers) {
      const rebelMercs = rebel.team.filter(m =>
        m.sectorId === targetSector.sectorId && !m.isDead
      );
      for (const m of rebelMercs) {
        targets.push({
          id: m.combatantId,
          name: capitalize(m.combatantName),
          type: 'merc',
          ownerId: `${rebel.seat}`,
          currentHealth: m.health,
          maxHealth: m.maxHealth,
          image: m.image,
          playerColor: (rebel as any).playerColorHex,
        });
      }

      // Rebel militia (each is a separate target with 1 HP)
      const militiaCount = targetSector.getRebelMilitia(`${rebel.seat}`);
      for (let i = 0; i < militiaCount; i++) {
        targets.push({
          id: `militia-rebel-${rebel.seat}-${i}`,
          name: `Rebel Militia`,
          type: 'militia',
          ownerId: `${rebel.seat}`,
          currentHealth: 1,
          maxHealth: 1,
          playerColor: (rebel as any).playerColorHex,
        });
      }
    }
  }

  return targets;
}

/**
 * Auto-allocate mortar hits for AI players: prioritize low-health targets to secure kills,
 * then spread remaining hits.
 */
function autoAllocateAndApplyMortarHits(
  game: MERCGame,
  targetSector: Sector,
  validTargets: Array<{
    id: string;
    name: string;
    type: 'merc' | 'dictator' | 'militia';
    ownerId?: string;
    currentHealth: number;
    maxHealth: number;
  }>,
  hits: number,
  isRebel: boolean,
): { totalDamage: number; hitCombatantIds: string[]; militiaKilled: number } {
  // Sort targets: lowest health first (to secure kills), militia last
  const sortedTargets = [...validTargets].sort((a, b) => {
    if (a.type === 'militia' && b.type !== 'militia') return 1;
    if (a.type !== 'militia' && b.type === 'militia') return -1;
    return a.currentHealth - b.currentHealth;
  });

  const hitsByTarget = new Map<string, number>();
  let remaining = hits;

  // Allocate hits
  for (const target of sortedTargets) {
    if (remaining <= 0) break;
    const hitsForTarget = Math.min(remaining, target.currentHealth);
    hitsByTarget.set(target.id, hitsForTarget);
    remaining -= hitsForTarget;
  }

  // Apply damage
  return applyMortarDamage(game, targetSector, validTargets, hitsByTarget, isRebel);
}

/**
 * Apply mortar damage based on hit allocation.
 * Used by both AI auto-allocate and human allocation action.
 */
export function applyMortarDamage(
  game: MERCGame,
  targetSector: Sector,
  validTargets: Array<{
    id: string;
    name: string;
    type: 'merc' | 'dictator' | 'militia';
    ownerId?: string;
    currentHealth: number;
    maxHealth: number;
  }>,
  hitsByTarget: Map<string, number>,
  isRebel: boolean,
): { totalDamage: number; hitCombatantIds: string[]; militiaKilled: number } {
  let totalDamage = 0;
  const hitCombatantIds: string[] = [];
  let militiaKilled = 0;

  for (const [targetId, hitCount] of hitsByTarget) {
    const target = validTargets.find(t => t.id === targetId);
    if (!target) continue;

    if (target.type === 'militia') {
      // Each militia target is 1 HP — remove one militia from the sector
      if (isRebel) {
        targetSector.removeDictatorMilitia(1);
      } else {
        const ownerId = target.ownerId;
        if (ownerId) {
          targetSector.removeRebelMilitia(ownerId, 1);
        }
      }
      militiaKilled++;
      totalDamage++;
      game.message(`Mortar kills 1 militia`);
    } else {
      // MERC or Dictator
      const merc = findCombatantById(game, targetId, isRebel);
      if (merc) {
        for (let i = 0; i < hitCount; i++) {
          merc.takeDamage(1);
          totalDamage++;
        }
        hitCombatantIds.push(merc.combatantId);
        game.message(`Mortar deals ${hitCount} damage to ${capitalize(merc.combatantName)}`);
        if (merc.isDead) {
          game.message(`${capitalize(merc.combatantName)} has been killed by mortar!`);
          if (merc.isDictator) {
            game.message(`THE DICTATOR HAS BEEN KILLED BY MORTAR! REBELS WIN!`);
          }
        }
      }
    }
  }

  return { totalDamage, hitCombatantIds, militiaKilled };
}

/**
 * Find a combatant by their combatantId.
 */
function findCombatantById(game: MERCGame, combatantId: string, isRebel: boolean): CombatantModel | undefined {
  if (isRebel) {
    // Mortar is hitting dictator side
    const dictator = game.dictatorPlayer?.dictator;
    if (dictator?.combatantId === combatantId) return dictator;
    return game.dictatorPlayer?.hiredMercs.find(m => m.combatantId === combatantId);
  } else {
    // Mortar is hitting rebel side
    for (const rebel of game.rebelPlayers) {
      const merc = rebel.team.find(m => m.combatantId === combatantId);
      if (merc) return merc;
    }
    return undefined;
  }
}

// =============================================================================
// Explosives / Detonator Win Condition
// =============================================================================

/**
 * Check if a MERC has both explosives components (detonator + explosives).
 */
function hasBothExplosivesComponents(merc: CombatantModel): boolean {
  const allEquipment: Equipment[] = [];

  // Collect all equipment from MERC
  if (merc.weaponSlot) allEquipment.push(merc.weaponSlot);
  if (merc.armorSlot) allEquipment.push(merc.armorSlot);
  if (merc.accessorySlot) allEquipment.push(merc.accessorySlot);
  allEquipment.push(...merc.bandolierSlots);

  // Check for both components
  const componentIds = allEquipment
    .filter(e => isExplosivesComponent(e.equipmentId))
    .map(e => e.equipmentId);

  // Need both detonator and explosives
  return componentIds.includes('detonator') && componentIds.includes('explosives');
}

/**
 * Detonate explosives in the palace to win the game.
 * Cost: 1 action
 * Per rules: When a MERC has both Detonator and Explosives in the dictator's base,
 * they can use this action to destroy the palace and win the game.
 */
export function createDetonateExplosivesAction(game: MERCGame): ActionDefinition {
  return Action.create('detonateExplosives')
    .prompt('Detonate Explosives (Win Game)')
    .condition({
      'not in combat': () => isNotInActiveCombat(game),
      'is rebel player': (ctx) => game.isRebelPlayer(ctx.player),
      'dictator base revealed': () => game.dictatorPlayer?.baseRevealed && game.dictatorPlayer?.baseSectorId != null,
      'has merc in base with explosives components': (ctx) => {
        if (!game.isRebelPlayer(ctx.player)) return false;
        const player = ctx.player as RebelPlayer;
        const baseSectorId = game.dictatorPlayer?.baseSectorId;
        if (!baseSectorId) return false;
        for (const merc of player.team) {
          if (merc.isDead || merc.actionsRemaining < 1) continue;
          const squad = player.getSquadContaining(merc);
          if (!squad || squad.sectorId !== baseSectorId) continue;
          if (hasBothExplosivesComponents(merc)) return true;
        }
        return false;
      },
    })
    .chooseElement<CombatantModel>('merc', {
      prompt: 'Select MERC to detonate explosives',
      elementClass: CombatantModel,
      display: (merc) => capitalize(merc.combatantName),
      filter: (element, ctx) => {
        if (!game.isRebelPlayer(ctx.player)) return false;
        if (!isCombatantModel(element) || !element.isMerc) return false;
        const merc = element;

        if (!isInPlayerTeam(merc, ctx.player)) return false;
        if (merc.isDead || merc.actionsRemaining < 1) return false;

        // Must be in base sector
        const baseSectorId = game.dictatorPlayer?.baseSectorId;
        if (!baseSectorId) return false;

        const squad = ctx.player.getSquadContaining(merc);
        if (!squad || squad.sectorId !== baseSectorId) return false;

        return hasBothExplosivesComponents(merc);
      },
    })
    .execute((args, ctx) => {
      if (!game.isRebelPlayer(ctx.player)) {
        return { success: false, message: 'Only rebels can detonate explosives' };
      }
      const player = ctx.player;
      const merc = isCombatantModel(args.merc) && args.merc.isMerc ? args.merc : undefined;
      if (!merc) {
        return { success: false, message: 'Invalid merc' };
      }

      // Use action
      merc.useAction(1);

      // Get base sector for messaging
      const baseSector = game.getSector(game.dictatorPlayer!.baseSectorId!);
      const sectorName = baseSector?.sectorName ?? 'the palace';

      game.message(`${merc.combatantName} detonates the explosives!`);
      game.message(`BOOM! The palace is destroyed!`);
      game.message(`THE DICTATOR'S REGIME HAS FALLEN! REBELS WIN!`);

      // Mark game as over - rebels win via explosives
      game.explosivesVictory = true;

      // Remove the explosives components (consumed)
      const allSlots: Array<{ slot: 'Weapon' | 'Armor' | 'Accessory', item?: Equipment }> = [
        { slot: 'Weapon', item: merc.weaponSlot },
        { slot: 'Armor', item: merc.armorSlot },
        { slot: 'Accessory', item: merc.accessorySlot },
      ];

      for (const { slot, item } of allSlots) {
        if (item && isExplosivesComponent(item.equipmentId)) {
          merc.unequip(slot);
          const discard = game.getEquipmentDiscard(item.equipmentType as 'Weapon' | 'Armor' | 'Accessory');
          if (discard) item.putInto(discard);
        }
      }

      // Check bandolier slots
      const bandolierIndicesToRemove: number[] = [];
      merc.bandolierSlots.forEach((item, idx) => {
        if (isExplosivesComponent(item.equipmentId)) {
          bandolierIndicesToRemove.push(idx);
        }
      });
      // Remove in reverse order to preserve indices
      for (let i = bandolierIndicesToRemove.length - 1; i >= 0; i--) {
        const idx = bandolierIndicesToRemove[i];
        const item = merc.bandolierSlots[idx];
        merc.unequipBandolierSlot(idx);
        const discard = game.getEquipmentDiscard(item.equipmentType as 'Weapon' | 'Armor' | 'Accessory');
        if (discard) item.putInto(discard);
      }

      return {
        success: true,
        message: 'The palace has been destroyed! Rebels win!',
        data: { explosivesVictory: true },
      };
    });
}
