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
import { capitalize } from './helpers.js';

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
      // Can't use while target selection is pending
      if (game.activeCombat.pendingTargetSelection) return false;
      // Only rebels can use this
      if (!game.isRebelPlayer(ctx.player as any)) return false;

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
