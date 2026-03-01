import { describe, it, expect } from 'vitest';
import {
  createEmptySelection,
  selectSingle,
  toggleSingle,
  selectRange,
  selectAll,
  resolveContextClick,
  removeFromSelection,
  getSelectedTracks,
  moveFocusDown,
  moveFocusUp,
  extendSelectionDown,
  extendSelectionUp,
} from './selection';
import { createMockTracks } from '$lib/test-helpers';

// Helper: create a 5-track list with ids 1..5
const tracks = createMockTracks(5);

// ============================================================
// createEmptySelection
// ============================================================

describe('createEmptySelection', () => {
  it('returns empty set and null anchor and null focusedIndex', () => {
    const s = createEmptySelection();
    expect(s.selectedIds.size).toBe(0);
    expect(s.anchorIndex).toBeNull();
    expect(s.focusedIndex).toBeNull();
  });
});

// ============================================================
// selectSingle — plain click
// ============================================================

describe('selectSingle', () => {
  it('selects exactly one track and sets anchor and focusedIndex', () => {
    const s = selectSingle(tracks, 2);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(tracks[2].id)).toBe(true);
    expect(s.anchorIndex).toBe(2);
    expect(s.focusedIndex).toBe(2);
  });

  it('selects the first track', () => {
    const s = selectSingle(tracks, 0);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(tracks[0].id)).toBe(true);
    expect(s.anchorIndex).toBe(0);
  });

  it('selects the last track', () => {
    const s = selectSingle(tracks, 4);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(tracks[4].id)).toBe(true);
    expect(s.anchorIndex).toBe(4);
  });

  it('works with single-item list', () => {
    const single = createMockTracks(1);
    const s = selectSingle(single, 0);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(single[0].id)).toBe(true);
  });
});

// ============================================================
// toggleSingle — Ctrl+Click
// ============================================================

describe('toggleSingle', () => {
  it('adds unselected track to selection', () => {
    const prev = selectSingle(tracks, 0); // track 1 selected
    const s = toggleSingle(prev, tracks, 2); // Ctrl+Click track 3
    expect(s.selectedIds.size).toBe(2);
    expect(s.selectedIds.has(tracks[0].id)).toBe(true);
    expect(s.selectedIds.has(tracks[2].id)).toBe(true);
  });

  it('removes already-selected track from selection', () => {
    // Select tracks 0 and 2
    let s = selectSingle(tracks, 0);
    s = toggleSingle(s, tracks, 2);
    expect(s.selectedIds.size).toBe(2);

    // Ctrl+Click track 0 again to deselect
    s = toggleSingle(s, tracks, 0);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(tracks[0].id)).toBe(false);
    expect(s.selectedIds.has(tracks[2].id)).toBe(true);
  });

  it('sets anchor and focusedIndex to clicked index', () => {
    const prev = selectSingle(tracks, 0);
    const s = toggleSingle(prev, tracks, 3);
    expect(s.anchorIndex).toBe(3);
    expect(s.focusedIndex).toBe(3);
  });

  it('toggling from empty selection adds the track', () => {
    const prev = createEmptySelection();
    const s = toggleSingle(prev, tracks, 1);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(tracks[1].id)).toBe(true);
    expect(s.anchorIndex).toBe(1);
  });

  it('toggling last selected track results in empty selection', () => {
    const prev = selectSingle(tracks, 2);
    const s = toggleSingle(prev, tracks, 2);
    expect(s.selectedIds.size).toBe(0);
    expect(s.anchorIndex).toBe(2); // anchor still set
  });
});

// ============================================================
// selectRange — Shift+Click
// ============================================================

