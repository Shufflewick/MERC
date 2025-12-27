<script setup lang="ts">
import { computed, ref, watch, inject, reactive } from 'vue';
import { useBoardInteraction } from '@boardsmith/ui';
import MapGrid from './MapGrid.vue';
import SquadPanel from './SquadPanel.vue';
import MercCard from './MercCard.vue';
import { UI_COLORS, getPlayerColor } from '../colors';

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

// State for fetched deferred choices
const fetchedDeferredChoices = reactive<Record<string, Array<{ value: unknown; display: string }>>>({});
const deferredChoicesLoading = ref(false);

// Debug: log available actions when they change

// Get board interaction for checking selectable elements
const boardInteraction = useBoardInteraction();

const props = defineProps<{
  gameView: any;
  playerPosition: number;
  isMyTurn: boolean;
  availableActions: string[];
  action: (name: string, args: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  actionArgs: Record<string, unknown>;
  executeAction: (name: string) => Promise<void>;
  setBoardPrompt: (prompt: string | null) => void;
  startAction: (name: string, initialArgs?: Record<string, unknown>) => void;
  state?: any; // Flow state from GameShell
}>();

// Helper to normalize class name (strips underscore prefix)
function normalizeClassName(className: string): string {
  return className?.replace(/^_/, '') || '';
}

// Helper to find elements by className in gameView tree
function findByClassName(className: string, root?: any): any {
  if (!root) root = props.gameView;
  if (!root) return null;

  // Check className (handle underscore prefix) or ref that contains the class name
  const rootClass = normalizeClassName(root.className);
  if (rootClass === className || root.className === className || root.ref?.includes(className.toLowerCase())) {
    return root;
  }

  if (root.children) {
    for (const child of root.children) {
      const found = findByClassName(className, child);
      if (found) return found;
    }
  }
  return null;
}

// Find all elements matching a class name
function findAllByClassName(className: string, root?: any): any[] {
  if (!root) root = props.gameView;
  const results: any[] = [];

  function search(node: any) {
    if (!node) return;
    const nodeClass = normalizeClassName(node.className);
    if (nodeClass === className || node.className === className || node.ref?.includes(className.toLowerCase())) {
      results.push(node);
    }
    if (node.children) {
      for (const child of node.children) {
        search(child);
      }
    }
  }

  search(root);
  return results;
}

// Find element by ref (id)
function findByRef(ref: string, root?: any): any {
  if (!root) root = props.gameView;
  if (!root) return null;

  if (root.ref === ref) return root;

  if (root.children) {
    for (const child of root.children) {
      const found = findByRef(ref, child);
      if (found) return found;
    }
  }
  return null;
}

// Helper to get property from node (checks attributes first, then root)
function getAttr<T>(node: any, key: string, defaultVal: T): T {
  if (node?.attributes && node.attributes[key] !== undefined) return node.attributes[key];
  if (node && node[key] !== undefined) return node[key];
  return defaultVal;
}

// Helper to check if a MERC is dead (health <= 0 OR isDead flag)
// Note: isDead is a getter that may not serialize, so we check health directly
function isMercDead(merc: any): boolean {
  const isDead = getAttr(merc, 'isDead', false);
  if (isDead) return true;

  // Check health directly since isDead getter might not serialize
  const health = getAttr(merc, 'health', -1);
  if (health >= 0 && health <= 0) return true;

  // Check damage vs maxHealth
  const damage = getAttr(merc, 'damage', 0);
  const maxHealth = getAttr(merc, 'maxHealth', 3);
  if (damage >= maxHealth) return true;

  return false;
}

// Extract map sectors from gameView
const sectors = computed(() => {
  // Try to find GameMap element
  const map = findByClassName('GameMap') || findByRef('game-map');
  if (!map?.children) {
    // Fallback: look for Sector elements directly
    const sectorElements = findAllByClassName('Sector');
    if (sectorElements.length > 0) {
      return sectorElements.map((s: any) => ({
        sectorId: s.ref || getAttr(s, 'sectorId', '') || `sector-${getAttr(s, 'row', 0)}-${getAttr(s, 'col', 0)}`,
        sectorName: getAttr(s, 'sectorName', ''),
        sectorType: getAttr(s, 'sectorType', 'Wilderness'),
        value: getAttr(s, 'value', 0),
        row: getAttr(s, 'row', 0),
        col: getAttr(s, 'col', 0),
        image: getAttr(s, 'image', undefined),
        explored: getAttr(s, 'explored', false),
        dictatorMilitia: getAttr(s, 'dictatorMilitia', 0),
        rebelMilitia: getAttr(s, 'rebelMilitia', {}),
      }));
    }
    return [];
  }

  return map.children
    .filter((c: any) => c.className === 'Sector' || getAttr(c, 'sectorId', ''))
    .map((c: any) => ({
      sectorId: c.ref || getAttr(c, 'sectorId', '') || `sector-${getAttr(c, 'row', 0)}-${getAttr(c, 'col', 0)}`,
      sectorName: getAttr(c, 'sectorName', ''),
      sectorType: getAttr(c, 'sectorType', 'Wilderness'),
      value: getAttr(c, 'value', 0),
      row: getAttr(c, 'row', 0),
      col: getAttr(c, 'col', 0),
      image: getAttr(c, 'image', undefined),
      explored: getAttr(c, 'explored', false),
      dictatorMilitia: getAttr(c, 'dictatorMilitia', 0),
      rebelMilitia: getAttr(c, 'rebelMilitia', {}),
    }));
});

// Extract all players
const players = computed(() => {
  // Try various player element names
  const rebelPlayers = findAllByClassName('RebelPlayer');
  const dictatorPlayers = findAllByClassName('DictatorPlayer');
  const playerAreas = findAllByClassName('PlayerArea');

  const all = [...rebelPlayers, ...dictatorPlayers, ...playerAreas];

  if (all.length === 0) {
    // Fallback: create player entries from flowState if available
    // For now, just create a basic entry for current player
    return [{
      position: props.playerPosition,
      playerColor: 'red', // Default color
      isDictator: false,
    }];
  }

  return all.map((p: any, index: number) => ({
    position: getAttr(p, 'position', index),
    playerColor: getAttr(p, 'playerColor', '') || getAttr(p, 'color', '') || ['red', 'blue', 'green', 'yellow'][index] || 'red',
    isDictator: normalizeClassName(p.className) === 'DictatorPlayer',
  }));
});

// Current player's color
const currentPlayerColor = computed(() => {
  const player = players.value.find((p) => p.position === props.playerPosition);
  return player?.playerColor || 'red';
});

// MERC-rwdv: Check if current player is the dictator
// Players aren't in game view tree, so check if this player has rebel squads or dictator squad
const currentPlayerIsDictator = computed(() => {
  // If player has rebel squads (primary/secondary), they're a rebel
  const squads = findAllByClassName('Squad');
  const hasRebelSquad = squads.some((s: any) => {
    const name = getAttr(s, 'name', '') || s.ref || '';
    // Rebel squads are named "squad-{position}-primary" or "squad-{position}-secondary"
    return name.includes(`squad-${props.playerPosition}-`);
  });

  if (hasRebelSquad) return false;

  // If no rebel squads but dictator squad exists, assume this is the dictator
  const hasDictatorSquad = squads.some((s: any) => {
    const name = getAttr(s, 'name', '') || s.ref || '';
    return name.includes('dictator');
  });

  return hasDictatorSquad;
});

// Extract all MERCs with their locations
const allMercs = computed(() => {
  const mercs: any[] = [];

  // Find rebel squads
  const squads = findAllByClassName('Squad');
  for (const squad of squads) {
    const sectorId = getAttr(squad, 'sectorId', '');

    // Get player color from squad's player position
    const playerPos = getSquadPlayerPosition(squad);
    const squadName = getAttr(squad, 'name', '') || squad.ref || '';
    const isDictatorSquad = squadName.includes('dictator');

    let playerColor = '';
    if (isDictatorSquad) {
      playerColor = 'dictator';
    } else if (playerPos >= 0) {
      const player = players.value.find(p => p.position === playerPos);
      playerColor = player?.playerColor || ['red', 'blue', 'green', 'yellow', 'purple', 'orange'][playerPos] || 'red';
    }

    if (squad.children) {
      for (const merc of squad.children) {
        const mercId = getAttr(merc, 'mercId', '');
        // Skip dead MERCs
        if (isMercDead(merc)) continue;

        if (mercId || merc.className === 'MercCard') {
          mercs.push({
            ...merc,
            mercId: mercId || merc.ref,
            sectorId,
            playerColor,
          });
        }
      }
    }
  }

  // Find dictator MERCs
  const dictatorMercs = findAllByClassName('MercCard');
  for (const merc of dictatorMercs) {
    // Skip dead MERCs
    if (isMercDead(merc)) continue;

    const mercId = getAttr(merc, 'mercId', '') || merc.ref;
    const sectorId = getAttr(merc, 'sectorId', '');
    if (mercId && sectorId) {
      const exists = mercs.some((m) => m.mercId === mercId);
      if (!exists) {
        mercs.push({
          ...merc,
          mercId,
          playerColor: 'dictator',
        });
      }
    }
  }

  return mercs;
});

// Helper to convert player position to color name
function positionToColor(position: string | number): string {
  const pos = typeof position === 'string' ? parseInt(position, 10) : position;
  const player = players.value.find(p => p.position === pos);
  if (player?.playerColor) return player.playerColor;
  // Fallback to default colors by position
  const defaultColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
  return defaultColors[pos] || 'unknown';
}

// Build control map
const controlMap = computed(() => {
  const map: Record<string, string | undefined> = {};

  for (const sector of sectors.value) {
    let dictatorUnits = sector.dictatorMilitia;
    const rebelUnits: Record<string, number> = {};

    const dictatorMercsInSector = allMercs.value.filter(
      (m) => m.sectorId === sector.sectorId && m.playerColor === 'dictator'
    );
    dictatorUnits += dictatorMercsInSector.length;

    // Militia uses player position as key - convert to color name
    for (const [positionKey, count] of Object.entries(sector.rebelMilitia || {})) {
      const color = positionToColor(positionKey);
      rebelUnits[color] = (rebelUnits[color] || 0) + (count as number);
    }

    const rebelMercsInSector = allMercs.value.filter(
      (m) => m.sectorId === sector.sectorId && m.playerColor !== 'dictator'
    );
    for (const merc of rebelMercsInSector) {
      const color = merc.playerColor || 'unknown';
      rebelUnits[color] = (rebelUnits[color] || 0) + 1;
    }

    let maxUnits = 0;
    let controller: string | undefined;

    if (dictatorUnits > 0) {
      maxUnits = dictatorUnits;
      controller = 'dictator';
    }

    for (const [color, units] of Object.entries(rebelUnits)) {
      if (units > maxUnits) {
        maxUnits = units;
        controller = color;
      }
    }

    if (maxUnits > 0) {
      map[sector.sectorId] = controller;
    }
  }

  return map;
});

// Helper to get player position from squad
function getSquadPlayerPosition(squad: any): number {
  // Try various ways to get player position
  const player = getAttr(squad, 'player', null);
  if (player?.position !== undefined) return player.position;
  if (squad.player?.position !== undefined) return squad.player.position;
  const playerPos = getAttr(squad, 'playerPosition', undefined);
  if (playerPos !== undefined) return playerPos;
  // Try checking ref for player number
  const ref = squad.ref || '';
  let match = ref.match(/player-?(\d+)/i);
  if (match) return parseInt(match[1], 10);
  // Try parsing from name attribute like "squad-0-primary"
  const name = getAttr(squad, 'name', '');
  match = name.match(/squad-(\d+)/i);
  if (match) return parseInt(match[1], 10);
  return -1;
}

// Get current player's squads
const primarySquad = computed(() => {
  const squads = findAllByClassName('Squad');
  const squad = squads.find((s: any) => {
    const playerPos = getSquadPlayerPosition(s);
    const isPrimary = getAttr(s, 'isPrimary', false);
    return playerPos === props.playerPosition && isPrimary === true;
  });

  if (!squad) return undefined;

  const sectorId = getAttr(squad, 'sectorId', '');
  const sector = sectors.value.find((s) => s.sectorId === sectorId);

  return {
    squadId: squad.ref || 'primary',
    isPrimary: true,
    sectorId,
    sectorName: sector?.sectorName,
    mercs: (squad.children || [])
      .filter((c: any) => {
        // Skip dead MERCs
        if (isMercDead(c)) return false;
        return getAttr(c, 'mercId', '') || normalizeClassName(c.className) === 'MercCard';
      })
      .map((c: any) => c),
  };
});

const secondarySquad = computed(() => {
  const squads = findAllByClassName('Squad');
  const squad = squads.find((s: any) => {
    const playerPos = getSquadPlayerPosition(s);
    const isPrimary = getAttr(s, 'isPrimary', true); // Default true so we exclude unless explicitly false
    return playerPos === props.playerPosition && isPrimary === false;
  });

  if (!squad) return undefined;

  const sectorId = getAttr(squad, 'sectorId', '');
  const sector = sectors.value.find((s) => s.sectorId === sectorId);

  return {
    squadId: squad.ref || 'secondary',
    isPrimary: false,
    sectorId,
    sectorName: sector?.sectorName,
    mercs: (squad.children || [])
      .filter((c: any) => {
        // Skip dead MERCs
        if (isMercDead(c)) return false;
        return getAttr(c, 'mercId', '') || normalizeClassName(c.className) === 'MercCard';
      })
      .map((c: any) => c),
  };
});

// MERC-rwdv: Get dictator's merc squad
const dictatorSquad = computed(() => {
  if (!currentPlayerIsDictator.value) return undefined;

  const squads = findAllByClassName('Squad');
  // Find squad named "squad-dictator-mercs"
  const squad = squads.find((s: any) => {
    const name = getAttr(s, 'name', '') || s.ref || '';
    return name.includes('dictator');
  });

  if (!squad) return undefined;

  const sectorId = getAttr(squad, 'sectorId', '');
  const sector = sectors.value.find((s) => s.sectorId === sectorId);

  return {
    squadId: squad.ref || 'dictator-squad',
    isPrimary: true,
    sectorId,
    sectorName: sector?.sectorName,
    mercs: (squad.children || [])
      .filter((c: any) => {
        // Skip dead MERCs
        if (isMercDead(c)) return false;
        return getAttr(c, 'mercId', '') || normalizeClassName(c.className) === 'MercCard';
      })
      .map((c: any) => c),
  };
});

// ============================================================================
// ACTION HANDLING - Show appropriate UI based on available actions
// ============================================================================

// Get action choices from actionArgs
const actionChoices = computed(() => {
  return props.actionArgs || {};
});

// Check if we're in MERC hiring mode (Day 1)
const isHiringMercs = computed(() => {
  return props.availableActions.includes('hireFirstMerc') ||
         props.availableActions.includes('hireSecondMerc') ||
         props.availableActions.includes('hireThirdMerc');
});

// Check if we're in landing placement mode
const isPlacingLanding = computed(() => {
  return props.availableActions.includes('placeLanding');
});

// Get landing zone action metadata
const landingZoneMetadata = computed(() => {
  if (!isPlacingLanding.value) return null;
  return props.state?.state?.actionMetadata?.placeLanding;
});

// Check if we're equipping starting equipment
const isEquipping = computed(() => {
  return props.availableActions.includes('equipStarting');
});

// Check if current selection is for equipment type (not MERC selection)
const isSelectingEquipmentType = computed(() => {
  const selection = currentSelection.value;
  return selection?.name === 'equipmentType';
});

// Get equipment type choices when selecting equipment
// Normalize to array of { value, label } objects
const equipmentTypeChoices = computed(() => {
  if (!isSelectingEquipmentType.value) return [];
  const selection = currentSelection.value;
  if (!selection) return [];
  const choices = selection.choices || [];
  // Normalize choices to objects with value and label
  return choices.map((choice: any) => {
    if (typeof choice === 'string') {
      return { value: choice, label: choice };
    }
    return { value: choice.value || choice, label: choice.display || choice.value || String(choice) };
  });
});

// Use the shared actionArgs from GameShell (props.actionArgs) instead of local state
// This allows both custom UI and ActionPanel to potentially share state

// Get action metadata for the current action (hiring or explore)
const currentActionMetadata = computed(() => {
  const metadata = props.state?.state?.actionMetadata;
  if (!metadata) return null;

  // Check for hiring actions
  if (isHiringMercs.value) {
    return metadata.hireFirstMerc ||
           metadata.hireSecondMerc ||
           metadata.hireThirdMerc;
  }

  // Check for explore action
  if (props.availableActions.includes('explore')) {
    return metadata.explore;
  }

  return null;
});

// Get the current selection (first one that hasn't been filled yet)
// Reads from props.actionArgs (shared state)
const currentSelection = computed(() => {
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

// Get current action name that needs custom UI handling (hiring or explore)
function getCurrentActionName(): string | null {
  if (props.availableActions.includes('hireFirstMerc')) return 'hireFirstMerc';
  if (props.availableActions.includes('hireSecondMerc')) return 'hireSecondMerc';
  if (props.availableActions.includes('hireThirdMerc')) return 'hireThirdMerc';
  if (props.availableActions.includes('explore')) return 'explore';
  return null;
}

// Watch for deferred selections and fetch choices when needed
watch(
  () => currentSelection.value,
  async (selection) => {
    if (!selection?.deferred || !fetchDeferredChoicesFn) return;

    const actionName = getCurrentActionName();
    if (!actionName) return;
    const key = `${actionName}:${selection.name}`;

    // Skip if already fetched
    if (fetchedDeferredChoices[key]?.length > 0) return;

    deferredChoicesLoading.value = true;
    try {
      const result = await fetchDeferredChoicesFn(
        actionName,
        selection.name,
        props.playerPosition,
        props.actionArgs
      );
      if (result.success && result.choices) {
        fetchedDeferredChoices[key] = result.choices;
      }
    } catch (err) {
      console.error('Error fetching deferred choices:', err);
    } finally {
      deferredChoicesLoading.value = false;
    }
  },
  { immediate: true }
);

// Helper to find a MERC by name anywhere in the gameView tree
function findMercByName(name: string | any, node?: any): any {
  if (!node) node = props.gameView;
  if (!node) return null;

  // Ensure name is a string (handle object/undefined cases)
  const searchName = typeof name === 'string' ? name : (name?.value || name?.label || String(name || ''));
  if (!searchName) return null;

  const mercName = getAttr(node, 'mercName', '');
  if (mercName && mercName.toLowerCase() === searchName.toLowerCase()) {
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

// Get MERCs available for hiring from action metadata
const hirableMercs = computed(() => {
  const selection = currentSelection.value;
  if (!selection) return [];

  // Don't return MERCs when selecting equipment type
  if (isSelectingEquipmentType.value) return [];

  // For deferred selections, use fetched choices
  let choices: any[];
  if (selection.deferred) {
    const actionName = getCurrentActionName();
    if (!actionName) return [];
    const key = `${actionName}:${selection.name}`;
    choices = fetchedDeferredChoices[key] || [];
  } else {
    choices = selection.choices || [];
  }

  if (choices.length === 0) return [];

  // Get already-selected merc names from shared actionArgs to filter them out
  const selectedMercs = Object.values(props.actionArgs || {}) as string[];

  // Find MERCs anywhere in the gameView and attach the original choice value
  // Filter out MERCs that have already been selected AND filter out skip option
  return choices
    .filter((choice: any) => {
      const choiceValue = choice.value || choice.display || choice;
      // Filter out skip option - it's handled separately
      if (typeof choiceValue === 'string' && choiceValue.toLowerCase().includes('skip')) return false;
      return !selectedMercs.includes(choiceValue);
    })
    .map((choice: any) => {
      const choiceValue = choice.value || choice.display || choice;
      const merc = findMercByName(choiceValue);
      // Attach the original choice value so we can use it when clicking
      const result = merc ? { ...merc, _choiceValue: choiceValue } : { mercName: choiceValue, attributes: { mercName: choiceValue }, _choiceValue: choiceValue };
      return result;
    });
});

// Check if skip option is available (for third hire)
const hasSkipOption = computed(() => {
  const selection = currentSelection.value;
  if (!selection) return false;

  // For deferred selections, use fetched choices
  let choices: any[];
  if (selection.deferred) {
    const actionName = getCurrentActionName();
    if (!actionName) return false;
    const key = `${actionName}:${selection.name}`;
    choices = fetchedDeferredChoices[key] || [];
  } else {
    choices = selection.choices || [];
  }

  return choices.some((choice: any) => {
    const choiceValue = choice.value || choice.display || choice;
    return typeof choiceValue === 'string' && choiceValue.toLowerCase().includes('skip');
  });
});

// Handle skip button click
function skipThirdHire() {
  const selection = currentSelection.value;
  if (!selection) return;

  // For deferred selections, use fetched choices
  let choices: any[];
  if (selection.deferred) {
    const actionName = getCurrentActionName();
    if (!actionName) return;
    const key = `${actionName}:${selection.name}`;
    choices = fetchedDeferredChoices[key] || [];
  } else {
    choices = selection.choices || [];
  }

  // Find the skip choice value
  const skipChoice = choices.find((choice: any) => {
    const choiceValue = choice.value || choice.display || choice;
    return typeof choiceValue === 'string' && choiceValue.toLowerCase().includes('skip');
  });

  if (skipChoice) {
    const choiceValue = skipChoice.value || skipChoice.display || skipChoice;
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

// Get MERC ID from merc object (handles different data structures)
// Never returns empty string to prevent Vue duplicate key warnings
let mercIdCounter = 0;
function getMercId(merc: any): string {
  const id = merc.attributes?.mercId || merc.mercId || merc.id || merc.ref;
  if (id) return id;
  // Generate a unique fallback ID using merc name if available
  const name = merc.attributes?.mercName || merc.mercName || '';
  return name ? `temp-${name}` : `temp-merc-${++mercIdCounter}`;
}

// Get capitalized MERC name for action (action expects capitalized names)
function getMercDisplayName(merc: any): string {
  const name = merc.attributes?.mercName || merc.mercName || getMercId(merc);
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

  // Check if this is the first selection (action not yet started)
  const isFirstSelection = Object.keys(props.actionArgs).length === 0;

  if (isFirstSelection) {
    // Use startAction with initial args (correct pattern per BoardSmith docs)
    // This starts the action in ActionPanel and pre-fills the first selection
    props.startAction(actionName, { [selection.name]: choiceValue });
  } else {
    // Action already started - write directly to actionArgs for subsequent selections
    props.actionArgs[selection.name] = choiceValue;

    // Check if all selections are now complete and execute if so
    // (ActionPanel's auto-execute doesn't trigger when we write to actionArgs externally)
    const metadata = currentActionMetadata.value;
    if (metadata?.selections) {
      const allFilled = metadata.selections.every(
        (sel: any) => props.actionArgs[sel.name] !== undefined
      );
      if (allFilled) {
        await props.executeAction(actionName);
      }
    }
  }
}

// Handle selecting equipment type
async function selectEquipmentType(equipType: string) {
  const selection = currentSelection.value;
  if (!selection) return;

  const actionName = getCurrentActionName();
  if (!actionName) return;

  // Write to actionArgs
  props.actionArgs[selection.name] = equipType;

  // Check if all selections are now complete and execute if so
  const metadata = currentActionMetadata.value;
  if (metadata?.selections) {
    const allFilled = metadata.selections.every(
      (sel: any) => props.actionArgs[sel.name] !== undefined
    );
    if (allFilled) {
      await props.executeAction(actionName);
    }
  }
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
      const validElements = selection?.validElements || [];
      const matchingElement = validElements.find((e: any) =>
        e.ref?.name === sectorId ||
        e.ref?.notation === sectorId ||
        e.display === sector?.sectorName
      );
      actionValue = matchingElement?.id || sectorId;
    } else {
      // Choice selections - use sector name
      const choices = selection?.choices || [];
      const matchingChoice = choices.find((c: any) => {
        const choiceValue = c.value || c.display || c;
        return choiceValue === sector?.sectorName ||
               choiceValue === sectorId ||
               choiceValue.includes(sector?.sectorName);
      });
      actionValue = matchingChoice?.value || matchingChoice?.display || sector?.sectorName || sectorId;
    }

    // Execute the action
    await props.action('placeLanding', { [selectionName]: actionValue });
  } else if (props.availableActions.includes('move')) {
    props.action('move', { sectorId });
  }
}

// Check if equipment can be dropped (player's turn, dropEquipment action available)
const canDropEquipment = computed(() => {
  return props.isMyTurn && props.availableActions.includes('dropEquipment');
});

// Handle dropping equipment from a MERC to sector stash
async function handleDropEquipment(mercId: string, slotType: 'Weapon' | 'Armor' | 'Accessory' | `Bandolier:${number}`) {
  if (!canDropEquipment.value) return;

  // Find the merc in the game view by mercId
  const squads = findAllByClassName('Squad');
  let mercElement: any = null;

  for (const squad of squads) {
    if (squad.children) {
      for (const child of squad.children) {
        const childMercId = getAttr(child, 'mercId', '');
        if (childMercId === mercId) {
          mercElement = child;
          break;
        }
      }
    }
    if (mercElement) break;
  }

  if (!mercElement) {
    console.error('Could not find merc element for mercId:', mercId);
    return;
  }

  let slotChoice: string;

  // Check if it's a bandolier slot
  if (slotType.startsWith('Bandolier:')) {
    const slotIndex = parseInt(slotType.split(':')[1], 10);
    const bandolierData = mercElement.attributes?.bandolierSlotsData || mercElement.bandolierSlotsData || [];
    const slotData = bandolierData[slotIndex];
    const equipmentName = slotData?.equipmentName || slotData?.attributes?.equipmentName || 'Equipment';
    slotChoice = `Bandolier:${slotIndex}: ${equipmentName}`;
  } else {
    // Get the equipment name for the slot selection
    const slotKey = slotType === 'Weapon' ? 'weaponSlotData'
                  : slotType === 'Armor' ? 'armorSlotData'
                  : 'accessorySlotData';
    const slotData = mercElement.attributes?.[slotKey] || mercElement[slotKey];
    const equipmentName = slotData?.equipmentName || slotData?.attributes?.equipmentName || 'Equipment';
    slotChoice = `${slotType}: ${equipmentName}`;
  }

  // Execute the dropEquipment action directly with both args
  // Pass the element ID (number) so the server can resolve it to the actual element
  await props.action('dropEquipment', {
    actingMerc: mercElement.id,
    slot: slotChoice,
  });
}

// Clickable sectors based on available actions
const clickableSectors = computed(() => {
  if (isPlacingLanding.value) {
    // Get valid choices from action metadata
    const metadata = landingZoneMetadata.value;
    const selection = metadata?.selections?.[0];
    const choices = selection?.choices || [];

    if (choices.length > 0) {
      // Find sectors that match the choices
      const validSectorIds: string[] = [];
      for (const choice of choices) {
        const choiceValue = choice.value || choice.display || choice;
        // Find sector by name match
        const matchingSector = sectors.value.find(s =>
          s.sectorName === choiceValue ||
          choiceValue.includes(s.sectorName)
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
  return [];
});

</script>

<template>
  <div class="game-board">
    <!-- Hiring phase - show MERCs to choose from -->
    <div v-if="isHiringMercs" class="hiring-phase">
      <div class="hiring-header">
        <div class="hiring-icon">👥</div>
        <div class="hiring-content">
          <h2 class="hiring-title">Hiring Phase</h2>
          <p class="hiring-prompt">{{ currentSelection?.prompt || state?.flowState?.prompt || 'Select your MERCs' }}</p>
        </div>
      </div>

      <!-- Show already-selected MERCs from shared actionArgs -->
      <div v-if="Object.keys(actionArgs).filter(k => k).length > 0" class="selected-mercs">
        <span class="selected-label">Selected:</span>
        <span v-for="(value, key, idx) in actionArgs" :key="key || `arg-${idx}`" class="selected-merc-badge">
          {{ value }}
        </span>
      </div>

      <!-- Equipment type selection -->
      <div class="equipment-type-choices" v-if="isSelectingEquipmentType && equipmentTypeChoices.length > 0">
        <div class="equipment-type-buttons">
          <button
            v-for="choice in equipmentTypeChoices"
            :key="choice.value"
            class="equipment-type-button"
            :class="choice.label.toLowerCase()"
            @click="selectEquipmentType(choice.value)"
          >
            <span class="equip-icon">{{ choice.label === 'Weapon' ? '⚔️' : choice.label === 'Armor' ? '🛡️' : '📦' }}</span>
            <span class="equip-label">{{ choice.label }}</span>
          </button>
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
            <MercCard :merc="merc" :player-color="currentPlayerColor" />
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
    </div>

    <!-- Main content: Map + Squad Panel -->
    <div class="board-layout" v-if="sectors.length > 0 || isPlacingLanding">
      <!-- Map Section -->
      <div class="map-section">
        <h2 v-if="isPlacingLanding" class="action-title">Choose Landing Zone</h2>
        <p v-if="isPlacingLanding" class="action-subtitle">Select an edge sector for your landing</p>
        <MapGrid
          :sectors="sectors"
          :mercs="allMercs"
          :players="players"
          :control-map="controlMap"
          :clickable-sectors="clickableSectors"
          :can-drop-equipment="canDropEquipment"
          @sector-click="handleSectorClick"
          @drop-equipment="handleDropEquipment"
        />
      </div>

      <!-- Squad Panel -->
      <div class="squad-section" v-if="primarySquad || secondarySquad || dictatorSquad">
        <SquadPanel
          :primary-squad="currentPlayerIsDictator ? dictatorSquad : primarySquad"
          :secondary-squad="currentPlayerIsDictator ? undefined : secondarySquad"
          :player-color="currentPlayerIsDictator ? 'dictator' : currentPlayerColor"
          :can-drop-equipment="canDropEquipment"
          @drop-equipment="handleDropEquipment"
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

.no-mercs-message {
  color: v-bind('UI_COLORS.textMuted');
  text-align: center;
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
