# Bug: `boardsmith lint` reports ~123 false positives on a clean codebase (element-equality, loop-no-max)

## Summary

Two of the CLI lint's heuristics fire on code that already follows the pattern they recommend. On MERC they produce every single finding the linter reports — 112 warnings and 11 info, none of them real — which trains authors to ignore the tool.

## 1. `element-equality`: 112 warnings, all false positives

The check is a regex, not an AST rule (`src/cli/commands/lint.ts:59`):

```js
/===\s*(?:card|piece|element|merc|squad|sector)/gi
```

It matches on the identifier to the **right** of `===`, so it fires on exactly the ID comparison the warning tells you to write:

```ts
m.id === merc.id            // src/rules/game.ts:322      -> flagged
c.id === card.id            // src/rules/actions/dictator-actions.ts:100 -> flagged
s.sectorId === sectorId     // src/ui/composables/useSquadState.ts:96    -> flagged
s.sectorId === sector.sectorId // src/rules/flow.ts:1165  -> flagged
```

The warning text is *"use element.equals() or compare IDs"*. Every flagged line compares IDs.

Spot-checking ~10 flagged lines across `src/rules/` and `src/ui/` found no genuine element-reference comparison. A targeted grep for real `element === element` comparisons in MERC finds essentially none.

The precise implementation already exists in this repo — `src/eslint-plugin/rules/no-element-identity-comparison.ts` is an AST rule and gets this right. The CLI heuristic should either reuse it or be dropped.

## 2. `loop-no-max`: 11 info, all false positives

Every `loop-no-max` finding on MERC points at a `loop({...})` that **does** set `maxIterations`. The detector appears to look only a short distance past the `while:` key, so any loop whose `while` predicate spans more than a couple of lines is reported even though `maxIterations` follows it.

Verified for all 11 findings in `src/rules/flow.ts`:

| Reported line | `maxIterations` actually present at |
|---|---|
| 516 | +2 lines |
| 622 | +11 |
| 645 | +19 |
| 711 | +13 |
| 960, 972 | +2 |
| 988 | +16 |
| 1145, 1157, 1254, 1339 | +2 |

## Steps to reproduce

1. Check out a codebase that compares element IDs (not references) and sets `maxIterations` on multi-line `while` loops — MERC at commit `HEAD` of `main` will do.
2. `npx boardsmith lint`
3. Observe: `Checked 45 files / Found 112 warning(s), 11 info / Lint passed`
4. Inspect any flagged line.

## Impact

The signal-to-noise ratio is zero on this codebase, so the tool is unusable as a gate: a genuine finding would be indistinguishable from the 123 spurious ones. It also actively misleads — an author who "fixes" a flagged `m.id === merc.id` is being pushed away from the correct pattern.

## Suggested fix

- `element-equality`: replace the regex with the existing AST rule from `src/eslint-plugin/rules/no-element-identity-comparison.ts`, or at minimum skip any comparison where **both** sides end in a property access (`.id`, `.sectorId`, and friends).
- `loop-no-max`: parse the `loop({...})` object rather than scanning a fixed window after `while:`.
