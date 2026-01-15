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
import { TacticsCard, Squad } from '../elements.js';
import type { RebelPlayer } from '../game.js';

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
  createCombatAllocateHitsAction,
  createCombatBasicRerollAction,
  createCombatAllocateWolverineSixesAction,
  createArtilleryAllocateHitsAction,
  createCombatUseEpinephrineAction,
  createCombatDeclineEpinephrineAction,
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
  createHagnessDrawAction,
  createRepairKitAction,
  createMortarAction,
  createDetonateExplosivesAction,
} from './rebel-equipment.js';

import {
  createPlayTacticsAction,
  createReinforceAction,
  createCastroBonusHireAction,
  createKimBonusMilitiaAction,
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
  game.registerAction(createHagnessDrawAction(game)); // MERC-jrph: Hagness draw equipment
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
  // MERC-dice: Combat hit allocation actions
  game.registerAction(createCombatAllocateHitsAction(game));
  game.registerAction(createCombatBasicRerollAction(game));
  game.registerAction(createCombatAllocateWolverineSixesAction(game));

  // MERC-4.9: Epinephrine Shot player choice
  game.registerAction(createCombatUseEpinephrineAction(game));
  game.registerAction(createCombatDeclineEpinephrineAction(game));

  // MERC-lw9r: Artillery Barrage hit allocation (stub until Plan 04)
  game.registerAction(createArtilleryAllocateHitsAction(game));

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

  // Dictator MERC actions
  // Note: All basic MERC actions are now unified with rebel actions
  // (move, explore, train, reEquip, dropEquipment, mortar, endTurn work for both player types)

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
    return game.gameMap.getAllSectors().map(sector => ({
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
    const result: Array<{
      player: number | 'dictator';
      squad: 'primary' | 'secondary';
      sectorId: string | undefined;
      mercs: Array<{ name: string; actions: number }>;
    }> = [];

    // Rebel squads
    for (const rebel of game.rebelPlayers) {
      if (rebel.primarySquad) {
        result.push({
          player: rebel.position,
          squad: 'primary',
          sectorId: rebel.primarySquad.sectorId,
          mercs: rebel.primarySquad.getLivingMercs().map(m => ({
            name: m.combatantName,
            actions: m.actionsRemaining,
          })),
        });
      }
      if (rebel.secondarySquad) {
        result.push({
          player: rebel.position,
          squad: 'secondary',
          sectorId: rebel.secondarySquad.sectorId,
          mercs: rebel.secondarySquad.getLivingMercs().map(m => ({
            name: m.combatantName,
            actions: m.actionsRemaining,
          })),
        });
      }
    }

    // Dictator squads
    const dictator = game.dictatorPlayer;
    if (dictator) {
      try {
        if (dictator.primarySquad) {
          result.push({
            player: 'dictator',
            squad: 'primary',
            sectorId: dictator.primarySquad.sectorId,
            mercs: dictator.primarySquad.getLivingMercs().map(m => ({
              name: m.combatantName,
              actions: m.actionsRemaining,
            })),
          });
        }
      } catch { /* not initialized */ }
      try {
        if (dictator.secondarySquad) {
          result.push({
            player: 'dictator',
            squad: 'secondary',
            sectorId: dictator.secondarySquad.sectorId,
            mercs: dictator.secondarySquad.getLivingMercs().map(m => ({
              name: m.combatantName,
              actions: m.actionsRemaining,
            })),
          });
        }
      } catch { /* not initialized */ }
    }

    return result;
  });

  // Dictator state
  game.registerDebug('Dictator State', () => {
    const dictator = game.dictatorPlayer;
    if (!dictator) return { error: 'No dictator player' };

    const dictatorCard = dictator.dictator;
    const allMercs = dictator.allMercs;
    const livingMercs = dictator.hiredMercs;

    // Helper to format squad info
    const formatSquad = (squad: Squad | null, name: string) => {
      if (!squad) return { name, error: 'Squad not found' };
      const mercs = squad.getMercs();
      return {
        name,
        sectorId: squad.sectorId,
        mercCount: mercs.length,
        mercs: mercs.map(m => ({
          name: m.combatantName,
          isDead: m.isDead,
          health: m.health,
          damage: m.damage,
          maxHealth: m.maxHealth,
          actionsRemaining: m.actionsRemaining,
          sectorId: m.sectorId,
        })),
      };
    };

    let primarySquad: Squad | null = null;
    let secondarySquad: Squad | null = null;
    try { primarySquad = dictator.primarySquad; } catch { /* not initialized */ }
    try { secondarySquad = dictator.secondarySquad; } catch { /* not initialized */ }

    return {
      isAI: dictator.isAI,
      baseRevealed: dictator.baseRevealed,
      baseSectorId: dictator.baseSectorId,
      isDefeated: dictator.isDefeated,
      dictatorCard: dictatorCard ? {
        name: dictatorCard.combatantName,
        inPlay: dictatorCard.inPlay,
        isDead: dictatorCard.isDead,
        health: dictatorCard.health,
        actionsRemaining: dictatorCard.actionsRemaining,
        sectorId: dictatorCard.sectorId,
      } : null,
      primarySquad: formatSquad(primarySquad, 'primary'),
      secondarySquad: formatSquad(secondarySquad, 'secondary'),
      totalMercs: allMercs.length,
      livingMercs: livingMercs.length,
      tactics: {
        deckCount: dictator.tacticsDeck?.count(TacticsCard) ?? 0,
        handCount: dictator.tacticsHand?.count(TacticsCard) ?? 0,
        discardCount: dictator.tacticsDiscard?.count(TacticsCard) ?? 0,
      },
      hasActionsLeft: livingMercs.some(m => m.actionsRemaining > 0) ||
        (dictatorCard?.inPlay && dictatorCard.actionsRemaining > 0),
    };
  });

  // Active combat state
  game.registerDebug('Active Combat', () => {
    if (!game.activeCombat) return { active: false };

    return {
      active: true,
      sectorId: game.activeCombat.sectorId,
      attackingPlayerId: game.activeCombat.attackingPlayerId,
      round: game.activeCombat.round,
      rebelCombatants: game.activeCombat.rebelCombatants?.length ?? 0,
      dictatorCombatants: game.activeCombat.dictatorCombatants?.length ?? 0,
      rebelCasualties: game.activeCombat.rebelCasualties?.length ?? 0,
      dictatorCasualties: game.activeCombat.dictatorCasualties?.length ?? 0,
      // MERC-t5k: Target selection state
      pendingTargetSelection: game.activeCombat.pendingTargetSelection ? {
        attackerId: game.activeCombat.pendingTargetSelection.attackerId,
        attackerName: game.activeCombat.pendingTargetSelection.attackerName,
        validTargetCount: game.activeCombat.pendingTargetSelection.validTargets?.length ?? 0,
        maxTargets: game.activeCombat.pendingTargetSelection.maxTargets,
      } : null,
      currentAttackerIndex: game.activeCombat.currentAttackerIndex,
      selectedTargetsCount: game.activeCombat.selectedTargets?.size ?? 0,
    };
  });

  // Militia distribution
  game.registerDebug('Militia', () => {
    return game.gameMap.getAllSectors().map(sector => ({
      sectorId: sector.sectorId,
      sectorName: sector.sectorName,
      dictatorMilitia: sector.dictatorMilitia,
      rebelMilitia: sector.rebelMilitia,
    })).filter(s => s.dictatorMilitia > 0 || Object.keys(s.rebelMilitia || {}).length > 0);
  });

  // Rebel state
  game.registerDebug('Rebel State', () => {
    return game.rebelPlayers.map(rebel => {
      const primarySquad = rebel.primarySquad;
      const secondarySquad = rebel.secondarySquad;
      const team = rebel.team;

      return {
        player: rebel.position,
        name: rebel.name,
        primarySquad: {
          sectorId: primarySquad?.sectorId,
          mercCount: primarySquad?.mercCount ?? 0,
          livingMercCount: primarySquad?.livingMercCount ?? 0,
          mercs: primarySquad?.getMercs().map(m => ({
            name: m.combatantName,
            isDead: m.isDead,
            health: m.health,
            actionsRemaining: m.actionsRemaining,
          })) ?? [],
        },
        secondarySquad: {
          sectorId: secondarySquad?.sectorId,
          mercCount: secondarySquad?.mercCount ?? 0,
          livingMercCount: secondarySquad?.livingMercCount ?? 0,
          mercs: secondarySquad?.getMercs().map(m => ({
            name: m.combatantName,
            isDead: m.isDead,
            health: m.health,
            actionsRemaining: m.actionsRemaining,
          })) ?? [],
        },
        teamSize: team.length,
        hasActionsLeft: team.some(m => m.actionsRemaining > 0),
        totalActionsRemaining: team.reduce((sum, m) => sum + m.actionsRemaining, 0),
      };
    });
  });
}
