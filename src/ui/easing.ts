/** Cubic easings for the requestAnimationFrame animations (BoardSmith stopped exporting its own, #526). */
export const easeInCubic = (t: number): number => t * t * t;
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
