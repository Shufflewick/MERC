/**
 * Rebel Equipment Actions
 *
 * Equipment management and MERC special abilities related to equipment.
 */

import { Action, type ActionDefinition } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer, MERCPlayer } from '../game.js';
import { MercCard, Sector, Equipment, isGrenadeOrMortar, DictatorCard } from '../elements.js';
import {
  ACTION_COSTS,
  capitalize,
  hasActionsRemaining,
  isInPlayerTeam,
  useAction,
  isDictatorCard,
  isMercCard,
  isCombatantModel,
  getUnitName,
  findUnitSector,
  getCachedValue,
  setCachedValue,
  clearCachedValue,
} from './helpers.js';
import { isLandMine, isRepairKit, hasRangedAttack, getRangedRange, isExplosivesComponent, getMatchingComponent } from '../equipment-effects.js';
import { hasMortar } from '../ai-helpers.js';

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
// Type for units that can equip (MERCs or DictatorCard)
type EquippableUnit = MercCard | DictatorCard;

// Helper to get living units with actions for any player type
// Returns MERCs + DictatorCard if applicable
function getPlayerUnitsWithActions(player: unknown, game: MERCGame): EquippableUnit[] {
  if (game.isRebelPlayer(player)) {
    return player.team.filter(m => !m.isDead && m.actionsRemaining >= ACTION_COSTS.RE_EQUIP);
  }
  if (game.isDictatorPlayer(player)) {
    const units: EquippableUnit[] = game.dictatorPlayer?.hiredMercs.filter(m => !m.isDead && m.actionsRemaining >= ACTION_COSTS.RE_EQUIP) || [];
    // Include DictatorCard if in play with enough actions
    const dictatorCard = game.dictatorPlayer?.dictator;
    if (dictatorCard?.inPlay && !dictatorCard.isDead && dictatorCard.actionsRemaining >= ACTION_COSTS.RE_EQUIP) {
      units.push(dictatorCard);
    }
    return units;
  }
  return [];
}

