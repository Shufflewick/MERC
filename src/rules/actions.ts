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

// =============================================================================
// Action Cost Constants
// =============================================================================

const ACTION_COSTS = {
  MOVE: 1,
  EXPLORE: 1,
  TRAIN: 1,
  ATTACK: 1,
  HOSPITAL: 1,
  ARMS_DEALER: 1,
  HIRE_MERC: 1,
  RE_EQUIP: 0, // Free action
  SPLIT_SQUAD: 0, // Free action
  MERGE_SQUADS: 0, // Free action
  GIFT_MILITIA: 0, // Free action
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
 * Hire a MERC from the deck
 * Cost: 1 action (requires controlled sector beyond the first)
 */
export function createHireMercAction(game: MERCGame): ActionDefinition {
  return Action.create('hireMerc')
    .prompt('Hire a mercenary')
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      if (!player.canHireMerc(game)) return false;
      if (!hasActionsRemaining(player, ACTION_COSTS.HIRE_MERC)) return false;
      return game.mercDeck.count(MercCard) > 0;
    })
    .chooseElement<MercCard>('actingMerc', {
      prompt: 'Which MERC spends the action?',
      elementClass: MercCard,
      filter: (element, ctx) => {
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return player.team.includes(merc) && merc.actionsRemaining >= ACTION_COSTS.HIRE_MERC;
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const actingMerc = args.actingMerc as MercCard;

      // Spend action
      if (!useAction(actingMerc, ACTION_COSTS.HIRE_MERC)) {
        return { success: false, message: 'Not enough actions' };
      }

      const merc = game.drawMerc();
      if (merc) {
        merc.putInto(player.primarySquad);
        game.message(`${player.name} hired ${merc.mercName} (${actingMerc.mercName} spent 1 action)`);
        return { success: true, message: `Hired ${merc.mercName}` };
      }

      return { success: false, message: 'No MERCs available' };
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

      return { success: true, message: `Moved to ${destination.sectorName}` };
    });
}

/**
 * Explore an unexplored sector
 * Cost: 1 action
 */
export function createExploreAction(game: MERCGame): ActionDefinition {
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

      sector.explore();

      // Draw equipment based on loot icons and add to sector stash
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

      game.message(`${actingMerc.mercName} explored ${sector.sectorName} and found ${drawnEquipment.length} equipment (added to stash)`);

      return {
        success: true,
        message: `Explored ${sector.sectorName}`,
        data: { equipment: drawnEquipment.map(e => e.equipmentName) },
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

/**
 * Attack enemies in the current sector
 * Cost: 1 action per attacking MERC
 */
export function createAttackAction(game: MERCGame): ActionDefinition {
  return Action.create('attack')
    .prompt('Attack enemies')
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      const squad = player.primarySquad;
      if (!squad?.sectorId) return false;
      const sector = game.getSector(squad.sectorId);
      if (!sector) return false;
      if (!hasEnemies(game, sector, player)) return false;
      return hasActionsRemaining(player, ACTION_COSTS.ATTACK);
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const squad = player.primarySquad;
      const sector = game.getSector(squad.sectorId!);

      if (!sector) {
        return { success: false, message: 'No sector found' };
      }

      // Spend action from all MERCs in sector
      const mercs = game.getMercsInSector(sector, player);
      for (const merc of mercs) {
        useAction(merc, ACTION_COSTS.ATTACK);
      }

      // Execute combat
      const outcome = executeCombat(game, sector, player);

      return {
        success: true,
        message: outcome.rebelVictory ? 'Victory!' : outcome.dictatorVictory ? 'Defeat!' : 'Combat continues',
        data: {
          rebelVictory: outcome.rebelVictory,
          dictatorVictory: outcome.dictatorVictory,
          rebelCasualties: outcome.rebelCasualties.length,
          dictatorCasualties: outcome.dictatorCasualties.length,
        },
      };
    });
}

/**
 * Re-equip from sector stash or swap between MERCs
 * Cost: Free action
 */
export function createReEquipAction(game: MERCGame): ActionDefinition {
  return Action.create('reEquip')
    .prompt('Re-equip')
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      const squad = player.primarySquad;
      if (!squad?.sectorId) return false;
      const sector = game.getSector(squad.sectorId);
      // Can re-equip if there's equipment in stash or MERCs have equipment
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
        return player.team.includes(merc);
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
        choices.push('Unequip to stash');

        return choices;
      },
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
 * Gift militia to another rebel
 * Cost: Free action
 */
export function createGiftMilitiaAction(game: MERCGame): ActionDefinition {
  return Action.create('giftMilitia')
    .prompt('Gift militia')
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      const squad = player.primarySquad;
      if (!squad?.sectorId) return false;
      const sector = game.getSector(squad.sectorId);
      if (!sector) return false;
      // Must have militia to gift
      const myMilitia = sector.getRebelMilitia(`${player.position}`);
      if (myMilitia === 0) return false;
      // Must be another rebel in same sector
      return game.rebelPlayers.some(r =>
        r !== player &&
        (r.primarySquad.sectorId === sector.sectorId || r.secondarySquad.sectorId === sector.sectorId)
      );
    })
    .chooseFrom<string>('recipient', {
      prompt: 'Gift militia to which rebel?',
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const squad = player.primarySquad;
        const sector = game.getSector(squad.sectorId!);
        if (!sector) return [];
        return game.rebelPlayers
          .filter(r => r !== player &&
            (r.primarySquad.sectorId === sector.sectorId || r.secondarySquad.sectorId === sector.sectorId))
          .map(r => r.name);
      },
    })
    .chooseFrom<string>('count', {
      prompt: 'How many militia to gift?',
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const squad = player.primarySquad;
        const sector = game.getSector(squad.sectorId!);
        if (!sector) return ['1'];
        const myMilitia = sector.getRebelMilitia(`${player.position}`);
        return Array.from({ length: myMilitia }, (_, i) => String(i + 1));
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const recipientName = args.recipient as string;
      const count = parseInt(args.count as string, 10);
      const squad = player.primarySquad;
      const sector = game.getSector(squad.sectorId!);

      if (!sector) {
        return { success: false, message: 'No sector found' };
      }

      const recipient = game.rebelPlayers.find(r => r.name === recipientName);
      if (!recipient) {
        return { success: false, message: 'Recipient not found' };
      }

      // Transfer militia
      const removed = sector.removeRebelMilitia(`${player.position}`, count);
      const added = sector.addRebelMilitia(`${recipient.position}`, removed);

      game.message(`${player.name} gifted ${added} militia to ${recipient.name}`);
      return { success: true, message: `Gifted ${added} militia` };
    });
}

