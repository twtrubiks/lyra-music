import type { Track } from '$lib/types';
import { getLibraryState } from '$lib/state/libraryState.svelte';
import { getPlaylistState } from '$lib/state/playlistState.svelte';
import { removeTrack, trashTrack } from '$lib/api/library';
import { removeFromPlaylist } from '$lib/api/playlist';
import { handleTrackRemoved } from '$lib/logic/playback-actions';
import { notifyCritical } from '$lib/logic/error-handler';

export interface OptimisticTrackOptions {
  getLocalTracks?: () => Track[];
  setLocalTracks?: (tracks: Track[]) => void;
  onComplete?: () => Promise<void>;
}

async function _optimisticLibraryAction(
  tracks: Track[],
  backendAction: (id: number) => Promise<void>,
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

  // 3. Playback state cleanup — must be sequential due to _removeInProgress guard
  for (const track of tracks) {
    await handleTrackRemoved(track.id);
  }

  // 4. Background backend call — parallel deletion
  const results = await Promise.allSettled(tracks.map((t) => backendAction(t.id)));

  const successIds = new Set<number>();
  let firstError: unknown = null;

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      successIds.add(tracks[i].id);
    } else if (!firstError) {
      firstError = result.reason;
    }
  });

  // 4a. Partial/full failure → restore only failed tracks (preserve original order)
  if (firstError) {
    library.allTracks = snapshotAllTracks.filter((t) => !successIds.has(t.id));
    if (snapshotLocalTracks && options?.setLocalTracks) {
      options.setLocalTracks(snapshotLocalTracks.filter((t) => !successIds.has(t.id)));
    }
    notifyCritical(errorLabel, firstError);
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
  await _optimisticLibraryAction(tracksToTrash, trashTrack, 'Trash tracks', options);
}

export async function optimisticRemove(
  tracksToRemove: Track[],
  options?: OptimisticTrackOptions,
): Promise<void> {
  await _optimisticLibraryAction(tracksToRemove, removeTrack, 'Remove tracks', options);
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

  // 3. Background backend call — parallel deletion
  const results = await Promise.allSettled(
    tracksToRemove.map((t) => removeFromPlaylist(playlistId, t.id)),
  );

  const successIds = new Set<number>();
  let firstError: unknown = null;

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      successIds.add(tracksToRemove[i].id);
    } else if (!firstError) {
      firstError = result.reason;
    }
  });

  // 3a. Partial/full failure → restore only failed tracks
  if (firstError) {
    const originalPlaylist = snapshotPlaylists.find((pl) => pl.id === playlistId);
    if (originalPlaylist) {
      const restoredTrackIds = originalPlaylist.track_ids.filter((id) => !successIds.has(id));
      playlistState.playlists = playlistState.playlists.map((pl) =>
        pl.id === playlistId ? { ...pl, track_ids: restoredTrackIds } : pl,
      );
    }
    notifyCritical('Remove from playlist', firstError);
  }

  // 3b. Call onComplete if any track was successfully removed
  if (successIds.size > 0 && options?.onComplete) {
    await options.onComplete();
  }
}
