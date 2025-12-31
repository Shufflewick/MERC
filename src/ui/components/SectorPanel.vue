<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { UI_COLORS, getPlayerColor } from '../colors';
import type { UseActionControllerReturn } from '@boardsmith/ui';
import DetailModal from './DetailModal.vue';
import MercCard from './MercCard.vue';
import EquipmentTable from './EquipmentTable.vue';

// Helper to get attribute from node
function getAttr<T>(node: any, key: string, defaultVal: T): T {
  if (node?.attributes && node.attributes[key] !== undefined) return node.attributes[key];
  if (node && node[key] !== undefined) return node[key];
  return defaultVal;
}

// Props
const props = defineProps<{
  sector: {
    id?: number;  // Numeric BoardSmith element ID (for action controller fill)
    sectorId: string;
    sectorName: string;
    sectorType: string;
    row: number;
    col: number;
    explored: boolean;
    dictatorMilitia: number;
    rebelMilitia: Record<string, number>;
    image?: string;
  };
  playerPosition: number;
  availableActions: string[];
  actionController: UseActionControllerReturn;
  gameView?: any; // Full game state for element lookups
  // Squad info
  primarySquad?: {
    sectorId: string;
    mercs: any[];
  };
  secondarySquad?: {
    sectorId: string;
    mercs: any[];
  };
  // All sectors for adjacency calculation
  allSectors: Array<{
    sectorId: string;
    row: number;
    col: number;
  }>;
  // Stash contents (if visible)
  stashContents?: Array<{
    equipmentName: string;
    equipmentType: string;
  }>;
  // Special MERCs on team
  hasDoc?: boolean;
  hasSquidhead?: boolean;
  hasMortar?: boolean;
  hasDamagedMercs?: boolean;
  hasLandMinesInStash?: boolean;
  squidheadHasLandMine?: boolean;
  // Dictator info
  hasDictatorForces?: boolean;
  isBase?: boolean;
  hasExplosivesComponents?: boolean;
}>();

// Helper to find element by ID in gameView
function findElementById(id: number): any {
  if (!props.gameView) return null;

  // Search recursively through the gameView for elements with matching ID
  const searchInObject = (obj: any, targetId: number): any => {
    if (!obj || typeof obj !== 'object') return null;

    // Check if this object has the target ID
    if (obj.ref === targetId || obj.id === targetId) {
      return obj;
    }

    // Check attributes
    if (obj.attributes && (obj.attributes.ref === targetId || obj.attributes.id === targetId)) {
      return obj;
    }

    // Search in arrays
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = searchInObject(item, targetId);
        if (found) return found;
      }
    }

    // Search in object properties
    for (const key of Object.keys(obj)) {
      if (key === 'parent' || key === '_parent') continue; // Avoid circular refs
      const found = searchInObject(obj[key], targetId);
      if (found) return found;
    }

    return null;
  };

  return searchInObject(props.gameView, id);
}

const emit = defineEmits<{
  (e: 'close'): void;
}>();

// Track which action we started from this panel
const activeActionFromPanel = ref<string | null>(null);

// Track numeric element ID for Move Here action (pre-fill destination)
const moveDestinationElementId = ref<number | null>(null);

// MERC modal state
const showMercModal = ref(false);
const selectedMerc = ref<any>(null);

// Stash modal state
const showStashModal = ref(false);

function openMercCard(merc: any) {
  selectedMerc.value = merc;
  showMercModal.value = true;
}

function closeMercModal() {
  showMercModal.value = false;
  selectedMerc.value = null;
}

// Check if player's squad is in this sector
const hasSquadInSector = computed(() => {
  return props.primarySquad?.sectorId === props.sector.sectorId ||
         props.secondarySquad?.sectorId === props.sector.sectorId;
});

// Check if we're in an explore action for this sector
// If so, treat the sector as explored even if the prop hasn't updated yet
const isExplorationInProgress = computed(() => {
  return activeActionFromPanel.value === 'explore' &&
         hasSquadInSector.value &&
         props.actionController.currentAction.value === 'explore';
});

// Effective "explored" status - true if actually explored OR if exploration is in progress
const effectiveExplored = computed(() => {
  return props.sector.explored || isExplorationInProgress.value;
});

// Get which squad is in this sector
const squadInSector = computed(() => {
  if (props.primarySquad?.sectorId === props.sector.sectorId) {
    return { name: 'Primary Squad', mercs: props.primarySquad.mercs || [] };
  }
  if (props.secondarySquad?.sectorId === props.sector.sectorId) {
    return { name: 'Secondary Squad', mercs: props.secondarySquad.mercs || [] };
  }
  return null;
});

// Get MERC image path
function getMercImagePath(merc: any): string {
  // Check for direct image property
  const image = getAttr(merc, 'image', '');
  if (image) return image;

  // Check for mercId in various locations
  let mercId = getAttr(merc, 'mercId', '');
  if (!mercId && merc?.attributes?.mercId) {
    mercId = merc.attributes.mercId;
  }

  if (mercId) {
    return `/mercs/${mercId}.jpg`;
  }

  // Fallback - try to derive from name
  const name = getMercName(merc);
  if (name && name !== 'Unknown') {
    return `/mercs/${name.toLowerCase()}.jpg`;
  }

  return '/mercs/unknown.jpg';
}

