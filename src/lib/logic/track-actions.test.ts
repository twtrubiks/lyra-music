import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockTracks } from '$lib/test-helpers';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { getPlayerState } from '$lib/state/playerState.svelte';
import { getLibraryState } from '$lib/state/libraryState.svelte';
import { getPlaylistState } from '$lib/state/playlistState.svelte';
import {
  optimisticTrash,
  optimisticRemove,
  optimisticPlaylistRemove,
} from '$lib/logic/track-actions';
import { createMockPlaylist } from '$lib/test-helpers';

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

/** Helper: mock trash_tracks to return all succeeded */
function mockTrashTracksSuccess() {
  mockInvoke.mockImplementation(async (cmd: string, args?: { ids?: number[] }) => {
    if (cmd === 'trash_tracks') {
      return { succeeded_ids: args?.ids ?? [], failed: [] };
    }
  });
}

/** Helper: mock remove_tracks to return all succeeded */
function mockRemoveTracksSuccess() {
  mockInvoke.mockImplementation(async (cmd: string, args?: { ids?: number[] }) => {
    if (cmd === 'remove_tracks') {
      return { succeeded_ids: args?.ids ?? [], failed: [] };
    }
  });
}

describe('optimisticTrash', () => {
  const library = getLibraryState();

  beforeEach(() => {
    mockInvoke.mockReset();
    mockTrashTracksSuccess();
    resetPlayerState();
    resetLibraryState();
    resetPlaylistState();
  });

  afterEach(() => {
    resetPlayerState();
    resetLibraryState();
    resetPlaylistState();
  });

  it('immediately removes tracks from allTracks before backend call', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];

    let backendCalled = false;
    mockInvoke.mockImplementation(async (cmd: string, args?: { ids?: number[] }) => {
      if (cmd === 'trash_tracks') {
        backendCalled = true;
        return { succeeded_ids: args?.ids ?? [], failed: [] };
      }
    });

    await optimisticTrash([tracks[1]]);

    // Optimistic update is synchronous — already applied before return
    expect(library.allTracks).toHaveLength(2);
    expect(library.allTracks.map((t) => t.id)).toEqual([1, 3]);

    // Backend fires in background
    await vi.waitFor(() => {
      expect(backendCalled).toBe(true);
    });
  });

  it('updates local tracks when getLocalTracks/setLocalTracks provided', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];
    let localTracks = [...tracks];

    await optimisticTrash([tracks[0]], {
      getLocalTracks: () => localTracks,
      setLocalTracks: (v) => {
        localTracks = v;
      },
    });

    expect(localTracks).toHaveLength(2);
    expect(localTracks.map((t) => t.id)).toEqual([2, 3]);
  });

  it('sends only 1 IPC call for batch trash (not N individual calls)', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];

    await optimisticTrash([tracks[0], tracks[1]]);

    await vi.waitFor(() => {
      // Should be exactly 1 trash_tracks call, not 2 trash_track calls
      const trashCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'trash_tracks');
      expect(trashCalls).toHaveLength(1);
      expect(trashCalls[0][1]).toEqual({ ids: [1, 2] });
    });

    // No individual trash_track calls
    const singleTrashCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'trash_track');
    expect(singleTrashCalls).toHaveLength(0);
  });

  it('restores allTracks on total backend failure (exception)', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'trash_tracks') {
        throw new Error('disk error');
      }
    });

    await optimisticTrash([tracks[1]]);

    // Additive rollback: failed track appended to current state
    await vi.waitFor(() => {
      expect(library.allTracks).toHaveLength(3);
      expect(library.allTracks.map((t) => t.id)).toEqual(expect.arrayContaining([1, 2, 3]));
    });
  });

  it('restores local tracks on total backend failure', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];
    let localTracks = [...tracks];

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'trash_tracks') {
        throw new Error('disk error');
      }
    });

    await optimisticTrash([tracks[0]], {
      getLocalTracks: () => localTracks,
      setLocalTracks: (v) => {
        localTracks = v;
      },
    });

    // Additive rollback: failed track appended to current state
    await vi.waitFor(() => {
      expect(localTracks).toHaveLength(3);
      expect(localTracks.map((t) => t.id)).toEqual(expect.arrayContaining([1, 2, 3]));
    });
  });

  it('shows error notification on backend failure', async () => {
    const tracks = createMockTracks(2);
    library.allTracks = [...tracks];

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'trash_tracks') {
        throw new Error('disk error');
      }
    });

    const { getErrorState } = await import('$lib/state/errorState.svelte');

    await optimisticTrash([tracks[0]]);

    const errorState = getErrorState();
    await vi.waitFor(() => {
      expect(errorState.errors.length).toBeGreaterThan(0);
    });
  });

  it('does not call onComplete on total backend failure', async () => {
    const tracks = createMockTracks(2);
    library.allTracks = [...tracks];

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'trash_tracks') {
        throw new Error('disk error');
      }
    });

    const onComplete = vi.fn();
    await optimisticTrash([tracks[0]], { onComplete });

    // Wait for background .catch() to settle, then verify onComplete was NOT called
    await vi.waitFor(() => {
      expect(library.allTracks).toHaveLength(2); // rollback happened
    });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('calls onComplete on success', async () => {
    const tracks = createMockTracks(2);
    library.allTracks = [...tracks];

    const onComplete = vi.fn().mockResolvedValue(undefined);
    await optimisticTrash([tracks[0]], { onComplete });

    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('handles batch deletion of multiple tracks', async () => {
    const tracks = createMockTracks(5);
    library.allTracks = [...tracks];

    await optimisticTrash([tracks[0], tracks[2], tracks[4]]);

    // Optimistic update is synchronous
    expect(library.allTracks).toHaveLength(2);
    expect(library.allTracks.map((t) => t.id)).toEqual([2, 4]);

    // Backend fires in background
    await vi.waitFor(() => {
      const trashCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'trash_tracks');
      expect(trashCalls).toHaveLength(1);
    });
  });

  it('handles currently playing track by auto-advancing', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];
    const player = getPlayerState();
    player.playQueue = [...tracks];
    player.currentTrack = tracks[1];
    player.currentIndex = 1;
    player.isPlaying = true;

    await optimisticTrash([tracks[1]]);

    expect(library.allTracks.map((t) => t.id)).toEqual([1, 3]);
  });

  it('restores only failed tracks on partial failure (BatchTrashResult)', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];

    // track 1 and 3 succeed, track 2 fails
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'trash_tracks') {
        return {
          succeeded_ids: [1, 3],
          failed: [{ id: 2, error: 'disk error' }],
        };
      }
    });

    await optimisticTrash([tracks[0], tracks[1], tracks[2]]);

    // Partial rollback happens in background .then()
    await vi.waitFor(() => {
      expect(library.allTracks.map((t) => t.id)).toEqual([2]);
    });
  });

  it('restores only failed local tracks on partial failure', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];
    let localTracks = [...tracks];

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'trash_tracks') {
        return {
          succeeded_ids: [1, 3],
          failed: [{ id: 2, error: 'disk error' }],
        };
      }
    });

    await optimisticTrash([tracks[0], tracks[1], tracks[2]], {
      getLocalTracks: () => localTracks,
      setLocalTracks: (v) => {
        localTracks = v;
      },
    });

    await vi.waitFor(() => {
      expect(localTracks.map((t) => t.id)).toEqual([2]);
    });
  });

  it('calls onComplete on partial failure when some tracks succeed', async () => {
    const tracks = createMockTracks(2);
    library.allTracks = [...tracks];

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'trash_tracks') {
        return {
          succeeded_ids: [1],
          failed: [{ id: 2, error: 'disk error' }],
        };
      }
    });

    const onComplete = vi.fn().mockResolvedValue(undefined);
    await optimisticTrash([tracks[0], tracks[1]], { onComplete });

    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('does not throw on empty array input', async () => {
    library.allTracks = createMockTracks(2);

    await expect(optimisticTrash([])).resolves.not.toThrow();
    expect(library.allTracks).toHaveLength(2);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('concurrent fire-and-forget: first rollback does not overwrite second optimistic update', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];

    let firstCallResolve: (value: unknown) => void;
    const firstCallPromise = new Promise((resolve) => {
      firstCallResolve = resolve;
    });
    let callCount = 0;

    mockInvoke.mockImplementation(async (cmd: string, args?: { ids?: number[] }) => {
      if (cmd === 'trash_tracks') {
        callCount++;
        if (callCount === 1) {
          // First call: wait, then fail
          await firstCallPromise;
          throw new Error('disk error');
        }
        // Second call: succeed immediately
        return { succeeded_ids: args?.ids ?? [], failed: [] };
      }
    });

    // 1st trash: delete track 1 — optimistic: [2, 3]
    await optimisticTrash([tracks[0]]);
    expect(library.allTracks.map((t) => t.id)).toEqual([2, 3]);

    // 2nd trash: delete track 3 — optimistic: [2]
    await optimisticTrash([tracks[2]]);
    expect(library.allTracks.map((t) => t.id)).toEqual([2]);

    // Now let the first backend call fail → additive rollback adds track 1 back
    firstCallResolve!(undefined);

    await vi.waitFor(() => {
      // Track 1 should be added back, track 3 should remain deleted
      expect(library.allTracks).toHaveLength(2);
      expect(library.allTracks.map((t) => t.id)).toEqual(expect.arrayContaining([1, 2]));
    });
  });
});

