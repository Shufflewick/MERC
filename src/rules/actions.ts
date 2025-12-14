import { Action, type ActionDefinition } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer } from './game.js';
import { MercCard, Sector, Equipment, TacticsCard, Squad } from './elements.js';
import { TeamConstants, SectorConstants } from './constants.js';
import {
  drawMercsForHiring,
  hireSelectedMercs,
  isValidLandingSector,
  equipStartingEquipment,
} from './day-one.js';
import { executeCombat, hasEnemies } from './combat.js';
import { executeTacticsEffect } from './tactics-effects.js';

// =============================================================================
// Action Cost Constants
// =============================================================================

// Helper to capitalize first letter
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const ACTION_COSTS = {
  MOVE: 1,
  EXPLORE: 1,
  TRAIN: 1,
  // ATTACK removed - combat triggers via movement only
  HOSPITAL: 1,
  ARMS_DEALER: 1,
  HIRE_MERC: 2, // Per rules: "Hire MERCs (2 actions)"
  RE_EQUIP: 1, // Per rules: "Re-Equip (1 action)"
  SPLIT_SQUAD: 0, // Free action
  MERGE_SQUADS: 0, // Free action
} as const;

// =============================================================================
// Action Point Helpers
// =============================================================================

/**
 * Check if player has a MERC with enough actions remaining
 */
function hasActionsRemaining(player: RebelPlayer, cost: number): boolean {
  return player.team.some(merc => merc.actionsRemaining >= cost);
}

/**
 * Get MERCs that have enough actions remaining
 */
function getMercsWithActions(player: RebelPlayer, cost: number): MercCard[] {
  return player.team.filter(merc => merc.actionsRemaining >= cost);
}

/**
 * Use an action from a MERC
 */
function useAction(merc: MercCard, cost: number): boolean {
  return merc.useAction(cost);
}

// =============================================================================
// Rebel Actions
// =============================================================================

/**
 * Hire MERCs from the deck
 * Cost: 2 actions
 * Per rules (06-merc-actions.md): Draw 3, choose 0-3 to hire (within team limit)
 */
