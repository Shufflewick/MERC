/**
 * Rebel Combat Actions
 *
 * MERC-n1f: Interactive Combat Actions
 * These actions allow players to continue or retreat from active combat.
 * MERC-t5k: Player target selection during combat
 */

import { Action, type ActionDefinition } from '@boardsmith/engine';
import type { MERCGame, RebelPlayer } from '../game.js';
import { Sector, MercCard, Equipment } from '../elements.js';
import { executeCombat, executeCombatRetreat, getValidRetreatSectors, type Combatant } from '../combat.js';
import { isHealingItem, getHealingEffect } from '../equipment-effects.js';
import { buildArtilleryTargets } from '../tactics-effects.js';
import { capitalize, isRebelPlayer } from './helpers.js';

/**
 * Continue fighting in active combat
 */
export function createCombatContinueAction(game: MERCGame): ActionDefinition {
  return Action.create('combatContinue')
    .prompt('Continue fighting')
    .condition(() => {
      // Can't continue while target selection or hit allocation is pending
      return game.activeCombat !== null &&
             game.activeCombat.pendingTargetSelection === undefined &&
             game.activeCombat.pendingHitAllocation === undefined;
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
      // Can't retreat while target selection or hit allocation is pending
      return game.activeCombat !== null &&
             game.activeCombat.pendingTargetSelection === undefined &&
             game.activeCombat.pendingHitAllocation === undefined;
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
 * Uses chooseFrom() with smart resolution - CombatPanel can send element IDs directly
 */
export function createCombatSelectTargetAction(game: MERCGame): ActionDefinition {
  return Action.create('combatSelectTarget')
    .prompt(() => {
      const pending = game.activeCombat?.pendingTargetSelection;
      if (!pending) return 'Select target';
      return `${pending.attackerName}: Select target${pending.maxTargets > 1 ? ` (up to ${pending.maxTargets})` : ''}`;
    })
    .condition((ctx) => {
      // Only rebels can select targets (this is a rebel combat action)
      if (!isRebelPlayer(ctx.player)) return false;
      // Must have active combat with pending target selection and at least one valid target
      const hasActiveCombat = game.activeCombat !== null;
      const hasPending = game.activeCombat?.pendingTargetSelection != null;
      const targetCount = game.activeCombat?.pendingTargetSelection?.validTargets?.length || 0;
      return hasActiveCombat && hasPending && targetCount > 0;
    })
    .chooseFrom<string>('targets', {
      prompt: () => {
        const pending = game.activeCombat?.pendingTargetSelection;
        if (!pending) return 'Select target';
        const name = pending.attackerName.charAt(0).toUpperCase() + pending.attackerName.slice(1);
        return `${name}: Select target`;
      },
      choices: () => {
        const pending = game.activeCombat?.pendingTargetSelection;
        if (!pending) return [];

        // Use string ID as value, display name for UI
        // Add #N suffix for duplicate names in display
        return pending.validTargets.map((t: Combatant, index: number) => {
          const baseName = t.name;
          const duplicateCount = pending.validTargets.filter((x: Combatant) => x.name === baseName).length;
          let displayName = baseName;
          if (duplicateCount > 1) {
            const countBefore = pending.validTargets.slice(0, index + 1).filter((x: Combatant) => x.name === baseName).length;
            displayName = `${baseName} #${countBefore}`;
          }
          return {
            value: t.id,        // String ID - what gets sent to execute
            display: displayName, // Human-readable name for UI
          };
        });
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

// =============================================================================
// Combat Healing with Medical Kit / First Aid Kit
// =============================================================================

/**
 * Helper to find MERCs with healing items (Medical Kit / First Aid Kit)
 */
function getMercsWithHealingItems(combatants: Combatant[]): Array<{
  combatant: Combatant;
  merc: MercCard;
  healingItem: Equipment;
}> {
  const result: Array<{ combatant: Combatant; merc: MercCard; healingItem: Equipment }> = [];

  for (const combatant of combatants) {
    if (combatant.health <= 0) continue;
    if (!(combatant.sourceElement instanceof MercCard)) continue;

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
 * Helper to find damaged MERCs that can be healed
 */
function getDamagedMercs(combatants: Combatant[]): Combatant[] {
  return combatants.filter(c =>
    c.health > 0 &&
    c.health < c.maxHealth &&
    c.sourceElement instanceof MercCard
  );
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
    .condition((ctx) => {
      // Must have active combat with pending hit allocation
      if (!game.activeCombat?.pendingHitAllocation) return false;
      // Only rebels can use this (dictator AI auto-allocates)
      if (!isRebelPlayer(ctx.player)) return false;
      return true;
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
        // Use {value, display} format for clean UI display
        const choices: Array<{value: string, display: string}> = [];
        for (const target of pending.validTargets) {
          // Capitalize target name for display
          const displayName = target.name.charAt(0).toUpperCase() + target.name.slice(1);
          // Allow targeting up to their current health times
          for (let i = 0; i < target.currentHealth; i++) {
            choices.push({
              value: `${target.id}::${i}`,
              display: displayName,
            });
          }
        }
        return choices;
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

      const player = game.rebelPlayers.find(
        p => `${p.position}` === game.activeCombat!.attackingPlayerId
      ) as RebelPlayer;

      if (!player) {
        return { success: false, message: 'Attacking player not found' };
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
    .condition((ctx) => {
      // Must have pending hit allocation
      if (!game.activeCombat?.pendingHitAllocation) return false;
      // Must be able to reroll (Basic's ability, not already used)
      const pending = game.activeCombat.pendingHitAllocation;
      if (!pending.canReroll || pending.hasRerolled) return false;
      // Only rebels can use this
      if (!isRebelPlayer(ctx.player)) return false;
      return true;
    })
    .execute(() => {
      if (!game.activeCombat?.pendingHitAllocation) {
        return { success: false, message: 'No hit allocation pending' };
      }

      const pending = game.activeCombat.pendingHitAllocation;

      // Roll new dice
      const diceCount = pending.diceRolls.length;
      const newRolls: number[] = [];
      for (let i = 0; i < diceCount; i++) {
        newRolls.push(Math.floor(Math.random() * 6) + 1);
      }

      // Count new hits
      const newHits = newRolls.filter(r => r >= pending.hitThreshold).length;

      // Count Wolverine 6s if applicable
      const isWolverine = pending.attackerMercId === 'wolverine';
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
    .condition((ctx) => {
      // Must have pending Wolverine 6s allocation
      if (!game.activeCombat?.pendingWolverineSixes) return false;
      // Only rebels can use this
      if (!isRebelPlayer(ctx.player)) return false;
      return true;
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

      const player = game.rebelPlayers.find(
        p => `${p.position}` === game.activeCombat!.attackingPlayerId
      ) as RebelPlayer;

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
    .condition((ctx) => {
      // Must have active combat
      if (!game.activeCombat) return false;
      // Can't use while target selection or hit allocation is pending
      if (game.activeCombat.pendingTargetSelection) return false;
      if (game.activeCombat.pendingHitAllocation) return false;
      // Only rebels can use this
      if (!isRebelPlayer(ctx.player)) return false;

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
            `${capitalize(merc.mercName)} (${healingItem.equipmentName})`
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
          const merc = c.sourceElement as MercCard;
          const damage = c.maxHealth - c.health;
          return `${capitalize(merc.mercName)} (${damage} damage)`;
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
        `${capitalize(merc.mercName)} (${healingItem.equipmentName})` === healerChoice
      );

      if (!healerData) {
        return { success: false, message: 'Healer not found' };
      }

      // Find the target
      const damagedMercs = getDamagedMercs(rebelCombatants);
      const targetCombatant = damagedMercs.find(c => {
        const merc = c.sourceElement as MercCard;
        const damage = c.maxHealth - c.health;
        return `${capitalize(merc.mercName)} (${damage} damage)` === targetChoice;
      });

      if (!targetCombatant) {
        return { success: false, message: 'Target not found' };
      }

      const { combatant: healerCombatant, merc: healerMerc, healingItem } = healerData;
      const targetMerc = targetCombatant.sourceElement as MercCard;

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

      // Track dice discarded
      game.activeCombat.healingDiceUsed.set(
        healerCombatant.id,
        diceUsedAlready + healingEffect.dicePerHeal
      );

      // Heal the target (both combatant and source MercCard)
      const healAmount = Math.min(healingEffect.healPerUse, targetCombatant.maxHealth - targetCombatant.health);
      targetCombatant.health += healAmount;
      targetMerc.heal(healAmount);

      // Use up the healing item
      if (healingItem.usesRemaining === undefined) {
        healingItem.usesRemaining = healingEffect.totalUses;
      }
      healingItem.usesRemaining--;

      // If uses exhausted, discard the item
      if (healingItem.usesRemaining <= 0) {
        // Find which slot this is in and remove it
        if (healerMerc.accessorySlot?.id === healingItem.id) {
          healerMerc.unequip('Accessory');
        } else {
          // Find in bandolier slots
          const bIdx = healerMerc.bandolierSlots.findIndex(e => e.id === healingItem.id);
          if (bIdx >= 0) {
            healerMerc.unequipBandolierSlot(bIdx);
          }
        }

        // Discard the item
        const discard = game.getEquipmentDiscard('Accessory');
        if (discard) {
          healingItem.putInto(discard);
        }

        game.message(`${healerMerc.mercName} uses ${healingItem.equipmentName} to heal ${targetMerc.mercName} for ${healAmount} - item exhausted!`);
      } else {
        game.message(`${healerMerc.mercName} uses ${healingItem.equipmentName} to heal ${targetMerc.mercName} for ${healAmount} (${healingItem.usesRemaining} uses left)`);
      }

      return {
        success: true,
        message: `Healed ${targetMerc.mercName} for ${healAmount}`,
        data: {
          healer: healerMerc.mercName,
          target: targetMerc.mercName,
          healAmount,
          diceDiscarded: healingEffect.dicePerHeal,
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
    .condition((ctx) => {
      // Must have pending artillery allocation
      if (!game.pendingArtilleryAllocation) return false;

      // Must be a rebel player
      if (!isRebelPlayer(ctx.player)) return false;

      // Player must have units in the targeted sector
      const pending = game.pendingArtilleryAllocation;
      const playerId = `${ctx.player.position}`;
      const hasTargets = pending.validTargets.some(t => t.ownerId === playerId);

      return hasTargets;
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

        const playerId = `${ctx.player.position}`;
        const choices: Array<{ value: string; display: string }> = [];

        // Build choices for this player's targets only
        for (const target of pending.validTargets) {
          if (target.ownerId !== playerId) continue;

          // Allow selecting up to currentHealth times
          for (let i = 0; i < target.currentHealth; i++) {
            choices.push({
              value: `${target.id}::${i}`,
              display: target.type === 'militia'
                ? `Militia (${target.currentHealth - i} remaining)`
                : target.name,
            });
          }
        }
        return choices;
      },
    })
    .execute((args, ctx) => {
      if (!game.pendingArtilleryAllocation) {
        return { success: false, message: 'No artillery allocation pending' };
      }

      const pending = game.pendingArtilleryAllocation;
      const playerId = `${ctx.player.position}`;
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
          const merc = player.team.find(m => m.mercId === targetId);
          if (merc) {
            for (let i = 0; i < hits; i++) {
              merc.takeDamage(1);
              game.message(`${merc.mercName} takes 1 artillery damage`);
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
