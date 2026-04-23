/**
 * AI Executor - Connects AI helper functions to game flow
 *
 * MERC-5aa: This module provides the integration layer that connects
 * the AI decision-making functions to the actual game actions.
 *
 * Based on: data/rules/10-dictator-ai.md
 */

import type { MERCGame } from './game.js';
import { Sector, Equipment, CombatantModel } from './elements.js';
import {
  getAIMercAction,
  sortMercsByInitiative,
  getBestMoveDirection,
  isDictatorAtBase,
  getDictatorBaseActions,
  shouldLeaveInStash,
  sortEquipmentByAIPriority,
  getAIHealingPriority,
  mercNeedsHealing,
  shouldUseSpecialAbility,
  getAIAbilityActivations,
  useRepairKit,
  canSquadMoveTogether,
  type AIActionDecision,
} from './ai-helpers.js';

interface AIActionSelection {
  actionName: string;
  unit: CombatantModel | null;
  destination?: Sector;
  equipment?: Equipment;
  reason: string;
}

/**
 * Check and log special ability usage for AI.
 * MERC-onm: Per rules 4.10, AI ALWAYS uses MERC special abilities when appropriate.
 * Note: Actual ability execution depends on the specific ability and game context.
 */
function checkAISpecialAbilities(game: MERCGame): void {
  const mercsWithAbilities = getAIAbilityActivations(game.dictatorPlayer.hiredMercs);

  for (const merc of mercsWithAbilities) {
    if (shouldUseSpecialAbility(merc, 'turn-start')) {
      // Log ability consideration - actual activation depends on ability type
      // Some abilities are passive, some are triggered, some are active
      game.message(`AI considers using ${merc.combatantName}'s ability: ${merc.ability}`);
    }
  }

  // Also check dictator card ability if in play
  const dictator = game.dictatorPlayer.dictator;
  if (dictator?.inPlay && dictator.ability) {
    game.message(`AI considers using Dictator ability: ${dictator.ability}`);
  }
}

/**
 * Check if AI should heal before taking other actions.
 * MERC-5zs: Per rules 4.8, AI heals injured MERCs.
 */
function checkAIHealing(game: MERCGame): AIActionSelection | null {
  const allMercs = game.dictatorPlayer.hiredMercs.filter(m => !m.isDead);
  const damagedMercs = allMercs.filter(m => mercNeedsHealing(m));

  if (damagedMercs.length === 0) return null;

  const healingAction = getAIHealingPriority(game, damagedMercs, allMercs);
  if (!healingAction) return null;

  // MERC-3po: Handle repair kit healing directly (it's a free action from stash)
  if (healingAction.type === 'repairKit' && healingAction.sector) {
    const success = useRepairKit(game, healingAction.sector, healingAction.target);
    if (success) {
      // Repair kit was used - continue checking for other actions
      return null;
    }
  }

  // Log other healing intentions
  game.message(`AI considers healing ${healingAction.target.combatantName} using ${healingAction.type}`);

  // If using an item like Medical Kit, the MERC with the item needs to use it
  if (healingAction.type === 'item' && healingAction.merc) {
    // This would trigger a heal action - for now we note the intent
    // The actual healing action would need to be added to actions.ts
    return null; // Let other actions proceed; healing integration requires a dedicated heal action
  }

  return null;
}

/**
 * Get the next AI action to execute.
 * MERC-f5u: Re-evaluates from top after each action.
 * Returns null if no actions available.
 */
export function getNextAIAction(game: MERCGame): AIActionSelection | null {
  if (!game.dictatorPlayer?.isAI) {
    return null;
  }

  // MERC-onm: Check for special ability activations
  checkAISpecialAbilities(game);

  // MERC-5zs: Check if healing should be prioritized
  const healingAction = checkAIHealing(game);
  if (healingAction) {
    return healingAction;
  }

  // Get all dictator units with actions remaining
  const mercs = game.dictatorPlayer.hiredMercs.filter(
    m => !m.isDead && m.actionsRemaining > 0 && m.sectorId
  );
  const dictator = game.dictatorPlayer.dictator;
  const dictatorCanAct = dictator?.inPlay &&
    dictator.actionsRemaining > 0 &&
    dictator.sectorId;

  // No units can act - end turn
  if (mercs.length === 0 && !dictatorCanAct) {
    return {
      actionName: 'dictatorEndMercActions',
      unit: null,
      reason: 'No units with actions remaining',
    };
  }

  // Sort MERCs by initiative (highest first)
  const sortedMercs = sortMercsByInitiative(mercs);

  // Check dictator first if at base (limited actions)
  if (dictatorCanAct && isDictatorAtBase(game)) {
    const dictatorAction = getDictatorAction(game, dictator!);
    if (dictatorAction) {
      return dictatorAction;
    }
  }

  // Process MERCs in initiative order
  for (const merc of sortedMercs) {
    const decision = getAIMercAction(game, merc);
    const actionSelection = convertDecisionToAction(game, merc, decision);
    if (actionSelection && actionSelection.actionName !== 'none') {
      return actionSelection;
    }
  }

  // Check dictator if not at base and has actions
  if (dictatorCanAct && !isDictatorAtBase(game)) {
    // Dictator card should NEVER leave base once revealed (MERC-mme)
    // But if somehow not at base, only allow non-move actions
    const dictatorAction = getDictatorAction(game, dictator!);
    if (dictatorAction) {
      return dictatorAction;
    }
  }

  // All units acted or no valid actions - end turn
  return {
    actionName: 'dictatorEndMercActions',
    unit: null,
    reason: 'All units have acted',
  };
}

