/**
 * Rebel Combat Actions
 *
 * MERC-n1f: Interactive Combat Actions
 * These actions allow players to continue or retreat from active combat.
 * MERC-t5k: Player target selection during combat
 */

import { Action, type ActionDefinition } from 'boardsmith';
import type { MERCGame, RebelPlayer, DictatorPlayer } from '../game.js';
import { Sector, Equipment, CombatantModel } from '../elements.js';
import { executeCombat, executeCombatRetreat, getValidRetreatSectors, canRetreat, clearActiveCombat, type Combatant } from '../combat.js';
import { isHealingItem, getHealingEffect, isEpinephrine } from '../equipment-effects.js';
import { buildArtilleryTargets } from '../tactics-effects.js';
import { capitalize, isRebelPlayer, isMerc, isCombatantModel } from './helpers.js';
import { applyMortarDamage } from './rebel-equipment.js';

/**
 * Continue fighting in active combat
 */
export function createCombatContinueAction(game: MERCGame): ActionDefinition {
  return Action.create('combatContinue')
    .prompt('Continue fighting')
    .condition({
      'has active combat': () => game.activeCombat !== null,
      'no pending target selection': () => game.activeCombat?.pendingTargetSelection === undefined,
      'no pending hit allocation': () => game.activeCombat?.pendingHitAllocation === undefined,
      'no pending attack dog selection': () => game.activeCombat?.pendingAttackDogSelection === undefined,
      'no pending wolverine sixes': () => game.activeCombat?.pendingWolverineSixes === undefined,
      'no pending epinephrine': () => game.activeCombat?.pendingEpinephrine === undefined,
    })
    .execute((_, ctx) => {
      if (!game.activeCombat) {
        return { success: false, message: 'No active combat' };
      }

      if (game.activeCombat.awaitingRetreatDecisions) {
        if (!game.activeCombat.retreatDecisions) {
          game.activeCombat.retreatDecisions = new Map();
        }
        game.activeCombat.retreatDecisions.set(`${ctx.player.seat}`, { action: 'continue' });
        return {
          success: true,
          message: 'Continue decision recorded',
          data: { combatPending: true },
        };
      }

      const sector = game.getSector(game.activeCombat.sectorId);
      if (!sector) {
        return { success: false, message: 'Combat sector not found' };
      }

      // Use the attacking player from activeCombat, not ctx.player — ctx.player may
      // be the dictator when combat continues after dictator retreat leaves militia behind.
      const attackingPlayer = game.rebelPlayers.find(
        p => `${p.seat}` === game.activeCombat!.attackingPlayerId
      );
      if (!attackingPlayer) {
        return { success: false, message: 'Attacking player not found' };
      }
      const outcome = executeCombat(game, sector, attackingPlayer);

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
    .condition({
      'has active combat': () => game.activeCombat !== null,
      'no pending target selection': () => game.activeCombat?.pendingTargetSelection === undefined,
      'no pending hit allocation': () => game.activeCombat?.pendingHitAllocation === undefined,
      'no pending attack dog selection': () => game.activeCombat?.pendingAttackDogSelection === undefined,
      'no pending wolverine sixes': () => game.activeCombat?.pendingWolverineSixes === undefined,
      'no pending epinephrine': () => game.activeCombat?.pendingEpinephrine === undefined,
      'current player can retreat': (ctx) => {
        if (!game.activeCombat) return false;
        // Must be a rebel or dictator player
        const isRebel = game.isRebelPlayer(ctx.player);
        const isDictator = game.isDictatorPlayer(ctx.player);
        if (!isRebel && !isDictator) return false;
        const combatSector = game.getSector(game.activeCombat.sectorId);
        if (!combatSector) return false;
        return canRetreat(game, combatSector, ctx.player as RebelPlayer | DictatorPlayer);
      },
    })
    .chooseElement<Sector>('retreatSector', {
      prompt: 'Choose sector to retreat to',
      elementClass: Sector,
      filter: (element, ctx) => {
        if (!game.activeCombat) return false;
        // Must be a rebel or dictator player
        if (!game.isRebelPlayer(ctx.player) && !game.isDictatorPlayer(ctx.player)) return false;
        const sector = element as unknown as Sector;
        const combatSector = game.getSector(game.activeCombat.sectorId);
        if (!combatSector) return false;
        // Use ctx.player (the current player clicking retreat) instead of attackingPlayerId
        const player = ctx.player as RebelPlayer | DictatorPlayer;
        const validSectors = getValidRetreatSectors(game, combatSector, player);
        return validSectors.some(s => s.sectorId === sector.sectorId);
      },
      boardRef: (element) => ({ id: (element as unknown as Sector).id }),
    })
    .execute((args, ctx) => {
      const retreatSector = args.retreatSector as Sector;
      if (!retreatSector) {
        return { success: false, message: 'No retreat sector provided' };
      }

      const player = ctx.player as RebelPlayer | DictatorPlayer;

      if (game.activeCombat?.awaitingRetreatDecisions) {
        if (!game.activeCombat.retreatDecisions) {
          game.activeCombat.retreatDecisions = new Map();
        }
        game.activeCombat.retreatDecisions.set(`${ctx.player.seat}`, {
          action: 'retreat',
          retreatSectorId: retreatSector.sectorId,
        });
        return {
          success: true,
          message: `Retreat decision recorded (${retreatSector.sectorName})`,
          data: { retreated: true, retreatSector: retreatSector.sectorName },
        };
      }

      const outcome = executeCombatRetreat(game, retreatSector, player);

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
 * Uses chooseFrom() with smart resolution - CombatPanel can send element IDs directly
 */
export function createCombatSelectTargetAction(game: MERCGame): ActionDefinition {
  return Action.create('combatSelectTarget')
    .prompt('Select target')
    .condition({
      'player can select targets for this attacker': (ctx) => {
        // Must have active combat with pending target selection
        if (!game.activeCombat?.pendingTargetSelection) return false;
        const pending = game.activeCombat.pendingTargetSelection;
        if (pending.validTargets.length === 0) return false;

        // Find the attacker to check which side they're on
        const attacker = game.activeCombat.rebelCombatants?.find(c => c.id === pending.attackerId) ||
                         game.activeCombat.dictatorCombatants?.find(c => c.id === pending.attackerId);
        if (!attacker) return false;

        // Player can only select targets for units on their side
        const playerIsRebel = isRebelPlayer(ctx.player);
        const playerIsDictator = game.isDictatorPlayer(ctx.player);
        const dictatorIsAI = game.dictatorPlayer?.isAI;

        if (playerIsRebel) {
          return !attacker.isDictatorSide;  // Rebel selects for rebel units
        }
        if (playerIsDictator && !dictatorIsAI) {
          return attacker.isDictatorSide;   // Dictator selects for dictator units
        }
        return false;
      },
    })
    .chooseFrom<string>('targets', {
      prompt: 'Select target',
      choices: () => {
        const pending = game.activeCombat?.pendingTargetSelection;
        if (!pending) return [];
        return pending.validTargets.map((t: Combatant) => t.id);
      },
      display: (id: string) => {
        const pending = game.activeCombat?.pendingTargetSelection;
        if (!pending) return id;
        const target = pending.validTargets.find((t: Combatant) => t.id === id);
        if (!target) return id;
        // Add #N suffix for duplicate names in display
        const baseName = target.name;
        const duplicateCount = pending.validTargets.filter((x: Combatant) => x.name === baseName).length;
        if (duplicateCount > 1) {
          const targetIndex = pending.validTargets.findIndex((t: Combatant) => t.id === id);
          const countBefore = pending.validTargets.slice(0, targetIndex + 1).filter((x: Combatant) => x.name === baseName).length;
          return `${baseName} #${countBefore}`;
        }
        return baseName;
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

      // args.targets contains string IDs directly (single or array)
      const targetIds = Array.isArray(args.targets)
        ? args.targets as string[]
        : [args.targets as string];

      if (targetIds.length === 0) {
        return { success: false, message: 'No targets selected' };
      }

      // Look up target names for the message
      const targetNames = targetIds
        .map(id => pending.validTargets.find(t => t.id === id)?.name)
        .filter((name): name is string => !!name);

      // Initialize selectedTargets map if needed
      if (!game.activeCombat.selectedTargets) {
        game.activeCombat.selectedTargets = new Map();
      }

      // Store all selections for this attacker
      game.activeCombat.selectedTargets.set(pending.attackerId, targetIds);

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

      // Find attacking player - fallback to first rebel if lookup fails
      // (can happen when dictator initiates combat by moving into rebel sector)
      const player = game.rebelPlayers.find(
        p => `${p.seat}` === game.activeCombat!.attackingPlayerId
      ) ?? game.rebelPlayers[0];

      if (!player) {
        return { success: false, message: 'No rebel players found' };
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

// =============================================================================
// Attack Dog Assignment
// =============================================================================

/**
 * MERC-l09: Player choice for Attack Dog assignment
 * When a human-controlled MERC with Attack Dog attacks, they choose which enemy to assign it to
 */
export function createCombatAssignAttackDogAction(game: MERCGame): ActionDefinition {
  return Action.create('combatAssignAttackDog')
    .prompt('Assign Attack Dog')
    .condition({
      'player can assign attack dog for this attacker': (ctx) => {
        // Must have active combat with pending dog selection
        if (!game.activeCombat?.pendingAttackDogSelection) return false;
        const pending = game.activeCombat.pendingAttackDogSelection;
        if (pending.validTargets.length === 0) return false;

        // Find the attacker to check which side they're on
        const attacker = game.activeCombat.rebelCombatants?.find(c => c.id === pending.attackerId) ||
                         game.activeCombat.dictatorCombatants?.find(c => c.id === pending.attackerId);
        if (!attacker) return false;

        // Player can only assign dogs for units on their side
        if (isRebelPlayer(ctx.player)) {
          return !attacker.isDictatorSide;  // Rebel assigns for rebel units
        }
        if (game.isDictatorPlayer(ctx.player) && !game.dictatorPlayer?.isAI) {
          return attacker.isDictatorSide;   // Dictator assigns for dictator units
        }
        return false;
      },
    })
    .chooseFrom<string>('target', {
      prompt: 'Assign Attack Dog to',
      choices: () => {
        const pending = game.activeCombat?.pendingAttackDogSelection;
        if (!pending) return [];
        return pending.validTargets.map((t: Combatant) => t.id);
      },
      display: (id: string) => {
        const pending = game.activeCombat?.pendingAttackDogSelection;
        if (!pending) return id;
        const target = pending.validTargets.find((t: Combatant) => t.id === id);
        if (!target) return id;
        // Add #N suffix for duplicate names
        const baseName = target.name;
        const duplicateCount = pending.validTargets.filter((x: Combatant) => x.name === baseName).length;
        if (duplicateCount > 1) {
          const targetIndex = pending.validTargets.findIndex((t: Combatant) => t.id === id);
          const countBefore = pending.validTargets.slice(0, targetIndex + 1).filter((x: Combatant) => x.name === baseName).length;
          return `${baseName} #${countBefore}`;
        }
        return baseName;
      },
    })
    .execute((args) => {
      if (!game.activeCombat || !game.activeCombat.pendingAttackDogSelection) {
        return { success: false, message: 'No Attack Dog selection pending' };
      }

      const pending = game.activeCombat.pendingAttackDogSelection;
      const targetId = args.target as string;

      if (!targetId) {
        return { success: false, message: 'No target selected' };
      }

      // Look up target name for the message
      const targetName = pending.validTargets.find(t => t.id === targetId)?.name;

      // Initialize selectedDogTargets map if needed
      if (!game.activeCombat.selectedDogTargets) {
        game.activeCombat.selectedDogTargets = new Map();
      }

      // Store the selection for this attacker
      game.activeCombat.selectedDogTargets.set(pending.attackerId, targetId);

      // Clear pending and continue combat
      game.activeCombat.pendingAttackDogSelection = undefined;

      game.message(`${pending.attackerName} will release Attack Dog on ${targetName}.`);

      // Continue combat to execute the dog assignment and round
      const sector = game.getSector(game.activeCombat.sectorId);
      if (!sector) {
        return { success: false, message: 'Combat sector not found' };
      }

      // Find attacking player - fallback to first rebel if lookup fails
      const player = game.rebelPlayers.find(
        p => `${p.seat}` === game.activeCombat!.attackingPlayerId
      ) ?? game.rebelPlayers[0];

      if (!player) {
        return { success: false, message: 'No rebel players found' };
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
          dogTarget: targetName,
          combatPending: outcome.combatPending,
          rebelVictory: outcome.rebelVictory,
          dictatorVictory: outcome.dictatorVictory,
        },
      };
    });
}

// =============================================================================
// Combat Healing with Medical Kit / First Aid Kit
// =============================================================================

/**
 * Helper to find mercs with healing items (Medical Kit / First Aid Kit)
 */
function getMercsWithHealingItems(combatants: Combatant[]): Array<{
  combatant: Combatant;
  merc: CombatantModel;
  healingItem: Equipment;
}> {
  const result: Array<{ combatant: Combatant; merc: CombatantModel; healingItem: Equipment }> = [];

  for (const combatant of combatants) {
    if (combatant.health <= 0) continue;
    if (!isCombatantModel(combatant.sourceElement) || !combatant.sourceElement.isMerc) continue;

    const merc = combatant.sourceElement;

    // Check accessory slot
    if (merc.accessorySlot && isHealingItem(merc.accessorySlot.equipmentId)) {
      const uses = merc.accessorySlot.usesRemaining ?? getHealingEffect(merc.accessorySlot.equipmentId)?.totalUses ?? 1;
      if (uses > 0) {
        result.push({ combatant, merc, healingItem: merc.accessorySlot });
      }
    }

    // Check bandolier slots
    for (const bSlot of merc.bandolierSlots) {
      if (isHealingItem(bSlot.equipmentId)) {
        const uses = bSlot.usesRemaining ?? getHealingEffect(bSlot.equipmentId)?.totalUses ?? 1;
        if (uses > 0) {
          result.push({ combatant, merc, healingItem: bSlot });
        }
      }
    }
  }

  return result;
}

/**
 * Helper to find damaged mercs that can be healed
 */
function getDamagedMercs(combatants: Combatant[]): Combatant[] {
  return combatants.filter(c =>
    c.health > 0 &&
    c.health < c.maxHealth &&
    isCombatantModel(c.sourceElement) &&
    c.sourceElement.isMerc
  );
}

function isCombatDecisionPlayer(game: MERCGame, player: unknown, combatantId: string): boolean {
  if (!game.activeCombat) return false;
  const attacker = [...(game.activeCombat.rebelCombatants ?? []),
                    ...(game.activeCombat.dictatorCombatants ?? [])]
    .find(c => c.id === combatantId);
  if (!attacker) return false;

  if (attacker.isDictatorSide) {
    return game.isDictatorPlayer(player);
  }

  if (!game.isRebelPlayer(player)) return false;

  const playerSeat = `${(player as { seat?: number }).seat ?? ''}`;

  if (attacker.sourceElement) {
    const owner = game.rebelPlayers.find(p =>
      p.team.some(m => m.id === attacker.sourceElement!.id)
    );
    if (owner) return `${owner.seat}` === playerSeat;
  }

  if (attacker.ownerId) {
    return `${attacker.ownerId}` === playerSeat;
  }

  return game.rebelPlayers.length === 1;
}

// =============================================================================
// MERC-dice: Combat Hit Allocation Actions
// =============================================================================

/**
 * Allocate hits to targets during combat.
 * Called when player confirms their hit allocation in the CombatPanel UI.
 * Takes a map of targetId -> number of hits allocated.
 */
export function createCombatAllocateHitsAction(game: MERCGame): ActionDefinition {
  return Action.create('combatAllocateHits')
    .prompt('Confirm hit allocation')
    .condition({
      'has pending hit allocation': () => game.activeCombat?.pendingHitAllocation != null,
      'player controls this attacker': (ctx) => {
        const pending = game.activeCombat?.pendingHitAllocation;
        if (!pending) return false;
        const attacker = [...(game.activeCombat?.rebelCombatants ?? []),
                          ...(game.activeCombat?.dictatorCombatants ?? [])]
          .find(c => c.id === pending.attackerId);
        if (!attacker) return isRebelPlayer(ctx.player); // fallback for MERCs
        if (attacker.isDictatorSide) return game.isDictatorPlayer(ctx.player);
        return isRebelPlayer(ctx.player);
      },
    })
    .chooseFrom<string>('allocations', {
      prompt: 'Allocate hits to targets',
      multiSelect: () => {
        const pending = game.activeCombat?.pendingHitAllocation;
        if (!pending) return undefined;
        // Allow selecting up to `hits` targets (can hit same target multiple times)
        return { min: 1, max: pending.hits };
      },
      choices: () => {
        const pending = game.activeCombat?.pendingHitAllocation;
        if (!pending) return [];
        // Build choices - each target can be selected multiple times up to their health
        const choices: string[] = [];
        for (const target of pending.validTargets) {
          // Allow targeting up to their current health times
          for (let i = 0; i < target.currentHealth; i++) {
            choices.push(`${target.id}::${i}`);
          }
        }
        return choices;
      },
      display: (choice: string) => {
        const pending = game.activeCombat?.pendingHitAllocation;
        if (!pending) return choice;
        const targetId = choice.split('::')[0];
        const target = pending.validTargets.find(t => t.id === targetId);
        if (!target) return choice;
        // Capitalize target name for display
        return target.name.charAt(0).toUpperCase() + target.name.slice(1);
      },
    })
    .execute((args, _ctx) => {
      if (!game.activeCombat?.pendingHitAllocation) {
        return { success: false, message: 'No hit allocation pending' };
      }

      const pending = game.activeCombat.pendingHitAllocation;

      const allocChoices = Array.isArray(args.allocations)
        ? args.allocations as unknown[]
        : [args.allocations];

      // Parse allocation choices into targetId -> hitCount map
      // Format is "targetId::hitIndex" - may come as string or {value, display} object
      const hitsByTarget = new Map<string, number>();
      for (const choice of allocChoices) {
        // Handle both string format (from CombatPanel) and object format (from ActionPanel)
        const choiceStr = typeof choice === 'string' ? choice :
          (choice && typeof choice === 'object' && 'value' in choice) ? String((choice as { value: unknown }).value) : String(choice);
        const parts = choiceStr.split('::');
        const targetId = parts[0];
        hitsByTarget.set(targetId, (hitsByTarget.get(targetId) ?? 0) + 1);
      }

      // Store the allocation for combat.ts to use
      if (!game.activeCombat.selectedTargets) {
        game.activeCombat.selectedTargets = new Map();
      }

      // Convert to array of target IDs (repeated for multiple hits)
      const targetIds: string[] = [];
      hitsByTarget.forEach((count, targetId) => {
        for (let i = 0; i < count; i++) {
          targetIds.push(targetId);
        }
      });
      game.activeCombat.selectedTargets.set(`allocation:${pending.attackerId}`, targetIds);

      // Clear pending allocation
      game.activeCombat.pendingHitAllocation = undefined;

      // Log allocation
      const allocMsg = Array.from(hitsByTarget.entries())
        .map(([targetId, count]) => {
          const target = pending.validTargets.find(t => t.id === targetId);
          return `${target?.name ?? 'Unknown'} x${count}`;
        })
        .join(', ');
      game.message(`${pending.attackerName} allocates hits: ${allocMsg}`);

      // Continue combat
      const sector = game.getSector(game.activeCombat.sectorId);
      if (!sector) {
        return { success: false, message: 'Combat sector not found' };
      }

      // Find attacking player from activeCombat state (executeCombat uses stored state when resuming)
      const player = game.rebelPlayers.find(
        p => `${p.seat}` === game.activeCombat!.attackingPlayerId
      ) ?? game.rebelPlayers[0];

      if (!player) {
        return { success: false, message: 'No rebel players found' };
      }

      const outcome = executeCombat(game, sector, player);

      return {
        success: true,
        message: outcome.combatPending ? 'Hits allocated' : 'Combat complete',
        data: {
          allocations: Object.fromEntries(hitsByTarget),
          combatPending: outcome.combatPending,
        },
      };
    });
}

/**
 * Use Basic's reroll ability during hit allocation.
 * Rerolls all dice once per combat (per Basic's ability).
 */
export function createCombatBasicRerollAction(game: MERCGame): ActionDefinition {
  return Action.create('combatBasicReroll')
    .prompt("Use Basic's reroll")
    .condition({
      'has pending hit allocation': () => game.activeCombat?.pendingHitAllocation != null,
      'can reroll and has not already': () => {
        const pending = game.activeCombat?.pendingHitAllocation;
        return (pending?.canReroll && !pending?.hasRerolled) ?? false;
      },
      'player controls this attacker': (ctx) => {
        const pending = game.activeCombat?.pendingHitAllocation;
        if (!pending) return false;
        const attacker = [...(game.activeCombat?.rebelCombatants ?? []),
                          ...(game.activeCombat?.dictatorCombatants ?? [])]
          .find(c => c.id === pending.attackerId);
        if (!attacker) return isRebelPlayer(ctx.player);
        if (attacker.isDictatorSide) return game.isDictatorPlayer(ctx.player);
        return isRebelPlayer(ctx.player);
      },
    })
    .execute(() => {
      if (!game.activeCombat?.pendingHitAllocation) {
        return { success: false, message: 'No hit allocation pending' };
      }

      const pending = game.activeCombat.pendingHitAllocation;

      // Roll new dice using seeded random
      const diceCount = pending.diceRolls.length;
      const newRolls: number[] = [];
      for (let i = 0; i < diceCount; i++) {
        newRolls.push(Math.floor(game.random() * 6) + 1);
      }

      // Count new hits
      const newHits = newRolls.filter(r => r >= pending.hitThreshold).length;

      // Count Wolverine 6s if applicable
      const isWolverine = pending.attackerCombatantId === 'wolverine';
      const newWolverineSixes = isWolverine ? newRolls.filter(r => r === 6).length : 0;

      game.message(`${pending.attackerName} uses reroll ability! [${newRolls.join(', ')}] - ${newHits} hit(s)`);

      // Update pending allocation
      game.activeCombat.pendingHitAllocation = {
        ...pending,
        diceRolls: newRolls,
        hits: newHits,
        wolverineSixes: newWolverineSixes,
        hasRerolled: true,
        rollCount: pending.rollCount + 1, // Increment to trigger animation
      };

      return {
        success: true,
        message: `Rerolled: ${newHits} hit(s)`,
        data: {
          oldRolls: pending.diceRolls,
          newRolls,
          oldHits: pending.hits,
          newHits,
        },
      };
    });
}

/**
 * Allocate Wolverine's bonus 6s to additional targets.
 * Called after normal hit allocation when Wolverine rolled 6s.
 */
export function createCombatAllocateWolverineSixesAction(game: MERCGame): ActionDefinition {
  return Action.create('combatAllocateWolverineSixes')
    .prompt("Allocate Wolverine's bonus targets")
    .condition({
      'has pending Wolverine sixes': () => game.activeCombat?.pendingWolverineSixes != null,
      'is rebel player': (ctx) => isRebelPlayer(ctx.player),
    })
    .chooseFrom<string>('bonusTargets', {
      prompt: "Select Wolverine's bonus targets",
      multiSelect: () => {
        const pending = game.activeCombat?.pendingWolverineSixes;
        if (!pending) return undefined;
        return { min: 1, max: pending.sixCount };
      },
      choices: () => {
        const pending = game.activeCombat?.pendingWolverineSixes;
        if (!pending) return [];
        return pending.bonusTargets.map(t => `${t.name}::${t.id}`);
      },
    })
    .execute((args) => {
      if (!game.activeCombat?.pendingWolverineSixes) {
        return { success: false, message: 'No Wolverine allocation pending' };
      }

      const pending = game.activeCombat.pendingWolverineSixes;
      const targetChoices = Array.isArray(args.bonusTargets)
        ? args.bonusTargets as string[]
        : [args.bonusTargets as string];

      // Parse target IDs
      const targetIds = targetChoices.map(choice => choice.split('::')[1]);
      const targetNames = targetChoices.map(choice => choice.split('::')[0]);

      // Store for combat processing
      if (!game.activeCombat.selectedTargets) {
        game.activeCombat.selectedTargets = new Map();
      }
      game.activeCombat.selectedTargets.set(`wolverine:${pending.attackerId}`, targetIds);

      // Clear pending
      game.activeCombat.pendingWolverineSixes = undefined;

      game.message(`${pending.attackerName}'s 6s hit: ${targetNames.join(', ')}`);

      // Continue combat
      const sector = game.getSector(game.activeCombat.sectorId);
      if (!sector) {
        return { success: false, message: 'Combat sector not found' };
      }

      // Find attacking player - fallback to first rebel if lookup fails
      const player = game.rebelPlayers.find(
        p => `${p.seat}` === game.activeCombat!.attackingPlayerId
      ) ?? game.rebelPlayers[0];

      if (!player) {
        return { success: false, message: 'No rebel players found' };
      }

      const outcome = executeCombat(game, sector, player);

      return {
        success: true,
        message: 'Wolverine bonus hits allocated',
        data: {
          bonusTargets: targetNames,
          combatPending: outcome.combatPending,
        },
      };
    });
}

/**
 * Use Medical Kit or First Aid Kit during combat.
 * Per rules: "On your initiative before your attack, discard 1 combat die to heal 1 wound"
 * Cost: 1 combat die (reduces dice rolled this round)
 */
export function createCombatHealAction(game: MERCGame): ActionDefinition {
  return Action.create('combatHeal')
    .prompt('Use Medical Kit')
    .condition({
      'has active combat': () => game.activeCombat != null,
      'no pending target selection': () => !game.activeCombat?.pendingTargetSelection,
      'no pending hit allocation': () => !game.activeCombat?.pendingHitAllocation,
      'has pending before-attack healing': () => game.activeCombat?.pendingBeforeAttackHealing != null,
      'is controlling player': (ctx) => {
        const pending = game.activeCombat?.pendingBeforeAttackHealing;
        if (!pending) return false;
        return isCombatDecisionPlayer(game, ctx.player, pending.attackerId);
      },
      'has healer with item and dice to use': () => {
        if (!game.activeCombat) return false;
        const rebelCombatants = game.activeCombat.rebelCombatants as Combatant[];

        // Must have at least one MERC with a healing item that has uses
        const mercsWithHealing = getMercsWithHealingItems(rebelCombatants);
        if (mercsWithHealing.length === 0) return false;

        // Must have at least one damaged MERC
        const damagedMercs = getDamagedMercs(rebelCombatants);
        if (damagedMercs.length === 0) return false;

        // At least one healer must have combat dice remaining to discard
        for (const { combatant } of mercsWithHealing) {
          const diceUsed = game.activeCombat.healingDiceUsed?.get(combatant.id) ?? 0;
          if (combatant.combat - diceUsed > 0) return true;
        }

        return false;
      },
    })
    .chooseFrom<string>('healer', {
      prompt: 'Select MERC to use healing item',
      choices: () => {
        if (!game.activeCombat) return [];
        const rebelCombatants = game.activeCombat.rebelCombatants as Combatant[];
        const mercsWithHealing = getMercsWithHealingItems(rebelCombatants);

        return mercsWithHealing
          .filter(({ combatant }) => {
            const diceUsed = game.activeCombat?.healingDiceUsed?.get(combatant.id) ?? 0;
            return combatant.combat - diceUsed > 0;
          })
          .map(({ merc, healingItem }) =>
            `${capitalize(merc.combatantName)} (${healingItem.equipmentName})`
          );
      },
    })
    .chooseFrom<string>('target', {
      prompt: 'Select MERC to heal',
      choices: () => {
        if (!game.activeCombat) return [];
        const rebelCombatants = game.activeCombat.rebelCombatants as Combatant[];
        const damagedMercs = getDamagedMercs(rebelCombatants);

        return damagedMercs.map(c => {
          const merc = c.sourceElement as CombatantModel;
          const damage = c.maxHealth - c.health;
          return `${capitalize(merc.combatantName)} (${damage} damage)`;
        });
      },
    })
    .execute((args) => {
      if (!game.activeCombat) {
        return { success: false, message: 'No active combat' };
      }

      const healerChoice = args.healer as string;
      const targetChoice = args.target as string;

      const rebelCombatants = game.activeCombat.rebelCombatants as Combatant[];

      // Find the healer
      const mercsWithHealing = getMercsWithHealingItems(rebelCombatants);
      const healerData = mercsWithHealing.find(({ merc, healingItem }) =>
        `${capitalize(merc.combatantName)} (${healingItem.equipmentName})` === healerChoice
      );

      if (!healerData) {
        return { success: false, message: 'Healer not found' };
      }

      // Find the target
      const damagedMercs = getDamagedMercs(rebelCombatants);
      const targetCombatant = damagedMercs.find(c => {
        const merc = c.sourceElement as CombatantModel;
        const damage = c.maxHealth - c.health;
        return `${capitalize(merc.combatantName)} (${damage} damage)` === targetChoice;
      });

      if (!targetCombatant) {
        return { success: false, message: 'Target not found' };
      }

      const { combatant: healerCombatant, merc: healerMerc, healingItem } = healerData;
      const targetMerc = targetCombatant.sourceElement as CombatantModel;

      const healingEffect = getHealingEffect(healingItem.equipmentId);
      if (!healingEffect) {
        return { success: false, message: 'Healing item has no effect' };
      }

      // Check healer has enough combat dice
      const diceUsedAlready = game.activeCombat.healingDiceUsed?.get(healerCombatant.id) ?? 0;
      const availableDice = healerCombatant.combat - diceUsedAlready;
      if (availableDice < healingEffect.dicePerHeal) {
        return { success: false, message: 'Not enough combat dice to heal' };
      }

      // Initialize healingDiceUsed map if needed
      if (!game.activeCombat.healingDiceUsed) {
        game.activeCombat.healingDiceUsed = new Map();
      }

      // Pre-compute heal values for event data
      const healAmount = Math.min(healingEffect.healPerUse, targetCombatant.maxHealth - targetCombatant.health);
      const healthAfter = targetCombatant.health + healAmount;

      game.animate('combat-heal', {
        healerName: capitalize(healerMerc.combatantName),
        healerId: healerCombatant.id,
        targetName: capitalize(targetMerc.combatantName),
        targetId: targetCombatant.id,
        healAmount,
        healthBefore: targetCombatant.health,
        healthAfter,
        itemName: healingItem.equipmentName,
      });
      // Track dice discarded
      game.activeCombat!.healingDiceUsed.set(
        healerCombatant.id,
        diceUsedAlready + healingEffect.dicePerHeal
      );

      // Heal the target (both combatant and source merc)
      targetCombatant.health += healAmount;
      targetMerc.heal(healAmount);

      // Use up the healing item
      if (healingItem.usesRemaining === undefined) {
        healingItem.usesRemaining = healingEffect.totalUses;
      }
      healingItem.usesRemaining--;

      // If uses exhausted, discard the item
      if (healingItem.usesRemaining <= 0) {
        if (healerMerc.accessorySlot?.id === healingItem.id) {
          healerMerc.unequip('Accessory');
        } else {
          const bIdx = healerMerc.bandolierSlots.findIndex(e => e.id === healingItem.id);
          if (bIdx >= 0) {
            healerMerc.unequipBandolierSlot(bIdx);
          }
        }

        const discard = game.getEquipmentDiscard('Accessory');
        if (discard) {
          healingItem.putInto(discard);
        }

        game.message(`${healerMerc.combatantName} uses ${healingItem.equipmentName} to heal ${targetMerc.combatantName} for ${healAmount} - item exhausted!`);
      } else {
        game.message(`${healerMerc.combatantName} uses ${healingItem.equipmentName} to heal ${targetMerc.combatantName} for ${healAmount} (${healingItem.usesRemaining} uses left)`);
      }

      return {
        success: true,
        message: `Healed ${targetMerc.combatantName} for ${healAmount}`,
        data: {
          healer: healerMerc.combatantName,
          target: targetMerc.combatantName,
          healAmount,
          diceDiscarded: healingEffect.dicePerHeal,
        },
      };
    });
}

// =============================================================================
// Before-Attack Healing Actions (Medical Kit, First Aid Kit, Surgeon)
// =============================================================================

/**
 * Use healing item BEFORE a MERC's attack.
 * Rules: "On your initiative, before your attack, discard 1 combat dice to heal..."
 * This is triggered when pendingBeforeAttackHealing is set, not at end of round.
 */
export function createCombatBeforeAttackHealAction(game: MERCGame): ActionDefinition {
  return Action.create('combatBeforeAttackHeal')
    .prompt('Use healing item')
    .condition({
      'has pending before-attack healing': () => game.activeCombat?.pendingBeforeAttackHealing != null,
      'is controlling player': (ctx) => {
        const pending = game.activeCombat?.pendingBeforeAttackHealing;
        if (!pending) return false;
        return isCombatDecisionPlayer(game, ctx.player, pending.attackerId);
      },
    })
    .chooseFrom<string>('healer', {
      prompt: 'Select MERC to use healing item',
      choices: () => {
        const pending = game.activeCombat?.pendingBeforeAttackHealing;
        if (!pending) return [];
        return pending.availableHealers.map(h => `${h.healerName} (${h.itemName})`);
      },
    })
    .chooseFrom<string>('target', {
      prompt: 'Select MERC to heal',
      choices: () => {
        const pending = game.activeCombat?.pendingBeforeAttackHealing;
        if (!pending) return [];
        return pending.damagedAllies.map(a => `${a.name} (${a.damage} damage)`);
      },
    })
    .execute((args) => {
      if (!game.activeCombat?.pendingBeforeAttackHealing) {
        return { success: false, message: 'No pending healing decision' };
      }

      const pending = game.activeCombat.pendingBeforeAttackHealing;
      const healerChoice = args.healer as string;
      const targetChoice = args.target as string;

      // Find the selected healer
      const healerData = pending.availableHealers.find(h =>
        `${h.healerName} (${h.itemName})` === healerChoice
      );
      if (!healerData) {
        return { success: false, message: 'Healer not found' };
      }

      // Find the selected target
      const targetData = pending.damagedAllies.find(a =>
        `${a.name} (${a.damage} damage)` === targetChoice
      );
      if (!targetData) {
        return { success: false, message: 'Target not found' };
      }

      // Find the actual combatant objects
      const rebelCombatants = game.activeCombat.rebelCombatants as Combatant[];
      const dictatorCombatants = game.activeCombat.dictatorCombatants as Combatant[];
      const allCombatants = [...rebelCombatants, ...dictatorCombatants];

      const healerCombatant = allCombatants.find(c => c.id === healerData.healerId);
      if (!healerCombatant || !isCombatantModel(healerCombatant.sourceElement)) {
        return { success: false, message: 'Healer combatant not found' };
      }
      const healerMerc = healerCombatant.sourceElement;

      const targetCombatant = allCombatants.find(c => c.id === targetData.id);
      if (!targetCombatant || !isCombatantModel(targetCombatant.sourceElement)) {
        return { success: false, message: 'Target combatant not found' };
      }
      const targetMerc = targetCombatant.sourceElement;

      // Find the healing item
      let healingItem: Equipment | null = null;
      if (healerMerc.accessorySlot?.equipmentId === healerData.healingItemId) {
        healingItem = healerMerc.accessorySlot;
      } else {
        healingItem = healerMerc.bandolierSlots.find(b => b.equipmentId === healerData.healingItemId) ?? null;
      }
      if (!healingItem) {
        return { success: false, message: 'Healing item not found' };
      }

      // Initialize healingDiceUsed map if needed
      if (!game.activeCombat.healingDiceUsed) {
        game.activeCombat.healingDiceUsed = new Map();
      }

      // Pre-compute heal values for event data
      const diceUsed = game.activeCombat.healingDiceUsed.get(healerCombatant.id) ?? 0;
      const healAmount = Math.min(healerData.healPerUse, targetCombatant.maxHealth - targetCombatant.health);
      const healthAfter = targetCombatant.health + healAmount;

      game.animate('combat-heal', {
        healerName: capitalize(healerMerc.combatantName),
        healerId: healerCombatant.id,
        targetName: capitalize(targetMerc.combatantName),
        targetId: targetCombatant.id,
        healAmount,
        healthBefore: targetCombatant.health,
        healthAfter,
        itemName: healingItem.equipmentName,
      });
      // Track dice discarded
      game.activeCombat!.healingDiceUsed.set(healerCombatant.id, diceUsed + healerData.dicePerHeal);

      // Heal the target
      targetCombatant.health += healAmount;
      targetMerc.heal(healAmount);

      // Use up the healing item
      if (healingItem.usesRemaining === undefined) {
        const effect = getHealingEffect(healingItem.equipmentId);
        healingItem.usesRemaining = effect?.totalUses ?? 1;
      }
      healingItem.usesRemaining--;

      // If uses exhausted, discard the item
      if (healingItem.usesRemaining <= 0) {
        if (healerMerc.accessorySlot?.id === healingItem.id) {
          healerMerc.unequip('Accessory');
        } else {
          const bIdx = healerMerc.bandolierSlots.findIndex(e => e.id === healingItem!.id);
          if (bIdx >= 0) {
            healerMerc.unequipBandolierSlot(bIdx);
          }
        }

        const discard = game.getEquipmentDiscard('Accessory');
        if (discard) {
          healingItem.putInto(discard);
        }

        game.message(`${healerMerc.combatantName} uses ${healingItem.equipmentName} to heal ${targetMerc.combatantName} for ${healAmount} - item exhausted!`);
      } else {
        game.message(`${healerMerc.combatantName} uses ${healingItem.equipmentName} to heal ${targetMerc.combatantName} for ${healAmount} (${healingItem.usesRemaining} uses left)`);
      }

      // Mark this attacker's healing phase as processed and clear the pending state
      if (!game.activeCombat.beforeAttackHealingProcessed) {
        game.activeCombat.beforeAttackHealingProcessed = new Set();
      }
      game.activeCombat.beforeAttackHealingProcessed.add(pending.attackerId);
      game.activeCombat.pendingBeforeAttackHealing = undefined;

      return {
        success: true,
        message: `Healed ${targetMerc.combatantName} for ${healAmount}`,
        data: {
          healer: healerMerc.combatantName,
          target: targetMerc.combatantName,
          healAmount,
          diceDiscarded: healerData.dicePerHeal,
        },
      };
    });
}

/**
 * Skip before-attack healing and proceed to attack
 */
export function createCombatSkipBeforeAttackHealAction(game: MERCGame): ActionDefinition {
  return Action.create('combatSkipBeforeAttackHeal')
    .prompt('Skip healing')
    .condition({
      'has pending before-attack healing': () => game.activeCombat?.pendingBeforeAttackHealing != null,
      'is controlling player': (ctx) => {
        const pending = game.activeCombat?.pendingBeforeAttackHealing;
        if (!pending) return false;
        return isCombatDecisionPlayer(game, ctx.player, pending.attackerId);
      },
    })
    .execute(() => {
      if (!game.activeCombat?.pendingBeforeAttackHealing) {
        return { success: false, message: 'No pending healing decision' };
      }

      const pending = game.activeCombat.pendingBeforeAttackHealing;

      // Mark this attacker's healing phase as processed and clear the pending state
      if (!game.activeCombat.beforeAttackHealingProcessed) {
        game.activeCombat.beforeAttackHealingProcessed = new Set();
      }
      game.activeCombat.beforeAttackHealingProcessed.add(pending.attackerId);
      game.activeCombat.pendingBeforeAttackHealing = undefined;

      return {
        success: true,
        message: `Skipping healing for ${pending.attackerName}'s turn`,
      };
    });
}

// =============================================================================
// Combat Surgeon Heal (Human-Controlled Surgeon)
// =============================================================================

/**
 * Helper to find Surgeon in combat combatants
 */
function findSurgeonInCombat(combatants: Combatant[], game: MERCGame): {
  combatant: Combatant;
  merc: CombatantModel;
} | null {
  for (const combatant of combatants) {
    if (combatant.health <= 0) continue;
    if (!isCombatantModel(combatant.sourceElement) || !combatant.sourceElement.isMerc) continue;
    if (combatant.sourceElement.combatantId === 'surgeon') {
      // Check if controlled by human player (not dictator AI)
      const isDictatorSide = combatant.isDictatorSide;
      if (isDictatorSide && game.dictatorPlayer?.isAI) {
        // Surgeon is AI-controlled, skip
        continue;
      }
      return { combatant, merc: combatant.sourceElement };
    }
  }
  return null;
}

/**
 * Helper to find damaged allies that Surgeon can heal
 */
function getSurgeonHealTargets(surgeon: Combatant, allies: Combatant[]): Combatant[] {
  return allies.filter(c =>
    c !== surgeon &&
    c.health > 0 &&
    c.health < c.maxHealth &&
    !c.isMilitia &&
    !c.isAttackDog
  );
}

/**
 * Surgeon's ability: Sacrifice 1 combat die to heal 1 damage to a squad mate.
 * For human-controlled Surgeon only - AI Surgeon auto-heals in combat.ts.
 */
export function createCombatSurgeonHealAction(game: MERCGame): ActionDefinition {
  return Action.create('combatSurgeonHeal')
    .prompt("Surgeon's Heal")
    .condition({
      'has active combat': () => game.activeCombat != null,
      'no pending target selection': () => !game.activeCombat?.pendingTargetSelection,
      'no pending hit allocation': () => !game.activeCombat?.pendingHitAllocation,
      'has human-controlled Surgeon with heal available': (ctx) => {
        if (!game.activeCombat) return false;

        // Check rebel side for human Surgeon
        const rebelCombatants = game.activeCombat.rebelCombatants as Combatant[];
        const rebelSurgeon = findSurgeonInCombat(rebelCombatants, game);
        if (rebelSurgeon && isCombatDecisionPlayer(game, ctx.player, rebelSurgeon.combatant.id)) {
          const { combatant } = rebelSurgeon;
          // Surgeon needs at least 2 dice (1 to sacrifice, 1 to still attack)
          const diceUsed = game.activeCombat.healingDiceUsed?.get(combatant.id) ?? 0;
          if (combatant.combat - diceUsed >= 2) {
            const damagedAllies = getSurgeonHealTargets(combatant, rebelCombatants);
            if (damagedAllies.length > 0) return true;
          }
        }

        // Check dictator side for human Surgeon (human dictator mode)
        if (!game.dictatorPlayer?.isAI) {
          const dictatorCombatants = game.activeCombat.dictatorCombatants as Combatant[];
          const dictatorSurgeon = findSurgeonInCombat(dictatorCombatants, game);
          if (dictatorSurgeon && isCombatDecisionPlayer(game, ctx.player, dictatorSurgeon.combatant.id)) {
            const { combatant } = dictatorSurgeon;
            const diceUsed = game.activeCombat.healingDiceUsed?.get(combatant.id) ?? 0;
            if (combatant.combat - diceUsed >= 2) {
              const damagedAllies = getSurgeonHealTargets(combatant, dictatorCombatants);
              if (damagedAllies.length > 0) return true;
            }
          }
        }

        return false;
      },
    })
    .chooseFrom<string>('target', {
      prompt: 'Select ally to heal',
      choices: () => {
        if (!game.activeCombat) return [];

        // Find Surgeon on player's side
        const rebelCombatants = game.activeCombat.rebelCombatants as Combatant[];
        const rebelSurgeon = findSurgeonInCombat(rebelCombatants, game);
        if (rebelSurgeon) {
          const { combatant } = rebelSurgeon;
          const diceUsed = game.activeCombat.healingDiceUsed?.get(combatant.id) ?? 0;
          if (combatant.combat - diceUsed >= 2) {
            const damagedAllies = getSurgeonHealTargets(combatant, rebelCombatants);
            return damagedAllies.map(c => {
              const merc = c.sourceElement as CombatantModel;
              const damage = c.maxHealth - c.health;
              return `${capitalize(merc.combatantName)} (${damage} damage)`;
            });
          }
        }

        // Check dictator side for human dictator
        if (!game.dictatorPlayer?.isAI) {
          const dictatorCombatants = game.activeCombat.dictatorCombatants as Combatant[];
          const dictatorSurgeon = findSurgeonInCombat(dictatorCombatants, game);
          if (dictatorSurgeon) {
            const { combatant } = dictatorSurgeon;
            if (!isCombatDecisionPlayer(game, ctx.player, combatant.id)) return false;
            const diceUsed = game.activeCombat.healingDiceUsed?.get(combatant.id) ?? 0;
            if (combatant.combat - diceUsed >= 2) {
              const damagedAllies = getSurgeonHealTargets(combatant, dictatorCombatants);
              return damagedAllies.map(c => {
                const merc = c.sourceElement as CombatantModel;
                const damage = c.maxHealth - c.health;
                return `${capitalize(merc.combatantName)} (${damage} damage)`;
              });
            }
          }
        }

        return [];
      },
    })
    .execute((args) => {
      if (!game.activeCombat) {
        return { success: false, message: 'No active combat' };
      }

      const targetChoice = args.target as string;

      // Find Surgeon and target on the appropriate side
      let surgeonData: { combatant: Combatant; merc: CombatantModel } | null = null;
      let combatants: Combatant[] = [];

      const rebelCombatants = game.activeCombat.rebelCombatants as Combatant[];
      const rebelSurgeon = findSurgeonInCombat(rebelCombatants, game);
      if (rebelSurgeon) {
        surgeonData = rebelSurgeon;
        combatants = rebelCombatants;
      }

      if (!surgeonData && !game.dictatorPlayer?.isAI) {
        const dictatorCombatants = game.activeCombat.dictatorCombatants as Combatant[];
        const dictatorSurgeon = findSurgeonInCombat(dictatorCombatants, game);
        if (dictatorSurgeon) {
          surgeonData = dictatorSurgeon;
          combatants = dictatorCombatants;
        }
      }

      if (!surgeonData) {
        return { success: false, message: 'Surgeon not found' };
      }

      const { combatant: surgeonCombatant, merc: surgeonMerc } = surgeonData;

      // Find the target
      const damagedAllies = getSurgeonHealTargets(surgeonCombatant, combatants);
      const targetCombatant = damagedAllies.find(c => {
        const merc = c.sourceElement as CombatantModel;
        const damage = c.maxHealth - c.health;
        return `${capitalize(merc.combatantName)} (${damage} damage)` === targetChoice;
      });

      if (!targetCombatant) {
        return { success: false, message: 'Target not found' };
      }

      const targetMerc = targetCombatant.sourceElement as CombatantModel;

      // Initialize healingDiceUsed map if needed
      if (!game.activeCombat.healingDiceUsed) {
        game.activeCombat.healingDiceUsed = new Map();
      }

      // Pre-compute heal values for event data
      const healAmount = 1; // Surgeon heals 1 per die
      const healthAfter = Math.min(targetCombatant.health + healAmount, targetCombatant.maxHealth);
      const diceUsedAlready = game.activeCombat.healingDiceUsed.get(surgeonCombatant.id) ?? 0;

      game.animate('combat-heal', {
        healerName: capitalize(surgeonMerc.combatantName),
        healerId: surgeonCombatant.id,
        targetName: capitalize(targetMerc.combatantName),
        targetId: targetCombatant.id,
        healAmount,
        healthBefore: targetCombatant.health,
        healthAfter,
        isSurgeonAbility: true,
      });
      // Track dice sacrificed (1 die for 1 heal)
      game.activeCombat!.healingDiceUsed.set(surgeonCombatant.id, diceUsedAlready + 1);

      // Also reduce the combatant's combat stat for this round
      surgeonCombatant.combat--;

      // Heal the target (both combatant and source merc)
      targetCombatant.health = Math.min(targetCombatant.health + healAmount, targetCombatant.maxHealth);
      targetMerc.heal(healAmount);

      game.message(`${surgeonMerc.combatantName} sacrifices a combat die to heal ${targetMerc.combatantName} for ${healAmount}`);

      return {
        success: true,
        message: `Healed ${targetMerc.combatantName} for ${healAmount}`,
        data: {
          healer: surgeonMerc.combatantName,
          target: targetMerc.combatantName,
          healAmount,
          diceDiscarded: 1,
        },
      };
    });
}

// =============================================================================
// MERC-lw9r: Artillery Barrage Hit Allocation
// =============================================================================

/**
 * Allocate artillery barrage hits to rebel units.
 * Called during dictator's turn when Artillery Barrage targets rebel sectors.
 * Each rebel allocates hits to their own units in the targeted sector.
 */
export function createArtilleryAllocateHitsAction(game: MERCGame): ActionDefinition {
  return Action.create('artilleryAllocateHits')
    .prompt('Allocate artillery damage')
    .condition({
      'has pending artillery allocation': () => game.pendingArtilleryAllocation != null,
      'is rebel player': (ctx) => isRebelPlayer(ctx.player),
      'player has units in targeted sector': (ctx) => {
        const pending = game.pendingArtilleryAllocation;
        if (!pending) return false;
        const playerId = `${ctx.player.seat}`;
        return pending.validTargets.some(t => t.ownerId === playerId);
      },
    })
    .chooseFrom<string>('allocations', {
      prompt: 'Choose which of your units take the artillery hits',
      multiSelect: () => {
        const pending = game.pendingArtilleryAllocation;
        if (!pending) return undefined;
        // Must allocate exactly `hits` damage (or all available health)
        const totalHits = pending.hits - pending.allocatedHits;
        return { min: 1, max: totalHits };
      },
      choices: (ctx) => {
        const pending = game.pendingArtilleryAllocation;
        if (!pending) return [];

        const playerId = `${ctx.player.seat}`;
        const choices: string[] = [];

        // Build choices for this player's targets only
        for (const target of pending.validTargets) {
          if (target.ownerId !== playerId) continue;

          // Allow selecting up to currentHealth times
          for (let i = 0; i < target.currentHealth; i++) {
            choices.push(`${target.id}::${i}`);
          }
        }
        return choices;
      },
      display: (choice: string) => {
        const pending = game.pendingArtilleryAllocation;
        if (!pending) return choice;
        const [targetId, indexStr] = choice.split('::');
        const index = parseInt(indexStr, 10);
        const target = pending.validTargets.find(t => t.id === targetId);
        if (!target) return choice;
        return target.type === 'militia'
          ? `Militia (${target.currentHealth - index} remaining)`
          : target.name;
      },
    })
    .execute((args, ctx) => {
      if (!game.pendingArtilleryAllocation) {
        return { success: false, message: 'No artillery allocation pending' };
      }

      const pending = game.pendingArtilleryAllocation;
      const playerId = `${ctx.player.seat}`;
      const player = ctx.player as RebelPlayer;

      // Parse allocations
      const allocChoices = Array.isArray(args.allocations)
        ? args.allocations as unknown[]
        : [args.allocations];

      const hitsByTarget = new Map<string, number>();
      for (const choice of allocChoices) {
        const choiceStr = typeof choice === 'string' ? choice :
          (choice && typeof choice === 'object' && 'value' in choice)
            ? String((choice as { value: unknown }).value)
            : String(choice);
        const targetId = choiceStr.split('::')[0];
        hitsByTarget.set(targetId, (hitsByTarget.get(targetId) ?? 0) + 1);
      }

      // Apply damage
      const sector = game.getSector(pending.sectorId);
      let totalApplied = 0;

      for (const [targetId, hits] of hitsByTarget) {
        const target = pending.validTargets.find(t => t.id === targetId);
        if (!target || target.ownerId !== playerId) continue;

        if (target.type === 'militia') {
          // Remove militia from sector
          const removed = sector?.removeRebelMilitia(playerId, hits) ?? 0;
          if (removed > 0) {
            game.message(`${removed} militia killed by artillery at ${pending.sectorName}`);
          }
          totalApplied += removed;

          // Update target health in pending state
          target.currentHealth -= removed;
        } else {
          // Damage MERC
          const merc = player.team.find(m => m.combatantId === targetId);
          if (merc) {
            for (let i = 0; i < hits; i++) {
              merc.takeDamage(1);
              game.message(`${merc.combatantName} takes 1 artillery damage`);
              totalApplied++;
            }
            target.currentHealth = merc.health - merc.damage;
          }
        }
      }

      // Update allocated count
      pending.allocatedHits += totalApplied;

      // Check if all hits for this sector are allocated
      // (or all targets exhausted)
      const remainingTargets = pending.validTargets.filter(t => t.currentHealth > 0);
      const allHitsAllocated = pending.allocatedHits >= pending.hits || remainingTargets.length === 0;

      if (allHitsAllocated) {
        // Move to next sector or complete
        if (pending.sectorsRemaining.length > 0) {
          const next = pending.sectorsRemaining.shift()!;
          const nextSector = game.getSector(next.sectorId);
          if (nextSector) {
            const nextTargets = buildArtilleryTargets(game, nextSector);
            game.pendingArtilleryAllocation = {
              sectorId: next.sectorId,
              sectorName: next.sectorName,
              hits: next.hits,
              allocatedHits: 0,
              validTargets: nextTargets,
              sectorsRemaining: pending.sectorsRemaining,
            };
            game.message(`Artillery Barrage continues: ${next.hits} hits at ${next.sectorName}`);
          }
        } else {
          // All sectors processed
          game.pendingArtilleryAllocation = null;
          game.message('Artillery Barrage complete');
        }
      }

      return {
        success: true,
        message: `Allocated ${totalApplied} artillery hits`,
        data: { allocated: totalApplied },
      };
    });
}

/**
 * Use epinephrine shot to save a dying MERC
 * MERC-4.9: Any equipped Epinephrine Shot in the squad can prevent death
 */
export function createCombatUseEpinephrineAction(game: MERCGame): ActionDefinition {
  return Action.create('combatUseEpinephrine')
    .prompt('Use Epinephrine Shot')
    .condition({
      'has pending epinephrine choice': () => game.activeCombat?.pendingEpinephrine != null,
    })
    .chooseElement<CombatantModel>('saverMerc', {
      prompt: 'Choose merc to use Epinephrine Shot',
      elementClass: CombatantModel,
      filter: (element) => {
        const merc = element as CombatantModel;
        if (!merc.isMerc) return false;
        const pending = game.activeCombat?.pendingEpinephrine;
        if (!pending) return false;
        return pending.availableSavers.some(s => s.combatantId === merc.id);
      },
    })
    .execute((args) => {
      const saverMerc = args.saverMerc as CombatantModel;
      const pending = game.activeCombat?.pendingEpinephrine;
      if (!pending) {
        return { success: false, message: 'No pending epinephrine choice' };
      }

      // Find the dying MERC
      let dyingMerc: CombatantModel | undefined;
      if (pending.dyingCombatantSide === 'dictator') {
        dyingMerc = game.dictatorPlayer?.hiredMercs.find(m => m.id === pending.dyingCombatantId);
      } else {
        for (const rebel of game.rebelPlayers) {
          const allMercs = [...rebel.primarySquad.getMercs(), ...rebel.secondarySquad.getMercs()];
          dyingMerc = allMercs.find(m => m.id === pending.dyingCombatantId);
          if (dyingMerc) break;
        }
      }

      if (!dyingMerc) {
        game.activeCombat!.pendingEpinephrine = undefined;
        return { success: false, message: 'Dying MERC not found' };
      }

      // Find and use the epinephrine from the saver
      let epiShot: Equipment | undefined;
      if (saverMerc.accessorySlot && isEpinephrine(saverMerc.accessorySlot.equipmentId)) {
        epiShot = saverMerc.unequip('Accessory');
      } else {
        const epiIndex = saverMerc.bandolierSlots.findIndex((e: Equipment) => isEpinephrine(e.equipmentId));
        if (epiIndex >= 0) {
          epiShot = saverMerc.unequipBandolierSlot(epiIndex);
        }
      }

      if (!epiShot) {
        game.activeCombat!.pendingEpinephrine = undefined;
        return { success: false, message: 'Epinephrine not found on selected MERC' };
      }

      // Discard the epinephrine
      const discard = game.getEquipmentDiscard('Accessory');
      if (discard) epiShot.putInto(discard);

      // Save the dying MERC - set health to 1
      dyingMerc.damage = dyingMerc.maxHealth - 1;

      game.message(`${saverMerc.combatantName} uses Epinephrine Shot to save ${dyingMerc.combatantName}!`);

      // Clear pending state
      game.activeCombat!.pendingEpinephrine = undefined;

      return {
        success: true,
        message: `${dyingMerc.combatantName} saved by Epinephrine Shot`,
        data: { savedMerc: dyingMerc.combatantName, usedBy: saverMerc.combatantName },
      };
    });
}

/**
 * Decline to use epinephrine - let the MERC die
 */
export function createCombatDeclineEpinephrineAction(game: MERCGame): ActionDefinition {
  return Action.create('combatDeclineEpinephrine')
    .prompt('Let MERC die')
    .condition({
      'has pending epinephrine choice': () => game.activeCombat?.pendingEpinephrine != null,
    })
    .execute(() => {
      const pending = game.activeCombat?.pendingEpinephrine;
      if (!pending) {
        return { success: false, message: 'No pending epinephrine choice' };
      }

      // Find the dying MERC
      let dyingMerc: CombatantModel | undefined;
      if (pending.dyingCombatantSide === 'dictator') {
        dyingMerc = game.dictatorPlayer?.hiredMercs.find(m => m.id === pending.dyingCombatantId);
      } else {
        for (const rebel of game.rebelPlayers) {
          const allMercs = [...rebel.primarySquad.getMercs(), ...rebel.secondarySquad.getMercs()];
          dyingMerc = allMercs.find(m => m.id === pending.dyingCombatantId);
          if (dyingMerc) break;
        }
      }

      if (!dyingMerc) {
        game.activeCombat!.pendingEpinephrine = undefined;
        return { success: false, message: 'Dying MERC not found' };
      }

      // MERC dies - discard their equipment
      for (const slotName of ['Weapon', 'Armor', 'Accessory'] as const) {
        const equip = dyingMerc.unequip(slotName);
        if (equip) {
          const discardPile = game.getEquipmentDiscard(slotName);
          if (discardPile) equip.putInto(discardPile);
        }
      }
      // Discard bandolier items
      while (dyingMerc.bandolierSlots.length > 0) {
        const equip = dyingMerc.unequipBandolierSlot(0);
        if (equip) {
          const discardPile = game.getEquipmentDiscard('Accessory');
          if (discardPile) equip.putInto(discardPile);
        }
      }

      game.message(`${dyingMerc.combatantName} has died!`);

      // Clear pending state
      game.activeCombat!.pendingEpinephrine = undefined;

      return {
        success: true,
        message: `${dyingMerc.combatantName} has died`,
        data: { deadMerc: dyingMerc.combatantName },
      };
    });
}

// =============================================================================
/**
 * Clear combat state after animations complete
 * Called by UI when combat animations finish playing
 * Only works when combatComplete is true (combat has ended, animations played)
 */
export function createClearCombatAnimationsAction(game: MERCGame): ActionDefinition {
  return Action.create('clearCombatAnimations')
    .prompt('Clear combat animations')
    .condition({
      'has completed combat': () => game.activeCombat !== null && game.activeCombat.combatComplete === true,
    })
    .execute(() => {
      clearActiveCombat(game);
      return {
        success: true,
        message: 'Combat animations cleared',
      };
    });
}

/**
 * Allocate mortar hits to targets.
 * Called when player confirms their hit allocation in the MortarAttackPanel UI.
 */
export function createMortarAllocateHitsAction(game: MERCGame): ActionDefinition {
  return Action.create('mortarAllocateHits')
    .prompt('Allocate mortar hits')
    .condition({
      'has pending mortar attack': () => game.pendingMortarAttack != null,
      'is attacking player': (ctx) => {
        const pending = game.pendingMortarAttack;
        if (!pending) return false;
        return `${ctx.player.seat}` === pending.attackingPlayerId;
      },
    })
    .chooseFrom<string>('allocations', {
      prompt: 'Allocate mortar hits to targets',
      multiSelect: () => {
        const pending = game.pendingMortarAttack;
        if (!pending) return undefined;
        // Cap min at total target health — excess hits beyond what targets can absorb are wasted
        const totalHealth = pending.validTargets.reduce((s, t) => s + t.currentHealth, 0);
        const effectiveHits = Math.min(pending.hits, totalHealth);
        return { min: effectiveHits, max: pending.hits };
      },
      choices: () => {
        const pending = game.pendingMortarAttack;
        if (!pending) return [];
        const choices: string[] = [];
        for (const target of pending.validTargets) {
          for (let i = 0; i < target.currentHealth; i++) {
            choices.push(`${target.id}::${i}`);
          }
        }
        return choices;
      },
      display: (choice: string) => {
        const pending = game.pendingMortarAttack;
        if (!pending) return choice;
        const targetId = choice.split('::')[0];
        const target = pending.validTargets.find(t => t.id === targetId);
        if (!target) return choice;
        return target.name;
      },
    })
    .execute((args, ctx) => {
      if (!game.pendingMortarAttack) {
        return { success: false, message: 'No mortar attack pending' };
      }

      const pending = game.pendingMortarAttack;

      const allocChoices = Array.isArray(args.allocations)
        ? args.allocations as unknown[]
        : [args.allocations];

      // Parse allocation choices into targetId -> hitCount map
      const hitsByTarget = new Map<string, number>();
      for (const choice of allocChoices) {
        const choiceStr = typeof choice === 'string' ? choice :
          (choice && typeof choice === 'object' && 'value' in choice)
            ? String((choice as { value: unknown }).value)
            : String(choice);
        const targetId = choiceStr.split('::')[0];
        hitsByTarget.set(targetId, (hitsByTarget.get(targetId) ?? 0) + 1);
      }

      // Determine side
      const isRebel = game.isRebelPlayer(ctx.player);

      // Apply damage
      const targetSector = game.getSector(pending.targetSectorId);
      if (!targetSector) {
        game.pendingMortarAttack = null;
        return { success: false, message: 'Target sector not found' };
      }

      const { totalDamage, hitCombatantIds, militiaKilled } = applyMortarDamage(
        game, targetSector, pending.validTargets, hitsByTarget, isRebel,
      );

      // Log allocation
      const allocMsg = Array.from(hitsByTarget.entries())
        .map(([targetId, count]) => {
          const target = pending.validTargets.find(t => t.id === targetId);
          return `${target?.name ?? 'Unknown'} x${count}`;
        })
        .join(', ');
      game.message(`${pending.attackerName} allocates mortar hits: ${allocMsg}`);

      // Emit mortar-strike animation with the allocated targets
      game.animate('mortar-strike', {
        targetSectorId: pending.targetSectorId,
        hitCombatantIds,
        militiaKilled,
        diceRolls: pending.diceRolls,
        hits: pending.hits,
        hitThreshold: pending.hitThreshold,
        attackerName: pending.attackerName,
      });

      // Clear pending state
      game.pendingMortarAttack = null;

      return {
        success: true,
        message: `Mortar hits allocated: ${totalDamage} damage dealt`,
        data: {
          allocations: Object.fromEntries(hitsByTarget),
          totalDamage,
        },
      };
    });
}