// Get MERC name
function getMercName(merc: any): string {
  return getAttr(merc, 'mercName', '') || getAttr(merc, 'mercId', 'Unknown');
}

// Get equipment image path
function getEquipmentImagePath(equip: any): string {
  const image = getAttr(equip, 'image', '');
  if (image) return image;

  const equipId = getAttr(equip, 'equipmentId', '');
  if (equipId) return `/equipment/${equipId}.png`;

  // Fallback: derive from name - equipment files use lowercase with spaces
  const name = getEquipmentName(equip);
  if (name && name !== 'Unknown' && name !== 'Done') {
    // Try exact lowercase match first (e.g., "Ghillie Suit" -> "ghillie suit.png")
    const filename = name.toLowerCase();
    return `/equipment/${filename}.png`;
  }

  return '/equipment/unknown.png';
}

// Get equipment name
function getEquipmentName(equip: any): string {
  // Use parsed name if available (from "Name (Type)" format)
  if (equip._parsedName) return equip._parsedName;
  return getAttr(equip, 'equipmentName', '') ||
         getAttr(equip, 'name', '') ||
         equip._choiceDisplay ||
         'Unknown';
}

// Get equipment type
function getEquipmentType(equip: any): string {
  // Use parsed type if available
  if (equip._parsedType) return equip._parsedType;
  return getAttr(equip, 'equipmentType', '') || getAttr(equip, 'type', '');
}

// Get equipment description
function getEquipmentDescription(equip: any): string {
  return getAttr(equip, 'description', '') || '';
}

// Format equipment stat bonuses as a string
function getEquipmentStats(equip: any): string {
  const stats: string[] = [];

  const combat = getAttr(equip, 'combatBonus', 0);
  if (combat !== 0) {
    stats.push(`Combat ${combat > 0 ? '+' : ''}${combat}`);
  }

  const initiative = getAttr(equip, 'initiative', 0);
  if (initiative !== 0) {
    stats.push(`Init ${initiative > 0 ? '+' : ''}${initiative}`);
  }

  const training = getAttr(equip, 'training', 0);
  if (training !== 0) {
    stats.push(`Training ${training > 0 ? '+' : ''}${training}`);
  }

  const armor = getAttr(equip, 'armorBonus', 0);
  if (armor !== 0) {
    stats.push(`Armor ${armor > 0 ? '+' : ''}${armor}`);
  }

  const targets = getAttr(equip, 'targets', 0);
  if (targets > 1) {
    stats.push(`${targets} targets`);
  }

  const negatesArmor = getAttr(equip, 'negatesArmor', false);
  if (negatesArmor) {
    stats.push('Ignores armor');
  }

  return stats.join(' • ');
}

// Get CSS class for equipment type badge
function getEquipmentTypeClass(equip: any): string {
  const type = getEquipmentType(equip).toLowerCase();
  if (type === 'weapon') return 'type-weapon';
  if (type === 'armor') return 'type-armor';
  if (type === 'accessory') return 'type-accessory';
  return '';
}

// Get adjacent sector IDs
const adjacentSectorIds = computed(() => {
  const { row, col } = props.sector;
  const adjacent: string[] = [];

  // Orthogonal neighbors (up, down, left, right)
  const directions = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];

  for (const { dr, dc } of directions) {
    const neighborRow = row + dr;
    const neighborCol = col + dc;
    const neighbor = props.allSectors.find(
      s => s.row === neighborRow && s.col === neighborCol
    );
    if (neighbor) {
      adjacent.push(neighbor.sectorId);
    }
  }

  return adjacent;
});

// Check if player's squad is adjacent to this sector
const hasSquadAdjacent = computed(() => {
  const primaryInAdjacent = props.primarySquad?.sectorId &&
    adjacentSectorIds.value.includes(props.primarySquad.sectorId);
  const secondaryInAdjacent = props.secondarySquad?.sectorId &&
    adjacentSectorIds.value.includes(props.secondarySquad.sectorId);
  return primaryInAdjacent || secondaryInAdjacent;
});

// Sector type helpers
const isCity = computed(() => props.sector.sectorType === 'City');
const isIndustry = computed(() => props.sector.sectorType === 'Industry');

// Calculate total rebel militia for this player
const playerMilitia = computed(() => {
  return props.sector.rebelMilitia[String(props.playerPosition)] || 0;
});

