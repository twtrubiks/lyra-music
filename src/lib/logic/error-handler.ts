import { pushError } from '$lib/state/errorState.svelte';
import { t, type ActionKey } from '$lib/i18n/index.svelte';
import type { FailedFile, ImportResult } from '$lib/types';

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
export function notifyCritical(action: ActionKey, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[lyra] ${action}: ${message}`);
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
