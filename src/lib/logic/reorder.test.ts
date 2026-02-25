import { describe, it, expect } from 'vitest';
import { moveByKeyboard } from './reorder';
import { createMockTracks } from '$lib/test-helpers';

// Helper: 5 tracks with ids 1..5
const tracks = createMockTracks(5);

// ============================================================
// Single track — move up
// ============================================================

describe('moveByKeyboard — single track up', () => {
  it('moves a single track up by one position', () => {
    const result = moveByKeyboard(tracks, new Set([3]), 'up');
    expect(result).toEqual([1, 3, 2, 4, 5]);
  });

  it('returns null when the track is already at the top', () => {
    const result = moveByKeyboard(tracks, new Set([1]), 'up');
    expect(result).toBeNull();
  });
});

// ============================================================
// Single track — move down
// ============================================================

describe('moveByKeyboard — single track down', () => {
  it('moves a single track down by one position', () => {
    const result = moveByKeyboard(tracks, new Set([3]), 'down');
    expect(result).toEqual([1, 2, 4, 3, 5]);
  });

  it('returns null when the track is already at the bottom', () => {
    const result = moveByKeyboard(tracks, new Set([5]), 'down');
    expect(result).toBeNull();
  });
});

// ============================================================
// Multiple contiguous tracks
// ============================================================

describe('moveByKeyboard — contiguous multi-select', () => {
  it('moves contiguous block up', () => {
    const result = moveByKeyboard(tracks, new Set([2, 3]), 'up');
    expect(result).toEqual([2, 3, 1, 4, 5]);
  });

  it('moves contiguous block down', () => {
    const result = moveByKeyboard(tracks, new Set([2, 3]), 'down');
    expect(result).toEqual([1, 4, 2, 3, 5]);
  });

  it('returns null when contiguous block is at top and moving up', () => {
    const result = moveByKeyboard(tracks, new Set([1, 2]), 'up');
    expect(result).toBeNull();
  });

  it('returns null when contiguous block is at bottom and moving down', () => {
    const result = moveByKeyboard(tracks, new Set([4, 5]), 'down');
    expect(result).toBeNull();
  });
});

// ============================================================
// Multiple non-contiguous tracks
// ============================================================

describe('moveByKeyboard — non-contiguous multi-select', () => {
  it('moves non-contiguous tracks up', () => {
    // tracks: [1, 2, 3, 4, 5], selected: {2, 4}
    const result = moveByKeyboard(tracks, new Set([2, 4]), 'up');
    // 2 swaps with 1 → [2, 1, 3, 4, 5], then 4 swaps with 3 → [2, 1, 4, 3, 5]
    expect(result).toEqual([2, 1, 4, 3, 5]);
  });

  it('moves non-contiguous tracks down', () => {
    // tracks: [1, 2, 3, 4, 5], selected: {2, 4}
    const result = moveByKeyboard(tracks, new Set([2, 4]), 'down');
    // 4 swaps with 5 → [1, 2, 3, 5, 4], then 2 swaps with 3 → [1, 3, 2, 5, 4]
    expect(result).toEqual([1, 3, 2, 5, 4]);
  });
});

// ============================================================
// Edge cases
// ============================================================

describe('moveByKeyboard — edge cases', () => {
  it('returns null for empty selection', () => {
    const result = moveByKeyboard(tracks, new Set(), 'up');
    expect(result).toBeNull();
  });

  it('returns null for single-track list', () => {
    const single = createMockTracks(1);
    const result = moveByKeyboard(single, new Set([1]), 'up');
    expect(result).toBeNull();
  });

  it('returns null when selected IDs do not exist in tracks (stale)', () => {
    const result = moveByKeyboard(tracks, new Set([999]), 'up');
    expect(result).toBeNull();
  });

  it('returns null when some selected IDs are stale', () => {
    const result = moveByKeyboard(tracks, new Set([2, 999]), 'up');
    expect(result).toBeNull();
  });

  it('preserves all IDs after move (no duplicates, no missing)', () => {
    const result = moveByKeyboard(tracks, new Set([3]), 'up');
    expect(result).not.toBeNull();
    const sorted = [...result!].sort((a, b) => a - b);
    expect(sorted).toEqual([1, 2, 3, 4, 5]);
  });

  it('preserves all IDs after multi-move (no duplicates, no missing)', () => {
    const result = moveByKeyboard(tracks, new Set([2, 4]), 'down');
    expect(result).not.toBeNull();
    const sorted = [...result!].sort((a, b) => a - b);
    expect(sorted).toEqual([1, 2, 3, 4, 5]);
  });

  it('works with two-track list moving down', () => {
    const two = createMockTracks(2);
    const result = moveByKeyboard(two, new Set([1]), 'down');
    expect(result).toEqual([2, 1]);
  });

  it('works with two-track list moving up', () => {
    const two = createMockTracks(2);
    const result = moveByKeyboard(two, new Set([2]), 'up');
    expect(result).toEqual([2, 1]);
  });

  it('returns null when all tracks are selected (move up)', () => {
    const result = moveByKeyboard(tracks, new Set([1, 2, 3, 4, 5]), 'up');
    expect(result).toBeNull();
  });

  it('returns null when all tracks are selected (move down)', () => {
    const result = moveByKeyboard(tracks, new Set([1, 2, 3, 4, 5]), 'down');
    expect(result).toBeNull();
  });
});
