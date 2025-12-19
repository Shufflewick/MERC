import { Action, type ActionDefinition } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer } from './game.js';
import { MercCard, DictatorCard, Sector, Equipment, TacticsCard, Squad } from './elements.js';
import { TeamConstants, SectorConstants } from './constants.js';
import {
  drawMercsForHiring,
  hireSelectedMercs,
  isValidLandingSector,
  equipStartingEquipment,
  placeInitialMilitia,
  hireDictatorMerc,
  applyDictatorSetupAbility,
  drawTacticsHand,
  autoPlaceExtraMilitia,
} from './day-one.js';
import { executeCombat, executeCombatRetreat, hasEnemies, getValidRetreatSectors } from './combat.js';
import { executeTacticsEffect } from './tactics-effects.js';
import {
  autoEquipDictatorUnits,
  hasMortar,
  getMortarTargets,
  selectMortarTarget,
  setPrivacyPlayer,
  selectMilitiaPlacementSector,
  distanceToNearestRebel,
  mercNeedsHealing,
  getAIHealingPriority,
} from './ai-helpers.js';
import {
  getNextAIAction,
  getAIUnitSelection,
  getAIMoveDestination,
  getAIEquipmentSelection,
} from './ai-executor.js';

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

/**
 * MERC hiring incompatibilities
 * MERC-s37: Borris won't work with Squirrel
 * MERC-related: Natasha won't work with Moose, Moose won't work with Borris, Squirrel won't work with Natasha
 */
const MERC_INCOMPATIBILITIES: Record<string, string[]> = {
  borris: ['squirrel'],
  squirrel: ['borris', 'natasha'],
  natasha: ['moose'],
  moose: ['borris'],
};

/**
 * Check if a MERC can be hired given the current team composition
 */
function canHireMercWithTeam(mercId: string, team: MercCard[]): boolean {
  const incompatible = MERC_INCOMPATIBILITIES[mercId] || [];
  return !team.some(m => incompatible.includes(m.mercId));
}

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
 * Check if a MERC is in a player's team (uses ID comparison to avoid object reference issues)
 */
