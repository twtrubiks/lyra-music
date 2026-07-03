/**
 * Tests for playback actions: handleTrackRemoved auto-advance behavior,
 * advance flow after failures, and play-count mirroring from the backend's
 * level-triggered completion_seq.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMockTrack,
  createMockTracks,
  createMockPlaylist,
  createMockPlayerState,
} from '$lib/test-helpers';

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
  handleNext,
  applyPlayerStateEvent,
  resetCompletionTracking,
} from '$lib/logic/playback-actions';
import type { PlayerState } from '$lib/types';
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

function pollEvent(overrides: Partial<PlayerState> = {}): PlayerState {
  return createMockPlayerState(overrides);
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
      trackId: tracks[2].id,
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
      trackId: tracks[1].id,
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
      trackId: tracks[0].id,
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
      trackId: tracks[2].id,
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
      trackId: tracks[2].id,
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
      trackId: tracks[3].id,
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

describe('autoAdvance — advance flow', () => {
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

  /** Make every play_track call fail (e.g. files on an unmounted USB drive). */
  function failPlayTrack() {
    mockInvoke.mockImplementation((...args: unknown[]) =>
      args[0] === 'play_track'
        ? Promise.reject(new Error('Audio error: missing file'))
        : Promise.resolve(undefined),
    );
  }

  it('advances to the next track when the current one finishes', async () => {
    const tracks = createMockTracks(2);
    await startPlayingTrack(tracks[0], tracks);

    await autoAdvance();

    expect(player.currentTrack?.id).toBe(tracks[1].id);
    // Crediting the finished track is the backend's job now — the frontend
    // must not write play counts over IPC anymore
    expect(mockInvoke).not.toHaveBeenCalledWith('increment_play_count', expect.anything());
  });

  it('continues advancing past a track that fails to load', async () => {
    const tracks = createMockTracks(3);
    await startPlayingTrack(tracks[0], tracks);

    failPlayTrack();
    // track 0 finishes, track 1 fails to start
    await autoAdvance();
    expect(player.currentTrack?.id).toBe(tracks[1].id);

    mockInvoke.mockResolvedValue(undefined);
    // file is reachable again (e.g. USB remounted): track 2 starts normally
    await autoAdvance();
    expect(player.currentTrack?.id).toBe(tracks[2].id);
    expect(player.isPlaying).toBe(true);
  });

  it('repeat-one replays the same track on natural end', async () => {
    const tracks = createMockTracks(2);
    await startPlayingTrack(tracks[0], tracks);
    player.repeatMode = 'repeat-one';

    await autoAdvance();
    await autoAdvance();

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
  });
});

