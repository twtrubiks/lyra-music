import type { Track, SortConfig, SortColumn } from '$lib/types';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export function sortTracks(tracks: Track[], config: SortConfig): Track[] {
  const sorted = [...tracks];
  const { column, direction } = config;
  sorted.sort((a, b) => {
    let cmp: number;
    if (column === 'duration_secs' || column === 'play_count') {
      cmp = (a[column] as number) - (b[column] as number);
    } else {
      cmp = collator.compare(a[column], b[column]);
    }
    return direction === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

export function toggleSort(current: SortConfig, column: SortColumn): SortConfig {
  if (current.column === column) {
    return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { column, direction: 'asc' };
}

const SORT_STORAGE_KEY = 'lyra-sort-config';

export function loadSortConfig(): SortConfig {
  try {
    const stored = localStorage.getItem(SORT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.column && parsed.direction) return parsed;
    }
  } catch {}
  return { column: 'title', direction: 'asc' };
}

export function saveSortConfig(config: SortConfig): void {
  localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(config));
}
