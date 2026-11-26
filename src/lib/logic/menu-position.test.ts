import { describe, it, expect } from 'vitest';
import { clampMenuPosition, MENU_VIEWPORT_MARGIN } from './menu-position';

const viewport = { width: 1000, height: 700 };
const menu = { width: 180, height: 300 };
const M = MENU_VIEWPORT_MARGIN;

describe('clampMenuPosition', () => {
  it('keeps the click position when the menu fits', () => {
    expect(clampMenuPosition({ x: 100, y: 100 }, menu, viewport)).toEqual({ x: 100, y: 100 });
  });

  it('moves the menu up when it would run past the bottom edge', () => {
    expect(clampMenuPosition({ x: 100, y: 600 }, menu, viewport)).toEqual({
      x: 100,
      y: 700 - 300 - M,
    });
  });

  it('moves the menu left when it would run past the right edge', () => {
    expect(clampMenuPosition({ x: 950, y: 100 }, menu, viewport)).toEqual({
      x: 1000 - 180 - M,
      y: 100,
    });
  });

  it('handles the bottom-right corner on both axes', () => {
    expect(clampMenuPosition({ x: 990, y: 690 }, menu, viewport)).toEqual({
      x: 1000 - 180 - M,
      y: 700 - 300 - M,
    });
  });

  it('pins to the top-left margin when the menu is larger than the viewport', () => {
    const huge = { width: 2000, height: 2000 };
    expect(clampMenuPosition({ x: 500, y: 500 }, huge, viewport)).toEqual({ x: M, y: M });
  });
});
