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
 * - assignToSquad: Assign a combatant to a different squad (replaces splitSquad/mergeSquads)
 */

import { Action, type ActionDefinition, dependentFilter } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer, DictatorPlayer } from '../game.js';
import { MercCard, Sector, Squad, DictatorCard, CombatantModel } from '../elements.js';
import { hasEnemies, executeCombat } from '../combat.js';
import { ACTION_COSTS, useAction, capitalize, asSquad, asSector, asMercCard, asRebelPlayer, isDictatorCard } from './helpers.js';

// =============================================================================
// Move Action Helpers (work for both player types)
// =============================================================================

// Helper to check if Kim (DictatorCard) is in a specific squad
// Since we can't access parent directly, search for DictatorCard in the squad
function isKimInSquad(squad: Squad | null | undefined, dictatorCard: CombatantModel | null | undefined): boolean {
  if (!squad || !dictatorCard) return false;
  return squad.all(DictatorCard).some(d => d.combatantId === dictatorCard.combatantId);
}

// Helper to get squads that can move for any player type
function getMovableSquads(player: unknown, game: MERCGame): Squad[] {
  const squads: Squad[] = [];

  if (game.isRebelPlayer(player)) {
    // Type guard narrowed player to RebelPlayer
    // Rebels don't need DictatorCard check, so pass minimal args
    if (canSquadMove(player.primarySquad)) squads.push(player.primarySquad);
    if (canSquadMove(player.secondarySquad)) squads.push(player.secondarySquad);
  } else if (game.isDictatorPlayer(player) && game.dictatorPlayer) {
    const dictator = game.dictatorPlayer;
    // Pass player and game for DictatorCard action check
    try {
      if (canSquadMove(dictator.primarySquad, player, game)) squads.push(dictator.primarySquad);
    } catch { /* not initialized */ }
    try {
      if (canSquadMove(dictator.secondarySquad, player, game)) squads.push(dictator.secondarySquad);
    } catch { /* not initialized */ }
  }

  return squads;
}

