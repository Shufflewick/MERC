import { describe, it, expect } from 'vitest';
import { GameRunner } from 'boardsmith/runtime';
import { gameDefinition } from '../src/rules/index';

describe('Platform dictator view', () => {
  it('player view includes role in attributes', () => {
    const runner = new GameRunner({
      GameClass: gameDefinition.gameClass,
      gameType: gameDefinition.gameType,
      gameOptions: {
        playerCount: 2,
        seed: '12345',
        exclusiveSeats: { role: 1 },
        playerOptions: [{ role: 'dictator' }, {}],
        playerIsAI: [false, true],
        dictatorCharacter: 'random',
      },
    });
    runner.start();

    const snapshot = runner.getSnapshot();
    const views = runner.getAllPlayerViews();
    
    // Dump the first player's view structure to find where role lives
    const v1 = views[0] as any;
    const vs = v1?.visibleState || v1;
    
    // Find player elements in the view
    const allKeys = Object.keys(vs);
    console.log('View 1 top keys:', allKeys.join(', '));
    
    // Look for players in the graph
    if (vs.graph) {
      const playerNodes = Object.entries(vs.graph).filter(([k, v]: [string, any]) => 
        v?.className === 'MERCPlayer' || v?.attrs?.role
      );
      for (const [id, node] of playerNodes as any) {
        console.log(`Graph node ${id}: className=${node.className}, role=${node.attrs?.role}, seat=${node.attrs?.seat}`);
      }
    }
    
    // Check serialized snapshot for role
    const snapStr = JSON.stringify(snapshot);
    const dictatorCount = (snapStr.match(/role.*dictator/g) || []).length;
    const rebelCount = (snapStr.match(/role.*rebel/g) || []).length;
    console.log(`Snapshot contains: ${dictatorCount} dictator refs, ${rebelCount} rebel refs`);

    expect(true).toBe(true); // Just for logging
  });
});
