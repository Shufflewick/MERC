/**
 * Action Module Index
 *
 * This file re-exports all actions and the registration function.
 * Actions are organized into logical modules:
 *
 * - helpers.ts: Shared utilities and constants
 * - rebel-movement.ts: Movement, coordinated attacks, squad management
 * - rebel-combat.ts: Combat continue/retreat actions
 * - rebel-economy.ts: Hiring, exploring, training, hospitals, arms dealers
 * - rebel-equipment.ts: Equipment management and special abilities
 * - dictator-actions.ts: Dictator-specific actions
 * - day-one-actions.ts: Day 1 setup actions
 */

// Re-export helpers
export {
  ACTION_COSTS,
  capitalize,
  MERC_INCOMPATIBILITIES,
  canHireMercWithTeam,
  hasActionsRemaining,
  getMercsWithActions,
  isInPlayerTeam,
  useAction,
} from './helpers.js';

// Re-export all action creators from sub-modules
export * from './rebel-movement.js';
export * from './rebel-combat.js';
export * from './rebel-economy.js';
export * from './rebel-equipment.js';
export * from './dictator-actions.js';
export * from './day-one-actions.js';

// Import for registration function
import type { MERCGame } from '../game.js';

// Import all action creators
import {
  createMoveAction,
  createCoordinatedAttackAction,
  createDeclareCoordinatedAttackAction,
  createJoinCoordinatedAttackAction,
  createExecuteCoordinatedAttackAction,
  createAssignToSquadAction,
} from './rebel-movement.js';

import {
  createCombatContinueAction,
  createCombatRetreatAction,
  createCombatSelectTargetAction,
  createCombatAssignAttackDogAction,
  createCombatHealAction,
  createCombatSurgeonHealAction,
  createCombatBeforeAttackHealAction,
  createCombatSkipBeforeAttackHealAction,
  createCombatAllocateHitsAction,
  createCombatBasicRerollAction,
  createCombatAllocateWolverineSixesAction,
  createArtilleryAllocateHitsAction,
  createCombatUseEpinephrineAction,
  createCombatDeclineEpinephrineAction,
  createClearCombatAnimationsAction,
  createMortarAllocateHitsAction,
} from './rebel-combat.js';

import {
  createHireMercAction,
  createExploreAction,
  createCollectEquipmentAction,
  createTakeFromStashAction,
  createTrainAction,
  createHospitalAction,
  createArmsDealerAction,
  createEndTurnAction,
  createViewStashAction,
} from './rebel-economy.js';

import {
  createReEquipAction,
  createReEquipContinueAction,
  createDropEquipmentAction,
  createDocHealAction,
  createFeedbackDiscardAction,
  createSquidheadDisarmAction,
  createSquidheadArmAction,
  createHagnessDrawTypeAction,
  createHagnessGiveEquipmentAction,
  createRepairKitAction,
  createMortarAction,
  createDetonateExplosivesAction,
} from './rebel-equipment.js';

import {
  createPlayTacticsAction,
  createReinforceAction,
  createCastroBonusHireAction,
  createKimBonusMilitiaAction,
  createGeneralissimoPickAction,
} from './dictator-actions.js';

import {
  createHireFirstMercAction,
  createHireSecondMercAction,
  createHireThirdMercAction,
  createEquipStartingAction,
  createPlaceLandingAction,
  createSelectDictatorAction,
  createDictatorPlaceInitialMilitiaAction,
  createDictatorHireFirstMercAction,
  createChooseKimBaseAction,
  createDictatorSetupAbilityAction,
  createDictatorDrawTacticsAction,
  createDictatorPlaceExtraMilitiaAction,
  createDictatorSkipExtraMilitiaAction,
  createDesignatePrivacyPlayerAction,
} from './day-one-actions.js';

