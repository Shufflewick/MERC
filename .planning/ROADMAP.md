# Roadmap: MERC Codebase Cleanup

## Overview

A systematic cleanup moving from type safety foundations through code quality improvements to comprehensive test coverage, ensuring the codebase reaches ship confidence without regressions.

## Domain Expertise

None

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Type Safety: Combat State** - Replace any[] types with proper Combatant[], CombatResult[] types
- [ ] **Phase 2: Type Safety: Assertions** - Replace 191 unsafe `as` casts with type guards or validated casts
- [ ] **Phase 3: Code Quality: Helpers** - Extract 17 duplicate helper patterns into shared utilities
- [ ] **Phase 4: Code Quality: State & Legacy** - Standardize state persistence and remove legacy pendingLoot
- [ ] **Phase 5: Debug Cleanup** - Remove DEBUG messages and gate DEBUG_TACTICS_ORDER
- [ ] **Phase 6: Test Coverage** - Add tests for action conditions, state persistence, and error conditions

## Phase Details

### Phase 1: Type Safety: Combat State
**Goal**: Replace `any[]` types in combat state with proper `Combatant[]`, `CombatResult[]` types
**Depends on**: Nothing (first phase)
**Research**: Unlikely (internal codebase patterns, existing types)
**Plans**: TBD

Plans:
- [ ] 01-01: Audit combat state types and define proper interfaces
- [ ] 01-02: Replace any[] usages with typed arrays

### Phase 2: Type Safety: Assertions
**Goal**: Replace unsafe `as` casts with type guards or validated casts across 191 instances
**Depends on**: Phase 1 (combat types inform some assertions)
**Research**: Unlikely (TypeScript patterns, internal codebase)
**Plans**: TBD

Plans:
- [ ] 02-01: Categorize assertions by pattern and risk
- [ ] 02-02: Create type guard utilities
- [ ] 02-03: Replace high-risk assertions
- [ ] 02-04: Replace remaining assertions

### Phase 3: Code Quality: Helpers
**Goal**: Extract 17 duplicate helper patterns into shared utilities in `helpers.ts`
**Depends on**: Phase 2 (type guards may become helpers)
**Research**: Unlikely (extracting existing patterns)
**Plans**: TBD

Plans:
- [ ] 03-01: Identify and catalog duplicate patterns
- [ ] 03-02: Extract utilities to helpers.ts
- [ ] 03-03: Replace duplicates with helper calls

### Phase 4: Code Quality: State & Legacy
**Goal**: Standardize state persistence pattern and remove legacy `pendingLoot` property
**Depends on**: Phase 3
**Research**: Unlikely (internal patterns already exist)
**Plans**: TBD

Plans:
- [ ] 04-01: Audit state persistence patterns
- [ ] 04-02: Standardize on chosen pattern
- [ ] 04-03: Remove legacy pendingLoot property

### Phase 5: Debug Cleanup
**Goal**: Remove DEBUG messages from dictator-actions.ts and gate DEBUG_TACTICS_ORDER
**Depends on**: Phase 4
**Research**: Unlikely (straightforward removal/gating)
**Plans**: TBD

Plans:
- [ ] 05-01: Remove/gate debug code

### Phase 6: Test Coverage
**Goal**: Add tests for action `.condition()` validation, state persistence patterns, and error conditions
**Depends on**: Phase 5 (test final state of codebase)
**Research**: Unlikely (following existing test patterns)
**Plans**: TBD

Plans:
- [ ] 06-01: Add action condition tests
- [ ] 06-02: Add state persistence tests
- [ ] 06-03: Add error condition tests

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Type Safety: Combat State | 0/2 | Not started | - |
| 2. Type Safety: Assertions | 0/4 | Not started | - |
| 3. Code Quality: Helpers | 0/3 | Not started | - |
| 4. Code Quality: State & Legacy | 0/3 | Not started | - |
| 5. Debug Cleanup | 0/1 | Not started | - |
| 6. Test Coverage | 0/3 | Not started | - |
