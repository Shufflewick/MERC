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
import { TacticsCard } from '../elements.js';
import type { RebelPlayer } from '../game.js';

// Import all action creators
import {
  createMoveAction,
  createCoordinatedAttackAction,
  createDeclareCoordinatedAttackAction,
  createJoinCoordinatedAttackAction,
  createExecuteCoordinatedAttackAction,
  createSplitSquadAction,
  createMergeSquadsAction,
} from './rebel-movement.js';

import {
  createCombatContinueAction,
  createCombatRetreatAction,
} from './rebel-combat.js';

import {
  createHireMercAction,
  createExploreAction,
  createTakeFromStashAction,
  createTrainAction,
  createHospitalAction,
  createArmsDealerAction,
  createEndTurnAction,
} from './rebel-economy.js';

import {
  createReEquipAction,
  createDropEquipmentAction,
  createDocHealAction,
  createFeedbackDiscardAction,
  createSquidheadDisarmAction,
  createSquidheadArmAction,
  createHagnessDrawAction,
} from './rebel-equipment.js';

import {
  createPlayTacticsAction,
  createReinforceAction,
  createMoveMilitiaAction,
  createSkipMilitiaMoveAction,
  createDictatorMoveAction,
  createDictatorExploreAction,
  createDictatorTrainAction,
  createDictatorReEquipAction,
  createDictatorHealAction,
  createDictatorMortarAction,
  createDictatorEndMercActionsAction,
} from './dictator-actions.js';

import {
  createHireStartingMercsAction,
  createEquipStartingAction,
  createPlaceLandingAction,
  createDictatorPlaceInitialMilitiaAction,
  createDictatorHireFirstMercAction,
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
  game.registerAction(createTakeFromStashAction(game));
  game.registerAction(createTrainAction(game));
  game.registerAction(createReEquipAction(game));
  game.registerAction(createDropEquipmentAction(game));
  game.registerAction(createDocHealAction(game)); // MERC-m4k: Doc's free heal
  game.registerAction(createFeedbackDiscardAction(game)); // MERC-24h: Feedback discard retrieval
  game.registerAction(createSquidheadDisarmAction(game)); // MERC-4qd: Squidhead disarm mines
  game.registerAction(createSquidheadArmAction(game)); // MERC-4qd: Squidhead arm mines
  game.registerAction(createHagnessDrawAction(game)); // MERC-jrph: Hagness draw equipment
  game.registerAction(createHospitalAction(game));
  game.registerAction(createArmsDealerAction(game));
  game.registerAction(createSplitSquadAction(game));
  game.registerAction(createMergeSquadsAction(game));
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

  // Dictator state
  game.registerDebug('Dictator State', () => {
    const dictator = game.dictatorPlayer;
    if (!dictator) return { error: 'No dictator player' };

    const dictatorCard = dictator.dictator;
    const allMercs = dictator.mercSquad?.getMercs() || [];
    const livingMercs = dictator.hiredMercs;

    return {
      isAI: dictator.isAI,
      baseRevealed: dictator.baseRevealed,
      baseSectorId: dictator.baseSectorId,
      isDefeated: dictator.isDefeated,
      dictatorCard: dictatorCard ? {
        name: dictatorCard.dictatorName,
        inPlay: dictatorCard.inPlay,
        isDead: dictatorCard.isDead,
        health: dictatorCard.health,
        actionsRemaining: dictatorCard.actionsRemaining,
        sectorId: dictatorCard.sectorId,
      } : null,
      mercSquad: {
        sectorId: dictator.mercSquad?.sectorId,
        totalMercs: allMercs.length,
        livingMercs: livingMercs.length,
        mercs: allMercs.map(m => ({
          name: m.mercName,
          isDead: m.isDead,
          health: m.health,
          damage: m.damage,
          maxHealth: m.maxHealth,
          actionsRemaining: m.actionsRemaining,
          sectorId: m.sectorId,
        })),
      },
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
      rebelCombatants: (game.activeCombat.rebelCombatants as any[])?.length ?? 0,
      dictatorCombatants: (game.activeCombat.dictatorCombatants as any[])?.length ?? 0,
      rebelCasualties: (game.activeCombat.rebelCasualties as any[])?.length ?? 0,
      dictatorCasualties: (game.activeCombat.dictatorCasualties as any[])?.length ?? 0,
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
            name: m.mercName,
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
            name: m.mercName,
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
