<script setup lang="ts">
// Vue core
import { computed, ref, watch, inject, nextTick, toRef } from 'vue';

// External packages
import { useBoardInteraction, type UseActionControllerReturn, useAnimationEvents, GameOverlay } from 'boardsmith/ui';

// Components (alphabetical)
import AssignToSquadPanel from './AssignToSquadPanel.vue';
import CombatPanel from './CombatPanel.vue';
import CombatantCard from './CombatantCard.vue';
import DictatorPanel from './DictatorPanel.vue';
import HagnessDrawEquipment from './HagnessDrawEquipment.vue';
import HiringPhase from './HiringPhase.vue';
import LandingZoneSelection from './LandingZoneSelection.vue';
import MapGrid from './MapGrid.vue';
import ModalContent from './ModalContent.vue';
import MortarAttackPanel, { type MortarAttackData } from './MortarAttackPanel.vue';
import EquipSpectatorPanel, { type EquipSessionCombatant, type EquipFlyItem } from './EquipSpectatorPanel.vue';
import SectorPanel from './SectorPanel.vue';
import SquadPanel from './SquadPanel.vue';

// Composables (alphabetical)
import { useActionState } from '../composables/useActionState';
import { useGameViewHelpers } from '../composables/useGameViewHelpers';
import { usePlayerState } from '../composables/usePlayerState';
import { useSectorState } from '../composables/useSectorState';
import { useSquadState } from '../composables/useSquadState';
import { useVictoryCalculations } from '../composables/useVictoryCalculations';

// Utilities
import { UI_COLORS } from '../colors';
import { quickReassignInProgress } from '../drag-drop-state';

// Type for deferred choices fetch function (injected from GameShell)
type FetchDeferredChoicesFn = (
  actionName: string,
  selectionName: string,
  playerSeat: number,
  currentArgs: Record<string, unknown>
) => Promise<{
  success: boolean;
  choices?: Array<{ value: unknown; display: string }>;
  error?: string;
}>;

// Inject deferred choices fetch function from GameShell
const fetchDeferredChoicesFn = inject<FetchDeferredChoicesFn | undefined>('fetchDeferredChoicesFn', undefined);

// Get board interaction for checking selectable elements
const boardInteraction = useBoardInteraction();

const props = defineProps<{
  gameView: any;
  playerSeat: number;
  isMyTurn: boolean;
  availableActions: string[];
  actionArgs: Record<string, unknown>;
  actionController: UseActionControllerReturn;
  setBoardPrompt: (prompt: string | null) => void;
  state?: any; // Flow state from GameShell
  flyingCombatantName?: string | null; // Name of combatant currently animating (hide at destination)
  // Combatant data for modal opened from header (outside GameShell)
  headerCombatantData?: {
    combatant: any;
    color: string;
    squadName: string;
    sectorName: string;
  } | null;
}>();

const emit = defineEmits<{
  (e: 'close-header-combatant-modal'): void;
}>();

// Initialize composables with gameView getter
const {
  normalizeClassName,
  findByClassName,
  findAllByClassName,
  findByRef,
  findElementById,
  getAttr,
  findDictatorCombatant,
  findDictatorCombatantWithParent,
  isMercDead,
} = useGameViewHelpers(() => props.gameView);

const {
  countTacticsCards,
  calculateRebelVictoryPoints,
  calculateDictatorVictoryPoints,
  isGameOver,
  gameWinner,
} = useVictoryCalculations(() => props.gameView);

// ============================================================================
// STATE COMPOSABLES - Initialize in dependency order
// ============================================================================

// Create a ref from props for reactive tracking in composables
const playerSeatRef = toRef(() => props.playerSeat);

// Player state (independent)
const {
  players,
  currentPlayerColor,
  playerColorMap,
  dictatorPlayerColor,
  currentPlayerIsDictator,
  seatToColor,
} = usePlayerState(
  () => props.gameView,
  playerSeatRef
);

// Combatant data from game settings (for image/stat lookups)
const combatantData = computed(() => {
  return props.gameView?.attributes?.settings?.combatantData ||
         props.state?.state?.settings?.combatantData ||
         props.gameView?.settings?.combatantData || [];
});

// Sector state (needs allMercs via lazy getter - allMercs initialized below)
const {
  sectors,
  selectedSectorId,
  selectedSector,
  actionContextSectorId,
  actionContextSector,
  activeSector,
  selectedSectorStash,
  selectedSectorMercs,
  controlMap,
  hasSquidhead,
  hasMortar,
  hasLandMinesInStash,
  squidheadHasLandMine,
} = useSectorState(
  () => props.gameView,
  {
    getCurrentAction: () => props.actionController.currentAction.value,
    getCurrentArgs: () => props.actionController.currentArgs.value,
    isCurrentPlayerDictator: () => currentPlayerIsDictator.value,
    getAllMercs: () => allMercs.value, // Lazy reference - allMercs initialized below
    getPrimarySquad: () => primarySquad.value,
    getSecondarySquad: () => secondarySquad.value,
    getDictatorPrimarySquad: () => dictatorPrimarySquad.value,
    getDictatorSecondarySquad: () => dictatorSecondarySquad.value,
    // Cast required: dictatorCard returns full dictator data, but SectorStateDependencies
    // only needs { sectorId, inPlay } subset. The cast is safe as these properties exist.
    getDictatorCard: () => dictatorCard.value as { sectorId: string; inPlay: boolean } | undefined,
    seatToColor,
    getDictatorColor: () => dictatorPlayerColor.value,
  }
);

// Squad state (depends on player state, needs sectors computed ref)
const {
  primarySquad,
  secondarySquad,
  dictatorPrimarySquad,
  dictatorSecondarySquad,
  dictatorBaseSquad,
  dictatorSquad,
  allMercs,
} = useSquadState(
  () => props.gameView,
  playerSeatRef,
  currentPlayerIsDictator,
  sectors,
  players
);

// Action state (depends on sectors and squads)
const {
  actionChoices,
  currentActionMetadata,
  currentPick,
  allSelectionsComplete,
  getCurrentActionName,
  isHiringMercs,
  isSelectingDictator,
  isHagnessDrawActive,
  isPlacingLanding,
  isSelectingRetreatSector,
  isEquipping,
  isSelectingEquipmentType,
  isCastroHiring,
  isSelectingSector,
  showAssignToSquad,
  isHagnessSelectingType,
  isHagnessSelectingFromDrawn,
  isHagnessSelectingRecipient,
  retreatSectorChoices,
  sectorChoices,
  landingZoneMetadata,
  selectedMercForEquipment,
  selectedMercImagePath,
  selectedMercName,
  selectedMercId,
  equipmentTypeChoices,
  hagnessEquipmentTypeChoices,
  hagnessDrawnChoices,
  hagnessDrawnEquipment,
  hagnessSquadMates,
  deferredChoicesLoading,
  fetchedDeferredChoices,
  showHiringMercModal,
  assignToSquadDelayedHide,
  findMercByName,
  getSectorImageFallback,
} = useActionState(
  {
    availableActions: props.availableActions,
    actionController: props.actionController,
    actionArgs: props.actionArgs,
    getActionArgs: () => props.actionArgs, // Reactive getter for Vue dependency tracking
    state: props.state,
    playerSeat: props.playerSeat,
    gameView: props.gameView,
    getGameView: () => props.gameView, // Reactive getter for Vue dependency tracking
    isCurrentPlayerDictator: () => currentPlayerIsDictator.value,
  },
  sectors,
  primarySquad,
  secondarySquad
);


// ============================================================================
// SECTOR-SPECIFIC STATE (not extracted to composables)
// ============================================================================

// Check if active sector has enemy forces (for mortar targeting)
// Dictator targets rebel forces; Rebels target dictator forces
const selectedSectorHasEnemyForces = computed(() => {
  if (!activeSector.value) {
    return false;
  }

  if (currentPlayerIsDictator.value) {
    // Dictator targets rebel forces
    const hasRebelMilitia = Object.values(activeSector.value.rebelMilitia || {})
      .some(count => (count as number) > 0);
    if (hasRebelMilitia) return true;

    // Check for rebel MERCs in sector (any non-dictator player)
    const rebelMercsInSector = allMercs.value.filter(
      (m) => m.sectorId === activeSector.value?.sectorId &&
             !m.isDictatorUnit &&
             m.playerColor !== ''
    );
    return rebelMercsInSector.length > 0;
  } else {
    // Rebels target dictator forces
    const hasDictatorMilitia = activeSector.value.dictatorMilitia > 0;
    const dictatorUnitsInSector = allMercs.value.filter(
      (m) => m.sectorId === activeSector.value?.sectorId && m.isDictatorUnit
    );
    return hasDictatorMilitia || dictatorUnitsInSector.length > 0;
  }
});

