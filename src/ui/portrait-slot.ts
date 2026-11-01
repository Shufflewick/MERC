/** Where a combatant portrait sits in a sector tile (its centre, in viewport pixels) and how big it is drawn, read from the tile as rendered. */
export function sectorPortraitSlot(sectorId: string): { x: number; y: number; size: number } | null {
  const body = document.querySelector(`[data-sector-id="${sectorId}"] .tile-body`);
  const mercRow = body?.querySelector('.mercs-area');
  if (!body || !mercRow) return null;
  const size = parseFloat(getComputedStyle(body).getPropertyValue('--portrait-size'));
  const row = mercRow.getBoundingClientRect();
  return { x: row.left + size / 2, y: row.bottom - size / 2, size };
}
