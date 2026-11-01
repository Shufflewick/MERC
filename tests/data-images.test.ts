import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import combatants from '../data/combatants.json';
import equipment from '../data/equipment.json';
import sectors from '../data/sectors.json';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

describe('data image paths', () => {
  it.each([
    ['combatants.json', combatants],
    ['equipment.json', equipment],
    ['sectors.json', sectors],
  ])('every image in %s names a file under public/', (_name, entries) => {
    const missing = entries.map(e => e.image).filter(image => !existsSync(publicDir + image));
    expect(missing).toEqual([]);
  });
});
