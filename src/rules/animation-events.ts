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
