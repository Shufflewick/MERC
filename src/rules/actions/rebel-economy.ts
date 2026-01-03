/**
 * Rebel Economy Actions
 *
 * MERC economy-related actions: hiring, exploring, training, trading, and facilities.
 */

import { Action, type ActionDefinition } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer } from '../game.js';
import { MercCard, Sector, Equipment, Squad, isGrenadeOrMortar, DictatorCard } from '../elements.js';
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
} from './helpers.js';


// =============================================================================
// Hire MERC Action
// =============================================================================

// Settings key for drawn MERCs cache (persists across BoardSmith contexts)
const HIRE_DRAWN_MERCS_KEY = 'hireDrawnMercs';

// Helper to get cached MERC IDs from game.settings
function getHireDrawnMercIds(game: MERCGame, playerId: string): number[] | undefined {
  const key = `${HIRE_DRAWN_MERCS_KEY}:${playerId}`;
  return game.settings[key] as number[] | undefined;
}

// Helper to set cached MERC IDs in game.settings
function setHireDrawnMercIds(game: MERCGame, playerId: string, mercIds: number[]): void {
  const key = `${HIRE_DRAWN_MERCS_KEY}:${playerId}`;
  game.settings[key] = mercIds;
}

// Helper to clear cached MERC IDs from game.settings
function clearHireDrawnMercIds(game: MERCGame, playerId: string): void {
  const key = `${HIRE_DRAWN_MERCS_KEY}:${playerId}`;
  delete game.settings[key];
}

// Helper to get MercCard elements from cached IDs
function getHireDrawnMercs(game: MERCGame, playerId: string): MercCard[] | undefined {
  const ids = getHireDrawnMercIds(game, playerId);
  if (!ids) return undefined; // No cache - caller should draw
  if (ids.length === 0) return []; // Cache exists but empty
  return ids.map(id => game.getElementById(id) as MercCard).filter(Boolean);
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
    .condition((ctx) => {
      // Cannot hire during combat
      if (game.activeCombat) return false;
      // Only rebels can hire MERCs
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      if (!player.canHireMerc(game)) return false;
      if (!hasActionsRemaining(player, ACTION_COSTS.HIRE_MERC)) return false;
      return game.mercDeck.count(MercCard) > 0;
    })
    .chooseElement<MercCard>('actingMerc', {
      prompt: 'Which MERC spends the actions?',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        // Safety check - only rebels can hire MERCs
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return isInPlayerTeam(merc, player) && merc.actionsRemaining >= ACTION_COSTS.HIRE_MERC;
      },
    })
    // MERC-yi7: Optional fire a MERC during hire action
    .chooseFrom<string>('fireFirst', {
      prompt: 'Fire a MERC first? (frees team slot)',
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
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
        const player = ctx.player as RebelPlayer;
        const fireChoice = ctx.data?.fireFirst as string;
        const willFire = fireChoice && fireChoice !== 'none';
        const teamLimit = player.getTeamLimit(game);
        const currentSize = player.teamSize - (willFire ? 1 : 0);
        const canHire = Math.max(0, teamLimit - currentSize);
        return `Select MERCs to hire (up to ${canHire})`;
      },
      multiSelect: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const fireChoice = ctx.data?.fireFirst as string;
        const willFire = fireChoice && fireChoice !== 'none';
        const teamLimit = player.getTeamLimit(game);
        const currentSize = player.teamSize - (willFire ? 1 : 0);
        const canHire = Math.max(1, teamLimit - currentSize);
        return { min: 1, max: canHire };
      },
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const playerId = `${player.position}`;

        // Draw 3 MERCs if not already cached
        let drawnMercs = getHireDrawnMercs(game, playerId);
        if (!drawnMercs) {
          const drawn = drawMercsForHiring(game, 3);
          setHireDrawnMercIds(game, playerId, drawn.map(m => m.id));
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
      const player = ctx.player as RebelPlayer;
      const actingMerc = args.actingMerc as MercCard;
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
        clearHireDrawnMercIds(game, playerId);
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

      // MERC-l1q: Determine which squad to place new MERCs in
      // Per rules: "If squads exist: new MERC must join an existing squad"
      // Use primary squad if it has MERCs, otherwise secondary if it exists
      let targetSquad = player.primarySquad;
      if (player.primarySquad.mercCount === 0 && player.secondarySquad.mercCount > 0) {
        targetSquad = player.secondarySquad;
      }

      for (const merc of drawnMercs) {
        if (selectedNames.includes(capitalize(merc.mercName)) && currentSize < teamLimit) {
          merc.putInto(targetSquad);
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
            // All slots filled, draw random
            const types: ('Weapon' | 'Armor' | 'Accessory')[] = ['Weapon', 'Armor', 'Accessory'];
            equipType = types[Math.floor(Math.random() * types.length)];
          }

          let freeEquipment = game.drawEquipment(equipType);

          // MERC-70a: If Apeiron draws a grenade/mortar, discard and redraw
          if (merc.mercId === 'apeiron' && freeEquipment && isGrenadeOrMortar(freeEquipment)) {
            const discard = game.getEquipmentDiscard(equipType);
            if (discard) {
              freeEquipment.putInto(discard);
              game.message(`${merc.mercName} refuses to use ${freeEquipment.equipmentName} - discarding and drawing again`);
            }
            freeEquipment = game.drawEquipment(equipType);
            // Keep redrawing up to 3 times if still getting grenades
            for (let attempts = 0; attempts < 3 && freeEquipment && isGrenadeOrMortar(freeEquipment); attempts++) {
              if (discard) {
                freeEquipment.putInto(discard);
                game.message(`${merc.mercName} refuses to use ${freeEquipment.equipmentName} - discarding and drawing again`);
              }
              freeEquipment = game.drawEquipment(equipType);
            }
            // If still a grenade after multiple attempts, skip equipping
            if (freeEquipment && isGrenadeOrMortar(freeEquipment)) {
              const disc = game.getEquipmentDiscard(equipType);
              if (disc) freeEquipment.putInto(disc);
              freeEquipment = undefined;
              game.message(`${merc.mercName} could not find acceptable equipment`);
            }
          }

          if (freeEquipment) {
            const replaced = merc.equip(freeEquipment);
            if (replaced) {
              // Put replaced equipment in sector stash
              const sector = targetSquad?.sectorId ? game.getSector(targetSquad.sectorId) : null;
              if (sector) {
                sector.addToStash(replaced);
              } else {
                const discard = game.getEquipmentDiscard(replaced.equipmentType);
                if (discard) replaced.putInto(discard);
              }
            }
            game.message(`${merc.mercName} equipped free ${freeEquipment.equipmentName}`);
          }

          // MERC-9mxd: Vrbansk gets a free accessory when hired
          if (merc.mercId === 'vrbansk' && !merc.accessorySlot) {
            const freeAccessory = game.drawEquipment('Accessory');
            if (freeAccessory) {
              merc.equip(freeAccessory);
              game.message(`${merc.mercName} receives bonus accessory: ${freeAccessory.equipmentName}`);
            }
          }

          hired.push(merc.mercName);
          currentSize++;
        } else {
          // Discard unhired MERCs
          merc.putInto(game.mercDiscard);
        }
      }

      clearHireDrawnMercIds(game, playerId);

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

