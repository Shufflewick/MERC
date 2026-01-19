---
wave: 2
depends_on:
  - 36-01
files_modified:
  - src/ui/components/GameBoard.vue
autonomous: true
---

# Plan: 36-02 TypeScript Audit

## Goal

Review and document TypeScript casts in GameBoard.vue for safety, adding justification comments or replacing with type-safe alternatives.

## Tasks

<task id="1">
<title>Review dictatorCard cast (line ~127)</title>
<action>
Examine the cast:
```typescript
dictatorCard.value as { sectorId: string; inPlay: boolean } | undefined
```

This cast is used to satisfy the `SectorStateDependencies` interface for `useSectorState`. The dictatorCard ref returns this shape from useActionState.

**Resolution:** This cast is necessary because the dependency injection pattern requires a specific shape. Add a JSDoc comment explaining:
```typescript
// Cast required: dictatorCard shape matches SectorStateDependencies.getDictatorCard return type
// The actual runtime value from useActionState conforms to { sectorId: string; inPlay: boolean }
```

If a cleaner solution exists (e.g., the composable already exports the correct type), use that instead.
</action>
<verify>Cast has explanatory comment or is replaced with type-safe alternative</verify>
</task>

<task id="2">
<title>Review baseSectorId cast (line ~342)</title>
<action>
Examine the cast:
```typescript
baseSectorId as string
```

This appears after a null check like `if (inPlay && baseSectorId)`. TypeScript's control flow analysis should narrow the type after this check.

**Resolution options:**
1. If TypeScript already narrows correctly, remove the cast
2. If narrowing doesn't work due to ref unwrapping, use a type guard:
   ```typescript
   const sectorId = baseSectorId
   if (inPlay && sectorId) {
     // sectorId is now string
   }
   ```
3. If cast is truly necessary, add comment explaining why narrowing fails
</action>
<verify>Cast is removed, replaced with type guard, or documented</verify>
</task>

<task id="3">
<title>Review actionArgs cast (line ~581)</title>
<action>
Examine the cast:
```typescript
Object.values(props.actionArgs || {}) as string[]
```

This assumes all values in actionArgs are strings. Review the actual shape of actionArgs from props.

**Resolution options:**
1. If actionArgs is typed as `Record<string, string>`, the cast is redundant - remove it
2. If actionArgs could contain non-strings, add proper type checking:
   ```typescript
   const args = Object.values(props.actionArgs || {}).filter((v): v is string => typeof v === 'string')
   ```
3. If the assumption is safe (actionArgs always contains strings in practice), add comment documenting this assumption
</action>
<verify>Cast is removed, replaced with type guard, or documented with justification</verify>
</task>

<task id="4">
<title>Check for any remaining implicit any</title>
<action>
Run TypeScript build to check for type errors:
```bash
npm run build 2>&1 | grep -i "GameBoard"
```

Or use vue-tsc for Vue SFC type checking:
```bash
npx vue-tsc --noEmit 2>&1 | grep -i "GameBoard"
```

For each type error found:
1. Add explicit type annotation if type is known
2. Document if type is inherited from parent (gameView, state props from GameShell)

Note: Direct `tsc` on .vue files won't work - must use vue-tsc or the build process.
</action>
<verify>No new implicit any introduced; existing ones documented or fixed</verify>
</task>

## Verification

- [ ] Line ~127 cast reviewed and documented/fixed
- [ ] Line ~342 cast reviewed and documented/fixed
- [ ] Line ~581 cast reviewed and documented/fixed
- [ ] No new implicit any types introduced
- [ ] `npm run build` succeeds with no new TypeScript errors
- [ ] Each remaining cast has a comment explaining why it's necessary

## must_haves

- All TypeScript casts in GameBoard.vue are either removed (if unnecessary) or documented with justification
- No new type safety issues introduced
- Code compiles without TypeScript errors
