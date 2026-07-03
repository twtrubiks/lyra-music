import * as playlistApi from '$lib/api/playlist';
import { warnNonCritical } from '$lib/logic/error-handler';
import type { Track } from '$lib/types';

/** Minimum time between position saves while playing. */
const SAVE_INTERVAL_MS = 5000;

let _lastSaveAt = 0;
let _lastSavedTrackId: number | null = null;
let _lastSavedSecs = -1;

/** Reset the save throttle — called when the queue is rebound to a new source, and by tests. */
export function resetSaveThrottle(): void {
  _lastSaveAt = 0;
  _lastSavedTrackId = null;
  _lastSavedSecs = -1;
}

/**
 * Resolve a saved playlist position against the playlist's current tracks.
 * Returns null when nothing was saved or the saved track has since been
 * removed from the playlist; a saved position outside the track's duration
 * falls back to the track start.
 */
export function resolveResumeTarget(
  tracks: Track[],
  lastTrackId: number | null,
  lastPositionSecs: number | null,
): { index: number; secs: number } | null {
  if (lastTrackId == null) return null;
  const index = tracks.findIndex((t) => t.id === lastTrackId);
  if (index < 0) return null;
  const duration = tracks[index].duration_secs;
  const secs =
    lastPositionSecs != null && lastPositionSecs > 0 && lastPositionSecs < duration
      ? lastPositionSecs
      : 0;
  return { index, secs };
}

/**
 * Persist the playback position of a playlist-bound queue, throttled to
 * SAVE_INTERVAL_MS while playing. A track change or a pause always saves
 * immediately so the exact position survives; identical repeated positions
 * (paused polls) are skipped.
 */
export function maybeSavePlaybackPosition(
  playlistId: number,
  trackId: number,
  secs: number,
  isPlaying: boolean,
  now: number = Date.now(),
): void {
  const floored = Math.floor(secs);
  const trackChanged = trackId !== _lastSavedTrackId;
  if (!trackChanged && floored === _lastSavedSecs) return;
  if (!trackChanged && isPlaying && now - _lastSaveAt < SAVE_INTERVAL_MS) return;
  _lastSaveAt = now;
  _lastSavedTrackId = trackId;
  _lastSavedSecs = floored;
  playlistApi
    .savePlaybackPosition(playlistId, trackId, secs)
    .catch((err) => warnNonCritical('Save playback position', err));
}
