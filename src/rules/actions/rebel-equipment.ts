/**
 * Rebel Equipment Actions
 *
 * Equipment management and MERC special abilities related to equipment.
 */

import { Action, type ActionDefinition } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer } from '../game.js';
import { MercCard, Sector, Equipment, isGrenadeOrMortar } from '../elements.js';
import {
  ACTION_COSTS,
  capitalize,
  hasActionsRemaining,
  isInPlayerTeam,
  useAction,
} from './helpers.js';
import { isLandMine, isRepairKit, hasRangedAttack, getRangedAttackRange, isExplosivesComponent, getMatchingComponent } from '../equipment-effects.js';
import { hasMortar } from '../ai-helpers.js';

// =============================================================================
// Re-Equip Action
// =============================================================================

/**
 * Re-equip from sector stash, swap between MERCs, or trade with teammate
 * Cost: 1 action (per rules: "Re-Equip (1 action)")
 * Per rules (06-merc-actions.md): Trade = Exchange equipment with another MERC in same sector
 * MERC-gu5: Trading requires both MERCs to spend an action
 */
export function createReEquipAction(game: MERCGame): ActionDefinition {
  return Action.create('reEquip')
    .prompt('Equip')
    .condition((ctx, tracer) => {
      // Cannot re-equip during combat
      if (game.activeCombat) return false;
      // Only rebels can re-equip
      const isRebel = game.isRebelPlayer(ctx.player as any);
      if (tracer) tracer.check('isRebelPlayer', isRebel);
      if (!isRebel) return false;
      const player = ctx.player as RebelPlayer;

      // Check both squads for sectors with equipment stash
      const checkSquad = (squad: typeof player.primarySquad) => {
        if (!squad?.sectorId) return false;
        const sector = game.getSector(squad.sectorId);
        return sector && sector.stash.length > 0;
      };

      const primaryHasStash = checkSquad(player.primarySquad);
      const secondaryHasStash = checkSquad(player.secondarySquad);
      const hasStash = primaryHasStash || secondaryHasStash;
      if (tracer) tracer.check('sectorHasStash', hasStash);
      if (!hasStash) return false;

      const hasActions = hasActionsRemaining(player, ACTION_COSTS.RE_EQUIP);
      if (tracer) tracer.check('hasActionsRemaining', hasActions);
      return hasActions;
    })
    .chooseElement<MercCard>('actingMerc', {
      prompt: 'Select MERC to equip',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;

        // MERC must be in player's team and have actions
        if (!isInPlayerTeam(merc, player)) return false;
        if (merc.actionsRemaining < ACTION_COSTS.RE_EQUIP) return false;

        // MERC must be in a sector with equipment stash
        const findMercSector = (): Sector | null => {
          for (const squad of [player.primarySquad, player.secondarySquad]) {
            if (!squad?.sectorId) continue;
            const mercs = squad.getMercs();
            if (mercs.some(m => m.id === merc.id)) {
              return game.getSector(squad.sectorId) || null;
            }
          }
          return null;
        };

        const sector = findMercSector();
        return sector !== null && sector.stash.length > 0;
      },
    })
    .chooseFrom<string>('equipment', {
      prompt: 'Select equipment to pick up',
      dependsOn: 'actingMerc',
      choices: (ctx) => {
        const actingMerc = ctx.args?.actingMerc as MercCard;
        const player = ctx.player as RebelPlayer;
        if (!actingMerc) return ['Done'];

        // Find the sector where the MERC is
        const findMercSector = (): Sector | null => {
          for (const squad of [player.primarySquad, player.secondarySquad]) {
            if (!squad?.sectorId) continue;
            const mercs = squad.getMercs();
            if (mercs.some(m => m.id === actingMerc.id)) {
              return game.getSector(squad.sectorId) || null;
            }
          }
          return null;
        };

        const sector = findMercSector();
        if (!sector) return ['Done'];

        // MERC-70a: Filter out grenades/mortars if Apeiron is the acting MERC
        let stash = sector.stash;
        if (actingMerc.mercId === 'apeiron') {
          stash = stash.filter(e => !isGrenadeOrMortar(e));
        }

        if (stash.length === 0) return ['Done'];

        const equipmentChoices = stash.map(e => `${e.equipmentName} (${e.equipmentType})`);
        return [...equipmentChoices, 'Done'];
      },
      repeat: {
        until: (_ctx, choice) => choice === 'Done',
        onEach: (ctx, choice) => {
          if (choice === 'Done') return;

          const actingMerc = ctx.args?.actingMerc as MercCard;
          const player = ctx.player as RebelPlayer;
          if (!actingMerc) return;

          // Find the sector where the MERC is
          const findMercSector = (): Sector | null => {
            for (const squad of [player.primarySquad, player.secondarySquad]) {
              if (!squad?.sectorId) continue;
              const mercs = squad.getMercs();
              if (mercs.some(m => m.id === actingMerc.id)) {
                return game.getSector(squad.sectorId) || null;
              }
            }
            return null;
          };

          const sector = findMercSector();
          if (!sector) return;

          const stash = sector.stash;

          // Parse the choice string to find the equipment
          const match = (choice as string).match(/^(.+) \((Weapon|Armor|Accessory)\)$/);
          if (!match) return;

          const [, equipName, equipType] = match;
          const equipIndex = stash.findIndex(
            e => e.equipmentName === equipName && e.equipmentType === equipType
          );

          if (equipIndex === -1) return;

          const item = stash[equipIndex];

          // Equip the item on the MERC (handles replacement)
          const replaced = actingMerc.equip(item);

          // Remove from stash
          stash.splice(equipIndex, 1);

          if (replaced) {
            // Put replaced item back in the stash
            stash.push(replaced);
            game.message(`${capitalize(actingMerc.mercName)} equipped ${item.equipmentName}, returned ${replaced.equipmentName} to stash`);
          } else {
            game.message(`${capitalize(actingMerc.mercName)} equipped ${item.equipmentName}`);
          }
        },
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const actingMerc = args.actingMerc as MercCard;
      const equipment = args.equipment as string[];

      // Filter out "Done" from selections
      const selected = equipment?.filter(e => e !== 'Done') || [];

      if (selected.length === 0) {
        return { success: false, message: 'No equipment selected' };
      }

      // Spend action only once for the entire re-equip action (not per item)
      useAction(actingMerc, ACTION_COSTS.RE_EQUIP);

      return { success: true, message: `Re-equipped ${selected.length} item(s)` };
    });
}

