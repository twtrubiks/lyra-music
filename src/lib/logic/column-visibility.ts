const STORAGE_KEY = 'lyra-column-visibility';

/** Track list columns, in display order: title, artist, album, plays, duration. */
const COLUMN_COUNT = 5;

/** The title identifies a row, so it can never be hidden. */
export const TITLE_COLUMN = 0;

export const ALL_COLUMNS_VISIBLE: readonly boolean[] = Array<boolean>(COLUMN_COUNT).fill(true);

export function loadColumnVisibility(): boolean[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...ALL_COLUMNS_VISIBLE];
    const parsed: unknown = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      parsed.length !== COLUMN_COUNT ||
      parsed.some((v: unknown) => typeof v !== 'boolean')
    ) {
      return [...ALL_COLUMNS_VISIBLE];
    }
    return parsed.map((visible: boolean, i) => i === TITLE_COLUMN || visible);
  } catch {
    return [...ALL_COLUMNS_VISIBLE];
  }
}

export function saveColumnVisibility(visibility: readonly boolean[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility));
}

/** Show or hide one column. The title column and unknown indices are left alone. */
export function toggleColumn(visibility: readonly boolean[], index: number): boolean[] {
  if (index === TITLE_COLUMN) return [...visibility];
  return visibility.map((visible, i) => (i === index ? !visible : visible));
}

export function visibleColumnIndices(visibility: readonly boolean[]): number[] {
  return visibility.flatMap((visible, i) => (visible ? [i] : []));
}

/**
 * Widths of the shown columns as fractions of the table, in display order.
 * Hidden columns give their space to the others in proportion; the stored
 * widths are untouched, so a column comes back at its old size.
 */
export function displayWidths(widths: readonly number[], visibility: readonly boolean[]): number[] {
  const shown = visibleColumnIndices(visibility).map((i) => widths[i]);
  const total = shown.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return shown.map(() => 1 / shown.length);
  return shown.map((w) => w / total);
}

/**
 * New widths for two neighbouring columns after dragging the border between
 * them by `delta`. The pair's total is preserved; neither goes below its minimum.
 */
export function resizeColumnPair(
  startLeft: number,
  startRight: number,
  delta: number,
  minLeft: number,
  minRight: number,
): [number, number] {
  const total = startLeft + startRight;
  let left = startLeft + delta;
  if (left < minLeft) left = minLeft;
  if (total - left < minRight) left = total - minRight;
  return [left, total - left];
}
