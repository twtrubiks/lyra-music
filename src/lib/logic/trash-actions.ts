import type { Track } from '$lib/types';
import { getLibraryState } from '$lib/state/libraryState.svelte';
import { trashTrack } from '$lib/api/library';
import { handleTrackRemoved } from '$lib/logic/playback-actions';
import { notifyCritical } from '$lib/logic/error-handler';

export interface OptimisticTrashOptions {
  getLocalTracks?: () => Track[];
  setLocalTracks?: (tracks: Track[]) => void;
  onComplete?: () => Promise<void>;
}

export async function optimisticTrash(
  tracksToTrash: Track[],
  options?: OptimisticTrashOptions,
): Promise<void> {
  if (tracksToTrash.length === 0) return;

  const library = getLibraryState();
  const ids = new Set(tracksToTrash.map((t) => t.id));

  // 1. Snapshot for rollback
  const snapshotAllTracks = library.allTracks;
  const snapshotLocalTracks = options?.getLocalTracks?.();

  // 2. Optimistic UI update — immediate removal
  library.allTracks = library.allTracks.filter((t) => !ids.has(t.id));
  if (snapshotLocalTracks && options?.setLocalTracks) {
    options.setLocalTracks(snapshotLocalTracks.filter((t) => !ids.has(t.id)));
  }

  // 3. Playback state cleanup — must be sequential due to _removeInProgress guard
  for (const track of tracksToTrash) {
    await handleTrackRemoved(track.id);
  }

  // 4. Background backend call — parallel deletion
  const results = await Promise.allSettled(tracksToTrash.map((t) => trashTrack(t.id)));

  const successIds = new Set<number>();
  let firstError: unknown = null;

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      successIds.add(tracksToTrash[i].id);
    } else if (!firstError) {
      firstError = result.reason;
    }
  });

  // 4b. Partial/full failure → restore only failed tracks (preserve original order)
  if (firstError) {
    library.allTracks = snapshotAllTracks.filter((t) => !successIds.has(t.id));
    if (snapshotLocalTracks && options?.setLocalTracks) {
      options.setLocalTracks(snapshotLocalTracks.filter((t) => !successIds.has(t.id)));
    }
    notifyCritical('Trash tracks', firstError);
  }

  // 4a. Call onComplete if any track was successfully deleted
  if (successIds.size > 0 && options?.onComplete) {
    await options.onComplete();
  }
}
