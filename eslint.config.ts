import boardsmith from 'boardsmith/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

/**
 * The seven rules BoardSmith treats as non-negotiable for game code: no
 * network, no filesystem, no timers, no nondeterminism, no eval, no element
 * identity comparison, no element array state. `npx boardsmith lint` only
 * approximates these with regexes; these are the real AST implementations.
 *
 * Vue SFCs are not covered: parsing them needs vue-eslint-parser, which is a
 * dependency this repo has not taken on. The rules layer, where determinism
 * and element identity actually matter, is fully covered.
 */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'vendor/**', 'public/**'],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
  {
    ...boardsmith.configs.recommended,
    files: ['src/**/*.ts'],
  },
  {
    // Animation components legitimately schedule work with timers and rAF;
    // the rules layer must not, and does not.
    files: ['src/ui/**/*.ts'],
    rules: {
      'boardsmith/no-timers': 'off',
    },
  },
];