function isInPlayerTeam(merc: MercCard, player: RebelPlayer): boolean {
  return player.team.some(m => m.id === merc.id);
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

        // MERC-s37: Filter out MERCs incompatible with current team
        const compatibleMercs = drawnMercs.filter(m =>
          canHireMercWithTeam(m.mercId, player.team)
        );
        const choices = compatibleMercs.map(m => capitalize(m.mercName));

        // Add note about team limit
        if (canHire < compatibleMercs.length) {
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
          const firedSquad = player.primarySquad.getMercs().some(m => m.id === mercToFire.id)
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

/**
 * Move a squad to an adjacent sector
 * Cost: 1 action per MERC in squad
 */
export function createMoveAction(game: MERCGame): ActionDefinition {
  return Action.create('move')
    .prompt('Move your squad')
    .condition((ctx) => {
      // Only rebels can use move action (dictator uses dictatorMove)
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;

      // Check if any squad has MERCs that can all move
      const canSquadMove = (squad: Squad | null | undefined): boolean => {
        if (!squad?.sectorId) return false;
        const mercs = squad.getMercs();
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
        const squad = ctx.args?.squad as Squad | undefined;
        // During action availability check, squad might not be selected yet
        // Return true to indicate destinations exist (actual filtering happens when squad is selected)
        if (!squad) {
          // Check if there are any sectors at all (basic sanity check)
          return true;
        }
        if (!squad.sectorId) return false;
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
      const sourceSector = game.getSector(squad.sectorId!);

      // Spend action from each MERC in squad
      const mercs = squad.getMercs();
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
        if (squad.mercCount === 0 || !squad.sectorId) return false;
        // Must have MERCs with actions
        return squad.getMercs().every(m => m.actionsRemaining >= ACTION_COSTS.MOVE);
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
        // Safety check - only rebels have squads
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const squad = element as unknown as Squad;
        const player = ctx.player as RebelPlayer;
        const targetId = ctx.data?.targetAttack as string;
        // Use name comparison instead of object reference
        const isPlayerSquad = squad.name === player.primarySquadRef || squad.name === player.secondarySquadRef;
        if (!isPlayerSquad) return false;
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
 * Draws equipment to the sector stash based on loot icons.
 * Use "Take from Stash" action to pick up equipment.
 */
export function createExploreAction(game: MERCGame): ActionDefinition {
  return Action.create('explore')
    .prompt('Explore the current sector')
    .notUndoable() // Involves randomness (drawing equipment)
    .condition((ctx) => {
      // Only rebels can explore
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;

      // Check if any squad is in an unexplored sector
      const canExploreFrom = (squad: Squad | null | undefined): boolean => {
        if (!squad?.sectorId) return false;
        const sector = game.getSector(squad.sectorId);
        return !!(sector && !sector.explored);
      };

      const hasUnexploredSector = canExploreFrom(player.primarySquad) || canExploreFrom(player.secondarySquad);
      if (!hasUnexploredSector) return false;

      return hasActionsRemaining(player, ACTION_COSTS.EXPLORE);
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

      // Find which squad the merc is in
      const findMercSquad = (): Squad | null => {
        if (player.primarySquad?.getMercs().some(m => m.id === actingMerc.id)) {
          return player.primarySquad;
        }
        if (player.secondarySquad?.getMercs().some(m => m.id === actingMerc.id)) {
          return player.secondarySquad;
        }
        return null;
      };

      const squad = findMercSquad();
      if (!squad?.sectorId) {
        return { success: false, message: 'MERC not in a valid squad' };
      }

      const sector = game.getSector(squad.sectorId);
      if (!sector) {
        return { success: false, message: 'No sector found' };
      }

      if (sector.explored) {
        return { success: false, message: 'Sector already explored' };
      }

      // Spend action
      useAction(actingMerc, ACTION_COSTS.EXPLORE);

      // Mark sector as explored
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

      const equipmentList = drawnEquipment.map(e => e.equipmentName).join(', ');
      game.message(`${actingMerc.mercName} explored ${sector.sectorName} and found: ${equipmentList || 'nothing'}`);

      return {
        success: true,
        message: `Explored ${sector.sectorName}`,
        data: { found: drawnEquipment.length, stash: sector.stash.length },
      };
    });
}

/**
 * Take equipment from the sector stash.
 * Cost: 0 actions (free)
 * Available when squad is in a sector with equipment in the stash.
 */
export function createTakeFromStashAction(game: MERCGame): ActionDefinition {
  return Action.create('takeFromStash')
    .prompt('Take equipment from stash')
    .condition((ctx) => {
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;

      // Check if any squad is in a sector with stash
      const hasStash = (squad: Squad | null | undefined): boolean => {
        if (!squad?.sectorId) return false;
        const sector = game.getSector(squad.sectorId);
        return !!(sector && sector.stash.length > 0);
      };

      return hasStash(player.primarySquad) || hasStash(player.secondarySquad);
    })
    .chooseElement<MercCard>('targetMerc', {
      prompt: 'Which MERC takes the equipment?',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        // MERC must be in a sector with stash
        const inSectorWithStash = (squad: Squad | null | undefined): boolean => {
          if (!squad?.sectorId) return false;
          const mercs = squad.getMercs();
          if (!mercs.some(m => m.id === merc.id)) return false;
          const sector = game.getSector(squad.sectorId);
          return !!(sector && sector.stash.length > 0);
        };
        return isInPlayerTeam(merc, player) &&
               (inSectorWithStash(player.primarySquad) || inSectorWithStash(player.secondarySquad));
      },
    })
    .chooseFrom<string>('equipment', {
      prompt: 'Select equipment to take',
      dependsOn: 'targetMerc',
      choices: (ctx) => {
        const targetMerc = ctx.args?.targetMerc as MercCard;
        if (!targetMerc) return ['Done'];

        const player = ctx.player as RebelPlayer;

        // Find which squad the merc is in
        const findMercSector = (): Sector | null => {
          for (const squad of [player.primarySquad, player.secondarySquad]) {
            if (!squad?.sectorId) continue;
            const mercs = squad.getMercs();
            if (mercs.some(m => m.id === targetMerc.id)) {
              return game.getSector(squad.sectorId) || null;
            }
          }
          return null;
        };

        const sector = findMercSector();
        if (!sector || sector.stash.length === 0) {
          return ['Done'];
        }

        const equipmentChoices = sector.stash.map(e => `${e.equipmentName} (${e.equipmentType})`);
        return [...equipmentChoices, 'Done'];
      },
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const targetMerc = args.targetMerc as MercCard;
      const equipmentChoice = args.equipment as string;

      if (equipmentChoice === 'Done') {
        return { success: true, message: 'No equipment taken' };
      }

      // Find the sector the merc is in
      const findMercSector = (): Sector | null => {
        for (const squad of [player.primarySquad, player.secondarySquad]) {
          if (!squad?.sectorId) continue;
          const mercs = squad.getMercs();
          if (mercs.some(m => m.id === targetMerc.id)) {
            return game.getSector(squad.sectorId) || null;
          }
        }
        return null;
      };

      const sector = findMercSector();
      if (!sector) {
        return { success: false, message: 'Could not find sector' };
      }

      // Parse equipment name from choice (format: "EquipName (Type)")
      const equipName = equipmentChoice.replace(/ \((?:Weapon|Armor|Accessory)\)$/, '');
      const equipment = sector.stash.find(e => e.equipmentName === equipName);

      if (!equipment) {
        return { success: false, message: 'Equipment not found in stash' };
      }

      // Remove from stash
      const idx = sector.stash.indexOf(equipment);
      if (idx >= 0) {
        sector.stash.splice(idx, 1);
      }

      // Equip to merc
      const replaced = targetMerc.equip(equipment);
      if (replaced) {
        sector.addToStash(replaced);
        game.message(`${targetMerc.mercName} equipped ${equipment.equipmentName}, returned ${replaced.equipmentName} to stash`);
      } else {
        game.message(`${targetMerc.mercName} equipped ${equipment.equipmentName}`);
      }

      return {
        success: true,
        message: `${targetMerc.mercName} took ${equipment.equipmentName}`,
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
      return player.team.some(m => m.training > 0 && m.actionsRemaining >= ACTION_COSTS.TRAIN);
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
        return isInPlayerTeam(merc, player) &&
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
      // Only rebels can re-equip
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      const player = ctx.player as RebelPlayer;
      const squad = player.primarySquad;
      if (!squad?.sectorId) return false;
      if (!hasActionsRemaining(player, ACTION_COSTS.RE_EQUIP)) return false;
      const sector = game.getSector(squad.sectorId);
      // Can re-equip if there's equipment in stash or MERCs have equipment
      return !!(sector && (sector.stash.length > 0 || player.team.some(m => m.weaponSlot || m.armorSlot || m.accessorySlot)));
    })
    .chooseElement<MercCard>('merc', {
      prompt: 'Select MERC to equip',
      elementClass: MercCard,
      display: (merc) => capitalize(merc.mercName),
      filter: (element, ctx) => {
        // Safety check - only rebels can re-equip
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return isInPlayerTeam(merc, player) && merc.actionsRemaining >= ACTION_COSTS.RE_EQUIP;
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
        // Safety check - only rebels can trade
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        const selectedMerc = ctx.args?.merc as MercCard;
        // MERC-gu5: Trade partner must also have actions to spend
        return isInPlayerTeam(merc, player) &&
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

      // Find which squad Doc is in
      const primaryMercs = player.primarySquad.getMercs();
      const secondaryMercs = player.secondarySquad.getMercs();

      // Get Doc's squad mates
      let squadMates: MercCard[] = [];
      if (primaryMercs.includes(doc)) {
        squadMates = primaryMercs.filter(m => m !== doc && !m.isDead);
      } else if (secondaryMercs.includes(doc)) {
        squadMates = secondaryMercs.filter(m => m !== doc && !m.isDead);
      }

      // Only show action if there are damaged MERCs in Doc's squad
      return squadMates.some(m => m.damage > 0) || doc.damage > 0;
    })
    .execute((args, ctx) => {
      const player = ctx.player as RebelPlayer;
      const doc = player.team.find(m => m.mercId === 'doc' && !m.isDead)!;

      // Find Doc's squad
      const primaryMercs = player.primarySquad.getMercs();
      const secondaryMercs = player.secondarySquad.getMercs();

      let squadMercs: MercCard[] = [];
      if (primaryMercs.includes(doc)) {
        squadMercs = primaryMercs.filter(m => !m.isDead);
      } else if (secondaryMercs.includes(doc)) {
        squadMercs = secondaryMercs.filter(m => !m.isDead);
      }

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
      return stash.some(e => e.equipmentName.toLowerCase().includes('land mine'));
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
      const mineIndex = stash.findIndex(e => e.equipmentName.toLowerCase().includes('land mine'));
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
        slot => slot && slot.equipmentName.toLowerCase().includes('land mine')
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
      if (squidhead.accessorySlot?.equipmentName.toLowerCase().includes('land mine')) {
        mine = squidhead.unequip('Accessory');
      } else if (squidhead.weaponSlot?.equipmentName.toLowerCase().includes('land mine')) {
        mine = squidhead.unequip('Weapon');
      } else if (squidhead.armorSlot?.equipmentName.toLowerCase().includes('land mine')) {
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

        // Find Hagness's squad
        const primaryMercs = player.primarySquad.getMercs();
        const secondaryMercs = player.secondarySquad.getMercs();

        let squadMates: MercCard[] = [];
        if (primaryMercs.includes(hagness)) {
          squadMates = primaryMercs.filter(m => !m.isDead);
        } else if (secondaryMercs.includes(hagness)) {
          squadMates = secondaryMercs.filter(m => !m.isDead);
        }

        return squadMates.includes(merc);
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

/**
 * Use hospital in a city sector
 * Cost: 1 action, fully heals MERC
 */
export function createHospitalAction(game: MERCGame): ActionDefinition {
  return Action.create('hospital')
    .prompt('Visit hospital')
    .condition((ctx) => {
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
        return player.primarySquad.getMercs().some(m => m.id === merc.id);
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

// Fire MERC is now only part of the hire action (MERC-yi7)
// See createHireMercAction for implementation

/**
 * End the current turn
 * Clears all remaining actions from player's MERCs
 */
export function createEndTurnAction(game: MERCGame): ActionDefinition {
  return Action.create('endTurn')
    .prompt('End turn')
    .condition((ctx) => {
      // Only rebels can end turn (dictator uses dictatorEndMercActions)
      if (!game.isRebelPlayer(ctx.player as any)) return false;
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
    .notUndoable() // Involves randomness (drawing cards) - disables undo for rest of Day 1
    .condition((ctx) => {
      // Only rebels hire starting MERCs
      if (!game.isRebelPlayer(ctx.player as any)) return false;
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
    .notUndoable() // Involves randomness (drawing equipment)
    .condition((ctx) => {
      // Only rebels equip starting equipment
      if (!game.isRebelPlayer(ctx.player as any)) return false;
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
        // Safety check - only rebels equip starting equipment
        if (!game.isRebelPlayer(ctx.player as any)) return false;
        const merc = element as unknown as MercCard;
        const player = ctx.player as RebelPlayer;
        return isInPlayerTeam(merc, player) &&
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
    .condition((ctx) => {
      // Only rebels place landing zones
      return game.isRebelPlayer(ctx.player as any);
    })
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
 * MERC-5j2: AI plays from top of deck (no hand), auto-selects
 */
export function createPlayTacticsAction(game: MERCGame): ActionDefinition {
  return Action.create('playTactics')
    .prompt('Play a tactics card')
    .condition((ctx) => {
      // Only the dictator player can play tactics cards
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      // MERC-5j2: AI plays from deck, human plays from hand
      if (game.dictatorPlayer?.isAI) {
        return (game.dictatorPlayer?.tacticsDeck?.count(TacticsCard) ?? 0) > 0;
      }
      return (game.dictatorPlayer?.tacticsHand?.count(TacticsCard) ?? 0) > 0;
    })
    .chooseElement<TacticsCard>('card', {
      prompt: 'Select a tactics card to play',
      elementClass: TacticsCard,
      filter: (element) => {
        const card = element as unknown as TacticsCard;
        // MERC-5j2: AI auto-selects top card from deck
        if (game.dictatorPlayer?.isAI) {
          const topCard = game.dictatorPlayer?.tacticsDeck?.first(TacticsCard);
          return card === topCard;
        }
        return game.dictatorPlayer?.tacticsHand?.all(TacticsCard).includes(card) ?? false;
      },
      // MERC-pj8: Explicit AI auto-select for top deck card
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        return game.dictatorPlayer?.tacticsDeck?.first(TacticsCard) ?? undefined;
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
 * MERC-5j2: AI uses top card from deck
 */
export function createReinforceAction(game: MERCGame): ActionDefinition {
  return Action.create('reinforce')
    .prompt('Reinforce militia')
    .condition((ctx) => {
      // Only the dictator player can reinforce
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      // MERC-5j2: AI plays from deck, human plays from hand
      if (game.dictatorPlayer?.isAI) {
        return (game.dictatorPlayer?.tacticsDeck?.count(TacticsCard) ?? 0) > 0;
      }
      return (game.dictatorPlayer?.tacticsHand?.count(TacticsCard) ?? 0) > 0;
    })
    .chooseElement<TacticsCard>('card', {
      prompt: 'Discard a tactics card to reinforce',
      elementClass: TacticsCard,
      filter: (element) => {
        const card = element as unknown as TacticsCard;
        // MERC-5j2: AI auto-selects top card from deck
        if (game.dictatorPlayer?.isAI) {
          const topCard = game.dictatorPlayer?.tacticsDeck?.first(TacticsCard);
          return card === topCard;
        }
        return game.dictatorPlayer?.tacticsHand?.all(TacticsCard).includes(card) ?? false;
      },
      // MERC-pj8: Explicit AI auto-select for top deck card
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        return game.dictatorPlayer?.tacticsDeck?.first(TacticsCard) ?? undefined;
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
      // MERC-0m0: AI auto-select per rule 4.4.3 - closest to rebel-controlled sector
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        // Get all dictator-controlled sectors
        const controlled = game.gameMap.getAllSectors().filter(s => {
          const isControlled = s.dictatorMilitia >= s.getTotalRebelMilitia() &&
            s.dictatorMilitia > 0;
          const isBase = game.dictatorPlayer.baseSectorId === s.sectorId;
          return isControlled || isBase;
        });
        if (controlled.length === 0) return undefined;
        // Use rule 4.4.3: closest to rebel-controlled sector
        return selectMilitiaPlacementSector(game, controlled, 'dictator') ?? undefined;
      },
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

// MERC-1ph: Helper to check if there's a beneficial militia move for AI
function hasBeneficialMilitiaMove(game: MERCGame): boolean {
  const sectorsWithMilitia = game.gameMap.getAllSectors()
    .filter(s => s.dictatorMilitia > 0);

  for (const from of sectorsWithMilitia) {
    const fromDist = distanceToNearestRebel(game, from);
    const adjacent = game.getAdjacentSectors(from);

    for (const to of adjacent) {
      // Check if moving would get closer to rebels
      const toDist = distanceToNearestRebel(game, to);
      if (toDist < fromDist && to.dictatorMilitia < 10) {
        return true; // Found a beneficial move
      }
    }
  }
  return false;
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
      if (!game.gameMap.getAllSectors().some(s => s.dictatorMilitia > 0)) return false;

      // MERC-1ph: For AI, only show if there's a beneficial move
      if (game.dictatorPlayer?.isAI) {
        return hasBeneficialMilitiaMove(game);
      }

      return true;
    })
    .chooseElement<Sector>('fromSector', {
      prompt: 'Move militia from which sector?',
      elementClass: Sector,
      filter: (element) => {
        const sector = element as unknown as Sector;
        return sector.dictatorMilitia > 0;
      },
      boardRef: (element) => ({ id: (element as unknown as Sector).id }),
      // MERC-p3c: AI selects sector furthest from rebels to move militia from
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const sectorsWithMilitia = game.gameMap.getAllSectors()
          .filter(s => s.dictatorMilitia > 0);
        if (sectorsWithMilitia.length === 0) return undefined;
        // Sort by distance to nearest rebel (furthest first)
        const sorted = [...sectorsWithMilitia].sort((a, b) => {
          const distA = distanceToNearestRebel(game, a);
          const distB = distanceToNearestRebel(game, b);
          return distB - distA; // Furthest first
        });
        return sorted[0];
      },
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
      // MERC-p3c: AI selects adjacent sector closest to rebels (per rule 4.4.3)
      aiSelect: (ctx) => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const fromSector = ctx.args.fromSector as Sector;
        if (!fromSector) return undefined;
        const adjacent = game.getAdjacentSectors(fromSector)
          .filter(s => s.dictatorMilitia < SectorConstants.MAX_MILITIA_PER_SIDE);
        if (adjacent.length === 0) return undefined;
        // Sort by distance to nearest rebel (closest first)
        const sorted = [...adjacent].sort((a, b) => {
          const distA = distanceToNearestRebel(game, a);
          const distB = distanceToNearestRebel(game, b);
          return distA - distB; // Closest first
        });
        return sorted[0];
      },
    })
    .chooseFrom<string>('count', {
      prompt: 'How many militia to move?',
      choices: (ctx) => {
        const fromSector = ctx.args.fromSector as Sector;
        if (!fromSector) return ['1'];
        return Array.from({ length: fromSector.dictatorMilitia }, (_, i) => String(i + 1));
      },
      // MERC-p3c: AI moves maximum possible militia
      aiSelect: (ctx) => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const fromSector = ctx.args.fromSector as Sector;
        if (!fromSector) return undefined;
        return String(fromSector.dictatorMilitia); // Move all
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
      // MERC-5aa: AI auto-selection
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const nextAction = getNextAIAction(game);
        if (nextAction?.actionName === 'dictatorMove' && nextAction.unit) {
          return nextAction.unit;
        }
        return undefined;
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
      // MERC-5aa: AI auto-selection
      aiSelect: (ctx) => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const unit = ctx.args.merc as DictatorUnit;
        if (!unit) return undefined;
        const nextAction = getNextAIAction(game);
        if (nextAction?.destination) {
          return nextAction.destination;
        }
        return getAIMoveDestination(game, unit) ?? undefined;
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
      // MERC-5aa: AI auto-selection
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const nextAction = getNextAIAction(game);
        if (nextAction?.actionName === 'dictatorExplore' && nextAction.unit) {
          return nextAction.unit;
        }
        return undefined;
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
      // MERC-5aa: AI auto-selection
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const nextAction = getNextAIAction(game);
        if (nextAction?.actionName === 'dictatorTrain' && nextAction.unit) {
          return nextAction.unit;
        }
        return undefined;
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
      // MERC-5aa: AI auto-selection
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const nextAction = getNextAIAction(game);
        if (nextAction?.actionName === 'dictatorReEquip' && nextAction.unit) {
          return nextAction.unit;
        }
        return undefined;
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
      // MERC-5aa: AI auto-selection
      aiSelect: (ctx) => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const unit = ctx.args.merc as DictatorUnit;
        if (!unit) return undefined;
        return getAIEquipmentSelection(game, unit) ?? undefined;
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

// MERC-7fy: Helper to check if a MERC has a healing item equipped
function hasHealingItem(merc: MercCard): boolean {
  const accessory = merc.accessorySlot;
  if (!accessory) return false;
  const name = accessory.equipmentName.toLowerCase();
  return name.includes('medical kit') || name.includes('first aid kit');
}

// MERC-7fy: Helper to get healing amount from item
function getHealingAmount(itemName: string): number {
  const name = itemName.toLowerCase();
  if (name.includes('medical kit')) return 3; // Medical Kit heals 3
  if (name.includes('first aid kit')) return 1; // First Aid Kit heals 1
  return 0;
}

/**
 * Dictator MERC heal action
 * MERC-7fy: Per rules 4.8, AI heals injured MERCs using healing items
 */
export function createDictatorHealAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorHeal')
    .prompt('Heal injured MERC')
    .condition((ctx) => {
      // Only the dictator player can use dictator MERC actions
      if (!game.isDictatorPlayer(ctx.player as any)) return false;
      const mercs = game.dictatorPlayer?.hiredMercs || [];

      // Check if any MERC has a healing item
      const hasHealer = mercs.some(m => !m.isDead && hasHealingItem(m));
      if (!hasHealer) return false;

      // Check if any MERC needs healing
      const hasDamaged = mercs.some(m => mercNeedsHealing(m));
      return hasDamaged;
    })
    .chooseElement<MercCard>('healer', {
      prompt: 'Select MERC with healing item',
      display: (merc) => `${merc.mercName} (${merc.accessorySlot?.equipmentName})`,
      filter: (element) => {
        if (!(element instanceof MercCard)) return false;
        const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
        if (!dictatorMercs.includes(element)) return false;
        return !element.isDead && hasHealingItem(element);
      },
      // MERC-7fy: AI auto-selection based on healing priority
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const mercs = game.dictatorPlayer.hiredMercs.filter(m => !m.isDead);
        const damagedMercs = mercs.filter(m => mercNeedsHealing(m));
        const healingAction = getAIHealingPriority(game, damagedMercs, mercs);
        if (healingAction?.type === 'item' && healingAction.merc) {
          return healingAction.merc;
        }
        // Fallback to first healer
        return mercs.find(m => hasHealingItem(m));
      },
    })
    .chooseElement<MercCard>('target', {
      prompt: 'Select MERC to heal',
      display: (merc) => `${merc.mercName} (${merc.health}/${merc.maxHealth} HP)`,
      filter: (element) => {
        if (!(element instanceof MercCard)) return false;
        const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
        if (!dictatorMercs.includes(element)) return false;
        return mercNeedsHealing(element);
      },
      // MERC-7fy: AI auto-selection - heal lowest health MERC
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const mercs = game.dictatorPlayer.hiredMercs.filter(m => !m.isDead);
        const damagedMercs = mercs.filter(m => mercNeedsHealing(m));
        const healingAction = getAIHealingPriority(game, damagedMercs, mercs);
        if (healingAction?.target) {
          return healingAction.target;
        }
        // Fallback to lowest health
        return damagedMercs.sort((a, b) => a.health - b.health)[0];
      },
    })
    .execute((args) => {
      const healer = args.healer as MercCard;
      const target = args.target as MercCard;
      const healingItem = healer.accessorySlot;

      if (!healingItem) {
        return { success: false, message: 'No healing item equipped' };
      }

      const healAmount = getHealingAmount(healingItem.equipmentName);
      const actualHealed = Math.min(healAmount, target.damage);

      // Heal the target
      target.heal(actualHealed);

      // Discard the healing item (one-use)
      healer.unequip('Accessory');
      const discard = game.getEquipmentDiscard('Accessory');
      if (discard) {
        healingItem.putInto(discard);
      }

      game.message(`${healer.mercName} uses ${healingItem.equipmentName} to heal ${target.mercName} for ${actualHealed} HP`);
      return { success: true, message: `Healed ${target.mercName} for ${actualHealed} HP` };
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
// MERC-9m9: Dictator Mortar Attack Action
// =============================================================================

/**
 * Check if a dictator unit can fire a mortar.
 * Must have mortar equipped and have valid targets in adjacent sectors.
 */
function canDictatorUnitFireMortar(unit: DictatorUnit, game: MERCGame): boolean {
  if (unit.actionsRemaining < 1 || !unit.sectorId) return false;
  if (!hasMortar(unit)) return false;

  const sector = game.getSector(unit.sectorId);
  if (!sector) return false;

  // Check if there are valid mortar targets
  const targets = getMortarTargets(game, sector);
  return targets.length > 0;
}

/**
 * Dictator mortar attack action.
 * MERC-9m9: Per rules 4.12, AI always attacks with mortars when possible.
 * Mortars attack adjacent sectors without entering them.
 */
export function createDictatorMortarAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorMortar')
    .prompt('Fire mortar at adjacent sector')
    .condition((ctx) => {
      if (!game.isDictatorPlayer(ctx.player as any)) return false;

      const mercs = game.dictatorPlayer?.hiredMercs || [];
      const dictator = game.dictatorPlayer?.dictator;

      const mercCanFire = mercs.some(m => canDictatorUnitFireMortar(m, game));
      const dictatorCanFire = dictator?.inPlay && canDictatorUnitFireMortar(dictator, game);

      return mercCanFire || dictatorCanFire;
    })
    .chooseElement<DictatorUnit>('merc', {
      prompt: 'Select unit to fire mortar',
      display: (unit) => capitalize(getDictatorUnitName(unit)),
      filter: (element) => {
        if (element instanceof MercCard) {
          const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
          return dictatorMercs.includes(element) && canDictatorUnitFireMortar(element, game);
        }
        if (element instanceof DictatorCard) {
          if (!element.inPlay) return false;
          if (element !== game.dictatorPlayer?.dictator) return false;
          return canDictatorUnitFireMortar(element, game);
        }
        return false;
      },
      // MERC-9m9: AI auto-selection - pick first unit with mortar
      aiSelect: () => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const mercs = game.dictatorPlayer.hiredMercs.filter(m => canDictatorUnitFireMortar(m, game));
        if (mercs.length > 0) return mercs[0];
        const dictator = game.dictatorPlayer.dictator;
        if (dictator?.inPlay && canDictatorUnitFireMortar(dictator, game)) {
          return dictator;
        }
        return undefined;
      },
    })
    .chooseElement<Sector>('target', {
      prompt: 'Select target sector',
      elementClass: Sector,
      filter: (element, ctx) => {
        const sector = element as unknown as Sector;
        const unit = ctx.args.merc as DictatorUnit;
        if (!unit?.sectorId) return false;

        const fromSector = game.getSector(unit.sectorId);
        if (!fromSector) return false;

        const validTargets = getMortarTargets(game, fromSector);
        return validTargets.some(t => t.sectorId === sector.sectorId);
      },
      // MERC-9m9: AI auto-selection - pick sector with most targets
      aiSelect: (ctx) => {
        if (!game.dictatorPlayer?.isAI) return undefined;
        const unit = ctx.args.merc as DictatorUnit;
        if (!unit?.sectorId) return undefined;

        const fromSector = game.getSector(unit.sectorId);
        if (!fromSector) return undefined;

        return selectMortarTarget(game, fromSector) ?? undefined;
      },
    })
    .execute((args) => {
      const unit = args.merc as DictatorUnit;
      const targetSector = args.target as Sector;

      // Use action
      unit.useAction(1);

      // Get mortar damage (typically 1 damage per target)
      const mortarDamage = 1;

      game.message(`${getDictatorUnitName(unit)} fires mortar at ${targetSector.sectorName}!`);

      let totalDamage = 0;

      // Damage all rebel MERCs in the sector
      for (const rebel of game.rebelPlayers) {
        const mercsInSector = game.getMercsInSector(targetSector, rebel);
        for (const merc of mercsInSector) {
          merc.takeDamage(mortarDamage);
          totalDamage++;
          game.message(`Mortar deals ${mortarDamage} damage to ${merc.mercName}`);
        }
      }

      // Damage rebel militia in the sector
      for (const rebel of game.rebelPlayers) {
        const militia = targetSector.getRebelMilitia(`${rebel.position}`);
        if (militia > 0) {
          targetSector.removeRebelMilitia(`${rebel.position}`, mortarDamage);
          totalDamage++;
          game.message(`Mortar kills ${mortarDamage} of ${rebel.name}'s militia`);
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
// Day 1 Dictator Actions (MERC-mtoq)
// =============================================================================

/**
 * MERC-f6m6: Place initial militia on unoccupied industries
 * For human dictator: Shows where militia will be placed and confirms
 * For AI dictator: Auto-executes
 */
export function createDictatorPlaceInitialMilitiaAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorPlaceInitialMilitia')
    .prompt('Place initial militia on unoccupied industries')
    .condition(() => {
      // Only available during Day 1 setup
      return game.currentDay === 1;
    })
    .execute(() => {
      placeInitialMilitia(game);
      return { success: true, message: 'Initial militia placed' };
    });
}

/**
 * MERC-i4g5: Hire dictator's first MERC
 * Per rules: Dictator draws 1 random MERC (Castro can draw 3 and pick 1)
 */
export function createDictatorHireFirstMercAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorHireFirstMerc')
    .prompt('Hire your first MERC')
    .condition(() => {
      // Only available during Day 1 setup
      return game.currentDay === 1;
    })
    .execute(() => {
      hireDictatorMerc(game);
      return { success: true, message: 'Dictator MERC hired' };
    });
}

/**
 * Apply dictator's special setup ability
 * This is automatic based on which dictator is selected
 */
export function createDictatorSetupAbilityAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorSetupAbility')
    .prompt('Apply dictator special ability')
    .condition(() => {
      return game.currentDay === 1;
    })
    .execute(() => {
      applyDictatorSetupAbility(game);
      return { success: true, message: 'Dictator ability applied' };
    });
}

/**
 * Draw tactics cards for dictator
 * AI plays from deck top, human gets a hand
 */
export function createDictatorDrawTacticsAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorDrawTactics')
    .prompt('Draw tactics cards')
    .condition(() => {
      return game.currentDay === 1;
    })
    .execute(() => {
      drawTacticsHand(game);
      return { success: true, message: 'Tactics cards drawn' };
    });
}

/**
 * MERC-l2nb: Place extra militia
 * For AI: Distributes evenly among controlled sectors
 * For human: Could allow choice of distribution (future enhancement)
 */
export function createDictatorPlaceExtraMilitiaAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorPlaceExtraMilitia')
    .prompt('Place extra militia')
    .condition(() => {
      return game.currentDay === 1 && game.setupConfig.dictatorStrength.extra > 0;
    })
    .execute(() => {
      autoPlaceExtraMilitia(game);
      return { success: true, message: 'Extra militia placed' };
    });
}

/**
 * Skip extra militia placement (when none to place)
 */
export function createDictatorSkipExtraMilitiaAction(game: MERCGame): ActionDefinition {
  return Action.create('dictatorSkipExtraMilitia')
    .prompt('No extra militia to place')
    .condition(() => {
      return game.currentDay === 1 && game.setupConfig.dictatorStrength.extra === 0;
    })
    .execute(() => {
      return { success: true, message: 'No extra militia' };
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
  game.registerAction(createTakeFromStashAction(game));
  game.registerAction(createTrainAction(game));
  // Attack removed - per rules, combat triggers via movement only
  game.registerAction(createReEquipAction(game));
  game.registerAction(createDocHealAction(game)); // MERC-m4k: Doc's free heal
  game.registerAction(createFeedbackDiscardAction(game)); // MERC-24h: Feedback discard retrieval
  game.registerAction(createSquidheadDisarmAction(game)); // MERC-4qd: Squidhead disarm mines
  game.registerAction(createSquidheadArmAction(game)); // MERC-4qd: Squidhead arm mines
  game.registerAction(createHagnessDrawAction(game)); // MERC-jrph: Hagness draw equipment
  game.registerAction(createHospitalAction(game));
  game.registerAction(createArmsDealerAction(game));
  game.registerAction(createSplitSquadAction(game));
  game.registerAction(createMergeSquadsAction(game));
  // Fire MERC is now only part of the hire action (MERC-yi7)
  game.registerAction(createEndTurnAction(game));

  // MERC-n1f: Combat actions
  game.registerAction(createCombatContinueAction(game));
  game.registerAction(createCombatRetreatAction(game));

  // Day 1 specific actions (Rebel)
  game.registerAction(createHireStartingMercsAction(game));
  game.registerAction(createEquipStartingAction(game));

  // Day 1 specific actions (Dictator) - MERC-mtoq
  game.registerAction(createDictatorPlaceInitialMilitiaAction(game));
  game.registerAction(createDictatorHireFirstMercAction(game));
  game.registerAction(createDictatorSetupAbilityAction(game));
  game.registerAction(createDictatorDrawTacticsAction(game));
  game.registerAction(createDictatorPlaceExtraMilitiaAction(game));
  game.registerAction(createDictatorSkipExtraMilitiaAction(game));

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
  game.registerAction(createDictatorHealAction(game)); // MERC-7fy
  game.registerAction(createDictatorMortarAction(game)); // MERC-9m9
  game.registerAction(createDictatorEndMercActionsAction(game));

  // MERC-xj2: Privacy Player setup
  game.registerAction(createDesignatePrivacyPlayerAction(game));

  // Register debug data for development
  registerDebugData(game);
}

/**
 * Register custom debug data for the MERC game.
 * This data appears in the BoardSmith debug panel under "Custom Debug".
 */
function registerDebugData(game: MERCGame): void {
  // Sector information including stash contents
  game.registerDebug('Sector Stashes', () => {
    return game.getAllSectors().map(sector => ({
      id: sector.sectorId,
      name: sector.sectorName,
      explored: sector.explored,
      loot: {
        weapon: sector.weaponLoot,
        armor: sector.armorLoot,
        accessory: sector.accessoryLoot,
      },
      stashCount: sector.stash.length,
      stash: sector.stash.map(e => e.equipmentName),
    }));
  });

  // Equipment deck status
  game.registerDebug('Equipment Decks', () => ({
    weapons: {
      remaining: game.weaponsDeck?.children?.length ?? 0,
      topCard: game.weaponsDeck?.children?.[0]?.equipmentName ?? 'empty',
    },
    armor: {
      remaining: game.armorDeck?.children?.length ?? 0,
      topCard: game.armorDeck?.children?.[0]?.equipmentName ?? 'empty',
    },
    accessories: {
      remaining: game.accessoriesDeck?.children?.length ?? 0,
      topCard: game.accessoriesDeck?.children?.[0]?.equipmentName ?? 'empty',
    },
  }));

  // Squad locations and MERCs
  game.registerDebug('Squad Locations', () => {
    const result: any[] = [];
    for (const player of game.players) {
      if (game.isRebelPlayer(player)) {
        const rebel = player as RebelPlayer;
        if (rebel.primarySquad) {
          result.push({
            player: rebel.position,
            squad: 'primary',
            sectorId: rebel.primarySquad.sectorId,
            mercs: rebel.primarySquad.getMercs().map(m => ({
              name: m.mercName,
              actions: m.actionsRemaining,
            })),
          });
        }
        if (rebel.secondarySquad) {
          result.push({
            player: rebel.position,
            squad: 'secondary',
            sectorId: rebel.secondarySquad.sectorId,
            mercs: rebel.secondarySquad.getMercs().map(m => ({
              name: m.mercName,
              actions: m.actionsRemaining,
            })),
          });
        }
      }
    }
    return result;
  });
}

// =============================================================================
// MERC-xj2: Privacy Player Designation
// =============================================================================

/**
 * Action to designate the privacy player for AI games.
 * MERC-xj2: Per AI rules, one Rebel player handles all Dictator actions.
 */
export function createDesignatePrivacyPlayerAction(game: MERCGame): ActionDefinition {
  return Action.create('designatePrivacyPlayer')
    .prompt('Designate Privacy Player')
    .condition(() => {
      // Only available during setup when AI is enabled
      return game.dictatorPlayer?.isAI && !game.dictatorPlayer.privacyPlayerId;
    })
    .chooseElement<RebelPlayer>('player', {
      prompt: 'Choose which player will handle AI decisions',
      filter: (element) => {
        return game.rebelPlayers.includes(element as unknown as RebelPlayer);
      },
      display: (player) => (player as unknown as RebelPlayer).name,
    })
    .execute((args) => {
      const player = args.player as unknown as RebelPlayer;
      setPrivacyPlayer(game, `${player.position}`);
      return {
        success: true,
        message: `${player.name} designated as Privacy Player`,
      };
    });
}