// =============================================================================
// Action Registration
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
  game.registerAction(createCollectEquipmentAction(game));
  game.registerAction(createTakeFromStashAction(game));
  game.registerAction(createTrainAction(game));
  game.registerAction(createReEquipAction(game));
  game.registerAction(createReEquipContinueAction(game));
  game.registerAction(createDropEquipmentAction(game));
  game.registerAction(createDocHealAction(game)); // MERC-m4k: Doc's free heal
  game.registerAction(createFeedbackDiscardAction(game)); // MERC-24h: Feedback discard retrieval
  game.registerAction(createSquidheadDisarmAction(game)); // MERC-4qd: Squidhead disarm mines
  game.registerAction(createSquidheadArmAction(game)); // MERC-4qd: Squidhead arm mines
  game.registerAction(createHagnessDrawTypeAction(game)); // MERC-jrph: Hagness draw equipment (step 1)
  game.registerAction(createHagnessGiveEquipmentAction(game)); // MERC-jrph: Hagness give equipment (step 2)
  game.registerAction(createRepairKitAction(game)); // Repair Kit from stash
  game.registerAction(createMortarAction(game)); // Rebel mortar attack
  game.registerAction(createDetonateExplosivesAction(game)); // Explosives win condition
  game.registerAction(createHospitalAction(game));
  game.registerAction(createArmsDealerAction(game));
  game.registerAction(createAssignToSquadAction(game));
  game.registerAction(createEndTurnAction(game));
  game.registerAction(createViewStashAction(game));

  // MERC-n1f: Combat actions
  game.registerAction(createCombatContinueAction(game));
  game.registerAction(createCombatRetreatAction(game));
  game.registerAction(createCombatSelectTargetAction(game)); // MERC-t5k: Target selection
  game.registerAction(createCombatAssignAttackDogAction(game)); // MERC-l09: Attack Dog assignment
  game.registerAction(createCombatHealAction(game)); // Medical Kit / First Aid Kit healing
  game.registerAction(createCombatSurgeonHealAction(game)); // Surgeon's heal ability (human-controlled)
  game.registerAction(createCombatBeforeAttackHealAction(game)); // Before-attack healing (correct timing per rules)
  game.registerAction(createCombatSkipBeforeAttackHealAction(game)); // Skip before-attack healing
  // MERC-dice: Combat hit allocation actions
  game.registerAction(createCombatAllocateHitsAction(game));
  game.registerAction(createCombatBasicRerollAction(game));
  game.registerAction(createCombatAllocateWolverineSixesAction(game));

  // MERC-4.9: Epinephrine Shot player choice
  game.registerAction(createCombatUseEpinephrineAction(game));
  game.registerAction(createCombatDeclineEpinephrineAction(game));

  // Clear combat state after UI animations complete
  game.registerAction(createClearCombatAnimationsAction(game));

  // MERC-lw9r: Artillery Barrage hit allocation (stub until Plan 04)
  game.registerAction(createArtilleryAllocateHitsAction(game));

  // Mortar attack hit allocation
  game.registerAction(createMortarAllocateHitsAction(game));

  // Day 1 specific actions (Rebel)
  game.registerAction(createHireFirstMercAction(game));
  game.registerAction(createHireSecondMercAction(game));
  game.registerAction(createHireThirdMercAction(game));
  game.registerAction(createEquipStartingAction(game));

  // Day 1 specific actions (Dictator) - MERC-mtoq
  game.registerAction(createSelectDictatorAction(game)); // Human dictator chooses their dictator
  game.registerAction(createDictatorPlaceInitialMilitiaAction(game));
  game.registerAction(createDictatorHireFirstMercAction(game));
  game.registerAction(createChooseKimBaseAction(game)); // Human Kim chooses base location
  game.registerAction(createDictatorSetupAbilityAction(game));
  game.registerAction(createDictatorDrawTacticsAction(game));
  game.registerAction(createDictatorPlaceExtraMilitiaAction(game));
  game.registerAction(createDictatorSkipExtraMilitiaAction(game));

  // Dictator actions
  game.registerAction(createPlayTacticsAction(game));
  game.registerAction(createReinforceAction(game));

  // Dictator per-turn ability actions (for human players)
  game.registerAction(createCastroBonusHireAction(game));
  game.registerAction(createKimBonusMilitiaAction(game));
  game.registerAction(createGeneralissimoPickAction(game)); // Generalissimo MERC hire

  // Dictator MERC actions
  // Note: All basic MERC actions are now unified with rebel actions
  // (move, explore, train, reEquip, dropEquipment, mortar, endTurn work for both player types)

  // MERC-xj2: Privacy Player setup
  game.registerAction(createDesignatePrivacyPlayerAction(game));
}

