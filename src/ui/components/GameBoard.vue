<script setup lang="ts">
import { computed } from 'vue';

interface Card {
  id: string;
  name: string;
  attributes?: {
    rank?: string;
    suit?: string;
  };
}

const props = defineProps<{
  gameView: any;
  playerPosition: number;
  isMyTurn: boolean;
  availableActions: string[];
  action: (name: string, args: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  actionArgs: Record<string, unknown>;
  executeAction: (name: string) => Promise<void>;
  setBoardPrompt: (prompt: string | null) => void;
}>();

// Computed properties to extract data from gameView
const myHand = computed<Card[]>(() => {
  if (!props.gameView) return [];
  const handElement = props.gameView.children?.find(
    (c: any) => c.attributes?.$type === 'hand' && c.attributes?.player?.position === props.playerPosition
  );
  return handElement?.children?.filter((c: any) => c.attributes?.rank) || [];
});

const deckCount = computed(() => {
  if (!props.gameView) return 0;
  const deck = props.gameView.children?.find((c: any) => c.attributes?.$type === 'deck');
  return deck?.children?.length || deck?.childCount || 0;
});

// Helpers
function getSuitSymbol(suit: string): string {
  const symbols: Record<string, string> = {
    'H': '\u2665', 'D': '\u2666', 'C': '\u2663', 'S': '\u2660',
    'hearts': '\u2665', 'diamonds': '\u2666', 'clubs': '\u2663', 'spades': '\u2660',
  };
  return symbols[suit] || suit;
}

function getSuitColor(suit: string): string {
  return suit === 'H' || suit === 'D' || suit === 'hearts' || suit === 'diamonds' ? '#e74c3c' : '#2c3e50';
}

// Actions
async function drawCard() {
  if (!props.isMyTurn || !props.availableActions.includes('draw')) return;
  await props.action('draw', {});
}

async function playCard(card: Card) {
  if (!props.isMyTurn || !props.availableActions.includes('play')) return;
  await props.action('play', { card: card.id });
}
</script>

<template>
  <div class="game-board">
    <!-- Deck Area -->
    <div class="deck-area">
      <div
        class="deck"
        :class="{ clickable: isMyTurn && availableActions.includes('draw') }"
        @click="drawCard"
      >
        <span v-if="deckCount > 0">{{ deckCount }} cards</span>
        <span v-else>Empty</span>
      </div>
      <div class="deck-label">Deck</div>
    </div>

    <!-- My Hand -->
    <div class="hand-area">
      <div class="area-header">
        <span class="area-title">Your Hand</span>
        <span class="card-count">{{ myHand.length }} cards</span>
      </div>
      <div class="cards">
        <div
          v-for="card in myHand"
          :key="card.id"
          class="card"
          :class="{ clickable: isMyTurn && availableActions.includes('play') }"
          :style="{ color: getSuitColor(card.attributes?.suit || '') }"
          @click="playCard(card)"
        >
          <span class="rank">{{ card.attributes?.rank }}</span>
          <span class="suit">{{ getSuitSymbol(card.attributes?.suit || '') }}</span>
        </div>
        <div v-if="myHand.length === 0" class="no-cards">No cards in hand</div>
      </div>
    </div>

    <!-- Turn indicator -->
    <div v-if="isMyTurn" class="turn-indicator">
      Your Turn
    </div>
  </div>
</template>

<style scoped>
.game-board {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 30px;
  padding: 20px;
}

.deck-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.deck {
  width: 100px;
  height: 140px;
  background: linear-gradient(135deg, #1a365d 0%, #2c5282 100%);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  box-shadow: 0 4px 6px rgba(0,0,0,0.3);
  transition: transform 0.2s;
}

.deck.clickable {
  cursor: pointer;
}

.deck.clickable:hover {
  transform: translateY(-4px);
}

.deck-label {
  color: #888;
  font-size: 0.9rem;
}

.hand-area {
  background: rgba(255, 255, 255, 0.05);
  padding: 20px;
  border-radius: 12px;
  width: 100%;
  max-width: 600px;
}

.area-header {
  display: flex;
  gap: 20px;
  margin-bottom: 15px;
  align-items: center;
}

.area-title {
  font-weight: bold;
  font-size: 1.1rem;
}

.card-count {
  font-size: 0.9rem;
  color: #aaa;
}

.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.no-cards {
  color: #666;
  font-style: italic;
}

.card {
  width: 60px;
  height: 84px;
  background: #fff;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.card.clickable {
  cursor: pointer;
}

.card.clickable:hover {
  transform: translateY(-8px);
  box-shadow: 0 8px 20px rgba(0, 217, 255, 0.4);
}

.card .rank {
  font-size: 1.5rem;
}

.card .suit {
  font-size: 1.8rem;
}

.turn-indicator {
  background: linear-gradient(90deg, #00d9ff, #00ff88);
  color: #1a1a2e;
  padding: 8px 24px;
  border-radius: 20px;
  font-weight: bold;
}
</style>
