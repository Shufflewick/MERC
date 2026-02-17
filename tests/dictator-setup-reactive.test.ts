import { describe, it, expect } from 'vitest';
import { GameRunner } from 'boardsmith/runtime';
import { MERCGame } from '../src/rules/game.js';
import { CombatantModel, Equipment, TacticsCard } from '../src/rules/elements.js';
import {
  applyHusseinSetupAbility,
  applyMaoSetupAbility,
  applyMussoliniSetupAbility,
  processGaddafiLoot,
  applyPinochetPendingHires,
  applyPinochetDamageSpread,
} from '../src/rules/dictator-abilities.js';

/**
 * Dictator Setup & Reactive Ability Tests (62-02)
 *
 * Tests for:
 * - Setup abilities: Hussein (10 tactics), Mao (bonus MERCs), Mussolini (bonus MERCs)
 * - Reactive abilities: Gaddafi loot, Pinochet pending hires, Pinochet damage spread, Pol Pot conditional hire
 */

/**
 * Create a 2-player GameRunner with AI dictator set to a specific dictator character.
 * Returns the runner already started (flow is ready but not advanced past first step).
 */
function createDictatorGame(dictatorId: string, seed: string): { runner: GameRunner<MERCGame>; game: MERCGame } {
  const runner = new GameRunner<MERCGame>({
    GameClass: MERCGame,
    gameType: 'merc',
    gameOptions: {
      playerCount: 2,
      playerNames: ['Rebel1', 'DictatorBot'],
      seed,
      dictatorIsAI: true,
      dictatorChoice: dictatorId,
      playerConfigs: [
        { color: '#e74c3c', isDictator: false, isAI: true },
        { color: '#95a5a6', isDictator: true, isAI: true, aiLevel: 'medium' },
      ],
    } as any,
  });
  runner.start();
  return { runner, game: runner.game };
}

/**
 * Manually hire a MERC into the dictator's primary squad at a given sector.
 * Returns the hired MERC, or undefined if no MERCs available.
 */
function hireDictatorMerc(game: MERCGame, sectorId: string): CombatantModel | undefined {
  const merc = game.drawMerc();
  if (!merc) return undefined;

  const squad = game.dictatorPlayer.primarySquad;
  merc.putInto(squad);
  squad.sectorId = sectorId;
  return merc;
}

describe('Setup Abilities', () => {
  it('Hussein setup expands tactics deck to 10 cards', () => {
    const { game } = createDictatorGame('hussein', 'hussein-setup-test');

    expect(game.dictatorPlayer.dictator).toBeDefined();
    expect(game.dictatorPlayer.dictator!.combatantId).toBe('hussein');

    // The tactics deck starts with 5 cards (standard setup)
    const deckBefore = game.dictatorPlayer.tacticsDeck.count(TacticsCard);
    expect(deckBefore).toBe(5);

    // Apply Hussein's setup ability
    const result = applyHusseinSetupAbility(game);
    expect(result.success).toBe(true);

    // Deck should now have 10 cards
    const deckAfter = game.dictatorPlayer.tacticsDeck.count(TacticsCard);
    expect(deckAfter).toBe(10);
    expect(result.data?.deckSize).toBe(10);
  });

  it('Mao setup hires bonus MERCs equal to rebel count', () => {
    const { game } = createDictatorGame('mao', 'mao-setup-test');

    expect(game.dictatorPlayer.dictator!.combatantId).toBe('mao');
    expect(game.dictatorPlayer.isAI).toBe(true);

    // Record current MERC count (should be 0 since flow hasn't advanced to Day 1 hire)
    const mercsBefore = game.dictatorPlayer.hiredMercs.length;

    // Apply Mao's setup ability (AI path auto-hires)
    const result = applyMaoSetupAbility(game);
    expect(result.success).toBe(true);
    expect(result.data?.hired).toBe(game.rebelCount);

    // Verify MERCs increased by rebel count (1 rebel in 2-player game)
    const mercsAfter = game.dictatorPlayer.hiredMercs.length;
    expect(mercsAfter).toBe(mercsBefore + game.rebelCount);
    expect(game.rebelCount).toBe(1);
  });

  it('Mussolini setup hires bonus MERCs equal to rebel count', () => {
    const { game } = createDictatorGame('mussolini', 'mussolini-setup-test');

    expect(game.dictatorPlayer.dictator!.combatantId).toBe('mussolini');
    expect(game.dictatorPlayer.isAI).toBe(true);

    const mercsBefore = game.dictatorPlayer.hiredMercs.length;

    const result = applyMussoliniSetupAbility(game);
    expect(result.success).toBe(true);
    expect(result.data?.hired).toBe(game.rebelCount);

    const mercsAfter = game.dictatorPlayer.hiredMercs.length;
    expect(mercsAfter).toBe(mercsBefore + game.rebelCount);
  });
});