// Check if active sector is the dictator base
const selectedSectorIsBase = computed(() => {
  if (!activeSector.value) return false;
  // Use dictatorBaseSectorId which is computed from dictator combatant.sectorId
  return activeSector.value.sectorId === dictatorBaseSectorId.value;
});

// Check if player has both explosives components
const hasExplosivesComponents = computed(() => {
  const allMercsInSquads = [
    ...(primarySquad.value?.mercs || []),
    ...(secondarySquad.value?.mercs || []),
  ];

  let hasDetonator = false;
  let hasExplosives = false;

  for (const merc of allMercsInSquads) {
    const weapon = getAttr(merc, 'weaponSlot', null) as { equipmentName?: string } | null;
    const accessory = getAttr(merc, 'accessorySlot', null) as { equipmentName?: string } | null;

    const weaponName = weapon?.equipmentName?.toLowerCase() || '';
    const accessoryName = accessory?.equipmentName?.toLowerCase() || '';

    if (weaponName.includes('detonator') || accessoryName.includes('detonator')) {
      hasDetonator = true;
    }
    if (weaponName.includes('explosive') || accessoryName.includes('explosive')) {
      hasExplosives = true;
    }
  }

  return hasDetonator && hasExplosives;
});

// MERC-rwdv: Get dictator card data (for DictatorPanel)
const dictatorCard = computed(() => {
  if (!currentPlayerIsDictator.value) return undefined;

  // Find dictator player - try multiple class name patterns
  let dictatorPlayer = findByClassName('DictatorPlayer');
  if (!dictatorPlayer) {
    dictatorPlayer = findByClassName('_DictatorPlayer');
  }

  // Find dictator combatant with parent context (for getting sectorId from parent Squad)
  let result = dictatorPlayer ? findDictatorCombatantWithParent(dictatorPlayer) : null;
  if (!result) {
    // Search entire gameView
    result = findDictatorCombatantWithParent();
  }

  const dictatorCardNode = result?.node;
  const parentNode = result?.parent;

  // If we still can't find it, return a placeholder
  // This is expected during dictator selection phase before the character is chosen
  if (!dictatorCardNode) {
    return {
      id: 0,
      combatantId: 'unknown',
      combatantName: 'Dictator',
      ability: 'Ability not loaded',
      bio: '',
      image: '',
      inPlay: false,
      actionsRemaining: 0,
    };
  }

  const attrs = dictatorCardNode.attributes || {};

  // Extract equipment slot data (similar to how CombatantModel does it)
  const weaponSlotData = attrs.weaponSlotData || getAttr(dictatorCardNode, 'weaponSlotData', null);
  const armorSlotData = attrs.armorSlotData || getAttr(dictatorCardNode, 'armorSlotData', null);
  const accessorySlotData = attrs.accessorySlotData || getAttr(dictatorCardNode, 'accessorySlotData', null);

  // Get combatant identity
  const combatantId = attrs.combatantId || getAttr(dictatorCardNode, 'combatantId', 'unknown');
  const combatantName = attrs.combatantName || getAttr(dictatorCardNode, 'combatantName', 'Unknown Dictator');

  // Get sectorId from parent Squad (CombatantModel.sectorId is a getter, not serialized)
  let sectorId = '';
  if (parentNode) {
    const parentClass = normalizeClassName(parentNode.className);
    if (parentClass === 'Squad') {
      sectorId = getAttr(parentNode, 'sectorId', '');
    }
  }

  return {
    id: dictatorCardNode.ref,
    combatantId,
    combatantName,
    ability: attrs.ability || getAttr(dictatorCardNode, 'ability', ''),
    bio: attrs.bio || getAttr(dictatorCardNode, 'bio', ''),
    image: attrs.image || getAttr(dictatorCardNode, 'image', ''),
    inPlay: attrs.inPlay || getAttr(dictatorCardNode, 'inPlay', false),
    actionsRemaining: attrs.actionsRemaining || getAttr(dictatorCardNode, 'actionsRemaining', 0),
    sectorId,
    // Equipment slots
    weaponSlot: weaponSlotData,
    armorSlot: armorSlotData,
    accessorySlot: accessorySlotData,
    // Stats for display
    baseCombat: attrs.baseCombat || getAttr(dictatorCardNode, 'baseCombat', 0),
    baseInitiative: attrs.baseInitiative || getAttr(dictatorCardNode, 'baseInitiative', 0),
    baseTraining: attrs.baseTraining || getAttr(dictatorCardNode, 'baseTraining', 0),
    maxHealth: attrs.maxHealth || getAttr(dictatorCardNode, 'maxHealth', 10),
    damage: attrs.damage || getAttr(dictatorCardNode, 'damage', 0),
  };
});

// Get dictator base sector if revealed (visible to all players for map icon)
// Get the permanent base sector location from baseSectorId on dictator combatant
// This is separate from sectorId (which is the dictator's current location)
const dictatorBaseSectorId = computed(() => {
  // Find the dictator combatant
  const dictatorCardNode = findDictatorCombatant();
  if (!dictatorCardNode) {
    return undefined;
  }

  const inPlay = getAttr(dictatorCardNode, 'inPlay', false);
  const baseSectorId = getAttr(dictatorCardNode, 'baseSectorId', '');

  // If dictator card is in play and has a base sector, show base at that location
  if (inPlay && baseSectorId) {
    return baseSectorId;
  }
  return undefined;
});

// MERC-rwdv: Get dictator's tactics hand (for DictatorPanel)
const tacticsHand = computed(() => {
  if (!currentPlayerIsDictator.value) return [];

  // Find tactics hand - search entire gameView since DictatorPlayer may not be found
  let tacticsHandNode = findByClassName('TacticsHand');
  if (!tacticsHandNode) {
    tacticsHandNode = findByClassName('_TacticsHand');
  }
  if (!tacticsHandNode) return [];

  // Get all tactics cards from hand
  const cards = (tacticsHandNode.children || [])
    .filter((c: any) => normalizeClassName(c.className) === 'TacticsCard')
    .map((c: any) => {
      const attrs = c.attributes || {};
      return {
        id: c.ref,
        tacticsId: attrs.tacticsId || getAttr(c, 'tacticsId', ''),
        tacticsName: attrs.tacticsName || getAttr(c, 'tacticsName', 'Unknown'),
        story: attrs.story || getAttr(c, 'story', ''),
        description: attrs.description || getAttr(c, 'description', ''),
      };
    });

  return cards;
});

// Get dictator's tactics discard (played cards) - visible to ALL players
const tacticsDiscard = computed(() => {
  // Find tactics discard pile - search entire gameView
  let tacticsDiscardNode = findByClassName('TacticsDiscard');
  if (!tacticsDiscardNode) {
    tacticsDiscardNode = findByClassName('_TacticsDiscard');
  }
  // Also try DiscardPile with tactics in it
  if (!tacticsDiscardNode) {
    const discardPiles = findAllByClassName('DiscardPile');
    for (const pile of discardPiles) {
      const hasTactics = (pile.children || []).some(
        (c: any) => normalizeClassName(c.className) === 'TacticsCard'
      );
      if (hasTactics) {
        tacticsDiscardNode = pile;
        break;
      }
    }
  }
  if (!tacticsDiscardNode) return [];

  // Get all tactics cards from discard
  const cards = (tacticsDiscardNode.children || [])
    .filter((c: any) => normalizeClassName(c.className) === 'TacticsCard')
    .map((c: any) => {
      const attrs = c.attributes || {};
      return {
        id: c.ref,
        tacticsId: attrs.tacticsId || getAttr(c, 'tacticsId', ''),
        tacticsName: attrs.tacticsName || getAttr(c, 'tacticsName', 'Unknown'),
        story: attrs.story || getAttr(c, 'story', ''),
        description: attrs.description || getAttr(c, 'description', ''),
      };
    });

  return cards;
});

