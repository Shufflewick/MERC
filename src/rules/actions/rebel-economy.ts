/**
 * Rebel Economy Actions
 *
 * MERC economy-related actions: hiring, exploring, training, trading, and facilities.
 */

import { Action, type ActionDefinition } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer } from '../game.js';
import { MercCard, Sector, Equipment, Squad, isGrenadeOrMortar } from '../elements.js';
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

/**
 * Hire MERCs from the deck
 * Cost: 2 actions
 * Per rules (06-merc-actions.md): Draw 3, choose 0-3 to hire (within team limit)
 * MERC-yi7: Can also fire a MERC during this action
 * MERC-l1q: New MERCs join existing squad
 */
export function createHireMercAction(game: MERCGame): ActionDefinition {
  // Cache drawn mercs per player during action
  const drawnMercsCache = new Map<string, MercCard[]>();

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
        const cacheKey = `${player.position}`;

        // Draw 3 MERCs if not already cached
        if (!drawnMercsCache.has(cacheKey)) {
          const drawn = drawMercsForHiring(game, 3);
          drawnMercsCache.set(cacheKey, drawn);
        }

        const drawnMercs = drawnMercsCache.get(cacheKey) || [];

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
      const cacheKey = `${player.position}`;
      const drawnMercs = drawnMercsCache.get(cacheKey) || [];
      const selectedNames = (args.selectedMercs as string[]) || [];
      const fireChoice = args.fireFirst as string;

      // Spend action
      if (!useAction(actingMerc, ACTION_COSTS.HIRE_MERC)) {
        // Discard mercs if action failed
        for (const merc of drawnMercs) {
          merc.putInto(game.mercDiscard);
        }
        drawnMercsCache.delete(cacheKey);
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

      drawnMercsCache.delete(cacheKey);

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
// =============================================================================

// Helper to find the sector a MERC is in
function findMercSector(merc: MercCard, player: RebelPlayer, game: MERCGame): Sector | null {
  for (const squad of [player.primarySquad, player.secondarySquad]) {
    if (!squad?.sectorId) continue;
    const mercs = squad.getMercs();
    if (mercs.some(m => m.id === merc.id)) {
      return game.getSector(squad.sectorId) || null;
    }
  }
  return null;
}

/**
 * Explore the current sector to discover loot.
 * Cost: 1 action
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
      // Only rebels can explore
      const isRebel = game.isRebelPlayer(ctx.player as any);
      if (tracer) tracer.check('isRebelPlayer', isRebel);
      if (!isRebel) return false;

      const player = ctx.player as RebelPlayer;

      // Check if any squad is in an unexplored sector
      const canExploreFrom = (squad: Squad | null | undefined, name: string): boolean => {
        if (!squad?.sectorId) {
          if (tracer) tracer.check(`${name}.sectorId`, false, 'no sector');
          return false;
        }
        const sector = game.getSector(squad.sectorId);
        const unexplored = !!(sector && !sector.explored);
        if (tracer) tracer.check(`${name}.sector.explored`, !unexplored, sector?.sectorName);
        return unexplored;
      };

      const primaryCanExplore = canExploreFrom(player.primarySquad, 'primarySquad');
      const secondaryCanExplore = canExploreFrom(player.secondarySquad, 'secondarySquad');
      const hasUnexploredSector = primaryCanExplore || secondaryCanExplore;
      if (tracer) tracer.check('hasUnexploredSector', hasUnexploredSector);
      if (!hasUnexploredSector) return false;

      const hasActions = hasActionsRemaining(player, ACTION_COSTS.EXPLORE);
      if (tracer) tracer.check('hasActionsRemaining', hasActions);
      return hasActions;
    })
    .chooseElement<MercCard>('actingMerc', {
      prompt: 'Which MERC explores?',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        // MERC must be in an unexplored sector
        const inUnexploredSector = (squad: Squad | null | undefined): boolean => {
          if (!squad?.sectorId) return false;
          const mercs = squad.getMercs();
          if (!mercs.some(m => m.id === merc.id)) return false;
          const sector = game.getSector(squad.sectorId);
          return !!(sector && !sector.explored);
        };
        return isInPlayerTeam(merc, player) &&
               merc.actionsRemaining >= ACTION_COSTS.EXPLORE &&
               (inUnexploredSector(player.primarySquad) || inUnexploredSector(player.secondarySquad));
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const actingMerc = args.actingMerc as MercCard;

      if (!actingMerc) {
        return { success: false, message: 'MERC not found' };
      }

      // Find the sector
      const sector = findMercSector(actingMerc, player, game);
      if (!sector) {
        return { success: false, message: 'No sector found' };
      }

      // Spend action
      useAction(actingMerc, ACTION_COSTS.EXPLORE);

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

      // Report what was found
      if (sector.stashCount > 0) {
        const equipmentList = sector.stash.map(e => e.equipmentName).join(', ');
        game.message(`${capitalize(actingMerc.mercName)} explored ${sector.sectorName} and found: ${equipmentList}`);

        // Chain to collectEquipment action with pre-filled args
        return {
          success: true,
          message: `Explored ${sector.sectorName}`,
          followUp: {
            action: 'collectEquipment',
            args: {
              mercId: actingMerc.id,
              sectorId: sector.id,
            },
          },
        };
      } else {
        game.message(`${capitalize(actingMerc.mercName)} explored ${sector.sectorName} and found nothing`);
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
  // Helper to resolve sector from ctx.args (handles both numeric ID and resolved element)
  function getSector(ctx: any): Sector | undefined {
    const sectorArg = ctx.args?.sectorId;
    if (typeof sectorArg === 'number') {
      return game.getElementById(sectorArg) as Sector | undefined;
    } else if (sectorArg && typeof sectorArg === 'object' && 'id' in sectorArg) {
      return sectorArg as Sector;
    }
    return undefined;
  }

  // Helper to resolve merc from ctx.args
  function getMerc(ctx: any): MercCard | undefined {
    const mercArg = ctx.args?.mercId;
    if (typeof mercArg === 'number') {
      return game.getElementById(mercArg) as MercCard | undefined;
    } else if (mercArg && typeof mercArg === 'object' && 'id' in mercArg) {
      return mercArg as MercCard;
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
        return {
          success: true,
          message: `Equipped ${equipment.equipmentName}`,
          followUp: {
            action: 'collectEquipment',
            args: {
              mercId: typeof ctx.args?.mercId === 'number' ? ctx.args.mercId : merc.id,
              sectorId: typeof ctx.args?.sectorId === 'number' ? ctx.args.sectorId : sector.id,
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
// =============================================================================

/**
 * Train militia in the current sector
 * Cost: 1 action, trains militia equal to MERC's training stat
 */
export function createTrainAction(game: MERCGame): ActionDefinition {
  return Action.create('train')
    .prompt('Train')
    .condition((ctx) => {
      // Cannot train during combat
      if (game.activeCombat) return false;
      // Only rebels can train militia
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      const squad = player.primarySquad;
      if (!squad?.sectorId) return false;
      const sector = game.getSector(squad.sectorId);
      if (!sector) return false;
      // Check max militia not reached
      if (sector.getTotalRebelMilitia() >= SectorConstants.MAX_MILITIA_PER_SIDE) return false;
      // Must have a MERC with training > 0 and actions remaining
      // MERC-bd4: Faustina can use her training-only action for this
      return player.team.some(m => m.training > 0 && canTrainWith(m, ACTION_COSTS.TRAIN));
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to train militia',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        // Safety check - only rebels can train militia
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        // MERC-bd4: Faustina can use her training-only action
        return isInPlayerTeam(merc, player) &&
          merc.training > 0 &&
          canTrainWith(merc, ACTION_COSTS.TRAIN);
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const merc = args.merc as MercCard;
      const squad = player.primarySquad;
      const sector = game.getSector(squad.sectorId!);

      if (!sector) {
        return { success: false, message: 'No sector found' };
      }

      // Spend action - MERC-bd4: Faustina uses training action first
      useTrainingAction(merc, ACTION_COSTS.TRAIN);

      // Train militia equal to training stat
      const trained = sector.addRebelMilitia(`${player.position}`, merc.training);
      game.message(`${merc.mercName} trained ${trained} militia at ${sector.sectorName}`);

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

      return { success: true, message: `Trained ${trained} militia` };
    });
}

// =============================================================================
// Hospital Action
// =============================================================================

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
      // Only rebels can visit hospital
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      const squad = player.primarySquad;
      if (!squad?.sectorId) return false;
      const sector = game.getSector(squad.sectorId);
      if (!sector?.hasHospital) return false;
      // Must have a damaged MERC with actions
      return player.team.some(m => m.damage > 0 && m.actionsRemaining >= ACTION_COSTS.HOSPITAL);
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to heal',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        // Safety check - only rebels can visit hospital
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return isInPlayerTeam(merc, player) &&
          merc.damage > 0 &&
          merc.actionsRemaining >= ACTION_COSTS.HOSPITAL;
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
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
// =============================================================================

/**
 * Use arms dealer in a city sector
 * Cost: 1 action, draw equipment
 * MERC-dh5: Includes free re-equip option per rules
 */
export function createArmsDealerAction(game: MERCGame): ActionDefinition {
  // Helper to get/set drawn equipment in game.settings (persists across choices/execute)
  const getSettingsKey = (playerPos: number) => `_armsDealer_drawn_${playerPos}`;

  return Action.create('armsDealer')
    .prompt('Visit arms dealer')
    .condition((ctx) => {
      // Cannot visit arms dealer during combat
      if (game.activeCombat) return false;
      // Only rebels can visit arms dealer
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      const squad = player.primarySquad;
      if (!squad?.sectorId) return false;
      const sector = game.getSector(squad.sectorId);
      if (!sector?.hasArmsDealer) return false;
      return hasActionsRemaining(player, ACTION_COSTS.ARMS_DEALER);
    })
    .chooseElement<MercCard>('actingMerc', {
      prompt: 'Which MERC visits the dealer?',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        // Safety check - only rebels can visit arms dealer
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return isInPlayerTeam(merc, player) && merc.actionsRemaining >= ACTION_COSTS.ARMS_DEALER;
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
        const player = ctx.player as RebelPlayer;
        const equipmentType = ctx.args?.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
        const settingsKey = getSettingsKey(player.position);

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

        // MERC-70a: Filter out Apeiron if equipment is a grenade/mortar
        const eligibleMercs = player.team.filter(m => {
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
      const player = ctx.player as RebelPlayer;
      const actingMerc = args.actingMerc as MercCard;
      const settingsKey = getSettingsKey(player.position);
      const squad = player.primarySquad;
      const sector = game.getSector(squad.sectorId!);

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
          const targetMerc = player.team.find(m => m.mercName === equipMercName);
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
 */
export function createEndTurnAction(game: MERCGame): ActionDefinition {
  return Action.create('endTurn')
    .prompt('End turn')
    .condition((ctx) => {
      // Cannot end turn during combat - must retreat or continue
      if (game.activeCombat) return false;
      // Only available during main game (Day 2+)
      if (game.currentDay < 2) return false;
      // Only rebels can end turn (dictator uses dictatorEndMercActions)
      return game.isRebelPlayer(ctx.player as any);
    })
    .chooseFrom<string>('confirm', {
      prompt: 'End your turn?',
      choices: ['Yes, end turn'],
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;

      // Clear all remaining actions from player's MERCs
      for (const merc of player.team) {
        merc.actionsRemaining = 0;
      }

      game.message(`${player.name} ends their turn`);
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