export function createHireMercAction(game: MERCGame): ActionDefinition {
  // Cache drawn mercs per player during action
  const drawnMercsCache = new Map<string, MercCard[]>();

  return Action.create('hireMerc')
    .prompt('Hire mercenaries')
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      if (!player.canHireMerc(game)) return false;
      if (!hasActionsRemaining(player, ACTION_COSTS.HIRE_MERC)) return false;
      return game.mercDeck.count(MercCard) > 0;
    })
    .chooseElement<MercCard>('actingMerc', {
      prompt: 'Which MERC spends the actions?',
      elementClass: MercCard,
      filter: (element, ctx) => {
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return player.team.includes(merc) && merc.actionsRemaining >= ACTION_COSTS.HIRE_MERC;
      },
    })
    // Draw 3 MERCs and let player select which to hire
    .chooseFrom<string>('selectedMercs', {
      prompt: 'Select MERCs to hire (multi-select)',
      multiSelect: true,
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const cacheKey = `${player.position}`;

        // Draw 3 MERCs if not already cached
        if (!drawnMercsCache.has(cacheKey)) {
          const drawn = drawMercsForHiring(game, 3);
          drawnMercsCache.set(cacheKey, drawn);
        }

        const drawnMercs = drawnMercsCache.get(cacheKey) || [];
        const teamLimit = player.getTeamLimit(game);
        const currentSize = player.teamSize;
        const canHire = teamLimit - currentSize;

        const choices = drawnMercs.map(m => ({
          label: capitalize(m.mercName),
          value: m.mercName,
        }));

        // Add note about team limit
        if (canHire < drawnMercs.length) {
          game.message(`Team limit: can hire up to ${canHire} MERC(s)`);
        }

        return choices;
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const actingMerc = args.actingMerc as MercCard;
      const cacheKey = `${player.position}`;
      const drawnMercs = drawnMercsCache.get(cacheKey) || [];
      const selectedNames = (args.selectedMercs as string[]) || [];

      // Spend action
      if (!useAction(actingMerc, ACTION_COSTS.HIRE_MERC)) {
        // Return mercs to deck/discard if failed
        for (const merc of drawnMercs) {
          merc.putInto(game.mercDiscard);
        }
        drawnMercsCache.delete(cacheKey);
        return { success: false, message: 'Not enough actions' };
      }

      // Calculate how many can be hired (team limit)
      const teamLimit = player.getTeamLimit(game);
      let currentSize = player.teamSize;
      const hired: string[] = [];

      for (const merc of drawnMercs) {
        if (selectedNames.includes(merc.mercName) && currentSize < teamLimit) {
          merc.putInto(player.primarySquad);
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

          const freeEquipment = game.drawEquipment(equipType);
          if (freeEquipment) {
            const replaced = merc.equip(freeEquipment);
            if (replaced) {
              // Put replaced equipment in sector stash
              const squad = player.primarySquad;
              const sector = squad?.sectorId ? game.getSector(squad.sectorId) : null;
              if (sector) {
                sector.addToStash(replaced);
              } else {
                const discard = game.getEquipmentDiscard(replaced.equipmentType);
                if (discard) replaced.putInto(discard);
              }
            }
            game.message(`${merc.mercName} equipped free ${freeEquipment.equipmentName}`);
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

/**
 * Move a squad to an adjacent sector
 * Cost: 1 action per MERC in squad
 */
export function createMoveAction(game: MERCGame): ActionDefinition {
  return Action.create('move')
    .prompt('Move your squad')
    .chooseElement<Squad>('squad', {
      prompt: 'Select squad to move',
      elementClass: Squad,
      filter: (element, ctx) => {
        const squad = element as unknown as Squad;
        const player = ctx.player as RebelPlayer;
        if (squad !== player.primarySquad && squad !== player.secondarySquad) return false;
        if (!squad.sectorId) return false;
        // All MERCs in squad must have actions
        const mercs = squad.getMercs();
        return mercs.length > 0 && mercs.every(m => m.actionsRemaining >= ACTION_COSTS.MOVE);
      },
    })
    .chooseElement<Sector>('destination', {
      prompt: 'Select destination sector',
      elementClass: Sector,
      filter: (element, ctx) => {
        const sector = element as unknown as Sector;
        const squad = ctx.args.squad as Squad;
        if (!squad?.sectorId) return false;
        const currentSector = game.getSector(squad.sectorId);
        if (!currentSector) return false;
        const adjacent = game.getAdjacentSectors(currentSector);
        return adjacent.some(s => s.sectorId === sector.sectorId);
      },
      boardRef: (element) => ({ id: (element as unknown as Sector).id }),
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const squad = args.squad as Squad;
      const destination = args.destination as Sector;

      // Spend action from each MERC in squad
      const mercs = squad.getMercs();
      for (const merc of mercs) {
        useAction(merc, ACTION_COSTS.MOVE);
      }

      squad.sectorId = destination.sectorId;
      game.message(`${player.name} moved ${mercs.length} MERC(s) to ${destination.sectorName}`);

      // Per rules: "Combat triggers when: A squad moves into an enemy-occupied sector"
      // Check for enemies and auto-trigger combat
      if (hasEnemies(game, destination, player)) {
        game.message(`Enemies detected at ${destination.sectorName} - combat begins!`);
        const outcome = executeCombat(game, destination, player);
        return {
          success: true,
          message: `Moved to ${destination.sectorName} and engaged in combat`,
          data: {
            combatTriggered: true,
            rebelVictory: outcome.rebelVictory,
            dictatorVictory: outcome.dictatorVictory,
          },
        };
      }

      return { success: true, message: `Moved to ${destination.sectorName}` };
    });
}

/**
 * Explore an unexplored sector
 * Cost: 1 action
 * Per rules (06-merc-actions.md): After exploring, perform a free Re-Equip
 */
export function createExploreAction(game: MERCGame): ActionDefinition {
  // Cache drawn equipment for free re-equip selection
  const explorationCache = new Map<string, { sector: Sector; equipment: Equipment[] }>();

  return Action.create('explore')
    .prompt('Explore the current sector')
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      const squad = player.primarySquad;
      if (!squad?.sectorId) return false;
      const sector = game.getSector(squad.sectorId);
      if (!sector || sector.explored) return false;
      return hasActionsRemaining(player, ACTION_COSTS.EXPLORE);
    })
    .chooseElement<MercCard>('actingMerc', {
      prompt: 'Which MERC explores?',
      elementClass: MercCard,
      filter: (element, ctx) => {
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return player.team.includes(merc) && merc.actionsRemaining >= ACTION_COSTS.EXPLORE;
      },
    })
    // Free Re-Equip: Choose first equipment to equip (optional)
    .chooseFrom<string>('equipChoice1', {
      prompt: 'Free Re-Equip: Select equipment to equip (or skip)',
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const squad = player.primarySquad;
        const sector = game.getSector(squad.sectorId!);
        if (!sector) return [{ label: 'Skip', value: 'skip' }];

        // If not explored yet, draw the equipment now
        if (!sector.explored) {
          sector.explore();

          // Draw equipment based on loot icons
          const drawnEquipment: Equipment[] = [];

          for (let i = 0; i < sector.weaponLoot; i++) {
            const weapon = game.drawEquipment('Weapon');
            if (weapon) {
              sector.addToStash(weapon);
              drawnEquipment.push(weapon);
            }
          }

          for (let i = 0; i < sector.armorLoot; i++) {
            const armor = game.drawEquipment('Armor');
            if (armor) {
              sector.addToStash(armor);
              drawnEquipment.push(armor);
            }
          }

          for (let i = 0; i < sector.accessoryLoot; i++) {
            const accessory = game.drawEquipment('Accessory');
            if (accessory) {
              sector.addToStash(accessory);
              drawnEquipment.push(accessory);
            }
          }

          // Industry bonus
          if (sector.isIndustry) {
            const types: ('Weapon' | 'Armor' | 'Accessory')[] = ['Weapon', 'Armor', 'Accessory'];
            const randomType = types[Math.floor(Math.random() * types.length)];
            const bonusEquipment = game.drawEquipment(randomType);
            if (bonusEquipment) {
              sector.addToStash(bonusEquipment);
              drawnEquipment.push(bonusEquipment);
              game.message(`Industry bonus: found ${bonusEquipment.equipmentName}!`);
            }
          }

          game.message(`Explored ${sector.sectorName} and found ${drawnEquipment.length} equipment`);
          explorationCache.set(`${player.position}`, { sector, equipment: drawnEquipment });
        }

        // Build choices from stash
        const choices: { label: string; value: string }[] = [];
        for (const equip of sector.stash) {
          choices.push({
            label: `${equip.equipmentName} (${equip.equipmentType})`,
            value: equip.equipmentName,
          });
        }
        choices.push({ label: 'Skip Re-Equip', value: 'skip' });
        return choices;
      },
    })
    // If they chose equipment, select which MERC equips it
    .chooseFrom<string>('equipMerc1', {
      prompt: 'Which MERC should equip this item?',
      choices: (ctx) => {
        const choice1 = ctx.data?.equipChoice1 as string;
        if (choice1 === 'skip') {
          return [{ label: 'None', value: 'none' }];
        }
        const player = ctx.player as RebelPlayer;
        return player.team.map(m => ({
          label: `${m.mercName}`,
          value: m.mercName,
        }));
      },
      skipIf: (ctx) => ctx.data?.equipChoice1 === 'skip',
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const actingMerc = args.actingMerc as MercCard;
      const squad = player.primarySquad;
      const sector = game.getSector(squad.sectorId!);

      if (!sector) {
        return { success: false, message: 'No sector found' };
      }

      // Spend action
      useAction(actingMerc, ACTION_COSTS.EXPLORE);

      // Handle free re-equip selection
      const equipChoice1 = args.equipChoice1 as string;
      const equipMerc1 = args.equipMerc1 as string;

      if (equipChoice1 !== 'skip' && equipMerc1 && equipMerc1 !== 'none') {
        const equipment = sector.stash.find(e => e.equipmentName === equipChoice1);
        const merc = player.team.find(m => m.mercName === equipMerc1);

        if (equipment && merc) {
          // Remove from stash
          const idx = sector.stash.indexOf(equipment);
          if (idx >= 0) sector.stash.splice(idx, 1);

          // Equip (may replace existing)
          const replaced = merc.equip(equipment);
          if (replaced) {
            sector.addToStash(replaced);
            game.message(`${merc.mercName} equipped ${equipment.equipmentName}, returned ${replaced.equipmentName} to stash`);
          } else {
            game.message(`${merc.mercName} equipped ${equipment.equipmentName}`);
          }
        }
      }

      // Clean up cache
      explorationCache.delete(`${player.position}`);

      return {
        success: true,
        message: `Explored ${sector.sectorName}`,
        data: { stashRemaining: sector.stash.length },
      };
    });
}

/**
 * Train militia in the current sector
 * Cost: 1 action, trains militia equal to MERC's training stat
 */
export function createTrainAction(game: MERCGame): ActionDefinition {
  return Action.create('train')
    .prompt('Train militia')
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      const squad = player.primarySquad;
      if (!squad?.sectorId) return false;
      const sector = game.getSector(squad.sectorId);
      if (!sector) return false;
      // Check max militia not reached
      if (sector.getTotalRebelMilitia() >= SectorConstants.MAX_MILITIA_PER_SIDE) return false;
      // Must have a MERC with training > 0 and actions remaining
      return player.team.some(m => m.training > 0 && m.actionsRemaining >= ACTION_COSTS.TRAIN);
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to train militia',
      elementClass: MercCard,
      filter: (element, ctx) => {
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return player.team.includes(merc) &&
          merc.training > 0 &&
          merc.actionsRemaining >= ACTION_COSTS.TRAIN;
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

      // Spend action
      useAction(merc, ACTION_COSTS.TRAIN);

      // Train militia equal to training stat
      const trained = sector.addRebelMilitia(`${player.position}`, merc.training);
      game.message(`${merc.mercName} trained ${trained} militia at ${sector.sectorName}`);

      return { success: true, message: `Trained ${trained} militia` };
    });
}

// NOTE: Attack action removed - per rules (05-main-game-loop.md), combat triggers
// automatically via movement into enemy-occupied sectors, not as a separate action.

/**
 * Re-equip from sector stash, swap between MERCs, or trade with teammate
 * Cost: 1 action (per rules: "Re-Equip (1 action)")
 * Per rules (06-merc-actions.md): Trade = Exchange equipment with another MERC in same sector
 */
export function createReEquipAction(game: MERCGame): ActionDefinition {
  return Action.create('reEquip')
    .prompt('Re-equip')
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      const squad = player.primarySquad;
      if (!squad?.sectorId) return false;
      if (!hasActionsRemaining(player, ACTION_COSTS.RE_EQUIP)) return false;
      const sector = game.getSector(squad.sectorId);
      // Can re-equip if there's equipment in stash, MERCs have equipment, or can trade
      return !!(sector && (sector.stash.length > 0 || player.team.some(m =>
        m.weaponSlot || m.armorSlot || m.accessorySlot
      )));
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to equip',
      elementClass: MercCard,
      filter: (element, ctx) => {
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return player.team.includes(merc) && merc.actionsRemaining >= ACTION_COSTS.RE_EQUIP;
      },
    })
    .chooseFrom<string>('action', {
      prompt: 'What do you want to do?',
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const squad = player.primarySquad;
        const sector = game.getSector(squad.sectorId!);
        const choices: string[] = [];

        if (sector && sector.stash.length > 0) {
          choices.push('Take from stash');
        }

        // Trade option: can give equipment to another MERC in same sector
        const selectedMerc = ctx.args?.merc as MercCard;
        const hasEquipment = selectedMerc && (selectedMerc.weaponSlot || selectedMerc.armorSlot || selectedMerc.accessorySlot);
        const hasTeammates = player.team.length > 1;
        if (hasEquipment && hasTeammates) {
          choices.push('Trade with teammate');
        }

        choices.push('Unequip to stash');

        return choices;
      },
    })
    // Select trade partner if trading
    .chooseElement<MercCard>('tradePartner', {
      prompt: 'Select teammate to give equipment to',
      elementClass: MercCard,
      filter: (element, ctx) => {
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        const selectedMerc = ctx.args?.merc as MercCard;
        return player.team.includes(merc) && merc !== selectedMerc;
      },
      skipIf: (ctx) => ctx.data?.action !== 'Trade with teammate',
    })
    // Select which equipment to trade
    .chooseFrom<string>('tradeEquipment', {
      prompt: 'Which equipment to give?',
      choices: (ctx) => {
        const selectedMerc = ctx.args?.merc as MercCard;
        const choices: string[] = [];
        if (selectedMerc?.weaponSlot) choices.push(`Weapon: ${selectedMerc.weaponSlot.equipmentName}`);
        if (selectedMerc?.armorSlot) choices.push(`Armor: ${selectedMerc.armorSlot.equipmentName}`);
        if (selectedMerc?.accessorySlot) choices.push(`Accessory: ${selectedMerc.accessorySlot.equipmentName}`);
        return choices;
      },
      skipIf: (ctx) => ctx.data?.action !== 'Trade with teammate',
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const merc = args.merc as MercCard;
      const action = args.action as string;
      const squad = player.primarySquad;
      const sector = game.getSector(squad.sectorId!);

      if (!sector) {
        return { success: false, message: 'No sector found' };
      }

      // Spend action
      useAction(merc, ACTION_COSTS.RE_EQUIP);

      if (action === 'Take from stash' && sector.stash.length > 0) {
        // Take first equipment from stash and equip
        const equipment = sector.takeFromStash(0);
        if (equipment) {
          const replaced = merc.equip(equipment);
          if (replaced) {
            sector.addToStash(replaced);
            game.message(`${merc.mercName} swapped ${replaced.equipmentName} for ${equipment.equipmentName}`);
          } else {
            game.message(`${merc.mercName} equipped ${equipment.equipmentName}`);
          }
          return { success: true, message: `Equipped ${equipment.equipmentName}` };
        }
      } else if (action === 'Trade with teammate') {
        const tradePartner = args.tradePartner as MercCard;
        const tradeEquipmentStr = args.tradeEquipment as string;

        if (tradePartner && tradeEquipmentStr) {
          // Determine which slot to trade
          let equipmentToTrade: Equipment | undefined;
          let slot: 'Weapon' | 'Armor' | 'Accessory';

          if (tradeEquipmentStr.startsWith('Weapon:')) {
            equipmentToTrade = merc.weaponSlot;
            slot = 'Weapon';
          } else if (tradeEquipmentStr.startsWith('Armor:')) {
            equipmentToTrade = merc.armorSlot;
            slot = 'Armor';
          } else {
            equipmentToTrade = merc.accessorySlot;
            slot = 'Accessory';
          }

          if (equipmentToTrade) {
            // Remove from giver
            merc.unequip(slot);

            // Give to receiver (may replace their existing equipment)
            const replaced = tradePartner.equip(equipmentToTrade);
            if (replaced) {
              // Receiver's old equipment goes to stash
              sector.addToStash(replaced);
              game.message(`${merc.mercName} gave ${equipmentToTrade.equipmentName} to ${tradePartner.mercName}, ${replaced.equipmentName} added to stash`);
            } else {
              game.message(`${merc.mercName} gave ${equipmentToTrade.equipmentName} to ${tradePartner.mercName}`);
            }

            return { success: true, message: `Traded ${equipmentToTrade.equipmentName}` };
          }
        }
      } else if (action === 'Unequip to stash') {
        // Unequip weapon (could be extended to choose slot)
        if (merc.weaponSlot) {
          const unequipped = merc.unequip('Weapon');
          if (unequipped) {
            sector.addToStash(unequipped);
            game.message(`${merc.mercName} unequipped ${unequipped.equipmentName}`);
            return { success: true, message: `Unequipped ${unequipped.equipmentName}` };
          }
        }
      }

      return { success: false, message: 'Nothing to do' };
    });
}