// Militia bonus flags (from dictator tactics cards)
const militiaBonuses = computed(() => {
  return {
    betterWeapons: props.gameView?.betterWeaponsActive ||
                   props.gameView?.attributes?.betterWeaponsActive || false,
    veteranMilitia: props.gameView?.veteranMilitiaActive ||
                    props.gameView?.attributes?.veteranMilitiaActive || false,
  };
});

// State for viewing dictator's played cards modal
const showPlayedCardsModal = ref(false);

// Ref for AssignToSquadPanel to enable scrolling to it
const assignToSquadPanelRef = ref<InstanceType<typeof AssignToSquadPanel> | null>(null);

// ============================================================================
// COMBAT PANEL - driven by animation events
// ============================================================================

const animationEvents = useAnimationEvents();
const combatSnapshot = ref<Record<string, unknown> | null>(null);

// MORTAR STRIKE - driven by animation events
const activeMortarStrike = ref<{
  targetSectorId: string;
  hitCombatantIds: string[];
  militiaKilled: number;
} | null>(null);
let mortarStrikeResolve: (() => void) | null = null;

function handleMortarStrikeComplete() {
  activeMortarStrike.value = null;
  if (mortarStrikeResolve) {
    mortarStrikeResolve();
    mortarStrikeResolve = null;
  }
}

// MORTAR ATTACK PANEL - driven by animation events (hit allocation UI)
const mortarAttackData = ref<MortarAttackData | null>(null);
const hasMortarAttackPanel = computed(() => mortarAttackData.value !== null);

async function handleMortarConfirmAllocation(allocations: string[]) {
  if (!allocations || allocations.length === 0) return;
  if (!props.availableActions.includes('mortarAllocateHits')) return;

  await props.actionController.execute('mortarAllocateHits', { allocations });
  mortarAttackData.value = null;
}

function handleMortarFinished() {
  mortarAttackData.value = null;
}

// LANDMINE DETONATION - driven by animation events
const activeLandmineStrike = ref<{
  sectorId: string;
  targetNames: string[];
  damage: number;
} | null>(null);
let landmineStrikeResolve: (() => void) | null = null;

function handleLandmineStrikeComplete() {
  activeLandmineStrike.value = null;
  if (landmineStrikeResolve) {
    landmineStrikeResolve();
    landmineStrikeResolve = null;
  }
}

// EQUIP SPECTATOR SESSION - driven by animation events (shown to non-active players)
const equipSessionData = ref<{ combatant: EquipSessionCombatant; playerColor: string; playerName: string } | null>(null);
const equipFlyItems = ref<EquipFlyItem[]>([]);
let equipFlyIdCounter = 0;
let equipUpdateResolve: (() => void) | null = null;

function handleEquipFlyComplete() {
  equipFlyItems.value = [];
  if (equipUpdateResolve) {
    equipUpdateResolve();
    equipUpdateResolve = null;
  }
}


// COMBAT BARRIER OVERLAY - shown when simultaneous actions pause for combat
const combatBarrierActive = ref(false);

// TACTICS CARD ANIMATIONS - driven by animation events
const activeTacticEvent = ref<{
  type: string;
  cardName: string;
  data: Record<string, unknown>;
} | null>(null);

// Sector-targeted tactics event types (2000ms display)
const SECTOR_TACTIC_EVENTS = [
  'tactic-artillery-barrage',
  'tactic-family-threat',
  'tactic-fodder',
  'tactic-reinforcements',
  'tactic-seizure',
  'tactic-sentry',
  'tactic-block-trade',
  'tactic-tainted-water',
] as const;

// Banner/flag tactics event types (2500ms display — permanent effect announcements)
const BANNER_TACTIC_EVENTS = [
  'tactic-better-weapons',
  'tactic-veteran-militia',
  'tactic-conscripts',
  'tactic-oil-reserves',
  'tactic-generalissimo',
  'tactic-lockdown',
] as const;

if (animationEvents) {
  animationEvents.registerHandler('equip-session-start', async (event) => {
    if (props.isMyTurn) return;
    const data = event.data as { combatant: EquipSessionCombatant; playerColor?: string; playerName?: string };
    equipSessionData.value = {
      combatant: data.combatant,
      playerColor: data.playerColor || '',
      playerName: data.playerName || data.combatant.combatantName,
    };
  }, { skip: 'run' });

  animationEvents.registerHandler('equip-update', async (event) => {
    if (props.isMyTurn || !equipSessionData.value) return;
    const data = event.data as {
      combatantId: string;
      updatedCombatant: EquipSessionCombatant;
      equippedItem?: { name: string; type: string; image?: string };
      removedItems?: Array<{ name: string; type: string; image?: string }>;
    };

    // Build fly items: removed items fly out, equipped item flies in
    const flyItems: EquipFlyItem[] = [];
    if (data.removedItems) {
      for (const item of data.removedItems) {
        flyItems.push({ ...item, direction: 'out', id: ++equipFlyIdCounter });
      }
    }
    if (data.equippedItem) {
      flyItems.push({ ...data.equippedItem, direction: 'in', id: ++equipFlyIdCounter });
    }

    equipFlyItems.value = flyItems;

    // Wait for fly animation to complete, then update combatant data
    await new Promise<void>((resolve) => {
      equipUpdateResolve = resolve;
    });

    // Session may have ended while waiting for fly animation — don't reopen
    if (!equipSessionData.value) return;

    // Update combatant snapshot after animation
    equipSessionData.value = {
      ...equipSessionData.value,
      combatant: data.updatedCombatant,
    };
  }, { skip: 'drop' });

  animationEvents.registerHandler('equip-session-end', async () => {
    // Resolve any pending equip-update promise so the queue isn't blocked
    if (equipUpdateResolve) {
      equipUpdateResolve();
      equipUpdateResolve = null;
    }
    equipSessionData.value = null;
    equipFlyItems.value = [];
  }, { skip: 'run' });

  animationEvents.registerHandler('landmine-detonate', async (event) => {
    const data = event.data as {
      sectorId: string;
      targetNames: string[];
      damage: number;
    };
    activeLandmineStrike.value = data;
    await new Promise<void>((resolve) => {
      landmineStrikeResolve = resolve;
    });
  }, { skip: 'drop' });

  animationEvents.registerHandler('mortar-strike', async (event) => {
    const data = event.data as {
      targetSectorId: string;
      hitCombatantIds: string[];
      militiaKilled: number;
    };
    activeMortarStrike.value = data;
    await new Promise<void>((resolve) => {
      mortarStrikeResolve = resolve;
    });
  }, { skip: 'drop' });

  animationEvents.registerHandler('mortar-attack-panel', async (event) => {
    mortarAttackData.value = event.data as unknown as MortarAttackData;
  }, { skip: 'drop' });

  animationEvents.registerHandler('combat-panel', async (event) => {
    combatSnapshot.value = event.data as Record<string, unknown>;
  }, { skip: 'run' });

  animationEvents.registerHandler('combat-barrier', async () => {
    combatBarrierActive.value = true;
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        combatBarrierActive.value = false;
        resolve();
      }, 2000);
    });
  }, { skip: 'drop' });

  // Register handlers for all 8 sector-targeted tactics events
  for (const eventType of SECTOR_TACTIC_EVENTS) {
    animationEvents.registerHandler(eventType, async (event) => {
      const data = event.data as Record<string, unknown>;
      activeTacticEvent.value = {
        type: eventType.replace('tactic-', ''),
        cardName: (data.cardName as string) ?? eventType,
        data,
      };
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          activeTacticEvent.value = null;
          resolve();
        }, 2000);
      });
    }, { skip: 'drop' });
  }

  // Register handlers for all 4 banner/flag tactics events (longer display)
  for (const eventType of BANNER_TACTIC_EVENTS) {
    animationEvents.registerHandler(eventType, async (event) => {
      const data = event.data as Record<string, unknown>;
      activeTacticEvent.value = {
        type: eventType.replace('tactic-', ''),
        cardName: (data.cardName as string) ?? eventType,
        data,
      };
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          activeTacticEvent.value = null;
          resolve();
        }, 2500);
      });
    }, { skip: 'drop' });
  }
}


watch(() => activeTacticEvent.value, (val) => {
});

