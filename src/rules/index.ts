// Game and Player classes
export { MERCGame, MERCPlayer } from './game.js';
export type { MERCOptions, SetupConfiguration, MERCPlayerRole, RebelPlayer, DictatorPlayer } from './game.js';

// Element classes
export {
  // Cards
  Equipment,
  TacticsCard,

  // Board elements
  Sector,
  GameMap,
  Squad,

  // Units
  Militia,

  // Base classes
  CombatantBase,
  CombatantModel,

  // Collections
  MercDeck,
  EquipmentDeck,
  TacticsDeck,
  TacticsHand,
  DiscardPile,
  PlayerArea,

  // Types
  type EquipmentType,
  type SectorType,
  type PlayerColor,
  type MercStats,
  type MercAttributes,
  type EquipmentBonuses,
} from './elements.js';

// Actions
export {
  createHireMercAction,
  createRehireMercAction,
  createPlaceLandingAction,
  createMoveAction,
  createCoordinatedAttackAction, // MERC-wrq: Coordinated attacks (same player)
  createDeclareMultiPlayerAttackAction, // MERC-a2h: Multi-player coordinated attacks
  createCommitSquadToCoordinatedAttackAction, // MERC-a2h: Simultaneous response
  createDeclineCoordinatedAttackAction, // MERC-a2h: Simultaneous response
  createExploreAction,
  createTakeFromStashAction,
  createTrainAction,
  // createAttackAction removed - combat triggers via movement only
  createReEquipAction,
  createHospitalAction,
  createArmsDealerAction,
  createAssignToSquadAction,
  createEndTurnAction,
  // Fire MERC is now only part of hire action (MERC-yi7)
  createPlayTacticsAction,
  createReinforceAction,
  // Day 1 specific actions
  createHireFirstMercAction,
  createHireSecondMercAction,
  createPlaceLandingDay1Action,
  // Dictator MERC actions
  // Note: All basic MERC actions are now unified with rebel actions
  // MERC-n1f: Combat actions
  createCombatContinueAction,
  createCombatRetreatAction,
  registerAllActions,
} from './actions.js';

// Day 1 - The Landing
export {
  // Rebel Phase
  hireSelectedMercs,
  isValidLandingSector,
  getValidLandingSectors,
  placeLanding,
  equipStartingEquipment,
  // Dictator Phase
  getUnoccupiedIndustries,
  placeInitialMilitia,
  hireDictatorMerc,
  applyDictatorSetupAbility,
  drawTacticsHand,
  placeExtraMilitia,
  autoPlaceExtraMilitia,
  executeDictatorDay1,
  // Utilities
  getDay1Summary,
  isRebelDay1Complete,
  isRebelPhaseComplete,
  getStartingMercCount,
  getMercsToDrawForHiring,
  getMaxMilitiaPerSector,
  // Types
  type RebelDay1Setup,
} from './day-one.js';

// Flow
export { createGameFlow } from './flow.js';

// Combat
export {
  executeCombat,
  executeCombatRetreat, // MERC-n1f: Interactive retreat
  getCombatants,
  hasEnemies,
  calculateCombatOdds,
  getValidRetreatSectors, // MERC-n1f: Get valid retreat destinations
  canRetreat, // MERC-n1f: Check if retreat is possible
  type Combatant,
  type CombatResult,
  type CombatRound,
  type CombatOutcome,
} from './combat.js';

// Constants
export {
  // Constant objects
  GameConstants,
  CombatConstants,
  MercConstants,
  SectorConstants,
  TeamConstants,
  DictatorConstants,
  GameDurationConstants,
  TieBreakers,
  AdjacencyConstants,
  ExpansionConstants,
  ReinforcementTable,

  // Helper functions
  getSetupConfiguration,
  getTotalSectors,
  getReinforcementAmount,

  // Types
  type SetupData,
} from './constants.js';

// Setup functions
export {
  // Main setup functions
  performSetup,
  buildMap,
  setupDictator,
  setupTacticsDeck,
  shuffleDecks,

  // Utilities
  isIndustryPosition,
  validateSetupConfig,
  getSetupSummary,

  // Types
  type SectorData,
  type DictatorData,
  type TacticsData,
  type SetupOptions,
} from './setup.js';

// Dictator Abilities
export {
  applyDictatorSetupAbilities,
  applyDictatorTurnAbilities,
  applyCastroTurnAbility,
  applyKimTurnAbility,
  applyKimSetupAbility,
  type DictatorAbilityType,
  type DictatorAbilityResult,
} from './dictator-abilities.js';

// Tactics Card Effects
export {
  executeTacticsEffect,
  applyConscriptsEffect,
  type TacticsEffectResult,
} from './tactics-effects.js';

// Game definition for BoardSmith
import { MERCGame } from './game.js';
import { mercBot } from './bot.js';

export const gameDefinition = {
  gameClass: MERCGame,
  gameType: 'MERC',
  displayName: 'MERC',
  minPlayers: 2,  // 1 Dictator + 1 Rebel
  maxPlayers: 7,  // 1 Dictator + 6 Rebels

  // MCTS hooks — without these the bot has no evaluation gradient on this board
  bot: mercBot,

  // Quick-start presets
  presets: [
    {
      name: 'Play as Rebel',
      players: [
        { color: '#E74C3C', role: false, isBot: false },
        { color: '#95A5A6', role: true, isBot: true, botLevel: 'medium' },
      ],
    },
    {
      name: 'Play as Dictator',
      players: [
        { color: '#95A5A6', role: true, isBot: false },
        { color: '#E74C3C', role: false, isBot: true, botLevel: 'medium' },
      ],
    },
    {
      name: '2 Rebels vs Bot Dictator',
      players: [
        { color: '#E74C3C', role: false, isBot: false },
        { color: '#3498DB', role: false, isBot: false },
        { color: '#95A5A6', role: true, isBot: true, botLevel: 'medium' },
      ],
    },
    {
      name: '3 Rebels vs Bot Dictator',
      players: [
        { color: '#E74C3C', role: false, isBot: false },
        { color: '#3498DB', role: false, isBot: false },
        { color: '#27AE60', role: false, isBot: false },
        { color: '#95A5A6', role: true, isBot: true, botLevel: 'hard' },
      ],
    },
  ],
} as const;
