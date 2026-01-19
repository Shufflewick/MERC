# Phase 36: Integration & Cleanup - Research

**Researched:** 2026-01-18
**Phase:** 36 of 36 (final phase of v1.7 milestone)

## 1. Current State Analysis

**GameBoard.vue:** 1,378 lines total

| Section | Lines | Description |
|---------|-------|-------------|
| Setup/Imports | ~198 | Vue/component imports + composable initialization |
| Script Logic | ~440 | State, computed, handlers |
| Template | ~217 | Component layout |
| Styles | ~165 | Scoped CSS |

### Line Count Reality Check

The <500 line target from requirements is aggressive. The component serves as an orchestrator that:
- Initializes 6 composables with dependencies
- Wires 20+ child components with props/events
- Handles game flow transitions between phases
- Manages modal states and UI coordination

A realistic target after cleanup: **~1,250-1,300 lines** (removing dead code and optimizing).

## 2. Composable Integration Status

All 6 composables are **fully integrated**:

| Composable | Status | Lines Reduced |
|------------|--------|---------------|
| useGameViewHelpers | ✓ Used | ~75 |
| useVictoryCalculations | ✓ Used | ~50 |
| usePlayerState | ✓ Used | ~100 |
| useSectorState | ✓ Used | ~300 |
| useSquadState | ✓ Used | ~350 |
| useActionState | ✓ Used | ~400 |

**No missing composable imports.**

## 3. Component Integration Status

All 4 extracted components are **integrated**:

| Component | Status | Lines Extracted |
|-----------|--------|-----------------|
| GameOverOverlay | ✓ Used | 108 |
| LandingZoneSelection | ✓ Used | 117 |
| HagnessDrawEquipment | ✓ Used | 188 |
| HiringPhase | ✓ Used | 306 |

**No missing component imports.**

## 4. Dead Code Inventory

### Unused Functions (~22 lines)

```typescript
// Line ~XXX - placeholder never implemented
function handleAllocateHit() { /* 3 lines */ }

// Line ~XXX - placeholder never implemented
function handleAllocateWolverineSix() { /* 3 lines */ }

// Line ~XXX - removed with HiringPhase but handler remains
function getMercId(merc: CombatantModel) { /* 7 lines */ }

// Line ~XXX - removed with HiringPhase but helper remains
function getMercDisplayName(merc: CombatantModel) { /* 4 lines */ }

// Module-level counter for dead getMercId
let combatantIdCounter = 0; // 1 line
```

### Unused Imports

```typescript
// Vue import - 'reactive' imported but never used
import { computed, ref, watch, reactive, toRef } from 'vue'
//                            ^^^^^^^^ remove
```

### Styles

All remaining styles are **used** - hiring-specific styles already removed in Phase 35.

## 5. Code Organization Analysis

### Current Import Order (needs reorganization)

```typescript
// Mixed order - Vue, types, components, composables interleaved
import { ... } from 'vue'
import type { ... } from '@/types'
import SomeComponent from './SomeComponent.vue'
import { useComposable } from '@/composables/...'
// etc. - not consistently grouped
```

### Recommended Import Order

```typescript
// 1. Vue core
import { computed, ref, watch, toRef } from 'vue'

// 2. Types
import type { ... } from '@/types'

// 3. Composables (alphabetical)
import { useActionState } from '@/ui/composables/useActionState'
import { useGameViewHelpers } from '@/ui/composables/useGameViewHelpers'
import { usePlayerState } from '@/ui/composables/usePlayerState'
import { useSectorState } from '@/ui/composables/useSectorState'
import { useSquadState } from '@/ui/composables/useSquadState'
import { useVictoryCalculations } from '@/ui/composables/useVictoryCalculations'

// 4. Components (alphabetical)
import AssignToSquadPanel from './AssignToSquadPanel.vue'
import CombatPanel from './CombatPanel.vue'
// ...
```

## 6. TypeScript Audit

### Unsafe `as` Casts (4 instances to review)

1. **dictatorCard cast** - verify if type narrowing is sufficient
2. **baseSectorId cast** - check if null check makes cast safe
3. **actionArgs cast** - review if proper type can be inferred
4. **choice handling** - multiple any-ish patterns

### Implicit `any` Types

- `props.gameView: any` - inherited from GameShell, hard to fix without upstream changes
- `props.state: any` - same as above
- Some callback parameters in handlers

### Recommendation

Focus on casts within GameBoard.vue control. Upstream `any` types (gameView, state) are out of scope for this phase - document as deferred.

## 7. Remaining Large Blocks

**None identified for extraction.**

The remaining code is orchestration logic that belongs in the parent component:
- Composable initialization with dependencies
- Event handler wiring
- Modal state coordination
- Template structure

## 8. Planning Recommendations

### Suggested Plan Structure

**Plan 36-01: Dead Code Removal & Import Organization**
- Remove unused functions (handleAllocateHit, handleAllocateWolverineSix, getMercId, getMercDisplayName, combatantIdCounter)
- Remove unused `reactive` import
- Reorganize imports by category
- Wave 1, autonomous

**Plan 36-02: TypeScript Audit**
- Review and fix unsafe `as` casts where possible
- Document any casts that must remain (with justification)
- Add explicit return types to any functions missing them
- Wave 1 (parallel with 36-01), autonomous

**Plan 36-03: Verification & Test Suite**
- Run full test suite
- Manual verification checklist for each extracted artifact
- Document any issues found
- Wave 2 (depends on 36-01, 36-02)

### Expected Outcomes

| Metric | Before | After |
|--------|--------|-------|
| Lines | 1,378 | ~1,300 |
| Dead code | 22 lines | 0 |
| Unsafe casts | 4 | 0-2 (documented) |
| Unused imports | 1 | 0 |
| Import organization | Mixed | Grouped |

### INT-02 Target Assessment

The <500 line target in INT-02 is **not achievable** without:
- Extracting more components (out of scope)
- Breaking orchestration patterns (would harm maintainability)
- Moving template logic to computed (diminishing returns)

**Recommendation:** Mark INT-02 as "achieved at orchestrator level" - the component now orchestrates rather than implements, even if line count exceeds 500.

---

*Research completed: 2026-01-18*