const hasActiveCombat = computed(() => combatSnapshot.value !== null);

// Delayed game over - waits for animations to complete before showing victory overlay
const showGameOverOverlay = computed(() => {
  if (!isGameOver.value) return false;

  // Don't show while animations are playing
  if (animationEvents?.isAnimating.value) return false;
  if ((animationEvents?.pendingCount.value ?? 0) > 0) return false;

  return true;
});

// Handler for when combat is truly finished
// Emitted by CombatPanel after combat-end animation finishes
async function handleCombatFinished() {
  combatSnapshot.value = null;
  try {
    await props.actionController.execute('clearCombatAnimations', {});
  } catch {
    // Action may fail if game already cleared activeCombat
  }
}

// Handle Basic's reroll
async function handleReroll() {
  await props.actionController.execute('combatBasicReroll', {});
}

// Handle confirming hit allocation - executes the action with allocations from CombatPanel
async function handleConfirmAllocation(allocations: string[]) {
  console.log('[DEBUG confirmAllocation] allocations:', allocations, 'availableActions:', props.availableActions, 'isMyTurn:', props.isMyTurn);
  if (!allocations || allocations.length === 0) { console.log('[DEBUG confirmAllocation] BAIL: empty allocations'); return; }
  if (!props.availableActions.includes('combatAllocateHits')) { console.log('[DEBUG confirmAllocation] BAIL: combatAllocateHits not in availableActions'); return; }

  await props.actionController.execute('combatAllocateHits', { allocations });
}

// Handle confirming target selection - executes combatSelectTarget action
// Receives target IDs directly from CombatPanel (e.g., "militia-dictator-0")
async function handleConfirmTargets(targetIds: string[]) {
  if (!targetIds || targetIds.length === 0) return;
  if (!props.availableActions.includes('combatSelectTarget')) return;

  const targetValue = targetIds.length === 1 ? targetIds[0] : targetIds;
  await props.actionController.execute('combatSelectTarget', { targets: targetValue });
}

// Handle continue combat from CombatPanel
async function handleContinueCombat() {
  if (!props.availableActions.includes('combatContinue')) return;
  await props.actionController.execute('combatContinue', {});
}

// Handle retreat from CombatPanel - opens retreat sector selection
// MERC-retreat-fix: Use start() to enter wizard mode for sector selection
async function handleRetreatCombat() {
  if (!props.availableActions.includes('combatRetreat')) return;
  // Start the action in wizard mode - BoardSmith will apply sector filter
  // and execute when user clicks a valid retreat sector
  await props.actionController.start('combatRetreat');
}

// Handle Attack Dog assignment from CombatPanel
async function handleAssignAttackDog(targetId: string) {
  if (!props.availableActions.includes('combatAssignAttackDog')) return;
  await props.actionController.execute('combatAssignAttackDog', { target: targetId });
}

// Handle Medical Kit heal from CombatPanel
async function handleUseMedicalKit() {
  if (!props.availableActions.includes('combatHeal')) return;
  // Start in wizard mode to let player choose healer and target
  await props.actionController.start('combatHeal');
}

// Handle Surgeon's heal ability from CombatPanel
async function handleUseSurgeonHeal() {
  if (!props.availableActions.includes('combatSurgeonHeal')) return;
  // Start in wizard mode to let player choose target
  await props.actionController.start('combatSurgeonHeal');
}

// Handle before-attack healing from CombatPanel
async function handleUseBeforeAttackHeal() {
  if (!props.availableActions.includes('combatBeforeAttackHeal')) return;
  await props.actionController.start('combatBeforeAttackHeal');
}

// Handle skipping before-attack healing from CombatPanel
async function handleSkipBeforeAttackHeal() {
  if (!props.availableActions.includes('combatSkipBeforeAttackHeal')) return;
  await props.actionController.start('combatSkipBeforeAttackHeal');
}


// ============================================================================
// ACTION HANDLING WATCHES
// ============================================================================

// Note: actionChoices, isHiringMercs, isSelectingDictator, isHagnessDrawActive,
// isPlacingLanding, isSelectingRetreatSector, etc. are now provided by useActionState.

// Auto-start hiring actions when they become available (wizard mode)
// Watch both availableActions AND currentAction - need to start when previous action completes
watch(
  [() => props.availableActions, () => props.actionController.currentAction.value],
  ([actions, currentAction]) => {
    // Only auto-start if no action is currently active
    if (currentAction) return;

    // Check for hiring/selection actions and start them (Landing + Day 1 + Castro + Dictator selection)
    const hiringActions = ['placeLanding', 'selectDictator', 'hireFirstMerc', 'hireSecondMerc', 'hireThirdMerc', 'dictatorHireFirstMerc', 'castroBonusHire'];
    for (const action of hiringActions) {
      if (actions.includes(action)) {
        props.actionController.start(action);
        break;
      }
    }
  },
  { immediate: true }
);

// When equipmentType is selected, load the recipient choices from metadata
watch(() => props.actionArgs['equipmentType'], (val) => {
  if (val !== undefined && props.availableActions.includes('hagnessDraw')) {
    // For dependsOn selections, choices are in metadata.choicesByDependentValue[equipmentType]
    const metadata = props.state?.state?.actionMetadata?.hagnessDraw;
    const recipientSel = metadata?.selections?.find((s: any) => s.name === 'recipient');

    if (recipientSel?.choicesByDependentValue) {
      const key = String(val);
      const choices = recipientSel.choicesByDependentValue[key];

      if (choices && choices.length > 0) {
        fetchedDeferredChoices['hagnessDraw:recipient'] = choices;
      }
    }
  }
});

// ============================================================================
// HIRING UI STATE (not extracted - uses actionController directly)
// ============================================================================

// Get MERCs available for hiring from action metadata
const hirableMercs = computed(() => {
  const selection = currentPick.value;
  if (!selection) return [];

  // Don't return MERCs when selection is for sectors (landing zone, Castro placement, retreat)
  // This is more reliable than checking computed flags which may not evaluate correctly in all phases
  if (selection.name === 'sector') return [];

  // Don't return MERCs when selecting equipment type
  if (isSelectingEquipmentType.value) return [];

  // Don't return MERCs when placing landing zone (choices are sectors, not MERCs)
  if (isPlacingLanding.value) return [];

  // Don't return MERCs when selecting sector (Castro hire placement)
  if (isSelectingSector.value) return [];

  // Don't return MERCs when selecting retreat sector
  if (isSelectingRetreatSector.value) return [];

  // Get choices using actionController.getChoices() - all choices are now fetched on-demand
  const choices = props.actionController.getChoices(selection) || [];

  if (choices.length === 0) return [];

  // Get already-selected merc names from shared actionArgs to filter them out
  // Filter to strings only since actionArgs may contain non-string values
  const selectedMercs = Object.values(props.actionArgs || {}).filter(
    (v): v is string => typeof v === 'string'
  );

  // For dictator selection, convert to CombatantModel-compatible format
  if (isSelectingDictator.value) {
    const combatantData = props.gameView?.attributes?.settings?.combatantData ||
                           props.state?.state?.settings?.combatantData ||
                           props.gameView?.settings?.combatantData || [];
    const dictatorDataList = combatantData.filter((d: any) => d.cardType === 'dictator');

    return choices
      .filter((choice: any) => {
        const choiceDisplay = choice.display || choice.value || choice;
        return !selectedMercs.includes(choiceDisplay);
      })
      .map((choice: any) => {
        const choiceDisplay = choice.display || choice.value || choice;
        const choiceValue = choice.value ?? choice;
        const dictatorInfo = dictatorDataList.find((d: any) => d.name === choiceDisplay);

        // Return CombatantModel-compatible data structure
        return {
          combatantName: choiceDisplay,
          _choiceValue: choiceValue,
          attributes: {
            combatantName: choiceDisplay,
            combatantId: dictatorInfo?.id || choiceDisplay.toLowerCase(),
            image: dictatorInfo?.image || '',
            baseInitiative: dictatorInfo?.initiative || 0,
            baseCombat: dictatorInfo?.combat || 0,
            baseTraining: dictatorInfo?.training || 0,
            ability: dictatorInfo?.ability || '',
            bio: dictatorInfo?.bio || '',
          },
        };
      });
  }

  // Find MERCs anywhere in the gameView and attach the original choice value
  // Filter out MERCs that have already been selected AND filter out skip option
  // Note: BoardSmith now returns choices as {value, display} objects
  return choices
    .filter((choice: any) => {
      // Use display for filtering (it's the human-readable name)
      const choiceDisplay = choice.display || choice.value || choice;
      // Filter out skip option - it's handled separately
      if (typeof choiceDisplay === 'string' && choiceDisplay.toLowerCase().includes('skip')) return false;
      return !selectedMercs.includes(choiceDisplay);
    })
    .map((choice: any) => {
      // Use display for finding the MERC by name
      const choiceDisplay = choice.display || choice.value || choice;
      // Use value for the actual selection (element ID)
      const choiceValue = choice.value ?? choice;

      // First try to find merc in game tree
      let merc = findMercByName(choiceDisplay);

      // If not found, lookup from combatantData (mercs in deck during hiring)
      if (!merc) {
        const combatantData = props.gameView?.attributes?.settings?.combatantData ||
                              props.state?.state?.settings?.combatantData ||
                              props.gameView?.settings?.combatantData || [];
        const mercInfo = combatantData.find((d: any) =>
          d.cardType === 'merc' && d.name.toLowerCase() === choiceDisplay.toLowerCase()
        );
        if (mercInfo) {
          merc = {
            combatantName: mercInfo.name,
            attributes: {
              combatantName: mercInfo.name,
              combatantId: mercInfo.id,
              image: mercInfo.image || '',
              baseInitiative: mercInfo.initiative || 0,
              baseCombat: mercInfo.combat || 0,
              baseTraining: mercInfo.training || 0,
              ability: mercInfo.ability || '',
              bio: mercInfo.bio || '',
            },
          };
        }
      }

      // Attach the original choice value so we can use it when clicking
      const result = merc ? { ...merc, _choiceValue: choiceValue } : { combatantName: choiceDisplay, attributes: { combatantName: choiceDisplay }, _choiceValue: choiceValue };
      return result;
    });
});