/**
 * Get action for dictator card (restricted to base).
 * MERC-mme: Dictator stays at base, can equip/train but not move.
 */
function getDictatorAction(
  game: MERCGame,
  dictator: CombatantModel
): AIActionSelection | null {
  const sector = dictator.sectorId ? game.getSector(dictator.sectorId) : null;
  if (!sector) return null;

  const validActions = getDictatorBaseActions();

  // Check explore first
  if (validActions.includes('explore') && !sector.explored) {
    return {
      actionName: 'dictatorExplore',
      unit: dictator,
      reason: 'Dictator exploring sector',
    };
  }

  // Check re-equip
  if (validActions.includes('re-equip')) {
    const stash = sector.getStashContents();
    const usableEquipment = stash.filter(e => !shouldLeaveInStash(e));
    if (usableEquipment.length > 0) {
      // Check if dictator can use any equipment
      const sorted = sortEquipmentByAIPriority(usableEquipment);
      for (const equip of sorted) {
        if (dictator.canEquip && dictator.canEquip(equip)) {
          const current = dictator.getEquipmentOfType?.(equip.equipmentType);
          if (!current || (equip.serial || 0) > (current.serial || 0)) {
            return {
              actionName: 'dictatorReEquip',
              unit: dictator,
              equipment: equip,
              reason: 'Dictator equipping from stash',
            };
          }
        }
      }
    }
  }

  // Check train
  if (validActions.includes('train') && dictator.training > 0) {
    if (sector.dictatorMilitia < 10) {
      return {
        actionName: 'dictatorTrain',
        unit: dictator,
        reason: 'Dictator training militia at base',
      };
    }
  }

  return null;
}

/**
 * Convert AI decision to executable action.
 */
function convertDecisionToAction(
  game: MERCGame,
  merc: CombatantModel,
  decision: AIActionDecision
): AIActionSelection | null {
  const sector = merc.sectorId ? game.getSector(merc.sectorId) : null;
  if (!sector) return null;

  switch (decision.action) {
    case 'explore':
      if (!sector.explored && merc.actionsRemaining >= 1) {
        return {
          actionName: 'dictatorExplore',
          unit: merc,
          reason: decision.reason,
        };
      }
      break;

    case 're-equip':
      const stash = sector.getStashContents();
      const usableEquipment = stash.filter(e => !shouldLeaveInStash(e));
      if (usableEquipment.length > 0) {
        const sorted = sortEquipmentByAIPriority(usableEquipment);
        for (const equip of sorted) {
          if (merc.canEquip(equip)) {
            const current = merc.getEquipmentOfType(equip.equipmentType);
            if (!current || (equip.serial || 0) > (current.serial || 0)) {
              return {
                actionName: 'dictatorReEquip',
                unit: merc,
                equipment: equip,
                reason: decision.reason,
              };
            }
          }
        }
      }
      break;

    case 'train':
      if (merc.training > 0 && sector.dictatorMilitia < 10 && merc.actionsRemaining >= 1) {
        return {
          actionName: 'dictatorTrain',
          unit: merc,
          reason: decision.reason,
        };
      }
      break;

    case 'move':
      if (merc.actionsRemaining >= 1) {
        // MERC-az8: Check squad cohesion per rule 3.4
        // "Never split the squad - All MERCs with actions remaining move together"
        if (!canSquadMoveTogether(game, sector.sectorId)) {
          // Some MERCs in this sector can't move - skip move to keep squad together
          // Fall back to training if possible
          if (sector.dictatorMilitia < 10 && merc.training > 0) {
            return {
              actionName: 'dictatorTrain',
              unit: merc,
              reason: 'MERC-az8: Squad cannot move together, train instead',
            };
          }
          // Otherwise skip this MERC's action
          break;
        }

        // Use the target from decision, or calculate best direction
        const destination = decision.target || getBestMoveDirection(game, sector);
        if (destination) {
          return {
            actionName: 'dictatorMove',
            unit: merc,
            destination,
            reason: decision.reason,
          };
        }
      }
      break;
  }

  return null;
}
