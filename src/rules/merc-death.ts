/**
 * Shared MERC death pipeline.
 *
 * A MERC can be killed in several places — combat rounds, the militia batch,
 * post-combat cleanup, Pinochet's damage spread, Tainted Water, land mines — and
 * every one of them owes the same sequence: offer an Epinephrine Shot, discard
 * the MERC's equipment (staging it for Gaddafi's loot when he is the dictator),
 * then move the card to the MERC discard pile. This module is that sequence.
 */

import type { MERCGame } from './game.js';
import type { CombatantModel, Equipment, EquipmentType } from './elements.js';
import { isEpinephrine } from './equipment-effects.js';

/** Every equipment slot a MERC can be holding something in. */
function allEquippedItems(merc: CombatantModel): Array<{ item: Equipment; slot: 'Weapon' | 'Armor' | 'Accessory' | 'Bandolier' }> {
  const items: Array<{ item: Equipment; slot: 'Weapon' | 'Armor' | 'Accessory' | 'Bandolier' }> = [];
  if (merc.weaponSlot) items.push({ item: merc.weaponSlot, slot: 'Weapon' });
  if (merc.armorSlot) items.push({ item: merc.armorSlot, slot: 'Armor' });
  if (merc.accessorySlot) items.push({ item: merc.accessorySlot, slot: 'Accessory' });
  for (const item of merc.bandolierSlots) items.push({ item, slot: 'Bandolier' });
  return items;
}

/** True when this MERC is carrying an Epinephrine Shot in any slot. */
export function carriesEpinephrine(merc: CombatantModel): boolean {
  if (merc.accessorySlot && isEpinephrine(merc.accessorySlot.equipmentId)) return true;
  return merc.bandolierSlots.some(e => isEpinephrine(e.equipmentId));
}

/**
 * Everyone who could spend an Epinephrine Shot on `dying`.
 *
 * The card reads "prevent the death of self or another MERC", so the dying MERC
 * is included: he is at 0 health but the shot is still in his pocket.
 */
export function getEpinephrineSavers(game: MERCGame, dying: CombatantModel): CombatantModel[] {
  const squadmates: CombatantModel[] = [];

  if (game.dictatorPlayer?.hiredMercs.some(m => m.id === dying.id)) {
    squadmates.push(...game.dictatorPlayer.hiredMercs);
  } else {
    for (const rebel of game.rebelPlayers) {
      const squadMercs = [...rebel.primarySquad.getMercs(), ...rebel.secondarySquad.getMercs()];
      if (squadMercs.some(m => m.id === dying.id)) {
        squadmates.push(...squadMercs);
        break;
      }
    }
  }

  return squadmates
    .filter(m => m.id === dying.id || !m.isDead)
    .filter(carriesEpinephrine);
}

/**
 * Spend `holder`'s Epinephrine Shot to bring `dying` back to 1 health.
 * Returns false if the shot could not be removed from its slot.
 */
export function applyEpinephrineSave(
  game: MERCGame,
  dying: CombatantModel,
  holder: CombatantModel
): boolean {
  let shot: Equipment | undefined;
  if (holder.accessorySlot && isEpinephrine(holder.accessorySlot.equipmentId)) {
    shot = holder.unequip('Accessory');
  } else {
    const index = holder.bandolierSlots.findIndex(e => isEpinephrine(e.equipmentId));
    if (index >= 0) shot = holder.unequipBandolierSlot(index);
  }
  if (!shot) return false;

  const discard = game.getEquipmentDiscard('Accessory');
  if (discard) shot.putInto(discard);

  dying.damage = dying.maxHealth - 1;
  const who = holder.id === dying.id ? 'his own' : `${holder.combatantName}'s`;
  game.message(`${dying.combatantName} is saved by ${who} Epinephrine Shot!`);
  return true;
}

/**
 * Discard everything a dead MERC was carrying.
 * When Gaddafi is the dictator, rebel MERC gear is staged for his post-combat loot.
 */
export function discardMercEquipment(game: MERCGame, merc: CombatantModel): void {
  for (const { item, slot } of allEquippedItems(merc)) {
    const removed = slot === 'Bandolier'
      ? merc.unequipBandolierSlot(merc.bandolierSlots.findIndex(e => e.id === item.id))
      : merc.unequip(slot);
    if (!removed) continue;

    const discard = game.getEquipmentDiscard(removed.equipmentType as EquipmentType);
    if (discard) removed.putInto(discard);

    if (game.dictatorPlayer?.dictator?.combatantId === 'gadafi'
        && game.activeCombat
        && !merc.isDictator) {
      if (!game._gaddafiLootableEquipment) game._gaddafiLootableEquipment = [];
      game._gaddafiLootableEquipment.push({
        equipmentId: removed.id,
        sectorId: game.activeCombat.sectorId,
      });
    }
  }
}

/**
 * The full death sequence for a MERC that is already at 0 health and was not saved:
 * discard his equipment, then move his card to the MERC discard pile.
 */
export function handleMercDeath(game: MERCGame, merc: CombatantModel, causeMessage: string): void {
  discardMercEquipment(game, merc);
  merc.putInto(game.mercDiscard);
  game.message(causeMessage);
}

/**
 * Kill a MERC outside of combat: try an automatic Epinephrine save first, and run
 * the death sequence if none is available. Returns true when the MERC died.
 *
 * Combat has its own path because a human player is offered the choice of which
 * squadmate spends the shot; outside combat there is no pause point, so the first
 * available shot is used (the dying MERC's own shot first, per the card).
 */
export function killMercOutsideCombat(
  game: MERCGame,
  merc: CombatantModel,
  causeMessage: string
): boolean {
  if (!merc.isDead) return false;

  const savers = getEpinephrineSavers(game, merc);
  const preferred = savers.find(m => m.id === merc.id) ?? savers[0];
  if (preferred && applyEpinephrineSave(game, merc, preferred)) return false;

  handleMercDeath(game, merc, causeMessage);
  return true;
}
