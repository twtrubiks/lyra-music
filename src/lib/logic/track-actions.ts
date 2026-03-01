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

  // 1. Snapshot for rollback
  const snapshotAllTracks = library.allTracks;
  const snapshotLocalTracks = options?.getLocalTracks?.();

  // 2. Optimistic UI update — immediate removal
  library.allTracks = library.allTracks.filter((t) => !ids.has(t.id));
  if (snapshotLocalTracks && options?.setLocalTracks) {
    options.setLocalTracks(snapshotLocalTracks.filter((t) => !ids.has(t.id)));
  }

  // 3. Batch playback state cleanup — one pass instead of N sequential calls
  await handleTracksRemovedBatch(ids);

  // 4. Single batch backend call instead of N individual calls
  let result: BatchTrashResult;
  try {
    result = await backendAction(tracks.map((t) => t.id));
  } catch (err) {
    // Total failure — restore all tracks
    library.allTracks = snapshotAllTracks;
    if (snapshotLocalTracks && options?.setLocalTracks) {
      options.setLocalTracks(snapshotLocalTracks);
    }
    notifyCritical(errorLabel, err);
    return;
  }

  const successIds = new Set(result.succeeded_ids);

  // 4a. Partial failure → restore only failed tracks (preserve original order)
  if (result.failed.length > 0) {
    library.allTracks = snapshotAllTracks.filter((t) => !successIds.has(t.id));
    if (snapshotLocalTracks && options?.setLocalTracks) {
      options.setLocalTracks(snapshotLocalTracks.filter((t) => !successIds.has(t.id)));
    }
    notifyCritical(errorLabel, new Error(result.failed[0].error));
  }

  // 4b. Call onComplete if any track was successfully deleted
  if (successIds.size > 0 && options?.onComplete) {
    await options.onComplete();
  }
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