// Check if skip option is available (for third hire)
const hasSkipOption = computed(() => {
  const selection = currentPick.value;
  if (!selection) return false;

  // Get choices using actionController.getChoices() - all choices are now fetched on-demand
  const choices = props.actionController.getChoices(selection) || [];

  return choices.some((choice: any) => {
    // Use display for checking skip option (it's the human-readable name)
    const choiceDisplay = choice.display || choice.value || choice;
    return typeof choiceDisplay === 'string' && choiceDisplay.toLowerCase().includes('skip');
  });
});

// Handle skip button click
function skipThirdHire() {
  const selection = currentPick.value;
  if (!selection) return;

  // Get choices using actionController.getChoices() - all choices are now fetched on-demand
  const choices = props.actionController.getChoices(selection) || [];

  // Find the skip choice - use display for matching text
  const skipChoice = choices.find((choice: any) => {
    const choiceDisplay = choice.display || choice.value || choice;
    return typeof choiceDisplay === 'string' && choiceDisplay.toLowerCase().includes('skip');
  });

  if (skipChoice) {
    // Use value for the actual selection (element ID or the choice itself)
    const choiceValue = skipChoice.value ?? skipChoice;
    selectMercToHire({ _choiceValue: choiceValue });
  }
}

// Get available landing sectors from action metadata (valid choices only)
const landingSectors = computed(() => {
  if (!isPlacingLanding.value) return [];

  // Get the selection - use currentPick when action is active, otherwise from metadata
  const isActionActive = props.actionController.currentAction.value === 'placeLanding';
  const selection = isActionActive
    ? props.actionController.currentPick.value
    : landingZoneMetadata.value?.selections?.[0];
  if (!selection) return [];

  const choices = props.actionController.getChoices(selection) || [];

  // Map choices to sector data format
  return choices.map((choice: any) => {
    const choiceDisplay = choice.display || choice.value || choice;
    const choiceValue = choice.value ?? choice;
    // Find matching sector by name
    const sector = sectors.value.find(s =>
      s.sectorName === choiceDisplay ||
      s.sectorId === choiceValue
    );
    if (sector) {
      return sector;
    }
    // Fallback if sector not found in tree
    return {
      sectorId: choiceValue,
      sectorName: choiceDisplay,
      sectorType: 'Industry',
      image: '',
      value: 0,
      row: 0,
      col: 0,
      weaponLoot: 0,
      armorLoot: 0,
      accessoryLoot: 0,
      dictatorMilitia: 0,
    };
  }).filter(Boolean);
});

// ---- Multi-select state for mid-game hireMerc (draw 3, pick 1+) ----
const hireMultiSelectValues = ref<unknown[]>([]);

// Is the current hiring pick a multiSelect?
const isHireMultiSelect = computed(() => {
  const pick = props.actionController.currentPick.value;
  return !!pick?.multiSelect;
});

// Can the player confirm their multiSelect choices?
const isHireMultiSelectReady = computed(() => {
  const pick = props.actionController.currentPick.value;
  if (!pick?.multiSelect) return false;
  return hireMultiSelectValues.value.length >= pick.multiSelect.min;
});

// "Selected: 1/2" display text
const hireMultiSelectCountDisplay = computed(() => {
  const pick = props.actionController.currentPick.value;
  if (!pick?.multiSelect) return '';
  const count = hireMultiSelectValues.value.length;
  const max = pick.multiSelect.max;
  return max !== undefined ? `Selected: ${count}/${max}` : `Selected: ${count}`;
});

// Check if a merc is currently selected in multiSelect
function isHireMultiSelected(choiceValue: unknown): boolean {
  return hireMultiSelectValues.value.includes(choiceValue);
}

// Handle clicking a MERC to hire - supports both single and multiSelect
async function selectMercToHire(merc: any) {
  const selection = props.actionController.currentPick.value;
  if (!selection) return;

  const choiceValue = merc._choiceValue;
  if (!choiceValue) return;

  // MultiSelect: toggle selection, don't fill yet
  if (selection.multiSelect) {
    const idx = hireMultiSelectValues.value.indexOf(choiceValue);
    if (idx >= 0) {
      hireMultiSelectValues.value.splice(idx, 1);
    } else {
      const max = selection.multiSelect.max;
      if (max === undefined || hireMultiSelectValues.value.length < max) {
        hireMultiSelectValues.value.push(choiceValue);
        // Auto-confirm when min === max and exact count reached
        if (selection.multiSelect.min === selection.multiSelect.max &&
            hireMultiSelectValues.value.length === selection.multiSelect.min) {
          confirmHireMultiSelect();
        }
      }
    }
    return;
  }

  // Single select: fill immediately
  await props.actionController.fill(selection.name, choiceValue);
}

// Confirm multiSelect choices and fill the selection with the array
async function confirmHireMultiSelect() {
  const selection = props.actionController.currentPick.value;
  if (!selection) return;
  const values = [...hireMultiSelectValues.value];
  hireMultiSelectValues.value = [];
  await props.actionController.fill(selection.name, values);
}

// Clear multiSelect state when the action changes or pick changes
watch(
  [() => props.actionController.currentAction.value, () => props.actionController.currentPick.value?.name],
  () => { hireMultiSelectValues.value = []; }
);

// Handle selecting equipment type
async function selectEquipmentType(equipType: string) {
  const selection = currentPick.value;
  if (!selection) return;

  // Fill the selection - actionController handles auto-execute
  await props.actionController.fill(selection.name, equipType);
}

// Handle Hagness selecting 1 of 3 drawn equipment
async function selectHagnessEquipment(name: string) {
  await props.actionController.fill('selectedEquipment', name);
}

// Handle Hagness selecting a recipient for equipment
async function selectHagnessRecipient(choice: any) {
  // Extract the recipient value from the choice
  // Choice can be: string | { value: string, display: string, equipment?: object }
  let recipientValue: string;
  if (typeof choice === 'string') {
    recipientValue = choice;
  } else if (choice && typeof choice === 'object') {
    recipientValue = choice.value || choice.display?.split(' ←')[0] || String(choice);
  } else {
    recipientValue = String(choice);
  }

  // Fill the recipient selection - actionController handles auto-execute
  await props.actionController.fill('recipient', recipientValue);
}

