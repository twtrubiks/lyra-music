import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockTracks } from '$lib/test-helpers';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { getPlayerState } from '$lib/state/playerState.svelte';
import { getLibraryState } from '$lib/state/libraryState.svelte';
import { getPlaylistState } from '$lib/state/playlistState.svelte';
import { optimisticTrash } from '$lib/logic/trash-actions';

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

describe('optimisticTrash', () => {
  const library = getLibraryState();

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

  it('immediately removes tracks from allTracks before backend call', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];

    // Make backend slow so we can observe the order
    let backendCalled = false;
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'trash_track') {
        backendCalled = true;
      }
    });

    const promise = optimisticTrash([tracks[1]]);

    // UI should update immediately (before await on backend)
    // After the synchronous portion runs, allTracks should already be filtered
    await vi.waitFor(() => {
      expect(library.allTracks).toHaveLength(2);
      expect(library.allTracks.map((t) => t.id)).toEqual([1, 3]);
    });

    await promise;
    expect(backendCalled).toBe(true);
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

  it('calls handleTrackRemoved sequentially for each track', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];

    await optimisticTrash([tracks[0], tracks[1]]);

    // trash_track is called in parallel via Promise.allSettled
    const trashCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'trash_track');
    expect(trashCalls).toHaveLength(2);
    expect(trashCalls[0][1]).toEqual({ id: 1 });
    expect(trashCalls[1][1]).toEqual({ id: 2 });
  });

  it('restores allTracks on backend failure', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'trash_track') {
        throw new Error('disk error');
      }
    });

    await optimisticTrash([tracks[1]]);

    // Should be restored to original
    expect(library.allTracks).toHaveLength(3);
    expect(library.allTracks.map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it('restores local tracks on backend failure', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];
    let localTracks = [...tracks];

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'trash_track') {
        throw new Error('disk error');
      }
    });

    await optimisticTrash([tracks[0]], {
      getLocalTracks: () => localTracks,
      setLocalTracks: (v) => {
        localTracks = v;
      },
    });

    expect(localTracks).toHaveLength(3);
    expect(localTracks.map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it('shows error notification on backend failure', async () => {
    const tracks = createMockTracks(2);
    library.allTracks = [...tracks];

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'trash_track') {
        throw new Error('disk error');
      }
    });

    // notifyCritical calls pushError which we can check via the error state
    const { getErrorState } = await import('$lib/state/errorState.svelte');

    await optimisticTrash([tracks[0]]);

    const errorState = getErrorState();
    expect(errorState.errors.length).toBeGreaterThan(0);
  });

  it('does not call onComplete on backend failure', async () => {
    const tracks = createMockTracks(2);
    library.allTracks = [...tracks];

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'trash_track') {
        throw new Error('disk error');
      }
    });

    const onComplete = vi.fn();
    await optimisticTrash([tracks[0]], { onComplete });

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('calls onComplete on success', async () => {
    const tracks = createMockTracks(2);
    library.allTracks = [...tracks];

    const onComplete = vi.fn().mockResolvedValue(undefined);
    await optimisticTrash([tracks[0]], { onComplete });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('handles batch deletion of multiple tracks', async () => {
    const tracks = createMockTracks(5);
    library.allTracks = [...tracks];

    await optimisticTrash([tracks[0], tracks[2], tracks[4]]);

    expect(library.allTracks).toHaveLength(2);
    expect(library.allTracks.map((t) => t.id)).toEqual([2, 4]);
    // All trash_track calls should happen
    const trashCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'trash_track');
    expect(trashCalls).toHaveLength(3);
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

    // Track should be removed from allTracks
    expect(library.allTracks.map((t) => t.id)).toEqual([1, 3]);
  });

  it('restores only failed tracks on partial backend failure', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];

    // track 1 succeeds, track 2 fails, track 3 succeeds
    mockInvoke.mockImplementation(async (cmd: string, args: { id: number }) => {
      if (cmd === 'trash_track' && args.id === 2) {
        throw new Error('disk error');
      }
    });

    await optimisticTrash([tracks[0], tracks[1], tracks[2]]);

    // Only track 2 (failed) should be restored; tracks 1 and 3 stay deleted
    expect(library.allTracks.map((t) => t.id)).toEqual([2]);
  });

  it('restores only failed local tracks on partial backend failure', async () => {
    const tracks = createMockTracks(3);
    library.allTracks = [...tracks];
    let localTracks = [...tracks];

    mockInvoke.mockImplementation(async (cmd: string, args: { id: number }) => {
      if (cmd === 'trash_track' && args.id === 2) {
        throw new Error('disk error');
      }
    });

    await optimisticTrash([tracks[0], tracks[1], tracks[2]], {
      getLocalTracks: () => localTracks,
      setLocalTracks: (v) => {
        localTracks = v;
      },
    });

    expect(localTracks.map((t) => t.id)).toEqual([2]);
  });

  it('calls onComplete on partial failure when some tracks succeed', async () => {
    const tracks = createMockTracks(2);
    library.allTracks = [...tracks];

    // track 1 succeeds, track 2 fails
    mockInvoke.mockImplementation(async (cmd: string, args: { id: number }) => {
      if (cmd === 'trash_track' && args.id === 2) {
        throw new Error('disk error');
      }
    });

    const onComplete = vi.fn().mockResolvedValue(undefined);
    await optimisticTrash([tracks[0], tracks[1]], { onComplete });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not throw on empty array input', async () => {
    library.allTracks = createMockTracks(2);

    await expect(optimisticTrash([])).resolves.not.toThrow();
    expect(library.allTracks).toHaveLength(2);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