// Helper to check if unit is a DictatorCard
function isDictatorCardUnit(unit: ExplorableUnit): unit is DictatorCard {
  return unit instanceof DictatorCard;
}

// Helper to get unit name for display
function getUnitNameForExplore(unit: ExplorableUnit): string {
  if (isDictatorCardUnit(unit)) {
    return unit.dictatorName;
  }
  return unit.mercName;
}

// Helper to find the sector a unit is in (works for any player type)
function findUnitSectorForExplore(unit: ExplorableUnit, player: any, game: MERCGame): Sector | null {
  if (game.isRebelPlayer(player)) {
    const rebelPlayer = player as RebelPlayer;
    const merc = unit as MercCard;
    for (const squad of [rebelPlayer.primarySquad, rebelPlayer.secondarySquad]) {
      if (!squad?.sectorId) continue;
      const mercs = squad.getMercs();
      if (mercs.some(m => m.id === merc.id)) {
        return game.getSector(squad.sectorId) || null;
      }
    }
  }
  if (game.isDictatorPlayer(player) && game.dictatorPlayer) {
    // DictatorCard uses its own sectorId directly
    if (isDictatorCardUnit(unit)) {
      if (unit.sectorId) {
        return game.getSector(unit.sectorId) || null;
      }
      return null;
    }
    // MercCard - check squad first
    const merc = unit as MercCard;
    const squad = game.dictatorPlayer.getSquadContaining(merc);
    if (squad?.sectorId) {
      return game.getSector(squad.sectorId) || null;
    }
    // Fallback to merc's sectorId
    if (merc.sectorId) {
      return game.getSector(merc.sectorId) || null;
    }
  }
  return null;
}

// Helper to check if unit belongs to player (for explore action)
function isUnitOwnedForExplore(unit: ExplorableUnit, player: any, game: MERCGame): boolean {
  if (game.isRebelPlayer(player)) {
    const merc = unit as MercCard;
    return isInPlayerTeam(merc, player as RebelPlayer);
  }
  if (game.isDictatorPlayer(player)) {
    // DictatorCard always belongs to dictator
    if (isDictatorCardUnit(unit)) {
      return unit.inPlay && !unit.isDead;
    }
    const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
    return dictatorMercs.some(m => m.id === unit.id);
  }
  return false;
}

