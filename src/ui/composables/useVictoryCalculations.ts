import { computed, type ComputedRef } from 'vue';
import {
  normalizeClassName,
  findAllByClassNameInTree,
  findByClassNameInTree,
  getAttr,
  findDictatorCombatantInTree,
} from './useGameViewHelpers';

/**
 * Victory calculation composable.
 * Extracts victory condition checks and point calculations from GameBoard.vue.
 *
 * @param getGameView - Getter function that returns the current gameView
 */
export function useVictoryCalculations(getGameView: () => any) {
  // Bind helper functions to gameView
  const findByClassName = (className: string, root?: any) =>
    findByClassNameInTree(className, root ?? getGameView());
  const findAllByClassName = (className: string, root?: any) =>
    findAllByClassNameInTree(className, root ?? getGameView());
  const findDictatorCombatant = (root?: any) =>
    findDictatorCombatantInTree(root ?? getGameView());

  /**
   * Count TacticsCard children in a container node.
   * Pure helper with no gameView dependency.
   */
  function countTacticsCards(containerNode: any): number {
    if (!containerNode?.children) return 0;
    return containerNode.children.filter(
      (c: any) => normalizeClassName(c.className) === 'TacticsCard'
    ).length;
  }

  /**
   * Calculate victory points for rebels (controlled sectors).
   * Rebels control a sector if they have more militia than the dictator.
   */
  function calculateRebelVictoryPoints(): number {
    let points = 0;
    const sectorNodes = findAllByClassName('Sector');
    for (const sector of sectorNodes) {
      // Get militia counts
      const dictatorMilitia = getAttr<number>(sector, 'dictatorMilitia', 0);
      // Sum all rebel militia (check both formats)
      let rebelMilitia = 0;
      const rebelMilitiaMap = getAttr<Record<string, number>>(sector, 'rebelMilitia', {});
      if (typeof rebelMilitiaMap === 'object') {
        for (const count of Object.values(rebelMilitiaMap)) {
          rebelMilitia += (count as number) || 0;
        }
      }
      // Rebels control if they have more militia
      if (rebelMilitia > dictatorMilitia) {
        points += 1;
      }
    }
    return points;
  }

  /**
   * Calculate victory points for dictator (controlled sectors + base bonus).
   * Dictator controls if they have more militia (or equal with any militia).
   * Base sector gives +1 bonus point.
   */
  function calculateDictatorVictoryPoints(): number {
    let points = 0;
    const sectorNodes = findAllByClassName('Sector');

    // Find dictator's base sector for bonus calculation
    const dictatorPlayerNode =
      findByClassName('DictatorPlayer') || findByClassName('_DictatorPlayer');
    const baseSectorId = dictatorPlayerNode
      ? getAttr<string>(dictatorPlayerNode, 'baseSectorId', '')
      : '';

    for (const sector of sectorNodes) {
      const sectorId = getAttr<string>(sector, 'sectorId', '');
      const dictatorMilitia = getAttr<number>(sector, 'dictatorMilitia', 0);
      // Sum all rebel militia
      let rebelMilitia = 0;
      const rebelMilitiaMap = getAttr<Record<string, number>>(sector, 'rebelMilitia', {});
      if (typeof rebelMilitiaMap === 'object') {
        for (const count of Object.values(rebelMilitiaMap)) {
          rebelMilitia += (count as number) || 0;
        }
      }
      // Dictator controls if they have more militia (or equal with any militia)
      if (dictatorMilitia > rebelMilitia || (dictatorMilitia > 0 && dictatorMilitia === rebelMilitia)) {
        points += 1;
        // Base sector gives +1 bonus
        if (sectorId === baseSectorId) {
          points += 1;
        }
      }
    }
    return points;
  }

  /**
   * Computed: Check if the game is over.
   * Game ends when:
   * 1. Dictator is dead (base revealed + damage >= maxHealth)
   * 2. TacticsDeck AND TacticsHand both empty
   * 3. explosivesVictory flag is true
   */
  const isGameOver: ComputedRef<boolean> = computed(() => {
    // 1. Check for dictator defeat (base revealed + dictator dead)
    const dictatorCardNode = findDictatorCombatant();
    if (dictatorCardNode) {
      const baseRevealed = getAttr<boolean>(dictatorCardNode, 'inPlay', false);
      const damage = getAttr<number>(dictatorCardNode, 'damage', 0);
      const maxHealth = getAttr<number>(dictatorCardNode, 'maxHealth', 3);
      const dictatorDead = damage >= maxHealth;

      if (baseRevealed && dictatorDead) {
        return true;
      }
    }

    // 2. Check for tactics deck AND hand both empty
    const tacticsDeckNode =
      findByClassName('TacticsDeck') || findByClassName('_TacticsDeck');
    const tacticsHandNode =
      findByClassName('TacticsHand') || findByClassName('_TacticsHand');
    const deckCount = countTacticsCards(tacticsDeckNode);
    const handCount = countTacticsCards(tacticsHandNode);
    if (deckCount === 0 && handCount === 0) {
      return true;
    }

    // 3. Check for explosives victory (stored as game attribute)
    const gameView = getGameView();
    const explosivesVictory =
      gameView?.explosivesVictory || gameView?.attributes?.explosivesVictory || false;
    if (explosivesVictory) {
      return true;
    }

    return false;
  });

  /**
   * Computed: Determine the winner.
   * - Dictator death -> rebels win
   * - Explosives victory -> rebels win
   * - Tactics exhausted -> compare points (dictator wins ties)
   */
  const gameWinner: ComputedRef<'rebels' | 'dictator' | null> = computed(() => {
    if (!isGameOver.value) return null;

    // 1. Check dictator defeat (rebels win)
    const dictatorCardNode = findDictatorCombatant();
    if (dictatorCardNode) {
      const baseRevealed = getAttr<boolean>(dictatorCardNode, 'inPlay', false);
      const damage = getAttr<number>(dictatorCardNode, 'damage', 0);
      const maxHealth = getAttr<number>(dictatorCardNode, 'maxHealth', 3);

      if (baseRevealed && damage >= maxHealth) {
        return 'rebels';
      }
    }

    // 2. Check for explosives victory (rebels win)
    const gameView = getGameView();
    const explosivesVictory =
      gameView?.explosivesVictory || gameView?.attributes?.explosivesVictory || false;
    if (explosivesVictory) {
      return 'rebels';
    }

    // 3. Tactics deck empty - winner determined by victory points
    const tacticsDeckNode =
      findByClassName('TacticsDeck') || findByClassName('_TacticsDeck');
    const tacticsHandNode =
      findByClassName('TacticsHand') || findByClassName('_TacticsHand');
    const deckCount = countTacticsCards(tacticsDeckNode);
    const handCount = countTacticsCards(tacticsHandNode);
    if (deckCount === 0 && handCount === 0) {
      const rebelPoints = calculateRebelVictoryPoints();
      const dictatorPoints = calculateDictatorVictoryPoints();
      // Dictator wins ties
      return dictatorPoints >= rebelPoints ? 'dictator' : 'rebels';
    }

    return 'dictator'; // Default fallback
  });

  return {
    countTacticsCards,
    calculateRebelVictoryPoints,
    calculateDictatorVictoryPoints,
    isGameOver,
    gameWinner,
  };
}