describe('Reactive Abilities', () => {
  it('Gaddafi loot equips dictator MERCs with looted equipment', () => {
    const { game } = createDictatorGame('gadafi', 'gadafi-loot-test');

    expect(game.dictatorPlayer.dictator!.combatantId).toBe('gadafi');

    // Manually place a dictator MERC in a sector
    const sectors = game.gameMap.getAllSectors();
    const targetSector = sectors[0];
    const merc = hireDictatorMerc(game, targetSector.sectorId);
    expect(merc).toBeDefined();

    // Strip weapon from MERC so it has an open slot
    if (merc!.weaponSlot) {
      const existing = merc!.unequip('Weapon');
      if (existing) {
        const discard = game.getEquipmentDiscard('Weapon');
        if (discard) existing.putInto(discard);
      }
    }
    expect(merc!.weaponSlot).toBeUndefined();

    // Draw a weapon to the discard pile (simulating dead rebel equipment)
    const weapon = game.drawEquipment('Weapon');
    expect(weapon).toBeDefined();
    const weaponId = weapon!.id; // BoardSmith element ID (number)

    // Verify weapon is in the discard pile
    const weaponDiscard = game.getEquipmentDiscard('Weapon');
    expect(weaponDiscard).toBeDefined();
    const found = weaponDiscard!.first(Equipment, e => e.id === weaponId);
    expect(found).toBeDefined();

    // Stage lootable equipment for Gaddafi
    game._gaddafiLootableEquipment = [
      { equipmentId: weaponId, sectorId: targetSector.sectorId },
    ];

    // Process Gaddafi loot
    processGaddafiLoot(game);

    // Verify the MERC received the weapon
    expect(merc!.weaponSlot).toBeDefined();
    expect(merc!.weaponSlot!.id).toBe(weaponId);

    // Verify loot queue was cleared
    expect(game._gaddafiLootableEquipment).toBeNull();
  });

  it('Pinochet pending hires draws and places MERCs', () => {
    const { game } = createDictatorGame('pinochet', 'pinochet-hire-test');

    expect(game.dictatorPlayer.dictator!.combatantId).toBe('pinochet');

    const mercsBefore = game.dictatorPlayer.hiredMercs.length;

    // Set pending hires to 1 (simulating a sector loss)
    game._pinochetPendingHires = 1;

    // Apply pending hires
    applyPinochetPendingHires(game);

    // Verify a MERC was hired
    const mercsAfter = game.dictatorPlayer.hiredMercs.length;
    expect(mercsAfter).toBe(mercsBefore + 1);

    // Verify pending hires counter was cleared
    expect(game._pinochetPendingHires).toBe(0);
  });

  it('Pinochet damage spread distributes damage to rebel forces', () => {
    const { game } = createDictatorGame('pinochet', 'pinochet-damage-test');

    expect(game.dictatorPlayer.dictator!.combatantId).toBe('pinochet');

    const rebel = game.rebelPlayers[0];

    // Draw and place a MERC for the rebel
    const rebelMerc = game.drawMerc();
    expect(rebelMerc).toBeDefined();
    rebelMerc!.putInto(rebel.primarySquad);

    // Place the squad in a sector with rebel militia for control
    const sectors = game.gameMap.getAllSectors();
    const targetSector = sectors[0];
    rebel.primarySquad.sectorId = targetSector.sectorId;
    targetSector.addRebelMilitia(`${rebel.seat}`, 3);

    // Verify rebel controls at least 1 sector
    const controlledSectors = game.getControlledSectors(rebel);
    expect(controlledSectors.length).toBeGreaterThan(0);

    // Record initial state
    const damageBefore = rebelMerc!.damage;
    const militiaBefore = targetSector.getRebelMilitia(`${rebel.seat}`);

    // Apply Pinochet damage spread
    applyPinochetDamageSpread(game);

    // Verify damage was applied: MERC took damage or militia was removed
    const damageAfter = rebelMerc!.damage;
    const militiaAfter = targetSector.getRebelMilitia(`${rebel.seat}`);

    const totalDamageApplied = (damageAfter - damageBefore) + (militiaBefore - militiaAfter);
    expect(totalDamageApplied).toBeGreaterThan(0);
  });

  it('Pinochet pending hires with 0 pending does nothing', () => {
    const { game } = createDictatorGame('pinochet', 'pinochet-noop-test');

    const mercsBefore = game.dictatorPlayer.hiredMercs.length;
    game._pinochetPendingHires = 0;

    applyPinochetPendingHires(game);

    expect(game.dictatorPlayer.hiredMercs.length).toBe(mercsBefore);
  });

  it('Pol Pot conditional hire is flow-driven (structural verification)', () => {
    // Pol Pot's conditional hire (hire 1 MERC after lost combat) is implemented
    // in flow.ts as a post-combat execute step, not as a standalone function.
    // Verify the structural presence of the Pol Pot flow pattern.
    const { readFileSync } = require('fs');
    const flowSource = readFileSync('src/rules/flow.ts', 'utf-8');

    // Pol Pot combat outcome capture and conditional hire
    expect(flowSource).toContain('_polpotTargetSectorId');
    expect(flowSource).toContain('lastAbilityCombatOutcome');
    expect(flowSource).toContain('polpot-bonus-hire');

    // AI auto-hire path
    expect(flowSource).toContain('Pol Pot lost combat - hired');

    // Full integration testing of Pol Pot's conditional hire is covered in Plan 03
    // (requires combat resolution flow, which is an integration-level concern)
  });

  it('Gaddafi loot with no staged equipment does nothing', () => {
    const { game } = createDictatorGame('gadafi', 'gadafi-noop-test');

    // No staged equipment -- should return immediately without error
    game._gaddafiLootableEquipment = null;
    processGaddafiLoot(game);

    // Empty array -- should also return immediately
    game._gaddafiLootableEquipment = [];
    processGaddafiLoot(game);
  });

  it('Pinochet pending hires processes multiple hires', () => {
    const { game } = createDictatorGame('pinochet', 'pinochet-multi-hire-test');

    expect(game.dictatorPlayer.dictator!.combatantId).toBe('pinochet');

    const mercsBefore = game.dictatorPlayer.hiredMercs.length;

    // Set pending hires to 3 (simulating multiple sector losses)
    game._pinochetPendingHires = 3;

    applyPinochetPendingHires(game);

    // Verify 3 MERCs were hired
    const mercsAfter = game.dictatorPlayer.hiredMercs.length;
    expect(mercsAfter).toBe(mercsBefore + 3);

    // Counter fully cleared
    expect(game._pinochetPendingHires).toBe(0);
  });

  it('Pinochet damage spread with no rebel sectors does nothing', () => {
    const { game } = createDictatorGame('pinochet', 'pinochet-no-rebels-test');

    // No rebel militia or MERCs placed -- rebels control 0 sectors
    const rebel = game.rebelPlayers[0];
    const controlledSectors = game.getControlledSectors(rebel);
    expect(controlledSectors.length).toBe(0);

    // Should return without error (no damage to spread)
    applyPinochetDamageSpread(game);
  });

  it('Gaddafi loot skips equipment when no MERC has an open slot', () => {
    const { game } = createDictatorGame('gadafi', 'gadafi-full-slots-test');

    // Manually place a dictator MERC with a weapon already equipped
    const sectors = game.gameMap.getAllSectors();
    const targetSector = sectors[0];
    const merc = hireDictatorMerc(game, targetSector.sectorId);
    expect(merc).toBeDefined();

    // Equip a weapon so slot is full
    if (!merc!.weaponSlot) {
      const weapon = game.drawEquipment('Weapon');
      expect(weapon).toBeDefined();
      merc!.equip(weapon!);
    }
    expect(merc!.weaponSlot).toBeDefined();

    // Draw another weapon to discard (the loot candidate)
    const extraWeapon = game.drawEquipment('Weapon');
    expect(extraWeapon).toBeDefined();
    const weaponId = extraWeapon!.id;

    // Stage loot -- weapon type, but MERC already has a weapon
    game._gaddafiLootableEquipment = [
      { equipmentId: weaponId, sectorId: targetSector.sectorId },
    ];

    // Process loot -- should skip since no open weapon slots
    processGaddafiLoot(game);

    // Loot queue was consumed (set to null)
    expect(game._gaddafiLootableEquipment).toBeNull();

    // The extra weapon should still be in the discard (not equipped)
    const weaponDiscard = game.getEquipmentDiscard('Weapon');
    const stillInDiscard = weaponDiscard!.first(Equipment, e => e.id === weaponId);
    expect(stillInDiscard).toBeDefined();
  });
});
