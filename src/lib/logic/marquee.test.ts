import { describe, it, expect } from 'vitest';
import {
  MARQUEE_MIN_DURATION_S,
  MARQUEE_SPEED_PX_PER_S,
  marqueeDurationSeconds,
  textOverflows,
} from './marquee';

describe('textOverflows', () => {
  it('is true when the text is wider than its box', () => {
    expect(textOverflows(300, 150)).toBe(true);
  });

  it('is false when the text fits', () => {
    expect(textOverflows(100, 150)).toBe(false);
  });

  it('is false when the text exactly fills the box', () => {
    expect(textOverflows(150, 150)).toBe(false);
  });

  it('is false when the box has not been laid out yet', () => {
    expect(textOverflows(300, 0)).toBe(false);
  });
});

describe('marqueeDurationSeconds', () => {
  it('scales with text width so the scroll speed stays constant', () => {
    const short = marqueeDurationSeconds(600);
    const long = marqueeDurationSeconds(1200);
    expect(short).toBe(600 / MARQUEE_SPEED_PX_PER_S);
    expect(long).toBe(short * 2);
  });

  it('never goes below the minimum duration', () => {
    expect(marqueeDurationSeconds(10)).toBe(MARQUEE_MIN_DURATION_S);
    expect(marqueeDurationSeconds(0)).toBe(MARQUEE_MIN_DURATION_S);
  });
});
