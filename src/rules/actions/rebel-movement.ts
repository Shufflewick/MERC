/**
 * Movement Actions
 *
 * Actions for squad movement, coordinated attacks, and squad management.
 * Works for both rebel and dictator players.
 * - move: Move a squad to an adjacent sector
 * - coordinatedAttack: Move both squads to attack the same sector (rebel only)
 * - declareCoordinatedAttack: Stage a squad for multi-player attack (rebel only)
 * - joinCoordinatedAttack: Join an existing coordinated attack (rebel only)
 * - executeCoordinatedAttack: Execute the staged attack (rebel only)
 * - splitSquad: Split a MERC into secondary squad (rebel only)
 * - mergeSquads: Merge secondary squad back into primary (rebel only)
 */

import { Action, type ActionDefinition, dependentFilter } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer, DictatorPlayer } from '../game.js';
import { MercCard, Sector, Squad } from '../elements.js';
import { hasEnemies, executeCombat } from '../combat.js';
import { ACTION_COSTS, useAction, capitalize, asSquad, asSector, asMercCard, asRebelPlayer } from './helpers.js';

// =============================================================================
// Move Action Helpers (work for both player types)
// =============================================================================

// Helper to get squads that can move for any player type
function getMovableSquads(player: unknown, game: MERCGame): Squad[] {
  const squads: Squad[] = [];

  if (game.isRebelPlayer(player)) {
    // Type guard narrowed player to RebelPlayer
    if (canSquadMove(player.primarySquad)) squads.push(player.primarySquad);
    if (canSquadMove(player.secondarySquad)) squads.push(player.secondarySquad);
  } else if (game.isDictatorPlayer(player) && game.dictatorPlayer) {
    const dictator = game.dictatorPlayer;
    try {
      if (canSquadMove(dictator.primarySquad)) squads.push(dictator.primarySquad);
    } catch { /* not initialized */ }
    try {
      if (canSquadMove(dictator.secondarySquad)) squads.push(dictator.secondarySquad);
    } catch { /* not initialized */ }
  }

  return squads;
}

// Helper to check if a squad can move
function canSquadMove(squad: Squad | null | undefined): boolean {
  if (!squad?.sectorId) return false;
  const mercs = squad.getLivingMercs();
  return mercs.length > 0 && mercs.every(m => m.actionsRemaining >= ACTION_COSTS.MOVE);
}

// Helper to check if squad belongs to player
function isSquadOwnedByPlayer(squad: Squad, player: unknown, game: MERCGame): boolean {
  if (game.isRebelPlayer(player)) {
    // Type guard narrowed player to RebelPlayer
    return squad.name === player.primarySquadRef || squad.name === player.secondarySquadRef;
  }
  if (game.isDictatorPlayer(player) && game.dictatorPlayer) {
    const dictator = game.dictatorPlayer;
    try {
      if (squad.name === dictator.primarySquad?.name) return true;
    } catch { /* not initialized */ }
    try {
      if (squad.name === dictator.secondarySquad?.name) return true;
    } catch { /* not initialized */ }
  }
  return false;
}

// Helper to check if sector is adjacent to any movable squad
function isAdjacentToMovableSquad(sector: Sector, player: unknown, game: MERCGame): boolean {
  const movableSquads = getMovableSquads(player, game);
  for (const squad of movableSquads) {
    if (!squad.sectorId) continue;
    const squadSector = game.getSector(squad.sectorId);
    if (!squadSector) continue;
    const adjacent = game.getAdjacentSectors(squadSector);
    if (adjacent.some(s => s.sectorId === sector.sectorId)) return true;
  }
  return false;
}

/**
 * Move a squad to an adjacent sector
 * Cost: 1 action per MERC in squad
 * Works for both rebel and dictator players.
 */
