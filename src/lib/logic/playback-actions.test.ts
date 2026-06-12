/**
 * Tests for playback actions: handleTrackRemoved auto-advance behavior
 * and play-count integrity on auto-advance / gapless transitions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockTrack, createMockTracks, createMockPlaylist } from '$lib/test-helpers';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import {
  handleTrackRemoved,
  handleTracksRemovedBatch,
  autoAdvance,
  startPlayingTrack,
  handleGaplessTransition,
} from '$lib/logic/playback-actions';
import { getPlayerState } from '$lib/state/playerState.svelte';
import { getPlaylistState } from '$lib/state/playlistState.svelte';
import { getLibraryState } from '$lib/state/libraryState.svelte';

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

function resetPlaylistState() {
  const playlistState = getPlaylistState();
  playlistState.playlists = [];
}

describe('handleTrackRemoved — auto-advance', () => {
  const player = getPlayerState();
  const playlistState = getPlaylistState();

  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    resetPlayerState();
    resetPlaylistState();
  });

  afterEach(() => {
    resetPlayerState();
    resetPlaylistState();
  });

  it('auto-plays the next track when removing the currently playing mid-queue track', async () => {
    const tracks = createMockTracks(3);
    player.playQueue = tracks;
    player.currentIndex = 1;
    player.currentTrack = tracks[1]; // Song 2
    player.isPlaying = true;

    await handleTrackRemoved(tracks[1].id);

    // Should call stop, then play_track for Song 3
    expect(mockInvoke).toHaveBeenCalledWith('stop');
    expect(mockInvoke).toHaveBeenCalledWith('play_track', {
      path: tracks[2].file_path,
      durationSecs: tracks[2].duration_secs,
    });
    expect(player.currentTrack?.id).toBe(tracks[2].id);
    expect(player.isPlaying).toBe(true);
    expect(player.playQueue).toHaveLength(2);
  });

  it('auto-plays the next track when removing the first track while playing', async () => {
    const tracks = createMockTracks(3);
    player.playQueue = tracks;
    player.currentIndex = 0;
    player.currentTrack = tracks[0]; // Song 1
    player.isPlaying = true;

    await handleTrackRemoved(tracks[0].id);

    // Song 2 (originally at index 1, now at index 0) should play
    expect(mockInvoke).toHaveBeenCalledWith('play_track', {
      path: tracks[1].file_path,
      durationSecs: tracks[1].duration_secs,
    });
    expect(player.currentTrack?.id).toBe(tracks[1].id);
    expect(player.isPlaying).toBe(true);
  });

  it('stops playback when removing the last track with repeat off', async () => {
    const tracks = createMockTracks(3);
    player.playQueue = tracks;
    player.currentIndex = 2;
    player.currentTrack = tracks[2]; // Song 3 (last)
    player.isPlaying = true;
    player.repeatMode = 'off';

    await handleTrackRemoved(tracks[2].id);

    expect(player.isPlaying).toBe(false);
    expect(player.currentTrack).toBeNull();
    expect(player.currentIndex).toBe(-1);
    expect(player.playQueue).toHaveLength(2);
  });

  it('wraps to the first track when removing the last track with repeat-all', async () => {
    const tracks = createMockTracks(3);
    player.playQueue = tracks;
    player.currentIndex = 2;
    player.currentTrack = tracks[2]; // Song 3 (last)
    player.isPlaying = true;
    player.repeatMode = 'repeat-all';

    await handleTrackRemoved(tracks[2].id);

    // Should wrap to Song 1 (index 0)
    expect(mockInvoke).toHaveBeenCalledWith('play_track', {
      path: tracks[0].file_path,
      durationSecs: tracks[0].duration_secs,
    });
    expect(player.currentTrack?.id).toBe(tracks[0].id);
    expect(player.isPlaying).toBe(true);
  });

  it('stops playback when removing the only track in queue', async () => {
    const track = createMockTrack({ id: 1 });
    player.playQueue = [track];
    player.currentIndex = 0;
    player.currentTrack = track;
    player.isPlaying = true;

    await handleTrackRemoved(track.id);

    expect(player.isPlaying).toBe(false);
    expect(player.currentTrack).toBeNull();
    expect(player.playQueue).toHaveLength(0);
    expect(player.currentIndex).toBe(-1);
  });

  it('adjusts currentIndex when removing a non-playing track before current', async () => {
    const tracks = createMockTracks(3);
    player.playQueue = tracks;
    player.currentIndex = 1;
    player.currentTrack = tracks[1]; // Song 2
    player.isPlaying = true;

    await handleTrackRemoved(tracks[0].id); // Remove Song 1

    expect(player.isPlaying).toBe(true);
    expect(player.currentTrack?.id).toBe(tracks[1].id);
    expect(player.currentIndex).toBe(0); // Adjusted from 1 to 0
    expect(player.playQueue).toHaveLength(2);
    // play_track should NOT be called (only stop is not called either)
    expect(mockInvoke).not.toHaveBeenCalledWith('play_track', expect.anything());
    expect(mockInvoke).not.toHaveBeenCalledWith('stop');
  });

  it('does not change index when removing a non-playing track after current', async () => {
    const tracks = createMockTracks(3);
    player.playQueue = tracks;
    player.currentIndex = 0;
    player.currentTrack = tracks[0]; // Song 1
    player.isPlaying = true;

    await handleTrackRemoved(tracks[2].id); // Remove Song 3

    expect(player.isPlaying).toBe(true);
    expect(player.currentTrack?.id).toBe(tracks[0].id);
    expect(player.currentIndex).toBe(0); // Unchanged
    expect(player.playQueue).toHaveLength(2);
    expect(mockInvoke).not.toHaveBeenCalledWith('stop');
  });

  it('advances to next track instead of repeating when in repeat-one mode', async () => {
    const tracks = createMockTracks(3);
    player.playQueue = tracks;
    player.currentIndex = 1;
    player.currentTrack = tracks[1]; // Song 2
    player.isPlaying = true;
    player.repeatMode = 'repeat-one';

    await handleTrackRemoved(tracks[1].id);

    // Should play Song 3, NOT try to repeat Song 2 (which is deleted)
    expect(mockInvoke).toHaveBeenCalledWith('play_track', {
      path: tracks[2].file_path,
      durationSecs: tracks[2].duration_secs,
    });
    expect(player.currentTrack?.id).toBe(tracks[2].id);
    expect(player.isPlaying).toBe(true);
  });

  it('removes track from all playlists', async () => {
    const tracks = createMockTracks(3);
    player.playQueue = tracks;
    player.currentIndex = 0;
    player.currentTrack = tracks[0];
    player.isPlaying = false;

    playlistState.playlists = [
      createMockPlaylist({ id: 1, name: 'PL1', track_ids: [1, 2, 3] }),
      createMockPlaylist({ id: 2, name: 'PL2', track_ids: [2, 3] }),
    ];

    await handleTrackRemoved(2); // Remove track with id=2

    expect(playlistState.playlists[0].track_ids).toEqual([1, 3]);
    expect(playlistState.playlists[1].track_ids).toEqual([3]);
  });
});

describe('handleTracksRemovedBatch', () => {
  const player = getPlayerState();
  const playlistState = getPlaylistState();

  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    resetPlayerState();
    resetPlaylistState();
  });

  afterEach(() => {
    resetPlayerState();
    resetPlaylistState();
  });

  it('batch removes multiple non-playing tracks and adjusts playQueue', async () => {
    const tracks = createMockTracks(5);
    player.playQueue = [...tracks];
    player.currentIndex = 2;
    player.currentTrack = tracks[2]; // Song 3
    player.isPlaying = true;

    // Remove Song 1 and Song 5 (not currently playing)
    await handleTracksRemovedBatch(new Set([1, 5]));

    expect(player.playQueue).toHaveLength(3);
    expect(player.playQueue.map((t) => t.id)).toEqual([2, 3, 4]);
    // currentIndex should shift from 2 to 1 (Song 1 before it was removed)
    expect(player.currentIndex).toBe(1);
    expect(player.isPlaying).toBe(true);
    expect(mockInvoke).not.toHaveBeenCalledWith('stop');
  });

  it('auto-advances when currently playing track is removed', async () => {
    const tracks = createMockTracks(4);
    player.playQueue = [...tracks];
    player.currentIndex = 1;
    player.currentTrack = tracks[1]; // Song 2
    player.isPlaying = true;

    await handleTracksRemovedBatch(new Set([2]));

    expect(mockInvoke).toHaveBeenCalledWith('stop');
    expect(mockInvoke).toHaveBeenCalledWith('play_track', {
      path: tracks[2].file_path,
      durationSecs: tracks[2].duration_secs,
    });
    expect(player.currentTrack?.id).toBe(tracks[2].id);
    expect(player.isPlaying).toBe(true);
    expect(player.playQueue).toHaveLength(3);
  });

  it('skips consecutive removed tracks to find survivor', async () => {
    const tracks = createMockTracks(5);
    player.playQueue = [...tracks];
    player.currentIndex = 1;
    player.currentTrack = tracks[1]; // Song 2
    player.isPlaying = true;

    // Remove Song 2 (playing) and Song 3 (next) → should jump to Song 4
    await handleTracksRemovedBatch(new Set([2, 3]));

    expect(mockInvoke).toHaveBeenCalledWith('stop');
    expect(mockInvoke).toHaveBeenCalledWith('play_track', {
      path: tracks[3].file_path,
      durationSecs: tracks[3].duration_secs,
    });
    expect(player.currentTrack?.id).toBe(tracks[3].id);
    expect(player.playQueue).toHaveLength(3);
  });

  it('stops when all tracks are removed', async () => {
    const tracks = createMockTracks(3);
    player.playQueue = [...tracks];
    player.currentIndex = 0;
    player.currentTrack = tracks[0];
    player.isPlaying = true;

    await handleTracksRemovedBatch(new Set([1, 2, 3]));

    expect(player.isPlaying).toBe(false);
    expect(player.currentTrack).toBeNull();
    expect(player.currentIndex).toBe(-1);
    expect(player.playQueue).toHaveLength(0);
  });

  it('cleans up playlists for all removed tracks', async () => {
    const tracks = createMockTracks(4);
    player.playQueue = [...tracks];
    player.currentIndex = 0;
    player.currentTrack = tracks[0];
    player.isPlaying = false;

    playlistState.playlists = [
      createMockPlaylist({ id: 1, name: 'PL1', track_ids: [1, 2, 3, 4] }),
      createMockPlaylist({ id: 2, name: 'PL2', track_ids: [2, 4] }),
    ];

    await handleTracksRemovedBatch(new Set([2, 4]));

    expect(playlistState.playlists[0].track_ids).toEqual([1, 3]);
    expect(playlistState.playlists[1].track_ids).toEqual([]);
  });

  it('updates shuffledIndices — filter + remap', async () => {
    const tracks = createMockTracks(5);
    player.playQueue = [...tracks];
    player.currentIndex = 0;
    player.currentTrack = tracks[0];
    player.isPlaying = false;
    player.shuffleEnabled = true;
    player.shuffledIndices = [0, 3, 1, 4, 2]; // shuffle order

    // Remove tracks at queue indices 1 and 3 (Song 2 and Song 4)
    await handleTracksRemovedBatch(new Set([2, 4]));

    // Original: [0, 3, 1, 4, 2]
    // After filtering indices 1 and 3: [0, 4, 2]
    // After remapping (index 1 removed: 0→0, 4→2, 2→1): [0, 2, 1]
    expect(player.shuffledIndices).toEqual([0, 2, 1]);
    expect(player.playQueue).toHaveLength(3);
  });

  it('handles tracks not in queue by only cleaning playlists', async () => {
    const tracks = createMockTracks(2);
    player.playQueue = [...tracks];
    player.currentIndex = 0;
    player.currentTrack = tracks[0];
    player.isPlaying = false;

    playlistState.playlists = [createMockPlaylist({ id: 1, name: 'PL1', track_ids: [1, 2, 99] })];

    // Track 99 is not in queue
    await handleTracksRemovedBatch(new Set([99]));

    expect(player.playQueue).toHaveLength(2);
    expect(playlistState.playlists[0].track_ids).toEqual([1, 2]);
  });

  it('adjusts currentIndex correctly when non-playing tracks before current are removed', async () => {
    const tracks = createMockTracks(5);
    player.playQueue = [...tracks];
    player.currentIndex = 3; // Song 4
    player.currentTrack = tracks[3];
    player.isPlaying = true;

    // Remove Song 1 and Song 2 (both before current)
    await handleTracksRemovedBatch(new Set([1, 2]));

    expect(player.playQueue).toHaveLength(3);
    expect(player.playQueue.map((t) => t.id)).toEqual([3, 4, 5]);
    expect(player.currentIndex).toBe(1); // adjusted from 3 to 1
    expect(player.isPlaying).toBe(true);
    expect(mockInvoke).not.toHaveBeenCalledWith('stop');
  });
});

describe('autoAdvance — play count integrity', () => {
  const player = getPlayerState();
  const library = getLibraryState();

  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    resetPlayerState();
    resetPlaylistState();
    library.allTracks = [];
  });

  afterEach(() => {
    resetPlayerState();
    resetPlaylistState();
    library.allTracks = [];
  });

  /** Track ids passed to increment_play_count, in call order. */
  function incrementedIds(): number[] {
    return mockInvoke.mock.calls
      .filter(([cmd]) => cmd === 'increment_play_count')
      .map(([, args]) => (args as { trackId: number }).trackId);
  }

  /** Make every play_track call fail (e.g. files on an unmounted USB drive). */
  function failPlayTrack() {
    mockInvoke.mockImplementation((...args: unknown[]) =>
      args[0] === 'play_track'
        ? Promise.reject(new Error('Audio error: missing file'))
        : Promise.resolve(undefined),
    );
  }

  it('increments play count when a started track finishes', async () => {
    const tracks = createMockTracks(2);
    await startPlayingTrack(tracks[0], tracks);

    await autoAdvance();

    expect(incrementedIds()).toEqual([tracks[0].id]);
    expect(player.currentTrack?.id).toBe(tracks[1].id);
  });

  it('does not increment play count for tracks that never started playing', async () => {
    const tracks = createMockTracks(3);
    await startPlayingTrack(tracks[0], tracks);

    failPlayTrack();

    // track 0 finishes → legit +1, then advancing to track 1 fails
    await autoAdvance();
    // stale track_ended events keep arriving (the original pollution loop)
    await autoAdvance();
    await autoAdvance();

    // Only the track that actually played is counted
    expect(incrementedIds()).toEqual([tracks[0].id]);
    // And the optimistic local counts are untouched for never-played tracks
    expect(player.playQueue[1].play_count).toBe(tracks[1].play_count);
    expect(player.playQueue[2].play_count).toBe(tracks[2].play_count);
  });

  it('keeps counting after playback recovers from a failed track', async () => {
    const tracks = createMockTracks(3);
    await startPlayingTrack(tracks[0], tracks);

    failPlayTrack();
    // track 0 finishes → +1, track 1 fails to start
    await autoAdvance();

    mockInvoke.mockResolvedValue(undefined);
    // file is reachable again (e.g. USB remounted): track 1 never played
    // so it is not counted, and track 2 starts normally
    await autoAdvance();

    expect(incrementedIds()).toEqual([tracks[0].id]);
    expect(player.currentTrack?.id).toBe(tracks[2].id);

    // track 2 genuinely played — its completion is counted again
    await autoAdvance();
    expect(incrementedIds()).toEqual([tracks[0].id, tracks[2].id]);
  });

  it('counts every completion in repeat-one mode', async () => {
    const tracks = createMockTracks(2);
    await startPlayingTrack(tracks[0], tracks);
    player.repeatMode = 'repeat-one';

    await autoAdvance();
    await autoAdvance();

    expect(incrementedIds()).toEqual([tracks[0].id, tracks[0].id]);
    expect(player.currentTrack?.id).toBe(tracks[0].id);
  });

  it('stays stopped when an explicitly picked track fails to load', async () => {
    const tracks = createMockTracks(2);
    failPlayTrack();

    await startPlayingTrack(tracks[0], tracks);

    // The track is selected and shown in the player bar, but playback
    // honestly reflects the failure instead of pretending to play
    expect(player.currentTrack?.id).toBe(tracks[0].id);
    expect(player.isPlaying).toBe(false);
    expect(incrementedIds()).toEqual([]);
  });

  it('gapless transition does not credit a track that failed to start', async () => {
    const tracks = createMockTracks(3);
    await startPlayingTrack(tracks[0], tracks);

    failPlayTrack();
    // track 0 finishes → +1, attempt to start track 1 fails
    await autoAdvance();
    expect(player.currentTrack?.id).toBe(tracks[1].id);

    mockInvoke.mockResolvedValue(undefined);
    // backend gapless-switched to track 2 (queued before the failure)
    await handleGaplessTransition(tracks[2].id);

    expect(incrementedIds()).toEqual([tracks[0].id]);
    expect(player.currentTrack?.id).toBe(tracks[2].id);

    // track 2 is genuinely playing now — its completion must count
    await autoAdvance();
    expect(incrementedIds()).toEqual([tracks[0].id, tracks[2].id]);
  });
});

