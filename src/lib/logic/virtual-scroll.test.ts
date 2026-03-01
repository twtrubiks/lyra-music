import { describe, it, expect } from 'vitest';
import { calculateVisibleRange, scrollTopForIndex, ROW_HEIGHT } from './virtual-scroll';

describe('calculateVisibleRange', () => {
  it('returns zero range for empty list', () => {
    const result = calculateVisibleRange(0, 500, 0);
    expect(result).toEqual({ startIndex: 0, endIndex: 0, topPadding: 0, bottomPadding: 0 });
  });

  it('returns zero range when containerHeight is 0', () => {
    const result = calculateVisibleRange(0, 0, 100);
    expect(result).toEqual({ startIndex: 0, endIndex: 0, topPadding: 0, bottomPadding: 0 });
  });

  it('renders all items for small list that fits in viewport', () => {
    const totalCount = 5;
    const containerHeight = totalCount * ROW_HEIGHT + 100; // more than enough
    const result = calculateVisibleRange(0, containerHeight, totalCount);

    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(totalCount);
    expect(result.topPadding).toBe(0);
    expect(result.bottomPadding).toBe(0);
  });

  it('calculates correct range at top of list', () => {
    const totalCount = 1000;
    const containerHeight = 500;
    const result = calculateVisibleRange(0, containerHeight, totalCount);

    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBeGreaterThan(0);
    expect(result.topPadding).toBe(0);
    expect(result.bottomPadding).toBeGreaterThan(0);
  });

  it('calculates correct range in middle of list', () => {
    const totalCount = 1000;
    const containerHeight = 500;
    const scrollTop = 5000;
    const result = calculateVisibleRange(scrollTop, containerHeight, totalCount);

    expect(result.startIndex).toBeGreaterThan(0);
    expect(result.endIndex).toBeLessThan(totalCount);
    expect(result.topPadding).toBeGreaterThan(0);
    expect(result.bottomPadding).toBeGreaterThan(0);
  });

  it('calculates correct range at bottom of list', () => {
    const totalCount = 1000;
    const containerHeight = 500;
    const totalHeight = totalCount * ROW_HEIGHT;
    const scrollTop = totalHeight - containerHeight;
    const result = calculateVisibleRange(scrollTop, containerHeight, totalCount);

    expect(result.endIndex).toBe(totalCount);
    expect(result.bottomPadding).toBe(0);
    expect(result.topPadding).toBeGreaterThan(0);
  });

  it('maintains invariant: topPadding + rendered rows height + bottomPadding === totalHeight', () => {
    const totalCount = 1000;
    const containerHeight = 500;

    for (const scrollTop of [0, 1000, 5000, 18000, totalCount * ROW_HEIGHT - containerHeight]) {
      const result = calculateVisibleRange(scrollTop, containerHeight, totalCount);
      const renderedHeight = (result.endIndex - result.startIndex) * ROW_HEIGHT;
      const totalHeight = totalCount * ROW_HEIGHT;

      expect(result.topPadding + renderedHeight + result.bottomPadding).toBe(totalHeight);
    }
  });

  it('respects overscan parameter', () => {
    const totalCount = 1000;
    const containerHeight = 370; // exactly 10 rows
    const scrollTop = 3700; // row 100

    const withoutOverscan = calculateVisibleRange(
      scrollTop,
      containerHeight,
      totalCount,
      ROW_HEIGHT,
      0,
    );
    const withOverscan = calculateVisibleRange(
      scrollTop,
      containerHeight,
      totalCount,
      ROW_HEIGHT,
      5,
    );

    expect(withOverscan.startIndex).toBeLessThan(withoutOverscan.startIndex);
    expect(withOverscan.endIndex).toBeGreaterThan(withoutOverscan.endIndex);
  });

  it('clamps overscan to list boundaries', () => {
    const totalCount = 100;
    const containerHeight = 500;

    // Near start
    const resultStart = calculateVisibleRange(0, containerHeight, totalCount, ROW_HEIGHT, 50);
    expect(resultStart.startIndex).toBe(0);

    // Near end
    const scrollTop = totalCount * ROW_HEIGHT - containerHeight;
    const resultEnd = calculateVisibleRange(scrollTop, containerHeight, totalCount, ROW_HEIGHT, 50);
    expect(resultEnd.endIndex).toBe(totalCount);
  });
});

describe('scrollTopForIndex', () => {
  it('returns null when row is already visible', () => {
    const containerHeight = 500;
    const scrollTop = 370; // row 10 is at top
    const index = 12; // row 12: top = 444, bottom = 481, within [370, 870]

    const result = scrollTopForIndex(index, scrollTop, containerHeight);
    expect(result).toBeNull();
  });

  it('returns correct scrollTop when row is above viewport', () => {
    const containerHeight = 500;
    const scrollTop = 1000;
    const index = 5; // row top = 185

    const result = scrollTopForIndex(index, scrollTop, containerHeight);
    expect(result).toBe(5 * ROW_HEIGHT);
  });

  it('returns correct scrollTop when row is below viewport', () => {
    const containerHeight = 500;
    const scrollTop = 0;
    const index = 20; // row top = 740, row bottom = 777, below viewport [0, 500]

    const result = scrollTopForIndex(index, scrollTop, containerHeight);
    expect(result).toBe((20 + 1) * ROW_HEIGHT - containerHeight);
  });

  it('accounts for headerHeight offset', () => {
    const containerHeight = 500;
    const scrollTop = 0;
    const headerHeight = 40;
    const index = 0;

    // Row 0 with header: rowTop = 0 + 40 = 40, rowBottom = 77
    // viewport: [0, 500] — already visible
    const result = scrollTopForIndex(index, scrollTop, containerHeight, ROW_HEIGHT, headerHeight);
    expect(result).toBeNull();
  });

  it('returns scrollTop for row 0 above viewport with headerHeight', () => {
    const containerHeight = 500;
    const scrollTop = 100;
    const headerHeight = 40;
    const index = 0;

    // Row 0: rowTop = 0 + 40 = 40, below scrollTop 100? No, 40 < 100 → above viewport
    const result = scrollTopForIndex(index, scrollTop, containerHeight, ROW_HEIGHT, headerHeight);
    expect(result).toBe(40);
  });
});
