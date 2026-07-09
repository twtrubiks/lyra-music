import type { Track } from '$lib/types';

/**
 * Replace tracks in `existing` whose id appears in `fresh`, without
 * appending unknown ones — for lists that mirror a subset of the library,
 * like the play queue: after the library-changed refetch, a disk rename
 * must refresh the queued `file_path`, but unrelated tracks must not enter
 * the queue. Returns the original array reference when nothing matched,
 * so callers can assign the result unconditionally without triggering
 * spurious re-renders. Pure and immutable.
 */
export function updateExistingTracks(existing: Track[], fresh: Track[]): Track[] {
  if (fresh.length === 0 || existing.length === 0) return existing;

  // Last occurrence wins for duplicate ids within one batch
  const byId = new Map(fresh.map((t) => [t.id, t]));

  let touched = false;
  const updated = existing.map((t) => {
    const replacement = byId.get(t.id);
    if (replacement) touched = true;
    return replacement ?? t;
  });

  return touched ? updated : existing;
}

/**
 * Sync the playing track with its refetched library row (a rename brings a
 * new file_path, an external tag edit a new title). DB-sourced tracks always
 * carry `cover_art: null` — keep the cover loaded at play time, or the
 * player bar art vanishes. Returns `current` unchanged when it is absent
 * from `fresh`.
 */
export function updateCurrentTrack(current: Track | null, fresh: Track[]): Track | null {
  if (!current) return null;
  const [synced] = updateExistingTracks([current], fresh);
  if (synced === current) return current;
  return { ...synced, cover_art: synced.cover_art ?? current.cover_art };
}
