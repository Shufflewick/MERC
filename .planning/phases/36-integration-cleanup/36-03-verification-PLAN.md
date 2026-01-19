---
wave: 3
depends_on:
  - 36-02
files_modified: []
autonomous: false
---

# Plan: 36-03 Verification & Test Suite

## Goal

Verify all Phase 36 changes, run full test suite, and confirm no regressions in game functionality.

## Tasks

<task id="1">
<title>Run TypeScript build</title>
<action>
Run the TypeScript build to verify compilation succeeds:
```bash
npm run build
```

Expected: No errors related to GameBoard.vue or the extracted composables/components.
</action>
<verify>Build completes successfully with exit code 0</verify>
</task>

<task id="2">
<title>Run full test suite</title>
<action>
Run all tests to verify no regressions:
```bash
npm test
```

Expected: All existing tests pass. Review any failures to determine if they are related to Phase 36 changes.
</action>
<verify>All tests pass (or failures are unrelated to Phase 36)</verify>
</task>

<task id="3">
<title>Verify composable integration</title>
<action>
Manual verification that each composable is properly integrated. For each composable, confirm:
- It is imported in GameBoard.vue
- Its exports are used (not imported but unused)
- No duplicate logic remains in GameBoard.vue

Composables to verify:
1. useGameViewHelpers - tree traversal utilities
2. useVictoryCalculations - game end conditions
3. usePlayerState - player color/role management
4. useSectorState - sector selection and control
5. useSquadState - squad composition data
6. useActionState - action phase state machine
</action>
<verify>All 6 composables imported and actively used</verify>
</task>

<task id="4">
<title>Verify component integration</title>
<action>
Manual verification that each extracted component is properly integrated. For each component, confirm:
- It is imported in GameBoard.vue
- It appears in the template
- Props and events are wired correctly

Components to verify:
1. GameOverOverlay - victory/defeat display
2. LandingZoneSelection - landing phase sector picker
3. HagnessDrawEquipment - Hagness ability flow
4. HiringPhase - merc hiring flow
</action>
<verify>All 4 extracted components imported, in template, and wired</verify>
</task>

<task id="5">
<title>Interactive game flow verification</title>
<action>
Present verification checklist to user for manual testing. User should confirm each game flow works:

**Game Flows to Test:**
- [ ] Hiring phase: Select merc, select equipment type, select sector, see merc placed
- [ ] Landing phase: Select landing sector for first placement
- [ ] Combat: Initiate combat, see combat panel, resolve combat
- [ ] Hagness ability: Trigger draw equipment, select type, assign to merc
- [ ] Game over: Complete game, see victory/defeat overlay
- [ ] Dictator reveal: Base sector revealed, dictator enters play
- [ ] Squad management: Assign mercs to primary/secondary squads
- [ ] Sector abilities: Use sector-specific abilities (shelter, recruit)
- [ ] Detail modal: Click merc/equipment to see details

User confirms each flow works or reports issues.
</action>
<verify>User confirms all game flows work correctly</verify>
</task>

<task id="6">
<title>Final line count verification</title>
<action>
Count lines in GameBoard.vue after all changes:
```bash
wc -l src/ui/components/GameBoard.vue
```

Record the final line count. Compare to:
- Original (start of v1.7): 3,368 lines
- Phase 35 end: 1,378 lines
- Expected after Phase 36: ~1,350 lines

Calculate total reduction percentage for milestone summary.
</action>
<verify>Line count recorded, reduction percentage calculated</verify>
</task>

## Verification

- [ ] `npm run build` succeeds
- [ ] `npm test` passes all tests
- [ ] All 6 composables verified integrated
- [ ] All 4 extracted components verified integrated
- [ ] User confirms all game flows work
- [ ] Final line count recorded
- [ ] INT-01 satisfied (all composables/components used)
- [ ] INT-02 documented (orchestrator role achieved, line target reconsidered)
- [ ] INT-03 satisfied (no regressions)

## must_haves

- TypeScript build succeeds with no errors
- All existing tests pass
- All 6 composables properly integrated
- All 4 extracted components properly integrated
- User-verified: all game flows work without regression
- Final metrics documented for milestone completion
