<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { UI_COLORS, getPlayerColor } from '../colors';
import type { UseActionControllerReturn } from '@boardsmith/ui';
import DetailModal from './DetailModal.vue';
import MercCard from './MercCard.vue';
import EquipmentTable from './EquipmentTable.vue';
import MilitiaIndicator from './MilitiaIndicator.vue';
import MilitiaCard from './MilitiaCard.vue';
import DrawEquipmentType from './DrawEquipmentType.vue';
import MercIconSmall from './MercIconSmall.vue';

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
  playerColor: string;  // Current player's color name (e.g., 'red', 'blue')
  playerColorMap?: Record<string, string>;  // Maps player position to color name
  allMercsInSector?: Array<{
    mercId: string;
    mercName?: string;
    playerColor: string;
    sectorId: string;
    actionsRemaining?: number;
    damage?: number;
    maxHealth?: number;
    image?: string;
    attributes?: Record<string, any>;
  }>;
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
    equipmentId?: string;
    description?: string;
    combatBonus?: number;
    initiative?: number;
    training?: number;
    armorBonus?: number;
    targets?: number;
    negatesArmor?: boolean;
    image?: string;
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
  // Militia bonuses (from dictator tactics)
  militiaBonuses?: {
    betterWeapons: boolean;  // +1 combat die per militia (hit on 3+)
    veteranMilitia: boolean; // +1 initiative for militia
  };
  // Dictator's lobby-selected color (for base icon styling)
  dictatorColor?: string;
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

// MERC modal state
const showMercModal = ref(false);
const selectedMerc = ref<any>(null);

// Stash modal state
const showStashModal = ref(false);

// Militia modal state
const showMilitiaModal = ref(false);
const selectedMilitia = ref<{ count: number; isDictator: boolean; playerColor?: string } | null>(null);

// Track pending equipment selection for live preview
const pendingEquipmentId = ref<string | number | null>(null);

function openMilitiaCard(count: number, isDictator: boolean, playerColor?: string) {
  selectedMilitia.value = { count, isDictator, playerColor };
  showMilitiaModal.value = true;
}

function closeMilitiaModal() {
  showMilitiaModal.value = false;
  selectedMilitia.value = null;
}

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

// Get the selected merc's player color for modal display
const selectedMercPlayerColor = computed(() => {
  if (!selectedMerc.value) return props.playerColor;
  // Check if merc has playerColor attribute (from allMercsInSector)
  const mercColor = selectedMerc.value.playerColor;
  if (mercColor) return mercColor;
  // If merc is from our squad, use our color
  return props.playerColor;
});

// Get squad name for selected merc
// Returns "Primary" or "Secondary" (without " Squad" suffix) or null for enemies
const selectedMercSquadName = computed(() => {
  if (!selectedMerc.value) return null;
  const mercColor = selectedMerc.value.playerColor;
  // Don't show squad label for enemy mercs (perspective-aware)
  const isEnemy = props.playerColor === 'dictator'
    ? mercColor !== 'dictator'  // Dictator's enemies are rebels
    : mercColor === 'dictator'; // Rebel's enemies are dictator
  if (isEnemy) return null;
  // For my own mercs, determine which squad they're in
  if (mercColor === props.playerColor || !mercColor) {
    const mercId = selectedMerc.value.mercId || getAttr(selectedMerc.value, 'mercId', '');
    // Check if in primary squad
    if (props.primarySquad?.mercs?.some((m: any) =>
      getAttr(m, 'mercId', '') === mercId || m.ref === selectedMerc.value.ref
    )) {
      return 'Primary';
    }
    // Check if in secondary squad
    if (props.secondarySquad?.mercs?.some((m: any) =>
      getAttr(m, 'mercId', '') === mercId || m.ref === selectedMerc.value.ref
    )) {
      return 'Secondary';
    }
  }
  // For ally mercs (other rebel players), we can't determine their squad without more data
  // but we could show a generic indicator if needed
  return null;
});

