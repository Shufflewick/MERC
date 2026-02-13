import type { MERCGame } from './game.js';
import type { CombatantModel, Equipment } from './elements.js';

export interface MapCombatantEventData {
  combatantId: string;
  combatantName: string;
  image?: string;
  playerColor?: string;
  sectorId: string;
}

export interface MapCombatantMoveEventData extends MapCombatantEventData {
  fromSectorId: string;
  toSectorId: string;
}

export interface MapEquipmentEventData {
  equipmentName: string;
  equipmentType: string;
  image?: string;
  sectorId: string;
  combatantId?: string;
  direction: 'incoming' | 'outgoing';
}

export interface MapMilitiaTrainEventData {
  sectorId: string;
  count: number;
  isDictator: boolean;
  playerId?: string;
  startValue: number;
}

export function getMapCombatantId(combatant: { combatantId: string; isDictator?: boolean }): string {
  return combatant.isDictator ? `dictator-${combatant.combatantId}` : combatant.combatantId;
}

export function buildMapCombatantEntry(
  combatant: CombatantModel,
  sectorId: string
): MapCombatantEventData {
  return {
    combatantId: getMapCombatantId(combatant),
    combatantName: combatant.combatantName,
    image: combatant.image,
    playerColor: combatant.playerColor,
    sectorId,
  };
}

export function buildMapCombatantMove(
  combatant: CombatantModel,
  fromSectorId: string,
  toSectorId: string
): MapCombatantMoveEventData {
  return {
    combatantId: getMapCombatantId(combatant),
    combatantName: combatant.combatantName,
    image: combatant.image,
    playerColor: combatant.playerColor,
    sectorId: toSectorId,
    fromSectorId,
    toSectorId,
  };
}

export function emitMapCombatantEntries(
  game: MERCGame,
  entries: MapCombatantEventData[]
): void {
  if (!entries.length) return;
  game.animate('map-combatant-enter', { combatants: entries });
}

export function emitMapCombatantMoves(
  game: MERCGame,
  moves: MapCombatantMoveEventData[]
): void {
  if (!moves.length) return;
  game.animate('map-combatant-move', { moves });
}

export function emitMapCombatantDeaths(
  game: MERCGame,
  deaths: MapCombatantEventData[]
): void {
  if (!deaths.length) return;
  game.animate('map-combatant-death', { combatants: deaths });
}

export function emitMapCombatantDeathFromModel(
  game: MERCGame,
  combatant: CombatantModel,
  sectorId?: string
): void {
  const resolvedSectorId = sectorId || combatant.sectorId;
  if (!resolvedSectorId) return;
  emitMapCombatantDeaths(game, [buildMapCombatantEntry(combatant, resolvedSectorId)]);
}

export function emitMapCombatantDeathFromData(
  game: MERCGame,
  data: MapCombatantEventData | null
): void {
  if (!data) return;
  emitMapCombatantDeaths(game, [data]);
}

export function buildMapEquipmentAnimation(
  equipment: Equipment,
  sectorId: string,
  direction: 'incoming' | 'outgoing',
  combatantId?: string
): MapEquipmentEventData {
  return {
    equipmentName: equipment.equipmentName,
    equipmentType: equipment.equipmentType,
    image: equipment.image,
    sectorId,
    combatantId,
    direction,
  };
}

export function emitMapEquipmentAnimations(
  game: MERCGame,
  animations: MapEquipmentEventData[]
): void {
  if (!animations.length) return;
  game.animate('map-equipment', { animations });
}

export function emitMapMilitiaTrain(
  game: MERCGame,
  animations: MapMilitiaTrainEventData[]
): void {
  if (!animations.length) return;
  game.animate('map-militia-train', { animations });
}

// =============================================================================
// Equip Spectator — Session-Based Events
// =============================================================================

export interface CombatantStatSnapshot {
  combat: number;
  initiative: number;
  training: number;
  targets: number;
  armor: number;
  health: number;
  maxHealth: number;
}

export function snapshotCombatantStats(unit: CombatantModel): CombatantStatSnapshot {
  return {
    combat: unit.combat,
    initiative: unit.initiative,
    training: unit.training,
    targets: unit.targets,
    armor: unit.effectiveArmor,
    health: unit.health,
    maxHealth: unit.maxHealth,
  };
}

/**
 * Serialize a CombatantModel into a plain object suitable for CombatantCard props.
 * Uses the same toSlotData pattern as syncEquipmentData() in elements.ts.
 */
