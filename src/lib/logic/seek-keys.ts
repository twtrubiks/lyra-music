/** Keyboard seeking on the progress slider. */

const STEP_SECS = 5;
const PAGE_SECS = 30;

/**
 * Position to seek to for a key pressed on the progress slider, or `null`
 * when the key is not a seek key (or nothing is loaded). Steps match the
 * global ←/→ shortcuts; the native range step would be half a second.
 */
export function seekKeyTarget(
  key: string,
  positionSecs: number,
  durationSecs: number,
): number | null {
  if (durationSecs <= 0) return null;
  let target: number;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      target = positionSecs + STEP_SECS;
      break;
    case 'ArrowLeft':
    case 'ArrowDown':
      target = positionSecs - STEP_SECS;
      break;
    case 'PageUp':
      target = positionSecs + PAGE_SECS;
      break;
    case 'PageDown':
      target = positionSecs - PAGE_SECS;
      break;
    case 'Home':
      target = 0;
      break;
    case 'End':
      target = durationSecs;
      break;
    default:
      return null;
  }
  return Math.min(durationSecs, Math.max(0, target));
}
