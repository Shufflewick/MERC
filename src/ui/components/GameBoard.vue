<script setup lang="ts">
import { computed, ref, watch, inject, reactive } from 'vue';
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
import CombatantIcon from './CombatantIcon.vue';
import CombatantIconSmall from './CombatantIconSmall.vue';
import SectorCardChoice from './SectorCardChoice.vue';
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

// State for sector panel
const selectedSectorId = ref<string | null>(null);

// Debug: log available actions when they change

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

// Find element by numeric ID (BoardSmith element IDs are numbers)
function findElementById(id: number | string, root?: any): any {
  if (!root) root = props.gameView;
  if (!root) return null;

  // Compare as both number and string for flexibility
  const idNum = typeof id === 'number' ? id : parseInt(id, 10);
  const idStr = String(id);

  if (root.ref === idNum || root.ref === idStr || root.id === idNum || root.id === idStr) {
    return root;
  }

  if (root.children) {
    for (const child of root.children) {
      const found = findElementById(id, child);
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

// Helper to check if a MERC is dead (damage >= maxHealth or in discard pile)
// Note: isDead and health are getters that may not serialize, so we check damage directly
function isMercDead(merc: any): boolean {
  // First check isDead if it was explicitly serialized
  const isDead = getAttr(merc, 'isDead', false);
  if (isDead === true) return true;

  // Check health directly if available (may be explicitly serialized in some views)
  const health = getAttr(merc, 'health', -1);
  if (health === 0) return true;

  // Primary check: damage vs maxHealth (these are actual properties that serialize)
  const damage = getAttr(merc, 'damage', 0);
  // Use effectiveMaxHealth (serialized property) with fallback to maxHealth or default 3
  const maxHealth = getAttr(merc, 'effectiveMaxHealth', 0) || getAttr(merc, 'maxHealth', 3);
  if (damage > 0 && damage >= maxHealth) return true;

  // Check if MERC is in a discard pile (dead MERCs are moved there)
  // This handles cases where the MERC hasn't been fully cleaned up
  const parentRef = merc._container || merc.parent?.ref || '';
  if (parentRef.includes('discard')) return true;

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
        id: s.id,  // Numeric BoardSmith element ID (for action controller fill)
        sectorId: s.ref || getAttr(s, 'sectorId', '') || `sector-${getAttr(s, 'row', 0)}-${getAttr(s, 'col', 0)}`,
        sectorName: getAttr(s, 'sectorName', ''),
        sectorType: getAttr(s, 'sectorType', 'Wilderness'),
        value: getAttr(s, 'value', 0),
        row: getAttr(s, 'row', 0),
        col: getAttr(s, 'col', 0),
        image: getAttr(s, 'image', undefined),
        weaponLoot: getAttr(s, 'weaponLoot', 0),
        armorLoot: getAttr(s, 'armorLoot', 0),
        accessoryLoot: getAttr(s, 'accessoryLoot', 0),
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
      id: c.id,  // Numeric BoardSmith element ID (for action controller fill)
      sectorId: c.ref || getAttr(c, 'sectorId', '') || `sector-${getAttr(c, 'row', 0)}-${getAttr(c, 'col', 0)}`,
      sectorName: getAttr(c, 'sectorName', ''),
      sectorType: getAttr(c, 'sectorType', 'Wilderness'),
      value: getAttr(c, 'value', 0),
      row: getAttr(c, 'row', 0),
      col: getAttr(c, 'col', 0),
      image: getAttr(c, 'image', undefined),
      weaponLoot: getAttr(c, 'weaponLoot', 0),
      armorLoot: getAttr(c, 'armorLoot', 0),
      accessoryLoot: getAttr(c, 'accessoryLoot', 0),
      explored: getAttr(c, 'explored', false),
      dictatorMilitia: getAttr(c, 'dictatorMilitia', 0),
      rebelMilitia: getAttr(c, 'rebelMilitia', {}),
    }));
});

// Selected sector for SectorPanel (from clicking on map)
const selectedSector = computed(() => {
  if (!selectedSectorId.value) return null;
  return sectors.value.find(s => s.sectorId === selectedSectorId.value) || null;
});

// Sector from action context (followUp args) - for actions started from ActionPanel
const actionContextSectorId = computed(() => {
  const currentAction = props.actionController.currentAction.value;
  if (!currentAction) return null;

  // First, check if sectorId is explicitly in args
  const args = props.actionController.currentArgs.value;
  if (args?.sectorId) {
    // Handle both plain ID and {id, name} object formats
    const sectorId = args.sectorId;
    if (typeof sectorId === 'object' && sectorId !== null) {
      return (sectorId as { id: number }).id;
    }
    return sectorId as number;
  }

  // If no explicit sectorId but we're in a sector-relevant action,
  // infer from player's primary squad location (or dictator's squad for dictator player)
  const sectorRelevantActions = [
    'explore', 'collectEquipment', 'armsDealer', 'hospital', 'train', 'reEquip',
    'dropEquipment', 'takeFromStash', 'move', 'docHeal', 'squidheadDisarm', 'squidheadArm',
  ];
  if (sectorRelevantActions.includes(currentAction)) {
    // For dictator player, use dictator's squad location
    const squadSectorId = currentPlayerIsDictator.value
      ? (dictatorPrimarySquad.value?.sectorId || dictatorSecondarySquad.value?.sectorId)
      : primarySquad.value?.sectorId;

    if (squadSectorId) {
      // Find the sector by sectorId string and return its numeric id
      const sector = sectors.value.find(s => s.sectorId === squadSectorId);
      return sector?.id ?? null;
    }
  }

  return null;
});

// Active sector - from either clicking on map OR action context
const actionContextSector = computed(() => {
  if (!actionContextSectorId.value) return null;
  return sectors.value.find(s => s.id === actionContextSectorId.value) || null;
});

// The sector to show in SectorPanel - prefer clicked sector, fall back to action context
const activeSector = computed(() => {
  return selectedSector.value ?? actionContextSector.value;
});

