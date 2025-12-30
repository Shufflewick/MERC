// Player color constants for UI rendering
export const PLAYER_COLORS: Record<string, string> = {
  dictator: '#1a1a1a', // black
  red: '#e63946',
  blue: '#457b9d',
  green: '#2a9d8f',
  yellow: '#e9c46a',
  purple: '#9b5de5',
  orange: '#f77f00',
};

// Lighter versions for backgrounds/highlights
export const PLAYER_COLORS_LIGHT: Record<string, string> = {
  dictator: '#333333',
  red: '#f5a3ab',
  blue: '#a8c5d9',
  green: '#8fd4ca',
  yellow: '#f5e4b3',
  purple: '#d4b8f0',
  orange: '#fcc580',
};

// Get color for a player by their playerColor attribute
export function getPlayerColor(playerColor: string | undefined): string {
  if (!playerColor) return '#666666'; // default gray for uncontrolled
  return PLAYER_COLORS[playerColor] || '#666666';
}

// Get light color variant for a player
export function getPlayerColorLight(playerColor: string | undefined): string {
  if (!playerColor) return '#888888';
  return PLAYER_COLORS_LIGHT[playerColor] || '#888888';
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
