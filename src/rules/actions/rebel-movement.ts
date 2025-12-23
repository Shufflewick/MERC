/**
 * Rebel Movement Actions
 *
 * Actions for squad movement, coordinated attacks, and squad management.
 * - move: Move a squad to an adjacent sector
 * - coordinatedAttack: Move both squads to attack the same sector
 * - declareCoordinatedAttack: Stage a squad for multi-player attack
 * - joinCoordinatedAttack: Join an existing coordinated attack
 * - executeCoordinatedAttack: Execute the staged attack
 * - splitSquad: Split a MERC into secondary squad
 * - mergeSquads: Merge secondary squad back into primary
 */

import { Action, type ActionDefinition } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer } from '../game.js';
import { MercCard, Sector, Squad } from '../elements.js';
import { executeCombat, hasEnemies } from '../combat.js';
import { ACTION_COSTS, useAction, capitalize } from './helpers.js';

/**
 * Move a squad to an adjacent sector
 * Cost: 1 action per MERC in squad
 */
export function createMoveAction(game: MERCGame): ActionDefinition {
  return Action.create('move')
    .prompt('Move your squad')
    .condition((ctx) => {
      // Cannot move during combat
      if (game.activeCombat) return false;
      // Only rebels can use move action (dictator uses dictatorMove)
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;

      // Check if any squad has MERCs that can all move
      const canSquadMove = (squad: Squad | null | undefined): boolean => {
        if (!squad?.sectorId) return false;
        // Use living mercs - dead mercs can't move
        const mercs = squad.getLivingMercs();
        return mercs.length > 0 && mercs.every(m => m.actionsRemaining >= ACTION_COSTS.MOVE);
      };

      return canSquadMove(player.primarySquad) || canSquadMove(player.secondarySquad);
    })
    .chooseElement<Squad>('squad', {
      prompt: 'Select squad to move',
      elementClass: Squad,
      display: (squad) => squad.isPrimary ? 'Primary Squad' : 'Secondary Squad',
      filter: (element, ctx) => {
        // Safety check - only rebels have squads
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const squad = element as unknown as Squad;
        const player = ctx.player as RebelPlayer;
        // Use name comparison instead of object reference (getters return different instances)
        const isPlayerSquad = squad.name === player.primarySquadRef || squad.name === player.secondarySquadRef;
        if (!isPlayerSquad) return false;
        if (!squad.sectorId) return false;
        // All living MERCs in squad must have actions (dead mercs don't move)
        const mercs = squad.getLivingMercs();
        return mercs.length > 0 && mercs.every(m => m.actionsRemaining >= ACTION_COSTS.MOVE);
      },
    })
    .chooseElement<Sector>('destination', {
      prompt: 'Select destination sector',
      elementClass: Sector,
      filter: (element, ctx) => {
        const sector = element as unknown as Sector;
        const selectedSquad = ctx.args?.squad as Squad | undefined;

        // If a squad has been selected, only show adjacent sectors to that squad
        if (selectedSquad?.sectorId) {
          const currentSector = game.getSector(selectedSquad.sectorId);
          if (!currentSector) return false;
          const adjacent = game.getAdjacentSectors(currentSector);
          return adjacent.some(s => s.sectorId === sector.sectorId);
        }

        // No squad selected yet (availability check phase)
        // Check if this sector would be valid for ANY movable squad
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const player = ctx.player as RebelPlayer;

        const isAdjacentToMovableSquad = (squad: Squad | null | undefined): boolean => {
          if (!squad?.sectorId) return false;
          // Use living mercs - dead mercs don't affect movement
          const mercs = squad.getLivingMercs();
          if (mercs.length === 0 || !mercs.every(m => m.actionsRemaining >= ACTION_COSTS.MOVE)) return false;
          const squadSector = game.getSector(squad.sectorId);
          if (!squadSector) return false;
          const adjacent = game.getAdjacentSectors(squadSector);
          return adjacent.some(s => s.sectorId === sector.sectorId);
        };

        return isAdjacentToMovableSquad(player.primarySquad) || isAdjacentToMovableSquad(player.secondarySquad);
      },
      boardRef: (element) => ({ id: (element as unknown as Sector).id }),
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const squad = args.squad as Squad;
      const destination = args.destination as Sector;
      const sourceSector = game.getSector(squad.sectorId!);

      // Spend action from each living MERC in squad
      const mercs = squad.getLivingMercs();
      for (const merc of mercs) {
        useAction(merc, ACTION_COSTS.MOVE);
      }

      // MERC-iz7: Sonia can bring up to 2 militia when moving
      let militiaMoved = 0;
      if (sourceSector) {
        const hasSonia = mercs.some(m => m.mercId === 'sonia');
        if (hasSonia) {
          const playerId = `${player.position}`;
          const militiaAvailable = sourceSector.getRebelMilitia(playerId);
          militiaMoved = Math.min(2, militiaAvailable);
          if (militiaMoved > 0) {
            sourceSector.removeRebelMilitia(playerId, militiaMoved);
            destination.addRebelMilitia(playerId, militiaMoved);
            game.message(`Sonia brings ${militiaMoved} militia along`);
          }
        }
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
      // Only rebels can use coordinated attack
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      // Need both squads with MERCs and they must be in different but adjacent sectors
      // that share a common adjacent target
      if (player.primarySquad.mercCount === 0 || player.secondarySquad.mercCount === 0) return false;
      if (!player.primarySquad.sectorId || !player.secondarySquad.sectorId) return false;

      // All living MERCs in both squads must have actions
      const primaryMercs = player.primarySquad.getLivingMercs();
      const secondaryMercs = player.secondarySquad.getLivingMercs();
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
        // Safety check - only rebels have squads
        if (!game.isRebelPlayer(ctx.player as any)) return false;
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

      // Spend action from all living MERCs in both squads
      const primaryMercs = player.primarySquad.getLivingMercs();
      const secondaryMercs = player.secondarySquad.getLivingMercs();
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
      // Only rebels can declare coordinated attacks
      if (!game.isRebelPlayer(ctx.player as any)) return false;
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
        // Safety check - only rebels have squads
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const squad = element as unknown as Squad;
        const player = ctx.player as RebelPlayer;
        // Use name comparison instead of object reference
        const isPlayerSquad = squad.name === player.primarySquadRef || squad.name === player.secondarySquadRef;
        if (!isPlayerSquad) return false;
        if (squad.livingMercCount === 0 || !squad.sectorId) return false;
        // Must have living MERCs with actions
        return squad.getLivingMercs().every(m => m.actionsRemaining >= ACTION_COSTS.MOVE);
      },
    })
    .chooseElement<Sector>('target', {
      prompt: 'Select target sector for coordinated attack',
      elementClass: Sector,
      filter: (element, ctx) => {
        // Safety check - only rebels can declare coordinated attacks
        if (!game.isRebelPlayer(ctx.player as any)) return false;
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
      const squadType = squad.name === player.primarySquadRef ? 'primary' : 'secondary';

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
      // Only rebels can join coordinated attacks
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      // Must have pending coordinated attacks that this player can join
      if (game.pendingCoordinatedAttacks.size === 0) return false;

      // Check if player has a squad that can reach any pending attack target
      for (const [targetId] of game.pendingCoordinatedAttacks) {
        const targetSector = game.getSector(targetId);
        if (!targetSector) continue;

        for (const squad of [player.primarySquad, player.secondarySquad]) {
          if (squad.livingMercCount === 0 || !squad.sectorId) continue;
          const sector = game.getSector(squad.sectorId);
          if (!sector) continue;
          const adjacent = game.getAdjacentSectors(sector);
          if (adjacent.some(s => s.sectorId === targetId)) {
            // Check squad can move (living mercs only)
            if (squad.getLivingMercs().every(m => m.actionsRemaining >= ACTION_COSTS.MOVE)) {
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
        // Safety check - only rebels have squads
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const squad = element as unknown as Squad;
        const player = ctx.player as RebelPlayer;
        const targetId = ctx.data?.targetAttack as string;
        // Use name comparison instead of object reference
        const isPlayerSquad = squad.name === player.primarySquadRef || squad.name === player.secondarySquadRef;
        if (!isPlayerSquad) return false;
        if (squad.livingMercCount === 0 || !squad.sectorId) return false;

        // Must be adjacent to target
        const sector = game.getSector(squad.sectorId);
        if (!sector) return false;
        const adjacent = game.getAdjacentSectors(sector);
        if (!adjacent.some(s => s.sectorId === targetId)) return false;

        // Must have living MERCs with actions
        return squad.getLivingMercs().every(m => m.actionsRemaining >= ACTION_COSTS.MOVE);
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const squad = args.squad as Squad;
      const targetId = args.targetAttack as string;
      const squadType = squad.name === player.primarySquadRef ? 'primary' : 'secondary';

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
      // Only rebels can execute coordinated attacks
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      // Must have pending coordinated attacks
      return game.pendingCoordinatedAttacks.size > 0;
    })
    .chooseFrom<string>('targetAttack', {
      prompt: 'Select coordinated attack to execute',
      choices: () => {
        const choices: { label: string; value: string }[] = [];
        for (const [targetId, participants] of game.pendingCoordinatedAttacks) {
          const sector = game.getSector(targetId);
          if (sector) {
            choices.push({
              label: `Execute attack on ${sector.sectorName} (${participants.length} squad(s))`,
              value: targetId,
            });
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
        return { success: false, message: 'No squads staged for attack' };
      }

      // Move all participating squads and spend actions
      let totalMercs = 0;
      for (const { playerId, squadType } of participants) {
        const rebel = game.rebelPlayers.find(p => `${p.position}` === playerId);
        if (!rebel) continue;

        const squad = squadType === 'primary' ? rebel.primarySquad : rebel.secondarySquad;
        const mercs = squad.getLivingMercs();

        for (const merc of mercs) {
          useAction(merc, ACTION_COSTS.MOVE);
        }

        squad.sectorId = target.sectorId;
        totalMercs += mercs.length;
      }

      // Clear pending attack
      game.clearPendingCoordinatedAttack(targetId);

      game.message(`Coordinated attack launched on ${target.sectorName} with ${totalMercs} MERC(s)!`);

      // Trigger combat - use first participant's player for context
      const firstRebel = game.rebelPlayers.find(p => `${p.position}` === participants[0].playerId);
      if (firstRebel && hasEnemies(game, target, firstRebel)) {
        const outcome = executeCombat(game, target, firstRebel);
        return {
          success: true,
          message: `Coordinated attack executed`,
          data: {
            combatTriggered: true,
            participantCount: participants.length,
            rebelVictory: outcome.rebelVictory,
            dictatorVictory: outcome.dictatorVictory,
          },
        };
      }

      return {
        success: true,
        message: `Coordinated attack - sector secured`,
        data: { participantCount: participants.length },
      };
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
      // Cannot split squad during combat
      if (game.activeCombat) return false;
      // Only rebels can split squads
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      // Must have at least 2 MERCs in primary and empty secondary
      return player.primarySquad.mercCount > 1 && player.secondarySquad.mercCount === 0;
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to split off into secondary squad',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        // Safety check - only rebels have squads
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        // Only MERCs in primary squad can be split off
        return player.getSquadContaining(merc) === player.primarySquad;
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
      // Cannot merge squads during combat
      if (game.activeCombat) return false;
      // Only rebels can merge squads
      if (!game.isRebelPlayer(ctx.player as any)) return false;
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
