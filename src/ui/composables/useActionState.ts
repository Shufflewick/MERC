import { computed, ref, reactive, type ComputedRef, type Ref } from 'vue';
import { useGameViewHelpers } from './useGameViewHelpers';
import type { Sector } from './useSectorState';
import type { SquadState } from './useSquadState';
import { quickReassignInProgress } from '../drag-drop-state';

/**
 * Props required for useActionState composable.
 */
export interface ActionStateProps {
  availableActions: string[];
  actionController: {
    currentAction: Ref<string | null>;
    currentPick: Ref<any> | ComputedRef<any>;
    currentArgs: Ref<Record<string, unknown> | undefined> | Ref<Record<string, unknown>>;
    getChoices: (selection: any) => any[];
    fill: (selectionName: string, value: any) => Promise<any>;
    start: (actionName: string, options?: Record<string, unknown>) => Promise<void>;
    execute: (actionName: string, args?: Record<string, unknown>) => Promise<any>;
    [key: string]: any; // Allow additional properties from UseActionControllerReturn
  };
  actionArgs: Record<string, unknown>;
  getActionArgs?: () => Record<string, unknown>; // Reactive getter for actionArgs
  state?: { state?: Record<string, any> };
  playerSeat: number;
  gameView?: any;
  getGameView?: () => any; // Reactive getter for gameView
  isCurrentPlayerDictator?: () => boolean;
}

/**
 * Return type from useActionState composable.
 */
export interface ActionStateReturn {
  // Core state
  actionChoices: ComputedRef<Record<string, unknown>>;
  currentActionMetadata: ComputedRef<any>;
  currentPick: ComputedRef<any>;
  allSelectionsComplete: ComputedRef<boolean>;
  getCurrentActionName: () => string | null;

  // Action type flags
  isHiringMercs: ComputedRef<boolean>;
  isSelectingDictator: ComputedRef<boolean>;
  isHagnessDrawActive: ComputedRef<boolean>;
  isPlacingLanding: ComputedRef<boolean>;
  isSelectingRetreatSector: ComputedRef<boolean>;
  isEquipping: ComputedRef<boolean>;
  isSelectingEquipmentType: ComputedRef<boolean>;
  isCastroHiring: ComputedRef<boolean>;
  isSelectingSector: ComputedRef<boolean>;
  showAssignToSquad: ComputedRef<boolean>;
  isHagnessSelectingType: ComputedRef<boolean>;
  isHagnessSelectingRecipient: ComputedRef<boolean>;

  // Derived state
  retreatSectorChoices: ComputedRef<RetreatSectorChoice[]>;
  sectorChoices: ComputedRef<SectorChoice[]>;
  landingZoneMetadata: ComputedRef<any>;
  selectedMercForEquipment: ComputedRef<any>;
  selectedMercImagePath: ComputedRef<string>;
  selectedMercName: ComputedRef<string>;
  selectedMercId: ComputedRef<string>;
  equipmentTypeChoices: ComputedRef<Array<{ value: string; label: string }>>;

  // Hagness state
  hagnessEquipmentTypeChoices: ComputedRef<Array<{ value: string; label: string }>>;
  hagnessDrawnEquipment: ComputedRef<any>;
  hagnessSquadMates: ComputedRef<HagnessSquadMate[]>;

  // Loading/UI state
  deferredChoicesLoading: Ref<boolean>;
  fetchedDeferredChoices: Record<string, any[]>;
  showHiringMercModal: Ref<boolean>;
  assignToSquadDelayedHide: Ref<boolean>;

  // Utility functions
  findMercByName: (name: string | any, node?: any) => any;
  getSectorImageFallback: (sectorType: string) => string;
}

/**
 * Choice for retreat sector selection with full sector data.
 */
export interface RetreatSectorChoice {
  id: number;
  sectorName: string;
  sectorType: string;
  image: string;
  value: number;
  weaponLoot: number;
  armorLoot: number;
  accessoryLoot: number;
  dictatorMilitia: number;
}

/**
 * Choice for sector selection (Castro hire placement).
 */