// Actions available when IN this sector
const inSectorActions = computed(() => {
  if (!hasSquadInSector.value) return [];

  const actions: Array<{ name: string; label: string; icon: string }> = [];

  if (!effectiveExplored.value && props.availableActions.includes('explore')) {
    actions.push({ name: 'explore', label: 'Explore', icon: '🔍' });
  }
  if (props.availableActions.includes('train')) {
    actions.push({ name: 'train', label: 'Train', icon: '🎖️' });
  }
  if (isCity.value && props.availableActions.includes('hospital')) {
    actions.push({ name: 'hospital', label: 'Hospital', icon: '🏥' });
  }
  if (isCity.value && props.availableActions.includes('armsDealer')) {
    actions.push({ name: 'armsDealer', label: 'Arms Dealer', icon: '🔫' });
  }
  if (props.stashContents && props.stashContents.length > 0 && props.availableActions.includes('reEquip')) {
    actions.push({ name: 'reEquip', label: 'Re-Equip', icon: '🎒' });
  }
  if (props.availableActions.includes('dropEquipment')) {
    actions.push({ name: 'dropEquipment', label: 'Drop', icon: '📤' });
  }
  if (props.hasDoc && props.hasDamagedMercs && props.availableActions.includes('docHeal')) {
    actions.push({ name: 'docHeal', label: 'Doc Heal', icon: '💊' });
  }
  if (props.hasSquidhead && props.hasLandMinesInStash && props.availableActions.includes('squidheadDisarm')) {
    actions.push({ name: 'squidheadDisarm', label: 'Disarm', icon: '💣' });
  }
  if (props.hasSquidhead && props.squidheadHasLandMine && props.availableActions.includes('squidheadArm')) {
    actions.push({ name: 'squidheadArm', label: 'Arm', icon: '💥' });
  }
  if (props.isBase && props.hasExplosivesComponents && props.availableActions.includes('detonateExplosives')) {
    actions.push({ name: 'detonateExplosives', label: 'DETONATE!', icon: '🎆' });
  }

  return actions;
});

// Actions available when ADJACENT to this sector
const adjacentActions = computed(() => {
  if (!hasSquadAdjacent.value || hasSquadInSector.value) return [];

  const actions: Array<{ name: string; label: string; icon: string }> = [];

  if (props.availableActions.includes('move')) {
    actions.push({ name: 'move', label: 'Move Here', icon: '🚶' });
  }
  if (props.hasMortar && props.hasDictatorForces && props.availableActions.includes('mortar')) {
    actions.push({ name: 'mortar', label: 'Mortar', icon: '💥' });
  }
  if (props.availableActions.includes('coordinatedAttack')) {
    const primaryAdjacent = props.primarySquad?.sectorId &&
      adjacentSectorIds.value.includes(props.primarySquad.sectorId);
    const secondaryAdjacent = props.secondarySquad?.sectorId &&
      adjacentSectorIds.value.includes(props.secondarySquad.sectorId);
    if (primaryAdjacent && secondaryAdjacent) {
      actions.push({ name: 'coordinatedAttack', label: 'Coord. Attack', icon: '⚔️' });
    }
  }

  return actions;
});

// All available actions for this sector
const allActions = computed(() => [...inSectorActions.value, ...adjacentActions.value]);

// Check if we're currently in an action flow started from this panel
// Also detect followUp actions like collectEquipment that chain from explore
const isInActionFlow = computed(() => {
  const currentAction = props.actionController.currentAction.value;
  if (!currentAction) return false;

  // Direct action from panel
  if (activeActionFromPanel.value !== null && currentAction === activeActionFromPanel.value) {
    return true;
  }

  // FollowUp action (collectEquipment chains from explore)
  // Check if current action is collectEquipment and we have a squad in this sector
  if (currentAction === 'collectEquipment' && hasSquadInSector.value) {
    return true;
  }

  return false;
});

// Get current selection from action controller
const currentSelection = computed(() => {
  if (!isInActionFlow.value) return null;
  return props.actionController.currentSelection.value;
});

// Get choices for current selection
const currentChoices = computed(() => {
  if (!currentSelection.value) return [];
  return props.actionController.getChoices(currentSelection.value);
});

// Get valid elements for element selection - use actionController getter (not selection.validElements)
const validElements = computed(() => {
  if (!currentSelection.value) return [];
  // Use the controller's getter which reads from the fetch cache
  return props.actionController.getValidElements(currentSelection.value) || [];
});

// Get choices (for choice selections or element selections that use choices)
const selectionChoices = computed(() => {
  if (!currentSelection.value) return [];
  // Use getChoices from actionController
  return props.actionController.getChoices(currentSelection.value);
});

// Get all available MERCs (from both squads in sector)
const allAvailableMercs = computed(() => {
  const mercs: any[] = [];
  if (props.primarySquad?.sectorId === props.sector.sectorId && props.primarySquad?.mercs) {
    mercs.push(...props.primarySquad.mercs);
  }
  if (props.secondarySquad?.sectorId === props.sector.sectorId && props.secondarySquad?.mercs) {
    mercs.push(...props.secondarySquad.mercs);
  }
  return mercs;
});

// Check if current selection is for MERC
const isSelectingMerc = computed(() => {
  const sel = props.actionController.currentSelection.value;
  if (!sel) return false;

  // Check selection name/prompt for MERC-related keywords
  const selName = (sel.name || '').toLowerCase();
  const selPrompt = (sel.prompt || '').toLowerCase();

  // If prompt or name mentions MERC, it's a MERC selection
  if (selName.includes('merc') || selPrompt.includes('merc')) {
    return true;
  }

  // Check if element selection with MERC elements (use getter)
  const mercValidEls = props.actionController.getValidElements(sel) || [];
  if (sel.type === 'element' && mercValidEls.length > 0) {
    return mercValidEls.some((e: any) => e.mercId || e.attributes?.mercId);
  }

  return false;
});

