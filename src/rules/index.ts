// Game and Player classes
export { MERCGame, RebelPlayer, DictatorPlayer } from './game.js';
export type { MERCOptions, SetupConfiguration, MERCPlayer } from './game.js';

// Element classes
export {
  // Cards
  MercCard,
  Equipment,
  DictatorCard,
  TacticsCard,

  // Board elements
  Sector,
  GameMap,
  Squad,

  // Units
  Militia,

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
  createPlaceLandingAction,
  createMoveAction,
  createCoordinatedAttackAction, // MERC-wrq: Coordinated attacks (same player)
  createDeclareCoordinatedAttackAction, // MERC-a2h: Multi-player coordinated attacks
  createJoinCoordinatedAttackAction, // MERC-a2h: Join multi-player attack
  createExecuteCoordinatedAttackAction, // MERC-a2h: Execute multi-player attack
  createExploreAction,
  createTrainAction,
  // createAttackAction removed - combat triggers via movement only
  createReEquipAction,
  createHospitalAction,
  createArmsDealerAction,
  createSplitSquadAction,
  createMergeSquadsAction,
  createEndTurnAction,
  createFireMercAction, // Can also be done during hire (MERC-yi7)
  createPlayTacticsAction,
  createReinforceAction,
  createMoveMilitiaAction,
  createSkipMilitiaMoveAction,
  // Day 1 specific actions
  createHireStartingMercsAction,
  createEquipStartingAction,
  createPlaceLandingDay1Action,
  // Dictator MERC actions
  createDictatorMoveAction,
  createDictatorExploreAction,
  createDictatorTrainAction,
  createDictatorReEquipAction,
  createDictatorEndMercActionsAction,
  // MERC-n1f: Combat actions
  createCombatContinueAction,
  createCombatRetreatAction,
  registerAllActions,
} from './actions.js';

// Day 1 - The Landing
export {
  // Rebel Phase
  drawMercsForHiring,
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
import { createColorOption } from '@boardsmith/session';

export const gameDefinition = {
  gameClass: MERCGame,
  gameType: 'MERC',
  displayName: 'MERC',
  minPlayers: 2,  // 1 Dictator + 1 Rebel
  maxPlayers: 7,  // 1 Dictator + 6 Rebels

  // Game-level options
  gameOptions: {
    dictatorPlayerPosition: {
      type: 'number',
      label: 'Dictator Player',
      description: 'Which player position plays as the dictator (-1 = last player)',
      min: -1,
      max: 6,
      default: -1,
    },
  },

  // Per-player options
  playerOptions: {
    color: createColorOption(),
  },

  // Quick-start presets
  presets: [
    {
      name: 'Play as Rebel',
      options: { dictatorPlayerPosition: -1 },
      players: [
        { color: '#e74c3c', isAI: false },  // Red rebel (you)
        { color: '#95a5a6', isAI: true, aiLevel: 'medium' },  // Dictator AI
      ],
    },
    {
      name: 'Play as Dictator',
      options: { dictatorPlayerPosition: 0 },
      players: [
        { color: '#95a5a6', isAI: false },  // Dictator (you)
        { color: '#e74c3c', isAI: true, aiLevel: 'medium' },  // Red rebel AI
      ],
    },
    {
      name: '2 Rebels vs AI Dictator',
      options: { dictatorPlayerPosition: -1 },
      players: [
        { color: '#e74c3c', isAI: false },  // Red rebel
        { color: '#3498db', isAI: false },  // Blue rebel
        { color: '#95a5a6', isAI: true, aiLevel: 'medium' },  // Dictator AI
      ],
    },
    {
      name: '3 Rebels vs AI Dictator',
      options: { dictatorPlayerPosition: -1 },
      players: [
        { color: '#e74c3c', isAI: false },  // Red rebel
        { color: '#3498db', isAI: false },  // Blue rebel
        { color: '#27ae60', isAI: false },  // Green rebel
        { color: '#95a5a6', isAI: true, aiLevel: 'hard' },  // Dictator AI
      ],
    },
  ],
} as const;