export interface SerializedEquipmentSlot {
  equipmentId: string;
  equipmentName: string;
  equipmentType: string;
  description?: string;
  combatBonus?: number;
  initiative?: number;
  training?: number;
  targets?: number;
  armorBonus?: number;
  armorDamage?: number;
  negatesArmor?: boolean;
  isDamaged?: boolean;
  serial?: number;
  image?: string;
}

export interface SerializedCombatant {
  combatantId: string;
  combatantName: string;
  image?: string;
  baseCombat: number;
  baseInitiative: number;
  baseTraining: number;
  combat: number;
  initiative: number;
  training: number;
  targets: number;
  health: number;
  maxHealth: number;
  damage: number;
  actionsRemaining: number;
  ability?: string;
  weaponSlotData: SerializedEquipmentSlot | null;
  armorSlotData: SerializedEquipmentSlot | null;
  accessorySlotData: SerializedEquipmentSlot | null;
  bandolierSlotsData: SerializedEquipmentSlot[];
}

function serializeEquipSlot(equip: Equipment | undefined): SerializedEquipmentSlot | null {
  if (!equip) return null;
  return {
    equipmentId: equip.equipmentId,
    equipmentName: equip.equipmentName,
    equipmentType: equip.equipmentType,
    description: equip.description,
    combatBonus: equip.combatBonus,
    initiative: equip.initiative,
    training: equip.training,
    targets: equip.targets,
    armorBonus: equip.armorBonus,
    armorDamage: equip.armorDamage,
    negatesArmor: equip.negatesArmor,
    isDamaged: equip.isDamaged,
    serial: equip.serial,
    image: equip.image,
  };
}

export function serializeCombatantForCard(unit: CombatantModel): SerializedCombatant {
  return {
    combatantId: unit.combatantId,
    combatantName: unit.combatantName,
    image: unit.image,
    baseCombat: unit.baseCombat,
    baseInitiative: unit.baseInitiative,
    baseTraining: unit.baseTraining,
    combat: unit.combat,
    initiative: unit.initiative,
    training: unit.training,
    targets: unit.targets,
    health: unit.health,
    maxHealth: unit.maxHealth,
    damage: unit.damage,
    actionsRemaining: unit.actionsRemaining,
    ability: unit.ability,
    weaponSlotData: serializeEquipSlot(unit.weaponSlot),
    armorSlotData: serializeEquipSlot(unit.armorSlot),
    accessorySlotData: serializeEquipSlot(unit.accessorySlot),
    bandolierSlotsData: unit.bandolierSlots.map(e => serializeEquipSlot(e)!),
  };
}

// --- Session event data types ---

export interface EquipSessionStartData {
  combatantId: string;
  combatant: SerializedCombatant;
  playerColor?: string;
  playerName?: string;
}

export interface EquipUpdateData {
  combatantId: string;
  updatedCombatant: SerializedCombatant;
  equippedItem?: { name: string; type: string; image?: string };
  removedItems?: Array<{ name: string; type: string; image?: string }>;
}

export interface EquipSessionEndData {
  combatantId: string;
}

// --- Session emitters ---

/**
 * Opens (or updates) the spectator equip panel for other players.
 * Non-blocking (skip: 'run') — idempotent, safe to emit multiple times.
 */
export function emitEquipSessionStart(game: MERCGame, unit: CombatantModel, playerName?: string): void {
  const data: EquipSessionStartData = {
    combatantId: unit.combatantId,
    combatant: serializeCombatantForCard(unit),
    playerColor: unit.playerColor,
    playerName,
  };
  game.animate('equip-session-start', data as unknown as Record<string, unknown>, () => {});
}

/**
 * Closes the spectator equip panel.
 * Non-blocking (skip: 'drop').
 */
export function emitEquipSessionEnd(game: MERCGame, combatantId: string): void {
  const data: EquipSessionEndData = { combatantId };
  game.animate('equip-session-end', data as unknown as Record<string, unknown>, () => {});
}

/**
 * Emits an individual equip update with fly-in/fly-out data.
 * Blocks briefly for fly animation (skip: 'drop').
 */
export function emitEquipUpdate(
  game: MERCGame,
  unit: CombatantModel,
  equippedItem?: { name: string; type: string; image?: string },
  removedItems?: Array<{ name: string; type: string; image?: string }>,
): void {
  const data: EquipUpdateData = {
    combatantId: unit.combatantId,
    updatedCombatant: serializeCombatantForCard(unit),
    equippedItem,
    removedItems,
  };
  game.animate('equip-update', data as unknown as Record<string, unknown>, () => {});
}
