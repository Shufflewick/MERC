import { Action, type ActionDefinition } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer } from './game.js';
import { MercCard, DictatorCard, Sector, Equipment, TacticsCard, Squad } from './elements.js';
import { TeamConstants, SectorConstants } from './constants.js';
import {
  drawMercsForHiring,
  hireSelectedMercs,
  isValidLandingSector,
  equipStartingEquipment,
} from './day-one.js';
import { executeCombat, executeCombatRetreat, hasEnemies, getValidRetreatSectors } from './combat.js';
import { executeTacticsEffect } from './tactics-effects.js';
import { autoEquipDictatorUnits } from './ai-helpers.js';

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
 * MERC-yi7: Can also fire a MERC during this action
 * MERC-l1q: New MERCs join existing squad
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
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return player.team.includes(merc) && merc.actionsRemaining >= ACTION_COSTS.HIRE_MERC;
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

        // Account for potential firing when calculating team limit
        const fireChoice = ctx.data?.fireFirst as string;
        const willFire = fireChoice && fireChoice !== 'none';
        const teamLimit = player.getTeamLimit(game);
        const currentSize = player.teamSize - (willFire ? 1 : 0);
        const canHire = teamLimit - currentSize;

        const choices = drawnMercs.map(m => capitalize(m.mercName));

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
      const fireChoice = args.fireFirst as string;

      // Spend action
      if (!useAction(actingMerc, ACTION_COSTS.HIRE_MERC)) {
        // Return mercs to deck/discard if failed
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
          const firedSquad = player.primarySquad.getMercs().includes(mercToFire)
            ? player.primarySquad : player.secondarySquad;
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

          const freeEquipment = game.drawEquipment(equipType);
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
 * MERC-wrq: Coordinated Attack - Move both squads to attack the same sector
 * Per rules (06-merc-actions.md): Two or more squads may attack the same sector simultaneously
 * Cost: 1 action per MERC in both squads
 */
export function createCoordinatedAttackAction(game: MERCGame): ActionDefinition {
  return Action.create('coordinatedAttack')
    .prompt('Coordinated attack (both squads)')
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      // Need both squads with MERCs and they must be in different but adjacent sectors
      // that share a common adjacent target
      if (player.primarySquad.mercCount === 0 || player.secondarySquad.mercCount === 0) return false;
      if (!player.primarySquad.sectorId || !player.secondarySquad.sectorId) return false;

      // All MERCs in both squads must have actions
      const primaryMercs = player.primarySquad.getMercs();
      const secondaryMercs = player.secondarySquad.getMercs();
      if (!primaryMercs.every(m => m.actionsRemaining >= ACTION_COSTS.MOVE)) return false;
      if (!secondaryMercs.every(m => m.actionsRemaining >= ACTION_COSTS.MOVE)) return false;

      // Check if there's a common adjacent sector they can both reach
      const primarySector = game.getSector(player.primarySquad.sectorId);
      const secondarySector = game.getSector(player.secondarySquad.sectorId);
      if (!primarySector || !secondarySector) return false;

      const primaryAdjacent = game.getAdjacentSectors(primarySector);
      const secondaryAdjacent = game.getAdjacentSectors(secondarySector);

      // Find common targets (sectors adjacent to both squads)
      const commonTargets = primaryAdjacent.filter(s =>
        secondaryAdjacent.some(s2 => s2.sectorId === s.sectorId)
      );

      return commonTargets.length > 0;
    })
    .chooseElement<Sector>('target', {
      prompt: 'Select target sector for coordinated attack',
      elementClass: Sector,
      filter: (element, ctx) => {
        const sector = element as unknown as Sector;
        const player = ctx.player as RebelPlayer;

        const primarySector = game.getSector(player.primarySquad.sectorId!);
        const secondarySector = game.getSector(player.secondarySquad.sectorId!);
        if (!primarySector || !secondarySector) return false;

        const primaryAdjacent = game.getAdjacentSectors(primarySector);
        const secondaryAdjacent = game.getAdjacentSectors(secondarySector);

        // Must be adjacent to both squads
        return primaryAdjacent.some(s => s.sectorId === sector.sectorId) &&
          secondaryAdjacent.some(s => s.sectorId === sector.sectorId);
      },
      boardRef: (element) => ({ id: (element as unknown as Sector).id }),
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const target = args.target as Sector;

      // Spend action from all MERCs in both squads
      const primaryMercs = player.primarySquad.getMercs();
      const secondaryMercs = player.secondarySquad.getMercs();
      for (const merc of [...primaryMercs, ...secondaryMercs]) {
        useAction(merc, ACTION_COSTS.MOVE);
      }

      // Move both squads to target
      player.primarySquad.sectorId = target.sectorId;
      player.secondarySquad.sectorId = target.sectorId;

      const totalMercs = primaryMercs.length + secondaryMercs.length;
      game.message(`${player.name} launches coordinated attack with ${totalMercs} MERC(s) on ${target.sectorName}!`);

      // Check for enemies and trigger combat with combined force
      if (hasEnemies(game, target, player)) {
        game.message(`Combat begins with coordinated rebel forces!`);
        const outcome = executeCombat(game, target, player);
        return {
          success: true,
          message: `Coordinated attack on ${target.sectorName}`,
          data: {
            combatTriggered: true,
            coordinatedAttack: true,
            rebelVictory: outcome.rebelVictory,
            dictatorVictory: outcome.dictatorVictory,
          },
        };
      }

      return { success: true, message: `Both squads moved to ${target.sectorName}` };
    });
}