describe('handleTracksRemovedBatch — concurrent queue', () => {
  const player = getPlayerState();
  const playlistState = getPlaylistState();

  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    resetPlayerState();
    resetPlaylistState();
  });

  afterEach(() => {
    resetPlayerState();
    resetPlaylistState();
  });

  it('queues concurrent call and processes both', async () => {
    const tracks = createMockTracks(4);
    player.playQueue = [...tracks];
    player.currentIndex = 0;
    player.currentTrack = tracks[0];
    player.isPlaying = false;

    playlistState.playlists = [createMockPlaylist({ id: 1, name: 'PL1', track_ids: [1, 2, 3, 4] })];

    // Fire two concurrent batch calls — second should be queued
    const p1 = handleTracksRemovedBatch(new Set([2]));
    const p2 = handleTracksRemovedBatch(new Set([3]));
    await Promise.all([p1, p2]);

    // Both track 2 and 3 should be removed
    expect(player.playQueue.map((t) => t.id)).toEqual([1, 4]);
    expect(playlistState.playlists[0].track_ids).toEqual([1, 4]);
  });

  it('merges multiple queued calls', async () => {
    const tracks = createMockTracks(5);
    player.playQueue = [...tracks];
    player.currentIndex = 0;
    player.currentTrack = tracks[0];
    player.isPlaying = false;

    playlistState.playlists = [
      createMockPlaylist({ id: 1, name: 'PL1', track_ids: [1, 2, 3, 4, 5] }),
    ];

    // Fire three concurrent batch calls — second and third should be merged
    const p1 = handleTracksRemovedBatch(new Set([2]));
    const p2 = handleTracksRemovedBatch(new Set([3]));
    const p3 = handleTracksRemovedBatch(new Set([4]));
    await Promise.all([p1, p2, p3]);

    // Only track 1 and 5 should remain
    expect(player.playQueue.map((t) => t.id)).toEqual([1, 5]);
    expect(playlistState.playlists[0].track_ids).toEqual([1, 5]);
  });
});
