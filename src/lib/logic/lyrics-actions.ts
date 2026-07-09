/**
 * Lyrics load/search actions writing to the shared lyrics state.
 * Loaded eagerly on track change (App.svelte) so the PlayerBar can show
 * availability before the lyrics panel is ever opened.
 */
import * as libraryApi from '$lib/api/library';
import { getLyricsState } from '$lib/state/lyricsState.svelte';
import { parseLyrics } from './lrc';
import { warnNonCritical } from './error-handler';

const lyricsState = getLyricsState();

/**
 * Fetch lyrics for the given track (null clears). A late response for a
 * previous track must not overwrite the current one — guard on the id
 * captured at request time.
 */
export async function loadLyricsForTrack(trackId: number | null): Promise<void> {
  lyricsState.trackId = trackId;
  lyricsState.lyrics = null;
  lyricsState.onlineStatus = 'idle';
  if (trackId === null) {
    lyricsState.loading = false;
    return;
  }
  lyricsState.loading = true;
  try {
    const raw = await libraryApi.getTrackLyrics(trackId);
    if (lyricsState.trackId !== trackId) return;
    lyricsState.lyrics = raw === null ? null : parseLyrics(raw);
    lyricsState.loading = false;
  } catch (err) {
    if (lyricsState.trackId !== trackId) return;
    lyricsState.loading = false;
    warnNonCritical('Load lyrics', err);
  }
}

/**
 * Manual online lookup (LRCLIB) — same late-response guard as the local
 * fetch above. A hit that parses to nothing counts as not found; so does a
 * plain result when lyrics are already shown, because the button then
 * promises an upgrade to synced — never swap plain for plain.
 */
export async function searchLyricsOnline(): Promise<void> {
  const id = lyricsState.trackId;
  if (id === null || lyricsState.onlineStatus === 'searching') return;
  lyricsState.onlineStatus = 'searching';
  try {
    const raw = await libraryApi.fetchLyricsOnline(id);
    if (lyricsState.trackId !== id) return;
    const parsed = raw === null ? null : parseLyrics(raw);
    if (parsed === null || (lyricsState.lyrics !== null && !parsed.synced)) {
      lyricsState.onlineStatus = 'notfound';
      return;
    }
    lyricsState.lyrics = parsed;
    lyricsState.onlineStatus = 'idle';
  } catch (err) {
    if (lyricsState.trackId !== id) return;
    lyricsState.onlineStatus = 'error';
    warnNonCritical('Fetch lyrics online', err);
  }
}
