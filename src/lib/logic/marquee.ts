/** Scroll speed of the now-playing marquee, constant regardless of text length. */
export const MARQUEE_SPEED_PX_PER_S = 30;

/** Lower bound so text that barely overflows does not whip past. */
export const MARQUEE_MIN_DURATION_S = 6;

/**
 * Whether text of natural width `textWidth` needs to scroll inside a box of `boxWidth`.
 * A zero-width box means layout has not happened yet; treat that as "fits".
 */
export function textOverflows(textWidth: number, boxWidth: number): boolean {
  return boxWidth > 0 && textWidth > boxWidth;
}

/** Duration of one marquee loop for text of the given natural width. */
export function marqueeDurationSeconds(textWidth: number): number {
  return Math.max(MARQUEE_MIN_DURATION_S, textWidth / MARQUEE_SPEED_PX_PER_S);
}
