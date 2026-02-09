import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { useGameViewHelpers, getAttr as getAttrPure } from './useGameViewHelpers';

/**
 * Sector data as represented in the UI.
 */
export interface Sector {
  id: number; // Numeric BoardSmith element ID (for action controller fill)
  sectorId: string;
  sectorName: string;
  sectorType: string;
  value: number;
  row: number;
  col: number;
  image?: string;
  weaponLoot: number;
  armorLoot: number;
  accessoryLoot: number;
  explored: boolean;
  dictatorMilitia: number;
  rebelMilitia: Record<string, number>;
}

/**
 * Equipment item in a sector stash.
 */
export interface StashEquipment {
  equipmentName: string;
  equipmentType: string;
  equipmentId: string;
  description: string;
  combatBonus: number;
  initiative: number;
  training: number;
  armorBonus: number;
  targets: number;
  negatesArmor: boolean;
  image: string;
}

/**
 * Return type from useSectorState composable.
 */
export interface SectorState {
  // Core sector data
  sectors: ComputedRef<Sector[]>;
  selectedSectorId: Ref<string | null>;
  selectedSector: ComputedRef<Sector | null>;
  actionContextSectorId: ComputedRef<number | null>;
  actionContextSector: ComputedRef<Sector | null>;
  activeSector: ComputedRef<Sector | null>;
  selectedSectorStash: ComputedRef<StashEquipment[]>;
  selectedSectorMercs: ComputedRef<any[]>;
  controlMap: ComputedRef<Record<string, string | undefined>>;
  // Ability flags
  hasDoc: ComputedRef<boolean>;
  hasSquidhead: ComputedRef<boolean>;
  hasMortar: ComputedRef<boolean>;
  hasDamagedMercs: ComputedRef<boolean>;
  hasLandMinesInStash: ComputedRef<boolean>;
  squidheadHasLandMine: ComputedRef<boolean>;
}

/**
 * Dependencies injected into useSectorState.
 */
export interface SectorStateDependencies {
  /** Get current action from controller */
  getCurrentAction: () => string | null;
  /** Get current action args from controller */
  getCurrentArgs: () => Record<string, unknown> | undefined;
  /** Check if current player is dictator */
  isCurrentPlayerDictator: () => boolean;
  /** Get all MERCs (for control map and sector mercs) */
  getAllMercs: () => any[];
  /** Get primary squad for rebel player */
  getPrimarySquad: () => { sectorId: string; mercs: any[] } | undefined;
  /** Get secondary squad for rebel player */
  getSecondarySquad: () => { sectorId: string; mercs: any[] } | undefined;
  /** Get dictator primary squad */
  getDictatorPrimarySquad: () => { sectorId: string; mercs?: any[] } | undefined;
  /** Get dictator secondary squad */
  getDictatorSecondarySquad: () => { sectorId: string; mercs?: any[] } | undefined;
  /** Get dictator card (for checking if in sector) */
  getDictatorCard: () => { sectorId: string; inPlay: boolean } | undefined;
  /** Convert seat to color name */
  seatToColor: (seat: string | number) => string;
}

/**
 * Composable for sector-related state derivation.
 * Extracts sector data, selection state, control map, and sector ability flags.
 */