// Get stash contents for active sector (if player can see it)
const selectedSectorStash = computed(() => {
  if (!activeSector.value) return [];

  // Player can see stash if they have a squad or unit in the sector
  // Check rebel squads
  const hasRebelSquadInSector =
    primarySquad.value?.sectorId === activeSector.value.sectorId ||
    secondarySquad.value?.sectorId === activeSector.value.sectorId;

  // Check dictator squads and DictatorCard location
  const hasDictatorUnitInSector =
    dictatorPrimarySquad.value?.sectorId === activeSector.value.sectorId ||
    dictatorSecondarySquad.value?.sectorId === activeSector.value.sectorId ||
    (dictatorCard.value?.sectorId === activeSector.value.sectorId && dictatorCard.value?.inPlay);

  if (!hasRebelSquadInSector && !hasDictatorUnitInSector) return [];

  // Find the sector element in gameView to get stash
  const sectorElement = findByRef(activeSector.value.sectorId) ||
    findAllByClassName('Sector').find((s: any) =>
      getAttr(s, 'sectorId', '') === activeSector.value?.sectorId
    );

  if (!sectorElement) return [];

  // Stash is stored as a Space zone named 'stash' containing Equipment children
  // Look for the Space zone in sector's children
  // Note: Element name from create(Space, 'stash') is stored at top level (c.name), not in attributes
  const stashZone = sectorElement.children?.find((c: any) =>
    c.className === 'Space' && (c.name === 'stash' || getAttr(c, 'name', '') === 'stash')
  );

  if (!stashZone?.children) return [];

  // Get equipment from stash zone children
  return stashZone.children
    .filter((e: any) => e.className === 'Equipment')
    .map((e: any) => ({
      equipmentName: getAttr(e, 'equipmentName', 'Unknown'),
      equipmentType: getAttr(e, 'equipmentType', 'Accessory'),
      equipmentId: getAttr(e, 'equipmentId', ''),
      description: getAttr(e, 'description', ''),
      combatBonus: getAttr(e, 'combatBonus', 0),
      initiative: getAttr(e, 'initiative', 0),
      training: getAttr(e, 'training', 0),
      armorBonus: getAttr(e, 'armorBonus', 0),
      targets: getAttr(e, 'targets', 0),
      negatesArmor: getAttr(e, 'negatesArmor', false),
      image: getAttr(e, 'image', ''),
    }));
});

// Get all mercs in active sector (for display in SectorPanel)
const selectedSectorMercs = computed(() => {
  if (!activeSector.value) return [];
  return allMercs.value.filter(m => m.sectorId === activeSector.value?.sectorId);
});

// Check if player has Doc on team
const hasDoc = computed(() => {
  const allMercsInSquads = [
    ...(primarySquad.value?.mercs || []),
    ...(secondarySquad.value?.mercs || []),
  ];
  return allMercsInSquads.some((m: any) =>
    getAttr(m, 'mercId', '').toLowerCase() === 'doc' ||
    getAttr(m, 'mercName', '').toLowerCase() === 'doc'
  );
});

// Check if player has Squidhead on team
const hasSquidhead = computed(() => {
  const allMercsInSquads = [
    ...(primarySquad.value?.mercs || []),
    ...(secondarySquad.value?.mercs || []),
  ];
  return allMercsInSquads.some((m: any) =>
    getAttr(m, 'mercId', '').toLowerCase() === 'squidhead' ||
    getAttr(m, 'mercName', '').toLowerCase() === 'squidhead'
  );
});

// Check if player has mortar equipped
const hasMortar = computed(() => {
  const allMercsInSquads = [
    ...(primarySquad.value?.mercs || []),
    ...(secondarySquad.value?.mercs || []),
  ];
  return allMercsInSquads.some((m: any) => {
    const weapon = getAttr(m, 'weaponSlot', null);
    const accessory = getAttr(m, 'accessorySlot', null);
    const weaponName = weapon?.equipmentName?.toLowerCase() || '';
    const accessoryName = accessory?.equipmentName?.toLowerCase() || '';
    return weaponName.includes('mortar') || accessoryName.includes('mortar');
  });
});

// Check if player has damaged MERCs
const hasDamagedMercs = computed(() => {
  const allMercsInSquads = [
    ...(primarySquad.value?.mercs || []),
    ...(secondarySquad.value?.mercs || []),
  ];
  return allMercsInSquads.some((m: any) => {
    const damage = getAttr(m, 'damage', 0);
    return damage > 0;
  });
});

// Check if selected sector has land mines in stash
const hasLandMinesInStash = computed(() => {
  return selectedSectorStash.value.some(e =>
    e.equipmentName.toLowerCase().includes('land mine') ||
    e.equipmentName.toLowerCase().includes('landmine')
  );
});

// Check if Squidhead has land mine equipped
const squidheadHasLandMine = computed(() => {
  const allMercsInSquads = [
    ...(primarySquad.value?.mercs || []),
    ...(secondarySquad.value?.mercs || []),
  ];
  const squidhead = allMercsInSquads.find((m: any) =>
    getAttr(m, 'mercId', '').toLowerCase() === 'squidhead' ||
    getAttr(m, 'mercName', '').toLowerCase() === 'squidhead'
  );
  if (!squidhead) return false;

  const accessory = getAttr(squidhead, 'accessorySlot', null);
  const accessoryName = accessory?.equipmentName?.toLowerCase() || '';
  return accessoryName.includes('land mine') || accessoryName.includes('landmine');
});

// Check if active sector has dictator forces
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
  // Use dictatorBaseSectorId which is computed from DictatorCard.sectorId
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

// Extract all players
const players = computed(() => {
  // Try various player element names
  const rebelPlayers = findAllByClassName('RebelPlayer');
  const dictatorPlayers = findAllByClassName('DictatorPlayer');
  const playerAreas = findAllByClassName('PlayerArea');

  const all = [...rebelPlayers, ...dictatorPlayers, ...playerAreas];

  const result = all.map((p: any) => {
    // Get position from attribute, or parse from name (e.g., "area-2" -> 2)
    let position = getAttr(p, 'position', undefined);
    if (position === undefined) {
      const name = getAttr(p, 'name', '') || p.name || '';
      const match = name.match(/area-(\d+)/);
      if (match) {
        position = parseInt(match[1], 10);
      }
    }

    const playerColor = getAttr(p, 'playerColor', '') || getAttr(p, 'color', '');

    return {
      position,
      playerColor,
      isDictator: normalizeClassName(p.className) === 'DictatorPlayer',
    };
  });

  // Check if dictator exists in result
  const hasDictator = result.some(p => p.isDictator);

  // If no dictator found but dictator squads exist, add synthetic dictator entry
  if (!hasDictator) {
    const squads = findAllByClassName('Squad');
    const hasDictatorSquad = squads.some((s: any) => {
      const name = getAttr(s, 'name', '') || s.ref || '';
      return name.includes('dictator');
    });

    if (hasDictatorSquad) {
      // Dictator position is the last player (position not in playerAreas)
      // In 2-player game: position 1 is rebel, position 2 is dictator
      const rebelPositions = result.map(p => p.position).filter(p => p !== undefined);
      const maxRebelPos = Math.max(...rebelPositions, 0);
      const dictatorPosition = maxRebelPos + 1;

      result.push({
        position: dictatorPosition,
        playerColor: 'black', // Dictator uses 'black' which maps to grey
        isDictator: true,
      });
    }
  }

  return result;
});