// Helper to check if unit can re-equip (in a sector with stash and has actions)
function canUnitReEquip(unit: EquippableUnit, player: unknown, game: MERCGame): boolean {
  if (unit.actionsRemaining < ACTION_COSTS.RE_EQUIP) return false;
  if (isDictatorCard(unit) && (!unit.inPlay || unit.isDead)) return false;
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
  // Helper to resolve unit from ctx.args (parses composite string "id:name:isDictatorCard")
  function getUnit(ctx: { args?: Record<string, unknown> }): EquippableUnit | undefined {
    const unitArg = ctx.args?.actingUnit;

    // Handle string format: "id:name:isDictatorCard"
    if (typeof unitArg === 'string') {
      const parts = unitArg.split(':');
      if (parts.length < 3) return undefined;

      const idStr = parts[0];
      const isDictatorStr = parts[parts.length - 1]; // Last part is always isDictatorCard
      const unitId = parseInt(idStr, 10);
      const isUnitDictatorCard = isDictatorStr === 'true';

      if (isUnitDictatorCard) {
        return game.dictatorPlayer?.dictator;
      }
      return game.all(MercCard).find(m => m.id === unitId);
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
        const isUnitDictatorCard = isDictatorStr === 'true';

        if (isUnitDictatorCard) {
          return game.dictatorPlayer?.dictator;
        }
        return game.all(MercCard).find(m => m.id === unitId);
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
      'not in combat': () => !game.activeCombat,
      'is rebel or dictator player': (ctx) => game.isRebelPlayer(ctx.player) || game.isDictatorPlayer(ctx.player),
      'has unit that can re-equip': (ctx) => canAnyUnitReEquip(ctx.player, game),
    })
    .chooseFrom<string>('actingUnit', {
      prompt: 'Which unit equips?',
      choices: (ctx) => {
        const units = getPlayerUnitsWithActions(ctx.player, game);
        return units
          .filter(u => canUnitReEquip(u, ctx.player, game))
          .map(u => {
            // Use string format: "id:name:isDictatorCard" (like explore/train actions)
            const isDictator = isDictatorCard(u);
            return {
              value: `${u.id}:${getUnitName(u)}:${isDictator}`,
              label: capitalize(getUnitName(u)),
            };
          });
      },
    })
    .chooseElement<Equipment>('equipment', {
      dependsOn: 'actingUnit', // Equipment selection depends on unit selection
      prompt: (ctx) => {
        const unit = getUnit(ctx);
        const sector = unit ? findUnitSector(unit, ctx.player, game) : null;
        const remaining = sector?.stashCount || 0;
        return unit
          ? `What should ${capitalize(getUnitName(unit))} equip? (${remaining} item${remaining !== 1 ? 's' : ''} in stash)`
          : 'Select equipment';
      },
      display: (equip) => `${equip.equipmentName} (${equip.equipmentType})`,
      optional: 'Done equipping',
      elementClass: Equipment,
      filter: (element, ctx) => {
        const unit = getUnit(ctx);
        if (!unit) return false;

        const sector = findUnitSector(unit, ctx.player, game);
        if (!sector) return false;

        // Check if this equipment is in the sector's stash
        const inStash = sector.stash.some(e => e.id === element.id);
        if (!inStash) return false;

        // MERC-70a: Filter out grenades/mortars if Apeiron
        if (unit.isMerc && (unit as MercCard).combatantId === 'apeiron' && isGrenadeOrMortar(element)) {
          return false;
        }
        return true;
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
      const replaced = unit.equip(equipment);

      if (replaced) {
        sector.addToStash(replaced);
        game.message(`${capitalize(unitName)} equipped ${equipment.equipmentName}, returned ${replaced.equipmentName}`);
      } else {
        game.message(`${capitalize(unitName)} equipped ${equipment.equipmentName}`);
      }

      // If there are more items in stash, chain another reEquip selection (no action cost - already spent)
      if (sector.stashCount > 0) {
        return {
          success: true,
          message: `Equipped ${equipment.equipmentName}`,
          followUp: {
            action: 'reEquipContinue',
            args: {
              mercId: unit.id,
              sectorId: sector.id,
              // Pass the replaced item's ID to prevent ping-pong loop
              lastReplacedId: replaced?.id,
            },
            display: {
              mercId: capitalize(unitName),
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
 * Works for both rebel MERCs and dictator units (MERCs and DictatorCard).
 */
export function createReEquipContinueAction(game: MERCGame): ActionDefinition {
  // Helper to resolve unit from ctx.args (mercId is numeric element ID)
  // Handles both MercCard and DictatorCard
  function getUnit(ctx: { args?: Record<string, unknown> }): MercCard | DictatorCard | undefined {
    const mercArg = ctx.args?.mercId;
    if (typeof mercArg === 'number') {
      const el = game.getElementById(mercArg);
      if (isCombatantModel(el)) return el;
      return undefined;
    } else if (mercArg && typeof mercArg === 'object' && 'id' in mercArg) {
      const mercObj = mercArg as { id: number };
      const el = game.getElementById(mercObj.id);
      if (isCombatantModel(el)) return el;
      return undefined;
    }
    return undefined;
  }

  // Helper to get unit name for display
  function getUnitDisplayName(unit: MercCard | DictatorCard): string {
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
      'has merc and sector from followUp': (ctx) => {
        if (ctx.args?.mercId == null || ctx.args?.sectorId == null) return false;
        const unit = getUnit(ctx);
        const sector = getSector(ctx);
        return unit != null && sector != null;
      },
    })
    .chooseElement<Equipment>('equipment', {
      prompt: (ctx) => {
        const unit = getUnit(ctx);
        const sector = getSector(ctx);
        const remaining = sector?.stashCount || 0;
        return unit
          ? `What else should ${getUnitDisplayName(unit)} equip? (${remaining} item${remaining !== 1 ? 's' : ''} left)`
          : 'Select equipment';
      },
      display: (equip) => `${equip.equipmentName} (${equip.equipmentType})`,
      optional: 'Done equipping',
      elementClass: Equipment,
      filter: (element, ctx) => {
        const sector = getSector(ctx);
        if (!sector) return false;
        const inStash = sector.stash.some(e => e.id === element.id);
        if (!inStash) return false;

        // Prevent ping-pong loop: exclude the item that was just returned
        const lastReplacedId = ctx.args?.lastReplacedId;
        if (lastReplacedId && element.id === lastReplacedId) {
          return false;
        }

        // MERC-70a: Filter out grenades/mortars if Apeiron
        const unit = getUnit(ctx);
        if (unit?.isMerc && (unit as MercCard).combatantId === 'apeiron' && isGrenadeOrMortar(element)) {
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
      const replaced = unit.equip(equipment);

      if (replaced) {
        sector.addToStash(replaced);
        game.message(`${unitName} equipped ${equipment.equipmentName}, returned ${replaced.equipmentName}`);
      } else {
        game.message(`${unitName} equipped ${equipment.equipmentName}`);
      }

      // Chain another if more items remain
      if (sector.stashCount > 0) {
        return {
          success: true,
          message: `Equipped ${equipment.equipmentName}`,
          followUp: {
            action: 'reEquipContinue',
            args: {
              mercId: unit.id,
              sectorId: sector.id,
              // Pass the replaced item's ID to prevent ping-pong loop
              lastReplacedId: replaced?.id,
            },
            display: {
              mercId: unitName,
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
  function getMercEquipment(merc: MercCard): Equipment[] {
    const equipment: Equipment[] = [];
    if (merc.weaponSlot) equipment.push(merc.weaponSlot);
    if (merc.armorSlot) equipment.push(merc.armorSlot);
    if (merc.accessorySlot) equipment.push(merc.accessorySlot);
    for (const item of merc.bandolierSlots) {
      if (item) equipment.push(item);
    }
    return equipment;
  }

  // Helper to get living MERCs for any player type (uses ctx.game to avoid stale refs)
  function getPlayerMercsFromCtx(ctx: { game: unknown; player: unknown }): MercCard[] {
    const g = ctx.game as MERCGame;
    if (g.isRebelPlayer(ctx.player)) {
      return ctx.player.team.filter((m: MercCard) => !m.isDead);
    }
    if (g.isDictatorPlayer(ctx.player)) {
      return g.dictatorPlayer?.hiredMercs.filter((m: MercCard) => !m.isDead) || [];
    }
    return [];
  }

  // Helper to resolve merc from ctx.args using ctx.game
  function getMercFromCtx(ctx: { game: unknown; args?: Record<string, unknown> }): MercCard | undefined {
    const g = ctx.game as MERCGame;
    const mercArg = ctx.args?.actingMerc;
    let mercId: number | undefined;

    if (typeof mercArg === 'number') {
      mercId = mercArg;
    } else if (mercArg && typeof mercArg === 'object' && 'id' in mercArg) {
      const mercObj = mercArg as { id: number };
      mercId = mercObj.id;
    }

    if (mercId !== undefined) {
      const el = g.getElementById(mercId);
      return isMercCard(el) ? el : undefined;
    }
    return undefined;
  }

  // Helper to find merc's sector using ctx.game
  function findMercSectorFromCtx(merc: MercCard, ctx: { game: unknown; player: unknown }): Sector | null {
    const g = ctx.game as MERCGame;
    if (g.isRebelPlayer(ctx.player)) {
      for (const squad of [ctx.player.primarySquad, ctx.player.secondarySquad]) {
        if (!squad?.sectorId) continue;
        const mercs = squad.getMercs();
        if (mercs.some((m: MercCard) => m.id === merc.id)) {
          return g.getSector(squad.sectorId) || null;
        }
      }
    }
    if (g.isDictatorPlayer(ctx.player) && g.dictatorPlayer) {
      const squad = g.dictatorPlayer.getSquadContaining(merc);
      if (squad?.sectorId) {
        return g.getSector(squad.sectorId) || null;
      }
      if (merc.sectorId) {
        return g.getSector(merc.sectorId) || null;
      }
    }
    return null;
  }

  return Action.create('dropEquipment')
    .prompt('Unequip')
    .condition({
      'not in combat': (ctx) => !(ctx.game as MERCGame).activeCombat,
      'is rebel or dictator player': (ctx) => {
        const g = ctx.game as MERCGame;
        return g.isRebelPlayer(ctx.player) || g.isDictatorPlayer(ctx.player);
      },
      'has merc with equipment': (ctx) => {
        const livingMercs = getPlayerMercsFromCtx(ctx);
        return livingMercs.some(m => getMercEquipment(m).length > 0);
      },
    })
    .fromElements<MercCard>('actingMerc', {
      prompt: 'Select MERC to drop equipment from',
      display: (merc) => capitalize(merc.combatantName),
      elements: (ctx) => {
        const mercs = getPlayerMercsFromCtx(ctx);
        return mercs.filter(m => getMercEquipment(m).length > 0);
      },
    })
    .fromElements<Equipment>('equipment', {
      dependsOn: 'actingMerc',
      prompt: (ctx) => {
        const merc = getMercFromCtx(ctx);
        return merc
          ? `Select equipment to drop from ${capitalize(merc.combatantName)}`
          : 'Select equipment to drop';
      },
      display: (equip) => `${equip.equipmentName} (${equip.equipmentType})`,
      // Use ctx.game throughout to avoid stale closures
      elements: (ctx) => {
        const g = ctx.game as MERCGame;
        const mercArg = ctx.args?.actingMerc;

        if (!mercArg) {
          // Availability check - return ALL equipment from ALL player mercs
          const mercs = getPlayerMercsFromCtx(ctx);
          const allEquipment: Equipment[] = [];
          for (const m of mercs) {
            allEquipment.push(...getMercEquipment(m));
          }
          return allEquipment;
        }

        // Merc is selected - look up by ID to get proper element with getters
        let mercId: number | undefined;
        if (typeof mercArg === 'number') {
          mercId = mercArg;
        } else if (mercArg && typeof mercArg === 'object' && 'id' in mercArg) {
          const mercObj = mercArg as { id: number };
          mercId = mercObj.id;
        }
        if (mercId !== undefined) {
          const el = g.getElementById(mercId);
          if (isMercCard(el)) {
            return getMercEquipment(el);
          }
        }

        return [];
      },
    })
    .execute((args, ctx) => {
      const g = ctx.game as MERCGame;

      // Always resolve by ID to get full element with all properties
      const mercArg = args.actingMerc;
      let mercId: number | undefined;
      if (typeof mercArg === 'number') {
        mercId = mercArg;
      } else if (mercArg && typeof mercArg === 'object' && 'id' in mercArg) {
        const mercObj = mercArg as { id: number };
        mercId = mercObj.id;
      }
      const mercEl = mercId !== undefined ? g.getElementById(mercId) : undefined;
      const actingMerc = isMercCard(mercEl) ? mercEl : undefined;

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

      if (!actingMerc || !equipment) {
        return { success: false, message: 'Could not resolve MERC or equipment' };
      }

      const sector = findMercSectorFromCtx(actingMerc, ctx);
      if (!sector) {
        return { success: false, message: 'MERC is not in a valid sector' };
      }

      // Unequip the equipment based on which slot it's in
      let droppedItem: Equipment | undefined;
      if (actingMerc.weaponSlot?.id === equipment.id) {
        droppedItem = actingMerc.unequip('Weapon');
      } else if (actingMerc.armorSlot?.id === equipment.id) {
        droppedItem = actingMerc.unequip('Armor');
      } else if (actingMerc.accessorySlot?.id === equipment.id) {
        droppedItem = actingMerc.unequip('Accessory');
      } else {
        // Check bandolier slots
        for (let i = 0; i < actingMerc.bandolierSlots.length; i++) {
          if (actingMerc.bandolierSlots[i]?.id === equipment.id) {
            droppedItem = actingMerc.unequipBandolierSlot(i);
            break;
          }
        }
      }

      if (!droppedItem) {
        return { success: false, message: 'Equipment not found' };
      }

      // Add to sector stash
      sector.addToStash(droppedItem);

      g.message(`${capitalize(actingMerc.combatantName)} dropped ${droppedItem.equipmentName} in ${sector.sectorName}`);
      return { success: true, message: `Dropped ${droppedItem.equipmentName}` };
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
      'not in combat': () => !game.activeCombat,
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
        return hasWeapons || hasArmor || hasAccessories;
      },
    })
    .chooseElement<Equipment>('equipment', {
      prompt: 'Select equipment from discard pile',
      elementClass: Equipment,
      display: (eq) => `${eq.equipmentName} (${eq.equipmentType})`,
      filter: () => {
        // All equipment in discard piles is valid
        return true;
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
      const replaced = feedback.equip(selectedEquipment);
      if (replaced) {
        // Put replaced equipment back to discard
        const replaceDiscard = game.getEquipmentDiscard(replaced.equipmentType);
        if (replaceDiscard) replaced.putInto(replaceDiscard);
        game.message(`${feedback.combatantName} swapped ${replaced.equipmentName} for ${selectedEquipment.equipmentName}`);
      } else {
        game.message(`${feedback.combatantName} retrieved ${selectedEquipment.equipmentName} from discard`);
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
        const replaced = squidhead.equip(mine);
        if (replaced) {
          sector.addToStash(replaced);
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
// Hagness Draw Action
// =============================================================================

// Settings key prefix for Hagness equipment cache (keyed by `prefix:playerId:equipmentType`)
const HAGNESS_EQUIPMENT_KEY = 'hagnessDrawnEquipmentId';

// Helper to get cache key for Hagness equipment (combines playerId and equipmentType)
function getHagnessCacheKey(playerId: string, equipmentType: string): string {
  return `${playerId}:${equipmentType}`;
}

// Helper to get Equipment element from cached ID
function getHagnessEquipment(game: MERCGame, playerId: string, equipmentType: string): Equipment | undefined {
  const compositeKey = getHagnessCacheKey(playerId, equipmentType);
  const id = getCachedValue<number>(game, HAGNESS_EQUIPMENT_KEY, compositeKey);
  if (id === undefined) return undefined;
  return game.getElementById(id) as Equipment | undefined;
}

// Helper to clear all cache entries for a player (used on action completion/failure)
function clearHagnessCache(game: MERCGame, playerId: string): void {
  const prefix = `${HAGNESS_EQUIPMENT_KEY}:${playerId}:`;
  for (const key of Object.keys(game.settings)) {
    if (key.startsWith(prefix)) {
      delete game.settings[key];
    }
  }
}

/**
 * MERC-jrph: Hagness can draw equipment for squad
 * Cost: 1 action
 * Per rules: "Spend 1 action to draw 3 pieces of equipment, choose 1 and give it to any member of his squad."
 *
 * Flow:
 * 1. Choose equipment type (Weapon, Armor, or Accessory)
 * 2. Draw 1 equipment of that type (simplified from original 3)
 * 3. See the drawn equipment and choose which squad member gets it
 */
export function createHagnessDrawAction(game: MERCGame): ActionDefinition {
  return Action.create('hagnessDraw')
    .prompt('Hagness: Draw equipment for squad')
    .condition({
      'has living Hagness with actions': (ctx) => {
        // Works for both rebel and dictator players
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
    .chooseFrom<string>('recipient', {
      prompt: (ctx) => {
        const player = ctx.player as MERCPlayer;
        const playerId = `${player.position}`;
        const equipmentType = ctx.args?.equipmentType as string | undefined;

        // Try to find cached equipment for any type (we may not know which type was selected)
        if (equipmentType) {
          const equipment = getHagnessEquipment(game, playerId, equipmentType);
          if (equipment) {
            return `Drew ${equipment.equipmentName}! Give to which squad member?`;
          }
        }

        return 'Give to:';
      },
      dependsOn: 'equipmentType', // Wait for equipmentType to be selected before showing choices
      // Note: Cannot use defer:true because ActionPanel doesn't fetch deferred choices for 2nd+ selections
      choices: (ctx) => {
        // Works for both rebel and dictator players
        if (!game.isRebelPlayer(ctx.player) && !game.isDictatorPlayer(ctx.player)) {
          return ['(select equipment type first)'];
        }
        const player = ctx.player as MERCPlayer;
        const playerId = `${player.position}`;
        const equipmentType = ctx.args?.equipmentType as 'Weapon' | 'Armor' | 'Accessory' | undefined;

        // During availability check, equipmentType won't be set - return placeholder
        if (!equipmentType) {
          return ['(select equipment type first)'];
        }

        // Use typed cache key to ensure we draw fresh for each equipment type
        const cacheKey = getHagnessCacheKey(playerId, equipmentType);

        // IMPORTANT: Don't draw equipment during speculative calls!
        // BoardSmith calls choices() for ALL equipment types to precompute options.
        // We only want to draw once per type, and never clear other types' cache.
        type HagnessEquipmentData = {
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
        let equipmentData: HagnessEquipmentData | null = null;

        // If recipient is already set, the user already clicked - don't redraw!
        const recipientAlreadySet = ctx.args?.recipient !== undefined;

        const compositeKey = getHagnessCacheKey(playerId, equipmentType);
        if (getCachedValue<number>(game, HAGNESS_EQUIPMENT_KEY, compositeKey) === undefined && !recipientAlreadySet) {
          const eq = game.drawEquipment(equipmentType);
          if (eq) {
            setCachedValue(game, HAGNESS_EQUIPMENT_KEY, compositeKey, eq.id);
            equipmentData = {
              equipmentId: eq.id,
              equipmentName: eq.equipmentName,
              equipmentType: eq.equipmentType,
              description: eq.description || '',
              combatBonus: eq.combatBonus || 0,
              initiative: eq.initiative || 0,
              training: eq.training || 0,
              targets: eq.targets || 0,
              armorBonus: eq.armorBonus || 0,
              negatesArmor: eq.negatesArmor || false,
              serial: eq.serial || 0,
              image: eq.image || '',
            };
            // Store with typed key to avoid overwriting other equipment types
            const stateKey = `${playerId}:${equipmentType}`;
            game.hagnessDrawnEquipmentData[stateKey] = equipmentData;
          }
        } else {
          const eq = getHagnessEquipment(game, playerId, equipmentType)!;
          equipmentData = {
            equipmentId: eq.id,
            equipmentName: eq.equipmentName,
            equipmentType: eq.equipmentType,
            description: eq.description || '',
            combatBonus: eq.combatBonus || 0,
            initiative: eq.initiative || 0,
            training: eq.training || 0,
            targets: eq.targets || 0,
            armorBonus: eq.armorBonus || 0,
            negatesArmor: eq.negatesArmor || false,
            serial: eq.serial || 0,
            image: eq.image || '',
          };
        }

        // Get hagness and squad mates
        const hagness = player.team.find(m => m.combatantId === 'hagness' && !m.isDead);
        if (!hagness) {
          return [];
        }

        const hagnessSquad = player.getSquadContaining(hagness);
        if (!hagnessSquad) {
          return [];
        }

        const squadMates = hagnessSquad.getLivingMercs();

        // Include equipment name in display so user knows what they're giving
        const equipName = equipmentData?.equipmentName || 'equipment';
        const choices = squadMates.map(m => ({
          value: capitalize(m.combatantName),
          display: `${capitalize(m.combatantName)} ← ${equipName}`,
          equipment: equipmentData,
        }));
        return choices;
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as MERCPlayer;
      const playerId = `${player.position}`;
      const equipmentType = args.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
      const cacheKey = getHagnessCacheKey(playerId, equipmentType);
      const hagness = player.team.find(m => m.combatantId === 'hagness' && !m.isDead)!;

      // Handle recipient - might be string or object {value, display, equipment}
      const recipientArg = args.recipient;
      let recipientName: string;
      if (typeof recipientArg === 'string') {
        recipientName = recipientArg;
      } else if (recipientArg && typeof recipientArg === 'object') {
        // Extract name from object format
        const recipientObj = recipientArg as { value?: string; display?: string };
        recipientName = recipientObj.value || recipientObj.display || String(recipientArg);
      } else {
        recipientName = String(recipientArg || '');
      }

      // Find recipient MERC
      const hagnessSquad = player.getSquadContaining(hagness);
      if (!hagnessSquad) {
        clearHagnessCache(game, playerId);
        for (const key of Object.keys(game.hagnessDrawnEquipmentData)) {
          if (key.startsWith(`${playerId}:`)) delete game.hagnessDrawnEquipmentData[key];
        }
        return { success: false, message: 'Hagness squad not found' };
      }

      const recipient = hagnessSquad.getLivingMercs().find(m => capitalize(m.combatantName) === recipientName);
      if (!recipient) {
        clearHagnessCache(game, playerId);
        for (const key of Object.keys(game.hagnessDrawnEquipmentData)) {
          if (key.startsWith(`${playerId}:`)) delete game.hagnessDrawnEquipmentData[key];
        }
        return { success: false, message: 'Recipient not found' };
      }

      // Get cached equipment element using typed key
      const equipment = getHagnessEquipment(game, playerId, equipmentType);
      if (!equipment) {
        clearHagnessCache(game, playerId);
        for (const key of Object.keys(game.hagnessDrawnEquipmentData)) {
          if (key.startsWith(`${playerId}:`)) delete game.hagnessDrawnEquipmentData[key];
        }
        return { success: false, message: 'No equipment available' };
      }

      // Equip the drawn equipment to recipient
      const replaced = recipient.equip(equipment);

      // Discard any replaced equipment
      if (replaced) {
        const discard = game.getEquipmentDiscard(replaced.equipmentType);
        if (discard) replaced.putInto(discard);
      }

      // Clean up caches
      clearHagnessCache(game, playerId);
      // Clean up all typed state keys for this player
      for (const key of Object.keys(game.hagnessDrawnEquipmentData)) {
        if (key.startsWith(`${playerId}:`)) {
          delete game.hagnessDrawnEquipmentData[key];
        }
      }

      hagness.useAction(1);
      game.message(`Hagness gives ${equipment.equipmentName} to ${recipient.combatantName}`);

      return { success: true, message: `Gave ${equipment.equipmentName} to ${recipient.combatantName}` };
    });
}

// =============================================================================
// Repair Kit Action
// =============================================================================

/**
 * Helper to check if a MERC has Repair Kit equipped
 */
function mercHasRepairKit(merc: MercCard): boolean {
  if (merc.isDead) return false;
  // Check accessory slot
  if (merc.accessorySlot && isRepairKit(merc.accessorySlot.equipmentId)) return true;
  // Check bandolier slots
  return merc.bandolierSlots.some(e => isRepairKit(e.equipmentId));
}

/**
 * Helper to find MERCs with Repair Kit equipped - works for both rebel and dictator
 */
function getMercsWithRepairKit(player: unknown, game: MERCGame): MercCard[] {
  if (game.isRebelPlayer(player)) {
    return player.team.filter(mercHasRepairKit);
  }
  if (game.isDictatorPlayer(player)) {
    return game.dictatorPlayer?.hiredMercs.filter(mercHasRepairKit) || [];
  }
  return [];
}

/**
 * Helper to get available equipment from discard piles
 */
function getDiscardPileEquipment(game: MERCGame): Array<{ equipment: Equipment; pileType: 'Weapon' | 'Armor' | 'Accessory' }> {
  const result: Array<{ equipment: Equipment; pileType: 'Weapon' | 'Armor' | 'Accessory' }> = [];

  const weaponDiscard = game.weaponsDiscard?.children as Equipment[] | undefined;
  const armorDiscard = game.armorDiscard?.children as Equipment[] | undefined;
  const accessoryDiscard = game.accessoriesDiscard?.children as Equipment[] | undefined;

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
      'not in combat': () => !game.activeCombat,
      'has merc with repair kit': (ctx) => getMercsWithRepairKit(ctx.player, game).length > 0,
      'has equipment in discard piles': () => getDiscardPileEquipment(game).length > 0,
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to use Repair Kit',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.combatantName),
      filter: (element, ctx) => {
        if (!isMercCard(element)) return false;
        // Use unified helper - checks ownership, living status, and repair kit
        const mercsWithKit = getMercsWithRepairKit(ctx.player, game);
        return mercsWithKit.some(m => m.id === element.id);
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
      const merc = args.merc as MercCard;
      const equipmentChoice = args.equipment as string;

      // Find the Repair Kit on the MERC
      let repairKit: Equipment | undefined;
      let repairKitSlot: 'Accessory' | 'bandolier' = 'Accessory';
      let bandolierIndex = -1;

      if (merc.accessorySlot && isRepairKit(merc.accessorySlot.equipmentId)) {
        repairKit = merc.accessorySlot;
        repairKitSlot = 'Accessory';
      } else {
        const idx = merc.bandolierSlots.findIndex(e => isRepairKit(e.equipmentId));
        if (idx >= 0) {
          repairKit = merc.bandolierSlots[idx];
          repairKitSlot = 'bandolier';
          bandolierIndex = idx;
        }
      }

      if (!repairKit) {
        return { success: false, message: 'No Repair Kit found on MERC' };
      }

      // Find the selected equipment in discard
      const discardEquip = getDiscardPileEquipment(game);
      const selected = discardEquip.find(({ equipment, pileType }) =>
        `${equipment.equipmentName} (${pileType})` === equipmentChoice
      );

      if (!selected) {
        return { success: false, message: 'Equipment not found in discard' };
      }

      // Remove repair kit from MERC and discard it
      if (repairKitSlot === 'Accessory') {
        merc.unequip('Accessory');
      } else {
        merc.unequipBandolierSlot(bandolierIndex);
      }
      const accessoryDiscard = game.getEquipmentDiscard('Accessory');
      if (accessoryDiscard) {
        repairKit.putInto(accessoryDiscard);
      }

      // Take the equipment from discard
      const retrievedEquip = selected.equipment;
      const pileType = selected.pileType;

      // Find the MERC's sector to put equipment in stash (works for both player types)
      const sector = findUnitSector(merc, ctx.player, game);
      if (!sector) {
        return { success: false, message: 'MERC not in a valid sector' };
      }

      // Remove from discard pile and add to sector stash
      const discardPile = game.getEquipmentDiscard(pileType);
      if (discardPile) {
        // Move from discard to stash
        sector.addToStash(retrievedEquip);
      }

      game.message(`${merc.combatantName} uses Repair Kit to retrieve ${retrievedEquip.equipmentName} from discard`);

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
        sector.getRebelMilitia(`${rebel.position}`) > 0
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
      count += sector.getRebelMilitia(`${rebel.position}`);
    }
  }

  return count;
}

/**
 * Get units with mortars for any player type.
 * Includes both MERCs and DictatorCard for dictator player.
 */
function getMercsWithMortars(game: MERCGame, player: any): (MercCard | DictatorCard)[] {
  if (game.isRebelPlayer(player)) {
    return (player as RebelPlayer).team.filter(m =>
      !m.isDead && m.actionsRemaining >= 1 && hasMortar(m)
    );
  }
  if (game.isDictatorPlayer(player)) {
    const units: (MercCard | DictatorCard)[] = [];
    // Add hired MERCs with mortars
    const hiredMercs = game.dictatorPlayer?.hiredMercs.filter(m =>
      !m.isDead && m.actionsRemaining >= 1 && hasMortar(m)
    ) || [];
    units.push(...hiredMercs);
    // Add DictatorCard if it has mortar and is in play
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
 * Handles both MercCard and DictatorCard.
 */
function isUnitOwnedForMortar(unit: MercCard | DictatorCard, player: any, game: MERCGame): boolean {
  if (game.isRebelPlayer(player)) {
    return unit.isMerc && isInPlayerTeam(unit as MercCard, player as RebelPlayer);
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
      'not in combat': () => !game.activeCombat,
      'is rebel or dictator player': (ctx) => game.isRebelPlayer(ctx.player) || game.isDictatorPlayer(ctx.player),
      'has unit with mortar and valid targets': (ctx) => {
        const mercsWithMortars = getMercsWithMortars(game, ctx.player);
        for (const merc of mercsWithMortars) {
          const sector = findUnitSector(merc, ctx.player, game);
          if (!sector) continue;
          const targets = getMortarTargets(game, sector, ctx.player);
          if (targets.length > 0) return true;
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
          const name = unit.isMerc ? (unit as MercCard).combatantName : (unit as DictatorCard).combatantName;
          return capitalize(name);
        });
      },
    })
    .chooseFrom<string>('targetSectorName', {
      prompt: 'Select sector to bombard',
      choices: (ctx) => {
        // Find the selected unit
        const unitName = ctx.args?.unitId as string;
        const units = getMercsWithMortars(game, ctx.player);
        const unit = units.find(u => {
          const name = u.isMerc ? (u as MercCard).combatantName : (u as DictatorCard).combatantName;
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
        const name = u.isMerc ? (u as MercCard).combatantName : (u as DictatorCard).combatantName;
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

      // Mortar deals 1 damage per target
      const mortarDamage = 1;

      const unitDisplayName = unit.isMerc ? (unit as MercCard).combatantName : (unit as DictatorCard).combatantName;
      game.message(`${unitDisplayName} fires mortar at ${targetSector.sectorName}!`);

      let totalDamage = 0;

      if (isRebel) {
        // Damage dictator MERCs
        const dictatorMercs = game.dictatorPlayer?.hiredMercs.filter(m =>
          m.sectorId === targetSector.sectorId && !m.isDead
        ) ?? [];
        for (const target of dictatorMercs) {
          target.takeDamage(mortarDamage);
          totalDamage++;
          game.message(`Mortar deals ${mortarDamage} damage to ${target.combatantName}`);
        }

        // Damage the Dictator
        const dictator = game.dictatorPlayer?.dictator;
        if (dictator?.sectorId === targetSector.sectorId && dictator.inPlay) {
          dictator.takeDamage(mortarDamage);
          totalDamage++;
          game.message(`Mortar deals ${mortarDamage} damage to the Dictator!`);
          if (dictator.isDead) {
            game.message(`THE DICTATOR HAS BEEN KILLED BY MORTAR! REBELS WIN!`);
          }
        }

        // Damage dictator militia
        if (targetSector.dictatorMilitia > 0) {
          const militiaKilled = Math.min(mortarDamage, targetSector.dictatorMilitia);
          targetSector.removeDictatorMilitia(militiaKilled);
          totalDamage++;
          game.message(`Mortar kills ${militiaKilled} dictator militia`);
        }
      } else {
        // Damage rebel MERCs
        for (const rebel of game.rebelPlayers) {
          const rebelMercs = rebel.team.filter(m =>
            m.sectorId === targetSector.sectorId && !m.isDead
          );
          for (const target of rebelMercs) {
            target.takeDamage(mortarDamage);
            totalDamage++;
            game.message(`Mortar deals ${mortarDamage} damage to ${target.combatantName}`);
          }

          // Damage rebel militia
          const rebelMilitia = targetSector.getRebelMilitia(`${rebel.position}`);
          if (rebelMilitia > 0) {
            const militiaKilled = Math.min(mortarDamage, rebelMilitia);
            targetSector.removeRebelMilitia(`${rebel.position}`, militiaKilled);
            totalDamage++;
            game.message(`Mortar kills ${militiaKilled} rebel militia`);
          }
        }
      }

      // Discard the mortar after use (mortars are one-use)
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

      return {
        success: true,
        message: `Mortar attack dealt ${totalDamage} damage`,
        data: { totalDamage },
      };
    });
}

// =============================================================================
// Explosives / Detonator Win Condition
// =============================================================================

/**
 * Check if a MERC has both explosives components (detonator + explosives).
 */
function hasBothExplosivesComponents(merc: MercCard): boolean {
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
      'not in combat': () => !game.activeCombat,
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
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to detonate explosives',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.combatantName),
      filter: (element, ctx) => {
        if (!game.isRebelPlayer(ctx.player)) return false;
        if (!isMercCard(element)) return false;
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
      const merc = isMercCard(args.merc) ? args.merc : undefined;
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