/**
 * MERC-a2h: Declare Coordinated Attack - Stage a squad for multi-player coordinated attack
 * Per rules (06-merc-actions.md): Squads from different rebel players can attack together
 * This action stages a squad to participate; execute when all participants ready
 * Cost: Free (action spent when attack executes)
 */
export function createDeclareCoordinatedAttackAction(game: MERCGame): ActionDefinition {
  return Action.create('declareCoordinatedAttack')
    .prompt('Declare coordinated attack (stage for multi-player)')
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      // Need at least one squad with MERCs adjacent to an enemy sector
      const hasValidSquad = [player.primarySquad, player.secondarySquad].some(squad => {
        if (squad.mercCount === 0 || !squad.sectorId) return false;
        const sector = game.getSector(squad.sectorId);
        if (!sector) return false;
        // Check if any adjacent sector has enemies
        const adjacent = game.getAdjacentSectors(sector);
        return adjacent.some(s => hasEnemies(game, s, player));
      });
      return hasValidSquad;
    })
    .chooseElement<Squad>('squad', {
      prompt: 'Select squad to stage for coordinated attack',
      elementClass: Squad,
      filter: (element, ctx) => {
        const squad = element as unknown as Squad;
        const player = ctx.player as RebelPlayer;
        if (squad !== player.primarySquad && squad !== player.secondarySquad) return false;
        if (squad.mercCount === 0 || !squad.sectorId) return false;
        // Must have MERCs with actions
        return squad.getMercs().every(m => m.actionsRemaining >= ACTION_COSTS.MOVE);
      },
    })
    .chooseElement<Sector>('target', {
      prompt: 'Select target sector for coordinated attack',
      elementClass: Sector,
      filter: (element, ctx) => {
        const sector = element as unknown as Sector;
        const player = ctx.player as RebelPlayer;
        const squad = ctx.args.squad as Squad;
        if (!squad?.sectorId) return false;
        const currentSector = game.getSector(squad.sectorId);
        if (!currentSector) return false;
        // Must be adjacent and have enemies
        const adjacent = game.getAdjacentSectors(currentSector);
        return adjacent.some(s => s.sectorId === sector.sectorId) && hasEnemies(game, sector, player);
      },
      boardRef: (element) => ({ id: (element as unknown as Sector).id }),
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const squad = args.squad as Squad;
      const target = args.target as Sector;
      const squadType = squad === player.primarySquad ? 'primary' : 'secondary';

      // Declare the coordinated attack
      game.declareCoordinatedAttack(target.sectorId, `${player.position}`, squadType);

      const pending = game.getPendingCoordinatedAttack(target.sectorId);
      game.message(`${player.name}'s ${squadType} squad staged for coordinated attack on ${target.sectorName} (${pending.length} squad(s) ready)`);

      return {
        success: true,
        message: `Staged for coordinated attack`,
        data: { targetSector: target.sectorId, pendingCount: pending.length },
      };
    });
}

/**
 * MERC-a2h: Join Coordinated Attack - Add squad to existing coordinated attack
 * Per rules (06-merc-actions.md): Multiple squads can join a declared attack
 * Cost: Free (action spent when attack executes)
 */
export function createJoinCoordinatedAttackAction(game: MERCGame): ActionDefinition {
  return Action.create('joinCoordinatedAttack')
    .prompt('Join coordinated attack')
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      // Must have pending coordinated attacks that this player can join
      if (game.pendingCoordinatedAttacks.size === 0) return false;

      // Check if player has a squad that can reach any pending attack target
      for (const [targetId] of game.pendingCoordinatedAttacks) {
        const targetSector = game.getSector(targetId);
        if (!targetSector) continue;

        for (const squad of [player.primarySquad, player.secondarySquad]) {
          if (squad.mercCount === 0 || !squad.sectorId) continue;
          const sector = game.getSector(squad.sectorId);
          if (!sector) continue;
          const adjacent = game.getAdjacentSectors(sector);
          if (adjacent.some(s => s.sectorId === targetId)) {
            // Check squad can move
            if (squad.getMercs().every(m => m.actionsRemaining >= ACTION_COSTS.MOVE)) {
              return true;
            }
          }
        }
      }
      return false;
    })
    .chooseFrom<string>('targetAttack', {
      prompt: 'Select coordinated attack to join',
      choices: () => {
        const choices: { label: string; value: string }[] = [];
        for (const [targetId, participants] of game.pendingCoordinatedAttacks) {
          const sector = game.getSector(targetId);
          if (sector) {
            choices.push({
              label: `Attack on ${sector.sectorName} (${participants.length} squad(s) ready)`,
              value: targetId,
            });
          }
        }
        return choices;
      },
    })
    .chooseElement<Squad>('squad', {
      prompt: 'Select squad to join the attack',
      elementClass: Squad,
      filter: (element, ctx) => {
        const squad = element as unknown as Squad;
        const player = ctx.player as RebelPlayer;
        const targetId = ctx.data?.targetAttack as string;
        if (squad !== player.primarySquad && squad !== player.secondarySquad) return false;
        if (squad.mercCount === 0 || !squad.sectorId) return false;

        // Must be adjacent to target
        const sector = game.getSector(squad.sectorId);
        if (!sector) return false;
        const adjacent = game.getAdjacentSectors(sector);
        if (!adjacent.some(s => s.sectorId === targetId)) return false;

        // Must have MERCs with actions
        return squad.getMercs().every(m => m.actionsRemaining >= ACTION_COSTS.MOVE);
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const squad = args.squad as Squad;
      const targetId = args.targetAttack as string;
      const squadType = squad === player.primarySquad ? 'primary' : 'secondary';

      game.declareCoordinatedAttack(targetId, `${player.position}`, squadType);

      const pending = game.getPendingCoordinatedAttack(targetId);
      const target = game.getSector(targetId);
      game.message(`${player.name}'s ${squadType} squad joined coordinated attack on ${target?.sectorName} (${pending.length} squad(s) ready)`);

      return {
        success: true,
        message: `Joined coordinated attack`,
        data: { targetSector: targetId, pendingCount: pending.length },
      };
    });
}