// =============================================================================
// Drop Equipment Action
// =============================================================================

/**
 * Drop equipment into the sector stash.
 * Cost: 0 actions (free)
 * Allows MERCs to drop equipment they're carrying into the current sector.
 */
export function createDropEquipmentAction(game: MERCGame): ActionDefinition {
  return Action.create('dropEquipment')
    .prompt('Unequip')
    .condition((ctx, tracer) => {
      // Cannot drop equipment during combat
      if (game.activeCombat) return false;
      // Only rebels can drop equipment
      const isRebel = game.isRebelPlayer(ctx.player as any);
      if (tracer) tracer.check('isRebelPlayer', isRebel);
      if (!isRebel) return false;
      const player = ctx.player as RebelPlayer;

      // Check if any MERC has equipment to drop (including bandolier slots)
      // Use both slot refs and slotData since element refs aren't serialized
      const hasEquippedMerc = player.team.some(m =>
        !m.isDead && (
          m.weaponSlot || m.weaponSlotData ||
          m.armorSlot || m.armorSlotData ||
          m.accessorySlot || m.accessorySlotData ||
          m.bandolierSlotsData.length > 0
        )
      );
      if (tracer) tracer.check('hasEquippedMerc', hasEquippedMerc);
      return hasEquippedMerc;
    })
    .chooseElement<MercCard>('actingMerc', {
      prompt: 'Select MERC to drop equipment from',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;

        // MERC must be in player's team and have equipment (including bandolier slots)
        // Use both slot refs and slotData since element refs aren't serialized
        if (!isInPlayerTeam(merc, player)) return false;
        return !!(
          merc.weaponSlot || merc.weaponSlotData ||
          merc.armorSlot || merc.armorSlotData ||
          merc.accessorySlot || merc.accessorySlotData ||
          merc.bandolierSlotsData.length > 0
        );
      },
    })
    .chooseFrom<string>('slot', {
      prompt: 'Select equipment to drop',
      dependsOn: 'actingMerc',
      // Note: Cannot use defer:true because ActionPanel doesn't fetch deferred choices for 2nd+ selections
      choices: (ctx) => {
        const mercRef = ctx.args?.actingMerc;
        // During availability check, actingMerc won't be set yet - return placeholder
        if (!mercRef) return ['(select MERC first)'];

        // BoardSmith may pass the element ID (number) or the element object
        let actualMerc: MercCard | undefined;
        if (typeof mercRef === 'number') {
          // It's an element ID - look up using game.getElementById
          actualMerc = game.getElementById(mercRef) as MercCard | undefined;
        } else {
          // It's an object - get the ID and look up the actual element
          const mercId = (mercRef as any).id;
          if (typeof mercId === 'number') {
            actualMerc = game.getElementById(mercId) as MercCard | undefined;
          } else {
            // Try to find by mercId string
            const mercIdStr = (mercRef as any).mercId;
            actualMerc = game.first(MercCard, m => m.mercId === mercIdStr);
          }
        }

        if (!actualMerc) return ['(select MERC first)'];

        const choices: string[] = [];
        // Use slot references if available, otherwise fall back to slotData (element refs aren't serialized)
        const weaponName = actualMerc.weaponSlot?.equipmentName || actualMerc.weaponSlotData?.equipmentName;
        const armorName = actualMerc.armorSlot?.equipmentName || actualMerc.armorSlotData?.equipmentName;
        const accessoryName = actualMerc.accessorySlot?.equipmentName || actualMerc.accessorySlotData?.equipmentName;

        if (weaponName) {
          choices.push(`Weapon: ${weaponName}`);
        }
        if (armorName) {
          choices.push(`Armor: ${armorName}`);
        }
        if (accessoryName) {
          choices.push(`Accessory: ${accessoryName}`);
        }
        // Add bandolier slot items (use data as source of truth)
        for (let i = 0; i < actualMerc.bandolierSlotsData.length; i++) {
          const itemData = actualMerc.bandolierSlotsData[i];
          if (itemData?.equipmentName) {
            choices.push(`Bandolier:${i}: ${itemData.equipmentName}`);
          }
        }
        // Return at least one choice to prevent action from being marked unavailable
        return choices.length > 0 ? choices : ['(no equipment)'];
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const actingMerc = args.actingMerc as MercCard;
      const slotChoice = args.slot as string;

      // Find which squad the MERC is in to get the sector
      const findMercSector = (): Sector | null => {
        for (const squad of [player.primarySquad, player.secondarySquad]) {
          if (!squad?.sectorId) continue;
          const mercs = squad.getMercs();
          if (mercs.some(m => m.id === actingMerc.id)) {
            return game.getSector(squad.sectorId) || null;
          }
        }
        return null;
      };

      const sector = findMercSector();
      if (!sector) {
        return { success: false, message: 'MERC is not in a valid sector' };
      }

      // Parse the slot choice and drop the equipment using unequip() to sync UI data
      let droppedItem: Equipment | undefined;
      if (slotChoice.startsWith('Weapon:')) {
        droppedItem = actingMerc.unequip('Weapon');
      } else if (slotChoice.startsWith('Armor:')) {
        droppedItem = actingMerc.unequip('Armor');
      } else if (slotChoice.startsWith('Accessory:')) {
        droppedItem = actingMerc.unequip('Accessory');
      } else if (slotChoice.startsWith('Bandolier:')) {
        // Parse "Bandolier:N: equipmentName" format
        const match = slotChoice.match(/^Bandolier:(\d+):/);
        if (match) {
          const slotIndex = parseInt(match[1], 10);
          droppedItem = actingMerc.unequipBandolierSlot(slotIndex);
        }
      }

      if (!droppedItem) {
        return { success: false, message: 'Equipment not found' };
      }

      // Add to sector stash
      sector.addToStash(droppedItem);

      game.message(`${capitalize(actingMerc.mercName)} dropped ${droppedItem.equipmentName} in ${sector.sectorName}`);
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
    .condition((ctx) => {
      // Only rebels can use Doc heal
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      // Must not be in combat
      if (game.activeCombat) return false;

      // Find Doc in team
      const doc = player.team.find(m => m.mercId === 'doc' && !m.isDead);
      if (!doc) return false;

      // Get Doc's squad mates using helper method
      const docSquad = player.getSquadContaining(doc);
      if (!docSquad) return false;

      const squadMates = docSquad.getMercs().filter(m => m.id !== doc.id && !m.isDead);

      // Only show action if there are damaged MERCs in Doc's squad
      return squadMates.some(m => m.damage > 0) || doc.damage > 0;
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const doc = player.team.find(m => m.mercId === 'doc' && !m.isDead)!;

      // Find Doc's squad using helper method
      const docSquad = player.getSquadContaining(doc);
      const squadMercs = docSquad?.getLivingMercs() || [];

      // Heal all MERCs in squad (including Doc himself)
      let healed = 0;
      for (const merc of squadMercs) {
        if (merc.damage > 0) {
          const healAmount = merc.damage;
          merc.fullHeal();
          game.message(`Doc healed ${merc.mercName} for ${healAmount} damage`);
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
    .condition((ctx) => {
      // Only rebels can use Feedback ability
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      // Find Feedback in team
      const feedback = player.team.find(m => m.mercId === 'feedback' && !m.isDead);
      if (!feedback) return false;
      if (feedback.actionsRemaining < ACTION_COSTS.RE_EQUIP) return false;

      // Check if there's any equipment in discard piles
      const weaponDiscard = game.getEquipmentDiscard('Weapon');
      const armorDiscard = game.getEquipmentDiscard('Armor');
      const accessoryDiscard = game.getEquipmentDiscard('Accessory');

      const hasWeapons = weaponDiscard && weaponDiscard.count(Equipment) > 0;
      const hasArmor = armorDiscard && armorDiscard.count(Equipment) > 0;
      const hasAccessories = accessoryDiscard && accessoryDiscard.count(Equipment) > 0;

      return hasWeapons || hasArmor || hasAccessories;
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
      const player = ctx.player as RebelPlayer;
      const feedback = player.team.find(m => m.mercId === 'feedback' && !m.isDead)!;
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
        game.message(`${feedback.mercName} swapped ${replaced.equipmentName} for ${selectedEquipment.equipmentName}`);
      } else {
        game.message(`${feedback.mercName} retrieved ${selectedEquipment.equipmentName} from discard`);
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
    .condition((ctx) => {
      // Only rebels can use Squidhead ability
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      // Find Squidhead in team
      const squidhead = player.team.find(m => m.mercId === 'squidhead' && !m.isDead);
      if (!squidhead) return false;

      // Get Squidhead's sector
      const squad = [player.primarySquad, player.secondarySquad].find(s =>
        s.getMercs().some(m => m.id === squidhead.id)
      );
      if (!squad?.sectorId) return false;

      const sector = game.getSector(squad.sectorId);
      if (!sector) return false;

      // Check for land mines in stash
      const stash = sector.getStashContents();
      return stash.some(e => isLandMine(e.equipmentId));
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const squidhead = player.team.find(m => m.mercId === 'squidhead' && !m.isDead)!;

      // Get Squidhead's sector
      const squad = [player.primarySquad, player.secondarySquad].find(s =>
        s.getMercs().some(m => m.id === squidhead.id)
      )!;
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
        game.message(`${squidhead.mercName} disarms and collects the land mine`);
      } else {
        // Put it back in stash but mark as "disarmed" by removing from dictator's control
        sector.addToStash(mine);
        game.message(`${squidhead.mercName} disarms the land mine (left in stash)`);
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
    .condition((ctx) => {
      // Only rebels can use Squidhead ability
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      // Find Squidhead in team with a land mine equipped
      const squidhead = player.team.find(m => m.mercId === 'squidhead' && !m.isDead);
      if (!squidhead) return false;

      // Check if Squidhead has a land mine equipped (including bandolier)
      const hasLandMineInSlots = [squidhead.weaponSlot, squidhead.armorSlot, squidhead.accessorySlot].some(
        slot => slot && isLandMine(slot.equipmentId)
      );
      const hasLandMineInBandolier = squidhead.bandolierSlots.some(e => isLandMine(e.equipmentId));

      return hasLandMineInSlots || hasLandMineInBandolier;
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const squidhead = player.team.find(m => m.mercId === 'squidhead' && !m.isDead)!;

      // Get Squidhead's sector
      const squad = [player.primarySquad, player.secondarySquad].find(s =>
        s.getMercs().some(m => m.id === squidhead.id)
      );
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
      game.message(`${squidhead.mercName} arms a land mine at ${sector.sectorName}`);

      return { success: true, message: 'Armed land mine' };
    });
}

// =============================================================================
// Hagness Draw Action
// =============================================================================

// Local cache for equipment element reference (keyed by `playerId:equipmentType`)
const hagnessEquipmentCache = new Map<string, Equipment>();

// Helper to get cache key for Hagness equipment
function getHagnessCacheKey(playerId: string, equipmentType: string): string {
  return `${playerId}:${equipmentType}`;
}

// Helper to clear all cache entries for a player (used on action completion/failure)
function clearHagnessCache(playerId: string): void {
  for (const key of hagnessEquipmentCache.keys()) {
    if (key.startsWith(`${playerId}:`)) {
      hagnessEquipmentCache.delete(key);
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
    .condition((ctx) => {
      // Only rebels can use Hagness ability
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      // Find Hagness in team with actions
      const hagness = player.team.find(m => m.mercId === 'hagness' && !m.isDead);
      if (!hagness) return false;
      return hagness.actionsRemaining >= 1;
    })
    .chooseFrom<string>('equipmentType', {
      prompt: 'Choose equipment type to draw',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
    })
    .chooseFrom<string>('recipient', {
      prompt: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const playerId = `${player.position}`;
        const equipmentType = ctx.args?.equipmentType as string | undefined;
        console.log(`[HAGNESS DEBUG] prompt() called - playerId: ${playerId}, equipmentType: ${equipmentType}, ctx.args:`, ctx.args);

        // Try to find cached equipment for any type (we may not know which type was selected)
        if (equipmentType) {
          const cacheKey = getHagnessCacheKey(playerId, equipmentType);
          const equipment = hagnessEquipmentCache.get(cacheKey);
          console.log(`[HAGNESS DEBUG] prompt() cacheKey: ${cacheKey}, cached equipment: ${equipment?.equipmentName || 'none'}`);
          if (equipment) {
            return `Drew ${equipment.equipmentName}! Give to which squad member?`;
          }
        }

        return 'Give to:';
      },
      dependsOn: 'equipmentType', // Wait for equipmentType to be selected before showing choices
      // Note: Cannot use defer:true because ActionPanel doesn't fetch deferred choices for 2nd+ selections
      choices: (ctx) => {
        console.log(`[HAGNESS DEBUG] choices() called - ctx.args:`, ctx.args);
        if (!game.isRebelPlayer(ctx.player as any)) {
          console.log(`[HAGNESS DEBUG] choices() - not a rebel player, returning placeholder`);
          return ['(select equipment type first)'];
        }
        const player = ctx.player as RebelPlayer;
        const playerId = `${player.position}`;
        const equipmentType = ctx.args?.equipmentType as 'Weapon' | 'Armor' | 'Accessory' | undefined;

        console.log(`[HAGNESS DEBUG] choices() - playerId: ${playerId}, equipmentType: ${equipmentType}`);

        // During availability check, equipmentType won't be set - return placeholder
        if (!equipmentType) {
          console.log(`[HAGNESS DEBUG] choices() - no equipmentType, returning placeholder`);
          return ['(select equipment type first)'];
        }

        // Use typed cache key to ensure we draw fresh for each equipment type
        const cacheKey = getHagnessCacheKey(playerId, equipmentType);
        console.log(`[HAGNESS DEBUG] choices() - cacheKey: ${cacheKey}, cache has key: ${hagnessEquipmentCache.has(cacheKey)}`);

        // IMPORTANT: Don't draw equipment during speculative calls!
        // BoardSmith calls choices() for ALL equipment types to precompute options.
        // We only want to draw once per type, and never clear other types' cache.
        let equipmentData: Record<string, unknown> | null = null;

        // If recipient is already set, the user already clicked - don't redraw!
        const recipientAlreadySet = ctx.args?.recipient !== undefined;
        console.log(`[HAGNESS DEBUG] choices() - recipientAlreadySet: ${recipientAlreadySet}`);

        if (!hagnessEquipmentCache.has(cacheKey) && !recipientAlreadySet) {
          // DON'T call clearHagnessCache here - it clears OTHER types' cache!
          console.log(`[HAGNESS DEBUG] choices() - drawing new equipment of type: ${equipmentType}`);

          const eq = game.drawEquipment(equipmentType);
          console.log(`[HAGNESS DEBUG] choices() - drew equipment: ${eq?.equipmentName || 'null'}, type: ${eq?.equipmentType || 'null'}`);
          if (eq) {
            hagnessEquipmentCache.set(cacheKey, eq);
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
            game.hagnessDrawnEquipmentData[stateKey] = equipmentData as any;
          }
        } else {
          const eq = hagnessEquipmentCache.get(cacheKey)!;
          console.log(`[HAGNESS DEBUG] choices() - using cached equipment: ${eq.equipmentName}`);
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
        const hagness = player.team.find(m => m.mercId === 'hagness' && !m.isDead);
        console.log(`[HAGNESS DEBUG] choices() - hagness found: ${!!hagness}, mercId: ${hagness?.mercId}`);
        if (!hagness) {
          console.log(`[HAGNESS DEBUG] choices() - no hagness, returning []`);
          return [];
        }

        const hagnessSquad = player.getSquadContaining(hagness);
        console.log(`[HAGNESS DEBUG] choices() - hagnessSquad found: ${!!hagnessSquad}, sectorId: ${hagnessSquad?.sectorId}`);
        if (!hagnessSquad) {
          console.log(`[HAGNESS DEBUG] choices() - no hagnessSquad, returning []`);
          return [];
        }

        const squadMates = hagnessSquad.getLivingMercs();
        console.log(`[HAGNESS DEBUG] choices() - squadMates count: ${squadMates.length}, names: ${squadMates.map(m => m.mercName).join(', ')}`);

        // Include equipment name in display so user knows what they're giving
        const equipName = equipmentData?.equipmentName || 'equipment';
        const choices = squadMates.map(m => ({
          value: capitalize(m.mercName),
          display: `${capitalize(m.mercName)} ← ${equipName}`,
          equipment: equipmentData,
        }));
        console.log(`[HAGNESS DEBUG] choices() - returning ${choices.length} choices:`, choices.map(c => c.display));
        return choices;
      },
    })
    .execute((args, ctx) => {
      console.log(`[HAGNESS DEBUG] execute() called - args:`, args);
      const player = ctx.player as RebelPlayer;
      const playerId = `${player.position}`;
      const equipmentType = args.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
      const cacheKey = getHagnessCacheKey(playerId, equipmentType);
      const hagness = player.team.find(m => m.mercId === 'hagness' && !m.isDead)!;
      console.log(`[HAGNESS DEBUG] execute() - playerId: ${playerId}, equipmentType: ${equipmentType}, cacheKey: ${cacheKey}`);

      // Handle recipient - might be string or object {value, display, equipment}
      const recipientArg = args.recipient;
      console.log(`[HAGNESS DEBUG] execute() - recipientArg:`, recipientArg, `type: ${typeof recipientArg}`);
      let recipientName: string;
      if (typeof recipientArg === 'string') {
        recipientName = recipientArg;
      } else if (recipientArg && typeof recipientArg === 'object') {
        // Extract name from object format
        recipientName = (recipientArg as any).value || (recipientArg as any).display || String(recipientArg);
      } else {
        recipientName = String(recipientArg || '');
      }

      // Find recipient MERC
      const hagnessSquad = player.getSquadContaining(hagness);
      console.log(`[HAGNESS DEBUG] execute() - hagnessSquad: ${!!hagnessSquad}`);
      if (!hagnessSquad) {
        clearHagnessCache(playerId);
        for (const key of Object.keys(game.hagnessDrawnEquipmentData)) {
          if (key.startsWith(`${playerId}:`)) delete game.hagnessDrawnEquipmentData[key];
        }
        console.log(`[HAGNESS DEBUG] execute() - FAIL: Hagness squad not found`);
        return { success: false, message: 'Hagness squad not found' };
      }

      console.log(`[HAGNESS DEBUG] execute() - looking for recipient: "${recipientName}"`);
      console.log(`[HAGNESS DEBUG] execute() - squad mercs: ${hagnessSquad.getLivingMercs().map(m => capitalize(m.mercName)).join(', ')}`);
      const recipient = hagnessSquad.getLivingMercs().find(m => capitalize(m.mercName) === recipientName);
      console.log(`[HAGNESS DEBUG] execute() - recipient found: ${!!recipient}, name: ${recipient?.mercName}`);
      if (!recipient) {
        clearHagnessCache(playerId);
        for (const key of Object.keys(game.hagnessDrawnEquipmentData)) {
          if (key.startsWith(`${playerId}:`)) delete game.hagnessDrawnEquipmentData[key];
        }
        console.log(`[HAGNESS DEBUG] execute() - FAIL: Recipient not found`);
        return { success: false, message: 'Recipient not found' };
      }

      // Get cached equipment element using typed key
      console.log(`[HAGNESS DEBUG] execute() - looking for cached equipment with key: ${cacheKey}`);
      console.log(`[HAGNESS DEBUG] execute() - cache keys: ${Array.from(hagnessEquipmentCache.keys()).join(', ')}`);
      const equipment = hagnessEquipmentCache.get(cacheKey);
      console.log(`[HAGNESS DEBUG] execute() - equipment found: ${!!equipment}, name: ${equipment?.equipmentName}`);
      if (!equipment) {
        clearHagnessCache(playerId);
        for (const key of Object.keys(game.hagnessDrawnEquipmentData)) {
          if (key.startsWith(`${playerId}:`)) delete game.hagnessDrawnEquipmentData[key];
        }
        console.log(`[HAGNESS DEBUG] execute() - FAIL: No equipment available`);
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
      clearHagnessCache(playerId);
      // Clean up all typed state keys for this player
      for (const key of Object.keys(game.hagnessDrawnEquipmentData)) {
        if (key.startsWith(`${playerId}:`)) {
          delete game.hagnessDrawnEquipmentData[key];
        }
      }

      hagness.useAction(1);
      console.log(`[HAGNESS DEBUG] execute() - SUCCESS! Equipped ${equipment.equipmentName} to ${recipient.mercName}`);
      console.log(`[HAGNESS DEBUG] execute() - Hagness actions remaining: ${hagness.actionsRemaining}`);
      console.log(`[HAGNESS DEBUG] execute() - Recipient weapon slot: ${recipient.weaponSlot?.equipmentName}`);
      game.message(`Hagness gives ${equipment.equipmentName} to ${recipient.mercName}`);

      return { success: true, message: `Gave ${equipment.equipmentName} to ${recipient.mercName}` };
    });
}

// =============================================================================
// Repair Kit Action
// =============================================================================

/**
 * Helper to find MERCs with Repair Kit equipped
 */
function getMercsWithRepairKit(player: RebelPlayer): MercCard[] {
  return player.team.filter(merc => {
    if (merc.isDead) return false;
    // Check accessory slot
    if (merc.accessorySlot && isRepairKit(merc.accessorySlot.equipmentId)) return true;
    // Check bandolier slots
    return merc.bandolierSlots.some(e => isRepairKit(e.equipmentId));
  });
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
    .condition((ctx) => {
      // Cannot use during combat
      if (game.activeCombat) return false;
      // Only rebels can use repair kit
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;

      // Check if any MERC has a Repair Kit equipped
      const mercsWithKit = getMercsWithRepairKit(player);
      if (mercsWithKit.length === 0) return false;

      // Check if any discard pile has equipment
      const discardEquip = getDiscardPileEquipment(game);
      return discardEquip.length > 0;
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to use Repair Kit',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;

        if (!isInPlayerTeam(merc, player)) return false;
        if (merc.isDead) return false;

        // MERC must have Repair Kit
        if (merc.accessorySlot && isRepairKit(merc.accessorySlot.equipmentId)) return true;
        return merc.bandolierSlots.some(e => isRepairKit(e.equipmentId));
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
      const player = ctx.player as RebelPlayer;
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

      // Find the MERC's sector to put equipment in stash
      const squad = player.getSquadContaining(merc);
      if (!squad?.sectorId) {
        return { success: false, message: 'MERC not in a valid sector' };
      }

      const sector = game.getSector(squad.sectorId);
      if (!sector) {
        return { success: false, message: 'Sector not found' };
      }

      // Remove from discard pile and add to sector stash
      const discardPile = game.getEquipmentDiscard(pileType);
      if (discardPile) {
        // Move from discard to stash
        sector.addToStash(retrievedEquip);
      }

      game.message(`${merc.mercName} uses Repair Kit to retrieve ${retrievedEquip.equipmentName} from discard`);

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

/**
 * Get valid mortar targets for rebels (sectors with dictator forces).
 */
function getRebelMortarTargets(game: MERCGame, fromSector: Sector): Sector[] {
  const adjacent = game.getAdjacentSectors(fromSector);
  return adjacent.filter(sector => {
    // Check if sector has dictator forces
    const hasDictatorMercs = game.dictatorPlayer?.hiredMercs.some(m =>
      m.sectorId === sector.sectorId && !m.isDead
    ) ?? false;
    const hasDictator = game.dictatorPlayer?.dictator?.sectorId === sector.sectorId &&
                        game.dictatorPlayer?.dictator?.inPlay;
    const hasDictatorMilitia = sector.dictatorMilitia > 0;
    return hasDictatorMercs || hasDictator || hasDictatorMilitia;
  });
}

/**
 * Count dictator targets in a sector (MERCs + militia + dictator).
 */
function countDictatorTargetsInSector(game: MERCGame, sector: Sector): number {
  let count = 0;

  // Count dictator MERCs
  const dictatorMercs = game.dictatorPlayer?.hiredMercs.filter(m =>
    m.sectorId === sector.sectorId && !m.isDead
  ) ?? [];
  count += dictatorMercs.length;

  // Count dictator itself
  if (game.dictatorPlayer?.dictator?.sectorId === sector.sectorId &&
      game.dictatorPlayer?.dictator?.inPlay) {
    count += 1;
  }

  // Count dictator militia
  count += sector.dictatorMilitia;

  return count;
}

/**
 * Fire mortar at an adjacent sector.
 * Cost: 1 action
 * Per rules: Mortars attack adjacent sectors without entering them.
 * Deals 1 damage to all enemies in the target sector.
 */
export function createMortarAction(game: MERCGame): ActionDefinition {
  return Action.create('rebelMortar')
    .prompt('Fire Mortar')
    .condition((ctx) => {
      // Cannot use during combat
      if (game.activeCombat) return false;
      // Only rebels can use this
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;

      // Check if any MERC has a mortar and actions, and there are valid targets
      for (const merc of player.team) {
        if (merc.isDead || merc.actionsRemaining < 1) continue;
        if (!hasMortar(merc)) continue;

        const squad = player.getSquadContaining(merc);
        if (!squad?.sectorId) continue;

        const sector = game.getSector(squad.sectorId);
        if (!sector) continue;

        const targets = getRebelMortarTargets(game, sector);
        if (targets.length > 0) return true;
      }

      return false;
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to fire mortar',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;

        // MERC must be in player's team, have actions, and have mortar
        if (!isInPlayerTeam(merc, player)) return false;
        if (merc.isDead || merc.actionsRemaining < 1) return false;
        if (!hasMortar(merc)) return false;

        // Must have valid targets
        const squad = player.getSquadContaining(merc);
        if (!squad?.sectorId) return false;

        const sector = game.getSector(squad.sectorId);
        if (!sector) return false;

        const targets = getRebelMortarTargets(game, sector);
        return targets.length > 0;
      },
    })
    .chooseElement<Sector>('targetSector', {
      prompt: 'Select sector to bombard',
      elementClass: Sector,
      display: (sector) => `${sector.sectorName} (${countDictatorTargetsInSector(game, sector)} targets)`,
      boardRef: (sector) => ({ id: sector.id }),
      filter: (element, ctx) => {
        const sector = element as unknown as Sector;
        const merc = ctx.args?.merc as MercCard | undefined;
        if (!merc?.sectorId) return false;

        const fromSector = game.getSector(merc.sectorId);
        if (!fromSector) return false;

        const validTargets = getRebelMortarTargets(game, fromSector);
        return validTargets.some(t => t.sectorId === sector.sectorId);
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const merc = args.merc as MercCard;
      const targetSector = args.targetSector as Sector;

      // Use action
      merc.useAction(1);

      // Mortar deals 1 damage per target
      const mortarDamage = 1;

      game.message(`${merc.mercName} fires mortar at ${targetSector.sectorName}!`);

      let totalDamage = 0;

      // Damage dictator MERCs
      const dictatorMercs = game.dictatorPlayer?.hiredMercs.filter(m =>
        m.sectorId === targetSector.sectorId && !m.isDead
      ) ?? [];
      for (const target of dictatorMercs) {
        target.takeDamage(mortarDamage);
        totalDamage++;
        game.message(`Mortar deals ${mortarDamage} damage to ${target.mercName}`);
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

      // Damage militia
      if (targetSector.dictatorMilitia > 0) {
        const militiaKilled = Math.min(mortarDamage, targetSector.dictatorMilitia);
        targetSector.removeDictatorMilitia(militiaKilled);
        totalDamage++;
        game.message(`Mortar kills ${militiaKilled} dictator militia`);
      }

      // Discard the mortar after use (mortars are one-use)
      const accessoryDiscard = game.getEquipmentDiscard('Accessory');
      if (merc.accessorySlot && hasRangedAttack(merc.accessorySlot.equipmentId)) {
        const mortar = merc.unequip('Accessory');
        if (mortar && accessoryDiscard) {
          mortar.putInto(accessoryDiscard);
        }
        game.message(`${merc.mercName}'s mortar is used up!`);
      } else {
        // Check bandolier slots
        const mortarInBandolier = merc.bandolierSlots.find(e => hasRangedAttack(e.equipmentId));
        if (mortarInBandolier) {
          const slotMatch = mortarInBandolier.equippedSlot?.match(/^bandolier:(\d+)$/);
          if (slotMatch) {
            const index = parseInt(slotMatch[1], 10);
            merc.unequipBandolierSlot(index);
            if (accessoryDiscard) {
              mortarInBandolier.putInto(accessoryDiscard);
            }
            game.message(`${merc.mercName}'s mortar is used up!`);
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
    .condition((ctx) => {
      // Cannot use during combat
      if (game.activeCombat) return false;
      // Only rebels can use this
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;

      // Base must be revealed
      if (!game.dictatorPlayer?.baseRevealed || !game.dictatorPlayer?.baseSectorId) {
        return false;
      }

      const baseSectorId = game.dictatorPlayer.baseSectorId;

      // Check if any MERC is in the base sector with both components
      for (const merc of player.team) {
        if (merc.isDead || merc.actionsRemaining < 1) continue;

        // Check if MERC is in base sector
        const squad = player.getSquadContaining(merc);
        if (!squad || squad.sectorId !== baseSectorId) continue;

        // Check if MERC has both components
        if (hasBothExplosivesComponents(merc)) {
          return true;
        }
      }

      return false;
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to detonate explosives',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;

        if (!isInPlayerTeam(merc, player)) return false;
        if (merc.isDead || merc.actionsRemaining < 1) return false;

        // Must be in base sector
        const baseSectorId = game.dictatorPlayer?.baseSectorId;
        if (!baseSectorId) return false;

        const squad = player.getSquadContaining(merc);
        if (!squad || squad.sectorId !== baseSectorId) return false;

        return hasBothExplosivesComponents(merc);
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const merc = args.merc as MercCard;

      // Use action
      merc.useAction(1);

      // Get base sector for messaging
      const baseSector = game.getSector(game.dictatorPlayer!.baseSectorId!);
      const sectorName = baseSector?.sectorName ?? 'the palace';

      game.message(`${merc.mercName} detonates the explosives!`);
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
          const discard = game.getEquipmentDiscard(item.equipmentType as any);
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
        const discard = game.getEquipmentDiscard(item.equipmentType as any);
        if (discard) item.putInto(discard);
      }

      return {
        success: true,
        message: 'The palace has been destroyed! Rebels win!',
        data: { explosivesVictory: true },
      };
    });
}