// Current player's color
const currentPlayerColor = computed(() => {
  const player = players.value.find((p) => p.position === props.playerPosition);
  if (!player) {
    console.warn('[currentPlayerColor] No player found for position', props.playerPosition, 'in', players.value);
    return '';
  }
  if (!player.playerColor) {
    console.warn('[currentPlayerColor] Player has no color:', player);
    return '';
  }
  return player.playerColor;
});

// Map player positions to colors (for militia display in SectorPanel)
const playerColorMap = computed(() => {
  const map: Record<string, string> = {};
  for (const player of players.value) {
    if (player.playerColor) {
      map[String(player.position)] = player.playerColor;
    }
  }
  return map;
});

// Get dictator player's actual color from lobby selection
const dictatorPlayerColor = computed(() => {
  const dictator = players.value.find(p => p.isDictator);
  return dictator?.playerColor || '';
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
      if (!player) {
        console.warn('[allMercs] No player found for squad position', playerPos, 'squad:', squadName);
      } else if (!player.playerColor) {
        console.warn('[allMercs] Player has no color for position', playerPos);
      }
      playerColor = player?.playerColor || '';
    }

    if (squad.children) {
      for (const merc of squad.children) {
        const mercId = getAttr(merc, 'mercId', '');
        // Skip dead MERCs
        if (isMercDead(merc)) continue;

        if (mercId || merc.className === 'MercCard') {
          // Use merc's own sectorId if set (important for dictator mercs who can be
          // in different locations than their squad), otherwise fall back to squad's sectorId
          const mercSectorId = getAttr(merc, 'sectorId', '') || sectorId;
          mercs.push({
            ...merc,
            mercId: mercId || merc.ref,
            sectorId: mercSectorId,
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

  // Include the dictator himself when in play (base revealed)
  const dictatorCards = findAllByClassName('DictatorCard');
  for (const dictator of dictatorCards) {
    const inPlay = getAttr(dictator, 'inPlay', false);
    const sectorId = getAttr(dictator, 'sectorId', '');
    const isDead = getAttr(dictator, 'damage', 0) >= 10; // DictatorCard uses same health as MERCs

    if (inPlay && sectorId && !isDead) {
      const dictatorId = getAttr(dictator, 'dictatorId', '');
      const exists = mercs.some((m) => m.mercId === `dictator-${dictatorId}`);
      if (!exists) {
        mercs.push({
          ...dictator,
          mercId: `dictator-${dictatorId}`,
          mercName: getAttr(dictator, 'dictatorName', 'The Dictator'),
          sectorId,
          playerColor: 'dictator',
          image: getAttr(dictator, 'image', ''),
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

// Helper to build a dictator squad with DictatorCard included when present
function buildDictatorSquad(squad: any, isPrimary: boolean, dictatorCardNode: any | null) {
  const sectorId = getAttr(squad, 'sectorId', '');
  const sector = sectors.value.find((s) => s.sectorId === sectorId);

  // Get all combatants from squad (MERCs and DictatorCard)
  const combatants = (squad.children || [])
    .filter((c: any) => {
      const className = normalizeClassName(c.className);
      if (className === 'DictatorCard') {
        // Include dictator if alive and in play
        const isDead = getAttr(c, 'damage', 0) >= 10;
        const inPlay = getAttr(c, 'inPlay', false);
        return inPlay && !isDead;
      }
      if (className === 'MercCard') {
        return !isMercDead(c);
      }
      // Also check by mercId for serialized cards
      return getAttr(c, 'mercId', '');
    })
    .map((c: any) => {
      const className = normalizeClassName(c.className);
      if (className === 'DictatorCard') {
        // Map dictator to merc-like format for SquadPanel
        return {
          ...c,
          mercId: `dictator-${getAttr(c, 'dictatorId', '')}`,
          mercName: getAttr(c, 'dictatorName', 'The Dictator'),
          isDictator: true,
        };
      }
      return c;
    });

  return {
    squadId: squad.ref || `dictator-squad-${isPrimary ? 'primary' : 'secondary'}`,
    isPrimary,
    sectorId,
    sectorName: sector?.sectorName,
    mercs: combatants,
  };
}

// MERC-rwdv: Get dictator's primary squad (includes dictator card when at this location)
const dictatorPrimarySquad = computed(() => {
  if (!currentPlayerIsDictator.value) return undefined;

  const squads = findAllByClassName('Squad');
  const squad = squads.find((s: any) => {
    const name = getAttr(s, 'name', '') || s.ref || '';
    return name === 'squad-dictator-primary' || name.includes('dictator-primary');
  });

  if (!squad) return undefined;

  // Find dictator card to check if it should be included
  let dictatorCardNode = findByClassName('DictatorCard');
  if (!dictatorCardNode) dictatorCardNode = findByClassName('_DictatorCard');

  return buildDictatorSquad(squad, true, dictatorCardNode);
});

// MERC-rwdv: Get dictator's secondary squad
const dictatorSecondarySquad = computed(() => {
  if (!currentPlayerIsDictator.value) return undefined;

  const squads = findAllByClassName('Squad');
  const squad = squads.find((s: any) => {
    const name = getAttr(s, 'name', '') || s.ref || '';
    return name === 'squad-dictator-secondary' || name.includes('dictator-secondary');
  });

  if (!squad) return undefined;

  // Find dictator card to check if it should be included
  let dictatorCardNode = findByClassName('DictatorCard');
  if (!dictatorCardNode) dictatorCardNode = findByClassName('_DictatorCard');

  return buildDictatorSquad(squad, false, dictatorCardNode);
});

// MERC-base: Get dictator's base squad (third squad) - shows all combatants stationed at base
// This is a TRUE squad in the game model, not just a UI display helper
const dictatorBaseSquad = computed(() => {
  if (!currentPlayerIsDictator.value) return undefined;

  // Find the actual base squad from the game state
  const squads = findAllByClassName('Squad');
  const baseSquad = squads.find((s: any) => {
    const name = getAttr(s, 'name', '') || s.ref || '';
    return name === 'squad-dictator-base' || name.includes('dictator-base');
  });

  if (!baseSquad) return undefined;

  const sectorId = getAttr(baseSquad, 'sectorId', '');
  if (!sectorId) return undefined; // Base squad not yet positioned

  const sector = sectors.value.find((s) => s.sectorId === sectorId);

  // Get all combatants in the base squad (MERCs and DictatorCard)
  const combatants = (baseSquad.children || [])
    .filter((c: any) => {
      const className = normalizeClassName(c.className);
      if (className === 'DictatorCard') {
        // Include dictator if alive and in play
        const isDead = getAttr(c, 'damage', 0) >= 10;
        const inPlay = getAttr(c, 'inPlay', false);
        return inPlay && !isDead;
      }
      if (className === 'MercCard') {
        // Include MERCs if not dead
        return !isMercDead(c);
      }
      return false;
    })
    .map((c: any) => {
      const className = normalizeClassName(c.className);
      if (className === 'DictatorCard') {
        return {
          ...c,
          mercId: `dictator-${getAttr(c, 'dictatorId', '')}`,
          mercName: getAttr(c, 'dictatorName', 'The Dictator'),
          isDictator: true,
        };
      }
      return c;
    });

  // Only show base squad if it has combatants
  if (combatants.length === 0) return undefined;

  return {
    squadId: 'squad-dictator-base',
    isPrimary: false,
    isBase: true, // Flag to indicate this is the base squad
    sectorId,
    sectorName: sector?.sectorName || 'Base',
    mercs: combatants,
  };
});

// Legacy alias for compatibility
const dictatorSquad = dictatorPrimarySquad;

// MERC-rwdv: Get dictator card data (for DictatorPanel)
const dictatorCard = computed(() => {
  if (!currentPlayerIsDictator.value) return undefined;

  // Find dictator player - try multiple class name patterns
  let dictatorPlayer = findByClassName('DictatorPlayer');
  if (!dictatorPlayer) {
    dictatorPlayer = findByClassName('_DictatorPlayer');
  }

  // Find dictator card in player (or in entire game view as fallback)
  let dictatorCardNode = dictatorPlayer ? findByClassName('DictatorCard', dictatorPlayer) : null;
  if (!dictatorCardNode) {
    dictatorCardNode = findByClassName('_DictatorCard', dictatorPlayer || props.gameView);
  }
  if (!dictatorCardNode) {
    // Search entire gameView
    dictatorCardNode = findByClassName('DictatorCard');
  }

  // If we still can't find it, return a placeholder so panel still shows
  if (!dictatorCardNode) {
    return {
      id: 0,
      dictatorId: 'unknown',
      dictatorName: 'Dictator',
      ability: 'Ability not loaded',
      bio: '',
      image: '',
      inPlay: false,
      actionsRemaining: 0,
    };
  }

  const attrs = dictatorCardNode.attributes || {};

  // Extract equipment slot data (similar to how MercCard does it)
  const weaponSlotData = attrs.weaponSlotData || getAttr(dictatorCardNode, 'weaponSlotData', null);
  const armorSlotData = attrs.armorSlotData || getAttr(dictatorCardNode, 'armorSlotData', null);
  const accessorySlotData = attrs.accessorySlotData || getAttr(dictatorCardNode, 'accessorySlotData', null);

  return {
    id: dictatorCardNode.ref,
    dictatorId: attrs.dictatorId || getAttr(dictatorCardNode, 'dictatorId', 'unknown'),
    dictatorName: attrs.dictatorName || getAttr(dictatorCardNode, 'dictatorName', 'Unknown Dictator'),
    ability: attrs.ability || getAttr(dictatorCardNode, 'ability', ''),
    bio: attrs.bio || getAttr(dictatorCardNode, 'bio', ''),
    image: attrs.image || getAttr(dictatorCardNode, 'image', ''),
    inPlay: attrs.inPlay || getAttr(dictatorCardNode, 'inPlay', false),
    actionsRemaining: attrs.actionsRemaining || getAttr(dictatorCardNode, 'actionsRemaining', 0),
    sectorId: attrs.sectorId || getAttr(dictatorCardNode, 'sectorId', ''),
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
// Get the permanent base sector location from DictatorCard.baseSectorId
// This is separate from sectorId (which is the dictator's current location)
const dictatorBaseSectorId = computed(() => {
  // Find the DictatorCard
  let dictatorCardNode = findByClassName('DictatorCard');
  if (!dictatorCardNode) {
    dictatorCardNode = findByClassName('_DictatorCard');
  }
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

// ============================================================================
// GAME OVER DETECTION
// ============================================================================

// Helper to count tactics cards in a container
function countTacticsCards(containerNode: any): number {
  if (!containerNode?.children) return 0;
  return containerNode.children.filter(
    (c: any) => normalizeClassName(c.className) === 'TacticsCard'
  ).length;
}

// Helper to calculate victory points for rebels (controlled sectors)
function calculateRebelVictoryPoints(): number {
  let points = 0;
  const sectorNodes = findAllByClassName('Sector');
  for (const sector of sectorNodes) {
    // Get militia counts
    const dictatorMilitia = getAttr(sector, 'dictatorMilitia', 0);
    // Sum all rebel militia (check both formats)
    let rebelMilitia = 0;
    const rebelMilitiaMap = getAttr(sector, 'rebelMilitia', {});
    if (typeof rebelMilitiaMap === 'object') {
      for (const count of Object.values(rebelMilitiaMap)) {
        rebelMilitia += (count as number) || 0;
      }
    }
    // Rebels control if they have more militia
    if (rebelMilitia > dictatorMilitia) {
      points += 1;
    }
  }
  return points;
}

// Helper to calculate victory points for dictator (controlled sectors + base bonus)
function calculateDictatorVictoryPoints(): number {
  let points = 0;
  const sectorNodes = findAllByClassName('Sector');

  // Find dictator's base sector for bonus calculation
  const dictatorPlayerNode = findByClassName('DictatorPlayer') || findByClassName('_DictatorPlayer');
  const baseSectorId = dictatorPlayerNode ? getAttr(dictatorPlayerNode, 'baseSectorId', '') : '';

  for (const sector of sectorNodes) {
    const sectorId = getAttr(sector, 'sectorId', '');
    const dictatorMilitia = getAttr(sector, 'dictatorMilitia', 0);
    // Sum all rebel militia
    let rebelMilitia = 0;
    const rebelMilitiaMap = getAttr(sector, 'rebelMilitia', {});
    if (typeof rebelMilitiaMap === 'object') {
      for (const count of Object.values(rebelMilitiaMap)) {
        rebelMilitia += (count as number) || 0;
      }
    }
    // Dictator controls if they have more militia (or equal with any militia)
    if (dictatorMilitia > rebelMilitia || (dictatorMilitia > 0 && dictatorMilitia === rebelMilitia)) {
      points += 1;
      // Base sector gives +1 bonus
      if (sectorId === baseSectorId) {
        points += 1;
      }
    }
  }
  return points;
}

// Check if the game is over
const isGameOver = computed(() => {
  // 1. Check for dictator defeat (base revealed + dictator dead)
  const dictatorCardNode = findByClassName('DictatorCard') || findByClassName('_DictatorCard');
  if (dictatorCardNode) {
    const baseRevealed = getAttr(dictatorCardNode, 'inPlay', false);
    const damage = getAttr(dictatorCardNode, 'damage', 0);
    const maxHealth = getAttr(dictatorCardNode, 'maxHealth', 3);
    const dictatorDead = damage >= maxHealth;

    if (baseRevealed && dictatorDead) {
      return true;
    }
  }

  // 2. Check for tactics deck AND hand both empty
  const tacticsDeckNode = findByClassName('TacticsDeck') || findByClassName('_TacticsDeck');
  const tacticsHandNode = findByClassName('TacticsHand') || findByClassName('_TacticsHand');
  const deckCount = countTacticsCards(tacticsDeckNode);
  const handCount = countTacticsCards(tacticsHandNode);
  if (deckCount === 0 && handCount === 0) {
    return true;
  }

  // 3. Check for explosives victory (stored as game attribute)
  const explosivesVictory = props.gameView?.explosivesVictory ||
                            props.gameView?.attributes?.explosivesVictory || false;
  if (explosivesVictory) {
    return true;
  }

  return false;
});

// Determine the winner
const gameWinner = computed(() => {
  if (!isGameOver.value) return null;

  // 1. Check dictator defeat (rebels win)
  const dictatorCardNode = findByClassName('DictatorCard') || findByClassName('_DictatorCard');
  if (dictatorCardNode) {
    const baseRevealed = getAttr(dictatorCardNode, 'inPlay', false);
    const damage = getAttr(dictatorCardNode, 'damage', 0);
    const maxHealth = getAttr(dictatorCardNode, 'maxHealth', 3);

    if (baseRevealed && damage >= maxHealth) {
      return 'rebels';
    }
  }

  // 2. Check for explosives victory (rebels win)
  const explosivesVictory = props.gameView?.explosivesVictory ||
                            props.gameView?.attributes?.explosivesVictory || false;
  if (explosivesVictory) {
    return 'rebels';
  }

  // 3. Tactics deck empty - winner determined by victory points
  const tacticsDeckNode = findByClassName('TacticsDeck') || findByClassName('_TacticsDeck');
  const tacticsHandNode = findByClassName('TacticsHand') || findByClassName('_TacticsHand');
  const deckCount = countTacticsCards(tacticsDeckNode);
  const handCount = countTacticsCards(tacticsHandNode);
  if (deckCount === 0 && handCount === 0) {
    const rebelPoints = calculateRebelVictoryPoints();
    const dictatorPoints = calculateDictatorVictoryPoints();
    // Dictator wins ties
    return dictatorPoints >= rebelPoints ? 'dictator' : 'rebels';
  }

  return 'dictator'; // Default fallback
});

// State for viewing dictator's played cards modal
const showPlayedCardsModal = ref(false);

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
// ACTION HANDLING - Show appropriate UI based on available actions
// ============================================================================

// Get action choices from actionArgs
const actionChoices = computed(() => {
  return props.actionArgs || {};
});

// Check if we're in MERC hiring mode (Day 1 or Castro's ability)
const isHiringMercs = computed(() => {
  const currentAction = props.actionController.currentAction.value;
  return props.availableActions.includes('hireFirstMerc') ||
         props.availableActions.includes('hireSecondMerc') ||
         props.availableActions.includes('hireThirdMerc') ||
         props.availableActions.includes('dictatorHireFirstMerc') ||
         props.availableActions.includes('selectDictator') ||
         currentAction === 'hireFirstMerc' ||
         currentAction === 'hireSecondMerc' ||
         currentAction === 'hireThirdMerc' ||
         currentAction === 'dictatorHireFirstMerc' ||
         currentAction === 'castroBonusHire' ||
         currentAction === 'selectDictator';
});

// Check if we're selecting a dictator (Day 1 human dictator)
const isSelectingDictator = computed(() => {
  const currentAction = props.actionController.currentAction.value;
  return props.availableActions.includes('selectDictator') ||
         currentAction === 'selectDictator';
});

// Use actionController to detect when hagnessDraw action is active
const isHagnessDrawActive = computed(() => {
  return props.actionController.currentAction.value === 'hagnessDraw';
});

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

// Check if we're in landing placement mode
const isPlacingLanding = computed(() => {
  return props.availableActions.includes('placeLanding');
});

// Check if we're selecting a retreat sector (combatRetreat action needs retreatSector)
const isSelectingRetreatSector = computed(() => {
  const currentAction = props.actionController.currentAction.value;
  const currentSel = props.actionController.currentSelection.value;
  return currentAction === 'combatRetreat' && currentSel?.name === 'retreatSector';
});

// Get retreat sector choices when selecting retreat destination
const retreatSectorChoices = computed(() => {
  if (!isSelectingRetreatSector.value) return [];
  const currentSel = props.actionController.currentSelection.value;
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

// Get landing zone action metadata
const landingZoneMetadata = computed(() => {
  if (!isPlacingLanding.value) return null;
  return props.state?.state?.actionMetadata?.placeLanding;
});

// Check if we're equipping starting equipment
const isEquipping = computed(() => {
  return props.availableActions.includes('equipStarting');
});

// Check if current selection is for equipment type (Day 1 hiring or Castro hire)
const isSelectingEquipmentType = computed(() => {
  const selection = currentSelection.value;
  return selection?.name === 'equipmentType';
});

// Check if we're in Castro hiring flow (to show equipment selection properly)
const isCastroHiring = computed(() => {
  return props.actionController.currentAction.value === 'castroBonusHire';
});

// Check if current selection is for sector (Castro hire placement)
const isSelectingSector = computed(() => {
  const selection = currentSelection.value;
  return selection?.name === 'targetSector';
});

// Get sector choices for Castro hire placement - includes full sector data
const sectorChoices = computed(() => {
  if (!isSelectingSector.value) return [];
  const selection = currentSelection.value;
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

// Get fallback image for sector type
function getSectorImageFallback(sectorType: string): string {
  const type = sectorType.toLowerCase();
  if (type === 'wilderness') return '/sectors/wilderness.jpg';
  if (type === 'city') return '/sectors/town---a.jpg';
  return '/sectors/industry---coal.jpg';
}

// Handle sector selection for Castro hire
function selectSector(sector: { value: string; label: string }) {
  const selection = currentSelection.value;
  if (!selection) return;
  props.actionController.fill(selection.name, sector.value);
}

// Get equipment type choices when selecting equipment
// Normalize to array of { value, label } objects
const equipmentTypeChoices = computed(() => {
  if (!isSelectingEquipmentType.value) return [];
  const selection = currentSelection.value;
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

// Get the MERC currently being hired (for showing portrait and name during hiring flow)
const selectedMercForEquipment = computed(() => {
  // Only active during hiring flow (equipment or sector selection)
  if (!isSelectingEquipmentType.value && !isSelectingSector.value) return null;

  // Get MERC name from actionArgs (works for both rebel and dictator flows now)
  const mercName = props.actionArgs['merc'] as string | undefined;
  if (!mercName) return null;

  // Try to find the MERC in the game tree first
  const merc = findMercByName(mercName);
  if (merc) return merc;

  // During Day 1 hiring, the MERC isn't in the tree yet - create minimal data
  // The mercId is typically the lowercase version of the name
  return {
    mercName,
    mercId: mercName.toLowerCase(),
    attributes: { mercName, mercId: mercName.toLowerCase() },
  };
});

// Get the image path for the selected MERC
const selectedMercImagePath = computed(() => {
  const merc = selectedMercForEquipment.value;
  if (!merc) return null;
  const img = getAttr(merc, 'image', '');
  if (img) return img;
  // Use mercId to construct path - during Day 1, mercId is lowercase name
  const mercId = getAttr(merc, 'mercId', '') || (merc as any).mercId;
  return mercId ? `/mercs/${mercId}.jpg` : null;
});

// Get the name for the selected MERC
const selectedMercName = computed(() => {
  const merc = selectedMercForEquipment.value;
  if (!merc) return '';
  return getAttr(merc, 'mercName', '') || (merc as any).mercName || '';
});

// Get the mercId for the selected MERC
const selectedMercId = computed(() => {
  const merc = selectedMercForEquipment.value;
  if (!merc) return '';
  return getAttr(merc, 'mercId', '') || (merc as any).mercId || '';
});

// State for showing MERC detail modal during hiring
const showHiringMercModal = ref(false);

// Open MERC detail modal during hiring phase
function openHiringMercDetail() {
  if (selectedMercForEquipment.value) {
    showHiringMercModal.value = true;
  }
}

// Close MERC detail modal
function closeHiringMercModal() {
  showHiringMercModal.value = false;
}

// Check if Hagness is selecting equipment type (first step)
const isHagnessSelectingType = computed(() => {
  if (!isHagnessDrawActive.value) return false;
  const metadata = props.state?.state?.actionMetadata?.hagnessDraw;
  if (!metadata?.selections?.length) return false;
  // Check if equipmentType selection exists and is unfilled
  const equipmentTypeSelection = metadata.selections.find((s: any) => s.name === 'equipmentType');
  return equipmentTypeSelection && props.actionArgs['equipmentType'] === undefined;
});

// Get Hagness equipment type choices
const hagnessEquipmentTypeChoices = computed(() => {
  if (!isHagnessSelectingType.value) return [];
  const metadata = props.state?.state?.actionMetadata?.hagnessDraw;
  const selection = metadata?.selections?.find((s: any) => s.name === 'equipmentType');
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

// Check if Hagness is selecting recipient (second step - after equipment drawn)
const isHagnessSelectingRecipient = computed(() => {
  if (!isHagnessDrawActive.value) return false;
  const metadata = props.state?.state?.actionMetadata?.hagnessDraw;
  if (!metadata?.selections?.length) return false;
  // Check if recipient selection exists and is unfilled (and equipmentType is filled)
  const recipientSelection = metadata.selections.find((s: any) => s.name === 'recipient');
  return recipientSelection &&
         props.actionArgs['equipmentType'] !== undefined &&
         props.actionArgs['recipient'] === undefined;
});

// Get Hagness's drawn equipment from choices or game state
const hagnessDrawnEquipment = computed(() => {
  if (!isHagnessDrawActive.value) return null;

  // First, try to get from fetched deferred choices
  const key = 'hagnessDraw:recipient';
  let choices: any[] = fetchedDeferredChoices[key] || [];

  // If no fetched choices, try actionController getter
  if (choices.length === 0) {
    const metadata = props.state?.state?.actionMetadata?.hagnessDraw;
    const recipientSelection = metadata?.selections?.find((s: any) => s.name === 'recipient');
    if (recipientSelection) {
      choices = props.actionController.getChoices(recipientSelection) || [];
    }
  }

  if (choices.length > 0) {
    // Equipment might be nested in choice.value.equipment or choice.equipment
    const choice = choices[0];
    const equipment = choice.value?.equipment || choice.equipment;
    if (equipment) {
      return equipment;
    }
  }

  // Fallback to game state locations
  const playerKey = `${props.playerPosition}`;
  const equipmentType = props.actionArgs['equipmentType'] as string | undefined;

  // Try typed key first (playerKey:equipmentType), then plain playerKey for backwards compat
  const typedKey = equipmentType ? `${playerKey}:${equipmentType}` : playerKey;

  // Try multiple locations where the data might be
  // 1. Direct on gameView (plain object should serialize here)
  let data = props.gameView?.hagnessDrawnEquipmentData?.[typedKey] ||
             props.gameView?.hagnessDrawnEquipmentData?.[playerKey];

  // 2. In attributes (BoardSmith element structure)
  if (!data) {
    data = props.gameView?.attributes?.hagnessDrawnEquipmentData?.[typedKey] ||
           props.gameView?.attributes?.hagnessDrawnEquipmentData?.[playerKey];
  }

  // 3. In state
  if (!data) {
    data = props.state?.state?.hagnessDrawnEquipmentData?.[typedKey] ||
           props.state?.state?.hagnessDrawnEquipmentData?.[playerKey];
  }

  return data || null;
});

// Get Hagness's squad mates from fetched choices or directly from squad data
const hagnessSquadMates = computed(() => {
  if (!isHagnessSelectingRecipient.value) return [];

  // Try to get choices from fetchedDeferredChoices (populated by watcher if metadata available)
  const key = 'hagnessDraw:recipient';
  const choices = fetchedDeferredChoices[key] || [];

  if (choices.length > 0) {
    // Extract MERC names from choices - each choice has { value: "MercName", display: "MercName ← Equipment" }
    return choices.map((choice: any) => {
      const displayName = typeof choice.value === 'string' ? choice.value : (choice.value?.value || choice.display?.split(' ←')[0] || 'Unknown');
      // Try to get mercId from choice metadata if available
      const mercId = choice.mercId || displayName.toLowerCase();
      return { displayName, mercId, choice }; // Keep the full choice for when user clicks
    }).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  // Fallback: Get mercs directly from squad data
  const allSquadMercs = [
    ...(primarySquad.value?.mercs || []),
    ...(secondarySquad.value?.mercs || []),
  ];

  if (allSquadMercs.length === 0) return [];

  // Create choice-like objects from squad mercs
  return allSquadMercs.map((merc: any) => {
    const mercId = getAttr(merc, 'mercId', '') || '';
    const mercName = getAttr(merc, 'mercName', '') || mercId || 'Unknown';
    // Capitalize first letter of each word
    const displayName = mercName.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    return {
      displayName,
      mercId,
      choice: { value: displayName }, // Simple choice object for selection
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));
});

// Use the shared actionArgs from GameShell (props.actionArgs) instead of local state
// This allows both custom UI and ActionPanel to potentially share state

// Get action metadata for the current action (hiring, hagnessDraw, or explore)
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
  // This takes precedence over explore since hagnessDraw requires specific user action
  if (isHagnessDrawActive.value) {
    return metadata.hagnessDraw;
  }

  // Check for explore action
  if (props.availableActions.includes('explore')) {
    return metadata.explore;
  }

  return null;
});

// Get the current selection (first one that hasn't been filled yet)
// Prefers actionController.currentSelection when an action is active via actionController
const currentSelection = computed(() => {
  // When an action is active via actionController, use its currentSelection
  if (props.actionController.currentAction.value && props.actionController.currentSelection.value) {
    return props.actionController.currentSelection.value;
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

// Get current action name that needs custom UI handling (hiring, hagnessDraw, or explore)
function getCurrentActionName(): string | null {
  if (props.availableActions.includes('selectDictator')) return 'selectDictator';
  if (props.availableActions.includes('hireFirstMerc')) return 'hireFirstMerc';
  if (props.availableActions.includes('hireSecondMerc')) return 'hireSecondMerc';
  if (props.availableActions.includes('hireThirdMerc')) return 'hireThirdMerc';
  if (props.actionController.currentAction.value === 'castroBonusHire') return 'castroBonusHire';
  if (props.actionController.currentAction.value === 'selectDictator') return 'selectDictator';
  // Check hagnessDraw FIRST (when user is actively interacting with it)
  if (isHagnessDrawActive.value && props.availableActions.includes('hagnessDraw')) return 'hagnessDraw';
  if (props.availableActions.includes('explore')) return 'explore';
  if (props.availableActions.includes('hagnessDraw')) return 'hagnessDraw';
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

  // Get choices using actionController.getChoices() - all choices are now fetched on-demand
  const choices = props.actionController.getChoices(selection) || [];

  if (choices.length === 0) return [];

  // Get already-selected merc names from shared actionArgs to filter them out
  const selectedMercs = Object.values(props.actionArgs || {}) as string[];

  // For dictator selection, convert to MercCard-compatible format
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

        // Return MercCard-compatible data structure
        return {
          mercName: choiceDisplay,
          _choiceValue: choiceValue,
          attributes: {
            mercName: choiceDisplay,
            mercId: dictatorInfo?.id || choiceDisplay.toLowerCase(),
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
      const result = merc ? { ...merc, _choiceValue: choiceValue } : { mercName: choiceDisplay, attributes: { mercName: choiceDisplay }, _choiceValue: choiceValue };
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
async function handleActivateAbility(mercId: string) {
  if (mercId === 'hagness' && props.availableActions.includes('hagnessDraw')) {
    // Start the Hagness draw action - this sets actionController.currentAction
    props.actionController.start('hagnessDraw');
    // Scroll to top where the Hagness UI appears
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (mercId === 'doc' && props.availableActions.includes('docHeal')) {
    // Execute Doc heal immediately (no selections needed)
    await props.actionController.execute('docHeal', {});
  }
  // Add more MERC ability handlers as needed
}

// Handle dropping equipment from a MERC to sector stash
async function handleDropEquipment(mercId: number, equipmentId: number) {
  if (!canDropEquipment.value) return;

  // Execute the dropEquipment action directly with the numeric IDs
  await props.actionController.execute('dropEquipment', {
    actingMerc: mercId,
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
    <!-- Game Over Overlay - shown when game ends -->
    <div v-if="isGameOver" class="game-over-overlay">
      <div class="game-over-content">
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
    </div>

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
        :merc-id="selectedMercId"
        :merc-name="selectedMercName"
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

    <!-- Hagness Draw Equipment UI (only when action is actively being executed) -->
    <div v-if="isHagnessDrawActive" class="hagness-phase">
      <div class="hagness-header">
        <div class="hagness-icon">🎒</div>
        <div class="hagness-content">
          <h2 class="hagness-title">Hagness: Draw Equipment</h2>
          <p class="hagness-prompt">{{ isHagnessSelectingType ? 'Choose equipment type to draw' : isHagnessSelectingRecipient ? 'Choose who receives the equipment' : 'Drawing equipment...' }}</p>
        </div>
      </div>

      <!-- Step 1: Equipment type selection -->
      <DrawEquipmentType
        v-if="isHagnessSelectingType && hagnessEquipmentTypeChoices.length > 0"
        :choices="hagnessEquipmentTypeChoices"
        prompt="Choose equipment type:"
        @select="selectEquipmentType"
      />

      <!-- Step 2: Show drawn equipment and recipient selection -->
      <div class="hagness-equipment-display" v-else-if="isHagnessSelectingRecipient">
        <!-- Show drawn equipment card -->
        <div class="hagness-drawn-section" v-if="hagnessDrawnEquipment">
          <EquipmentCard :equipment="hagnessDrawnEquipment" />
        </div>
        <div v-else class="no-equipment">
          <p>No equipment was drawn from the deck.</p>
        </div>

        <!-- Recipient selection -->
        <div class="hagness-recipient-section" v-if="hagnessSquadMates.length > 0">
          <p class="recipient-label">Give to:</p>
          <div class="recipient-icons">
            <CombatantIcon
              v-for="mate in hagnessSquadMates"
              :key="mate.displayName"
              :merc-id="mate.mercId"
              :merc-name="mate.displayName"
              :player-color="currentPlayerColor"
              size="large"
              clickable
              @click="selectHagnessRecipient(mate.choice)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Main content: Map + Squad Panel -->
    <div class="board-layout" v-if="sectors.length > 0 || isPlacingLanding">
      <!-- Map Section -->
      <div class="map-section">
        <h2 v-if="isPlacingLanding" class="action-title">Choose Landing Zone</h2>
        <p v-if="isPlacingLanding" class="action-subtitle">Select an edge sector for your landing</p>
        <h2 v-if="isSelectingRetreatSector" class="action-title">Retreat</h2>
        <p v-if="isSelectingRetreatSector" class="action-subtitle">Select an adjacent sector to retreat to</p>
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
          @drop-equipment="handleDropEquipment"
          @activate-ability="handleActivateAbility"
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

/* Hagness Draw Equipment UI */
.hagness-phase {
  background: v-bind('UI_COLORS.cardBg');
  border: 2px solid #81d4a8; /* mint green for Hagness */
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 20px;
}

.hagness-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.hagness-icon {
  font-size: 2.5rem;
}

.hagness-content {
  flex: 1;
}

.hagness-title {
  color: #81d4a8; /* mint green */
  font-size: 1.4rem;
  margin: 0 0 4px;
  font-weight: 700;
}

.hagness-prompt {
  color: v-bind('UI_COLORS.text');
  margin: 0;
  font-size: 1rem;
}

.step-label {
  color: v-bind('UI_COLORS.text');
  font-size: 1.1rem;
  margin: 0 0 12px;
  font-weight: 600;
}

.drawn-equipment-card {
  display: flex;
  justify-content: center;
}

.recipient-buttons-inline {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.recipient-label-inline {
  color: #e0e0e0;
  font-size: 0.9rem;
  margin: 0 0 8px;
  font-weight: 600;
}

.no-equipment {
  text-align: center;
  padding: 20px;
  color: v-bind('UI_COLORS.textMuted');
  font-style: italic;
}

.recipient-buttons {
  text-align: center;
  padding-top: 12px;
  border-top: 1px solid v-bind('UI_COLORS.border');
}

.recipient-label {
  color: v-bind('UI_COLORS.text');
  font-size: 1rem;
  margin: 0 0 12px;
  font-weight: 600;
}

.recipient-button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: flex-end;
}

@media (max-width: 600px) {
  .recipient-button-row {
    justify-content: center;
  }
}

.recipient-button {
  background: v-bind('UI_COLORS.backgroundLight');
  border: 2px solid #81d4a8;
  border-radius: 8px;
  color: v-bind('UI_COLORS.text');
  font-size: 1rem;
  font-weight: 600;
  padding: 12px 24px;
  cursor: pointer;
  transition: all 0.2s;
}

.recipient-button:hover {
  background: #81d4a8;
  color: #1a1a1a;
}

.hagness-loading {
  text-align: center;
  padding: 20px;
  color: v-bind('UI_COLORS.textMuted');
}

.hagness-equipment-display {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
  padding: 16px;
}

.hagness-drawn-section {
  display: flex;
  justify-content: center;
  flex: 1 1 auto;
  min-width: 280px;
}

.hagness-recipient-section {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-left: auto;
  text-align: right;
}

.recipient-icons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* On narrow screens, stack vertically and center */
@media (max-width: 600px) {
  .hagness-equipment-display {
    flex-direction: column;
  }

  .hagness-recipient-section {
    align-items: center;
    margin-left: 0;
    text-align: center;
    width: 100%;
  }

  .recipient-icons {
    justify-content: center;
  }
}

.no-equipment {
  text-align: center;
  padding: 20px;
  color: v-bind('UI_COLORS.textMuted');
}

.hagness-recipient-prompt {
  text-align: center;
  padding: 20px;
}

.recipient-message {
  color: #81d4a8;
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
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
.game-over-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 100px;
  z-index: 9999;
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.game-over-content {
  background: linear-gradient(135deg, #1a1a2e 0%, #2d2d4a 100%);
  border: 3px solid #d4a84b;
  border-radius: 20px;
  padding: 48px 64px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.5s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(50px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.game-over-title {
  font-size: 3rem;
  color: #d4a84b;
  margin: 0 0 24px 0;
  text-transform: uppercase;
  letter-spacing: 4px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.game-over-winner h2 {
  font-size: 2rem;
  margin: 0 0 16px 0;
}

.game-over-winner p {
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
}

.game-over-winner.rebels h2 {
  color: #4CAF50;
}

.game-over-winner.dictator h2 {
  color: #f44336;
}
</style>