/**
 * MERC-a2h: Execute Coordinated Attack - Launch staged multi-player attack
 * All participating squads move to target and combat begins with all attackers
 * Cost: 1 action per MERC in all participating squads
 */
export function createExecuteCoordinatedAttackAction(game: MERCGame): ActionDefinition {
  return Action.create('executeCoordinatedAttack')
    .prompt('Execute coordinated attack')
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      // Must have a pending coordinated attack with this player participating
      for (const [, participants] of game.pendingCoordinatedAttacks) {
        if (participants.some(p => p.playerId === `${player.position}`)) {
          return true;
        }
      }
      return false;
    })
    .chooseFrom<string>('targetAttack', {
      prompt: 'Select coordinated attack to execute',
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const choices: { label: string; value: string }[] = [];
        for (const [targetId, participants] of game.pendingCoordinatedAttacks) {
          if (participants.some(p => p.playerId === `${player.position}`)) {
            const sector = game.getSector(targetId);
            if (sector) {
              choices.push({
                label: `Attack on ${sector.sectorName} (${participants.length} squad(s))`,
                value: targetId,
              });
            }
          }
        }
        return choices;
      },
    })
    .execute((args, ctx) => {
      const targetId = args.targetAttack as string;
      const target = game.getSector(targetId);
      if (!target) {
        return { success: false, message: 'Target sector not found' };
      }

      const participants = game.getPendingCoordinatedAttack(targetId);
      if (participants.length === 0) {
        return { success: false, message: 'No participants in coordinated attack' };
      }

      // Move all participating squads to target and spend actions
      const allMercs: MercCard[] = [];
      const participantNames: string[] = [];

      for (const { playerId, squadType } of participants) {
        const rebel = game.rebelPlayers.find(r => `${r.position}` === playerId);
        if (!rebel) continue;

        const squad = squadType === 'primary' ? rebel.primarySquad : rebel.secondarySquad;
        const mercs = squad.getMercs();

        // Spend actions and move
        for (const merc of mercs) {
          useAction(merc, ACTION_COSTS.MOVE);
          allMercs.push(merc);
        }
        squad.sectorId = targetId;
        participantNames.push(`${rebel.name} (${mercs.length} MERC${mercs.length > 1 ? 's' : ''})`);
      }

      // Clear the pending attack
      game.clearCoordinatedAttack(targetId);

      game.message(`Coordinated attack launched on ${target.sectorName}! Participants: ${participantNames.join(', ')}`);

      // Trigger combat with all attackers
      // Note: executeCombat handles all rebel MERCs in the sector
      if (hasEnemies(game, target, game.rebelPlayers[0])) {
        game.message(`Combat begins with ${allMercs.length} attacking MERC(s)!`);
        // Combat will include all rebel MERCs now in the sector
        const outcome = executeCombat(game, target, game.rebelPlayers[0]);
        return {
          success: true,
          message: `Coordinated attack executed`,
          data: {
            combatTriggered: true,
            coordinatedAttack: true,
            participantCount: participants.length,
            totalMercs: allMercs.length,
            rebelVictory: outcome.rebelVictory,
            dictatorVictory: outcome.dictatorVictory,
          },
        };
      }

      return {
        success: true,
        message: `All squads moved to ${target.sectorName}`,
        data: { participantCount: participants.length, totalMercs: allMercs.length },
      };
    });
}

