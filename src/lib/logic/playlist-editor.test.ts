/**
 * Tests for PlaylistEditor handleRemove / handleTrash behavior.
 *
 * handleRemove should call remove_from_playlist (not remove_track),
 * keeping the track in the library. handleTrash should still call trash_track.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockTracks, createMockPlaylist } from '$lib/test-helpers';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { getPlayerState } from '$lib/state/playerState.svelte';
import { getLibraryState } from '$lib/state/libraryState.svelte';
import { getPlaylistState } from '$lib/state/playlistState.svelte';

function resetPlayerState() {
  const player = getPlayerState();
  player.playQueue = [];
  player.currentIndex = -1;
  player.currentTrack = null;
  player.isPlaying = false;
  player.positionSecs = 0;
  player.durationSecs = 0;
  player.repeatMode = 'off';
  player.shuffleEnabled = false;
  player.shuffledIndices = [];
}

function resetLibraryState() {
  const library = getLibraryState();
  library.allTracks = [];
}

function resetPlaylistState() {
  const playlistState = getPlaylistState();
  playlistState.playlists = [];
}

/**
 * We can't import handleRemove directly from the Svelte component,
 * so we replicate its logic here to test the correct invoke calls.
 * This mirrors the actual implementation in PlaylistEditor.svelte.
 */
async function handleRemove(playlistId: number, tracksToRemove: typeof tracks) {
  const { optimisticPlaylistRemove } = await import('$lib/logic/track-actions');
  await optimisticPlaylistRemove(playlistId, tracksToRemove);
}

async function handleTrash(tracksToTrash: typeof tracks) {
  const { optimisticTrash } = await import('$lib/logic/track-actions');
  await optimisticTrash(tracksToTrash);
}

let tracks = createMockTracks(3);

describe('PlaylistEditor — handleRemove', () => {
  const library = getLibraryState();
  const playlistState = getPlaylistState();

  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    resetPlayerState();
    resetLibraryState();
    resetPlaylistState();
    tracks = createMockTracks(3);
    library.allTracks = [...tracks];
  });

  afterEach(() => {
    resetPlayerState();
    resetLibraryState();
    resetPlaylistState();
  });

  it('calls batch_remove_from_playlist, not remove_track', async () => {
    playlistState.playlists = [
      createMockPlaylist({ id: 10, name: 'Test PL', track_ids: [1, 2, 3] }),
    ];

    await handleRemove(10, [tracks[1]]); // remove track id=2

    expect(mockInvoke).toHaveBeenCalledWith('batch_remove_from_playlist', {
      playlistId: 10,
      trackIds: [2],
    });
    expect(mockInvoke).not.toHaveBeenCalledWith('remove_track', expect.anything());
  });

  it('does not modify library.allTracks after removal', async () => {
    playlistState.playlists = [
      createMockPlaylist({ id: 10, name: 'Test PL', track_ids: [1, 2, 3] }),
    ];

    await handleRemove(10, [tracks[1]]);

    // library.allTracks should still contain all 3 tracks
    expect(library.allTracks).toHaveLength(3);
    expect(library.allTracks.map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it('updates playlistState track_ids correctly after removal', async () => {
    playlistState.playlists = [
      createMockPlaylist({ id: 10, name: 'Test PL', track_ids: [1, 2, 3] }),
    ];

    await handleRemove(10, [tracks[1]]); // remove track id=2

    expect(playlistState.playlists[0].track_ids).toEqual([1, 3]);
  });

  it('handles batch removal with single IPC call', async () => {
    playlistState.playlists = [
      createMockPlaylist({ id: 10, name: 'Test PL', track_ids: [1, 2, 3] }),
    ];

    await handleRemove(10, [tracks[0], tracks[1], tracks[2]]);

    // Should be exactly 1 batch call, not 3 individual calls
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('batch_remove_from_playlist', {
      playlistId: 10,
      trackIds: [1, 2, 3],
    });
    expect(playlistState.playlists[0].track_ids).toEqual([]);
  });

  it('does not affect other playlists', async () => {
    playlistState.playlists = [
      createMockPlaylist({ id: 10, name: 'PL A', track_ids: [1, 2, 3] }),
      createMockPlaylist({ id: 20, name: 'PL B', track_ids: [2, 3] }),
    ];

    await handleRemove(10, [tracks[1]]); // remove track 2 from playlist 10

    expect(playlistState.playlists[0].track_ids).toEqual([1, 3]);
    expect(playlistState.playlists[1].track_ids).toEqual([2, 3]); // unchanged
  });
});

describe('PlaylistEditor — handleTrash', () => {
  const library = getLibraryState();

  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockImplementation(async (cmd: string, args?: { ids?: number[] }) => {
      if (cmd === 'trash_tracks') {
        return { succeeded_ids: args?.ids ?? [], failed: [] };
      }
    });
    resetPlayerState();
    resetLibraryState();
    resetPlaylistState();
    tracks = createMockTracks(3);
    library.allTracks = [...tracks];
  });

  afterEach(() => {
    resetPlayerState();
    resetLibraryState();
    resetPlaylistState();
  });

  it('calls trash_tracks (batch) to delete from database', async () => {
    await handleTrash([tracks[0]]);

    expect(mockInvoke).toHaveBeenCalledWith('trash_tracks', { ids: [1] });
    expect(mockInvoke).not.toHaveBeenCalledWith('remove_from_playlist', expect.anything());
  });

  it('removes track from library.allTracks', async () => {
    await handleTrash([tracks[1]]);

    expect(library.allTracks).toHaveLength(2);
    expect(library.allTracks.map((t) => t.id)).toEqual([1, 3]);
  });
});
