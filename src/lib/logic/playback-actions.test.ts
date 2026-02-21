/**
 * Tests for handleTrackRemoved auto-advance behavior.
 *
 * When the currently playing track is removed (right-click Remove or Trash),
 * the player should automatically advance to the next track instead of stopping.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockTrack, createMockTracks, createMockPlaylist } from '$lib/test-helpers';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { handleTrackRemoved } from '$lib/logic/playback-actions';
import { getPlayerState } from '$lib/state/playerState.svelte';
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
