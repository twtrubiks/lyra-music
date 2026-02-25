/**
 * Integration tests: moveByKeyboard result → reorderPlaylist API call.
 * Mirrors the pattern from playlist-editor.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockTracks, createMockPlaylist } from '$lib/test-helpers';
import { moveByKeyboard } from './reorder';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { getPlaylistState } from '$lib/state/playlistState.svelte';

function resetPlaylistState() {
  const playlistState = getPlaylistState();
  playlistState.playlists = [];
}

/**
 * Replicate PlaylistEditor.handleReorder logic for testing.
 */
async function handleReorder(playlistId: number, allTracks: typeof tracks, trackIds: number[]) {
  const { reorderPlaylist } = await import('$lib/api/playlist');

  // Optimistic update on local tracks array
  const trackMap = new Map(allTracks.map((t) => [t.id, t]));
  const reordered = trackIds.map((id) => trackMap.get(id)!).filter(Boolean);

  // Update playlistState
  const playlistState = getPlaylistState();
  playlistState.playlists = playlistState.playlists.map((pl) =>
    pl.id === playlistId ? { ...pl, track_ids: trackIds } : pl,
  );

  await reorderPlaylist(playlistId, trackIds);

  return reordered;
}

let tracks = createMockTracks(5);

describe('reorder integration — moveByKeyboard → reorderPlaylist', () => {
  const playlistState = getPlaylistState();

  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    resetPlaylistState();
    tracks = createMockTracks(5);
    playlistState.playlists = [
      createMockPlaylist({ id: 10, name: 'Test PL', track_ids: [1, 2, 3, 4, 5] }),
    ];
  });

  afterEach(() => {
    resetPlaylistState();
  });

  it('single track move up calls reorder_playlist with correct order', async () => {
    const newOrder = moveByKeyboard(tracks, new Set([3]), 'up');
    expect(newOrder).toEqual([1, 3, 2, 4, 5]);

    await handleReorder(10, tracks, newOrder!);

    expect(mockInvoke).toHaveBeenCalledWith('reorder_playlist', {
      playlistId: 10,
      trackIds: [1, 3, 2, 4, 5],
    });
    expect(playlistState.playlists[0].track_ids).toEqual([1, 3, 2, 4, 5]);
  });

  it('single track move down calls reorder_playlist with correct order', async () => {
    const newOrder = moveByKeyboard(tracks, new Set([3]), 'down');
    expect(newOrder).toEqual([1, 2, 4, 3, 5]);

    await handleReorder(10, tracks, newOrder!);

    expect(mockInvoke).toHaveBeenCalledWith('reorder_playlist', {
      playlistId: 10,
      trackIds: [1, 2, 4, 3, 5],
    });
    expect(playlistState.playlists[0].track_ids).toEqual([1, 2, 4, 3, 5]);
  });

  it('multi-track move preserves correct order in API call', async () => {
    const newOrder = moveByKeyboard(tracks, new Set([2, 4]), 'up');
    expect(newOrder).toEqual([2, 1, 4, 3, 5]);

    await handleReorder(10, tracks, newOrder!);

    expect(mockInvoke).toHaveBeenCalledWith('reorder_playlist', {
      playlistId: 10,
      trackIds: [2, 1, 4, 3, 5],
    });
  });

  it('null result (boundary) does not trigger API call', () => {
    const newOrder = moveByKeyboard(tracks, new Set([1]), 'up');
    expect(newOrder).toBeNull();
    // No handleReorder call, so no invoke
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('reordered tracks array matches new ID order', async () => {
    const newOrder = moveByKeyboard(tracks, new Set([3]), 'up');
    const reordered = await handleReorder(10, tracks, newOrder!);

    expect(reordered.map((t) => t.id)).toEqual([1, 3, 2, 4, 5]);
    expect(reordered[0].title).toBe('Song 1');
    expect(reordered[1].title).toBe('Song 3');
    expect(reordered[2].title).toBe('Song 2');
  });
});
