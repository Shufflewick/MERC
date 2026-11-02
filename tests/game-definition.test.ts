import { describe, it, expect } from 'vitest';
import { gameDefinition } from '../src/rules/index';
import config from '../boardsmith.json';

describe('game definition', () => {
  // BoardSmith refuses a gameDefinition that declares gameOptions; they live in boardsmith.json.
  it('leaves the game options to boardsmith.json', () => {
    expect(gameDefinition).not.toHaveProperty('gameOptions');
  });

  // boardsmith.json's colorPalette and role option are what the lobby offers; code player options make dev refuse to start.
  it('leaves the player options to boardsmith.json', () => {
    expect(gameDefinition).not.toHaveProperty('playerOptions');
  });

  it('leaves to a bot each preset seat its name does not give to people', () => {
    const botSeats = Object.fromEntries(gameDefinition.presets.map((preset) => [
      preset.name,
      preset.players.flatMap((seat, i) => ('isBot' in seat && seat.isBot ? [i + 1] : [])),
    ]));
    expect(botSeats).toEqual({
      'Play as Rebel': [2],
      'Play as Dictator': [2],
      '2 Rebels vs Bot Dictator': [3],
      '3 Rebels vs Bot Dictator': [4],
    });
  });

  it('seats every preset player in a colour from the palette', () => {
    const palette = config.colorPalette.map((c) => c.hex);
    for (const preset of gameDefinition.presets) {
      for (const player of preset.players) {
        expect(palette, preset.name).toContain(player.color);
      }
    }
  });
});
