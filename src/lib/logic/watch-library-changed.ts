import { listen } from '@tauri-apps/api/event';
import { warnNonCritical } from './error-handler';

/**
 * Subscribe to watcher-driven library changes (`library-changed`, emitted
 * after imports, removals, renames or external tag edits land in the DB).
 * Views holding a local track list use this to reload and self-heal ghost
 * rows and stale paths; App.svelte uses it for the central refetch. Returns
 * a cleanup function suitable as an `$effect` return value, safe to call
 * even before the subscription resolves.
 */
export function watchLibraryChanged(onChanged: () => void): () => void {
  let unlisten: (() => void) | undefined;
  let cancelled = false;

  listen('library-changed', () => {
    onChanged();
  })
    .then((un) => {
      if (cancelled) un();
      else unlisten = un;
    })
    .catch((err) => warnNonCritical('Listen library-changed', err));

  return () => {
    cancelled = true;
    unlisten?.();
  };
}
