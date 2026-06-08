/// <reference types="vite/client" />

/**
 * Resolves a relative asset path (from data JSON) to a URL that works
 * in both dev (Vite serves public/ at root) and production (ShufflewickPub
 * serves assets relative to the game's base path).
 *
 * Data stores paths like "mercs/apeiron.jpg". This prepends the Vite base URL
 * so they resolve correctly regardless of where the app is hosted.
 */
export function assetUrl(path: string): string {
  if (!path) return '';
  const base = import.meta.env.BASE_URL;
  // Strip leading slash if present to avoid double slashes
  const cleanPath = path.replace(/^\//, '');
  return `${base}${cleanPath}`;
}
