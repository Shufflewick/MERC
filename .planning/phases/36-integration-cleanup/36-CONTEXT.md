# Phase 36: Integration & Cleanup - Context

**Gathered:** 2026-01-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform GameBoard.vue from 1,378 lines to <500-line orchestrator. Remove dead code, consolidate imports, verify all game flows work. No new features — pure cleanup and verification.

</domain>

<decisions>
## Implementation Decisions

### Dead code cleanup
- Complete cleanup: remove unused + consolidate related code + reorganize imports/exports
- Style removal: include dynamic class bindings in analysis — if style isn't referenced anywhere (static or :class), remove it
- Methods/computed: check if they were supposed to move to a composable before deleting — verify intent, then remove
- Import organization: group logically (Vue imports → composables → components → types)

### Verification approach
- Test each extracted artifact individually with manual verification
- Claude provides checklist of what to test, user confirms each works
- Artifacts to verify: useGameViewHelpers, useVictoryCalculations, usePlayerState, useSectorState, useSquadState, useActionState, GameOverOverlay, LandingZoneSelection, HagnessDrawEquipment, HiringPhase
- TypeScript: strict mode audit — all composables must have explicit return types, no implicit any, flag 'as' casts
- Issue handling: fix immediately when found, don't defer
- Existing tests must all pass — run full test suite

### Pit of Success design
- Composable APIs: clear parameter names + strict TypeScript constraints + JSDoc comments explaining intent
- Component props: minimal required props, optional props grouped in an options object
- Event naming: verb form (emit('select'), emit('close'), not past tense)
- Composable dependencies: Claude's discretion — choose whichever pattern makes wrong usage hardest

</decisions>

<specifics>
## Specific Ideas

- "Pit of Success" is the guiding principle — make wrong usage hard, right usage obvious
- Manual verification is interactive: Claude lists what to test, user confirms each artifact works
- TypeScript strictness matters — the refactor should improve type safety, not degrade it

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 36-integration-cleanup*
*Context gathered: 2026-01-18*
