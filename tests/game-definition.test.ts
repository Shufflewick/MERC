import { describe, it, expect } from 'vitest';
import { gameDefinition } from '../src/rules/index';
import config from '../boardsmith.json';

describe('game definition', () => {
  // boardsmith.json's colorPalette and role option are what the lobby offers; code player options make dev refuse to start.
  it('leaves the player options to boardsmith.json', () => {
    expect(gameDefinition).not.toHaveProperty('playerOptions');
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