/**
 * Explore an unexplored sector
 * Cost: 1 action
 * Per rules (06-merc-actions.md): After exploring, perform a free Re-Equip
 * MERC-gjw: Free re-equip allows equipping multiple items to multiple MERCs
 * MERC-6cu: Free re-equip includes trading between MERCs without action cost
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
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return player.team.includes(merc) && merc.actionsRemaining >= ACTION_COSTS.EXPLORE;
      },
    })
    // MERC-gjw: Free Re-Equip - select multiple equipment items
    .chooseFrom<string>('equipChoices', {
      prompt: 'Free Re-Equip: Select equipment to distribute (multi-select)',
      multiSelect: true,
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const squad = player.primarySquad;
        const sector = game.getSector(squad.sectorId!);
        if (!sector) return [];

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

        // Build choices from stash with indices for unique identification
        const choices: string[] = [];
        for (let i = 0; i < sector.stash.length; i++) {
          const equip = sector.stash[i];
          choices.push(`${i + 1}. ${equip.equipmentName} (${equip.equipmentType})`);
        }
        return choices;
      },
    })
    // For each selected equipment, player assigns to a MERC
    // Using a single assignment field that maps equipment to MERCs
    .chooseFrom<string>('equipAssignments', {
      prompt: 'Assign selected equipment to MERCs (format: MERC name for each item)',
      multiSelect: true,
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const equipChoices = (ctx.data?.equipChoices as string[]) || [];
        if (equipChoices.length === 0) {
          return ['Skip'];
        }
        // Return MERC names as options - user selects one per equipment
        return player.team.map(m => m.mercName);
      },
      skipIf: (ctx) => {
        const equipChoices = (ctx.data?.equipChoices as string[]) || [];
        return equipChoices.length === 0;
      },
    })
    // MERC-6cu: Free trade option - trade equipment between MERCs without action cost
    .chooseFrom<string>('freeTrade', {
      prompt: 'Free Trade: Transfer equipment between MERCs? (no action cost)',
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        // Only offer trade if player has 2+ MERCs and at least one has equipment
        const hasEquippedMercs = player.team.some(m =>
          m.weaponSlot || m.armorSlot || m.accessorySlot
        );
        if (player.teamSize < 2 || !hasEquippedMercs) {
          return [{ label: 'No trades needed', value: 'skip' }];
        }
        return [
          { label: 'Yes, trade equipment', value: 'trade' },
          { label: 'No trades needed', value: 'skip' },
        ];
      },
    })
    // Select MERC giving equipment (for free trade)
    .chooseElement<MercCard>('tradeGiver', {
      prompt: 'Select MERC to give equipment',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return player.team.includes(merc) &&
          (merc.weaponSlot || merc.armorSlot || merc.accessorySlot);
      },
      skipIf: (ctx) => ctx.data?.freeTrade !== 'trade',
    })
    // Select which equipment to trade
    .chooseFrom<string>('tradeEquipment', {
      prompt: 'Which equipment to give?',
      choices: (ctx) => {
        const giver = ctx.args?.tradeGiver as MercCard;
        const choices: string[] = [];
        if (giver?.weaponSlot) choices.push(`Weapon: ${giver.weaponSlot.equipmentName}`);
        if (giver?.armorSlot) choices.push(`Armor: ${giver.armorSlot.equipmentName}`);
        if (giver?.accessorySlot) choices.push(`Accessory: ${giver.accessorySlot.equipmentName}`);
        return choices;
      },
      skipIf: (ctx) => ctx.data?.freeTrade !== 'trade',
    })
    // Select MERC receiving equipment (for free trade)
    .chooseElement<MercCard>('tradeReceiver', {
      prompt: 'Select MERC to receive equipment',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        const giver = ctx.args?.tradeGiver as MercCard;
        return player.team.includes(merc) && merc !== giver;
      },
      skipIf: (ctx) => ctx.data?.freeTrade !== 'trade',
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

      // MERC-gjw: Handle multi-select free re-equip
      const equipChoices = (args.equipChoices as string[]) || [];
      const equipAssignments = (args.equipAssignments as string[]) || [];

      // Process each selected equipment item
      const equipped: string[] = [];
      for (let i = 0; i < equipChoices.length; i++) {
        const choice = equipChoices[i];
        const mercName = equipAssignments[i] || equipAssignments[0]; // Use first MERC if not enough assignments

        if (!mercName || mercName === 'Skip') continue;

        // Parse equipment index from choice (format: "1. EquipName (Type)")
        const equipIndex = parseInt(choice.split('.')[0], 10) - 1;
        if (equipIndex < 0 || equipIndex >= sector.stash.length) continue;

        const equipment = sector.stash[equipIndex];
        const merc = player.team.find(m => m.mercName === mercName);

        if (equipment && merc) {
          // Remove from stash (adjust for already-removed items)
          const currentIdx = sector.stash.indexOf(equipment);
          if (currentIdx >= 0) {
            sector.stash.splice(currentIdx, 1);

            // Equip (may replace existing)
            const replaced = merc.equip(equipment);
            if (replaced) {
              sector.addToStash(replaced);
              game.message(`${merc.mercName} equipped ${equipment.equipmentName}, returned ${replaced.equipmentName} to stash`);
            } else {
              game.message(`${merc.mercName} equipped ${equipment.equipmentName}`);
            }
            equipped.push(`${merc.mercName}: ${equipment.equipmentName}`);
          }
        }
      }

      // MERC-6cu: Handle free trade during exploration (no action cost)
      const freeTrade = args.freeTrade as string;
      let tradeResult = '';
      if (freeTrade === 'trade') {
        const giver = args.tradeGiver as MercCard;
        const receiver = args.tradeReceiver as MercCard;
        const tradeEquipmentStr = args.tradeEquipment as string;

        if (giver && receiver && tradeEquipmentStr) {
          // Determine which slot to trade
          let equipmentToTrade: Equipment | undefined;
          let slot: 'Weapon' | 'Armor' | 'Accessory';

          if (tradeEquipmentStr.startsWith('Weapon:')) {
            equipmentToTrade = giver.weaponSlot;
            slot = 'Weapon';
          } else if (tradeEquipmentStr.startsWith('Armor:')) {
            equipmentToTrade = giver.armorSlot;
            slot = 'Armor';
          } else {
            equipmentToTrade = giver.accessorySlot;
            slot = 'Accessory';
          }

          if (equipmentToTrade) {
            // Remove from giver
            giver.unequip(slot);

            // Give to receiver (may replace their existing equipment)
            const replaced = receiver.equip(equipmentToTrade);
            if (replaced) {
              // Receiver's old equipment goes to stash
              sector.addToStash(replaced);
              tradeResult = `${giver.mercName} gave ${equipmentToTrade.equipmentName} to ${receiver.mercName}, ${replaced.equipmentName} added to stash`;
            } else {
              tradeResult = `${giver.mercName} gave ${equipmentToTrade.equipmentName} to ${receiver.mercName}`;
            }
            game.message(`Free trade: ${tradeResult}`);
          }
        }
      }

      // Clean up cache
      explorationCache.delete(`${player.position}`);

      return {
        success: true,
        message: `Explored ${sector.sectorName}`,
        data: { stashRemaining: sector.stash.length, equipped, tradeResult },
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
      display: (merc) => capitalize(merc.mercName),
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
 * MERC-gu5: Trading requires both MERCs to spend an action
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
      display: (merc) => capitalize(merc.mercName),
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

        // MERC-gu5: Trade option requires another MERC with actions available
        const selectedMerc = ctx.args?.merc as MercCard;
        const hasEquipment = selectedMerc && (selectedMerc.weaponSlot || selectedMerc.armorSlot || selectedMerc.accessorySlot);
        const hasTradeableTeammate = player.team.some(m =>
          m !== selectedMerc && m.actionsRemaining >= ACTION_COSTS.RE_EQUIP
        );
        if (hasEquipment && hasTradeableTeammate) {
          choices.push('Trade with teammate (both spend action)');
        }

        choices.push('Unequip to stash');

        return choices;
      },
    })
    // MERC-gu5: Select trade partner - must have actions remaining
    .chooseElement<MercCard>('tradePartner', {
      prompt: 'Select teammate to trade with (will also spend their action)',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        const selectedMerc = ctx.args?.merc as MercCard;
        // MERC-gu5: Trade partner must also have actions to spend
        return player.team.includes(merc) &&
          merc !== selectedMerc &&
          merc.actionsRemaining >= ACTION_COSTS.RE_EQUIP;
      },
      skipIf: (ctx) => !ctx.data?.action?.startsWith('Trade with teammate'),
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
      skipIf: (ctx) => !ctx.data?.action?.startsWith('Trade with teammate'),
    })
    // MERC-05l: Select which equipment to take from stash
    .chooseFrom<string>('stashEquipment', {
      prompt: 'Select equipment from stash',
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const squad = player.primarySquad;
        const sector = game.getSector(squad.sectorId!);
        if (!sector) return [];
        return sector.stash.map((e, i) => `${i + 1}. ${e.equipmentName} (${e.equipmentType})`);
      },
      skipIf: (ctx) => ctx.data?.action !== 'Take from stash',
    })
    // MERC-5f7: Select which slot to unequip
    .chooseFrom<string>('unequipSlot', {
      prompt: 'Which equipment slot to unequip?',
      choices: (ctx) => {
        const selectedMerc = ctx.args?.merc as MercCard;
        const choices: string[] = [];
        if (selectedMerc?.weaponSlot) choices.push(`Weapon: ${selectedMerc.weaponSlot.equipmentName}`);
        if (selectedMerc?.armorSlot) choices.push(`Armor: ${selectedMerc.armorSlot.equipmentName}`);
        if (selectedMerc?.accessorySlot) choices.push(`Accessory: ${selectedMerc.accessorySlot.equipmentName}`);
        return choices;
      },
      skipIf: (ctx) => ctx.data?.action !== 'Unequip to stash',
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
        // MERC-05l: Use selected equipment from stash
        const stashChoice = args.stashEquipment as string;
        const stashIndex = stashChoice ? parseInt(stashChoice.split('.')[0], 10) - 1 : 0;
        const equipment = sector.takeFromStash(stashIndex);
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
      } else if (action?.startsWith('Trade with teammate')) {
        // MERC-gu5: Both MERCs spend actions for trading
        const tradePartner = args.tradePartner as MercCard;
        const tradeEquipmentStr = args.tradeEquipment as string;

        if (tradePartner && tradeEquipmentStr) {
          // MERC-gu5: Trade partner also spends their action
          useAction(tradePartner, ACTION_COSTS.RE_EQUIP);

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
              game.message(`${merc.mercName} traded ${equipmentToTrade.equipmentName} to ${tradePartner.mercName}, ${replaced.equipmentName} added to stash (both spent action)`);
            } else {
              game.message(`${merc.mercName} traded ${equipmentToTrade.equipmentName} to ${tradePartner.mercName} (both spent action)`);
            }

            return { success: true, message: `Traded ${equipmentToTrade.equipmentName}` };
          }
        }
      } else if (action === 'Unequip to stash') {
        // MERC-5f7: Use selected slot to unequip
        const unequipChoice = args.unequipSlot as string;
        let slot: 'Weapon' | 'Armor' | 'Accessory' = 'Weapon';
        if (unequipChoice?.startsWith('Armor:')) {
          slot = 'Armor';
        } else if (unequipChoice?.startsWith('Accessory:')) {
          slot = 'Accessory';
        }

        const unequipped = merc.unequip(slot);
        if (unequipped) {
          sector.addToStash(unequipped);
          game.message(`${merc.mercName} unequipped ${unequipped.equipmentName}`);
          return { success: true, message: `Unequipped ${unequipped.equipmentName}` };
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
      display: (merc) => capitalize(merc.mercName),
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
 * MERC-dh5: Includes free re-equip option per rules
 */