describe('selectRange', () => {
  it('selects range from anchor downward', () => {
    const prev = selectSingle(tracks, 1); // anchor at 1
    const s = selectRange(prev, tracks, 3); // Shift+Click at 3
    expect(s.selectedIds.size).toBe(3);
    expect(s.selectedIds.has(tracks[1].id)).toBe(true);
    expect(s.selectedIds.has(tracks[2].id)).toBe(true);
    expect(s.selectedIds.has(tracks[3].id)).toBe(true);
  });

  it('selects range from anchor upward', () => {
    const prev = selectSingle(tracks, 3); // anchor at 3
    const s = selectRange(prev, tracks, 1); // Shift+Click at 1
    expect(s.selectedIds.size).toBe(3);
    expect(s.selectedIds.has(tracks[1].id)).toBe(true);
    expect(s.selectedIds.has(tracks[2].id)).toBe(true);
    expect(s.selectedIds.has(tracks[3].id)).toBe(true);
  });

  it('anchor does not move on shift+click, focusedIndex moves', () => {
    const prev = selectSingle(tracks, 1);
    const s = selectRange(prev, tracks, 3);
    expect(s.anchorIndex).toBe(1); // stays at original anchor
    expect(s.focusedIndex).toBe(3); // moves to clicked index
  });

  it('shift+click on same row as anchor selects just that row', () => {
    const prev = selectSingle(tracks, 2);
    const s = selectRange(prev, tracks, 2);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(tracks[2].id)).toBe(true);
  });

  it('keeps existing Ctrl-selected items outside the range', () => {
    // Ctrl+Click track 0, then Ctrl+Click track 4
    let prev = toggleSingle(createEmptySelection(), tracks, 0);
    prev = toggleSingle(prev, tracks, 4);
    // anchor is now at 4; Shift+Click track 2
    const s = selectRange(prev, tracks, 2);
    // Should have: 0 (Ctrl), 2,3,4 (range)
    expect(s.selectedIds.size).toBe(4);
    expect(s.selectedIds.has(tracks[0].id)).toBe(true); // kept from Ctrl
    expect(s.selectedIds.has(tracks[2].id)).toBe(true);
    expect(s.selectedIds.has(tracks[3].id)).toBe(true);
    expect(s.selectedIds.has(tracks[4].id)).toBe(true);
  });

  it('falls back to selectSingle when no anchor', () => {
    const prev = createEmptySelection(); // no anchor
    const s = selectRange(prev, tracks, 2);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(tracks[2].id)).toBe(true);
    expect(s.anchorIndex).toBe(2);
  });

  it('selects full range from first to last', () => {
    const prev = selectSingle(tracks, 0);
    const s = selectRange(prev, tracks, 4);
    expect(s.selectedIds.size).toBe(5);
    for (const t of tracks) {
      expect(s.selectedIds.has(t.id)).toBe(true);
    }
  });
});

// ============================================================
// selectAll — Ctrl+A
// ============================================================

describe('selectAll', () => {
  it('selects all tracks', () => {
    const s = selectAll(tracks);
    expect(s.selectedIds.size).toBe(5);
    for (const t of tracks) {
      expect(s.selectedIds.has(t.id)).toBe(true);
    }
  });

  it('sets anchor and focusedIndex to null', () => {
    const s = selectAll(tracks);
    expect(s.anchorIndex).toBeNull();
    expect(s.focusedIndex).toBeNull();
  });

  it('handles empty track list', () => {
    const s = selectAll([]);
    expect(s.selectedIds.size).toBe(0);
    expect(s.anchorIndex).toBeNull();
  });

  it('handles single-item list', () => {
    const single = createMockTracks(1);
    const s = selectAll(single);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(single[0].id)).toBe(true);
  });
});

// ============================================================
// resolveContextClick — right-click
// ============================================================

describe('resolveContextClick', () => {
  it('keeps selection when right-clicked track is already selected', () => {
    // Select tracks 1,2,3
    const prev = selectSingle(tracks, 0);
    const multi = selectRange(prev, tracks, 2);
    // Right-click track 2 (already selected)
    const s = resolveContextClick(multi, tracks, 1);
    expect(s.selectedIds.size).toBe(3); // unchanged
    expect(s).toBe(multi); // same object reference
  });

  it('replaces selection when right-clicked track is not selected', () => {
    // Select tracks 0,1,2
    const prev = selectSingle(tracks, 0);
    const multi = selectRange(prev, tracks, 2);
    // Right-click track 4 (not selected)
    const s = resolveContextClick(multi, tracks, 4);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(tracks[4].id)).toBe(true);
    expect(s.anchorIndex).toBe(4);
  });

  it('works with empty prior selection', () => {
    const prev = createEmptySelection();
    const s = resolveContextClick(prev, tracks, 2);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(tracks[2].id)).toBe(true);
  });
});

// ============================================================
// removeFromSelection — post-delete cleanup
// ============================================================

