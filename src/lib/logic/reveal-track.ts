import type { Playlist } from '$lib/types';
import { getPlayerState } from '$lib/state/playerState.svelte';
import { getLibraryState } from '$lib/state/libraryState.svelte';
import { getPlaylistState, type ActiveView } from '$lib/state/playlistState.svelte';
import { getRevealState, isListedInView, type RevealRequest } from '$lib/state/revealState.svelte';

/**
 * How long a request waits for a list to show the track (a playlist view
 * loads its tracks asynchronously). Past this it is ignored, so a request
 * that could not be served never fires on some later, unrelated navigation.
 */
export const REVEAL_TIMEOUT_MS = 3000;

export function isRevealFresh(request: RevealRequest, now: number): boolean {
  return now - request.at <= REVEAL_TIMEOUT_MS;
}

/**
 * Which view should show the track: the current one when it can, else the
 * playlist the queue came from, else the library. Null when nothing can.
 */
export function resolveRevealView(input: {
  activeView: ActiveView;
  trackId: number;
  /** The list on screen has the track right now. */
  listedInView: boolean;
  inLibrary: boolean;
  sourcePlaylistId: number | null;
  playlists: readonly Pick<Playlist, 'id' | 'track_ids'>[];
}): ActiveView | null {
  const { activeView, trackId, listedInView, inLibrary, sourcePlaylistId, playlists } = input;
  const playlistHasTrack = (id: number) =>
    playlists.some((pl) => pl.id === id && pl.track_ids.includes(trackId));

  if (listedInView) return activeView;
  // A search may be hiding it; these views clear their search to show it.
  if (activeView.kind === 'library' && inLibrary) return activeView;
  if (activeView.kind === 'playlist' && playlistHasTrack(activeView.playlistId)) return activeView;

  if (sourcePlaylistId !== null && playlistHasTrack(sourcePlaylistId)) {
    return { kind: 'playlist', playlistId: sourcePlaylistId };
  }
  return inLibrary ? { kind: 'library' } : null;
}

/** Show the playing track in a track list, switching view when needed. */
export function revealPlayingTrack(): void {
  const player = getPlayerState();
  const track = player.currentTrack;
  // Mini mode has no track list.
  if (!track || player.miniMode) return;

  const playlistState = getPlaylistState();
  const activeView = playlistState.activeView;
  const target = resolveRevealView({
    activeView,
    trackId: track.id,
    listedInView: isListedInView(track.id),
    inLibrary: getLibraryState().allTracks.some((t) => t.id === track.id),
    sourcePlaylistId: player.queueSourcePlaylistId,
    playlists: playlistState.playlists,
  });
  if (!target) return;

  if (target !== activeView) playlistState.activeView = target;
  getRevealState().request = { trackId: track.id, at: Date.now() };
}
