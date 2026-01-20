# BoardSmith Feature Request

This document tracks features needed in `@boardsmith/engine` that are currently being worked around in the MERC codebase.

## Selection-Level Properties

### 1. `defer: boolean`
**Purpose:** Delay choice evaluation until action starts (prevents side effects during availability checks).

**Use case:** When drawing cards for selection, we don't want to draw during the "preview" phase when BoardSmith checks action availability. We only want to draw when the player actually starts the action.

**Current workaround:** Type assertion with `as any` on selection options.

### 2. `aiSelect: (ctx: ActionContext) => T | undefined`
**Purpose:** Per-selection AI hints for bot players.

**Use case:** AI players need selection-specific hints to make intelligent choices. Currently, AI logic has to be embedded in `choices()` functions or handled externally.

**Current workaround:** Type assertion with `as any` on selection options.

### 3. `skipIf: (ctx: ActionContext) => boolean`
**Purpose:** Conditionally skip a selection.

**Note:** This exists on flow steps but not on selections. Having it on selections would allow conditional selection steps within a single action.

**Current workaround:** Type assertion with `as any` on selection options.

## Action-Level Features

### 4. Dynamic prompts on `.prompt()`
**Purpose:** Support `(ctx: ActionContext) => string` in addition to `string` for action prompts.

**Use case:** Action prompts that depend on game state (e.g., "Move MERC from {current_location}").

**Note:** Selection prompts already support dynamic functions.

**Current workaround:** Convert to static strings or use type assertion.

### 5. `prompt` on `ActionStepConfig`
**Purpose:** Flow action steps should support user-facing prompts.

**Use case:** In `flow.ts`, action steps like `actionStep({ actions: ['placeLanding'], prompt: 'Choose landing zone' })` provide UI guidance.

**Current workaround:** Type assertion on action step config objects.

## Priority

1. **High:** `defer` - Essential for preventing side effects during action availability checks
2. **High:** `aiSelect` - Required for proper AI player implementation
3. **Medium:** `skipIf` on selections - Cleaner conditional logic within actions
4. **Medium:** Dynamic action prompts - Improves user experience
5. **Low:** `prompt` on ActionStepConfig - Primarily for documentation/UI hints