/**
 * Use hospital in a city sector
 * Cost: 1 action, fully heals MERC
 */
export function createHospitalAction(game: MERCGame): ActionDefinition {
  return Action.create('hospital')
    .prompt('Visit hospital')
    .condition((ctx) => {
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
      filter: (element, ctx) => {
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return player.team.includes(merc) &&
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

/**
 * Use arms dealer in a city sector
 * Cost: 1 action, draw equipment
 */
export function createArmsDealerAction(game: MERCGame): ActionDefinition {
  return Action.create('armsDealer')
    .prompt('Visit arms dealer')
    .condition((ctx) => {
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
      filter: (element, ctx) => {
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return player.team.includes(merc) && merc.actionsRemaining >= ACTION_COSTS.ARMS_DEALER;
      },
    })
    .chooseFrom<string>('equipmentType', {
      prompt: 'What type of equipment?',
      choices: () => ['Weapon', 'Armor', 'Accessory'],
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const actingMerc = args.actingMerc as MercCard;
      const equipmentType = args.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
      const squad = player.primarySquad;
      const sector = game.getSector(squad.sectorId!);

      // Spend action
      useAction(actingMerc, ACTION_COSTS.ARMS_DEALER);

      const equipment = game.drawEquipment(equipmentType);
      if (equipment && sector) {
        // Add to sector stash
        sector.addToStash(equipment);
        game.message(`${actingMerc.mercName} bought ${equipment.equipmentName} (added to stash)`);
        return { success: true, message: `Bought ${equipment.equipmentName}` };
      }

      return { success: false, message: 'No equipment available' };
    });
}

/**
 * Split off secondary squad
 * Cost: Free action
 */
export function createSplitSquadAction(game: MERCGame): ActionDefinition {
  return Action.create('splitSquad')
    .prompt('Split squad')
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      // Must have at least 2 MERCs in primary and empty secondary
      return player.primarySquad.mercCount > 1 && player.secondarySquad.mercCount === 0;
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to split off into secondary squad',
      elementClass: MercCard,
      filter: (element, ctx) => {
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return player.primarySquad.getMercs().includes(merc);
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const merc = args.merc as MercCard;

      // Move MERC from primary to secondary squad
      merc.putInto(player.secondarySquad);

      // Secondary squad starts at same location
      player.secondarySquad.sectorId = player.primarySquad.sectorId;

      game.message(`${player.name} split off ${merc.mercName} into secondary squad`);
      return { success: true, message: `Split ${merc.mercName} to secondary squad` };
    });
}

/**
 * Merge squads back together
 * Cost: Free action
 */
export function createMergeSquadsAction(game: MERCGame): ActionDefinition {
  return Action.create('mergeSquads')
    .prompt('Merge squads')
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      // Both squads must be in same sector
      return player.secondarySquad.mercCount > 0 &&
             player.primarySquad.sectorId === player.secondarySquad.sectorId;
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;

      // Move all MERCs from secondary to primary
      const mercs = player.secondarySquad.getMercs();
      for (const merc of mercs) {
        merc.putInto(player.primarySquad);
      }

      // Clear secondary squad location
      player.secondarySquad.sectorId = undefined;

      game.message(`${player.name} merged squads (${mercs.length} MERC(s) rejoined)`);
      return { success: true, message: `Merged ${mercs.length} MERC(s)` };
    });
}

/**
 * Fire a MERC
 * Per rules (06-merc-actions.md lines 57-62): Can be done during hire action
 * Cost: Free action
 * - Drops MERC's equipment into current sector's stash
 * - Discards the MERC card
 */
export function createFireMercAction(game: MERCGame): ActionDefinition {
  return Action.create('fireMerc')
    .prompt('Fire a MERC')
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      // Must have at least 2 MERCs (can't fire your only MERC)
      return player.teamSize >= 2;
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to fire',
      elementClass: MercCard,
      filter: (element, ctx) => {
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return player.team.includes(merc);
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const merc = args.merc as MercCard;

      // Find current sector for equipment drop
      const squad = player.primarySquad.getMercs().includes(merc) ? player.primarySquad : player.secondarySquad;
      const sector = squad?.sectorId ? game.getSector(squad.sectorId) : null;

      // Drop equipment to stash
      const droppedEquipment: string[] = [];
      if (merc.weaponSlot) {
        const weapon = merc.unequip('Weapon');
        if (weapon && sector) {
          sector.addToStash(weapon);
          droppedEquipment.push(weapon.equipmentName);
        }
      }
      if (merc.armorSlot) {
        const armor = merc.unequip('Armor');
        if (armor && sector) {
          sector.addToStash(armor);
          droppedEquipment.push(armor.equipmentName);
        }
      }
      if (merc.accessorySlot) {
        const accessory = merc.unequip('Accessory');
        if (accessory && sector) {
          sector.addToStash(accessory);
          droppedEquipment.push(accessory.equipmentName);
        }
      }

      // Discard the MERC
      merc.putInto(game.mercDiscard);

      if (droppedEquipment.length > 0) {
        game.message(`${player.name} fired ${merc.mercName}, dropped ${droppedEquipment.join(', ')} to stash`);
      } else {
        game.message(`${player.name} fired ${merc.mercName}`);
      }

      return { success: true, message: `Fired ${merc.mercName}`, data: { droppedEquipment } };
    });
}