// Helper to check if a squad can move
// For dictator: also checks if DictatorCard (if in this squad) has enough actions
function canSquadMove(squad: Squad | null | undefined, player?: unknown, game?: MERCGame): boolean {
  if (!squad?.sectorId) return false;
  const mercs = squad.getLivingMercs();

  // For dictator: count Kim as a unit if in this squad
  let hasKim = false;
  if (game && player && game.isDictatorPlayer(player) && game.dictatorPlayer?.dictator?.inPlay) {
    const dictatorCard = game.dictatorPlayer.dictator;
    if (isKimInSquad(squad, dictatorCard) && !dictatorCard.isDead) {
      hasKim = true;
      // Kim must have actions to move
      if (dictatorCard.actionsRemaining < ACTION_COSTS.MOVE) return false;
    }
  }

  // Need at least one unit (MERCs or Kim)
  if (mercs.length === 0 && !hasKim) return false;
  if (!mercs.every(m => m.actionsRemaining >= ACTION_COSTS.MOVE)) return false;

  return true;
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
    .condition({
      'not in combat': () => !game.activeCombat,
      'is rebel or dictator player': (ctx) => game.isRebelPlayer(ctx.player) || game.isDictatorPlayer(ctx.player),
      'has squad that can move': (ctx) => getMovableSquads(ctx.player, game).length > 0,
    })
    // Destination first so squad filter can auto-narrow based on clicked sector
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
    .chooseElement<Squad>('squad', {
      prompt: 'Select squad to move',
      elementClass: Squad,
      display: (squad) => squad.isPrimary ? 'Primary Squad' : 'Secondary Squad',
      filter: dependentFilter<Squad, Sector>({
        dependsOn: 'destination',
        // When destination NOT selected: show all movable squads
        whenUndefined: (element, ctx) => {
          const squad = asSquad(element);
          if (!isSquadOwnedByPlayer(squad, ctx.player, game)) return false;
          return canSquadMove(squad, ctx.player, game);
        },
        // When destination IS selected: only show squads that can reach it
        whenSelected: (element, selectedDestination, ctx) => {
          const squad = asSquad(element);
          if (!isSquadOwnedByPlayer(squad, ctx.player, game)) return false;
          if (!canSquadMove(squad, ctx.player, game)) return false;
          // Check if squad is adjacent to destination
          if (!squad.sectorId) return false;
          const squadSector = game.getSector(squad.sectorId);
          if (!squadSector) return false;
          const adjacent = game.getAdjacentSectors(squadSector);
          return adjacent.some(s => s.sectorId === selectedDestination.sectorId);
        },
      }),
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
        const hasSonia = mercs.some(m => m.combatantId === 'sonia');
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

      // Set squad location - all MERCs inherit via computed getter
      squad.sectorId = destination.sectorId;

      // MERC-dict-move: If dictator player is moving and DictatorCard is in the moving squad, move it too
      if (!isRebel && game.dictatorPlayer?.dictator?.inPlay) {
        const dictatorCard = game.dictatorPlayer.dictator;
        // Check squad membership by searching for DictatorCard in squad
        if (isKimInSquad(squad, dictatorCard) && !dictatorCard.isDead) {
          useAction(dictatorCard, ACTION_COSTS.MOVE);
          game.message(`${dictatorCard.combatantName} moves with the squad`);
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
            // Dictator initiated combat, so only dictator side gets target selection
            const outcome = executeCombat(game, destination, rebel, { attackingPlayerIsRebel: false });
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
    .condition({
      'is rebel player': (ctx) => game.isRebelPlayer(ctx.player),
      'both squads can attack common target': (ctx) => {
        if (!game.isRebelPlayer(ctx.player)) return false;
        const player = asRebelPlayer(ctx.player);
        // Need both squads with MERCs
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
      },
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

      // Move both squads to target - MERCs inherit sectorId via computed getter
      player.primarySquad.sectorId = target.sectorId;
      player.secondarySquad.sectorId = target.sectorId;

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
    .condition({
      'is rebel player': (ctx) => game.isRebelPlayer(ctx.player),
      'is multi-player game': () => game.rebelPlayers.length > 1,
      'has squad adjacent to enemy': (ctx) => {
        if (!game.isRebelPlayer(ctx.player)) return false;
        const player = asRebelPlayer(ctx.player);
        return [player.primarySquad, player.secondarySquad].some(squad => {
          if (squad.mercCount === 0 || !squad.sectorId) return false;
          const sector = game.getSector(squad.sectorId);
          if (!sector) return false;
          const adjacent = game.getAdjacentSectors(sector);
          return adjacent.some(s => hasEnemies(game, s, player));
        });
      },
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
    .condition({
      'is rebel player': (ctx) => game.isRebelPlayer(ctx.player),
      'is multi-player game': () => game.rebelPlayers.length > 1,
      'has pending attack to join': () => game.pendingCoordinatedAttacks.size > 0,
      'has squad that can reach pending target': (ctx) => {
        if (!game.isRebelPlayer(ctx.player)) return false;
        const player = asRebelPlayer(ctx.player);

        for (const [targetId] of game.pendingCoordinatedAttacks) {
          const targetSector = game.getSector(targetId);
          if (!targetSector) continue;

          for (const squad of [player.primarySquad, player.secondarySquad]) {
            if (squad.livingMercCount === 0 || !squad.sectorId) continue;
            const sector = game.getSector(squad.sectorId);
            if (!sector) continue;
            const adjacent = game.getAdjacentSectors(sector);
            if (adjacent.some(s => s.sectorId === targetId)) {
              if (squad.getLivingMercs().every(m => m.actionsRemaining >= ACTION_COSTS.MOVE)) {
                return true;
              }
            }
          }
        }
        return false;
      },
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
    .condition({
      'is rebel player': (ctx) => game.isRebelPlayer(ctx.player),
      'is multi-player game': () => game.rebelPlayers.length > 1,
      'has pending coordinated attack': () => game.pendingCoordinatedAttacks.size > 0,
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

        // Set squad location - MERCs inherit via computed getter
        squad.sectorId = target.sectorId;
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

// =============================================================================
// Assign to Squad Action
// =============================================================================

type TargetSquadType = 'primary' | 'secondary' | 'base';

interface SquadChoice {
  label: string;
  value: TargetSquadType;
}

/**
 * Get count of combatants in a squad (including DictatorCard for dictator player)
 */
function getSquadCombatantCount(squad: Squad | null | undefined, dictatorCard?: CombatantModel | null): number {
  if (!squad) return 0;
  let count = squad.mercCount;
  if (dictatorCard && isKimInSquad(squad, dictatorCard)) {
    count += 1;
  }
  return count;
}

/**
 * Get all combatants that can be reassigned to a different squad.
 * A combatant can be reassigned if there's a valid target squad for them.
 */
function getAssignableCombatants(player: unknown, game: MERCGame): CombatantModel[] {
  const combatants: CombatantModel[] = [];

  if (game.isRebelPlayer(player)) {
    const rebel = asRebelPlayer(player);
    for (const merc of rebel.team) {
      if (merc.isDead) continue;
      if (getValidTargetSquads(merc, player, game).length > 0) {
        combatants.push(merc);
      }
    }
  } else if (game.isDictatorPlayer(player) && game.dictatorPlayer) {
    const dictator = game.dictatorPlayer;
    // Add hired MERCs
    for (const merc of dictator.hiredMercs) {
      if (merc.isDead) continue;
      if (getValidTargetSquads(merc, player, game).length > 0) {
        combatants.push(merc);
      }
    }
    // Add DictatorCard if in play
    if (dictator.dictator?.inPlay && !dictator.dictator.isDead) {
      if (getValidTargetSquads(dictator.dictator, player, game).length > 0) {
        combatants.push(dictator.dictator);
      }
    }
  }

  return combatants;
}

/**
 * Get valid target squads for a combatant.
 * Rules:
 * - Same-sector transfers: free movement between squads in same sector
 * - Creating new squad: can split off to form new squad in same sector
 * - Base squad (dictator only): true third squad at base sector
 */
function getValidTargetSquads(
  combatant: CombatantModel,
  player: unknown,
  game: MERCGame
): SquadChoice[] {
  const choices: SquadChoice[] = [];

  if (game.isRebelPlayer(player)) {
    const rebel = asRebelPlayer(player);
    const primary = rebel.primarySquad;
    const secondary = rebel.secondarySquad;
    const currentSquad = rebel.getSquadContaining(combatant as CombatantModel);

    if (!currentSquad) return choices;

    const primaryHasSector = !!primary.sectorId;
    const secondaryHasSector = !!secondary.sectorId;
    const sameSector = primaryHasSector && secondaryHasSector && primary.sectorId === secondary.sectorId;
    const currentSquadCount = getSquadCombatantCount(currentSquad);

    // Same-sector transfers: free movement
    if (sameSector) {
      if (currentSquad.isPrimary) {
        choices.push({ label: 'Secondary Squad', value: 'secondary' });
      } else {
        choices.push({ label: 'Primary Squad', value: 'primary' });
      }
    }
    // Creating new squad (must have >1 in source squad)
    else if (currentSquadCount > 1) {
      if (currentSquad.isPrimary && !secondaryHasSector) {
        choices.push({ label: 'Create Secondary Squad', value: 'secondary' });
      }
      if (!currentSquad.isPrimary && !primaryHasSector) {
        choices.push({ label: 'Create Primary Squad', value: 'primary' });
      }
    }
  } else if (game.isDictatorPlayer(player) && game.dictatorPlayer) {
    const dictator = game.dictatorPlayer;
    const primary = dictator.primarySquad;
    const secondary = dictator.secondarySquad;
    let base: Squad | null = null;
    try {
      base = dictator.baseSquad;
    } catch { /* base squad not initialized yet */ }

    // Find current squad for this combatant (check all 3 squads)
    let currentSquad: Squad | null = null;
    if (isDictatorCard(combatant)) {
      if (isKimInSquad(primary, combatant)) currentSquad = primary;
      else if (isKimInSquad(secondary, combatant)) currentSquad = secondary;
      else if (base && isKimInSquad(base, combatant)) currentSquad = base;
    } else {
      // Check all squads for MercCard
      if (primary.all(MercCard).some(m => m.combatantId === (combatant as CombatantModel).combatantId)) {
        currentSquad = primary;
      } else if (secondary.all(MercCard).some(m => m.combatantId === (combatant as CombatantModel).combatantId)) {
        currentSquad = secondary;
      } else if (base?.all(MercCard).some(m => m.combatantId === (combatant as CombatantModel).combatantId)) {
        currentSquad = base;
      }
    }

    if (!currentSquad) return choices;

    const primaryHasSector = !!primary?.sectorId;
    const secondaryHasSector = !!secondary?.sectorId;
    const baseHasSector = !!base?.sectorId;
    const currentSquadCount = getSquadCombatantCount(currentSquad, dictator.dictator);

    // Determine which squads are at the same sector as current squad
    const currentSector = currentSquad.sectorId;
    const primarySameSector = primaryHasSector && primary.sectorId === currentSector;
    const secondarySameSector = secondaryHasSector && secondary.sectorId === currentSector;
    const baseSameSector = baseHasSector && base?.sectorId === currentSector;

    // Same-sector transfers: free movement to any squad at same sector
    if (!currentSquad.isBase && !currentSquad.isPrimary && primarySameSector) {
      choices.push({ label: 'Primary Squad', value: 'primary' });
    }
    if (!currentSquad.isBase && currentSquad.isPrimary && secondarySameSector) {
      choices.push({ label: 'Secondary Squad', value: 'secondary' });
    }
    if (!currentSquad.isBase && baseSameSector) {
      choices.push({ label: 'Base Squad', value: 'base' });
    }

    // From base squad: can transfer to primary/secondary if at same sector
    // OR can create new squad to deploy from base
    if (currentSquad.isBase) {
      if (primarySameSector) {
        choices.push({ label: 'Primary Squad', value: 'primary' });
      } else if (!primaryHasSector) {
        // Can deploy from base to create primary squad at base sector
        choices.push({ label: 'Create Primary Squad', value: 'primary' });
      }
      if (secondarySameSector) {
        choices.push({ label: 'Secondary Squad', value: 'secondary' });
      } else if (!secondaryHasSector) {
        // Can deploy from base to create secondary squad at base sector
        choices.push({ label: 'Create Secondary Squad', value: 'secondary' });
      }
    }

    // Creating new squad from primary/secondary
    // Solo combatants CAN move to create a new squad (leaving original empty)
    if (!currentSquad.isBase) {
      if (!secondaryHasSector) {
        choices.push({ label: 'Create Secondary Squad', value: 'secondary' });
      }
      if (!primaryHasSector) {
        choices.push({ label: 'Create Primary Squad', value: 'primary' });
      }
    }
  }

  return choices;
}

/**
 * Get display name for a combatant
 */
function getCombatantName(combatant: CombatantModel): string {
  return capitalize(combatant.combatantName);
}

/**
 * Assign to Squad Action
 * Cost: Free action
 * Allows reassigning combatants between squads.
 * Works for both rebel and dictator players.
 */
export function createAssignToSquadAction(game: MERCGame): ActionDefinition {
  return Action.create('assignToSquad')
    .prompt('Assign to squad')
    .condition({
      'not in combat': () => !game.activeCombat,
      'day 2 or later': () => game.currentDay >= 2,
      'has assignable combatants': (ctx) => getAssignableCombatants(ctx.player, game).length > 0,
    })
    .chooseFrom<string>('combatantName', {
      prompt: 'Select combatant to reassign',
      choices: (ctx) => {
        const combatants = getAssignableCombatants(ctx.player, game);
        return combatants.map(c => getCombatantName(c));
      },
    })
    .chooseFrom<string>('targetSquad', {
      prompt: 'Select target squad',
      dependsOn: 'combatantName',
      choices: (ctx) => {
        const combatantName = ctx.args?.combatantName as string;
        if (!combatantName) return [];

        // Find the combatant
        const combatants = getAssignableCombatants(ctx.player, game);
        const combatant = combatants.find(c => getCombatantName(c) === combatantName);
        if (!combatant) return [];

        return getValidTargetSquads(combatant, ctx.player, game).map(sq => sq.label);
      },
    })
    .execute((args, ctx) => {
      const combatantName = args.combatantName as string;
      const targetSquadLabel = args.targetSquad as string;

      // Parse target squad type from label
      let targetType: TargetSquadType;
      if (targetSquadLabel.includes('Primary')) {
        targetType = 'primary';
      } else if (targetSquadLabel.includes('Secondary')) {
        targetType = 'secondary';
      } else if (targetSquadLabel.includes('Base')) {
        targetType = 'base';
      } else {
        return { success: false, message: 'Invalid target squad' };
      }

      if (game.isRebelPlayer(ctx.player)) {
        const player = asRebelPlayer(ctx.player);
        const merc = player.team.find(m => getCombatantName(m) === combatantName);
        if (!merc) {
          return { success: false, message: 'MERC not found' };
        }

        const sourceSquad = player.getSquadContaining(merc);
        if (!sourceSquad) {
          return { success: false, message: 'MERC not in any squad' };
        }

        const destSquad = targetType === 'primary' ? player.primarySquad : player.secondarySquad;

        // If creating new squad, set its location
        if (!destSquad.sectorId) {
          destSquad.sectorId = sourceSquad.sectorId;
        }

        // Move the combatant - sectorId inherited via computed getter
        merc.putInto(destSquad);

        // If source squad is now empty, clear its location
        if (sourceSquad.mercCount === 0) {
          sourceSquad.sectorId = undefined;
        }

        // Update ability bonuses
        game.updateAllHaargBonuses();
        game.updateAllSargeBonuses();

        game.message(`${player.name} assigned ${merc.combatantName} to ${targetType} squad`);
        return { success: true, message: `Assigned ${merc.combatantName} to ${targetType} squad` };
      }

      if (game.isDictatorPlayer(ctx.player)) {
        const dictator = game.dictatorPlayer;
        if (!dictator?.primarySquad || !dictator.secondarySquad) {
          return { success: false, message: 'Invalid squads' };
        }

        // Get base squad if available
        let baseSquad: Squad | null = null;
        try {
          baseSquad = dictator.baseSquad;
        } catch { /* base squad not initialized yet */ }

        // Find the combatant (could be MercCard or DictatorCard)
        let combatant: CombatantModel | undefined;
        let sourceSquad: Squad | null = null;

        // Check if it's the dictator (check all 3 squads)
        if (dictator.dictator && getCombatantName(dictator.dictator) === combatantName) {
          combatant = dictator.dictator;
          if (isKimInSquad(dictator.primarySquad, dictator.dictator)) {
            sourceSquad = dictator.primarySquad;
          } else if (isKimInSquad(dictator.secondarySquad, dictator.dictator)) {
            sourceSquad = dictator.secondarySquad;
          } else if (baseSquad && isKimInSquad(baseSquad, dictator.dictator)) {
            sourceSquad = baseSquad;
          }
        } else {
          // Check hired mercs in all squads
          combatant = dictator.hiredMercs.find(m => getCombatantName(m) === combatantName);
          if (combatant) {
            // Check primary, secondary, and base squads
            const merc = combatant as CombatantModel;
            if (dictator.primarySquad.all(MercCard).some(m => m.combatantId === merc.combatantId)) {
              sourceSquad = dictator.primarySquad;
            } else if (dictator.secondarySquad.all(MercCard).some(m => m.combatantId === merc.combatantId)) {
              sourceSquad = dictator.secondarySquad;
            } else if (baseSquad?.all(MercCard).some(m => m.combatantId === merc.combatantId)) {
              sourceSquad = baseSquad;
            }
          }
        }

        if (!combatant || !sourceSquad) {
          return { success: false, message: 'Combatant not found' };
        }

        // Determine destination squad (now handles 'base' as a real squad)
        let destSquad: Squad;
        if (targetType === 'primary') {
          destSquad = dictator.primarySquad;
        } else if (targetType === 'secondary') {
          destSquad = dictator.secondarySquad;
        } else if (targetType === 'base' && baseSquad) {
          destSquad = baseSquad;
        } else {
          return { success: false, message: 'Invalid target squad' };
        }

        // If creating new squad, set its location
        if (!destSquad.sectorId) {
          destSquad.sectorId = sourceSquad.sectorId;
        }

        // Move the combatant - sectorId inherited via computed getter
        combatant.putInto(destSquad);

        // If source squad is now empty, clear its location (except base squad which is permanent)
        const sourceCount = getSquadCombatantCount(sourceSquad, dictator.dictator);
        if (sourceCount === 0 && !sourceSquad.isBase) {
          sourceSquad.sectorId = undefined;
        }

        // Update ability bonuses
        game.updateAllHaargBonuses();
        game.updateAllSargeBonuses();

        game.message(`Dictator assigned ${getCombatantName(combatant)} to ${targetType} squad`);
        return { success: true, message: `Assigned ${getCombatantName(combatant)} to ${targetType} squad` };
      }

      return { success: false, message: 'Invalid player type' };
    });
}
