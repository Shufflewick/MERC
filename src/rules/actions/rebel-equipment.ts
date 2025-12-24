/**
 * Rebel Equipment Actions
 *
 * Equipment management and MERC special abilities related to equipment.
 */

import { Action, type ActionDefinition } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer } from '../game.js';
import { MercCard, Sector, Equipment } from '../elements.js';
import {
  ACTION_COSTS,
  capitalize,
  hasActionsRemaining,
  isInPlayerTeam,
  useAction,
} from './helpers.js';
import { isLandMine } from '../equipment-effects.js';

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
    .prompt('Re-equip from stash')
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
      skipIfOnlyOne: true,
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

        const stash = sector.stash;
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
    .prompt('Drop equipment')
    .condition((ctx, tracer) => {
      // Cannot drop equipment during combat
      if (game.activeCombat) return false;
      // Only rebels can drop equipment
      const isRebel = game.isRebelPlayer(ctx.player as any);
      if (tracer) tracer.check('isRebelPlayer', isRebel);
      if (!isRebel) return false;
      const player = ctx.player as RebelPlayer;

      // Check if any MERC has equipment to drop
      const hasEquippedMerc = player.team.some(m =>
        !m.isDead && (m.weaponSlot || m.armorSlot || m.accessorySlot)
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

        // MERC must be in player's team and have equipment
        if (!isInPlayerTeam(merc, player)) return false;
        return !!(merc.weaponSlot || merc.armorSlot || merc.accessorySlot);
      },
    })
    .chooseFrom<string>('slot', {
      prompt: 'Select equipment to drop',
      dependsOn: 'actingMerc',
      choices: (ctx) => {
        const actingMerc = ctx.args?.actingMerc as MercCard;
        if (!actingMerc) return [];

        const choices: string[] = [];
        if (actingMerc.weaponSlot) {
          choices.push(`Weapon: ${actingMerc.weaponSlot.equipmentName}`);
        }
        if (actingMerc.armorSlot) {
          choices.push(`Armor: ${actingMerc.armorSlot.equipmentName}`);
        }
        if (actingMerc.accessorySlot) {
          choices.push(`Accessory: ${actingMerc.accessorySlot.equipmentName}`);
        }
        return choices;
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

      // Parse the slot choice and drop the equipment
      let droppedItem: Equipment | null = null;
      if (slotChoice.startsWith('Weapon:') && actingMerc.weaponSlot) {
        droppedItem = actingMerc.weaponSlot;
        actingMerc.weaponSlot = null;
      } else if (slotChoice.startsWith('Armor:') && actingMerc.armorSlot) {
        droppedItem = actingMerc.armorSlot;
        actingMerc.armorSlot = null;
      } else if (slotChoice.startsWith('Accessory:') && actingMerc.accessorySlot) {
        droppedItem = actingMerc.accessorySlot;
        actingMerc.accessorySlot = null;
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

      // Check if Squidhead has a land mine equipped
      const hasLandMine = [squidhead.weaponSlot, squidhead.armorSlot, squidhead.accessorySlot].some(
        slot => slot && isLandMine(slot.equipmentId)
      );

      return hasLandMine;
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

/**
 * MERC-jrph: Hagness can draw equipment for squad
 * Cost: 1 action
 * Per rules: "Spend 1 action to draw 3 pieces of equipment, choose 1 and give it to any member of his squad."
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
    .chooseElement<MercCard>('recipient', {
      prompt: 'Give equipment to which squad member?',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        // Safety check - only rebels can use Hagness ability
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        const hagness = player.team.find(m => m.mercId === 'hagness' && !m.isDead);
        if (!hagness) return false;

        // Find Hagness's squad using helper method
        const hagnessSquad = player.getSquadContaining(hagness);
        if (!hagnessSquad) return false;

        const squadMates = hagnessSquad.getLivingMercs();
        return squadMates.some(m => m.id === merc.id);
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const hagness = player.team.find(m => m.mercId === 'hagness' && !m.isDead)!;
      const recipient = args.recipient as MercCard;

      if (!recipient) {
        return { success: false, message: 'Selection cancelled' };
      }

      // Draw 3 random equipment from different decks
      const drawnEquipment: Equipment[] = [];
      const types: ('Weapon' | 'Armor' | 'Accessory')[] = ['Weapon', 'Armor', 'Accessory'];
      for (const type of types) {
        const eq = game.drawEquipment(type);
        if (eq) drawnEquipment.push(eq);
      }

      if (drawnEquipment.length === 0) {
        return { success: false, message: 'No equipment available' };
      }

      // For AI/auto-play: choose the best equipment for the recipient
      // Sort by what they can use and what would be an upgrade
      let bestEquip: Equipment | null = null;
      for (const eq of drawnEquipment) {
        if (recipient.canEquip(eq)) {
          const current = recipient.getEquipmentOfType(eq.equipmentType);
          if (!current || (eq.serial || 0) > (current.serial || 0)) {
            bestEquip = eq;
            break;
          }
        }
      }

      // If no upgrade found, just take the first equippable
      if (!bestEquip) {
        bestEquip = drawnEquipment.find(eq => recipient.canEquip(eq)) || drawnEquipment[0];
      }

      // Equip selected item to recipient
      const replaced = recipient.equip(bestEquip);

      // Return replaced and unselected equipment to discard
      for (const eq of drawnEquipment) {
        if (eq !== bestEquip) {
          const discard = game.getEquipmentDiscard(eq.equipmentType);
          if (discard) eq.putInto(discard);
        }
      }
      if (replaced) {
        const discard = game.getEquipmentDiscard(replaced.equipmentType);
        if (discard) replaced.putInto(discard);
      }

      hagness.useAction(1);
      game.message(`Hagness gives ${bestEquip.equipmentName} to ${recipient.mercName}`);

      return { success: true, message: `Gave ${bestEquip.equipmentName} to ${recipient.mercName}` };
    });
}
