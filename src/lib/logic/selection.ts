export interface SelectionState {
  /** Set of selected track IDs for O(1) lookup */
  selectedIds: Set<number>;
  /** Index in the current tracks array where the anchor was last set (for Shift+Click) */
  anchorIndex: number | null;
  /** Index of the keyboard cursor (moves on every Arrow press) */
  focusedIndex: number | null;
}

export function createEmptySelection(): SelectionState {
  return { selectedIds: new Set(), anchorIndex: null, focusedIndex: null };
}

/**
 * Plain click: select only this track, deselect all others, set anchor.
 */
export function selectSingle(tracks: { id: number }[], clickedIndex: number): SelectionState {
  return {
    selectedIds: new Set([tracks[clickedIndex].id]),
    anchorIndex: clickedIndex,
    focusedIndex: clickedIndex,
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
  return { selectedIds: next, anchorIndex: clickedIndex, focusedIndex: clickedIndex };
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
  return { selectedIds: next, anchorIndex: prev.anchorIndex, focusedIndex: clickedIndex };
}

/**
 * Ctrl+A: select all visible tracks. Anchor reset to null.
 */
export function selectAll(tracks: { id: number }[]): SelectionState {
  return {
    selectedIds: new Set(tracks.map((t) => t.id)),
    anchorIndex: null,
    focusedIndex: null,
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
  return { selectedIds: next, anchorIndex: null, focusedIndex: null };
}

/**
 * Arrow↓: move focus down, select only that row.
 */
export function moveFocusDown(prev: SelectionState, tracks: { id: number }[]): SelectionState {
  if (tracks.length === 0) return prev;
  const clamped =
    prev.focusedIndex === null ? null : Math.min(prev.focusedIndex, tracks.length - 1);
  const next = clamped === null ? 0 : Math.min(clamped + 1, tracks.length - 1);
  return {
    selectedIds: new Set([tracks[next].id]),
    anchorIndex: next,
    focusedIndex: next,
  };
}

/**
 * Arrow↑: move focus up, select only that row.
 */
export function moveFocusUp(prev: SelectionState, tracks: { id: number }[]): SelectionState {
  if (tracks.length === 0) return prev;
  const clamped =
    prev.focusedIndex === null ? null : Math.min(prev.focusedIndex, tracks.length - 1);
  const next = clamped === null ? tracks.length - 1 : Math.max(clamped - 1, 0);
  return {
    selectedIds: new Set([tracks[next].id]),
    anchorIndex: next,
    focusedIndex: next,
  };
}

/**
 * Shift+Arrow↓: anchor stays, focus moves down, range select.
 */
export function extendSelectionDown(
  prev: SelectionState,
  tracks: { id: number }[],
): SelectionState {
  if (tracks.length === 0) return prev;
  const anchor = Math.min(prev.anchorIndex ?? 0, tracks.length - 1);
  const clampedFocus =
    prev.focusedIndex === null ? null : Math.min(prev.focusedIndex, tracks.length - 1);
  const focus = clampedFocus === null ? 0 : Math.min(clampedFocus + 1, tracks.length - 1);
  const start = Math.min(anchor, focus);
  const end = Math.max(anchor, focus);
  const ids = new Set<number>();
  for (let i = start; i <= end; i++) {
    ids.add(tracks[i].id);
  }
  return { selectedIds: ids, anchorIndex: anchor, focusedIndex: focus };
}

/**
 * Shift+Arrow↑: anchor stays, focus moves up, range select.
 */
export function extendSelectionUp(prev: SelectionState, tracks: { id: number }[]): SelectionState {
  if (tracks.length === 0) return prev;
  const anchor = Math.min(prev.anchorIndex ?? tracks.length - 1, tracks.length - 1);
  const clampedFocus =
    prev.focusedIndex === null ? null : Math.min(prev.focusedIndex, tracks.length - 1);
  const focus = clampedFocus === null ? tracks.length - 1 : Math.max(clampedFocus - 1, 0);
  const start = Math.min(anchor, focus);
  const end = Math.max(anchor, focus);
  const ids = new Set<number>();
  for (let i = start; i <= end; i++) {
    ids.add(tracks[i].id);
  }
  return { selectedIds: ids, anchorIndex: anchor, focusedIndex: focus };
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