export function useSectorState(
  getGameView: () => any,
  deps: SectorStateDependencies
): SectorState {
  const { findAllByClassName, findByRef, findByClassName, getAttr } =
    useGameViewHelpers(getGameView);

  // Writable ref for selected sector (from UI clicks)
  const selectedSectorId = ref<string | null>(null);

  // Extract map sectors from gameView
  const sectors = computed<Sector[]>(() => {
    // Try to find GameMap element
    const map = findByClassName('GameMap') || findByRef('game-map');
    if (!map?.children) {
      // Fallback: look for Sector elements directly
      const sectorElements = findAllByClassName('Sector');
      if (sectorElements.length > 0) {
        return sectorElements.map((s: any) => ({
          id: s.id,
          sectorId:
            s.ref ||
            getAttr<string>(s, 'sectorId', '') ||
            `sector-${getAttr<number>(s, 'row', 0)}-${getAttr<number>(s, 'col', 0)}`,
          sectorName: getAttr<string>(s, 'sectorName', ''),
          sectorType: getAttr<string>(s, 'sectorType', 'Wilderness'),
          value: getAttr<number>(s, 'value', 0),
          row: getAttr<number>(s, 'row', 0),
          col: getAttr<number>(s, 'col', 0),
          image: getAttr<string | undefined>(s, 'image', undefined),
          weaponLoot: getAttr<number>(s, 'weaponLoot', 0),
          armorLoot: getAttr<number>(s, 'armorLoot', 0),
          accessoryLoot: getAttr<number>(s, 'accessoryLoot', 0),
          explored: getAttr<boolean>(s, 'explored', false),
          dictatorMilitia: getAttr<number>(s, 'dictatorMilitia', 0),
          rebelMilitia: getAttr<Record<string, number>>(s, 'rebelMilitia', {}),
        }));
      }
      return [];
    }

    return map.children
      .filter(
        (c: any) => c.className === 'Sector' || getAttr<string>(c, 'sectorId', '')
      )
      .map((c: any) => ({
        id: c.id,
        sectorId:
          c.ref ||
          getAttr<string>(c, 'sectorId', '') ||
          `sector-${getAttr<number>(c, 'row', 0)}-${getAttr<number>(c, 'col', 0)}`,
        sectorName: getAttr<string>(c, 'sectorName', ''),
        sectorType: getAttr<string>(c, 'sectorType', 'Wilderness'),
        value: getAttr<number>(c, 'value', 0),
        row: getAttr<number>(c, 'row', 0),
        col: getAttr<number>(c, 'col', 0),
        image: getAttr<string | undefined>(c, 'image', undefined),
        weaponLoot: getAttr<number>(c, 'weaponLoot', 0),
        armorLoot: getAttr<number>(c, 'armorLoot', 0),
        accessoryLoot: getAttr<number>(c, 'accessoryLoot', 0),
        explored: getAttr<boolean>(c, 'explored', false),
        dictatorMilitia: getAttr<number>(c, 'dictatorMilitia', 0),
        rebelMilitia: getAttr<Record<string, number>>(c, 'rebelMilitia', {}),
      }));
  });

  // Selected sector for SectorPanel (from clicking on map)
  const selectedSector = computed<Sector | null>(() => {
    if (!selectedSectorId.value) return null;
    return (
      sectors.value.find((s) => s.sectorId === selectedSectorId.value) || null
    );
  });

  // Sector from action context (followUp args) - for actions started from ActionPanel
  const actionContextSectorId = computed<number | null>(() => {
    const currentAction = deps.getCurrentAction();
    if (!currentAction) return null;

    // First, check if sectorId is explicitly in args
    const args = deps.getCurrentArgs();
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
      'explore',
      'collectEquipment',
      'armsDealer',
      'hospital',
      'train',
      'reEquip',
      'dropEquipment',
      'takeFromStash',
      'move',
      'docHeal',
      'squidheadDisarm',
      'squidheadArm',
    ];
    if (sectorRelevantActions.includes(currentAction)) {
      const isCurrentPlayerDictator = deps.isCurrentPlayerDictator();
      const dictatorPrimarySquad = deps.getDictatorPrimarySquad();
      const dictatorSecondarySquad = deps.getDictatorSecondarySquad();
      const primarySquad = deps.getPrimarySquad();

      // For dictator player, use dictator's squad location
      const squadSectorId = isCurrentPlayerDictator
        ? dictatorPrimarySquad?.sectorId || dictatorSecondarySquad?.sectorId
        : primarySquad?.sectorId;

      if (squadSectorId) {
        // Find the sector by sectorId string and return its numeric id
        const sector = sectors.value.find((s) => s.sectorId === squadSectorId);
        return sector?.id ?? null;
      }
    }

    return null;
  });

  // Active sector - from action context
  const actionContextSector = computed<Sector | null>(() => {
    if (!actionContextSectorId.value) return null;
    return (
      sectors.value.find((s) => s.id === actionContextSectorId.value) || null
    );
  });

  // The sector to show in SectorPanel - prefer clicked sector, fall back to action context
  const activeSector = computed<Sector | null>(() => {
    return selectedSector.value ?? actionContextSector.value;
  });

  // Get stash contents for active sector (if player can see it)
  const selectedSectorStash = computed<StashEquipment[]>(() => {
    if (!activeSector.value) return [];

    const primarySquad = deps.getPrimarySquad();
    const secondarySquad = deps.getSecondarySquad();
    const dictatorPrimarySquad = deps.getDictatorPrimarySquad();
    const dictatorSecondarySquad = deps.getDictatorSecondarySquad();
    const dictatorCard = deps.getDictatorCard();

    // Player can see stash if they have a squad or unit in the sector
    // Check rebel squads
    const hasRebelSquadInSector =
      primarySquad?.sectorId === activeSector.value.sectorId ||
      secondarySquad?.sectorId === activeSector.value.sectorId;

    // Check dictator squads and dictator combatant location
    const hasDictatorUnitInSector =
      dictatorPrimarySquad?.sectorId === activeSector.value.sectorId ||
      dictatorSecondarySquad?.sectorId === activeSector.value.sectorId ||
      (dictatorCard?.sectorId === activeSector.value.sectorId &&
        dictatorCard?.inPlay);

    if (!hasRebelSquadInSector && !hasDictatorUnitInSector) return [];

    // Find the sector element in gameView to get stash
    const sectorElement =
      findByRef(activeSector.value.sectorId) ||
      findAllByClassName('Sector').find(
        (s: any) =>
          getAttr<string>(s, 'sectorId', '') === activeSector.value?.sectorId
      );

    if (!sectorElement) return [];

    // Stash is stored as a Space zone named 'stash' containing Equipment children
    // Look for the Space zone in sector's children
    // Note: Element name from create(Space, 'stash') may be stored as name, ref, or in attributes
    const stashZone = sectorElement.children?.find(
      (c: any) =>
        c.className === 'Space' &&
        (c.name === 'stash' ||
          c.ref === 'stash' ||
          getAttr<string>(c, 'name', '') === 'stash')
    );

    if (!stashZone?.children) return [];

    // Get equipment from stash zone children (hide landmines — they're secret)
    return stashZone.children
      .filter((e: any) => e.className === 'Equipment')
      .map((e: any) => ({
        equipmentName: getAttr<string>(e, 'equipmentName', 'Unknown'),
        equipmentType: getAttr<string>(e, 'equipmentType', 'Accessory'),
        equipmentId: getAttr<string>(e, 'equipmentId', ''),
        description: getAttr<string>(e, 'description', ''),
        combatBonus: getAttr<number>(e, 'combatBonus', 0),
        initiative: getAttr<number>(e, 'initiative', 0),
        training: getAttr<number>(e, 'training', 0),
        armorBonus: getAttr<number>(e, 'armorBonus', 0),
        targets: getAttr<number>(e, 'targets', 0),
        negatesArmor: getAttr<boolean>(e, 'negatesArmor', false),
        image: getAttr<string>(e, 'image', ''),
      }))
      .filter((e: StashEquipment) => !e.equipmentId.includes('land-mine'));
  });

  // Get all mercs in active sector (for display in SectorPanel)
  const selectedSectorMercs = computed<any[]>(() => {
    if (!activeSector.value) return [];
    const allMercs = deps.getAllMercs();
    return allMercs.filter(
      (m: any) => m.sectorId === activeSector.value?.sectorId
    );
  });

  // Build control map
  const controlMap = computed<Record<string, string | undefined>>(() => {
    const map: Record<string, string | undefined> = {};
    const allMercs = deps.getAllMercs();

    for (const sector of sectors.value) {
      let dictatorUnits = sector.dictatorMilitia;
      const rebelUnits: Record<string, number> = {};

      const dictatorMercsInSector = allMercs.filter(
        (m: any) => m.sectorId === sector.sectorId && m.playerColor === 'dictator'
      );
      dictatorUnits += dictatorMercsInSector.length;

      // Militia uses player seat as key - convert to color name
      for (const [seatKey, count] of Object.entries(
        sector.rebelMilitia || {}
      )) {
        const color = deps.seatToColor(seatKey);
        rebelUnits[color] = (rebelUnits[color] || 0) + (count as number);
      }

      const rebelMercsInSector = allMercs.filter(
        (m: any) =>
          m.sectorId === sector.sectorId && m.playerColor !== 'dictator'
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

  // Ability flags - helper to get all mercs in current player's squads
  // Returns dictator squads when dictator is current player
  const getMercsInSquads = () => {
    if (deps.isCurrentPlayerDictator()) {
      const primary = deps.getDictatorPrimarySquad?.();
      const secondary = deps.getDictatorSecondarySquad?.();
      return [...(primary?.mercs || []), ...(secondary?.mercs || [])];
    }
    const primarySquad = deps.getPrimarySquad();
    const secondarySquad = deps.getSecondarySquad();
    return [...(primarySquad?.mercs || []), ...(secondarySquad?.mercs || [])];
  };

  // Check if player has Doc on team
  const hasDoc = computed<boolean>(() => {
    const allMercsInSquads = getMercsInSquads();
    return allMercsInSquads.some(
      (m: any) =>
        getAttrPure(m, 'combatantId', '').toLowerCase() === 'doc' ||
        getAttrPure(m, 'combatantName', '').toLowerCase() === 'doc'
    );
  });

  // Check if player has Squidhead on team
  const hasSquidhead = computed<boolean>(() => {
    const allMercsInSquads = getMercsInSquads();
    return allMercsInSquads.some(
      (m: any) =>
        getAttrPure(m, 'combatantId', '').toLowerCase() === 'squidhead' ||
        getAttrPure(m, 'combatantName', '').toLowerCase() === 'squidhead'
    );
  });

  // Check if player has mortar equipped (in accessory slot or bandolier)
  const hasMortar = computed<boolean>(() => {
    const allMercsInSquads = getMercsInSquads();

    const result = allMercsInSquads.some((m: any) => {
      // Check accessory slot - try Data version (serialized) first, then direct
      const accessory = getAttrPure<{ equipmentName?: string } | null>(m, 'accessorySlotData', null) ||
                        getAttrPure<{ equipmentName?: string } | null>(m, 'accessorySlot', null);
      const accessoryName = accessory?.equipmentName?.toLowerCase() || '';
      if (accessoryName.includes('mortar')) return true;

      // Check bandolier slots - use Data version (serialized)
      const bandolierSlots = getAttrPure<any[]>(m, 'bandolierSlotsData', []);
      return bandolierSlots.some((e: any) => {
        const name = e?.equipmentName?.toLowerCase() || '';
        return name.includes('mortar');
      });
    });

    return result;
  });

  // Check if player has damaged MERCs
  const hasDamagedMercs = computed<boolean>(() => {
    const allMercsInSquads = getMercsInSquads();
    return allMercsInSquads.some((m: any) => {
      const damage = getAttrPure(m, 'damage', 0);
      return damage > 0;
    });
  });

  // Check if selected sector has land mines in stash (checks unfiltered stash data)
  const hasLandMinesInStash = computed<boolean>(() => {
    if (!activeSector.value) return false;

    const sectorElement =
      findByRef(activeSector.value.sectorId) ||
      findAllByClassName('Sector').find(
        (s: any) =>
          getAttr<string>(s, 'sectorId', '') === activeSector.value?.sectorId
      );
    if (!sectorElement) return false;

    const stashZone = sectorElement.children?.find(
      (c: any) =>
        c.className === 'Space' &&
        (c.name === 'stash' ||
          c.ref === 'stash' ||
          getAttr<string>(c, 'name', '') === 'stash')
    );
    if (!stashZone?.children) return false;

    return stashZone.children.some(
      (e: any) =>
        e.className === 'Equipment' &&
        getAttr<string>(e, 'equipmentId', '').includes('land-mine')
    );
  });

  // Check if Squidhead has land mine equipped
  const squidheadHasLandMine = computed<boolean>(() => {
    const allMercsInSquads = getMercsInSquads();
    const squidhead = allMercsInSquads.find(
      (m: any) =>
        getAttrPure(m, 'combatantId', '').toLowerCase() === 'squidhead' ||
        getAttrPure(m, 'combatantName', '').toLowerCase() === 'squidhead'
    );
    if (!squidhead) return false;

    // Check accessory slot - try Data version (serialized) first, then direct
    const accessory = getAttrPure<{ equipmentName?: string } | null>(squidhead, 'accessorySlotData', null) ||
                      getAttrPure<{ equipmentName?: string } | null>(squidhead, 'accessorySlot', null);
    const accessoryName = accessory?.equipmentName?.toLowerCase() || '';
    return (
      accessoryName.includes('land mine') || accessoryName.includes('landmine')
    );
  });

  return {
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
  };
}