// Handle retreat sector selection from CombatPanel
async function handleSelectRetreatSector(sectorId: string | number) {
  const currentSel = props.actionController.currentPick.value;
  if (!currentSel) return;
  // Find the sector element to fill - match by numeric value
  const choices = props.actionController.getChoices(currentSel) || [];
  const selectedSector = choices.find((c: any) => c.value === sectorId);
  if (selectedSector) {
    // Pass just the value (element ID), not the full choice object
    await props.actionController.fill(currentSel.name, selectedSector.value);
  }
}

// Select sector for Castro hire placement
async function selectSector(sector: { value: string; label: string }) {
  const selection = currentPick.value;
  if (!selection) return;
  await props.actionController.fill(selection.name, sector.value);
}

// Open MERC detail modal during hiring
function openHiringMercDetail() {
  if (selectedMercForEquipment.value) {
    showHiringMercModal.value = true;
  }
}

// Close MERC detail modal
function closeHiringMercModal() {
  showHiringMercModal.value = false;
}

// Handle reassign from squad badge click - starts action and scrolls to panel
async function handleReassignCombatant(combatantName: string) {
  // Mark this as a quick reassign from squad badge click
  // This prevents showing the AssignToSquadPanel when auto-completing
  quickReassignInProgress.value = true;

  await props.actionController.start('assignToSquad', { prefill: { combatantName } });

  // After action starts, check if we're still on a selection (not auto-completed)
  // If so, the panel should be shown and we should scroll to it
  if (props.actionController.currentPick.value) {
    // Action didn't auto-complete - clear the flag and show panel normally
    quickReassignInProgress.value = false;
    nextTick(() => {
      if (assignToSquadPanelRef.value?.$el) {
        assignToSquadPanelRef.value.$el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
  // If auto-completed, the flag stays true and gets cleared after animation
}

// Handle landing sector selection from LandingZoneSelection component
async function handleLandingSectorSelected(sectorId: string) {
  // Delegate to existing handleSectorClick logic for landing
  await handleSectorClick(sectorId);
}

// Handle sector clicks for actions
async function handleSectorClick(sectorId: string) {
  if (isPlacingLanding.value) {
    // Action is auto-started by watcher, just fill the selection
    const selection = props.actionController.currentPick.value;
    if (!selection) return;

    // Get the matching choice value
    const choices = props.actionController.getChoices(selection) || [];
    const sector = sectors.value.find(s => s.sectorId === sectorId);

    const matchingChoice = choices.find((c: any) => {
      // For element selections, display is the sector name, value is the element ID
      const displayName = c.display || c;
      return displayName === sector?.sectorName;
    });

    if (matchingChoice) {
      await props.actionController.fill(selection.name, matchingChoice.value ?? matchingChoice);
    }
    return;
  }

  if (isSelectingRetreatSector.value) {
    // Handle retreat sector selection
    const selection = props.actionController.currentPick.value;
    if (!selection) return;

    // Find the sector element ID from valid elements
    const validElements = props.actionController.getValidElements(selection) || [];
    const sector = sectors.value.find(s => s.sectorId === sectorId);

    // Match by ref.id which is the sectorId string
    const matchingElement = validElements.find((e: any) => {
      const elementSectorId = e.ref?.id;
      return sector && sector.sectorId === elementSectorId;
    });

    if (matchingElement) {
      await props.actionController.fill(selection.name, matchingElement.id);
    }
  } else {
    // Show the sector panel for all other clicks
    selectedSectorId.value = sectorId;
  }
}

// Close sector panel
function closeSectorPanel() {
  selectedSectorId.value = null;
}

// Check if equipment can be dropped (player's turn, dropEquipment action available)
const canDropEquipment = computed(() => {
  return props.isMyTurn && props.availableActions.includes('dropEquipment');
});

// Get list of MERC IDs that have their ability available
// Currently only Hagness has a UI-activatable ability
const mercAbilitiesAvailable = computed(() => {
  const available: string[] = [];
  // Hagness ability is available if hagnessDraw action is available
  if (props.isMyTurn && props.availableActions.includes('hagnessDraw')) {
    available.push('hagness');
  }
  // Add more MERCs here as their abilities get UI buttons
  // Doc heal, Feedback discard, etc.
  return available;
});

// Handle ability activation from MERC card
async function handleActivateAbility(combatantId: string) {
  if (combatantId === 'hagness' && props.availableActions.includes('hagnessDraw')) {
    // Start the Hagness draw action - this sets actionController.currentAction
    props.actionController.start('hagnessDraw');
    // Scroll to top where the Hagness UI appears
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  // Add more MERC ability handlers as needed
}

// Handle dropping equipment from a MERC to sector stash
async function handleDropEquipment(combatantElementId: number, equipmentId: number) {
  if (!canDropEquipment.value) return;

  // Execute the dropEquipment action directly with the numeric IDs
  await props.actionController.execute('dropEquipment', {
    actingMerc: combatantElementId,
    equipment: equipmentId,
  });
}

// Clickable sectors based on available actions
const clickableSectors = computed(() => {
  if (isPlacingLanding.value) {
    // Get valid choices from action metadata
    const metadata = landingZoneMetadata.value;
    const selection = metadata?.selections?.[0];
    // Use actionController getter (not selection.choices)
    const choices = selection ? props.actionController.getChoices(selection) || [] : [];

    if (choices.length > 0) {
      // Find sectors that match the choices
      const validSectorIds: string[] = [];
      for (const choice of choices) {
        // Use display for matching (value might be element ID number)
        const displayValue = choice.display || String(choice.value || choice);
        // Find sector by name match
        const matchingSector = sectors.value.find(s =>
          s.sectorName === displayValue ||
          (typeof displayValue === 'string' && displayValue.includes(s.sectorName))
        );
        if (matchingSector) {
          validSectorIds.push(matchingSector.sectorId);
        }
      }
      if (validSectorIds.length > 0) {
        return validSectorIds;
      }
    }

    // Fallback to edge sectors (all edge sectors are valid landing zones)
    return landingSectors.value.map((s) => s.sectorId);
  }

  // Handle retreat sector selection
  if (isSelectingRetreatSector.value) {
    const selection = props.actionController.currentPick.value;
    if (!selection) return [];

    // Get valid retreat sectors from action controller
    const validElements = props.actionController.getValidElements(selection) || [];

    // Map element IDs to sector IDs
    const validSectorIds: string[] = [];
    for (const element of validElements) {
      // Element has ref with id (the sector's string sectorId)
      const elementSectorId = element.ref?.id;
      if (elementSectorId) {
        // Find the sector by its sectorId
        const sector = sectors.value.find(s => s.sectorId === String(elementSectorId));
        if (sector) {
          validSectorIds.push(sector.sectorId);
        }
      }
    }
    return validSectorIds;
  }

  return [];
});

</script>

<template>
  <div class="game-board">
    <!-- Game Over Overlay -->
    <GameOverlay :active="showGameOverOverlay">
      <div class="game-over-content" @click.stop>
        <h1 class="game-over-title">Game Over</h1>
        <div v-if="gameWinner === 'rebels'" class="game-over-winner rebels">
          <h2>Rebels Victory!</h2>
          <p>The dictator has been eliminated. Freedom prevails!</p>
        </div>
        <div v-else class="game-over-winner dictator">
          <h2>Dictator Victory!</h2>
          <p>The rebellion has been crushed. Order is restored.</p>
        </div>
      </div>
    </GameOverlay>

    <!-- Tactics Card Banner - shown when any tactics card animation is playing -->
    <GameOverlay :active="!!activeTacticEvent" :backdrop-opacity="0.7">
      <div class="tactics-banner-content" @click.stop>
        <div class="tactics-banner-label">Dictator Tactics</div>
        <div class="tactics-banner-name">{{ activeTacticEvent?.cardName }}</div>
        <div v-if="activeTacticEvent?.data?.description" class="tactics-banner-description">
          {{ activeTacticEvent.data.description }}
        </div>
      </div>
    </GameOverlay>

    <!-- Combat Barrier Banner - shown when simultaneous actions pause for combat -->
    <GameOverlay :active="combatBarrierActive" :backdrop-opacity="0.5">
      <div class="combat-barrier-content" @click.stop>
        <div class="combat-barrier-label">Combat Detected</div>
        <div class="combat-barrier-description">Simultaneous actions paused while combat resolves</div>
      </div>
    </GameOverlay>

    <!-- Combat Panel - shown when combat snapshot is present -->
    <CombatPanel
      v-if="hasActiveCombat"
      :combat-snapshot="combatSnapshot"
      :is-my-turn="isMyTurn"
      :available-actions="availableActions"
      :is-selecting-retreat-sector="isSelectingRetreatSector"
      :retreat-sector-choices="retreatSectorChoices"
      @reroll="handleReroll"
      @confirm-allocation="handleConfirmAllocation"
      @confirm-targets="handleConfirmTargets"
      @continue-combat="handleContinueCombat"
      @retreat-combat="handleRetreatCombat"
      @select-retreat-sector="handleSelectRetreatSector"
      @assign-attack-dog="handleAssignAttackDog"
      @combat-finished="handleCombatFinished"
      @use-medical-kit="handleUseMedicalKit"
      @use-surgeon-heal="handleUseSurgeonHeal"
      @use-before-attack-heal="handleUseBeforeAttackHeal"
      @skip-before-attack-heal="handleSkipBeforeAttackHeal"
    />

    <!-- Mortar Attack Panel - shown when mortar hit allocation is pending -->
    <MortarAttackPanel
      v-if="hasMortarAttackPanel"
      :mortar-data="mortarAttackData!"
      :is-my-turn="isMyTurn"
      @confirm-allocation="handleMortarConfirmAllocation"
      @mortar-finished="handleMortarFinished"
    />

    <!-- Dictator Panel - shown when playing as dictator (above sector panel) -->
    <!-- Hidden during Castro hire since hiring phase UI takes over -->
    <!-- Also hidden if dictator combatant not yet created (during dictator selection) -->
    <DictatorPanel
      v-if="currentPlayerIsDictator && dictatorCard && dictatorCard.combatantId !== 'unknown' && !hasActiveCombat && !isHiringMercs"
      :dictator="dictatorCard"
      :tactics-hand="tacticsHand"
      :available-actions="availableActions"
      :action-controller="actionController"
      :is-my-turn="isMyTurn"
      :all-sectors="sectors"
      :player-color="dictatorPlayerColor"
      :combatant-data="combatantData"
    />

    <!-- Sector Panel - shown when a sector is selected OR when an action has sector context -->
    <SectorPanel
      v-if="activeSector && !hasActiveCombat && !isHiringMercs"
      :sector="activeSector"
      :player-seat="playerSeat"
      :player-color="currentPlayerIsDictator ? dictatorPlayerColor : currentPlayerColor"
      :player-color-map="playerColorMap"
      :all-mercs-in-sector="selectedSectorMercs"
      :available-actions="availableActions"
      :action-controller="actionController"
      :game-view="gameView"
      :primary-squad="currentPlayerIsDictator ? dictatorPrimarySquad : primarySquad"
      :secondary-squad="currentPlayerIsDictator ? dictatorSecondarySquad : secondarySquad"
      :base-squad="currentPlayerIsDictator ? dictatorBaseSquad : undefined"
      :all-sectors="sectors"
      :stash-contents="selectedSectorStash"
      :has-squidhead="hasSquidhead"
      :has-mortar="hasMortar"
      :has-land-mines-in-stash="hasLandMinesInStash"
      :squidhead-has-land-mine="squidheadHasLandMine"
      :has-enemy-forces="selectedSectorHasEnemyForces"
      :is-base="selectedSectorIsBase"
      :has-explosives-components="hasExplosivesComponents"
      :militia-bonuses="militiaBonuses"
      :dictator-color="dictatorPlayerColor"
      :is-dictator="currentPlayerIsDictator"
      :is-my-turn="isMyTurn"
      @close="closeSectorPanel"
    />

    <!-- Hiring Phase Component -->
    <HiringPhase
      v-if="isHiringMercs"
      :is-hiring-mercs="isHiringMercs"
      :is-selecting-dictator="isSelectingDictator"
      :is-selecting-equipment-type="isSelectingEquipmentType"
      :is-castro-hiring="isCastroHiring"
      :is-selecting-sector="isSelectingSector"
      :hirable-mercs="hirableMercs"
      :has-skip-option="hasSkipOption"
      :equipment-type-choices="equipmentTypeChoices"
      :sector-choices="sectorChoices"
      :selected-merc-for-equipment="selectedMercForEquipment"
      :selected-merc-image-path="selectedMercImagePath"
      :selected-merc-name="selectedMercName"
      :selected-merc-id="selectedMercId"
      :show-hiring-merc-modal="showHiringMercModal"
      :is-multi-select="isHireMultiSelect"
      :is-multi-select-ready="isHireMultiSelectReady"
      :multi-select-count-display="hireMultiSelectCountDisplay"
      :is-multi-selected="isHireMultiSelected"
      :prompt="currentPick?.prompt || state?.flowState?.prompt || 'Select your MERCs'"
      :player-color="currentPlayerColor"
      @select-merc="selectMercToHire"
      @select-equipment-type="selectEquipmentType"
      @select-sector="selectSector"
      @skip-hire="skipThirdHire"
      @confirm-multi-select="confirmHireMultiSelect"
      @open-detail-modal="openHiringMercDetail"
      @close-detail-modal="closeHiringMercModal"
    />

    <!-- Hagness Draw Equipment UI -->
    <HagnessDrawEquipment
      v-if="isHagnessDrawActive"
      :is-selecting-type="isHagnessSelectingType"
      :is-selecting-from-drawn="isHagnessSelectingFromDrawn"
      :is-selecting-recipient="isHagnessSelectingRecipient"
      :equipment-type-choices="hagnessEquipmentTypeChoices"
      :drawn-choices="hagnessDrawnChoices"
      :drawn-equipment="hagnessDrawnEquipment"
      :squad-mates="hagnessSquadMates"
      :player-color="currentPlayerColor"
      @equipment-type-selected="selectEquipmentType"
      @equipment-selected="selectHagnessEquipment"
      @recipient-selected="selectHagnessRecipient"
    />

    <!-- Main content: Map + Squad Panel -->
    <div class="board-layout" v-if="sectors.length > 0 || isPlacingLanding">
      <!-- Map Section -->
      <div class="map-section">
        <!-- Landing Zone Selection - shown above map during landing phase -->
        <LandingZoneSelection
          v-if="isPlacingLanding"
          :sectors="landingSectors"
          @sector-selected="handleLandingSectorSelected"
        />

        <h2 v-if="isSelectingRetreatSector" class="action-title">Retreat</h2>
        <p v-if="isSelectingRetreatSector" class="action-subtitle">Select an adjacent sector to retreat to</p>

        <!-- Assign to Squad UI (shown above map when action is active) -->
        <AssignToSquadPanel
          ref="assignToSquadPanelRef"
          v-if="showAssignToSquad"
          :player-color="currentPlayerIsDictator ? dictatorPlayerColor : currentPlayerColor"
          :primary-squad="currentPlayerIsDictator ? dictatorPrimarySquad : primarySquad"
          :secondary-squad="currentPlayerIsDictator ? dictatorSecondarySquad : secondarySquad"
          :base-squad="currentPlayerIsDictator ? dictatorBaseSquad : undefined"
          :action-controller="actionController"
          :action-args="actionArgs"
          :is-dictator="currentPlayerIsDictator"
        />

        <!-- Equip Spectator Panel - shown to non-active players during equip session -->
        <EquipSpectatorPanel
          v-if="equipSessionData"
          :combatant="equipSessionData.combatant"
          :player-color="equipSessionData.playerColor"
          :player-name="equipSessionData.playerName"
          :fly-items="equipFlyItems"
          @fly-complete="handleEquipFlyComplete"
        />

        <MapGrid
          :sectors="sectors"
          :mercs="allMercs"
          :players="players"
          :control-map="controlMap"
          :clickable-sectors="clickableSectors"
          :can-drop-equipment="canDropEquipment"
          :dictator-base-sector-id="dictatorBaseSectorId"
          :dictator-color="dictatorPlayerColor"
          :mortar-strike="activeMortarStrike"
          :landmine-strike="activeLandmineStrike"
          @sector-click="handleSectorClick"
          @drop-equipment="handleDropEquipment"
          @mortar-strike-complete="handleMortarStrikeComplete"
          @landmine-strike-complete="handleLandmineStrikeComplete"
        />
      </div>

      <!-- Squad Panel -->
      <div class="squad-section" v-if="primarySquad || secondarySquad || dictatorPrimarySquad || dictatorSecondarySquad || dictatorBaseSquad">
        <SquadPanel
          :primary-squad="currentPlayerIsDictator ? dictatorPrimarySquad : primarySquad"
          :secondary-squad="currentPlayerIsDictator ? dictatorSecondarySquad : secondarySquad"
          :base-squad="currentPlayerIsDictator ? dictatorBaseSquad : undefined"
          :player-color="currentPlayerColor"
          :can-drop-equipment="canDropEquipment"
          :merc-abilities-available="mercAbilitiesAvailable"
          :can-assign-to-squad="availableActions.includes('assignToSquad')"
          :flying-combatant-name="flyingCombatantName"
          @drop-equipment="handleDropEquipment"
          @activate-ability="handleActivateAbility"
          @assign-to-squad="actionController.start('assignToSquad', {})"
          @reassign-combatant="handleReassignCombatant"
        />
      </div>
    </div>

    <!-- Fallback when no map data -->
    <div v-else-if="!isHiringMercs" class="no-data">
      <p>Waiting for game data...</p>
      <p class="hint">Available actions: {{ availableActions.join(', ') || 'none' }}</p>
    </div>

    <!-- Turn indicator -->
    <div v-if="isMyTurn" class="turn-indicator">
      Your Turn
    </div>

    <!-- View Dictator's Played Cards Button - visible to ALL players -->
    <button
      v-if="tacticsDiscard.length > 0"
      class="played-cards-button"
      @click="showPlayedCardsModal = true"
      title="View Dictator's Played Tactics Cards"
    >
      <span class="played-cards-icon">📜</span>
      <span class="played-cards-count">{{ tacticsDiscard.length }}</span>
    </button>

    <!-- Played Cards Modal -->
    <GameOverlay :active="showPlayedCardsModal" @click="showPlayedCardsModal = false">
      <ModalContent @close="showPlayedCardsModal = false">
        <div class="played-cards-modal">
          <h2 class="played-cards-title">Dictator's Played Cards</h2>
          <div class="played-cards-list">
            <div
              v-for="card in tacticsDiscard"
              :key="card.id"
              class="played-card"
            >
              <div class="played-card-name">{{ card.tacticsName }}</div>
              <div v-if="card.story" class="played-card-story">"{{ card.story }}"</div>
              <div class="played-card-effect">{{ card.description }}</div>
            </div>
          </div>
          <div v-if="tacticsDiscard.length === 0" class="no-played-cards">
            No tactics cards have been played yet.
          </div>
        </div>
      </ModalContent>
    </GameOverlay>

    <!-- Header Combatant Modal (opened from App.vue header icons) -->
    <GameOverlay :active="!!headerCombatantData" @click="emit('close-header-combatant-modal')">
      <ModalContent v-if="headerCombatantData" @close="emit('close-header-combatant-modal')">
        <CombatantCard
          :merc="headerCombatantData.combatant"
          :player-color="headerCombatantData.color"
          :squad-name="headerCombatantData.squadName"
          :sector-name="headerCombatantData.sectorName"
          :show-equipment="true"
        />
      </ModalContent>
    </GameOverlay>

  </div>
</template>

<style scoped>
.game-board {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  min-height: 100%;
  background: v-bind('UI_COLORS.background');
  position: relative;
}

.action-title {
  color: v-bind('UI_COLORS.accent');
  font-size: 1.3rem;
  margin: 0 0 8px;
}

.action-subtitle {
  color: v-bind('UI_COLORS.textMuted');
  margin: 0 0 16px;
}

.board-layout {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  min-height: 0;
}

.map-section {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.squad-section {
  flex-shrink: 0;
  width: 100%;
}

/* Played Cards Button - bottom right corner */
.played-cards-button {
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: rgba(139, 0, 0, 0.4);
  border: 2px solid rgba(139, 0, 0, 0.7);
  border-radius: 10px;
  color: #ff6b6b;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition: all 0.2s;
  z-index: 100;
}

.played-cards-button:hover {
  background: rgba(139, 0, 0, 0.6);
  border-color: #8b0000;
  transform: scale(1.05);
}

.played-cards-icon {
  font-size: 1.2rem;
}

.played-cards-count {
  background: #8b0000;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.8rem;
}

/* Played Cards Modal */
.played-cards-modal {
  background: v-bind('UI_COLORS.surface');
  border: 1px solid v-bind('UI_COLORS.border');
  border-radius: 12px;
  padding: 20px;
  max-width: 500px;
  min-width: 350px;
  max-height: 500px;
  overflow-y: auto;
}

.played-cards-title {
  margin: 0 0 16px 0;
  color: #ff6b6b;
  font-size: 1.3rem;
  text-align: center;
  border-bottom: 1px solid rgba(139, 0, 0, 0.3);
  padding-bottom: 12px;
}

.played-cards-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.played-card {
  background: rgba(139, 0, 0, 0.15);
  border: 1px solid rgba(139, 0, 0, 0.3);
  border-radius: 8px;
  padding: 12px 16px;
}

.played-card-name {
  font-weight: 600;
  color: #ff6b6b;
  font-size: 1rem;
  margin-bottom: 6px;
}

.played-card-story {
  font-style: italic;
  color: v-bind('UI_COLORS.textSecondary');
  font-size: 0.85rem;
  margin-bottom: 8px;
}

.played-card-effect {
  color: v-bind('UI_COLORS.textPrimary');
  font-size: 0.9rem;
  line-height: 1.4;
}

.no-played-cards {
  text-align: center;
  color: v-bind('UI_COLORS.textSecondary');
  font-style: italic;
  padding: 20px;
}

.no-data {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: v-bind('UI_COLORS.textMuted');
}

.no-data .hint {
  font-size: 0.85rem;
  margin-top: 8px;
}

.turn-indicator {
  background: linear-gradient(90deg, #d4a84b, #e8c77b);
  color: #1a1a2e;
  padding: 8px 24px;
  border-radius: 20px;
  font-weight: bold;
  text-align: center;
  width: fit-content;
  margin: 0 auto;
}

/* Game Over Overlay */
.game-over-content {
  position: sticky;
  top: 10px;
  background: linear-gradient(135deg, #1a1a2e 0%, #2d2d4a 100%);
  border: 3px solid #d4a84b;
  border-radius: 16px;
  padding: 32px 48px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(212, 168, 75, 0.2);
  max-width: 90vw;
  margin: 0 auto;
}

.game-over-title {
  font-size: 2.5rem;
  color: #d4a84b;
  margin: 0 0 16px 0;
  text-transform: uppercase;
  letter-spacing: 4px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.game-over-winner h2 {
  font-size: 1.75rem;
  margin: 0 0 12px 0;
}

.game-over-winner p {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
}

.game-over-winner.rebels h2 {
  color: #4CAF50;
}

.game-over-winner.dictator h2 {
  color: #f44336;
}

/* Tactics Card Banner */
.tactics-banner-content {
  position: sticky;
  top: 10px;
  background: linear-gradient(135deg, #3a0a0a 0%, #5c1a1a 100%);
  border: 3px solid #8b0000;
  border-radius: 16px;
  padding: 32px 48px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(139, 0, 0, 0.3);
  max-width: 90vw;
  margin: 0 auto;
}

.tactics-banner-name {
  font-size: 2rem;
  font-weight: bold;
  color: #ff6b6b;
  text-transform: uppercase;
  letter-spacing: 2px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.tactics-banner-label {
  font-size: 0.85rem;
  margin-bottom: 8px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 3px;
}

.tactics-banner-description {
  font-size: 1rem;
  margin-top: 12px;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.5;
  max-width: 500px;
  margin-left: auto;
  margin-right: auto;
}

/* Combat Barrier Banner */
.combat-barrier-content {
  text-align: center;
  color: white;
  animation: barrier-fade-in 0.3s ease-out;
}

.combat-barrier-label {
  font-size: 2rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #ff6b6b;
  text-shadow: 0 0 20px rgba(255, 107, 107, 0.5);
}

.combat-barrier-description {
  font-size: 1.1rem;
  margin-top: 0.5rem;
  opacity: 0.85;
}

@keyframes barrier-fade-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
</style>