export function createArmsDealerAction(game: MERCGame): ActionDefinition {
  // Cache drawn equipment for the free re-equip choice
  const drawnEquipmentCache = new Map<string, Equipment>();

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
      display: (merc) => capitalize(merc.mercName),
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
    // MERC-dh5: Free re-equip - choose MERC to equip the purchased item
    .chooseFrom<string>('equipMerc', {
      prompt: 'Free Re-Equip: Which MERC should equip this item? (or skip)',
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const equipmentType = ctx.data?.equipmentType as 'Weapon' | 'Armor' | 'Accessory';
        const cacheKey = `${player.position}`;

        // Draw equipment now so we can show what was bought
        if (!drawnEquipmentCache.has(cacheKey)) {
          const equipment = game.drawEquipment(equipmentType);
          if (equipment) {
            drawnEquipmentCache.set(cacheKey, equipment);
            game.message(`Drew ${equipment.equipmentName} from ${equipmentType} deck`);
          }
        }

        const choices = player.team.map(m => ({
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
      const cacheKey = `${player.position}`;
      const squad = player.primarySquad;
      const sector = game.getSector(squad.sectorId!);

      // Spend action
      useAction(actingMerc, ACTION_COSTS.ARMS_DEALER);

      const equipment = drawnEquipmentCache.get(cacheKey);
      drawnEquipmentCache.delete(cacheKey);

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
      display: (merc) => capitalize(merc.mercName),
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
      display: (merc) => capitalize(merc.mercName),
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
    .condition((ctx) => {
      const player = ctx.player as RebelPlayer;
      // Only show end turn if player has MERCs with actions remaining
      // This prevents the flow from auto-ending when no actions are taken
      return player.team.some(m => m.actionsRemaining > 0);
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
      prompt: 'Select your FIRST MERC to hire',
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const playerId = `${player.position}`;

        // Draw MERCs only once per player
        if (!drawnMercsCache.has(playerId)) {
          drawnMercsCache.set(playerId, drawMercsForHiring(game, 3));
        }
        const available = drawnMercsCache.get(playerId) || [];

        if (available.length === 0) {
          return ['No MERCs available'];
        }
        return available.map((m) => capitalize(m.mercName));
      },
    })
    .chooseFrom<string>('secondMerc', {
      prompt: 'Select your SECOND MERC to hire',
      choices: (ctx) => {
        const player = ctx.player as RebelPlayer;
        const playerId = `${player.position}`;
        const available = drawnMercsCache.get(playerId) || [];

        if (available.length === 0) {
          return ['No MERCs available'];
        }
        // Show all choices - validation happens in execute
        return available.map((m) => capitalize(m.mercName));
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const playerId = `${player.position}`;
      const available = drawnMercsCache.get(playerId) || [];

      if (available.length === 0) {
        return { success: false, message: 'No MERCs available in deck' };
      }

      const firstName = args.firstMerc as string;
      const secondName = args.secondMerc as string;

      if (!firstName || !secondName || firstName === 'No MERCs available' || secondName === 'No MERCs available') {
        return { success: false, message: 'No MERCs available in deck' };
      }

      // Validate different MERCs selected
      if (firstName === secondName) {
        return { success: false, message: 'Please select two different MERCs' };
      }

      // Find MERCs by capitalized name
      const firstMerc = available.find(m => capitalize(m.mercName) === firstName);
      const secondMerc = available.find(m => capitalize(m.mercName) === secondName);

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
      display: (merc) => capitalize(merc.mercName),
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

// MERC-07j: Type for units that can perform dictator actions (hired MERCs or dictator card)
// Note: Defined here for move action, also used by train/re-equip below
type DictatorUnit = MercCard | DictatorCard;

function getDictatorUnitName(unit: DictatorUnit): string {
  if (unit instanceof DictatorCard) {
    return unit.dictatorName;
  }
  return unit.mercName;
}

function canDictatorUnitMove(unit: DictatorUnit): boolean {
  return unit.actionsRemaining >= ACTION_COSTS.MOVE && !!unit.sectorId;
}

/**
 * Dictator MERC move action
 * MERC-07j: Now includes dictator card when in play
 */
export function createDictatorMoveAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorMove')
    .prompt('Move Dictator unit')
    .condition((ctx) => {
      // Only the dictator player can move dictator MERCs
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      // Check if any dictator MERC has actions and a valid location
      const mercs = game.dictatorPlayer?.hiredMercs || [];
      const dictator = game.dictatorPlayer?.dictator;

      const mercCanMove = mercs.some(m => canDictatorUnitMove(m));
      // MERC-07j: Check if dictator card can move
      const dictatorCanMove = dictator?.inPlay && canDictatorUnitMove(dictator);

      return mercCanMove || dictatorCanMove;
    })
    .chooseElement<DictatorUnit>('merc', {
      prompt: 'Select unit to move',
      display: (unit) => capitalize(getDictatorUnitName(unit)),
      filter: (element) => {
        // MERC-07j: Check if element is a valid dictator unit
        if (element instanceof MercCard) {
          const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
          return dictatorMercs.includes(element) && canDictatorUnitMove(element);
        }
        if (element instanceof DictatorCard) {
          if (!element.inPlay) return false;
          if (element !== game.dictatorPlayer?.dictator) return false;
          return canDictatorUnitMove(element);
        }
        return false;
      },
    })
    .chooseElement<Sector>('destination', {
      prompt: 'Select destination sector',
      elementClass: Sector,
      filter: (element, ctx) => {
        const sector = element as unknown as Sector;
        const unit = ctx.args.merc as DictatorUnit;
        // Use the unit's current sector for adjacency check
        if (!unit?.sectorId) return false;
        const currentSector = game.getSector(unit.sectorId);
        if (!currentSector) return false;
        const adjacent = game.getAdjacentSectors(currentSector);
        return adjacent.some(s => s.sectorId === sector.sectorId);
      },
    })
    .execute((args) => {
      const unit = args.merc as DictatorUnit;
      const destination = args.destination as Sector;

      unit.useAction(ACTION_COSTS.MOVE);
      // Update unit's location
      unit.sectorId = destination.sectorId;
      game.message(`${getDictatorUnitName(unit)} moved to ${destination.sectorName}`);

      // MERC-pcf: Per rules "Combat triggers when: An enemy moves into your sector"
      // Check if any rebel has units at destination and trigger combat
      for (const rebel of game.rebelPlayers) {
        const hasSquad = rebel.primarySquad.sectorId === destination.sectorId ||
          rebel.secondarySquad.sectorId === destination.sectorId;
        const hasMilitia = destination.getRebelMilitia(`${rebel.position}`) > 0;

        if (hasSquad || hasMilitia) {
          game.message(`Rebels detected at ${destination.sectorName} - combat begins!`);
          const outcome = executeCombat(game, destination, rebel);
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
      }

      return { success: true, message: `Moved to ${destination.sectorName}` };
    });
}

function canDictatorUnitExplore(unit: DictatorUnit, game: MERCGame): boolean {
  if (unit.actionsRemaining < ACTION_COSTS.EXPLORE || !unit.sectorId) return false;
  const sector = game.getSector(unit.sectorId);
  return sector !== undefined && !sector.explored;
}

/**
 * Dictator MERC explore action
 * MERC-07j: Now includes dictator card when in play
 */
export function createDictatorExploreAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorExplore')
    .prompt('Explore with Dictator unit')
    .condition((ctx) => {
      // Only the dictator player can use dictator MERC actions
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      const mercs = game.dictatorPlayer?.hiredMercs || [];
      const dictator = game.dictatorPlayer?.dictator;

      // Check if any MERC has actions and is at an unexplored sector
      const mercCanExplore = mercs.some(m => canDictatorUnitExplore(m, game));

      // MERC-07j: Check if dictator card can explore
      const dictatorCanExplore = dictator?.inPlay && canDictatorUnitExplore(dictator, game);

      return mercCanExplore || dictatorCanExplore;
    })
    .chooseElement<DictatorUnit>('merc', {
      prompt: 'Select unit to explore',
      display: (unit) => capitalize(getDictatorUnitName(unit)),
      filter: (element) => {
        // MERC-07j: Check if element is a valid dictator unit
        if (element instanceof MercCard) {
          const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
          if (!dictatorMercs.includes(element)) return false;
          return canDictatorUnitExplore(element, game);
        }
        if (element instanceof DictatorCard) {
          if (!element.inPlay) return false;
          if (element !== game.dictatorPlayer?.dictator) return false;
          return canDictatorUnitExplore(element, game);
        }
        return false;
      },
    })
    .execute((args) => {
      const unit = args.merc as DictatorUnit;
      const sector = game.getSector(unit.sectorId!);

      if (!sector || sector.explored) {
        return { success: false, message: 'Cannot explore' };
      }

      unit.useAction(ACTION_COSTS.EXPLORE);
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

      game.message(`${getDictatorUnitName(unit)} explored ${sector.sectorName}, found ${drawnEquipment.length} equipment`);

      // MERC-0dp: Auto-equip dictator units according to AI rules
      if (drawnEquipment.length > 0) {
        const equipped = autoEquipDictatorUnits(game, sector);
        if (equipped > 0) {
          game.message(`Dictator auto-equipped ${equipped} item(s)`);
        }
      }

      return { success: true, message: `Explored ${sector.sectorName}` };
    });
}

function canDictatorUnitTrain(unit: DictatorUnit, game: MERCGame): boolean {
  if (unit.training <= 0 || unit.actionsRemaining < ACTION_COSTS.TRAIN || !unit.sectorId) return false;
  const sector = game.getSector(unit.sectorId);
  return sector !== undefined && sector.dictatorMilitia < SectorConstants.MAX_MILITIA_PER_SIDE;
}

/**
 * Dictator MERC train militia action
 * MERC-3hf: Added militia cap check to match rebel train action
 * MERC-07j: Now includes dictator card when in play
 */
export function createDictatorTrainAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorTrain')
    .prompt('Train militia with Dictator unit')
    .condition((ctx) => {
      // Only the dictator player can use dictator MERC actions
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      const mercs = game.dictatorPlayer?.hiredMercs || [];
      const dictator = game.dictatorPlayer?.dictator;

      // MERC-3hf: Check if any MERC can train (has training, actions, and sector not at max militia)
      const mercCanTrain = mercs.some(m => canDictatorUnitTrain(m, game));

      // MERC-07j: Check if dictator card can train
      const dictatorCanTrain = dictator?.inPlay && canDictatorUnitTrain(dictator, game);

      return mercCanTrain || dictatorCanTrain;
    })
    .chooseElement<DictatorUnit>('merc', {
      prompt: 'Select unit to train',
      display: (unit) => capitalize(getDictatorUnitName(unit)),
      filter: (element) => {
        // MERC-07j: Check if element is a valid dictator unit
        if (element instanceof MercCard) {
          const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
          if (!dictatorMercs.includes(element)) return false;
          return canDictatorUnitTrain(element, game);
        }
        if (element instanceof DictatorCard) {
          if (!element.inPlay) return false;
          if (element !== game.dictatorPlayer?.dictator) return false;
          return canDictatorUnitTrain(element, game);
        }
        return false;
      },
    })
    .execute((args) => {
      const unit = args.merc as DictatorUnit;
      const sector = game.getSector(unit.sectorId!);

      if (!sector) {
        return { success: false, message: 'No sector found' };
      }

      unit.useAction(ACTION_COSTS.TRAIN);
      const trained = sector.addDictatorMilitia(unit.training);
      game.message(`${getDictatorUnitName(unit)} trained ${trained} militia at ${sector.sectorName}`);

      return { success: true, message: `Trained ${trained} militia` };
    });
}

// MERC-07j: Helper to check if a dictator unit can re-equip
function canDictatorUnitReEquip(unit: DictatorUnit, game: MERCGame): boolean {
  if (unit.actionsRemaining < ACTION_COSTS.RE_EQUIP || !unit.sectorId) return false;
  const sector = game.getSector(unit.sectorId);
  return sector !== undefined && sector.stash.length > 0;
}

/**
 * Dictator MERC re-equip action
 * MERC-07j: Now includes dictator card when in play
 */
export function createDictatorReEquipAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorReEquip')
    .prompt('Re-equip Dictator unit')
    .condition((ctx) => {
      // Only the dictator player can use dictator MERC actions
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      const mercs = game.dictatorPlayer?.hiredMercs || [];
      const dictator = game.dictatorPlayer?.dictator;

      // Check if any MERC has actions and is at a sector with equipment
      const mercCanReEquip = mercs.some(m => canDictatorUnitReEquip(m, game));

      // MERC-07j: Check if dictator card can re-equip
      const dictatorCanReEquip = dictator?.inPlay && canDictatorUnitReEquip(dictator, game);

      return mercCanReEquip || dictatorCanReEquip;
    })
    .chooseElement<DictatorUnit>('merc', {
      prompt: 'Select unit to re-equip',
      display: (unit) => capitalize(getDictatorUnitName(unit)),
      filter: (element) => {
        // MERC-07j: Check if element is a valid dictator unit
        if (element instanceof MercCard) {
          const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
          if (!dictatorMercs.includes(element)) return false;
          return canDictatorUnitReEquip(element, game);
        }
        if (element instanceof DictatorCard) {
          if (!element.inPlay) return false;
          if (element !== game.dictatorPlayer?.dictator) return false;
          return canDictatorUnitReEquip(element, game);
        }
        return false;
      },
    })
    .chooseElement<Equipment>('equipment', {
      prompt: 'Select equipment from stash',
      elementClass: Equipment,
      filter: (element, ctx) => {
        const equipment = element as unknown as Equipment;
        const unit = ctx.args.merc as DictatorUnit;
        if (!unit?.sectorId) return false;
        const sector = game.getSector(unit.sectorId);
        return sector?.stash.includes(equipment) ?? false;
      },
    })
    .execute((args) => {
      const unit = args.merc as DictatorUnit;
      const equipment = args.equipment as Equipment;
      const sector = game.getSector(unit.sectorId!);

      if (!sector) {
        return { success: false, message: 'No sector found' };
      }

      unit.useAction(ACTION_COSTS.RE_EQUIP);

      // Unequip current item of same type if any
      const currentEquipment = unit.getEquipmentOfType(equipment.equipmentType);
      if (currentEquipment) {
        // Fix: unequip takes EquipmentType, not Equipment
        unit.unequip(equipment.equipmentType);
        sector.addToStash(currentEquipment);
      }

      // Equip new item
      const stashIdx = sector.stash.indexOf(equipment);
      if (stashIdx >= 0) {
        sector.takeFromStash(stashIdx);
      }
      unit.equip(equipment);

      game.message(`${getDictatorUnitName(unit)} equipped ${equipment.equipmentName}`);
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
// MERC-n1f: Interactive Combat Actions
// =============================================================================

/**
 * Continue fighting in active combat
 */
export function createCombatContinueAction(game: MERCGame): ActionDefinition {
  return Action.create('combatContinue')
    .prompt('Continue fighting')
    .condition(() => game.activeCombat !== null)
    .execute((_, ctx) => {
      if (!game.activeCombat) {
        return { success: false, message: 'No active combat' };
      }

      const sector = game.getSector(game.activeCombat.sectorId);
      if (!sector) {
        return { success: false, message: 'Combat sector not found' };
      }

      const player = ctx.player as RebelPlayer;
      const outcome = executeCombat(game, sector, player);

      return {
        success: true,
        message: outcome.combatPending
          ? 'Combat continues - choose to retreat or continue'
          : outcome.rebelVictory
          ? 'Victory!'
          : 'Combat complete',
        data: {
          rebelVictory: outcome.rebelVictory,
          dictatorVictory: outcome.dictatorVictory,
          combatPending: outcome.combatPending,
        },
      };
    });
}

/**
 * Retreat from active combat
 */
export function createCombatRetreatAction(game: MERCGame): ActionDefinition {
  return Action.create('combatRetreat')
    .prompt('Retreat from combat')
    .condition(() => game.activeCombat !== null)
    .chooseElement<Sector>('retreatSector', {
      prompt: 'Choose sector to retreat to',
      elementClass: Sector,
      filter: (element) => {
        if (!game.activeCombat) return false;
        const sector = element as unknown as Sector;
        const combatSector = game.getSector(game.activeCombat.sectorId);
        if (!combatSector) return false;
        const player = game.rebelPlayers.find(
          p => `${p.position}` === game.activeCombat!.attackingPlayerId
        );
        if (!player) return false;
        const validSectors = getValidRetreatSectors(game, combatSector, player);
        return validSectors.some(s => s.sectorId === sector.sectorId);
      },
      boardRef: (element) => ({ id: (element as unknown as Sector).id }),
    })
    .execute((args) => {
      const retreatSector = args.retreatSector as Sector;
      const outcome = executeCombatRetreat(game, retreatSector);

      return {
        success: true,
        message: `Retreated to ${retreatSector.sectorName}`,
        data: {
          retreated: true,
          retreatSector: retreatSector.sectorName,
        },
      };
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
  game.registerAction(createCoordinatedAttackAction(game)); // MERC-wrq: Same-player coordinated attack
  game.registerAction(createDeclareCoordinatedAttackAction(game)); // MERC-a2h: Multi-player coordinated attack
  game.registerAction(createJoinCoordinatedAttackAction(game)); // MERC-a2h
  game.registerAction(createExecuteCoordinatedAttackAction(game)); // MERC-a2h
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

  // MERC-n1f: Combat actions
  game.registerAction(createCombatContinueAction(game));
  game.registerAction(createCombatRetreatAction(game));

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
