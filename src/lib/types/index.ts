export interface Track {
  id: number;
  file_path: string;
  title: string;
  artist: string;
  album: string;
  album_artist: string | null;
  duration_secs: number;
  cover_art: string | null;
  cover_art_path: string | null;
  file_size_bytes: number;
  play_count: number;
  last_played_at: string | null;
}

export interface FailedFile {
  file_path: string;
  error: string;
}

export interface ImportResult {
  tracks: Track[];
  failed_files: FailedFile[];
}

export interface Playlist {
  id: number;
  name: string;
  track_ids: number[];
  last_position_track_id: number | null;
  last_position_secs: number | null;
  sort_order: number;
}

export interface TrackDetails {
  id: number;
  file_path: string;
  title: string;
  artist: string;
  album: string;
  duration_secs: number;
  file_size_bytes: number;
  bitrate_kbps: number | null;
  sample_rate_hz: number | null;
  channels: number | null;
  format: string;
  bits_per_sample: number | null;
}

export type RepeatMode = 'off' | 'repeat-all' | 'repeat-one';

export interface PlayerState {
  is_playing: boolean;
  current_track_id: number | null;
  position_secs: number;
  duration_secs: number;
  volume: number;
  track_ended: boolean;
  gapless_queued: boolean;
  gapless_transitioned: boolean;
}

export interface ArtistSummary {
  name: string;
  track_count: number;
}

export interface AlbumSummary {
  name: string;
  artist: string;
  track_count: number;
  cover_art_path: string | null;
}

export type SortColumn = 'title' | 'artist' | 'album' | 'duration_secs' | 'play_count';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  column: SortColumn;
  direction: SortDirection;
}