export function createMoveAction(game: MERCGame): ActionDefinition {
  return Action.create('move')
    .prompt('Move')
    .condition((ctx) => {
      // Cannot move during combat
      if (game.activeCombat) return false;

      // Must be rebel or dictator player
      const isRebel = game.isRebelPlayer(ctx.player);
      const isDictator = game.isDictatorPlayer(ctx.player);
      if (!isRebel && !isDictator) return false;

      // Check if any squad can move
      return getMovableSquads(ctx.player, game).length > 0;
    })
    .chooseElement<Squad>('squad', {
      prompt: 'Select squad to move',
      elementClass: Squad,
      display: (squad) => squad.isPrimary ? 'Primary Squad' : 'Secondary Squad',
      filter: (element, ctx) => {
        const squad = asSquad(element);
        // Must be player's squad and able to move
        if (!isSquadOwnedByPlayer(squad, ctx.player, game)) return false;
        return canSquadMove(squad);
      },
    })
    .chooseElement<Sector>('destination', {
      prompt: 'Select destination sector',
      elementClass: Sector,
      filter: dependentFilter<Sector, Squad>({
        dependsOn: 'squad',
        // Availability check: sector valid for ANY movable squad
        whenUndefined: (sector, ctx) => {
          return isAdjacentToMovableSquad(sector, ctx.player, game);
        },
        // Selection made: sector must be adjacent to selected squad
        whenSelected: (sector, selectedSquad) => {
          if (!selectedSquad?.sectorId) return false;
          const currentSector = game.getSector(selectedSquad.sectorId);
          if (!currentSector) return false;
          const adjacent = game.getAdjacentSectors(currentSector);
          return adjacent.some(s => s.sectorId === sector.sectorId);
        },
      }),
      boardRef: (element) => ({ id: asSector(element).id }),
    })
    .execute((args, ctx) => {
      const squad = asSquad(args.squad);
      const destination = asSector(args.destination);
      const sourceSector = game.getSector(squad.sectorId!);
      const isRebel = game.isRebelPlayer(ctx.player);

      // Spend action from each living MERC in squad
      const mercs = squad.getLivingMercs();
      for (const merc of mercs) {
        useAction(merc, ACTION_COSTS.MOVE);
      }

      // Log action consumption for debugging
      game.message(`(${mercs.length} action(s) consumed)`);

      // MERC-iz7: Sonia can bring up to 2 militia when moving (rebel only)
      let militiaMoved = 0;
      if (isRebel && sourceSector) {
        const player = asRebelPlayer(ctx.player);
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
      // Sync individual MERC sectorIds for consistency with map display
      for (const merc of squad.getMercs()) {
        merc.sectorId = destination.sectorId;
      }

      // MERC-dict-move: If dictator player is moving and DictatorCard is in the same sector as this squad, move it too
      if (!isRebel && game.dictatorPlayer?.dictator?.inPlay) {
        const dictatorCard = game.dictatorPlayer.dictator;
        if (dictatorCard.sectorId === sourceSector?.sectorId) {
          dictatorCard.sectorId = destination.sectorId;
          game.message(`${dictatorCard.dictatorName} moves with the squad`);
        }
      }

      const playerName = isRebel ? asRebelPlayer(ctx.player).name : 'Dictator';
      game.message(`${playerName} moved ${mercs.length} MERC(s) to ${destination.sectorName}`);

      // Per rules: "Combat triggers when: A squad moves into an enemy-occupied sector"
      if (isRebel) {
        const player = asRebelPlayer(ctx.player);
        if (hasEnemies(game, destination, player)) {
          game.message(`Enemies detected at ${destination.sectorName} - combat begins!`);
          game.pendingCombat = {
            sectorId: destination.sectorId,
            playerId: `${player.position}`,
          };
        }
      } else {
        // Dictator moving into rebel territory
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
      if (!game.isRebelPlayer(ctx.player)) return false;
      const player = asRebelPlayer(ctx.player);
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
        if (!game.isRebelPlayer(ctx.player)) return false;
        const sector = asSector(element);
        const player = asRebelPlayer(ctx.player);

        const primarySector = game.getSector(player.primarySquad.sectorId!);
        const secondarySector = game.getSector(player.secondarySquad.sectorId!);
        if (!primarySector || !secondarySector) return false;

        const primaryAdjacent = game.getAdjacentSectors(primarySector);
        const secondaryAdjacent = game.getAdjacentSectors(secondarySector);

        // Must be adjacent to both squads
        return primaryAdjacent.some(s => s.sectorId === sector.sectorId) &&
          secondaryAdjacent.some(s => s.sectorId === sector.sectorId);
      },
      boardRef: (element) => ({ id: asSector(element).id }),
    })
    .execute((args, ctx) => {
      const player = asRebelPlayer(ctx.player);
      const target = asSector(args.target);

      // Spend action from all living MERCs in both squads
      const primaryMercs = player.primarySquad.getLivingMercs();
      const secondaryMercs = player.secondarySquad.getLivingMercs();
      for (const merc of [...primaryMercs, ...secondaryMercs]) {
        useAction(merc, ACTION_COSTS.MOVE);
      }

      // Move both squads to target
      player.primarySquad.sectorId = target.sectorId;
      player.secondarySquad.sectorId = target.sectorId;
      // Sync individual MERC sectorIds for consistency with map display
      for (const merc of [...player.primarySquad.getMercs(), ...player.secondarySquad.getMercs()]) {
        merc.sectorId = target.sectorId;
      }

      const totalMercs = primaryMercs.length + secondaryMercs.length;
      game.message(`${player.name} launches coordinated attack with ${totalMercs} MERC(s) on ${target.sectorName}!`);

      // Check for enemies and flag for combat (handled by flow)
      if (hasEnemies(game, target, player)) {
        game.message(`Combat begins with coordinated rebel forces!`);
        game.pendingCombat = {
          sectorId: target.sectorId,
          playerId: `${player.position}`,
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
      if (!game.isRebelPlayer(ctx.player)) return false;
      // Only available in multi-player games (need another rebel to coordinate with)
      if (game.rebelPlayers.length <= 1) return false;
      const player = asRebelPlayer(ctx.player);
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
        if (!game.isRebelPlayer(ctx.player)) return false;
        const squad = asSquad(element);
        const player = asRebelPlayer(ctx.player);
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
        if (!game.isRebelPlayer(ctx.player)) return false;
        const sector = asSector(element);
        const player = asRebelPlayer(ctx.player);
        const squad = ctx.args?.squad ? asSquad(ctx.args.squad) : undefined;
        // During availability check, squad may not be selected yet
        if (!squad?.sectorId) return true;
        const currentSector = game.getSector(squad.sectorId);
        if (!currentSector) return false;
        // Must be adjacent and have enemies
        const adjacent = game.getAdjacentSectors(currentSector);
        return adjacent.some(s => s.sectorId === sector.sectorId) && hasEnemies(game, sector, player);
      },
      boardRef: (element) => ({ id: asSector(element).id }),
    })
    .execute((args, ctx) => {
      const player = asRebelPlayer(ctx.player);
      const squad = asSquad(args.squad);
      const target = asSector(args.target);
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
      if (!game.isRebelPlayer(ctx.player)) return false;
      // Only available in multi-player games
      if (game.rebelPlayers.length <= 1) return false;
      const player = asRebelPlayer(ctx.player);
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
        if (!game.isRebelPlayer(ctx.player)) return false;
        const squad = asSquad(element);
        const player = asRebelPlayer(ctx.player);
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
      const player = asRebelPlayer(ctx.player);
      const squad = asSquad(args.squad);
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
      if (!game.isRebelPlayer(ctx.player)) return false;
      // Only available in multi-player games
      if (game.rebelPlayers.length <= 1) return false;
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
        // Sync individual MERC sectorIds for consistency with map display
        for (const merc of squad.getMercs()) {
          merc.sectorId = target.sectorId;
        }
        totalMercs += mercs.length;
      }

      // Clear pending attack
      game.clearPendingCoordinatedAttack(targetId);

      game.message(`Coordinated attack launched on ${target.sectorName} with ${totalMercs} MERC(s)!`);

      // Flag for combat - use first participant's player for context
      const firstRebel = game.rebelPlayers.find(p => `${p.position}` === participants[0].playerId);
      if (firstRebel && hasEnemies(game, target, firstRebel)) {
        game.pendingCombat = {
          sectorId: target.sectorId,
          playerId: `${firstRebel.position}`,
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
      // Not available during Day 1 setup
      if (game.currentDay < 2) return false;
      // Only rebels can split squads
      if (!game.isRebelPlayer(ctx.player)) return false;
      const player = asRebelPlayer(ctx.player);
      // Must have at least 2 MERCs in primary and empty secondary
      return player.primarySquad.mercCount > 1 && player.secondarySquad.mercCount === 0;
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to split off into secondary squad',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        // Safety check - only rebels have squads
        if (!game.isRebelPlayer(ctx.player)) return false;
        const merc = asMercCard(element);
        const player = asRebelPlayer(ctx.player);
        // Only MERCs in primary squad can be split off
        return player.getSquadContaining(merc) === player.primarySquad;
      },
    })
    .execute((args, ctx) => {
      const player = asRebelPlayer(ctx.player);
      const merc = asMercCard(args.merc);

      // Move MERC from primary to secondary squad
      merc.putInto(player.secondarySquad);

      // Secondary squad starts at same location
      player.secondarySquad.sectorId = player.primarySquad.sectorId;
      // Ensure MERC's sectorId is synced
      merc.sectorId = player.primarySquad.sectorId;

      // Update Haarg's ability bonuses (squad composition changed)
      game.updateAllHaargBonuses();
      game.updateAllSargeBonuses();

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
      // Not available during Day 1 setup
      if (game.currentDay < 2) return false;
      // Only rebels can merge squads
      if (!game.isRebelPlayer(ctx.player)) return false;
      const player = asRebelPlayer(ctx.player);
      // Both squads must be in same sector
      return player.secondarySquad.mercCount > 0 &&
             player.primarySquad.sectorId === player.secondarySquad.sectorId;
    })
    .execute((args, ctx) => {
      const player = asRebelPlayer(ctx.player);

      // Move all MERCs from secondary to primary
      const mercs = player.secondarySquad.getMercs();
      for (const merc of mercs) {
        merc.putInto(player.primarySquad);
      }

      // Clear secondary squad location
      player.secondarySquad.sectorId = undefined;

      // Update Haarg's ability bonuses (squad composition changed)
      game.updateAllHaargBonuses();
      game.updateAllSargeBonuses();

      game.message(`${player.name} merged squads (${mercs.length} MERC(s) rejoined)`);
      return { success: true, message: `Merged ${mercs.length} MERC(s)` };
    });
}