// Check if current selection is for equipment
const isSelectingEquipment = computed(() => {
  const sel = props.actionController.currentSelection.value;
  if (!sel) return false;

  const validEls = props.actionController.getValidElements(sel) || [];
  const choices = props.actionController.getChoices(sel) || [];

  // Check selection name for equipment
  const selName = (sel.name || '').toLowerCase();
  if (selName === 'equipment') {
    return true;
  }

  // Check prompt for equipment keywords
  const prompt = (sel.prompt || '').toLowerCase();
  if (prompt.includes('equipment') || prompt.includes('weapon') || prompt.includes('armor') ||
      prompt.includes('accessory') || prompt.includes('take')) {
    return true;
  }

  // Check validElements for equipment data (using getter)
  if (sel.type === 'element' && validEls.length > 0) {
    return validEls.some((e: any) =>
      e.equipmentId || e.equipmentName ||
      e.element?.attributes?.equipmentId || e.element?.attributes?.equipmentName
    );
  }

  // Check if type is 'elements' (plural) - used for fromElements with repeat
  if (sel.type === 'elements') {
    return true;
  }

  return false;
});

// Check if it's a generic choice selection (not MERC or equipment)
const isSelectingChoice = computed(() => {
  if (!currentSelection.value) return false;
  // If we have choices but they're not MERCs or equipment, show as generic choices
  if (selectionChoices.value.length > 0 && !isSelectingMerc.value && !isSelectingEquipment.value) {
    return true;
  }
  return currentSelection.value.type === 'choice' && !isSelectingMerc.value && !isSelectingEquipment.value;
});