/**
 * End the current turn
 */
export function createEndTurnAction(game: MERCGame): ActionDefinition {
  return Action.create('endTurn')
    .prompt('End turn')
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      game.message(`${player.name} ends their turn`);
      return { success: true, message: 'Turn ended', data: { endTurn: true } };
    });
}

// =============================================================================
// Day 1 Specific Actions
// =============================================================================

/**
 * Hire starting MERCs on Day 1.
 * Draw 3 MERCs, player picks which ones to hire (first 2 are free).
 * This action is called once - player chooses which of 3 drawn MERCs to keep.
 */
export function createHireStartingMercsAction(game: MERCGame): ActionDefinition {
  // Store drawn MERCs at action creation time for consistency
  let drawnMercsCache: MercCard[] | null = null;

  return Action.create('hireStartingMercs')
    .prompt('Hire your starting MERCs')
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      return player.teamSize < TeamConstants.STARTING_MERCS;
    })
    .chooseFrom<string>('mercChoice', {
      prompt: 'Select a MERC to hire (pick up to 2 total)',
      choices: (ctx) => {
        // Draw MERCs only once per hiring round
        if (!drawnMercsCache) {
          drawnMercsCache = drawMercsForHiring(game, 3);
        }
        // Filter out already-hired MERCs
        const player = ctx.player as RebelPlayer;
        const hiredIds = new Set(player.team.map(m => m.mercId));
        const available = drawnMercsCache.filter(m => !hiredIds.has(m.mercId));

        if (available.length === 0) {
          return ['No MERCs available'];
        }
        return available.map((m, i) => `${i}: ${m.mercName} (Init:${m.baseInitiative} Train:${m.baseTraining} Combat:${m.baseCombat})`);
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const choice = args.mercChoice as string;

      if (!drawnMercsCache || drawnMercsCache.length === 0 || choice === 'No MERCs available') {
        return { success: false, message: 'No MERCs available in deck' };
      }

      // Parse selected index
      const selectedIndex = parseInt(choice.split(':')[0], 10);
      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= drawnMercsCache.length) {
        return { success: false, message: 'Invalid selection' };
      }

      // Hire the selected MERC
      const merc = drawnMercsCache[selectedIndex];
      merc.putInto(player.primarySquad);
      game.message(`${player.name} hired ${merc.mercName}`);

      // If player has hired enough, discard remaining
      if (player.teamSize >= TeamConstants.STARTING_MERCS) {
        for (const remaining of drawnMercsCache) {
          if (!player.team.includes(remaining)) {
            remaining.putInto(game.mercDiscard);
          }
        }
        drawnMercsCache = null; // Reset for next player
      }

      return {
        success: true,
        message: `Hired ${merc.mercName}`,
        data: { hiredMerc: merc.mercName },
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
    .condition(() => {
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
      game.message(`Effect: ${card.description}`);

      // Move card to discard
      card.putInto(game.dictatorPlayer.tacticsDiscard);

      // TODO: Implement specific card effects based on card.tacticsId

      return { success: true, message: `Played ${card.tacticsName}` };
    });
}

/**
 * Reinforce instead of playing a tactics card
 * Discard a tactics card to gain militia
 */
export function createReinforceAction(game: MERCGame): ActionDefinition {
  return Action.create('reinforce')
    .prompt('Reinforce militia')
    .condition(() => {
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
        // Must be a sector with dictator presence or any industry
        return sector.dictatorMilitia > 0 ||
          sector.isIndustry ||
          (game.dictatorPlayer.baseSectorId === sector.sectorId);
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
    .condition(() => {
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

      return { success: true, message: `Moved ${added} militia` };
    });
}

/**
 * Skip militia movement
 */
export function createSkipMilitiaMoveAction(game: MERCGame): ActionDefinition {
  return Action.create('skipMilitiaMove')
    .prompt('Skip militia movement')
    .execute(() => {
      game.message('Dictator holds position');
      return { success: true, message: 'Militia held' };
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
  game.registerAction(createAttackAction(game));
  game.registerAction(createReEquipAction(game));
  game.registerAction(createHospitalAction(game));
  game.registerAction(createArmsDealerAction(game));
  game.registerAction(createSplitSquadAction(game));
  game.registerAction(createMergeSquadsAction(game));
  game.registerAction(createGiftMilitiaAction(game));
  game.registerAction(createEndTurnAction(game));

  // Day 1 specific actions
  game.registerAction(createHireStartingMercsAction(game));
  game.registerAction(createEquipStartingAction(game));

  // Dictator actions
  game.registerAction(createPlayTacticsAction(game));
  game.registerAction(createReinforceAction(game));
  game.registerAction(createMoveMilitiaAction(game));
  game.registerAction(createSkipMilitiaMoveAction(game));
}
