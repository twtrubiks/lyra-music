export const ROW_HEIGHT = 37;
const DEFAULT_OVERSCAN = 10;

export interface VisibleRange {
  startIndex: number;
  endIndex: number;
  topPadding: number;
  bottomPadding: number;
}

export function calculateVisibleRange(
  scrollTop: number,
  containerHeight: number,
  totalCount: number,
  rowHeight: number = ROW_HEIGHT,
  overscan: number = DEFAULT_OVERSCAN,
): VisibleRange {
  if (totalCount === 0 || containerHeight <= 0) {
    return { startIndex: 0, endIndex: 0, topPadding: 0, bottomPadding: 0 };
  }

  const totalHeight = totalCount * rowHeight;

  const rawStart = Math.floor(scrollTop / rowHeight);
  const rawEnd = Math.ceil((scrollTop + containerHeight) / rowHeight);

  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(totalCount, rawEnd + overscan);

  const topPadding = startIndex * rowHeight;
  const bottomPadding = Math.max(0, totalHeight - endIndex * rowHeight);

  return { startIndex, endIndex, topPadding, bottomPadding };
}

export function scrollTopForIndex(
  index: number,
  scrollTop: number,
  containerHeight: number,
  rowHeight: number = ROW_HEIGHT,
  headerHeight: number = 0,
): number | null {
  const rowTop = index * rowHeight + headerHeight;
  const rowBottom = rowTop + rowHeight;

  const viewTop = scrollTop;
  const viewBottom = scrollTop + containerHeight;

  // Already fully visible
  if (rowTop >= viewTop && rowBottom <= viewBottom) {
    return null;
  }

  // Above viewport — scroll up so row is at top
  if (rowTop < viewTop) {
    return rowTop;
  }

  // Below viewport — scroll down so row is at bottom
  return rowBottom - containerHeight;
}