/**
 * End the current turn
 * Clears all remaining actions from player's MERCs
 */
export function createEndTurnAction(game: MERCGame): ActionDefinition {
  return Action.create('endTurn')
    .prompt('End turn')
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
// Day 1 Specific Actions
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
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      return player.teamSize === 0; // Only show if player hasn't hired yet
    })
    .chooseFrom<string>('firstMerc', {
      prompt: 'Draw 3 MERCs - Select your FIRST MERC to hire',
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const playerId = `${player.position}`;

        // Draw MERCs only once per player
        if (!drawnMercsCache.has(playerId)) {
          drawnMercsCache.set(playerId, drawMercsForHiring(game, 3));
        }
        const available = drawnMercsCache.get(playerId) || [];

        if (available.length === 0) {
          return [{ label: 'No MERCs available', value: '' }];
        }
        return available.map((m) => ({
          label: capitalize(m.mercName),
          value: m.mercId,
        }));
      },
    })
    .chooseFrom<string>('secondMerc', {
      prompt: 'Select your SECOND MERC to hire',
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const playerId = `${player.position}`;
        const available = drawnMercsCache.get(playerId) || [];
        const firstMercId = ctx.args?.firstMerc as string | undefined;

        // Safety check - if firstMerc not yet selected, show all available
        if (!firstMercId) {
          if (available.length === 0) {
            return [{ label: 'No MERCs available', value: '' }];
          }
          return available.map((m) => ({
            label: capitalize(m.mercName),
            value: m.mercId,
          }));
        }

        // Filter out the first selected MERC
        const remaining = available.filter(m => m.mercId !== firstMercId);

        if (remaining.length === 0) {
          return [{ label: 'No MERCs available', value: '' }];
        }
        return remaining.map((m) => ({
          label: capitalize(m.mercName),
          value: m.mercId,
        }));
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const playerId = `${player.position}`;
      const available = drawnMercsCache.get(playerId) || [];

      if (available.length === 0) {
        return { success: false, message: 'No MERCs available in deck' };
      }

      const firstMercId = args.firstMerc as string;
      const secondMercId = args.secondMerc as string;

      if (!firstMercId || !secondMercId) {
        return { success: false, message: 'No MERCs available in deck' };
      }

      const firstMerc = available.find(m => m.mercId === firstMercId);
      const secondMerc = available.find(m => m.mercId === secondMercId);

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
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      return player.team.some(merc =>
        !merc.weaponSlot && !merc.armorSlot && !merc.accessorySlot
      );
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to equip',
      elementClass: MercCard,
      filter: (element, ctx) => {
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return player.team.includes(merc) &&
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
// Dictator Actions
// =============================================================================

/**
 * Play a tactics card
 */
export function createPlayTacticsAction(game: MERCGame): ActionDefinition {
  return Action.create('playTactics')
    .prompt('Play a tactics card')
    .condition((ctx) => {
      // Only the dictator player can play tactics cards
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      return (game.dictatorPlayer?.tacticsHand?.count(TacticsCard) ?? 0) > 0;
    })
    .chooseElement<TacticsCard>('card', {
      prompt: 'Select a tactics card to play',
      elementClass: TacticsCard,
      filter: (element) => {
        const card = element as unknown as TacticsCard;
        return game.dictatorPlayer?.tacticsHand?.all(TacticsCard).includes(card) ?? false;
      },
    })
    .execute((args) => {
      const card = args.card as TacticsCard;
      game.message(`Dictator plays: ${card.tacticsName}`);

      // Move card to discard
      card.putInto(game.dictatorPlayer.tacticsDiscard);

      // Execute the card's effect
      const result = executeTacticsEffect(game, card);

      return {
        success: result.success,
        message: `Played ${card.tacticsName}: ${result.message}`,
        data: result.data,
      };
    });
}

/**
 * Reinforce instead of playing a tactics card
 * Discard a tactics card to gain militia
 */
export function createReinforceAction(game: MERCGame): ActionDefinition {
  return Action.create('reinforce')
    .prompt('Reinforce militia')
    .condition((ctx) => {
      // Only the dictator player can reinforce
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      return (game.dictatorPlayer?.tacticsHand?.count(TacticsCard) ?? 0) > 0;
    })
    .chooseElement<TacticsCard>('card', {
      prompt: 'Discard a tactics card to reinforce',
      elementClass: TacticsCard,
      filter: (element) => {
        const card = element as unknown as TacticsCard;
        return game.dictatorPlayer?.tacticsHand?.all(TacticsCard).includes(card) ?? false;
      },
    })
    .chooseElement<Sector>('sector', {
      prompt: 'Place reinforcement militia where?',
      elementClass: Sector,
      filter: (element) => {
        const sector = element as unknown as Sector;
        // Per rules: "Sector must be Dictator-controlled"
        // Dictator controls if militia >= total rebel militia (ties go to dictator)
        const isControlled = sector.dictatorMilitia >= sector.getTotalRebelMilitia() &&
          sector.dictatorMilitia > 0;
        // Also allow base sector even if no militia yet
        const isBase = game.dictatorPlayer.baseSectorId === sector.sectorId;
        return isControlled || isBase;
      },
      boardRef: (element) => ({ id: (element as unknown as Sector).id }),
    })
    .execute((args) => {
      const card = args.card as TacticsCard;
      const sector = args.sector as Sector;

      // Calculate reinforcement amount
      const reinforcements = game.getReinforcementAmount();

      // Discard the card
      card.putInto(game.dictatorPlayer.tacticsDiscard);

      // Place militia
      const placed = sector.addDictatorMilitia(reinforcements);

      game.message(`Dictator discards ${card.tacticsName} to reinforce`);
      game.message(`Placed ${placed} militia at ${sector.sectorName}`);

      return { success: true, message: `Reinforced with ${placed} militia` };
    });
}

/**
 * Move dictator militia between adjacent sectors
 */
export function createMoveMilitiaAction(game: MERCGame): ActionDefinition {
  return Action.create('moveMilitia')
    .prompt('Move militia')
    .condition((ctx) => {
      // Only the dictator player can move militia
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      // Must have militia somewhere
      return game.gameMap.getAllSectors().some(s => s.dictatorMilitia > 0);
    })
    .chooseElement<Sector>('fromSector', {
      prompt: 'Move militia from which sector?',
      elementClass: Sector,
      filter: (element) => {
        const sector = element as unknown as Sector;
        return sector.dictatorMilitia > 0;
      },
      boardRef: (element) => ({ id: (element as unknown as Sector).id }),
    })
    .chooseElement<Sector>('toSector', {
      prompt: 'Move militia to which adjacent sector?',
      elementClass: Sector,
      filter: (element, ctx) => {
        const sector = element as unknown as Sector;
        const fromSector = ctx.args.fromSector as Sector;
        if (!fromSector) return false;
        const adjacent = game.getAdjacentSectors(fromSector);
        return adjacent.some(s => s.sectorId === sector.sectorId) &&
          sector.dictatorMilitia < SectorConstants.MAX_MILITIA_PER_SIDE;
      },
      boardRef: (element) => ({ id: (element as unknown as Sector).id }),
    })
    .chooseFrom<string>('count', {
      prompt: 'How many militia to move?',
      choices: (ctx) => {
        const fromSector = ctx.args.fromSector as Sector;
        if (!fromSector) return ['1'];
        return Array.from({ length: fromSector.dictatorMilitia }, (_, i) => String(i + 1));
      },
    })
    .execute((args) => {
      const fromSector = args.fromSector as Sector;
      const toSector = args.toSector as Sector;
      const count = parseInt(args.count as string, 10);

      const removed = fromSector.removeDictatorMilitia(count);
      const added = toSector.addDictatorMilitia(removed);

      game.message(`Dictator moved ${added} militia from ${fromSector.sectorName} to ${toSector.sectorName}`);

      // Per rules: "Combat triggers when: An enemy moves into your sector"
      // Check if any rebel has units at destination and trigger combat
      for (const rebel of game.rebelPlayers) {
        const hasSquad = rebel.primarySquad.sectorId === toSector.sectorId ||
          rebel.secondarySquad.sectorId === toSector.sectorId;
        const hasMilitia = toSector.getRebelMilitia(`${rebel.position}`) > 0;

        if (hasSquad || hasMilitia) {
          game.message(`Rebels detected at ${toSector.sectorName} - combat begins!`);
          const outcome = executeCombat(game, toSector, rebel);
          return {
            success: true,
            message: `Moved ${added} militia and engaged in combat`,
            data: {
              combatTriggered: true,
              rebelVictory: outcome.rebelVictory,
              dictatorVictory: outcome.dictatorVictory,
            },
          };
        }
      }

      return { success: true, message: `Moved ${added} militia` };
    });
}

/**
 * Skip militia movement
 */
export function createSkipMilitiaMoveAction(game: MERCGame): ActionDefinition {
  return Action.create('skipMilitiaMove')
    .prompt('Skip militia movement')
    .condition((ctx) => {
      // Only the dictator player can skip militia movement
      return game.isDictatorPlayer(ctx.player as any);
    })
    .execute(() => {
      game.message('Dictator holds position');
      return { success: true, message: 'Militia held' };
    });
}

// =============================================================================
// Dictator MERC Actions
// =============================================================================

/**
 * Dictator MERC move action
 */
export function createDictatorMoveAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorMove')
    .prompt('Move Dictator MERC')
    .condition((ctx) => {
      // Only the dictator player can move dictator MERCs
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      // Check if any dictator MERC has actions and a valid location
      const mercs = game.dictatorPlayer?.hiredMercs || [];
      return mercs.some(m => m.actionsRemaining >= ACTION_COSTS.MOVE && m.sectorId);
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to move',
      elementClass: MercCard,
      filter: (element) => {
        const merc = element as unknown as MercCard;
        const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
        return dictatorMercs.includes(merc) &&
          merc.actionsRemaining >= ACTION_COSTS.MOVE &&
          !!merc.sectorId;
      },
    })
    .chooseElement<Sector>('destination', {
      prompt: 'Select destination sector',
      elementClass: Sector,
      filter: (element, ctx) => {
        const sector = element as unknown as Sector;
        const merc = ctx.args.merc as MercCard;
        // Use the MERC's current sector for adjacency check
        if (!merc?.sectorId) return false;
        const currentSector = game.getSector(merc.sectorId);
        if (!currentSector) return false;
        const adjacent = game.getAdjacentSectors(currentSector);
        return adjacent.some(s => s.sectorId === sector.sectorId);
      },
    })
    .execute((args) => {
      const merc = args.merc as MercCard;
      const destination = args.destination as Sector;

      merc.useAction(ACTION_COSTS.MOVE);
      // Update MERC's location
      merc.sectorId = destination.sectorId;
      game.message(`Dictator MERC ${merc.mercName} moved to ${destination.sectorName}`);

      return { success: true, message: `Moved to ${destination.sectorName}` };
    });
}

/**
 * Dictator MERC explore action
 */
export function createDictatorExploreAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorExplore')
    .prompt('Explore with Dictator MERC')
    .condition((ctx) => {
      // Only the dictator player can use dictator MERC actions
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      const mercs = game.dictatorPlayer?.hiredMercs || [];
      // Check if any MERC has actions and is at an unexplored sector
      return mercs.some(m => {
        if (m.actionsRemaining < ACTION_COSTS.EXPLORE || !m.sectorId) return false;
        const sector = game.getSector(m.sectorId);
        return sector && !sector.explored;
      });
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to explore',
      elementClass: MercCard,
      filter: (element) => {
        const merc = element as unknown as MercCard;
        const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
        if (!dictatorMercs.includes(merc)) return false;
        if (merc.actionsRemaining < ACTION_COSTS.EXPLORE || !merc.sectorId) return false;
        const sector = game.getSector(merc.sectorId);
        return sector && !sector.explored;
      },
    })
    .execute((args) => {
      const merc = args.merc as MercCard;
      const sector = game.getSector(merc.sectorId!);

      if (!sector || sector.explored) {
        return { success: false, message: 'Cannot explore' };
      }

      merc.useAction(ACTION_COSTS.EXPLORE);
      sector.explore();

      // Draw equipment based on loot icons
      const drawnEquipment: Equipment[] = [];
      for (let i = 0; i < sector.weaponLoot; i++) {
        const weapon = game.drawEquipment('Weapon');
        if (weapon) {
          sector.addToStash(weapon);
          drawnEquipment.push(weapon);
        }
      }
      for (let i = 0; i < sector.armorLoot; i++) {
        const armor = game.drawEquipment('Armor');
        if (armor) {
          sector.addToStash(armor);
          drawnEquipment.push(armor);
        }
      }
      for (let i = 0; i < sector.accessoryLoot; i++) {
        const accessory = game.drawEquipment('Accessory');
        if (accessory) {
          sector.addToStash(accessory);
          drawnEquipment.push(accessory);
        }
      }

      game.message(`Dictator MERC ${merc.mercName} explored ${sector.sectorName}, found ${drawnEquipment.length} equipment`);
      return { success: true, message: `Explored ${sector.sectorName}` };
    });
}

/**
 * Dictator MERC train militia action
 */
export function createDictatorTrainAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorTrain')
    .prompt('Train militia with Dictator MERC')
    .condition((ctx) => {
      // Only the dictator player can use dictator MERC actions
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      const mercs = game.dictatorPlayer?.hiredMercs || [];
      return mercs.some(m => m.training > 0 && m.actionsRemaining >= ACTION_COSTS.TRAIN && m.sectorId);
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to train',
      elementClass: MercCard,
      filter: (element) => {
        const merc = element as unknown as MercCard;
        const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
        return dictatorMercs.includes(merc) &&
          merc.training > 0 &&
          merc.actionsRemaining >= ACTION_COSTS.TRAIN &&
          !!merc.sectorId;
      },
    })
    .execute((args) => {
      const merc = args.merc as MercCard;
      const sector = game.getSector(merc.sectorId!);

      if (!sector) {
        return { success: false, message: 'No sector found' };
      }

      merc.useAction(ACTION_COSTS.TRAIN);
      const trained = sector.addDictatorMilitia(merc.training);
      game.message(`Dictator MERC ${merc.mercName} trained ${trained} militia at ${sector.sectorName}`);

      return { success: true, message: `Trained ${trained} militia` };
    });
}

