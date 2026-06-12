import type { Track, Playlist, PlayerState } from '$lib/types';

export function createMockTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 1,
    file_path: '/music/test.mp3',
    title: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    album_artist: null,
    duration_secs: 240,
    cover_art: null,
    cover_art_path: null,
    file_size_bytes: 0,
    play_count: 0,
    last_played_at: null,
    ...overrides,
  };
}

export function createMockPlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return {
    id: 1,
    name: 'My Playlist',
    track_ids: [],
    last_position_track_id: null,
    last_position_secs: null,
    sort_order: 0,
    ...overrides,
  };
}

export function createMockPlayerState(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    is_playing: false,
    current_track_id: null,
    position_secs: 0,
    duration_secs: 0,
    volume: 0.8,
    track_ended: false,
    gapless_queued: false,
    gapless_transitioned: false,
    ...overrides,
  };
}

export function createMockTracks(count: number): Track[] {
  return Array.from({ length: count }, (_, i) =>
    createMockTrack({
      id: i + 1,
      file_path: `/music/track_${i + 1}.mp3`,
      title: `Song ${i + 1}`,
      artist: `Artist ${(i % 3) + 1}`,
      album: `Album ${(i % 2) + 1}`,
      duration_secs: 180 + i * 30,
    }),
  );
}
