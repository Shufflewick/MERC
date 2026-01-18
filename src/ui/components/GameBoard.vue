<script setup lang="ts">
import { computed, ref, watch, inject, reactive, nextTick, toRef } from 'vue';
import { useBoardInteraction, type UseActionControllerReturn } from '@boardsmith/ui';
import MapGrid from './MapGrid.vue';
import SquadPanel from './SquadPanel.vue';
import CombatantCard from './CombatantCard.vue';
import EquipmentCard from './EquipmentCard.vue';
import CombatPanel from './CombatPanel.vue';
import SectorPanel from './SectorPanel.vue';
import DictatorPanel from './DictatorPanel.vue';
import DetailModal from './DetailModal.vue';
import DrawEquipmentType from './DrawEquipmentType.vue';
import AssignToSquadPanel from './AssignToSquadPanel.vue';
import CombatantIcon from './CombatantIcon.vue';
import CombatantIconSmall from './CombatantIconSmall.vue';
import SectorCardChoice from './SectorCardChoice.vue';
import GameOverOverlay from './GameOverOverlay.vue';
import LandingZoneSelection from './LandingZoneSelection.vue';
import HagnessDrawEquipment from './HagnessDrawEquipment.vue';
import HiringPhase from './HiringPhase.vue';
import { UI_COLORS, getPlayerColor } from '../colors';
import { useGameViewHelpers } from '../composables/useGameViewHelpers';
import { useVictoryCalculations } from '../composables/useVictoryCalculations';
import { usePlayerState } from '../composables/usePlayerState';
import { useSectorState } from '../composables/useSectorState';
import { useSquadState } from '../composables/useSquadState';
import { useActionState } from '../composables/useActionState';

// Type for deferred choices fetch function (injected from GameShell)
type FetchDeferredChoicesFn = (
  actionName: string,
  selectionName: string,
  playerPosition: number,
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
  playerPosition: number;
  isMyTurn: boolean;
  availableActions: string[];
  actionArgs: Record<string, unknown>;
  actionController: UseActionControllerReturn;
  setBoardPrompt: (prompt: string | null) => void;
  state?: any; // Flow state from GameShell
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
const playerPositionRef = toRef(() => props.playerPosition);

// Player state (independent)
const {
  players,
  currentPlayerColor,
  playerColorMap,
  dictatorPlayerColor,
  currentPlayerIsDictator,
  positionToColor,
} = usePlayerState(
  () => props.gameView,
  playerPositionRef
);

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
  hasDoc,
  hasSquidhead,
  hasMortar,
  hasDamagedMercs,
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
    getDictatorCard: () => dictatorCard.value as { sectorId: string; inPlay: boolean } | undefined,
    positionToColor,
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
  playerPositionRef,
  currentPlayerIsDictator,
  sectors,
  players
);

// Action state (depends on sectors and squads)
const {
  actionChoices,
  currentActionMetadata,
  currentSelection,
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
    state: props.state,
    playerPosition: props.playerPosition,
    gameView: props.gameView,
  },
  sectors,
  primarySquad,
  secondarySquad
);


// ============================================================================
// SECTOR-SPECIFIC STATE (not extracted to composables)
// ============================================================================

