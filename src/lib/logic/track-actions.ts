import type { Track } from '$lib/types';
import type { BatchTrashResult } from '$lib/api/library';
import { getLibraryState } from '$lib/state/libraryState.svelte';
import { getPlaylistState } from '$lib/state/playlistState.svelte';
import { getPlayerState } from '$lib/state/playerState.svelte';
import { trashTracks, removeTracks } from '$lib/api/library';
import { batchAddToPlaylist, batchRemoveFromPlaylist } from '$lib/api/playlist';
import { handleTracksRemovedBatch, removeUpcomingFromQueue } from '$lib/logic/playback-actions';
import { notifyCritical } from '$lib/logic/error-handler';
import type { ActionKey } from '$lib/i18n/index.svelte';

export interface OptimisticTrackOptions {
  getLocalTracks?: () => Track[];
  setLocalTracks?: (tracks: Track[]) => void;
  onComplete?: () => Promise<void>;
}

async function _optimisticLibraryAction(
  tracks: Track[],
  backendAction: (ids: number[]) => Promise<BatchTrashResult>,
  errorLabel: ActionKey,
  options?: OptimisticTrackOptions,
): Promise<void> {
  if (tracks.length === 0) return;

  const library = getLibraryState();
  const ids = new Set(tracks.map((t) => t.id));

  // 1. Optimistic UI update — immediate removal
  library.allTracks = library.allTracks.filter((t) => !ids.has(t.id));
  if (options?.getLocalTracks && options?.setLocalTracks) {
    options.setLocalTracks(options.getLocalTracks().filter((t) => !ids.has(t.id)));
  }

  // 2. Batch playback state cleanup — one pass instead of N sequential calls
  await handleTracksRemovedBatch(ids);

  // 3. Fire-and-forget backend call — UI already updated optimistically, so we
  //    intentionally do NOT await the backend response. This avoids blocking the
  //    main thread on slow file I/O (e.g. USB trash). Errors are still handled:
  //    .then() rolls back partially-failed tracks, .catch() rolls back everything.
  backendAction(tracks.map((t) => t.id))
    .then((result) => {
      const successIds = new Set(result.succeeded_ids);
      // Partial failure → additive rollback: add back only the failed tracks
      if (result.failed.length > 0) {
        const failedTracks = tracks.filter((t) => !successIds.has(t.id));
        library.allTracks = [...library.allTracks, ...failedTracks];
        if (options?.setLocalTracks && options?.getLocalTracks) {
          options.setLocalTracks([...options.getLocalTracks(), ...failedTracks]);
        }
        notifyCritical(errorLabel, new Error(result.failed[0].error));
      }
      // Call onComplete if any track was successfully deleted
      if (successIds.size > 0) {
        options?.onComplete?.();
      }
    })
    .catch((err) => {
      // Total failure — additive rollback: add back all deleted tracks
      library.allTracks = [...library.allTracks, ...tracks];
      if (options?.setLocalTracks && options?.getLocalTracks) {
        options.setLocalTracks([...options.getLocalTracks(), ...tracks]);
      }
      notifyCritical(errorLabel, err);
    });
}

export async function optimisticTrash(
  tracksToTrash: Track[],
  options?: OptimisticTrackOptions,
): Promise<void> {
  await _optimisticLibraryAction(tracksToTrash, trashTracks, 'action.trashTracks', options);
}

export async function optimisticRemove(
  tracksToRemove: Track[],
  options?: OptimisticTrackOptions,
): Promise<void> {
  await _optimisticLibraryAction(tracksToRemove, removeTracks, 'action.removeTracks', options);
}

export interface OptimisticPlaylistRemoveOptions {
  onComplete?: () => Promise<void>;
}

export async function optimisticPlaylistRemove(
  playlistId: number,
  tracksToRemove: Track[],
  options?: OptimisticPlaylistRemoveOptions,
): Promise<void> {
  if (tracksToRemove.length === 0) return;

  const playlistState = getPlaylistState();
  const removedIds = new Set(tracksToRemove.map((t) => t.id));

  // 1. Snapshot for rollback
  const snapshotPlaylists = playlistState.playlists;

  // 2. Optimistic UI update — immediate removal from playlist track_ids
  playlistState.playlists = playlistState.playlists.map((pl) =>
    pl.id === playlistId
      ? { ...pl, track_ids: pl.track_ids.filter((id) => !removedIds.has(id)) }
      : pl,
  );

  // 3. Single batch backend call (atomic SQL DELETE)
  try {
    await batchRemoveFromPlaylist(
      playlistId,
      tracksToRemove.map((t) => t.id),
    );
  } catch (err) {
    // Total failure — restore all tracks (SQL DELETE is atomic, no partial failure)
    playlistState.playlists = snapshotPlaylists;
    notifyCritical('action.removeFromPlaylist', err);
    return;
  }

  // 3a. The playing queue is a snapshot taken when playback started. When it
  //     came from this playlist, drop the removed tracks from it too —
  //     otherwise they would still play next.
  if (getPlayerState().queueSourcePlaylistId === playlistId) {
    removeUpcomingFromQueue(removedIds);
  }

  // 3b. Call onComplete on success
  if (options?.onComplete) {
    await options.onComplete();
  }
}

/**
 * Add freshly imported tracks to a playlist: used when files are dropped
 * while that playlist is shown. The import upserts on file path, so `tracks`
 * also holds files that were already in the library; the backend skips ids
 * the playlist already has.
 */
export async function addImportedTracksToPlaylist(
  playlistId: number,
  tracks: readonly Track[],
): Promise<void> {
  const ids = [...new Set(tracks.map((t) => t.id))];
  if (ids.length === 0) return;

  try {
    await batchAddToPlaylist(playlistId, ids);
  } catch (err) {
    notifyCritical('action.addToPlaylist', err);
    return;
  }

  const playlistState = getPlaylistState();
  playlistState.playlists = playlistState.playlists.map((pl) => {
    if (pl.id !== playlistId) return pl;
    const existing = new Set(pl.track_ids);
    return { ...pl, track_ids: [...pl.track_ids, ...ids.filter((id) => !existing.has(id))] };
  });
  playlistState.tracksVersion += 1;
}
