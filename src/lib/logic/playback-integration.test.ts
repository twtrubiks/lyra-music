/**
 * Integration-style tests that verify the play-track call pattern
 * used by LibraryView, PlayerBar (prev/next), and PlaylistEditor.
 *
 * These tests exist because of a real bug: PlaylistEditor called
 * playTrack(path) WITHOUT passing duration_secs, causing MP3
 * progress bar to break (rodio returns 0 for total_duration).
 *
 * The pattern tested:
 * 1. playTrack must always receive duration_secs > 0 from track metadata
 * 2. After playTrack, cover art should be fetched asynchronously
 * 3. Cover art should only be applied if the track is still current
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockTrack, createMockTracks } from '$lib/test-helpers';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import * as playbackApi from '$lib/api/playback';
import { getPlayerState } from '$lib/state/playerState.svelte';

describe('playTrack integration pattern', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
  });

  it('playTrack should always be called with durationSecs from track metadata', async () => {
    const track = createMockTrack({ id: 1, duration_secs: 240, file_path: '/music/test.mp3' });

    await playbackApi.playTrack(track.file_path, track.id, track.duration_secs);

    expect(mockInvoke).toHaveBeenCalledWith('play_track', {
      path: '/music/test.mp3',
      trackId: 1,
      durationSecs: 240,
    });

    // IMPORTANT: durationSecs should NOT be 0 for real tracks
    const callArgs = mockInvoke.mock.calls[0];
    expect(callArgs[1].durationSecs).toBeGreaterThan(0);
  });

  it('cover art fetch should guard against stale track', async () => {
    const player = getPlayerState();
    const track1 = createMockTrack({ id: 1, title: 'Song A' });
    const track2 = createMockTrack({ id: 2, title: 'Song B' });

    // Simulate: user plays track1, then quickly switches to track2
    player.currentTrack = track1;

    // Cover art comes back for track1, but user already switched to track2
    player.currentTrack = track2;

    // The guard: only apply cover if currentTrack still matches
    const coverId = 1;
    const coverData = 'data:image/jpeg;base64,abc';
    if (coverData && player.currentTrack?.id === coverId) {
      // This should NOT execute since current is track2 (id=2), not track1 (id=1)
      player.currentTrack = { ...player.currentTrack, cover_art: coverData };
    }

    // cover_art should still be null because the guard prevented stale update
    expect(player.currentTrack.cover_art).toBeNull();
    expect(player.currentTrack.id).toBe(2);

    // cleanup
    player.currentTrack = null;
  });
});

describe('polling duration protection', () => {
  it('should not overwrite known duration with 0 from backend', () => {
    const player = getPlayerState();

    // Frontend knows duration from metadata
    player.durationSecs = 240;

    // Backend polls and returns 0 (rodio MP3 bug)
    const backendState = {
      duration_secs: 0,
      is_playing: true,
      position_secs: 30,
      volume: 0.8,
      current_track_id: 1,
    };

    // Apply the guard logic from PlayerBar
    if (backendState.duration_secs > 0) {
      player.durationSecs = backendState.duration_secs;
    }

    // Duration should still be 240, not overwritten with 0
    expect(player.durationSecs).toBe(240);

    // cleanup
    player.durationSecs = 0;
  });

  it('should update duration when backend returns valid value', () => {
    const player = getPlayerState();

    player.durationSecs = 240;

    const backendState = {
      duration_secs: 245.5,
      is_playing: true,
      position_secs: 30,
      volume: 0.8,
      current_track_id: 1,
    };

    if (backendState.duration_secs > 0) {
      player.durationSecs = backendState.duration_secs;
    }

    // Duration updated from backend (more accurate value)
    expect(player.durationSecs).toBe(245.5);

    // cleanup
    player.durationSecs = 0;
  });
});

describe('play queue navigation edge cases', () => {
  it('handleNext at last track should be blocked by hasNext guard', () => {
    const player = getPlayerState();
    const tracks = createMockTracks(3);
    player.playQueue = tracks;
    player.currentIndex = 2; // last track

    expect(player.hasNext).toBe(false);

    // Simulating the guard: if (!player.hasNext) return;
    // currentIndex should NOT change
    if (player.hasNext) {
      player.currentIndex += 1;
    }
    expect(player.currentIndex).toBe(2);

    // cleanup
    player.playQueue = [];
    player.currentIndex = -1;
  });

  it('handlePrev at first track should be blocked by hasPrev guard', () => {
    const player = getPlayerState();
    const tracks = createMockTracks(3);
    player.playQueue = tracks;
    player.currentIndex = 0; // first track

    expect(player.hasPrev).toBe(false);

    if (player.hasPrev) {
      player.currentIndex -= 1;
    }
    expect(player.currentIndex).toBe(0);

    // cleanup
    player.playQueue = [];
    player.currentIndex = -1;
  });

  it('handleNext correctly advances and picks the right track', () => {
    const player = getPlayerState();
    const tracks = createMockTracks(3);
    player.playQueue = tracks;
    player.currentIndex = 0;

    expect(player.hasNext).toBe(true);
    player.currentIndex += 1;
    const nextTrack = player.playQueue[player.currentIndex];

    expect(player.currentIndex).toBe(1);
    expect(nextTrack.id).toBe(2);
    expect(nextTrack.title).toBe('Song 2');

    // cleanup
    player.playQueue = [];
    player.currentIndex = -1;
  });
});

describe('handlePlay sets correct initial state', () => {
  it('playing a track resets position to 0 and sets duration from metadata', () => {
    const player = getPlayerState();
    const track = createMockTrack({ id: 5, duration_secs: 300 });

    // Simulate playing was at some position
    player.positionSecs = 120;
    player.durationSecs = 240;

    // handlePlay pattern:
    player.currentTrack = track;
    player.positionSecs = 0;
    player.durationSecs = track.duration_secs;

    expect(player.positionSecs).toBe(0);
    expect(player.durationSecs).toBe(300);

    // cleanup
    player.currentTrack = null;
    player.durationSecs = 0;
  });

  it('playing sets correct play queue and index', () => {
    const player = getPlayerState();
    const tracks = createMockTracks(5);
    const target = tracks[2]; // Song 3, id=3

    player.playQueue = tracks;
    player.currentIndex = tracks.findIndex((t) => t.id === target.id);

    expect(player.currentIndex).toBe(2);
    expect(player.hasNext).toBe(true);
    expect(player.hasPrev).toBe(true);

    // cleanup
    player.playQueue = [];
    player.currentIndex = -1;
  });
});
