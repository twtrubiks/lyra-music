/**
 * Format seconds into "m:ss" display string.
 * Used by TrackRow and ProgressBar.
 */
export function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Filter tracks by search query (case-insensitive match on title, artist, album).
 * Used by LibraryView.
 */
export function filterTracks<T extends { title: string; artist: string; album: string }>(
  tracks: T[],
  query: string,
): T[] {
  const trimmed = query.trim();
  if (!trimmed) return tracks;
  const lower = trimmed.toLowerCase();
  return tracks.filter(
    (t) =>
      t.title.toLowerCase().includes(lower) ||
      t.artist.toLowerCase().includes(lower) ||
      t.album.toLowerCase().includes(lower),
  );
}

/**
 * Determine whether a backend duration_secs value should overwrite the current one.
 * Rodio returns 0 for MP3 total_duration — we should NOT overwrite a known duration with 0.
 */
export function shouldUpdateDuration(backendDuration: number): boolean {
  return backendDuration > 0;
}

/**
 * Parse a track ID from drag-and-drop dataTransfer string.
 * Returns null if the string is invalid.
 */
export function parseTrackIdFromDrop(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (isNaN(n)) return null;
  return n;
}

/**
 * Calculate the play queue index for a given track in a list.
 * Returns -1 if not found.
 */
export function findTrackIndex(tracks: { id: number }[], trackId: number): number {
  return tracks.findIndex((t) => t.id === trackId);
}

/**
 * Format total seconds into a human-readable duration string.
 * Examples: "0m", "35m", "1h 20m", "100h 0m"
 */
export function formatTotalDuration(totalSecs: number): string {
  const totalMinutes = Math.floor(totalSecs / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/**
 * Format sample rate in Hz into a human-readable string.
 * Examples: "44.1 kHz", "48 kHz", "800 Hz"
 */
export function formatSampleRate(hz: number): string {
  if (hz < 1000) return `${hz} Hz`;
  const khz = hz / 1000;
  const rounded = Math.round(khz * 10) / 10;
  return rounded % 1 === 0 ? `${rounded} kHz` : `${rounded} kHz`;
}

/**
 * Format bytes into a human-readable file size string.
 * Examples: "0 B", "512 KB", "1.25 GB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
  }
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(2)} GB`;
}

/**
 * Format a track count with correct pluralization, e.g. "1 track", "5 tracks".
 */
export function formatTrackCount(count: number): string {
  return `${count} ${count === 1 ? 'track' : 'tracks'}`;
}
