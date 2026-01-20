/**
 * MERC-specific type extensions for BoardSmith
 *
 * These types extend BoardSmith's selection and action types with MERC-specific
 * features that aren't yet in the core library. They allow us to use features
 * like AI hints and deferred choices while maintaining type safety.
 *
 * See .planning/boardsmith-feature-request.md for the feature requests.
 */

import type { ActionContext, ActionStepConfig } from 'boardsmith';

/**
 * Extended selection options for MERC-specific AI features.
 * Use with type assertion when passing to BoardSmith selection methods.
 *
 * @example
 * .chooseFrom<string>('merc', {
 *   choices: () => [...],
 *   defer: true,
 *   aiSelect: (ctx) => pickBestMerc(ctx),
 * } as MERCChoiceSelection<string>)
 */
export interface MERCSelectionExtras<T = unknown> {
  /**
   * Delay choice evaluation until action starts.
   * Prevents side effects (like drawing cards) during action availability checks.
   */
  defer?: boolean;

  /**
   * AI selection hint for bot players.
   * Called when an AI player needs to make this selection.
   * Return undefined to fall back to default AI behavior.
   */
  aiSelect?: (ctx: ActionContext) => T | undefined;

  /**
   * Conditionally skip this selection.
   * If returns true, the selection is skipped and no value is required.
   */
  skipIf?: (ctx: ActionContext) => boolean;
}

/**
 * Extended choice selection type that includes MERC extras.
 * Used for .chooseFrom() calls.
 */
export type MERCChoiceSelection<T> = {
  prompt?: string;
  choices: T[] | ((context: ActionContext) => T[]);
  display?: (choice: T) => string;
  optional?: boolean;
  validate?: (choice: T, context: ActionContext) => boolean | string;
  initial?: T | ((context: ActionContext) => T | undefined);
  dependsOn?: string;
} & MERCSelectionExtras<T>;

/**
 * Extended element selection type that includes MERC extras.
 * Used for .chooseElement() calls.
 */
export type MERCElementSelection<T> = {
  prompt?: string;
  elementClass?: new (...args: unknown[]) => T;
  from?: unknown;
  filter?: (element: T, context: ActionContext) => boolean;
  optional?: boolean;
  validate?: (element: T, context: ActionContext) => boolean | string;
  initial?: T | ((context: ActionContext) => T | undefined);
  dependsOn?: string;
} & MERCSelectionExtras<T>;

/**
 * Extended ActionStepConfig with prompt support.
 * Use with type assertion when passing to actionStep().
 */
export type MERCActionStepConfig = ActionStepConfig & {
  /** User-facing prompt to display when this step is active */
  prompt?: string;
};

/**
 * Type for dynamic prompts (function or string).
 * BoardSmith only accepts string, but we use this for internal tracking.
 */
export type DynamicPrompt = string | ((ctx: ActionContext) => string);
