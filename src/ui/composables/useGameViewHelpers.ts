/**
 * Pure utility functions for traversing and querying the gameView tree.
 * These have no Vue reactivity dependencies.
 */

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
 * Handles underscore prefix and also checks ref for class name matches.
 */
export function findByClassNameInTree(className: string, root: any): any {
  if (!root) return null;

  // Check className (handle underscore prefix) or ref that contains the class name
  const rootClass = normalizeClassName(root.className);
  if (rootClass === className || root.className === className || root.ref?.includes(className.toLowerCase())) {
    return root;
  }

  if (root.children) {
    for (const child of root.children) {
      const found = findByClassNameInTree(className, child);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Find all elements matching className in tree.
 */
export function findAllByClassNameInTree(className: string, root: any): any[] {
  const results: any[] = [];

  function search(node: any) {
    if (!node) return;
    const nodeClass = normalizeClassName(node.className);
    if (nodeClass === className || node.className === className || node.ref?.includes(className.toLowerCase())) {
      results.push(node);
    }
    if (node.children) {
      for (const child of node.children) {
        search(child);
      }
    }
  }

  search(root);
  return results;
}

/**
 * Find element by ref attribute in tree.
 */
export function findByRefInTree(ref: string, root: any): any {
  if (!root) return null;

  if (root.ref === ref) return root;

  if (root.children) {
    for (const child of root.children) {
      const found = findByRefInTree(ref, child);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Find element by numeric ID in tree.
 * BoardSmith element IDs are numbers, but handles string comparison too.
 */
export function findElementByIdInTree(id: number | string, root: any): any {
  if (!root) return null;

  // Compare as both number and string for flexibility
  const idNum = typeof id === 'number' ? id : parseInt(id, 10);
  const idStr = String(id);

  if (root.ref === idNum || root.ref === idStr || root.id === idNum || root.id === idStr) {
    return root;
  }

  if (root.children) {
    for (const child of root.children) {
      const found = findElementByIdInTree(id, child);
      if (found) return found;
    }
  }
  return null;
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
   * Find element by ref attribute.
   * Uses getGameView() as default root when none provided.
   */
  const findByRef = (ref: string, root?: any): any => {
    return findByRefInTree(ref, root ?? getGameView());
  };

  /**
   * Find element by numeric ID.
   * Uses getGameView() as default root when none provided.
   */
  const findElementById = (id: number | string, root?: any): any => {
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
    findByRef,
    findElementById,
    findDictatorCombatant,
    findDictatorCombatantWithParent,
  };
}