export interface SectorChoice {
  value: string;
  label: string;
  sectorName: string;
  sectorType: string;
  image: string;
  value_points: number;
  weaponLoot: number;
  armorLoot: number;
  accessoryLoot: number;
  dictatorMilitia: number;
  explored: boolean;
}

/**
 * Hagness squad mate for recipient selection.
 */
export interface HagnessSquadMate {
  displayName: string;
  combatantId: string;
  image: string;
  choice: { value: string };
}

/**
 * Composable for action-related state derivation.
 * Extracts action type flags, selection state, and derived action data.
 *
 * @param props - Action state props from GameTable
 * @param sectors - Computed sectors array from useSectorState
 * @param primarySquad - Computed primary squad from useSquadState
 * @param secondarySquad - Computed secondary squad from useSquadState
 */
export function useActionState(
  props: ActionStateProps,
  sectors: ComputedRef<Sector[]>,
  primarySquad: ComputedRef<SquadState | undefined>,
  secondarySquad: ComputedRef<SquadState | undefined>
): ActionStateReturn {
  const { getAttr, findElementById } = useGameViewHelpers(() => props.gameView);

  // ============================================================================
  // REFS FOR UI STATE
  // ============================================================================

  const deferredChoicesLoading = ref(false);
  const fetchedDeferredChoices = reactive<Record<string, any[]>>({});
  const showHiringMercModal = ref(false);
  const assignToSquadDelayedHide = ref(false);

  // ============================================================================
  // CORE ACTION STATE
  // ============================================================================

  // Get action choices from actionArgs
  const actionChoices = computed(() => {
    return props.actionArgs || {};
  });

  // Get action metadata for the current action (hiring, hagness, or explore)
  const currentActionMetadata = computed(() => {
    const metadata = props.state?.state?.actionMetadata;
    if (!metadata) return null;

    // Check for hiring actions (Day 1 or Castro's ability)
    if (isHiringMercs.value) {
      return metadata.hireFirstMerc ||
             metadata.hireSecondMerc ||
             metadata.hireThirdMerc ||
             metadata.dictatorHireFirstMerc ||
             metadata.castroBonusHire;
    }

    // Check for Hagness draw action FIRST (when user is actively interacting with it)
    // This takes precedence over explore since Hagness requires specific user action
    if (isHagnessDrawActive.value) {
      return metadata.hagnessDrawType || metadata.hagnessGiveEquipment;
    }

    // Check for explore action
    if (props.availableActions.includes('explore')) {
      return metadata.explore;
    }

    return null;
  });

  // Get the current pick (first selection that hasn't been filled yet)
  // Prefers actionController.currentPick when an action is active via actionController
  const currentPick = computed(() => {
    // When an action is active via actionController, use its currentPick
    if (props.actionController.currentAction.value && props.actionController.currentPick.value) {
      return props.actionController.currentPick.value;
    }

    // Fall back to flow state metadata approach
    const metadata = currentActionMetadata.value;
    if (!metadata?.selections?.length) return null;

    // Find first selection that doesn't have a value in actionArgs
    for (const sel of metadata.selections) {
      if (props.actionArgs[sel.name] === undefined) {
        return sel;
      }
    }
    return null; // All selections filled
  });

  // Check if all selections are filled
  const allSelectionsComplete = computed(() => {
    const metadata = currentActionMetadata.value;
    if (!metadata?.selections?.length) return false;

    for (const sel of metadata.selections) {
      if (props.actionArgs[sel.name] === undefined) {
        return false;
      }
    }
    return true;
  });

  // Get current action name that needs custom UI handling (hiring, hagness, or explore)
  function getCurrentActionName(): string | null {
    if (props.availableActions.includes('selectDictator')) return 'selectDictator';
    if (props.availableActions.includes('hireFirstMerc')) return 'hireFirstMerc';
    if (props.availableActions.includes('hireSecondMerc')) return 'hireSecondMerc';
    if (props.availableActions.includes('hireThirdMerc')) return 'hireThirdMerc';
    if (props.actionController.currentAction.value === 'castroBonusHire') return 'castroBonusHire';
    if (props.actionController.currentAction.value === 'selectDictator') return 'selectDictator';
    // Check Hagness actions (when user is actively interacting with them)
    if (isHagnessDrawActive.value) return 'hagnessDrawType';
    if (props.availableActions.includes('explore')) return 'explore';
    if (props.availableActions.includes('hagnessDrawType')) return 'hagnessDrawType';
    return null;
  }

  // ============================================================================
  // ACTION TYPE FLAGS
  // ============================================================================

  // Check if we're in MERC hiring mode (Day 1 or Castro's ability)
  // Simplified: check availableActions OR currentAction (no selection state check)
  const isHiringMercs = computed(() => {
    const currentAction = props.actionController.currentAction.value;
    const hiringActions = ['hireFirstMerc', 'hireSecondMerc', 'hireThirdMerc', 'dictatorHireFirstMerc', 'castroBonusHire', 'selectDictator'];

    // Check if any hiring action is available
    const hasHiringAction = props.availableActions.some(a => hiringActions.includes(a));
    if (hasHiringAction) return true;

    // Check if current action is a hiring action
    if (currentAction !== null && hiringActions.includes(currentAction)) {
      // Special case: selectDictator is only a hiring action for the dictator player
      // currentAction is shared across all players, so rebels might see it
      if (currentAction === 'selectDictator') {
        const isDictator = props.isCurrentPlayerDictator?.() ?? false;
        return isDictator;
      }
      return true;
    }

    return false;
  });

  // Check if we're selecting a dictator (Day 1 human dictator)
  // Only show for the actual dictator player based on lobby role assignment
  const isSelectingDictator = computed(() => {
    // Only the dictator player should see the dictator selection UI
    if (props.isCurrentPlayerDictator && !props.isCurrentPlayerDictator()) {
      return false;
    }

    const currentAction = props.actionController.currentAction.value;
    if (props.availableActions.includes('selectDictator')) return true;
    if (currentAction === 'selectDictator') {
      return props.actionController.currentPick.value !== null;
    }
    return false;
  });

  // Use actionController to detect when Hagness draw action is active
  // Both hagnessDrawType (step 1) and hagnessGiveEquipment (step 2) are part of the flow
  const isHagnessDrawActive = computed(() => {
    const action = props.actionController.currentAction.value;
    return action === 'hagnessDrawType' || action === 'hagnessGiveEquipment';
  });

  // Check if we're in landing placement mode
  // Simplified: check availableActions OR currentAction (no selection state check)
  const isPlacingLanding = computed(() => {
    return props.availableActions.includes('placeLanding') ||
           props.actionController.currentAction.value === 'placeLanding';
  });

  // Check if we're selecting a retreat sector (combatRetreat action needs retreatSector)
  const isSelectingRetreatSector = computed(() => {
    const currentAction = props.actionController.currentAction.value;
    const currentSel = props.actionController.currentPick.value;
    return currentAction === 'combatRetreat' && currentSel?.name === 'retreatSector';
  });

  // Check if we're equipping starting equipment
  const isEquipping = computed(() => {
    return props.availableActions.includes('equipStarting');
  });

  // Check if current selection is for equipment type (Day 1 hiring or Castro hire)
  const isSelectingEquipmentType = computed(() => {
    const selection = currentPick.value;
    return selection?.name === 'equipmentType';
  });

  // Check if we're in Castro hiring flow (to show equipment selection properly)
  const isCastroHiring = computed(() => {
    return props.actionController.currentAction.value === 'castroBonusHire';
  });

  // Check if current selection is for sector (Castro hire placement)
  const isSelectingSector = computed(() => {
    const selection = currentPick.value;
    return selection?.name === 'targetSector';
  });

  // Show AssignToSquad component when assignToSquad action is active
  // Keep visible briefly after action completes so animation can find destination element
  // BUT: Don't show when quickReassignInProgress (action auto-completed from squad badge click)
  const showAssignToSquad = computed(() =>
    (props.actionController.currentAction.value === 'assignToSquad' || assignToSquadDelayedHide.value) &&
    !quickReassignInProgress.value
  );

  // Check if Hagness is selecting equipment type (step 1: hagnessDrawType action)
  const isHagnessSelectingType = computed(() => {
    return props.actionController.currentAction.value === 'hagnessDrawType';
  });

  // Check if Hagness is selecting recipient (step 2: hagnessGiveEquipment action)
  const isHagnessSelectingRecipient = computed(() => {
    return props.actionController.currentAction.value === 'hagnessGiveEquipment';
  });

  // ============================================================================
  // DERIVED STATE
  // ============================================================================

  // Get fallback image for sector type
  function getSectorImageFallback(sectorType: string): string {
    const type = sectorType.toLowerCase();
    if (type === 'wilderness') return '/sectors/wilderness.jpg';
    if (type === 'city') return '/sectors/town---a.jpg';
    return '/sectors/industry---coal.jpg';
  }

  // Get retreat sector choices when selecting retreat destination
  const retreatSectorChoices = computed<RetreatSectorChoice[]>(() => {
    if (!isSelectingRetreatSector.value) return [];
    const currentSel = props.actionController.currentPick.value;
    if (!currentSel) return [];
    const choices = props.actionController.getChoices(currentSel) || [];

    // Choices from getChoices() have { value, display } structure from BoardSmith
    // Find sector by matching the numeric value and include full sector data for visual display
    return choices.map((choice: any) => {
      // choice.value is the numeric BoardSmith element ID (NOT choice.id!)
      const numericId = choice.value;
      const sectorData = sectors.value.find(s => s.id === numericId);
      return {
        id: numericId,  // Keep numeric ID for fill() - we store value as id for our UI
        sectorName: sectorData?.sectorName || choice.display || 'Unknown',
        sectorType: sectorData?.sectorType || 'Wilderness',
        // Include full sector data for SectorCardChoice display
        image: sectorData?.image || getSectorImageFallback(sectorData?.sectorType || 'Wilderness'),
        value: sectorData?.value || 0,
        weaponLoot: sectorData?.weaponLoot || 0,
        armorLoot: sectorData?.armorLoot || 0,
        accessoryLoot: sectorData?.accessoryLoot || 0,
        dictatorMilitia: sectorData?.dictatorMilitia || 0,
      };
    });
  });

  // Get sector choices for Castro hire placement - includes full sector data
  const sectorChoices = computed<SectorChoice[]>(() => {
    if (!isSelectingSector.value) return [];
    const selection = currentPick.value;
    if (!selection) return [];
    const choices = props.actionController.getChoices(selection) || [];
    return choices.map((choice: any) => {
      const sectorName = typeof choice === 'string' ? choice : (choice.value || choice.display || String(choice));
      // Find full sector data by name
      const sectorData = sectors.value.find(s => s.sectorName === sectorName);
      return {
        value: sectorName,
        label: sectorName,
        // Include full sector data for visual card display
        sectorName: sectorData?.sectorName || sectorName,
        sectorType: sectorData?.sectorType || 'Industry',
        image: sectorData?.image || getSectorImageFallback(sectorData?.sectorType || 'Industry'),
        value_points: sectorData?.value || 0,
        weaponLoot: sectorData?.weaponLoot || 0,
        armorLoot: sectorData?.armorLoot || 0,
        accessoryLoot: sectorData?.accessoryLoot || 0,
        dictatorMilitia: sectorData?.dictatorMilitia || 0,
        explored: sectorData?.explored || false,
      };
    });
  });

  // Get landing zone action metadata
  const landingZoneMetadata = computed(() => {
    if (!isPlacingLanding.value) return null;
    return props.state?.state?.actionMetadata?.placeLanding;
  });

  // Get equipment type choices when selecting equipment
  // Normalize to array of { value, label } objects
  const equipmentTypeChoices = computed<Array<{ value: string; label: string }>>(() => {
    if (!isSelectingEquipmentType.value) return [];
    const selection = currentPick.value;
    if (!selection) return [];
    // Use actionController getter (not selection.choices)
    const choices = props.actionController.getChoices(selection) || [];
    // Normalize choices to objects with value and label
    return choices.map((choice: any) => {
      if (typeof choice === 'string') {
        return { value: choice, label: choice };
      }
      return { value: choice.value || choice, label: choice.display || choice.value || String(choice) };
    });
  });

  // Helper to find a MERC by name anywhere in the gameView tree
  function findMercByName(name: string | any, node?: any): any {
    if (!node) node = props.gameView;
    if (!node) return null;

    // Ensure name is a string (handle object/undefined cases)
    const searchName = typeof name === 'string' ? name : (name?.value || name?.label || String(name || ''));
    if (!searchName) return null;

    const nodeName = getAttr<string>(node, 'combatantName', '');
    if (nodeName && nodeName.toLowerCase() === searchName.toLowerCase()) {
      return node;
    }

    if (node.children) {
      for (const child of node.children) {
        const found = findMercByName(searchName, child);
        if (found) return found;
      }
    }
    return null;
  }

  // Get the MERC currently being hired (for showing portrait and name during hiring flow)
  const selectedMercForEquipment = computed(() => {
    // Only active during hiring flow (equipment or sector selection)
    if (!isSelectingEquipmentType.value && !isSelectingSector.value) return null;

    // Get MERC name from actionController.currentArgs (active action) or actionArgs (fallback)
    // During multi-step actions, currentArgs contains the filled values
    // Use getActionArgs getter for reactivity (props.actionArgs is a plain object that doesn't trigger re-computation)
    const currentArgs = props.actionController.currentArgs?.value || {};
    const actionArgs = props.getActionArgs ? props.getActionArgs() : props.actionArgs;
    let combatantName = (currentArgs['merc'] as string | undefined) ||
                        (actionArgs['merc'] as string | undefined);

    // Fallback for dictator hiring: get from cached combatantId and look up in combatantData
    if (!combatantName) {
      const settings = props.gameView?.settings ||
                       props.state?.state?.settings ||
                       props.gameView?.attributes?.settings;
      // Use combatantId (string) to look up in combatantData directly
      // (numeric element ID can't find MERC because it's in mercDiscard which isn't serialized)
      const drawnMercCombatantId = settings?.dictatorFirstMercCombatantId;
      if (drawnMercCombatantId) {
        const combatantData = settings?.combatantData || [];
        const mercInfo = combatantData.find((d: any) =>
          d.cardType === 'merc' && d.id === drawnMercCombatantId
        );
        if (mercInfo) {
          combatantName = mercInfo.name;
        }
      }
    }
    if (!combatantName) return null;

    // First try to find the MERC in the game tree
    let merc = findMercByName(combatantName);

    // If not found, fall back to combatantData (mercs in deck during hiring aren't in tree)
    if (!merc) {
      // Use getGameView getter for reactivity (props.gameView is a snapshot that doesn't update)
      const gameView = props.getGameView ? props.getGameView() : props.gameView;
      const combatantData = gameView?.attributes?.settings?.combatantData ||
                            props.state?.state?.settings?.combatantData ||
                            gameView?.settings?.combatantData || [];
      const mercInfo = combatantData.find((d: any) =>
        d.cardType === 'merc' && d.name.toLowerCase() === combatantName.toLowerCase()
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

    return merc;
  });

  // Get the image path for the selected MERC
  const selectedMercImagePath = computed(() => {
    const merc = selectedMercForEquipment.value;
    if (!merc) return '';
    return getAttr(merc, 'image', '');
  });

  // Get the name for the selected MERC
  const selectedMercName = computed(() => {
    const merc = selectedMercForEquipment.value;
    if (!merc) return '';
    return getAttr(merc, 'combatantName', '') || (merc as any).combatantName || '';
  });

  // Get the combatantId for the selected MERC
  const selectedMercId = computed(() => {
    const merc = selectedMercForEquipment.value;
    if (!merc) return '';
    return getAttr(merc, 'combatantId', '') || (merc as any).combatantId || '';
  });

  // ============================================================================
  // HAGNESS-SPECIFIC STATE
  // ============================================================================

  // Get Hagness equipment type choices
  const hagnessEquipmentTypeChoices = computed<Array<{ value: string; label: string }>>(() => {
    if (!isHagnessSelectingType.value) return [];
    const selection = currentPick.value;
    if (!selection) return [];
    // Use actionController getter (not selection.choices)
    const choices = props.actionController.getChoices(selection) || [];
    return choices.map((choice: any) => {
      if (typeof choice === 'string') {
        return { value: choice, label: choice };
      }
      return { value: choice.value || choice, label: choice.display || choice.value || String(choice) };
    });
  });

  // Get Hagness's drawn equipment from settings
  // Equipment is stored in settings.hagnessDrawnEquipmentData[playerId] after hagnessDrawType executes
  const hagnessDrawnEquipment = computed(() => {
    if (!isHagnessSelectingRecipient.value) return null;

    const playerKey = `${props.playerSeat}`;

    // Use getGameView() for reactivity if available
    const gameView = props.getGameView ? props.getGameView() : props.gameView;

    // Try to find hagnessDrawnEquipmentData in settings (stored by hagnessDrawType action)
    const settings = gameView?.settings || gameView?.attributes?.settings || props.state?.state?.settings;

    // New simplified key: just the player seat (no equipment type needed since only one can be pending)
    const data = settings?.hagnessDrawnEquipmentData?.[playerKey];
    if (data) {
      return data;
    }

    return null;
  });

  // Get Hagness's squad mates - get choice values from currentPick, but look up image from squad data
  const hagnessSquadMates = computed<HagnessSquadMate[]>(() => {
    if (!isHagnessSelectingRecipient.value) return [];

    // Build a lookup map of merc images from squad data
    const allSquadMercs = [
      ...(primarySquad.value?.mercs || []),
      ...(secondarySquad.value?.mercs || []),
    ];
    const mercImageMap = new Map<string, string>();
    const mercIdMap = new Map<string, string>();
    for (const merc of allSquadMercs) {
      const name = (getAttr(merc, 'combatantName', '') || '').toLowerCase();
      const id = getAttr(merc, 'combatantId', '') || '';
      const image = getAttr(merc, 'image', '') || '';
      if (name) {
        mercImageMap.set(name, image);
        mercIdMap.set(name, id);
      }
    }

    // Get choices from currentPick - choices only have {value, display} from BoardSmith
    const selection = currentPick.value;
    if (selection) {
      const choices = props.actionController.getChoices(selection) || [];
      if (choices.length > 0) {
        return choices.map((choice: any) => {
          const displayName = typeof choice.value === 'string' ? choice.value : (choice.display || 'Unknown');
          const nameLower = displayName.toLowerCase();
          // Look up image and id from squad data
          const combatantId = mercIdMap.get(nameLower) || nameLower;
          const image = mercImageMap.get(nameLower) || '';
          return { displayName, combatantId, image, choice };
        }).sort((a: HagnessSquadMate, b: HagnessSquadMate) => a.displayName.localeCompare(b.displayName));
      }
    }

    // Fallback: No choices yet, create from squad data directly
    if (allSquadMercs.length === 0) return [];

    return allSquadMercs.map((merc: any) => {
      const combatantId = getAttr(merc, 'combatantId', '') || '';
      const combatantName = getAttr(merc, 'combatantName', '') || combatantId || 'Unknown';
      const image = getAttr(merc, 'image', '') || '';
      const displayName = combatantName.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      return {
        displayName,
        combatantId,
        image,
        choice: { value: displayName },
      };
    }).sort((a: HagnessSquadMate, b: HagnessSquadMate) => a.displayName.localeCompare(b.displayName));
  });

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    // Core state
    actionChoices,
    currentActionMetadata,
    currentPick,
    allSelectionsComplete,
    getCurrentActionName,

    // Action type flags
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

    // Derived state
    retreatSectorChoices,
    sectorChoices,
    landingZoneMetadata,
    selectedMercForEquipment,
    selectedMercImagePath,
    selectedMercName,
    selectedMercId,
    equipmentTypeChoices,

    // Hagness state
    hagnessEquipmentTypeChoices,
    hagnessDrawnEquipment,
    hagnessSquadMates,

    // Loading/UI state
    deferredChoicesLoading,
    fetchedDeferredChoices,
    showHiringMercModal,
    assignToSquadDelayedHide,

    // Utility functions
    findMercByName,
    getSectorImageFallback,
  };
}