// Get selectable items (from validElements or choices)
const selectableItems = computed(() => {
  // Get choices from action controller
  const sel = props.actionController.currentSelection.value;
  if (!sel) return [];

  const choices = props.actionController.getChoices(sel);

  // For equipment selections (including deferred 'elements' type), enrich choices with element data
  // For repeating selections, prefer choices (updated by server) over validElements (stale snapshot)
  const equipValidEls = props.actionController.getValidElements(sel) || [];
  const isRepeating = sel.repeat !== undefined;
  const equipmentItems = isRepeating ? choices : (equipValidEls.length > 0 ? equipValidEls : choices);

  if (isSelectingEquipment.value && equipmentItems.length > 0) {
    return equipmentItems.map((c: any) => {
      // Get element ID from various possible locations
      const elementId = c.id || c.value || c.ref?.id;

      // Look up full element data from gameView
      const fullElement = elementId ? findElementById(elementId) : null;
      const elementAttrs = fullElement?.attributes || {};

      // Also check if data is directly on the choice
      const choiceAttrs = c.element?.attributes || {};

      // Merge attributes (fullElement takes precedence)
      const attrs = { ...choiceAttrs, ...elementAttrs };

      // Parse display string as fallback - format is "Name (Type)"
      const displayMatch = (c.display || '').match(/^(.+?)\s*\((\w+)\)$/);
      const parsedName = displayMatch ? displayMatch[1] : c.display;
      const parsedType = displayMatch ? displayMatch[2] : '';

      return {
        ...attrs,
        equipmentId: attrs.equipmentId || c.equipmentId,
        equipmentName: attrs.equipmentName || parsedName,
        equipmentType: attrs.equipmentType || parsedType,
        description: attrs.description || '',
        image: attrs.image,
        combatBonus: attrs.combatBonus || 0,
        initiative: attrs.initiative || 0,
        training: attrs.training || 0,
        armorBonus: attrs.armorBonus || 0,
        targets: attrs.targets || 0,
        negatesArmor: attrs.negatesArmor || false,
        _choiceValue: c.value ?? elementId,
        _choiceDisplay: c.display,
        _parsedName: parsedName,
        _parsedType: parsedType,
      };
    });
  }

  // Combine all MERCs from both squads for lookups
  const allSquadMercs = [
    ...(props.primarySquad?.mercs || []),
    ...(props.secondarySquad?.mercs || []),
  ];

  // Helper to find MERC data from squads by element ID
  const findSquadMerc = (elementId: any) => {
    return allSquadMercs.find((m: any) => {
      const ref = m?.ref;
      return ref === elementId || String(ref) === String(elementId);
    });
  };

  // For element selections, use BoardSmith's automatic element enrichment
  const validEls = props.actionController.getValidElements(sel) || [];
  if (sel.type === 'element' && validEls.length > 0) {
    // Check if this is a MERC selection
    const prompt = (sel.prompt || '').toLowerCase();
    const isMercSelection = prompt.includes('merc') ||
      validEls.some((e: any) => e.mercId || e.element?.attributes?.mercId);

    if (isMercSelection) {
      // Use automatically enriched element data from BoardSmith
      return validEls.map((ve: any) => {
        const elementId = ve.id || ve.ref?.id;
        const attrs = ve.element?.attributes || {};

        // Also check squad data as fallback
        const squadMerc = findSquadMerc(elementId);

        return {
          ...attrs,
          ...(squadMerc || {}),
          mercId: attrs.mercId || squadMerc?.attributes?.mercId || (ve.display || '').toLowerCase(),
          mercName: attrs.mercName || squadMerc?.attributes?.mercName || ve.display,
          image: attrs.image || squadMerc?.attributes?.image,
          _choiceValue: elementId,
          _choiceDisplay: ve.display,
        };
      });
    }

    // For equipment selections, use enriched element data
    const isEquipmentSelection = prompt.includes('equipment') ||
      validEls.some((e: any) =>
        e.equipmentId || e.element?.attributes?.equipmentId || e.element?.attributes?.equipmentName
      );

    if (isEquipmentSelection) {
      return validEls.map((ve: any) => {
        const elementId = ve.id || ve.ref?.id;
        // Use the automatically enriched element data from BoardSmith
        const attrs = ve.element?.attributes || {};

        // Parse display string as fallback - format is "Name (Type)"
        const displayMatch = (ve.display || '').match(/^(.+?)\s*\((\w+)\)$/);
        const parsedName = displayMatch ? displayMatch[1] : ve.display;
        const parsedType = displayMatch ? displayMatch[2] : '';

        return {
          ...attrs,
          equipmentId: attrs.equipmentId,
          equipmentName: attrs.equipmentName || parsedName,
          equipmentType: attrs.equipmentType || parsedType,
          description: attrs.description || '',
          image: attrs.image,
          _choiceValue: elementId,
          _choiceDisplay: ve.display,
          _parsedName: parsedName,
          _parsedType: parsedType,
        };
      });
    }

    // Other element selection - return as-is with choice value
    return validEls.map((elem: any) => ({
      ...elem,
      _choiceValue: elem.id || elem.ref?.id || elem.ref,
      _choiceDisplay: elem.display,
    }));
  }

  // Check if this looks like a MERC selection (prompt contains "merc")
  const prompt = (sel.prompt || '').toLowerCase();
  const isMercPrompt = prompt.includes('merc');

  // For MERC selections from choices, look up MERC data from squad
  if (isMercPrompt && choices.length > 0) {
    return choices.map(c => {
      const displayLower = (c.display || '').toLowerCase();

      // Try to find matching MERC using various ID fields
      const mercMatch = allSquadMercs.find((m: any) => {
        const name = getMercName(m).toLowerCase();
        const ref = m?.ref;  // BoardSmith element ID
        const mercId = getAttr(m, 'mercId', null);

        // Match by ref (element ID), name, or mercId
        return ref === c.value ||
               String(ref) === String(c.value) ||
               name === displayLower ||
               mercId === c.value ||
               String(mercId) === String(c.value);
      });

      if (mercMatch) {
        return {
          ...mercMatch,
          _choiceValue: c.value,
          _choiceDisplay: c.display,
        };
      }

      // No match found - create item with display name for image lookup
      return {
        mercId: displayLower,
        mercName: c.display,
        _choiceValue: c.value,
        _choiceDisplay: c.display,
      };
    });
  }

  // For other selections, just return the choices with metadata
  return choices.map(c => ({
    _choiceValue: c.value,
    _choiceDisplay: c.display,
  }));
});

// Handle action click - start the action flow inline
async function handleAction(actionName: string) {
  if (actionName === 'viewStash') {
    showStashModal.value = true;
    return;
  }

  if (actionName === 'move') {
    // Move action needs squad selection, then destination
    // Store the numeric element ID so we can auto-fill it after squad is selected
    moveDestinationElementId.value = props.sector.id ?? null;
    activeActionFromPanel.value = actionName;
    props.actionController.start(actionName);
    return;
  }

  // Start the action and track it
  activeActionFromPanel.value = actionName;
  props.actionController.start(actionName);
}

// Handle MERC selection
async function selectMerc(item: any) {
  const sel = props.actionController.currentSelection.value;
  if (!sel) return;

  // Use _choiceValue if available (from our enriched items)
  if (item._choiceValue !== undefined) {
    await props.actionController.fill(sel.name, item._choiceValue);
    return;
  }

  // Fallback: try to get element ID from various sources
  const elementId = item.ref || getAttr(item, 'id', null) || getAttr(item, 'mercId', null);
  if (elementId !== null) {
    await props.actionController.fill(sel.name, elementId);
  }
}

// Handle equipment selection
async function selectEquipment(item: any) {
  if (!currentSelection.value) return;

  const selName = currentSelection.value.name;
  const value = item._choiceValue !== undefined ? item._choiceValue : getAttr(item, 'id', null);

  if (value !== null) {
    await props.actionController.fill(selName, value);
  }
}

// Handle choice selection
async function selectChoice(choice: any) {
  if (!currentSelection.value) return;
  await props.actionController.fill(currentSelection.value.name, choice.value);
}

// Check if current selection is optional (can be skipped)
const isCurrentSelectionOptional = computed(() => {
  return currentSelection.value?.optional !== undefined;
});

