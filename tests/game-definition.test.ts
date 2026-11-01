import { describe, it, expect } from 'vitest';
import { gameDefinition } from '../src/rules/index';
import config from '../boardsmith.json';

describe('game definition', () => {
  // boardsmith.json's colorPalette is what the lobby offers; a code colour option makes dev refuse to start.
  it('leaves the colour option to boardsmith.json', () => {
    expect(gameDefinition.playerOptions).not.toHaveProperty('color');
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
