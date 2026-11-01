import { describe, it, expect } from 'vitest';
import { gameDefinition } from '../src/rules/index';

describe('game definition', () => {
  // boardsmith.json's colorPalette is what the lobby offers; a code colour option makes dev refuse to start.
  it('leaves the colour option to boardsmith.json', () => {
    expect(gameDefinition.playerOptions).not.toHaveProperty('color');
  });
});
