import type { Track } from '$lib/types';
import type { BatchTrashResult } from '$lib/api/library';
import { getLibraryState } from '$lib/state/libraryState.svelte';
import { getPlaylistState } from '$lib/state/playlistState.svelte';
import { trashTracks, removeTracks } from '$lib/api/library';
import { batchRemoveFromPlaylist } from '$lib/api/playlist';
import { handleTracksRemovedBatch } from '$lib/logic/playback-actions';
import { notifyCritical } from '$lib/logic/error-handler';

export interface OptimisticTrackOptions {
  getLocalTracks?: () => Track[];
  setLocalTracks?: (tracks: Track[]) => void;
  onComplete?: () => Promise<void>;
}

async function _optimisticLibraryAction(
  tracks: Track[],
  backendAction: (ids: number[]) => Promise<BatchTrashResult>,
  errorLabel: string,
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
  await _optimisticLibraryAction(tracksToTrash, trashTracks, 'Trash tracks', options);
}

export async function optimisticRemove(
  tracksToRemove: Track[],
  options?: OptimisticTrackOptions,
): Promise<void> {
  await _optimisticLibraryAction(tracksToRemove, removeTracks, 'Remove tracks', options);
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
    notifyCritical('Remove from playlist', err);
    return;
  }

  // 3a. Call onComplete on success
  if (options?.onComplete) {
    await options.onComplete();
  }
}