/**
 * Dictator MERC re-equip action
 */
export function createDictatorReEquipAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorReEquip')
    .prompt('Re-equip Dictator MERC')
    .condition((ctx) => {
      // Only the dictator player can use dictator MERC actions
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      const mercs = game.dictatorPlayer?.hiredMercs || [];
      // Check if any MERC has actions and is at a sector with equipment
      return mercs.some(m => {
        if (m.actionsRemaining < ACTION_COSTS.RE_EQUIP || !m.sectorId) return false;
        const sector = game.getSector(m.sectorId);
        return sector && sector.stash.length > 0;
      });
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to re-equip',
      elementClass: MercCard,
      filter: (element) => {
        const merc = element as unknown as MercCard;
        const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
        if (!dictatorMercs.includes(merc)) return false;
        if (merc.actionsRemaining < ACTION_COSTS.RE_EQUIP || !merc.sectorId) return false;
        const sector = game.getSector(merc.sectorId);
        return sector && sector.stash.length > 0;
      },
    })
    .chooseElement<Equipment>('equipment', {
      prompt: 'Select equipment from stash',
      elementClass: Equipment,
      filter: (element, ctx) => {
        const equipment = element as unknown as Equipment;
        const merc = ctx.args.merc as MercCard;
        if (!merc?.sectorId) return false;
        const sector = game.getSector(merc.sectorId);
        return sector?.stash.includes(equipment) ?? false;
      },
    })
    .execute((args) => {
      const merc = args.merc as MercCard;
      const equipment = args.equipment as Equipment;
      const sector = game.getSector(merc.sectorId!);

      if (!sector) {
        return { success: false, message: 'No sector found' };
      }

      merc.useAction(ACTION_COSTS.RE_EQUIP);

      // Unequip current item of same type if any
      const currentEquipment = merc.getEquipmentOfType(equipment.equipmentType);
      if (currentEquipment) {
        merc.unequip(currentEquipment);
        sector.addToStash(currentEquipment);
      }

      // Equip new item
      sector.removeFromStash(equipment);
      merc.equip(equipment);

      game.message(`Dictator MERC ${merc.mercName} equipped ${equipment.equipmentName}`);
      return { success: true, message: `Equipped ${equipment.equipmentName}` };
    });
}

