import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadColumnWidths,
  saveColumnWidths,
  resetColumnWidths,
  DEFAULT_WIDTHS,
} from './column-resize';

describe('column-resize', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loadColumnWidths returns defaults when nothing is stored', () => {
    expect(loadColumnWidths()).toEqual(DEFAULT_WIDTHS);
  });

  it('saveColumnWidths persists and loadColumnWidths retrieves', () => {
    const widths = [0.3, 0.25, 0.2, 0.12, 0.13];
    saveColumnWidths(widths);
    expect(loadColumnWidths()).toEqual(widths);
  });

  it('loadColumnWidths returns defaults for invalid JSON', () => {
    localStorage.setItem('lyra-column-widths', 'not-json');
    expect(loadColumnWidths()).toEqual(DEFAULT_WIDTHS);
  });

  it('loadColumnWidths returns defaults for wrong array length', () => {
    localStorage.setItem('lyra-column-widths', '[0.5, 0.5]');
    expect(loadColumnWidths()).toEqual(DEFAULT_WIDTHS);
  });

  it('loadColumnWidths returns defaults for non-number elements', () => {
    localStorage.setItem('lyra-column-widths', '["a","b","c","d"]');
    expect(loadColumnWidths()).toEqual(DEFAULT_WIDTHS);
  });

  it('resetColumnWidths clears storage and returns defaults', () => {
    saveColumnWidths([0.3, 0.25, 0.2, 0.12, 0.13]);
    const result = resetColumnWidths();
    expect(result).toEqual(DEFAULT_WIDTHS);
    expect(loadColumnWidths()).toEqual(DEFAULT_WIDTHS);
  });

  it('returns a new array each time (no shared reference)', () => {
    const a = loadColumnWidths();
    const b = loadColumnWidths();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
