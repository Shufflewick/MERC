/**
 * Querying the gameView tree.
 *
 * Traversal itself comes from 'boardsmith/ui' — these are thin MERC-specific
 * wrappers over it, not a second implementation. The framework finders prefer
 * $type and name because className can be mangled by production bundlers.
 */

import { findElement, findElements, findElementById, type GameElement } from 'boardsmith/ui';

// ============================================================================
// Pure function exports (can be used directly without composable)
// ============================================================================

/**
 * Strips underscore prefix from class names.
 * BoardSmith serializes some class names with underscore prefix.
 */
export function normalizeClassName(className: string): string {
  return className?.replace(/^_/, '') || '';
}

/**
 * Get property from node (checks attributes first, then root).
 */
export function getAttr<T>(node: any, key: string, defaultVal: T): T {
  if (node?.attributes && node.attributes[key] !== undefined) return node.attributes[key];
  if (node && node[key] !== undefined) return node[key];
  return defaultVal;
}

// ============================================================================
// Tree traversal functions (require a root node)
// ============================================================================

/**
 * Find first element matching className in tree.
 *
 * Traversal is the framework's, not a local copy. The framework matches
 * className exactly, so the underscore-prefixed serialization is tried too.
 */
export function findByClassNameInTree(className: string, root: any): any {
  if (!root) return null;
  return findElement(root as GameElement, { className })
    ?? findElement(root as GameElement, { className: `_${className}` })
    ?? null;
}

/**
 * Find all elements matching className in tree.
 */
export function findAllByClassNameInTree(className: string, root: any): any[] {
  if (!root) return [];
  return [
    ...findElements(root as GameElement, { className }),
    ...findElements(root as GameElement, { className: `_${className}` }),
  ];
}

/**
 * Find element by name in tree.
 *
 * Names survive minification where class names do not, so prefer this when the
 * element you want has one (decks, discard piles, squads, player areas).
 */
export function findByNameInTree(name: string, root: any): any {
  if (!root) return null;
  return findElement(root as GameElement, { name }) ?? null;
}

/**
 * Find element by numeric ID in tree.
 */
export function findElementByIdInTree(id: number | string, root: any): any {
  if (!root) return null;
  const numericId = typeof id === 'number' ? id : parseInt(id, 10);
  if (Number.isNaN(numericId)) return null;
  return findElementById(root as GameElement, numericId) ?? null;
}

/**
 * Find dictator combatant in tree (by cardType attribute).
 */
export function findDictatorCombatantInTree(root: any): any {
  if (!root) return null;

  // Check if this element is a dictator combatant
  if (root.className === 'CombatantModel' || root.className === '_CombatantModel') {
    // Check cardType at root level or in attributes
    const cardType = root.cardType || root.attributes?.cardType;
    if (cardType === 'dictator') return root;
  }

  // Recurse into children
  if (root.children) {
    for (const child of root.children) {
      const found = findDictatorCombatantInTree(child);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Find dictator combatant and its parent in tree.
 * Useful for getting sectorId from parent Squad.
 */
export function findDictatorCombatantWithParentInTree(
  root: any,
  parent?: any
): { node: any; parent: any } | null {
  if (!root) return null;

  if (root.className === 'CombatantModel' || root.className === '_CombatantModel') {
    const cardType = root.cardType || root.attributes?.cardType;
    if (cardType === 'dictator') return { node: root, parent };
  }

  if (root.children) {
    for (const child of root.children) {
      const found = findDictatorCombatantWithParentInTree(child, root);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Check if a MERC is dead (damage >= maxHealth or in discard pile).
 * Note: isDead and health are getters that may not serialize, so we check damage directly.
 */
export function isMercDead(merc: any): boolean {
  // First check isDead if it was explicitly serialized
  const isDead = getAttr<boolean>(merc, 'isDead', false);
  if (isDead === true) return true;

  // Check health directly if available (may be explicitly serialized in some views)
  const health = getAttr<number>(merc, 'health', -1);
  if (health === 0) return true;

  // Primary check: damage vs maxHealth (these are actual properties that serialize)
  const damage = getAttr(merc, 'damage', 0);
  // Use effectiveMaxHealth (serialized property) with fallback to maxHealth or default 3
  const maxHealth = getAttr(merc, 'effectiveMaxHealth', 0) || getAttr(merc, 'maxHealth', 3);
  if (damage > 0 && damage >= maxHealth) return true;

  // Check if MERC is in a discard pile (dead MERCs are moved there)
  // This handles cases where the MERC hasn't been fully cleaned up
  const parentRef = merc._container || merc.parent?.ref || '';
  if (parentRef.includes('discard')) return true;

  return false;
}

// ============================================================================
// Composable (provides gameView-bound helpers for Vue components)
// ============================================================================

/**
 * Composable that provides gameView helpers with bound context.
 * @param getGameView - Getter function that returns the current gameView
 */
export function useGameViewHelpers(getGameView: () => any) {
  /**
   * Find first element matching className.
   * Uses getGameView() as default root when none provided.
   */
  const findByClassName = (className: string, root?: any): any => {
    return findByClassNameInTree(className, root ?? getGameView());
  };

  /**
   * Find all elements matching className.
   * Uses getGameView() as default root when none provided.
   */
  const findAllByClassName = (className: string, root?: any): any[] => {
    const effectiveRoot = root ?? getGameView();
    if (!effectiveRoot) return [];
    return findAllByClassNameInTree(className, effectiveRoot);
  };

  /**
   * Find element by name.
   * Uses getGameView() as default root when none provided.
   */
  const findByName = (name: string, root?: any): any => {
    return findByNameInTree(name, root ?? getGameView());
  };

  /**
   * Find element by numeric ID.
   * Uses getGameView() as default root when none provided.
   */
  const findById = (id: number | string, root?: any): any => {
    return findElementByIdInTree(id, root ?? getGameView());
  };

  /**
   * Find dictator combatant.
   * Uses getGameView() as default root when none provided.
   */
  const findDictatorCombatant = (root?: any): any => {
    return findDictatorCombatantInTree(root ?? getGameView());
  };

  /**
   * Find dictator combatant with parent.
   * Uses getGameView() as default root when none provided.
   */
  const findDictatorCombatantWithParent = (
    root?: any,
    parent?: any
  ): { node: any; parent: any } | null => {
    return findDictatorCombatantWithParentInTree(root ?? getGameView(), parent);
  };

  return {
    // Pure utilities (no gameView dependency)
    normalizeClassName,
    getAttr,
    isMercDead,
    // Bound tree traversal functions
    findByClassName,
    findAllByClassName,
    findByName,
    findElementById: findById,
    findDictatorCombatant,
    findDictatorCombatantWithParent,
  };
}