describe('removeFromSelection', () => {
  it('removes deleted IDs from selection', () => {
    const prev = selectAll(tracks); // all 5 selected
    const deleted = new Set([tracks[1].id, tracks[3].id]);
    const s = removeFromSelection(prev, deleted);
    expect(s.selectedIds.size).toBe(3);
    expect(s.selectedIds.has(tracks[0].id)).toBe(true);
    expect(s.selectedIds.has(tracks[1].id)).toBe(false);
    expect(s.selectedIds.has(tracks[2].id)).toBe(true);
    expect(s.selectedIds.has(tracks[3].id)).toBe(false);
    expect(s.selectedIds.has(tracks[4].id)).toBe(true);
  });

  it('resets anchor and focusedIndex to null', () => {
    const prev = { selectedIds: new Set([1, 2, 3]), anchorIndex: 1, focusedIndex: 1 };
    const s = removeFromSelection(prev, new Set([2]));
    expect(s.anchorIndex).toBeNull();
    expect(s.focusedIndex).toBeNull();
  });

  it('handles deleting all selected tracks', () => {
    const prev = selectAll(tracks);
    const allIds = new Set(tracks.map((t) => t.id));
    const s = removeFromSelection(prev, allIds);
    expect(s.selectedIds.size).toBe(0);
  });

  it('handles deleting IDs not in selection (no-op)', () => {
    const prev = selectSingle(tracks, 0);
    const s = removeFromSelection(prev, new Set([999]));
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(tracks[0].id)).toBe(true);
  });

  it('handles empty selection', () => {
    const prev = createEmptySelection();
    const s = removeFromSelection(prev, new Set([1, 2]));
    expect(s.selectedIds.size).toBe(0);
  });
});

// ============================================================
// getSelectedTracks — retrieve in display order
// ============================================================

describe('getSelectedTracks', () => {
  it('returns selected tracks in display order', () => {
    const selection = {
      selectedIds: new Set([tracks[3].id, tracks[1].id]),
      anchorIndex: null,
      focusedIndex: null,
    };
    const result = getSelectedTracks(tracks, selection);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(tracks[1].id); // index 1 comes before index 3
    expect(result[1].id).toBe(tracks[3].id);
  });

  it('returns empty array for empty selection', () => {
    const selection = createEmptySelection();
    const result = getSelectedTracks(tracks, selection);
    expect(result).toHaveLength(0);
  });

  it('returns all tracks when all selected', () => {
    const selection = selectAll(tracks);
    const result = getSelectedTracks(tracks, selection);
    expect(result).toHaveLength(5);
  });

  it('ignores stale IDs not in tracks array', () => {
    const selection = {
      selectedIds: new Set([tracks[0].id, 999]),
      anchorIndex: null,
      focusedIndex: null,
    };
    const result = getSelectedTracks(tracks, selection);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(tracks[0].id);
  });

  it('preserves Track type fields', () => {
    const selection = selectSingle(tracks, 0);
    const result = getSelectedTracks(tracks, selection);
    expect(result[0].title).toBe(tracks[0].title);
    expect(result[0].artist).toBe(tracks[0].artist);
  });
});

// ============================================================
// moveFocusDown — Arrow↓
// ============================================================

describe('moveFocusDown', () => {
  it('moves focus from null to first row', () => {
    const prev = createEmptySelection();
    const s = moveFocusDown(prev, tracks);
    expect(s.focusedIndex).toBe(0);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(tracks[0].id)).toBe(true);
    expect(s.anchorIndex).toBe(0);
  });

  it('moves focus down by one', () => {
    const prev = selectSingle(tracks, 1);
    const s = moveFocusDown(prev, tracks);
    expect(s.focusedIndex).toBe(2);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(tracks[2].id)).toBe(true);
  });

  it('clamps at last row', () => {
    const prev = selectSingle(tracks, 4);
    const s = moveFocusDown(prev, tracks);
    expect(s.focusedIndex).toBe(4);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(tracks[4].id)).toBe(true);
  });

  it('returns prev for empty tracks', () => {
    const prev = createEmptySelection();
    const s = moveFocusDown(prev, []);
    expect(s).toBe(prev);
  });

  it('clamps stale focusedIndex when tracks array shrinks', () => {
    const prev = { selectedIds: new Set([tracks[4].id]), anchorIndex: 4, focusedIndex: 4 };
    const shorter = createMockTracks(3);
    const s = moveFocusDown(prev, shorter);
    expect(s.focusedIndex).toBe(2); // clamped to last
    expect(s.selectedIds.has(shorter[2].id)).toBe(true);
  });
});

// ============================================================
// moveFocusUp — Arrow↑
// ============================================================

describe('moveFocusUp', () => {
  it('moves focus from null to last row', () => {
    const prev = createEmptySelection();
    const s = moveFocusUp(prev, tracks);
    expect(s.focusedIndex).toBe(4);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(tracks[4].id)).toBe(true);
    expect(s.anchorIndex).toBe(4);
  });

  it('moves focus up by one', () => {
    const prev = selectSingle(tracks, 3);
    const s = moveFocusUp(prev, tracks);
    expect(s.focusedIndex).toBe(2);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(tracks[2].id)).toBe(true);
  });

  it('clamps at first row', () => {
    const prev = selectSingle(tracks, 0);
    const s = moveFocusUp(prev, tracks);
    expect(s.focusedIndex).toBe(0);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(tracks[0].id)).toBe(true);
  });

  it('returns prev for empty tracks', () => {
    const prev = createEmptySelection();
    const s = moveFocusUp(prev, []);
    expect(s).toBe(prev);
  });

  it('clamps stale focusedIndex when tracks array shrinks', () => {
    const prev = { selectedIds: new Set([tracks[4].id]), anchorIndex: 4, focusedIndex: 4 };
    const shorter = createMockTracks(3);
    const s = moveFocusUp(prev, shorter);
    expect(s.focusedIndex).toBe(1); // clamped to 2, then -1 = 1
    expect(s.selectedIds.has(shorter[1].id)).toBe(true);
  });
});