// Done button - skip the optional selection
async function doneAction() {
  if (!currentSelection.value) return;
  // Skip the optional selection by filling with null
  props.actionController.skip(currentSelection.value.name);
}

// Cancel current action (only for non-optional selections)
function cancelAction() {
  props.actionController.cancel();
  activeActionFromPanel.value = null;
}

// Watch for action completion
watch(() => props.actionController.currentAction.value, (newAction) => {
  if (newAction === null && activeActionFromPanel.value !== null) {
    // Action completed
    activeActionFromPanel.value = null;
    moveDestinationElementId.value = null;
  }
});

// Watch for squad selection in move action to auto-fill destination
watch(() => props.actionController.currentSelection.value, async (sel) => {
  // If we're in a move action started from this panel and we're now at the destination selection
  if (activeActionFromPanel.value === 'move' &&
      moveDestinationElementId.value !== null &&
      sel?.name === 'destination') {
    // Find the sector by numeric element ID
    const validEls = props.actionController.getValidElements(sel) || [];
    const target = validEls.find((e: any) => e.id === moveDestinationElementId.value);

    if (target) {
      // Auto-fill the destination with numeric element ID
      await props.actionController.fill('destination', target.id);
      moveDestinationElementId.value = null;
      emit('close');
    }
  }
}, { flush: 'post' });  // flush: 'post' ensures choices are fetched first

// Get sector type icon
const sectorTypeIcon = computed(() => {
  if (isCity.value) return '🏙️';
  if (isIndustry.value) return '🏭';
  return '🌲';
});
</script>