/**
 * End dictator MERC actions
 */
export function createDictatorEndMercActionsAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorEndMercActions')
    .prompt('End MERC actions')
    .condition((ctx) => {
      // Only the dictator player can end dictator MERC actions
      return game.isDictatorPlayer(ctx.player as any);
    })
    .execute(() => {
      // Clear all remaining actions from dictator MERCs
      const mercs = game.dictatorPlayer?.hiredMercs || [];
      for (const merc of mercs) {
        merc.actionsRemaining = 0;
      }
      if (game.dictatorPlayer?.dictator?.inPlay) {
        game.dictatorPlayer.dictator.actionsRemaining = 0;
      }
      game.message('Dictator ends MERC actions');
      return { success: true, message: 'MERC actions ended' };
    });
}

// =============================================================================
// Action Registration Helper
// =============================================================================

export function registerAllActions(game: MERCGame): void {
  // Rebel actions
  game.registerAction(createHireMercAction(game));
  game.registerAction(createPlaceLandingAction(game));
  game.registerAction(createMoveAction(game));
  game.registerAction(createExploreAction(game));
  game.registerAction(createTrainAction(game));
  // Attack removed - per rules, combat triggers via movement only
  game.registerAction(createReEquipAction(game));
  game.registerAction(createHospitalAction(game));
  game.registerAction(createArmsDealerAction(game));
  game.registerAction(createSplitSquadAction(game));
  game.registerAction(createMergeSquadsAction(game));
  game.registerAction(createFireMercAction(game));
  game.registerAction(createEndTurnAction(game));

  // Day 1 specific actions
  game.registerAction(createHireStartingMercsAction(game));
  game.registerAction(createEquipStartingAction(game));

  // Dictator actions
  game.registerAction(createPlayTacticsAction(game));
  game.registerAction(createReinforceAction(game));
  game.registerAction(createMoveMilitiaAction(game));
  game.registerAction(createSkipMilitiaMoveAction(game));

  // Dictator MERC actions
  game.registerAction(createDictatorMoveAction(game));
  game.registerAction(createDictatorExploreAction(game));
  game.registerAction(createDictatorTrainAction(game));
  game.registerAction(createDictatorReEquipAction(game));
  game.registerAction(createDictatorEndMercActionsAction(game));
}
