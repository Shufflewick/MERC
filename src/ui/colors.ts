// Player color constants for UI rendering
export const PLAYER_COLORS: Record<string, string> = {
  enemy: '#e74c3c', // red - for enemy mercs shown to player
  red: '#e63946',
  blue: '#457b9d',
  green: '#2a9d8f',
  yellow: '#e9c46a',
  purple: '#9b5de5',
  orange: '#f77f00',
  black: '#95a5a6', // grey - dictator color
};

// Get color for a player by their playerColor attribute or hex code
export function getPlayerColor(playerColor: string | undefined): string {
  if (!playerColor) return '#666666'; // default gray for uncontrolled
  if (playerColor.startsWith('#')) return playerColor; // already a hex color
  const resolved = PLAYER_COLORS[playerColor];
  if (!resolved) {
    console.warn(`[getPlayerColor DEBUG] No match for "${playerColor}" in PLAYER_COLORS, returning gray`);
  }
  return resolved || '#666666';
}

// UI theme colors (matching mockup)
export const UI_COLORS = {
  background: '#3d4a3d', // dark olive green
  backgroundLight: '#4a5a4a',
  accent: '#d4a84b', // gold/yellow
  accentLight: '#e8c77b',
  text: '#f0f0f0',
  textMuted: '#a0a0a0',
  border: '#5a6a5a',
  cardBg: 'rgba(60, 75, 60, 0.95)',
  // Additional theme colors
  surface: '#3d4a3d',
  surfaceAlt: '#4a5a4a',
  textPrimary: '#f0f0f0',
  textSecondary: '#a0a0a0',
  warning: '#e9c46a',
};