<template>
  <div class="sector-panel">
    <!-- Header with sector info -->
    <div class="panel-header">
      <div class="sector-info">
        <span class="sector-icon">{{ sectorTypeIcon }}</span>
        <div class="sector-details">
          <span class="sector-name">{{ sector.sectorName || sector.sectorId }}</span>
          <span class="sector-meta">
            {{ sector.sectorType }}
            <span v-if="!effectiveExplored" class="unexplored-badge">Unexplored</span>
            <span v-if="squadInSector" class="location-badge">{{ squadInSector.name }}</span>
            <span v-else-if="hasSquadAdjacent" class="location-badge adjacent">Adjacent</span>
          </span>
        </div>
      </div>
      <button class="close-btn" @click="emit('close')">×</button>
    </div>

    <!-- Main content area -->
    <div class="panel-content">
      <!-- Action Flow: Show selection UI when in action -->
      <template v-if="isInActionFlow && currentSelection">
        <div class="action-flow">
          <div class="action-flow-header">
            <span class="action-flow-title">{{ currentSelection.prompt || 'Select' }}</span>
            <button
              v-if="isCurrentSelectionOptional"
              class="done-btn"
              @click="doneAction"
            >Done</button>
            <button
              v-else
              class="cancel-btn"
              @click="cancelAction"
            >Cancel</button>
          </div>

          <!-- MERC Selection -->
          <div v-if="isSelectingMerc" class="merc-selection">
            <div
              v-for="(item, index) in selectableItems"
              :key="item._choiceValue || index"
              class="selectable-merc"
              @click="selectMerc(item)"
            >
              <div class="merc-portrait large" :style="{ borderColor: getPlayerColor(playerPosition) }">
                <img
                  :src="getMercImagePath(item)"
                  :alt="item._choiceDisplay || getMercName(item)"
                  @error="($event.target as HTMLImageElement).src = '/mercs/unknown.jpg'"
                />
              </div>
              <span class="merc-select-name">{{ item._choiceDisplay || getMercName(item) }}</span>
            </div>
          </div>

          <!-- Equipment Selection (Table) -->
          <div v-else-if="isSelectingEquipment" class="equipment-selection">
            <table class="equipment-table">
              <tbody>
                <tr
                  v-for="(item, index) in selectableItems"
                  :key="getAttr(item, 'id', '') || index"
                  class="equipment-row"
                  @click="selectEquipment(item)"
                >
                  <td class="equip-image-cell">
                    <div class="equip-image-wrapper">
                      <img
                        :src="getEquipmentImagePath(item)"
                        :alt="getEquipmentName(item)"
                        class="equip-image"
                        @error="($event.target as HTMLImageElement).src = '/equipment/unknown.png'"
                      />
                    </div>
                  </td>
                  <td class="equip-name-cell">
                    <div class="equip-name-content">
                      <span class="equip-type-badge" :class="getEquipmentTypeClass(item)">
                        {{ getEquipmentType(item) }}
                      </span>
                      <span class="equip-name">{{ getEquipmentName(item) }}</span>
                    </div>
                  </td>
                  <td class="equip-desc-cell">
                    <div class="equip-stats" v-if="getEquipmentStats(item)">
                      {{ getEquipmentStats(item) }}
                    </div>
                    <span class="equip-description" v-if="getEquipmentDescription(item)">
                      {{ getEquipmentDescription(item) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Choice Selection -->
          <div v-else-if="isSelectingChoice" class="choice-selection">
            <button
              v-for="choice in selectionChoices"
              :key="String(choice.value)"
              class="choice-btn"
              @click="selectChoice(choice)"
            >
              {{ choice.display }}
            </button>
          </div>

          <!-- Fallback: No items to select -->
          <div v-else class="selection-empty">
            <span>No options available</span>
          </div>
        </div>
      </template>

      <!-- Normal View: Squad and Actions -->
      <template v-else>
        <!-- Squad MERCs (if squad is in this sector) -->
        <div v-if="squadInSector && squadInSector.mercs.length > 0" class="squad-section">
          <div class="squad-mercs">
            <div
              v-for="merc in squadInSector.mercs"
              :key="getAttr(merc, 'mercId', '')"
              class="merc-portrait"
              :style="{ borderColor: getPlayerColor(playerPosition) }"
              @click="openMercCard(merc)"
              :title="getMercName(merc)"
            >
              <img :src="getMercImagePath(merc)" :alt="getMercName(merc)" />
            </div>
          </div>
          <!-- Stash indicator next to MERCs -->
          <div
            v-if="stashContents && stashContents.length > 0"
            class="stash-badge clickable"
            @click="showStashModal = true"
            title="Click to view stash"
          >
            <span class="stash-icon">📦</span>
            <span class="stash-count">{{ stashContents.length }}</span>
          </div>
        </div>

        <!-- Forces info -->
        <div class="forces-info">
          <div v-if="sector.dictatorMilitia > 0 || hasDictatorForces" class="force dictator">
            <span class="force-icon">⚫</span>
            <span>{{ sector.dictatorMilitia }} militia</span>
            <span v-if="isBase" class="base-badge">Base</span>
          </div>
          <div v-if="playerMilitia > 0" class="force rebel">
            <span class="force-icon" :style="{ color: getPlayerColor(playerPosition) }">●</span>
            <span>{{ playerMilitia }} militia</span>
          </div>
          <div v-if="isCity" class="facilities">
            <span class="facility">🏥</span>
            <span class="facility">🔫</span>
          </div>
        </div>

        <!-- Actions -->
        <div class="actions-area" v-if="allActions.length > 0">
          <button
            v-for="action in allActions"
            :key="action.name"
            class="action-btn"
            @click="handleAction(action.name)"
          >
            <span class="action-icon">{{ action.icon }}</span>
            <span class="action-label">{{ action.label }}</span>
          </button>
        </div>

        <!-- No actions message -->
        <div v-else class="no-actions">
          <span v-if="!hasSquadInSector && !hasSquadAdjacent">Move closer to interact</span>
          <span v-else>No actions available</span>
        </div>
      </template>
    </div>

    <!-- MERC Details Modal -->
    <DetailModal :show="showMercModal" @close="closeMercModal">
      <MercCard
        v-if="selectedMerc"
        :merc="selectedMerc"
        :player-color="getPlayerColor(playerPosition)"
        :show-equipment="true"
      />
    </DetailModal>

    <!-- Stash Modal -->
    <DetailModal :show="showStashModal" @close="showStashModal = false">
      <div
        class="stash-modal"
        :style="{
          background: UI_COLORS.surface,
          border: `1px solid ${UI_COLORS.border}`,
          borderRadius: '12px',
          padding: '16px',
          minWidth: '400px',
          maxWidth: '600px',
        }"
      >
        <EquipmentTable
          :items="stashContents || []"
          :title="`${sector.sectorName} Stash`"
        />
      </div>
    </DetailModal>
  </div>
</template>

<style scoped>
.sector-panel {
  background: v-bind('UI_COLORS.surface');
  border: 1px solid v-bind('UI_COLORS.border');
  border-radius: 8px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: v-bind('UI_COLORS.surfaceAlt');
  border-bottom: 1px solid v-bind('UI_COLORS.border');
}

.sector-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sector-icon {
  font-size: 1.8rem;
}

.sector-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sector-name {
  font-size: 1.1rem;
  font-weight: bold;
  color: v-bind('UI_COLORS.textPrimary');
}

.sector-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  color: v-bind('UI_COLORS.textSecondary');
}

.unexplored-badge {
  background: v-bind('UI_COLORS.warning');
  color: #000;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: bold;
}

.location-badge {
  background: v-bind('UI_COLORS.accent');
  color: #000;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: bold;
}

