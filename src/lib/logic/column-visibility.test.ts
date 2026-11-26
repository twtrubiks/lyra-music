import { describe, it, expect, beforeEach } from 'vitest';
import {
  ALL_COLUMNS_VISIBLE,
  TITLE_COLUMN,
  displayWidths,
  loadColumnVisibility,
  resizeColumnPair,
  saveColumnVisibility,
  toggleColumn,
  visibleColumnIndices,
} from './column-visibility';

describe('column visibility storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows every column when nothing is stored', () => {
    expect(loadColumnVisibility()).toEqual([true, true, true, true, true]);
  });

  it('persists and retrieves the setting', () => {
    const visibility = [true, false, true, false, true];
    saveColumnVisibility(visibility);
    expect(loadColumnVisibility()).toEqual(visibility);
    // Renaming the key would silently drop every user's saved setting
    expect(localStorage.getItem('lyra-column-visibility')).toBe(JSON.stringify(visibility));
  });

  it('falls back to all visible for invalid stored data', () => {
    for (const raw of ['not-json', '[true,false]', '[true,1,true,true,true]', '{"a":1}']) {
      localStorage.setItem('lyra-column-visibility', raw);
      expect(loadColumnVisibility()).toEqual(ALL_COLUMNS_VISIBLE);
    }
  });

  it('never loads a hidden title column', () => {
    localStorage.setItem('lyra-column-visibility', '[false,false,true,true,true]');
    expect(loadColumnVisibility()).toEqual([true, false, true, true, true]);
  });

  it('returns a new array each time', () => {
    expect(loadColumnVisibility()).not.toBe(loadColumnVisibility());
    expect(loadColumnVisibility()).not.toBe(ALL_COLUMNS_VISIBLE);
  });
});

describe('toggleColumn', () => {
  it('hides a visible column and shows a hidden one', () => {
    const hidden = toggleColumn([true, true, true, true, true], 3);
    expect(hidden).toEqual([true, true, true, false, true]);
    expect(toggleColumn(hidden, 3)).toEqual([true, true, true, true, true]);
  });

  it('does not modify its input', () => {
    const original = [true, true, true, true, true];
    toggleColumn(original, 1);
    expect(original).toEqual([true, true, true, true, true]);
  });

  it('keeps the title column visible', () => {
    expect(toggleColumn([true, true, true, true, true], TITLE_COLUMN)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('ignores an index outside the columns', () => {
    expect(toggleColumn([true, true, true, true, true], 9)).toEqual([true, true, true, true, true]);
  });
});

describe('visibleColumnIndices', () => {
  it('lists the shown columns in order', () => {
    expect(visibleColumnIndices([true, false, true, false, true])).toEqual([0, 2, 4]);
  });
});

describe('displayWidths', () => {
  it('returns the stored widths when everything is shown', () => {
    const widths = [0.3, 0.22, 0.22, 0.13, 0.13];
    const shown = displayWidths(widths, [true, true, true, true, true]);
    shown.forEach((w, i) => expect(w).toBeCloseTo(widths[i]));
  });

  it('stretches the remaining columns to fill the table, keeping their proportions', () => {
    const shown = displayWidths([0.3, 0.2, 0.2, 0.15, 0.15], [true, false, true, false, true]);
    expect(shown).toHaveLength(3);
    expect(shown.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(shown[0] / shown[1]).toBeCloseTo(0.3 / 0.2);
    expect(shown[1] / shown[2]).toBeCloseTo(0.2 / 0.15);
  });

  it('gives a lone column the full width', () => {
    expect(displayWidths([0.3, 0.2, 0.2, 0.15, 0.15], [true, false, false, false, false])).toEqual([
      1,
    ]);
  });
});

describe('resizeColumnPair', () => {
  it('moves width from the right column to the left one', () => {
    const [left, right] = resizeColumnPair(0.3, 0.2, 0.05, 0.1, 0.08);
    expect(left).toBeCloseTo(0.35);
    expect(right).toBeCloseTo(0.15);
  });

  it('stops at the left minimum, keeping the pair total', () => {
    const [left, right] = resizeColumnPair(0.3, 0.2, -0.5, 0.1, 0.08);
    expect(left).toBeCloseTo(0.1);
    expect(right).toBeCloseTo(0.4);
  });

  it('stops at the right minimum, keeping the pair total', () => {
    const [left, right] = resizeColumnPair(0.3, 0.2, 0.5, 0.1, 0.08);
    expect(left).toBeCloseTo(0.42);
    expect(right).toBeCloseTo(0.08);
  });
});