// ============================================================
// extendSelectionDown — Shift+Arrow↓
// ============================================================

describe('extendSelectionDown', () => {
  it('extends from null focus: anchor=0, focus=0', () => {
    const prev = createEmptySelection();
    const s = extendSelectionDown(prev, tracks);
    expect(s.anchorIndex).toBe(0);
    expect(s.focusedIndex).toBe(0);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(tracks[0].id)).toBe(true);
  });

  it('extends range downward', () => {
    const prev = selectSingle(tracks, 1); // anchor=1, focus=1
    const s = extendSelectionDown(prev, tracks);
    expect(s.anchorIndex).toBe(1);
    expect(s.focusedIndex).toBe(2);
    expect(s.selectedIds.size).toBe(2);
    expect(s.selectedIds.has(tracks[1].id)).toBe(true);
    expect(s.selectedIds.has(tracks[2].id)).toBe(true);
  });

  it('clamps focus at last row', () => {
    const prev = selectSingle(tracks, 4);
    const s = extendSelectionDown(prev, tracks);
    expect(s.focusedIndex).toBe(4);
  });

  it('returns prev for empty tracks', () => {
    const prev = createEmptySelection();
    const s = extendSelectionDown(prev, []);
    expect(s).toBe(prev);
  });

  it('shrinks range when extending back toward anchor', () => {
    // anchor=2, focus=0 (extended up), now extend down
    const prev = {
      selectedIds: new Set([tracks[0].id, tracks[1].id, tracks[2].id]),
      anchorIndex: 2,
      focusedIndex: 0,
    };
    const s = extendSelectionDown(prev, tracks);
    expect(s.anchorIndex).toBe(2);
    expect(s.focusedIndex).toBe(1);
    expect(s.selectedIds.size).toBe(2);
    expect(s.selectedIds.has(tracks[1].id)).toBe(true);
    expect(s.selectedIds.has(tracks[2].id)).toBe(true);
  });
});

// ============================================================
// extendSelectionUp — Shift+Arrow↑
// ============================================================

describe('extendSelectionUp', () => {
  it('extends from null focus: anchor=last, focus=last', () => {
    const prev = createEmptySelection();
    const s = extendSelectionUp(prev, tracks);
    expect(s.anchorIndex).toBe(4);
    expect(s.focusedIndex).toBe(4);
    expect(s.selectedIds.size).toBe(1);
    expect(s.selectedIds.has(tracks[4].id)).toBe(true);
  });

  it('extends range upward', () => {
    const prev = selectSingle(tracks, 3); // anchor=3, focus=3
    const s = extendSelectionUp(prev, tracks);
    expect(s.anchorIndex).toBe(3);
    expect(s.focusedIndex).toBe(2);
    expect(s.selectedIds.size).toBe(2);
    expect(s.selectedIds.has(tracks[2].id)).toBe(true);
    expect(s.selectedIds.has(tracks[3].id)).toBe(true);
  });

  it('clamps focus at first row', () => {
    const prev = selectSingle(tracks, 0);
    const s = extendSelectionUp(prev, tracks);
    expect(s.focusedIndex).toBe(0);
  });

  it('returns prev for empty tracks', () => {
    const prev = createEmptySelection();
    const s = extendSelectionUp(prev, []);
    expect(s).toBe(prev);
  });

  it('shrinks range when extending back toward anchor', () => {
    // anchor=1, focus=3 (extended down), now extend up
    const prev = {
      selectedIds: new Set([tracks[1].id, tracks[2].id, tracks[3].id]),
      anchorIndex: 1,
      focusedIndex: 3,
    };
    const s = extendSelectionUp(prev, tracks);
    expect(s.anchorIndex).toBe(1);
    expect(s.focusedIndex).toBe(2);
    expect(s.selectedIds.size).toBe(2);
    expect(s.selectedIds.has(tracks[1].id)).toBe(true);
    expect(s.selectedIds.has(tracks[2].id)).toBe(true);
  });
});