describe('play count mirroring — completion_seq', () => {
  const player = getPlayerState();
  const library = getLibraryState();

  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    resetPlayerState();
    resetPlaylistState();
    resetCompletionTracking();
    library.allTracks = [];
  });

  afterEach(() => {
    resetPlayerState();
    resetPlaylistState();
    library.allTracks = [];
  });

  it('baselines on the first poll without crediting', async () => {
    const tracks = createMockTracks(2);
    await startPlayingTrack(tracks[0], tracks);
    library.allTracks = [...tracks];

    // The first event after a page (re)load can carry a non-zero sequence:
    // its completions were already credited in the DB before this load.
    applyPlayerStateEvent(
      pollEvent({
        is_playing: true,
        current_track_id: tracks[0].id,
        completion_seq: 5,
        last_completed_track_id: tracks[1].id,
      }),
    );

    expect(player.playQueue[1].play_count).toBe(0);
    expect(library.allTracks[1].play_count).toBe(0);
  });

  it('mirrors a backend-credited completion into playQueue and library', async () => {
    const tracks = createMockTracks(2);
    await startPlayingTrack(tracks[0], tracks);
    library.allTracks = [...tracks];

    applyPlayerStateEvent(pollEvent({ is_playing: true, current_track_id: tracks[0].id }));
    // Backend detected the gapless switch and already wrote the DB row
    applyPlayerStateEvent(
      pollEvent({
        is_playing: true,
        current_track_id: tracks[1].id,
        gapless_transitioned: true,
        completion_seq: 1,
        last_completed_track_id: tracks[0].id,
      }),
    );

    expect(player.playQueue[0].play_count).toBe(1);
    expect(library.allTracks[0].play_count).toBe(1);
    // No frontend IPC write — the backend polling thread owns the DB update
    expect(mockInvoke).not.toHaveBeenCalledWith('increment_play_count', expect.anything());
  });

  it('does not credit again when polls repeat the same sequence', async () => {
    const tracks = createMockTracks(2);
    await startPlayingTrack(tracks[0], tracks);
    library.allTracks = [...tracks];

    applyPlayerStateEvent(pollEvent({ is_playing: true, current_track_id: tracks[0].id }));
    const completed = {
      is_playing: true,
      current_track_id: tracks[1].id,
      completion_seq: 1,
      last_completed_track_id: tracks[0].id,
    };
    // Level-triggered fields repeat in every 250ms poll after the completion
    applyPlayerStateEvent(pollEvent(completed));
    applyPlayerStateEvent(pollEvent(completed));
    applyPlayerStateEvent(pollEvent(completed));

    expect(player.playQueue[0].play_count).toBe(1);
    expect(library.allTracks[0].play_count).toBe(1);
  });

  it('credits every repeat-one loop — same track id, advancing sequence', async () => {
    const tracks = createMockTracks(2);
    await startPlayingTrack(tracks[0], tracks);
    player.repeatMode = 'repeat-one';
    library.allTracks = [...tracks];

    applyPlayerStateEvent(pollEvent({ is_playing: true, current_track_id: tracks[0].id }));
    // Two loop completions: the track id never changes, only the sequence —
    // exactly the case the old one-shot events could silently drop
    applyPlayerStateEvent(
      pollEvent({
        is_playing: true,
        current_track_id: tracks[0].id,
        gapless_transitioned: true,
        completion_seq: 1,
        last_completed_track_id: tracks[0].id,
      }),
    );
    applyPlayerStateEvent(
      pollEvent({
        is_playing: true,
        current_track_id: tracks[0].id,
        gapless_transitioned: true,
        completion_seq: 2,
        last_completed_track_id: tracks[0].id,
      }),
    );

    expect(player.playQueue[0].play_count).toBe(2);
    expect(library.allTracks[0].play_count).toBe(2);
  });

  it('credits even while a manual track change is in flight', async () => {
    const tracks = createMockTracks(3);
    await startPlayingTrack(tracks[0], tracks);
    library.allTracks = [...tracks];
    applyPlayerStateEvent(pollEvent({ is_playing: true, current_track_id: tracks[0].id }));
    mockInvoke.mockClear();

    let resolvePlay!: (value?: unknown) => void;
    mockInvoke.mockImplementation((...args: unknown[]) =>
      args[0] === 'play_track'
        ? new Promise((res) => {
            resolvePlay = res;
          })
        : Promise.resolve(undefined),
    );
    const nextInFlight = handleNext();

    // The in-flight guards drop the one-shot transition handling, but the
    // sequence comparison runs unguarded — the count can no longer be lost
    applyPlayerStateEvent(
      pollEvent({
        is_playing: true,
        current_track_id: tracks[0].id,
        gapless_transitioned: true,
        completion_seq: 1,
        last_completed_track_id: tracks[0].id,
      }),
    );
    expect(player.playQueue[0].play_count).toBe(1);
    expect(library.allTracks[0].play_count).toBe(1);

    resolvePlay();
    await nextInFlight;
    expect(player.currentTrack?.id).toBe(tracks[1].id);
  });

  it('ignores a completion for a track absent from queue and library', async () => {
    const tracks = createMockTracks(2);
    await startPlayingTrack(tracks[0], tracks);
    library.allTracks = [...tracks];

    applyPlayerStateEvent(pollEvent({ is_playing: true, current_track_id: tracks[0].id }));
    applyPlayerStateEvent(
      pollEvent({
        is_playing: true,
        current_track_id: tracks[0].id,
        completion_seq: 1,
        last_completed_track_id: 999,
      }),
    );

    expect(player.playQueue.every((t) => t.play_count === 0)).toBe(true);
    expect(library.allTracks.every((t) => t.play_count === 0)).toBe(true);
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

describe('manual track change vs backend poll events — race protection', () => {
  const player = getPlayerState();

  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    resetPlayerState();
    resetPlaylistState();
    resetCompletionTracking();
  });

  afterEach(() => {
    resetPlayerState();
    resetPlaylistState();
  });

  it('ignores a gapless event that arrives while a manual next is in flight', async () => {
    const tracks = createMockTracks(3);
    await startPlayingTrack(tracks[0], tracks);
    mockInvoke.mockClear();

    // Make play_track hang so the manual next stays in flight
    let resolvePlay!: (value?: unknown) => void;
    mockInvoke.mockImplementation((...args: unknown[]) =>
      args[0] === 'play_track'
        ? new Promise((res) => {
            resolvePlay = res;
          })
        : Promise.resolve(undefined),
    );

    const nextInFlight = handleNext(); // manual switch to track 1

    // Backend poll reports the natural gapless switch to track 1 mid-flight.
    // Without the in-flight guard the handler would run against the
    // half-updated state and re-queue the next track on top of the pending
    // load, reloading the track the user just picked.
    await handleGaplessTransition(tracks[1].id);

    expect(mockInvoke).not.toHaveBeenCalledWith('queue_next_track', expect.anything());

    resolvePlay();
    await nextInFlight;

    expect(player.currentTrack?.id).toBe(tracks[1].id);
    const playCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'play_track');
    expect(playCalls).toHaveLength(1);
  });

  it('a second manual next preempts the first instead of being dropped', async () => {
    const tracks = createMockTracks(4);
    await startPlayingTrack(tracks[0], tracks);
    mockInvoke.mockClear();

    const playResolvers: Array<(value?: unknown) => void> = [];
    mockInvoke.mockImplementation((...args: unknown[]) =>
      args[0] === 'play_track'
        ? new Promise((res) => {
            playResolvers.push(res);
          })
        : Promise.resolve(undefined),
    );

    const firstNext = handleNext(); // -> track 1, in flight
    const secondNext = handleNext(); // user double-clicks -> track 2

    // The newer load finishes first; the stale one resolves last
    playResolvers[1]?.(undefined);
    playResolvers[0]?.(undefined);
    await Promise.all([firstNext, secondNext]);

    // Latest user intent wins, and the stale change must not run its
    // post-load effects (it would re-queue on top of the newer track)
    expect(player.currentTrack?.id).toBe(tracks[2].id);
    expect(player.currentIndex).toBe(2);
    const playCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'play_track');
    expect(playCalls).toHaveLength(2);
    const queueCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'queue_next_track');
    expect(queueCalls).toHaveLength(1);
  });

  it('a user click during an in-flight auto-advance wins instead of being dropped', async () => {
    const tracks = createMockTracks(4);
    await startPlayingTrack(tracks[0], tracks);
    mockInvoke.mockClear();

    const playResolvers: Array<(value?: unknown) => void> = [];
    mockInvoke.mockImplementation((...args: unknown[]) =>
      args[0] === 'play_track'
        ? new Promise((res) => {
            playResolvers.push(res);
          })
        : Promise.resolve(undefined),
    );

    // Track 0 finishes; auto-advance to track 1 hangs on a slow load
    const advance = autoAdvance();
    // User explicitly picks track 3 while the advance is still in flight
    const click = startPlayingTrack(tracks[3], tracks);

    playResolvers[0]?.(undefined);
    playResolvers[1]?.(undefined);
    await Promise.all([advance, click]);

    // The user's pick is never silently dropped, and the superseded
    // auto-advance must not clobber it when its load resolves
    expect(player.currentTrack?.id).toBe(tracks[3].id);
    expect(player.currentIndex).toBe(3);
  });

  it('ignores track_ended describing a different track than the current one', async () => {
    const tracks = createMockTracks(3);
    await startPlayingTrack(tracks[1], tracks);
    mockInvoke.mockClear();

    // Stale event snapshotted before a manual track change: it describes
    // track 0, but the UI is already on track 1.
    applyPlayerStateEvent(
      pollEvent({ track_ended: true, current_track_id: tracks[0].id, position_secs: 200 }),
    );

    expect(mockInvoke).not.toHaveBeenCalledWith('play_track', expect.anything());
    expect(player.currentTrack?.id).toBe(tracks[1].id);
  });

  it('advances on track_ended when the event matches the current track', async () => {
    const tracks = createMockTracks(2);
    await startPlayingTrack(tracks[0], tracks);
    mockInvoke.mockClear();

    applyPlayerStateEvent(pollEvent({ track_ended: true, current_track_id: tracks[0].id }));

    await vi.waitFor(() => {
      expect(player.currentTrack?.id).toBe(tracks[1].id);
    });
  });

  it('does not advance on track_ended when nothing is playing', () => {
    applyPlayerStateEvent(pollEvent({ track_ended: true, current_track_id: 7 }));

    expect(mockInvoke).not.toHaveBeenCalledWith('play_track', expect.anything());
    expect(player.currentTrack).toBeNull();
  });

  it('reconciles a dropped gapless transition from a later steady-state poll', async () => {
    const tracks = createMockTracks(3);
    await startPlayingTrack(tracks[0], tracks);
    applyPlayerStateEvent(pollEvent({ is_playing: true, current_track_id: tracks[0].id }));
    mockInvoke.mockClear();

    // The one-shot gapless_transitioned event was dropped by an in-flight
    // guard; a later poll just shows the backend already playing track 1,
    // with the completion still visible in the level-triggered sequence.
    applyPlayerStateEvent(
      pollEvent({
        is_playing: true,
        current_track_id: tracks[1].id,
        completion_seq: 1,
        last_completed_track_id: tracks[0].id,
      }),
    );

    await vi.waitFor(() => {
      expect(player.currentTrack?.id).toBe(tracks[1].id);
    });
    // The finished track is still credited exactly once — mirrored from seq
    expect(player.playQueue[0].play_count).toBe(1);
    expect(player.currentIndex).toBe(1);
  });

  it('does not reconcile while a manual change is in flight', async () => {
    const tracks = createMockTracks(3);
    await startPlayingTrack(tracks[0], tracks);
    mockInvoke.mockClear();

    let resolvePlay!: (value?: unknown) => void;
    mockInvoke.mockImplementation((...args: unknown[]) =>
      args[0] === 'play_track'
        ? new Promise((res) => {
            resolvePlay = res;
          })
        : Promise.resolve(undefined),
    );

    const nextInFlight = handleNext(); // manual switch to track 1, in flight

    // Poll snapshotted before the manual play_track landed: backend still
    // reports track 0 playing while the UI optimistically shows track 1.
    // Reconciling here would "transition back" to the old track.
    applyPlayerStateEvent(pollEvent({ is_playing: true, current_track_id: tracks[0].id }));
    await Promise.resolve();

    resolvePlay();
    await nextInFlight;

    expect(player.currentTrack?.id).toBe(tracks[1].id);
    expect(player.currentIndex).toBe(1);
  });

  it('does not reconcile when backend and UI agree on the current track', async () => {
    const tracks = createMockTracks(2);
    await startPlayingTrack(tracks[0], tracks);
    mockInvoke.mockClear();

    applyPlayerStateEvent(pollEvent({ is_playing: true, current_track_id: tracks[0].id }));
    await Promise.resolve();

    expect(player.currentTrack?.id).toBe(tracks[0].id);
  });

  it('does not reconcile into a track missing from the queue', async () => {
    const tracks = createMockTracks(3);
    await startPlayingTrack(tracks[0], tracks);
    mockInvoke.mockClear();

    // The backend gapless-transitioned into a track the user has since
    // removed from the frontend queue. Polls keep reporting it every 250ms;
    // reconciliation is impossible there and must not fire at all.
    applyPlayerStateEvent(pollEvent({ is_playing: true, current_track_id: 999 }));
    await Promise.resolve();
    applyPlayerStateEvent(pollEvent({ is_playing: true, current_track_id: 999 }));
    await Promise.resolve();

    expect(mockInvoke).not.toHaveBeenCalledWith('queue_next_track', expect.anything());
    expect(player.currentTrack?.id).toBe(tracks[0].id);
  });

  it('does not reconcile when the backend is not playing', async () => {
    const tracks = createMockTracks(2);
    await startPlayingTrack(tracks[0], tracks);
    mockInvoke.mockClear();

    // Stale not-playing snapshot mentioning another track must not advance
    applyPlayerStateEvent(pollEvent({ is_playing: false, current_track_id: tracks[1].id }));
    await Promise.resolve();

    expect(player.currentTrack?.id).toBe(tracks[0].id);
  });

  it('applies playback state fields from the event', () => {
    applyPlayerStateEvent(
      pollEvent({ is_playing: true, position_secs: 12.5, duration_secs: 300, volume: 0.7 }),
    );

    expect(player.isPlaying).toBe(true);
    expect(player.positionSecs).toBe(12.5);
    expect(player.durationSecs).toBe(300);
    expect(player.volume).toBe(0.7);
  });

  it('keeps the known duration when the event reports 0', async () => {
    const tracks = createMockTracks(1);
    await startPlayingTrack(tracks[0], tracks);
    player.durationSecs = 240;

    applyPlayerStateEvent(pollEvent({ is_playing: true, duration_secs: 0 }));

    expect(player.durationSecs).toBe(240);
  });

  it('gapless transition lands on the queued duplicate, not the first matching id', async () => {
    const tracks = createMockTracks(3); // ids 1, 2, 3
    // The same track appears twice in the queue: ids [1, 2, 1, 3]
    const queue = [tracks[0], tracks[1], { ...tracks[0] }, tracks[2]];
    await startPlayingTrack(tracks[1], queue); // playing index 1
    mockInvoke.mockClear();

    // The backend transitioned into the queued next: the duplicate at index 2.
    // Resolving the id with findIndex alone would land on index 0 and queue
    // the wrong follow-up track.
    await handleGaplessTransition(tracks[0].id);

    expect(player.currentIndex).toBe(2);
    expect(mockInvoke).toHaveBeenCalledWith('queue_next_track', {
      path: tracks[2].file_path,
      nextId: tracks[2].id,
      durationSecs: tracks[2].duration_secs,
    });
  });
});
