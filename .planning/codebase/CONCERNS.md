# Codebase Concerns

**Analysis Date:** 2026-01-08

## Tech Debt

**Type Assertions Without Runtime Validation:**
- Issue: 191 instances of `as` type assertions, many without null checks
- Files: `src/rules/game.ts`, `src/rules/actions/rebel-equipment.ts`, `src/rules/actions/dictator-actions.ts`
- Why: Rapid development with TypeScript's escape hatches
- Impact: Runtime errors possible if element lookup fails
- Fix approach: Replace assertions with type guards or validated casts

**Any[] Types in Combat State:**
- Issue: Combat state uses `any[]` instead of proper types
- File: `src/rules/game.ts:448-462`
- Why: Workaround for complex type imports across modules
- Impact: Type information lost, IDE autocomplete broken
- Fix approach: Import `Combatant[]`, `CombatResult[]` types properly

**Duplicate Helper Functions:**
- Issue: 17 similar helper patterns repeated across action files
- Files: `src/rules/actions/rebel-economy.ts`, `src/rules/actions/rebel-equipment.ts`
- Why: Copy-paste during feature development
- Impact: Maintenance burden, inconsistent behavior risk
- Fix approach: Extract shared utilities to `src/rules/actions/helpers.ts`

**Mixed State Persistence Patterns:**
- Issue: Three different patterns for state storage
- File: `src/rules/game.ts`
- Patterns: `persistentMap()`, `game.settings[]`, plain object properties
- Impact: Inconsistent state management, harder to debug
- Fix approach: Standardize on one pattern with clear conventions

**Legacy Deprecated Code:**
- Issue: `pendingLoot` exists alongside new `pendingLootMap`
- File: `src/rules/game.ts:541-542`
- Why: Backward compatibility during refactor
- Impact: Confusion about which to use
- Fix approach: Remove legacy property after confirming no usage

## Known Bugs

**None detected in current analysis.**

## Security Considerations

**Debug Code in Production:**
- Risk: DEBUG messages visible to players
- File: `src/rules/actions/dictator-actions.ts:432, 436`
- Current mitigation: None
- Recommendations: Remove debug messages or gate behind debug flag

**Debug Configuration Risk:**
- Risk: `DEBUG_TACTICS_ORDER` can override random card order
- File: `src/rules/debug-config.ts`, `src/rules/setup.ts:21, 354, 369`
- Current mitigation: Manual review before release
- Recommendations: Validate debug config is null in production builds

## Performance Bottlenecks

**Large File Sizes:**
- Problem: Several files exceed 1,200 lines
- Files: `src/rules/combat.ts` (2,879 lines), `src/rules/ai-helpers.ts` (1,326 lines), `src/rules/game.ts` (1,631 lines)
- Impact: Slower IDE performance, harder navigation
- Improvement path: Consider splitting by logical domain (combat phases, AI strategies)

## Fragile Areas

**Combat System:**
- File: `src/rules/combat.ts`
- Why fragile: Complex state machine with many ability interactions
- Common failures: Initiative ordering edge cases, ability trigger timing
- Safe modification: Run full test suite, add specific tests before changes
- Test coverage: Good coverage in `combat-*.test.ts`

**Action Validation:**
- Files: `src/rules/actions/*.ts`
- Why fragile: Conditions must handle all edge cases
- Common failures: Missing null checks, incorrect state assumptions
- Safe modification: Add tests for edge cases before changes
- Test coverage: Limited - mostly tested via integration tests

## Scaling Limits

**Not applicable** - This is a local board game, not a service

## Dependencies at Risk

**All Local Monorepo:**
- All @boardsmith/* packages are local file:// references
- Risk: Changes in BoardSmith packages could break this game
- Impact: Build failures, runtime errors
- Migration plan: N/A - tied to BoardSmith framework

## Missing Critical Features

**Artillery Barrage Player Choice:**
- Problem: Rebels cannot choose hit allocation during dictator's Artillery Barrage
- File: `src/rules/tactics-effects.ts:34-37`
- Current workaround: Auto-applies damage (militia first, then MERCs)
- Blocks: Full implementation of tactical choice mechanic
- Implementation complexity: High - requires flow interrupts to switch active player

## Test Coverage Gaps

**Action Validation Tests:**
- What's not tested: `.condition()` checks for most actions
- Risk: Invalid actions could slip through
- Priority: Medium
- Difficulty to test: Low - straightforward condition testing

**State Persistence Tests:**
- What's not tested: `persistentMap()`, `game.settings` patterns
- Risk: State loss during HMR or serialization
- Priority: Medium
- Difficulty to test: Medium - need to simulate HMR

**Error Condition Tests:**
- What's not tested: Many error paths and edge cases
- Risk: Unhandled errors crash game
- Priority: Low
- Difficulty to test: Medium - need to force error conditions

---

*Concerns audit: 2026-01-08*
*Update as issues are fixed or new ones discovered*
