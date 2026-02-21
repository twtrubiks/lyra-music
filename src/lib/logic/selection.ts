export interface SelectionState {
  /** Set of selected track IDs for O(1) lookup */
  selectedIds: Set<number>;
  /** Index in the current tracks array where the anchor was last set (for Shift+Click) */
  anchorIndex: number | null;
}

export function createEmptySelection(): SelectionState {
  return { selectedIds: new Set(), anchorIndex: null };
}

/**
 * Plain click: select only this track, deselect all others, set anchor.
 */
export function selectSingle(tracks: { id: number }[], clickedIndex: number): SelectionState {
  return {
    selectedIds: new Set([tracks[clickedIndex].id]),
    anchorIndex: clickedIndex,
  };
}

/**
 * Ctrl+Click: toggle the clicked track in/out of selection, set anchor.
 */
export function toggleSingle(
  prev: SelectionState,
  tracks: { id: number }[],
  clickedIndex: number,
): SelectionState {
  const id = tracks[clickedIndex].id;
  const next = new Set(prev.selectedIds);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return { selectedIds: next, anchorIndex: clickedIndex };
}

/**
 * Shift+Click: range select from anchor to clicked index (inclusive).
 * Keeps any existing Ctrl-selected items outside the range.
 * If no anchor exists, behaves like selectSingle.
 */
export function selectRange(
  prev: SelectionState,
  tracks: { id: number }[],
  clickedIndex: number,
): SelectionState {
  if (prev.anchorIndex === null) {
    return selectSingle(tracks, clickedIndex);
  }
  const start = Math.min(prev.anchorIndex, clickedIndex);
  const end = Math.max(prev.anchorIndex, clickedIndex);
  const next = new Set(prev.selectedIds);
  for (let i = start; i <= end; i++) {
    next.add(tracks[i].id);
  }
  // anchor does NOT move on shift+click (standard behavior)
  return { selectedIds: next, anchorIndex: prev.anchorIndex };
}

/**
 * Ctrl+A: select all visible tracks. Anchor reset to null.
 */
export function selectAll(tracks: { id: number }[]): SelectionState {
  return {
    selectedIds: new Set(tracks.map((t) => t.id)),
    anchorIndex: null,
  };
}

/**
 * Right-click handling: if the clicked track is already in the selection,
 * keep the selection as-is. If NOT, replace selection with just that track.
 */
export function resolveContextClick(
  prev: SelectionState,
  tracks: { id: number }[],
  clickedIndex: number,
): SelectionState {
  const id = tracks[clickedIndex].id;
  if (prev.selectedIds.has(id)) {
    return prev;
  }
  return selectSingle(tracks, clickedIndex);
}

/**
 * After batch delete: remove deleted IDs from selection, reset anchor.
 */
export function removeFromSelection(prev: SelectionState, deletedIds: Set<number>): SelectionState {
  const next = new Set<number>();
  for (const id of prev.selectedIds) {
    if (!deletedIds.has(id)) next.add(id);
  }
  return { selectedIds: next, anchorIndex: null };
}

/**
 * Get selected tracks in display order.
 */
export function getSelectedTracks<T extends { id: number }>(
  tracks: T[],
  selection: SelectionState,
): T[] {
  return tracks.filter((t) => selection.selectedIds.has(t.id));
}