const selectedSectorHasDictatorForces = computed(() => {
  if (!activeSector.value) return false;
  if (activeSector.value.dictatorMilitia > 0) return true;

  // Check for dictator MERCs in sector
  const dictatorMercsInSector = allMercs.value.filter(
    (m) => m.sectorId === activeSector.value?.sectorId && m.playerColor === 'dictator'
  );
  return dictatorMercsInSector.length > 0;
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
    const weapon = getAttr(merc, 'weaponSlot', null);
    const accessory = getAttr(merc, 'accessorySlot', null);

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

  // If we still can't find it, return a placeholder so panel still shows
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
    return baseSectorId as string;
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
// COMBAT PANEL - Show dice and hit allocation during combat
// ============================================================================

// Get active combat state from gameView
const activeCombat = computed(() => {
  const combat = props.gameView?.activeCombat ||
                 props.gameView?.attributes?.activeCombat;
  if (!combat) return null;
  return combat;
});

// Check if there's active combat to show the panel
const hasActiveCombat = computed(() => {
  return activeCombat.value !== null;
});

// Get sector name for the combat
const combatSectorName = computed(() => {
  if (!activeCombat.value?.sectorId) return 'Unknown';
  const sector = sectors.value.find(s => s.sectorId === activeCombat.value.sectorId);
  return sector?.sectorName || 'Unknown';
});

// Handle hit allocation from CombatPanel (per-hit tracking for UI)
function handleAllocateHit(_targetId: string) {
  // Individual hit allocation is tracked in CombatPanel state
  // The final allocation is sent via handleConfirmAllocation
}

// Handle Wolverine 6s allocation
function handleAllocateWolverineSix(_targetId: string) {
  // Wolverine 6s allocation handled separately
}

// Handle Basic's reroll
async function handleReroll() {
  await props.actionController.execute('combatBasicReroll', {});
}

// Handle confirming hit allocation - executes the action with allocations from CombatPanel
async function handleConfirmAllocation(allocations: string[]) {
  if (!allocations || allocations.length === 0) return;
  if (!props.availableActions.includes('combatAllocateHits')) return;

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


// ============================================================================
// ACTION HANDLING WATCHES
// ============================================================================

// Note: actionChoices, isHiringMercs, isSelectingDictator, isHagnessDrawActive,
// isPlacingLanding, isSelectingRetreatSector, etc. are now provided by useActionState.

// Auto-start hiring actions when they become available (wizard mode)
watch(() => props.availableActions, (actions) => {
  // Only auto-start if no action is currently active
  if (props.actionController.currentAction.value) return;

  // Check for hiring/selection actions and start them (Day 1 + Castro + Dictator selection)
  const hiringActions = ['selectDictator', 'hireFirstMerc', 'hireSecondMerc', 'hireThirdMerc', 'castroBonusHire'];
  for (const action of hiringActions) {
    if (actions.includes(action)) {
      props.actionController.start(action);
      break;
    }
  }
}, { immediate: true });

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
  const selection = currentSelection.value;
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
  const selectedMercs = Object.values(props.actionArgs || {}) as string[];

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
      const merc = findMercByName(choiceDisplay);
      // Attach the original choice value so we can use it when clicking
      const result = merc ? { ...merc, _choiceValue: choiceValue } : { combatantName: choiceDisplay, attributes: { combatantName: choiceDisplay }, _choiceValue: choiceValue };
      return result;
    });
});