// Helper to check if unit can explore (in unexplored sector with actions)
function canUnitExplore(unit: ExplorableUnit, player: any, game: MERCGame): boolean {
  if (unit.actionsRemaining < ACTION_COSTS.EXPLORE) return false;
  if (isDictatorCardUnit(unit) && (!unit.inPlay || unit.isDead)) return false;
  const sector = findUnitSectorForExplore(unit, player, game);
  return sector !== null && !sector.explored;
}

// Helper to get living units for any player type (for explore action)
// Returns MERCs + DictatorCard if applicable
function getPlayerUnitsForExplore(player: any, game: MERCGame): ExplorableUnit[] {
  if (game.isRebelPlayer(player)) {
    return (player as RebelPlayer).team.filter(m => !m.isDead);
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
function findMercSectorForExplore(merc: MercCard, player: any, game: MERCGame): Sector | null {
  return findUnitSectorForExplore(merc, player, game);
}

function isMercOwnedForExplore(merc: MercCard, player: any, game: MERCGame): boolean {
  return isUnitOwnedForExplore(merc, player, game);
}

function canMercExplore(merc: MercCard, player: any, game: MERCGame): boolean {
  return canUnitExplore(merc, player, game);
}

function getPlayerMercsForExplore(player: any, game: MERCGame): MercCard[] {
  if (game.isRebelPlayer(player)) {
    return (player as RebelPlayer).team.filter(m => !m.isDead);
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
    .condition((ctx, tracer) => {
      // Cannot explore during combat
      if (game.activeCombat) return false;

      // Must be rebel or dictator player
      const isRebel = game.isRebelPlayer(ctx.player as any);
      const isDictator = game.isDictatorPlayer(ctx.player as any);
      if (tracer) tracer.check('isRebelPlayer', isRebel);
      if (tracer) tracer.check('isDictatorPlayer', isDictator);
      if (!isRebel && !isDictator) return false;

      // Get living units for this player (MERCs + DictatorCard)
      const livingUnits = getPlayerUnitsForExplore(ctx.player, game);
      if (tracer) tracer.check('livingUnits.count', livingUnits.length);

      // Check if any unit can explore (in unexplored sector with actions)
      const canExplore = livingUnits.some(u => canUnitExplore(u, ctx.player, game));
      if (tracer) tracer.check('hasExplorerCapable', canExplore);
      return canExplore;
    })
    .chooseFrom<{ id: number; name: string; isDictatorCard: boolean }>('actingUnit', {
      prompt: 'Which unit explores?',
      choices: (ctx) => {
        const units = getPlayerUnitsForExplore(ctx.player, game);
        return units
          .filter(u => canUnitExplore(u, ctx.player, game))
          .map(u => ({
            value: {
              id: u.id,
              name: getUnitNameForExplore(u),
              isDictatorCard: isDictatorCardUnit(u),
            },
            label: capitalize(getUnitNameForExplore(u)),
          }));
      },
    })
    .execute((args, ctx) => {
      const unitChoice = args.actingUnit as { id: number; name: string; isDictatorCard: boolean };

      // Find the actual unit
      let actingUnit: ExplorableUnit | null = null;
      if (unitChoice.isDictatorCard) {
        actingUnit = game.dictatorPlayer?.dictator || null;
      } else {
        actingUnit = game.all(MercCard).find(m => m.id === unitChoice.id) || null;
      }

      if (!actingUnit) {
        return { success: false, message: 'Unit not found' };
      }

      // Find the sector
      const sector = findUnitSectorForExplore(actingUnit, ctx.player, game);
      if (!sector) {
        return { success: false, message: 'No sector found' };
      }

      // Spend action (works for both MercCard and DictatorCard)
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
        const randomType = types[Math.floor(Math.random() * types.length)];
        const bonusEquipment = game.drawEquipment(randomType);
        if (bonusEquipment) sector.addToStash(bonusEquipment);
      }

      // Mark explored
      sector.explore();

      // Get unit name for messages
      const unitName = getUnitNameForExplore(actingUnit);

      // Report what was found
      if (sector.stashCount > 0) {
        const equipmentList = sector.stash.map(e => e.equipmentName).join(', ');
        game.message(`${capitalize(unitName)} explored ${sector.sectorName} and found: ${equipmentList}`);

        // Chain to collectEquipment action with pre-filled args
        // Pass objects with name property so chips display names instead of IDs
        return {
          success: true,
          message: `Explored ${sector.sectorName}`,
          followUp: {
            action: 'collectEquipment',
            args: {
              mercId: { id: actingUnit.id, name: capitalize(unitName) },
              sectorId: { id: sector.id, name: sector.sectorName },
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
export function createCollectEquipmentAction(game: MERCGame): ActionDefinition {
  // Helper to resolve sector from ctx.args (handles numeric ID or object with id)
  function getSector(ctx: any): Sector | undefined {
    const sectorArg = ctx.args?.sectorId;
    if (typeof sectorArg === 'number') {
      return game.getElementById(sectorArg) as Sector | undefined;
    } else if (sectorArg && typeof sectorArg === 'object' && 'id' in sectorArg) {
      // Object with id property - look up the actual Sector element
      return game.getElementById(sectorArg.id) as Sector | undefined;
    }
    return undefined;
  }

  // Helper to resolve merc from ctx.args (handles numeric ID or object with id)
  function getMerc(ctx: any): MercCard | undefined {
    const mercArg = ctx.args?.mercId;
    if (typeof mercArg === 'number') {
      return game.getElementById(mercArg) as MercCard | undefined;
    } else if (mercArg && typeof mercArg === 'object' && 'id' in mercArg) {
      // Object with id property - look up the actual MercCard element
      return game.getElementById(mercArg.id) as MercCard | undefined;
    }
    return undefined;
  }

  return Action.create('collectEquipment')
    .prompt('Take from stash')
    .chooseElement<Equipment>('equipment', {
      prompt: (ctx) => {
        const merc = getMerc(ctx);
        const sector = getSector(ctx);
        const remaining = sector?.stashCount || 0;
        return merc
          ? `What should ${capitalize(merc.mercName)} take? (${remaining} item${remaining !== 1 ? 's' : ''} left, or skip)`
          : 'Select equipment';
      },
      display: (equip) => `${equip.equipmentName} (${equip.equipmentType})`,
      optional: 'Done collecting',
      elementClass: Equipment,
      filter: (element, ctx) => {
        const sector = getSector(ctx);
        if (!sector) return false;
        // Check if this equipment is in the sector's stash
        const inStash = sector.stash.some(e => e.id === element.id);
        if (!inStash) return false;

        // Prevent infinite loop: don't offer the item that was just returned to stash
        // This stops the auto-fill from immediately picking up what we just put down
        const lastReturnedId = ctx.args?.lastReturnedEquipmentId;
        if (lastReturnedId && element.id === lastReturnedId) {
          return false;
        }

        // MERC-70a: Filter out grenades/mortars if Apeiron
        const merc = getMerc(ctx);
        if (merc?.mercId === 'apeiron' && isGrenadeOrMortar(element)) {
          return false;
        }
        return true;
      },
    })
    .execute((args, ctx) => {
      const merc = getMerc(ctx);
      const sector = getSector(ctx);
      const equipment = args.equipment as Equipment | null;

      if (!merc || !sector) {
        return { success: false, message: 'Invalid merc or sector' };
      }

      // User chose "Done collecting"
      if (!equipment) {
        if (sector.stashCount > 0) {
          const remaining = sector.stash.map(e => e.equipmentName).join(', ');
          game.message(`Left in stash: ${remaining}`);
        }
        return { success: true, message: 'Done collecting equipment' };
      }

      // Equip the item
      const replaced = merc.equip(equipment);

      if (replaced) {
        sector.addToStash(replaced);
        game.message(`${capitalize(merc.mercName)} equipped ${equipment.equipmentName}, returned ${replaced.equipmentName}`);
      } else {
        game.message(`${capitalize(merc.mercName)} equipped ${equipment.equipmentName}`);
      }

      // If there are more items in stash, chain another collectEquipment
      if (sector.stashCount > 0) {
        // Preserve display names if passed as objects, otherwise create new objects
        const mercArg = ctx.args?.mercId;
        const sectorArg = ctx.args?.sectorId;
        const mercIdArg = (mercArg && typeof mercArg === 'object' && 'name' in mercArg)
          ? mercArg
          : { id: merc.id, name: capitalize(merc.mercName) };
        const sectorIdArg = (sectorArg && typeof sectorArg === 'object' && 'name' in sectorArg)
          ? sectorArg
          : { id: sector.id, name: sector.sectorName };

        return {
          success: true,
          message: `Equipped ${equipment.equipmentName}`,
          followUp: {
            action: 'collectEquipment',
            args: {
              mercId: mercIdArg,
              sectorId: sectorIdArg,
              // Track the just-returned equipment to prevent infinite swap loops
              // This prevents auto-fill from immediately picking up what we just put down
              lastReturnedEquipmentId: replaced ? replaced.id : undefined,
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
 * Only available to the MERC who just explored the sector.
 */
export function createTakeFromStashAction(game: MERCGame): ActionDefinition {
  return Action.create('takeFromStash')
    .prompt('Take equipment from stash')
    .condition((ctx, tracer) => {
      // Only available when a MERC just explored
      const hasExplorer = !!game.lastExplorer;
      if (tracer) tracer.check('hasLastExplorer', hasExplorer);
      if (!hasExplorer) return false;

      const isRebel = game.isRebelPlayer(ctx.player as any);
      if (tracer) tracer.check('isRebelPlayer', isRebel);
      if (!isRebel) return false;

      // Check stash still has items
      const sector = game.getSector(game.lastExplorer!.sectorId);
      const hasStash = !!(sector && sector.stash.length > 0);
      if (tracer) tracer.check('sectorHasStash', hasStash, `${sector?.stash?.length ?? 0} items`);
      return hasStash;
    })
    .chooseFrom<string>('equipment', {
      prompt: (ctx) => {
        // Find the explorer's name
        if (!game.lastExplorer) return 'Select equipment to take';
        const player = ctx.player as RebelPlayer;
        const merc = player.team.find(m => String(m.id) === game.lastExplorer!.mercId);
        return merc ? `What should ${capitalize(merc.mercName)} take?` : 'Select equipment to take';
      },
      choices: () => {
        if (!game.lastExplorer) return ['Done'];
        const sector = game.getSector(game.lastExplorer.sectorId);
        if (!sector || sector.stash.length === 0) return ['Done'];
        const equipmentChoices = sector.stash.map(e => `${e.equipmentName} (${e.equipmentType})`);
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

      const player = ctx.player as RebelPlayer;
      const targetMerc = player.team.find(m => String(m.id) === explorer.mercId);
      if (!targetMerc) {
        return { success: false, message: 'Explorer MERC not found' };
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

      // Equip to merc - equip() uses putInto() which moves equipment from stash
      const replaced = targetMerc.equip(equipment);
      if (replaced) {
        sector.addToStash(replaced);
        game.message(`${targetMerc.mercName} equipped ${equipment.equipmentName}, returned ${replaced.equipmentName} to stash`);
        // Allow taking more since there's still stash (reset explorer)
        game.lastExplorer = { mercId: String(targetMerc.id), sectorId: sector.sectorId };
      } else {
        game.message(`${targetMerc.mercName} equipped ${equipment.equipmentName}`);
        // Allow taking more if stash still has items
        if (sector.stash.length > 0) {
          game.lastExplorer = { mercId: String(targetMerc.id), sectorId: sector.sectorId };
        }
      }

      return {
        success: true,
        message: `${targetMerc.mercName} took ${equipment.equipmentName}`,
      };
    });
}

// =============================================================================
// Train Action
// Works for both rebel and dictator players.
// =============================================================================

// Type for units that can train (MERCs or DictatorCard)
type TrainableUnit = MercCard | DictatorCard;

// Helper to check if unit is a DictatorCard (for train)
function isDictatorCardForTrain(unit: TrainableUnit): unit is DictatorCard {
  return unit instanceof DictatorCard;
}

// Helper to get unit name for train display
function getUnitNameForTrain(unit: TrainableUnit): string {
  if (isDictatorCardForTrain(unit)) {
    return unit.dictatorName;
  }
  return unit.mercName;
}

// Helper to find unit's sector for training (works for any player type)
function findUnitSectorForTrain(unit: TrainableUnit, player: any, game: MERCGame): Sector | null {
  if (game.isRebelPlayer(player)) {
    const rebelPlayer = player as RebelPlayer;
    const merc = unit as MercCard;
    for (const squad of [rebelPlayer.primarySquad, rebelPlayer.secondarySquad]) {
      if (!squad?.sectorId) continue;
      const mercs = squad.getMercs();
      if (mercs.some(m => m.id === merc.id)) {
        return game.getSector(squad.sectorId) || null;
      }
    }
  }
  if (game.isDictatorPlayer(player) && game.dictatorPlayer) {
    // DictatorCard uses its own sectorId directly
    if (isDictatorCardForTrain(unit)) {
      if (unit.sectorId) {
        return game.getSector(unit.sectorId) || null;
      }
      return null;
    }
    // MercCard - check squad first
    const merc = unit as MercCard;
    const squad = game.dictatorPlayer.getSquadContaining(merc);
    if (squad?.sectorId) {
      return game.getSector(squad.sectorId) || null;
    }
    // Fallback to merc's sectorId
    if (merc.sectorId) {
      return game.getSector(merc.sectorId) || null;
    }
  }
  return null;
}

// Helper to check if unit can train (training > 0, has actions, sector not at max militia)
function canUnitTrain(unit: TrainableUnit, player: any, game: MERCGame): boolean {
  if (unit.training <= 0) return false;
  if (unit.actionsRemaining < ACTION_COSTS.TRAIN) return false;
  if (isDictatorCardForTrain(unit) && (!unit.inPlay || unit.isDead)) return false;

  const sector = findUnitSectorForTrain(unit, player, game);
  if (!sector) return false;

  // Check max militia for this side
  if (game.isRebelPlayer(player)) {
    return sector.getTotalRebelMilitia() < SectorConstants.MAX_MILITIA_PER_SIDE;
  }
  if (game.isDictatorPlayer(player)) {
    return sector.dictatorMilitia < SectorConstants.MAX_MILITIA_PER_SIDE;
  }
  return false;
}

// Helper to get living units for any player type (for train action)
// Returns MERCs + DictatorCard if applicable
function getPlayerUnitsForTrain(player: any, game: MERCGame): TrainableUnit[] {
  if (game.isRebelPlayer(player)) {
    return (player as RebelPlayer).team.filter(m => !m.isDead);
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
function findMercSectorForTrain(merc: MercCard, player: any, game: MERCGame): Sector | null {
  return findUnitSectorForTrain(merc, player, game);
}

function canMercTrain(merc: MercCard, player: any, game: MERCGame): boolean {
  return canUnitTrain(merc, player, game);
}

function isMercOwnedForTrain(merc: MercCard, player: any, game: MERCGame): boolean {
  if (game.isRebelPlayer(player)) {
    return isInPlayerTeam(merc, player as RebelPlayer);
  }
  if (game.isDictatorPlayer(player)) {
    const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
    return dictatorMercs.some(m => m.id === merc.id);
  }
  return false;
}

function getPlayerMercsForTrain(player: any, game: MERCGame): MercCard[] {
  if (game.isRebelPlayer(player)) {
    return (player as RebelPlayer).team.filter(m => !m.isDead);
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
    .condition((ctx) => {
      // Cannot train during combat
      if (game.activeCombat) return false;

      // Must be rebel or dictator player
      const isRebel = game.isRebelPlayer(ctx.player as any);
      const isDictator = game.isDictatorPlayer(ctx.player as any);
      if (!isRebel && !isDictator) return false;

      // Get living units for this player (MERCs + DictatorCard)
      const livingUnits = getPlayerUnitsForTrain(ctx.player, game);

      // Must have a unit with training > 0 and actions remaining
      return livingUnits.some(u => canUnitTrain(u, ctx.player, game));
    })
    .chooseFrom<{ id: number; name: string; isDictatorCard: boolean }>('unit', {
      prompt: 'Select unit to train militia',
      choices: (ctx) => {
        const units = getPlayerUnitsForTrain(ctx.player, game);
        return units
          .filter(u => canUnitTrain(u, ctx.player, game))
          .map(u => ({
            value: {
              id: u.id,
              name: getUnitNameForTrain(u),
              isDictatorCard: isDictatorCardForTrain(u),
            },
            label: capitalize(getUnitNameForTrain(u)),
          }));
      },
    })
    .execute((args, ctx) => {
      const unitChoice = args.unit as { id: number; name: string; isDictatorCard: boolean };

      // Find the actual unit
      let actingUnit: TrainableUnit | null = null;
      if (unitChoice.isDictatorCard) {
        actingUnit = game.dictatorPlayer?.dictator || null;
      } else {
        actingUnit = game.all(MercCard).find(m => m.id === unitChoice.id) || null;
      }

      if (!actingUnit) {
        return { success: false, message: 'Unit not found' };
      }

      const sector = findUnitSectorForTrain(actingUnit, ctx.player, game);
      if (!sector) {
        return { success: false, message: 'No sector found' };
      }

      // Spend action - MERC-bd4: Faustina uses training action first (only for MercCard)
      if (isDictatorCardForTrain(actingUnit)) {
        actingUnit.actionsRemaining -= ACTION_COSTS.TRAIN;
      } else {
        useTrainingAction(actingUnit as MercCard, ACTION_COSTS.TRAIN);
      }

      // Get unit name for messages
      const unitName = getUnitNameForTrain(actingUnit);

      // Train militia - amount depends on player type
      let trained: number;
      if (game.isRebelPlayer(ctx.player)) {
        const player = ctx.player as RebelPlayer;
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
        trained = sector.addDictatorMilitia(actingUnit.training);
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

// Helper to get living MERCs for any player type (for hospital/armsDealer)
function getPlayerMercsForCity(player: any, game: MERCGame): MercCard[] {
  if (game.isRebelPlayer(player)) {
    return (player as RebelPlayer).team.filter(m => !m.isDead);
  }
  if (game.isDictatorPlayer(player)) {
    return game.dictatorPlayer?.hiredMercs.filter(m => !m.isDead) || [];
  }
  return [];
}

// Helper to check if merc belongs to player (for hospital/armsDealer)
function isMercOwnedForCity(merc: MercCard, player: any, game: MERCGame): boolean {
  if (game.isRebelPlayer(player)) {
    return isInPlayerTeam(merc, player as RebelPlayer);
  }
  if (game.isDictatorPlayer(player)) {
    const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
    return dictatorMercs.some(m => m.id === merc.id);
  }
  return false;
}

// Helper to find sector where player's MERC is located (for hospital/armsDealer)
function findMercSectorForCity(player: any, game: MERCGame): Sector | null {
  if (game.isRebelPlayer(player)) {
    const rebelPlayer = player as RebelPlayer;
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
 * Cost: 1 action, fully heals MERC
 */
export function createHospitalAction(game: MERCGame): ActionDefinition {
  return Action.create('hospital')
    .prompt('Visit hospital')
    .condition((ctx) => {
      // Cannot visit hospital during combat
      if (game.activeCombat) return false;
      // Must be rebel or dictator
      const isRebel = game.isRebelPlayer(ctx.player as any);
      const isDictator = game.isDictatorPlayer(ctx.player as any);
      if (!isRebel && !isDictator) return false;

      const sector = findMercSectorForCity(ctx.player, game);
      if (!sector?.hasHospital) return false;

      // Must have a damaged MERC with actions
      const mercs = getPlayerMercsForCity(ctx.player, game);
      return mercs.some(m => m.damage > 0 && m.actionsRemaining >= ACTION_COSTS.HOSPITAL);
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to heal',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        const merc = element as unknown as MercCard;
        return isMercOwnedForCity(merc, ctx.player, game) &&
          merc.damage > 0 &&
          merc.actionsRemaining >= ACTION_COSTS.HOSPITAL;
      },
    })
    .execute((args, ctx) => {
      const merc = args.merc as MercCard;

      // Spend action
      useAction(merc, ACTION_COSTS.HOSPITAL);

      const healedAmount = merc.damage;
      merc.fullHeal();
      game.message(`${merc.mercName} was fully healed at the hospital (restored ${healedAmount} health)`);

      return { success: true, message: `Healed ${merc.mercName}` };
    });
}

// =============================================================================
// Arms Dealer Action
// Works for both rebel and dictator players.
// =============================================================================

/**
 * Use arms dealer in a city sector
 * Cost: 1 action, draw equipment
 * MERC-dh5: Includes free re-equip option per rules
 */
export function createArmsDealerAction(game: MERCGame): ActionDefinition {
  // Helper to get/set drawn equipment in game.settings (persists across choices/execute)
  const getSettingsKey = (player: any) => {
    if (game.isRebelPlayer(player)) {
      return `_armsDealer_drawn_${(player as RebelPlayer).position}`;
    }
    return '_armsDealer_drawn_dictator';
  };

  return Action.create('armsDealer')
    .prompt('Visit arms dealer')
    .condition((ctx) => {
      // Cannot visit arms dealer during combat
      if (game.activeCombat) return false;
      // Must be rebel or dictator
      const isRebel = game.isRebelPlayer(ctx.player as any);
      const isDictator = game.isDictatorPlayer(ctx.player as any);
      if (!isRebel && !isDictator) return false;

      const sector = findMercSectorForCity(ctx.player, game);
      if (!sector?.hasArmsDealer) return false;

      // Must have a MERC with actions remaining
      const mercs = getPlayerMercsForCity(ctx.player, game);
      return mercs.some(m => m.actionsRemaining >= ACTION_COSTS.ARMS_DEALER);
    })
    .chooseElement<MercCard>('actingMerc', {
      prompt: 'Which MERC visits the dealer?',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        const merc = element as unknown as MercCard;
        return isMercOwnedForCity(merc, ctx.player, game) &&
          merc.actionsRemaining >= ACTION_COSTS.ARMS_DEALER;
      },
    })
    .chooseFrom<string>('equipmentType', {
      prompt: 'What type of equipment?',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
    })
    // MERC-dh5: Free re-equip - choose MERC to equip the purchased item
    .chooseFrom<string>('equipMerc', {
      prompt: 'Free Re-Equip: Which MERC should equip this item? (or skip)',
      choices: (ctx) => {
        const equipmentType = ctx.args?.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
        const settingsKey = getSettingsKey(ctx.player);

        // Draw equipment now so we can show what was bought
        // Store in game.settings to persist across choices/execute contexts
        if (!game.settings[settingsKey]) {
          const equipment = game.drawEquipment(equipmentType);
          if (equipment) {
            game.settings[settingsKey] = equipment.id;
            game.message(`Drew ${equipment.equipmentName} from ${equipmentType} deck`);
          }
        }

        const equipmentId = game.settings[settingsKey] as number | undefined;
        const drawnEquip = equipmentId ? game.getElementById(equipmentId) as Equipment | undefined : undefined;

        // Get mercs for this player type
        const playerMercs = getPlayerMercsForCity(ctx.player, game);

        // MERC-70a: Filter out Apeiron if equipment is a grenade/mortar
        const eligibleMercs = playerMercs.filter(m => {
          if (m.mercId === 'apeiron' && drawnEquip && isGrenadeOrMortar(drawnEquip)) {
            return false;
          }
          return true;
        });

        const choices = eligibleMercs.map(m => ({
          label: `${m.mercName}`,
          value: m.mercName,
        }));
        choices.push({ label: 'Skip (add to stash)', value: 'skip' });
        return choices;
      },
    })
    .execute((args, ctx) => {
      const actingMerc = args.actingMerc as MercCard;
      const settingsKey = getSettingsKey(ctx.player);
      const sector = findMercSectorForCity(ctx.player, game);

      // Spend action
      useAction(actingMerc, ACTION_COSTS.ARMS_DEALER);

      // Get equipment from game.settings (stored by choices function)
      const equipmentId = game.settings[settingsKey] as number | undefined;
      const equipment = equipmentId ? game.getElementById(equipmentId) as Equipment | undefined : undefined;
      delete game.settings[settingsKey]; // Clean up

      if (equipment && sector) {
        const equipMercName = args.equipMerc as string;

        if (equipMercName && equipMercName !== 'skip') {
          // Free re-equip: equip the purchased item directly
          const playerMercs = getPlayerMercsForCity(ctx.player, game);
          const targetMerc = playerMercs.find(m => m.mercName === equipMercName);
          if (targetMerc) {
            const replaced = targetMerc.equip(equipment);
            if (replaced) {
              sector.addToStash(replaced);
              game.message(`${targetMerc.mercName} equipped ${equipment.equipmentName}, ${replaced.equipmentName} added to stash`);
            } else {
              game.message(`${targetMerc.mercName} equipped ${equipment.equipmentName}`);
            }
            return { success: true, message: `Bought and equipped ${equipment.equipmentName}` };
          }
        }

        // Add to sector stash if not equipped
        const added = sector.addToStash(equipment);
        if (added) {
          game.message(`${actingMerc.mercName} bought ${equipment.equipmentName} (added to ${sector.sectorName} stash)`);
        } else {
          game.message(`${actingMerc.mercName} bought ${equipment.equipmentName} but couldn't stash it (damaged?)`);
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
    .condition((ctx) => {
      // Cannot end turn during combat - must retreat or continue
      if (game.activeCombat) return false;
      // Only available during main game (Day 2+)
      if (game.currentDay < 2) return false;
      // Must be rebel or dictator player
      return game.isRebelPlayer(ctx.player as any) || game.isDictatorPlayer(ctx.player as any);
    })
    .chooseFrom<string>('confirm', {
      prompt: 'End your turn?',
      choices: ['Yes, end turn'],
    })
    .execute((args, ctx) => {
      if (game.isRebelPlayer(ctx.player)) {
        const player = ctx.player as RebelPlayer;
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
 * Available when player has a squad in an explored sector with stash contents.
 */
export function createViewStashAction(game: MERCGame): ActionDefinition {
  return Action.create('viewStash')
    .prompt('View sector stash')
    .condition((ctx, tracer) => {
      // Only rebels can view stash
      const isRebel = game.isRebelPlayer(ctx.player as any);
      if (tracer) tracer.check('isRebelPlayer', isRebel);
      if (!isRebel) return false;

      const player = ctx.player as RebelPlayer;

      // Check if any squad is in an explored sector with stash
      const canViewFrom = (squad: Squad | null | undefined): boolean => {
        if (!squad?.sectorId) return false;
        const sector = game.getSector(squad.sectorId);
        return !!(sector && sector.explored && sector.stash.length > 0);
      };

      const hasStash = canViewFrom(player.primarySquad) || canViewFrom(player.secondarySquad);
      if (tracer) tracer.check('hasAccessibleStash', hasStash);
      return hasStash;
    })
    .chooseFrom<string>('sector', {
      prompt: 'Which sector stash to view?',
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const choices: string[] = [];

        const addIfHasStash = (squad: Squad | null | undefined) => {
          if (!squad?.sectorId) return;
          const sector = game.getSector(squad.sectorId);
          if (sector && sector.explored && sector.stash.length > 0) {
            choices.push(sector.sectorId);
          }
        };

        addIfHasStash(player.primarySquad);
        addIfHasStash(player.secondarySquad);
        return choices;
      },
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