// Check if we're in an explore action for this sector
// If so, treat the sector as explored even if the prop hasn't updated yet
// Note: Don't require activeActionFromPanel - action may have been started from ActionPanel
const isExplorationInProgress = computed(() => {
  return hasSquadInSector.value &&
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

// Get MERC or Dictator image path
function getMercImagePath(merc: any): string {
  // Check for direct image property (dictators have full URLs)
  const image = getAttr(merc, 'image', '');
  if (image) return image;

  // Check for mercId in various locations
  let mercId = getAttr(merc, 'mercId', '');
  if (!mercId && merc?.attributes?.mercId) {
    mercId = merc.attributes.mercId;
  }

  // Also check for dictatorId
  if (!mercId) {
    mercId = getAttr(merc, 'dictatorId', '');
    if (!mercId && merc?.attributes?.dictatorId) {
      mercId = merc.attributes.dictatorId;
    }
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

// Get MERC or Dictator name
function getMercName(merc: any): string {
  return getAttr(merc, 'mercName', '') ||
         getAttr(merc, 'dictatorName', '') ||
         getAttr(merc, 'mercId', '') ||
         getAttr(merc, 'dictatorId', 'Unknown');
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

// Check if an item is a special action (like "skip") rather than a MERC
function isSpecialAction(item: any): boolean {
  // Convert to string first since _choiceValue may be a number from BoardSmith's validElements
  const value = String(item._choiceValue ?? '').toLowerCase();
  const display = String(item._choiceDisplay ?? '').toLowerCase();
  return value === 'skip' || display.includes('skip') || display.includes('stash');
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

// Style for the dictator base icon using dictator's lobby-selected color
const baseIconStyle = computed(() => {
  const color = props.dictatorColor ? getPlayerColor(props.dictatorColor) : '#666';
  return {
    borderColor: color,
    boxShadow: `0 0 6px 2px ${color}80`, // 80 = 50% opacity in hex
  };
});

// Calculate total rebel militia for this player (legacy - kept for reference)
const playerMilitia = computed(() => {
  return props.sector.rebelMilitia[String(props.playerPosition)] || 0;
});

// All rebel militia entries with color mapping (for multi-team display)
const rebelMilitiaEntries = computed(() => {
  const rm = props.sector.rebelMilitia || {};
  const colorMap = props.playerColorMap || {};
  return Object.entries(rm)
    .filter(([, count]) => count > 0)
    .map(([playerId, count]) => ({
      playerId,
      count,
      color: colorMap[playerId] || 'unknown',
    }));
});

// Group mercs in sector by team type (my team, allies, enemies)
// Perspective-aware: dictator sees rebels as enemies, rebels see dictator as enemy
const myMercsInSector = computed(() => {
  if (!props.allMercsInSector) return [];
  return props.allMercsInSector.filter(m => m.playerColor === props.playerColor);
});

const allyMercsInSector = computed(() => {
  if (!props.allMercsInSector) return [];
  // If I'm dictator, I have no allies (dictator plays solo)
  if (props.playerColor === 'dictator') return [];
  // If I'm rebel, allies are other rebels (not me, not dictator)
  return props.allMercsInSector.filter(m =>
    m.playerColor !== props.playerColor &&
    m.playerColor !== 'dictator'
  );
});

const enemyMercsInSector = computed(() => {
  if (!props.allMercsInSector) return [];
  // If I'm dictator, enemies are all non-dictator mercs
  if (props.playerColor === 'dictator') {
    return props.allMercsInSector.filter(m => m.playerColor !== 'dictator');
  }
  // If I'm rebel, enemies are dictator mercs
  return props.allMercsInSector.filter(m => m.playerColor === 'dictator');
});

// Check if the selected merc can drop equipment (is on my team and action is available)
const canDropEquipmentForSelectedMerc = computed(() => {
  if (!selectedMerc.value) return false;
  // Only my team can drop equipment
  const mercColor = selectedMerc.value.playerColor;
  if (mercColor && mercColor !== props.playerColor) return false;
  // Check if dropEquipment action is available
  return props.availableActions.includes('dropEquipment');
});

// Handle drop equipment from MercCard
async function handleDropEquipment(mercId: number, equipmentId: number) {
  console.log('[SectorPanel] handleDropEquipment:', { mercId, equipmentId });

  // Close the modal first
  closeMercModal();

  // Execute the dropEquipment action directly with pre-selected merc and equipment
  const args = {
    actingMerc: mercId,
    equipment: equipmentId,
  };
  console.log('[SectorPanel] Calling actionController.execute("dropEquipment",', args, ')');
  await props.actionController.execute('dropEquipment', args);
}

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
    actions.push({ name: 'dropEquipment', label: 'Unequip', icon: '📤' });
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

// Check if we're currently in an action flow that this sector should show UI for
// This includes actions started from the ActionPanel that involve this sector
const isInActionFlow = computed(() => {
  const currentAction = props.actionController.currentAction.value;
  if (!currentAction) return false;

  // Sector-relevant actions - show UI regardless of where action was started
  // These are actions that require selections from MERCs/equipment in a sector
  const sectorRelevantActions = [
    'explore', 'collectEquipment', 'armsDealer', 'hospital', 'train', 'reEquip',
    'reEquipContinue', // Chained from reEquip
    'dropEquipment', 'takeFromStash', 'move', 'docHeal', 'squidheadDisarm', 'squidheadArm',
  ];

  // Check if action args reference this sector (e.g., collectEquipment from dictator explore)
  // This handles cases where the acting unit (like dictator) isn't in a squad
  const args = props.actionController.currentArgs.value;
  if (args && sectorRelevantActions.includes(currentAction)) {
    // sectorId is numeric element ID (display names are in separate display option)
    const sectorArg = args.sectorId;
    let actionSectorId: number | undefined;
    if (typeof sectorArg === 'number') {
      actionSectorId = sectorArg;
    } else if (sectorArg && typeof sectorArg === 'object' && 'id' in sectorArg) {
      actionSectorId = (sectorArg as { id: number }).id;
    }
    // If action's sectorId matches this sector, show UI here
    if (actionSectorId !== undefined && props.sector.id === actionSectorId) {
      return true;
    }
  }

  // Must have a squad in this sector for other checks
  if (!hasSquadInSector.value) return false;

  // Actions that are explicitly started from this panel
  if (activeActionFromPanel.value !== null && currentAction === activeActionFromPanel.value) {
    return true;
  }

  if (sectorRelevantActions.includes(currentAction)) {
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

// Get valid elements for element selection - use reactive computed from actionController
const validElements = computed(() => {
  if (!currentSelection.value) return [];
  // Use the reactive validElements computed - auto-updates when choices load
  return props.actionController.validElements.value || [];
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

// Check if current selection is for MERC (or unit - includes dictator card)
const isSelectingMerc = computed(() => {
  const sel = props.actionController.currentSelection.value;
  if (!sel) return false;

  // Check selection name/prompt for MERC-related keywords
  const selName = (sel.name || '').toLowerCase();
  const selPrompt = (sel.prompt || '').toLowerCase();

  // If prompt or name mentions MERC or unit, it's a MERC selection
  // "unit" is used for actions that can select both MERCs and DictatorCard
  if (selName.includes('merc') || selPrompt.includes('merc') ||
      selName.includes('unit') || selPrompt.includes('unit')) {
    return true;
  }

  // Check if element selection with MERC elements (use reactive computed)
  const mercValidEls = props.actionController.validElements.value || [];
  if (sel.type === 'element' && mercValidEls.length > 0) {
    return mercValidEls.some((e: any) => e.mercId || e.element?.attributes?.mercId);
  }

  return false;
});

// Check if current selection is for equipment
const isSelectingEquipment = computed(() => {
  const sel = props.actionController.currentSelection.value;
  if (!sel) return false;

  // If this is an equipment TYPE selection (Weapon/Armor/Accessory), not equipment items
  // This is used for choosing which deck to draw from, not selecting actual equipment
  const selName = (sel.name || '').toLowerCase();
  if (selName === 'equipmenttype') {
    return false;
  }

  const validEls = props.actionController.validElements.value || [];
  const choices = props.actionController.getChoices(sel) || [];

  // Check selection name for equipment
  if (selName === 'equipment') {
    return true;
  }

  // Check prompt for equipment keywords
  // But exclude prompts that are asking for equipment TYPE choice (deck selection)
  const prompt = (sel.prompt || '').toLowerCase();
  if (prompt.includes('type of equipment') || prompt.includes('equipment type')) {
    return false; // This is a type selection, not equipment selection
  }
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

// Get the MERC that is currently selecting equipment (for preview card)
const actingMercForEquipment = computed(() => {
  if (!isSelectingEquipment.value) return null;

  const args = props.actionController.currentArgs.value;
  if (!args) return null;

  // Get mercId from args - different actions use different arg names
  // collectEquipment/reEquipContinue use mercId (numeric element ID, display names in separate display option)
  // reEquip uses actingMerc (from first selection)
  let mercId: number | undefined;

  const mercArg = args.mercId ?? args.actingMerc;
  if (typeof mercArg === 'number') {
    mercId = mercArg;
  } else if (mercArg && typeof mercArg === 'object') {
    mercId = (mercArg as { id?: number; ref?: number }).id ?? (mercArg as { id?: number; ref?: number }).ref;
  }

  if (mercId === undefined) return null;

  // Look up full MERC data from gameView
  const fullMerc = findElementById(mercId);
  if (!fullMerc) return null;

  // Also check squads for additional data
  const allSquadMercs = [
    ...(props.primarySquad?.mercs || []),
    ...(props.secondarySquad?.mercs || []),
  ];

  const squadMerc = allSquadMercs.find((m: any) =>
    m.ref === mercId || m.id === mercId
  );

  // Merge data (prefer fullMerc from gameView, add attributes)
  return {
    ...squadMerc,
    ...fullMerc,
    ...(fullMerc?.attributes || {}),
  };
});

// Create a MERC object with pending equipment previewed in slots
const mercWithPendingEquipment = computed(() => {
  const baseMerc = actingMercForEquipment.value;
  if (!baseMerc) return null;

  // If no pending equipment, return base merc as-is
  if (!pendingEquipmentId.value) return baseMerc;

  // Find the pending equipment from selectableItems
  const pendingEquip = selectableItems.value.find(
    (item: any) => (item._choiceValue ?? item.id) === pendingEquipmentId.value
  );

  if (!pendingEquip) return baseMerc;

  // Determine which slot this equipment would go into
  const equipType = getAttr(pendingEquip, 'equipmentType', '');

  // Create a copy with the pending equipment in the appropriate slot
  const previewMerc = { ...baseMerc };
  const previewAttrs = { ...(baseMerc.attributes || {}) };

  // Create equipment slot data object
  const slotData = {
    equipmentId: getAttr(pendingEquip, 'equipmentId', ''),
    equipmentName: getEquipmentName(pendingEquip),
    equipmentType: equipType,
    combatBonus: getAttr(pendingEquip, 'combatBonus', 0),
    initiative: getAttr(pendingEquip, 'initiative', 0),
    training: getAttr(pendingEquip, 'training', 0),
    armorBonus: getAttr(pendingEquip, 'armorBonus', 0),
    targets: getAttr(pendingEquip, 'targets', 0),
    negatesArmor: getAttr(pendingEquip, 'negatesArmor', false),
    image: getAttr(pendingEquip, 'image', ''),
  };

  // Set the appropriate slot based on equipment type
  if (equipType === 'Weapon') {
    previewAttrs.weaponSlotData = slotData;
  } else if (equipType === 'Armor') {
    previewAttrs.armorSlotData = slotData;
  } else if (equipType === 'Accessory') {
    previewAttrs.accessorySlotData = slotData;
  }

  previewMerc.attributes = previewAttrs;
  return previewMerc;
});

// Get the type of slot being previewed (for highlighting in MercCard)
const pendingSlotType = computed((): 'Weapon' | 'Armor' | 'Accessory' | null => {
  if (!pendingEquipmentId.value || !isSelectingEquipment.value) return null;

  const pendingEquip = selectableItems.value.find(
    (item: any) => (item._choiceValue ?? item.id) === pendingEquipmentId.value
  );

  if (!pendingEquip) return null;

  const equipType = getAttr(pendingEquip, 'equipmentType', '');
  if (equipType === 'Weapon' || equipType === 'Armor' || equipType === 'Accessory') {
    return equipType as 'Weapon' | 'Armor' | 'Accessory';
  }
  return null;
});

// Check if current selection is for equipment type (Weapon/Armor/Accessory)
const isSelectingEquipmentType = computed(() => {
  const sel = props.actionController.currentSelection.value;
  if (!sel) return false;
  return sel.name === 'equipmentType';
});

// Get equipment type choices normalized to {value, label} format
const equipmentTypeChoices = computed(() => {
  if (!isSelectingEquipmentType.value) return [];
  const sel = props.actionController.currentSelection.value;
  if (!sel) return [];
  const choices = props.actionController.getChoices(sel) || [];
  return choices.map((choice: any) => {
    if (typeof choice === 'string') {
      return { value: choice, label: choice };
    }
    return { value: choice.value || choice, label: choice.display || choice.value || String(choice) };
  });
});

// Check if it's a generic choice selection (not MERC, equipment, or equipment type)
const isSelectingChoice = computed(() => {
  if (!currentSelection.value) return false;
  // Skip if it's an equipment type selection (handled specially)
  if (isSelectingEquipmentType.value) return false;
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
  const equipValidEls = props.actionController.validElements.value || [];
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

  // For element selections, use BoardSmith's reactive validElements computed
  const validEls = props.actionController.validElements.value || [];
  const prompt = (sel.prompt || '').toLowerCase();
  const selName = (sel.name || '').toLowerCase();

  // Check if this is a MERC selection (by name or prompt)
  // Also check for 'unit' which is used for selections that can include both MERCs and DictatorCard
  const isMercSelection = selName.includes('merc') || prompt.includes('merc') ||
    selName.includes('unit') || prompt.includes('unit') ||
    (validEls.length > 0 && validEls.some((e: any) => e.mercId || e.element?.attributes?.mercId));

  if (sel.type === 'element' && validEls.length > 0) {
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


  // For MERC selections from choices, look up MERC data from squad
  if (isMercSelection && choices.length > 0) {
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
    // Move action: use prefill API to auto-fill destination after squad selection
    activeActionFromPanel.value = actionName;
    props.actionController.start(actionName, {
      prefill: { destination: props.sector.id }
    });
    // Close panel since destination will be auto-filled
    emit('close');
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

// Handle equipment type selection
async function selectEquipmentType(value: string) {
  await props.actionController.fill('equipmentType', value);
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
  }
});

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
            <!-- Actual MERC portraits -->
            <div
              v-for="(item, index) in selectableItems.filter(i => !isSpecialAction(i))"
              :key="item._choiceValue || index"
              class="selectable-merc"
              @click="selectMerc(item)"
            >
              <MercIconSmall
                :image="getMercImagePath(item)"
                :alt="item._choiceDisplay || getMercName(item)"
                :player-color="playerColor"
                :size="60"
              />
              <span class="merc-select-name">{{ item._choiceDisplay || getMercName(item) }}</span>
            </div>
            <!-- Special actions (skip, add to stash) as buttons -->
            <button
              v-for="(item, index) in selectableItems.filter(i => isSpecialAction(i))"
              :key="'special-' + (item._choiceValue || index)"
              class="skip-action-btn"
              @click="selectMerc(item)"
            >
              {{ item._choiceDisplay || 'Skip' }}
            </button>
          </div>

          <!-- Equipment Selection (Table) with MERC Preview -->
          <div v-else-if="isSelectingEquipment" class="equipment-selection-layout">
            <!-- Equipment List (Left) -->
            <div class="equipment-list-section">
              <table class="equipment-table">
                <tbody>
                  <tr
                    v-for="(item, index) in selectableItems"
                    :key="getAttr(item, 'id', '') || index"
                    class="equipment-row"
                    :class="{ 'is-hovered': pendingEquipmentId === (item._choiceValue ?? item.id) }"
                    @click="selectEquipment(item)"
                    @mouseenter="pendingEquipmentId = item._choiceValue ?? item.id"
                    @mouseleave="pendingEquipmentId = null"
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

            <!-- MERC Card Preview (Right) -->
            <div class="merc-preview-section" v-if="actingMercForEquipment">
              <div class="merc-preview-header">Equipping:</div>
              <MercCard
                :merc="mercWithPendingEquipment"
                :player-color="playerColor"
                :show-equipment="true"
                :pending-slot="pendingSlotType"
              />
            </div>
          </div>

          <!-- Equipment Type Selection (Weapon/Armor/Accessory) -->
          <DrawEquipmentType
            v-else-if="isSelectingEquipmentType"
            :choices="equipmentTypeChoices"
            @select="selectEquipmentType"
          />

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
        <!-- My Squad MERCs (if squad is in this sector) -->
        <div v-if="squadInSector && squadInSector.mercs.length > 0" class="squad-section">
          <div class="squad-header-label">My Squad</div>
          <div class="squad-mercs">
            <!-- Dictator base icon -->
            <div v-if="isBase" class="base-icon-portrait" :style="baseIconStyle" title="Dictator's Base">🏠</div>
            <MercIconSmall
              v-for="merc in squadInSector.mercs"
              :key="getAttr(merc, 'mercId', '')"
              :image="getMercImagePath(merc)"
              :alt="getMercName(merc)"
              :player-color="playerColor"
              :size="40"
              clickable
              @click="openMercCard(merc)"
            />
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

        <!-- My MERCs when not in squad location (e.g., dictator's base) -->
        <div v-else-if="myMercsInSector.length > 0" class="squad-section">
          <div class="squad-header-label">My Forces</div>
          <div class="squad-mercs">
            <!-- Dictator base icon -->
            <div v-if="isBase" class="base-icon-portrait" :style="baseIconStyle" title="Dictator's Base">🏠</div>
            <MercIconSmall
              v-for="merc in myMercsInSector"
              :key="merc.mercId"
              :image="getMercImagePath(merc)"
              :alt="getMercName(merc)"
              :player-color="playerColor"
              :size="40"
              clickable
              @click="openMercCard(merc)"
            />
          </div>
        </div>

        <!-- Ally MERCs (other rebel players) -->
        <div v-if="allyMercsInSector.length > 0" class="squad-section ally-section">
          <div class="squad-header-label">Allies</div>
          <div class="squad-mercs">
            <MercIconSmall
              v-for="merc in allyMercsInSector"
              :key="merc.mercId"
              :image="getMercImagePath(merc)"
              :alt="getMercName(merc)"
              :player-color="merc.playerColor"
              :size="40"
              clickable
              @click="openMercCard(merc)"
            />
          </div>
        </div>

        <!-- Enemy MERCs (dictator) -->
        <div v-if="enemyMercsInSector.length > 0" class="squad-section enemy-section">
          <div class="squad-header-label enemy-label">Enemies</div>
          <div class="squad-mercs">
            <MercIconSmall
              v-for="merc in enemyMercsInSector"
              :key="merc.mercId"
              :image="getMercImagePath(merc)"
              :alt="getMercName(merc)"
              player-color="enemy"
              :size="40"
              clickable
              @click="openMercCard(merc)"
            />
          </div>
        </div>

        <!-- Forces info -->
        <div class="forces-info">
          <!-- Militia indicators (clickable to show details) -->
          <div class="militia-area">
            <div
              v-if="sector.dictatorMilitia > 0"
              class="militia-clickable"
              @click="openMilitiaCard(sector.dictatorMilitia, true)"
              title="Click for militia details"
            >
              <MilitiaIndicator
                :count="sector.dictatorMilitia"
                :is-dictator="true"
              />
            </div>
            <div
              v-for="entry in rebelMilitiaEntries"
              :key="entry.playerId"
              class="militia-clickable"
              @click="openMilitiaCard(entry.count, false, entry.color)"
              title="Click for militia details"
            >
              <MilitiaIndicator
                :count="entry.count"
                :player-color="entry.color"
              />
            </div>
          </div>
          <span v-if="isBase" class="base-badge">Base</span>
          <div v-if="isCity" class="facilities">
            <span class="facility" title="Hospital">🏥</span>
            <span class="facility" title="Arms Dealer">🔫</span>
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
        :player-color="selectedMercPlayerColor"
        :squad-name="selectedMercSquadName"
        :show-equipment="true"
        :can-drop-equipment="canDropEquipmentForSelectedMerc"
        @drop-equipment="handleDropEquipment"
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

    <!-- Militia Modal -->
    <DetailModal :show="showMilitiaModal" @close="closeMilitiaModal">
      <MilitiaCard
        v-if="selectedMilitia"
        :count="selectedMilitia.count"
        :is-dictator="selectedMilitia.isDictator"
        :player-color="selectedMilitia.playerColor"
        :better-weapons="selectedMilitia.isDictator && militiaBonuses?.betterWeapons"
        :veteran-militia="selectedMilitia.isDictator && militiaBonuses?.veteranMilitia"
      />
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

/* Equipment Selection with MERC Preview Layout */
.equipment-selection-layout {
  display: flex;
  gap: 16px;
  width: 100%;
}

.equipment-list-section {
  flex: 1;
  max-height: 400px;
  overflow-y: auto;
}

.merc-preview-section {
  flex: 0 0 280px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.merc-preview-header {
  font-size: 0.85rem;
  font-weight: 600;
  color: v-bind('UI_COLORS.accent');
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Highlight hovered equipment row */
.equipment-row.is-hovered {
  background: rgba(212, 168, 75, 0.25);
}

/* Responsive: Stack vertically on narrow screens */
@media (max-width: 700px) {
  .equipment-selection-layout {
    flex-direction: column;
  }

  .merc-preview-section {
    flex: 0 0 auto;
  }
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

.skip-action-btn {
  margin-top: 12px;
  padding: 10px 20px;
  background: rgba(40, 40, 40, 0.9);
  border: 1px solid v-bind('UI_COLORS.border');
  border-radius: 8px;
  color: v-bind('UI_COLORS.textSecondary');
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.skip-action-btn:hover {
  background: rgba(60, 60, 60, 0.9);
  color: #fff;
  border-color: v-bind('UI_COLORS.accent');
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

.squad-header-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: v-bind('UI_COLORS.textSecondary');
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.squad-section.ally-section {
  border-left: 2px solid rgba(100, 181, 246, 0.5);
  padding-left: 12px;
  margin-left: 4px;
}

.squad-section.enemy-section {
  border-left: 2px solid rgba(231, 76, 60, 0.5);
  padding-left: 12px;
  margin-left: 4px;
}

.squad-header-label.enemy-label {
  background: rgba(231, 76, 60, 0.2);
  color: #e74c3c;
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

.base-icon-portrait {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 3px solid; /* Color set via inline style */
  background: rgba(50, 30, 10, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  /* box-shadow set via inline style using dictator's color */
  flex-shrink: 0;
}

.forces-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.militia-area {
  display: flex;
  align-items: center;
  gap: 6px;
}

.militia-clickable {
  cursor: pointer;
  transition: transform 0.2s, filter 0.2s;
  border-radius: 6px;
}

.militia-clickable:hover {
  transform: scale(1.1);
  filter: brightness(1.2);
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