// Check if skip option is available (for third hire)
const hasSkipOption = computed(() => {
  const selection = currentSelection.value;
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
  const selection = currentSelection.value;
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

// Get available landing sectors (edge sectors)
const landingSectors = computed(() => {
  if (!isPlacingLanding.value) return [];
  // Return edge sectors
  return sectors.value.filter((s) => {
    const rows = Math.max(...sectors.value.map((sec) => sec.row)) + 1;
    const cols = Math.max(...sectors.value.map((sec) => sec.col)) + 1;
    return s.row === 0 || s.row === rows - 1 || s.col === 0 || s.col === cols - 1;
  });
});

// Get combatant ID from merc object (handles different data structures)
// Never returns empty string to prevent Vue duplicate key warnings
let combatantIdCounter = 0;
function getMercId(merc: any): string {
  const id = merc.attributes?.combatantId || merc.combatantId || merc.id || merc.ref;
  if (id) return id;
  // Generate a unique fallback ID using merc name if available
  const name = merc.attributes?.combatantName || merc.combatantName || '';
  return name ? `temp-${name}` : `temp-combatant-${++combatantIdCounter}`;
}

// Get capitalized combatant name for action (action expects capitalized names)
function getMercDisplayName(merc: any): string {
  const name = merc.attributes?.combatantName || merc.combatantName || getMercId(merc);
  // Capitalize first letter
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Handle clicking a MERC to hire - uses unified actionArgs with ActionPanel
async function selectMercToHire(merc: any) {
  const selection = currentSelection.value;
  if (!selection) {
    return;
  }

  // Use the original choice value (attached during lookup)
  const choiceValue = merc._choiceValue;
  if (!choiceValue) {
    return;
  }

  // Determine which action is available
  const actionName = getCurrentActionName();
  if (!actionName) {
    return;
  }

  // Check if the action is already active using actionController.currentAction
  // BoardSmith auto-starts actions when they become available, so we should NOT
  // call start if the action is already active (that would reset it)
  const isActionActive = props.actionController.currentAction.value === actionName;

  if (!isActionActive) {
    // Action not yet started - start it with initial args
    props.actionController.start(actionName, { [selection.name]: choiceValue });
  } else {
    // Action already started - fill the selection
    await props.actionController.fill(selection.name, choiceValue);
  }
}

// Handle selecting equipment type
async function selectEquipmentType(equipType: string) {
  const selection = currentSelection.value;
  if (!selection) return;

  // Fill the selection - actionController handles auto-execute
  await props.actionController.fill(selection.name, equipType);
}

// Handle Hagness selecting a recipient for equipment
async function selectHagnessRecipient(choice: any) {
  // Verify hagnessDraw action is available
  if (!props.availableActions.includes('hagnessDraw')) return;

  // Verify we have equipmentType already selected
  if (props.actionArgs['equipmentType'] === undefined) return;

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
  const currentSel = props.actionController.currentSelection.value;
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
function selectSector(sector: { value: string; label: string }) {
  const selection = currentSelection.value;
  if (!selection) return;
  props.actionController.fill(selection.name, sector.value);
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
function handleReassignCombatant(combatantName: string) {
  props.actionController.start('assignToSquad', { combatantName });
  // Wait for panel to render, then scroll to it
  nextTick(() => {
    if (assignToSquadPanelRef.value?.$el) {
      assignToSquadPanelRef.value.$el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

// Handle landing sector selection from LandingZoneSelection component
async function handleLandingSectorSelected(sectorId: string) {
  // Delegate to existing handleSectorClick logic for landing
  await handleSectorClick(sectorId);
}

// Handle sector clicks for actions
async function handleSectorClick(sectorId: string) {
  if (isPlacingLanding.value) {
    // Get the selection from metadata
    const metadata = landingZoneMetadata.value;
    const selection = metadata?.selections?.[0];
    const selectionName = selection?.name || 'sector';
    const selectionType = selection?.type;

    // Find the sector
    const sector = sectors.value.find(s => s.sectorId === sectorId);

    // Determine the value to send based on selection type
    let actionValue: any;

    if (selectionType === 'element') {
      // Element selections expect element IDs - find the sector element ID
      // Use actionController getter (not selection.validElements)
      const validElements = selection ? props.actionController.getValidElements(selection) || [] : [];
      const matchingElement = validElements.find((e: any) =>
        e.ref?.name === sectorId ||
        e.ref?.notation === sectorId ||
        e.display === sector?.sectorName
      );
      actionValue = matchingElement?.id || sectorId;
    } else {
      // Choice selections - use sector name
      // Use actionController getter (not selection.choices)
      const choices = selection ? props.actionController.getChoices(selection) || [] : [];
      const matchingChoice = choices.find((c: any) => {
        const choiceValue = c.value || c.display || c;
        return choiceValue === sector?.sectorName ||
               choiceValue === sectorId ||
               choiceValue.includes(sector?.sectorName);
      });
      actionValue = matchingChoice?.value || matchingChoice?.display || sector?.sectorName || sectorId;
    }

    // Execute the action
    await props.actionController.execute('placeLanding', { [selectionName]: actionValue });
  } else if (isSelectingRetreatSector.value) {
    // Handle retreat sector selection
    const selection = props.actionController.currentSelection.value;
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
  if (props.isMyTurn && props.availableActions.includes('docHeal')) {
    available.push('doc');
  }
  return available;
});

// Handle ability activation from MERC card
async function handleActivateAbility(combatantId: string) {
  if (combatantId === 'hagness' && props.availableActions.includes('hagnessDraw')) {
    // Start the Hagness draw action - this sets actionController.currentAction
    props.actionController.start('hagnessDraw');
    // Scroll to top where the Hagness UI appears
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (combatantId === 'doc' && props.availableActions.includes('docHeal')) {
    // Execute Doc heal immediately (no selections needed)
    await props.actionController.execute('docHeal', {});
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
    const selection = props.actionController.currentSelection.value;
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
        const sector = sectors.value.find(s => s.sectorId === elementSectorId);
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
    <GameOverOverlay
      :is-visible="isGameOver"
      :winner="gameWinner"
    />

    <!-- Combat Panel - shown when there's active combat -->
    <CombatPanel
      v-if="hasActiveCombat"
      :active-combat="activeCombat"
      :is-my-turn="isMyTurn"
      :available-actions="availableActions"
      :sector-name="combatSectorName"
      :is-selecting-retreat-sector="isSelectingRetreatSector"
      :retreat-sector-choices="retreatSectorChoices"
      @allocate-hit="handleAllocateHit"
      @allocate-wolverine-six="handleAllocateWolverineSix"
      @reroll="handleReroll"
      @confirm-allocation="handleConfirmAllocation"
      @confirm-targets="handleConfirmTargets"
      @continue-combat="handleContinueCombat"
      @retreat-combat="handleRetreatCombat"
      @select-retreat-sector="handleSelectRetreatSector"
      @assign-attack-dog="handleAssignAttackDog"
    />

    <!-- Dictator Panel - shown when playing as dictator (above sector panel) -->
    <!-- Hidden during Castro hire since hiring phase UI takes over -->
    <DictatorPanel
      v-if="currentPlayerIsDictator && dictatorCard && !hasActiveCombat && !isHiringMercs"
      :dictator="dictatorCard"
      :tactics-hand="tacticsHand"
      :available-actions="availableActions"
      :action-controller="actionController"
      :is-my-turn="isMyTurn"
      :all-sectors="sectors"
      :player-color="dictatorPlayerColor"
    />

    <!-- Sector Panel - shown when a sector is selected OR when an action has sector context -->
    <SectorPanel
      v-if="activeSector && !hasActiveCombat && !isHiringMercs"
      :sector="activeSector"
      :player-position="playerPosition"
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
      :has-doc="hasDoc"
      :has-squidhead="hasSquidhead"
      :has-mortar="hasMortar"
      :has-damaged-mercs="hasDamagedMercs"
      :has-land-mines-in-stash="hasLandMinesInStash"
      :squidhead-has-land-mine="squidheadHasLandMine"
      :has-dictator-forces="selectedSectorHasDictatorForces"
      :is-base="selectedSectorIsBase"
      :has-explosives-components="hasExplosivesComponents"
      :militia-bonuses="militiaBonuses"
      :dictator-color="dictatorPlayerColor"
      :is-dictator="currentPlayerIsDictator"
      @close="closeSectorPanel"
    />

    <!-- Hiring phase - show MERCs/Dictators to choose from -->
    <div v-if="isHiringMercs" class="hiring-phase">
      <div class="hiring-header">
        <div class="hiring-icon">👥</div>
        <div class="hiring-content">
          <h2 class="hiring-title">{{ isSelectingDictator ? 'Choose Your Dictator' : 'Hiring Phase' }}</h2>
          <p class="hiring-prompt">{{ currentSelection?.prompt || state?.flowState?.prompt || 'Select your MERCs' }}</p>
        </div>
      </div>

      <!-- Equipment type selection -->
      <DrawEquipmentType
        v-if="isSelectingEquipmentType && equipmentTypeChoices.length > 0"
        :choices="equipmentTypeChoices"
        :combatant-id="selectedMercId"
        :combatant-name="selectedMercName"
        :image="selectedMercImagePath"
        :player-color="currentPlayerColor"
        @select="selectEquipmentType"
        @clickMerc="openHiringMercDetail"
      />

      <!-- Sector selection (Castro hire placement) - Visual Cards -->
      <div v-else-if="isSelectingSector && sectorChoices.length > 0" class="sector-selection">
        <div class="sector-row">
          <!-- MERC portrait (clickable to view details) -->
          <CombatantIconSmall
            v-if="selectedMercImagePath"
            :image="selectedMercImagePath"
            :alt="selectedMercName || 'MERC'"
            :player-color="currentPlayerColor"
            :size="80"
            clickable
            @click="openHiringMercDetail"
          />
          <!-- Sector cards -->
          <div class="sector-card-choices">
            <SectorCardChoice
              v-for="sector in sectorChoices"
              :key="sector.value"
              :sector="sector"
              @click="selectSector(sector)"
            />
          </div>
        </div>
      </div>

      <!-- MERC selection -->
      <div class="merc-choices-container" v-else-if="hirableMercs.length > 0 || hasSkipOption">
        <div class="merc-choices">
          <div
            v-for="merc in hirableMercs"
            :key="getMercId(merc)"
            class="merc-choice"
            @click="selectMercToHire(merc)"
          >
            <CombatantCard :merc="merc" :player-color="currentPlayerColor" />
          </div>
        </div>

        <!-- Skip button for third hire (optional) -->
        <div v-if="hasSkipOption" class="skip-hire-section">
          <button class="skip-hire-button" @click="skipThirdHire">
            Skip Third Hire
          </button>
          <p class="skip-hint">You can hire a third MERC thanks to Teresa, or skip</p>
        </div>
      </div>

      <div v-else class="use-action-panel">
        <p class="action-panel-hint">Loading MERCs...</p>
      </div>

      <!-- MERC Detail Modal for hiring phase -->
      <DetailModal :show="showHiringMercModal" @close="closeHiringMercModal">
        <div class="hiring-merc-modal">
          <CombatantCard
            v-if="selectedMercForEquipment"
            :merc="selectedMercForEquipment"
            :player-color="currentPlayerColor"
          />
        </div>
      </DetailModal>
    </div>

    <!-- Hagness Draw Equipment UI -->
    <HagnessDrawEquipment
      v-if="isHagnessDrawActive"
      :is-selecting-type="isHagnessSelectingType"
      :is-selecting-recipient="isHagnessSelectingRecipient"
      :equipment-type-choices="hagnessEquipmentTypeChoices"
      :drawn-equipment="hagnessDrawnEquipment"
      :squad-mates="hagnessSquadMates"
      :player-color="currentPlayerColor"
      @equipment-type-selected="selectEquipmentType"
      @recipient-selected="selectHagnessRecipient"
    />

    <!-- Main content: Map + Squad Panel -->
    <div class="board-layout" v-if="sectors.length > 0 || isPlacingLanding">
      <!-- Map Section -->
      <div class="map-section">
        <!-- Landing Zone Selection - shown above map during landing phase -->
        <LandingZoneSelection
          v-if="isPlacingLanding"
          :sectors="sectors"
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

        <MapGrid
          :sectors="sectors"
          :mercs="allMercs"
          :players="players"
          :control-map="controlMap"
          :clickable-sectors="clickableSectors"
          :can-drop-equipment="canDropEquipment"
          :dictator-base-sector-id="dictatorBaseSectorId"
          :dictator-color="dictatorPlayerColor"
          @sector-click="handleSectorClick"
          @drop-equipment="handleDropEquipment"
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
    <DetailModal :show="showPlayedCardsModal" @close="showPlayedCardsModal = false">
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
    </DetailModal>

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

.hiring-phase {
  background: v-bind('UI_COLORS.cardBg');
  border: 2px solid v-bind('UI_COLORS.accent');
  border-radius: 12px;
  padding: 20px 24px;
}

.hiring-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.hiring-icon {
  font-size: 2.5rem;
}

.hiring-content {
  flex: 1;
}

.hiring-title {
  color: v-bind('UI_COLORS.accent');
  font-size: 1.4rem;
  margin: 0 0 4px;
  font-weight: 700;
}

.hiring-prompt {
  color: v-bind('UI_COLORS.text');
  margin: 0;
  font-size: 1rem;
}

.selected-mercs {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: v-bind('UI_COLORS.backgroundLight');
  border-radius: 8px;
  margin-bottom: 16px;
}

.selected-label {
  color: v-bind('UI_COLORS.textMuted');
  font-size: 0.9rem;
}

.selected-merc-badge {
  background: v-bind('UI_COLORS.accent');
  color: v-bind('UI_COLORS.background');
  padding: 4px 12px;
  border-radius: 16px;
  font-weight: 600;
  font-size: 0.9rem;
}

.merc-choices-container {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.merc-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: center;
}

.merc-choice {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  border-radius: 12px;
}

.merc-choice:hover {
  transform: translateY(-4px);
  box-shadow: 0 0 0 3px v-bind('UI_COLORS.accent'), 0 8px 24px rgba(212, 168, 75, 0.4);
}

/* Equipment type selection buttons */
.equipment-type-choices {
  padding: 20px;
}

.equipment-type-buttons {
  display: flex;
  justify-content: center;
  gap: 20px;
  flex-wrap: wrap;
}

.equipment-type-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 40px;
  border-radius: 12px;
  border: 3px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  background: v-bind('UI_COLORS.cardBg');
  min-width: 140px;
}

.equipment-type-button .equip-icon {
  font-size: 2.5rem;
}

.equipment-type-button .equip-label {
  font-size: 1.2rem;
  font-weight: 600;
  color: v-bind('UI_COLORS.text');
}

.equipment-type-button.weapon {
  border-color: #ff6b8a;
}

.equipment-type-button.weapon:hover {
  background: rgba(255, 107, 138, 0.15);
  box-shadow: 0 0 0 3px #ff6b8a, 0 8px 24px rgba(255, 107, 138, 0.3);
}

.equipment-type-button.armor {
  border-color: #64b5f6;
}

.equipment-type-button.armor:hover {
  background: rgba(100, 181, 246, 0.15);
  box-shadow: 0 0 0 3px #64b5f6, 0 8px 24px rgba(100, 181, 246, 0.3);
}

.equipment-type-button.accessory {
  border-color: #81d4a8;
}

.equipment-type-button.accessory:hover {
  background: rgba(129, 212, 168, 0.15);
  box-shadow: 0 0 0 3px #81d4a8, 0 8px 24px rgba(129, 212, 168, 0.3);
}

/* Sector selection for Castro hire */
.sector-selection {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 20px;
}

.sector-row {
  display: flex;
  gap: 16px;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
}

.hiring-merc-modal {
  display: flex;
  justify-content: center;
  padding: 10px;
}

.sector-prompt {
  font-size: 1rem;
  color: v-bind('UI_COLORS.textSecondary');
  margin: 0;
}

.sector-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  max-width: 600px;
}

.sector-choice-btn {
  background: v-bind('UI_COLORS.surface');
  border: 2px solid v-bind('UI_COLORS.border');
  border-radius: 8px;
  padding: 12px 20px;
  color: v-bind('UI_COLORS.text');
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
}

.sector-choice-btn:hover {
  background: rgba(139, 0, 0, 0.2);
  border-color: #8b0000;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* Sector Card Selection Container */
.sector-card-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: center;
  max-width: 800px;
}

.skip-hire-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.skip-hire-button {
  background: v-bind('UI_COLORS.backgroundLight');
  color: v-bind('UI_COLORS.text');
  border: 2px solid v-bind('UI_COLORS.textMuted');
  padding: 12px 32px;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.skip-hire-button:hover {
  border-color: v-bind('UI_COLORS.accent');
  background: v-bind('UI_COLORS.cardBg');
}

.skip-hint {
  color: v-bind('UI_COLORS.textMuted');
  font-size: 0.85rem;
  margin: 0;
  font-style: italic;
}

.use-action-panel {
  text-align: center;
  padding: 20px;
}

.action-panel-hint {
  color: v-bind('UI_COLORS.text');
  font-size: 1.1rem;
  margin: 0 0 12px;
}

.arrow-down {
  font-size: 2rem;
  color: v-bind('UI_COLORS.accent');
  animation: bounce 1s infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(8px); }
}

.action-panel {
  background: v-bind('UI_COLORS.cardBg');
  border-radius: 12px;
  padding: 20px;
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
</style>
