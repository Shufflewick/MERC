/**
 * Rebel Combat Actions
 *
 * MERC-n1f: Interactive Combat Actions
 * These actions allow players to continue or retreat from active combat.
 * MERC-t5k: Player target selection during combat
 */

import { Action, type ActionDefinition } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer } from '../game.js';
import { Sector } from '../elements.js';
import { executeCombat, executeCombatRetreat, getValidRetreatSectors, type Combatant } from '../combat.js';

/**
 * Continue fighting in active combat
 */
export function createCombatContinueAction(game: MERCGame): ActionDefinition {
  return Action.create('combatContinue')
    .prompt('Continue fighting')
    .condition(() => {
      // Can't continue while target selection is pending
      return game.activeCombat !== null &&
             game.activeCombat.pendingTargetSelection === undefined;
    })
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
    .condition(() => {
      // Can't retreat while target selection is pending
      return game.activeCombat !== null &&
             game.activeCombat.pendingTargetSelection === undefined;
    })
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

/**
 * MERC-t5k: Select targets for a MERC during combat
 */
// Helper to build choice string for a target
function buildTargetChoice(target: Combatant, validTargets: Combatant[]): string {
  const baseName = target.name;
  const duplicateCount = validTargets.filter((x: Combatant) => x.name === baseName).length;

  // Count how many of this name appear before this target
  let count = 0;
  for (const t of validTargets) {
    if (t.name === baseName) count++;
    if (t.id === target.id) break;
  }

  return duplicateCount > 1 ? `${baseName} #${count}` : baseName;
}

// Helper to find target from choice string
function findTargetFromChoice(choice: string, validTargets: Combatant[]): Combatant | undefined {
  for (const target of validTargets) {
    if (buildTargetChoice(target, validTargets) === choice) {
      return target;
    }
  }
  return undefined;
}

export function createCombatSelectTargetAction(game: MERCGame): ActionDefinition {
  return Action.create('combatSelectTarget')
    .prompt(() => {
      const pending = game.activeCombat?.pendingTargetSelection;
      if (!pending) return 'Select target';
      return `${pending.attackerName}: Select target${pending.maxTargets > 1 ? ` (up to ${pending.maxTargets})` : ''}`;
    })
    .condition((ctx) => {
      // Only rebels can select targets (this is a rebel combat action)
      if (!game.isRebelPlayer(ctx.player as any)) return false;
      // Must have active combat with pending target selection and at least one valid target
      const hasActiveCombat = game.activeCombat !== null;
      const hasPending = game.activeCombat?.pendingTargetSelection != null;
      const targetCount = game.activeCombat?.pendingTargetSelection?.validTargets?.length || 0;
      return hasActiveCombat && hasPending && targetCount > 0;
    })
    .chooseFrom<string>('targets', {
      prompt: (ctx) => {
        const pending = game.activeCombat?.pendingTargetSelection;
        if (!pending) return 'Select target';
        const name = pending.attackerName.charAt(0).toUpperCase() + pending.attackerName.slice(1);
        return `${name}: Select target`;
      },
      choices: () => {
        const pending = game.activeCombat?.pendingTargetSelection;
        if (!pending) {
          return [];
        }

        return pending.validTargets.map((t: Combatant) =>
          buildTargetChoice(t, pending.validTargets)
        );
      },
      // Use multi-select when MERC can target multiple enemies
      multiSelect: () => {
        const pending = game.activeCombat?.pendingTargetSelection;
        return (!pending || pending.maxTargets <= 1)
          ? undefined
          : { min: 1, max: pending.maxTargets };
      },
    })
    .execute((args) => {
      if (!game.activeCombat || !game.activeCombat.pendingTargetSelection) {
        return { success: false, message: 'No target selection pending' };
      }

      const pending = game.activeCombat.pendingTargetSelection;

      // Handle both single select (string) and multi-select (string[])
      const targetChoices = Array.isArray(args.targets)
        ? args.targets as string[]
        : [args.targets as string];

      if (targetChoices.length === 0) {
        return { success: false, message: 'No targets selected' };
      }

      // Find target IDs from choice strings
      const selectedIds: string[] = [];
      const targetNames: string[] = [];
      for (const choice of targetChoices) {
        const target = findTargetFromChoice(choice, pending.validTargets);
        if (target) {
          selectedIds.push(target.id);
          targetNames.push(target.name);
        }
      }

      if (selectedIds.length === 0) {
        return { success: false, message: 'Invalid target selection' };
      }

      // Initialize selectedTargets map if needed
      if (!game.activeCombat.selectedTargets) {
        game.activeCombat.selectedTargets = new Map();
      }

      // Store all selections for this attacker
      game.activeCombat.selectedTargets.set(pending.attackerId, selectedIds);

      // Clear pending and continue combat
      game.activeCombat.pendingTargetSelection = undefined;

      const targetMsg = targetNames.length === 1
        ? targetNames[0]
        : `${targetNames.length} enemies`;
      game.message(`${pending.attackerName} targets ${targetMsg}.`);

      // Continue combat to check for more MERCs needing selection or execute round
      const sector = game.getSector(game.activeCombat.sectorId);
      if (!sector) {
        return { success: false, message: 'Combat sector not found' };
      }

      const player = game.rebelPlayers.find(
        p => `${p.position}` === game.activeCombat!.attackingPlayerId
      ) as RebelPlayer;

      if (!player) {
        return { success: false, message: 'Attacking player not found' };
      }

      const outcome = executeCombat(game, sector, player);

      return {
        success: true,
        message: outcome.combatPending
          ? 'Combat continues'
          : outcome.rebelVictory
          ? 'Victory!'
          : 'Combat complete',
        data: {
          targetsSelected: targetNames,
          combatPending: outcome.combatPending,
          rebelVictory: outcome.rebelVictory,
          dictatorVictory: outcome.dictatorVictory,
        },
      };
    });
}
