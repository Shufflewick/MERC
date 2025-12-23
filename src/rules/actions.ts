/**
 * MERC Game Actions
 *
 * This file re-exports all actions from the organized module structure.
 * See src/rules/actions/ directory for the modular implementation:
 *
 * - helpers.ts: Shared utilities and constants
 * - rebel-movement.ts: Movement, coordinated attacks, squad management
 * - rebel-combat.ts: Combat continue/retreat actions
 * - rebel-economy.ts: Hiring, exploring, training, hospitals, arms dealers
 * - rebel-equipment.ts: Equipment management and special abilities
 * - dictator-actions.ts: Dictator-specific actions
 * - day-one-actions.ts: Day 1 setup actions
 * - index.ts: Main entry point with registerAllActions
 */

export * from './actions/index.js';
