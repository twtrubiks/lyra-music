import { pushError } from '$lib/state/errorState.svelte';

/**
 * For non-critical operations: seek, volume, queue-next, cover art.
 * Logs to console only.
 */
export function warnNonCritical(context: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`[lyra] ${context}: ${message}`);
}

/**
 * For critical operations: play track, scan folder, load library,
 * create/delete playlist, load playlists.
 * Shows a user-visible notification AND logs.
 */
export function notifyCritical(context: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[lyra] ${context}: ${message}`);
  pushError(`${context} failed`);
}
