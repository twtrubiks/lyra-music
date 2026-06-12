import { pushError } from '$lib/state/errorState.svelte';
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
export function notifyCritical(context: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[lyra] ${context}: ${message}`);
  pushError(`${context} failed: ${message}`);
}

export function notifyImportResult(result: ImportResult): void {
  if (result.failed_files.length > 0) {
    notifyFailedImports(result.failed_files);
  } else if (result.tracks.length === 0) {
    pushError('未找到任何音樂檔案', 'warn');
  }
}

export function notifyFailedImports(failedFiles: FailedFile[]): void {
  if (failedFiles.length === 0) return;
  const count = failedFiles.length;
  const names = failedFiles
    .slice(0, 3)
    .map((f) => f.file_path.split('/').pop() || f.file_path)
    .join(', ');
  const suffix = count > 3 ? ` ...等 ${count - 3} 個檔案` : '';
  pushError(`${count} 個檔案無法匯入: ${names}${suffix}`, 'warn', 8000);
}
