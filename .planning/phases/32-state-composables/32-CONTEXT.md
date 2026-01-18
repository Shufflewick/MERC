# Phase 32: State Composables - Context

**Gathered:** 2026-01-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract reactive state derivation from GameBoard.vue into four composables:
- usePlayerState (STATE-01)
- useSectorState (STATE-02)
- useSquadState (STATE-03)
- useActionState (STATE-04)

Each composable computes derived state from the game tree and provides reactive properties for UI components.

</domain>

<decisions>
## Implementation Decisions

### Design Philosophy
- **Pit of Success**: Make the easy path the correct path
- Wrong usage should be hard, right usage should be obvious
- Composables should be self-documenting — names and types guide usage

### Claude's Discretion
- Composable scope boundaries (what state belongs where)
- Reactivity granularity (computed vs ref, when to recompute)
- Consumer API design (named exports, return object shape)
- Cross-composable dependencies (hierarchy vs flat)
- Performance vs simplicity tradeoffs

</decisions>

<specifics>
## Specific Ideas

- Follow existing composable patterns from Phase 31 (useGameViewHelpers, useVictoryCalculations)
- Ensure composables are drop-in replacements for current GameBoard computed properties
- TypeScript types should make incorrect usage a compile error

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 32-state-composables*
*Context gathered: 2026-01-18*
