import { pushError } from '$lib/state/errorState.svelte';
import { t, type ActionKey } from '$lib/i18n/index.svelte';
import { logToFile } from './frontend-log';
import type { FailedFile, ImportResult } from '$lib/types';

/**
 * For non-critical operations: seek, volume, queue-next, cover art.
 * Logs to the console and the log file; nothing is shown to the user.
 */
export function warnNonCritical(context: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`[lyra] ${context}: ${message}`);
  logToFile('warn', `${context}: ${message}`);
}

/**
 * For critical operations: play track, scan folder, load library,
 * create/delete playlist, load playlists.
 * Shows a user-visible notification AND logs.
 */
export function notifyCritical(action: ActionKey, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[lyra] ${action}: ${message}`);
  logToFile('error', `${action}: ${message}`);
  pushError(t('error.failed', { context: t(action), message }));
}

export function notifyImportResult(result: ImportResult): void {
  if (result.failed_files.length > 0) {
    notifyFailedImports(result.failed_files);
  } else if (result.tracks.length === 0) {
    pushError(t('import.noFiles'), 'warn');
  }
}

export function notifyFailedImports(failedFiles: FailedFile[]): void {
  if (failedFiles.length === 0) return;
  const count = failedFiles.length;
  const shown = failedFiles
    .slice(0, 3)
    .map((f) => f.file_path.split('/').pop() || f.file_path)
    .join(', ');
  const names = count > 3 ? `${shown} ${t('import.andMore', { count: count - 3 })}` : shown;
  pushError(t('import.failed', { count, names }), 'warn', 8000);
}

/**
 * The folder watcher reported an error (`watcher-error` event): changes on
 * disk may have been missed, so the library can be out of date. The backend
 * rate-limits these.
 */
export function notifyWatcherError(message: string): void {
  console.warn(`[lyra] folder watcher error: ${message}`);
  pushError(t('error.watcher', { message }), 'warn', 8000);
}