.location-badge.adjacent {
  background: v-bind('UI_COLORS.textSecondary');
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: v-bind('UI_COLORS.textSecondary');
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.close-btn:hover {
  color: v-bind('UI_COLORS.textPrimary');
}

.panel-content {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  flex-wrap: wrap;
}

/* Action Flow */
.action-flow {
  width: 100%;
}

.action-flow-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.action-flow-title {
  font-weight: 600;
  color: v-bind('UI_COLORS.textPrimary');
}

.cancel-btn {
  background: none;
  border: 1px solid v-bind('UI_COLORS.border');
  color: v-bind('UI_COLORS.textSecondary');
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.done-btn {
  background: v-bind('UI_COLORS.accent');
  border: none;
  color: #1a1a1a;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
}

.done-btn:hover {
  background: v-bind('UI_COLORS.accentLight');
}

/* MERC Selection */
.merc-selection {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.selectable-merc {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  transition: background 0.2s;
}

.selectable-merc:hover {
  background: rgba(212, 168, 75, 0.2);
}

.merc-portrait.large {
  width: 60px;
  height: 60px;
}

.merc-select-name {
  font-size: 0.85rem;
  color: v-bind('UI_COLORS.textPrimary');
  font-weight: 500;
}

/* Equipment Selection Table */
.equipment-selection {
  width: 100%;
  max-height: 400px;
  overflow-y: auto;
}

.equipment-table {
  width: 100%;
  border-collapse: collapse;
}

.equipment-row {
  cursor: pointer;
  transition: background 0.2s;
  border-bottom: 1px solid v-bind('UI_COLORS.border');
}

.equipment-row:hover {
  background: rgba(212, 168, 75, 0.15);
}

.equipment-row:last-child {
  border-bottom: none;
}

.equip-image-cell {
  width: 60px;
  padding: 8px;
}

.equip-image-wrapper {
  width: 50px;
  height: 50px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.equip-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.equip-name-cell {
  padding: 8px 12px;
  vertical-align: middle;
}

.equip-name-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.equip-type-badge {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 6px;
  border-radius: 3px;
  width: fit-content;
}

.equip-type-badge.type-weapon {
  background: rgba(255, 107, 138, 0.3);
  color: #ff6b8a;
}

.equip-type-badge.type-armor {
  background: rgba(100, 181, 246, 0.3);
  color: #64b5f6;
}

.equip-type-badge.type-accessory {
  background: rgba(129, 212, 168, 0.3);
  color: #81d4a8;
}

.equip-name {
  font-weight: 600;
  color: #fff;
  font-size: 0.95rem;
}

.equip-desc-cell {
  padding: 8px 12px;
  vertical-align: middle;
  max-width: 300px;
}

.equip-stats {
  font-size: 0.85rem;
  font-weight: 600;
  color: v-bind('UI_COLORS.accent');
  margin-bottom: 4px;
}

.equip-description {
  font-size: 0.8rem;
  color: v-bind('UI_COLORS.textSecondary');
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Choice Selection */
.choice-selection {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.choice-btn {
  padding: 8px 16px;
  background: rgba(30, 35, 30, 0.9);
  border: 1px solid v-bind('UI_COLORS.border');
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.choice-btn:hover {
  background: v-bind('UI_COLORS.accent');
  border-color: v-bind('UI_COLORS.accent');
  color: #000;
}

.selection-empty {
  color: v-bind('UI_COLORS.textSecondary');
  font-style: italic;
  padding: 12px;
}

/* Normal View */
.squad-section {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.squad-mercs {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.stash-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: rgba(139, 90, 43, 0.3);
  border: 1px solid rgba(139, 90, 43, 0.6);
  border-radius: 8px;
  font-size: 0.9rem;
  color: #d4a84b;
  font-weight: 600;
}

.stash-badge.clickable {
  cursor: pointer;
  transition: all 0.2s;
}

.stash-badge.clickable:hover {
  background: rgba(139, 90, 43, 0.5);
  border-color: #d4a84b;
  transform: scale(1.05);
}

.stash-badge .stash-icon {
  font-size: 1rem;
}

.stash-badge .stash-count {
  font-weight: bold;
}

.merc-portrait {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 3px solid;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  background: #333;
}

.merc-portrait:hover {
  transform: scale(1.1);
  box-shadow: 0 0 8px rgba(212, 168, 75, 0.8);
}

.merc-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.forces-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.force {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.85rem;
  color: v-bind('UI_COLORS.textPrimary');
}

.force.dictator {
  color: #e74c3c;
}

.force-icon {
  font-size: 0.7rem;
}

.base-badge {
  background: #e74c3c;
  color: #fff;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: bold;
}

.facilities {
  display: flex;
  gap: 4px;
}

.facility {
  font-size: 1rem;
}

.stash-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.85rem;
  color: v-bind('UI_COLORS.textSecondary');
}

.stash-info.clickable {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.stash-info.clickable:hover {
  background: rgba(212, 168, 75, 0.2);
  color: v-bind('UI_COLORS.accent');
}

.stash-info.clickable:hover .stash-count {
  text-decoration: underline;
}

.stash-icon {
  font-size: 0.9rem;
}

.stash-count {
  transition: color 0.2s;
}

.actions-area {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: auto;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(30, 35, 30, 0.9);
  border: 1px solid v-bind('UI_COLORS.border');
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.action-btn:hover {
  background: v-bind('UI_COLORS.accent');
  border-color: v-bind('UI_COLORS.accent');
}

.action-btn:hover .action-label {
  color: #000;
}

.action-icon {
  font-size: 1rem;
}

.action-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #fff;
}

.no-actions {
  color: v-bind('UI_COLORS.textSecondary');
  font-size: 0.85rem;
  font-style: italic;
  margin-left: auto;
}

/* Stash Modal */
.stash-modal {
  min-width: 400px;
  max-width: 600px;
  background: v-bind('UI_COLORS.surface');
  border-radius: 12px;
  padding: 16px;
}
</style>
