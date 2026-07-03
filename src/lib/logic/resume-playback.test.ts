/**
 * Tests for per-playlist resume playback: resolving the saved position,
 * throttled position saving, and the restore flow.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockTracks, createMockPlayerState } from '$lib/test-helpers';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import {
  resolveResumeTarget,
  maybeSavePlaybackPosition,
  resetSaveThrottle,
} from '$lib/logic/resume-playback';
import {
  resumePlaylistPlayback,
  startPlayingTrack,
  applyPlayerStateEvent,
} from '$lib/logic/playback-actions';
import type { PlayerState } from '$lib/types';
import { getPlayerState } from '$lib/state/playerState.svelte';

const player = getPlayerState();

function resetPlayerState() {
  player.playQueue = [];
  player.currentIndex = -1;
  player.currentTrack = null;
  player.isPlaying = false;
  player.positionSecs = 0;
  player.durationSecs = 0;
  player.repeatMode = 'off';
  player.shuffleEnabled = false;
  player.shuffledIndices = [];
  player.queueSourcePlaylistId = null;
}

function pollEvent(overrides: Partial<PlayerState> = {}): PlayerState {
  return createMockPlayerState(overrides);
}

function savedPositions() {
  return mockInvoke.mock.calls.filter(([cmd]) => cmd === 'save_playback_position');
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(undefined);
  resetSaveThrottle();
  resetPlayerState();
});

afterEach(() => {
  resetPlayerState();
});

describe('resolveResumeTarget', () => {
  const tracks = createMockTracks(3); // durations 180, 210, 240

  it('returns null when no position was saved', () => {
    expect(resolveResumeTarget(tracks, null, null)).toBeNull();
  });

  it('returns null when the saved track is no longer in the playlist', () => {
    expect(resolveResumeTarget(tracks, 999, 42)).toBeNull();
  });

  it('resolves index and seconds for a valid saved position', () => {
    expect(resolveResumeTarget(tracks, tracks[1].id, 42.5)).toEqual({ index: 1, secs: 42.5 });
  });

  it('falls back to the track start when seconds is null', () => {
    expect(resolveResumeTarget(tracks, tracks[1].id, null)).toEqual({ index: 1, secs: 0 });
  });

  it('falls back to the track start when seconds is at or past the duration', () => {
    expect(resolveResumeTarget(tracks, tracks[1].id, 210)).toEqual({ index: 1, secs: 0 });
    expect(resolveResumeTarget(tracks, tracks[1].id, 500)).toEqual({ index: 1, secs: 0 });
  });

  it('falls back to the track start when seconds is negative', () => {
    expect(resolveResumeTarget(tracks, tracks[1].id, -3)).toEqual({ index: 1, secs: 0 });
  });
});

describe('maybeSavePlaybackPosition', () => {
  it('saves on the first call', () => {
    maybeSavePlaybackPosition(5, 1, 10, true, 1_000);

    expect(savedPositions()).toEqual([
      ['save_playback_position', { playlistId: 5, trackId: 1, secs: 10 }],
    ]);
  });

  it('throttles saves within the interval while playing', () => {
    maybeSavePlaybackPosition(5, 1, 10, true, 1_000);
    maybeSavePlaybackPosition(5, 1, 11, true, 2_000);
    maybeSavePlaybackPosition(5, 1, 13, true, 4_000);

    expect(savedPositions()).toHaveLength(1);
  });

  it('saves again once the interval has elapsed', () => {
    maybeSavePlaybackPosition(5, 1, 10, true, 1_000);
    maybeSavePlaybackPosition(5, 1, 16, true, 6_500);

    expect(savedPositions()).toHaveLength(2);
    expect(savedPositions()[1][1]).toEqual({ playlistId: 5, trackId: 1, secs: 16 });
  });

  it('saves immediately when the track changes', () => {
    maybeSavePlaybackPosition(5, 1, 10, true, 1_000);
    maybeSavePlaybackPosition(5, 2, 0, true, 1_500);

    expect(savedPositions()).toHaveLength(2);
    expect(savedPositions()[1][1]).toEqual({ playlistId: 5, trackId: 2, secs: 0 });
  });

  it('bypasses the time throttle when paused so the exact pause position is kept', () => {
    maybeSavePlaybackPosition(5, 1, 10, true, 1_000);
    maybeSavePlaybackPosition(5, 1, 13, false, 2_000);

    expect(savedPositions()).toHaveLength(2);
    expect(savedPositions()[1][1]).toEqual({ playlistId: 5, trackId: 1, secs: 13 });
  });

  it('skips redundant saves while paused at the same position', () => {
    maybeSavePlaybackPosition(5, 1, 13, false, 1_000);
    maybeSavePlaybackPosition(5, 1, 13, false, 2_000);
    maybeSavePlaybackPosition(5, 1, 13.2, false, 3_000);

    expect(savedPositions()).toHaveLength(1);
  });

  it('does not throw when the backend save fails', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('db locked'));

    expect(() => maybeSavePlaybackPosition(5, 1, 10, true, 1_000)).not.toThrow();
    await vi.waitFor(() => expect(mockInvoke).toHaveBeenCalled());
  });
});

describe('resumePlaylistPlayback', () => {
  function mockLastPosition(trackId: number | null, secs: number | null) {
    mockInvoke.mockImplementation((cmd: unknown) => {
      if (cmd === 'get_last_playback_position') return Promise.resolve([trackId, secs]);
      return Promise.resolve(undefined);
    });
  }

  it('resumes the saved track at the saved position', async () => {
    const tracks = createMockTracks(3);
    mockLastPosition(tracks[1].id, 42);

    await resumePlaylistPlayback(7, tracks);

    expect(mockInvoke).toHaveBeenCalledWith('play_track', {
      path: tracks[1].file_path,
      trackId: tracks[1].id,
      durationSecs: tracks[1].duration_secs,
    });
    expect(mockInvoke).toHaveBeenCalledWith('seek', { positionSecs: 42 });
    expect(player.currentTrack?.id).toBe(tracks[1].id);
    expect(player.positionSecs).toBe(42);
    expect(player.queueSourcePlaylistId).toBe(7);
  });

  it('plays the first track from the start when nothing was saved', async () => {
    const tracks = createMockTracks(3);
    mockLastPosition(null, null);

    await resumePlaylistPlayback(7, tracks);

    expect(mockInvoke).toHaveBeenCalledWith('play_track', {
      path: tracks[0].file_path,
      trackId: tracks[0].id,
      durationSecs: tracks[0].duration_secs,
    });
    expect(mockInvoke).not.toHaveBeenCalledWith('seek', expect.anything());
  });

  it('plays the first track when the saved track was removed from the playlist', async () => {
    const tracks = createMockTracks(3);
    mockLastPosition(999, 42);

    await resumePlaylistPlayback(7, tracks);

    expect(mockInvoke).toHaveBeenCalledWith('play_track', {
      path: tracks[0].file_path,
      trackId: tracks[0].id,
      durationSecs: tracks[0].duration_secs,
    });
    expect(mockInvoke).not.toHaveBeenCalledWith('seek', expect.anything());
  });

  it('does not seek when the saved position is the track start', async () => {
    const tracks = createMockTracks(3);
    mockLastPosition(tracks[1].id, 0);

    await resumePlaylistPlayback(7, tracks);

    expect(mockInvoke).toHaveBeenCalledWith('play_track', {
      path: tracks[1].file_path,
      trackId: tracks[1].id,
      durationSecs: tracks[1].duration_secs,
    });
    expect(mockInvoke).not.toHaveBeenCalledWith('seek', expect.anything());
  });

  it('does nothing for an empty playlist', async () => {
    mockLastPosition(1, 42);

    await resumePlaylistPlayback(7, []);

    expect(mockInvoke).not.toHaveBeenCalledWith('play_track', expect.anything());
    expect(player.queueSourcePlaylistId).toBeNull();
  });

  it('falls back to the first track when reading the saved position fails', async () => {
    const tracks = createMockTracks(3);
    mockInvoke.mockImplementation((cmd: unknown) => {
      if (cmd === 'get_last_playback_position') return Promise.reject(new Error('db error'));
      return Promise.resolve(undefined);
    });

    await resumePlaylistPlayback(7, tracks);

    expect(mockInvoke).toHaveBeenCalledWith('play_track', {
      path: tracks[0].file_path,
      trackId: tracks[0].id,
      durationSecs: tracks[0].duration_secs,
    });
    expect(player.queueSourcePlaylistId).toBe(7);
  });

  it('does not seek when a manual track change preempts the resume', async () => {
    const tracks = createMockTracks(3);
    let resolveResumedPlay: (() => void) | undefined;
    mockInvoke.mockImplementation((cmd: unknown, args?: unknown) => {
      if (cmd === 'get_last_playback_position') return Promise.resolve([tracks[1].id, 42]);
      if (cmd === 'play_track' && (args as { trackId: number }).trackId === tracks[1].id) {
        return new Promise<void>((resolve) => {
          resolveResumedPlay = resolve;
        });
      }
      return Promise.resolve(undefined);
    });

    const resume = resumePlaylistPlayback(7, tracks);
    await vi.waitFor(() => expect(resolveResumedPlay).toBeDefined());
    // User double-clicks another track while the resumed play is still loading
    const click = startPlayingTrack(tracks[2], tracks, 7);
    resolveResumedPlay!();
    await Promise.all([resume, click]);

    expect(mockInvoke).not.toHaveBeenCalledWith('seek', expect.anything());
    expect(player.currentTrack?.id).toBe(tracks[2].id);
  });
});

describe('startPlayingTrack — queue source binding', () => {
  it('binds the queue to the given playlist', async () => {
    const tracks = createMockTracks(2);

    await startPlayingTrack(tracks[0], tracks, 9);

    expect(player.queueSourcePlaylistId).toBe(9);
  });

  it('clears the queue source when playing outside a playlist', async () => {
    const tracks = createMockTracks(2);
    player.queueSourcePlaylistId = 9;

    await startPlayingTrack(tracks[0], tracks);

    expect(player.queueSourcePlaylistId).toBeNull();
  });
});

describe('applyPlayerStateEvent — position saving', () => {
  it('saves the position of the playing track when bound to a playlist', async () => {
    const tracks = createMockTracks(2);
    await startPlayingTrack(tracks[0], tracks, 9);
    mockInvoke.mockClear();
    resetSaveThrottle();

    applyPlayerStateEvent(
      pollEvent({ is_playing: true, current_track_id: tracks[0].id, position_secs: 12 }),
    );

    expect(savedPositions()).toEqual([
      ['save_playback_position', { playlistId: 9, trackId: tracks[0].id, secs: 12 }],
    ]);
  });

  it('does not save when the queue is not bound to a playlist', async () => {
    const tracks = createMockTracks(2);
    await startPlayingTrack(tracks[0], tracks);
    mockInvoke.mockClear();
    resetSaveThrottle();

    applyPlayerStateEvent(
      pollEvent({ is_playing: true, current_track_id: tracks[0].id, position_secs: 12 }),
    );

    expect(savedPositions()).toEqual([]);
  });

  it('does not save from a stale event describing another track', async () => {
    const tracks = createMockTracks(2);
    await startPlayingTrack(tracks[1], tracks, 9);
    mockInvoke.mockClear();
    resetSaveThrottle();

    applyPlayerStateEvent(
      pollEvent({ track_ended: true, current_track_id: tracks[0].id, position_secs: 200 }),
    );

    expect(savedPositions()).toEqual([]);
  });

  it('rewinds the saved position to the queue start when playback finishes', async () => {
    const tracks = createMockTracks(2);
    await startPlayingTrack(tracks[1], tracks, 9);
    mockInvoke.mockClear();
    resetSaveThrottle();

    applyPlayerStateEvent(pollEvent({ track_ended: true, current_track_id: tracks[1].id }));

    await vi.waitFor(() => {
      expect(savedPositions()).toEqual([
        ['save_playback_position', { playlistId: 9, trackId: tracks[0].id, secs: 0 }],
      ]);
    });
    expect(player.isPlaying).toBe(false);
  });

  it('keeps the rewound position across idle polls after playback finishes', async () => {
    const tracks = createMockTracks(2);
    await startPlayingTrack(tracks[1], tracks, 9);
    mockInvoke.mockClear();
    resetSaveThrottle();

    applyPlayerStateEvent(
      pollEvent({ track_ended: true, current_track_id: tracks[1].id, position_secs: 210 }),
    );
    await vi.waitFor(() => expect(savedPositions()).toHaveLength(1));

    // The backend keeps reporting the finished track on subsequent idle polls;
    // these must not overwrite the rewound position.
    applyPlayerStateEvent(
      pollEvent({ is_playing: false, current_track_id: tracks[1].id, position_secs: 210 }),
    );
    applyPlayerStateEvent(
      pollEvent({ is_playing: false, current_track_id: tracks[1].id, position_secs: 210 }),
    );

    expect(savedPositions()).toEqual([
      ['save_playback_position', { playlistId: 9, trackId: tracks[0].id, secs: 0 }],
    ]);
  });

  it('saves promptly after rebinding the same track to another playlist', async () => {
    const tracks = createMockTracks(2);
    await startPlayingTrack(tracks[0], tracks, 1);
    applyPlayerStateEvent(
      pollEvent({ is_playing: true, current_track_id: tracks[0].id, position_secs: 30 }),
    );

    // Rebind to another playlist that contains the same track
    await startPlayingTrack(tracks[0], tracks, 2);
    mockInvoke.mockClear();
    applyPlayerStateEvent(
      pollEvent({ is_playing: true, current_track_id: tracks[0].id, position_secs: 30 }),
    );

    expect(savedPositions()).toEqual([
      ['save_playback_position', { playlistId: 2, trackId: tracks[0].id, secs: 30 }],
    ]);
  });
});