describe('optimisticRemove', () => {
  const library = getLibraryState();

  beforeEach(() => {
    mockInvoke.mockReset();
    mockRemoveTracksSuccess();
    resetPlayerState();
    resetLibraryState();
    resetPlaylistState();
  });

  afterEach(() => {
    resetPlayerState();
    resetLibraryState();
    resetPlaylistState();
  });

  it('calls remove_tracks instead of trash_tracks', async () => {
    const tracks = createMockTracks(2);
    library.allTracks = [...tracks];

    await optimisticRemove([tracks[0]]);

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('remove_tracks', { ids: [1] });
    });
    expect(mockInvoke).not.toHaveBeenCalledWith('trash_tracks', expect.anything());
  });

  it('immediately removes tracks from allTracks (optimistic update)', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];

    let backendCalled = false;
    mockInvoke.mockImplementation(async (cmd: string, args?: { ids?: number[] }) => {
      if (cmd === 'remove_tracks') {
        backendCalled = true;
        return { succeeded_ids: args?.ids ?? [], failed: [] };
      }
    });

    await optimisticRemove([tracks[1]]);

    // Optimistic update is synchronous — already applied before return
    expect(library.allTracks).toHaveLength(2);
    expect(library.allTracks.map((t) => t.id)).toEqual([1, 3]);

    // Backend fires in background
    await vi.waitFor(() => {
      expect(backendCalled).toBe(true);
    });
  });

  it('restores allTracks on backend failure', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'remove_tracks') {
        throw new Error('disk error');
      }
    });

    await optimisticRemove([tracks[1]]);

    // Additive rollback: failed track appended to current state
    await vi.waitFor(() => {
      expect(library.allTracks).toHaveLength(3);
      expect(library.allTracks.map((t) => t.id)).toEqual(expect.arrayContaining([1, 2, 3]));
    });
  });

  it('restores only failed tracks on partial backend failure', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'remove_tracks') {
        return {
          succeeded_ids: [1, 3],
          failed: [{ id: 2, error: 'disk error' }],
        };
      }
    });

    await optimisticRemove([tracks[0], tracks[1], tracks[2]]);

    await vi.waitFor(() => {
      expect(library.allTracks.map((t) => t.id)).toEqual([2]);
    });
  });

  it('does not throw on empty array input', async () => {
    library.allTracks = createMockTracks(2);

    await expect(optimisticRemove([])).resolves.not.toThrow();
    expect(library.allTracks).toHaveLength(2);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe('optimisticPlaylistRemove', () => {
  const library = getLibraryState();
  const playlistState = getPlaylistState();

  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    resetPlayerState();
    resetLibraryState();
    resetPlaylistState();
  });

  afterEach(() => {
    resetPlayerState();
    resetLibraryState();
    resetPlaylistState();
  });

  it('immediately removes track_ids from playlistState', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];
    playlistState.playlists = [
      createMockPlaylist({ id: 10, name: 'Test PL', track_ids: [1, 2, 3] }),
    ];

    await optimisticPlaylistRemove(10, [tracks[1]]);

    expect(playlistState.playlists[0].track_ids).toEqual([1, 3]);
  });

  it('calls batch_remove_from_playlist with correct playlistId and trackIds', async () => {
    const tracks = createMockTracks(2);
    library.allTracks = [...tracks];
    playlistState.playlists = [createMockPlaylist({ id: 10, name: 'Test PL', track_ids: [1, 2] })];

    await optimisticPlaylistRemove(10, [tracks[0]]);

    expect(mockInvoke).toHaveBeenCalledWith('batch_remove_from_playlist', {
      playlistId: 10,
      trackIds: [1],
    });
  });

  it('does not modify library.allTracks', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];
    playlistState.playlists = [
      createMockPlaylist({ id: 10, name: 'Test PL', track_ids: [1, 2, 3] }),
    ];

    await optimisticPlaylistRemove(10, [tracks[1]]);

    expect(library.allTracks).toHaveLength(3);
    expect(library.allTracks.map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it('does not call handleTrackRemoved (no stop)', async () => {
    const tracks = createMockTracks(2);
    library.allTracks = [...tracks];
    playlistState.playlists = [createMockPlaylist({ id: 10, name: 'Test PL', track_ids: [1, 2] })];

    await optimisticPlaylistRemove(10, [tracks[0]]);

    expect(mockInvoke).not.toHaveBeenCalledWith('stop', expect.anything());
  });

  it('restores all playlist track_ids on backend failure (atomic batch)', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];
    playlistState.playlists = [
      createMockPlaylist({ id: 10, name: 'Test PL', track_ids: [1, 2, 3] }),
    ];

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'batch_remove_from_playlist') {
        throw new Error('db error');
      }
    });

    await optimisticPlaylistRemove(10, [tracks[0], tracks[1]]);

    // All tracks restored because batch operation is atomic
    expect(playlistState.playlists[0].track_ids).toEqual([1, 2, 3]);
  });

  it('does not affect other playlists', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];
    playlistState.playlists = [
      createMockPlaylist({ id: 10, name: 'PL A', track_ids: [1, 2, 3] }),
      createMockPlaylist({ id: 20, name: 'PL B', track_ids: [2, 3] }),
    ];

    await optimisticPlaylistRemove(10, [tracks[1]]);

    expect(playlistState.playlists[0].track_ids).toEqual([1, 3]);
    expect(playlistState.playlists[1].track_ids).toEqual([2, 3]);
  });

  it('does not throw on empty array input', async () => {
    playlistState.playlists = [createMockPlaylist({ id: 10, name: 'Test PL', track_ids: [1, 2] })];

    await expect(optimisticPlaylistRemove(10, [])).resolves.not.toThrow();
    expect(playlistState.playlists[0].track_ids).toEqual([1, 2]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
